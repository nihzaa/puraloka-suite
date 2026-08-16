/**
 * Material sama dari beberapa pemasok — automation 4.11.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIJAGA DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. Harga per pemasok RATA-RATA TERTIMBANG volumenya, bukan harga satu
 *      baris. Pemasok yang sekali memberi harga promosi lalu seterusnya normal
 *      tak boleh terlihat sebagai "yang termurah" hanya karena satu baris.
 *
 *   2. Pesanan `cancelled` dibuang. Pesanan yang dibatalkan tak pernah jadi
 *      harga yang dibayar, dan memasukkannya membuat selisih terhitung dari
 *      angka yang tak pernah terjadi.
 *
 *   3. Satu pemasok saja bukan "terpencar" — tak ada yang bisa dikonsolidasi.
 *
 *   4. Angkanya BATAS ATAS dan pesannya menyatakan itu sendiri. Otomasi yang
 *      menyodorkannya sebagai "potensi hemat" membuat orang mengejar angka
 *      yang tak pernah ada, lalu berhenti percaya.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-PMSK'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string
let pemasokA: string
let pemasokB: string
let materialId: string
let olehId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/pemasok-terpencar${q}`,
    headers: { authorization: 'Bearer t' },
  })

/*
  Material uji SENGAJA tidak ikut dibersihkan di sini.

  Ia dibuat sekali di `beforeAll` dan dirujuk seluruh pesanan uji; menghapusnya
  antar-test membuat FK `purchase_order_items.material_id` gagal pada test
  berikutnya. Yang dibersihkan tiap test hanya pesanan dan notifikasinya.
*/
async function bersihkan() {
  await db.query(`DELETE FROM purchase_order_items WHERE po_id IN
                    (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`, [`${TANDA}%`])
  await db.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications WHERE type = 'pemasok_terpencar' AND company_id = $1`,
    [companyId])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  const { rows: c } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = c[0].id

  const { rows: p } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 LIMIT 1`, [companyId])
  proyek = p[0].id

  const { rows: s } = await db.query(
    `SELECT id FROM suppliers WHERE company_id = $1 LIMIT 2`, [companyId])
  if (s.length < 2) throw new Error('butuh dua pemasok untuk menguji')
  pemasokA = s[0].id
  pemasokB = s[1].id

  const { rows: u } = await db.query(`SELECT id FROM users WHERE auth_id = $1`, [auth])
  olehId = u[0].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
  await db.query(`DELETE FROM materials WHERE name LIKE $1`, [`${TANDA}%`])

  const { rows: mt } = await db.query(
    `INSERT INTO materials (name, unit, is_active) VALUES ($1,'btg',true) RETURNING id`,
    [`${TANDA} besi uji`])
  materialId = mt[0].id
}, 60_000)

afterAll(async () => {
  await bersihkan()
  await db.query(`DELETE FROM materials WHERE name LIKE $1`, [`${TANDA}%`])
  await app.close()
  await db.end()
})

/** Satu pesanan pembelian berisi satu baris material. */
async function buatPo(nomor: string, opsi: {
  pemasok: string; harga: number; qty: number; status?: string
}) {
  const { rows: po } = await db.query(
    `INSERT INTO purchase_orders
       (project_id, supplier_id, po_number, order_date, status, created_by)
     VALUES ($1,$2,$3,CURRENT_DATE,$4,$5) RETURNING id`,
    [proyek, opsi.pemasok, nomor, opsi.status ?? 'confirmed', olehId])

  // `total_price` kolom TURUNAN (`qty_ordered × unit_price`) — basisnya
  // menolak nilai yang disisipkan langsung. Invarian yang benar: total yang
  // bisa diisi sendiri memungkinkan 10 batang × Rp 100.000 dicatat berjumlah
  // Rp 50.000, dan tak ada yang bisa menemukannya.
  await db.query(
    `INSERT INTO purchase_order_items
       (po_id, material_id, qty_ordered, unit, unit_price)
     VALUES ($1,$2,$3,'btg',$4)`,
    [po[0].id, materialId, opsi.qty, opsi.harga])
  return po[0].id as string
}

async function temuan() {
  const { rows } = await db.query(
    `SELECT action_data, message FROM notifications
      WHERE type = 'pemasok_terpencar' AND company_id = $1
        AND action_data->>'record_id' = $2 LIMIT 1`, [companyId, materialId])
  return rows[0] as { action_data: Record<string, unknown>; message: string } | undefined
}

describe('4.11 — material sama dari beberapa pemasok', () => {
  it('harga per pemasok RATA-RATA TERTIMBANG, bukan harga satu baris', async () => {
    /*
      Pemasok A: satu baris Rp 50.000 × 1 batang (promosi), lalu Rp 100.000 ×
      99 batang. Rata-rata tertimbangnya Rp 99.500.

      Pemasok B: Rp 100.000 × 100 batang → rata-rata Rp 100.000.

      Selisih tertimbang cuma 0,5% — di bawah ambang, jadi TIDAK ditegur.
      Kalau yang dibandingkan harga satu baris, selisihnya terbaca 100% dan
      pemasok A dilaporkan "jauh lebih murah" padahal praktis sama.
    */
    await bersihkan()
    await buatPo(`${TANDA}-A1`, { pemasok: pemasokA, harga: 50_000, qty: 1 })
    await buatPo(`${TANDA}-A2`, { pemasok: pemasokA, harga: 100_000, qty: 99 })
    await buatPo(`${TANDA}-B1`, { pemasok: pemasokB, harga: 100_000, qty: 100 })

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)
    expect(await temuan(),
      'satu baris harga promosi membuat pemasok terlihat jauh lebih murah — '
      + 'yang dibandingkan harga satu baris, bukan rata-rata tertimbang')
      .toBeUndefined()
  }, 120_000)

  it('selisih yang SUNGGUH ada tetap ditemukan, dengan angka yang benar', async () => {
    /*
      Pasangan wajib dari test di atas. Tanpa ini, "tak ada temuan" bisa
      berarti benar atau berarti mati.

      A: Rp 100.000 × 100 · B: Rp 120.000 × 60 → selisih 20%, qty total 160,
      batas atas (120.000 − 100.000) × 160 = Rp 3.200.000.
    */
    await bersihkan()
    await buatPo(`${TANDA}-C1`, { pemasok: pemasokA, harga: 100_000, qty: 100 })
    await buatPo(`${TANDA}-C2`, { pemasok: pemasokB, harga: 120_000, qty: 60 })

    await panggil()
    const t = await temuan()
    expect(t, 'selisih 20% antar pemasok tak ditemukan').toBeDefined()

    const d = t!.action_data
    expect(Number(d.beda_persen), 'persen selisih salah').toBe(20)
    expect(Number(d.qty_total), 'volume total salah').toBe(160)
    expect(Number(d.selisih_batas_atas), 'selisih batas atas salah')
      .toBe(3_200_000)
    expect(Number(d.harga_terendah)).toBe(100_000)
    expect(Number(d.harga_tertinggi)).toBe(120_000)
  }, 120_000)

  it('pesannya menyatakan sendiri bahwa angkanya BATAS ATAS', async () => {
    /*
      Ini bukan soal gaya bahasa. Otomasi yang menyodorkan Rp 3,2 juta sebagai
      "potensi hemat" membuat orang mengejar angka yang tak pernah ada — harga
      berbeda karena tempo bayar, ongkos kirim, dan siapa yang sanggup
      mengantar hari itu juga. Saat penghematannya tak tercapai, yang hilang
      bukan cuma angka itu melainkan kepercayaan pada seluruh peringatan.
    */
    await bersihkan()
    await buatPo(`${TANDA}-D1`, { pemasok: pemasokA, harga: 100_000, qty: 50 })
    await buatPo(`${TANDA}-D2`, { pemasok: pemasokB, harga: 130_000, qty: 50 })

    await panggil()
    const t = await temuan()
    expect(t, 'selisih 30% tak ditemukan').toBeDefined()
    expect(t!.message, 'pesan tak menyatakan bahwa angkanya batas atas')
      .toMatch(/BATAS ATAS/)
    expect(t!.message, 'pesan tak menyebut alasan sah harga bisa berbeda')
      .toMatch(/tempo pembayaran|ongkos kirim/)
    expect(t!.message, 'pesan menjanjikan penghematan yang tak bisa ditepati')
      .not.toMatch(/potensi hemat|pasti hemat/i)
  }, 120_000)

  it('pesanan yang DIBATALKAN tidak ikut dihitung', async () => {
    /*
      Pesanan yang dibatalkan tak pernah jadi harga yang dibayar. Memasukkannya
      membuat selisih terhitung dari angka yang tak pernah terjadi — dan
      pengadaan diminta menjelaskan harga yang memang sudah mereka batalkan.
    */
    await bersihkan()
    await buatPo(`${TANDA}-E1`, { pemasok: pemasokA, harga: 100_000, qty: 50 })
    await buatPo(`${TANDA}-E2`, {
      pemasok: pemasokB, harga: 300_000, qty: 50, status: 'cancelled',
    })

    await panggil()
    expect(await temuan(),
      'pesanan yang dibatalkan ikut dihitung — pengadaan diminta menjelaskan '
      + 'harga yang memang sudah mereka batalkan')
      .toBeUndefined()
  }, 120_000)

  /*
    Kasus satu-pemasok dijaga TIGA lapis, dan itu membuatnya tak bisa dimutasi.

    Mutasi mencoba melucuti `pemasokBeda.size < 2` DAN `rata.length < 2`
    sekaligus — keduanya merah? Tidak: test tetap hijau. Sebabnya lapisan
    ketiga bukan penjaga melainkan ARITMETIKA. Dengan satu pemasok, `murah`
    dan `mahal` menunjuk entri yang sama, jadi `bedaPersen` = 0 dan ambang
    apa pun menahannya.

    Dinyatakan di sini, bukan dipaksa jadi mutasi yang merah: penjaga yang
    tak bisa dibuat merah karena PERILAKUNYA memang mustahil berbeda adalah
    hal yang berbeda dari penjaga yang tak diuji. Test di bawah tetap ada
    untuk menjaga perilakunya kalau kelak rumusnya berubah.
  */
  it('satu pemasok saja bukan temuan', async () => {
    await bersihkan()
    await buatPo(`${TANDA}-F1`, { pemasok: pemasokA, harga: 100_000, qty: 50 })
    await buatPo(`${TANDA}-F2`, { pemasok: pemasokA, harga: 300_000, qty: 50 })

    await panggil()
    expect(await temuan(),
      'dua harga dari pemasok yang SAMA ditegur — tak ada yang bisa '
      + 'dikonsolidasi di situ')
      .toBeUndefined()
  }, 120_000)

  it('ambang persen benar-benar menyaring', async () => {
    await bersihkan()
    await buatPo(`${TANDA}-G1`, { pemasok: pemasokA, harga: 100_000, qty: 50 })
    await buatPo(`${TANDA}-G2`, { pemasok: pemasokB, harga: 103_000, qty: 50 })

    await panggil()
    expect(await temuan(), 'selisih 3% ditegur pada ambang bawaan 5')
      .toBeUndefined()

    await panggil('?persen=2')
    expect(await temuan(),
      'ambang 2 tak berpengaruh — nilainya tak dipakai menyaring')
      .toBeDefined()
  }, 120_000)
})
