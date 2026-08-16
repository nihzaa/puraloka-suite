/**
 * Pesanan di luar kontrak payung — automation 4.13.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU KEPUTUSAN YANG MEMBEDAKAN TEGURAN BENAR DARI TUDUHAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kontrak yang masa berlakunya sudah lewat pada TANGGAL PESANAN tak bisa
 * dituntut dipakai. Membandingkannya dengan hari ini akan menuduh pesanan
 * lama yang saat itu memang tak punya kontrak — dan tuduhan semacam itu tak
 * bisa ditindaklanjuti siapa pun, karena waktunya sudah lewat.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-PLK'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string
let pemasok: string
let olehId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/po-luar-kontrak${q}`,
    headers: { authorization: 'Bearer t' },
  })

function tgl(mundur: number): string {
  const d = new Date()
  d.setDate(d.getDate() - mundur)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM purchase_order_items WHERE po_id IN
                    (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`, [`${TANDA}%`])
  await db.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM kontrak_payung_item WHERE uraian LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM kontrak_payung WHERE nomor LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications WHERE company_id = $1
      AND type IN ('po_luar_kontrak', 'kuota_payung_menipis')`, [companyId])
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

  /*
    Pemasok yang BELUM punya kontrak payung — kontraknya dibuat sendiri oleh
    test. Meminjam pemasok berkontrak membuat hasilnya bergantung pada isi
    seed, bukan pada kode.
  */
  const { rows: s } = await db.query(`
    SELECT id FROM suppliers
     WHERE company_id = $1
       AND NOT EXISTS (SELECT 1 FROM kontrak_payung k WHERE k.supplier_id = suppliers.id)
     LIMIT 1`, [companyId])
  if (!s[0]) throw new Error('tak ada pemasok tanpa kontrak payung')
  pemasok = s[0].id

  const { rows: u } = await db.query(`SELECT id FROM users WHERE auth_id = $1`, [auth])
  olehId = u[0].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
}, 60_000)

afterAll(async () => {
  await bersihkan()
  await app.close()
  await db.end()
})

async function buatKontrak(nomor: string, sampaiMundur: number) {
  const { rows } = await db.query(
    `INSERT INTO kontrak_payung
       (company_id, supplier_id, nomor, judul, berlaku_dari, berlaku_sampai, status)
     VALUES ($1,$2,$3,'Uji kontrak',$4,$5,'aktif') RETURNING id`,
    [companyId, pemasok, nomor, tgl(400), tgl(sampaiMundur)])
  return rows[0].id as string
}

async function buatItem(kontrakId: string, uraian: string, kuota: number, terpakai: number) {
  const { rows } = await db.query(
    `INSERT INTO kontrak_payung_item
       (company_id, kontrak_id, uraian, satuan, harga_satuan, kuota, terpakai)
     VALUES ($1,$2,$3,'ton',1000000,$4,$5) RETURNING id`,
    [companyId, kontrakId, `${TANDA} ${uraian}`, kuota, terpakai])
  return rows[0].id as string
}

async function buatPo(nomor: string, mundur: number, kontrakId: string | null) {
  const { rows } = await db.query(
    `INSERT INTO purchase_orders
       (project_id, supplier_id, po_number, order_date, status, created_by, kontrak_payung_id)
     VALUES ($1,$2,$3,$4,'confirmed',$5,$6) RETURNING id`,
    [proyek, pemasok, nomor, tgl(mundur), olehId, kontrakId])
  return rows[0].id as string
}

async function ditegur(tipe: string, id: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = $1 AND company_id = $2 AND action_data->>'record_id' = $3`,
    [tipe, companyId, id])
  return (rows[0].n as number) > 0
}

describe('4.13 — pesanan di luar kontrak payung', () => {
  it('PO ke pemasok berkontrak tanpa menyebut kontraknya ditegur', async () => {
    await bersihkan()
    await buatKontrak(`${TANDA}-K1`, -100)   // masih berlaku 100 hari lagi
    const po = await buatPo(`${TANDA}-PO1`, 5, null)

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)
    expect(await ditegur('po_luar_kontrak', po),
      'PO ke pemasok berkontrak aktif tanpa menunjuk kontrak tak ditegur')
      .toBe(true)
  }, 120_000)

  it('PO yang SUDAH menyebut kontraknya tidak ditegur', async () => {
    await bersihkan()
    const k = await buatKontrak(`${TANDA}-K2`, -100)
    const po = await buatPo(`${TANDA}-PO2`, 5, k)

    await panggil()
    expect(await ditegur('po_luar_kontrak', po),
      'PO yang sudah menunjuk kontraknya ikut ditegur')
      .toBe(false)
  }, 120_000)

  it('kontrak yang SUDAH habis pada tanggal pesanan tak dituntut', async () => {
    /*
      Kontrak berakhir 60 hari lalu; pesanan dibuat 30 hari lalu — saat itu
      kontraknya memang sudah tak berlaku.

      Membandingkan dengan hari ini akan menuduh pesanan yang saat itu benar,
      dan tuduhan semacam itu tak bisa ditindaklanjuti siapa pun karena
      waktunya sudah lewat.
    */
    await bersihkan()
    await buatKontrak(`${TANDA}-K3`, 60)     // berakhir 60 hari LALU
    const po = await buatPo(`${TANDA}-PO3`, 30, null)  // dipesan 30 hari lalu

    await panggil()
    expect(await ditegur('po_luar_kontrak', po),
      'pesanan yang dibuat SESUDAH kontraknya habis ikut dituduh — '
      + 'perbandingannya memakai hari ini, bukan tanggal pesanan')
      .toBe(false)
  }, 120_000)

  it('PO yang dibatalkan tidak ditegur', async () => {
    await bersihkan()
    await buatKontrak(`${TANDA}-K4`, -100)
    const { rows } = await db.query(
      `INSERT INTO purchase_orders
         (project_id, supplier_id, po_number, order_date, status, created_by)
       VALUES ($1,$2,$3,$4,'cancelled',$5) RETURNING id`,
      [proyek, pemasok, `${TANDA}-PO4`, tgl(5), olehId])

    await panggil()
    expect(await ditegur('po_luar_kontrak', rows[0].id),
      'pesanan yang dibatalkan ikut ditegur — ia tak pernah jadi pembelian')
      .toBe(false)
  }, 120_000)

  it('kuota HABIS ditegur paling mendesak; yang longgar tidak', async () => {
    await bersihkan()
    const k = await buatKontrak(`${TANDA}-K5`, -100)
    const habis = await buatItem(k, 'besi habis', 100, 100)
    const longgar = await buatItem(k, 'besi longgar', 100, 10)

    await panggil()
    expect(await ditegur('kuota_payung_menipis', habis),
      'kuota 100% tak ditegur')
      .toBe(true)
    expect(await ditegur('kuota_payung_menipis', longgar),
      'kuota 10% ikut ditegur — ambangnya tak dipakai menyaring')
      .toBe(false)

    const { rows } = await db.query(
      `SELECT priority FROM notifications
        WHERE type = 'kuota_payung_menipis' AND company_id = $1
          AND action_data->>'record_id' = $2`, [companyId, habis])
    expect(rows[0]?.priority,
      'kuota yang benar-benar HABIS tak berprioritas tertinggi')
      .toBe('urgent')
  }, 120_000)

  it('schema menjamin kuota selalu positif — dan rute mengandalkannya', async () => {
    /*
      Rute ini SENGAJA tak punya cabang "item tanpa kuota". Alasannya bukan
      kelalaian melainkan tiga constraint:

          kuota  NOT NULL
          CHECK (kuota > 0)           payung_item_kuota_positif
          CHECK (terpakai <= kuota)   payung_item_tak_lebih_kuota

      Test ini menjaga ANDALANNYA. Kalau kelak salah satu dilonggarkan, ia
      merah di sini — bukan diam-diam membuat rute membagi dengan nol di
      produksi.

      Versi pertama rute memasang penghitung `item_tanpa_kuota` sebagai
      pengaman, dan itu kode mati yang melaporkan nol selamanya. Medan
      `checked` yang selalu nol terlihat seperti pemeriksaan yang lulus,
      padahal tak pernah memeriksa apa pun.
    */
    await bersihkan()
    const k = await buatKontrak(`${TANDA}-K6`, -100)

    await expect(buatItem(k, 'kuota nol', 0, 0),
      'basis MENERIMA kuota nol — rute mengandalkan constraint yang ternyata '
      + 'sudah tak berlaku, dan pembagiannya akan menghasilkan tak-terhingga')
      .rejects.toThrow()

    await expect(buatItem(k, 'terpakai melebihi', 10, 20),
      'basis MENERIMA terpakai melebihi kuota — persentasenya bisa di atas 100 '
      + 'dan pesan "HABIS" berhenti berarti')
      .rejects.toThrow()
  }, 120_000)

  it('ambang kuota benar-benar menyaring', async () => {
    await bersihkan()
    const k = await buatKontrak(`${TANDA}-K7`, -100)
    const sedang = await buatItem(k, 'setengah', 100, 60)

    await panggil()
    expect(await ditegur('kuota_payung_menipis', sedang),
      'kuota 60% ditegur pada ambang bawaan 80')
      .toBe(false)

    await panggil('?kuota=50')
    expect(await ditegur('kuota_payung_menipis', sedang),
      'ambang 50 tak berpengaruh — nilainya tak dipakai menyaring')
      .toBe(true)
  }, 120_000)
})
