/**
 * Pengeluaran kembar (2.7) · pengeluaran berulang (2.14).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA OTOMASI YANG MEMBACA POLA SAMA DAN MENYIMPULKAN HAL BERLAWANAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Keduanya mencari "vendor sama, nominal sama, berulang". Yang membedakannya
 * HANYA jarak hari:
 *
 *     2.7   berselang ≤3 hari    → satu nota tercatat dua kali
 *     2.14  berselang ~30 hari   → biaya tetap bulanan
 *
 * Itu membuat mereka saling menjadi kasus uji terbaik satu sama lain: tiap
 * kesalahan pada salah satunya langsung terlihat sebagai temuan palsu di yang
 * lain. Test paling penting di berkas ini justru yang NEGATIF — biaya bulanan
 * tak boleh tertuduh sebagai nota ganda, dan nota ganda tak boleh terhitung
 * sebagai langganan.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-POLA'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string
let kategoriId: string
let olehId: string

const panggil = (rute: string, q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/${rute}${q}`,
    headers: { authorization: 'Bearer t' },
  })

function tanggal(mundur: number): string {
  const d = new Date()
  d.setDate(d.getDate() - mundur)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM project_expenses WHERE description LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications
      WHERE company_id = $1 AND type IN ('biaya_kembar', 'biaya_berulang')`,
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

  /*
    ⚠ Kategori WAJIB milik proyek yang sama — bukan `LIMIT 1` sembarang.

    `project_expenses` mengambil company-nya dari PROYEK, dan proyek di atas
    sudah disaring `company_id`. Kategorinya tidak: `LIMIT 1` global memilih
    kategori milik proyek di company LAIN, sehingga biaya tersimpan di tempat
    yang tak pernah dipindai otomasi (rute menyaring lewat `projectIds()`
    milik company sesi).

        langganan 3 bulan tak terdeteksi: expected 0 to be greater than 0

    Galatnya terbaca seperti deteksi pola yang rusak. Yang salah kategorinya.

    ⚠ Pemakuan `code = 'puraloka-persada'` di atas SENGAJA DIBIARKAN. Saya
    sempat menggantinya dengan company sesi, dan itu MEMBUAT LEBIH BURUK:
    company sesi admin dev punya NOL proyek, jadi test jatuh lebih awal.
    Di CI, `puraloka-persada` justru company induk — tempat seed membuat
    proyeknya. Pemakuan itu benar; hanya kategorinya yang salah.
  */
  const { rows: k } = await db.query(
    `SELECT id FROM project_expense_categories WHERE project_id = $1 LIMIT 1`,
    [proyek],
  )
  if (!k.length) throw new Error('proyek uji tak punya kategori pengeluaran')
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

/**
 * Satu baris biaya.
 *
 * `expense_source` DIPAKU `client_fund` dan kedua kolom kas dibiarkan NULL —
 * `fn_update_petty_cash_on_expense` dan `fn_update_main_cash_on_expense`
 * mengurangi `cash_accounts.balance` saat baris `approved` masuk dengan kolom
 * kasnya terisi. Test tak boleh memindahkan saldo kas yang dilihat orang.
 */
async function buatBiaya(uraian: string, opsi: {
  vendor: string; nominal: number; mundur: number; status?: string
}) {
  const { rows } = await db.query(
    `INSERT INTO project_expenses
       (project_id, category_id, expense_source, description, expense_date,
        qty, unit, unit_price, total_amount, vendor_name, status,
        submitted_by, billed_amount, petty_cash_id, main_cash_id)
     VALUES ($1,$2,'client_fund',$3,$4,1,'ls',$5,$5,$6,$7::expense_status,
             $8,0,NULL,NULL) RETURNING id`,
    [proyek, kategoriId, `${TANDA} ${uraian}`, tanggal(opsi.mundur),
     opsi.nominal, opsi.vendor, opsi.status ?? 'approved', olehId])
  return rows[0].id as string
}

async function adaKembar(idA: string, idB: string) {
  const kunci = [idA, idB].sort().join('_')
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = 'biaya_kembar' AND company_id = $1
        AND action_data->>'record_id' = $2`, [companyId, kunci])
  return (rows[0].n as number) > 0
}

async function adaBerulang(vendor: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = 'biaya_berulang' AND company_id = $1
        AND action_data->>'vendor' = $2`, [companyId, vendor])
  return (rows[0].n as number) > 0
}

describe('2.7 — pengeluaran kembar', () => {
  it('cocok lewat vendor + nominal + jarak, BUKAN uraiannya', async () => {
    /*
      Pencatatan ganda hampir tak pernah menghasilkan dua kalimat yang sama
      persis: orang kedua mengetik ulang dengan kata-katanya sendiri.

      Uraian di bawah sengaja dibuat berbeda huruf besar-kecil DAN spasinya —
      mencocokkan teks akan melewatkan keduanya.
    */
    await bersihkan()
    const a = await buatBiaya('Besi beton D13 20 batang',
      { vendor: 'UD Uji Besi', nominal: 2_150_000, mundur: 10 })
    const b = await buatBiaya('BESI BETON D13 20BATANG',
      { vendor: 'UD Uji Besi', nominal: 2_150_000, mundur: 9 })

    const r = await panggil('biaya-kembar')
    expect(r.statusCode, r.body).toBe(200)
    expect(await adaKembar(a, b),
      'dua nota bervendor & bernominal sama berselang sehari tak terdeteksi — '
      + 'kemungkinan yang dicocokkan uraiannya, dan uraian selalu berbeda')
      .toBe(true)
  }, 120_000)

  it('biaya BULANAN tidak tertuduh sebagai nota ganda', async () => {
    /*
      ══════════════════════════════════════════════════════════════════════
      TEST PALING PENTING DI BERKAS INI, DAN IA NEGATIF
      ══════════════════════════════════════════════════════════════════════

      Sewa bulanan dari vendor yang sama dengan nominal yang sama adalah
      "vendor + nominal identik berulang" — persis bentuk yang dicari 2.7.
      Yang membedakannya HANYA jarak hari.

      Kalau jendelanya melebar, seluruh sewa dan langganan dilaporkan sebagai
      pencatatan ganda. Orang yang memeriksa beberapa di antaranya lalu
      menemukan semuanya wajar akan berhenti memeriksa — dan nota ganda yang
      sungguhan ikut terlewat.
    */
    await bersihkan()
    const ids: string[] = []
    for (let m = 0; m < 4; m++) {
      ids.push(await buatBiaya('Sewa direksi keet',
        { vendor: 'CV Uji Sewa', nominal: 3_500_000, mundur: m * 30 + 2 }))
    }

    await panggil('biaya-kembar')
    for (let i = 0; i < ids.length; i++) {
      for (let k = i + 1; k < ids.length; k++) {
        expect(await adaKembar(ids[i], ids[k]),
          'biaya bulanan tertuduh sebagai nota ganda — jendelanya terlalu lebar, '
          + 'dan seluruh sewa serta langganan akan ikut tertuduh')
          .toBe(false)
      }
    }
  }, 120_000)

  it('tanpa nama vendor tidak dibandingkan', async () => {
    /*
      Dua belanja Rp 500.000 di hari yang sama tanpa nama vendor itu biasa —
      kesamaan nominal saja bukan bukti apa-apa, dan menegurnya membuat
      daftarnya penuh tebakan.
    */
    await bersihkan()
    const a = await buatBiaya('Belanja tanpa vendor A',
      { vendor: '', nominal: 500_000, mundur: 5 })
    const b = await buatBiaya('Belanja tanpa vendor B',
      { vendor: '', nominal: 500_000, mundur: 5 })

    await panggil('biaya-kembar')
    expect(await adaKembar(a, b),
      'dua biaya TANPA nama vendor ditegur kembar — kesamaan nominal saja '
      + 'bukan bukti apa pun')
      .toBe(false)
  }, 120_000)

  it('ambang jarak benar-benar menyaring', async () => {
    await bersihkan()
    const a = await buatBiaya('Nota jauh A',
      { vendor: 'PT Uji Jarak', nominal: 1_234_000, mundur: 20 })
    const b = await buatBiaya('Nota jauh B',
      { vendor: 'PT Uji Jarak', nominal: 1_234_000, mundur: 13 })

    await panggil('biaya-kembar')
    expect(await adaKembar(a, b),
      'jarak 7 hari ditegur pada ambang bawaan 3')
      .toBe(false)

    await panggil('biaya-kembar', '?hari=10')
    expect(await adaKembar(a, b),
      'ambang 10 tak berpengaruh — nilainya tak dipakai menyaring')
      .toBe(true)
  }, 120_000)
})

describe('2.14 — pengeluaran berulang', () => {
  it('dihitung dari BULAN BERBEDA, bukan jumlah baris', async () => {
    /*
      Enam nota di bulan yang sama bukan biaya berulang, itu enam belanja.
      Yang menandakan langganan adalah kehadirannya di bulan demi bulan.

      Menghitung baris membuat satu pembelian besar yang dipecah jadi enam
      nota terbaca sebagai langganan enam bulan — dan perkiraan setahunnya
      lalu meleset dua belas kali lipat.
    */
    await bersihkan()
    for (let i = 0; i < 6; i++) {
      await buatBiaya('Enam nota satu bulan',
        { vendor: 'UD Uji Sebulan', nominal: 900_000, mundur: i + 1 })
    }

    const r = await panggil('biaya-berulang')
    expect(r.statusCode, r.body).toBe(200)
    expect(await adaBerulang('UD Uji Sebulan'),
      'enam nota dalam SATU bulan dilaporkan sebagai biaya berulang — '
      + 'yang dihitung jumlah baris, bukan bulan berbeda')
      .toBe(false)
  }, 120_000)

  it('perkiraan setahun dari nominal BULANAN, bukan dari total yang sudah keluar', async () => {
    /*
      Dua angka menjawab dua pertanyaan berbeda:

        total    "sudah habis berapa"
        setahun  "kalau diteruskan, habis berapa"

      Yang kedua yang membuat orang memutuskan, dan ia HARUS dihitung dari
      nominal bulanannya. Menghitungnya dari total membuat langganan yang baru
      berjalan tiga bulan terlihat jauh lebih murah daripada yang sebenarnya.
    */
    await bersihkan()
    const NOMINAL = 1_750_000
    for (let m = 0; m < 3; m++) {
      await buatBiaya('Langganan uji',
        { vendor: 'PT Uji Langganan', nominal: NOMINAL, mundur: m * 30 + 4 })
    }

    await panggil('biaya-berulang')

    const { rows } = await db.query(
      `SELECT action_data, message FROM notifications
        WHERE type = 'biaya_berulang' AND company_id = $1
          AND action_data->>'vendor' = 'PT Uji Langganan' LIMIT 1`, [companyId])
    expect(rows.length, 'langganan 3 bulan tak terdeteksi').toBeGreaterThan(0)

    const d = rows[0].action_data as Record<string, unknown>
    expect(Number(d.total), 'total bukan jumlah tiga bulan').toBe(NOMINAL * 3)
    expect(Number(d.perkiraan_setahun),
      'perkiraan setahun dihitung dari total yang sudah keluar, bukan dari '
      + 'nominal bulanannya — langganan yang baru berjalan terlihat jauh '
      + 'lebih murah daripada sebenarnya')
      .toBe(NOMINAL * 12)
    expect(Number(d.bulan), 'jumlah bulan salah').toBe(3)
  }, 120_000)

  it('ambang bulan benar-benar menyaring', async () => {
    await bersihkan()
    for (let m = 0; m < 2; m++) {
      await buatBiaya('Dua bulan saja',
        { vendor: 'CV Uji Dua', nominal: 640_000, mundur: m * 30 + 6 })
    }

    await panggil('biaya-berulang')
    expect(await adaBerulang('CV Uji Dua'),
      'pola 2 bulan dilaporkan pada ambang bawaan 3')
      .toBe(false)

    await panggil('biaya-berulang', '?bulan=2')
    expect(await adaBerulang('CV Uji Dua'),
      'ambang 2 tak berpengaruh — nilainya tak dipakai menyaring')
      .toBe(true)
  }, 120_000)

  it('nota GANDA tidak terhitung sebagai langganan', async () => {
    /*
      Sisi sebaliknya dari test bulanan di 2.7: dua nota berselang sehari
      berada di bulan yang SAMA, jadi ia tak boleh memenuhi syarat "bulan
      berbeda" walau vendor dan nominalnya identik.

      Kalau ia lolos, tiap pencatatan ganda akan ikut dilaporkan sebagai
      langganan — dan perkiraan setahunnya jadi angka yang mengada-ada.
    */
    await bersihkan()
    await buatBiaya('Nota ganda A',
      { vendor: 'UD Uji Ganda', nominal: 4_400_000, mundur: 8 })
    await buatBiaya('Nota ganda B',
      { vendor: 'UD Uji Ganda', nominal: 4_400_000, mundur: 7 })

    await panggil('biaya-berulang')
    expect(await adaBerulang('UD Uji Ganda'),
      'dua nota berselang sehari dilaporkan sebagai langganan — perkiraan '
      + 'setahunnya jadi angka yang mengada-ada')
      .toBe(false)
  }, 120_000)
})

describe('kas tidak bergerak', () => {
  it('menyisipkan biaya uji tidak mengubah saldo kas', async () => {
    /*
      `fn_update_petty_cash_on_expense` dan `fn_update_main_cash_on_expense`
      mengurangi `cash_accounts.balance` saat baris `approved` masuk dengan
      kolom kasnya terisi.

      Test dan penyemai sama-sama memakai `client_fund` dengan kedua kolom kas
      NULL. Penjaga ini memeriksa PERILAKUNYA, bukan niatnya — kalau kelak
      seseorang "melengkapi" kolom itu supaya saldo ikut ter-update, saldo
      perusahaan akan bergeser tiap kali test dijalankan.
    */
    const saldo = async () => {
      const { rows } = await db.query(
        `SELECT coalesce(sum(balance), 0)::numeric t FROM cash_accounts
          WHERE company_id = $1`, [companyId])
      return String(rows[0].t)
    }

    await bersihkan()
    const sebelum = await saldo()
    await buatBiaya('Uji saldo tak bergerak',
      { vendor: 'PT Uji Saldo', nominal: 12_500_000, mundur: 1 })
    expect(await saldo(),
      'saldo kas bergeser saat biaya uji disisipkan — data uji memindahkan '
      + 'uang yang dilihat orang di layar')
      .toBe(sebelum)
  }, 120_000)
})
