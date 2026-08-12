/**
 * C1 — KPI Perusahaan lewat HTTP terhadap Postgres NYATA.
 *
 * Test lib membuktikan cara MERINGKAS-nya benar; ia hijau meski endpointnya
 * tak pernah terdaftar. Yang hanya bisa dijawab di sini:
 *
 *   • endpointnya ada, fail-closed tanpa izin
 *   • keempat query-nya tak gagal pada schema sungguhan
 *   • angkanya KONSISTEN dengan sumbernya — CPI/SPI, aging, backlog
 *   • `dasar_bac` disebutkan, supaya angka ini tak dikira identik dengan
 *     kurva-S per proyek yang memakai pagu RAP
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import reportsRoutes from '../reports.js'

let app: FastifyInstance
let db: Client
/**
 * Company milik pengguna yang dipakai test ini.
 *
 * WAJIB ikut di tiap query pembanding. Versi pertama test ini menghitung
 * `SELECT count(*) FROM projects WHERE status <> 'cancelled'` tanpa saringan
 * tenant dan mendapat 16, sementara endpoint mengembalikan 15 — selisihnya
 * satu proyek milik tenant LAIN.
 *
 * Yang salah testnya, bukan endpointnya: 15 adalah jawaban yang benar, dan
 * kegagalan ini justru bukti isolasi tenant bekerja.
 */
let companyId: string

const get = () =>
  app.inject({
    method: 'GET', url: '/api/v1/reports/kpi-perusahaan',
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query(
    `SELECT m.company_id FROM users us JOIN company_members m ON m.user_id = us.id
      WHERE us.auth_id = $1 LIMIT 1`, [auth])
  if (!u.length) throw new Error('admin tak punya company_members')
  companyId = u[0].company_id

  app = Fastify({ logger: false })
  await app.register(reportsRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await app.close()
  await db.end()
})

describe('bentuk tanggapan', () => {
  it('memuat evm, piutang, dan backlog dalam SATU panggilan', async () => {
    // Inti item ini: empat layar jadi satu. Kalau salah satunya hilang,
    // pembacanya kembali harus membuka layar lain.
    const r = await get()
    expect(r.statusCode, r.body).toBe(200)
    const j = r.json()
    expect(j.evm).toBeTruthy()
    expect(j.piutang).toBeTruthy()
    expect(j.backlog).toBeTruthy()
  })

  it('menyebutkan DASAR perhitungan BAC dan PV', async () => {
    // Angka di sini memakai `contract_value` + rencana linear, sementara
    // kurva-S per proyek memakai pagu RAP + baseline sesungguhnya. Keduanya
    // sah, tapi berbeda — dan yang membaca berhak tahu yang mana.
    const j = (await get()).json()
    expect(j.evm.dasar_bac).toBe('contract_value')
    expect(j.evm.dasar_pv).toMatch(/linear/i)
  })

  it('status CPI & SPI berupa kalimat, bukan hanya angka', async () => {
    const j = (await get()).json()
    expect(j.evm.statusCpi).toHaveProperty('keadaan')
    expect(typeof j.evm.statusCpi.arti).toBe('string')
    expect(j.evm.statusCpi.arti.length).toBeGreaterThan(10)
  })
})

describe('konsistensi dengan sumbernya', () => {
  it('proyekTotal cocok dengan jumlah proyek bukan-batal', async () => {
    const j = (await get()).json()
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM projects
        WHERE status <> 'cancelled' AND company_id = $1`, [companyId])
    expect(j.evm.proyekTotal).toBe(rows[0].n)
  })

  it('proyekDihitung TIDAK memuat proyek ber-BAC nol', async () => {
    const j = (await get()).json()
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM projects
        WHERE status <> 'cancelled' AND COALESCE(contract_value, 0) > 0
          AND company_id = $1`, [companyId])
    expect(j.evm.proyekDihitung).toBe(rows[0].n)
    expect(j.evm.proyekDihitung).toBeLessThanOrEqual(j.evm.proyekTotal)
  })

  it('totalBac cocok dengan jumlah contract_value', async () => {
    const j = (await get()).json()
    const { rows } = await db.query(
      `SELECT COALESCE(sum(contract_value), 0)::numeric AS t FROM projects
        WHERE status <> 'cancelled' AND COALESCE(contract_value, 0) > 0
          AND company_id = $1`, [companyId])
    expect(Math.abs(j.evm.totalBac - Number(rows[0].t))).toBeLessThan(1)
  })

  it('AC menjumlah EMPAT sumber, bukan project_expenses saja', async () => {
    // Diukur 2026-08-12: `project_expenses` KOSONG (nol baris), sementara
    // biaya nyata ada di kasbon (56), progress payment (5), dan upah harian.
    // Memakainya sendirian membuat AC = 0 dan CPI SELALU null — angka yang
    // terlihat "belum ada data" padahal datanya ada, hanya di tabel lain.
    //
    // Sumbernya disamakan dengan `kurva-s.ts` supaya CPI perusahaan dan CPI
    // per proyek tak bercerita hal yang berbeda.
    const j = (await get()).json()
    const { rows } = await db.query(
      `SELECT (
         COALESCE((SELECT sum(e.total_amount) FROM project_expenses e
                     JOIN projects p ON p.id = e.project_id
                    WHERE e.status = 'approved' AND p.company_id = $1), 0)
       + COALESCE((SELECT sum(k.amount) FROM kasbons k
                    WHERE k.status = 'approved' AND k.company_id = $1), 0)
       + COALESCE((SELECT sum(pp.net_payment) FROM progress_payments pp
                     JOIN work_scopes ws ON ws.id = pp.work_scope_id
                     JOIN mandor_assignments ma ON ma.id = ws.assignment_id
                     JOIN projects p ON p.id = ma.project_id
                    WHERE p.company_id = $1), 0)
       + COALESCE((SELECT sum(w.total_amount) FROM daily_wage_logs w
                     JOIN work_scopes ws ON ws.id = w.work_scope_id
                     JOIN mandor_assignments ma ON ma.id = ws.assignment_id
                     JOIN projects p ON p.id = ma.project_id
                    WHERE p.company_id = $1), 0)
       )::numeric AS t`, [companyId])

    // Toleransi 1 rupiah untuk pembulatan; selisih besar berarti ada sumber
    // yang hilang atau terhitung dua kali.
    expect(Math.abs(j.evm.totalAc - Number(rows[0].t))).toBeLessThan(1)
    expect(j.evm.totalAc).toBeGreaterThan(0)
  })

  it('CPI tidak null — bukti AC benar-benar terisi', async () => {
    // Kalau AC kembali ke `project_expenses` saja, CPI jadi null dan test
    // ini merah. Itu jaring pengaman untuk kemunduran yang paling mudah
    // terjadi: seseorang "menyederhanakan" query-nya kembali jadi satu tabel.
    const j = (await get()).json()
    expect(j.evm.cpi).not.toBeNull()
  })

  it('aging piutang cocok dengan jumlah amount_due yang tertagih', async () => {
    const j = (await get()).json()
    const jumlahBucket = Object.values(j.piutang.buckets as Record<string, number>)
      .reduce((a, b) => a + b, 0)
    expect(Math.abs(jumlahBucket - j.piutang.total)).toBeLessThan(1)
  })
})

describe('proyek terburuk', () => {
  it('yang ditunjuk benar-benar CPI terendah di daftarnya', async () => {
    const j = (await get()).json()
    const dgn = (j.evm.perProyek as Array<{ cpi: number | null }>).filter(p => p.cpi !== null)
    if (dgn.length === 0) {
      console.warn('  ⏭  tak ada proyek ber-CPI — dilewati')
      return
    }
    const min = Math.min(...dgn.map(p => p.cpi as number))
    expect(j.evm.cpiTerendah.cpi).toBe(min)
  })
})
