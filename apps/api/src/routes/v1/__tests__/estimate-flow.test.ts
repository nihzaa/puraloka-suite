import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import estimateVersionRoutes from '../estimate-versions.js'
import priceBookRoutes from '../price-book.js'

// CECEP M3 slice 2 — alur pembuka estimasi + price book management:
//   scenario → versi (auto-increment, MENYATAKAN edisi) → detail komposer;
//   price book draft → verified (jejak) → active (dipakai resolver) — guard DB
//   maju-saja: mundur DITOLAK 409.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let projectId: string
let scenarioId: string
let entryId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const req = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM estimate_versions WHERE scenario_id IN
      (SELECT s.id FROM scenarios s JOIN projects p ON p.id=s.project_id WHERE p.name='[TEST-FLOW] Proyek')`)
    await client.query(`DELETE FROM scenarios WHERE project_id IN
      (SELECT id FROM projects WHERE name='[TEST-FLOW] Proyek')`)
    await client.query(`DELETE FROM projects WHERE name='[TEST-FLOW] Proyek'`)
    await client.query(`DELETE FROM clients WHERE contact_person='[TEST-FLOW] Klien'`)
    await client.query(`DELETE FROM price_book_entries WHERE resource_id IN
      (SELECT id FROM resources WHERE code='TEST-FLOW-SEMEN')`)
    await client.query(`DELETE FROM resources WHERE code='TEST-FLOW-SEMEN'`)
    await client.query(`DELETE FROM ahsp_editions WHERE code='SE-TEST-FLOW'`)
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
  await client.query(
    `INSERT INTO ahsp_editions (code, name) VALUES ('SE-TEST-FLOW', '[TEST] Edisi Flow')`)
  await client.query(
    `INSERT INTO resources (code, name, category, unit_code, created_by)
     VALUES ('TEST-FLOW-SEMEN', '[TEST] Semen', 'material', 'kg', $1)`, [adminUserId])
  const { rows: cl } = await client.query(
    `INSERT INTO clients (contact_person, phone, created_by) VALUES ('[TEST-FLOW] Klien', '08', $1) RETURNING id`,
    [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1, $2, '[TEST-FLOW] Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [cl[0].id, adminUserId])
  projectId = pr[0].id

  app = Fastify()
  await app.register(estimateVersionRoutes)
  await app.register(priceBookRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('Scenario → Versi (pembuka alur estimasi)', () => {
  it('buat skenario di proyek', async () => {
    actAs(adminAuth)
    const res = await req('POST', `/api/v1/projects/${projectId}/scenarios`, { name: 'Penawaran A' })
    expect(res.statusCode).toBe(201)
    scenarioId = res.json().id
  })

  it('versi 1 lahir draft + MENYATAKAN edisi; versi 2 auto-increment', async () => {
    actAs(adminAuth)
    const v1 = await req('POST', `/api/v1/scenarios/${scenarioId}/versions`, { edition_code: 'SE-TEST-FLOW' })
    expect(v1.statusCode).toBe(201)
    expect(v1.json().version_number).toBe(1)
    const v2 = await req('POST', `/api/v1/scenarios/${scenarioId}/versions`, {})
    expect(v2.statusCode).toBe(201)
    expect(v2.json().version_number).toBe(2)

    const det = await req('GET', `/api/v1/estimate-versions/${v1.json().id}`)
    expect(det.statusCode).toBe(200)
    expect(det.json().data.edition.code).toBe('SE-TEST-FLOW')
    expect(det.json().data.items).toEqual([])
  })

  it('edisi tak dikenal → 404; skenario listing memuat versi', async () => {
    actAs(adminAuth)
    const bad = await req('POST', `/api/v1/scenarios/${scenarioId}/versions`, { edition_code: 'NGACO' })
    expect(bad.statusCode).toBe(404)
    const list = await req('GET', `/api/v1/projects/${projectId}/scenarios`)
    expect(list.statusCode).toBe(200)
    expect(list.json().data[0].versions).toHaveLength(2)
  })
})

describe('Price Book — lifecycle guard DB (maju saja)', () => {
  it('entry lahir DRAFT (versi auto)', async () => {
    actAs(adminAuth)
    const res = await req('POST', '/api/v1/cecep/price-book',
      { resource_code: 'TEST-FLOW-SEMEN', amount: 1450, effective_date: '2026-06-01', location: 'Bandung' })
    expect(res.statusCode).toBe(201)
    expect(res.json().status).toBe('draft')
    entryId = res.json().id
  })

  it('draft → verified (jejak verified_by/at) → active', async () => {
    actAs(adminAuth)
    const v = await req('PATCH', `/api/v1/cecep/price-book/${entryId}/status`, { status: 'verified' })
    expect(v.statusCode).toBe(200)
    const a = await req('PATCH', `/api/v1/cecep/price-book/${entryId}/status`, { status: 'active' })
    expect(a.statusCode).toBe(200)
    const { rows } = await client.query(
      `SELECT status, verified_by, verified_at FROM price_book_entries WHERE id=$1`, [entryId])
    expect(rows[0].status).toBe('active')
    expect(rows[0].verified_by).toBe(adminUserId)
    expect(rows[0].verified_at).not.toBeNull()
  })

  it('transisi MUNDUR (active → verified) DITOLAK oleh guard DB → 409', async () => {
    actAs(adminAuth)
    const res = await req('PATCH', `/api/v1/cecep/price-book/${entryId}/status`, { status: 'verified' })
    expect(res.statusCode).toBe(409)
  })

  it('listing filter resource + status', async () => {
    actAs(adminAuth)
    const res = await req('GET', '/api/v1/cecep/price-book?resource=TEST-FLOW-SEMEN&status=active')
    expect(res.statusCode).toBe(200)
    const rows = res.json().data
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].amount)).toBe(1450)
    expect(rows[0].resource.code).toBe('TEST-FLOW-SEMEN')
  })
})
