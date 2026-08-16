/**
 * Stok melenceng dari buku gerakannya — automation 4.8.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * NOMOR INI SEMPAT DICORET, DAN CORETANNYA SALAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Alasan pencoretan: `opname_bersama` mengukur volume pekerjaan, bukan stok
 * gudang. Benar — tetapi berhenti di tabel pertama yang tak cocok tanpa
 * menanyakan di mana opname stok sebenarnya dicatat. Jawabannya
 * `stock_movements.movement_type = 'adjustment'`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIJAGA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. Arah tiap jenis gerakan DIPAKU. `usage` mengurangi, `goods_receipt`
 *      menambah, `adjustment` mengikuti `qty_after - qty_before`.
 *      Menjumlahkan `qty` mentah membuat pemakaian ikut menambah stok, dan
 *      TIAP baris jadi "melenceng" — laporan yang tak bisa dipakai.
 *
 *   2. Stok yang COCOK tak ditegur. Tanpa ini, "semua terdeteksi" bisa
 *      berarti benar atau berarti otomasinya menegur segalanya.
 *
 *   3. Penyesuaian yang selalu turun ditandai terpisah; yang naik-turun
 *      tidak. Kesalahan hitung menyimpang ke dua arah, kebocoran hanya satu.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-STOK'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string
let materialId: string
let olehId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/stok-melenceng${q}`,
    headers: { authorization: 'Bearer t' },
  })

async function bersihkan() {
  await db.query(`DELETE FROM stock_movements WHERE material_id IN
                    (SELECT id FROM materials WHERE name LIKE $1)`, [`${TANDA}%`])
  await db.query(`DELETE FROM project_stocks WHERE material_id IN
                    (SELECT id FROM materials WHERE name LIKE $1)`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications WHERE company_id = $1
      AND type IN ('stok_melenceng', 'stok_susut_berulang')`, [companyId])
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

  const { rows: u } = await db.query(`SELECT id FROM users WHERE auth_id = $1`, [auth])
  olehId = u[0].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
  await db.query(`DELETE FROM materials WHERE name LIKE $1`, [`${TANDA}%`])
  const { rows: mt } = await db.query(
    `INSERT INTO materials (name, unit, is_active) VALUES ($1,'sak',true) RETURNING id`,
    [`${TANDA} semen uji`])
  materialId = mt[0].id
}, 60_000)

afterAll(async () => {
  await bersihkan()
  await db.query(`DELETE FROM materials WHERE name LIKE $1`, [`${TANDA}%`])
  await app.close()
  await db.end()
})

async function setStok(qty: number) {
  await db.query(`DELETE FROM project_stocks WHERE project_id = $1 AND material_id = $2`,
    [proyek, materialId])
  const { rows } = await db.query(
    `INSERT INTO project_stocks (project_id, material_id, qty_on_hand, qty_reserved)
     VALUES ($1,$2,$3,0) RETURNING id`, [proyek, materialId, qty])
  return rows[0].id as string
}

async function gerak(jenis: string, qty: number, sebelum: number, sesudah: number, catatan = '') {
  await db.query(
    `INSERT INTO stock_movements
       (project_id, material_id, movement_type, qty, qty_before, qty_after, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [proyek, materialId, jenis, qty, sebelum, sesudah, catatan, olehId])
}

async function ditegur(tipe: string, id: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = $1 AND company_id = $2 AND action_data->>'record_id' = $3`,
    [tipe, companyId, id])
  return (rows[0].n as number) > 0
}

describe('4.8 — stok melenceng dari buku gerakan', () => {
  it('arah tiap jenis gerakan DIPAKU: pemakaian mengurangi', async () => {
    /*
      Penerimaan 100, pemakaian 40 → buku = 60. Stok tercatat 60, COCOK.

      Kalau `qty` dijumlahkan mentah tanpa memandang jenis, bukunya jadi 140
      dan baris ini dilaporkan melenceng 80 — padahal ia benar. Dan itu
      terjadi pada TIAP baris sekaligus, jadi laporannya tak bisa dipakai.
    */
    await bersihkan()
    const sid = await setStok(60)
    await gerak('goods_receipt', 100, 0, 100)
    await gerak('usage', 40, 100, 60)

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)
    expect(await ditegur('stok_melenceng', sid),
      'stok yang COCOK dilaporkan melenceng — `qty` dijumlahkan mentah, jadi '
      + 'pemakaian ikut menambah stok dan tiap baris jadi tertuduh')
      .toBe(false)
  }, 120_000)

  it('selisih yang SUNGGUH ada tetap ditemukan, dengan angka yang benar', async () => {
    /*
      Pasangan wajib. Tanpa ini, "tak ada temuan" bisa berarti benar atau
      berarti otomasinya mati.

      Buku = 100 − 40 = 60; stok tercatat 5 → selisih 55.
    */
    await bersihkan()
    const sid = await setStok(5)
    await gerak('goods_receipt', 100, 0, 100)
    await gerak('usage', 40, 100, 60)

    await panggil()
    expect(await ditegur('stok_melenceng', sid), 'selisih 55 tak terdeteksi').toBe(true)

    const { rows } = await db.query(
      `SELECT action_data FROM notifications
        WHERE type = 'stok_melenceng' AND company_id = $1
          AND action_data->>'record_id' = $2 LIMIT 1`, [companyId, sid])
    const d = rows[0].action_data as Record<string, unknown>
    expect(Number(d.sistem), 'angka sistem salah').toBe(5)
    expect(Number(d.buku), 'angka buku salah').toBe(60)
    expect(Number(d.selisih), 'selisih salah').toBe(55)
  }, 120_000)

  it('penyesuaian opname mengikuti qty_after − qty_before, bukan qty', async () => {
    /*
      `adjustment` menyimpan arahnya di selisih, bukan di tanda `qty` — dan
      `qty` bisa positif maupun negatif tergantung siapa yang mencatat.

      Di sini `qty` POSITIF 2 tetapi stoknya TURUN (50 → 48). Kalau tandanya
      yang dipercaya, koreksi turun terbaca sebagai penambahan dan bukunya
      meleset 4 satuan.

      Buku yang benar: 50 (terima) − 2 (koreksi) = 48. Stok 48, COCOK.
    */
    await bersihkan()
    const sid = await setStok(48)
    await gerak('goods_receipt', 50, 0, 50)
    await gerak('adjustment', 2, 50, 48, 'Opname — 2 sak mengeras')

    await panggil()
    expect(await ditegur('stok_melenceng', sid),
      'penyesuaian turun terbaca sebagai penambahan — arahnya diambil dari '
      + 'tanda `qty`, bukan dari selisih qty_before/qty_after')
      .toBe(false)
  }, 120_000)

  it('penyesuaian yang SELALU turun ditandai; yang naik-turun tidak', async () => {
    /*
      Satu koreksi turun itu biasa — pecah, tumpah, salah hitung. Yang layak
      ditanyakan POLA: material yang tiap opname selalu berkurang dan tak
      pernah bertambah. Kesalahan hitung menyimpang ke dua arah; kebocoran
      hanya ke satu.
    */
    await bersihkan()
    await setStok(46)
    await gerak('goods_receipt', 50, 0, 50)
    await gerak('adjustment', 2, 50, 48, 'Opname — pecah')
    await gerak('adjustment', 2, 48, 46, 'Opname — pecah lagi')

    await panggil()
    const kunci = `${proyek}|${materialId}`
    expect(await ditegur('stok_susut_berulang', kunci),
      'dua penyesuaian yang sama-sama turun tak ditandai')
      .toBe(true)

    // Sekarang salah satunya NAIK — polanya hilang, tak lagi ditandai.
    await bersihkan()
    await setStok(52)
    await gerak('goods_receipt', 50, 0, 50)
    await gerak('adjustment', 2, 50, 48, 'Opname — pecah')
    await gerak('adjustment', 4, 48, 52, 'Opname — ternyata ada sisa di gudang')

    await panggil()
    expect(await ditegur('stok_susut_berulang', kunci),
      'penyesuaian yang naik-turun ikut ditandai sebagai susut berulang — '
      + 'itu justru tanda pencatatannya wajar, bukan bocor')
      .toBe(false)
  }, 120_000)

  it('ambang selisih benar-benar menyaring', async () => {
    await bersihkan()
    const sid = await setStok(98)
    await gerak('goods_receipt', 100, 0, 100)

    await panggil('?satuan=5')
    expect(await ditegur('stok_melenceng', sid),
      'selisih 2 ditegur pada ambang 5')
      .toBe(false)

    await panggil()
    expect(await ditegur('stok_melenceng', sid),
      'selisih 2 tak ditegur pada ambang bawaan 1 — nilainya tak dipakai')
      .toBe(true)
  }, 120_000)
})
