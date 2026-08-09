import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import keuanganIkhtisarRoutes from '../keuangan-ikhtisar.js'

/**
 * IKHTISAR KEUANGAN — endpoint terhadap Postgres NYATA.
 *
 * ── Yang dijaga di sini, dan kenapa mock tak bisa
 *
 * Endpoint ini menjumlahkan UANG lintas-proyek. Cacatnya tak pernah berupa
 * error — selalu berupa angka yang salah tetapi terlihat masuk akal:
 *
 *   • `payments` TAK punya `project_id`. Saringan tenant-nya dilakukan di
 *     memori terhadap daftar invoice milik company. Kalau saringan itu
 *     dihapus sebagai "optimasi", angka pembayaran akan mencakup company
 *     LAIN — dan tetap terlihat wajar.
 *
 *   • Nama kolomnya `amount_paid`/`paid_at`, bukan `amount`/`payment_date`.
 *     Audit pertama saya memakai `amount` dan Postgres menolaknya. Mock akan
 *     mengarang kolom yang sama salahnya.
 *
 *   • Nominal `numeric` datang sebagai STRING. Menjumlahkannya tanpa Number()
 *     menghasilkan penggabungan string ("100" + "200" = "100200") — dan
 *     angkanya masih terlihat seperti rupiah.
 *
 * ── Kenapa TIDAK memaku angka persisnya
 *
 * Basis dev ini hidup. Test yang memaku `piutang === '119595000.00'` akan
 * merah besok tanpa ada yang rusak, lalu dimatikan orang. Yang diuji
 * INVARIAN — hubungan antar angka yang harus benar berapa pun isinya.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const URL_IKHTISAR = '/api/v1/keuangan/ikhtisar'

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(keuanganIkhtisarRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await app?.close()
  await client?.end()
})

describe('GET /api/v1/keuangan/ikhtisar', () => {
  it('200 dan tak satu pun kolom yang tak ada di schema', async () => {
    const r = await get(URL_IKHTISAR)
    // Tempelkan body saat gagal: 500 di sini hampir selalu nama kolom salah,
    // dan pesan Postgres tak sampai ke klien.
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200)
  })

  it('mengirim enam cabang yang dibaca halaman', async () => {
    const j = (await get(URL_IKHTISAR)).json()
    expect(j.kpi).toBeTypeOf('object')
    expect(Array.isArray(j.bulanan)).toBe(true)
    expect(Array.isArray(j.komposisi_kasbon)).toBe(true)
    expect(Array.isArray(j.umur_piutang)).toBe(true)
    expect(Array.isArray(j.per_proyek)).toBe(true)
    expect(Array.isArray(j.invoice_tertunggak)).toBe(true)
  })

  it('SELURUH nominal dikirim sebagai string numeric, bukan float', async () => {
    // §5.4. Float membuang presisi rupiah diam-diam, dan gejalanya baru
    // muncul pada nominal besar — persis yang ditangani modul keuangan.
    const j = (await get(URL_IKHTISAR)).json()
    for (const k of ['nilai_kontrak', 'tertagih', 'terbayar', 'piutang', 'kasbon_beredar']) {
      expect(typeof j.kpi[k], `kpi.${k}`).toBe('string')
      expect(j.kpi[k], `kpi.${k}`).toMatch(/^-?\d+\.\d{2}$/)
    }
    for (const b of j.bulanan) {
      expect(b.tagih).toMatch(/^-?\d+\.\d{2}$/)
      expect(b.bayar).toMatch(/^-?\d+\.\d{2}$/)
    }
    for (const k of j.komposisi_kasbon) expect(k.nilai).toMatch(/^-?\d+\.\d{2}$/)
  })

  it('terbayar tak pernah melebihi tertagih', async () => {
    // Kalau ini gagal, `payments` sedang dijumlahkan tanpa disaring terhadap
    // invoice milik company — pembayaran tenant lain ikut terhitung.
    const { kpi } = (await get(URL_IKHTISAR)).json()
    expect(Number(kpi.terbayar)).toBeLessThanOrEqual(Number(kpi.tertagih))
  })

  it('tertagih = terbayar + piutang (invarian pembukuan)', async () => {
    const { kpi } = (await get(URL_IKHTISAR)).json()
    const selisih = Math.abs(
      Number(kpi.tertagih) - (Number(kpi.terbayar) + Number(kpi.piutang)))
    // Toleransi 1 rupiah untuk pembulatan .toFixed(2), bukan lebih.
    expect(selisih).toBeLessThanOrEqual(1)
  })

  it('umur piutang: empat ember, dan totalnya sama dengan KPI piutang', async () => {
    const j = (await get(URL_IKHTISAR)).json()
    expect(j.umur_piutang).toHaveLength(4)
    const total = j.umur_piutang.reduce(
      (s: number, u: { nilai: string }) => s + Number(u.nilai), 0)
    expect(Math.abs(total - Number(j.kpi.piutang))).toBeLessThanOrEqual(1)
  })

  it('bulanan terurut naik dan formatnya YYYY-MM', async () => {
    const { bulanan } = (await get(URL_IKHTISAR)).json()
    const b = bulanan.map((x: { bulan: string }) => x.bulan)
    expect([...b].sort()).toEqual(b)
    for (const x of b) expect(x).toMatch(/^\d{4}-\d{2}$/)
  })

  it('komposisi kasbon TIDAK memuat yang masih pending', async () => {
    // `pending` belum disetujui — memasukkannya berarti menghitung uang yang
    // mungkin tak pernah keluar. Dibandingkan langsung ke DB.
    const j = (await get(URL_IKHTISAR)).json()
    const dariApi = j.komposisi_kasbon.reduce(
      (s: number, k: { nilai: string }) => s + Number(k.nilai), 0)
    const { rows } = await client.query(
      `select coalesce(sum(amount),0)::float n from kasbons
        where status in ('approved','settled')`)
    expect(Math.abs(dariApi - Number(rows[0].n))).toBeLessThanOrEqual(1)
  })

  it('per proyek: pct_tertagih 0..100+, tak pernah NaN', async () => {
    // Proyek tanpa nilai kontrak (draft) menghasilkan 0/0 = NaN, dan "NaN%"
    // di tabel keuangan langsung terlihat pemakai pertama.
    const { per_proyek } = (await get(URL_IKHTISAR)).json()
    for (const p of per_proyek) {
      expect(Number.isFinite(p.pct_tertagih), p.nama).toBe(true)
      expect(p.pct_tertagih).toBeGreaterThanOrEqual(0)
    }
  })

  it('invoice tertunggak: semuanya benar-benar sudah lewat tempo', async () => {
    const { invoice_tertunggak } = (await get(URL_IKHTISAR)).json()
    for (const i of invoice_tertunggak) {
      expect(i.hari_lewat, i.nomor).toBeGreaterThan(0)
      expect(Number(i.sisa), i.nomor).toBeGreaterThan(0)
    }
  })

  it('invoice tertunggak terurut dari yang PALING lama', async () => {
    const { invoice_tertunggak } = (await get(URL_IKHTISAR)).json()
    const hari = invoice_tertunggak.map((i: { hari_lewat: number }) => i.hari_lewat)
    expect([...hari].sort((a, b) => b - a)).toEqual(hari)
  })

  it('jumlah invoice tertunggak cocok dengan KPI-nya', async () => {
    const j = (await get(URL_IKHTISAR)).json()
    expect(j.invoice_tertunggak.length).toBe(j.kpi.invoice_lewat_tempo)
  })

  it('menolak tanpa autentikasi', async () => {
    const r = await app.inject({ method: 'GET', url: URL_IKHTISAR })
    expect(r.statusCode).toBe(401)
  })
})
