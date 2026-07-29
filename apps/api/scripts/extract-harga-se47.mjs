#!/usr/bin/env node
// ============================================================
// EXTRACTOR HARGA POKOK — workbook SE-47 nasional (sheet "Upah Bahan")
//
// Pendamping `extract-harga-cibuluh.mjs`. Sheet ini memuat catatan tegas dari
// penerbitnya:
//   "HARGA UPAH DAN MATERIAL INI DI UBAH SESUAI HARGA DI DAERAH MASING-MASING"
// Jadi ia harga ACUAN, bukan harga yang mengikat — persis alasan harga hidup di
// sumbu terpisah (wilayah + tanggal) dan bisa ditimpa per proyek (migrasi 140).
//
// PELAJARAN YANG DIBAWA KE SINI (kesalahan saya sebelumnya, dikoreksi founder):
//   Hitungan pertama saya bilang sheet ini punya 55 harga. Itu SALAH — regex
//   saya mensyaratkan kode berformat "L.01", padahal hanya bagian UPAH di awal
//   sheet yang berkode. 3.325 baris material & alat TIDAK punya kolom kode sama
//   sekali, dan semuanya terlewat.
//
//   Karena itu extractor ini TIDAK bergantung pada kode. Kriterianya: ada nama
//   + ada satuan + ada harga angka. Kode dibawa bila ada, tapi tak pernah jadi
//   syarat.
//
// STRUKTUR: B=no, C=kode (sering kosong), D=nama, E=satuan, F=harga.
//
// KATEGORI: sheet ini menggabung upah/material/alat dalam satu daftar, dipisah
// baris judul ("I. UPAH", "II. BAHAN", "III. PERALATAN"). Kategori diturunkan
// dari judul terakhir yang dilewati — bukan ditebak dari nama barangnya.
// ============================================================
import XLSX from 'xlsx'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'E:/Project/puraloka-suite/_source/ahsp/AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm'
const OUT = 'E:/Project/puraloka-suite/db/seeds/harga-se47-dataset.json'

const UNIT_MAP = {
  'oh': 'OH', '0h': 'OH', 'org': 'OH',
  'jam': 'jam', 'hari': 'hari',
  'm': 'm', 'm1': 'm1', "m'": 'm1', 'm2': 'm2', 'm²': 'm2', 'm3': 'm3', 'm³': 'm3',
  'kg': 'kg', 'ton': 'ton',
  'bh': 'buah', 'buah': 'buah', 'pcs': 'buah', 'bj': 'buah',
  'btg': 'batang', 'batang': 'batang',
  'lbr': 'lembar', 'lembar': 'lembar',
  'lt': 'liter', 'ltr': 'liter', 'liter': 'liter',
  'ls': 'ls', 'unit': 'unit', 'set': 'set', 'titik': 'titik', 'ttk': 'titik',
  'zak': 'sak', 'sak': 'sak', 'rol': 'rol', 'roll': 'rol', 'tube': 'tube',
  'cm': 'cm', 'dus': 'dus', 'kaleng': 'kaleng', 'pail': 'pail',

  // Varian penulisan di workbook ini — tiap satu diperiksa konteksnya, bukan
  // dipetakan dari kemiripan huruf:
  'm¹': 'm1',                     // superscript, sama dengan m1
  'dos': 'dus',                   // ejaan alternatif
  'pohon': 'batang',              // tanaman lansekap dihitung per batang
  'polybag': 'buah',              // wadah bibit, dihitung per buah
  'gulung': 'rol', 'kotak': 'dus', 'pak': 'dus', 'daun': 'buah',
  // Salah ketik yang jelas dari konteks (semua barang satuan):
  'bauh': 'buah', 'buag': 'buah',

  // SENGAJA TIDAK DIPETAKAN — ditolak fail-loud:
  //   'lot','lolt' → borongan tak bersatuan; nilainya bergantung isi lot.
  //   'VA'         → satuan DAYA listrik, bukan kuantitas yang bisa dikalikan
  //                  koefisien. Butuh penanganan tersendiri.
  //   'OJ'         → orang-jam. Beda basis dengan OH (orang-hari) dan
  //                  mengubahnya butuh faktor jam-kerja — menebak = salah upah.
  //   'bulan'      → sewa berbasis waktu, bukan kuantitas material.
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const unitOf = (s) => UNIT_MAP[norm(s).toLowerCase()] ?? null

const buf = readFileSync(SRC)
const sha = createHash('sha256').update(buf).digest('hex')
const rows = XLSX.utils.sheet_to_json(
  XLSX.read(buf, { sheets: ['Upah Bahan'] }).Sheets['Upah Bahan'], { header: 1, raw: true })

// Judul bagian → kategori. Dicocokkan pada baris tanpa harga yang memuat kata
// kuncinya; kategori berlaku sampai judul berikutnya.
const JUDUL = [
  { re: /\bUPAH\b|\bTENAGA KERJA\b/i, kategori: 'labor' },
  { re: /\bBAHAN\b|\bMATERIAL\b/i,    kategori: 'material' },
  { re: /\bPERALATAN\b|\bALAT\b/i,    kategori: 'equipment' },
]

const hasil = []
const dilewati = []
let kategori = 'material' // default aman: mayoritas isi sheet ini adalah bahan

for (let i = 0; i < rows.length; i++) {
  const r = rows[i]
  if (!r) continue
  const kode = norm(r[2])
  const nama = norm(r[3])
  const satRaw = norm(r[4])
  const harga = r[5]

  // Baris judul: bernama, tanpa harga. Menggeser kategori untuk baris di
  // bawahnya.
  if (nama && (typeof harga !== 'number' || !(harga > 0))) {
    const cocok = JUDUL.find((j) => j.re.test(nama))
    if (cocok && nama.length < 40) kategori = cocok.kategori
    continue
  }

  if (!nama || nama.length < 2) continue
  if (typeof harga !== 'number' || !(harga > 0)) continue
  if (!satRaw) {
    dilewati.push({ baris: i + 1, nama: nama.slice(0, 60), alasan: 'tanpa satuan' })
    continue
  }
  const unit = unitOf(satRaw)
  if (!unit) {
    dilewati.push({ baris: i + 1, nama: nama.slice(0, 60), satuan: satRaw, alasan: 'satuan tak dikenal' })
    continue
  }
  hasil.push({
    baris: i + 1,
    kode: kode || null,        // dibawa bila ada, TIDAK pernah jadi syarat
    nama, unit_code: unit, satuan_asli: satRaw,
    amount: harga, category: kategori,
  })
}

// Nama ganda: ambil yang terakhir, catat bila harganya berbeda.
const perNama = new Map()
const ganda = []
for (const h of hasil) {
  const k = `${h.category}|${h.nama.toLowerCase()}`
  const lama = perNama.get(k)
  if (lama && lama.amount !== h.amount) {
    ganda.push({ nama: h.nama, harga_lama: lama.amount, harga_dipakai: h.amount })
  }
  perNama.set(k, h)
}

const perKategori = {}
for (const h of perNama.values()) perKategori[h.category] = (perKategori[h.category] ?? 0) + 1

const dataset = {
  meta: {
    source_file: 'AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm',
    source_sha256: sha,
    source_sheet: 'Upah Bahan',
    source_kind: 'national (harga ACUAN SE-47; catatan workbook: "diubah sesuai harga daerah masing-masing")',
    extractor: 'apps/api/scripts/extract-harga-se47.mjs',
    catatan_kode:
      'Kolom kode SERING KOSONG (3.325 dari 3.381 baris). Extractor sengaja ' +
      'TIDAK mensyaratkan kode — kriterianya nama + satuan + harga. Versi awal ' +
      'yang mensyaratkan kode hanya menemukan 55 baris dari ~3.300.',
    counts: {
      terbaca: hasil.length,
      unik: perNama.size,
      per_kategori: perKategori,
      dilewati: dilewati.length,
      nama_ganda_beda_harga: ganda.length,
    },
  },
  prices: [...perNama.values()].sort((a, b) =>
    a.category.localeCompare(b.category) || a.nama.localeCompare(b.nama)),
  skipped: dilewati,
  duplicates: ganda,
}

writeFileSync(OUT, JSON.stringify(dataset, null, 2))
console.log(`ditulis: ${OUT}`)
console.log(`  terbaca : ${hasil.length}`)
console.log(`  unik    : ${perNama.size}`)
console.log(`  kategori: ${JSON.stringify(perKategori)}`)
console.log(`  dilewati: ${dilewati.length}`)
console.log(`  nama ganda beda harga: ${ganda.length}`)
const satuanTakKenal = {}
for (const s of dilewati) if (s.satuan) satuanTakKenal[s.satuan] = (satuanTakKenal[s.satuan] ?? 0) + 1
if (Object.keys(satuanTakKenal).length) {
  console.log('\n  ⚠ satuan tak dikenal:')
  Object.entries(satuanTakKenal).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([k, v]) => console.log(`     ${String(v).padStart(4)}  "${k}"`))
}
