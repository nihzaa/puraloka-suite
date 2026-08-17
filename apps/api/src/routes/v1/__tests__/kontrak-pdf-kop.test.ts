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
import contractRoutes from '../contracts.js'
import { teksPdf } from '../../../test-utils/teks-pdf.js'


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

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MENYUNTING KLAUSUL DARI UI — "kolom DB sudah ada" bukan selesai
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Migrasi 450 memindahkan klausul ke basis, tapi tanpa endpoint sunting,
 * satu-satunya cara mengubah bunyi pasal tetap SQL langsung ke basis
 * produksi — persis yang hendak dihindari saat memindahkannya dari kode.
 */
describe('menyunting klausul kontrak', () => {
  const NOMOR_UJI = '9'
  let isiAsli: string | null = null
  let adaAsli = false

  beforeAll(async () => {
    const { rows } = await db.query(
      `SELECT isi FROM klausul_kontrak
        WHERE company_id = $1 AND nomor = $2 AND aktif`, [companyId, NOMOR_UJI])
    adaAsli = rows.length > 0
    isiAsli = rows[0]?.isi ?? null
  })

  afterAll(async () => {
    // Basis dev yang NYATA disunting di sini. Keadaan awal dipulihkan:
    // yang tadinya tak punya timpaan dikembalikan tanpa timpaan.
    await db.query(
      'DELETE FROM klausul_kontrak WHERE company_id = $1 AND nomor = $2',
      [companyId, NOMOR_UJI])
    if (adaAsli && isiAsli) {
      await db.query(
        `INSERT INTO klausul_kontrak (company_id, nomor, judul, isi, urutan, aktif)
         VALUES ($1, $2, 'PENYELESAIAN PERSELISIHAN', $3, 90, TRUE)`,
        [companyId, NOMOR_UJI, isiAsli])
    }
  })

  const daftar = () => app.inject({
    method: 'GET', url: '/api/v1/klausul-kontrak',
    headers: { authorization: 'Bearer t' },
  })
  const simpan = (nomor: string, body: Record<string, unknown>) => app.inject({
    method: 'PUT', url: `/api/v1/klausul-kontrak/${nomor}`,
    headers: { authorization: 'Bearer t' }, payload: body,
  })

  it('daftar memulangkan GABUNGAN, bukan tabel mentah', async () => {
    // Tabel mentah hanya berisi yang sudah ditimpa. Tenant baru akan melihat
    // layar kosong dan menyimpulkan kontraknya terbit tanpa pasal apa pun —
    // padahal bawaan tetap tercetak.
    await db.query(
      'DELETE FROM klausul_kontrak WHERE company_id = $1 AND nomor = $2',
      [companyId, NOMOR_UJI])

    const r = await daftar()
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)
    const j = r.json()
    const p9 = (j.klausul as Array<Record<string, unknown>>).find((k) => k.nomor === NOMOR_UJI)
    expect(p9, 'pasal bawaan hilang dari daftar — layar akan terlihat kosong').toBeTruthy()
    expect(p9!.asal).toBe('bawaan')
  })

  it('pasal yang DIRAKIT KODE disebutkan, bukan didiamkan', async () => {
    // Yang membuka layar akan mencari "PASAL 3 NILAI KONTRAK" dan tak
    // menemukannya; tanpa penjelasan ia menyimpulkan pasalnya hilang.
    const j = (await daftar()).json()
    expect(j.dirakit_kode).toContain('3')
    expect(String(j.catatan_dirakit)).toMatch(/nilai kontrak/i)
  })

  it('menyimpan menimpa bawaan, dan asalnya berubah jadi tenant', async () => {
    const r = await simpan(NOMOR_UJI, {
      judul: 'PENYELESAIAN PERSELISIHAN',
      isi: 'Sengketa diselesaikan melalui BANI Jakarta.',
      urutan: 90,
    })
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)

    const j = (await daftar()).json()
    const p9 = (j.klausul as Array<Record<string, unknown>>).find((k) => k.nomor === NOMOR_UJI)
    expect(p9!.asal).toBe('tenant')
    expect(String(p9!.isi)).toContain('BANI Jakarta')
  })

  it('menyunting ULANG menaikkan versi dan TIDAK menghapus yang lama', async () => {
    // Yang dijaga di sini bukan angka versinya. Kontrak yang sudah
    // ditandatangani harus bisa dicetak ulang persis seperti saat
    // ditandatangani — dan PDF-nya di-generate ulang tiap kali diunduh.
    await simpan(NOMOR_UJI, {
      judul: 'PENYELESAIAN PERSELISIHAN',
      isi: 'Sengketa diselesaikan melalui Pengadilan Negeri Bandung.',
      urutan: 90,
    })

    const { rows } = await db.query(
      `SELECT versi, aktif, isi FROM klausul_kontrak
        WHERE company_id = $1 AND nomor = $2 ORDER BY versi`, [companyId, NOMOR_UJI])
    expect(rows.length, 'versi lama terhapus — riwayat klausul hilang').toBeGreaterThanOrEqual(2)
    expect(rows.filter((r) => r.aktif).length,
      'lebih dari satu versi AKTIF — kontrak akan memuat dua PASAL 9').toBe(1)
    const aktif = rows.find((r) => r.aktif)!
    expect(String(aktif.isi)).toContain('Pengadilan Negeri Bandung')
  })

  it('isi KOSONG ditolak dengan pesan yang bisa dibaca manusia', async () => {
    const r = await simpan(NOMOR_UJI, { judul: 'PASAL', isi: '   ' })
    expect(r.statusCode).toBe(400)
    expect(String(r.json().error)).toMatch(/tak boleh kosong/i)
  })

  it('pasal yang DIRAKIT KODE ditolak — template bernilai kosong tercetak rapi', async () => {
    const r = await simpan('3', { judul: 'NILAI KONTRAK', isi: 'Nilainya sekian.' })
    expect(r.statusCode).toBe(422)
    expect(String(r.json().error)).toMatch(/dirakit sistem/i)
  })

  it('memulihkan bawaan menonaktifkan timpaan, bukan menghapus pasal', async () => {
    const r = await app.inject({
      method: 'DELETE', url: `/api/v1/klausul-kontrak/${NOMOR_UJI}`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)

    const j = (await daftar()).json()
    const p9 = (j.klausul as Array<Record<string, unknown>>).find((k) => k.nomor === NOMOR_UJI)
    // Pasalnya HARUS tetap ada — hanya bunyinya yang kembali bawaan.
    expect(p9, 'pasal hilang sama sekali sesudah dipulihkan').toBeTruthy()
    expect(p9!.asal).toBe('bawaan')

    // Riwayat timpaan tetap tersimpan (non-aktif).
    const { rows } = await db.query(
      `SELECT count(*)::int c FROM klausul_kontrak
        WHERE company_id = $1 AND nomor = $2 AND NOT aktif`, [companyId, NOMOR_UJI])
    expect(rows[0].c, 'riwayat timpaan ikut terhapus').toBeGreaterThan(0)
  })
})
