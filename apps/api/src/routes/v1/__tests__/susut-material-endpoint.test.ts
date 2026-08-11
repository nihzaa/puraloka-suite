import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import susutRoutes from '../susut-material.js'

/**
 * RENCANA SUSUT & JEMBATAN terhadap Postgres NYATA (G6e).
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 36 test di `lib/__tests__/susut-material.test.ts`
 * (15/15 mutasi MERAH). Yang tersisa:
 *
 *   • `uq_peta_resource` — satu resource TAK BISA dipetakan ke dua material,
 *     dan upsert-nya memakai onConflict yang benar (menimpa, bukan menabrak)
 *   • constraint `faktor > 0` dan `susut_fraksi <= 1` ditegakkan BASIS,
 *     bukan hanya aplikasi — dibuktikan lewat SQL langsung
 *   • persen→fraksi benar-benar tersimpan sebagai fraksi (bukan persen)
 *
 * Fixture berprefiks [TEST-SM] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let companyId: string
let resourceId: string
let materialId: string
let material2Id: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'PUT' | 'DELETE', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`DELETE FROM peta_resource_material WHERE catatan LIKE '[TEST-SM]%'`)
  await client.query(`DELETE FROM rencana_susut_material WHERE dasar LIKE '[TEST-SM]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: c } = await client.query(
    `SELECT company_id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  if (c.length === 0) throw new Error('basis tanpa proyek ber-company')
  companyId = c[0].company_id

  const { rows: r } = await client.query(`SELECT id FROM resources ORDER BY id LIMIT 1`)
  if (r.length === 0) throw new Error('basis tanpa resources — fixture tak bisa dibuat')
  resourceId = r[0].id

  const { rows: m } = await client.query(`SELECT id FROM materials ORDER BY id LIMIT 2`)
  if (m.length < 2) throw new Error('basis butuh minimal 2 material untuk menguji uq_peta_resource')
  materialId = m[0].id
  material2Id = m[1].id

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(susutRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  try { await purge() } finally {
    await app?.close()
    await client?.end()
  }
})

describe('PUT /gudang/susut/peta — jembatan AHSP↔gudang', () => {
  it('memetakan resource ke material dengan faktor', async () => {
    await purge()
    const r = await kirim('PUT', '/api/v1/gudang/susut/peta', {
      resource_id: resourceId, material_id: materialId,
      faktor: 0.02, catatan: '[TEST-SM] 1 kg = 0,02 sak',
    })
    expect(r.statusCode).toBe(200)
    expect(Number(r.json().peta.faktor)).toBeCloseTo(0.02, 6)
  })

  it('memetakan ULANG resource yang sama MENIMPA, bukan menabrak', async () => {
    // `uq_peta_resource` menolak duplikat; kalau upsert-nya salah onConflict,
    // pengguna yang mengoreksi pemetaan akan mendapat galat duplikat dan
    // menyimpulkan pemetaannya tak bisa diubah.
    await purge()
    await kirim('PUT', '/api/v1/gudang/susut/peta', {
      resource_id: resourceId, material_id: materialId,
      faktor: 0.02, catatan: '[TEST-SM] awal',
    })
    const r = await kirim('PUT', '/api/v1/gudang/susut/peta', {
      resource_id: resourceId, material_id: material2Id,
      faktor: 1, catatan: '[TEST-SM] dikoreksi',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().peta.material_id).toBe(material2Id)

    // Dan hanya ADA SATU baris untuk resource itu.
    const { rows } = await client.query(
      `SELECT count(*) n FROM peta_resource_material
        WHERE company_id = $1 AND resource_id = $2`, [companyId, resourceId])
    expect(Number(rows[0].n)).toBe(1)
  })

  it('faktor NOL ditolak sebelum menyentuh basis', async () => {
    const r = await kirim('PUT', '/api/v1/gudang/susut/peta', {
      resource_id: resourceId, material_id: materialId, faktor: 0,
      catatan: '[TEST-SM] nol',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/lebih besar dari 0/)
  })

  it('dan BASIS menolaknya juga — aplikasi bukan satu-satunya penjaga', async () => {
    // Skrip impor dan perbaikan manual lewat SQL tak melewati satu pun
    // preHandler.
    let lolos = false
    try {
      await client.query(
        `INSERT INTO peta_resource_material (company_id, resource_id, material_id, faktor, catatan)
         VALUES ($1, $2, $3, 0, '[TEST-SM] langsung SQL')`,
        [companyId, resourceId, materialId])
      lolos = true
    } catch { /* ditolak: benar */ }
    expect(lolos).toBe(false)
  })

  it('resource_id / material_id kosong ditolak DENGAN PESAN YANG MENJELASKAN', async () => {
    // Ditemukan mutasi: menghapus pemeriksaan `!b.resource_id` tak membuat
    // test merah, karena basis pun menolaknya lewat NOT NULL dan status-nya
    // sama-sama 400.
    //
    // Yang BERBEDA adalah pesannya. Galat Postgres berbunyi
    // 'null value in column "resource_id" violates not-null constraint' —
    // kalimat yang tak berarti apa pun bagi orang yang sedang memetakan
    // material, dan yang membuatnya mengira aplikasinya rusak.
    //
    // Karena itu yang diuji pesannya, bukan sekadar status.
    const a = await kirim('PUT', '/api/v1/gudang/susut/peta', { material_id: materialId, faktor: 1 })
    expect(a.statusCode).toBe(400)
    expect(a.json().error).toBe('resource_id wajib diisi')

    const b = await kirim('PUT', '/api/v1/gudang/susut/peta', { resource_id: resourceId, faktor: 1 })
    expect(b.statusCode).toBe(400)
    expect(b.json().error).toBe('material_id wajib diisi')
  })

  it('faktor kosong ditolak — Number("") adalah 0', async () => {
    const r = await kirim('PUT', '/api/v1/gudang/susut/peta', {
      resource_id: resourceId, material_id: materialId, faktor: '',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/wajib diisi/)
  })
})

describe('GET /gudang/susut/peta', () => {
  it('mengirim pemetaan beserta daftar material untuk pemilihnya', async () => {
    await purge()
    await kirim('PUT', '/api/v1/gudang/susut/peta', {
      resource_id: resourceId, material_id: materialId, faktor: 1,
      catatan: '[TEST-SM] uji daftar',
    })
    const r = await get('/api/v1/gudang/susut/peta')
    expect(r.statusCode).toBe(200)
    expect(Array.isArray(r.json().material)).toBe(true)
    expect(r.json().material.length).toBeGreaterThan(0)
  })
})

describe('DELETE /gudang/susut/peta/:id', () => {
  it('menghapus pemetaan', async () => {
    await purge()
    const c = await kirim('PUT', '/api/v1/gudang/susut/peta', {
      resource_id: resourceId, material_id: materialId, faktor: 1,
      catatan: '[TEST-SM] akan dihapus',
    })
    const r = await kirim('DELETE', `/api/v1/gudang/susut/peta/${c.json().peta.id}`)
    expect(r.statusCode).toBe(200)
  })

  it('id yang tak ada menjawab 404', async () => {
    const r = await kirim('DELETE',
      '/api/v1/gudang/susut/peta/00000000-0000-0000-0000-0000000000ff')
    expect(r.statusCode).toBe(404)
  })
})

describe('PUT /gudang/susut/rencana', () => {
  it('persen tersimpan sebagai FRAKSI, bukan persen', async () => {
    // Salah satu dari dua ini akan membuat susut 5% terbaca sebagai 500%
    // atau 0,05% — dan keduanya terlihat masuk akal di layar yang berbeda.
    await purge()
    const r = await kirim('PUT', '/api/v1/gudang/susut/rencana', {
      material_id: materialId, susut_persen: 5, dasar: '[TEST-SM] pengalaman lapangan',
    })
    expect(r.statusCode).toBe(200)
    expect(Number(r.json().rencana.susut_fraksi)).toBeCloseTo(0.05, 6)
  })

  it('menetapkan ULANG menimpa, bukan menabrak', async () => {
    await purge()
    await kirim('PUT', '/api/v1/gudang/susut/rencana', {
      material_id: materialId, susut_persen: 5, dasar: '[TEST-SM] awal',
    })
    const r = await kirim('PUT', '/api/v1/gudang/susut/rencana', {
      material_id: materialId, susut_persen: 8, dasar: '[TEST-SM] dikoreksi',
    })
    expect(r.statusCode).toBe(200)
    expect(Number(r.json().rencana.susut_fraksi)).toBeCloseTo(0.08, 6)
  })

  it('susut 0 diterima — material yang memang tak menyusut', async () => {
    await purge()
    const r = await kirim('PUT', '/api/v1/gudang/susut/rencana', {
      material_id: materialId, susut_persen: 0, dasar: '[TEST-SM] barang jadi',
    })
    expect(r.statusCode).toBe(200)
  })

  it('susut kosong ditolak, bukan jadi 0%', async () => {
    const r = await kirim('PUT', '/api/v1/gudang/susut/rencana', {
      material_id: materialId, susut_persen: '', dasar: '[TEST-SM] kosong',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/wajib diisi/)
  })

  it('susut di atas 100% ditolak', async () => {
    const r = await kirim('PUT', '/api/v1/gudang/susut/rencana', {
      material_id: materialId, susut_persen: 500, dasar: '[TEST-SM] ngawur',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/dua kali lipat/)
  })

  it('dan BASIS menolak fraksi di atas 1 — lewat SQL langsung', async () => {
    let lolos = false
    try {
      await client.query(
        `INSERT INTO rencana_susut_material (company_id, material_id, susut_fraksi, dasar)
         VALUES ($1, $2, 5, '[TEST-SM] langsung SQL')`, [companyId, materialId])
      lolos = true
    } catch { /* ditolak: benar */ }
    expect(lolos).toBe(false)
  })

  it('material_id kosong ditolak DENGAN PESAN YANG MENJELASKAN', async () => {
    // Sama dengan pemetaan: basis pun menolak lewat NOT NULL, jadi status
    // saja tak membuktikan pemeriksaan aplikasinya ada. Yang diuji pesannya.
    const r = await kirim('PUT', '/api/v1/gudang/susut/rencana', { susut_persen: 5 })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toBe('material_id wajib diisi')
  })
})
