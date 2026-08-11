import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import markupRoutes from '../markup.js'

/**
 * MARKUP & MARGIN terhadap Postgres NYATA (G6).
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Pemilihan markup sudah dikunci 33 test di `lib/__tests__/markup.test.ts`
 * (15/15 mutasi MERAH). Yang tersisa dan butuh basis sungguhan:
 *
 *   • `buk_fraksi` GENERATED benar-benar dihitung basis, bukan dikirim aplikasi
 *   • dua markup umum pada tanggal sama DITOLAK indeks parsial — dan indeks
 *     parsial untuk `jenis_pekerjaan IS NULL` adalah bagian yang paling mudah
 *     salah, karena UNIQUE biasa TIDAK menangkap NULL
 *   • constraint 0..1 menolak "15" di lapisan basis, bukan hanya di aplikasi
 *   • periode yang sudah dipakai versi estimasi tak bisa dihapus
 *   • peta tenancy: `markup_periode` kategori B, `.from()` menyaring company
 *
 * Fixture berprefiks [TEST-MK] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let companyId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST' | 'DELETE', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

/**
 * Membersihkan jejak test.
 *
 * ── Kenapa ia juga MENYINGKIRKAN periode nyata (lalu mengembalikannya)
 *
 * Versi pertama hanya menghapus baris bertanda `[TEST-MK]`. Ia hijau di
 * basis kosong lalu MERAH begitu perusahaan menetapkan markup sungguhan:
 * test "tanpa satu pun periode, berlaku = null" ternyata masih melihat
 * periode nyata, dan "penawaran 1.100.000" berubah jadi 1.120.000 karena
 * markup nyata punya kontinjensi 2%.
 *
 * Terbukti bukan teori: markup pertama repo ini ditetapkan lewat UI beberapa
 * menit setelah test ini ditulis, dan empat test langsung merah.
 *
 * Menghapusnya permanen JELAS tak boleh — itu data perusahaan. Yang dilakukan:
 * disingkirkan ke `markupAsli` selama test berjalan, lalu dikembalikan utuh
 * di `afterAll`. Pola yang sama dipakai `petaAsli` di test R-012.
 */
let markupAsli: Array<Record<string, unknown>> = []

async function purge() {
  // Rujukan dilepas lebih dulu — kalau tidak, FK menahan penghapusan dan
  // berkas ini jadi tak bisa dijalankan ulang. Cacat sekelas ini baru saja
  // memakan test R-012 (`purge` vs jurnal posted).
  await client.query(
    `UPDATE estimate_versions SET markup_periode_id = NULL
      WHERE markup_periode_id IN (SELECT id FROM markup_periode)`)
  await client.query(`DELETE FROM markup_periode`)
}

/** Menyingkirkan periode nyata SEKALI, sebelum test pertama berjalan. */
async function simpanAsli() {
  const { rows } = await client.query(
    `SELECT company_id, jenis_pekerjaan, berlaku_sejak,
            overhead_fraksi, keuntungan_fraksi, kontinjensi_fraksi,
            alasan, catatan, ditetapkan_oleh
       FROM markup_periode`)
  markupAsli = rows
}

/** Mengembalikan periode nyata utuh. */
async function kembalikanAsli() {
  for (const r of markupAsli) {
    await client.query(
      `INSERT INTO markup_periode
         (company_id, jenis_pekerjaan, berlaku_sejak, overhead_fraksi,
          keuntungan_fraksi, kontinjensi_fraksi, alasan, catatan, ditetapkan_oleh)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [r.company_id, r.jenis_pekerjaan, r.berlaku_sejak, r.overhead_fraksi,
       r.keuntungan_fraksi, r.kontinjensi_fraksi, r.alasan, r.catatan,
       r.ditetapkan_oleh])
  }
}

const baris = (o: Record<string, unknown> = {}) => ({
  berlaku_sejak: '2026-03-01',
  overhead_fraksi: 0.03,
  keuntungan_fraksi: 0.07,
  catatan: '[TEST-MK] periode uji',
  ...o,
})

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: c } = await client.query(
    `SELECT company_id FROM projects WHERE company_id IS NOT NULL
      ORDER BY created_at LIMIT 1`)
  if (c.length === 0) throw new Error('basis tanpa proyek ber-company — fixture tak bisa dibuat')
  companyId = c[0].company_id

  await simpanAsli()
  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(markupRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  // Pemulihan data perusahaan didahulukan dan DIJAMIN berjalan: kalau test
  // gagal di tengah, yang paling tak boleh terjadi adalah markup perusahaan
  // ikut hilang bersama fixture. `try/finally` di sini bukan kerapian —
  // tanpanya, satu test merah bisa menghapus kebijakan margin.
  try {
    await purge()
    await kembalikanAsli()
  } finally {
    await app?.close()
    await client?.end()
  }
})

describe('GET /markup — menjawab "belum ditetapkan", bukan angka aman', () => {
  it('tanpa satu pun periode, berlaku = null', async () => {
    await purge()
    const r = await get('/api/v1/markup')
    expect(r.statusCode).toBe(200)
    // Kalau ini 0 atau 0.1, layar menampilkan estimasi lengkap dan meyakinkan
    // sementara tak ada yang pernah menetapkan angkanya.
    expect(r.json().berlaku).toBeNull()
  })

  it('/berlaku menjawab 200 dengan alasan, BUKAN 404', async () => {
    await purge()
    const r = await get('/api/v1/markup/berlaku')
    expect(r.statusCode).toBe(200)
    expect(r.json().markup).toBeNull()
    // 404 terbaca sebagai "endpoint-nya salah" dan orang mencari di tempat
    // keliru. Yang bertanya berhak tahu jawabannya "belum ditetapkan".
    expect(r.json().alasan).toMatch(/belum ditetapkan/i)
  })
})

describe('POST /markup — basis yang menjaga, bukan hanya aplikasi', () => {
  it('periode tersimpan dan buk_fraksi DIHITUNG basis', async () => {
    await purge()
    const r = await kirim('POST', '/api/v1/markup', baris())
    expect(r.statusCode).toBe(201)
    // GENERATED ALWAYS — aplikasi tak pernah mengirimnya. Kalau ini bisa
    // berbeda dari jumlah komponennya, ada baris yang totalnya bohong.
    expect(Number(r.json().periode.buk_fraksi)).toBeCloseTo(0.10, 6)
  })

  it('dua markup UMUM pada tanggal sama ditolak 409 dengan sebab', async () => {
    await purge()
    await kirim('POST', '/api/v1/markup', baris())
    const r = await kirim('POST', '/api/v1/markup', baris({ keuntungan_fraksi: 0.09 }))
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/jawaban tunggal/)
    // Pesan Postgres menyebut nama indeks — tak berguna bagi yang mengetik.
    expect(r.json().error).not.toMatch(/uq_markup|duplicate key/i)
  })

  it('UNIQUE untuk jenis NULL benar-benar bekerja', async () => {
    // Bagian yang paling mudah salah: `UNIQUE (company_id, jenis, tanggal)`
    // biasa TIDAK menangkap duplikat saat jenis NULL, karena NULL <> NULL.
    // Yang menjaga di sini indeks PARSIAL, dan inilah yang membuktikannya.
    await purge()
    await kirim('POST', '/api/v1/markup', baris())
    const r = await kirim('POST', '/api/v1/markup', baris())
    expect(r.statusCode).toBe(409)
  })

  it('jenis BERBEDA pada tanggal sama DITERIMA', async () => {
    await purge()
    await kirim('POST', '/api/v1/markup', baris())
    const r = await kirim('POST', '/api/v1/markup', baris({ jenis_pekerjaan: 'jalan' }))
    expect(r.statusCode).toBe(201)
  })

  it('keuntungan 15 ditolak sebelum menyentuh basis', async () => {
    const r = await kirim('POST', '/api/v1/markup', baris({ keuntungan_fraksi: 15 }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/1500%/)
  })

  it('dan basis MENOLAKNYA juga — pemeriksaan aplikasi bukan satu-satunya', async () => {
    // Skrip impor, migrasi data, dan perbaikan manual lewat SQL tak lewat
    // rute mana pun. Kalau hanya aplikasi yang menjaga, mereka lolos.
    let lolos = false
    try {
      await client.query(
        `INSERT INTO markup_periode
           (company_id, berlaku_sejak, overhead_fraksi, keuntungan_fraksi, catatan)
         VALUES ($1, '2026-09-09', 0, 15, '[TEST-MK] langsung SQL')`, [companyId])
      lolos = true
    } catch { /* ditolak: benar */ }
    expect(lolos).toBe(false)
  })

  it('overhead kosong ditolak, tidak diperlakukan sebagai nol', async () => {
    const r = await kirim('POST', '/api/v1/markup', baris({ overhead_fraksi: '' }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/wajib diisi/)
  })

  it('tanggal berlaku wajib, dan alasannya disebut', async () => {
    const r = await kirim('POST', '/api/v1/markup', baris({ berlaku_sejak: undefined }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/dihitung ulang/)
  })

  it('jenis berisi spasi disimpan sebagai UMUM, bukan jenis bernama " "', async () => {
    // Ditemukan mutasi: mengganti `.trim() || null` dengan `?? null` tak
    // membuat satu test pun merah. Akibat nyatanya kalau lolos: baris
    // berjenis " " tak akan pernah cocok dengan jenis pekerjaan mana pun DAN
    // tak dianggap umum — markup yang tersimpan rapi lalu tak pernah dipakai,
    // sementara layar menampilkannya seolah berlaku.
    await purge()
    const r = await kirim('POST', '/api/v1/markup', baris({
      jenis_pekerjaan: '   ', berlaku_sejak: '2020-02-02',
    }))
    expect(r.statusCode).toBe(201)
    expect(r.json().periode.jenis_pekerjaan).toBeNull()

    // Dan ia benar-benar dipakai sebagai umum.
    const b = await get('/api/v1/markup/berlaku?jenis=gedung')
    expect(b.json().markup?.dari_umum).toBe(true)
  })

  it('kontinjensi kosong jadi 0, bukan galat', async () => {
    await purge()
    const r = await kirim('POST', '/api/v1/markup', baris({ kontinjensi_fraksi: '' }))
    expect(r.statusCode).toBe(201)
    expect(Number(r.json().periode.kontinjensi_fraksi)).toBe(0)
  })
})

describe('GET /markup/berlaku — perhitungan', () => {
  it('menghitung penawaran dan margin dari biaya pokok', async () => {
    await purge()
    await kirim('POST', '/api/v1/markup', baris({ berlaku_sejak: '2020-01-01' }))
    const r = await get('/api/v1/markup/berlaku?biaya_pokok=1000000')
    expect(r.statusCode).toBe(200)
    expect(r.json().rincian.nilai_penawaran).toBe(1_100_000)
    // markup 10% BUKAN margin 10% — 100.000 dari 1.100.000 = 9,09%.
    expect(r.json().margin_persen).toBeCloseTo(9.0909, 3)
  })

  it('biaya_pokok KOSONG ditolak — `Number("")` adalah 0', async () => {
    // Tanpa pemeriksaan panjang, `?biaya_pokok=` menghasilkan penawaran Rp 0
    // yang seluruhnya "berhasil" dan tak memicu satu pun galat.
    const r = await get('/api/v1/markup/berlaku?biaya_pokok=')
    expect(r.statusCode).toBe(400)
  })

  it('biaya_pokok negatif ditolak', async () => {
    const r = await get('/api/v1/markup/berlaku?biaya_pokok=-5')
    expect(r.statusCode).toBe(400)
  })

  it('tanggal tak sah ditolak, bukan diam-diam pakai hari ini', async () => {
    const r = await get('/api/v1/markup/berlaku?pada=01-01-2026')
    expect(r.statusCode).toBe(400)
  })

  it('markup masa depan tidak dipakai hari ini', async () => {
    await purge()
    await kirim('POST', '/api/v1/markup', baris({ berlaku_sejak: '2099-01-01' }))
    const r = await get('/api/v1/markup/berlaku')
    expect(r.json().markup).toBeNull()
  })

  it('jenis tanpa baris sendiri jatuh ke umum dan MENYATAKANNYA', async () => {
    await purge()
    await kirim('POST', '/api/v1/markup', baris({ berlaku_sejak: '2020-01-01' }))
    const r = await get('/api/v1/markup/berlaku?jenis=gedung')
    expect(r.json().markup.dari_umum).toBe(true)
  })
})

describe('DELETE /markup/:id', () => {
  it('periode yang belum dipakai bisa dihapus', async () => {
    await purge()
    const c = await kirim('POST', '/api/v1/markup', baris())
    const r = await kirim('DELETE', `/api/v1/markup/${c.json().periode.id}`)
    expect(r.statusCode).toBe(200)
  })

  it('periode yang SUDAH dipakai versi estimasi ditolak 409', async () => {
    await purge()
    const c = await kirim('POST', '/api/v1/markup', baris())
    const id = c.json().periode.id

    const { rows: v } = await client.query(
      `SELECT ev.id FROM estimate_versions ev
         JOIN scenarios s ON s.id = ev.scenario_id
         JOIN projects p ON p.id = s.project_id
        WHERE p.company_id = $1 LIMIT 1`, [companyId])
    if (v.length === 0) return   // basis tanpa versi estimasi — dilewati

    await client.query(
      `UPDATE estimate_versions SET markup_periode_id = $1 WHERE id = $2`, [id, v[0].id])

    const r = await kirim('DELETE', `/api/v1/markup/${id}`)
    expect(r.statusCode).toBe(409)
    // Angkanya memang ikut tersalin ke estimate_versions, tapi rujukannya
    // yang membuat "markup yang mana" bisa DITUNJUK saat dipertanyakan.
    expect(r.json().error).toMatch(/sudah ditawarkan|penjelasan/)

    await client.query(
      `UPDATE estimate_versions SET markup_periode_id = NULL WHERE id = $1`, [v[0].id])
  })

  it('id yang tak ada menjawab 404', async () => {
    const r = await kirim('DELETE',
      '/api/v1/markup/00000000-0000-0000-0000-0000000000ff')
    expect(r.statusCode).toBe(404)
  })
})
