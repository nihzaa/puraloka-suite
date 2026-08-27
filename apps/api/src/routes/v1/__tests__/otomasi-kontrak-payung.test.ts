/**
 * Kontrak payung segera habis — otomasi TANPA nomor katalog.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TANPA NOMOR, DAN KENAPA ITU LAYAK DIUJI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kandidat terdekat di katalog 7.10 *Contract Renewal Reminder*, bunyinya
 * "peluang repeat business dari klien existing" — itu kontrak KLIEN. Yang ini
 * kontrak PEMASOK (`kontrak_payung.supplier_id`).
 *
 * Menempelkan 7.10 padanya akan membuat katalog mengklaim sesuatu yang tak
 * dikerjakan. Test ini ikut menjaga pemisahan itu: kalau kelak seseorang
 * menambahkan `nomor: '7.10'`, ia harus melakukannya sadar, bukan karena
 * "kelihatannya cocok".
 *
 * ── Yang diuji
 *
 *   1. Hanya status `aktif` yang ditegur. Empat status lain (`draft`,
 *      `habis`, `kedaluwarsa`, `dibatalkan`) punya alasan masing-masing untuk
 *      dilewati, dan menyamakannya membuat kontrak yang sudah dibatalkan ikut
 *      menagih perhatian.
 *
 *   2. Ambang dari query BENAR-BENAR menyaring, bukan sekadar dilaporkan —
 *      cacat yang sudah terjadi sekali di 5.7.
 *
 *   3. Dedup harian menahan.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import { entriKatalog } from '../../../lib/katalog-otomasi.js'

const TANDA = 'UJI-BO-PAYUNG'

let app: FastifyInstance
let db: Client
let companyId: string
let supplierId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/kontrak-payung-habis${q}`,
    headers: { authorization: 'Bearer t' },
  })

function tanggal(selisih: number): string {
  const d = new Date()
  d.setDate(d.getDate() + selisih)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM kontrak_payung WHERE nomor LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications WHERE type = 'kontrak_payung_habis' AND company_id = $1`,
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

  const { rows: s } = await db.query(
    `SELECT id FROM suppliers WHERE company_id = $1 LIMIT 1`, [companyId])
  if (!s[0]) throw new Error('tak ada pemasok untuk diuji')
  supplierId = s[0].id

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

describe('kontrak payung segera habis', () => {
  it('hanya status AKTIF yang ditegur', async () => {
    /*
      Empat status lain punya alasan masing-masing untuk dilewati:

        draft        belum berlaku
        habis        sudah selesai dengan sendirinya
        kedaluwarsa  sudah ditandai lewat
        dibatalkan   sudah dihentikan sepihak

      Menegur salah satunya adalah menagih perhatian untuk kontrak yang tak
      lagi bisa dipakai memesan apa pun.

      Keempat nilai DIUKUR dari CHECK constraint, bukan diingat.
    */
    await bersihkan()

    await db.query(
      `INSERT INTO kontrak_payung
         (company_id, supplier_id, nomor, judul, berlaku_dari, berlaku_sampai, status)
       VALUES ($1,$2,$3,'Uji aktif',      $7, $8, 'aktif'),
              ($1,$2,$4,'Uji draft',      $7, $8, 'draft'),
              ($1,$2,$5,'Uji dibatalkan', $7, $8, 'dibatalkan'),
              ($1,$2,$6,'Uji kedaluwarsa',$7, $8, 'kedaluwarsa')`,
      [companyId, supplierId,
       `${TANDA}-AKTIF`, `${TANDA}-DRAFT`, `${TANDA}-BATAL`, `${TANDA}-KEDALUWARSA`,
       tanggal(-100), tanggal(10)],
    )

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT k.nomor
         FROM notifications n
         JOIN kontrak_payung k ON k.id = (n.action_data->>'record_id')::uuid
        WHERE n.type = 'kontrak_payung_habis' AND n.company_id = $1
          AND k.nomor LIKE $2`,
      [companyId, `${TANDA}%`])
    const ditegur = new Set(rows.map((x) => x.nomor as string))

    expect(ditegur.has(`${TANDA}-AKTIF`), 'kontrak aktif TIDAK ditegur').toBe(true)
    for (const n of ['DRAFT', 'BATAL', 'KEDALUWARSA']) {
      expect(ditegur.has(`${TANDA}-${n}`),
        `kontrak ${n} ikut ditegur — saringan status tak bekerja`).toBe(false)
    }
  }, 120_000)

  it('ambang dari query BENAR-BENAR menyaring', async () => {
    /*
      Kalau ambangnya hanya dilaporkan tetapi tak dipakai, hasilnya tetap masuk
      akal dan pengaturan tenant tak berpengaruh sama sekali — tanpa gejala.

      Kontrak yang habis 100 hari lagi berada DI LUAR bawaan 45 tetapi DI DALAM
      ambang 150.
    */
    await bersihkan()

    await db.query(
      `INSERT INTO kontrak_payung
         (company_id, supplier_id, nomor, judul, berlaku_dari, berlaku_sampai, status)
       VALUES ($1,$2,$3,'Uji 100 hari',$4,$5,'aktif')`,
      [companyId, supplierId, `${TANDA}-100HARI`, tanggal(-10), tanggal(100)],
    )

    const hitungUji = async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int n
           FROM notifications n
           JOIN kontrak_payung k ON k.id = (n.action_data->>'record_id')::uuid
          WHERE n.type = 'kontrak_payung_habis' AND n.company_id = $1
            AND k.nomor = $2`,
        [companyId, `${TANDA}-100HARI`])
      return rows[0].n as number
    }

    await panggil()
    expect(await hitungUji(), 'kontrak 100 hari ditegur pada ambang bawaan 45').toBe(0)

    await panggil('?hari=150')
    expect(await hitungUji(),
      'ambang 150 tak berpengaruh — nilainya tak dipakai menyaring').toBeGreaterThan(0)
  }, 120_000)

  it('dedup harian menahan', async () => {
    await bersihkan()
    await db.query(
      `INSERT INTO kontrak_payung
         (company_id, supplier_id, nomor, judul, berlaku_dari, berlaku_sampai, status)
       VALUES ($1,$2,$3,'Uji dedup',$4,$5,'aktif')`,
      [companyId, supplierId, `${TANDA}-DEDUP`, tanggal(-10), tanggal(5)],
    )

    await panggil()
    const hitung = async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int n FROM notifications
          WHERE type = 'kontrak_payung_habis' AND company_id = $1`, [companyId])
      return rows[0].n as number
    }

    const a = await hitung()
    expect(a, 'nol notifikasi padahal ada kontrak habis 5 hari lagi').toBeGreaterThan(0)

    await panggil()
    expect(await hitung(), 'panggilan kedua menambah — dedup tak menahan').toBe(a)
  }, 120_000)

  it('TIDAK mengklaim nomor katalog 7.10', () => {
    /*
      Penjaga sengaja: 7.10 adalah kontrak KLIEN (repeat business), bukan
      kontrak pemasok.

      Kalau kelak seseorang menambahkan nomornya, test ini merah dan ia harus
      memutuskannya sadar — bukan karena "kelihatannya cocok". Katalog yang
      mengklaim lebih dari yang dikerjakan adalah bentuk kebohongan yang paling
      sulit ditemukan, karena ia terlihat seperti kemajuan.
    */
    const entri = entriKatalog('kontrak-payung-habis')
    expect(entri, 'entri katalog hilang').toBeDefined()
    expect(entri!.nomor,
      'entri ini mengklaim nomor katalog — 7.10 soal kontrak KLIEN, bukan pemasok')
      .toBeUndefined()
  })
})
