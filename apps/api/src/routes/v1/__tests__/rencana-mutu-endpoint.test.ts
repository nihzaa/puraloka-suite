import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import rencanaMutuRoutes from '../rencana-mutu.js'

/**
 * RENCANA MUTU + ITP terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 18 test di `lib/__tests__/rencana-mutu.test.ts`
 * (13 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rantai tenancy `itp_titik` lewat `rencana_mutu_id` benar-benar menempuh
 *     jalannya — `viaProject` memakai kolom itu, BUKAN `project_id`. Salah
 *     argumen di sini mengembalikan nol baris tanpa satu pun galat, dan
 *     kesalahan persis itu sudah terjadi dua kali di repo ini
 *   • constraint DB benar-benar menolak (titik gagal tanpa catatan; RMP
 *     disetujui tanpa penyetuju)
 *   • `PATCH /itp-titik/:id` mengisi pemeriksa dari SESI, bukan dari klien
 *   • persetujuan ditolak SERVER saat ITP tak punya HOLD — tombol yang
 *     disembunyikan di layar tak menghalangi panggilan langsung
 *   • persetujuan GANDA gagal di basis, bukan hanya di pemeriksaan sebelumnya
 *   • sambungan `inspection_requests.itp_titik_id` benar-benar tertulis
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let userId: string
let rmpId: string
let titikHoldId: string
let inspeksiId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST' | 'PATCH', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(
    `UPDATE inspection_requests SET itp_titik_id = NULL
      WHERE itp_titik_id IN (
        SELECT t.id FROM itp_titik t JOIN rencana_mutu r ON r.id = t.rencana_mutu_id
         WHERE r.nomor LIKE '[TEST]%')`)
  await client.query(
    `DELETE FROM itp_titik WHERE rencana_mutu_id IN
       (SELECT id FROM rencana_mutu WHERE nomor LIKE '[TEST]%')`)
  // Jejak approval TIDAK punya FK ke `rencana_mutu` (ia generik lintas
  // entitas), jadi ia tak ikut terhapus dan akan membuat test "tercatat di
  // mesin" lolos dari sisa run SEBELUMNYA — hijau tanpa membuktikan apa pun.
  await client.query(
    `DELETE FROM approval_progress
      WHERE entity_type = 'rencana_mutu'
        AND entity_id IN (SELECT id FROM rencana_mutu WHERE nomor LIKE '[TEST]%')`)
  await client.query(`DELETE FROM rencana_mutu WHERE nomor LIKE '[TEST]%'`)
  await client.query(`DELETE FROM inspection_requests WHERE nomor LIKE '[TEST]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  projectId = p[0].id
  const { rows: u } = await client.query(`SELECT id FROM users LIMIT 1`)
  userId = u[0].id

  await purge()

  const { rows: r } = await client.query(
    `INSERT INTO rencana_mutu (project_id, nomor, judul, standar_acuan, sasaran_mutu, dibuat_oleh)
     VALUES ($1, '[TEST] RMP-01', 'Rencana mutu uji', 'SNI 2847:2019', 'Nol NCR mayor', $2)
     RETURNING id`, [projectId, userId])
  rmpId = r[0].id

  const { rows: t } = await client.query(
    `INSERT INTO itp_titik (rencana_mutu_id, urutan, tahap_pekerjaan, uraian, jenis_titik, kriteria)
     VALUES ($1, 10, 'Pembesian kolom', 'Jumlah & diameter tulangan', 'hold', 'Sesuai gambar kerja')
     RETURNING id`, [rmpId])
  titikHoldId = t[0].id

  const { rows: i } = await client.query(
    `INSERT INTO inspection_requests (project_id, nomor, judul, status, diminta_oleh)
     VALUES ($1, '[TEST] IR-ITP', 'Inspeksi pembesian', 'diminta', $2)
     RETURNING id`, [projectId, userId])
  inspeksiId = i[0].id

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(rencanaMutuRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /rencana-mutu/:id', () => {
  // INVARIAN TENANCY YANG PALING MUDAH SALAH.
  //
  // `itp_titik` mewarisi lewat `rencana_mutu_id`. Memberi id proyek ke
  // `viaProject` menyusun `.eq('rencana_mutu_id', <id proyek>)` — dua jenis
  // id yang dibandingkan, nol baris, dan NOL GALAT. Test ini gagal kalau
  // argumennya salah.
  it('titik ITP terbaca lewat rantai tenancy-nya sendiri', async () => {
    const r = await get(`/api/v1/rencana-mutu/${rmpId}`)
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.titik).toHaveLength(1)
    expect(j.titik[0].tahap_pekerjaan).toBe('Pembesian kolom')
  })

  it('titik HOLD yang belum diperiksa MENAHAN pekerjaan', async () => {
    const j = (await get(`/api/v1/rencana-mutu/${rmpId}`)).json()
    expect(j.ringkasan.menahan).toHaveLength(1)
    expect(j.ringkasan.boleh_lanjut).toBe(false)
  })

  it('404 untuk rencana mutu yang tak ada', async () => {
    const r = await get('/api/v1/rencana-mutu/00000000-0000-0000-0000-0000000000ff')
    expect(r.statusCode).toBe(404)
  })
})

describe('POST /rencana-mutu/:id/titik', () => {
  it('jenis_titik WAJIB — tak boleh punya nilai bawaan', async () => {
    const r = await kirim('POST', `/api/v1/rencana-mutu/${rmpId}/titik`, {
      tahap_pekerjaan: 'Pengecoran', uraian: 'Slump beton',
    })
    // Menebak 'review' membuat titik yang seharusnya menahan jadi tak
    // menahan; menebak 'hold' menghentikan yang tak perlu berhenti.
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/jenis_titik/)
  })

  it('jenis_titik di luar tiga nilai ditolak sebelum menyentuh basis', async () => {
    const r = await kirim('POST', `/api/v1/rencana-mutu/${rmpId}/titik`, {
      tahap_pekerjaan: 'X', uraian: 'Y', jenis_titik: 'hold_point',
    })
    expect(r.statusCode).toBe(400)
  })

  it('titik baru tersimpan dengan jenisnya', async () => {
    const r = await kirim('POST', `/api/v1/rencana-mutu/${rmpId}/titik`, {
      tahap_pekerjaan: 'Pengecoran kolom', uraian: 'Slump beton',
      jenis_titik: 'witness', kriteria: '12 ± 2 cm', urutan: 20,
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().titik.jenis_titik).toBe('witness')
  })

  it('WITNESS yang belum lolos TIDAK ikut menahan', async () => {
    const j = (await get(`/api/v1/rencana-mutu/${rmpId}`)).json()
    expect(j.ringkasan.menunggu_saksi).toHaveLength(1)
    // HOLD tetap 1 — witness tak menambahnya.
    expect(j.ringkasan.menahan).toHaveLength(1)
  })

  it('404 saat RMP-nya bukan milik tenant ini', async () => {
    const r = await kirim('POST',
      '/api/v1/rencana-mutu/00000000-0000-0000-0000-0000000000ff/titik',
      { tahap_pekerjaan: 'X', uraian: 'Y', jenis_titik: 'hold' })
    expect(r.statusCode).toBe(404)
  })
})

describe('PATCH /itp-titik/:id', () => {
  it('titik GAGAL tanpa catatan ditolak dengan pesan yang bisa dibaca', async () => {
    const r = await kirim('PATCH', `/api/v1/itp-titik/${titikHoldId}`, { lolos: false })
    expect(r.statusCode).toBe(400)
    // Bukan pesan constraint mentah — itu tak berarti apa-apa di layar.
    expect(r.json().error).not.toMatch(/violates check constraint/)
    expect(r.json().error).toMatch(/catatan/i)
  })

  it('404 untuk titik yang tak ada', async () => {
    const r = await kirim('PATCH',
      '/api/v1/itp-titik/00000000-0000-0000-0000-0000000000ff', { lolos: true })
    expect(r.statusCode).toBe(404)
  })

  it('pemeriksa diisi dari SESI, bukan dari klien', async () => {
    const r = await kirim('PATCH', `/api/v1/itp-titik/${titikHoldId}`, {
      lolos: true,
      // Klien mencoba menyebut pemeriksa lain — harus diabaikan.
      diperiksa_oleh: '00000000-0000-0000-0000-0000000000ff',
    })
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT diperiksa_oleh, diperiksa_pada FROM itp_titik WHERE id = $1`, [titikHoldId])
    // Pemeriksa yang bisa dipilih sendiri bukan bukti — dan pada titik HOLD
    // bukti itulah yang dibutuhkan saat sengketa.
    expect(rows[0].diperiksa_oleh).not.toBe('00000000-0000-0000-0000-0000000000ff')
    expect(rows[0].diperiksa_pada).not.toBeNull()
  })

  it('sesudah HOLD lolos, pekerjaan boleh lanjut', async () => {
    const j = (await get(`/api/v1/rencana-mutu/${rmpId}`)).json()
    expect(j.ringkasan.menahan).toHaveLength(0)
    expect(j.ringkasan.boleh_lanjut).toBe(true)
  })

  it('menautkan inspeksi ke titik — sambungan rencana→pelaksanaan', async () => {
    const r = await kirim('PATCH', `/api/v1/itp-titik/${titikHoldId}`, {
      lolos: true, inspection_id: inspeksiId,
    })
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT itp_titik_id FROM inspection_requests WHERE id = $1`, [inspeksiId])
    // Tanpa ini, ITP dan inspeksi hidup di dua tabel yang tak pernah bertemu —
    // kelas cacat yang sudah terjadi tujuh kali di repo ini.
    expect(rows[0].itp_titik_id).toBe(titikHoldId)
  })

  it('menautkan inspeksi yang TAK ADA membalas 404, bukan 200 palsu', async () => {
    const r = await kirim('PATCH', `/api/v1/itp-titik/${titikHoldId}`, {
      lolos: true, inspection_id: '00000000-0000-0000-0000-0000000000ff',
    })
    // Nol baris di sini bukan best-effort: inspeksinya tak ada atau milik
    // tenant lain. Membalas 200 membuat layar menampilkan "tertaut" padahal
    // tak ada yang tertaut — dan sambungan inilah alasan modul ini dibangun.
    expect(r.statusCode).toBe(404)
    expect(r.json().error).toMatch(/inspeksi/i)
  })
})

describe('POST /rencana-mutu/:id/setujui', () => {
  it('MENOLAK rencana yang tak punya satu pun titik HOLD', async () => {
    const { rows } = await client.query(
      `INSERT INTO rencana_mutu (project_id, nomor, judul, standar_acuan, sasaran_mutu, dibuat_oleh)
       VALUES ($1, '[TEST] RMP-NOHOLD', 'Tanpa hold', 'SNI', 'sasaran', $2)
       RETURNING id`, [projectId, userId])
    await client.query(
      `INSERT INTO itp_titik (rencana_mutu_id, tahap_pekerjaan, uraian, jenis_titik, kriteria)
       VALUES ($1, 'Dokumen', 'Sertifikat bahan', 'review', 'ada sertifikat')`, [rows[0].id])

    const r = await kirim('POST', `/api/v1/rencana-mutu/${rows[0].id}/setujui`)
    // Aturan ditegakkan di SERVER. Tombol yang disembunyikan di layar adalah
    // UX; endpoint bisa dipanggil langsung.
    expect(r.statusCode).toBe(422)
    expect(r.json().penghalang.map((p: { kode: string }) => p.kode)).toContain('tanpa-hold')

    const { rows: cek } = await client.query(
      `SELECT status FROM rencana_mutu WHERE id = $1`, [rows[0].id])
    expect(cek[0].status).toBe('draf')
  })

  it('MENOLAK rencana yang ITP-nya kosong', async () => {
    const { rows } = await client.query(
      `INSERT INTO rencana_mutu (project_id, nomor, judul, dibuat_oleh)
       VALUES ($1, '[TEST] RMP-KOSONG', 'Kosong', $2) RETURNING id`, [projectId, userId])
    const r = await kirim('POST', `/api/v1/rencana-mutu/${rows[0].id}/setujui`)
    expect(r.statusCode).toBe(422)
    expect(r.json().penghalang.map((p: { kode: string }) => p.kode)).toContain('tanpa-titik')
  })

  it('draf → diajukan lewat /ajukan; yang bukan draf ditolak', async () => {
    const r = await kirim('POST', `/api/v1/rencana-mutu/${rmpId}/ajukan`)
    expect(r.statusCode).toBe(200)
    expect(r.json().rencana.status).toBe('diajukan')

    // Status lama di WHERE: pengajuan kedua tak boleh berhasil.
    const lagi = await kirim('POST', `/api/v1/rencana-mutu/${rmpId}/ajukan`)
    expect(lagi.statusCode).toBe(409)
  })

  it('menyetujui yang lengkap mengisi penyetuju & tanggalnya', async () => {
    const r = await kirim('POST', `/api/v1/rencana-mutu/${rmpId}/setujui`)
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT status, disetujui_oleh, disetujui_pada FROM rencana_mutu WHERE id = $1`, [rmpId])
    expect(rows[0].status).toBe('disetujui')
    // Constraint `rmp_disetujui_berjejak` menuntut keduanya; kalau server
    // lupa mengisinya, INSERT-nya yang gagal, bukan test ini.
    expect(rows[0].disetujui_oleh).not.toBeNull()
    expect(rows[0].disetujui_pada).not.toBeNull()
  })

  it('persetujuan tercatat di MESIN approval, bukan hanya di kolom', async () => {
    // ── Kenapa test ini ada ──────────────────────────────────────────────
    //
    // Versi pertama endpoint ini menulis `disetujui_oleh` langsung, dan
    // `audit-approval-satu-pintu.mjs` merahkannya: entitas yang menurut
    // konfigurasi butuh dua level bisa lolos dengan satu ketukan, sementara
    // halaman pengaturan tetap menampilkan dua.
    //
    // Kolom terisi BUKAN bukti mesinnya dipakai — itulah yang membuat cacat
    // aslinya lolos. Yang membedakan: jejak di `approval_progress`.
    const { rows } = await client.query(
      `SELECT level, approved_by FROM approval_progress
        WHERE entity_type = 'rencana_mutu' AND entity_id = $1`, [rmpId])
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].approved_by).not.toBeNull()
  })

  it('persetujuan kedua BERURUTAN ditolak pemeriksaan aplikasi', async () => {
    const r = await kirim('POST', `/api/v1/rencana-mutu/${rmpId}/setujui`)
    expect(r.statusCode).toBe(409)
  })

  it('dua persetujuan BERSAMAAN: tepat satu berhasil — dijaga BASIS, bukan aplikasi', async () => {
    // ── Kenapa test ini ada, dan kenapa yang di atas TIDAK CUKUP ──────────
    //
    // Versi pertama test ini memanggil endpoint dua kali berurutan dan
    // mengharap 409. Ia HIJAU — tetapi juga hijau ketika `.neq('status',
    // 'disetujui')` dilepas dari query, terbukti lewat mutasi sengaja.
    // Yang diujinya ternyata pemeriksaan `bolehDisetujui` di aplikasi, bukan
    // penjaga di basis.
    //
    // Justru pemeriksaan aplikasi itulah yang tak bisa diandalkan: dua
    // permintaan yang tiba bersamaan sama-sama membacanya sebagai 'draf'
    // SEBELUM salah satunya menulis. Yang menghentikan yang kedua hanya
    // status lama di WHERE — dan itu hanya terlihat kalau keduanya
    // benar-benar berlomba. `audit-klaim-status-atomik.mjs` ada untuk ini.
    const { rows } = await client.query(
      `INSERT INTO rencana_mutu (project_id, nomor, judul, standar_acuan, sasaran_mutu, dibuat_oleh)
       VALUES ($1, '[TEST] RMP-LOMBA', 'Uji lomba', 'SNI', 'sasaran', $2)
       RETURNING id`, [projectId, userId])
    await client.query(
      `INSERT INTO itp_titik (rencana_mutu_id, tahap_pekerjaan, uraian, jenis_titik, kriteria)
       VALUES ($1, 'Pembesian', 'Tulangan', 'hold', 'sesuai gambar')`, [rows[0].id])

    const url = `/api/v1/rencana-mutu/${rows[0].id}/setujui`
    const [a, b] = await Promise.all([kirim('POST', url), kirim('POST', url)])

    const kode = [a.statusCode, b.statusCode].sort()
    expect(kode).toEqual([200, 409])

    // Dan yang tercatat tetap SATU persetujuan.
    const { rows: cek } = await client.query(
      `SELECT status, disetujui_oleh FROM rencana_mutu WHERE id = $1`, [rows[0].id])
    expect(cek[0].status).toBe('disetujui')
    expect(cek[0].disetujui_oleh).not.toBeNull()
  })

  it('ITP dokumen yang SUDAH disetujui tak bisa ditambah diam-diam', async () => {
    const r = await kirim('POST', `/api/v1/rencana-mutu/${rmpId}/titik`, {
      tahap_pekerjaan: 'Titik selundupan', uraian: 'x', jenis_titik: 'hold',
    })
    // Persetujuan mengikat pada ISI yang disetujui. Menambah HOLP sesudahnya
    // mengubah apa yang menahan pekerjaan tanpa sepengetahuan penandatangan.
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/revisi/i)
  })
})
