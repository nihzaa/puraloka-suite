#!/usr/bin/env node
// ============================================================
// SEEDER SEWA ALAT → asset_rentals
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TABEL INI PERLU DIISI
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-16: `asset_rentals` NOL baris, sementara `assets` berisi 18
// alat milik sendiri (harga beli lengkap, Rp 2,4 M untuk Mobile Crane),
// `biaya_operasional_alat` 24 baris, `penyusutan_alat` 12 baris.
//
// Ketimpangan itu membuat satu pertanyaan pemilik tak bisa dijawab sama
// sekali — dan itu justru pertanyaan paling mahal:
//
//     "Alat ini lebih untung DIBELI atau DISEWA?"
//
// Tanpa satu pun baris sewa, sistem hanya tahu biaya memiliki. Ia bisa bilang
// "Excavator menyusut Rp X per bulan", tapi tak bisa membandingkannya dengan
// apa pun. Perbandingan yang tak punya pembanding bukan analisis, melainkan
// angka tunggal yang menyamar jadi kesimpulan.
//
// ══════════════════════════════════════════════════════════════════════════
// TARIF DARI MANA — DAN KENAPA BUKAN DIKARANG BEBAS
// ══════════════════════════════════════════════════════════════════════════
//
// Tarif sewa di sini DITURUNKAN dari harga beli aset yang sudah ada di basis,
// memakai kaidah lapangan alat berat di Indonesia: sewa BULANAN berkisar
// 2–3% harga unit.
//
// ⚠ Tarif harian BUKAN sewa bulanan dibagi 22. Versi pertama skrip ini
// memakai pembagian itu dan menghasilkan Excavator 20 ton Rp 2,94 juta/hari —
// jauh di atas pasar (nyatanya ±Rp 1,8–2,5 juta/hari). Dua kesalahan
// sekaligus: persennya terlalu tinggi (3,5%), dan pembagian rata mengabaikan
// bahwa sewa harian dihitung per-hari-pakai sementara sewa bulanan mencakup
// hari alat menganggur di lokasi.
//
// Maka harian diturunkan terpisah: ±0,12% harga unit per hari, yang untuk
// Excavator Rp 1,85 M menghasilkan ±Rp 2,2 juta/hari — di dalam rentang pasar.
//
// Alasannya bukan kerapian. Kalau tarif dikarang lepas dari harga belinya,
// jawaban "lebih untung sewa" atau "lebih untung beli" ditentukan oleh angka
// yang saya ketik, bukan oleh keadaan. Tool 8.5 lalu akan memberi SARAN
// INVESTASI berdasarkan karangan itu — dan sarannya terlihat masuk akal.
//
// Dengan cara ini, verdict-nya tetap datang dari data: alat yang jarang
// dipakai akan keluar sebagai "lebih baik sewa", yang sering dipakai sebagai
// "lebih baik beli", dan itu mengikuti `pemakaian_alat` yang sudah ada —
// bukan mengikuti selera saya.
//
// ══════════════════════════════════════════════════════════════════════════
// DUA BENTUK BARIS, DAN KENAPA KEDUANYA ADA
// ══════════════════════════════════════════════════════════════════════════
//
//   asset_id TERISI  → alat yang kita MILIKI, tapi periode tertentu unitnya
//                      kurang sehingga menyewa unit tambahan sejenis.
//                      Inilah yang membuat perbandingan sewa-vs-beli punya
//                      dua sisi pada alat YANG SAMA.
//
//   asset_id NULL    → alat yang TIDAK kita miliki sama sekali (mis. Tower
//                      Crane). `item_name` yang menyebut namanya. Ini kasus
//                      "haruskah kita beli?" yang sesungguhnya.
//
// Kalau hanya bentuk pertama yang disemai, tool 8.5 tak pernah melihat kasus
// "belum punya sama sekali" — padahal itu pertanyaan investasi yang nyata.
//
// IDEMPOTEN: baris bertanda [SEED-SEWA] di `notes` dihapus lebih dulu tiap
// jalan, jadi menjalankan ulang tidak menggandakan.
//
// PEMAKAIAN (dari apps/api):
//   node scripts/seed-sewa-alat.mjs            # dry-run
//   node scripts/seed-sewa-alat.mjs --execute  # tulis ke DB
// ============================================================
import 'dotenv/config'
import pg from 'pg'

const DEV_REF = 'tgozokxyvwmyvajgqfxw'
const EXECUTE = process.argv.includes('--execute')
const TANDA = '[SEED-SEWA]'

/**
 * Tarif sewa sebagai persen harga unit. Keduanya diturunkan TERPISAH dari
 * harga beli — bukan yang satu dibagi dari yang lain (lihat kepala berkas).
 */
const PERSEN_HARIAN = 0.0012
const PERSEN_BULANAN = 0.022

/**
 * Alat yang TIDAK dimiliki. Harga acuan unit dipakai hanya untuk menurunkan
 * tarif sewanya, tidak ditulis ke basis — `assets` khusus alat milik sendiri.
 */
const ALAT_LUAR = [
  { nama: 'Tower Crane 40 m', hargaUnit: 3_800_000_000, persenBulanan: 0.019 },
  { nama: 'Bulldozer D6', hargaUnit: 2_100_000_000, persenBulanan: 0.023 },
  { nama: 'Pile Driver Hammer', hargaUnit: 1_450_000_000, persenBulanan: 0.026 },
]

const tgl = (d) => d.toISOString().slice(0, 10)

async function main() {
  const conn = process.env.DIRECT_URL
  if (!conn?.includes(DEV_REF)) {
    throw new Error(`TOLAK: koneksi bukan proyek dev (${DEV_REF}).`)
  }
  const c = new pg.Client({ connectionString: conn })
  await c.connect()

  console.log(`\n=== Seed sewa alat — ${EXECUTE ? 'EKSEKUSI' : 'DRY-RUN'} ===\n`)

  const actor = (await c.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'admin' AND u.is_active ORDER BY u.created_at LIMIT 1`,
  )).rows[0]?.id
  if (!actor) throw new Error('Tidak ada user admin aktif.')

  // Tenant yang BENAR-BENAR berisi — bukan sekadar company pertama. Diukur:
  // dari 630 companies, hanya 2 punya proyek, dan satu di antaranya 16 proyek.
  const company = (await c.query(
    `SELECT p.company_id AS id, count(*) n FROM projects p
      WHERE p.is_deleted = false
      GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
  )).rows[0]
  if (!company) throw new Error('Belum ada company berproyek.')

  const proyek = (await c.query(
    `SELECT id, name FROM projects
      WHERE company_id = $1 AND is_deleted = false
      ORDER BY created_at LIMIT 4`,
    [company.id],
  )).rows
  if (proyek.length === 0) throw new Error('Tenant tak punya proyek.')

  const suppliers = (await c.query(
    `SELECT id, name FROM suppliers WHERE company_id = $1 ORDER BY created_at LIMIT 4`,
    [company.id],
  )).rows

  // Alat berat/kendaraan milik sendiri — dasar baris "sewa unit tambahan".
  const aset = (await c.query(
    `SELECT id, name, purchase_price FROM assets
      WHERE company_id = $1 AND ownership = 'milik'
        AND category IN ('alat_berat', 'kendaraan')
        AND purchase_price IS NOT NULL
      ORDER BY purchase_price DESC LIMIT 4`,
    [company.id],
  )).rows

  const baris = []

  /*
   * Bentuk 1 — sewa unit TAMBAHAN untuk alat yang sudah dimiliki.
   *
   * Tarif diturunkan dari harga beli aset itu sendiri (3,5% per bulan), jadi
   * perbandingan "milik vs sewa" pada alat yang sama memakai satu dasar yang
   * konsisten, bukan dua angka yang tak berhubungan.
   */
  for (const [i, a] of aset.entries()) {
    const harian = Math.round(Number(a.purchase_price) * PERSEN_HARIAN)
    const mulai = new Date(2026, 6, 15 + i * 3)
    const selesai = new Date(mulai)
    selesai.setDate(selesai.getDate() + 10 + i * 4)

    baris.push({
      asset_id: a.id,
      item_name: `${a.name} (unit sewa tambahan)`,
      supplier_id: suppliers[i % Math.max(suppliers.length, 1)]?.id ?? null,
      project_id: proyek[i % proyek.length].id,
      rate: harian,
      rate_unit: 'hari',
      start_date: tgl(mulai),
      end_date: tgl(selesai),
      status: 'selesai',
      notes: `${TANDA} unit tambahan saat unit milik sendiri sedang terpakai`,
    })
  }

  /*
   * Bentuk 2 — alat yang BELUM dimiliki sama sekali. `asset_id` NULL.
   * Inilah kasus "haruskah kita beli?" yang sesungguhnya.
   */
  for (const [i, alat] of ALAT_LUAR.entries()) {
    const bulanan = Math.round(alat.hargaUnit * alat.persenBulanan)
    const mulai = new Date(2026, 6, 20 + i * 5)
    const selesai = new Date(mulai)
    selesai.setDate(selesai.getDate() + 25 + i * 10)

    baris.push({
      asset_id: null,
      item_name: alat.nama,
      supplier_id: suppliers[(i + 1) % Math.max(suppliers.length, 1)]?.id ?? null,
      project_id: proyek[(i + 1) % proyek.length].id,
      rate: bulanan,
      rate_unit: 'bulan',
      start_date: tgl(mulai),
      end_date: tgl(selesai),
      // 'berjalan', bukan 'aktif' — diukur dari `asset_rentals_status_check`,
      // yang hanya menerima berjalan|selesai|batal. Tebakan 'aktif' ditolak
      // basis, dan itu perilaku yang benar.
      status: i === ALAT_LUAR.length - 1 ? 'berjalan' : 'selesai',
      notes: `${TANDA} alat tidak dimiliki — acuan kelayakan beli (unit ~Rp ${(alat.hargaUnit / 1e9).toFixed(2)} M)`,
    })
  }

  console.log(`Tenant     : ${company.id} (${company.n} proyek)`)
  console.log(`Aset milik : ${aset.length} · Supplier: ${suppliers.length}`)
  console.log(`Akan ditulis: ${baris.length} baris sewa\n`)
  for (const b of baris) {
    console.log(
      `  ${b.item_name.padEnd(42)} Rp ${Number(b.rate).toLocaleString('id-ID').padStart(12)}/${b.rate_unit}` +
      `  ${b.start_date}..${b.end_date}  ${b.status}${b.asset_id ? '' : '  [belum dimiliki]'}`,
    )
  }

  if (!EXECUTE) {
    console.log('\nDRY-RUN — tidak ada yang ditulis. Tambahkan --execute.\n')
    await c.end()
    return
  }

  await c.query('BEGIN')
  try {
    // Idempoten: buang jejak seed sebelumnya, JANGAN sentuh baris manusia.
    const hapus = await c.query(
      `DELETE FROM asset_rentals WHERE company_id = $1 AND notes LIKE $2`,
      [company.id, `${TANDA}%`],
    )

    let baru = 0
    for (const b of baris) {
      await c.query(
        `INSERT INTO asset_rentals
           (company_id, asset_id, item_name, supplier_id, project_id,
            rate, rate_unit, start_date, end_date, status, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [company.id, b.asset_id, b.item_name, b.supplier_id, b.project_id,
         b.rate, b.rate_unit, b.start_date, b.end_date, b.status, b.notes, actor],
      )
      baru++
    }
    await c.query('COMMIT')
    console.log(`\n✓ ${hapus.rowCount} baris seed lama dibuang, ${baru} baris ditulis.\n`)
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  }

  const cek = (await c.query(
    `SELECT count(*) n, count(asset_id) berpasangan,
            count(*) FILTER (WHERE asset_id IS NULL) belum_dimiliki
       FROM asset_rentals WHERE company_id = $1`,
    [company.id],
  )).rows[0]
  console.log(`Verifikasi: ${cek.n} baris · ${cek.berpasangan} berpasangan aset milik · ${cek.belum_dimiliki} belum dimiliki\n`)

  await c.end()
}

main().catch((e) => {
  console.error('GAGAL:', e.message)
  process.exit(1)
})
