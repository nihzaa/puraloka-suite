import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import ncrRoutes from '../ncr.js'

/**
 * KANDIDAT NCR dari inspeksi gagal, terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Aturan kelayakannya sudah dikunci 16 test di
 * `lib/__tests__/inspeksi-ke-ncr.test.ts` tanpa menyentuh basis. Yang tersisa:
 *
 *   • rute `/ncr/kandidat` tidak tertangkap rute ber-`:id`
 *   • inspeksi `tidak_lolos` benar-benar terbaca lewat rantai tenancy-nya —
 *     kalau putus, hasilnya nol kandidat, dan layar kosong terbaca sebagai
 *     "tak ada temuan" padahal ada tiga pekerjaan yang gagal diperiksa
 *   • inspeksi yang SUDAH ber-NCR tak diusulkan lagi (dua NCR untuk satu
 *     temuan = dua tugas perbaikan untuk satu pekerjaan)
 *   • proyek tenant lain membalas 404
 *   • endpoint TIDAK MENULIS apa pun
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let inspGagal: string
let inspLolos: string
let inspSudahNcr: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`DELETE FROM ncr_items WHERE nomor LIKE '[TEST]%'`)
  await client.query(`DELETE FROM inspection_requests WHERE nomor LIKE '[TEST]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  projectId = p[0].id

  const { rows: u } = await client.query(`SELECT id FROM users LIMIT 1`)

  await purge()

  // `diperiksa_oleh` WAJIB untuk status lolos/tidak_lolos — constraint
  // `inspeksi_hasil_berpemeriksa` (migrasi 157). Itu constraint yang benar:
  // hasil pemeriksaan tanpa pemeriksa tak punya arti, dan test yang
  // melewatinya akan menguji keadaan yang mustahil di produksi.
  const buatInsp = async (nomor: string, status: string, judul: string) => {
    const { rows } = await client.query(
      `INSERT INTO inspection_requests
         (project_id, nomor, judul, status, lokasi, hasil_catatan,
          diminta_oleh, diperiksa_oleh, diperiksa_pada)
       VALUES ($1, $2, $3, $4, 'Lantai 2', 'Lapisan tidak merata di 3 titik',
               $5, $5, CURRENT_DATE - 5)
       RETURNING id`, [projectId, nomor, judul, status, u[0].id])
    return rows[0].id as string
  }
  inspGagal = await buatInsp('[TEST] IR-GAGAL', 'tidak_lolos', 'Inspeksi waterproofing')
  inspLolos = await buatInsp('[TEST] IR-LOLOS', 'lolos', 'Inspeksi rangka atap')
  inspSudahNcr = await buatInsp('[TEST] IR-SUDAH', 'tidak_lolos', 'Inspeksi pasangan bata')

  // NCR yang sudah menunjuk salah satu inspeksi gagal.
  await client.query(
    `INSERT INTO ncr_items
       (project_id, nomor, judul, deskripsi, severity, status, inspection_request_id, dilaporkan_oleh)
     VALUES ($1, '[TEST] NCR-ADA', 'Sudah ada', 'uji', 'major', 'terbuka', $2, $3)`,
    [projectId, inspSudahNcr, u[0].id])

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(ncrRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /projects/:id/ncr/kandidat', () => {
  // Kalau rute ber-`:id` terdaftar lebih dulu, "kandidat" dibaca sebagai id.
  it('tidak tertangkap rute ber-:id', async () => {
    const r = await get(`/api/v1/projects/${projectId}/ncr/kandidat`)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toHaveProperty('kandidat')
  })

  it('404 untuk proyek yang bukan milik tenant ini', async () => {
    const r = await get('/api/v1/projects/00000000-0000-0000-0000-0000000000ff/ncr/kandidat')
    expect(r.statusCode).toBe(404)
  })

  // INVARIAN TERPENTING. Kalau rantai tenancy putus, hasilnya nol kandidat —
  // dan layar kosong terbaca sebagai "tak ada temuan", padahal ada pekerjaan
  // yang gagal diperiksa dan tak ditindaklanjuti siapa pun.
  it('inspeksi TIDAK LOLOS muncul sebagai kandidat', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/ncr/kandidat`)).json()
    const k = j.kandidat.find((x: { inspection_request_id: string }) =>
      x.inspection_request_id === inspGagal)
    expect(k).toBeDefined()
    expect(k.nomor_inspeksi).toBe('[TEST] IR-GAGAL')
    // Konteksnya diwarisi — tanpa ini penerima tugas perbaikan tak tahu
    // pekerjaan mana yang dimaksud.
    expect(k.judul).toContain('waterproofing')
    expect(k.lokasi).toBe('Lantai 2')
    expect(k.deskripsi).toContain('tidak merata')
  })

  it('inspeksi LOLOS TIDAK muncul', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/ncr/kandidat`)).json()
    expect(j.kandidat.some((x: { inspection_request_id: string }) =>
      x.inspection_request_id === inspLolos)).toBe(false)
  })

  // Dua NCR untuk satu temuan berarti dua tugas perbaikan untuk satu
  // pekerjaan, dan dua angka `biaya_dampak` untuk kerusakan yang sama.
  it('inspeksi yang SUDAH ber-NCR tidak diusulkan lagi', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/ncr/kandidat`)).json()
    expect(j.kandidat.some((x: { inspection_request_id: string }) =>
      x.inspection_request_id === inspSudahNcr)).toBe(false)
    // Tapi DIHITUNG — daftar yang menyusut tanpa penjelasan membuat orang
    // bertanya "inspeksi saya ke mana".
    expect(j.sudah_ber_ncr).toBeGreaterThan(0)
  })

  it('membawa penyebut jumlah inspeksi', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/ncr/kandidat`)).json()
    expect(j.jumlah_inspeksi).toBeGreaterThanOrEqual(3)
    expect(j.jumlah_diperiksa).toBe(j.jumlah_inspeksi)
  })

  // Severity tak boleh ditebak mesin — ia mengalir ke prioritas perbaikan.
  it('severity dikosongkan untuk diisi manusia', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/ncr/kandidat`)).json()
    const k = j.kandidat.find((x: { inspection_request_id: string }) =>
      x.inspection_request_id === inspGagal)
    expect(k.severity).toBeNull()
  })

  // Jawaban sukses WAJIB membawa PENYEBUT.
  //
  // Tanpa `jumlah_inspeksi`, "0 kandidat" tak bisa dibedakan dari "query
  // gagal lalu dikosongkan" — dan pembedaan itulah yang menghentikan
  // kegagalan senyap. Sejarahnya mahal: `kurva-s.ts` kehilangan Rp 631,7 juta
  // karena satu query gagal lalu hasilnya diperlakukan sebagai nol baris.
  //
  // Jalur `if (r.error) → 500` sendiri TIDAK diuji di sini: memicunya butuh
  // merusak skema, dan test yang merusak skema mengotori basis untuk seluruh
  // test lain. Yang menjaganya adalah `audit-kegagalan-senyap.mjs` (ambang
  // NOL) — ia menolak pola `?? []` di seluruh rute, termasuk yang belum
  // ber-test.
  it('jawaban sukses membawa penyebut yang bisa diperiksa', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/ncr/kandidat`)).json()
    expect(j).toHaveProperty('jumlah_inspeksi')
    expect(j.jumlah_inspeksi).toBeGreaterThan(0)
    expect(j.jumlah_diperiksa).toBe(j.jumlah_inspeksi)
  })

  it('TIDAK MENULIS apa pun', async () => {
    const hitung = async () => {
      const { rows } = await client.query(`SELECT count(*)::int n FROM ncr_items`)
      return rows[0].n as number
    }
    const sebelum = await hitung()
    await get(`/api/v1/projects/${projectId}/ncr/kandidat`)
    await get(`/api/v1/projects/${projectId}/ncr/kandidat`)
    expect(await hitung()).toBe(sebelum)
  })
})
