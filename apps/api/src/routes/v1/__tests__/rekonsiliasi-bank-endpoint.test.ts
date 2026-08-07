import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import rekonsiliasiBankRoutes from '../rekonsiliasi-bank.js'

/**
 * REKONSILIASI BANK — endpoint terhadap Postgres NYATA.
 *
 * ── Apa yang diuji di sini, dan apa yang TIDAK
 *
 * Aritmetikanya sudah dikunci 22 test di `lib/__tests__/rekonsiliasi-bank.test.ts`
 * tanpa menyentuh basis. Yang HANYA bisa dijawab di sini:
 *
 *   • constraint basis benar-benar menolak lewat jalur HTTP, bukan cuma lewat
 *     INSERT langsung — pesan galatnya sampai ke pemanggil dengan status yang
 *     bisa ditindaklanjuti (409, bukan 500)
 *   • koran yang DIKUNCI menolak perubahan di SETIAP jalur, bukan hanya di UI
 *   • impor yang barisnya ditolak tidak meninggalkan koran setengah jadi
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let companyId: string
let akunId: string
let koranId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const del = (url: string) =>
  app.inject({ method: 'DELETE', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(
    `DELETE FROM rekening_koran WHERE nama_berkas LIKE '[TEST]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: c } = await client.query(
    `SELECT id, company_id FROM cash_accounts WHERE company_id IS NOT NULL LIMIT 1`)
  akunId = c[0].id
  companyId = c[0].company_id

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(rekonsiliasiBankRoutes)
  await app.ready()

  // `authIdForRole` bisa mengembalikan null bila peran admin tak ada di basis
  // uji. Gagal keras di sini lebih baik daripada 15 test yang gagal dengan 401
  // dan menunjuk ke tempat yang salah.
  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST /api/v1/rekonsiliasi — impor', () => {
  it('menolak koran tanpa baris — koran kosong tak berguna', async () => {
    const r = await post('/api/v1/rekonsiliasi', {
      cash_account_id: akunId,
      periode_dari: '2027-01-01', periode_sampai: '2027-01-31',
      saldo_awal: 0, saldo_akhir: 0, baris: [],
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tanpa baris/i)
  })

  it('mengimpor koran beserta barisnya', async () => {
    const r = await post('/api/v1/rekonsiliasi', {
      cash_account_id: akunId,
      periode_dari: '2027-02-01', periode_sampai: '2027-02-28',
      saldo_awal: 1_000_000, saldo_akhir: 1_500_000,
      nama_berkas: '[TEST] koran-feb.csv',
      baris: [
        { tanggal: '2027-02-05', keterangan: 'Transfer masuk', kredit: 500_000 },
        { tanggal: '2027-02-10', keterangan: 'Biaya admin', debit: 15_000 },
      ],
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().jumlah_baris).toBe(2)
    koranId = r.json().id
  })

  // Periode ganda ditolak DB (23505). Yang diuji: pesannya sampai sebagai 409
  // yang bisa ditindaklanjuti, bukan 500 "duplicate key value violates...".
  it('menolak periode ganda dengan pesan yang bisa ditindaklanjuti', async () => {
    const r = await post('/api/v1/rekonsiliasi', {
      cash_account_id: akunId,
      periode_dari: '2027-02-01', periode_sampai: '2027-02-28',
      saldo_awal: 0, saldo_akhir: 0, nama_berkas: '[TEST] ulang.csv',
      baris: [{ tanggal: '2027-02-05', keterangan: 'X', kredit: 1 }],
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/sudah pernah diimpor/i)
  })

  // Baris yang ditolak tak boleh meninggalkan koran setengah jadi: entri kosong
  // di daftar terlihat sah dan tak seorang pun tahu harus diapakan.
  it('membatalkan SELURUH impor bila satu baris ditolak', async () => {
    const { rows: sebelum } = await client.query(
      `SELECT count(*)::int n FROM rekening_koran WHERE nama_berkas = '[TEST] cacat.csv'`)

    const r = await post('/api/v1/rekonsiliasi', {
      cash_account_id: akunId,
      periode_dari: '2027-03-01', periode_sampai: '2027-03-31',
      saldo_awal: 0, saldo_akhir: 0, nama_berkas: '[TEST] cacat.csv',
      // debit DAN kredit sekaligus — ditolak constraint XOR.
      baris: [{ tanggal: '2027-03-05', keterangan: 'Cacat', debit: 100, kredit: 100 }],
    })

    expect(r.statusCode).toBe(400)
    const { rows: sesudah } = await client.query(
      `SELECT count(*)::int n FROM rekening_koran WHERE nama_berkas = '[TEST] cacat.csv'`)
    expect(sesudah[0].n).toBe(sebelum[0].n)
  })
})

describe('GET /api/v1/rekonsiliasi/:id', () => {
  it('mengembalikan baris, buku, usul pencocokan, dan laporan 4-baris', async () => {
    const r = await get(`/api/v1/rekonsiliasi/${koranId}`)
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.baris).toHaveLength(2)
    expect(j.laporan).toHaveProperty('saldo_bank')
    expect(j.laporan).toHaveProperty('setoran_dalam_perjalanan')
    expect(j.laporan).toHaveProperty('cek_beredar')
    expect(j.laporan).toHaveProperty('selisih')
    expect(Array.isArray(j.usul)).toBe(true)
  })

  it('404 untuk koran yang tak ada', async () => {
    const r = await get('/api/v1/rekonsiliasi/00000000-0000-0000-0000-0000000000ff')
    expect(r.statusCode).toBe(404)
  })
})

describe('pencocokan', () => {
  let barisId: string

  beforeAll(async () => {
    const { rows } = await client.query(
      `SELECT id FROM rekening_koran_baris WHERE koran_id = $1 ORDER BY urutan LIMIT 1`, [koranId])
    barisId = rows[0].id
  })

  it('menolak sumber_tabel karangan', async () => {
    const r = await post(`/api/v1/rekonsiliasi/${koranId}/cocokkan`, {
      baris_id: barisId, sumber_tabel: 'entah', sumber_id: barisId,
    })
    expect(r.statusCode).toBeGreaterThanOrEqual(400)
  })

  // INVARIAN INTI: mencocokkan dua kali membuat satu penerimaan dihitung ganda.
  it('menolak baris yang sudah dicocokkan, dengan pesan yang menuntun', async () => {
    const { rows: p } = await client.query(`SELECT id FROM payments LIMIT 1`)
    if (!p.length) return

    const r1 = await post(`/api/v1/rekonsiliasi/${koranId}/cocokkan`, {
      baris_id: barisId, sumber_tabel: 'payments', sumber_id: p[0].id,
    })
    expect(r1.statusCode).toBe(201)

    const r2 = await post(`/api/v1/rekonsiliasi/${koranId}/cocokkan`, {
      baris_id: barisId, sumber_tabel: 'cash_transfers',
      sumber_id: '00000000-0000-0000-0000-000000000009',
    })
    expect(r2.statusCode).toBe(409)
    expect(r2.json().error).toMatch(/sudah dicocokkan/i)

    await del(`/api/v1/rekonsiliasi/${koranId}/cocokkan/${r1.json().id}`)
  })
})

describe('penyesuaian', () => {
  it('menolak nominal nol', async () => {
    const r = await post(`/api/v1/rekonsiliasi/${koranId}/penyesuaian`, {
      jenis: 'biaya_admin', keterangan: 'Nol', nominal: 0,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak boleh nol/i)
  })

  // "lainnya" tanpa keterangan jadi keranjang sampah tempat selisih yang tak
  // dipahami dibuang, dan rekonsiliasinya berhenti berarti.
  it('menolak "lainnya" tanpa keterangan memadai', async () => {
    const r = await post(`/api/v1/rekonsiliasi/${koranId}/penyesuaian`, {
      jenis: 'lainnya', keterangan: 'lain', nominal: -5000,
    })
    expect(r.statusCode).toBe(400)
  })

  it('menerima penyesuaian sah', async () => {
    const r = await post(`/api/v1/rekonsiliasi/${koranId}/penyesuaian`, {
      jenis: 'biaya_admin', keterangan: 'Biaya administrasi Februari', nominal: -15_000,
    })
    expect(r.statusCode).toBe(201)
  })
})

describe('kunci', () => {
  it('mengunci koran yang terbuka', async () => {
    const r = await post(`/api/v1/rekonsiliasi/${koranId}/kunci`, {})
    expect(r.statusCode).toBe(200)
    expect(r.json().dikunci).toBe(true)
  })

  // Rekonsiliasi yang sudah dikunci lalu masih bisa diubah bukan rekonsiliasi.
  // Diperiksa di SETIAP jalur yang mengubah, bukan sekali di UI.
  it('menolak pencocokan pada koran terkunci', async () => {
    const { rows } = await client.query(
      `SELECT id FROM rekening_koran_baris WHERE koran_id = $1 LIMIT 1`, [koranId])
    const r = await post(`/api/v1/rekonsiliasi/${koranId}/cocokkan`, {
      baris_id: rows[0].id, sumber_tabel: 'payments',
      sumber_id: '00000000-0000-0000-0000-00000000000a',
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/sudah dikunci/i)
  })

  it('menolak penyesuaian pada koran terkunci', async () => {
    const r = await post(`/api/v1/rekonsiliasi/${koranId}/penyesuaian`, {
      jenis: 'jasa_giro', keterangan: 'Sesudah dikunci', nominal: 100,
    })
    expect(r.statusCode).toBe(409)
  })

  it('menolak kunci ganda — membedakannya dari "tak ditemukan"', async () => {
    const r = await post(`/api/v1/rekonsiliasi/${koranId}/kunci`, {})
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/sudah dikunci/i)
  })
})
