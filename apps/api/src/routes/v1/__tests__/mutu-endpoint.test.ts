import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import mutuRoutes from '../mutu.js'

/**
 * CHECKLIST INSPEKSI + UJI MATERIAL terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 21 test di `lib/__tests__/mutu-checklist.test.ts`
 * (11 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rantai tenancy `inspeksi_checklist` lewat `inspection_id` benar-benar
 *     menempuh jalannya — `viaProject` memakai kolom itu, bukan `project_id`
 *   • constraint DB benar-benar menolak (butir gagal tanpa catatan; uji tanpa
 *     nilai DAN tanpa kesimpulan)
 *   • `PATCH /checklist/:id` mengisi pemeriksa dari SESI, bukan dari klien
 *   • update yang tak menyentuh baris membalas 404, bukan 200 palsu
 *   • nomor uji unik per proyek
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let inspeksiId: string
let butirId: string
let inspeksiTenantLain: string | null = null

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST' | 'PATCH', url: string, payload: Record<string, unknown>) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(
    `DELETE FROM inspeksi_checklist
      WHERE inspection_id IN (SELECT id FROM inspection_requests WHERE nomor LIKE '[TEST]%')`)
  await client.query(`DELETE FROM uji_material WHERE nomor LIKE '[TEST]%'`)
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

  const { rows: i } = await client.query(
    `INSERT INTO inspection_requests (project_id, nomor, judul, status, diminta_oleh)
     VALUES ($1, '[TEST] IR-CHK', 'Inspeksi checklist uji', 'diminta', $2)
     RETURNING id`, [projectId, u[0].id])
  inspeksiId = i[0].id

  const { rows: b } = await client.query(
    `INSERT INTO inspeksi_checklist (inspection_id, urutan, butir, acuan)
     VALUES ($1, 1, 'Kerataan lantai', 'SNI 03-2445')
     RETURNING id`, [inspeksiId])
  butirId = b[0].id

  // Inspeksi di proyek LAIN — dipakai membuktikan saringan tenant bekerja.
  const { rows: p2 } = await client.query(
    `SELECT id FROM projects WHERE company_id IS DISTINCT FROM
       (SELECT company_id FROM projects WHERE id = $1) LIMIT 1`, [projectId])
  if (p2[0]) {
    const { rows: i2 } = await client.query(
      `INSERT INTO inspection_requests (project_id, nomor, judul, status, diminta_oleh)
       VALUES ($1, '[TEST] IR-LAIN', 'Inspeksi tenant lain', 'diminta', $2)
       RETURNING id`, [p2[0].id, u[0].id])
    inspeksiTenantLain = i2[0].id
  }

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(mutuRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /inspeksi/:id/checklist', () => {
  // INVARIAN TENANCY. `inspeksi_checklist` mewarisi lewat `inspection_id`,
  // bukan `project_id` — memberi id proyek ke `viaProject` menyusun
  // perbandingan dua jenis id berbeda: nol baris tanpa satu pun error.
  it('butir terbaca lewat rantai tenancy-nya', async () => {
    const r = await get(`/api/v1/inspeksi/${inspeksiId}/checklist`)
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.butir).toHaveLength(1)
    expect(j.butir[0].butir).toBe('Kerataan lantai')
  })

  it('404 untuk inspeksi yang tak ada', async () => {
    const r = await get('/api/v1/inspeksi/00000000-0000-0000-0000-0000000000ff/checklist')
    expect(r.statusCode).toBe(404)
  })

  // Butir baru berstatus `null` — belum diperiksa. Ia TIDAK boleh terhitung
  // lolos maupun gagal.
  it('butir yang belum diperiksa tidak terhitung lolos', async () => {
    const j = (await get(`/api/v1/inspeksi/${inspeksiId}/checklist`)).json()
    expect(j.ringkasan.belum).toBe(1)
    expect(j.ringkasan.lolos).toBe(0)
    expect(j.ringkasan.gagal).toBe(0)
    // `null`, bukan 0 — nol persen berarti "semua gagal".
    expect(j.ringkasan.pct_lolos).toBeNull()
  })

  // INVARIAN TENANCY. `inspection_requests` kategori C, dan `.from()`
  // MELEMPAR untuknya justru karena tanpa saringan project ia mengembalikan
  // baris milik tenant lain. Yang dipakai: `unsafe` + `.in(project_id,
  // projectIds())` di query yang SAMA.
  //
  // Ditemukan lewat mutation testing: melucuti saringan itu tetap HIJAU
  // sampai test ini ada.
  it('inspeksi milik tenant LAIN membalas 404, bukan datanya', async () => {
    if (!inspeksiTenantLain) return // basis uji hanya punya satu tenant
    const r = await get(`/api/v1/inspeksi/${inspeksiTenantLain}/checklist`)
    expect(r.statusCode).toBe(404)
  })
})

describe('PATCH /checklist/:id', () => {
  // Butir TIDAK LOLOS tanpa catatan ditolak DI RUTE dengan pesan yang bisa
  // dibaca — constraint DB juga menolaknya, tapi pesannya ("violates check
  // constraint") tak berguna di layar.
  it('butir gagal TANPA catatan ditolak dengan pesan yang bisa dibaca', async () => {
    const r = await kirim('PATCH', `/api/v1/checklist/${butirId}`, { lolos: false })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/catatan/i)
  })

  it('butir gagal BERALASAN diterima', async () => {
    const r = await kirim('PATCH', `/api/v1/checklist/${butirId}`, {
      lolos: false, catatan: 'Beda tinggi 8mm di 3 titik',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().butir.lolos).toBe(false)
  })

  // Pemeriksa diisi SERVER dari sesi. Pemeriksa yang bisa dipilih klien
  // bukan bukti — dan constraint `checklist_hasil_berpemeriksa` menuntutnya
  // ada, jadi kalau server tak mengisinya, seluruh update akan gagal.
  it('pemeriksa & waktunya diisi SERVER, bukan diterima dari klien', async () => {
    const { rows } = await client.query(
      `SELECT diperiksa_oleh, diperiksa_pada FROM inspeksi_checklist WHERE id = $1`, [butirId])
    expect(rows[0].diperiksa_oleh).toBeTruthy()
    expect(rows[0].diperiksa_pada).toBeTruthy()
  })

  // `update` yang tak menyentuh baris mana pun BUKAN sukses. Tanpa
  // pemeriksaan hasil, butir milik tenant lain (disaring RLS) membalas 200
  // seolah tersimpan.
  // Pemeriksa diambil dari SESI, dan klien TIDAK bisa menimpanya. Pemeriksa
  // yang bisa dipilih sendiri bukan bukti — ia tanda tangan yang bisa
  // dipalsukan.
  //
  // Ditemukan lewat mutation testing: menyisipkan `b.oleh ?? currentUser`
  // tetap HIJAU sampai test ini ada.
  it('klien TIDAK bisa memilih siapa pemeriksanya', async () => {
    // `adminAuth` adalah `auth_id` (Supabase), BUKAN `users.id`. Versi
    // pertama test ini membandingkan keduanya dan gagal karena "pengguna
    // lain" yang terpilih ternyata pengguna sesi itu sendiri.
    const { rows: sesi } = await client.query(
      `SELECT id FROM users WHERE auth_id = $1`, [adminAuth])
    const idSesi = sesi[0]?.id
    expect(idSesi).toBeTruthy()

    const { rows: lain } = await client.query(
      `SELECT id FROM users WHERE id <> $1 LIMIT 1`, [idSesi])
    if (!lain[0]) return

    await kirim('PATCH', `/api/v1/checklist/${butirId}`, {
      lolos: true,
      // Klien mencoba mengaku diperiksa orang lain.
      oleh: lain[0].id,
      diperiksa_oleh: lain[0].id,
    })

    const { rows } = await client.query(
      `SELECT diperiksa_oleh FROM inspeksi_checklist WHERE id = $1`, [butirId])
    // Yang tercatat adalah pengguna SESI, bukan yang dikirim klien.
    expect(rows[0].diperiksa_oleh).toBe(idSesi)
    expect(rows[0].diperiksa_oleh).not.toBe(lain[0].id)
  })

  it('butir yang tak ada membalas 404, bukan 200 palsu', async () => {
    const r = await kirim('PATCH', '/api/v1/checklist/00000000-0000-0000-0000-0000000000ff',
      { lolos: true })
    expect(r.statusCode).toBe(404)
  })
})

describe('POST /projects/:id/uji-material', () => {
  it('404 untuk proyek yang bukan milik tenant ini', async () => {
    const r = await kirim('POST', '/api/v1/projects/00000000-0000-0000-0000-0000000000ff/uji-material',
      { nomor: '[TEST] X', objek: 'beton', jenis_uji: 'kuat tekan', tanggal_uji: '2026-08-01', nilai_hasil: 300 })
    expect(r.statusCode).toBe(404)
  })

  // INVARIAN. Baris tanpa nilai DAN tanpa kesimpulan terhitung sebagai bukti
  // saat auditor menghitung berapa uji sudah dilakukan — tanpa mengatakan
  // apa pun tentang hasilnya.
  it('uji tanpa nilai DAN tanpa kesimpulan ditolak', async () => {
    const r = await kirim('POST', `/api/v1/projects/${projectId}/uji-material`, {
      nomor: '[TEST] UJI-KOSONG', objek: 'beton', jenis_uji: 'kuat tekan',
      tanggal_uji: '2026-08-01',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/nilai ATAU kesimpulan/i)
  })

  it('uji dengan nilai saja diterima', async () => {
    const r = await kirim('POST', `/api/v1/projects/${projectId}/uji-material`, {
      nomor: '[TEST] UJI-001', objek: 'Beton K-250 zona B', jenis_uji: 'kuat tekan',
      tanggal_uji: '2026-08-01', nilai_hasil: 268.5, nilai_syarat: 250, satuan: 'kg/cm2',
    })
    expect(r.statusCode).toBe(201)
  })

  // Nomor uji dirujuk dalam sertifikat dan surat resmi — duplikatnya
  // menghasilkan dua dokumen yang mengaku sama.
  it('nomor uji ganda ditolak dengan pesan yang bisa dibaca', async () => {
    const r = await kirim('POST', `/api/v1/projects/${projectId}/uji-material`, {
      nomor: '[TEST] UJI-001', objek: 'beton lain', jenis_uji: 'kuat tekan',
      tanggal_uji: '2026-08-02', nilai_hasil: 100,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/sudah dipakai/i)
  })

  it('menolak ncr_id dari proyek lain / tak ada', async () => {
    const r = await kirim('POST', `/api/v1/projects/${projectId}/uji-material`, {
      nomor: '[TEST] UJI-NCR', objek: 'beton', jenis_uji: 'kuat tekan',
      tanggal_uji: '2026-08-01', nilai_hasil: 300,
      ncr_id: '00000000-0000-0000-0000-0000000000ff',
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('GET /projects/:id/uji-material', () => {
  it('membawa nilai numeric yang tersimpan sebagai string', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/uji-material`)).json()
    const uji = j.baris.find((x: { nomor: string }) => x.nomor === '[TEST] UJI-001')
    expect(uji).toBeDefined()
    // Postgres `numeric` tiba sebagai STRING — perbandingannya harus tetap
    // menghasilkan angka, bukan penyambungan string.
    expect(uji.selisih).toBeCloseTo(18.5, 4)
    expect(uji.angka_memadai).toBe(true)
  })

  // INVARIAN INTI: kesimpulan TIDAK ditebak dari angka. Uji terbalik (kadar
  // lumpur), toleransi, dan penilaian ahli semuanya sah.
  it('kesimpulan TIDAK ditebak meski angkanya memadai', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/uji-material`)).json()
    const uji = j.baris.find((x: { nomor: string }) => x.nomor === '[TEST] UJI-001')
    expect(uji.kesimpulan).toBeNull()
    expect(uji.perlu_kesimpulan).toBe(true)
  })

  it('membawa penyebut jumlah uji', async () => {
    const j = (await get(`/api/v1/projects/${projectId}/uji-material`)).json()
    expect(j.jumlah_uji).toBeGreaterThan(0)
  })
})
