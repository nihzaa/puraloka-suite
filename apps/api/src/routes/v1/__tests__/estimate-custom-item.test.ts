import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import estimateVersionRoutes from '../estimate-versions.js'
import ahspRoutes from '../ahsp.js'

// CECEP Misi (d) — Item tak ada di katalog (AHSP-EDITION-BUILDER-DESIGN §2):
//   §2.3 lump-sum: item_type='lumpsum' pada POST /items — amount langsung,
//     TANPA assembly/price-book. Untuk pekerjaan bukan-beranalisa.
//   §2.2 create-company: POST /cecep/assemblies membuat analisa BARU
//     source='company', created_in_estimate_id menandai asal, AKTIF langsung
//     (dipakai sendiri, tanpa approval) — TIDAK mencemari katalog national.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let versionId: string
let costCodeId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM estimate_items WHERE estimate_version_id IN
      (SELECT ev.id FROM estimate_versions ev JOIN scenarios s ON s.id=ev.scenario_id
       JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-CI] Proyek')`)
    await client.query(`DELETE FROM estimate_versions WHERE scenario_id IN
      (SELECT s.id FROM scenarios s JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-CI] Proyek')`)
    await client.query(`DELETE FROM scenarios WHERE project_id IN
      (SELECT id FROM projects WHERE name = '[TEST-CI] Proyek')`)
    await client.query(`DELETE FROM projects WHERE name = '[TEST-CI] Proyek'`)
    await client.query(`DELETE FROM clients WHERE contact_person = '[TEST-CI] Klien'`)
    await client.query(`DELETE FROM assembly_components WHERE assembly_id IN
      (SELECT id FROM assemblies WHERE code LIKE '[TEST-CI]%')`)
    await client.query(`DELETE FROM assemblies WHERE code LIKE '[TEST-CI]%'`)
    await client.query(`DELETE FROM resources WHERE code LIKE 'TEST-CI-%'`)
    await client.query(`DELETE FROM cost_codes WHERE code = '[TEST-CI]CC'`)
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
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('[TEST-CI]CC', '[TEST] Lift/Custom', $1) RETURNING id`,
    [adminUserId])
  costCodeId = cc[0].id

  await client.query(
    `INSERT INTO resources (code, name, category, unit_code, created_by)
     VALUES ('TEST-CI-BAJA', '[TEST] Baja Custom', 'material', 'kg', $1) ON CONFLICT (code) DO NOTHING`,
    [adminUserId])

  const { rows: clnt } = await client.query(
    `INSERT INTO clients (contact_person, phone, created_by) VALUES ('[TEST-CI] Klien', '08', $1) RETURNING id`,
    [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1, $2, '[TEST-CI] Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [clnt[0].id, adminUserId])
  const { rows: sc } = await client.query(
    `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1, '[TEST-CI] Skenario', $2) RETURNING id`,
    [pr[0].id, adminUserId])
  const { rows: ev } = await client.query(
    `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
     VALUES ($1, 1, 0, $2) RETURNING id`, [sc[0].id, adminUserId])
  versionId = ev[0].id

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

describe('POST /estimate-versions/:id/items — item_type=lumpsum (§2.3)', () => {
  it('amount langsung, TANPA assembly/price-book', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/estimate-versions/${versionId}/items`, {
      item_type: 'lumpsum', cost_code_id: costCodeId, amount: 15_000_000, notes: 'Sewa lift barang 1 bulan',
    })
    expect(res.statusCode).toBe(201)
    const j = res.json()
    expect(j.item.item_type).toBe('lumpsum')
    expect(j.item.amount).toBe(15_000_000)
    expect(j.version_total).toBe(15_000_000)
    const { rows } = await client.query(
      `SELECT assembly_id, amount FROM estimate_items WHERE id=$1`, [j.item.id])
    expect(rows[0].assembly_id).toBeNull()
    expect(Number(rows[0].amount)).toBe(15_000_000)
  })

  it('tanpa amount → 400 (nol default diam-diam)', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/estimate-versions/${versionId}/items`,
      { item_type: 'lumpsum', cost_code_id: costCodeId })
    expect(res.statusCode).toBe(400)
  })

  it('tanpa cost_code_id → 400', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/estimate-versions/${versionId}/items`,
      { item_type: 'lumpsum', amount: 1000 })
    expect(res.statusCode).toBe(400)
  })

  it('item_type tak dikenal → 400', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/estimate-versions/${versionId}/items`,
      { item_type: 'ngaco', cost_code_id: costCodeId, amount: 1000 })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /cecep/assemblies — buat analisa COMPANY mid-estimasi (§2.2)', () => {
  it('lahir source=company, aktif langsung, TERTAUT created_in_estimate_id', async () => {
    actAs(adminAuth)
    const res = await post('/api/v1/cecep/assemblies', {
      code: '[TEST-CI]CUSTOM-1', name: '[TEST] Pekerjaan custom baja',
      cost_code_id: costCodeId, output_unit_code: 'kg', waste_factor: 0.05,
      components: [{ resource_code: 'TEST-CI-BAJA', coefficient: 1.1 }],
      created_in_estimate_id: versionId,
    })
    expect(res.statusCode).toBe(201)
    const j = res.json()
    expect(j.source).toBe('company')
    expect(j.status).toBe('active')

    const { rows } = await client.query(
      `SELECT source, status, created_in_estimate_id FROM assemblies WHERE id=$1`, [j.id])
    expect(rows[0].source).toBe('company')
    expect(rows[0].created_in_estimate_id).toBe(versionId)

    // TIDAK mencemari katalog national — verifikasi eksplisit
    const nat = await client.query(
      `SELECT count(*)::int n FROM assemblies WHERE id=$1 AND source='national'`, [j.id])
    expect(nat.rows[0].n).toBe(0)
  })

  it('resource_code tak dikenal → 404 fail-loud, nol tebak', async () => {
    actAs(adminAuth)
    const res = await post('/api/v1/cecep/assemblies', {
      code: '[TEST-CI]CUSTOM-BAD', name: '[TEST] X', cost_code_id: costCodeId,
      output_unit_code: 'kg', components: [{ resource_code: 'TIDAK-ADA-INI', coefficient: 1 }],
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().unknown).toContain('TIDAK-ADA-INI')
  })

  it('components kosong → 400', async () => {
    actAs(adminAuth)
    const res = await post('/api/v1/cecep/assemblies', {
      code: '[TEST-CI]EMPTY', name: '[TEST] X', cost_code_id: costCodeId,
      output_unit_code: 'kg', components: [],
    })
    expect(res.statusCode).toBe(400)
  })

  it('assembly company baru langsung dipakai POST /items (rantai penuh)', async () => {
    actAs(adminAuth)
    const created = await post('/api/v1/cecep/assemblies', {
      code: '[TEST-CI]CUSTOM-2', name: '[TEST] Dipakai langsung',
      cost_code_id: costCodeId, output_unit_code: 'kg',
      components: [{ resource_code: 'TEST-CI-BAJA', coefficient: 2 }],
      created_in_estimate_id: versionId,
    })
    expect(created.statusCode).toBe(201)

    await client.query(
      `INSERT INTO price_book_entries (resource_id, amount, effective_date, status, verified_by, verified_at, created_by)
       SELECT id, 25000, '2020-01-01', 'active', $1, now(), $1 FROM resources WHERE code='TEST-CI-BAJA'`,
      [adminUserId])

    const item = await post(`/api/v1/estimate-versions/${versionId}/items`, {
      item_type: 'assembly', assembly_id: created.json().id, quantity: 10,
      buk_fraction: 0.1, rounding: { mode: 'down', step: 100 },
    })
    expect(item.statusCode).toBe(201)
    // 2kg x Rp25000 x qty10 x 1.1 BUK = 550000, ROUNDDOWN-100 tetap 550000
    expect(item.json().hsp.hspRounded).toBe(550000)
  })
})
