import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import changeOrderRoutes from '../change-orders.js'

/**
 * TAGIHAN CO TERSENDIRI terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `rekapPenagihanCo()` sudah punya test murni sendiri. Yang tersisa, dan
 * semuanya menyangkut uang:
 *
 *   • CO `separate_co` yang disetujui BENAR-BENAR muncul sebagai "belum
 *     ditagih". Kalau tidak, nilainya hilang dari seluruh layar — ia tidak
 *     di `contract_value` (benar, migrasi 348) dan tidak di daftar tagihan.
 *     Pekerjaan tambah yang tak tertagih adalah kerugian paling sunyi:
 *     tak ada galat, hanya uang yang tak pernah ditagih.
 *   • CO `include_termin` DITOLAK ditagih terpisah — nilainya sudah masuk
 *     `contract_value` dan tertagih lewat IPC. Menagihnya lagi berarti
 *     pekerjaan yang sama tertagih dua kali, dan kedua angkanya "benar"
 *     menurut jalurnya masing-masing.
 *   • satu CO tak bisa ditagih DUA KALI, ditegakkan basis bukan aplikasi.
 *   • sesudah ditagih, CO-nya PINDAH dari daftar "belum ditagih" — buktinya
 *     "sudah ditagih" memang diturunkan dari invoice, bukan penanda terpisah.
 *
 * Fixture berprefiks [TEST-CO] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let db: Client
let adminAuth: string | null
let projectId: string
let coTerpisah: string
let coTermin: string
let coDraft: string

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const post = (url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  // Invoice lebih dulu: FK-nya RESTRICT, jadi CO tak bisa dihapus selama
  // tagihannya ada. Urutan terbalik menghasilkan galat yang menyesatkan.
  await db.query(`DELETE FROM invoices WHERE description LIKE '%[TEST-CO]%'
                     OR notes LIKE '[TEST-CO]%'`)
  await db.query(`DELETE FROM invoices WHERE change_order_id IN
                    (SELECT id FROM change_orders WHERE title LIKE '[TEST-CO]%')`)
  await db.query(`DELETE FROM change_orders WHERE title LIKE '[TEST-CO]%'`)
}

beforeAll(async () => {
  db = await createRlsClient()
  adminAuth = await authIdForRole(db, 'admin')
  if (!adminAuth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: adminAuth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [adminAuth])
  const { rows: co } = await db.query(
    'SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1', [u[0].id])
  const { rows: p } = await db.query(
    'SELECT id FROM projects WHERE company_id = $1 LIMIT 1', [co[0].company_id])
  if (!p.length) throw new Error('butuh satu proyek — fixture tak terbentuk')
  projectId = p[0].id

  await purge()

  // Data uji dibuat sendiri: basis dev hanya punya 2 change order dan NOL
  // yang ber-`separate_co`, jadi bergantung pada data yang kebetulan ada
  // berarti test yang diam-diam tak menguji apa pun.
  const buat = async (nomor: string, mode: string | null, status: string, nilai: number) => {
    const { rows } = await db.query(
      `INSERT INTO change_orders
         (project_id, co_number, title, status, billing_mode, total_amount_delta, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [projectId, nomor, `[TEST-CO] ${nomor}`, status, mode, nilai, u[0].id])
    return rows[0].id as string
  }

  coTerpisah = await buat('[TEST-CO]-SEP', 'separate_co', 'approved', 5_000_000)
  coTermin = await buat('[TEST-CO]-TRM', 'include_termin', 'approved', 7_000_000)
  coDraft = await buat('[TEST-CO]-DRF', 'separate_co', 'draft', 3_000_000)

  app = Fastify({ logger: false })
  await app.register(changeOrderRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  try { await purge() } finally {
    vi.restoreAllMocks()
    if (app) await app.close()
    await db.end()
  }
})

describe('GET rekap penagihan CO', () => {
  it('memisahkan nilai menurut cara tagihnya', async () => {
    const r = await get(`/api/v1/projects/${projectId}/change-orders/penagihan`)
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200)

    const b = r.json()
    // Yang disetujui masuk rekap sesuai modenya…
    expect(b.rekap.terpisah).toBeGreaterThanOrEqual(5_000_000)
    expect(b.rekap.lewatTermin).toBeGreaterThanOrEqual(7_000_000)
  })

  it('CO separate_co yang disetujui muncul sebagai BELUM DITAGIH', async () => {
    // Inti endpoint ini. Kalau daftar ini kosong, 5 juta itu tak terlihat
    // di layar mana pun di seluruh aplikasi.
    const r = await get(`/api/v1/projects/${projectId}/change-orders/penagihan`)
    const b = r.json()

    const ada = b.belum_ditagih.find((c: { id: string }) => c.id === coTerpisah)
    expect(ada, 'CO separate_co yang disetujui tak muncul — uangnya hilang dari layar')
      .toBeTruthy()
    expect(ada.nilai).toBe(5_000_000)
    expect(b.nilai_belum_ditagih).toBeGreaterThanOrEqual(5_000_000)
  })

  it('CO yang BELUM disetujui tidak ikut daftar tagih', async () => {
    const r = await get(`/api/v1/projects/${projectId}/change-orders/penagihan`)
    const b = r.json()
    expect(b.belum_ditagih.some((c: { id: string }) => c.id === coDraft),
      'CO draft ikut daftar tagih — pekerjaan yang belum disetujui bisa tertagih')
      .toBe(false)
  })

  it('CO include_termin tidak ikut daftar tagih terpisah', async () => {
    const r = await get(`/api/v1/projects/${projectId}/change-orders/penagihan`)
    const b = r.json()
    expect(b.belum_ditagih.some((c: { id: string }) => c.id === coTermin)).toBe(false)
  })
})

describe('POST terbitkan tagihan CO', () => {
  it('include_termin DITOLAK — pekerjaan sama tak boleh tertagih dua kali', async () => {
    const r = await post(`/api/v1/change-orders/${coTermin}/tagihan`)
    expect(r.statusCode, r.body.slice(0, 300)).toBe(422)
    expect(r.json().error).toMatch(/dua kali|menyatu dengan termin/i)
  })

  it('CO draft DITOLAK — hanya yang disetujui boleh ditagih', async () => {
    const r = await post(`/api/v1/change-orders/${coDraft}/tagihan`)
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/disetujui/i)
  })

  it('separate_co yang disetujui BISA ditagih, dan nilainya sama', async () => {
    const r = await post(`/api/v1/change-orders/${coTerpisah}/tagihan`)
    expect(r.statusCode, r.body.slice(0, 300)).toBe(201)

    const inv = r.json().data
    expect(Number(inv.total_amount)).toBe(5_000_000)
    expect(inv.invoice_number).toBeTruthy()

    // Benar-benar tersimpan menunjuk CO-nya — bukan hanya dijawab 201.
    const { rows } = await db.query(
      'SELECT change_order_id, invoice_type FROM invoices WHERE id = $1', [inv.id])
    expect(rows[0].change_order_id).toBe(coTerpisah)
    expect(rows[0].invoice_type).toBe('change_order_billing')
  })

  it('sesudah ditagih, CO PINDAH dari daftar belum-ditagih', async () => {
    // Membuktikan "sudah ditagih" DITURUNKAN dari ada-tidaknya invoice,
    // bukan disimpan sebagai penanda yang bisa berbeda dari kenyataan.
    const r = await get(`/api/v1/projects/${projectId}/change-orders/penagihan`)
    const b = r.json()
    expect(b.belum_ditagih.some((c: { id: string }) => c.id === coTerpisah)).toBe(false)
    expect(b.sudah_ditagih.some((t: { change_order_id: string }) => t.change_order_id === coTerpisah))
      .toBe(true)
  })

  it('menagih CO yang SAMA dua kali DITOLAK 409', async () => {
    // Ditegakkan index `invoices_satu_tagihan_per_co` (348), bukan oleh
    // pemeriksaan aplikasi — pemeriksaan aplikasi tak menahan dua penerbitan
    // yang BERSAMAAN.
    const r = await post(`/api/v1/change-orders/${coTerpisah}/tagihan`)
    expect(r.statusCode, r.body.slice(0, 300)).toBe(409)
    expect(r.json().error).toMatch(/sudah punya tagihan/i)
  })

  it('CO tak dikenal menjawab 404, bukan 500', async () => {
    const r = await post('/api/v1/change-orders/00000000-0000-0000-0000-000000000000/tagihan')
    expect(r.statusCode).toBe(404)
  })
})
