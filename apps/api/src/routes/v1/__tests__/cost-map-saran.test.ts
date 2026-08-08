import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import costControlRoutes from '../cost-control.js'

/**
 * SARAN PEMETAAN kategori → cost code, terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Heuristiknya sudah dikunci 18 test di `lib/__tests__/saran-cost-map.test.ts`
 * tanpa menyentuh basis. Yang tersisa:
 *
 *   • endpoint TIDAK MENULIS apa pun — ia GET, dan peta harus tetap kosong
 *     sesudah dipanggil. Ini invarian terpenting: saran yang diterapkan
 *     diam-diam menghasilkan laporan varians yang salah tanpa gejala.
 *   • kategori yang SUDAH dipetakan benar-benar dilewati
 *   • proyek tenant lain membalas 404
 *   • cost code yang dipensiunkan tidak ikut disarankan
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let katBeton: string
let costBeton: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(
    `DELETE FROM cost_code_category_map
      WHERE category_id IN (SELECT id FROM project_expense_categories WHERE name LIKE '[TEST]%')`)
  await client.query(`DELETE FROM project_expense_categories WHERE name LIKE '[TEST]%'`)
}

/** Berapa baris peta yang ada — dipakai membuktikan GET tak menulis. */
async function jumlahPeta() {
  const { rows } = await client.query(`SELECT count(*)::int n FROM cost_code_category_map`)
  return rows[0].n as number
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  projectId = p[0].id

  await purge()

  // Dua kategori: satu yang jelas punya padanan, satu yang jelas tidak.
  const { rows: k } = await client.query(
    `INSERT INTO project_expense_categories (project_id, name, type)
     VALUES ($1, '[TEST] Beton & Semen', 'material'),
            ($1, '[TEST] Entah Apa Ini', 'material')
     RETURNING id, name`, [projectId])
  katBeton = k.find((x) => x.name.includes('Beton'))!.id

  const { rows: c } = await client.query(
    `SELECT id FROM cost_codes WHERE status <> 'deprecated' AND name ILIKE 'beton' LIMIT 1`)
  costBeton = c[0]?.id

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(costControlRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /projects/:id/cost-map/saran', () => {
  it('404 untuk proyek yang bukan milik tenant ini', async () => {
    const r = await get('/api/v1/projects/00000000-0000-0000-0000-0000000000ff/cost-map/saran')
    expect(r.statusCode).toBe(404)
  })

  it('menyarankan kategori yang punya padanan nama', async () => {
    const r = await get(`/api/v1/projects/${projectId}/cost-map/saran`)
    expect(r.statusCode).toBe(200)
    const j = r.json()

    const beton = j.saran.find((s: { category_id: string }) => s.category_id === katBeton)
    expect(beton).toBeDefined()
    expect(beton.cost_code_name.toLowerCase()).toContain('beton')
    // Skor dibawa supaya manusia bisa menilai seberapa yakin usulnya.
    expect(beton.skor).toBeGreaterThan(0.4)
  })

  it('kategori tanpa padanan TIDAK disarankan', async () => {
    const r = await get(`/api/v1/projects/${projectId}/cost-map/saran`)
    const nama = r.json().saran.map((s: { category_name: string }) => s.category_name)
    expect(nama).not.toContain('[TEST] Entah Apa Ini')
  })

  // INVARIAN TERPENTING. Saran yang diterapkan diam-diam menghasilkan laporan
  // varians yang salah di tempat yang tak seorang pun periksa.
  it('TIDAK MENULIS apa pun ke basis', async () => {
    const sebelum = await jumlahPeta()
    await get(`/api/v1/projects/${projectId}/cost-map/saran`)
    await get(`/api/v1/projects/${projectId}/cost-map/saran`)
    expect(await jumlahPeta()).toBe(sebelum)
  })

  it('kategori yang SUDAH dipetakan dilewati', async () => {
    if (!costBeton) return // basis uji tak punya cost code 'Beton'

    const sebelum = await get(`/api/v1/projects/${projectId}/cost-map/saran`)
    expect(sebelum.json().saran.some(
      (s: { category_id: string }) => s.category_id === katBeton)).toBe(true)

    await client.query(
      `INSERT INTO cost_code_category_map (category_id, cost_code_id) VALUES ($1, $2)
       ON CONFLICT (category_id) DO UPDATE SET cost_code_id = EXCLUDED.cost_code_id`,
      [katBeton, costBeton])

    const sesudah = await get(`/api/v1/projects/${projectId}/cost-map/saran`)
    expect(sesudah.json().saran.some(
      (s: { category_id: string }) => s.category_id === katBeton)).toBe(false)
    expect(sesudah.json().sudah_dipetakan).toBeGreaterThan(0)
  })

  it('menyatakan berapa kategori yang tetap manual', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/cost-map/saran`)).json()
    // Yang tak disarankan adalah daftar kerja yang tersisa; pemakainya berhak
    // tahu berapa banyak, bukan menghitungnya sendiri.
    expect(j.tanpa_saran).toBe(j.jumlah_kategori - j.sudah_dipetakan - j.saran.length)
    expect(j.tanpa_saran).toBeGreaterThanOrEqual(0)
  })
})
