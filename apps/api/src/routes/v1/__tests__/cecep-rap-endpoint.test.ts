import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import rapRoutes from '../rap.js'

// CECEP langkah 10 (UI Material & RAP) — endpoint HTTP RAP, level yang belum
// pernah diuji sebelumnya (cecep-rap-pagu.test.ts hanya menguji trigger DB via
// INSERT manual ke rap_material_line/rap_labor_line, TIDAK PERNAH lewat
// POST /projects/:id/rap yang menurunkan take-off).
//
// BUG DITEMUKAN 2026-07-30 lewat verifikasi E2E Playwright (browser sungguhan,
// bukan laporan): `.viaProject('estimate_items', projectId)` dan
// `.viaProject('rap_material_line'/'rap_labor_line'/'rap_change_log',
// rap.project_id)` memakai ID yang salah — peta tenancy (tenant-map.generated)
// mendaftarkan tabel-tabel ini dengan `lewat` KHUSUS (estimate_version_id /
// rap_budget_id), bukan project_id langsung. Endpoint tetap 201/200 (gagal
// SENYAP): RAP lahir tanpa satu pun baris material, "baris_material" dilaporkan
// benar padahal insert-nya tak pernah menyentuh baris manapun.
//
// Test ini menutup celah itu — menempuh jalur HTTP penuh: buat item RAB lewat
// estimate_items nyata (assembly ber-komponen material+labor), lalu panggil
// POST /projects/:id/rap dan pastikan rap_material_line BENAR-BENAR terisi.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let projectId: string
let versionId: string
let costCodeId: string
let semenId: string
let pekerjaId: string
let companyId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const post = (url: string, payload: unknown = {}) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown = {}) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM rap_change_log WHERE rap_budget_id IN
      (SELECT id FROM rap_budget WHERE name LIKE '[TEST-RAP-EP]%')`)
    await client.query(`DELETE FROM rap_material_line WHERE rap_budget_id IN
      (SELECT id FROM rap_budget WHERE name LIKE '[TEST-RAP-EP]%')`)
    await client.query(`DELETE FROM rap_labor_line WHERE rap_budget_id IN
      (SELECT id FROM rap_budget WHERE name LIKE '[TEST-RAP-EP]%')`)
    await client.query(`DELETE FROM rap_budget WHERE name LIKE '[TEST-RAP-EP]%'`)
    await client.query(`DELETE FROM estimate_items WHERE estimate_version_id IN
      (SELECT ev.id FROM estimate_versions ev JOIN scenarios s ON s.id=ev.scenario_id
       JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-RAP-EP] Proyek')`)
    await client.query(`DELETE FROM estimate_versions WHERE scenario_id IN
      (SELECT s.id FROM scenarios s JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-RAP-EP] Proyek')`)
    await client.query(`DELETE FROM scenarios WHERE project_id IN
      (SELECT id FROM projects WHERE name = '[TEST-RAP-EP] Proyek')`)
    await client.query(`DELETE FROM projects WHERE name = '[TEST-RAP-EP] Proyek'`)
    await client.query(`DELETE FROM clients WHERE contact_person = '[TEST-RAP-EP] Klien'`)
    await client.query(`DELETE FROM assembly_components WHERE assembly_id IN
      (SELECT id FROM assemblies WHERE code LIKE '[TEST-RAP-EP]%')`)
    await client.query(`DELETE FROM assemblies WHERE code LIKE '[TEST-RAP-EP]%'`)
    // Entry harganya dihapus DULU: `session_replication_role='replica'`
    // mematikan FK cascade, jadi menghapus `resources` meninggalkan
    // `price_book_entries` sebagai yatim yang menunjuk resource tak ada.
    // 151 baris menumpuk sebelum ketahuan (2026-08-02) — dan tabel itu
    // dibaca SETIAP perhitungan RAB.
    await client.query(`DELETE FROM price_book_entries
      WHERE resource_id IN (SELECT id FROM resources WHERE code LIKE 'TEST-RAP-EP-%')`)
    await client.query(`DELETE FROM resources WHERE code LIKE 'TEST-RAP-EP-%'`)
    await client.query(`DELETE FROM cost_codes WHERE code = '[TEST-RAP-EP]CC'`)
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

  const { rows: co } = await client.query(`SELECT id FROM companies ORDER BY created_at LIMIT 1`)
  companyId = co[0].id

  const { rows: cc } = await client.query(
    `INSERT INTO cost_codes (code, name, created_by) VALUES ('[TEST-RAP-EP]CC', '[TEST] RAP Endpoint', $1) RETURNING id`,
    [adminUserId])
  costCodeId = cc[0].id

  const { rows: semen } = await client.query(
    `INSERT INTO resources (code, name, category, unit_code, created_by)
     VALUES ('TEST-RAP-EP-SEMEN', '[TEST] Semen', 'material', 'kg', $1) RETURNING id`, [adminUserId])
  semenId = semen[0].id
  const { rows: pekerja } = await client.query(
    `INSERT INTO resources (code, name, category, unit_code, created_by)
     VALUES ('TEST-RAP-EP-PEKERJA', '[TEST] Pekerja', 'labor', 'OH', $1) RETURNING id`, [adminUserId])
  pekerjaId = pekerja[0].id

  // Assembly campuran: 1 komponen material (Semen) + 1 komponen labor (Pekerja).
  // Sengaja campuran — inilah kasus yang membuktikan filter kategori='material'
  // di endpoint benar-benar memilah, bukan kebetulan ambil semua.
  const { rows: asm } = await client.query(
    `INSERT INTO assemblies (code, name, cost_code_id, source, version_number, waste_factor,
                             sequence, output_unit_code, created_by, company_id)
     VALUES ('[TEST-RAP-EP]PAS', '[TEST] Pasangan', $1, 'company', 1, 0, '[]'::jsonb, 'm2', $2, $3)
     RETURNING id`, [costCodeId, adminUserId, companyId])
  await client.query(
    `INSERT INTO assembly_components (assembly_id, resource_id, coefficient, sort_order)
     VALUES ($1, $2, 20, 0), ($1, $3, 0.5, 1)`, [asm[0].id, semenId, pekerjaId])
  await client.query(`UPDATE assemblies SET status='active' WHERE id=$1`, [asm[0].id])

  const { rows: clnt } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by) VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), '[TEST-RAP-EP] Klien', '08', $1) RETURNING id`,
    [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), $1, $2, '[TEST-RAP-EP] Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [clnt[0].id, adminUserId])
  projectId = pr[0].id
  const { rows: sc } = await client.query(
    `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1, '[TEST-RAP-EP] Skenario', $2) RETURNING id`,
    [projectId, adminUserId])
  const { rows: ev } = await client.query(
    `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
     VALUES ($1, 1, 0, $2) RETURNING id`, [sc[0].id, adminUserId])
  versionId = ev[0].id

  // Volume 5 m2 -> qty_ahsp Semen = 5 x 20 = 100 kg (labor TIDAK ikut pagu material).
  await client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, assembly_id, quantity, amount)
     VALUES ($1, $2, $3, 5, 250000)`, [versionId, costCodeId, asm[0].id])

  app = Fastify()
  await app.register(rapRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST /projects/:projectId/rap — derivasi take-off (GOLDEN, celah yang gagal senyap)', () => {
  it('rap_material_line BENAR-BENAR terisi dari estimate_items (bukan kosong senyap)', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/rap`, {
      estimate_version_id: versionId, name: '[TEST-RAP-EP] RAP Utama',
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    // Ini assertion yang HILANG sebelumnya — sebelum fix, baris_material=0
    // padahal endpoint tetap 201 (gagal senyap).
    expect(body.baris_material).toBe(1)

    const { rows } = await client.query(
      `SELECT qty_ahsp::float8 q, unit_code FROM rap_material_line WHERE rap_budget_id = $1`, [body.data.id])
    expect(rows).toHaveLength(1)
    expect(rows[0].q).toBeCloseTo(100, 9) // 5 x 20
    expect(rows[0].unit_code).toBe('kg')
  })

  it('komponen berkategori labor TIDAK ikut rap_material_line', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/rap`, {
      estimate_version_id: versionId, name: '[TEST-RAP-EP] RAP Cek Labor',
    })
    expect(res.statusCode).toBe(201)
    const { rows } = await client.query(
      `SELECT r.category FROM rap_material_line rml JOIN resources r ON r.id = rml.resource_id
       WHERE rml.rap_budget_id = $1`, [res.json().data.id])
    expect(rows.every((r: { category: string }) => r.category === 'material')).toBe(true)
  })

  it('versi estimasi bukan milik proyek ini → 400', async () => {
    actAs(adminAuth)
    const { rows: pr2 } = await client.query(
      // `company_id` diwariskan eksplisit dari proyek sumber, bukan diserahkan
      // ke fallback `fn_isi_company_id()` — fallback itu hanya mengisi bila
      // `companies` berisi TEPAT SATU baris, dan berhenti bekerja begitu ada
      // test lain (atau tenant kedua) yang membuat company. Lihat F0-14.
      `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
       SELECT company_id, client_id, pm_id, '[TEST-RAP-EP] Proyek Lain', location, start_date, end_date, created_by
       FROM projects WHERE id = $1 RETURNING id`, [projectId])
    const res = await post(`/api/v1/projects/${pr2[0].id}/rap`, { estimate_version_id: versionId })
    expect(res.statusCode).toBe(400)
    await client.query(`DELETE FROM projects WHERE id = $1`, [pr2[0].id])
  })
})

describe('GET /rap/:id — detail menampilkan baris material yang benar-benar tersimpan', () => {
  it('material + labor terbaca via viaProject(tabel, rap.id) yang benar', async () => {
    actAs(adminAuth)
    const created = await post(`/api/v1/projects/${projectId}/rap`, {
      estimate_version_id: versionId, name: '[TEST-RAP-EP] RAP Detail',
    })
    const rapId = created.json().data.id

    const res = await get(`/api/v1/rap/${rapId}`)
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Sebelum fix: selalu [] karena double .eq('rap_budget_id', ...) dgn nilai
    // beda (rap.project_id vs rap.id) saling AND, cocok nol baris.
    expect(body.material).toHaveLength(1)
    expect(body.material[0].qty_ahsp).toBeCloseTo(100, 9)
  })
})

describe('PATCH /rap/:id/material/:lineId — sesuaikan qty/harga, pagu ikut berubah', () => {
  it('supplier_price diubah -> pagu (GENERATED) ikut berubah', async () => {
    actAs(adminAuth)
    const created = await post(`/api/v1/projects/${projectId}/rap`, {
      estimate_version_id: versionId, name: '[TEST-RAP-EP] RAP Edit',
    })
    const rapId = created.json().data.id
    const detail = await get(`/api/v1/rap/${rapId}`)
    const lineId = detail.json().material[0].id

    const res = await patch(`/api/v1/rap/${rapId}/material/${lineId}`, { supplier_price: 15000 })
    expect(res.statusCode).toBe(200)
    expect(Number(res.json().data.pagu)).toBeCloseTo(100 * 15000, 6)
  })
})

describe('PATCH /rap/:id/lock — kunci pagu, baris jadi beku', () => {
  it('lock sukses lalu edit material ditolak (409)', async () => {
    actAs(adminAuth)
    const created = await post(`/api/v1/projects/${projectId}/rap`, {
      estimate_version_id: versionId, name: '[TEST-RAP-EP] RAP Lock',
    })
    const rapId = created.json().data.id
    const detail = await get(`/api/v1/rap/${rapId}`)
    const lineId = detail.json().material[0].id
    await patch(`/api/v1/rap/${rapId}/material/${lineId}`, { supplier_price: 20000 })

    const lockRes = await patch(`/api/v1/rap/${rapId}/lock`)
    expect(lockRes.statusCode).toBe(200)
    expect(lockRes.json().data.status).toBe('locked')

    const editRes = await patch(`/api/v1/rap/${rapId}/material/${lineId}`, { supplier_price: 99999 })
    expect(editRes.statusCode).toBe(409)
  })

  it('pagu nol seluruhnya -> lock ditolak (400)', async () => {
    actAs(adminAuth)
    const created = await post(`/api/v1/projects/${projectId}/rap`, {
      estimate_version_id: versionId, name: '[TEST-RAP-EP] RAP Kosong',
    })
    const rapId = created.json().data.id
    const res = await patch(`/api/v1/rap/${rapId}/lock`)
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /rap/:id/change-log — arsip murni, tak mengubah pagu tersimpan', () => {
  it('change-log tersimpan meski RAP locked; pagu tak berubah', async () => {
    actAs(adminAuth)
    const created = await post(`/api/v1/projects/${projectId}/rap`, {
      estimate_version_id: versionId, name: '[TEST-RAP-EP] RAP ChangeLog',
    })
    const rapId = created.json().data.id
    const detail = await get(`/api/v1/rap/${rapId}`)
    const lineId = detail.json().material[0].id
    await patch(`/api/v1/rap/${rapId}/material/${lineId}`, { supplier_price: 10000 })
    await patch(`/api/v1/rap/${rapId}/lock`)

    const logRes = await post(`/api/v1/rap/${rapId}/change-log`, {
      line_table: 'rap_material_line', line_id: lineId,
      field_name: 'supplier_price', old_value: '10000', new_value: '12000',
      reason: '[TEST] supplier menaikkan harga',
    })
    expect(logRes.statusCode).toBe(201)

    const listRes = await get(`/api/v1/rap/${rapId}/change-log`)
    expect(listRes.statusCode).toBe(200)
    expect(listRes.json().data).toHaveLength(1)

    const after = await get(`/api/v1/rap/${rapId}`)
    expect(Number(after.json().material[0].pagu)).toBeCloseTo(100 * 10000, 6) // TIDAK berubah jadi 12000
  })

  it('reason kosong → 400', async () => {
    actAs(adminAuth)
    const created = await post(`/api/v1/projects/${projectId}/rap`, {
      estimate_version_id: versionId, name: '[TEST-RAP-EP] RAP ChangeLog2',
    })
    const rapId = created.json().data.id
    const res = await post(`/api/v1/rap/${rapId}/change-log`, {
      line_table: 'rap_material_line', line_id: '00000000-0000-0000-0000-000000000000', reason: '   ',
    })
    expect(res.statusCode).toBe(400)
  })
})
