/**
 * Pengeluaran pencilan — automation 2.13.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA KEPUTUSAN YANG MENENTUKAN APAKAH LAPORANNYA BISA DIPAKAI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. Pembandingnya proyek ITU SENDIRI. Rata-rata seluruh perusahaan tak
 *      memisahkan apa pun — proyek gudang Rp 380 juta dan renovasi dapur
 *      Rp 90 juta memang berbelanja pada skala berbeda.
 *
 *   2. Pasangan kembar dikeluarkan SEBELUM sebaran dihitung, bukan disaring
 *      belakangan. Nota yang tercatat dua kali membuat nominalnya muncul dua
 *      kali dan MENGGESER rata-rata serta simpangan bakunya; membuangnya
 *      belakangan berarti sebarannya sudah tercemar.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-PENCILAN'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string
let kategoriId: string
let olehId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/biaya-pencilan${q}`,
    headers: { authorization: 'Bearer t' },
  })

function tgl(mundur: number): string {
  const d = new Date()
  d.setDate(d.getDate() - mundur)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM project_expenses WHERE description LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications WHERE company_id = $1 AND type = 'biaya_pencilan'`,
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
    Proyek uji harus BELUM punya pengeluaran: sebarannya dibentuk seluruhnya
    oleh baris yang disisipkan test. Meminjam proyek yang sudah berisi membuat
    hasilnya bergantung pada isi seed — dan test semacam itu berubah merah
    karena orang lain menyunting data, bukan karena kodenya rusak.
  */
  const { rows: p } = await db.query(`
    SELECT id FROM projects
     WHERE company_id = $1
       AND NOT EXISTS (SELECT 1 FROM project_expenses e WHERE e.project_id = projects.id)
     LIMIT 1`, [companyId])
  if (!p[0]) throw new Error('tak ada proyek tanpa pengeluaran untuk diuji')
  proyek = p[0].id

  const { rows: k } = await db.query(
    `SELECT id FROM project_expense_categories LIMIT 1`)
  kategoriId = k[0].id

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

/** `client_fund` dengan kolom kas NULL — tak menggerakkan saldo. */
async function buatBiaya(uraian: string, nominal: number, opsi: {
  vendor?: string; mundur?: number
} = {}) {
  const { rows } = await db.query(
    `INSERT INTO project_expenses
       (project_id, category_id, expense_source, description, expense_date,
        qty, unit, unit_price, total_amount, vendor_name, status,
        submitted_by, billed_amount, petty_cash_id, main_cash_id)
     VALUES ($1,$2,'client_fund',$3,$4,1,'ls',$5,$5,$6,'approved',$7,0,NULL,NULL)
     RETURNING id`,
    [proyek, kategoriId, `${TANDA} ${uraian}`, tgl(opsi.mundur ?? 10),
     nominal, opsi.vendor ?? `${TANDA} vendor`, olehId])
  return rows[0].id as string
}

async function ditegur(id: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = 'biaya_pencilan' AND company_id = $1
        AND action_data->>'record_id' = $2`, [companyId, id])
  return (rows[0].n as number) > 0
}

describe('2.13 — pengeluaran pencilan', () => {
  it('pencilan terhadap kebiasaan proyeknya ditemukan', async () => {
    await bersihkan()
    // Sembilan belanja ~1 juta, satu belanja 10 juta.
    for (let i = 0; i < 9; i++) {
      await buatBiaya(`wajar ${i}`, 1_000_000 + i * 20_000, { mundur: 20 + i })
    }
    const besar = await buatBiaya('belanja besar', 10_000_000, { mundur: 5 })

    const r = await panggil()
    expect(r.statusCode, r.body).toBe(200)
    expect(await ditegur(besar), 'belanja 10× kebiasaan tak ditemukan').toBe(true)
  }, 120_000)

  it('belanja WAJAR tidak ditegur', async () => {
    /*
      Pasangan wajib. Tanpa ini, "pencilan ditemukan" bisa berarti benar atau
      berarti otomasinya menandai segalanya.
    */
    await bersihkan()
    const ids: string[] = []
    for (let i = 0; i < 10; i++) {
      ids.push(await buatBiaya(`rata ${i}`, 1_000_000 + i * 30_000, { mundur: 20 + i }))
    }

    await panggil()
    for (const id of ids) {
      expect(await ditegur(id),
        'belanja yang seragam ikut ditandai pencilan — otomasinya menandai segalanya')
        .toBe(false)
    }
  }, 120_000)

  it('pasangan KEMBAR dikeluarkan sebelum sebaran dihitung', async () => {
    /*
      Dua nota Rp 10 juta dari vendor yang sama, berselang sehari — nota ganda.

      Kalau keduanya ikut dihitung, mereka menaikkan rata-rata DAN simpangan
      bakunya sendiri, lalu tampak wajar terhadap sebaran yang mereka bentuk.
      Kalau dibuang belakangan, sebarannya sudah tercemar.

      Keduanya harus tak ditegur di sini — penanganannya milik 2.7.
    */
    await bersihkan()
    for (let i = 0; i < 9; i++) {
      await buatBiaya(`wajar ${i}`, 1_000_000 + i * 20_000, { mundur: 20 + i })
    }
    const a = await buatBiaya('nota ganda A', 10_000_000, { vendor: `${TANDA} UD Kembar`, mundur: 6 })
    const b = await buatBiaya('nota ganda B', 10_000_000, { vendor: `${TANDA} UD Kembar`, mundur: 5 })

    await panggil()
    expect(await ditegur(a),
      'pasangan kembar ikut ditegur sebagai pencilan — satu baris yang sama '
      + 'ditegur dua otomasi dengan dua penjelasan berbeda')
      .toBe(false)
    expect(await ditegur(b)).toBe(false)

    const r = await panggil()
    const c = (r.json() as { checked: { dikeluarkan_karena_kembar: number } }).checked
    expect(c.dikeluarkan_karena_kembar,
      'jumlah yang dikeluarkan karena kembar tak dilaporkan')
      .toBeGreaterThanOrEqual(2)
  }, 120_000)

  it('proyek yang riwayatnya tipis DILAPORKAN, bukan didiamkan', async () => {
    /*
      Dengan tiga pengeluaran, satu belanja besar MEMBUAT simpangan bakunya
      sendiri lalu tampak wajar terhadap sebaran yang ia bentuk. Diam pada
      kasus itu membuat "0 pencilan" terbaca sebagai "semuanya wajar".
    */
    await bersihkan()
    /*
      Nominalnya DIBEDAKAN, dan itu bukan hiasan.

      Versi pertama memakai tiga baris Rp 1.000.000 persis dari vendor yang
      sama dalam rentang tiga hari — dan otomasinya BENAR mengenalinya sebagai
      pasangan kembar lalu membuangnya, menyisakan satu baris. Test-nya lalu
      gagal, dan yang salah fixture-nya, bukan kodenya.

      Pelajaran yang melekat pada test, bukan pada rute: data uji yang tak
      sengaja memicu penyaring LAIN membuat kegagalan menunjuk tempat yang
      keliru.
    */
    for (let i = 0; i < 3; i++) {
      await buatBiaya(`tipis ${i}`, 1_000_000 + i * 137_000, { mundur: 20 + i * 4 })
    }
    const besar = await buatBiaya('besar tanpa pembanding', 50_000_000, { mundur: 4 })

    /*
      Diuji lewat AMBANGNYA, bukan lewat angka `tak_bisa_dinilai` global.

      Mutasi membuktikan kenapa: memaku minimum jadi 2 tetap membuat angka
      global itu di atas nol, karena proyek LAIN di basis juga punya riwayat
      tipis. Test yang membaca angka gabungan tak bisa membedakan proyeknya
      sendiri dinilai atau tidak.

      Yang membedakan: pada minimum bawaan (8) proyek 4-catatan ini TIDAK
      dinilai, dan pada minimum 3 ia dinilai — jadi jumlah yang diperiksa
      harus BERTAMBAH.
    */
    const bawaan = await panggil()
    const cB = (bawaan.json() as { checked: { biaya_diperiksa: number } }).checked
    expect(await ditegur(besar),
      'proyek berisi 4 catatan sudah dinilai pada minimum bawaan 8 — '
      + 'sebarannya dibentuk oleh baris yang sedang dinilai itu sendiri')
      .toBe(false)

    const longgar = await panggil('?minimum=3')
    const cL = (longgar.json() as { checked: { biaya_diperiksa: number } }).checked
    expect(cL.biaya_diperiksa,
      'menurunkan minimum riwayat tak menambah yang diperiksa — nilainya '
      + 'dilaporkan tetapi tak dipakai memutuskan apa pun')
      .toBeGreaterThan(cB.biaya_diperiksa)
  }, 120_000)

  it('yang jauh LEBIH KECIL tidak ditegur', async () => {
    /*
      Belanja yang jauh di bawah kebiasaan bukan kejanggalan keuangan — itu
      belanja kecil, dan menegurnya membuat daftar penuh hal yang tak perlu
      ditindaklanjuti.

      Mutasi membuktikan celah ini nyata: mengganti `z < ambang` dengan
      `Math.abs(z) < ambang` tak membuat satu pun test lama merah, karena tak
      ada satu pun pencilan ke bawah untuk diuji. Test yang hanya punya kasus
      satu arah tak bisa membedakan saringan satu arah dari dua arah.
    */
    await bersihkan()
    for (let i = 0; i < 9; i++) {
      await buatBiaya(`besar ${i}`, 10_000_000 + i * 100_000, { mundur: 20 + i })
    }
    const kecil = await buatBiaya('belanja receh', 50_000, { mundur: 3 })

    await panggil()
    expect(await ditegur(kecil),
      'belanja yang jauh LEBIH KECIL ikut ditegur — saringannya dua arah, '
      + 'padahal belanja kecil bukan kejanggalan keuangan')
      .toBe(false)
  }, 120_000)

  it('ambang simpangan benar-benar menyaring', async () => {
    await bersihkan()
    for (let i = 0; i < 9; i++) {
      await buatBiaya(`wajar ${i}`, 1_000_000 + i * 100_000, { mundur: 20 + i })
    }
    const sedang = await buatBiaya('agak besar', 2_400_000, { mundur: 3 })

    await panggil('?sigma=5')
    expect(await ditegur(sedang), 'ditegur pada ambang 5 simpangan').toBe(false)

    await panggil('?sigma=1')
    expect(await ditegur(sedang),
      'ambang 1 tak berpengaruh — nilainya tak dipakai menyaring')
      .toBe(true)
  }, 120_000)
})
