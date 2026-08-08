import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import rfqRoutes from '../rfq.js'

/**
 * MR → RFQ, terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Aturan kelayakannya sudah dikunci 24 test di `lib/__tests__/mr-layak-rfq.test.ts`
 * (9 mutasi terbukti MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rute `/rfq/mr-layak` tidak tertangkap `/rfq/:id` — kalau urutannya
 *     salah, "mr-layak" dibaca sebagai UUID dan membalas 404
 *   • `mr_id` dari proyek LAIN ditolak. Ini celah yang baru ditutup: rute
 *     POST menerima `mr_id` sejak lama dan langsung meng-insert-nya tanpa
 *     memeriksa apa pun. Selama UI tak pernah mengirimnya, celahnya tak
 *     terpakai — dan sekarang UI mulai mengirimnya.
 *   • proyek tenant lain membalas 404
 *   • endpoint TIDAK MENULIS apa pun
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let projectLain: string
let mrLayak: string
let mrProyekLain: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const post = (url: string, payload: Record<string, string>) =>
  app.inject({ method: 'POST', url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`DELETE FROM rfq WHERE nomor LIKE '[TEST]%'`)
  await client.query(
    `DELETE FROM material_request_items
      WHERE mr_id IN (SELECT id FROM material_requests WHERE mr_number LIKE '[TEST]%')`)
  await client.query(`DELETE FROM material_requests WHERE mr_number LIKE '[TEST]%'`)
}

async function jumlahRfq() {
  const { rows } = await client.query(`SELECT count(*)::int n FROM rfq`)
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
  const { rows: m } = await client.query(`SELECT id, unit FROM materials LIMIT 1`)

  await purge()

  // MR layak: approved, satu item bersisa penuh.
  const { rows: a } = await client.query(
    `INSERT INTO material_requests (mr_number, project_id, requested_by, status, request_date)
     VALUES ('[TEST] MR-LAYAK', $1, $2, 'approved', CURRENT_DATE) RETURNING id`,
    [projectId, u[0].id])
  mrLayak = a[0].id
  await client.query(
    `INSERT INTO material_request_items (mr_id, material_id, qty_requested, qty_ordered, unit)
     VALUES ($1, $2, 100, 0, $3)`, [mrLayak, m[0].id, m[0].unit ?? 'unit'])

  // MR draft di proyek yang sama — tidak layak, tapi harus DIHITUNG.
  const { rows: d } = await client.query(
    `INSERT INTO material_requests (mr_number, project_id, requested_by, status, request_date)
     VALUES ('[TEST] MR-DRAFT', $1, $2, 'draft', CURRENT_DATE) RETURNING id`,
    [projectId, u[0].id])
  await client.query(
    `INSERT INTO material_request_items (mr_id, material_id, qty_requested, qty_ordered, unit)
     VALUES ($1, $2, 50, 0, $3)`, [d[0].id, m[0].id, m[0].unit ?? 'unit'])

  // MR di proyek LAIN — dipakai membuktikan celah lintas-proyek tertutup.
  const { rows: l } = await client.query(
    `INSERT INTO material_requests (mr_number, project_id, requested_by, status, request_date)
     VALUES ('[TEST] MR-LAIN', $1, $2, 'approved', CURRENT_DATE) RETURNING id`,
    [projectLain, u[0].id])
  mrProyekLain = l[0].id

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(rfqRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /rfq/mr-layak', () => {
  // Kalau `/rfq/:id` terdaftar lebih dulu, "mr-layak" dibaca sebagai UUID.
  it('tidak tertangkap oleh rute /rfq/:id', async () => {
    const r = await get(`/api/v1/rfq/mr-layak?project_id=${projectId}`)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toHaveProperty('layak')
  })

  it('400 tanpa project_id', async () => {
    expect((await get('/api/v1/rfq/mr-layak')).statusCode).toBe(400)
  })

  it('404 untuk proyek yang bukan milik tenant ini', async () => {
    const r = await get('/api/v1/rfq/mr-layak?project_id=00000000-0000-0000-0000-0000000000ff')
    expect(r.statusCode).toBe(404)
  })

  it('MR approved bersisa muncul, dengan sisa dan material-nya', async () => {
    const j = (await get(`/api/v1/rfq/mr-layak?project_id=${projectId}`)).json()
    const t = j.layak.find((x: { id: string }) => x.id === mrLayak)
    expect(t).toBeDefined()
    expect(t.total_sisa).toBe(100)
    expect(t.item[0].material_id).toBeTruthy()
  })

  it('MR draft TIDAK muncul di daftar layak', async () => {
    const j = (await get(`/api/v1/rfq/mr-layak?project_id=${projectId}`)).json()
    expect(j.layak.some((x: { mr_number: string }) => x.mr_number === '[TEST] MR-DRAFT')).toBe(false)
  })

  // Daftar yang menyusut tanpa penjelasan membuat orang bertanya "MR saya ke
  // mana" dan tak menemukan jawabannya di layar mana pun.
  it('yang tidak layak DIHITUNG, bukan dihilangkan diam-diam', async () => {
    const j = (await get(`/api/v1/rfq/mr-layak?project_id=${projectId}`)).json()
    expect(j.tak_layak).toBeGreaterThan(0)
    expect(j.jumlah_mr).toBe(j.layak.length + j.tak_layak)
  })

  it('TIDAK MENULIS apa pun', async () => {
    const sebelum = await jumlahRfq()
    await get(`/api/v1/rfq/mr-layak?project_id=${projectId}`)
    await get(`/api/v1/rfq/mr-layak?project_id=${projectId}`)
    expect(await jumlahRfq()).toBe(sebelum)
  })
})

describe('POST /rfq — mr_id divalidasi', () => {
  // CELAH YANG BARU DITUTUP. Rute ini menerima `mr_id` sejak lama dan
  // langsung meng-insert-nya. RFQ proyek A yang menunjuk kebutuhan proyek B
  // hanya ketahuan saat seseorang bertanya "ini untuk apa" — jauh setelah
  // PO terbit.
  it('menolak mr_id dari proyek LAIN', async () => {
    if (projectLain === projectId) return // basis uji hanya punya satu proyek

    const r = await post('/api/v1/rfq', {
      project_id: projectId,
      nomor: '[TEST] RFQ-SILANG',
      mr_id: mrProyekLain,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tidak ditemukan di proyek ini/i)
  })

  it('menolak mr_id yang tidak ada sama sekali', async () => {
    const r = await post('/api/v1/rfq', {
      project_id: projectId,
      nomor: '[TEST] RFQ-HANTU',
      mr_id: '00000000-0000-0000-0000-0000000000ff',
    })
    expect(r.statusCode).toBe(400)
  })

  it('menerima mr_id dari proyek yang sama, dan menyimpannya', async () => {
    const r = await post('/api/v1/rfq', {
      project_id: projectId,
      nomor: '[TEST] RFQ-SAH',
      mr_id: mrLayak,
    })
    expect(r.statusCode).toBeLessThan(300)

    const { rows } = await client.query(
      `SELECT mr_id FROM rfq WHERE nomor = '[TEST] RFQ-SAH'`)
    expect(rows[0].mr_id).toBe(mrLayak)
  })

  // Tanpa MR tetap sah: tidak setiap permintaan harga lahir dari MR formal.
  it('tanpa mr_id tetap sah', async () => {
    const r = await post('/api/v1/rfq', {
      project_id: projectId,
      nomor: '[TEST] RFQ-TANPA-MR',
    })
    expect(r.statusCode).toBeLessThan(300)
  })
})
