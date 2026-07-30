import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import kurvaSRoutes from '../kurva-s.js'

// ============================================================
// COST BASELINE untuk EVM — BAC dari pagu RAP terkunci, bukan RAB.
//
// MASALAH YANG DIPERBAIKI (CECEP/03 §6 → CECEP/52 Gap-2):
// BAC lama = `totalRABValue`, yaitu nilai JUAL ke klien — sudah mengandung
// margin/BUK. Memakainya sebagai "biaya yang dianggarkan" membuat CPI/SPI
// SISTEMATIS terlalu optimistis: pembengkakan biaya kecil tersembunyi di balik
// bantalan margin sampai margin itu habis. Angka yang dipakai founder untuk
// memutuskan jadi menyesatkan justru saat paling dibutuhkan.
//
// Yang dijaga test ini, berurutan dari yang paling merugikan bila rusak:
//   1. Proyek yang PUNYA RAP terkunci → BAC = pagu RAP (bukan RAB lagi).
//   2. Proyek yang BELUM punya RAP → angka LAMA tidak berubah sama sekali
//      (regresi: puluhan proyek berjalan tak boleh berubah CPI-nya mendadak).
//   3. Hanya RAP `locked` yang dipakai — RAP `draft` masih berubah, dan
//      baseline yang bergerak bukan baseline.
//   4. `bacSource` menyatakan basis mana yang dipakai — tanpa ini angka
//      berubah diam-diam saat RAP dikunci dan tak ada yang tahu kenapa.
// ============================================================

let app: FastifyInstance
let c: Client
let adminAuth: string
let adminUserId: string
let companyId: string
let projectId: string          // proyek fixture: punya RAB, nanti diberi RAP
let rapId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: a } }, error: null } as never)

const getKurvaS = (pid: string) =>
  app.inject({
    method: 'GET', url: `/api/v1/projects/${pid}/kurva-s`,
    headers: { authorization: 'Bearer t' },
  })

async function purge() {
  await c.query(`SET session_replication_role = 'replica'`)
  try {
    await c.query(`DELETE FROM rap_material_line WHERE rap_budget_id IN
      (SELECT id FROM rap_budget WHERE name LIKE '[TEST-BAC]%')`)
    await c.query(`DELETE FROM rap_labor_line WHERE rap_budget_id IN
      (SELECT id FROM rap_budget WHERE name LIKE '[TEST-BAC]%')`)
    await c.query(`DELETE FROM rap_budget WHERE name LIKE '[TEST-BAC]%'`)
    await c.query(`DELETE FROM estimate_items WHERE estimate_version_id IN
      (SELECT ev.id FROM estimate_versions ev JOIN scenarios s ON s.id=ev.scenario_id
       JOIN projects p ON p.id=s.project_id WHERE p.name = '[TEST-BAC] Proyek')`)
    await c.query(`DELETE FROM estimate_versions WHERE scenario_id IN
      (SELECT s.id FROM scenarios s JOIN projects p ON p.id=s.project_id
       WHERE p.name = '[TEST-BAC] Proyek')`)
    await c.query(`DELETE FROM scenarios WHERE project_id IN
      (SELECT id FROM projects WHERE name = '[TEST-BAC] Proyek')`)
    await c.query(`DELETE FROM rab_items WHERE project_id IN
      (SELECT id FROM projects WHERE name = '[TEST-BAC] Proyek')`)
    await c.query(`DELETE FROM projects WHERE name = '[TEST-BAC] Proyek'`)
    await c.query(`DELETE FROM clients WHERE contact_person = '[TEST-BAC] Klien'`)
  } finally {
    await c.query(`SET session_replication_role = 'origin'`)
  }
}

beforeAll(async () => {
  c = await createRlsClient()
  const { rows: u } = await c.query(
    `SELECT u.id, u.auth_id FROM users u JOIN roles r ON r.id=u.role_id
     WHERE r.name='admin' AND u.auth_id IS NOT NULL ORDER BY u.created_at LIMIT 1`)
  adminUserId = u[0].id
  adminAuth = u[0].auth_id
  const { rows: co } = await c.query(`SELECT id FROM companies ORDER BY created_at LIMIT 1`)
  companyId = co[0].id

  await purge()

  // Proyek fixture dengan RAB bernilai jelas: 100 juta (nilai JUAL).
  const { rows: cl } = await c.query(
    `INSERT INTO clients (contact_person, phone, created_by, company_id)
     VALUES ('[TEST-BAC] Klien', '08', $1, $2) RETURNING id`, [adminUserId, companyId])
  const { rows: pr } = await c.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date,
                           contract_value, progress_pct, created_by, company_id)
     VALUES ($1, $2, '[TEST-BAC] Proyek', 'Bandung', CURRENT_DATE - 30, CURRENT_DATE + 30,
             120000000, 50, $2, $3) RETURNING id`, [cl[0].id, adminUserId, companyId])
  projectId = pr[0].id

  // RAB level 'category' — inilah yang dijumlahkan jadi totalRABValue.
  // (rab_items tak punya created_by/company_id — tenancy diwarisi via project_id)
  await c.query(
    `INSERT INTO rab_items (project_id, level, name, weight_pct, total_price, sort_order)
     VALUES ($1, 'category', '[TEST-BAC] Pekerjaan Utama', 100, 100000000, 1)`,
    [projectId])

  app = Fastify()
  await app.register(kurvaSRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await purge()
  await app?.close()
  await c?.end()
})

describe('BAC — proyek TANPA RAP terkunci (regresi: perilaku lama dipertahankan)', () => {
  it('BAC = totalRABValue, bacSource="rab" — angka proyek berjalan tak berubah', async () => {
    actAs(adminAuth)
    const r = await getKurvaS(projectId)
    expect(r.statusCode).toBe(200)
    const evm = r.json().meta.evm
    // Inti regresi: puluhan proyek berjalan belum punya RAP. Kalau angka mereka
    // ikut berubah saat fitur ini masuk, laporan historis jadi tak konsisten.
    expect(evm.bac).toBe(100000000)
    expect(evm.bacSource).toBe('rab')
    expect(evm.paguRAP).toBe(0)
  }, 60_000)
})

describe('BAC — RAP DRAFT tidak dipakai (baseline yang bergerak bukan baseline)', () => {
  it('RAP status draft diabaikan; BAC tetap dari RAB', async () => {
    actAs(adminAuth)
    // Scenario + version dulu (rap_budget.estimate_version_id NOT NULL).
    const { rows: sc } = await c.query(
      `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1, '[TEST-BAC] Sk', $2) RETURNING id`,
      [projectId, adminUserId])
    const { rows: ev } = await c.query(
      `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
       VALUES ($1, 1, 0, $2) RETURNING id`, [sc[0].id, adminUserId])
    const { rows: rap } = await c.query(
      `INSERT INTO rap_budget (project_id, estimate_version_id, name, status, created_by, updated_by)
       VALUES ($1, $2, '[TEST-BAC] RAP', 'draft', $3, $3) RETURNING id`,
      [projectId, ev[0].id, adminUserId])
    rapId = rap[0].id
    // Pagu 70 juta — jelas berbeda dari RAB 100 juta, supaya tertukar terlihat.
    await c.query(
      `INSERT INTO rap_labor_line (rap_budget_id, description, borongan_value)
       VALUES ($1, '[TEST-BAC] Borongan', 70000000)`, [rapId])
    // Material ditambahkan SEKARANG (selagi draft) — guard DB
    // `fn_rap_line_terkunci` menolak INSERT setelah RAP locked, dan itu benar:
    // pagu yang bisa ditambah sesudah dikunci bukan komitmen. Total jadi 75jt.
    const { rows: res } = await c.query(
      `SELECT id, unit_code FROM resources WHERE category='material' AND status='active' LIMIT 1`)
    if (res.length) {
      await c.query(
        `INSERT INTO rap_material_line (rap_budget_id, resource_id, qty_ahsp, qty_adjusted,
                                        unit_code, supplier_price)
         VALUES ($1, $2, 10, 10, $3, 500000)`, [rapId, res[0].id, res[0].unit_code ?? 'kg'])
    }

    const r = await getKurvaS(projectId)
    const evm = r.json().meta.evm
    expect(evm.bacSource, 'RAP draft TIDAK boleh jadi baseline').toBe('rab')
    expect(evm.bac).toBe(100000000)
  }, 60_000)
})

describe('BAC — RAP TERKUNCI dipakai sebagai Cost Baseline (inti perbaikan)', () => {
  /** Pagu fixture: 70jt borongan + (10 × 500rb) material = 75jt — bila resource
   *  material tersedia di lingkungan ini; bila tidak, 70jt saja. */
  let paguHarapan: number

  it('setelah lock: BAC = pagu RAP (biaya), bukan lagi RAB (nilai jual)', async () => {
    actAs(adminAuth)
    await c.query(
      `UPDATE rap_budget SET status='locked', locked_at=now(), locked_by=$2 WHERE id=$1`,
      [rapId, adminUserId])

    const { rows: agg } = await c.query(
      `SELECT COALESCE((SELECT sum(pagu) FROM rap_material_line WHERE rap_budget_id=$1),0)
            + COALESCE((SELECT sum(borongan_value) FROM rap_labor_line WHERE rap_budget_id=$1),0) AS total`,
      [rapId])
    paguHarapan = Number(agg[0].total)
    expect(paguHarapan, 'fixture pagu harus > 0').toBeGreaterThan(0)

    const r = await getKurvaS(projectId)
    const evm = r.json().meta.evm
    expect(evm.bacSource).toBe('rap_locked')
    expect(evm.bac, `BAC harus = pagu RAP ${paguHarapan}, bukan RAB 100jt`).toBe(paguHarapan)
    expect(evm.paguRAP).toBe(paguHarapan)
    // Pembeda inti: BAC TIDAK boleh sama dengan nilai jual RAB.
    expect(evm.bac, 'BAC masih memakai nilai jual RAB').not.toBe(100000000)
  }, 60_000)

  it('material + labor dijumlahkan bersama (pagu utuh, bukan sebagian)', async () => {
    actAs(adminAuth)
    const { rows: m } = await c.query(
      `SELECT COALESCE(sum(pagu),0) AS t FROM rap_material_line WHERE rap_budget_id=$1`, [rapId])
    const { rows: l } = await c.query(
      `SELECT COALESCE(sum(borongan_value),0) AS t FROM rap_labor_line WHERE rap_budget_id=$1`, [rapId])
    const r = await getKurvaS(projectId)
    const evm = r.json().meta.evm
    // Bukan hanya salah satu — kedua sisi pagu harus terhitung.
    expect(evm.paguRAP).toBe(Number(m[0].t) + Number(l[0].t))
    expect(Number(l[0].t), 'fixture labor hilang').toBe(70000000)
  }, 60_000)

  it('CPI jadi LEBIH JUJUR: basis biaya lebih kecil → EV lebih kecil', async () => {
    actAs(adminAuth)
    const r = await getKurvaS(projectId)
    const evm = r.json().meta.evm
    // progress_pct fixture = 50%, jadi EV = 50% × BAC.
    // Dengan BAC=RAB(100jt) EV=50jt; dengan BAC=RAP EV lebih kecil.
    // EV yang lebih kecil pada AC yang sama = CPI lebih rendah = gambaran
    // yang tidak lagi disamarkan margin. Inilah tujuan perubahan ini.
    expect(evm.ev).toBeCloseTo(evm.bac * 0.5, 6)
    expect(evm.ev, 'EV masih memakai basis RAB — margin masih menyamarkan biaya')
      .not.toBe(100000000 * 0.5)
  }, 60_000)
})
