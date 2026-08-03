import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import estimateVersionRoutes from '../estimate-versions.js'

// CECEP Misi (c) — GET /estimate-versions/:id/rollup: rekap per kategori (cost
// code) + PPN. PPN pakai tarif FLAT ber-effective-date ('tax.ppn_rate', seeded
// 0.11 sejak migration 086) via getTaxRate — BUKAN model dua-angka (dpp_factor
// 11/12, PMK 131/2024) yang sengaja masih di-gate (D10, NEXT-EXEC-PREP.md §1).
//
// GOLDEN: 2 item beda cost_code (Rp1.000.000 + Rp2.000.000) -> totalBiaya
// 3.000.000 -> PPN 11% = 330.000 (flat rate, dppNum=dppDen=1 di endpoint) ->
// grandTotal 3.330.000.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let versionId: string
let ccAId: string
let ccBId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM estimate_items WHERE estimate_version_id IN
      (SELECT ev.id FROM estimate_versions ev JOIN scenarios s ON s.id=ev.scenario_id
       JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-RU] Proyek')`)
    await client.query(`DELETE FROM estimate_versions WHERE scenario_id IN
      (SELECT s.id FROM scenarios s JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-RU] Proyek')`)
    await client.query(`DELETE FROM scenarios WHERE project_id IN
      (SELECT id FROM projects WHERE name = '[TEST-RU] Proyek')`)
    await client.query(`DELETE FROM projects WHERE name = '[TEST-RU] Proyek'`)
    await client.query(`DELETE FROM clients WHERE contact_person = '[TEST-RU] Klien'`)
    await client.query(`DELETE FROM cost_codes WHERE code IN ('[TEST-RU]CC-A', '[TEST-RU]CC-B')`)
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

  const { rows: ccA } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('[TEST-RU]CC-A', '[TEST] Pekerjaan A', $1) RETURNING id`,
    [adminUserId])
  ccAId = ccA[0].id
  const { rows: ccB } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('[TEST-RU]CC-B', '[TEST] Pekerjaan B', $1) RETURNING id`,
    [adminUserId])
  ccBId = ccB[0].id

  const { rows: cl } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by) VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), '[TEST-RU] Klien', '08', $1) RETURNING id`,
    [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), $1, $2, '[TEST-RU] Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [cl[0].id, adminUserId])
  const { rows: sc } = await client.query(
    `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1, '[TEST-RU] Skenario', $2) RETURNING id`,
    [pr[0].id, adminUserId])
  const { rows: ev } = await client.query(
    `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
     VALUES ($1, 1, 0, $2) RETURNING id`, [sc[0].id, adminUserId])
  versionId = ev[0].id

  // Item langsung ke estimate_items (bypass jalur assembly×price-book — rollup
  // hanya peduli amount+cost_code, sudah dibuktikan endpoint POST /items lain).
  await client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount)
     VALUES ($1, $2, 1, 1000000)`, [versionId, ccAId])
  await client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount)
     VALUES ($1, $2, 1, 2000000)`, [versionId, ccBId])

  app = Fastify()
  await app.register(estimateVersionRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /estimate-versions/:id/rollup — GOLDEN', () => {
  it('rekap 2 kategori + PPN flat 11% + grand total', async () => {
    actAs(adminAuth)
    const res = await get(`/api/v1/estimate-versions/${versionId}/rollup`)
    expect(res.statusCode).toBe(200)
    const j = res.json()
    expect(j.groups).toHaveLength(2)
    expect(j.groups.find((g: { name: string }) => g.name.includes('CC-A')).subtotal).toBe(1000000)
    expect(j.groups.find((g: { name: string }) => g.name.includes('CC-B')).subtotal).toBe(2000000)
    expect(j.totalBiaya).toBe(3000000)
    expect(j.ppn_rate).toBeCloseTo(0.11, 6)
    expect(j.ppn).toBeCloseTo(330000, 6)
    expect(j.grandTotal).toBeCloseTo(3330000, 6)
  })

  it('versi tidak ditemukan → 404', async () => {
    actAs(adminAuth)
    const res = await get('/api/v1/estimate-versions/00000000-0000-0000-0000-000000000000/rollup')
    expect(res.statusCode).toBe(404)
  })

  it('at_date eksplisit dipakai untuk resolusi tarif effective-dated', async () => {
    actAs(adminAuth)
    const res = await get(`/api/v1/estimate-versions/${versionId}/rollup?at_date=2020-01-01`)
    expect(res.statusCode).toBe(200)
    expect(res.json().at_date).toBe('2020-01-01')
  })
})
