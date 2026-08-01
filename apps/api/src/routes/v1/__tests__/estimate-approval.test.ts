import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import estimateVersionRoutes from '../estimate-versions.js'

// CECEP Milestone 3 — approval Estimate Version LEWAT engine ADR-007.
//
// Menguji integrasi engine (bukan hanya struktur DB): submit → approve via engine →
// approved; reject → draft. Terhadap dev `public` (handler pakai service_role, sama
// seperti approval-chains.test.ts). Entitas berprefiks [TEST] + dibersihkan.
//
// Invariant paling mahal: hanya pemegang cecep:estimate:approve yang bisa approve,
// dan status hanya jadi 'approved' setelah engine meloloskan (bukan sembarang PATCH).

let app: FastifyInstance
let client: Client
let adminAuth: string
let pmAuth: string
let adminUserId: string
let scenarioId: string
let projectId: string
let costCodeId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const req = (method: 'GET' | 'PATCH', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function newVersionWithItem(): Promise<string> {
  const { rows: v } = await client.query(
    `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
     VALUES ($1, (SELECT COALESCE(MAX(version_number),0)+1 FROM estimate_versions WHERE scenario_id=$1), 5000000, $2)
     RETURNING id`, [scenarioId, adminUserId])
  await client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount) VALUES ($1,$2,10,5000000)`,
    [v[0].id, costCodeId])
  return v[0].id
}
const versionStatus = async (id: string) =>
  (await client.query(`SELECT status FROM estimate_versions WHERE id=$1`, [id])).rows[0]?.status

async function purge() {
  // Pembersihan data test di dev: hard guard no-delete (yang benar untuk produksi)
  // memblokir DELETE Estimate Version non-draft, termasuk CASCADE dari project.
  // Untuk cleanup test, trigger dinonaktifkan HANYA di sesi ini (session_replication_
  // _role=replica) — tidak menyentuh perilaku produksi, hanya membongkar data [TEST].
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM approval_progress WHERE entity_type='estimate_version'
      AND entity_id IN (SELECT ev.id FROM estimate_versions ev JOIN scenarios s ON s.id=ev.scenario_id
      JOIN projects p ON p.id=s.project_id WHERE p.name LIKE '[TEST]%')`)
    // ⚠️ Rantai estimasi dihapus EKSPLISIT, bukan diserahkan ke CASCADE.
    //
    // `session_replication_role='replica'` di atas dipasang supaya trigger
    // penjaga tak memblokir pembongkaran — tapi ia MEMATIKAN FK cascade juga.
    // Jadi menghapus `projects` tidak menyeret `scenarios` → `estimate_versions`
    // → `estimate_items`; semuanya tertinggal sebagai yatim yang menunjuk baris
    // yang tak ada. Komentar di atas menyebut "termasuk CASCADE dari project",
    // dan itu justru yang dinonaktifkan — niat dan efeknya bertolak belakang.
    //
    // Bug yang sama persis menumpuk 913 baris di `lessons_learned_records`
    // sebelum ketahuan (2026-08-02). Urutan penting: anak dulu, induk terakhir.
    await client.query(`DELETE FROM estimate_items WHERE estimate_version_id IN
      (SELECT ev.id FROM estimate_versions ev JOIN scenarios s ON s.id=ev.scenario_id
       JOIN projects p ON p.id=s.project_id WHERE p.name LIKE '[TEST]%')`)
    await client.query(`DELETE FROM estimate_versions WHERE scenario_id IN
      (SELECT s.id FROM scenarios s JOIN projects p ON p.id=s.project_id WHERE p.name LIKE '[TEST]%')`)
    await client.query(`DELETE FROM scenarios WHERE project_id IN
      (SELECT id FROM projects WHERE name LIKE '[TEST]%')`)
    await client.query(`DELETE FROM projects WHERE name LIKE '[TEST]%'`)
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(estimateVersionRoutes)
  await app.ready()

  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) ?? ''
  pmAuth = (await authIdForRole(client, 'pm')) ?? ''
  const { rows: au } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1`)
  adminUserId = au[0].id

  await purge()
  const { rows: cl } = await client.query(`SELECT id FROM clients LIMIT 1`)
  const { rows: pr } = await client.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ($1,$2,'[TEST] Estimasi Approval','Bandung',CURRENT_DATE,CURRENT_DATE+30,$2) RETURNING id`,
    [cl[0].id, adminUserId])
  projectId = pr[0].id
  const { rows: sc } = await client.query(
    `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1,'[TEST] Skenario',$2) RETURNING id`,
    [projectId, adminUserId])
  scenarioId = sc[0].id
  const { rows: cc } = await client.query(`SELECT id FROM cost_codes LIMIT 1`)
  if (!cc[0]) {
    const { rows: ins } = await client.query(
      `INSERT INTO cost_codes (code, name, created_by) VALUES ('CC-ESTAPP-TEST','x',$1) RETURNING id`, [adminUserId])
    costCodeId = ins[0].id
  } else costCodeId = cc[0].id
}, 90_000)

afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => { await purge(); await app.close(); await client.end() })

describe('RAB/BOQ read-model — angka dari DB nyata cocok hitungan manual', () => {
  it('GET /rab: grand total = jumlah amount item yang di-seed', async () => {
    // Seed 3 item bernilai TAHU di satu version, lewat DB langsung (bypass API).
    const { rows: v } = await client.query(
      `INSERT INTO estimate_versions (scenario_id, version_number, created_by)
       VALUES ($1,(SELECT COALESCE(MAX(version_number),0)+1 FROM estimate_versions WHERE scenario_id=$1),$2) RETURNING id`,
      [scenarioId, adminUserId])
    const vid = v[0].id
    for (const amt of [1_000_000, 2_500_000, 500_000]) {
      await client.query(
        `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount) VALUES ($1,$2,1,$3)`,
        [vid, costCodeId, amt])
    }
    actAs(adminAuth)
    const r = await req('GET', `/api/v1/estimate-versions/${vid}/rab`)
    expect(r.statusCode, r.body).toBe(200)
    const body = JSON.parse(r.body)
    // MANUAL: 1.000.000 + 2.500.000 + 500.000 = 4.000.000
    expect(body.grand_total).toBe(4_000_000)
    // subtotal = grand total (semua item CBS null → satu grup)
    expect(body.groups.reduce((s: number, g: { subtotal: number }) => s + g.subtotal, 0)).toBe(4_000_000)
  }, 30_000)

  it('GET /cashflow-forecast: Σ pencairan = total_amount version (dari DB nyata)', async () => {
    const { rows: v } = await client.query(
      `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
       VALUES ($1,(SELECT COALESCE(MAX(version_number),0)+1 FROM estimate_versions WHERE scenario_id=$1),12000000,$2) RETURNING id`,
      [scenarioId, adminUserId])
    actAs(adminAuth)
    const r = await req('GET', `/api/v1/estimate-versions/${v[0].id}/cashflow-forecast?periods=6`)
    expect(r.statusCode, r.body).toBe(200)
    const body = JSON.parse(r.body)
    expect(body.forecast).toHaveLength(6)
    const sum = body.forecast.reduce((s: number, p: { disbursement: number }) => s + p.disbursement, 0)
    expect(sum).toBeCloseTo(12_000_000, 2) // Σ = baseline persis (bukan 99,4%)
  }, 30_000)

  it('GET /boq: kuantitas per cost code, response tak memuat amount', async () => {
    const { rows: v } = await client.query(
      `INSERT INTO estimate_versions (scenario_id, version_number, created_by)
       VALUES ($1,(SELECT COALESCE(MAX(version_number),0)+1 FROM estimate_versions WHERE scenario_id=$1),$2) RETURNING id`,
      [scenarioId, adminUserId])
    const vid = v[0].id
    await client.query(
      `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount) VALUES ($1,$2,7,9999999)`,
      [vid, costCodeId])
    actAs(adminAuth)
    const r = await req('GET', `/api/v1/estimate-versions/${vid}/boq`)
    expect(r.statusCode).toBe(200)
    const body = JSON.parse(r.body)
    expect(body.lines[0].quantity).toBe(7)
    expect(r.body).not.toContain('9999999') // harga tak bocor ke BOQ
  }, 30_000)
})

describe('Submit — draft → under_review', () => {
  it('admin submit estimasi ber-item → under_review', async () => {
    const v = await newVersionWithItem()
    actAs(adminAuth)
    const r = await req('PATCH', `/api/v1/estimate-versions/${v}/submit`)
    expect(r.statusCode, r.body).toBe(200)
    expect(await versionStatus(v)).toBe('under_review')
  }, 30_000)

  it('estimasi kosong tak bisa di-submit', async () => {
    const { rows: v } = await client.query(
      `INSERT INTO estimate_versions (scenario_id, version_number, created_by)
       VALUES ($1,(SELECT COALESCE(MAX(version_number),0)+1 FROM estimate_versions WHERE scenario_id=$1),$2) RETURNING id`,
      [scenarioId, adminUserId])
    actAs(adminAuth)
    const r = await req('PATCH', `/api/v1/estimate-versions/${v[0].id}/submit`)
    expect(r.statusCode).toBe(400)
    expect(JSON.parse(r.body).error).toMatch(/kosong/i)
  }, 30_000)
})

describe('Approve — via engine (hanya pemegang capability)', () => {
  it('admin (punya cecep:estimate:approve) approve → approved', async () => {
    const v = await newVersionWithItem()
    actAs(adminAuth)
    await req('PATCH', `/api/v1/estimate-versions/${v}/submit`)
    actAs(adminAuth)
    const r = await req('PATCH', `/api/v1/estimate-versions/${v}/approve`)
    expect(r.statusCode, r.body).toBe(200)
    expect(JSON.parse(r.body).status).toBe('approved')
    expect(await versionStatus(v)).toBe('approved')
  }, 30_000)

  it('NEGATIF: pm (tanpa cecep:estimate:approve) DITOLAK 403', async () => {
    const v = await newVersionWithItem()
    actAs(adminAuth)
    await req('PATCH', `/api/v1/estimate-versions/${v}/submit`)
    actAs(pmAuth)
    const r = await req('PATCH', `/api/v1/estimate-versions/${v}/approve`)
    expect(r.statusCode).toBe(403)
    expect(await versionStatus(v), 'status tak berubah saat ditolak').toBe('under_review')
  }, 30_000)

  it('approve estimasi yang belum under_review → 400', async () => {
    const v = await newVersionWithItem() // masih draft
    actAs(adminAuth)
    const r = await req('PATCH', `/api/v1/estimate-versions/${v}/approve`)
    expect(r.statusCode).toBe(400)
  }, 30_000)
})

describe('Berjenjang (2 level) — endpoint pending → final via engine', () => {
  // Tambah level 2 sementara ke rantai estimate_version (permission yang admin juga
  // punya → yang diuji MEKANIKA penahapan endpoint, bukan pemisahan orang).
  // Membuktikan: approve level 1 pada rantai 2-level → status TETAP under_review
  // (pending), baru approve level 2 → approved. Ini yang tak tertangkap uji 1-level.
  let level2Id: string
  beforeAll(async () => {
    // Self-healing: rantai seed 'estimate_version' hanya 1 level; level ≥2 = residu
    // run sebelumnya yang mati sebelum afterAll. Bersihkan dulu supaya INSERT tak
    // kena "duplicate key (chain_id, level)". (CI juga di-serialkan — lihat ci.yml.)
    await client.query(
      `DELETE FROM approval_steps WHERE level >= 2 AND chain_id IN
        (SELECT id FROM approval_chains WHERE entity_type='estimate_version')`)
    const { rows } = await client.query(
      `INSERT INTO approval_steps (chain_id, level, required_permission, label)
       SELECT id, 2, 'settings:finance:manage', '[TEST] L2' FROM approval_chains
        WHERE entity_type='estimate_version' RETURNING id`)
    level2Id = rows[0].id
  })
  afterAll(async () => {
    if (level2Id) await client.query(`DELETE FROM approval_steps WHERE id=$1`, [level2Id])
  })

  it('approve level 1 → pending_next_level, status TETAP under_review', async () => {
    const v = await newVersionWithItem()
    actAs(adminAuth)
    await req('PATCH', `/api/v1/estimate-versions/${v}/submit`)
    actAs(adminAuth)
    const r = await req('PATCH', `/api/v1/estimate-versions/${v}/approve`)
    expect(r.statusCode, r.body).toBe(200)
    expect(JSON.parse(r.body).pending_next_level).toBe(true)
    expect(await versionStatus(v), 'estimasi TAK boleh approved sebelum level terakhir').toBe('under_review')

    // approve level 2 (final) → approved
    actAs(adminAuth)
    const r2 = await req('PATCH', `/api/v1/estimate-versions/${v}/approve`)
    expect(r2.statusCode, r2.body).toBe(200)
    expect(JSON.parse(r2.body).pending_next_level).toBeUndefined()
    expect(await versionStatus(v)).toBe('approved')
  }, 60_000)
})

describe('Reject — under_review → draft (dan item bisa diedit lagi)', () => {
  it('admin reject → draft, jejak approval bersih', async () => {
    const v = await newVersionWithItem()
    actAs(adminAuth)
    await req('PATCH', `/api/v1/estimate-versions/${v}/submit`)
    actAs(adminAuth)
    const r = await req('PATCH', `/api/v1/estimate-versions/${v}/reject`, { reason: 'perlu revisi' })
    expect(r.statusCode, r.body).toBe(200)
    expect(await versionStatus(v)).toBe('draft')
    const { rows } = await client.query(
      `SELECT COUNT(*)::int n FROM approval_progress WHERE entity_type='estimate_version' AND entity_id=$1`, [v])
    expect(rows[0].n).toBe(0)
  }, 30_000)

  it('setelah reject, item bisa diedit lagi (kembali ke draft membuka edit)', async () => {
    const v = await newVersionWithItem()
    actAs(adminAuth)
    await req('PATCH', `/api/v1/estimate-versions/${v}/submit`)
    actAs(adminAuth)
    await req('PATCH', `/api/v1/estimate-versions/${v}/reject`)
    // sekarang draft → item boleh diubah (guard migration 110 lolos)
    await client.query(
      `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount) VALUES ($1,$2,5,1000)`,
      [v, costCodeId])
    const { rows } = await client.query(
      `SELECT COUNT(*)::int n FROM estimate_items WHERE estimate_version_id=$1`, [v])
    expect(rows[0].n).toBe(2)
  }, 30_000)
})
