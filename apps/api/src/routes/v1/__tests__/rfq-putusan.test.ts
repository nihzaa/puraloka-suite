import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import rfqRoutes from '../rfq.js'

/**
 * PUTUSAN RFQ — endpoint terhadap Postgres NYATA.
 *
 * ── Apa yang HANYA bisa dijawab di sini
 *
 * Aturan siapa-boleh-menang sudah dikunci 17 test di
 * `lib/__tests__/putusan-rfq.test.ts` tanpa menyentuh basis. Yang tersisa dan
 * hanya terlihat lewat basis:
 *
 *   • PO benar-benar terbit, bernomor (trigger `generate_po_number`), dan
 *     ITEMNYA tertulis — bukan PO bertotal tanpa rincian
 *   • RFQ berpindah ke `selesai` DAN `po_id`-nya menunjuk PO yang tadi terbit
 *   • putusan kedua DITOLAK, bukan menerbitkan PO kedua untuk RFQ yang sama
 *   • jumlah PO tidak bertambah saat putusan ditolak — tak ada PO yatim
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let supplierMurah: string
let supplierMahal: string
let materialA: string
let materialB: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function purge() {
  // PO lebih dulu: `rfq.po_id` memakai ON DELETE SET NULL, jadi urutan ini
  // tak menyisakan RFQ yang menunjuk PO yang sudah tak ada.
  await client.query(`DELETE FROM purchase_orders WHERE notes LIKE '[TEST]%' OR notes LIKE 'Dari RFQ [TEST]%'`)
  await client.query(`DELETE FROM rfq WHERE nomor LIKE '[TEST]%'`)
}

/** Buat RFQ + penawaran dua vendor. Mengembalikan id RFQ. */
async function siapkanRfq(nomor: string, opsi?: { mahalTidakMenawar?: boolean }) {
  const r = await post('/api/v1/rfq', { project_id: projectId, nomor })
  if (r.statusCode !== 201) throw new Error(`gagal buat RFQ: ${r.body}`)
  const id = r.json().rfq.id as string

  // materialA: murah 100rb vs mahal 120rb  → mahal butuh alasan
  // materialB: murah 50rb  vs mahal 45rb   → murah juga butuh alasan
  await post(`/api/v1/rfq/${id}/penawaran`, {
    supplier_id: supplierMurah, material_id: materialA, qty: 10, harga_satuan: 100_000,
  })
  await post(`/api/v1/rfq/${id}/penawaran`, {
    supplier_id: supplierMurah, material_id: materialB, qty: 20, harga_satuan: 50_000,
  })

  if (opsi?.mahalTidakMenawar) {
    await post(`/api/v1/rfq/${id}/penawaran`, {
      supplier_id: supplierMahal, material_id: materialA, qty: 10, tidak_menawar: true,
    })
    await post(`/api/v1/rfq/${id}/penawaran`, {
      supplier_id: supplierMahal, material_id: materialB, qty: 20, tidak_menawar: true,
    })
  } else {
    await post(`/api/v1/rfq/${id}/penawaran`, {
      supplier_id: supplierMahal, material_id: materialA, qty: 10, harga_satuan: 120_000,
    })
    await post(`/api/v1/rfq/${id}/penawaran`, {
      supplier_id: supplierMahal, material_id: materialB, qty: 20, harga_satuan: 45_000,
    })
  }
  return id
}

const jumlahPo = async () => {
  const { rows } = await client.query(`SELECT count(*)::int n FROM purchase_orders`)
  return rows[0].n as number
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  projectId = p[0].id

  const { rows: s } = await client.query(`SELECT id FROM suppliers ORDER BY created_at LIMIT 2`)
  supplierMurah = s[0].id
  supplierMahal = s[1].id

  const { rows: m } = await client.query(`SELECT id FROM materials ORDER BY created_at LIMIT 2`)
  materialA = m[0].id
  materialB = m[1].id

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(rfqRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST /api/v1/rfq/:id/putuskan — penolakan', () => {
  it('menolak tanpa supplier_id', async () => {
    const id = await siapkanRfq('[TEST] RFQ-TOLAK-1')
    const r = await post(`/api/v1/rfq/${id}/putuskan`, {})
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/supplier_id wajib/i)
  })

  it('404 untuk RFQ yang tak ada', async () => {
    const r = await post('/api/v1/rfq/00000000-0000-0000-0000-0000000000ff/putuskan',
      { supplier_id: supplierMurah })
    expect(r.statusCode).toBe(404)
  })

  // Aturan pokok migrasi 195, lewat jalur HTTP.
  it('menolak vendor yang lebih mahal tanpa alasan — TANPA menerbitkan PO', async () => {
    const id = await siapkanRfq('[TEST] RFQ-TOLAK-2')
    const sebelum = await jumlahPo()

    const r = await post(`/api/v1/rfq/${id}/putuskan`, { supplier_id: supplierMahal })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/wajib/i)

    // Yang paling penting: penolakan tak boleh meninggalkan PO yatim.
    expect(await jumlahPo()).toBe(sebelum)

    const { rows } = await client.query(`SELECT status, po_id FROM rfq WHERE id = $1`, [id])
    expect(rows[0].status).not.toBe('selesai')
    expect(rows[0].po_id).toBeNull()
  })

  it('menolak alasan basa-basi yang terlalu pendek', async () => {
    const id = await siapkanRfq('[TEST] RFQ-TOLAK-3')
    const r = await post(`/api/v1/rfq/${id}/putuskan`, {
      supplier_id: supplierMahal, alasan: 'ok',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/terlalu pendek/i)
  })

  it('menolak vendor yang tak menawar satu pun material', async () => {
    const id = await siapkanRfq('[TEST] RFQ-TOLAK-4', { mahalTidakMenawar: true })
    const sebelum = await jumlahPo()

    const r = await post(`/api/v1/rfq/${id}/putuskan`, {
      supplier_id: supplierMahal,
      alasan: 'Alasan yang cukup panjang untuk lolos ambang',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tidak menawar satu pun/i)
    expect(await jumlahPo()).toBe(sebelum)
  })
})

describe('POST /api/v1/rfq/:id/putuskan — jalur berhasil', () => {
  let idRfq: string
  let idPo: string

  it('menerbitkan PO bernomor dengan item dari penawaran pemenang', async () => {
    idRfq = await siapkanRfq('[TEST] RFQ-OK-1')

    // `supplierMurah` termurah di materialA (100rb vs 120rb) tapi LEBIH MAHAL
    // di materialB (50rb vs 45rb) — jadi alasan tetap wajib. Ini bentuk yang
    // paling sering terjadi di lapangan dan paling mudah salah dikira "kan
    // dia yang termurah".
    const r = await post(`/api/v1/rfq/${idRfq}/putuskan`, {
      supplier_id: supplierMurah,
      alasan: 'Satu vendor untuk satu kirim; ongkos angkut terpisah lebih mahal',
    })

    expect(r.statusCode).toBe(201)
    const j = r.json()
    idPo = j.purchase_order.id

    // Nomor dari trigger DB, bukan dikarang endpoint.
    expect(j.purchase_order.po_number).toBeTruthy()
    expect(j.purchase_order.po_number).not.toBe('')
    expect(j.putusan.jumlah_item).toBe(2)
    expect(j.putusan.seluruhnya_termurah).toBe(false)
    expect(j.purchase_order.total).toBe(100_000 * 10 + 50_000 * 20)
  })

  it('item PO benar-benar tertulis, dengan harga dari penawaran', async () => {
    const { rows } = await client.query(
      `SELECT material_id, qty_ordered::float8 q, unit_price::float8 h, total_price::float8 t
         FROM purchase_order_items WHERE po_id = $1 ORDER BY unit_price DESC`, [idPo])

    expect(rows).toHaveLength(2)
    expect(rows[0].h).toBe(100_000)
    expect(rows[0].q).toBe(10)
    // `total_price` kolom GENERATED — dibuktikan sama dengan qty × harga.
    expect(rows[0].t).toBe(1_000_000)
    expect(rows[1].h).toBe(50_000)
  })

  it('RFQ berpindah ke selesai dan menunjuk PO yang tadi terbit', async () => {
    const { rows } = await client.query(
      `SELECT status, po_id, alasan_pilih FROM rfq WHERE id = $1`, [idRfq])
    expect(rows[0].status).toBe('selesai')
    expect(rows[0].po_id).toBe(idPo)
    expect(rows[0].alasan_pilih).toMatch(/ongkos angkut/i)
  })

  // Putusan ganda menerbitkan PO KEDUA: vendor menerima dua pesanan, dan
  // `po_id` hanya menyimpan yang terakhir.
  it('menolak putusan kedua untuk RFQ yang sama', async () => {
    const sebelum = await jumlahPo()
    const r = await post(`/api/v1/rfq/${idRfq}/putuskan`, {
      supplier_id: supplierMahal,
      alasan: 'Berubah pikiran setelah PO terbit — harus ditolak',
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/sudah diputuskan/i)
    expect(await jumlahPo()).toBe(sebelum)
  })

  it('RFQ yang sudah selesai menolak penawaran susulan', async () => {
    const r = await post(`/api/v1/rfq/${idRfq}/penawaran`, {
      supplier_id: supplierMahal, material_id: materialA, qty: 5, harga_satuan: 1,
    })
    expect(r.statusCode).toBe(400)
  })

  it('GET RFQ menampilkan po_id dan alasan setelah diputuskan', async () => {
    const r = await get(`/api/v1/rfq/${idRfq}`)
    expect(r.statusCode).toBe(200)
    expect(r.json().rfq.po_id).toBe(idPo)
    expect(r.json().rfq.status).toBe('selesai')
  })
})

describe('POST /api/v1/rfq/:id/putuskan — vendor termurah di semuanya', () => {
  it('TIDAK menuntut alasan, dan menandai seluruhnya_termurah', async () => {
    const r0 = await post('/api/v1/rfq', {
      project_id: projectId, nomor: '[TEST] RFQ-OK-2',
    })
    const id = r0.json().rfq.id as string

    // Hanya satu vendor menawar → ia termurah di semuanya.
    await post(`/api/v1/rfq/${id}/penawaran`, {
      supplier_id: supplierMurah, material_id: materialA, qty: 3, harga_satuan: 75_000,
    })

    const r = await post(`/api/v1/rfq/${id}/putuskan`, { supplier_id: supplierMurah })
    expect(r.statusCode).toBe(201)
    expect(r.json().putusan.seluruhnya_termurah).toBe(true)
    expect(r.json().putusan.selisih_total).toBe(0)

    const { rows } = await client.query(`SELECT alasan_pilih FROM rfq WHERE id = $1`, [id])
    expect(rows[0].alasan_pilih).toBeNull()
  })
})

describe('POST /api/v1/rfq/:id/putuskan — RFQ batal', () => {
  it('menolak RFQ yang sudah dibatalkan', async () => {
    const id = await siapkanRfq('[TEST] RFQ-BATAL')
    await client.query(`UPDATE rfq SET status = 'batal' WHERE id = $1`, [id])

    const r = await post(`/api/v1/rfq/${id}/putuskan`, { supplier_id: supplierMurah })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/dibatalkan/i)
  })
})
