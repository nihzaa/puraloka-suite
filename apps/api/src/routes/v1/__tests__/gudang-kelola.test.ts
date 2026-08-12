/**
 * Gudang — mengelola lokasi penyimpanan, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   • jumlah stok per gudang BENAR-BENAR terhitung dari basis
 *   • gudang BERISI tak bisa dinonaktifkan — barang di lokasi nonaktif tak
 *     bisa dikeluarkan dari mana pun
 *   • kode kembar ditolak per-tenant
 *   • menyunting SATU kolom tak menghapus sisanya
 *   • penjaga dari tenant lain ditolak
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import gudangKelolaRoutes from '../gudang-kelola.js'

let app: FastifyInstance
let db: Client
let companyId: string
let userId: string
let userAsing: string | null = null
let userAsingDibuat: string | null = null
let materialId: string | null = null

const TANDA = 'UJI-GDG'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  await db.query(
    `DELETE FROM gudang_stok WHERE gudang_id IN (SELECT id FROM gudang WHERE kode LIKE $1)`,
    [`${TANDA}%`])
  await db.query('DELETE FROM gudang WHERE kode LIKE $1', [`${TANDA}%`])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  userId = u[0].id
  const { rows: co } = await db.query(
    'SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1', [userId])
  companyId = co[0].company_id

  await bersihkan()

  const { rows: m } = await db.query('SELECT id FROM materials LIMIT 1')
  materialId = m.length ? m[0].id : null

  // Pengguna yang BUKAN anggota tenant ini. Id yang benar-benar ADA, bukan
  // UUID acak: dengan UUID acak `maybeSingle()` mengembalikan null dengan atau
  // tanpa saringan, jadi testnya tetap hijau saat saringannya dibuang.
  const { rows: asing } = await db.query(
    `SELECT u.id FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM company_members cm
                         WHERE cm.user_id = u.id AND cm.company_id = $1)
      LIMIT 1`, [companyId])
  if (asing.length) {
    userAsing = asing[0].id
  } else {
    const { rows: peran } = await db.query('SELECT id FROM roles LIMIT 1')
    const { rows: u2 } = await db.query(
      `INSERT INTO users (email, name, auth_id, role_id)
       VALUES ($1, $2, gen_random_uuid(), $3) RETURNING id`,
      [`${TANDA}-asing@uji.local`, `${TANDA} bukan anggota`, peran[0].id])
    userAsing = u2[0].id
    userAsingDibuat = u2[0].id
  }

  app = Fastify({ logger: false })
  await app.register(gudangKelolaRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  if (userAsingDibuat) await db.query('DELETE FROM users WHERE id = $1', [userAsingDibuat])
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('membuat', () => {
  it('menolak kode kosong', async () => {
    const r = await post('/api/v1/gudang', { nama: 'Gudang X' })
    expect(r.statusCode).toBe(400)
  })

  it('menolak nama kosong', async () => {
    const r = await post('/api/v1/gudang', { kode: `${TANDA}-A` })
    expect(r.statusCode).toBe(400)
  })

  it('membuat gudang, kode dijadikan huruf besar', async () => {
    const r = await post('/api/v1/gudang', {
      kode: `${TANDA}-a`, nama: 'Gudang Pusat Uji', alamat: 'Jl. Uji No. 1',
    })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().gudang.kode).toBe(`${TANDA}-A`)
    expect(r.json().gudang.aktif).toBe(true)
  })

  it('kode KEMBAR di tenant yang sama ditolak 409', async () => {
    const r = await post('/api/v1/gudang', { kode: `${TANDA}-A`, nama: 'Duplikat' })
    expect(r.statusCode, r.body).toBe(409)
  })

  it('penjaga dari tenant LAIN ditolak, dan gudangnya tak terbuat', async () => {
    if (!userAsing) throw new Error('fixture pengguna asing tak terbentuk')
    const r = await post('/api/v1/gudang', {
      kode: `${TANDA}-ASING`, nama: 'Gudang penjaga asing', penjaga_id: userAsing,
    })
    expect(r.statusCode, r.body).toBe(404)
    expect(r.json().error).toMatch(/bukan anggota/i)

    const { rows } = await db.query(
      'SELECT count(*)::int n FROM gudang WHERE kode = $1', [`${TANDA}-ASING`])
    expect(rows[0].n, 'gudang terbuat meski penjaganya ditolak').toBe(0)
  })
})

describe('daftar', () => {
  it('membawa jumlah jenis material dan total kuantitas', async () => {
    if (!materialId) return
    const { rows: g } = await db.query('SELECT id FROM gudang WHERE kode = $1', [`${TANDA}-A`])

    // DUA baris, bukan satu. `numeric` datang sebagai STRING dari pg, dan
    // dengan satu baris `0 + '12.5'` kebetulan tetap 12.5 — mutasi yang
    // menghapus `Number()` lolos. Dengan dua baris, penggabungan string
    // menghasilkan '012.57.5' dan barulah perbedaannya terlihat.
    const { rows: m2 } = await db.query(
      'SELECT id FROM materials WHERE id <> $1 LIMIT 1', [materialId])
    await db.query(
      `INSERT INTO gudang_stok (gudang_id, material_id, qty) VALUES ($1, $2, 12.5)`,
      [g[0].id, materialId])
    if (m2.length) {
      await db.query(
        `INSERT INTO gudang_stok (gudang_id, material_id, qty) VALUES ($1, $2, 7.5)`,
        [g[0].id, m2[0].id])
    }

    const r = await get('/api/v1/gudang')
    expect(r.statusCode, r.body).toBe(200)
    const gd = r.json().gudang.find((x: { kode: string }) => x.kode === `${TANDA}-A`)
    expect(gd.jenis_material).toBe(m2.length ? 2 : 1)
    expect(gd.total_qty,
      'numeric tak dikonversi — angka digabung sebagai teks, dan totalnya salah ' +
      'tanpa satu pun galat').toBe(m2.length ? 20 : 12.5)
  })

  it('gudang tenant LAIN tak muncul', async () => {
    const { rows: coLain } = await db.query(
      'SELECT id FROM companies WHERE id <> $1 LIMIT 1', [companyId])
    if (!coLain.length) return
    await db.query(
      `INSERT INTO gudang (company_id, kode, nama) VALUES ($1, $2, 'gudang tenant lain')
       ON CONFLICT (company_id, kode) DO NOTHING`,
      [coLain[0].id, `${TANDA}-LAIN`])

    const r = await get('/api/v1/gudang')
    const kode = r.json().gudang.map((x: { kode: string }) => x.kode)
    expect(kode).not.toContain(`${TANDA}-LAIN`)
  })
})

describe('menyunting', () => {
  let idGudang: string

  beforeAll(async () => {
    const { rows } = await db.query('SELECT id FROM gudang WHERE kode = $1', [`${TANDA}-A`])
    idGudang = rows[0].id
  })

  it('menyunting SATU kolom tak menghapus sisanya', async () => {
    // Pelajaran dari rute pegawai: patch yang menulis seluruh kolom membuat
    // menyunting nama menghapus alamat dan catatan, diam-diam.
    const { rows: sebelum } = await db.query(
      'SELECT alamat FROM gudang WHERE id = $1', [idGudang])
    expect(sebelum[0].alamat).toBeTruthy()

    const r = await patch(`/api/v1/gudang/${idGudang}`, { nama: 'Gudang Pusat (diubah)' })
    expect(r.statusCode, r.body).toBe(200)

    const { rows: sesudah } = await db.query(
      'SELECT nama, alamat FROM gudang WHERE id = $1', [idGudang])
    expect(sesudah[0].nama).toBe('Gudang Pusat (diubah)')
    expect(sesudah[0].alamat,
      'alamat terhapus saat menyunting nama — patch menulis seluruh kolom')
      .toBe(sebelum[0].alamat)
  })

  it('nama kosong ditolak', async () => {
    const r = await patch(`/api/v1/gudang/${idGudang}`, { nama: '   ' })
    expect(r.statusCode).toBe(400)
  })

  it('body tanpa satu pun kolom ditolak', async () => {
    const r = await patch(`/api/v1/gudang/${idGudang}`, {})
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak ada kolom/i)
  })

  it('gudang BERISI tak bisa dinonaktifkan', async () => {
    if (!materialId) return
    const r = await patch(`/api/v1/gudang/${idGudang}`, { aktif: false })
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/pindahkan isinya/i)

    const { rows } = await db.query('SELECT aktif FROM gudang WHERE id = $1', [idGudang])
    expect(rows[0].aktif,
      'gudang berisi jadi nonaktif — barang di dalamnya tak bisa dikeluarkan dari mana pun')
      .toBe(true)
  })

  it('sesudah isinya dikosongkan, penonaktifan berhasil', async () => {
    await db.query('DELETE FROM gudang_stok WHERE gudang_id = $1', [idGudang])
    const r = await patch(`/api/v1/gudang/${idGudang}`, { aktif: false })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().gudang.aktif).toBe(false)
  })

  it('gudang tenant LAIN ditolak 404', async () => {
    const { rows } = await db.query(
      'SELECT id FROM gudang WHERE company_id <> $1 LIMIT 1', [companyId])
    if (!rows.length) return
    const r = await patch(`/api/v1/gudang/${rows[0].id}`, { nama: 'diubah orang luar' })
    expect(r.statusCode, r.body).toBe(404)
  })
})
