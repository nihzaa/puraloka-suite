/**
 * MITRA — identitas tunggal, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Keputusan kelayakannya sendiri sudah dikunci 7 test murni di
 * `lib/__tests__/gerbang-kelayakan.test.ts`. Yang tersisa dan hanya bisa
 * dibuktikan terhadap basis:
 *
 *   • CHECK migrasi 461 benar-benar menahan lewat RUTE, bukan cuma lewat SQL
 *     langsung — dan galatnya keluar sebagai KALIMAT, bukan pesan constraint
 *   • daftar hitam TIDAK bisa diubah lewat PATCH umum (jalur yang membuatnya
 *     berubah sebagai efek samping penyuntingan nomor telepon)
 *   • backfill migrasi 461 benar-benar menaut, dan `GET /:id` memperlihatkan
 *     PERAN yang dipegang satu identitas
 *   • izin `mitra:daftar_hitam` TIDAK terwarisi otomatis (migrasi 462)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import mitraRoutes from '../mitra.js'

let app: FastifyInstance
let db: Client
let companyId: string
let auth: string

const TANDA = '[UJI-MITRA]'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  await db.query(`DELETE FROM mitra WHERE nama LIKE $1`, [`${TANDA}%`])
}

beforeAll(async () => {
  db = await createRlsClient()
  auth = (await authIdForRole(db, 'admin'))!
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  companyId = await companyBerisi(db, auth, ['workers'])

  await bersihkan()
  app = Fastify({ logger: false })
  await app.register(mitraRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('bentuk mitra — orang ATAU badan usaha, dua-duanya sah', () => {
  it('ORANG dibuat tanpa bentuk badan', async () => {
    const r = await post('/api/v1/mitra', { bentuk: 'orang', nama: `${TANDA} Pak Slamet` })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().mitra.bentuk).toBe('orang')
    expect(r.json().mitra.bentuk_badan).toBeNull()
  })

  it('BADAN USAHA wajib menyebut bentuknya — ditolak dengan KALIMAT', async () => {
    /*
      CHECK basis juga menahannya, tapi galat constraint berbunyi seperti
      kerusakan sistem ("violates check constraint chk_mitra_badan_punya_bentuk").
      Rutenya menolak lebih dulu dengan kalimat yang bisa ditindak.

      Kenapa ini bukan kosmetik: kop surat dan kontrak menyebut "PT" atau "CV"
      dari kolom ini, dan salah sebut bentuk badan adalah cacat hukum.
    */
    const r = await post('/api/v1/mitra', { bentuk: 'badan_usaha', nama: `${TANDA} Sinar Jaya` })
    expect(r.statusCode, r.body).toBe(400)
    expect(r.json().error).toMatch(/PT|CV/)
    expect(r.json().error).not.toMatch(/constraint/i)
  })

  it('BADAN USAHA lengkap diterima', async () => {
    const r = await post('/api/v1/mitra', {
      bentuk: 'badan_usaha', nama: `${TANDA} Sinar Jaya`, bentuk_badan: 'CV',
      npwp: '01.234.567.8-901.000',
    })
    expect(r.statusCode, r.body).toBe(201)
    expect(r.json().mitra.bentuk_badan).toBe('CV')
  })

  it('nama sama dengan BENTUK berbeda tetap sah', async () => {
    // Orang bernama "Sinar Jaya" dan CV bernama "Sinar Jaya" adalah dua pihak
    // yang berbeda. Menolaknya memaksa salah satunya dicatat keliru.
    const r = await post('/api/v1/mitra', { bentuk: 'orang', nama: `${TANDA} Sinar Jaya` })
    expect(r.statusCode, r.body).toBe(201)
  })

  it('nama KEMBAR pada bentuk yang sama ditolak 409', async () => {
    // Identitas kembar membuat daftar hitam cuma menutup salah satunya —
    // persis lubang yang seluruh modul ini dibangun untuk menutup.
    const r = await post('/api/v1/mitra', { bentuk: 'orang', nama: `${TANDA} pak slamet  ` })
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/identitas kembar|sudah ada/i)
  })
})

describe('daftar hitam — keputusan, bukan penyuntingan', () => {
  let idMitra: string
  let idIzin: string | null = null
  let idPeran: string | null = null

  beforeAll(async () => {
    const r = await post('/api/v1/mitra', { bentuk: 'orang', nama: `${TANDA} Terdakwa` })
    idMitra = r.json().mitra.id

    /*
      Izin `mitra:daftar_hitam` DIBERIKAN di sini, dan itu bukan kerepotan
      test melainkan BUKTI bahwa migrasi 462 bekerja.

      Versi pertama berkas ini gagal 4 test dengan "Butuh permission:
      mitra:daftar_hitam" — tepat seperti yang dirancang: migrasi mewariskan
      `mitra:view`/`mitra:manage` dari `workers:manage`, tetapi SENGAJA tidak
      mewariskan yang ketiga. Keputusan melarang pihak lain berbisnis tak
      boleh muncul di tangan seseorang sebagai efek samping migrasi.

      Jadi test ini memberikannya sadar, lalu mencabutnya lagi — persis
      seperti yang harus dilakukan tenant lewat layar Peran.
    */
    const { rows: izin } = await db.query(
      `SELECT id FROM permissions WHERE key = 'mitra:daftar_hitam'`)
    if (!izin.length) throw new Error('izin mitra:daftar_hitam tak ada — migrasi 462 belum jalan')
    idIzin = izin[0].id

    /*
      Peran diambil dari `company_members`, BUKAN dari `users.role_id` dan
      bukan dari pemegang `mitra:manage`.

      Tiga jebakan yang masing-masing memakan satu putaran di sini, dan
      ketiganya menghasilkan 403 yang MENUDUH RUTE:

        1. Hibah `role_permissions` di basis ini ber-`company_id` NULL
           (global). Menyaringnya dengan `rp.company_id = <company>` cocok
           NOL baris — bukan galat, melainkan blok yang dilewati diam-diam.

        2. `company_members.role_id` BUKAN yang menentukan. Ia menunjuk baris
           template (`company_id IS NULL`), sementara izinnya disusun lewat
           RPC `get_role_permissions(role_name)`.

        3. RPC itu mencari peran lewat NAMA, lalu memilih SATU baris dengan
           `ORDER BY (company_id IS NULL), company_id LIMIT 1` — jadi salinan
           TENANT menang atas template saat `auth_company_id()` terisi.
           Basis ini punya DUA baris bernama `admin` (satu template, satu
           milik tenant), dan hibah ke template tak pernah terbaca.

      Diukur langsung ke RPC-nya, bukan disimpulkan: hibah ke baris template
      memulangkan `["mitra:view","mitra:manage"]` — tanpa yang ketiga.

      Query di bawah SENGAJA menyalin urutan RPC itu persis, supaya hibahnya
      mendarat di baris yang benar-benar dibaca.
    */
    const { rows: peran } = await db.query(
      `SELECT r.id FROM roles r
        WHERE r.name = 'admin'
          AND (r.company_id = $1 OR r.company_id IS NULL)
        ORDER BY (r.company_id IS NULL), r.company_id
        LIMIT 1`, [companyId])
    if (!peran.length) throw new Error('peran admin tak ditemukan')
    idPeran = peran[0].id
    await db.query(
      `INSERT INTO role_permissions (role_id, permission_id, company_id)
       VALUES ($1, $2, NULL) ON CONFLICT DO NOTHING`, [idPeran, idIzin])
  })

  afterAll(async () => {
    // Dicabut lagi: test yang meninggalkan izin terpasang membuat penjaga
    // "daftar_hitam tak diwariskan" merah di jalan berikutnya — dan merahnya
    // menuduh migrasi, bukan test ini.
    if (idPeran && idIzin) {
      await db.query(
        `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
        [idPeran, idIzin])
    }
  })

  it('PATCH umum TIDAK bisa mengubah daftar hitam', async () => {
    /*
      Inti pemisahan endpoint. Kalau `daftar_hitam` ikut di PATCH umum, ia
      bisa berubah sebagai efek samping penyuntingan nomor telepon — dan
      jejak auditnya tercatat sebagai "mitra diperbarui", kalimat yang tak
      akan pernah dicari siapa pun yang menyelidiki kenapa sebuah PT
      tiba-tiba dilarang menawar.
    */
    const r = await patch(`/api/v1/mitra/${idMitra}`, {
      telepon: '08123456789',
      daftar_hitam: true,
      alasan_daftar_hitam: 'diselundupkan lewat PATCH umum',
    })
    expect(r.statusCode, r.body).toBe(200)
    // Teleponnya berubah — permintaan yang sah tetap dilayani…
    expect(r.json().mitra.telepon).toBe('08123456789')
    // …tetapi daftar hitamnya TIDAK.
    expect(r.json().mitra.daftar_hitam).toBe(false)
    expect(r.json().mitra.alasan_daftar_hitam).toBeNull()
  })

  it('alasan terlalu pendek ditolak — blacklist tanpa sebab tak bisa ditinjau', async () => {
    // Ambang 10 huruf, bukan sekadar "tak kosong": "ok" atau "-" memenuhi
    // CHECK basis tetapi tak memberitahu apa pun kepada orang yang
    // meninjaunya enam bulan lagi.
    for (const alasan of ['', 'ok', 'nakal']) {
      const r = await patch(`/api/v1/mitra/${idMitra}/daftar-hitam`,
        { daftar_hitam: true, alasan })
      expect(r.statusCode, r.body).toBe(400)
      expect(r.json().error).toMatch(/10 huruf/)
    }
  })

  it('masuk daftar hitam tercatat beserta waktunya', async () => {
    const r = await patch(`/api/v1/mitra/${idMitra}/daftar-hitam`,
      { daftar_hitam: true, alasan: 'tiga kali gagal serah terima' })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().mitra.daftar_hitam).toBe(true)
    expect(r.json().mitra.daftar_hitam_sejak).toBeTruthy()
    // Kelayakannya ikut di balasan supaya layar tak perlu menyimpulkan
    // sendiri dari kombinasi kolom — dan dua tempat yang menyimpulkan bisa
    // menyimpang.
    expect(r.json().kelayakan.boleh).toBe(false)
    expect(r.json().kelayakan.pesan).toMatch(/tiga kali gagal serah terima/)
  })

  it('mem-blacklist yang SUDAH hitam ditolak 409, bukan ditulis ulang', async () => {
    // Status lama ikut di WHERE: dua orang yang memutuskan berlawanan pada
    // saat yang sama tak boleh saling menimpa diam-diam.
    const r = await patch(`/api/v1/mitra/${idMitra}/daftar-hitam`,
      { daftar_hitam: true, alasan: 'alasan yang berbeda sama sekali' })
    expect(r.statusCode, r.body).toBe(409)

    // Dan alasan yang PERTAMA tetap berdiri — bukan tertimpa yang kedua.
    const { rows } = await db.query(
      'SELECT alasan_daftar_hitam FROM mitra WHERE id = $1', [idMitra])
    expect(rows[0].alasan_daftar_hitam).toBe('tiga kali gagal serah terima')
  })

  it('dicabut — alasannya IKUT hilang, bukan menempel selamanya', async () => {
    /*
      Membiarkan alasan setelah pencabutan membuat mitra yang sudah bersih
      tetap membawa kalimat tuduhan di datanya, dan layar mana pun yang
      menampilkan `alasan_daftar_hitam` tanpa memeriksa `daftar_hitam` akan
      menuduhnya lagi.
    */
    const r = await patch(`/api/v1/mitra/${idMitra}/daftar-hitam`, { daftar_hitam: false })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().mitra.daftar_hitam).toBe(false)
    expect(r.json().mitra.alasan_daftar_hitam).toBeNull()
    expect(r.json().mitra.daftar_hitam_sejak).toBeNull()
    expect(r.json().kelayakan.boleh).toBe(true)
  })
})

describe('satu identitas, banyak peran', () => {
  it('backfill migrasi 461 benar-benar menaut, dan perannya terlihat', async () => {
    /*
      Yang dibuktikan: tabel `mitra` bukan sekadar ada, melainkan BERISI dan
      TERTAUT. Migrasi yang membuat tabel kosong lolos semua pemeriksaan
      skema sambil tak menutup satu pun cacat.
    */
    const { rows } = await db.query(
      `SELECT w.mitra_id FROM workers w
        WHERE w.company_id = $1 AND w.mitra_id IS NOT NULL
        ORDER BY w.created_at, w.id LIMIT 1`, [companyId])
    if (!rows.length) throw new Error('nol tukang tertaut mitra — migrasi 461 belum jalan?')

    const r = await get(`/api/v1/mitra/${rows[0].mitra_id}`)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().peran.sebagai_tukang.length).toBeGreaterThan(0)
    expect(r.json().kelayakan.kode).toBe('layak')
  })

  it('daftar membawa ringkasan yang dihitung dari SELURUH baris', async () => {
    const r = await get('/api/v1/mitra')
    expect(r.statusCode, r.body).toBe(200)
    const { mitra, ringkasan } = r.json()
    expect(ringkasan.total).toBe(mitra.length)
    // Backfill 461: 60 tukang → orang, 5 pemasok → badan usaha.
    expect(ringkasan.orang).toBeGreaterThan(0)
    expect(ringkasan.badan_usaha).toBeGreaterThan(0)
  })

  it('saring per BENTUK memulangkan hanya bentuk itu', async () => {
    const r = await get('/api/v1/mitra?bentuk=badan_usaha')
    expect(r.statusCode).toBe(200)
    const semua = r.json().mitra as { bentuk: string }[]
    expect(semua.length).toBeGreaterThan(0)
    expect(semua.every((m) => m.bentuk === 'badan_usaha')).toBe(true)
  })
})
