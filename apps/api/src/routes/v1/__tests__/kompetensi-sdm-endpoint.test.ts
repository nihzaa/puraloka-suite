import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import kompetensiSdmRoutes from '../kompetensi-sdm.js'

/**
 * SERTIFIKASI · KINERJA · REKRUTMEN terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 33 test di `lib/__tests__/kompetensi-sdm.test.ts`
 * (15 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rantai tenancy `sertifikat_pegawai`/`penilaian_kinerja` lewat `pegawai_id`
 *   • `POST /periksa-syarat` membaca sertifikat SELURUH pegawai dan menolak
 *     yang kedaluwarsa — inti alasan modul ini ada
 *   • sertifikat BERJANGKA tanpa tanggal ditolak di aplikasi DAN basis
 *   • penilaian FINAL tak bisa diubah diam-diam
 *   • tahap lamaran tak bisa mundur, dan `diterima` wajib berpegawai
 *   • dua perpindahan tahap bersamaan hanya satu yang berhasil
 *
 * Fixture berprefiks [TEST-KM] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let companyId: string
let pegawaiId: string
let pegawaiId2: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(
    `DELETE FROM lamaran_kerja WHERE nama LIKE '[TEST-KM]%'`)
  await client.query(
    `DELETE FROM sertifikat_pegawai WHERE pegawai_id IN
       (SELECT id FROM pegawai WHERE nomor_induk LIKE '[TEST-KM]%')`)
  await client.query(
    `DELETE FROM penilaian_kinerja WHERE pegawai_id IN
       (SELECT id FROM pegawai WHERE nomor_induk LIKE '[TEST-KM]%')`)
  await client.query(`DELETE FROM pegawai WHERE nomor_induk LIKE '[TEST-KM]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT company_id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  companyId = p[0].company_id

  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM pegawai g WHERE g.user_id = u.id AND g.company_id = $1)
      LIMIT 2`, [companyId])

  const { rows: g1 } = await client.query(
    `INSERT INTO pegawai (user_id, company_id, nomor_induk, jabatan)
     VALUES ($1, $2, '[TEST-KM]001', 'Site Engineer uji') RETURNING id`,
    [u[0].id, companyId])
  pegawaiId = g1[0].id

  const { rows: g2 } = await client.query(
    `INSERT INTO pegawai (user_id, company_id, nomor_induk, jabatan)
     VALUES ($1, $2, '[TEST-KM]002', 'Drafter uji') RETURNING id`,
    [u[1].id, companyId])
  pegawaiId2 = g2[0].id

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(kompetensiSdmRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST /sdm/pegawai/:id/sertifikat', () => {
  it('BERJANGKA tanpa tanggal ditolak dengan pesan yang menjelaskan', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/sertifikat`, {
      jenis: 'SKA', nama: '[TEST-KM] Tanpa tanggal',
    })
    expect(r.statusCode).toBe(400)
    // Bukan pesan constraint mentah — dan menyebutkan JALAN KELUARNYA.
    expect(r.json().error).toMatch(/seumur hidup/i)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('SEUMUR HIDUP diterima tanpa tanggal', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/sertifikat`, {
      jenis: 'Ijazah', nama: '[TEST-KM] S1 Teknik Sipil', berjangka: false,
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().sertifikat.berjangka).toBe(false)
  })

  it('sertifikat berjangka tersimpan dengan tanggalnya', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/sertifikat`, {
      jenis: 'SKA', nama: '[TEST-KM] Ahli Madya', kualifikasi: '[TEST-KM] Ahli Madya',
      klasifikasi: 'Teknik Bangunan Gedung',
      tanggal_terbit: '2024-01-15', berlaku_sampai: '2027-01-15',
    })
    expect(r.statusCode).toBe(201)
  })

  it('kedaluwarsa mendahului terbit ditolak BASIS', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/sertifikat`, {
      jenis: 'SKT', nama: '[TEST-KM] Terbalik',
      tanggal_terbit: '2026-06-01', berlaku_sampai: '2026-01-01',
    })
    expect(r.statusCode).toBe(400)
  })

  it('404 untuk pegawai yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/sdm/pegawai/00000000-0000-0000-0000-0000000000ff/sertifikat',
      { jenis: 'SKA', nama: 'x', berlaku_sampai: '2027-01-01' })
    expect(r.statusCode).toBe(404)
  })
})

describe('GET /sdm/pegawai/:id/kompetensi', () => {
  it('sertifikat terbaca lewat rantai tenancy-nya sendiri', async () => {
    // `sertifikat_pegawai` lewat `pegawai_id`. Memberi id proyek ke
    // `viaProject` menghasilkan nol baris tanpa GALAT.
    const r = await get(`/api/v1/sdm/pegawai/${pegawaiId}/kompetensi?pada=2026-08-11`)
    expect(r.statusCode).toBe(200)
    expect(r.json().sertifikat.baris.length).toBeGreaterThan(0)
  })

  it('dinilai terhadap TANGGAL ACUAN, bukan hari ini', async () => {
    // Sertifikat berlaku sampai 2027-01-15.
    const sebelum = (await get(
      `/api/v1/sdm/pegawai/${pegawaiId}/kompetensi?pada=2026-08-11`)).json()
    const sesudah = (await get(
      `/api/v1/sdm/pegawai/${pegawaiId}/kompetensi?pada=2027-06-01`)).json()

    // Prakualifikasi yang diajukan bulan lalu diperiksa dengan keadaan bulan
    // lalu — sertifikat yang habis kemudian tak membatalkan penawaran lama.
    expect(sebelum.sertifikat.kedaluwarsa).toBe(0)
    expect(sesudah.sertifikat.kedaluwarsa).toBeGreaterThan(0)
  })

  it('tanggal acuan berformat salah ditolak', async () => {
    const r = await get(`/api/v1/sdm/pegawai/${pegawaiId}/kompetensi?pada=11 Agustus`)
    expect(r.statusCode).toBe(400)
  })
})

/**
 * ── Kenapa kualifikasinya berprefiks `[TEST-KM]`
 *
 * Semula test ini memakai `'Ahli Madya'` — kualifikasi SUNGGUHAN, dan itu
 * membuatnya merah selamanya di basis yang punya data dummy: `PEG-001`
 * memegang SKA Ahli Madya yang berlaku sampai 2027.
 *
 * Akibatnya, test "syarat 2 orang TIDAK terpenuhi karena satu sertifikat
 * mati" justru menemukan DUA yang hidup (satu fixture + satu dummy) dan
 * menjawab `cukup: true`. Yang gagal test-nya, bukan kodenya — tetapi
 * pesannya menunjuk logika periksa-syarat, jadi ia terbaca sebagai cacat
 * modul.
 *
 * Prefiks membuat kualifikasi ini milik test seorang diri, sama seperti
 * `nomor_induk` dan `nama` di berkas ini. Pelajaran yang sama sudah dibayar
 * di test markup, baseline, dan k3-lapangan pada sesi 2026-08-12: **test
 * yang mengandaikan basis kosong akan merah pada orang berikutnya.**
 */
describe('POST /sdm/periksa-syarat — inti alasan modul ini ada', () => {
  beforeAll(async () => {
    // Pegawai kedua: SKA yang SUDAH kedaluwarsa.
    await client.query(
      `INSERT INTO sertifikat_pegawai (pegawai_id, jenis, nama, kualifikasi,
                                       tanggal_terbit, berlaku_sampai, berjangka)
       VALUES ($1, 'SKA', '[TEST-KM] Mati', '[TEST-KM] Ahli Madya',
               '2020-01-01', '2025-01-01', true)`, [pegawaiId2])
  })

  it('syarat terpenuhi oleh sertifikat yang MASIH berlaku', async () => {
    const r = await kirim('POST', '/api/v1/sdm/periksa-syarat', {
      pada: '2026-08-11',
      syarat: [{ jenis: 'SKA', kualifikasi: '[TEST-KM] Ahli Madya', jumlah: 1 }],
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().semua_terpenuhi).toBe(true)
  })

  it('sertifikat KEDALUWARSA tidak menghitung', async () => {
    // Dua pegawai punya SKA Ahli Madya, tapi satu sudah mati. Syarat 2 orang
    // TIDAK terpenuhi.
    const r = await kirim('POST', '/api/v1/sdm/periksa-syarat', {
      pada: '2026-08-11',
      syarat: [{ jenis: 'SKA', kualifikasi: '[TEST-KM] Ahli Madya', jumlah: 2 }],
    })
    const h = r.json().hasil[0]
    // Tender yang dipenuhi sertifikat kedaluwarsa adalah dokumen palsu di
    // mata panitia.
    expect(h.cukup).toBe(false)
    expect(h.pemenuhi.map((x: { pegawai_id: string }) => x.pegawai_id))
      .not.toContain(pegawaiId2)
  })

  it('pada tanggal SAAT sertifikat itu masih hidup, ia menghitung', async () => {
    const r = await kirim('POST', '/api/v1/sdm/periksa-syarat', {
      pada: '2024-06-01',
      syarat: [{ jenis: 'SKA', kualifikasi: '[TEST-KM] Ahli Madya', jumlah: 1 }],
    })
    const h = r.json().hasil[0]
    expect(h.pemenuhi.map((x: { pegawai_id: string }) => x.pegawai_id))
      .toContain(pegawaiId2)
  })

  it('syarat kosong ditolak', async () => {
    const r = await kirim('POST', '/api/v1/sdm/periksa-syarat', { syarat: [] })
    expect(r.statusCode).toBe(400)
  })

  it('syarat tanpa jumlah yang sah ditolak', async () => {
    const r = await kirim('POST', '/api/v1/sdm/periksa-syarat', {
      syarat: [{ jenis: 'SKA', jumlah: 0 }],
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('POST /sdm/pegawai/:id/penilaian', () => {
  it('skor di luar skala ditolak dengan pesan yang menjelaskan akibatnya', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/penilaian`, {
      periode: '2026-S1', skala_maks: 5, skor: 7,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/rata-rata/i)
  })

  it('finalkan tanpa skor ditolak', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/penilaian`, {
      periode: '2026-S1', finalkan: true,
    })
    expect(r.statusCode).toBe(400)
  })

  it('penilaian draf tersimpan', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/penilaian`, {
      periode: '2026-S1', skala_maks: 5, skor: 4,
      kekuatan: 'Teliti dalam pemeriksaan mutu',
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().penilaian.status).toBe('draf')
  })

  it('mengisi ulang periode yang sama MEMPERBARUI, tak menumpuk', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/penilaian`, {
      periode: '2026-S1', skala_maks: 5, skor: 5,
    })
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT count(*)::int n FROM penilaian_kinerja
        WHERE pegawai_id = $1 AND periode = '2026-S1'`, [pegawaiId])
    expect(rows[0].n).toBe(1)
  })

  it('penilai diisi dari SESI saat difinalkan', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/penilaian`, {
      periode: '2026-S1', skala_maks: 5, skor: 4, finalkan: true,
      penilai: '00000000-0000-0000-0000-0000000000ff',
    })
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT penilai, dinilai_pada FROM penilaian_kinerja
        WHERE pegawai_id = $1 AND periode = '2026-S1'`, [pegawaiId])
    expect(rows[0].penilai).not.toBe('00000000-0000-0000-0000-0000000000ff')
    expect(rows[0].dinilai_pada).not.toBeNull()
  })

  it('yang sudah FINAL tak bisa diubah diam-diam', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/penilaian`, {
      periode: '2026-S1', skala_maks: 5, skor: 1,
    })
    // Penilaian yang sudah disampaikan ke pegawai adalah dasar keputusan
    // tentang orang.
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/periode baru/i)
  })

  it('skor dinormalkan ke persen di ringkasan', async () => {
    const j = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/kompetensi`)).json()
    // 4 dari 5 = 80%.
    expect(j.kinerja.rata_final).toBe(80)
  })
})

describe('POST /sdm/lamaran & tahapnya', () => {
  let lamaranId: string

  it('lamaran baru tercatat di tahap `masuk`', async () => {
    const r = await kirim('POST', '/api/v1/sdm/lamaran', {
      nama: '[TEST-KM] Pelamar Uji', posisi: 'Drafter', sumber: 'Referensi',
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().lamaran.tahap).toBe('masuk')
    lamaranId = r.json().lamaran.id
  })

  it('maju tahap boleh, termasuk melompat', async () => {
    const r = await kirim('POST', `/api/v1/sdm/lamaran/${lamaranId}/tahap`, {
      tahap: 'wawancara', catatan: 'Rujukan internal, lewati seleksi berkas',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().lamaran.tahap).toBe('wawancara')
  })

  it('MUNDUR ditolak', async () => {
    const r = await kirim('POST', `/api/v1/sdm/lamaran/${lamaranId}/tahap`, {
      tahap: 'masuk',
    })
    // Mundur menghapus jejak bahwa tahap itu pernah dilewati.
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/mundur/i)
  })

  it('DITERIMA tanpa pegawai_id ditolak', async () => {
    const r = await kirim('POST', `/api/v1/sdm/lamaran/${lamaranId}/tahap`, {
      tahap: 'diterima',
    })
    // Lamaran "diterima" tanpa pegawai adalah pernyataan yang tak bisa
    // ditelusuri: siapa yang masuk?
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/data pegawainya/i)
  })

  it('penolakan WAJIB beralasan', async () => {
    const r = await kirim('POST', `/api/v1/sdm/lamaran/${lamaranId}/tahap`, {
      tahap: 'ditolak',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/dihubungi lagi/i)
  })

  it('DITERIMA dengan pegawai_id berhasil', async () => {
    const r = await kirim('POST', `/api/v1/sdm/lamaran/${lamaranId}/tahap`, {
      tahap: 'diterima', pegawai_id: pegawaiId2,
      catatan: 'Mulai bekerja 1 September',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().lamaran.pegawai_id).toBe(pegawaiId2)
  })

  it('dari DITERIMA tak bisa dipindah lagi — termasuk ke ditolak', async () => {
    const r = await kirim('POST', `/api/v1/sdm/lamaran/${lamaranId}/tahap`, {
      tahap: 'ditolak', catatan: 'berubah pikiran',
    })
    // Orang yang sudah diterima jadi pegawai tak boleh "ditolak" belakangan —
    // itu meninggalkan lamaran ditolak yang tersambung ke pegawai aktif.
    expect(r.statusCode).toBe(422)
  })

  it('dua perpindahan BERSAMAAN ke tahap BERBEDA: tepat satu berhasil', async () => {
    // ── Kenapa tujuannya harus BERBEDA ────────────────────────────────────
    //
    // Versi pertama mengirim `wawancara` dua kali dan mendapat [200, 422]:
    // permintaan kedua ditolak `bolehPindahTahap` ("tahapnya sudah itu")
    // SEBELUM menyentuh query. Yang teruji pemeriksaan APLIKASI, bukan
    // penjaga di basis — kelemahan yang sama sudah ditemukan di G1e & G1f.
    //
    // Dengan tujuan berbeda, keduanya lolos pemeriksaan aplikasi dan
    // benar-benar berlomba. Yang menghentikan yang kedua hanya
    // `.eq('tahap', <tahap lama>)` di WHERE.
    const { rows } = await client.query(
      `INSERT INTO lamaran_kerja (company_id, nama, posisi, tahap, dicatat_oleh)
       VALUES ($1, '[TEST-KM] Lomba', 'QS', 'masuk',
               (SELECT id FROM users LIMIT 1)) RETURNING id`, [companyId])
    const url = `/api/v1/sdm/lamaran/${rows[0].id}/tahap`
    const [a, b] = await Promise.all([
      kirim('POST', url, { tahap: 'seleksi_berkas' }),
      kirim('POST', url, { tahap: 'wawancara' }),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])

    // Dan tahapnya TIDAK jadi campuran keduanya.
    const { rows: cek } = await client.query(
      `SELECT tahap FROM lamaran_kerja WHERE id = $1`, [rows[0].id])
    expect(['seleksi_berkas', 'wawancara']).toContain(cek[0].tahap)
  })
})
