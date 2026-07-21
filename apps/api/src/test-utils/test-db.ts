import { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Task 1.1.2 (Sub-Fase 1A, Epic 1) — koneksi test terisolasi.
// Prasyarat keras dari Phase1/06-test-strategy.md: test TIDAK PERNAH menyentuh
// schema `public` (berisi seed data dev asli: 5 proyek Bandung, 12 user, dst).
// Pendekatan: schema Postgres terpisah ("test") di project Supabase dev yang
// sama, via koneksi langsung (DIRECT_URL, session-mode pooler) — bukan lewat
// REST/@supabase/supabase-js, yang secara default hanya expose schema public.

const TEST_SCHEMA = 'test'

function getDirectUrl(): string {
  const url = process.env.DIRECT_URL
  if (!url) {
    throw new Error(
      'DIRECT_URL tidak ditemukan di environment. Test database butuh koneksi ' +
        'Postgres langsung (session-mode pooler) — isi DIRECT_URL di apps/api/.env.'
    )
  }
  return url
}

/**
 * Membuka koneksi test baru, terkunci ke schema `test` via search_path.
 * MUST NOT dipakai untuk query ke schema public — search_path membatasi ini
 * secara default kecuali skema di-qualify eksplisit (mis. `public.table`).
 */
export async function createTestClient(): Promise<Client> {
  const client = new Client({ connectionString: getDirectUrl() })
  await client.connect()
  // "extensions" ditambahkan sebagai fallback — Supabase menginstall
  // uuid-ossp/pgcrypto di schema `extensions` (bukan `public`), dikonfirmasi
  // via pg_extension.extnamespace saat Task 1.3.1. Ditempatkan SETELAH
  // TEST_SCHEMA sehingga assertTestIsolation() di bawah tetap valid (ia
  // hanya mengecek TEST_SCHEMA ada di search_path, bukan search_path harus
  // persis satu schema).
  await client.query(`SET search_path TO ${TEST_SCHEMA}, extensions`)
  return client
}

/**
 * Verifikasi keras: memastikan koneksi ini menunjuk ke instance yang benar
 * DAN search_path sudah terkunci ke schema test, bukan public — dipanggil di
 * awal setiap test suite sebagai pagar pengaman, bukan diasumsikan.
 */
export async function assertTestIsolation(client: Client): Promise<void> {
  const { rows } = await client.query('SHOW search_path')
  const searchPath = rows[0]?.search_path ?? ''
  if (!searchPath.includes(TEST_SCHEMA)) {
    throw new Error(
      `Isolasi test GAGAL diverifikasi — search_path saat ini: "${searchPath}", ` +
        `seharusnya mengandung "${TEST_SCHEMA}". Test dihentikan untuk mencegah ` +
        'kemungkinan menyentuh data di schema public.'
    )
  }
}

/**
 * Membuat schema `test` jika belum ada. Idempotent — aman dipanggil berulang
 * (mis. sebelum setiap test run), tidak menghapus/mengubah schema public.
 */
export async function ensureTestSchema(): Promise<void> {
  const client = new Client({ connectionString: getDirectUrl() })
  await client.connect()
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  } finally {
    await client.end()
  }
}

/**
 * DROP + CREATE ulang schema `test` sepenuhnya — dipakai suite yang
 * menjalankan migration (runMigrations di bawah) untuk memastikan setiap
 * test run mulai dari kondisi bersih, TIDAK bergantung pada keberhasilan
 * run sebelumnya. Ditemukan perlu saat Task 1.3.1: migration yang gagal di
 * tengah jalan (mis. error di file ke-2) meninggalkan sisa objek (enum type,
 * dll) dari file yang sudah sukses sebelumnya, membuat run berikutnya gagal
 * dengan "already exists" — bukan idempotent tanpa reset eksplisit ini.
 * MUST NOT pernah dipanggil dengan schema selain "test" — hardcoded, bukan
 * parameter, untuk mencegah kesalahan pemanggilan yang fatal.
 */
export async function resetTestSchema(): Promise<void> {
  const client = new Client({ connectionString: getDirectUrl() })
  await client.connect()
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await client.query(`CREATE SCHEMA ${TEST_SCHEMA}`)
  } finally {
    await client.end()
  }
}

/**
 * Menutup koneksi test dengan aman.
 */
export async function closeTestClient(client: Client): Promise<void> {
  await client.end()
}

// Path ke db/migrations/, relatif dari apps/api/src/test-utils/
const MIGRATIONS_DIR = join(import.meta.dirname, '../../../../db/migrations')

/**
 * Menjalankan FILE MIGRATION ASLI (verbatim, tidak dimodifikasi) terhadap
 * schema `test` — dijamin skema identik produksi karena literally file yang
 * sama, bukan tulis ulang manual (menghindari risiko drift, ditemukan saat
 * Task 1.3.1: menyalin skema manual untuk tabel berrelasi banyak seperti
 * kasbons+projects+work_scopes terlalu berisiko salah).
 *
 * HANYA menjalankan subset migration yang membuat TABEL/TRIGGER (bukan RLS —
 * migration 049+ pakai auth.uid() yang hanya ada di schema `auth` Supabase,
 * dan policy-nya bisa mengunci akses koneksi test itu sendiri; ini juga
 * konsisten dengan production: API selalu pakai service_role, bypass RLS,
 * jadi RLS tidak relevan untuk integration test level aplikasi ini).
 *
 * Aman dijalankan terhadap enum/type meski nama sama dengan yang ada di
 * schema public — CREATE TYPE di bawah search_path=test membuat type baru
 * dinamespace test (mis. test.kasbon_status), bukan konflik dengan
 * public.kasbon_status (diverifikasi langsung, bukan asumsi).
 */
export async function runMigrations(client: Client, migrationFiles: string[]): Promise<void> {
  for (const file of migrationFiles) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
    await client.query(sql)
  }
}
