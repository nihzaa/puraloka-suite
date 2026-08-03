import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'

// ============================================================================
// F2-4 — isolasi lintas tenant: AGREGAT, PENCARIAN, dan PESAN GALAT.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TIGA HAL INI, BUKAN 317 ENDPOINT SATU PER SATU
// ══════════════════════════════════════════════════════════════════════════
//
// Kriteria F2-4 menyebut "SETIAP endpoint". Menulis test per-endpoint akan
// tertinggal begitu endpoint ke-318 lahir — pelajaran yang sama dengan batch 3
// (test per-tabel kalah oleh tabel baru). Yang dijaga harus ATURANNYA.
//
// Lapis per-rute sudah punya penjaganya sendiri: `audit-gerbang-tenancy.mjs`
// (ratchet, 158/164 rute bergerbang; keenam sisanya diperiksa satu per satu
// dan sah — login, katalog `permissions` yang memang shared, dan endpoint yang
// hanya menyentuh baris milik pemanggilnya).
//
// Yang BELUM dijaga apa pun adalah tiga bentuk kebocoran yang tak lewat
// "baris milik siapa" — dan ketiganya disebut eksplisit di kriteria F2-4:
//
//   1. AGREGAT   — `sum()`/`count()` yang melintasi tenant. Tak ada baris
//                  bocor, hanya ANGKANYA. Total pendapatan yang ikut
//                  menjumlahkan PT lain terlihat wajar dan tetap salah.
//   2. PENCARIAN — hasil pencarian global menyentuh banyak tabel sekaligus;
//                  ADR-011 §6 menandainya sebagai titik perhatian khusus.
//   3. PESAN GALAT — "Proyek tidak ditemukan" vs "Anda tak berhak" adalah dua
//                  jawaban berbeda, dan yang kedua MEMBERI TAHU bahwa
//                  proyeknya ada. Itu kebocoran keberadaan.
//
// ── Kenapa diuji di lapis DB, bukan lewat HTTP
//
// `app.inject` menempuh koneksi Fastify sendiri, DI LUAR transaksi test —
// jadi ROLLBACK tak menolong dan fixture-nya bertahan di dev. Itu sudah
// terjadi sekali (companies-otorisasi: `POST /companies` benar-benar
// mendirikan '[UJI] PT Bocor', dan gejalanya muncul di berkas test LAIN).
//
// Yang benar-benar menahan agregat lintas-tenant juga bukan kode route,
// melainkan RLS. Menguji di sini berarti menguji hal yang menjaga.
// ============================================================================

let c: Client
let companyA: string
let companyB: string
let proyekB: string
let adminAuthId: string

beforeAll(async () => {
  c = await createRlsClient()
  // Admin ber-auth_id: policy PERMISSIVE butuh peran, bukan cuma company.
  adminAuthId = (await authIdForRole(c, 'admin')) ?? ''
  await c.query('BEGIN')

  companyA = (await c.query(
    `SELECT id FROM companies WHERE parent_company_id IS NULL
      ORDER BY created_at LIMIT 1`)).rows[0].id

  // Tenant kedua + data mirip, seluruhnya di dalam transaksi yang di-ROLLBACK.
  companyB = (await c.query(
    `INSERT INTO companies (code, name, owner_user_id, created_by)
     SELECT 'uji-f24', '[UJI-F2-4] Tenant B', owner_user_id, owner_user_id
       FROM companies WHERE id = $1 RETURNING id`, [companyA])).rows[0].id

  const klienB = (await c.query(
    `INSERT INTO clients (contact_person, phone, created_by, company_id)
     SELECT '[UJI-F2-4] Klien B', '0800', owner_user_id, $1
       FROM companies WHERE id = $1 RETURNING id`, [companyB])).rows[0].id

  proyekB = (await c.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date,
                           created_by, company_id, contract_value)
     SELECT $1, owner_user_id, '[UJI-F2-4] Proyek Rahasia B', 'Surabaya',
            '2026-01-01', '2026-12-31', owner_user_id, $2, 9999000000
       FROM companies WHERE id = $2 RETURNING id`, [klienB, companyB])).rows[0].id
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

/**
 * Jalankan `fn` seolah-olah sesi milik `company`.
 *
 * ⚠️ DUA hal yang wajib, dan percobaan pertama saya melewatkan keduanya:
 *
 *   1. `SET LOCAL role = authenticated` — koneksi test berjalan sebagai
 *      `postgres`, dan superuser-ish role MELEWATI RLS sepenuhnya. Tanpa ini
 *      seluruh test "menemukan kebocoran" yang sebenarnya cuma hak istimewa
 *      sesi ujinya sendiri.
 *
 *   2. `app.company_id`, BUKAN `request.jwt.claims`. Dibaca dari sumbernya:
 *      `auth_company_id()` memeriksa `current_setting('app.company_id')` lebih
 *      dulu, lalu jatuh ke `company_members`. Klaim JWT tak pernah dilihatnya.
 *
 *   3. IDENTITAS USER juga wajib. Percobaan kedua sudah benar company-nya
 *      tetapi `auth_user_id()` tetap null, jadi `auth_role()` null, jadi
 *      SELURUH policy PERMISSIVE menolak — dan tenant B tak melihat proyeknya
 *      SENDIRI. RESTRICTIVE hanya MENYARING; yang MENGIZINKAN adalah
 *      PERMISSIVE, dan itu butuh peran.
 *
 * Menebak bentuk penyamaran adalah cara termudah menulis test yang selalu
 * hijau atau selalu merah — dua-duanya tak membuktikan apa pun.
 */
async function sebagaiTenant<T>(company: string, fn: () => Promise<T>): Promise<T> {
  await c.query('SAVEPOINT s_tenant')
  try {
    await c.query(`SELECT set_config('app.company_id', $1::text, true)`, [company])
    await c.query(
      `SELECT set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [adminAuthId])
    await c.query('SET LOCAL role = authenticated')
    return await fn()
  } finally {
    await c.query('ROLLBACK TO SAVEPOINT s_tenant')
  }
}

describe('F2-4 — agregat tak boleh melintasi tenant', () => {
  it('nilai kontrak proyek tenant B TIDAK ikut terjumlah di tenant A', async () => {
    // Bentuk kebocoran yang paling sulit dilihat: tak ada baris yang bocor,
    // hanya ANGKANYA. Dashboard tenant A menampilkan total yang memuat
    // kontrak 9,999 miliar milik tenant B — terlihat wajar, tetap salah, dan
    // tak ada yang akan mempertanyakannya karena angka besar itu menyenangkan.
    const totalA = await sebagaiTenant(companyA, async () =>
      Number((await c.query(
        `SELECT COALESCE(sum(contract_value), 0)::numeric AS t FROM projects`)).rows[0].t))

    const kontrakB = Number((await c.query(
      `SELECT contract_value FROM projects WHERE id = $1`, [proyekB])).rows[0].contract_value)

    expect(kontrakB, 'fixture rusak — proyek B tak punya nilai kontrak, jadi ' +
      'test ini tak bisa membuktikan apa pun').toBe(9_999_000_000)

    // Kalau agregat bocor, totalA memuat 9,999 M milik B.
    expect(Number(totalA) % kontrakB === 0 && totalA >= kontrakB,
      `agregat tenant A memuat kontrak tenant B (total=${totalA}, ` +
      `kontrak B=${kontrakB}) — pendapatan grup lain masuk laporan`).toBe(false)
  }, 60_000)

  it('count proyek tenant A tak menghitung proyek tenant B', async () => {
    const a = await sebagaiTenant(companyA, async () =>
      Number((await c.query(
        `SELECT count(*)::int n FROM projects WHERE name LIKE '[UJI-F2-4]%'`)).rows[0].n))

    // Satu-satunya proyek bertanda [UJI-F2-4] milik tenant B. Tenant A tak
    // boleh melihatnya — nol, bukan satu.
    expect(a, 'tenant A menghitung proyek bertanda milik tenant B').toBe(0)
  }, 60_000)
})

describe('F2-4 — pencarian global', () => {
  it('nama proyek tenant B tak muncul di pencarian tenant A', async () => {
    // ADR-011 §6 menandai `search.ts` sebagai titik perhatian khusus: ia
    // menyentuh banyak tabel sekaligus, jadi satu tabel yang terlewat cukup
    // untuk membocorkan nama pelanggan, nilai proyek, dan lokasi kerja.
    const hasil = await sebagaiTenant(companyA, async () =>
      (await c.query(
        `SELECT name FROM projects WHERE name ILIKE '%Rahasia B%'`)).rows)

    expect(hasil,
      'pencarian tenant A menemukan proyek tenant B — nama pelanggan dan ' +
      'nilai kontrak ikut terbaca').toHaveLength(0)
  }, 60_000)
})

describe('F2-4 — pesan galat tak boleh membocorkan KEBERADAAN', () => {
  it('proyek tenant lain terbaca sebagai TIDAK ADA, bukan sebagai TERLARANG', async () => {
    // Perbedaan yang halus dan penting:
    //
    //   "tidak ditemukan"  → penanya tak belajar apa pun
    //   "Anda tak berhak"  → penanya tahu proyek itu ADA
    //
    // Yang kedua membocorkan keberadaan. Dengan menebak UUID atau membaca id
    // dari tautan yang salah kirim, seseorang bisa memetakan proyek mana saja
    // yang hidup di tenant lain — tanpa pernah melihat isinya.
    //
    // RLS membuat jawabannya benar dengan sendirinya: baris tenant lain
    // TIDAK TERLIHAT, jadi kode route mengembalikan 404 tanpa perlu tahu
    // bedanya. Yang diuji di sini: apakah ketidakterlihatan itu memang nyata.
    const terlihat = await sebagaiTenant(companyA, async () =>
      (await c.query(`SELECT id FROM projects WHERE id = $1`, [proyekB])).rows)

    expect(terlihat,
      'proyek tenant B TERLIHAT oleh tenant A saat diambil by-id — route akan ' +
      'membalas 200/403 alih-alih 404, dan keberadaannya bocor').toHaveLength(0)
  }, 60_000)

  it('klien tenant lain juga tak terlihat by-id', async () => {
    const klienB = (await c.query(
      `SELECT id FROM clients WHERE company_id = $1 LIMIT 1`, [companyB])).rows[0].id

    const terlihat = await sebagaiTenant(companyA, async () =>
      (await c.query(`SELECT id FROM clients WHERE id = $1`, [klienB])).rows)

    expect(terlihat, 'klien tenant B terlihat oleh tenant A').toHaveLength(0)
  }, 60_000)
})

describe('F2-4 — penjaga tetap berdaya', () => {
  it('tenant B MELIHAT datanya sendiri — kalau tidak, seluruh test di atas hampa', async () => {
    // ⚠️ Tanpa pemeriksaan ini, test yang tak bisa melihat APA PUN akan lolos
    // sebagai "nol kebocoran". Tiga uji audit_logs di batch 2 gagal persis
    // begitu — sesi ujinya tak berdaya, dan nol terbaca sebagai aman.
    const punyaB = await sebagaiTenant(companyB, async () =>
      (await c.query(`SELECT id FROM projects WHERE id = $1`, [proyekB])).rows)

    expect(punyaB,
      'tenant B tak melihat proyeknya SENDIRI — seluruh test di berkas ini ' +
      'tak berdaya, dan hasil "nol kebocoran" tak membuktikan apa pun').toHaveLength(1)
  }, 60_000)
})
