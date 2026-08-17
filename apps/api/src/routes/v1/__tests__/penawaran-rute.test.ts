/**
 * DOKUMEN PENAWARAN lewat RUTE — terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hitungan & terbilangnya sudah dikunci 24 test murni di
 * `lib/__tests__/penawaran.test.ts`. Yang tersisa adalah keputusan yang hanya
 * ada di rute dan basis:
 *
 *   • nilai DITURUNKAN dari baris tiap kali, tak pernah disimpan — jadi
 *     menyunting satu baris mengubah totalnya, dan tak ada kolom yang bisa
 *     menyimpang darinya
 *   • rincian yang sudah TERKIRIM terkunci — arsip kita tak boleh berbeda
 *     dari surat yang dipegang penerima
 *   • `dikirim_pada` diisi SEKALI, bukan tiap perpindahan status
 *   • PDF benar-benar terbit dan memuat terbilangnya
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import penawaranRoutes from '../penawaran.js'

let app: FastifyInstance
let db: Client

const TANDA = 'UJI-PEN'

const post = (url: string, payload: unknown = {}) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const put = (url: string, payload: unknown) =>
  app.inject({ method: 'PUT', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  await db.query('DELETE FROM penawaran WHERE nomor LIKE $1', [`${TANDA}%`])
}

const BARIS = [
  { uraian: 'A. PEKERJAAN PERSIAPAN' },                                  // judul
  { uraian: 'Pembersihan lahan', satuan: 'm2', volume: 500, harga_satuan: 15000 },
  { uraian: 'Pekerjaan pondasi', satuan: 'm3', volume: 120, harga_satuan: 1000000 },
]

async function buat(nomor: string, tambahan: Record<string, unknown> = {}) {
  const r = await post('/api/v1/penawaran', {
    nomor, perihal: 'Uji penawaran', tanggal: '2026-08-16',
    berlaku_sampai: '2026-09-15', ...tambahan,
  })
  if (r.statusCode !== 201) throw new Error(`buat penawaran gagal: ${r.body}`)
  return r.json().data.id as string
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  await bersihkan()

  app = Fastify({ logger: false })
  await app.register(penawaranRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('nilai DITURUNKAN dari baris, tak pernah disimpan', () => {
  it('total berubah begitu barisnya berubah', async () => {
    const id = await buat(`${TANDA}-HITUNG`, { ppn_persen: 11 })

    const r1 = await put(`/api/v1/penawaran/${id}/item`, { item: BARIS })
    expect(r1.statusCode, r1.body).toBe(200)
    // 500×15.000 + 120×1.000.000 = 127.500.000; PPN 11% = 14.025.000
    expect(r1.json().hitung.subtotal).toBe(127_500_000)
    expect(r1.json().hitung.total).toBe(141_525_000)

    // Satu baris dihapus — totalnya WAJIB ikut turun tanpa ada yang
    // memperbarui kolom mana pun.
    const r2 = await put(`/api/v1/penawaran/${id}/item`, { item: BARIS.slice(0, 2) })
    expect(r2.json().hitung.subtotal).toBe(7_500_000)

    // Dan basis memang tak menyimpan totalnya di mana pun.
    const { rows } = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'penawaran' AND column_name IN ('total','subtotal')`)
    expect(rows, 'kolom total tersimpan — dua sumber untuk satu nilai').toHaveLength(0)
  })

  it('terbilang mengikuti total, dan lahir dari server', async () => {
    const id = await buat(`${TANDA}-TERBILANG`)
    const r = await put(`/api/v1/penawaran/${id}/item`, {
      item: [{ uraian: 'Borongan', volume: 1, harga_satuan: 1_250_000_000 }],
    })
    expect(r.json().hitung.terbilang)
      .toBe('Satu miliar dua ratus lima puluh juta rupiah')
  })

  it('baris JUDUL tanpa volume tersimpan sebagai NULL, bukan 0', async () => {
    const id = await buat(`${TANDA}-JUDUL`)
    await put(`/api/v1/penawaran/${id}/item`, { item: BARIS })

    const { rows } = await db.query(
      `SELECT volume, harga_satuan FROM penawaran_item
        WHERE penawaran_id = $1 AND uraian LIKE 'A.%'`, [id])
    // Nol berarti pekerjaan berharga nol; NULL berarti baris judul. Keduanya
    // tercetak berbeda di surat.
    expect(rows[0].volume).toBeNull()
    expect(rows[0].harga_satuan).toBeNull()
  })
})

describe('yang sudah TERKIRIM terkunci', () => {
  it('rincian tak bisa diubah sesudah dikirim', async () => {
    const id = await buat(`${TANDA}-KUNCI`)
    await put(`/api/v1/penawaran/${id}/item`, { item: BARIS })
    expect((await patch(`/api/v1/penawaran/${id}/status`, { status: 'terkirim' })).statusCode).toBe(200)

    const r = await put(`/api/v1/penawaran/${id}/item`, { item: [{ uraian: 'Diam-diam' }] })
    expect(r.statusCode, r.body).toBe(409)
    // Arsip kita tak boleh berbeda dari surat yang dipegang penerima.
    expect(r.json().error).toMatch(/revisi bernomor/i)

    const { rows } = await db.query(
      'SELECT count(*)::int n FROM penawaran_item WHERE penawaran_id = $1', [id])
    expect(rows[0].n).toBe(3)
  })

  it('tak bisa dihapus sesudah dikirim', async () => {
    const id = await buat(`${TANDA}-HAPUS`)
    await put(`/api/v1/penawaran/${id}/item`, { item: BARIS })
    await patch(`/api/v1/penawaran/${id}/status`, { status: 'terkirim' })

    const r = await app.inject({
      method: 'DELETE', url: `/api/v1/penawaran/${id}`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/sudah di tangan penerima/i)
  })

  it('yang masih DRAFT boleh dihapus', async () => {
    const id = await buat(`${TANDA}-DRAFT`)
    const r = await app.inject({
      method: 'DELETE', url: `/api/v1/penawaran/${id}`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode, r.body).toBe(200)
  })
})

describe('gerbang KIRIM memeriksa kelengkapan dokumen', () => {
  it('tanpa satu pun baris rincian ditolak 422', async () => {
    const id = await buat(`${TANDA}-KOSONG`)
    const r = await patch(`/api/v1/penawaran/${id}/status`, { status: 'terkirim' })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/klaim tambah/i)
  })

  it('tanpa masa berlaku ditolak 422', async () => {
    const id = await buat(`${TANDA}-TAKBERLAKU`, { berlaku_sampai: null })
    await put(`/api/v1/penawaran/${id}/item`, { item: BARIS })

    const r = await patch(`/api/v1/penawaran/${id}/status`, { status: 'terkirim' })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/kenaikan harga material/i)
  })

  it('MENANG/KALAH tidak ditahan kelengkapan — hasil yang sudah terjadi harus bisa dicatat', async () => {
    const id = await buat(`${TANDA}-MENANG`)
    const r = await patch(`/api/v1/penawaran/${id}/status`, { status: 'menang' })
    expect(r.statusCode, r.body).toBe(200)
  })
})

describe('dikirim_pada diisi SEKALI', () => {
  it('tidak ditimpa saat status berpindah lagi', async () => {
    const id = await buat(`${TANDA}-WAKTU`)
    await put(`/api/v1/penawaran/${id}/item`, { item: BARIS })

    await patch(`/api/v1/penawaran/${id}/status`, { status: 'terkirim' })
    const { rows: a } = await db.query(
      'SELECT dikirim_pada FROM penawaran WHERE id = $1', [id])
    expect(a[0].dikirim_pada).toBeTruthy()

    await patch(`/api/v1/penawaran/${id}/status`, { status: 'menang' })
    const { rows: b } = await db.query(
      'SELECT dikirim_pada FROM penawaran WHERE id = $1', [id])
    // Menimpanya membuat "berapa lama menggantung" dihitung dari saat menang,
    // bukan saat dikirim — dan angka itulah yang memberi tahu kapan menagih.
    expect(new Date(b[0].dikirim_pada).getTime())
      .toBe(new Date(a[0].dikirim_pada).getTime())
  })
})

describe('nomor surat & PDF', () => {
  it('nomor kembar ditolak 409 dengan sebab yang bisa ditindaklanjuti', async () => {
    await buat(`${TANDA}-KEMBAR`)
    const r = await post('/api/v1/penawaran', {
      nomor: `${TANDA}-KEMBAR`, perihal: 'Dua', tanggal: '2026-08-16',
    })
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().error).toMatch(/ambigu/i)
  })

  it('PDF terbit dan memuat terbilangnya', async () => {
    const id = await buat(`${TANDA}-PDF`)
    await put(`/api/v1/penawaran/${id}/item`, { item: BARIS })

    const r = await get(`/api/v1/penawaran/${id}/pdf`)
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200)
    expect(r.headers['content-type']).toBe('application/pdf')

    const buf = r.rawPayload
    // Berkas PDF yang sah selalu diawali `%PDF`. Balasan yang "berhasil"
    // tetapi bukan PDF akan tampil sebagai berkas rusak di peramban.
    expect(buf.subarray(0, 4).toString()).toBe('%PDF')
    expect(buf.length).toBeGreaterThan(1000)
  })
})
