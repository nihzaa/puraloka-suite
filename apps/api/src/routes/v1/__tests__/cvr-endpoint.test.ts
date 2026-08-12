import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import costControlRoutes from '../cost-control.js'

/**
 * CVR terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 20 test di `lib/__tests__/cvr.test.ts`
 * (10 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rantai `work_scopes`/`weekly_wage_reports` → `mandor_assignments`
 *     benar-benar menempuh jalannya. Kalau putus: nol scope, dan layar CVR
 *     yang kosong terbaca sebagai "tidak ada selisih" — kabar baik palsu
 *     tentang angka yang paling menentukan untung-rugi.
 *   • upah `draft`/`submitted` TIDAK ikut biaya — aturan yang sama dengan
 *     `belanja-aktual`, karena dua angka biaya berbeda di dua layar untuk
 *     proyek yang sama menghancurkan kepercayaan pemakai
 *   • `meta.cakupan` selalu dibawa: CVR ini hanya upah borongan
 *   • endpoint TIDAK MENULIS apa pun
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let assignmentId: string
let scopeUji: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`DELETE FROM weekly_wage_reports WHERE notes LIKE '[TEST]%'`)
  await client.query(`DELETE FROM work_scopes WHERE scope_name LIKE '[TEST]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT ma.project_id, ma.id AS assignment_id
       FROM mandor_assignments ma
       JOIN projects pr ON pr.id = ma.project_id
      WHERE pr.company_id IS NOT NULL
      LIMIT 1`)
  if (!p[0]) throw new Error('tak ada penugasan mandor untuk diuji')
  projectId = p[0].project_id
  assignmentId = p[0].assignment_id

  await purge()

  // Scope RUGI yang disengaja: nilai terpasang Rp 50 juta (100jt × 50%),
  // upah terbayar Rp 60 juta. Rugi Rp 10 juta harus TERLIHAT.
  const { rows: sc } = await client.query(
    `INSERT INTO work_scopes
       (assignment_id, scope_name, payment_system, borongan_value, progress_pct_done, status)
     VALUES ($1, '[TEST] Scope Rugi', 'borongan', 100000000, 50, 'active')
     RETURNING id`, [assignmentId])
  scopeUji = sc[0].id

  await client.query(
    `INSERT INTO weekly_wage_reports
       (assignment_id, scope_id, week_start, week_end, status, subtotal, total_deduction, net_amount, notes)
     VALUES ($1, $2, CURRENT_DATE - 7, CURRENT_DATE, 'paid', 60000000, 0, 60000000, '[TEST] upah cvr')`,
    [assignmentId, scopeUji])

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

describe('GET /projects/:id/cvr', () => {
  it('404 untuk proyek yang bukan milik tenant ini', async () => {
    const r = await get('/api/v1/projects/00000000-0000-0000-0000-0000000000ff/cvr')
    expect(r.statusCode).toBe(404)
  })

  // INVARIAN TERPENTING. Kalau rantai tenancy putus, hasilnya nol scope —
  // dan layar CVR kosong terbaca sebagai "tidak ada selisih", bukan "belum
  // ada data". Itu kabar baik palsu tentang untung-rugi.
  it('scope benar-benar terbaca lewat rantai tenancy-nya', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    expect(j.meta.jumlah_scope).toBeGreaterThan(0)
    expect(j.baris.some((b: { scope_id: string }) => b.scope_id === scopeUji)).toBe(true)
  })

  it('scope RUGI dihitung benar dan diurutkan paling atas', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    const uji = j.baris.find((b: { scope_id: string }) => b.scope_id === scopeUji)
    expect(uji.nilai_terpasang).toBe(50_000_000)
    expect(uji.terpakai).toBe(60_000_000)
    expect(uji.selisih).toBe(-10_000_000)
    expect(uji.keadaan).toBe('rugi')
    // Yang rugi naik ke atas — daftar yang menaruhnya di bawah membuatnya
    // tak pernah dibaca.
    expect(j.baris[0].keadaan).toBe('rugi')
  })

  // Aturan yang SAMA dengan `belanja-aktual.ts`. Dua angka biaya berbeda di
  // dua layar untuk proyek yang sama adalah cara tercepat kehilangan
  // kepercayaan pemakai.
  it('upah DRAFT tidak menaikkan biaya', async () => {
    const sebelum = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    const uji0 = sebelum.baris.find((b: { scope_id: string }) => b.scope_id === scopeUji)

    await client.query(
      `INSERT INTO weekly_wage_reports
         (assignment_id, scope_id, week_start, week_end, status, subtotal, total_deduction, net_amount, notes)
       VALUES ($1, $2, CURRENT_DATE - 14, CURRENT_DATE - 7, 'draft', 20000000, 0, 20000000, '[TEST] upah draft cvr')`,
      [assignmentId, scopeUji])

    const sesudah = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    const uji1 = sesudah.baris.find((b: { scope_id: string }) => b.scope_id === scopeUji)
    expect(uji1.terpakai).toBe(uji0.terpakai)
  })

  // Cakupan DINYATAKAN. Pembaca yang mengira ini mencakup seluruh biaya
  // proyek akan salah menyimpulkan, dan salahnya di angka untung-rugi.
  it('membawa meta.cakupan dan keterbatasannya', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    expect(j.meta.cakupan).toMatch(/upah borongan/i)
    expect(j.meta.keterbatasan).toMatch(/material/i)
  })

  // `borongan_value_override` adalah nilai yang BENAR-BENAR disepakati;
  // `borongan_value` jadi angka rencana yang tertinggal. Memakai yang salah
  // menggeser seluruh perhitungan untung-rugi scope itu.
  it('borongan_value_override MENANG atas borongan_value', async () => {
    const { rows: sc } = await client.query(
      `INSERT INTO work_scopes
         (assignment_id, scope_name, payment_system, borongan_value,
          borongan_value_override, progress_pct_done, status)
       VALUES ($1, '[TEST] Scope Override', 'borongan', 100000000, 40000000, 100, 'active')
       RETURNING id`, [assignmentId])

    const j = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    const b = j.baris.find((x: { scope_id: string }) => x.scope_id === sc[0].id)
    // 40 juta (override), bukan 100 juta.
    expect(b.nilai_terpasang).toBe(40_000_000)
  })

  // Postgres `numeric` MENERIMA NaN — terbukti di repo ini. Satu baris NaN
  // meracuni seluruh scope, dan angka untung-rugi yang berbunyi "NaN" di
  // layar jauh lebih baik daripada angka salah yang terlihat wajar; yang
  // dilakukan: baris NaN DILEWATI, sisanya tetap benar.
  it('upah bernilai NaN tidak meracuni biaya scope', async () => {
    const { rows: sc } = await client.query(
      `INSERT INTO work_scopes
         (assignment_id, scope_name, payment_system, borongan_value, progress_pct_done, status)
       VALUES ($1, '[TEST] Scope NaN', 'borongan', 50000000, 100, 'active')
       RETURNING id`, [assignmentId])

    await client.query(
      `INSERT INTO weekly_wage_reports
         (assignment_id, scope_id, week_start, week_end, status, subtotal, total_deduction, net_amount, notes)
       VALUES ($1, $2, CURRENT_DATE - 7, CURRENT_DATE, 'paid', 0, 0, 'NaN'::numeric, '[TEST] upah nan'),
              ($1, $2, CURRENT_DATE - 14, CURRENT_DATE - 7, 'paid', 0, 0, 5000000, '[TEST] upah waras')`,
      [assignmentId, sc[0].id])

    const j = (await get(`/api/v1/projects/${projectId}/cvr`)).json()
    const b = j.baris.find((x: { scope_id: string }) => x.scope_id === sc[0].id)
    expect(Number.isNaN(b.terpakai)).toBe(false)
    expect(b.terpakai).toBe(5_000_000)
    expect(Number.isNaN(b.selisih)).toBe(false)
  })

  it('TIDAK MENULIS apa pun', async () => {
    const hitung = async () => {
      const { rows } = await client.query(`SELECT count(*)::int n FROM work_scopes`)
      return rows[0].n as number
    }
    const sebelum = await hitung()
    await get(`/api/v1/projects/${projectId}/cvr`)
    await get(`/api/v1/projects/${projectId}/cvr`)
    expect(await hitung()).toBe(sebelum)
  })

  it('meneruskan rab_category_id — kekosongannya harus TERLIHAT', async () => {
    // Diukur 2026-08-13: 0 dari 20 scope berkategori, dan itulah yang
    // membatasi CVR ke upah borongan saja. Menyembunyikan kolomnya membuat
    // batas cakupan terbaca sebagai sifat modul — padahal ia keadaan data
    // yang bisa diperbaiki dalam beberapa klik.
    const r = await get(`/api/v1/projects/${projectId}/cvr`)
    expect(r.statusCode, r.body).toBe(200)

    const baris = r.json().baris as Array<Record<string, unknown>>
    if (baris.length === 0) throw new Error('proyek uji tak punya scope — fixture tak terbentuk')

    for (const b of baris) {
      expect(b, 'rab_category_id tak diteruskan ke UI').toHaveProperty('rab_category_id')
    }

    // Kuncinya ada saja TIDAK cukup: `lib/cvr.ts` mengisi `?? null`, jadi
    // kunci tetap muncul meski rutenya lupa mengambil kolomnya — dan mutasi
    // "kolom tak diambil rute" LOLOS karenanya sampai versi ini.
    //
    // Yang dibandingkan: nilai yang dikirim vs nilai di BASIS. Satu scope
    // sengaja diberi kategori supaya perbandingannya bermakna; nilai awalnya
    // dikembalikan sesudahnya.
    const { rows: kat } = await client.query(
      `SELECT id FROM rab_items WHERE project_id = $1 AND level = 'category' LIMIT 1`, [projectId])
    if (!kat.length) throw new Error('proyek uji tak punya kategori RAB — fixture tak terbentuk')

    const idScope = baris[0].scope_id as string
    const { rows: awal } = await client.query(
      'SELECT rab_category_id FROM work_scopes WHERE id = $1', [idScope])
    try {
      await client.query('UPDATE work_scopes SET rab_category_id = $1 WHERE id = $2',
        [kat[0].id, idScope])

      const r2 = await get(`/api/v1/projects/${projectId}/cvr`)
      const b2 = (r2.json().baris as Array<Record<string, unknown>>)
        .find((x) => x.scope_id === idScope)
      expect(b2?.rab_category_id,
        'nilai kategori tak sampai ke UI — rutenya tak mengambil kolomnya').toBe(kat[0].id)
    } finally {
      await client.query('UPDATE work_scopes SET rab_category_id = $1 WHERE id = $2',
        [awal[0].rab_category_id, idScope])
    }
  })
})
