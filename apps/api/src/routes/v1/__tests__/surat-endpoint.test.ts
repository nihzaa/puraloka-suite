import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import suratRoutes from '../surat.js'

// ════════════════════════════════════════════════════════════════════════════
// SURAT MASUK/KELUAR — DIUJI LEWAT ENDPOINT NYATA (INTI #5 · migrasi 185)
// ════════════════════════════════════════════════════════════════════════════
//
// `lib/surat-korespondensi.test.ts` menguji aritmetika batas balasnya.
// Berkas ini menguji yang tak bisa digantikan olehnya:
//
//   · constraint database benar-benar menolak bentuk yang mustahil
//   · ARAH memisahkan "kita lalai" dari "lawan lalai" di ringkasan
//   · rantai balasan tersimpan dan bisa ditelusuri
//   · nomor ganda per proyek ditolak
//
// ⚠️ CATATAN ISOLASI (R-009): harness ini menulis ke schema `public` dan
// tulisannya BERTAHAN. Karena itu tiap baris diberi prefiks `[TEST-SURAT]` dan
// dibersihkan di `purge()`. Tanpa itu, run berikutnya mewarisi sampah run ini.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let companyId: string
let projectId: string

const PREFIX = '[TEST-SURAT]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url, payload: { project_id: projectId, ...payload } as never,
    headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

/** `YYYY-MM-DD`, `n` hari lalu (negatif = ke depan) dari hari ini WIB. */
function hari(n: number): string {
  return new Date(Date.now() + 7 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10)
}

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(
      `DELETE FROM project_letters WHERE project_id IN (SELECT id FROM projects WHERE name LIKE $1)`,
      [`${PREFIX}%`])
    await client.query(`DELETE FROM projects WHERE name LIKE $1`, [`${PREFIX}%`])
    await client.query(`DELETE FROM clients WHERE contact_person LIKE $1`, [`${PREFIX}%`])
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

let seq = 0
const nomorBaru = () => `${PREFIX}-${++seq}/PP/VIII`

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT id FROM users WHERE auth_id = $1`, [adminAuth])
  adminUserId = u[0].id

  // `company_id` EKSPLISIT — `fn_isi_company_id()` menolak menebak saat ada
  // lebih dari satu company, dan CI punya beberapa (pelajaran F0-14).
  //
  // ⚠️ Dulu di sini: `SELECT id FROM companies ... LIMIT 1`, yang memilih
  // company TANPA melihat keanggotaan si admin. Selama akun uji cuma anggota
  // satu company itu tak pernah terlihat salah.
  //
  // `GET /api/v1/letters` menyaring lewat `db.projectIds()`, dan daftar itu
  // dibangun dari keanggotaan pengguna. Begitu fixture menaruh proyeknya di
  // company yang BUKAN keanggotaan admin, endpoint dengan benar memulangkan
  // nol baris — dan test-nya gagal dengan pesan yang menuduh endpoint-nya,
  // padahal yang salah pilihan company-nya.
  companyId = await companyBerisi(client, adminAuth)

  const { rows: c } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by)
     VALUES ($1, $2, '081200000003', $3) RETURNING id`,
    [companyId, `${PREFIX} Klien`, adminUserId])

  const { rows: p } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, contract_value,
                           start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4, 'Bandung', 5000000000, CURRENT_DATE,
             CURRENT_DATE + INTERVAL '180 days', $3) RETURNING id`,
    [companyId, c[0].id, adminUserId, `${PREFIX} Proyek`])
  projectId = p[0].id

  app = Fastify()
  await app.register(suratRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await purge()
  await app?.close()
  await client?.end()
})

const suratKeluar = (extra: Record<string, unknown> = {}) => ({
  nomor: nomorBaru(), arah: 'keluar', jenis: 'permintaan',
  perihal: 'Permintaan penyerahan lahan blok B',
  dari_pihak: 'PT Puraloka Persada', kepada_pihak: 'PT Owner Sejahtera',
  tanggal_kirim: hari(5), status: 'terkirim', ...extra,
})

describe('pencatatan surat', () => {
  it('PENJAGA BERDAYA: surat keluar sah tercatat', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/letters`, suratKeluar())
    expect(res.statusCode, `body: ${res.body.slice(0, 300)}`).toBe(201)
    expect(res.json().data.arah).toBe('keluar')
  })

  it('surat MASUK tanpa tanggal terima DITOLAK 422', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/letters`, {
      nomor: nomorBaru(), arah: 'masuk', perihal: 'Instruksi perubahan gambar',
      dari_pihak: 'PT Owner', kepada_pihak: 'PT Puraloka Persada',
      status: 'diterima',
    })

    expect(res.statusCode,
      'surat masuk tanpa tanggal terima diterima — kewajiban menjawab tak ' +
      'punya titik mulai, dan kelalaian kita tak bisa dihitung siapa pun').toBe(422)
  })

  it('batas balas TANPA butuh_balasan DITOLAK', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/letters`,
      suratKeluar({ batas_balas: hari(-10) }))

    expect(res.statusCode,
      'batas pada surat yang tak menuntut jawaban menghasilkan peringatan ' +
      'palsu — dan peringatan palsu melatih orang mengabaikan SEMUANYA').toBe(422)
  })

  it('perihal terlalu pendek DITOLAK', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/letters`,
      suratKeluar({ perihal: 'Srt' }))
    expect(res.statusCode).toBe(400)
  })

  it('nomor ganda di proyek yang sama DITOLAK 409', async () => {
    actAs(adminAuth)
    const nomor = nomorBaru()
    const body = { ...suratKeluar(), nomor }
    expect((await post(`/api/v1/projects/${projectId}/letters`, body)).statusCode).toBe(201)

    const dua = await post(`/api/v1/projects/${projectId}/letters`,
      { ...body, perihal: 'Surat kedua dengan nomor yang sama' })
    expect(dua.statusCode,
      'dua surat bernomor sama — rujukan "sesuai surat 012/PP/VIII" jadi ' +
      'ambigu, dan itu justru rujukan yang dipakai saat sengketa').toBe(409)
  })
})

describe('ARAH memisahkan KITA lalai dari LAWAN lalai', () => {
  it('ringkasan menghitung keduanya TERPISAH', async () => {
    actAs(adminAuth)

    // KELUAR lewat batas → LAWAN yang belum menjawab (bahan penagihan)
    await post(`/api/v1/projects/${projectId}/letters`, suratKeluar({
      perihal: 'Permintaan jawaban yang tak kunjung dibalas owner',
      tanggal_kirim: hari(60), butuh_balasan: true, batas_balas: hari(30),
    }))

    // MASUK lewat batas → KITA yang belum menjawab (pekerjaan hari ini)
    await post(`/api/v1/projects/${projectId}/letters`, {
      nomor: nomorBaru(), arah: 'masuk', jenis: 'teguran',
      perihal: 'Teguran keterlambatan dari pemberi kerja',
      dari_pihak: 'PT Owner Sejahtera', kepada_pihak: 'PT Puraloka Persada',
      tanggal_terima: hari(60), status: 'diterima',
      butuh_balasan: true, batas_balas: hari(30),
    })

    const res = await get(`/api/v1/projects/${projectId}/letters`)
    expect(res.statusCode, `body: ${res.body.slice(0, 300)}`).toBe(200)
    const r = res.json().ringkas

    expect(r.kita_belum_menjawab,
      'surat MASUK yang terabaikan tak terhitung sebagai kelalaian KITA — ' +
      'ia tenggelam bersama surat keluar yang tak dijawab lawan, dan dua ' +
      'keadaan yang menuntut tindakan BERLAWANAN jadi satu angka').toBeGreaterThanOrEqual(1)
    expect(r.lawan_belum_menjawab).toBeGreaterThanOrEqual(1)
  })

  it('tiap baris membawa siapaYangDitunggu', async () => {
    actAs(adminAuth)
    const res = await get(`/api/v1/projects/${projectId}/letters`)
    const semua = res.json().data as Array<{
      arah: string; batas: { keadaan: string; siapaYangDitunggu: string | null }
    }>

    const menunggu = semua.filter((s) => s.batas.keadaan !== 'tak_perlu')
    expect(menunggu.length).toBeGreaterThan(0)
    for (const s of menunggu) {
      const harusnya = s.arah === 'masuk' ? 'kita' : 'lawan'
      expect(s.batas.siapaYangDitunggu,
        `surat ${s.arah} menunjuk pihak yang salah`).toBe(harusnya)
    }
  })
})

describe('rantai balasan', () => {
  it('surat balasan menunjuk surat yang dibalasnya', async () => {
    actAs(adminAuth)
    const asli = await post(`/api/v1/projects/${projectId}/letters`, suratKeluar({
      perihal: 'Permintaan klarifikasi spesifikasi beton',
      butuh_balasan: true, batas_balas: hari(-14),
    }))
    expect(asli.statusCode).toBe(201)
    const asliId = asli.json().data.id

    const balas = await post(`/api/v1/projects/${projectId}/letters`, {
      nomor: nomorBaru(), arah: 'masuk', jenis: 'balasan',
      perihal: 'Jawaban atas permintaan klarifikasi spesifikasi beton',
      dari_pihak: 'PT Owner Sejahtera', kepada_pihak: 'PT Puraloka Persada',
      tanggal_terima: hari(1), status: 'diterima', membalas_id: asliId,
    })
    expect(balas.statusCode, `body: ${balas.body.slice(0, 300)}`).toBe(201)

    const { rows } = await client.query(
      `SELECT membalas_id FROM project_letters WHERE id = $1`, [balas.json().data.id])
    expect(rows[0].membalas_id,
      'rantai balasan hilang — "surat kami tak pernah dibalas" cuma bisa ' +
      'dibantah dengan mencari manual, dan yang mencari selalu menemukan apa ' +
      'yang ingin ditemukannya').toBe(asliId)
  })

  it('surat yang sudah DIBALAS tak lagi dihitung menunggu', async () => {
    actAs(adminAuth)
    const s = await post(`/api/v1/projects/${projectId}/letters`, suratKeluar({
      perihal: 'Surat yang batasnya lewat tapi sudah dibalas',
      tanggal_kirim: hari(90), butuh_balasan: true, batas_balas: hari(60),
    }))
    const id = s.json().data.id

    const ubah = await patch(`/api/v1/letters/${id}`, { status: 'dibalas' })
    expect(ubah.statusCode, `body: ${ubah.body.slice(0, 300)}`).toBe(200)

    const res = await get(`/api/v1/projects/${projectId}/letters`)
    const baris = (res.json().data as Array<{ id: string; batas: { keadaan: string } }>)
      .find((x) => x.id === id)
    expect(baris?.batas.keadaan,
      'surat yang SUDAH dibalas masih dihitung lewat batas — daftar mendesak ' +
      'penuh hal yang tak perlu, dan yang benar-benar mendesak tenggelam').toBe('tak_perlu')
  })
})

describe('PATCH — validasi memakai nilai GABUNGAN, bukan hanya yang dikirim', () => {
  it('menaikkan status tanpa melengkapi tanggal DITOLAK', async () => {
    actAs(adminAuth)
    // Draft tanpa tanggal kirim — sah sebagai draft.
    const s = await post(`/api/v1/projects/${projectId}/letters`, {
      nomor: nomorBaru(), arah: 'keluar', perihal: 'Draft surat belum dikirim',
      dari_pihak: 'PT Puraloka Persada', kepada_pihak: 'PT Owner',
      status: 'draft',
    })
    expect(s.statusCode).toBe(201)

    // Naik jadi 'terkirim' TANPA menyertakan tanggal kirim.
    const ubah = await patch(`/api/v1/letters/${s.json().data.id}`, { status: 'terkirim' })

    expect(ubah.statusCode,
      'status naik jadi terkirim tanpa tanggal kirim — validasi hanya melihat ' +
      'field yang DIKIRIM, sehingga kombinasi tak sah lolos lewat celah PATCH').toBe(422)
  })

  it('project_id wajib — surat kategori C tak bisa di-PATCH tanpa gerbang tenant', async () => {
    actAs(adminAuth)
    const s = await post(`/api/v1/projects/${projectId}/letters`, suratKeluar())
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/letters/${s.json().data.id}`,
      payload: { status: 'selesai' } as never,
      headers: { authorization: 'Bearer t' },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// GET /api/v1/letters — DAFTAR LINTAS PROYEK (dasar halaman /kontrak/surat)
// ════════════════════════════════════════════════════════════════════════════
//
// Yang diuji di sini justru yang TAK bisa diuji lewat endpoint per-proyek:
// gerbang tenancy-nya berbeda. Yang per-proyek dijaga `viaProject()` dengan
// satu id yang sudah divalidasi; yang ini menyaring `project_id` ke seluruh
// `db.projectIds()`, dan kesalahan di sana memulangkan surat proyek TENANT
// LAIN tanpa satu pun galat.
describe('GET /letters — daftar lintas proyek', () => {
  it('memuat surat dari proyek tenant, lengkap dengan nama proyeknya', async () => {
    actAs(adminAuth)
    const nomor = nomorBaru()
    const dibuat = await post(`/api/v1/projects/${projectId}/letters`,
      { ...suratKeluar(), nomor, perihal: 'Surat yang harus muncul di daftar lintas proyek' })
    expect(dibuat.statusCode, `body: ${dibuat.body.slice(0, 300)}`).toBe(201)

    const res = await get('/api/v1/letters')
    expect(res.statusCode, `body: ${res.body.slice(0, 300)}`).toBe(200)

    const baris = (res.json().data as Array<{ id: string; project_name: string }>)
      .find((x) => x.id === dibuat.json().data.id)

    expect(baris,
      'surat yang baru dicatat tak muncul di daftar lintas proyek — halaman ' +
      'kontrak menampilkan daftar kosong sementara suratnya ada di basis').toBeTruthy()

    // Nama proyek diambil lewat peta id→nama, bukan join. Kalau petanya salah,
    // tiap baris berbunyi "—" dan daftarnya tak bisa dipakai memilah proyek.
    expect(baris?.project_name).toBe(`${PREFIX} Proyek`)
  })

  it('ringkasan memisahkan KITA lalai dari LAWAN lalai, sama seperti per-proyek', async () => {
    actAs(adminAuth)
    const res = await get('/api/v1/letters')
    const r = res.json().ringkas as Record<string, number>

    // Keduanya WAJIB ada sebagai angka. Kalau salah satunya `undefined`, kartu
    // KPI di layar menampilkan "—" dan orang menyimpulkan tak ada yang lewat
    // batas — kebalikan dari keadaan sebenarnya.
    expect(typeof r.kita_belum_menjawab).toBe('number')
    expect(typeof r.lawan_belum_menjawab).toBe('number')
    expect(r.jumlah).toBeGreaterThan(0)
  })

  it('saringan arah=masuk tak memulangkan surat keluar', async () => {
    actAs(adminAuth)
    const res = await get('/api/v1/letters?arah=masuk')
    expect(res.statusCode).toBe(200)
    const semua = res.json().data as Array<{ arah: string }>
    expect(semua.every((s) => s.arah === 'masuk'),
      'saringan arah bocor — daftar "surat masuk" memuat surat keluar, dan ' +
      'kolom yang menentukan SIAPA yang lalai jadi tak bisa dipercaya').toBe(true)
  })

  it('PENJAGA TENANCY: project_id milik proyek yang tak ada DITOLAK 404', async () => {
    actAs(adminAuth)
    // UUID sah tapi bukan proyek tenant ini. Yang diuji: endpoint MEMBEDAKAN
    // "bukan proyek Anda" dari "proyek Anda yang kebetulan belum bersurat" —
    // keduanya sama-sama nol baris, dan menyamakannya menyembunyikan salah
    // ketik id di balik daftar kosong yang terlihat wajar.
    const res = await get('/api/v1/letters?project_id=00000000-0000-0000-0000-000000000000')
    expect(res.statusCode,
      'proyek di luar tenant dijawab 200 berisi daftar kosong — tak ada ' +
      'yang membedakannya dari proyek sendiri yang belum bersurat').toBe(404)
  })
})
