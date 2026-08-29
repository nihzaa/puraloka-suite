import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth, supabase } from '../../../utils/supabase.js'
import authRoutes from '../auth.js'

// ============================================================================
// Pendaftaran user: role WAJIB dicari dengan benar
// ============================================================================
// Cacat yang melahirkan berkas ini (2026-08-29, dilaporkan founder dari layar):
//
//     "Role 'pm' tidak valid"
//
// Padahal `pm` ADA, punya 136 izin, dan 4 user memakainya. Yang rusak:
//
//   1. `roles` berkategori AB, jadi wrapper memulangkan
//      `company_id IS NULL OR company_id = tenant` — untuk `pm` itu DUA baris
//      (template global + milik Puraloka Persada).
//   2. Kode memakai `.maybeSingle()`, yang MELEMPAR kalau > 1 baris —
//      bukan memilih salah satu.
//   3. Galat itu TAK PERNAH DIPERIKSA (`const { data: roleRow }` tanpa
//      `error`), jadi roleRow = null.
//   4. Lalu dilaporkan sebagai "Role tidak valid" — pesan yang menuduh PERAN,
//      padahal perannya benar.
//
// Akibatnya SELURUH pembuatan user mati, bukan cuma PM. Dan komentar di kode
// menyatakan `roles.name` UNIQUE GLOBAL — diukur: TIDAK. Indeksnya
// `roles_template_name_uniq (name) WHERE company_id IS NULL` +
// `roles_company_name_uniq (company_id, name) WHERE company_id IS NOT NULL`.
//
// Yang benar: role MILIK TENANT menang atas template global.
// ============================================================================

const TANDA = '[TEST-REGROLE]'

let app: FastifyInstance
let client: Client
let adminAuth: string

const actAsAdmin = () =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: adminAuth } }, error: null } as never)

const daftar = (payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: payload as never, headers: { authorization: 'Bearer t' },
  })

/*
  ⚠ Membersihkan `users` SAJA tidak cukup.

  Pendaftaran membuat DUA hal: baris `users` DAN akun di Supabase Auth
  (GoTrue). Versi pertama pembersih ini cuma menghapus yang pertama, jadi
  jalan berikutnya gagal dengan "A user with this email address has already
  been registered" — galat yang menuduh TEST, padahal pembersihnya yang bocor.

  `auth_id` diambil SEBELUM barisnya dihapus; sesudah itu tak ada lagi cara
  menemukannya.
*/
async function bersihkan() {
  const { rows } = await client.query(
    `SELECT id, auth_id FROM users WHERE name LIKE $1 OR email LIKE $2`,
    [`${TANDA}%`, `%regrole.uji%`])

  // Keanggotaan lebih dulu — FK-nya menunjuk users.
  await client.query(
    `DELETE FROM company_members WHERE user_id IN
       (SELECT id FROM users WHERE name LIKE $1 OR email LIKE $2)`,
    [`${TANDA}%`, `%regrole.uji%`])
  await client.query(`DELETE FROM users WHERE name LIKE $1 OR email LIKE $2`,
    [`${TANDA}%`, `%regrole.uji%`])

  for (const r of rows) {
    if (r.auth_id) await supabase.auth.admin.deleteUser(r.auth_id).catch(() => {})
  }
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await bersihkan()

  app = Fastify()
  await app.register(authRoutes)
  await app.ready()
})

afterEach(async () => { await bersihkan() })
afterAll(async () => { await bersihkan(); await app.close(); await client.end() })

describe('pendaftaran user — pencarian role', () => {
  it('prasyarat: `pm` benar-benar punya DUA baris (template + tenant)', async () => {
    const { rows } = await client.query(
      `SELECT company_id FROM roles WHERE name = 'pm'
        AND (company_id IS NULL
             OR company_id = (SELECT company_id FROM company_members
                               WHERE user_id = (SELECT id FROM users WHERE auth_id = $1)
                                 AND is_active AND is_default LIMIT 1))`,
      [adminAuth],
    )
    // Kalau ini 1, cacatnya tak bisa direproduksi di sini — dan test di bawah
    // lulus tanpa menguji apa pun. Lebih baik berhenti dengan sebabnya.
    expect(
      rows.length,
      'prasyarat gagal: `pm` tak lagi punya dua baris, jadi test ini tak menguji cacat aslinya',
    ).toBe(2)
  }, 60_000)

  it('R-PM: mendaftarkan Project Manager BERHASIL — bukan "role tidak valid"', async () => {
    actAsAdmin()
    const r = await daftar({
      name: `${TANDA} Uji PM`,
      email: `pm.regrole.uji@puraloka.test`,
      password: 'sandi-panjang-uji-123',
      role: 'pm',
    })

    expect(
      r.statusCode,
      `pendaftaran PM ditolak. Kalau bunyinya "Role 'pm' tidak valid", itu cacat ` +
        `pencarian role (dua baris + maybeSingle), BUKAN perannya. Body: ${r.body}`,
    ).toBe(201)

    // Dan role yang tersimpan WAJIB milik tenant, bukan template global.
    const { rows } = await client.query(
      `SELECT r.name, r.company_id IS NULL AS template
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.email = 'pm.regrole.uji@puraloka.test'`)
    expect(rows[0]?.name).toBe('pm')
    expect(
      rows[0]?.template,
      'user dipasangi role TEMPLATE global, bukan role milik tenantnya — ' +
        'permission set-nya bisa berbeda dari yang dikelola perusahaan ini',
    ).toBe(false)
  }, 60_000)

  it('role staf kantor juga bisa — bukan hanya empat yang dipaku di UI', async () => {
    actAsAdmin()
    // Diambil dari BASIS, bukan daftar tulisan tangan: kalau perusahaan
    // menambah role baru lewat Matriks Izin, ia ikut teruji di sini.
    const { rows: kandidat } = await client.query(
      `SELECT r.name FROM roles r
        WHERE r.company_id = (SELECT company_id FROM company_members
                               WHERE user_id = (SELECT id FROM users WHERE auth_id = $1)
                                 AND is_active AND is_default LIMIT 1)
          AND r.name IN ('estimator','manajer_keuangan','hrd','procurement_officer')
        ORDER BY r.name`,
      [adminAuth],
    )
    expect(kandidat.length, 'nol role staf kantor di basis — seed belum jalan?').toBeGreaterThan(0)

    for (const { name } of kandidat) {
      const r = await daftar({
        name: `${TANDA} ${name}`,
        email: `${name}.regrole.uji@puraloka.test`,
        password: 'sandi-panjang-uji-123',
        role: name,
      })
      expect(r.statusCode, `role '${name}' ditolak. Body: ${r.body}`).toBe(201)
    }
  }, 120_000)

  /*
    Dilaporkan founder 2026-08-29: akun yang BARU didaftarkan tak muncul di
    /users, tapi pendaftaran ulang ditolak "email sudah terpakai".

    Diukur: barisnya ADA dan benar (nama, email, role=pm, aktif) — yang tak ada
    adalah `company_members`. Rute register menyimpan ke `users` lalu berhenti.

    Akibatnya `auth_company_id()` NULL untuk orang itu, seluruh query
    tersaring habis, dan ia HILANG dari layar sambil tetap memblokir emailnya.
    Tak ada satu pun galat.

    Penjaga `audit-keanggotaan-punya-default.mjs` tak menangkapnya: ia memakai
    `AND EXISTS (SELECT 1 FROM company_members …)`, jadi ia hanya memeriksa
    orang yang SUDAH punya keanggotaan. Nol keanggotaan tak terlihat olehnya.
  */
  it('R-KEANGGOTAAN: user baru DAPAT keanggotaan perusahaan + default', async () => {
    actAsAdmin()
    const r = await daftar({
      name: `${TANDA} Uji Anggota`,
      email: 'anggota.regrole.uji@puraloka.test',
      password: 'sandi-panjang-uji-123',
      role: 'pm',
    })
    expect(r.statusCode, `Body: ${r.body}`).toBe(201)

    const { rows } = await client.query(
      `SELECT m.company_id, m.is_active, m.is_default
         FROM company_members m
         JOIN users u ON u.id = m.user_id
        WHERE u.email = 'anggota.regrole.uji@puraloka.test'`)

    expect(
      rows.length,
      'user baru NOL keanggotaan perusahaan — ia tak akan terlihat di layar ' +
        'mana pun (auth_company_id() NULL → semua query tersaring habis), ' +
        'sementara emailnya tetap memblokir pendaftaran ulang',
    ).toBeGreaterThan(0)
    expect(rows[0].is_active, 'keanggotaan dibuat tapi TIDAK aktif').toBe(true)
    expect(
      rows[0].is_default,
      'keanggotaan tanpa is_default — auth_company_id() tetap NULL, gejalanya sama persis',
    ).toBe(true)
  }, 60_000)

  it('role yang BENAR-BENAR tak ada tetap ditolak 400', async () => {
    actAsAdmin()
    const r = await daftar({
      name: `${TANDA} Hantu`,
      email: 'hantu.regrole.uji@puraloka.test',
      password: 'sandi-panjang-uji-123',
      role: 'role-yang-tak-pernah-ada',
    })
    expect(r.statusCode, `Body: ${r.body}`).toBe(400)
    expect(r.body).toMatch(/tidak valid/i)
  }, 60_000)
})
