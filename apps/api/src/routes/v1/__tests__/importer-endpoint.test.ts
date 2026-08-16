import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import * as XLSX from 'xlsx'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import importerRoutes from '../importer.js'

/**
 * IMPORTER terhadap Postgres NYATA (TJS-P3).
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Pemetaan & validasinya sudah dikunci 39 test di
 * `lib/__tests__/importer.test.ts` (15 mutasi MERAH). Yang tersisa:
 *
 *   • `cara_verifikasi` item ini, kata demi kata: *"berkas dengan 1 baris
 *     rusak → NOL baris masuk; perbaiki → semua masuk"*
 *   • pratinjau TIDAK menulis apa pun — dibuktikan dengan menghitung baris
 *     tabel sebelum & sesudah
 *   • template CSV benar-benar ber-BOM UTF-8
 *   • `company_id` terisi dari SESI, bukan dari badan permintaan
 *
 * Fixture berprefiks [TEST-IM] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const post = (url: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`DELETE FROM materials WHERE code LIKE '[TEST-IM]%'`)
  await client.query(`DELETE FROM suppliers WHERE code LIKE '[TEST-IM]%'`)
  // `cost_codes` TIDAK bisa di-DELETE — trigger `fn_cost_codes_no_delete`
  // (migrasi 102) menolaknya karena riwayat lintas domain merujuknya.
  // Baris uji dinetralkan jadi `deprecated`, cara yang sama dipakai blok
  // verifikasi migrasi 427.
  await client.query(
    `UPDATE cost_codes SET status='deprecated', deprecated_at=now()
      WHERE code LIKE '[TEST-IM]%' AND status <> 'deprecated'`,
  )
}

async function hitungMaterial(): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int n FROM materials`)
  return rows[0].n
}

/** Membuat berkas XLSX di memori, dikirim sebagai base64 seperti dari UI. */
function berkas(baris: Array<Record<string, unknown>>): string {
  const ws = XLSX.utils.json_to_sheet(baris)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64')
}

const PETA = { Kode: 'code', Nama: 'name', Satuan: 'unit', Harga: 'unit_price' }

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(importerRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  try { await purge() } finally {
    await app?.close()
    await client?.end()
  }
})

describe('GET /impor/skema & template', () => {
  it('menyebut skema beserta kolomnya', async () => {
    const r = await get('/api/v1/impor/skema')
    expect(r.statusCode).toBe(200)
    const m = r.json().skema.find((s: { kunci: string }) => s.kunci === 'material')
    expect(m).toBeTruthy()
    expect(m.kolom.length).toBeGreaterThan(0)
  })

  it('template CSV ber-BOM UTF-8', async () => {
    // Tanpa BOM, Excel di Windows membaca CSV sebagai ANSI dan "Ø12mm"
    // berubah jadi "Ã˜12mm" — pengguna memperbaikinya manual di 500 baris,
    // atau lebih buruk, mengimpornya begitu saja.
    const r = await get('/api/v1/impor/material/template')
    expect(r.statusCode).toBe(200)
    expect(r.payload.charCodeAt(0)).toBe(0xFEFF)
    // Kolom wajib ditandai bintang supaya terlihat sebelum diisi.
    expect(r.payload).toContain('Nama*')
  })

  it('skema tak dikenal menjawab 404', async () => {
    expect((await get('/api/v1/impor/ngawur/template')).statusCode).toBe(404)
  })
})

describe('POST /impor/baca — tahap 1', () => {
  it('membaca judul kolom dan mengusulkan pemetaan', async () => {
    const r = await post('/api/v1/impor/baca', {
      skema: 'material',
      berkas_base64: berkas([{ Kode: 'A', Nama: 'Semen', Satuan: 'sak' }]),
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().judul).toEqual(['Kode', 'Nama', 'Satuan'])
    expect(r.json().jumlah_baris).toBe(1)
    const u = r.json().usulan.find((x: { kolomBerkas: string }) => x.kolomBerkas === 'Nama')
    expect(u.kolomTarget).toBe('name')
  })

  it('berkas kosong ditolak dengan sebabnya', async () => {
    const r = await post('/api/v1/impor/baca', {
      skema: 'material', berkas_base64: berkas([]),
    })
    expect(r.statusCode).toBe(400)
  })

  it('berkas rusak ditolak 400, BUKAN melempar 500', async () => {
    // XLSX ternyata menerima teks sembarang tanpa melempar — ia
    // menafsirkannya sebagai CSV satu sel. Jadi yang menangkapnya bukan
    // `catch`, melainkan pemeriksaan "nol baris" di bawahnya.
    //
    // Yang penting tetap terpenuhi: 400 dengan pesan yang bisa dipahami,
    // bukan 500 yang membuat pengguna mengira aplikasinya rusak. Test ini
    // menguji ITU, bukan kalimat tertentu — kalimat yang dipaksakan hanya
    // akan mengunci pesan pada cabang yang kebetulan terpakai hari ini.
    const r = await post('/api/v1/impor/baca', {
      skema: 'material', berkas_base64: Buffer.from('bukan excel').toString('base64'),
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error.length).toBeGreaterThan(10)
  })

  it('berkas berisi teks acak tak menghasilkan baris palsu', async () => {
    // Yang lebih berbahaya daripada 500: XLSX menerima sampah dan
    // menghasilkan satu "baris" berisi satu kolom aneh, lalu importer
    // melanjutkannya seolah berkas sah.
    const r = await post('/api/v1/impor/baca', {
      skema: 'material',
      berkas_base64: Buffer.from('bukan excel').toString('base64'),
    })
    expect(r.statusCode).toBe(400)
  })
})

describe('POST /impor/pratinjau — TIDAK menulis apa pun', () => {
  it('validasi penuh tanpa menyentuh tabel target', async () => {
    await purge()
    const sebelum = await hitungMaterial()

    const r = await post('/api/v1/impor/pratinjau', {
      skema: 'material',
      pemetaan: PETA,
      baris: [
        { Kode: '[TEST-IM]1', Nama: 'Semen', Satuan: 'sak', Harga: '75.000' },
        { Kode: '[TEST-IM]2', Nama: 'Pasir', Satuan: 'm3', Harga: '250.000' },
      ],
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().bisa_commit).toBe(true)
    expect(r.json().jumlah_siap).toBe(2)

    // Inti kriteria: NOL tulisan.
    expect(await hitungMaterial()).toBe(sebelum)
  })

  it('galat dilaporkan SELURUHNYA, dan tetap nol tulisan', async () => {
    const sebelum = await hitungMaterial()
    const r = await post('/api/v1/impor/pratinjau', {
      skema: 'material',
      pemetaan: PETA,
      baris: [
        { Kode: 'A', Nama: '', Satuan: 'sak' },
        { Kode: 'B', Nama: 'Ada', Satuan: '' },
      ],
    })
    expect(r.json().bisa_commit).toBe(false)
    expect(r.json().galat.length).toBeGreaterThanOrEqual(2)
    expect(await hitungMaterial()).toBe(sebelum)
  })

  it('kolom wajib yang tak dipetakan dilaporkan terpisah', async () => {
    const r = await post('/api/v1/impor/pratinjau', {
      skema: 'material',
      pemetaan: { Kode: 'code' },
      baris: [{ Kode: 'A' }],
    })
    expect(r.json().wajib_hilang).toContain('Nama')
    expect(r.json().bisa_commit).toBe(false)
  })
})

describe('POST /impor/commit — ALL-OR-NOTHING', () => {
  it('cara_verifikasi item ini: 1 baris rusak → NOL masuk; perbaiki → semua masuk', async () => {
    await purge()
    const sebelum = await hitungMaterial()

    // ── Berkas dengan SATU baris rusak (Nama kosong di baris kedua)
    const rusak = await post('/api/v1/impor/commit', {
      skema: 'material',
      pemetaan: PETA,
      baris: [
        { Kode: '[TEST-IM]A', Nama: 'Sah', Satuan: 'sak' },
        { Kode: '[TEST-IM]B', Nama: '', Satuan: 'sak' },
        { Kode: '[TEST-IM]C', Nama: 'Sah juga', Satuan: 'sak' },
      ],
    })
    expect(rusak.statusCode).toBe(400)
    // NOL baris masuk — termasuk dua yang sah.
    expect(await hitungMaterial()).toBe(sebelum)

    // ── Diperbaiki: SEMUA masuk
    const baik = await post('/api/v1/impor/commit', {
      skema: 'material',
      pemetaan: PETA,
      baris: [
        { Kode: '[TEST-IM]A', Nama: 'Sah', Satuan: 'sak' },
        { Kode: '[TEST-IM]B', Nama: 'Diperbaiki', Satuan: 'sak' },
        { Kode: '[TEST-IM]C', Nama: 'Sah juga', Satuan: 'sak' },
      ],
    })
    expect(baik.statusCode).toBe(200)
    expect(baik.json().masuk).toBe(3)
    expect(await hitungMaterial()).toBe(sebelum + 3)
  })

  it('galat ditangkap APLIKASI dengan daftar per-baris, bukan oleh basis', async () => {
    // Ditemukan mutasi: membuang pemeriksaan `h.galat.length > 0` di commit
    // tak membuat test merah — baris ber-Nama kosong tetap ditolak, tetapi
    // oleh NOT NULL di basis, dan status-nya sama-sama 400.
    //
    // Yang BERBEDA adalah pesannya. Basis menjawab 'null value in column
    // "name" violates not-null constraint' — kalimat yang tak menyebut BARIS
    // KE BERAPA yang salah. Pada berkas 500 baris, itu berarti pengguna harus
    // mencarinya sendiri.
    //
    // Karena itu yang diuji: adanya `galat[]` ber-nomor baris, bukan sekadar
    // status 400.
    const r = await post('/api/v1/impor/commit', {
      skema: 'material', pemetaan: PETA,
      baris: [
        { Kode: 'X1', Nama: 'Sah', Satuan: 'sak' },
        { Kode: 'X2', Nama: '', Satuan: 'sak' },
      ],
    })
    expect(r.statusCode).toBe(400)
    expect(Array.isArray(r.json().galat)).toBe(true)
    expect(r.json().galat.length).toBeGreaterThan(0)
    // Nomor barisnya disebut — itu yang membuat galat bisa diperbaiki.
    expect(r.json().galat[0].baris).toBe(3)
    expect(r.json().error).toMatch(/all-or-nothing|TIDAK ADA/i)
  })

  it('kolom wajib tak dipetakan ditolak APLIKASI dengan nama kolomnya', async () => {
    // Ditemukan mutasi: membuang pemeriksaan `wajibHilang` tak membuat test
    // merah — basis pun menolak lewat NOT NULL. Yang hilang: nama kolom yang
    // harus dipetakan.
    const r = await post('/api/v1/impor/commit', {
      skema: 'material',
      pemetaan: { Kode: 'code' },
      baris: [{ Kode: 'Y1' }],
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/Kolom wajib belum dipetakan/)
    expect(r.json().error).toMatch(/Nama/)
  })

  it('company_id terisi dari SESI, bukan dari badan permintaan', async () => {
    await purge()
    await post('/api/v1/impor/commit', {
      skema: 'material', pemetaan: PETA,
      // Upaya menyelipkan company lain — harus DIABAIKAN.
      company_id: '00000000-0000-0000-0000-0000000000ff',
      baris: [{ Kode: '[TEST-IM]TENANT', Nama: 'Uji tenant', Satuan: 'sak' }],
    })
    const { rows } = await client.query(
      `SELECT company_id FROM materials WHERE code = '[TEST-IM]TENANT'`)
    expect(rows).toHaveLength(1)
    // Material impor TIDAK boleh ber-company_id NULL: `materials` kategori AB,
    // dan NULL berarti terlihat oleh SELURUH tenant.
    expect(rows[0].company_id).not.toBeNull()
    expect(rows[0].company_id).not.toBe('00000000-0000-0000-0000-0000000000ff')
  })

  it('skema tak dikenal ditolak DENGAN SEBABNYA, bukan galat lain', async () => {
    // Ditemukan mutasi: membuang pemeriksaan skema tak membuat test merah —
    // `cariSkema` mengembalikan null, lalu `validasi` melempar dan
    // menghasilkan 400 juga. Status yang sama, sebab yang sama sekali beda.
    const r = await post('/api/v1/impor/commit', {
      skema: 'users', pemetaan: {}, baris: [{ a: 1 }],
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toBe('Skema tidak dikenal')
  })

  it('berkas melebihi batas baris ditolak dengan angkanya', async () => {
    // Ditemukan mutasi: membuang batas tak membuat test merah karena tak ada
    // test yang mengirim berkas sebesar itu.
    //
    // Yang dijaganya nyata: satu transaksi 50.000 baris mengunci tabel dan
    // membuat SELURUH aplikasi menunggu — bukan hanya yang mengimpor.
    const banyak = Array.from({ length: 5001 }, (_, i) => ({
      Kode: `Z${i}`, Nama: `Barang ${i}`, Satuan: 'pcs',
    }))
    const r = await post('/api/v1/impor/baca', {
      skema: 'material', berkas_base64: berkas(banyak),
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/5000/)
    expect(r.json().error).toMatch(/mengunci tabel/)
  }, 30_000)

  it('baris kosong ditolak', async () => {
    const r = await post('/api/v1/impor/commit', {
      skema: 'material', pemetaan: PETA, baris: [],
    })
    expect(r.statusCode).toBe(400)
  })

  it('divalidasi ULANG di commit — hasil pratinjau tak dipercaya', async () => {
    // "Sudah lolos pratinjau" adalah klaim KLIEN, bukan fakta server. Klien
    // bisa mengirim baris yang berbeda dari yang divalidasi.
    await purge()
    const sebelum = await hitungMaterial()
    const r = await post('/api/v1/impor/commit', {
      skema: 'material', pemetaan: PETA,
      baris: [{ Kode: '[TEST-IM]Z', Nama: '', Satuan: 'sak' }],
    })
    expect(r.statusCode).toBe(400)
    expect(await hitungMaterial()).toBe(sebelum)
  })
})

/**
 * SKEMA BARU (427) — pemasok & cost code.
 *
 * Yang dijaga di sini bukan "skemanya terdaftar", melainkan bahwa dua hal
 * yang menggagalkan impor SEBELUM ini benar-benar tertutup:
 *
 *   1. `payment_terms` daftar tertutup, bukan angka hari — asumsi keliru yang
 *      membuat percobaan pertama migrasi 427 ditolak basis;
 *   2. `code` unik GLOBAL — tenant kedua ditolak kode tenant pertama, dan
 *      penolakannya membocorkan keberadaan data orang lain.
 */
describe('skema pemasok & cost code (427)', () => {
  const PETA_SUP = { Kode: 'code', Nama: 'name', Termin: 'payment_terms' }

  it('keduanya terdaftar di /impor/skema', async () => {
    const r = await get('/api/v1/impor/skema')
    const kunci = r.json().skema.map((s: { kunci: string }) => s.kunci)
    expect(kunci).toContain('supplier')
    expect(kunci).toContain('cost_code')
  })

  it('pemasok masuk, dan termin bahasa manusia jadi nilai basis', async () => {
    await purge()
    const r = await post('/api/v1/impor/commit', {
      skema: 'supplier', pemetaan: PETA_SUP,
      baris: [{ Kode: '[TEST-IM]S1', Nama: 'Pemasok Uji', Termin: '30 hari' }],
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().masuk).toBe(1)

    const { rows } = await client.query(
      `SELECT payment_terms, company_id FROM suppliers WHERE code='[TEST-IM]S1'`,
    )
    // "30 hari" dari Excel → `net_30` di basis. Tanpa penerjemahan ini,
    // CHECK menolaknya dan SELURUH berkas gagal.
    expect(rows[0].payment_terms).toBe('net_30')
    expect(rows[0].company_id).toBeTruthy()
  })

  it('termin yang tak dikenali jadi NULL — tidak ditebak, tidak menggagalkan berkas', async () => {
    await purge()
    const r = await post('/api/v1/impor/commit', {
      skema: 'supplier', pemetaan: PETA_SUP,
      baris: [
        { Kode: '[TEST-IM]S2', Nama: 'Pemasok A', Termin: 'net 30' },
        { Kode: '[TEST-IM]S3', Nama: 'Pemasok B', Termin: 'sesuai kesepakatan' },
      ],
    })
    // Yang penting: baris kedua TIDAK menggagalkan yang pertama.
    expect(r.statusCode).toBe(200)
    expect(r.json().masuk).toBe(2)

    const { rows } = await client.query(
      `SELECT code, payment_terms FROM suppliers WHERE code LIKE '[TEST-IM]S%' ORDER BY code`,
    )
    expect(rows.find((x) => x.code === '[TEST-IM]S2')?.payment_terms).toBe('net_30')
    expect(rows.find((x) => x.code === '[TEST-IM]S3')?.payment_terms).toBeNull()
  })

  it('pratinjau memperlihatkan nilai yang BENAR-BENAR akan tersimpan', async () => {
    // Kalau pratinjau menampilkan "30 hari" sementara yang masuk `net_30`,
    // layar berbohong tentang apa yang akan terjadi.
    const r = await post('/api/v1/impor/pratinjau', {
      skema: 'supplier', pemetaan: PETA_SUP,
      baris: [{ Kode: '[TEST-IM]S9', Nama: 'Pemasok', Termin: '30 hari' }],
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().contoh[0].payment_terms).toBe('net_30')
  })

  it('cost code impor lahir DRAFT, bukan langsung aktif', async () => {
    // ⚠ Kode dibuat UNIK per jalannya test, dan itu BUKAN kerapian belaka.
    //
    // `cost_codes` tak bisa dihapus — trigger `fn_cost_codes_no_delete`
    // (migrasi 102) menolaknya karena riwayat lintas domain merujuknya, jadi
    // `purge()` hanya bisa menandainya `deprecated`. Sementara unik
    // `(company_id, code)` TIDAK mengecualikan yang deprecated.
    //
    // Akibatnya kode tetap akan ditolak pada jalan KEDUA. Versi pertama test
    // ini memakai kode tetap: ia HIJAU sendirian dan MERAH begitu dijalankan
    // dua kali — bentuk kegagalan yang menyalahkan fiturnya, padahal
    // fiturnya benar dan test-nya yang keliru berasumsi basis bisa bersih.
    const kode = `[TEST-IM]C-${Date.now()}`
    const r = await post('/api/v1/impor/commit', {
      skema: 'cost_code',
      pemetaan: { Kode: 'code', Nama: 'name' },
      baris: [{ Kode: kode, Nama: 'Pekerjaan uji' }],
    })
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200)

    const { rows } = await client.query(
      `SELECT status FROM cost_codes WHERE code=$1`, [kode],
    )
    // Kode biaya yang lahir AKTIF melewati satu-satunya tahap di mana orang
    // memeriksa apakah kodenya benar.
    expect(rows[0].status).toBe('draft')
    await purge()
  })

  it('template pemasok menandai kolom wajib', async () => {
    const r = await get('/api/v1/impor/supplier/template')
    expect(r.statusCode).toBe(200)
    expect(r.payload.charCodeAt(0)).toBe(0xFEFF)
    expect(r.payload).toContain('Nama*')
  })
})
