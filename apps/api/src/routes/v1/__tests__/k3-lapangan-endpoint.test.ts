import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import k3LapanganRoutes from '../k3-lapangan.js'

/**
 * K3 LAPANGAN terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 63 test di `lib/__tests__/k3-lapangan.test.ts`
 * (29 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rantai tenancy `temuan_k3` lewat `inspeksi_id` dan `jsa_langkah` lewat
 *     `jsa_id` — BUKAN project_id. Salah argumen `viaProject` mengembalikan
 *     NOL BARIS tanpa galat, dan layarnya berkata "tak ada temuan".
 *   • `jsa_langkah.skor` benar-benar kolom TERHITUNG di basis
 *   • trigger tanggal-insiden-di-masa-depan
 *   • `GET /k3/selaras` membaca `evaluasi_subkon` NYATA (kategori B) dan
 *     membandingkannya dengan insiden — inti G4
 *   • dua penutupan insiden BERSAMAAN hanya satu yang berhasil
 *
 * Fixture berprefiks [TEST-K3] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let companyId: string
let supplierId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST' | 'PATCH', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

const hariIni = () => new Date().toISOString().slice(0, 10)

async function purge() {
  await client.query(
    `DELETE FROM temuan_k3 WHERE inspeksi_id IN
       (SELECT id FROM inspeksi_k3 WHERE area LIKE '[TEST-K3]%')`)
  await client.query(`DELETE FROM inspeksi_k3 WHERE area LIKE '[TEST-K3]%'`)
  await client.query(`DELETE FROM insiden_k3 WHERE kronologi LIKE '[TEST-K3]%'`)
  await client.query(
    `DELETE FROM jsa_langkah WHERE jsa_id IN
       (SELECT id FROM jsa WHERE jenis_pekerjaan LIKE '[TEST-K3]%')`)
  await client.query(`DELETE FROM jsa WHERE jenis_pekerjaan LIKE '[TEST-K3]%'`)
  await client.query(`DELETE FROM induksi_k3 WHERE peserta_nama LIKE '[TEST-K3]%'`)
  await client.query(`DELETE FROM apd_serah_terima WHERE jenis_apd LIKE '[TEST-K3]%'`)
  await client.query(`DELETE FROM pemantauan_lingkungan WHERE parameter LIKE '[TEST-K3]%'`)
  await client.query(`DELETE FROM evaluasi_subkon WHERE catatan LIKE '[TEST-K3]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id, company_id FROM projects
      WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  projectId = p[0].id
  companyId = p[0].company_id

  const { rows: s } = await client.query(
    `SELECT id FROM suppliers WHERE company_id = $1 LIMIT 1`, [companyId])
  supplierId = s[0]?.id

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(k3LapanganRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

async function buatInsiden(over: Record<string, unknown> = {}) {
  return kirim('POST', `/api/v1/proyek/${projectId}/k3/insiden`, {
    jenis: 'nyaris_celaka',
    kronologi: '[TEST-K3] Material hampir jatuh dari lantai tiga saat diangkat',
    ...over,
  })
}

describe('POST /proyek/:id/k3/insiden', () => {
  it('nyaris celaka tercatat tanpa korban', async () => {
    const r = await buatInsiden()
    expect(r.statusCode).toBe(201)
    expect(r.json().insiden.jenis).toBe('nyaris_celaka')
  })

  it('kronologi terlalu pendek ditolak dengan alasan yang menjelaskan', async () => {
    const r = await buatInsiden({ kronologi: 'jatuh' })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/berbulan-bulan kemudian/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('MELUKAI tanpa korban ditolak APLIKASI, bukan basis', async () => {
    const r = await buatInsiden({
      jenis: 'kecelakaan_ringan', melukai: true,
      kronologi: '[TEST-K3] Pekerja terpeleset di area yang basah',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/siapa yang diobati/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('melukai DENGAN korban diterima', async () => {
    const r = await buatInsiden({
      jenis: 'kecelakaan_ringan', melukai: true, korban_nama: 'Budi Santoso',
      hari_kerja_hilang: 3,
      kronologi: '[TEST-K3] Pekerja terpeleset di area yang basah',
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().insiden.hari_kerja_hilang).toBe(3)
  })

  it('TANGGAL DI MASA DEPAN ditolak sebelum menyentuh trigger', async () => {
    const besok = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const r = await buatInsiden({ tanggal: besok })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/masa depan/)
    // Pesan trigger DB tak boleh sampai ke pengguna.
    expect(r.json().error).toMatch(/rekap keselamatan/)
  })

  it('jenis tak dikenal ditolak dengan daftar yang sah', async () => {
    const r = await buatInsiden({ jenis: 'kesialan' })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/nyaris_celaka/)
  })

  it('hari kerja hilang negatif ditolak APLIKASI, bukan basis', async () => {
    const r = await buatInsiden({ hari_kerja_hilang: -1 })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/hari_kerja_hilang harus bilangan bulat >= 0/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('hari kerja hilang pecahan ditolak APLIKASI', async () => {
    const r = await buatInsiden({ hari_kerja_hilang: 1.5 })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/bilangan bulat/)
  })

  it('biaya negatif ditolak APLIKASI, bukan basis', async () => {
    const r = await buatInsiden({ biaya_akibat: -1 })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/biaya_akibat harus angka >= 0/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('404 untuk proyek yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/proyek/00000000-0000-0000-0000-0000000000ff/k3/insiden',
      { jenis: 'nyaris_celaka', kronologi: 'Kronologi yang cukup panjang' })
    expect(r.statusCode).toBe(404)
  })
})

describe('PATCH /k3/insiden/:id', () => {
  it('menutup insiden tanpa tindakan korektif ditolak', async () => {
    const b = await buatInsiden()
    const r = await kirim('PATCH', `/api/v1/k3/insiden/${b.json().insiden.id}`, {
      status: 'ditutup',
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/menunggu terulang/)
  })

  it('tindakan korektif terlalu pendek juga ditolak', async () => {
    const b = await buatInsiden()
    const r = await kirim('PATCH', `/api/v1/k3/insiden/${b.json().insiden.id}`, {
      status: 'ditutup', tindakan_korektif: 'sudah',
    })
    expect(r.statusCode).toBe(422)
  })

  it('menutup dengan korektif berhasil dan bertanggal', async () => {
    const b = await buatInsiden()
    const r = await kirim('PATCH', `/api/v1/k3/insiden/${b.json().insiden.id}`, {
      status: 'ditutup',
      tindakan_korektif: 'Pasang jaring pengaman di seluruh sisi lantai tiga',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().insiden.ditutup_pada).toBeTruthy()
  })

  it('korektif yang SUDAH tersimpan cukup untuk menutup belakangan', async () => {
    const b = await buatInsiden()
    const id = b.json().insiden.id
    await kirim('PATCH', `/api/v1/k3/insiden/${id}`, {
      tindakan_korektif: 'Pasang jaring pengaman di seluruh sisi lantai tiga',
    })
    // Penutupan berikutnya TANPA mengirim ulang korektif harus lolos —
    // memakai nilai lama, bukan hanya payload.
    const r = await kirim('PATCH', `/api/v1/k3/insiden/${id}`, { status: 'ditutup' })
    expect(r.statusCode).toBe(200)
  })

  it('menyunting tanpa mengubah status TIDAK menuntut status lama di WHERE', async () => {
    const b = await buatInsiden()
    const r = await kirim('PATCH', `/api/v1/k3/insiden/${b.json().insiden.id}`, {
      penyebab_dasar: 'Tali angkat tak diperiksa sebelum dipakai',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().insiden.penyebab_dasar).toMatch(/Tali angkat/)
  })

  it('DUA penutupan BERSAMAAN: hanya satu yang berhasil', async () => {
    const b = await buatInsiden()
    const id = b.json().insiden.id
    await kirim('PATCH', `/api/v1/k3/insiden/${id}`, {
      tindakan_korektif: 'Pasang jaring pengaman di seluruh sisi lantai tiga',
    })

    // TUJUAN BERBEDA — kalau sama, permintaan kedua ditolak pemeriksaan
    // aplikasi sebelum menyentuh query, dan yang teruji adalah pemeriksaan
    // itu, bukan `.eq('status', dari)` di WHERE. Kesalahan yang sama sudah
    // terjadi di G1e, G1f, G2e, dan G3.
    const [a, c] = await Promise.all([
      kirim('PATCH', `/api/v1/k3/insiden/${id}`, { status: 'diselidiki' }),
      kirim('PATCH', `/api/v1/k3/insiden/${id}`, { status: 'tindakan_berjalan' }),
    ])
    expect([a.statusCode, c.statusCode].sort()).toEqual([200, 409])
  })

  it('status insiden tak dikenal ditolak dengan daftar yang sah', async () => {
    const bb = await buatInsiden()
    const r = await kirim('PATCH', `/api/v1/k3/insiden/${bb.json().insiden.id}`, {
      status: 'dibatalkan',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tindakan_berjalan/)
    expect(r.json().error).not.toMatch(/invalid input value for enum/)
  })

  it('404 untuk insiden yang tak ada', async () => {
    const r = await kirim('PATCH',
      '/api/v1/k3/insiden/00000000-0000-0000-0000-0000000000ff', { catatan: 'x' })
    expect(r.statusCode).toBe(404)
  })
})

describe('JSA — rantai tenancy lewat jsa_id', () => {
  it('skor DIHITUNG basis, bukan dikirim klien', async () => {
    const j = await kirim('POST', '/api/v1/k3/jsa', {
      jenis_pekerjaan: '[TEST-K3] Bekerja di ketinggian',
    })
    expect(j.statusCode).toBe(201)

    const l = await kirim('POST', `/api/v1/k3/jsa/${j.json().jsa.id}/langkah`, {
      langkah: 'Naik perancah', bahaya: 'Jatuh dari ketinggian',
      pengendalian: 'Harness dikaitkan ke life line', dampak: 5, kemungkinan: 4,
    })
    expect(l.statusCode).toBe(201)
    expect(l.json().langkah.skor).toBe(20)
  })

  it('langkah SETIAP JSA terbaca, bukan hanya yang pertama', async () => {
    // Membuktikan `viaProject('jsa_langkah', <jsa_id>)` memakai argumen yang
    // BENAR, dan bacanya menyaring ke SELURUH id — bukan satu.
    //
    // Mutasi membuktikan versi pertama test ini tak cukup: menyaring ke
    // `[ids[0]]` tetap hijau, karena "ada satu JSA berlangkah" tetap benar.
    // Yang membedakan: DUA JSA yang keduanya berlangkah.
    const nama = ['[TEST-K3] Dua JSA A', '[TEST-K3] Dua JSA B']
    for (const n of nama) {
      const j = await kirim('POST', '/api/v1/k3/jsa', { jenis_pekerjaan: n })
      await kirim('POST', `/api/v1/k3/jsa/${j.json().jsa.id}/langkah`, {
        langkah: 'Langkah ' + n, bahaya: 'Bahaya', pengendalian: 'Pengendalian',
      })
    }

    const r = await get('/api/v1/k3/jsa')
    expect(r.statusCode).toBe(200)
    const dua = r.json().jsa.filter(
      (j: { jenis_pekerjaan: string }) => nama.includes(j.jenis_pekerjaan))
    expect(dua).toHaveLength(2)
    // KEDUANYA harus punya langkahnya masing-masing.
    for (const j of dua) expect(j.langkah.length).toBeGreaterThan(0)
  })

  it('langkah tanpa pengendalian ditolak dengan alasan yang menjelaskan', async () => {
    const j = await kirim('POST', '/api/v1/k3/jsa', {
      jenis_pekerjaan: '[TEST-K3] Tanpa pengendalian',
    })
    const r = await kirim('POST', `/api/v1/k3/jsa/${j.json().jsa.id}/langkah`, {
      langkah: 'a', bahaya: 'b', pengendalian: '   ',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/daftar bahaya, bukan analisa/)
  })

  it('risiko sisa yang MENAIKKAN ditolak', async () => {
    const j = await kirim('POST', '/api/v1/k3/jsa', {
      jenis_pekerjaan: '[TEST-K3] Sisa naik',
    })
    const r = await kirim('POST', `/api/v1/k3/jsa/${j.json().jsa.id}/langkah`, {
      langkah: 'a', bahaya: 'b', pengendalian: 'c',
      dampak: 2, kemungkinan: 2, dampak_sisa: 5, kemungkinan_sisa: 5,
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/LEBIH TINGGI/)
  })

  it('skala di luar 1..5 ditolak APLIKASI, pesannya bisa dibaca', async () => {
    const j = await kirim('POST', '/api/v1/k3/jsa', {
      jenis_pekerjaan: '[TEST-K3] Skala salah',
    })
    const id = j.json().jsa.id
    for (const [medan, nilai] of [['dampak', 6], ['kemungkinan', 0], ['dampak', 2.5]] as const) {
      const r = await kirim('POST', `/api/v1/k3/jsa/${id}/langkah`, {
        langkah: 'a', bahaya: 'b', pengendalian: 'c', [medan]: nilai,
      })
      expect(r.statusCode).toBe(400)
      expect(r.json().error).toMatch(/1–5/)
      expect(r.json().error).not.toMatch(/violates check constraint/)
    }
  })

  it('404 untuk JSA yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/k3/jsa/00000000-0000-0000-0000-0000000000ff/langkah',
      { langkah: 'a', bahaya: 'b', pengendalian: 'c' })
    expect(r.statusCode).toBe(404)
  })

  it('jenis pekerjaan kosong ditolak', async () => {
    const r = await kirim('POST', '/api/v1/k3/jsa', { jenis_pekerjaan: '   ' })
    expect(r.statusCode).toBe(400)
  })
})

describe('inspeksi & temuan — rantai tenancy lewat inspeksi_id', () => {
  it('temuan terbaca kembali di ikhtisar proyek', async () => {
    const i = await kirim('POST', `/api/v1/proyek/${projectId}/k3/inspeksi`, {
      area: '[TEST-K3] Area las', tanggal: '2026-08-01',
    })
    expect(i.statusCode).toBe(201)

    const t = await kirim('POST', `/api/v1/k3/inspeksi/${i.json().inspeksi.id}/temuan`, {
      uraian: 'APD tak dipakai di area las', kategori: 'APD', tingkat: 3,
    })
    expect(t.statusCode).toBe(201)
    // Kategori dinormalkan huruf kecil — supaya "APD" dan "apd" tak jadi
    // dua kategori berbeda saat mencari pengulangan.
    expect(t.json().temuan.kategori).toBe('apd')

    const r = await get(`/api/v1/proyek/${projectId}/k3?pada=2026-08-12`)
    expect(r.statusCode).toBe(200)
    const ada = r.json().temuan.some(
      (x: { uraian: string }) => x.uraian === 'APD tak dipakai di area las')
    expect(ada).toBe(true)
  })

  it('temuan BERULANG terkumpul lintas inspeksi', async () => {
    for (const tgl of ['2026-06-01', '2026-07-01']) {
      const i = await kirim('POST', `/api/v1/proyek/${projectId}/k3/inspeksi`, {
        area: '[TEST-K3] Area las', tanggal: tgl,
      })
      await kirim('POST', `/api/v1/k3/inspeksi/${i.json().inspeksi.id}/temuan`, {
        uraian: 'APD tak dipakai di area las', kategori: 'apd', tingkat: 2,
      })
    }
    const r = await get(`/api/v1/proyek/${projectId}/k3?pada=2026-08-12`)
    const berulang = r.json().rekap_temuan.berulang
    const apd = berulang.find((b: { kategori: string }) => b.kategori === 'apd')
    expect(apd).toBeTruthy()
    expect(apd.jumlah).toBeGreaterThanOrEqual(3)
    expect(apd.pertama <= apd.terakhir).toBe(true)
  })

  it('tingkat di luar 1..3 ditolak APLIKASI, pesannya bisa dibaca', async () => {
    const i = await kirim('POST', `/api/v1/proyek/${projectId}/k3/inspeksi`, {
      area: '[TEST-K3] Tingkat salah',
    })
    const id = i.json().inspeksi.id
    for (const t of [4, 0, 2.5]) {
      const r = await kirim('POST', `/api/v1/k3/inspeksi/${id}/temuan`, {
        uraian: 'x', tingkat: t,
      })
      expect(r.statusCode).toBe(400)
      expect(r.json().error).toMatch(/tingkat harus 1, 2, atau 3/)
      expect(r.json().error).not.toMatch(/violates check constraint/)
    }
  })

  it('menutup temuan mencatat siapa dan kapan — constraint DB menuntutnya', async () => {
    const i = await kirim('POST', `/api/v1/proyek/${projectId}/k3/inspeksi`, {
      area: '[TEST-K3] Tutup temuan',
    })
    const t = await kirim('POST', `/api/v1/k3/inspeksi/${i.json().inspeksi.id}/temuan`, {
      uraian: 'Tangga rusak', kategori: 'peralatan',
    })
    const r = await kirim('PATCH', `/api/v1/k3/temuan/${t.json().temuan.id}`, {
      status: 'ditutup',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().temuan.ditutup_pada).toBeTruthy()
  })

  it('404 untuk inspeksi yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/k3/inspeksi/00000000-0000-0000-0000-0000000000ff/temuan',
      { uraian: 'x' })
    expect(r.statusCode).toBe(404)
  })
})

describe('GET /proyek/:id/k3/selaras — INTI G4', () => {
  it('menandai evaluasi yang angkanya TIDAK cocok dengan insiden', async () => {
    if (!supplierId) return // basis tanpa supplier — dilewati

    await buatInsiden({
      jenis: 'kecelakaan_berat', melukai: true, korban_nama: 'Agus',
      supplier_id: supplierId, tanggal: '2026-07-15',
      kronologi: '[TEST-K3] Tertimpa material saat bongkar muat',
    })

    // Evaluasi menulis NOL padahal ada 1 kecelakaan tercatat — akibatnya
    // nyata: subkon yang seharusnya gugur tetap dipakai.
    await client.query(
      `INSERT INTO evaluasi_subkon
         (company_id, project_id, supplier_id, pihak_nama, periode,
          skor_mutu, skor_waktu, skor_k3, skor_kepatuhan, skor_kerjasama,
          jumlah_kecelakaan, catatan)
       VALUES ($1,$2,$3,'[TEST-K3] Subkon uji','2026-07-01',
               80,80,80,80,80, 0, '[TEST-K3] evaluasi uji')`,
      [companyId, projectId, supplierId])

    const r = await get(
      `/api/v1/proyek/${projectId}/k3/selaras?dari=2026-07-01&sampai=2026-07-31`)
    expect(r.statusCode).toBe(200)

    const t = r.json().tak_selaras.find(
      (x: { pihak_nama: string }) => x.pihak_nama?.startsWith('[TEST-K3]'))
    expect(t).toBeTruthy()
    expect(t.diketik).toBe(0)
    expect(t.dihitung).toBe(1)
    // Id insidennya ikut — supaya yang dinilai bisa diperlihatkan insiden
    // MANA yang dimaksud.
    expect(t.insiden_id).toHaveLength(1)
  })

  it('rentang tanggal menyaring — periode ini tak dibebani periode lalu', async () => {
    if (!supplierId) return
    const r = await get(
      `/api/v1/proyek/${projectId}/k3/selaras?dari=2026-01-01&sampai=2026-01-31`)
    const t = r.json().periksa.find(
      (x: { pihak_nama: string }) => x.pihak_nama?.startsWith('[TEST-K3]'))
    // Di luar rentang → tak ada insiden → `null`, bukan `false`.
    expect(t?.selaras).toBeNull()
  })

  it('format tanggal salah ditolak', async () => {
    const r = await get(`/api/v1/proyek/${projectId}/k3/selaras?dari=01-07-2026`)
    expect(r.statusCode).toBe(400)
  })

  it('yang BELUM ADA INSIDENNYA tak masuk daftar tak_selaras', async () => {
    if (!supplierId) return
    // `null` bukan `false`: subkon tanpa insiden tercatat belum tentu salah,
    // bisa jadi belum didata. Memasukkannya ke `tak_selaras` membuat daftar
    // "yang perlu diperiksa" penuh baris yang tak perlu diperiksa — dan
    // daftar seperti itu berhenti dibaca.
    const r = await get(
      `/api/v1/proyek/${projectId}/k3/selaras?dari=2020-01-01&sampai=2020-12-31`)
    expect(r.statusCode).toBe(200)
    const adaNull = r.json().periksa.some(
      (p: { selaras: boolean | null }) => p.selaras === null)
    expect(adaNull).toBe(true)
    for (const t of r.json().tak_selaras) expect(t.selaras).toBe(false)
  })

  it('404 untuk proyek yang tak ada', async () => {
    const r = await get('/api/v1/proyek/00000000-0000-0000-0000-0000000000ff/k3/selaras')
    expect(r.statusCode).toBe(404)
  })
})

describe('induksi · APD · lingkungan', () => {
  it('induksi tanpa peserta ditolak dengan pesan yang bisa dibaca', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/k3/induksi`, {})
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tamu, pengemudi/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('induksi berlaku_sampai mendahului tanggal ditolak APLIKASI', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/k3/induksi`, {
      peserta_nama: '[TEST-K3] Tamu', tanggal: '2026-06-01',
      berlaku_sampai: '2026-01-01',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/mendahului/)
  })

  it('induksi tercatat dan masuk ikhtisar', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/k3/induksi`, {
      peserta_nama: '[TEST-K3] Tamu proyek', tanggal: '2026-08-01',
      materi: 'Pengenalan bahaya lokasi',
    })
    expect(r.statusCode).toBe(201)

    const g = await get(`/api/v1/proyek/${projectId}/k3?pada=2026-08-12`)
    expect(g.json().induksi.some(
      (x: { peserta_nama: string }) => x.peserta_nama === '[TEST-K3] Tamu proyek')).toBe(true)
  })

  it('APD tanpa penerima ditolak', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/k3/apd`, {
      jenis_apd: '[TEST-K3] Helm',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/diperiksa kondisinya/)
  })

  it('APD jumlah nol ditolak APLIKASI', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/k3/apd`, {
      jenis_apd: '[TEST-K3] Helm', penerima_nama: 'Budi', jumlah: 0,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/>= 1/)
  })

  it('APD tercatat dengan jatuh tempo penggantian', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/k3/apd`, {
      jenis_apd: '[TEST-K3] Harness', penerima_nama: 'Budi',
      jumlah: 2, tanggal: '2026-08-01', ganti_sebelum: '2027-08-01',
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().apd.jumlah).toBe(2)
  })

  it('pengukuran lingkungan TANPA SATUAN ditolak', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/k3/lingkungan`, {
      parameter: '[TEST-K3] Kebisingan', nilai: 55, satuan: '  ',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tiga kali ambang/)
  })

  it('pengukuran tanpa baku mutu tercatat, tapi tak dinyatakan aman', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/k3/lingkungan`, {
      parameter: '[TEST-K3] Debu', nilai: 12, satuan: 'µg/m³',
    })
    expect(r.statusCode).toBe(201)

    const g = await get(`/api/v1/proyek/${projectId}/k3?pada=2026-08-12`)
    expect(g.json().rekap_lingkungan.tanpa_pembanding).toBeGreaterThanOrEqual(1)
  })

  it('pengukuran MELEBIHI baku mutu terhitung', async () => {
    await kirim('POST', `/api/v1/proyek/${projectId}/k3/lingkungan`, {
      parameter: '[TEST-K3] Kebisingan', nilai: 88, satuan: 'dBA', baku_mutu: 70,
    })
    const g = await get(`/api/v1/proyek/${projectId}/k3?pada=2026-08-12`)
    expect(g.json().rekap_lingkungan.melebihi).toBeGreaterThanOrEqual(1)
  })
})

describe('GET /proyek/:id/k3 — ikhtisar', () => {
  it('TRIR null tanpa jam kerja, angka dengan jam kerja', async () => {
    const tanpa = await get(`/api/v1/proyek/${projectId}/k3?pada=2026-08-12`)
    expect(tanpa.json().trir).toBeNull()

    const dengan = await get(
      `/api/v1/proyek/${projectId}/k3?pada=2026-08-12&jam_kerja=100000`)
    expect(typeof dengan.json().trir).toBe('number')
  })

  it('jam kerja negatif ditolak', async () => {
    const r = await get(`/api/v1/proyek/${projectId}/k3?jam_kerja=-5`)
    expect(r.statusCode).toBe(400)
  })

  it('pada berformat salah ditolak', async () => {
    const r = await get(`/api/v1/proyek/${projectId}/k3?pada=12-08-2026`)
    expect(r.statusCode).toBe(400)
  })

  it('404 untuk proyek yang tak ada', async () => {
    const r = await get('/api/v1/proyek/00000000-0000-0000-0000-0000000000ff/k3')
    expect(r.statusCode).toBe(404)
  })

  it('persen induksi memakai pekerja PROYEK INI, bukan seluruh perusahaan', async () => {
    // Cacat yang ditemukan di LAYAR, bukan oleh test: kartu berbunyi
    // "3 dari 60 pekerja · 5%" untuk proyek yang sebenarnya punya 30 —
    // penyebutnya seluruh `workers` perusahaan. Angka seperti itu menuduh
    // proyek yang baik-baik saja, dan orang berhenti mempercayai kartunya.
    //
    // Rantainya: `mandor_assignments.mandor_id` -> `workers.mandor_id`.
    const { rows: proyekIni } = await client.query(
      `SELECT count(DISTINCT w.id)::int n FROM workers w
        WHERE w.is_active AND w.mandor_id IN
          (SELECT mandor_id FROM mandor_assignments WHERE project_id = $1)`,
      [projectId])
    const { rows: seluruh } = await client.query(
      `SELECT count(*)::int n FROM workers WHERE is_active AND company_id = $1`,
      [companyId])

    const r = await get(`/api/v1/proyek/${projectId}/k3?pada=2026-08-12`)
    expect(r.statusCode).toBe(200)
    expect(r.json().status_induksi.total_pekerja).toBe(proyekIni[0].n)

    // Kalau keduanya kebetulan sama, test ini tak membuktikan apa-apa —
    // dinyatakan supaya kegagalannya menunjuk penyebab yang benar.
    if (seluruh[0].n === proyekIni[0].n) {
      console.warn('[uji] pekerja proyek == pekerja perusahaan; test penyebut tak membedakan')
    }
  })

  it('nyaris celaka terhitung terpisah dari yang melukai', async () => {
    const r = await get(`/api/v1/proyek/${projectId}/k3?pada=2026-08-12`)
    const k = r.json().rekap_insiden
    expect(k.nyaris_celaka).toBeGreaterThan(0)
    expect(k.melukai).toBeGreaterThan(0)
    expect(k.total).toBeGreaterThanOrEqual(k.nyaris_celaka + k.melukai)
  })
})
