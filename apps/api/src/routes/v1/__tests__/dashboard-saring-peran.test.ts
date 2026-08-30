import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import dashboardRoutes from '../dashboard.js'

/*
 * ============================================================================
 * PENJAGA — dashboard tak boleh mengirim angka perusahaan ke yang tak berhak
 * ============================================================================
 *
 * Sampai 2026-08-29 rute `/api/v1/dashboard` hanya ber-`authenticate`. Siapa
 * pun yang login menerima nilai kontrak, kas masuk, piutang, proyeksi kas, dan
 * ringkasan pajak SELURUH perusahaan.
 *
 * Yang menahannya cuma middleware Next.js, yang melarang PM dan mandor membuka
 * `/dashboard`. Tapi middleware menjaga HALAMAN — rute ini bisa dipanggil
 * langsung dengan token siapa pun yang punya akun, dan akan menjawab.
 *
 * ── Kenapa memeriksa KETIADAAN kunci, bukan nilainya nol
 *
 * Yang tak berhak tak menerima kuncinya sama sekali. Nol berarti "perusahaan
 * tak punya kontrak" — itu berbohong, dan grafik yang menggambarnya terlihat
 * sah. `toHaveProperty` karena itu diperiksa dengan `not`, bukan `toBe(0)`.
 *
 * ── Kenapa test ini memakai peran SUNGGUHAN dari basis
 *
 * Bukan mock izin. Yang dijaga adalah rantai lengkapnya: peran → izin di basis
 * → `get_role_permissions` → `hasPermission` → bentuk respons. Mock akan hijau
 * meski peta izinnya sendiri yang salah — dan peta izin yang salah persis
 * cacat yang ditemukan hari ini (migrasi 526).
 */

const UANG_PERUSAHAAN = [
  'total_contract_value',
  'invoice_outstanding',
  'income_this_month',
  'net_cash_estimate',
] as const

let db: Client
let app: FastifyInstance

async function sebagaiDeret(peran: string) {
  const auth = await authIdForRole(db, peran)
  if (!auth) return null
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never
  )
  return app.inject({
    method: 'GET',
    url: '/api/v1/dashboard/deret',
    headers: { authorization: 'Bearer t' },
  })
}

async function sebagai(peran: string) {
  const auth = await authIdForRole(db, peran)
  if (!auth) return null
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never
  )
  const r = await app.inject({
    method: 'GET',
    url: '/api/v1/dashboard',
    headers: { authorization: 'Bearer t' },
  })
  return r
}

beforeAll(async () => {
  db = await createRlsClient()
  app = Fastify({ logger: false })
  await app.register(dashboardRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await app?.close()
  await db?.end()
})

describe('dashboard — angka perusahaan hanya untuk finance:view:all', () => {
  it('admin MENERIMA angka perusahaan', async () => {
    const r = await sebagai('admin')
    expect(r, 'tak ada pengguna admin — test tak menguji apa pun').not.toBeNull()
    expect(r!.statusCode).toBe(200)
    const b = r!.json()
    for (const k of UANG_PERUSAHAAN) {
      expect(b.kpis, `admin seharusnya menerima ${k}`).toHaveProperty(k)
    }
  }, 60_000)

  it('mandor TIDAK menerima angka perusahaan', async () => {
    const r = await sebagai('mandor')
    expect(r, 'tak ada pengguna mandor — test tak menguji apa pun').not.toBeNull()
    expect(r!.statusCode).toBe(200)
    const b = r!.json()
    for (const k of UANG_PERUSAHAAN) {
      expect(
        b.kpis,
        `mandor menerima ${k} — pekerja lapangan melihat keuangan perusahaan`
      ).not.toHaveProperty(k)
    }
    /* Dan blok tingkat atas yang sama beratnya. */
    expect(b, 'mandor menerima proyeksi kas perusahaan').not.toHaveProperty('cashflow_8w')
    expect(b, 'mandor menerima daftar piutang').not.toHaveProperty('outstanding_invoices')
    expect(b, 'mandor menerima ringkasan pajak').not.toHaveProperty('tax_summary')
  }, 60_000)

  it('client TIDAK menerima angka perusahaan maupun kasbon', async () => {
    const r = await sebagai('client')
    expect(r, 'tak ada pengguna client — test tak menguji apa pun').not.toBeNull()
    expect(r!.statusCode).toBe(200)
    const b = r!.json()
    for (const k of UANG_PERUSAHAAN) {
      expect(b.kpis, `KLIEN menerima ${k} — pihak luar melihat keuangan`).not.toHaveProperty(k)
    }
    /* Migrasi 526 mencabut `finance:view` dari client, jadi kasbon KARYAWAN
       pun tak boleh sampai — itu gaji orang, bukan urusan pelanggan. */
    expect(b.kpis, 'klien menerima total kasbon karyawan').not.toHaveProperty('kasbon_active_total')
    expect(b, 'klien menerima daftar kasbon karyawan').not.toHaveProperty('pending_kasbons')
    expect(b, 'klien menerima ringkasan pajak perusahaan').not.toHaveProperty('tax_summary')
  }, 60_000)

  it('/deret disaring dengan aturan yang SAMA', async () => {
    /* Deret adalah RIWAYAT dari angka yang sama. Menyaring KPI tapi
       membiarkan sparkline berarti angkanya tetap sampai lewat pintu lain. */
    const r = await sebagaiDeret('mandor')
    expect(r, 'tak ada pengguna mandor').not.toBeNull()
    expect(r!.statusCode).toBe(200)
    const d = r!.json().deret
    expect(d, 'mandor menerima riwayat nilai kontrak').not.toHaveProperty('nilai_kontrak')
    expect(d, 'mandor menerima riwayat piutang').not.toHaveProperty('invoice_belum_lunas')
    expect(d, 'mandor menerima riwayat kas masuk').not.toHaveProperty('kas_masuk')
    /* Cacah proyek tetap ada — tanpa itu sparkline pertama kosong utk semua. */
    expect(d, 'mandor kehilangan cacah proyek aktif').toHaveProperty('proyek_aktif')

    const ra = await sebagaiDeret('admin')
    expect(ra!.json().deret, 'admin kehilangan riwayat nilai kontrak').toHaveProperty('nilai_kontrak')
  }, 60_000)

  it('yang tak berhak TETAP menerima blok non-uang', async () => {
    /* Penyaringan yang terlalu keras sama merusaknya dengan yang bocor:
       dashboard kosong membuat orang mengira aplikasinya rusak. */
    const r = await sebagai('mandor')
    expect(r!.statusCode).toBe(200)
    const b = r!.json()
    expect(b.kpis, 'mandor kehilangan jumlah proyek aktif').toHaveProperty('active_projects')
    expect(b, 'mandor kehilangan daftar proyek').toHaveProperty('projects_list')
    expect(b, 'mandor kehilangan progres proyek').toHaveProperty('active_progress')
  }, 60_000)
})
