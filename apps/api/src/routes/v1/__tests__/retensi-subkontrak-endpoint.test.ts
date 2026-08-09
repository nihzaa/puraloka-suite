import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import mandorRoutes from '../mandor.js'

// ════════════════════════════════════════════════════════════════════════════
// RETENSI SUBKONTRAK — DIUJI LEWAT ENDPOINT NYATA (INTI #3 · migrasi 183)
// ════════════════════════════════════════════════════════════════════════════
//
// `lib/retensi-subkontrak.test.ts` menguji perhitungannya sebagai fungsi murni.
// Berkas ini menguji yang berbeda: apakah perhitungan itu benar-benar
// TERPASANG di jalur uang, dan apakah angkanya benar-benar SAMPAI ke database.
//
// Bedanya menentukan. Sebelum migrasi 183, `net_payment = gross_payment` —
// retensi tak pernah dipotong sama sekali. Fungsi yang benar tapi tak dipanggil
// terlihat sama hijaunya di test unit.
//
// Yang dibuktikan di sini, terhadap Postgres nyata:
//   1. scope ber-retensi → net_payment BERKURANG, retensi_amount TERSIMPAN
//   2. scope tanpa retensi → dibayar penuh (penjaga berdaya)
//   3. konfirmasi menghitung ulang retensi + kasbon, urutannya benar
//   4. pencairan melebihi yang tertahan DITOLAK
//   5. pencairan dua kali memperhitungkan yang pertama

let app: FastifyInstance
let client: Client
let adminAuth: string
// Pemutus KEDUA — sejak TJS-A3a, pemohon tak boleh menyetujui pembayarannya
// sendiri (SoD). Test yang memakai satu identitas untuk mengajukan DAN
// mengonfirmasi memodelkan alur yang kini ditolak 403, dan penolakan itu benar:
// satu orang yang bisa mengajukan sekaligus menyetujui berarti tak ada
// pengendalian pada jalur yang mengurangi saldo kas.
let pmAuth: string
let adminUserId: string
let mandorUserId: string
let companyId: string

const PREFIX = '[TEST-RETENSI]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    const sc = `SELECT ws.id FROM work_scopes ws
                JOIN mandor_assignments ma ON ma.id = ws.assignment_id
                JOIN projects p ON p.id = ma.project_id WHERE p.name LIKE $1`
    await client.query(
      `DELETE FROM subcontract_retention_releases WHERE work_scope_id IN (${sc})`, [`${PREFIX}%`])
    await client.query(
      `DELETE FROM progress_payments WHERE work_scope_id IN (${sc})`, [`${PREFIX}%`])
    await client.query(`DELETE FROM work_scopes WHERE assignment_id IN
      (SELECT ma.id FROM mandor_assignments ma JOIN projects p ON p.id = ma.project_id
       WHERE p.name LIKE $1)`, [`${PREFIX}%`])
    await client.query(`DELETE FROM mandor_assignments WHERE project_id IN
      (SELECT id FROM projects WHERE name LIKE $1)`, [`${PREFIX}%`])
    await client.query(`DELETE FROM cash_accounts WHERE name LIKE $1`, [`${PREFIX}%`])
    await client.query(`DELETE FROM projects WHERE name LIKE $1`, [`${PREFIX}%`])
    await client.query(`DELETE FROM clients WHERE contact_person LIKE $1`, [`${PREFIX}%`])
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

/**
 * Scope progress_pct baru dengan persen retensi tertentu.
 *
 * ⚠️ PROYEK BARU tiap kali, bukan satu proyek bersama.
 *
 * `mandor_assignments` punya UNIQUE (project_id, mandor_id) — satu mandor
 * hanya boleh punya SATU penugasan per proyek. Versi pertama fixture ini
 * memakai satu proyek bersama dan gagal di test kedua dan seterusnya.
 * Constraint-nya benar; fixture-nya yang harus menyesuaikan.
 */
async function buatScope(nama: string, retensiPct: number | null): Promise<string> {
  const { rows: c } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by)
     VALUES ($1, $2, '081200000001', $3) RETURNING id`,
    [companyId, `${PREFIX} Klien ${nama}`, adminUserId])

  const { rows: p } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, contract_value,
                           start_date, end_date, progress_pct, created_by)
     VALUES ($1, $2, $3, $4, 'Bandung', 1000000000, CURRENT_DATE,
             CURRENT_DATE + INTERVAL '90 days', 50, $3) RETURNING id`,
    [companyId, c[0].id, adminUserId, `${PREFIX} Proyek ${nama}`])

  const { rows: a } = await client.query(
    `INSERT INTO mandor_assignments (project_id, mandor_id, assigned_by)
     VALUES ($1, $2, $3) RETURNING id`,
    [p[0].id, mandorUserId, adminUserId])

  const { rows: s } = await client.query(
    `INSERT INTO work_scopes (assignment_id, scope_name, payment_system,
                              borongan_value, retensi_pct, status)
     VALUES ($1, $2, 'progress_pct', 100000000, $3, 'active') RETURNING id`,
    [a[0].id, `${PREFIX} ${nama}`, retensiPct])
  return s[0].id
}

async function bacaPembayaran(id: string) {
  const { rows } = await client.query(
    `SELECT gross_payment, retensi_amount, deducted_kasbon, net_payment, status
       FROM progress_payments WHERE id = $1`, [id])
  return rows[0]
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  pmAuth = (await authIdForRole(client, 'pm')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1`)
  adminUserId = u[0].id
  const { rows: m } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='mandor' LIMIT 1`)
  mandorUserId = m[0].id

  const { rows: co } = await client.query(
    `SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1`)
  companyId = co[0].id

  // Klien & proyek dibuat PER SCOPE di `buatScope`, bukan sekali di sini —
  // alasannya (UNIQUE project_id+mandor_id) ada di komentar fungsi itu.

  app = Fastify()
  await app.register(mandorRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await purge()
  await app?.close()
  await client?.end()
})

describe('retensi DIPOTONG saat pengajuan pembayaran progres', () => {
  it('scope retensi 5%: bruto 10jt → retensi 500rb, neto 9,5jt di DATABASE', async () => {
    actAs(adminAuth)
    const scopeId = await buatScope('retensi-5', 5)

    const res = await post('/api/v1/mandor/progress-payments', {
      work_scope_id: scopeId, pct_completed: 10, gross_payment: 10_000_000,
    })
    expect(res.statusCode, `body: ${res.body.slice(0, 300)}`).toBe(201)

    const p = await bacaPembayaran(res.json().payment.id)
    expect(Number(p.retensi_amount),
      'retensi TIDAK ditahan — kontraktor menahan retensi dari owner tapi ' +
      'membayar penuh ke mandor, dan saat ada cacat tak ada uang tertahan ' +
      'untuk memaksanya kembali').toBe(500_000)
    expect(Number(p.net_payment)).toBe(9_500_000)
    expect(Number(p.gross_payment)).toBe(10_000_000)
  })

  it('PENJAGA BERDAYA: scope TANPA retensi dibayar penuh', async () => {
    // Tanpa kasus ini, "retensi terpotong" di atas bisa berarti apa saja —
    // termasuk potongan yang selalu terjadi tanpa memandang kesepakatan.
    actAs(adminAuth)
    const scopeId = await buatScope('tanpa-retensi', null)

    const res = await post('/api/v1/mandor/progress-payments', {
      work_scope_id: scopeId, pct_completed: 10, gross_payment: 10_000_000,
    })
    expect(res.statusCode).toBe(201)

    const p = await bacaPembayaran(res.json().payment.id)
    expect(Number(p.retensi_amount),
      'scope tanpa kesepakatan retensi tetap dipotong — mandor kehilangan ' +
      'uang yang tak pernah disepakati siapa pun').toBe(0)
    expect(Number(p.net_payment)).toBe(10_000_000)
  })

  it('retensi 0% eksplisit juga dibayar penuh', async () => {
    actAs(adminAuth)
    const scopeId = await buatScope('retensi-nol', 0)

    const res = await post('/api/v1/mandor/progress-payments', {
      work_scope_id: scopeId, pct_completed: 10, gross_payment: 5_000_000,
    })
    expect(res.statusCode).toBe(201)
    const p = await bacaPembayaran(res.json().payment.id)
    expect(Number(p.retensi_amount)).toBe(0)
    expect(Number(p.net_payment)).toBe(5_000_000)
  })
})

describe('konfirmasi — retensi + kasbon, urutannya menentukan', () => {
  it('bruto 10jt · retensi 5% · kasbon 2jt → neto 7,5jt', async () => {
    actAs(adminAuth)
    const scopeId = await buatScope('konfirmasi', 5)

    const buat = await post('/api/v1/mandor/progress-payments', {
      work_scope_id: scopeId, pct_completed: 10, gross_payment: 10_000_000,
    })
    const payId = buat.json().payment.id

    const { rows: acc } = await client.query(
      `INSERT INTO cash_accounts (company_id, name, type, balance, is_active, created_by)
       VALUES ($1, $2, 'main', 50000000, true, $3) RETURNING id`,
      [companyId, `${PREFIX} Kas`, adminUserId])

    // Pemutus BERBEDA dari pengaju (SoD, TJS-A3a).

    actAs(pmAuth)

    const res = await patch(`/api/v1/mandor/progress-payments/${payId}/confirm`, {
      status: 'approved', cash_account_id: acc[0].id, deducted_kasbon: 2_000_000,
    })
    expect(res.statusCode, `body: ${res.body.slice(0, 300)}`).toBe(200)

    const p = await bacaPembayaran(payId)
    expect(Number(p.retensi_amount),
      'retensi dihitung dari nilai SESUDAH kasbon — besarnya jaminan jadi ' +
      'bergantung pada UTANG mandor, bukan pada nilai pekerjaannya').toBe(500_000)
    expect(Number(p.deducted_kasbon)).toBe(2_000_000)
    expect(Number(p.net_payment)).toBe(7_500_000)
  })

  it('potongan MELEBIHI tagihan DITOLAK 422, pembayaran tetap pending', async () => {
    actAs(adminAuth)
    const scopeId = await buatScope('potongan-lebih', 5)

    const buat = await post('/api/v1/mandor/progress-payments', {
      work_scope_id: scopeId, pct_completed: 5, gross_payment: 1_000_000,
    })
    const payId = buat.json().payment.id

    const { rows: acc } = await client.query(
      `INSERT INTO cash_accounts (company_id, name, type, balance, is_active, created_by)
       VALUES ($1, $2, 'main', 50000000, true, $3) RETURNING id`,
      [companyId, `${PREFIX} Kas2`, adminUserId])

    // Pemutus BERBEDA dari pengaju (SoD, TJS-A3a).

    actAs(pmAuth)

    const res = await patch(`/api/v1/mandor/progress-payments/${payId}/confirm`, {
      status: 'approved', cash_account_id: acc[0].id, deducted_kasbon: 2_000_000,
    })

    expect(res.statusCode,
      'potongan melebihi tagihan diterima — sisa kasbon lenyap dari pembukuan ' +
      'tanpa seorang pun memutuskannya').toBe(422)

    const p = await bacaPembayaran(payId)
    expect(p.status, 'pembayaran berubah status padahal konfirmasi ditolak').toBe('pending')
  })
})

describe('register + pencairan retensi', () => {
  it('register menampilkan ditahan / dicairkan / outstanding', async () => {
    actAs(adminAuth)
    const scopeId = await buatScope('register', 10)

    const buat = await post('/api/v1/mandor/progress-payments', {
      work_scope_id: scopeId, pct_completed: 20, gross_payment: 20_000_000,
    })
    const payId = buat.json().payment.id

    const { rows: acc } = await client.query(
      `INSERT INTO cash_accounts (company_id, name, type, balance, is_active, created_by)
       VALUES ($1, $2, 'main', 90000000, true, $3) RETURNING id`,
      [companyId, `${PREFIX} Kas3`, adminUserId])
    actAs(pmAuth)
    await patch(`/api/v1/mandor/progress-payments/${payId}/confirm`, {
      status: 'approved', cash_account_id: acc[0].id,
    })

    const reg = await get('/api/v1/mandor/retensi-register')
    expect(reg.statusCode, `body: ${reg.body.slice(0, 300)}`).toBe(200)

    const baris = reg.json().scopes.find((s: any) => s.work_scope_id === scopeId)
    expect(baris, 'scope ber-retensi tidak muncul di register — retensi yang ' +
      'ditahan tak terlihat siapa pun, dan tak ada yang tahu ia harus dicairkan').toBeTruthy()
    expect(baris.ditahan).toBe(2_000_000)
    expect(baris.dicairkan).toBe(0)
    expect(baris.outstanding).toBe(2_000_000)
  })

  it('pencairan MELEBIHI yang tertahan DITOLAK', async () => {
    actAs(adminAuth)
    const scopeId = await buatScope('cair-lebih', 10)

    const buat = await post('/api/v1/mandor/progress-payments', {
      work_scope_id: scopeId, pct_completed: 10, gross_payment: 10_000_000,
    })
    const { rows: acc } = await client.query(
      `INSERT INTO cash_accounts (company_id, name, type, balance, is_active, created_by)
       VALUES ($1, $2, 'main', 90000000, true, $3) RETURNING id`,
      [companyId, `${PREFIX} Kas4`, adminUserId])
    actAs(pmAuth)
    await patch(`/api/v1/mandor/progress-payments/${buat.json().payment.id}/confirm`, {
      status: 'approved', cash_account_id: acc[0].id,
    })
    // Ditahan: 10jt × 10% = 1jt

    const res = await post('/api/v1/mandor/retensi-releases', {
      work_scope_id: scopeId, amount: 1_000_001,
    })

    expect(res.statusCode,
      'pencairan melebihi yang pernah ditahan — uang keluar dari pembukuan ' +
      'tanpa pernah masuk').toBe(422)
    expect(res.json().tersedia).toBe(1_000_000)
  })

  it('pencairan bertahap memperhitungkan yang sebelumnya', async () => {
    actAs(adminAuth)
    const scopeId = await buatScope('cair-bertahap', 10)

    const buat = await post('/api/v1/mandor/progress-payments', {
      work_scope_id: scopeId, pct_completed: 10, gross_payment: 10_000_000,
    })
    const { rows: acc } = await client.query(
      `INSERT INTO cash_accounts (company_id, name, type, balance, is_active, created_by)
       VALUES ($1, $2, 'main', 90000000, true, $3) RETURNING id`,
      [companyId, `${PREFIX} Kas5`, adminUserId])
    actAs(pmAuth)
    await patch(`/api/v1/mandor/progress-payments/${buat.json().payment.id}/confirm`, {
      status: 'approved', cash_account_id: acc[0].id,
    })

    const c1 = await post('/api/v1/mandor/retensi-releases', {
      work_scope_id: scopeId, amount: 600_000,
    })
    expect(c1.statusCode, `body: ${c1.body.slice(0, 300)}`).toBe(201)
    expect(c1.json().tersisa).toBe(400_000)

    // Sisa 400rb — minta 400.001 harus ditolak.
    const c2 = await post('/api/v1/mandor/retensi-releases', {
      work_scope_id: scopeId, amount: 400_001,
    })
    expect(c2.statusCode,
      'riwayat pencairan diabaikan — retensi yang sama bisa dicairkan ' +
      'BERKALI-KALI, dan tiap kali uang keluar sungguhan').toBe(422)

    // Sisa persis harus LOLOS — kalau tidak, retensi terakhir tak pernah cair.
    const c3 = await post('/api/v1/mandor/retensi-releases', {
      work_scope_id: scopeId, amount: 400_000,
    })
    expect(c3.statusCode).toBe(201)

    const reg = await get('/api/v1/mandor/retensi-register')
    const baris = reg.json().scopes.find((s: any) => s.work_scope_id === scopeId)
    expect(baris.dicairkan).toBe(1_000_000)
    expect(baris.outstanding).toBe(0)
  })

  it('pembayaran PENDING tidak menahan retensi — belum ada uang keluar', async () => {
    actAs(adminAuth)
    const scopeId = await buatScope('pending', 10)

    await post('/api/v1/mandor/progress-payments', {
      work_scope_id: scopeId, pct_completed: 10, gross_payment: 10_000_000,
    })
    // Sengaja TIDAK dikonfirmasi.

    const res = await post('/api/v1/mandor/retensi-releases', {
      work_scope_id: scopeId, amount: 1,
    })
    expect(res.statusCode,
      'retensi dari pembayaran yang belum disetujui ikut dihitung — register ' +
      'menunjukkan uang yang tak pernah ditahan, dan bisa dicairkan').toBe(422)
    expect(res.json().tersedia).toBe(0)
  })
})
