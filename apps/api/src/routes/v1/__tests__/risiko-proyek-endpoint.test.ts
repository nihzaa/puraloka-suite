import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import risikoProyekRoutes from '../risiko-proyek.js'

/**
 * REGISTER RISIKO · MITIGASI · IZIN PROYEK · SENGKETA terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 56 test di `lib/__tests__/risiko-proyek.test.ts`
 * (27 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rantai tenancy `tindakan_mitigasi` lewat `risiko_id` — BUKAN project_id.
 *     Salah argumen `viaProject` mengembalikan NOL BARIS tanpa galat, dan
 *     halamannya terlihat seperti risiko yang memang belum punya mitigasi.
 *   • `skor` benar-benar kolom TERHITUNG di basis, bukan angka yang dikirim
 *   • penilaian ulang yang MENAIKKAN skor ditolak dua lapis
 *   • izin dinilai terhadap `end_date` proyek yang NYATA, bukan parameter
 *   • trigger sengketa-dari-klaim menolak klaim yang masih diproses
 *   • dua perpindahan tahap sengketa BERSAMAAN hanya satu yang berhasil
 *
 * Fixture berprefiks [TEST-RS] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let userId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST' | 'PATCH', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(
    `DELETE FROM tindakan_mitigasi WHERE risiko_id IN
       (SELECT id FROM risiko_proyek WHERE judul LIKE '[TEST-RS]%')`)
  await client.query(`DELETE FROM risiko_proyek WHERE judul LIKE '[TEST-RS]%'`)
  await client.query(`DELETE FROM izin_proyek WHERE jenis LIKE '[TEST-RS]%'`)
  await client.query(`DELETE FROM sengketa WHERE judul LIKE '[TEST-RS]%'`)
  await client.query(`DELETE FROM contract_claims WHERE claim_number LIKE '[TEST-RS]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id, end_date FROM projects
      WHERE company_id IS NOT NULL AND end_date IS NOT NULL
      ORDER BY created_at LIMIT 1`)
  projectId = p[0].id

  const { rows: u } = await client.query(`SELECT id FROM users LIMIT 1`)
  userId = u[0].id

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(risikoProyekRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

async function buatRisiko(over: Record<string, unknown> = {}) {
  const r = await kirim('POST', `/api/v1/proyek/${projectId}/risiko`, {
    judul: '[TEST-RS] Keterlambatan material',
    kategori: 'pengadaan', dampak: 4, kemungkinan: 3, ...over,
  })
  return r
}

describe('POST /proyek/:id/risiko', () => {
  it('skor DIHITUNG basis, bukan dikirim klien', async () => {
    const r = await buatRisiko({ dampak: 4, kemungkinan: 3 })
    expect(r.statusCode).toBe(201)
    // 4×3 = 12. Kalau `skor` jadi kolom biasa, seluruh alasan modul ini batal
    // tanpa satu pun galat.
    expect(r.json().risiko.skor).toBe(12)
  })

  it('skala di luar 1..5 ditolak sebelum menyentuh basis', async () => {
    for (const [d, k] of [[6, 3], [3, 0], [0, 3], [3, 6]]) {
      const r = await buatRisiko({ dampak: d, kemungkinan: k })
      expect(r.statusCode).toBe(400)
      expect(r.json().error).toMatch(/1–5/)
    }
  })

  it("dampak string kosong ditolak — `Number('')` adalah 0", async () => {
    const r = await buatRisiko({ dampak: '', kemungkinan: 3 })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/wajib diisi/)
  })

  it('dampak pecahan ditolak APLIKASI, bukan basis', async () => {
    // Mutasi membuktikan `Number.isInteger` tak teruji: mengganti dengan
    // `isFinite` tetap hijau karena kolom SMALLINT membulatkan/menolaknya
    // sendiri. Yang membedakan adalah PESANNYA — galat Postgres tak bisa
    // dibaca orang yang mengisi formulir.
    const r = await buatRisiko({ dampak: 3.5, kemungkinan: 3 })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/bilangan bulat/)
    expect(r.json().error).not.toMatch(/smallint|invalid input|out of range/i)
  })

  it('kategori tak dikenal ditolak dengan daftar yang sah', async () => {
    const r = await buatRisiko({ kategori: 'politik' })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/teknis/)
  })

  it('judul kosong ditolak', async () => {
    const r = await buatRisiko({ judul: '   ' })
    expect(r.statusCode).toBe(400)
  })

  it('404 untuk proyek yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/proyek/00000000-0000-0000-0000-0000000000ff/risiko',
      { judul: 'x', kategori: 'teknis', dampak: 3, kemungkinan: 3 })
    expect(r.statusCode).toBe(404)
  })
})

describe('PATCH /risiko/:id — penilaian ulang', () => {
  it('skor sisa yang MENAIKKAN risiko ditolak, dengan alasannya', async () => {
    const b = await buatRisiko({ dampak: 2, kemungkinan: 2 })
    const id = b.json().risiko.id
    const r = await kirim('PATCH', `/api/v1/risiko/${id}`, {
      dampak_sisa: 5, kemungkinan_sisa: 5,
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/LEBIH TINGGI/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('skor sisa sama dengan awal diterima — "dinilai dan tak turun"', async () => {
    const b = await buatRisiko({ dampak: 3, kemungkinan: 3 })
    const id = b.json().risiko.id
    const r = await kirim('PATCH', `/api/v1/risiko/${id}`, {
      dampak_sisa: 3, kemungkinan_sisa: 3,
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().risiko.dampak_sisa).toBe(3)
  })

  it('skor sisa boleh DIKOSONGKAN kembali ke "belum dinilai ulang"', async () => {
    const b = await buatRisiko()
    const id = b.json().risiko.id
    await kirim('PATCH', `/api/v1/risiko/${id}`, { dampak_sisa: 2, kemungkinan_sisa: 2 })
    const r = await kirim('PATCH', `/api/v1/risiko/${id}`, {
      dampak_sisa: null, kemungkinan_sisa: null,
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().risiko.dampak_sisa).toBeNull()
  })

  it('menutup risiko tanpa alasan ditolak, dan alasannya menjelaskan kenapa', async () => {
    const b = await buatRisiko()
    const id = b.json().risiko.id
    const r = await kirim('PATCH', `/api/v1/risiko/${id}`, { status: 'tertutup' })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/kami lupa/)
  })

  it('alasan pendek (<10 huruf) juga ditolak', async () => {
    const b = await buatRisiko()
    const id = b.json().risiko.id
    const r = await kirim('PATCH', `/api/v1/risiko/${id}`, {
      status: 'tertutup', alasan_tutup: 'sudah',
    })
    expect(r.statusCode).toBe(422)
  })

  it('penutupan beralasan tersimpan dengan tanggalnya', async () => {
    const b = await buatRisiko()
    const id = b.json().risiko.id
    const r = await kirim('PATCH', `/api/v1/risiko/${id}`, {
      status: 'tertutup',
      alasan_tutup: 'Material sudah tiba seluruhnya di gudang proyek',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().risiko.ditutup_pada).toBeTruthy()
  })

  it('status "terjadi" otomatis bertanggal', async () => {
    const b = await buatRisiko()
    const id = b.json().risiko.id
    const r = await kirim('PATCH', `/api/v1/risiko/${id}`, { status: 'terjadi' })
    expect(r.statusCode).toBe(200)
    expect(r.json().risiko.terjadi_pada).toBeTruthy()
  })

  it('404 untuk risiko yang tak ada', async () => {
    const r = await kirim('PATCH',
      '/api/v1/risiko/00000000-0000-0000-0000-0000000000ff', { dampak: 2 })
    expect(r.statusCode).toBe(404)
  })
})

describe('mitigasi — rantai tenancy lewat risiko_id', () => {
  it('tindakan tersimpan dan terbaca kembali BERSAMA risikonya', async () => {
    const b = await buatRisiko({ judul: '[TEST-RS] Punya mitigasi' })
    const id = b.json().risiko.id

    const t = await kirim('POST', `/api/v1/risiko/${id}/mitigasi`, {
      tindakan: 'Pesan material 4 minggu lebih awal',
      tenggat: '2026-09-01', biaya_estimasi: 5000000,
    })
    expect(t.statusCode).toBe(201)

    // Inilah yang membuktikan `viaProject('tindakan_mitigasi', <risiko_id>)`
    // memakai argumen yang BENAR. Kalau project_id yang dilewatkan, ini nol
    // baris — tanpa galat.
    const r = await get(`/api/v1/proyek/${projectId}/risiko?pada=2026-08-11`)
    expect(r.statusCode).toBe(200)
    const baris = r.json().risiko.find((x: { id: string }) => x.id === id)
    expect(baris.tindakan).toHaveLength(1)
    expect(baris.tindakan[0].tindakan).toMatch(/4 minggu/)
  })

  it('biaya negatif ditolak APLIKASI dengan pesan yang bisa dibaca', async () => {
    const b = await buatRisiko()
    const r = await kirim('POST', `/api/v1/risiko/${b.json().risiko.id}/mitigasi`, {
      tindakan: 'x', biaya_estimasi: -1,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/biaya_estimasi harus angka >= 0/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('tindakan kosong ditolak', async () => {
    const b = await buatRisiko()
    const r = await kirim('POST', `/api/v1/risiko/${b.json().risiko.id}/mitigasi`, {
      tindakan: '  ',
    })
    expect(r.statusCode).toBe(400)
  })

  it('404 untuk risiko yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/risiko/00000000-0000-0000-0000-0000000000ff/mitigasi', { tindakan: 'x' })
    expect(r.statusCode).toBe(404)
  })

  it('menandai selesai otomatis bertanggal — constraint basis menuntutnya', async () => {
    const b = await buatRisiko()
    const t = await kirim('POST', `/api/v1/risiko/${b.json().risiko.id}/mitigasi`, {
      tindakan: 'Tandai selesai',
    })
    const r = await kirim('PATCH', `/api/v1/mitigasi/${t.json().tindakan.id}`, {
      status: 'selesai',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().tindakan.selesai_pada).toBeTruthy()
  })

  it('ringkasan menandai risiko yang tindakannya lewat tenggat', async () => {
    const b = await buatRisiko({ judul: '[TEST-RS] Tindakan telat', dampak: 2, kemungkinan: 2 })
    const id = b.json().risiko.id
    await kirim('POST', `/api/v1/risiko/${id}/mitigasi`, {
      tindakan: 'Sudah lewat', tenggat: '2026-01-01',
    })
    const r = await get(`/api/v1/proyek/${projectId}/risiko?pada=2026-08-11`)
    const baris = r.json().risiko.find((x: { id: string }) => x.id === id)
    expect(baris.mendesak).toBe(true)
    expect(baris.alasan_mendesak).toContain('1 tindakan lewat tenggat')
  })
})

describe('izin proyek', () => {
  it('TERBIT tanpa nomor ditolak dengan pesan yang bisa dibaca manusia', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/izin`, {
      jenis: '[TEST-RS] PBG', status: 'terbit', berlaku_dari: '2026-01-01',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/pengawas datang/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('TERBIT tanpa tanggal mulai berlaku ditolak APLIKASI', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/izin`, {
      jenis: '[TEST-RS] PBG', status: 'terbit', nomor: 'PBG-1',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tanggal mulai berlaku/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('berlaku_sampai mendahului berlaku_dari ditolak APLIKASI', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/izin`, {
      jenis: '[TEST-RS] Lingkungan', berlaku_dari: '2026-06-01',
      berlaku_sampai: '2026-01-01',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tidak boleh mendahului/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('izin KEDALUWARSA yang menghalangi mulai memblokir pekerjaan', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/izin`, {
      jenis: '[TEST-RS] PBG mati', status: 'terbit', nomor: 'PBG-MATI',
      berlaku_dari: '2024-01-01', berlaku_sampai: '2025-01-01',
      menghalangi_mulai: true,
    })
    expect(r.statusCode).toBe(201)

    const g = await get(`/api/v1/proyek/${projectId}/izin?pada=2026-08-11`)
    expect(g.statusCode).toBe(200)
    expect(g.json().kesiapan.boleh_jalan).toBe(false)
    expect(g.json().kesiapan.memblokir.length).toBeGreaterThan(0)
  })

  it('dinilai terhadap end_date proyek NYATA, bukan angka yang dikarang', async () => {
    // Proyek fixture punya end_date. Izin yang habis sebelum tanggal itu
    // harus "akan habis" meski sisanya masih lama.
    const { rows } = await client.query(
      `SELECT end_date::text FROM projects WHERE id = $1`, [projectId])
    const selesai: string = rows[0].end_date

    // Sehari sebelum proyek selesai — dan jauh dari ambang 60 hari.
    const habis = new Date(Date.parse(selesai) - 86400000).toISOString().slice(0, 10)

    const r = await kirim('POST', `/api/v1/proyek/${projectId}/izin`, {
      jenis: '[TEST-RS] Habis sebelum selesai', status: 'terbit',
      nomor: 'X-EARLY', berlaku_dari: '2024-01-01', berlaku_sampai: habis,
    })
    expect(r.statusCode).toBe(201)

    const g = await get(`/api/v1/proyek/${projectId}/izin?pada=2020-01-01`)
    const baris = g.json().izin.find((x: { id: string }) => x.id === r.json().izin.id)
    expect(baris.masa).toBe('akan_habis')
    // Sisa hari jauh di atas ambang — jadi yang menandainya BUKAN ambang,
    // melainkan tanggal selesai proyek.
    expect(baris.sisa_hari).toBeGreaterThan(60)
  })

  it('PATCH ke TERBIT tanpa nomor ditolak, memakai nilai LAMA sebagai bahan', async () => {
    const b = await kirim('POST', `/api/v1/proyek/${projectId}/izin`, {
      jenis: '[TEST-RS] Naik terbit', status: 'diajukan',
    })
    const id = b.json().izin.id
    const r = await kirim('PATCH', `/api/v1/izin-proyek/${id}`, { status: 'terbit' })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/wajib punya nomor/)
    expect(r.json().error).not.toMatch(/violates check constraint/)

    // Nomor saja belum cukup — tanggal mulai berlaku juga diperiksa dari
    // gabungan nilai BARU dan nilai LAMA, bukan hanya dari payload.
    const setengah = await kirim('PATCH', `/api/v1/izin-proyek/${id}`, {
      status: 'terbit', nomor: 'PBG-9',
    })
    expect(setengah.statusCode).toBe(422)
    expect(setengah.json().error).toMatch(/tanggal mulai berlaku/)

    const ok = await kirim('PATCH', `/api/v1/izin-proyek/${id}`, {
      status: 'terbit', nomor: 'PBG-9', berlaku_dari: '2026-02-01',
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().izin.status).toBe('terbit')
  })

  it('404 untuk izin yang tak ada', async () => {
    const r = await kirim('PATCH',
      '/api/v1/izin-proyek/00000000-0000-0000-0000-0000000000ff', { nomor: 'x' })
    expect(r.statusCode).toBe(404)
  })
})

describe('sengketa', () => {
  async function buatKlaim(status: string) {
    // Diputus di UPDATE terpisah, bukan lewat CASE di INSERT: memakai satu
    // parameter sebagai enum DAN sebagai teks di CASE membuat `pg` menyimpulkan
    // dua tipe untuk parameter yang sama ("inconsistent types deduced").
    const { rows } = await client.query(
      `INSERT INTO contract_claims
         (project_id, claim_number, claim_type, title, event_date,
          amount_claimed, status, created_by)
       VALUES ($1, $2, 'lain_lain', '[TEST-RS] klaim', CURRENT_DATE,
               1000000, 'draft', $3)
       RETURNING id`,
      [projectId, `[TEST-RS]${Math.floor(Math.random() * 1e9)}`, userId])
    const id = rows[0].id as string

    if (status !== 'draft') {
      const diputus = ['disetujui', 'disetujui_sebagian', 'ditolak'].includes(status)
      await client.query(
        `UPDATE contract_claims
            SET status = $2::claim_status,
                decided_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END,
                decided_at = CASE WHEN $3 THEN now() ELSE NULL END,
                decision_note = CASE WHEN $3 THEN 'uji' ELSE NULL END,
                amount_approved = CASE WHEN $5 THEN 1000000 ELSE NULL END
          WHERE id = $1`,
        [id, status, diputus, userId,
         ['disetujui', 'disetujui_sebagian'].includes(status)])
    }
    return id
  }

  it('sengketa dari klaim yang MASIH DIPROSES ditolak, dengan alasannya', async () => {
    const klaimId = await buatKlaim('diajukan')
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Terlalu cepat', pihak_lawan: 'PT Uji',
      pokok_perkara: 'x', klaim_id: klaimId,
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/menyerah sebelum jawabannya keluar/)
  })

  it('sengketa dari klaim DITOLAK diterima', async () => {
    const klaimId = await buatKlaim('ditolak')
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Eskalasi sah', pihak_lawan: 'PT Uji',
      pokok_perkara: 'Klaim perpanjangan waktu ditolak sepihak',
      nilai_tuntutan: 250000000, klaim_id: klaimId,
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().sengketa.klaim_id).toBe(klaimId)
  })

  it('sengketa TANPA klaim diterima — tak semua lahir dari klaim', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Sengketa lahan', pihak_lawan: 'Warga RT 04',
      pokok_perkara: 'Batas lahan tak sesuai sertifikat',
    })
    expect(r.statusCode).toBe(201)
  })

  it('nilai tuntutan negatif ditolak APLIKASI dengan pesan yang bisa dibaca', async () => {
    const r = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Negatif', pihak_lawan: 'x', pokok_perkara: 'y',
      nilai_tuntutan: -1,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/nilai_tuntutan harus angka >= 0/)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('paparan hanya menghitung yang BERJALAN, dan yang tanpa nilai dihitung terpisah', async () => {
    const g = await get(`/api/v1/proyek/${projectId}/sengketa?pada=2026-08-11`)
    expect(g.statusCode).toBe(200)
    const r = g.json().ringkas
    expect(r.paparan).toBeGreaterThanOrEqual(250000000)
    // Sengketa lahan di atas tak bernilai — harus terhitung terpisah, bukan
    // diam-diam nol.
    expect(r.tanpa_nilai).toBeGreaterThanOrEqual(1)
  })

  it('tahap MUNDUR ditolak', async () => {
    const b = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Mundur', pihak_lawan: 'x', pokok_perkara: 'y',
    })
    const id = b.json().sengketa.id
    await kirim('PATCH', `/api/v1/sengketa/${id}/tahap`, { status: 'mediasi' })
    const r = await kirim('PATCH', `/api/v1/sengketa/${id}/tahap`, { status: 'negosiasi' })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/mundur/)
  })

  it('maju boleh MELOMPAT — pihak lawan menolak berunding', async () => {
    const b = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Melompat', pihak_lawan: 'x', pokok_perkara: 'y',
    })
    const r = await kirim('PATCH', `/api/v1/sengketa/${b.json().sengketa.id}/tahap`, {
      status: 'pengadilan', forum: 'PN Bandung',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().sengketa.forum).toBe('PN Bandung')
  })

  it('SELESAI tanpa hasil ditolak — sengketa yang hilang tak bisa dipakai lagi', async () => {
    const b = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Selesai kosong', pihak_lawan: 'x', pokok_perkara: 'y',
    })
    const r = await kirim('PATCH', `/api/v1/sengketa/${b.json().sengketa.id}/tahap`, {
      status: 'selesai',
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/hasil/)
  })

  it('selesai berhasil menyimpan nilai putusan, dan tahap terkunci sesudahnya', async () => {
    const b = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Selesai penuh', pihak_lawan: 'x', pokok_perkara: 'y',
      nilai_tuntutan: 500000000,
    })
    const id = b.json().sengketa.id
    const r = await kirim('PATCH', `/api/v1/sengketa/${id}/tahap`, {
      status: 'selesai', hasil: 'Berdamai dengan pembayaran sebagian',
      nilai_putusan: 200000000,
    })
    expect(r.statusCode).toBe(200)
    expect(Number(r.json().sengketa.nilai_putusan)).toBe(200000000)

    const lagi = await kirim('PATCH', `/api/v1/sengketa/${id}/tahap`, { status: 'pengadilan' })
    expect(lagi.statusCode).toBe(422)
    expect(lagi.json().error).toMatch(/sudah selesai/)
  })

  it('tanggal selesai tak boleh mendahului tanggal mulai', async () => {
    const b = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Selesai duluan', pihak_lawan: 'x', pokok_perkara: 'y',
      tanggal_mulai: '2026-06-01',
    })
    const r = await kirim('PATCH', `/api/v1/sengketa/${b.json().sengketa.id}/tahap`, {
      status: 'selesai', hasil: 'Sudah diputus pengadilan negeri',
      selesai_pada: '2026-01-01',
    })
    expect(r.statusCode).toBe(422)
  })

  it('DUA perpindahan BERSAMAAN: hanya satu yang berhasil', async () => {
    const b = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Lomba', pihak_lawan: 'x', pokok_perkara: 'y',
    })
    const id = b.json().sengketa.id

    // TUJUAN BERBEDA — kalau sama, permintaan kedua ditolak
    // `bolehPindahTahapSengketa` ("tahapnya sudah itu") SEBELUM menyentuh
    // query, dan yang teruji adalah pemeriksaan aplikasi, bukan `.eq('status',
    // dari)` di WHERE. Kesalahan itu sudah terjadi di G1e, G1f, dan G2e.
    const [a, c] = await Promise.all([
      kirim('PATCH', `/api/v1/sengketa/${id}/tahap`, { status: 'negosiasi' }),
      kirim('PATCH', `/api/v1/sengketa/${id}/tahap`, { status: 'mediasi' }),
    ])
    /*
      ── Kenapa [200, 200] JUGA BENAR (diperbaiki 2026-08-14)

      Kembaran KETIGA dari cacat yang sama hari ini (`k3-lapangan-endpoint`,
      `kompetensi-sdm-endpoint`), dan sebabnya identik di ketiganya.

      `.eq('status', dari)` di `risiko-proyek.ts:1010` memang terpasang, dan
      klaim atomiknya BENAR — diukur di Postgres pada kasus K3: dua UPDATE
      benar-benar bersamaan dengan WHERE status lama memulangkan 1 dan 0 baris.

      Yang tak selalu terjadi adalah "bersamaan"-nya. `app.inject` +
      `Promise.all` tak menjamin keduanya membaca `dari` sebelum salah satu
      menulis. Kalau terserialisasi, permintaan kedua membaca `negosiasi` dan
      menulis `mediasi` — transisi maju yang sah, jadi 200 adalah jawaban yang
      benar, bukan kebocoran.

      Menuntut 409 berarti menuntut lomba yang selalu terjadi. Test yang
      menuntut nondeterminisme akan merah pada jalur yang benar — dan test
      begitu berakhir ditandai `retry` atau `skip`, yang jauh lebih berbahaya
      daripada test yang tepat sasaran.
    */
    const kode = [a.statusCode, c.statusCode].sort()
    expect(kode, `dua-duanya gagal — tak ada yang menang: ${a.body} | ${c.body}`)
      .not.toEqual([409, 409])
    for (const k of kode) {
      expect([200, 409], `status tak terduga ${k} — lomba harus berakhir 200 atau 409`)
        .toContain(k)
    }

    /*
      Inilah yang benar-benar menangkap hilangnya klaim atomik.

      Assertion di atas TIDAK cukup — terbukti pada K3 lewat mutasi: tanpa
      `.eq(status, dari)` kedua UPDATE mengenai baris (rowCount 1 dan 1) dan
      status akhirnya tetap salah satu tujuan. Tak ada yang bisa dibedakan dari
      hasil akhirnya.

      Yang berbeda adalah RANTAI JEJAKNYA. Tiap tulisan harus berangkat dari
      status yang benar-benar berlaku saat itu:

          dilaporkan → negosiasi
          negosiasi  → mediasi            ← sambung, klaim menahan

      Tanpa klaim, jejaknya bercabang — keduanya dari status yang sama.

      Bentuk ini dipakai di sini karena `sengketa` MEMANG dicatat ke
      `audit_logs` (risiko-proyek.ts:1029). Di `kompetensi-sdm` bentuk yang
      sama mustahil — `lamaran_kerja` tak pernah dicatat sama sekali, dan
      assertion yang membaca tabel kosong akan selalu lulus.
    */
    const { rows: jejak } = await client.query(
      `SELECT old_values->>'status' dari, new_values->>'status' ke
         FROM audit_logs
        WHERE table_name = 'sengketa' AND record_id = $1 AND action = 'UPDATE'
          AND new_values->>'status' IS DISTINCT FROM old_values->>'status'
        ORDER BY created_at`,
      [id])
    for (let i = 1; i < jejak.length; i++) {
      expect(jejak[i].dari,
        `tulisan ke-${i + 1} berangkat dari '${jejak[i].dari}' padahal status saat itu `
        + `'${jejak[i - 1].ke}' — klaim atomik \`.eq(status, dari)\` tak menahan`)
        .toBe(jejak[i - 1].ke)
    }
  })

  it('404 untuk sengketa yang tak ada', async () => {
    const r = await kirim('PATCH',
      '/api/v1/sengketa/00000000-0000-0000-0000-0000000000ff/tahap',
      { status: 'mediasi' })
    expect(r.statusCode).toBe(404)
  })

  it('status tak dikenal ditolak dengan daftar yang sah', async () => {
    const b = await kirim('POST', `/api/v1/proyek/${projectId}/sengketa`, {
      judul: '[TEST-RS] Status aneh', pihak_lawan: 'x', pokok_perkara: 'y',
    })
    const r = await kirim('PATCH', `/api/v1/sengketa/${b.json().sengketa.id}/tahap`, {
      status: 'banding',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/arbitrase/)
  })
})

describe('GET /proyek/:id/risiko — ringkasan', () => {
  it('pada berformat salah ditolak', async () => {
    const r = await get(`/api/v1/proyek/${projectId}/risiko?pada=11-08-2026`)
    expect(r.statusCode).toBe(400)
  })

  it('404 untuk proyek yang tak ada', async () => {
    const r = await get('/api/v1/proyek/00000000-0000-0000-0000-0000000000ff/risiko')
    expect(r.statusCode).toBe(404)
  })

  it('ringkasan menghitung per tingkat dan yang mendesak', async () => {
    const r = await get(`/api/v1/proyek/${projectId}/risiko?pada=2026-08-11`)
    expect(r.statusCode).toBe(200)
    const s = r.json().ringkas
    expect(s.total).toBeGreaterThan(0)
    expect(typeof s.per_tingkat.ekstrem).toBe('number')
    // Belum ada yang dinilai ulang di sebagian besar fixture — null, bukan 0.
    expect(s).toHaveProperty('penurunan_rata')
  })
})
