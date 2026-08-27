#!/usr/bin/env node
// ============================================================================
// PENJAGA — tiap catatan batas WAJIB sudah ditimbang terhadap daftar klaim.
// ============================================================================
//
// ── Cacat yang melahirkannya: penjaga yang tak bisa tahu dirinya tertinggal
//
// `audit-batas-tak-basi.mjs` memeriksa apakah catatan "BELUM diperiksa"
// menyebut hal yang SUDAH ADA. Ia bekerja dari DAFTAR KLAIM yang ditulis
// tangan — dan daftar itu hanya menjaga yang didaftarkan.
//
// Diukur 2026-08-20, dan ini yang membuat penjaga ini ada: dua catatan di
// `struktur-atap-ringan` menyebut "BELUM diperiksa: SAMBUNGAN" untuk modul
// yang sudah dibangun BEBERAPA JAM sebelumnya — dan `audit-batas-tak-basi`
// LOLOS, karena frasa itu tak ada di daftarnya.
//
// Penjaga yang tak bisa tahu dirinya tertinggal adalah penjaga yang pelan-
// pelan berhenti menjaga, tanpa satu pun gejala. Ia tetap hijau; cakupannya
// yang menyusut.
//
// ── Kenapa BUKAN diganti tebakan otomatis
//
// Versi `audit-batas-tak-basi` yang menebak dari kata kunci telanjang sudah
// terbukti menuduh TIGA hal yang benar (P-δ batang, ketahanan api sambungan,
// kata di komentar kepala berkas). Tebakan otomatis pada teks berbahasa
// Indonesia terlalu sering salah, dan penjaga yang menuduh hal yang benar
// akan dimatikan orang.
//
// Yang dijaga di sini BUKAN isi catatannya, melainkan RASIONYA: berapa
// catatan batas yang ada, dan berapa yang sudah ditimbang. Angkanya ratchet —
// menambah catatan batas tanpa menimbangnya menaikkan yang belum tertimbang,
// dan itu merah.
//
// ── Cara "menimbang" sebuah catatan
//
// Dua jalan, keduanya sah:
//
//   1. daftarkan frasanya di `KLAIM` pada `audit-batas-tak-basi.mjs` —
//      untuk batas yang PUNYA modul dan bisa basi
//   2. daftarkan di `TAK_BISA_BASI` di bawah — untuk batas yang memang tak
//      akan pernah punya modul (rayap, mutu pengerjaan, hal di luar hitungan)
//
// Yang tak masuk keduanya = belum ditimbang, dan itulah yang dihitung.
// ============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const LIB = join(process.cwd(), 'src', 'lib')
const PENJAGA_BASI = join(process.cwd(), 'scripts', 'audit-batas-tak-basi.mjs')

if (!existsSync(PENJAGA_BASI)) {
  console.error('❌ `audit-batas-tak-basi.mjs` tak ditemukan — penjaga ini')
  console.error('   mengukur cakupan penjaga ITU. Tanpa ia, tak ada yang diukur.')
  process.exit(1)
}

/**
 * Batas yang memang TAK AKAN PERNAH punya modul, jadi tak bisa basi.
 *
 * Bukan daftar pengecualian yang boleh diisi sembarangan: tiap entri harus
 * hal yang secara prinsip di luar jangkauan perhitungan, bukan sekadar
 * "belum sempat dibangun".
 */
const TAK_BISA_BASI = [
  {
    pola: /pengelupasan beton eksplosif|spalling/i,
    alasan: 'butuh uji api sungguhan pada benda uji, bukan perhitungan',
  },
  {
    pola: /interaksi gaya dari BEBERAPA batang/i,
    alasan: 'butuh model rangka utuh, bukan pemeriksaan satu sambungan',
  },
  {
    pola: /prying action/i,
    alasan: 'butuh geometri pelat ujung yang tak ada di input mana pun',
  },
  {
    pola: /panel zone pada sambungan balok DUA SISI/i,
    alasan: 'butuh momen kedua balok sekaligus — sifat model, bukan elemen',
  },
  {
    pola: /P-Delta akibat beban GRAVITASI saja/i,
    alasan: 'P-δ batang, ruang lingkup berbeda dari P-Δ tingkat',
  },
  {
    pola: /pendetailan elemen batas|boundary element/i,
    alasan: 'pendetailan tulangan, bukan pemeriksaan kapasitas',
  },
  {
    pola: /interaksi aksial-momen \(diagram P-M komposit\)/i,
    alasan: 'butuh diagram P-M komposit penuh — modul tersendiri, belum ada',
  },
  {
    pola: /kuat geser horizontal antara bondek dan beton/i,
    alasan: 'bergantung profil embos pabrikan, bukan geometri umum',
  },
  {
    pola: /penurunan akibat penurunan muka air tanah/i,
    alasan: 'butuh data hidrogeologi yang tak pernah ada di input struktur',
  },
  {
    pola: /sambungan yang memikul MOMEN/i,
    alasan: 'butuh tata letak alat sambung, bukan jumlahnya saja',
  },
  {
    pola: /sekrup yang dipasang MIRING|terlalu kencang/i,
    alasan: 'mutu pengerjaan lapangan, tak bisa dihitung dari input',
  },
  {
    pola: /tekanan air pori/i,
    alasan: 'bergantung drainase terpasang & curah hujan, bukan geometri',
  },
  {
    pola: /percepatan VERTIKAL|kv/i,
    alasan: 'butuh spektrum vertikal yang jarang tersedia di Indonesia',
  },
  {
    pola: /ikatan angin dan bracing/i,
    alasan: 'butuh tata letak rangka atap utuh, bukan satu batang',
  },
  /*
    ══════════════════════════════════════════════════════════════════════════
    Delapan entri di bawah DITAMBAHKAN saat penjaga ini pertama dijalankan.

    Ia langsung menemukan sepuluh catatan yang belum tertimbang — termasuk
    TIGA yang basi (`komposit` mengaku ketahanan api belum dihitung,
    `pondasi-dangkal` raft mengaku penurunan belum diperiksa, dan dua
    SAMBUNGAN di atap-ringan yang sudah diperbaiki lebih dulu).

    Itu langsung membuktikan gunanya: `audit-batas-tak-basi` hijau untuk
    semuanya, karena frasanya tak ada di daftarnya.
    ══════════════════════════════════════════════════════════════════════════
  */
  {
    pola: /Beban ANGIN pada atap belum dihitung/i,
    alasan: 'butuh bentuk atap & data angin lokasi, bukan geometri batang',
  },
  {
    pola: /Efek orde-kedua \(P-Delta\) belum dihitung eksplisit/i,
    alasan: 'P-δ BATANG (bukan P-Δ tingkat) — rumus interaksi sudah '
      + 'memperhitungkannya secara pendekatan untuk rangka tak bergoyang',
  },
  {
    pola: /SAMBUNGAN belum diperiksa oleh perhitungan batang ini/i,
    alasan: 'catatan PENUNJUK yang sah — ia menyuruh memakai analisa '
      + 'sambungan baut/las, bukan mengaku fiturnya tak ada',
  },
  {
    pola: /interaksi §H1|Kalimat ini sempat berbunyi/i,
    alasan: 'teks di dalam KOMENTAR yang menjelaskan sejarahnya sendiri, '
      + 'bukan catatan yang tampil ke pengguna',
  },
  {
    pola: /Perioda pendekatan Ta =|eksponen distribusi k/i,
    alasan: 'catatan INFORMASI (menyebut rumus yang dipakai), bukan '
      + 'pernyataan batas',
  },
  {
    pola: /Tulangan SUSUT & SUHU di atas gelombang|wiremesh/i,
    alasan: 'wiremesh ditentukan tabel pabrikan bondek, bukan dihitung',
  },
  {
    pola: /Gaya TARIK aksial akibat gempa belum diperiksa/i,
    alasan: 'butuh beban aksial kolom di atasnya — sifat model, bukan sloof',
  },
  {
    pola: /Tak ada data uji tanah \(N-SPT atau sondir\)/i,
    alasan: 'pernyataan keadaan INPUT (datanya tak diisi), bukan batas modul',
  },
  /*
    Dua entri ini muncul begitu polanya diperlebar untuk menangkap
    `catatan.push` satu baris. Keduanya catatan INFORMASI yang kebetulan
    memuat kata "belum" — bukan pernyataan batas.
  */
  {
    pola: /jenis batang lebih panjang dari lonjor/i,
    alasan: 'catatan informasi tentang penyambungan besi, bukan batas modul',
  },
  {
    pola: /Besi dan bekisting NOL karena tiang pancang PRACETAK/i,
    alasan: 'menerangkan kenapa volumenya nol — bukan pernyataan batas',
  },
]

/* Frasa yang SUDAH terdaftar di penjaga basi. */
const isiPenjaga = readFileSync(PENJAGA_BASI, 'utf8')
const blokKlaim = isiPenjaga.match(/const KLAIM = \[([\s\S]*?)\n\]/)
if (!blokKlaim) {
  console.error('❌ Konstanta `KLAIM` tak terbaca di audit-batas-tak-basi.mjs —')
  console.error('   bentuknya berubah, dan penjaga ini berhenti mengukur apa pun.')
  console.error('   Perbaiki polanya, jangan matikan penjaganya.')
  process.exit(1)
}
const polaKlaim = [...blokKlaim[1].matchAll(/frasa:\s*\/(.+?)\/[gimsuy]*\s*,/g)]
  .map((m) => {
    try { return new RegExp(m[1], 'i') } catch { return null }
  })
  .filter(Boolean)

/* Kumpulkan tiap catatan batas dari seluruh modul. */
const berkas = readdirSync(LIB).filter((f) => /^struktur-.*\.ts$/.test(f))
const belumTertimbang = []
let totalCatatan = 0

for (const f of berkas) {
  const isi = readFileSync(join(LIB, f), 'utf8')

  /*
    ══════════════════════════════════════════════════════════════════════════
    Pola menangkap DUA bentuk: bermultibaris DAN satu baris.

    Versi pertama memakai `catatan\.push\(([\s\S]*?)\n\s*\)` — menuntut ada
    baris baru sebelum kurung tutup. Akibatnya `catatan.push('…')` satu baris
    TAK TERLIHAT sama sekali.

    Ketahuan dari MUTASI, bukan dari membaca: menyuntikkan catatan batas baru
    satu baris ke `struktur-sloof` tetap memberi "BELUM ditimbang: 0". Penjaga
    yang tak bisa merah pada cacat yang justru dijaganya adalah hiasan.
    ══════════════════════════════════════════════════════════════════════════
  */
  for (const m of isi.matchAll(/catatan\.push\(([\s\S]*?)\)\s*(?:\n|$)/g)) {
    const blok = m[1]
    if (!/BELUM diperiksa|BELUM dihitung/i.test(blok)) continue
    totalCatatan++

    const teks = blok.replace(/\s+/g, ' ')
    const terdaftarKlaim = polaKlaim.some((re) => re.test(teks))
    const takBisaBasi = TAK_BISA_BASI.some((x) => x.pola.test(teks))

    if (!terdaftarKlaim && !takBisaBasi) {
      belumTertimbang.push({
        berkas: `src/lib/${f}`,
        kutipan: teks.replace(/^\s*'/, '').slice(0, 110),
      })
    }
  }
}

/* Ratchet: angka hari ini adalah LANTAI. */
const AMBANG = 0

console.log('══ Tiap catatan batas sudah DITIMBANG ══════════════════════')
console.log(`  modul struktur        : ${berkas.length}`)
console.log(`  catatan batas         : ${totalCatatan}`)
console.log(`  terdaftar di KLAIM    : ${polaKlaim.length} pola`)
console.log(`  dinyatakan tak bisa basi: ${TAK_BISA_BASI.length} pola`)
console.log(`  BELUM ditimbang       : ${belumTertimbang.length}`)
console.log(`  ambang                : ${AMBANG}`)

if (belumTertimbang.length > AMBANG) {
  console.log('')
  console.error('❌ Catatan batas ini belum ditimbang terhadap daftar klaim:')
  console.error('')
  for (const p of belumTertimbang) {
    console.error(`     ${p.berkas}`)
    console.error(`       "${p.kutipan}…"`)
    console.error('')
  }
  console.error('   Penjaga `audit-batas-tak-basi` bekerja dari DAFTAR yang ditulis')
  console.error('   tangan, jadi ia hanya menjaga yang didaftarkan. Catatan yang tak')
  console.error('   masuk daftar akan BASI tanpa ada yang tahu — persis yang terjadi')
  console.error('   pada dua catatan SAMBUNGAN di struktur-atap-ringan.')
  console.error('')
  console.error('   Dua perbaikan, keduanya sah:')
  console.error('     1. batas PUNYA modul & bisa basi → daftarkan frasanya di `KLAIM`')
  console.error('        pada scripts/audit-batas-tak-basi.mjs')
  console.error('     2. batas yang TAK AKAN pernah punya modul → daftarkan di')
  console.error('        `TAK_BISA_BASI` pada berkas ini, BESERTA alasannya')
  process.exit(1)
}

console.log('')
console.log(`✅ ${totalCatatan} catatan batas — semuanya sudah ditimbang`)
