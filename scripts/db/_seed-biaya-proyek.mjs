/**
 * Riwayat biaya proyek — enam bulan, supaya otomasi berpola bisa DIUJI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `project_expenses` NOL BARIS, dan itu menahan empat otomasi sendirian:
 * deteksi transaksi kembar (2.7), pengeluaran berulang (2.14), kebocoran
 * margin (2.5), dan kategorisasi kas kecil (2.16). Semuanya butuh POLA, dan
 * pola tak bisa dibaca dari tabel kosong.
 *
 * Yang disemai bukan angka acak. Tiga bentuk sengaja ditanam karena itulah
 * yang harus bisa ditemukan otomasinya:
 *
 *   BERULANG   sewa direksi keet & langganan internet — nominal sama, vendor
 *              sama, tiap bulan. Inilah yang dicari 2.14.
 *   KEMBAR     satu tagihan yang tercatat DUA KALI berselang sehari. Inilah
 *              yang dicari 2.7.
 *   BIASA      belanja material yang nominal dan tanggalnya beragam, supaya
 *              dua bentuk di atas benar-benar menonjol dari latar — bukan
 *              menonjol karena tak ada yang lain.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG SENGAJA TIDAK DILAKUKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **1. Tak ada baris bersumber `petty_cash` atau `main_cash`.**
 *
 * Dua trigger bergantung padanya:
 *
 *     fn_update_petty_cash_on_expense   AFTER INSERT OR UPDATE OF status
 *     fn_update_main_cash_on_expense    AFTER INSERT OR UPDATE OF status
 *
 * Keduanya mengurangi `cash_accounts.balance` saat baris `approved` masuk
 * dengan `petty_cash_id`/`main_cash_id` terisi. Menyemai lewat jalur itu
 * berarti data dummy MEMINDAHKAN saldo kas yang dilihat orang di layar.
 *
 * Disiplin yang sama sudah dipakai di `lib/tulis-klaim.ts`, tempat
 * `cash_account_id` dipaku NULL supaya satu kalimat WhatsApp yang salah
 * dengar tak memindahkan uang. Alasannya identik.
 *
 * Sumbernya `client_fund`, dan kedua kolom kas dibiarkan NULL.
 *
 * **2. Tak menghapus apa pun selain barisnya sendiri.**
 *
 * Penandanya `ref_type = 'seed-riwayat'`. Pembersihannya:
 *
 *     DELETE FROM project_expenses WHERE ref_type = 'seed-riwayat';
 *
 * Baris yang tak bertanda itu tak pernah disentuh, sekalipun mirip.
 *
 * ── Menjalankan
 *
 *     node scripts/db/_seed-biaya-proyek.mjs
 *
 * Idempoten: barisnya sendiri dihapus lebih dulu, lalu ditulis ulang.
 */
import { buatClient } from './_koneksi.mjs'

const PENANDA = 'seed-riwayat'
const BULAN = 6

const db = buatClient()
await db.connect()

const { rows: c } = await db.query(`
  SELECT c.id FROM companies c
  WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
  LIMIT 1
`)
if (!c[0]) throw new Error('tak ada tenant beranggota')
const companyId = c[0].id

const { rows: proyek } = await db.query(`
  SELECT id, name FROM projects
   WHERE company_id = $1 AND status IN ('active', 'completed', 'on_hold')
   ORDER BY created_at LIMIT 4
`, [companyId])
if (proyek.length === 0) throw new Error('tak ada proyek untuk disemai')

const { rows: kategori } = await db.query(
  `SELECT id, name FROM project_expense_categories ORDER BY name`)
if (kategori.length === 0) throw new Error('tak ada kategori biaya')

const { rows: pengguna } = await db.query(`
  SELECT u.id FROM users u
   WHERE u.is_active
     AND EXISTS (SELECT 1 FROM company_members m
                  WHERE m.user_id = u.id AND m.company_id = $1)
   LIMIT 1
`, [companyId])
if (!pengguna[0]) throw new Error('tak ada pengguna untuk mengisi submitted_by')
const olehId = pengguna[0].id

// ── Bersihkan HANYA baris bertanda ────────────────────────────────────────
const { rowCount: dihapus } = await db.query(
  `DELETE FROM project_expenses WHERE ref_type = $1`, [PENANDA])

/** Tanggal `YYYY-MM-DD`, mundur dari hari ini. */
function tgl(mundurHari) {
  const d = new Date()
  d.setDate(d.getDate() - mundurHari)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

const kat = (nama) =>
  (kategori.find((k) => k.name.toLowerCase().includes(nama)) ?? kategori[0]).id

const baris = []
const tambah = (o) => baris.push({
  project_id: o.proyek,
  category_id: o.kategori,
  description: o.uraian,
  expense_date: o.tanggal,
  qty: o.qty ?? 1,
  unit: o.satuan ?? 'ls',
  unit_price: o.nominal,
  total_amount: (o.qty ?? 1) * o.nominal,
  vendor_name: o.vendor,
  status: o.status ?? 'approved',
  notes: o.catatan ?? null,
})

/*
  ── BENTUK 1: pengeluaran BERULANG (target 2.14)

  Sewa direksi keet dan langganan internet lokasi: vendor sama, nominal sama,
  sekali tiap bulan. Inilah yang harus dikenali sebagai "ini bukan belanja
  baru, ini biaya tetap yang tak pernah masuk anggaran".

  Ditanam pada DUA proyek supaya otomasinya tak bisa lulus hanya dengan
  mencocokkan seluruh perusahaan sebagai satu tumpukan.
*/
const BERULANG = [
  { uraian: 'Sewa direksi keet bulanan', vendor: 'CV Sarana Bangun', nominal: 3_500_000, kategori: kat('sewa') },
  { uraian: 'Langganan internet lokasi', vendor: 'PT Nusa Data', nominal: 850_000, kategori: kat('lain') },
]
for (const p of proyek.slice(0, 2)) {
  for (const b of BERULANG) {
    for (let m = 0; m < BULAN; m++) {
      tambah({
        proyek: p.id, kategori: b.kategori, uraian: b.uraian,
        tanggal: tgl(m * 30 + 3), nominal: b.nominal, vendor: b.vendor,
        catatan: 'biaya tetap bulanan',
      })
    }
  }
}

/*
  ── BENTUK 2: transaksi KEMBAR (target 2.7)

  Satu tagihan yang tercatat dua kali berselang sehari — pola paling lazim
  dari pencatatan ganda: nota yang sama diinput ulang karena yang pertama
  dikira gagal tersimpan.

  Nominal dan vendornya identik, uraiannya sedikit berbeda (satu memakai
  huruf besar) supaya otomasinya tak bisa lulus hanya dengan mencocokkan
  teks persis. Yang harus dikenali kesamaan vendor + nominal + kedekatan
  tanggal, bukan kesamaan kalimat.
*/
const pKembar = proyek[0]
tambah({
  proyek: pKembar.id, kategori: kat('besi'), uraian: 'Besi beton D13 20 batang',
  tanggal: tgl(47), nominal: 2_150_000, vendor: 'UD Besi Kuat Mandiri', qty: 1,
})
tambah({
  proyek: pKembar.id, kategori: kat('besi'), uraian: 'BESI BETON D13 20 BATANG',
  tanggal: tgl(46), nominal: 2_150_000, vendor: 'UD Besi Kuat Mandiri', qty: 1,
  catatan: 'input ulang, nota sama',
})

// Kembar kedua di proyek lain — SATU contoh tak cukup untuk menilai.
if (proyek[1]) {
  tambah({
    proyek: proyek[1].id, kategori: kat('beton'), uraian: 'Beton readymix K-250 8 m3',
    tanggal: tgl(23), nominal: 7_400_000, vendor: 'CV Sinar Abadi Beton',
  })
  tambah({
    proyek: proyek[1].id, kategori: kat('beton'), uraian: 'Beton readymix K250 8m3',
    tanggal: tgl(23), nominal: 7_400_000, vendor: 'CV Sinar Abadi Beton',
  })
}

/*
  ── BENTUK 3: belanja BIASA yang beragam

  Tanpa latar ini, dua bentuk di atas menonjol karena tak ada yang lain —
  dan otomasi yang "berhasil" pada tabel berisi delapan baris belum
  membuktikan apa pun. Nominalnya dibuat bervariasi supaya kesamaan nominal
  benar-benar jadi sinyal, bukan kebetulan.
*/
const BIASA = [
  ['Semen 50 sak', 'Toko Bangunan Maju Jaya', 'semen', 'sak', 50, 68_000],
  ['Pasir beton 6 m3', 'Toko Bangunan Maju Jaya', 'pasir', 'm3', 6, 285_000],
  ['Keramik 60x60 40 dus', 'Toko Keramik Indah', 'lain', 'dus', 40, 172_000],
  ['Kabel NYM 3x2.5 2 roll', 'PT Elektrindo', 'listrik', 'roll', 2, 940_000],
  ['Pipa PVC 4 inci 30 batang', 'Toko Pipa Sejahtera', 'pipa', 'btg', 30, 87_500],
  ['Cat tembok interior 12 pail', 'Toko Cat Warna', 'lain', 'pail', 12, 415_000],
  ['Multipleks 12mm 25 lembar', 'Toko Kayu Rejeki', 'kayu', 'lbr', 25, 198_000],
  ['Bata ringan 400 buah', 'UD Bata Makmur', 'bata', 'bh', 400, 9_800],
]

let n = 0
for (const p of proyek) {
  for (let m = 0; m < BULAN; m++) {
    // Dua sampai tiga belanja tiap bulan per proyek — bukan angka bulat,
    // supaya sebarannya tak rata dan pola bulanan yang SUNGGUHAN (bentuk 1)
    // tetap bisa dibedakan dari kebetulan.
    const berapa = 2 + ((m + proyek.indexOf(p)) % 2)
    for (let i = 0; i < berapa; i++) {
      const [uraian, vendor, k, satuan, qty, harga] = BIASA[n % BIASA.length]
      n++
      tambah({
        proyek: p.id, kategori: kat(k), uraian,
        // Tanggal digeser deterministik, bukan acak — supaya penyemaian ulang
        // menghasilkan basis yang sama dan hasil ujinya bisa dibandingkan.
        tanggal: tgl(m * 30 + 5 + ((n * 7) % 18)),
        nominal: harga, vendor, qty, satuan,
        // Sebagian kecil belum disetujui — supaya saringan status benar-benar
        // punya sesuatu untuk disaring.
        status: n % 11 === 0 ? 'submitted' : n % 17 === 0 ? 'draft' : 'approved',
      })
    }
  }
}

/*
  Ditulis satu per satu, BUKAN satu INSERT raksasa.

  Kedua trigger kas berjalan per baris; menyisipkan borongan tak mengubah
  itu, tetapi kalau ada satu baris yang ditolak constraint, INSERT borongan
  menggagalkan seluruhnya dan meninggalkan pesan yang tak menunjuk baris mana.
*/
let ditulis = 0
for (const b of baris) {
  await db.query(`
    INSERT INTO project_expenses
      (project_id, category_id, expense_source, description, expense_date,
       qty, unit, unit_price, total_amount, vendor_name, status,
       submitted_by, notes, billed_amount, ref_type,
       petty_cash_id, main_cash_id)
    VALUES ($1,$2,'client_fund',$3,$4,$5,$6,$7,$8,$9,$10::expense_status,
            $11,$12,0,$13,NULL,NULL)
  `, [b.project_id, b.category_id, b.description, b.expense_date, b.qty, b.unit,
      b.unit_price, b.total_amount, b.vendor_name, b.status, olehId, b.notes,
      PENANDA])
  ditulis++
}

// ── Verifikasi: yang ditanam HARUS bisa ditemukan lagi ────────────────────
//
// Penyemai yang tak memeriksa hasilnya sendiri bisa menulis 200 baris yang
// tak memuat satu pun pola — dan otomasinya lalu dinyatakan "tak menemukan
// apa-apa" padahal memang tak ada yang bisa ditemukan.
const { rows: cekBerulang } = await db.query(`
  SELECT description, vendor_name, count(*) n
    FROM project_expenses
   WHERE ref_type = $1 AND notes = 'biaya tetap bulanan'
   GROUP BY 1,2 HAVING count(*) >= $2
`, [PENANDA, BULAN])

const { rows: cekKembar } = await db.query(`
  SELECT a.vendor_name, a.total_amount, count(*) n
    FROM project_expenses a
    JOIN project_expenses b
      ON b.ref_type = $1 AND b.id <> a.id
     AND b.project_id = a.project_id
     AND b.vendor_name = a.vendor_name
     AND b.total_amount = a.total_amount
     AND abs(b.expense_date - a.expense_date) <= 3
   WHERE a.ref_type = $1
   GROUP BY 1,2
`, [PENANDA])

const { rows: kas } = await db.query(`
  SELECT count(*) n FROM project_expenses
   WHERE ref_type = $1 AND (petty_cash_id IS NOT NULL OR main_cash_id IS NOT NULL)
`, [PENANDA])

console.log(`\n  dihapus (baris bertanda lama) : ${dihapus}`)
console.log(`  ditulis                       : ${ditulis}`)
console.log(`  pola BERULANG ≥${BULAN} bulan       : ${cekBerulang.length}`)
console.log(`  pasangan KEMBAR (vendor+nominal): ${cekKembar.length}`)
console.log(`  baris menyentuh kas           : ${kas[0].n}  (harus 0)`)

if (cekBerulang.length === 0) throw new Error('pola berulang tak tertanam')
if (cekKembar.length === 0) throw new Error('pola kembar tak tertanam')
if (Number(kas[0].n) !== 0) throw new Error('ada baris yang menyentuh saldo kas')

console.log('\n  ✅ pola yang ditanam terbukti bisa ditemukan lagi')
console.log(`  bersihkan: DELETE FROM project_expenses WHERE ref_type = '${PENANDA}';\n`)

await db.end()
