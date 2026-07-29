#!/usr/bin/env node
// ============================================================
// EXTRACTOR HARGA POKOK — workbook Cibuluh (HS.UPAH + HS.BAHAN)
//
// KONTEKS (kenapa ini ada, dan kenapa BARU sekarang):
//   Impor analisa (langkah 4 & 8) sengaja TIDAK menyeed harga — desain §3.6:
//   harga adalah sumbu terpisah (wilayah + tanggal), bukan bagian analisa.
//   Konsekuensinya baru terlihat saat founder bertanya: 2.766 resource dipakai
//   analisa, NOL punya harga → 100% analisa tak bisa menghitung HSP.
//
//   Analoginya: rumus `=HS.BAHAN!D569` sudah terpasang di semua analisa, tapi
//   sheet HS.BAHAN-nya masih kosong. Skrip ini mengisi sheet itu.
//
// YANG DIVERIFIKASI SEBELUM MENULIS (bukan asumsi):
//   Analisa merujuk HS.BAHAN!D569 → baris 569 kolom D = "Kayu Dolken", 35000 —
//   dan 35000 itulah yang muncul di kolom harga analisa. Kolom D dikonfirmasi
//   sebagai kolom harga yang HIDUP.
//
// STRUKTUR DUA SHEET BERBEDA — dan itu jebakan yang mudah terlewat:
//   HS.UPAH  : nama=kolom C, satuan=D, harga=E
//   HS.BAHAN : nama=kolom B, satuan=C, harga=D
//              kolom E = "TA. 2008" (harga LAMA) — JANGAN dipakai. Memakainya
//              menghasilkan harga 18 tahun lalu yang terlihat wajar.
//
// KELUARAN: db/seeds/harga-cibuluh-dataset.json — dataset, bukan langsung DB.
// Pola sama dengan extractor analisa: ekstraksi dan seeding dipisah supaya
// hasilnya bisa direview sebelum menyentuh database.
// ============================================================
import XLSX from 'xlsx'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'E:/Project/puraloka-suite/_source/ahsp/golden/RAB Gudang Cibuluh Sumedang bobot.xlsx'
const OUT = 'E:/Project/puraloka-suite/db/seeds/harga-cibuluh-dataset.json'

// Satuan workbook → units.code. Sama dengan peta extractor analisa supaya
// resource yang sama tidak lahir dua kali dengan satuan berbeda penulisan.
const UNIT_MAP = {
  'oh': 'OH', '0h': 'OH', 'org': 'OH', 'hari / 8 jam': 'OH', 'hari/8 jam': 'OH',
  'jam': 'jam', 'hari': 'hari',
  'm': 'm', 'm1': 'm1', "m'": 'm1', 'm2': 'm2', 'm3': 'm3', 'm³': 'm3',
  'kg': 'kg', 'ton': 'ton',
  'bh': 'buah', 'buah': 'buah', 'pcs': 'buah',
  'btg': 'batang', 'batang': 'batang',
  'lbr': 'lembar', 'lembar': 'lembar',
  'lt': 'liter', 'ltr': 'liter', 'liter': 'liter',
  'ls': 'ls', 'unit': 'unit', 'set': 'set', 'titik': 'titik',
  'zak': 'sak', 'sak': 'sak', 'rol': 'rol', 'tube': 'tube', 'cm': 'cm',
  'dus': 'dus', 'kaleng': 'kaleng', 'pail': 'pail', 'roll': 'rol',

  // Varian penulisan yang MUNCUL di workbook ini, dipetakan setelah tiap satu
  // diperiksa konteksnya — bukan ditebak dari kemiripan huruf:
  'ltr.': 'liter',                      // "Minyak Tanah Ltr." — titik di akhir
  'ibr': 'lembar',                      // OCR "lbr": seng plat, aluminium plat
  'm²': 'm2',                           // superscript, sama dengan m2
  'unt': 'unit',                        // "Door Closer ... unt"
  'ttk': 'titik',                       // "Dia 40-150 ttk" (titik instalasi)
  'tb': 'tube',                         // "Lem PVC Tube tb"
  'bt': 'batang',                       // "Bambu bt"

  // SENGAJA TIDAK DIPETAKAN — akan ditolak fail-loud:
  //   'ps'   → "Hak Angin Kait Jendela": pasang? pcs? pasangan? tak pasti.
  //   'ml'   → "Water Profing Membrance": mililiter tak masuk akal untuk
  //            membran; kemungkinan salah ketik "m1" atau "m2" — dan menebak
  //            antara meter-lari vs meter-persegi mengubah angka anggaran.
  //   '5 lt' → kemasan ("Solignum 1 blek"), bukan satuan. Perlu faktor kemasan
  //            (material_pack, langkah 6), bukan dipaksa jadi liter.
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const unitOf = (s) => UNIT_MAP[norm(s).toLowerCase()] ?? null

/**
 * Baris JUDUL BAGIAN vs baris HARGA.
 *
 * Di HS.BAHAN, baris seperti `A. | BAHAN AGREGAT KASAR... | · | ·` adalah judul
 * kelompok — nomornya huruf, satuannya kosong. Baris harga selalu bernomor
 * angka DAN bersatuan. Membedakannya lewat satuan, bukan lewat nomor: nomor
 * bisa kosong di tengah daftar, satuan tidak.
 */
function ekstrak(rows, { kolNama, kolSat, kolHarga, kategori, namaSheet }) {
  const hasil = []
  const dilewati = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const nama = norm(r[kolNama])
    const satRaw = norm(r[kolSat])
    const harga = r[kolHarga]

    if (!nama || nama.length < 2) continue
    // Nama yang murni angka bukan barang — itu baris penomoran kolom
    // ("1 | 2 | 3 | 4" di bawah header) atau varian ukuran yang namanya ada di
    // kolom lain. Menyeed-nya menghasilkan "harga untuk material bernama 260".
    if (/^[\d.,]+$/.test(nama)) {
      dilewati.push({ baris: i + 1, nama, alasan: 'nama berupa angka (baris penomoran kolom)' })
      continue
    }
    if (typeof harga !== 'number' || !(harga > 0)) continue
    if (!satRaw) { // judul kelompok: bernama & kadang berangka, tapi tanpa satuan
      dilewati.push({ baris: i + 1, nama: nama.slice(0, 60), alasan: 'tanpa satuan (judul kelompok)' })
      continue
    }
    const unit = unitOf(satRaw)
    if (!unit) {
      // Fail-loud: satuan tak dikenal berarti peta perlu ditambah, BUKAN
      // ditebak. Menebak satuan = menebak arti angkanya.
      dilewati.push({ baris: i + 1, nama: nama.slice(0, 60), satuan: satRaw, alasan: 'satuan tak dikenal' })
      continue
    }
    hasil.push({
      sheet: namaSheet, baris: i + 1,
      nama, unit_code: unit, satuan_asli: satRaw,
      amount: harga, category: kategori,
    })
  }
  return { hasil, dilewati }
}

const buf = readFileSync(SRC)
const sha = createHash('sha256').update(buf).digest('hex')
const wb = XLSX.read(buf, {
  cellFormula: true,
  sheets: ['HS.UPAH', 'HS.BAHAN', 'ANALISA STANDAR', 'ANALISA BETON', 'ANALBONGKAR',
           'KUSEN ALUMUNIUM', 'ANALISA LISTRIK'],
})

const upah = ekstrak(
  XLSX.utils.sheet_to_json(wb.Sheets['HS.UPAH'], { header: 1, raw: true }),
  { kolNama: 2, kolSat: 3, kolHarga: 4, kategori: 'labor', namaSheet: 'HS.UPAH' })

const bahan = ekstrak(
  XLSX.utils.sheet_to_json(wb.Sheets['HS.BAHAN'], { header: 1, raw: true }),
  { kolNama: 1, kolSat: 2, kolHarga: 3, kategori: 'material', namaSheet: 'HS.BAHAN' })

// Nama ganda di dalam satu sheet: ambil yang TERAKHIR (revisi biasanya ditulis
// di bawah). Dicatat, bukan didiamkan — nama ganda berharga beda adalah tanda
// data sumber perlu diperiksa.
const semua = [...upah.hasil, ...bahan.hasil]
const perNama = new Map()
const ganda = []
for (const h of semua) {
  const k = `${h.category}|${h.nama.toLowerCase()}`
  if (perNama.has(k)) {
    const lama = perNama.get(k)
    if (lama.amount !== h.amount) {
      ganda.push({ nama: h.nama, sheet: h.sheet, harga_lama: lama.amount, harga_dipakai: h.amount })
    }
  }
  perNama.set(k, h)
}

// ------------------------------------------------------------
// PEMETAAN LEWAT RUMUS — jalur pasti, bukan tebak-tebakan nama.
//
// Mencocokkan harga ke resource lewat NAMA ternyata hanya 12% berhasil di
// workbook ini: nama di analisa dan di sheet harga memang berbeda penulisan.
//   "Dolken kayu dia 8 - 10/400 cm" → HS.BAHAN!569 = "Kayu Dolken"
//   "Pekerja"                       → HS.UPAH!9    = "Pekerja / Pembantu Tukang"
//   "Kayu 5/7 Lokal"                → HS.BAHAN!555 = "Kayu Balok Lokal Kls. II"
//
// Yang TIDAK berbeda: rumusnya. `=HS.BAHAN!D569` menyatakan dengan pasti baris
// harga mana yang dimaksud — itu keputusan penyusun workbook, bukan dugaan
// kemiripan huruf. Jadi rumusnya yang dipanen, dan nama dipakai hanya sebagai
// cadangan.
//
// Ini juga alasan pemetaan tak boleh ditebak: "Kaca Patri" mirip "kaca 2 mm",
// dan "Genteng Palentong Super" mirip "atap genteng kodok glazur" — dua-duanya
// mirip, dua-duanya salah.
// ------------------------------------------------------------
const SHEET_ANALISA = ['ANALISA STANDAR', 'ANALISA BETON', 'ANALBONGKAR',
                       'KUSEN ALUMUNIUM', 'ANALISA LISTRIK']
const pemetaan = []
const barisHarga = new Map() // "HS.BAHAN|569" → entri harga
for (const h of [...upah.hasil, ...bahan.hasil]) barisHarga.set(`${h.sheet}|${h.baris}`, h)

for (const sname of SHEET_ANALISA) {
  const ws = wb.Sheets[sname]
  if (!ws?.['!ref']) continue
  const rng = XLSX.utils.decode_range(ws['!ref'])
  for (let R = rng.s.r; R <= rng.e.r; R++) {
    const sel = ws[XLSX.utils.encode_cell({ c: 4, r: R })]   // kolom E = harga
    const nb = ws[XLSX.utils.encode_cell({ c: 1, r: R })]    // kolom B = nama komponen
    if (!sel?.f || !nb?.v) continue
    const m = String(sel.f).match(/(HS\.BAHAN|HS\.UPAH)!\$?[A-Z]+\$?(\d+)/)
    if (!m) continue
    const target = barisHarga.get(`${m[1]}|${Number(m[2])}`)
    if (!target) continue // baris harga itu sendiri tak lolos ekstraksi
    pemetaan.push({
      nama_di_analisa: norm(nb.v),
      nama_di_harga: target.nama,
      sheet_harga: m[1], baris_harga: Number(m[2]),
      amount: target.amount, unit_code: target.unit_code, category: target.category,
    })
  }
}
// Satu nama-di-analisa bisa muncul di banyak analisa. Kalau semuanya menunjuk
// harga yang sama, tak ada masalah. Kalau BERBEDA, itu konflik yang harus
// dilaporkan — bukan diam-diam diambil salah satu.
//
// Konflik nyata yang ditemukan di workbook ini: "Asbes Gelombang" muncul dua
// kali; satu menunjuk HS.BAHAN!D181 (Rp 60.000, benar), satu menunjuk D194 =
// "Genteng Morando Glasur" (Rp 8.000). Rumus keduanya sah secara Excel — yang
// salah adalah isian workbook-nya. Kelas yang sama dengan 42 cacat internal
// yang sudah terdokumentasi saat impor analisa.
//
// Sikap: yang berkonflik TIDAK dipetakan sama sekali. Memilih salah satu
// berarti menebak, dan menebak harga material menghasilkan angka anggaran yang
// salah tanpa gejala. Resource-nya dibiarkan tanpa harga → fail-loud saat
// dipakai, dan founder mengisinya lewat UI dengan angka yang ia yakini.
const perNamaAnalisa = new Map()
for (const p of pemetaan) {
  if (!p.nama_di_analisa) continue
  const list = perNamaAnalisa.get(p.nama_di_analisa) ?? []
  list.push(p)
  perNamaAnalisa.set(p.nama_di_analisa, list)
}

const petaUnik = new Map()
const konflik = []
for (const [nama, list] of perNamaAnalisa) {
  const beda = [...new Set(list.map((x) => `${x.sheet_harga}!${x.baris_harga}|${x.amount}`))]
  if (beda.length > 1) {
    konflik.push({
      nama_di_analisa: nama,
      kandidat: [...new Map(list.map((x) => [
        `${x.sheet_harga}!${x.baris_harga}`,
        { ref: `${x.sheet_harga}!${x.baris_harga}`, nama_di_harga: x.nama_di_harga, amount: x.amount },
      ])).values()],
    })
    continue // TIDAK dipetakan — lihat alasan di atas
  }
  petaUnik.set(nama, list[0])
}

const dataset = {
  meta: {
    source_file: 'RAB Gudang Cibuluh Sumedang bobot.xlsx',
    source_sha256: sha,
    source_sheets: ['HS.UPAH', 'HS.BAHAN'],
    source_kind: 'company (harga pokok workbook Gudang Cibuluh Sumedang)',
    price_context: 'Kabupaten Bandung, tahun workbook 2019',
    extractor: 'apps/api/scripts/extract-harga-cibuluh.mjs',
    catatan_kolom:
      'HS.UPAH: nama=C, satuan=D, harga=E. HS.BAHAN: nama=B, satuan=C, harga=D. ' +
      'Kolom E di HS.BAHAN adalah harga LAMA (TA. 2008) — sengaja tidak dipakai.',
    counts: {
      upah: upah.hasil.length,
      bahan: bahan.hasil.length,
      unik: perNama.size,
      dilewati: upah.dilewati.length + bahan.dilewati.length,
      nama_ganda_beda_harga: ganda.length,
      pemetaan_lewat_rumus: petaUnik.size,
      konflik_rumus_diabaikan: konflik.length,
    },
    catatan_pemetaan:
      'Pencocokan harga→resource memakai PEMETAAN LEWAT RUMUS (`mapping`), bukan ' +
      'kemiripan nama: nama di analisa dan di sheet harga memang berbeda ' +
      'penulisan (cocok-by-nama hanya 12%). Rumus `=HS.BAHAN!D569` menyatakan ' +
      'baris harga mana yang dimaksud — itu keputusan penyusun workbook.',
  },
  prices: [...perNama.values()].sort((a, b) =>
    a.category.localeCompare(b.category) || a.nama.localeCompare(b.nama)),
  mapping: [...petaUnik.values()].sort((a, b) =>
    a.nama_di_analisa.localeCompare(b.nama_di_analisa)),
  mapping_conflicts: konflik,
  skipped: [...upah.dilewati, ...bahan.dilewati],
  duplicates: ganda,
}

writeFileSync(OUT, JSON.stringify(dataset, null, 2))
console.log(`ditulis: ${OUT}`)
console.log(`  upah   : ${upah.hasil.length}`)
console.log(`  bahan  : ${bahan.hasil.length}`)
console.log(`  unik   : ${perNama.size}`)
console.log(`  dilewati: ${dataset.skipped.length}`)
console.log(`  nama ganda beda harga: ${ganda.length}`)
console.log(`  pemetaan lewat rumus  : ${petaUnik.size}`)
console.log(`  konflik rumus (diabaikan): ${konflik.length}`)
if (dataset.skipped.filter((s) => s.alasan === 'satuan tak dikenal').length) {
  console.log('\n  ⚠ satuan tak dikenal (peta perlu ditambah):')
  for (const s of dataset.skipped.filter((s) => s.alasan === 'satuan tak dikenal').slice(0, 12)) {
    console.log(`     baris ${s.baris}: "${s.nama}" satuan="${s.satuan}"`)
  }
}
