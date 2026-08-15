/**
 * Margin bocor — automation 2.5.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TEMUAN TERBESARNYA BUKAN KEBOCORAN, MELAINKAN KETIADAAN ALAT UKUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur dari 16 proyek: 13 tak punya satu pun baris RAB. Otomasi yang hanya
 * membandingkan biaya dengan RAB akan melaporkan ketiga belasnya sehat
 * selamanya — bukan karena marginnya aman, melainkan karena tak ada angka
 * pembandingnya.
 *
 * Dua test di sini menjaga bentuk yang paling mudah salah:
 *
 *   1. RAB dijumlahkan dari baris RINCIAN saja. `rab_items` berjenjang
 *      (`category` → `subcategory` → `item`) dan induk memuat jumlah anaknya.
 *      Menjumlahkan seluruhnya menghitung ganda, RAB terlihat berlipat, dan
 *      TIAP proyek jadi "rugi" — laporan yang tak bisa dipakai.
 *
 *   2. Proyek tanpa RAB dilaporkan, bukan didiamkan.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-MARGIN'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string
let kontrakAsli: string | null = null

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/margin-bocor${q}`,
    headers: { authorization: 'Bearer t' },
  })

async function bersihkan() {
  await db.query(`DELETE FROM rab_items WHERE name LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM project_expenses WHERE description LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications
      WHERE company_id = $1
        AND type IN ('margin_rab_lampaui_kontrak', 'margin_biaya_lampaui_rab',
                     'proyek_tanpa_rab')`,
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

  /*
    Proyek uji dipilih yang BELUM punya RAB, supaya baris yang disisipkan test
    ini adalah satu-satunya sumber angkanya. Meminjam proyek yang RAB-nya sudah
    berisi membuat hasil test bergantung pada data seed — dan test semacam itu
    berubah merah karena orang lain menyunting seed, bukan karena kodenya rusak.
  */
  const { rows: p } = await db.query(`
    SELECT id, contract_value FROM projects
     WHERE company_id = $1 AND status = 'active'
       AND NOT EXISTS (SELECT 1 FROM rab_items r WHERE r.project_id = projects.id)
     LIMIT 1`, [companyId])
  if (!p[0]) throw new Error('tak ada proyek aktif tanpa RAB untuk diuji')
  proyek = p[0].id
  kontrakAsli = p[0].contract_value

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
}, 60_000)

afterAll(async () => {
  await bersihkan()
  // Nilai kontrak dikembalikan persis seperti semula — test tak boleh
  // meninggalkan jejak pada data yang dilihat orang.
  if (kontrakAsli != null) {
    await db.query(`UPDATE projects SET contract_value = $1 WHERE id = $2`,
      [kontrakAsli, proyek])
  }
  await app.close()
  await db.end()
})

async function buatRab(nama: string, level: string, nominal: number) {
  await db.query(
    `INSERT INTO rab_items (project_id, level, name, unit, qty, unit_price, total_price)
     VALUES ($1,$2::rab_item_level,$3,'ls',1,$4,$4)`,
    [proyek, level, `${TANDA} ${nama}`, nominal])
}

async function ditegur(tipe: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = $1 AND company_id = $2 AND action_data->>'record_id' = $3`,
    [tipe, companyId, proyek])
  return (rows[0].n as number) > 0
}

describe('2.5 — margin bocor', () => {
  it('RAB dijumlahkan dari baris RINCIAN saja, bukan seluruh jenjang', async () => {
    /*
      `rab_items` berjenjang dan induk memuat jumlah anaknya. Di bawah:

          category     Rp 100.000.000   (induk — memuat jumlah anaknya)
          subcategory  Rp 100.000.000   (idem)
          item         Rp  50.000.000
          item         Rp  50.000.000

      RAB yang benar Rp 100 juta. Menjumlahkan seluruh jenjang menghasilkan
      Rp 300 juta — tiga kali lipat.

      Nilai kontrak disetel Rp 150 juta: di atas RAB yang benar, di bawah RAB
      yang terhitung ganda. Jadi kalau penjumlahannya keliru, proyek ini
      dilaporkan "direncanakan rugi" padahal marginnya sehat — dan itu terjadi
      pada TIAP proyek sekaligus.
    */
    await bersihkan()
    await db.query(`UPDATE projects SET contract_value = 150000000 WHERE id = $1`,
      [proyek])

    await buatRab('induk', 'category', 100_000_000)
    await buatRab('sub', 'subcategory', 100_000_000)
    await buatRab('rincian A', 'item', 50_000_000)
    await buatRab('rincian B', 'item', 50_000_000)

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)

    expect(await ditegur('margin_rab_lampaui_kontrak'),
      'proyek ber-RAB Rp 100 jt dan kontrak Rp 150 jt dilaporkan rugi — '
      + 'baris induk ikut dijumlahkan, jadi RAB terhitung berlipat dan TIAP '
      + 'proyek akan terlihat rugi')
      .toBe(false)
  }, 120_000)

  it('RAB yang SUNGGUH melampaui kontrak tetap ditegur', async () => {
    /*
      Pasangan wajib dari test di atas: yang pertama menjaga agar tak ada
      teguran palsu, yang ini menjaga agar teguran yang benar tak ikut hilang.
      Tanpa keduanya, "tak ada teguran" bisa berarti benar atau berarti mati.
    */
    await bersihkan()
    await db.query(`UPDATE projects SET contract_value = 50000000 WHERE id = $1`,
      [proyek])
    await buatRab('rincian mahal', 'item', 200_000_000)

    await panggil()
    expect(await ditegur('margin_rab_lampaui_kontrak'),
      'RAB Rp 200 jt terhadap kontrak Rp 50 jt TIDAK ditegur')
      .toBe(true)
  }, 120_000)

  it('proyek tanpa RAB dilaporkan dan diberitahukan', async () => {
    /*
      Diam pada kasus ini terlihat persis seperti keberhasilan: proyek tanpa
      RAB tak akan pernah "melampaui anggaran", karena tak ada anggarannya.

      Diperiksa DUA hal, dan mutasi membuktikan keduanya tak sama: angkanya
      dihitung, DAN notifikasinya benar-benar terkirim.
    */
    await bersihkan()
    const r = await panggil()
    const c = (r.json() as { checked: { tanpa_rab: number } }).checked

    expect(c.tanpa_rab,
      'nol proyek tanpa RAB padahal terukur ada 13 — angka ini yang menahan '
      + '"2 temuan" dibaca seolah 14 proyek lain sudah diperiksa dan sehat')
      .toBeGreaterThan(0)

    const { rows } = await db.query(
      `SELECT message FROM notifications
        WHERE type = 'proyek_tanpa_rab' AND company_id = $1`, [companyId])
    expect(rows.length,
      'angkanya dihitung tetapi tak seorang pun diberitahu')
      .toBeGreaterThan(0)
    expect(String(rows[0].message), 'pesan tak menyebut jumlah proyeknya')
      .toMatch(new RegExp(String(c.tanpa_rab)))
  }, 120_000)

  it('ambang serapan benar-benar menyaring', async () => {
    /*
      Kondisinya DIBUAT, bukan dipinjam dari data yang ada.

      Versi pertama test ini mengandalkan proyek seed yang kebetulan berada di
      pita serapan tertentu — dan ternyata tak ada satu pun di pita 50–200%,
      jadi menaikkan dan menurunkan ambang menghasilkan angka yang sama.
      Test yang lulus atau gagal karena isi seed tak menguji kodenya.

      Di sini biaya dan RAB-nya disetel sendiri supaya serapannya TEPAT 100%:
      di atas ambang 50, di bawah ambang 200.
    */
    await bersihkan()
    await db.query(`UPDATE projects SET contract_value = 900000000000 WHERE id = $1`,
      [proyek])
    await buatRab('rincian pas', 'item', 100_000_000)

    // `client_fund` dengan kedua kolom kas NULL — tak menggerakkan saldo.
    const { rows: kat } = await db.query(
      `SELECT id FROM project_expense_categories LIMIT 1`)
    const { rows: pgn } = await db.query(`SELECT id FROM users WHERE is_active LIMIT 1`)
    const { rows: sudahAda } = await db.query(
      `SELECT coalesce(sum(total_amount), 0)::numeric t FROM project_expenses
        WHERE project_id = $1 AND status = 'approved'`, [proyek])
    const kurang = 100_000_000 - Number(sudahAda[0].t)
    if (kurang > 0) {
      await db.query(
        `INSERT INTO project_expenses
           (project_id, category_id, expense_source, description, expense_date,
            qty, unit, unit_price, total_amount, vendor_name, status,
            submitted_by, billed_amount, petty_cash_id, main_cash_id)
         VALUES ($1,$2,'client_fund',$3,CURRENT_DATE,1,'ls',$4,$4,'PT Uji Margin',
                 'approved',$5,0,NULL,NULL)`,
        [proyek, kat[0].id, `${TANDA} biaya penyeimbang`, kurang, pgn[0].id])
    }

    const hitung = async (q: string) => {
      const r = await panggil(q)
      return (r.json() as {
        checked: { biaya_mendekati_rab: number; ambang_persen: number }
      }).checked
    }

    /*
      Diperiksa PENYARINGANNYA, bukan angka yang dilaporkan.

      Mutasi membuktikan bedanya: memaku `ambang_persen: 85` di keluaran tak
      mengubah satu pun keputusan, dan test yang hanya membaca angka itu lolos.
      Yang menentukan berapa proyek yang benar-benar tersaring.
    */
    const ketat = await hitung('?persen=200')
    const longgar = await hitung('?persen=50')

    expect(longgar.ambang_persen, 'ambang dari query tak sampai ke hasil').toBe(50)
    expect(ketat.ambang_persen, 'ambang dari query tak sampai ke hasil').toBe(200)
    expect(longgar.biaya_mendekati_rab,
      'menurunkan ambang tak menambah proyek yang tersaring — nilainya '
      + 'dilaporkan tetapi tak dipakai memutuskan apa pun')
      .toBeGreaterThan(ketat.biaya_mendekati_rab)
  }, 120_000)
})
