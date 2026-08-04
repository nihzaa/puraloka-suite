import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import financeRoutes from '../finance.js'

// Register piutang (PETA §3 #3) — route-level:
// (a) potongan uang muka (DP recoupment) di POST /finance/invoices: hanya
//     termin_billing non-on_sign, saldo = DP TERBAYAR − sudah dipotong,
// (b) GET /finance/ar-aging bucket 30/60/90,
// (c) GET /finance/retention-register + /finance/dp-register.
// Pola rumah: fixture [TEST-AR] di schema public (dev lokal / project CI),
// route via app.inject, purge sebelum+sesudah. Migration 124 harus applied.

let app: FastifyInstance
let client: Client
let adminAuth: string
let mandorAuth: string | null
let adminUserId: string
let projectId: string
let terminDp: string, terminP2: string, terminP3: string, terminSign2: string

const DP_AMOUNT = 30_000_000

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM notifications WHERE message LIKE '%[TEST-AR]%'`)
    await client.query(`DELETE FROM invoice_line_items WHERE invoice_id IN
      (SELECT id FROM invoices WHERE project_id IN (SELECT id FROM projects WHERE name LIKE '[TEST-AR]%'))`)
    await client.query(`DELETE FROM invoices WHERE project_id IN
      (SELECT id FROM projects WHERE name LIKE '[TEST-AR]%')`)
    await client.query(`DELETE FROM termin_schedules WHERE project_id IN
      (SELECT id FROM projects WHERE name LIKE '[TEST-AR]%')`)
    await client.query(`DELETE FROM projects WHERE name LIKE '[TEST-AR]%'`)
    await client.query(`DELETE FROM clients WHERE contact_person LIKE '[TEST-AR]%'`)
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  mandorAuth = await authIdForRole(client, 'mandor')
  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.auth_id IS NOT NULL LIMIT 1`)
  adminUserId = u[0].id

  const { rows: cl } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by) VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), '[TEST-AR] Klien', '0800000001', $1) RETURNING id`,
    [adminUserId])
  // end_date lampau → estimasi jatuh tempo retensi (end_date + due_days) sudah lewat
  //
  // `progress_pct = 100` DITAMBAHKAN 2026-08-04 (gerbang IPC). Berkas ini
  // menguji DP recoupment, bukan gerbang progres — dan proyek yang menagih
  // termin progres memang proyek yang SUDAH BERJALAN. Fixture lama memakai
  // default 0, yang berarti "belum dikerjakan sama sekali": kondisi di mana
  // termin progres memang tak boleh ditagih.
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, contract_value, start_date, end_date, progress_pct, created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), $1, $2, '[TEST-AR] Proyek', 'Bandung', 100000000, '2025-06-01', '2026-01-01', 100, $2) RETURNING id`,
    [cl[0].id, adminUserId])
  projectId = pr[0].id

  // `triggerPct` DITAMBAHKAN 2026-08-04 (INTI #2 · gerbang IPC).
  //
  // Fixture lama membuat termin berlabel "Progres 50%" dengan
  // `trigger_type='on_progress'` tetapi `trigger_pct` KOSONG — dan itu lolos,
  // karena `trigger_pct` memang tak pernah dibaca siapa pun. Begitu gerbang
  // IPC dipasang, fixture ini jadi tak sah: termin bersyarat progres tanpa
  // ambang ditolak `ambang_tak_diketahui` (fail-closed).
  //
  // Yang diperbaiki fixture-nya, BUKAN gerbangnya. Data uji yang mustahil ada
  // di produksi hanya melatih kita mempercayai jalur yang tak pernah diuji.
  const mkTermin = async (
    n: number, label: string, amount: number, pct: number, trigger: string,
    dueDays: number | null = null, triggerPct: number | null = null,
  ) => {
    const { rows } = await client.query(
      `INSERT INTO termin_schedules (project_id, termin_number, label, amount, pct_of_contract, trigger_type, due_days, trigger_pct)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [projectId, n, `[TEST-AR] ${label}`, amount, pct, trigger, dueDays, triggerPct])
    return rows[0].id as string
  }
  terminDp = await mkTermin(1, 'DP', DP_AMOUNT, 30, 'on_sign')
  terminP2 = await mkTermin(2, 'Progres 50%', 40_000_000, 40, 'on_progress', null, 50)
  terminP3 = await mkTermin(3, 'Progres 100%', 25_000_000, 25, 'on_progress', null, 100)
  terminSign2 = await mkTermin(4, 'DP tahap 2', 5_000_000, 5, 'on_sign')
  await mkTermin(5, 'Retensi', 5_000_000, 5, 'on_retention', 60)

  app = Fastify()
  await app.register(financeRoutes)
  await app.ready()
  actAs(adminAuth)
}, 120_000)

afterAll(async () => {
  await purge()
  await client?.end()
  await app?.close()
})

describe('potongan uang muka di invoice progres (DP recoupment)', () => {
  it('setup: invoice DP (termin on_sign) dibuat lalu DIBAYAR penuh', async () => {
    const res = await post('/api/v1/finance/invoices', {
      project_id: projectId, invoice_type: 'termin_billing',
      termin_schedule_id: terminDp, base_amount: DP_AMOUNT,
      issued_date: '2026-06-01', due_date: '2026-06-15',
    })
    expect(res.statusCode).toBe(201)
    // Tandai lunas langsung di DB (endpoint pay = multipart, di luar scope test ini)
    await client.query(
      `UPDATE invoices SET amount_paid = total_amount, amount_due = 0, status = 'paid'
       WHERE termin_schedule_id = $1`, [terminDp])
  })

  it('NEGATIF: potongan DP di invoice non-termin → 400', async () => {
    const res = await post('/api/v1/finance/invoices', {
      project_id: projectId, invoice_type: 'commission_fee',
      commission_fee_amount: 1_000_000, dp_deduction_amount: 500_000,
      due_date: '2099-01-01',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('invoice termin')
  })

  it('NEGATIF: potongan DP pada invoice DP (termin on_sign) itu sendiri → 400', async () => {
    const res = await post('/api/v1/finance/invoices', {
      project_id: projectId, invoice_type: 'termin_billing',
      termin_schedule_id: terminSign2, base_amount: 5_000_000,
      dp_deduction_amount: 1_000_000, due_date: '2099-01-01',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('on_sign')
  })

  it('NEGATIF: potongan melebihi saldo DP terbayar → 400 + tidak ada invoice masuk', async () => {
    const res = await post('/api/v1/finance/invoices', {
      project_id: projectId, invoice_type: 'termin_billing',
      termin_schedule_id: terminP2, base_amount: 40_000_000,
      dp_deduction_amount: DP_AMOUNT + 1, due_date: '2099-01-01',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('melebihi saldo DP')
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM invoices WHERE termin_schedule_id = $1`, [terminP2])
    expect(rows[0].n).toBe(0)
  })

  it('POSITIF: invoice progres, retensi 5% + potongan DP 20jt → total benar di DB', async () => {
    const res = await post('/api/v1/finance/invoices', {
      project_id: projectId, invoice_type: 'termin_billing',
      termin_schedule_id: terminP2, base_amount: 40_000_000,
      retensi_pct: 5, retensi_amount: 2_000_000,
      dp_deduction_amount: 20_000_000, dp_deduction_pct: 50,
      issued_date: '2026-06-01', due_date: '2026-06-30',
    })
    expect(res.statusCode).toBe(201)
    const { rows } = await client.query(
      `SELECT total_amount, amount_due, dp_deduction_amount, retensi_amount
       FROM invoices WHERE termin_schedule_id = $1`, [terminP2])
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].total_amount)).toBe(18_000_000) // 40jt − 2jt retensi − 20jt DP
    expect(Number(rows[0].amount_due)).toBe(18_000_000)
    expect(Number(rows[0].dp_deduction_amount)).toBe(20_000_000)
  })

  it('NEGATIF: sisa saldo kini 10jt — minta 10jt+1 → 400 (recouped diperhitungkan)', async () => {
    const res = await post('/api/v1/finance/invoices', {
      project_id: projectId, invoice_type: 'termin_billing',
      termin_schedule_id: terminP3, base_amount: 25_000_000,
      dp_deduction_amount: 10_000_001, due_date: '2099-01-01',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('melebihi saldo DP')
  })

  it('POSITIF: sisa 10jt dipotong habis di invoice progres terakhir', async () => {
    const res = await post('/api/v1/finance/invoices', {
      project_id: projectId, invoice_type: 'termin_billing',
      termin_schedule_id: terminP3, base_amount: 25_000_000,
      dp_deduction_amount: 10_000_000,
      issued_date: '2026-01-01', due_date: '2026-02-01',
    })
    expect(res.statusCode).toBe(201)
    const { rows } = await client.query(
      `SELECT total_amount FROM invoices WHERE termin_schedule_id = $1`, [terminP3])
    expect(Number(rows[0].total_amount)).toBe(15_000_000)
  })
})

describe('GET /finance/dp-register', () => {
  it('POSITIF: DP terbayar 30jt, dipotong 30jt, sisa 0', async () => {
    const res = await get('/api/v1/finance/dp-register')
    expect(res.statusCode).toBe(200)
    const row = res.json().rows.find((r: { project: { id: string } }) => r.project.id === projectId)
    expect(row).toBeTruthy()
    expect(row.dp_billed).toBe(DP_AMOUNT)
    expect(row.dp_paid).toBe(DP_AMOUNT)
    expect(row.recouped).toBe(30_000_000)
    expect(row.remaining_to_recoup).toBe(0)
  })
})

describe('GET /finance/ar-aging — bucket 30/60/90', () => {
  it('POSITIF: invoice paid TIDAK masuk; sent masuk bucket sesuai umur', async () => {
    const res = await get(`/api/v1/finance/ar-aging?as_of=2026-07-28&project_id=${projectId}`)
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Invoice DP sudah paid → tidak ada; t2 (due 2026-06-30, 28 hari) → d1_30;
    // t3 (due 2026-02-01, 177 hari) → d90_plus
    expect(body.invoice_count).toBe(2)
    expect(body.buckets.d1_30).toBe(18_000_000)
    expect(body.buckets.d90_plus).toBe(15_000_000)
    expect(body.buckets.current).toBe(0)
    expect(body.total_outstanding).toBe(33_000_000)
    const t3row = body.rows.find((r: { bucket: string }) => r.bucket === 'd90_plus')
    expect(t3row.days_past_due).toBe(177)
    expect(t3row.project.id).toBe(projectId)
  })

  it('NEGATIF (authz): mandor tanpa finance:view:all → 403', async () => {
    if (!mandorAuth) return // skip jika dev tak punya mandor ber-auth (pola rumah)
    actAs(mandorAuth)
    const res = await get('/api/v1/finance/ar-aging')
    expect(res.statusCode).toBe(403)
    actAs(adminAuth)
  })
})

describe('GET /finance/retention-register', () => {
  it('POSITIF: ditahan 2jt, lalu pencairan 500rb → outstanding 1.5jt + estimasi jatuh tempo lewat', async () => {
    // Buat invoice pencairan retensi 500rb
    const rel = await post('/api/v1/finance/invoices', {
      project_id: projectId, invoice_type: 'retention_release',
      base_amount: 500_000, issued_date: '2026-07-01', due_date: '2026-07-15',
    })
    expect(rel.statusCode).toBe(201)

    const res = await get('/api/v1/finance/retention-register')
    expect(res.statusCode).toBe(200)
    const row = res.json().rows.find((r: { project: { id: string } }) => r.project.id === projectId)
    expect(row).toBeTruthy()
    expect(row.withheld).toBe(2_000_000)
    expect(row.released).toBe(500_000)
    expect(row.outstanding).toBe(1_500_000)
    expect(row.on_retention_termins).toHaveLength(1)
    // end_date 2026-01-01 + 60 hari = 2026-03-02 → sudah lewat hari ini
    expect(row.estimated_release_due).toBe('2026-03-02')
    expect(row.is_due_estimate).toBe(true)
  })
})
