/**
 * Kop perusahaan benar-benar tercetak di PDF kontrak — Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-13: `contracts.ts` tak menyentuh `companies` sama sekali —
 * PDF-nya langsung membuka dengan judul kontrak. Untuk SaaS multi-tenant itu
 * berarti setiap tenant menerbitkan kertas tanpa identitasnya.
 *
 * Yang diuji: ISI PDF-nya, bukan status 200. Status 200 tetap keluar meski
 * kopnya tak pernah digambar — dan itulah bentuk kegagalan yang paling mudah
 * lolos.
 *
 * Isi PDF DIURAI, bukan dicari mentah di buffer: pdfkit mengompresi stream
 * halamannya (FlateDecode), jadi teks apa pun tak muncul apa adanya. Asumsi
 * pertama berkas ini keliru soal itu, dan yang dibetulkan adalah caranya
 * memeriksa — bukan harapannya yang dilonggarkan.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import { inflateSync } from 'node:zlib'
import contractRoutes from '../contracts.js'

/**
 * Teks yang benar-benar tercetak di sebuah PDF pdfkit.
 *
 * DUA lapis penyandian harus dibuka, dan keduanya ditemukan dengan mengukur —
 * bukan ditebak:
 *
 *  1. Stream halaman dikompresi FlateDecode, jadi tak ada teks apa pun yang
 *     muncul apa adanya di buffer.
 *  2. Sesudah diurai, teksnya tersimpan sebagai string HEKSADESIMAL di dalam
 *     operator TJ — `[<505420554a49> 30 <4b4f50>] TJ` adalah "PT UJI" + "KOP".
 *     Angka di antaranya adalah kerning, dan harus dibuang.
 *
 * Asumsi pertama berkas ini ("pdfkit tak mengompresi teks sederhana") keliru
 * di kedua lapis. Yang dibetulkan cara memeriksanya, bukan harapannya.
 */
function teksPdf(buf: Buffer): string {
  const mentah = buf.toString('latin1')
  const TANDA = 'stream'
  let terurai = ''
  let i = mentah.indexOf(TANDA)
  while (i >= 0) {
    // Lewati 'stream' beserta akhir barisnya (CR opsional, lalu LF).
    let mulai = i + TANDA.length
    if (mentah.charCodeAt(mulai) === 13) mulai++
    if (mentah.charCodeAt(mulai) === 10) mulai++
    const akhir = mentah.indexOf('endstream', mulai)
    if (akhir > mulai) {
      try {
        terurai += inflateSync(Buffer.from(mentah.slice(mulai, akhir), 'latin1')).toString('latin1')
      } catch { /* bukan stream terkompresi (font, gambar) — dilewati */ }
    }
    i = mentah.indexOf(TANDA, mulai)
  }

  // Tiap `<...>` di dalam stream diterjemahkan dari hex. Yang bukan hex sah
  // dilewati, bukan membuat seluruh pemeriksaan gagal.
  let hurufnya = ''
  let j = terurai.indexOf('<')
  while (j >= 0) {
    const tutup = terurai.indexOf('>', j)
    if (tutup < 0) break
    const hex = terurai.slice(j + 1, tutup)
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      for (let k = 0; k < hex.length; k += 2) {
        hurufnya += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16))
      }
    }
    j = terurai.indexOf('<', tutup + 1)
  }

  return `${hurufnya}\n${terurai}\n${mentah}`
}

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string
let identitasAwal: Record<string, unknown> | null = null

const NAMA_UJI = 'PT UJI KOP PURALOKA'
const TELP_UJI = '022-555-0199'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  // Company dipilih yang BENAR-BENAR punya proyek. Akun uji anggota TIGA
  // company, dan `LIMIT 1` tanpa `ORDER BY` menyerahkan pilihannya ke
  // Postgres — sempat memilih yang kosong, lalu seluruh test gagal dengan
  // "Proyek tidak ditemukan" yang menuduh SEED, padahal seednya baik.
  companyId = await companyBerisi(db, auth, ['projects'])

  // Proyek dipilih menurut SYARAT: harus punya klien dan nilai kontrak,
  // karena PDF-nya menolak terbit tanpa keduanya.
  const { rows: p } = await db.query(
    `SELECT id FROM projects
      WHERE company_id = $1 AND client_id IS NOT NULL AND contract_value > 0 LIMIT 1`,
    [companyId])
  if (!p.length) throw new Error('butuh proyek berklien & bernilai kontrak — fixture tak terbentuk')
  projectId = p[0].id

  // Identitas asli DISIMPAN dan dikembalikan di akhir: berkas ini menyunting
  // data dev yang nyata, bukan fixture buatannya sendiri.
  const { rows: c } = await db.query(
    'SELECT legal_name, phone, address, city FROM companies WHERE id = $1', [companyId])
  identitasAwal = c[0]

  await db.query(
    `UPDATE companies SET legal_name = $1, phone = $2, address = 'Jl. Uji No. 1',
                          city = 'Bandung' WHERE id = $3`,
    [NAMA_UJI, TELP_UJI, companyId])

  app = Fastify({ logger: false })
  await app.register(contractRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  if (identitasAwal) {
    await db.query(
      'UPDATE companies SET legal_name = $1, phone = $2, address = $3, city = $4 WHERE id = $5',
      [identitasAwal.legal_name, identitasAwal.phone, identitasAwal.address,
        identitasAwal.city, companyId])
  }
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('kop perusahaan di PDF kontrak', () => {
  it('nama resmi & telepon tercetak di dokumennya', async () => {
    const r = await get(`/api/v1/projects/${projectId}/contracts/generate`)
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)
    expect(r.headers['content-type']).toContain('application/pdf')

    const isi = teksPdf(r.rawPayload)
    expect(isi, 'nama perusahaan tak tercetak — dokumen tanpa identitas penerbitnya')
      .toContain(NAMA_UJI)
    expect(isi, 'kontak tak tercetak — penerima tak punya cara menghubungi balik')
      .toContain(TELP_UJI)
  })

  it('identitas KOSONG tidak menghentikan pencetakan', async () => {
    // Dokumen yang tak bisa terbit jauh lebih merugikan daripada dokumen
    // berkop tipis. Tenant baru yang belum mengisi Pengaturan tetap harus
    // bisa mencetak kontraknya.
    await db.query(
      `UPDATE companies SET legal_name = NULL, phone = NULL, address = NULL, city = NULL
        WHERE id = $1`, [companyId])
    try {
      const r = await get(`/api/v1/projects/${projectId}/contracts/generate`)
      expect(r.statusCode, r.body.slice(0, 200)).toBe(200)
      expect(r.rawPayload.length).toBeGreaterThan(1000)
    } finally {
      await db.query(
        `UPDATE companies SET legal_name = $1, phone = $2, address = 'Jl. Uji No. 1',
                              city = 'Bandung' WHERE id = $3`,
        [NAMA_UJI, TELP_UJI, companyId])
    }
  })

  it('nama perusahaan LAIN tidak bocor ke dokumen ini', async () => {
    const { rows } = await db.query(
      `SELECT legal_name, name FROM companies WHERE id <> $1 AND legal_name IS NOT NULL LIMIT 1`,
      [companyId])
    if (!rows.length) return

    const r = await get(`/api/v1/projects/${projectId}/contracts/generate`)
    const isi = teksPdf(r.rawPayload)
    expect(isi, 'identitas tenant lain muncul di dokumen tenant ini')
      .not.toContain(rows[0].legal_name)
  })
})

/**
 * LOGO tercetak — dan tidak pernah menggagalkan pencetakan.
 *
 * Logo diambil lewat KUNCI Storage yang diturunkan dari companyId, bukan
 * dengan mem-fetch `logo_url`. `kunciLogo()` sudah dikunci 8 test murni; yang
 * HANYA bisa dijawab di sini: gambarnya benar-benar masuk ke PDF, dan
 * `logo_url` yang rusak/menunjuk ke luar tidak menghentikan kontrak terbit.
 */
describe('logo di PDF kontrak', () => {
  // PNG 1×1 piksel yang SAH — dipakai supaya pdfkit benar-benar menggambar,
  // bukan sekadar menerima buffer. Bytes-nya tetap, jadi test tak bergantung
  // pada berkas di disk.
  const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  let logoAwal: string | null = null
  let kunci = ''
  let terunggah = false

  beforeAll(async () => {
    const { rows } = await db.query('SELECT logo_url FROM companies WHERE id = $1', [companyId])
    logoAwal = rows[0]?.logo_url ?? null

    kunci = `${companyId}/logo/company-logo.png`
    const { supabase } = await import('../../../utils/supabase.js')
    const { error } = await supabase.storage
      .from('company-assets')
      .upload(kunci, PNG_1PX, { contentType: 'image/png', upsert: true })
    terunggah = !error

    if (terunggah) {
      const { data } = supabase.storage.from('company-assets').getPublicUrl(kunci)
      await db.query('UPDATE companies SET logo_url = $1 WHERE id = $2',
        [`${data.publicUrl}?t=1755300000000`, companyId])
    }
  }, 60_000)

  afterAll(async () => {
    await db.query('UPDATE companies SET logo_url = $1 WHERE id = $2', [logoAwal, companyId])
    if (terunggah) {
      const { supabase } = await import('../../../utils/supabase.js')
      await supabase.storage.from('company-assets').remove([kunci])
    }
  })

  it('gambar benar-benar tertanam di PDF, bukan hanya status 200', async () => {
    if (!terunggah) {
      // Storage tak terjangkau di lingkungan ini — dilewati, BUKAN dihijaukan
      // dengan harapan yang dilonggarkan.
      console.warn('⚠ Storage tak terjangkau — uji logo dilewati')
      return
    }
    const r = await get(`/api/v1/projects/${projectId}/contracts/generate`)
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)

    // pdfkit menuliskan gambar sebagai XObject bertipe /Image. Tanpa logo,
    // penanda ini tak pernah muncul — itulah yang membedakannya dari
    // "PDF terbit" biasa.
    const mentah = r.rawPayload.toString('latin1')
    expect(mentah, 'tak ada XObject gambar — logo tak tergambar meski PDF terbit')
      .toContain('/Subtype /Image')
  })

  it('logo_url menunjuk TENANT LAIN tidak mencetak logo, dan kontrak tetap terbit', async () => {
    // Kalau ini lolos, logo perusahaan orang tercetak di kontrak kita.
    const { rows } = await db.query('SELECT id FROM companies WHERE id <> $1 LIMIT 1', [companyId])
    if (!rows.length) return

    const asing = `https://x/storage/v1/object/public/company-assets/${rows[0].id}/logo/company-logo.png`
    await db.query('UPDATE companies SET logo_url = $1 WHERE id = $2', [asing, companyId])

    const r = await get(`/api/v1/projects/${projectId}/contracts/generate`)
    expect(r.statusCode, 'kontrak gagal terbit gara-gara logo — itu lebih merugikan').toBe(200)
    expect(r.rawPayload.toString('latin1')).not.toContain('/Subtype /Image')
  })

  it('logo_url berupa alamat luar (SSRF) tidak menghentikan pencetakan', async () => {
    // Alamat metadata cloud — muatan SSRF paling lazim. Yang dijaga: server
    // tak menembaknya, DAN kontraknya tetap keluar.
    await db.query('UPDATE companies SET logo_url = $1 WHERE id = $2',
      ['http://169.254.169.254/latest/meta-data/iam/security-credentials/', companyId])

    const r = await get(`/api/v1/projects/${projectId}/contracts/generate`)
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)
    expect(r.rawPayload.length).toBeGreaterThan(1000)
  })
})

/**
 * KLAUSUL TENANT benar-benar tercetak di PDF — bukan sekadar tersimpan.
 *
 * Yang HANYA bisa dijawab di sini: bunyi pasal yang disunting tenant sampai
 * ke kertas. Tersimpan di basis tapi tak tercetak adalah bentuk kegagalan
 * paling mudah lolos — layar Pengaturan menampilkan teks barunya, kontrak
 * yang terbit memakai bawaan, dan tak ada galat di mana pun.
 */
describe('klausul tenant di PDF kontrak', () => {
  const TANDA = 'SENGKETA LEWAT BANI BANDUNG [UJI-KLAUSUL]'

  afterAll(async () => {
    await db.query(`DELETE FROM klausul_kontrak WHERE isi LIKE '%[UJI-KLAUSUL]%'`)
  })

  it('bawaan tercetak saat tenant belum menyunting apa pun', async () => {
    await db.query(`DELETE FROM klausul_kontrak WHERE company_id = $1`, [companyId])
    const r = await get(`/api/v1/projects/${projectId}/contracts/generate`)
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)

    const isi = teksPdf(r.rawPayload)
    // Tenant BARU tak boleh berakhir tanpa pasal penyelesaian sengketa.
    expect(isi, 'pasal sengketa bawaan tak tercetak').toContain('PENYELESAIAN PERSELISIHAN')
    expect(isi, 'pasal force majeure bawaan tak tercetak').toContain('FORCE MAJEURE')
  })

  it('klausul tenant MENIMPA bunyi bawaan di kertas', async () => {
    await db.query(
      `INSERT INTO klausul_kontrak (company_id, nomor, judul, isi, urutan)
       VALUES ($1, '9', 'PENYELESAIAN PERSELISIHAN', $2, 90)`,
      [companyId, TANDA])

    const r = await get(`/api/v1/projects/${projectId}/contracts/generate`)
    expect(r.statusCode).toBe(200)

    const isi = teksPdf(r.rawPayload)
    // Inti seluruh fitur: yang disunting tenant SAMPAI ke kertas.
    expect(isi, 'klausul tenant tersimpan tapi TIDAK tercetak').toContain(TANDA)
    // Dan bunyi bawaannya benar-benar tergantikan, bukan tercetak berdua.
    expect(isi).not.toContain('musyawarah untuk mufakat')
  })

  it('pasal bawaan LAIN tetap tercetak meski satu ditimpa', async () => {
    // Menimpa pasal 9 tak boleh membuat pasal 10 hilang — kontrak tanpa
    // force majeure membebankan seluruh risiko bencana ke satu pihak.
    const r = await get(`/api/v1/projects/${projectId}/contracts/generate`)
    const isi = teksPdf(r.rawPayload)
    expect(isi).toContain('FORCE MAJEURE')
    expect(isi).toContain('MAKSUD DAN TUJUAN')
  })

  it('klausul tenant NONAKTIF tidak dipakai', async () => {
    await db.query(
      `UPDATE klausul_kontrak SET aktif = FALSE WHERE isi LIKE '%[UJI-KLAUSUL]%'`)
    const r = await get(`/api/v1/projects/${projectId}/contracts/generate`)
    const isi = teksPdf(r.rawPayload)
    expect(isi, 'versi nonaktif ikut tercetak — riwayat bocor ke kontrak baru')
      .not.toContain(TANDA)

    // Dan pasalnya KEMBALI, bukan hilang bersama versi yang dinonaktifkan.
    //
    // Yang diperiksa JUDULNYA, bukan kalimat di badan pasal: `teksPdf`
    // menyusun ulang teks dari potongan hex per-operator TJ, dan kalimat
    // panjang bisa terpecah di tengah kata. Judul pendek dan tercetak
    // sebagai satu operator, jadi ia penanda yang bisa dipercaya.
    //
    // Ini pilihan sadar untuk TIDAK melonggarkan harapan: yang dijaga tetap
    // "pasalnya ada kembali", hanya penandanya yang dipilih supaya alat
    // ukurnya tak jadi sumber kegagalan palsu.
    expect(isi, 'pasal sengketa HILANG sesudah versinya dinonaktifkan')
      .toContain('PENYELESAIAN PERSELISIHAN')
  })
})
