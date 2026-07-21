import { Client } from 'pg'

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
  await client.query(`SET search_path TO ${TEST_SCHEMA}`)
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
 * Menutup koneksi test dengan aman.
 */
export async function closeTestClient(client: Client): Promise<void> {
  await client.end()
}
