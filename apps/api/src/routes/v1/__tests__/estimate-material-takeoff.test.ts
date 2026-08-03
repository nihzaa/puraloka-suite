import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import estimateVersionRoutes from '../estimate-versions.js'

// CECEP Langkah 6 build-order — GET /estimate-versions/:id/material-takeoff (D2):
// dua item BEDA assembly, SAMA resource (Semen) -> SATU baris teragregasi, dgn
// drill-down 2 entri. Item lump-sum (assembly_id NULL) TIDAK ikut agregasi.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let versionId: string
let costCodeId: string
let semenId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM estimate_items WHERE estimate_version_id IN
      (SELECT ev.id FROM estimate_versions ev JOIN scenarios s ON s.id=ev.scenario_id
       JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-MTO] Proyek')`)
    await client.query(`DELETE FROM estimate_versions WHERE scenario_id IN
      (SELECT s.id FROM scenarios s JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-MTO] Proyek')`)
    await client.query(`DELETE FROM scenarios WHERE project_id IN
      (SELECT id FROM projects WHERE name = '[TEST-MTO] Proyek')`)
    await client.query(`DELETE FROM projects WHERE name = '[TEST-MTO] Proyek'`)
    await client.query(`DELETE FROM clients WHERE contact_person = '[TEST-MTO] Klien'`)
    await client.query(`DELETE FROM assembly_components WHERE assembly_id IN
      (SELECT id FROM assemblies WHERE code LIKE '[TEST-MTO]%')`)
    await client.query(`DELETE FROM assemblies WHERE code LIKE '[TEST-MTO]%'`)
    // Entry harganya dihapus DULU: `session_replication_role='replica'`
    // mematikan FK cascade, jadi menghapus `resources` meninggalkan
    // `price_book_entries` sebagai yatim yang menunjuk resource tak ada.
    // 151 baris menumpuk sebelum ketahuan (2026-08-02) — dan tabel itu
    // dibaca SETIAP perhitungan RAB.
    await client.query(`DELETE FROM price_book_entries
      WHERE resource_id IN (SELECT id FROM resources WHERE code LIKE 'TEST-MTO-%')`)
    await client.query(`DELETE FROM resources WHERE code LIKE 'TEST-MTO-%'`)
    await client.query(`DELETE FROM cost_codes WHERE code = '[TEST-MTO]CC'`)
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

let companyId: string

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1`)
  adminUserId = u[0].id

  const { rows: cc } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('[TEST-MTO]CC', '[TEST] MTO', $1) RETURNING id`,
    [adminUserId])
  costCodeId = cc[0].id

  const { rows: semen } = await client.query(
    `INSERT INTO resources (code, name, category, unit_code, created_by)
     VALUES ('TEST-MTO-SEMEN', '[TEST] Semen', 'material', 'kg', $1) RETURNING id`, [adminUserId])
  semenId = semen[0].id
  const { rows: bata } = await client.query(
    `INSERT INTO resources (code, name, category, unit_code, created_by)
     VALUES ('TEST-MTO-BATA', '[TEST] Bata', 'material', 'buah', $1) RETURNING id`, [adminUserId])

  // T3/T4: assembly source='company' WAJIB bertuan (CHECK
  // assemblies_source_company_konsisten, migrasi 127). Company diambil dari DB.
  const { rows: co } = await client.query(`SELECT id FROM companies ORDER BY created_at LIMIT 1`)
  companyId = co[0].id

  // Assembly A: Kolom (pakai Semen k=43.5) — Assembly B: Plesteran (pakai Semen k=7.776 + Bata k=10)
  const { rows: asmA } = await client.query(
    `INSERT INTO assemblies (code, name, cost_code_id, source, version_number, waste_factor,
                             sequence, output_unit_code, created_by, company_id)
     VALUES ('[TEST-MTO]KOLOM', '[TEST] Kolom', $1, 'company', 1, 0, '[]'::jsonb, 'm3', $2, $3)
     RETURNING id`, [costCodeId, adminUserId, companyId])
  await client.query(
    `INSERT INTO assembly_components (assembly_id, resource_id, coefficient, sort_order)
     VALUES ($1, $2, 43.5, 0)`, [asmA[0].id, semenId])
  await client.query(`UPDATE assemblies SET status='active' WHERE id=$1`, [asmA[0].id])

  const { rows: asmB } = await client.query(
    `INSERT INTO assemblies (code, name, cost_code_id, source, version_number, waste_factor,
                             sequence, output_unit_code, created_by, company_id)
     VALUES ('[TEST-MTO]PLESTER', '[TEST] Plesteran', $1, 'company', 1, 0, '[]'::jsonb, 'm2', $2, $3)
     RETURNING id`, [costCodeId, adminUserId, companyId])
  await client.query(
    `INSERT INTO assembly_components (assembly_id, resource_id, coefficient, sort_order)
     VALUES ($1, $2, 7.776, 0), ($1, $3, 10, 1)`, [asmB[0].id, semenId, bata[0].id])
  await client.query(`UPDATE assemblies SET status='active' WHERE id=$1`, [asmB[0].id])

  const { rows: clnt } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by) VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), '[TEST-MTO] Klien', '08', $1) RETURNING id`,
    [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), $1, $2, '[TEST-MTO] Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [clnt[0].id, adminUserId])
  const { rows: sc } = await client.query(
    `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1, '[TEST-MTO] Skenario', $2) RETURNING id`,
    [pr[0].id, adminUserId])
  const { rows: ev } = await client.query(
    `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
     VALUES ($1, 1, 0, $2) RETURNING id`, [sc[0].id, adminUserId])
  versionId = ev[0].id

  // 2 item assembly (kolom vol=10, plesteran vol=100) + 1 item lump-sum (tak boleh ikut agregasi)
  await client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, assembly_id, quantity, amount)
     VALUES ($1, $2, $3, 10, 500000)`, [versionId, costCodeId, asmA[0].id])
  await client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, assembly_id, quantity, amount)
     VALUES ($1, $2, $3, 100, 900000)`, [versionId, costCodeId, asmB[0].id])
  await client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, assembly_id, quantity, amount)
     VALUES ($1, $2, NULL, 1, 15000000)`, [versionId, costCodeId])

  app = Fastify()
  await app.register(estimateVersionRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /estimate-versions/:id/material-takeoff — GOLDEN D2', () => {
  it('Semen dari 2 assembly berbeda -> SATU baris teragregasi + drill-down 2 entri', async () => {
    actAs(adminAuth)
    const res = await get(`/api/v1/estimate-versions/${versionId}/material-takeoff`)
    expect(res.statusCode).toBe(200)
    const materials = res.json().materials
    const semen = materials.find((m: { resourceId: string }) => m.resourceId === semenId)
    expect(semen).toBeTruthy()
    // 10x43.5 (kolom) + 100x7.776 (plesteran) = 435 + 777.6 = 1212.6
    expect(semen.qtyAhsp).toBeCloseTo(1212.6, 9)
    expect(semen.details).toHaveLength(2)
    expect(semen.category).toBe('material')
  })

  it('item lump-sum (assembly_id NULL) TIDAK ikut agregasi', async () => {
    actAs(adminAuth)
    const res = await get(`/api/v1/estimate-versions/${versionId}/material-takeoff`)
    const total = res.json().materials.reduce((s: number, m: { details: unknown[] }) => s + m.details.length, 0)
    expect(total).toBe(3) // 2 utk semen + 1 utk bata, nol dari lump-sum
  })

  it('versi tidak ditemukan → 404', async () => {
    actAs(adminAuth)
    const res = await get('/api/v1/estimate-versions/00000000-0000-0000-0000-000000000000/material-takeoff')
    expect(res.statusCode).toBe(404)
  })
})
