#!/usr/bin/env node
// ============================================================
// EKSTRAK harga satuan dari SHEET ANALISA workbook SE-47.
//
// Pendamping `extract-harga-analisa-cibuluh.mjs`, untuk sumber nasional.
//
// ── Kenapa perlu
//
// `extract-harga-se47.mjs` membaca sheet daftar harga `Upah Bahan`. Tapi
// sebagian resource yang dipakai analisa TAK ADA di sana — harganya hanya
// tertulis di dalam baris analisa (37 sheet pekerjaan). Contoh:
// `Pemasangan Plesteran 1 SP : 4 PP Tebal 15 mm` = Rp 56.784,20/m², hanya
// muncul di sheet `Drainase`, dan ia memblokir 12 analisa dari perhitungan HSP.
//
// ── Struktur BERBEDA dari workbook Cibuluh
//
// SE-47:    B=URAIAN  D=SATUAN  E=KOEFISIEN  F=HARGA  G=JUMLAH
// Cibuluh:  B=URAIAN  C=SAT     D=INDEKS     E=HARGA  F/G=JUMLAH
//
// Kolom C kosong di SE-47. Perbedaan satu kolom ini yang membuat ekstraktor
// tak bisa dipakai bergantian — dan kalau dipaksa, kolom KOEFISIEN akan terbaca
// sebagai harga. Karena itu tata kolomnya diverifikasi dari isi baris, bukan
// diasumsikan sama.
//
// ── Aturan yang sama dengan ekstraktor Cibuluh
//
//   • kunci = nama + SATUAN (nama sama dengan satuan beda = dua harga sah)
//   • harga DOMINAN >=8x lebih sering menang, dengan jejak apa yang dikalahkan
//   • sisanya masuk `conflicts` — tidak ditebak, tidak dirata-rata
//
// Jalankan: node apps/api/scripts/extract-harga-analisa-se47.mjs
// Keluaran: db/seeds/harga-analisa-se47-dataset.json
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUMBER = resolve(__dirname, '..', '..', '..', '_source', 'ahsp',
  'AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm')
const KELUARAN = resolve(__dirname, '..', '..', '..', 'db', 'seeds',
  'harga-analisa-se47-dataset.json')

/** Sheet yang BUKAN analisa — daftar harga, rekap, cover. */
const BUKAN_ANALISA = new Set([
  'Upah Bahan', 'Cover', 'Daftar Isi', 'Rekap', 'REKAP',
  'Daftar Harga Satuan Pekerjaan',
])

const SATUAN = new Map(Object.entries({
  kg: 'kg', m3: 'm3', 'm³': 'm3', m2: 'm2', 'm²': 'm2', m1: 'm1', m: 'm1', "m'": 'm1',
  bh: 'buah', buah: 'buah', pcs: 'buah', btg: 'batang', batang: 'batang',
  lbr: 'lembar', lembar: 'lembar', oh: 'OH', oj: 'OJ', ls: 'ls', lot: 'lot',
  set: 'set', unit: 'unit', lt: 'liter', liter: 'liter', ltr: 'liter',
  titik: 'titik', ttk: 'titik', ps: 'pasang', pasang: 'pasang',
  zak: 'sak', sak: 'sak', dus: 'dus', dos: 'dus', roll: 'rol', rol: 'rol',
  hari: 'hari', jam: 'jam', ton: 'ton', cm: 'cm', ikat: 'ikat',
  'buah hari': 'buah_hari', buah_hari: 'buah_hari', tube: 'tube', kaleng: 'kaleng',
}))

const AMBANG_DOMINAN = 8
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const buf = readFileSync(SUMBER)
const sha = createHash('sha256').update(buf).digest('hex')
const wb = XLSX.read(buf, { type: 'buffer' })

const kumpulan = new Map()
const dilewati = []
const sheetDibaca = []

for (const namaSheet of wb.SheetNames) {
  if (BUKAN_ANALISA.has(namaSheet)) continue
  const ws = wb.Sheets[namaSheet]
  if (!ws) continue

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  let terbacaDiSheet = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const [, nama, , satuan, koef, harga] = r   // B, (C kosong), D, E, F

    if (typeof nama !== 'string' || nama.trim().length < 3) continue
    if (typeof koef !== 'number' || typeof harga !== 'number') continue
    if (!(harga > 0)) continue

    // Baris rekap ("JUMLAH HARGA …", "Jumlah (A+B+C)") tak pernah punya satuan
    // DAN koefisien sekaligus, jadi sudah tersaring oleh syarat di atas. Tapi
    // dijaga eksplisit supaya perubahan format tak diam-diam meloloskannya.
    if (/^(jumlah|total|sub\s*total)\b/i.test(nama.trim())) continue

    const satAsli = String(satuan ?? '').trim()
    const unit = SATUAN.get(satAsli.toLowerCase())
    if (!unit) {
      if (satAsli) {
        dilewati.push({ sheet: namaSheet, baris: i + 1, nama: nama.trim().slice(0, 60),
                        satuan: satAsli, alasan: 'satuan tak dikenal' })
      }
      continue
    }

    const k = `${norm(nama)} ${unit}`
    if (!kumpulan.has(k)) {
      kumpulan.set(k, { nama: nama.trim(), unit_code: unit, satuan_asli: satAsli, nilai: new Map() })
    }
    const e = kumpulan.get(k)
    if (!e.nilai.has(harga)) e.nilai.set(harga, [])
    e.nilai.get(harga).push(`${namaSheet}:${i + 1}`)
    terbacaDiSheet++
  }

  if (terbacaDiSheet > 0) sheetDibaca.push({ sheet: namaSheet, baris_terbaca: terbacaDiSheet })
}

const prices = []
const conflicts = []
for (const e of kumpulan.values()) {
  const urut = [...e.nilai.entries()].sort((a, b) => b[1].length - a[1].length)

  if (urut.length === 1) {
    const [harga, lokasi] = urut[0]
    prices.push({ nama: e.nama, unit_code: e.unit_code, satuan_asli: e.satuan_asli,
                  amount: harga, muncul: lokasi.length, sumber: lokasi[0] })
    continue
  }

  const [teratas, lokTeratas] = urut[0]
  const kedua = urut[1][1].length
  if (lokTeratas.length >= kedua * AMBANG_DOMINAN) {
    prices.push({
      nama: e.nama, unit_code: e.unit_code, satuan_asli: e.satuan_asli,
      amount: teratas, muncul: lokTeratas.length, sumber: lokTeratas[0],
      dominan: {
        dari_total: urut.reduce((s, [, l]) => s + l.length, 0),
        dikalahkan: urut.slice(1).map(([h, l]) => ({ amount: h, muncul: l.length })),
      },
    })
    continue
  }

  conflicts.push({
    nama: e.nama, unit_code: e.unit_code,
    nilai: urut.map(([h, l]) => ({ amount: h, muncul: l.length, contoh: l[0] })),
  })
}

prices.sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
conflicts.sort((a, b) => a.nama.localeCompare(b.nama, 'id'))

writeFileSync(KELUARAN, JSON.stringify({
  meta: {
    source_file: 'AHSP CIPTA KARYA SE BINA KONTRUKSI NO. 47 TAHUN 2026.xlsm',
    source_sha256: sha,
    source_kind: 'national (harga satuan DI DALAM baris analisa)',
    extractor: 'apps/api/scripts/extract-harga-analisa-se47.mjs',
    kolom: 'B=URAIAN D=SATUAN E=KOEFISIEN F=HARGA — BERBEDA dari workbook Cibuluh (B,C,D,E)',
    sheet_dibaca: sheetDibaca.length,
    ambang_dominan: AMBANG_DOMINAN,
    counts: { prices: prices.length, conflicts: conflicts.length, skipped: dilewati.length },
  },
  prices, conflicts, skipped: dilewati,
}, null, 2))

console.log(`✅ ${prices.length} harga tunggal · ${conflicts.length} bentrok · ${dilewati.length} dilewati`)
console.log(`   ${sheetDibaca.length} sheet analisa terbaca · sha256 ${sha.slice(0, 16)}…`)
console.log(`   ditulis: ${KELUARAN}`)
