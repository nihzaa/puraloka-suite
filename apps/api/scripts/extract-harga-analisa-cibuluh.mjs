#!/usr/bin/env node
// ============================================================
// EKSTRAK harga satuan dari SHEET ANALISA workbook Cibuluh.
//
// ── Kenapa ekstraktor kedua, padahal sudah ada extract-harga-cibuluh.mjs
//
// Ekstraktor pertama membaca sheet daftar harga (`HS.UPAH`, `HS.BAHAN`) dan
// menghasilkan 710 entri. Tapi 110 resource yang dipakai analisa perusahaan TAK
// ADA di dua sheet itu — harganya hanya tertulis di dalam baris analisa, di
// kolom "HARGA" yang berdampingan dengan indeks/koefisien.
//
// Akibatnya 183 dari 423 analisa perusahaan tak bisa dihitung HSP-nya, dan
// penyebabnya tak terlihat: harganya ADA di file, hanya tidak di tempat yang
// dibaca.
//
// ── Struktur yang dipakai (dibaca dari header, bukan ditebak)
//
// Seluruh sheet analisa memakai tata kolom yang sama, berlabel eksplisit di
// baris header:
//
//     B = URAIAN   C = SAT   D = INDEKS   E = HARGA   F/G = JUMLAH bahan/upah
//
// Harga satuan SELALU kolom E. Ini penting: percobaan pertama membaca dengan
// pola longgar "nama, satuan, angka, angka" dan ikut menangkap kolom F (jumlah
// = indeks x harga) sebagai harga — menghasilkan 123 nama dengan harga saling
// bertentangan (Semen Portland "Rp 1.450 dan Rp 115.000").
//
// ── Sheet `hsp` SENGAJA DIKECUALIKAN
//
// Ia memuat item yang sama dengan harga BERBEDA (Dolken kayu: 9.500 vs 35.000
// di ANALISA STANDAR). Entah versi lama atau skenario lain — yang jelas
// mencampurnya membuat harga mana yang benar tak bisa ditentukan. Dikecualikan
// dengan alasan tertulis, bukan dibiarkan menang-menangan urutan baca.
//
// ── Fail-loud terhadap konflik
//
// Nama yang menghasilkan LEBIH DARI SATU harga tidak ditebak dan tidak
// dirata-rata: ia masuk `conflicts` beserta seluruh nilai + lokasinya, dan
// TIDAK ikut ke `prices`. Menebak harga bahan berarti menyebarkan angka salah
// ke seluruh analisa yang memakainya.
//
// Jalankan: node apps/api/scripts/extract-harga-analisa-cibuluh.mjs
// Keluaran: db/seeds/harga-analisa-cibuluh-dataset.json
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUMBER = resolve(__dirname, '..', '..', '..', '_source', 'ahsp', 'golden',
  'RAB Gudang Cibuluh Sumedang bobot.xlsx')
const KELUARAN = resolve(__dirname, '..', '..', '..', 'db', 'seeds',
  'harga-analisa-cibuluh-dataset.json')

/** Sheet analisa yang dibaca. `hsp` sengaja di luar — lihat catatan di atas. */
const SHEET = ['ANALISA STANDAR', 'ANALISA BETON', 'ANALISA LISTRIK', 'ANALBONGKAR']

/** Satuan yang dikenal. Di luar ini dilaporkan, tidak ditebak. */
const SATUAN = new Map(Object.entries({
  kg: 'kg', m3: 'm3', 'm³': 'm3', m2: 'm2', 'm²': 'm2', m1: 'm1', m: 'm1',
  bh: 'buah', buah: 'buah', btg: 'batang', batang: 'batang', lbr: 'lembar',
  lembar: 'lembar', oh: 'OH', oj: 'OJ', ls: 'ls', set: 'set', unit: 'unit',
  lt: 'liter', liter: 'liter', ttk: 'titik', titik: 'titik', ps: 'pasang',
  pasang: 'pasang', zak: 'zak', sak: 'sak', dus: 'dus', roll: 'roll',
  hari: 'hari', jam: 'jam', ton: 'ton', cm: 'cm', pcs: 'buah',
}))

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

function bacaHeader(rows) {
  // Cari baris yang memuat 'URAIAN' — di situ tata kolomnya dinyatakan sendiri
  // oleh workbook, jadi tak perlu diasumsikan.
  const i = rows.findIndex((r) => r.some((x) => String(x ?? '').toUpperCase().includes('URAIAN')))
  if (i < 0) return null
  const punyaHarga = rows[i].some((x) => String(x ?? '').toUpperCase().trim() === 'HARGA')
  return { barisHeader: i, punyaHarga }
}

const wbBuf = readFileSync(SUMBER)
const sha = createHash('sha256').update(wbBuf).digest('hex')
const wb = XLSX.read(wbBuf, { type: 'buffer' })

/** nama-ternormalisasi → { nama, unit_code, satuan_asli, nilai: Map(harga → [lokasi]) } */
const kumpulan = new Map()
const dilewati = []
const sheetDibaca = []

for (const namaSheet of SHEET) {
  const ws = wb.Sheets[namaSheet]
  if (!ws) { dilewati.push({ sheet: namaSheet, alasan: 'sheet tidak ada di workbook' }); continue }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const h = bacaHeader(rows)
  if (!h) { dilewati.push({ sheet: namaSheet, alasan: 'baris header URAIAN tidak ditemukan' }); continue }
  if (!h.punyaHarga) {
    // Tanpa kolom HARGA berlabel, kolom E belum tentu harga satuan.
    dilewati.push({ sheet: namaSheet, alasan: 'header tidak memuat kolom HARGA — struktur berbeda' })
    continue
  }
  sheetDibaca.push({ sheet: namaSheet, baris_header: h.barisHeader + 1 })

  for (let i = h.barisHeader + 1; i < rows.length; i++) {
    const r = rows[i]
    const [, nama, satuan, indeks, harga] = r   // B, C, D, E

    if (typeof nama !== 'string' || nama.trim().length < 3) continue
    if (typeof indeks !== 'number' || typeof harga !== 'number') continue
    if (!(harga > 0)) continue

    const satAsli = String(satuan ?? '').trim()
    const unit = SATUAN.get(satAsli.toLowerCase())
    if (!unit) {
      dilewati.push({ sheet: namaSheet, baris: i + 1, nama: nama.trim(), satuan: satAsli,
                      alasan: 'satuan tak dikenal' })
      continue
    }

    const k = norm(nama)
    if (!kumpulan.has(k)) {
      kumpulan.set(k, { nama: nama.trim(), unit_code: unit, satuan_asli: satAsli, nilai: new Map() })
    }
    const e = kumpulan.get(k)
    if (!e.nilai.has(harga)) e.nilai.set(harga, [])
    e.nilai.get(harga).push(`${namaSheet}:${i + 1}`)
  }
}

// Pisahkan yang tunggal (dipakai) dari yang bentrok (dilaporkan, TIDAK dipakai).
const prices = []
const conflicts = []
for (const e of kumpulan.values()) {
  if (e.nilai.size === 1) {
    const [harga, lokasi] = [...e.nilai.entries()][0]
    prices.push({
      nama: e.nama, unit_code: e.unit_code, satuan_asli: e.satuan_asli,
      amount: harga, muncul: lokasi.length, sumber: lokasi[0],
    })
  } else {
    conflicts.push({
      nama: e.nama, unit_code: e.unit_code,
      nilai: [...e.nilai.entries()].map(([h, l]) => ({ amount: h, muncul: l.length, contoh: l[0] })),
    })
  }
}

prices.sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
conflicts.sort((a, b) => a.nama.localeCompare(b.nama, 'id'))

const hasil = {
  meta: {
    source_file: 'RAB Gudang Cibuluh Sumedang bobot.xlsx',
    source_sha256: sha,
    source_sheets: sheetDibaca,
    source_kind: 'company (harga satuan DI DALAM baris analisa, kolom E)',
    price_context: 'Kabupaten Bandung, workbook Gudang Cibuluh Sumedang',
    extractor: 'apps/api/scripts/extract-harga-analisa-cibuluh.mjs',
    kolom: 'B=URAIAN C=SAT D=INDEKS E=HARGA (dibaca dari header, bukan diasumsikan)',
    sheet_dikecualikan: {
      hsp: 'memuat item sama dengan harga BERBEDA dari sheet analisa (mis. Dolken kayu 9.500 vs 35.000) — mencampurnya membuat harga mana yang benar tak bisa ditentukan',
    },
    counts: { prices: prices.length, conflicts: conflicts.length, skipped: dilewati.length },
  },
  prices,
  conflicts,
  skipped: dilewati,
}

writeFileSync(KELUARAN, JSON.stringify(hasil, null, 2))
console.log(`✅ ${prices.length} harga tunggal · ${conflicts.length} bentrok (TIDAK dipakai) · ${dilewati.length} dilewati`)
console.log(`   sha256 sumber: ${sha}`)
console.log(`   ditulis: ${KELUARAN}`)
if (conflicts.length) {
  console.log('\n   Contoh bentrok (butuh keputusan manusia):')
  conflicts.slice(0, 8).forEach((c) =>
    console.log(`     ${c.nama.slice(0, 38).padEnd(40)} ${c.nilai.map((n) => n.amount).join(' / ')}`))
}
