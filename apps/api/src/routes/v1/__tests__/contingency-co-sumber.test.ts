import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import contingencyRoutes from '../contingency.js'

/**
 * CO sebagai SUMBER penarikan cadangan, terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Aturan kelayakannya sudah dikunci 14 test di
 * `lib/__tests__/co-sumber-contingency.test.ts` (6 mutasi MERAH). Yang tersisa:
 *
 *   • rute `/contingency/co-sumber` tidak tertangkap rute ber-`:id`
 *   • CO yang DITOLAK ditolak sebagai sumber — ini uang, dan penarikan yang
 *     mengaku bersumber dari CO yang ditolak adalah jejak audit yang berbohong
 *   • CO dari proyek LAIN ditolak
 *   • penarikan TANPA CO tetap sah — tak setiap penarikan lahir dari CO
 *   • endpoint daftar TIDAK MENULIS apa pun
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let projectLain: string
let posId: string
let coSetuju: string
let coTolak: string
let coProyekLain: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const tarik = (payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST', url: `/api/v1/contingency/${posId}/penggunaan`,
    payload, headers: { authorization: 'Bearer t' },
  })

async function purge() {
  await client.query(
    `DELETE FROM penggunaan_contingency
      WHERE pos_id IN (SELECT id FROM pos_contingency WHERE nama LIKE '[TEST]%')`)
  await client.query(`DELETE FROM pos_contingency WHERE nama LIKE '[TEST]%'`)
  await client.query(`DELETE FROM change_orders WHERE co_number LIKE '[TEST]%'`)
}

async function jumlahPenarikan() {
  const { rows } = await client.query(`SELECT count(*)::int n FROM penggunaan_contingency`)
  return rows[0].n as number
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 2`)
  projectId = p[0].id
  projectLain = p[1]?.id ?? p[0].id

  const { rows: u } = await client.query(`SELECT id FROM users LIMIT 1`)

  await purge()

  const { rows: pos } = await client.query(
    `INSERT INTO pos_contingency (project_id, nama, nilai, status, created_by)
     VALUES ($1, '[TEST] Pos Cadangan', 100000000, 'aktif', $2) RETURNING id`,
    [projectId, u[0].id])
  posId = pos[0].id

  const buatCo = async (nomor: string, status: string, proyek: string) => {
    const { rows } = await client.query(
      `INSERT INTO change_orders (project_id, co_number, title, status, created_by)
       VALUES ($1, $2, 'Pekerjaan tambah uji', $3, $4) RETURNING id`,
      [proyek, nomor, status, u[0].id])
    return rows[0].id as string
  }
  coSetuju = await buatCo('[TEST] CO-SETUJU', 'approved', projectId)
  coTolak = await buatCo('[TEST] CO-TOLAK', 'rejected', projectId)
  coProyekLain = await buatCo('[TEST] CO-LAIN', 'approved', projectLain)

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(contingencyRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /contingency/co-sumber', () => {
  it('tidak tertangkap rute ber-:id', async () => {
    const r = await get(`/api/v1/contingency/co-sumber?project_id=${projectId}`)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toHaveProperty('layak')
  })

  it('400 tanpa project_id', async () => {
    expect((await get('/api/v1/contingency/co-sumber')).statusCode).toBe(400)
  })

  it('404 untuk proyek yang bukan milik tenant ini', async () => {
    const r = await get('/api/v1/contingency/co-sumber?project_id=00000000-0000-0000-0000-0000000000ff')
    expect(r.statusCode).toBe(404)
  })

  it('CO disetujui muncul di daftar layak', async () => {
    const j = (await get(`/api/v1/contingency/co-sumber?project_id=${projectId}`)).json()
    expect(j.layak.some((c: { id: string }) => c.id === coSetuju)).toBe(true)
  })

  it('CO DITOLAK tidak muncul di daftar layak', async () => {
    const j = (await get(`/api/v1/contingency/co-sumber?project_id=${projectId}`)).json()
    expect(j.layak.some((c: { id: string }) => c.id === coTolak)).toBe(false)
  })

  it('yang tidak layak DIHITUNG, bukan dihilangkan diam-diam', async () => {
    const j = (await get(`/api/v1/contingency/co-sumber?project_id=${projectId}`)).json()
    expect(j.tak_layak).toBeGreaterThan(0)
    expect(j.jumlah_co).toBe(j.layak.length + j.tak_layak)
  })

  it('TIDAK MENULIS apa pun', async () => {
    const sebelum = await jumlahPenarikan()
    await get(`/api/v1/contingency/co-sumber?project_id=${projectId}`)
    await get(`/api/v1/contingency/co-sumber?project_id=${projectId}`)
    expect(await jumlahPenarikan()).toBe(sebelum)
  })
})

describe('POST /contingency/:id/penggunaan — sumber CO divalidasi', () => {
  // INVARIAN TERPENTING. Ini uang: penarikan yang mengaku bersumber dari CO
  // yang DITOLAK adalah jejak audit yang berbohong, dan jejak yang berbohong
  // lebih buruk daripada tak ada jejak — karena ia dipercaya.
  it('menolak CO yang DITOLAK sebagai sumber', async () => {
    const r = await tarik({
      nilai: 1000000, alasan: 'uji CO ditolak', sumber_change_order_id: coTolak,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/DITOLAK/i)
  })

  it('menolak CO dari proyek LAIN', async () => {
    if (projectLain === projectId) return // basis uji hanya punya satu proyek
    const r = await tarik({
      nilai: 1000000, alasan: 'uji lintas proyek', sumber_change_order_id: coProyekLain,
    })
    expect(r.statusCode).toBe(400)
  })

  it('menolak CO yang tidak ada sama sekali', async () => {
    const r = await tarik({
      nilai: 1000000, alasan: 'uji hantu',
      sumber_change_order_id: '00000000-0000-0000-0000-0000000000ff',
    })
    expect(r.statusCode).toBe(400)
  })

  it('menerima CO yang disetujui, dan menyimpannya', async () => {
    const r = await tarik({
      nilai: 2500000, alasan: 'pekerjaan tambah disetujui', sumber_change_order_id: coSetuju,
    })
    expect(r.statusCode).toBe(201)

    const { rows } = await client.query(
      `SELECT sumber_change_order_id FROM penggunaan_contingency
        WHERE pos_id = $1 AND alasan = 'pekerjaan tambah disetujui'`, [posId])
    expect(rows[0].sumber_change_order_id).toBe(coSetuju)
  })

  // Tak setiap penarikan lahir dari CO — sebagian memang risiko tak terduga
  // yang tak punya pekerjaan tambah di belakangnya.
  it('tanpa sumber CO tetap sah', async () => {
    const r = await tarik({ nilai: 500000, alasan: 'risiko tak terduga' })
    expect(r.statusCode).toBe(201)
  })
})
