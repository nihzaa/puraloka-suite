import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import estimateVersionRoutes from '../estimate-versions.js'
import ahspRoutes from '../ahsp.js'

// CECEP Langkah 6 slice-2 (migration 122/123) — D3 BBS besi per-Ø · D4 katalog
// profil baja · D5 faktor kemasan.
//
// GOLDEN D3: 20 batang D16 BjTS x 11,7 m = 234 m x 1,57824 kg/m = 369,3082 kg.
// GOLDEN D4: WF 350x175x7x11 dari DAFTAR BESI = 595 kg / 12 m (ter-seed 123).

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let versionId: string
let itemId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM rebar_takeoff WHERE estimate_item_id IN
      (SELECT ei.id FROM estimate_items ei JOIN estimate_versions ev ON ev.id=ei.estimate_version_id
       JOIN scenarios s ON s.id=ev.scenario_id JOIN projects p ON p.id=s.project_id
       WHERE p.name='[TEST-D345] Proyek')`)
    await client.query(`DELETE FROM estimate_items WHERE estimate_version_id IN
      (SELECT ev.id FROM estimate_versions ev JOIN scenarios s ON s.id=ev.scenario_id
       JOIN projects p ON p.id=s.project_id WHERE p.name='[TEST-D345] Proyek')`)
    await client.query(`DELETE FROM estimate_versions WHERE scenario_id IN
      (SELECT s.id FROM scenarios s JOIN projects p ON p.id=s.project_id WHERE p.name='[TEST-D345] Proyek')`)
    await client.query(`DELETE FROM scenarios WHERE project_id IN
      (SELECT id FROM projects WHERE name='[TEST-D345] Proyek')`)
    await client.query(`DELETE FROM projects WHERE name='[TEST-D345] Proyek'`)
    await client.query(`DELETE FROM clients WHERE contact_person='[TEST-D345] Klien'`)
    await client.query(`DELETE FROM material_pack WHERE resource_id IN
      (SELECT id FROM resources WHERE code='TEST-D345-SEMEN')`)
    // Entry harganya dihapus DULU: `session_replication_role='replica'`
    // mematikan FK cascade, jadi menghapus `resources` meninggalkan
    // `price_book_entries` sebagai yatim yang menunjuk resource tak ada.
    // 151 baris menumpuk sebelum ketahuan (2026-08-02) — dan tabel itu
    // dibaca SETIAP perhitungan RAB.
    await client.query(`DELETE FROM price_book_entries
      WHERE resource_id IN (SELECT id FROM resources WHERE code='TEST-D345-SEMEN')`)
    await client.query(`DELETE FROM resources WHERE code='TEST-D345-SEMEN'`)
    await client.query(`DELETE FROM cost_codes WHERE code='[TEST-D345]CC'`)
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1`)
  adminUserId = u[0].id

  const { rows: cc } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('[TEST-D345]CC', '[TEST] Beton', $1) RETURNING id`,
    [adminUserId])
  await client.query(
    `INSERT INTO resources (code, name, category, unit_code, created_by)
     VALUES ('TEST-D345-SEMEN', '[TEST] Semen D345', 'material', 'kg', $1)`, [adminUserId])

  const { rows: clnt } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by) VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), '[TEST-D345] Klien', '08', $1) RETURNING id`,
    [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), $1, $2, '[TEST-D345] Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [clnt[0].id, adminUserId])
  const { rows: sc } = await client.query(
    `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1, '[TEST-D345] Skenario', $2) RETURNING id`,
    [pr[0].id, adminUserId])
  const { rows: ev } = await client.query(
    `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
     VALUES ($1, 1, 0, $2) RETURNING id`, [sc[0].id, adminUserId])
  versionId = ev[0].id
  const { rows: ei } = await client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount)
     VALUES ($1, $2, 1, 1000000) RETURNING id`, [versionId, cc[0].id])
  itemId = ei[0].id

  app = Fastify()
  await app.register(estimateVersionRoutes)
  await app.register(ahspRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('D3 — BBS besi per diameter (jalur geometri terpisah)', () => {
  it('GOLDEN: 20 batang D16 BjTS x 11,7 m -> 369,3082 kg (kg/m = 0,006165 x 16^2)', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/rebar`, {
      rebar_type: 'BjTS', diameter_mm: 16, bar_count: 20, length_per_bar_m: 11.7,
    })
    expect(res.statusCode).toBe(201)
    const j = res.json()
    expect(j.weightKgPerM).toBeCloseTo(1.57824, 5)
    expect(j.totalWeightKg).toBeCloseTo(369.3082, 3)
    // Tersimpan di DB (bukan cuma dihitung) — bisa diadu dgn take-off AHSP
    const { rows } = await client.query(
      `SELECT total_weight_kg, weight_kg_per_m FROM rebar_takeoff WHERE id=$1`, [j.id])
    expect(Number(rows[0].total_weight_kg)).toBeCloseTo(369.308, 2)
  })

  it('rekap per diameter: tambah D10 BjTP -> summary 2 baris, kg per-Ø benar', async () => {
    actAs(adminAuth)
    const add = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/rebar`, {
      rebar_type: 'BjTP', diameter_mm: 10, bar_count: 30, length_per_bar_m: 6,
    })
    expect(add.statusCode).toBe(201)

    const res = await get(`/api/v1/estimate-versions/${versionId}/rebar-takeoff`)
    expect(res.statusCode).toBe(200)
    const summary = res.json().summary
    expect(summary).toHaveLength(2)
    const d10 = summary.find((s: { diameterMm: number }) => s.diameterMm === 10)
    expect(d10.rebarType).toBe('BjTP')
    expect(d10.totalWeightKg).toBeCloseTo(110.97, 2) // 180 m x 0,6165
  })

  it('dobel tipe+diameter pada item sama DITOLAK 409 (constraint DB)', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/rebar`, {
      rebar_type: 'BjTS', diameter_mm: 16, bar_count: 5, length_per_bar_m: 10,
    })
    expect(res.statusCode).toBe(409)
  })

  it('input tak valid ditolak 400 (rebar_type/diameter/jumlah)', async () => {
    actAs(adminAuth)
    const bad1 = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/rebar`,
      { rebar_type: 'NGACO', diameter_mm: 16, bar_count: 1, length_per_bar_m: 1 })
    expect(bad1.statusCode).toBe(400)
    const bad2 = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/rebar`,
      { rebar_type: 'BjTS', diameter_mm: 0, bar_count: 1, length_per_bar_m: 1 })
    expect(bad2.statusCode).toBe(400)
  })
})

describe('D4 — katalog profil baja ter-seed (migration 123, sumber DAFTAR BESI)', () => {
  it('WF 350x175x7x11 ada dgn berat 595 kg / 12 m (verbatim tabel)', async () => {
    actAs(adminAuth)
    const res = await get('/api/v1/cecep/steel-profiles?type=WF&q=350x175')
    expect(res.statusCode).toBe(200)
    const wf350 = res.json().data.find((p: { designation: string }) => p.designation === '350x175x7x11')
    expect(wf350).toBeTruthy()
    expect(Number(wf350.weight_per_bar_kg)).toBe(595)
    expect(Number(wf350.standard_length_m)).toBe(12)
    expect(Number(wf350.weight_kg_per_m)).toBeCloseTo(49.5833, 3)
  })

  it('katalog memuat WF, H-beam, dan siku (L)', async () => {
    actAs(adminAuth)
    const all = await get('/api/v1/cecep/steel-profiles?limit=200')
    const types = new Set(all.json().data.map((p: { profile_type: string }) => p.profile_type))
    expect(types.has('WF')).toBe(true)
    expect(types.has('H')).toBe(true)
    expect(types.has('L')).toBe(true)
  })
})

describe('D5 — faktor kemasan (dua satuan, data eksplisit Lapis 2)', () => {
  it('daftarkan semen 50 kg/sak lalu terbaca', async () => {
    actAs(adminAuth)
    const res = await post('/api/v1/cecep/material-pack', {
      resource_code: 'TEST-D345-SEMEN', buy_unit_code: 'sak', factor: 50, note: '1 sak = 50 kg',
    })
    expect(res.statusCode).toBe(201)

    const list = await get('/api/v1/cecep/material-pack?resource=TEST-D345-SEMEN')
    expect(list.statusCode).toBe(200)
    const row = list.json().data[0]
    expect(Number(row.factor)).toBe(50)
    expect(row.buy_unit_code).toBe('sak')
    expect(row.resource.code).toBe('TEST-D345-SEMEN')
  })

  it('dobel resource+satuan DITOLAK 409', async () => {
    actAs(adminAuth)
    const res = await post('/api/v1/cecep/material-pack', {
      resource_code: 'TEST-D345-SEMEN', buy_unit_code: 'sak', factor: 40,
    })
    expect(res.statusCode).toBe(409)
  })

  it('factor <= 0 ditolak 400 (nol tebak)', async () => {
    actAs(adminAuth)
    const res = await post('/api/v1/cecep/material-pack', {
      resource_code: 'TEST-D345-SEMEN', buy_unit_code: 'ton', factor: 0,
    })
    expect(res.statusCode).toBe(400)
  })
})
