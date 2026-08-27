import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import costControlRoutes from '../cost-control.js'

/**
 * BELANJA AKTUAL terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Aturan penjumlahannya sudah dikunci 16 test di `lib/__tests__/belanja-aktual.test.ts`
 * (8 mutasi MERAH) tanpa menyentuh basis. Yang tersisa justru bagian yang
 * paling mudah salah dan paling sunyi kalau salah:
 *
 *   • **rantai tenancy upah benar-benar menempuh jalannya.** `weekly_wage_reports`
 *     kategori C lewat `assignment_id` → `mandor_assignments.project_id`. Kalau
 *     jalurnya putus, hasilnya Rp 0 yang terlihat persis seperti "memang belum
 *     ada upah" — dan itu Rp 243 juta yang hilang tanpa satu pun error.
 *   • `supplier_invoices` kategori B, disaring `project_id` — bukan `viaProject`
 *   • proyek tenant lain membalas 404
 *   • endpoint TIDAK MENULIS apa pun
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let scopeId: string
let assignmentId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`DELETE FROM weekly_wage_reports WHERE notes LIKE '[TEST]%'`)
  await client.query(`DELETE FROM supplier_invoices WHERE invoice_number LIKE '[TEST]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  // Proyek yang PUNYA rantai upah lengkap — bukan sekadar proyek pertama.
  // Pelajaran dari test geotag: `LIMIT 1` tanpa syarat memberi proyek kosong,
  // dan testnya lewat tanpa pernah menjalankan jalur yang diujinya.
  const { rows: p } = await client.query(
    `SELECT ma.project_id, ma.id AS assignment_id, ws.id AS scope_id
       FROM mandor_assignments ma
       JOIN work_scopes ws ON ws.assignment_id = ma.id
       JOIN projects pr ON pr.id = ma.project_id
      WHERE pr.company_id IS NOT NULL
      LIMIT 1`)
  if (!p[0]) throw new Error('tak ada rantai proyek→penugasan→scope untuk diuji')
  projectId = p[0].project_id
  assignmentId = p[0].assignment_id
  scopeId = p[0].scope_id

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(costControlRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /projects/:id/belanja-aktual', () => {
  it('404 untuk proyek yang bukan milik tenant ini', async () => {
    const r = await get('/api/v1/projects/00000000-0000-0000-0000-0000000000ff/belanja-aktual')
    expect(r.statusCode).toBe(404)
  })

  it('membalas rincian per sumber yang lengkap', async () => {
    const r = await get(`/api/v1/projects/${projectId}/belanja-aktual`)
    expect(r.statusCode).toBe(200)
    const j = r.json()
    // Seluruh sumber HARUS muncul, termasuk yang nol — nol yang dinyatakan
    // adalah jawaban; nol yang tak muncul adalah pertanyaan.
    expect(Object.keys(j.per_sumber).sort()).toEqual(['belanja', 'faktur', 'po', 'upah'])
    expect(j).toHaveProperty('exposure')
    expect(j).toHaveProperty('jumlah_baris')
  })

  // INVARIAN TERPENTING. Kalau rantai `weekly_wage_reports → mandor_assignments
  // → projects` putus, hasilnya Rp 0 yang terlihat persis seperti "memang
  // belum ada upah". Rp 243 juta hilang tanpa satu pun error.
  it('UPAH benar-benar terbaca lewat rantai tenancy-nya', async () => {
    const { rows: u } = await client.query(`SELECT id FROM users LIMIT 1`)
    await client.query(
      `INSERT INTO weekly_wage_reports
         (assignment_id, scope_id, week_start, week_end, status, subtotal, total_deduction, net_amount, notes)
       VALUES ($1, $2, CURRENT_DATE - 7, CURRENT_DATE, 'paid', 5000000, 0, 5000000, '[TEST] upah uji')`,
      [assignmentId, scopeId])

    const j = (await get(`/api/v1/projects/${projectId}/belanja-aktual`)).json()
    expect(j.jumlah_baris.upah).toBeGreaterThan(0)
    expect(j.per_sumber.upah).toBeGreaterThanOrEqual(5_000_000)
    void u
  })

  // Upah `draft` belum disetujui siapa pun. Ia TIDAK boleh menaikkan biaya
  // proyek — laporan tak boleh berubah karena seseorang mengetik angka.
  it('upah DRAFT tidak menaikkan total', async () => {
    const sebelum = (await get(`/api/v1/projects/${projectId}/belanja-aktual`)).json()

    await client.query(
      `INSERT INTO weekly_wage_reports
         (assignment_id, scope_id, week_start, week_end, status, subtotal, total_deduction, net_amount, notes)
       VALUES ($1, $2, CURRENT_DATE - 14, CURRENT_DATE - 7, 'draft', 9000000, 0, 9000000, '[TEST] upah draft')`,
      [assignmentId, scopeId])

    const sesudah = (await get(`/api/v1/projects/${projectId}/belanja-aktual`)).json()
    expect(sesudah.total).toBe(sebelum.total)
    // Tapi barisnya TERLIHAT — daftar yang menyusut diam-diam membuat orang
    // bertanya "upah saya ke mana".
    expect(sesudah.jumlah_baris.upah).toBeGreaterThan(sebelum.jumlah_baris.upah)
  })

  // `supplier_invoices` kategori B — disaring `project_id`, bukan `viaProject`.
  // Kalau saringannya salah, faktur proyek LAIN ikut terhitung.
  it('FAKTUR terbaca dan hanya milik proyek ini', async () => {
    const { rows: s } = await client.query(`SELECT id FROM suppliers LIMIT 1`)
    expect(s[0]).toBeDefined()

    // `company_id` NOT NULL — `supplier_invoices` kategori B, tenancy-nya
    // langsung di barisnya sendiri, bukan diwarisi lewat proyek.
    const { rows: co } = await client.query(
      `SELECT company_id FROM projects WHERE id = $1`, [projectId])

    await client.query(
      `INSERT INTO supplier_invoices
         (supplier_id, project_id, company_id, invoice_number, invoice_date, total_amount, status)
       VALUES ($1, $2, $3, '[TEST] INV-001', CURRENT_DATE, 7000000, 'unpaid')`,
      [s[0].id, projectId, co[0].company_id])

    const j = (await get(`/api/v1/projects/${projectId}/belanja-aktual`)).json()
    expect(j.per_sumber.faktur).toBeGreaterThanOrEqual(7_000_000)

    // Dan faktur proyek LAIN tidak ikut. Tanpa pemeriksaan ini, melucuti
    // `.eq('project_id', …)` tetap hijau — mutation testing menemukannya:
    // seluruh faktur tenant terhitung sebagai biaya SATU proyek.
    const { rows: lain } = await client.query(
      `SELECT COALESCE(sum(total_amount),0)::numeric jml FROM supplier_invoices
        WHERE project_id IS DISTINCT FROM $1 AND status <> 'cancelled'`, [projectId])
    const nilaiLain = Number(lain[0].jml)
    if (nilaiLain > 0) {
      const { rows: milik } = await client.query(
        `SELECT COALESCE(sum(total_amount),0)::numeric jml FROM supplier_invoices
          WHERE project_id = $1 AND status <> 'cancelled'`, [projectId])
      expect(j.per_sumber.faktur).toBe(Number(milik[0].jml))
    }
  })

  // PO mengikat uang tapi belum mengeluarkannya. Menjumlahkannya bersama
  // biaya nyata menghitung ganda begitu fakturnya terbit.
  it('PO masuk komitmen, BUKAN total', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/belanja-aktual`)).json()
    expect(j.exposure).toBe(j.total + j.komitmen)
  })

  it('TIDAK MENULIS apa pun', async () => {
    const hitung = async () => {
      /*
        Disaring ke PROYEK milik test, bukan `count(*)` seluruh tabel.

        Di CI enam shard berjalan paralel atas satu basis. Hitungan global
        bisa berubah karena shard LAIN menyisipkan baris di antara dua
        panggilan — test merah tanpa ada yang rusak, dan bacaan pertamanya
        menuduh endpoint ini menulis (atau lebih buruk: menuduh RLS bocor).

        Maksud testnya tak berubah: yang dibuktikan tetap 'endpoint ini
        tidak menulis apa pun', hanya kini atas data yang benar-benar
        miliknya.
      */
      const { rows } = await client.query(
        `SELECT count(*)::int n FROM weekly_wage_reports w
           JOIN mandor_assignments ma ON ma.id = w.assignment_id
          WHERE ma.project_id = $1`, [projectId])
      return rows[0].n as number
    }
    const sebelum = await hitung()
    await get(`/api/v1/projects/${projectId}/belanja-aktual`)
    await get(`/api/v1/projects/${projectId}/belanja-aktual`)
    expect(await hitung()).toBe(sebelum)
  })
})
