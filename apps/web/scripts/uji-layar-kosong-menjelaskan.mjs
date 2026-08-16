#!/usr/bin/env node
/**
 * PENJAGA: LAYAR KOSONG WAJIB PUNYA JALAN KELUAR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16 lewat sesi ber-login: tab "Material & RAP" di `/estimasi`
 * merender HALAMAN PUTIH. Bukan pesan "belum ada data" — benar-benar kosong:
 * satu dropdown proyek, lalu ruang putih. Memilih proyek pun tak mengubahnya.
 *
 * Kekosongannya sendiri JUJUR — `rap_budget` memang cuma berisi 1 baris di
 * seluruh basis. Yang mahal adalah kekosongan yang TIDAK MENJELASKAN DIRI:
 * pengguna tak punya cara tahu bahwa RAP dibentuk DARI versi estimasi yang
 * sudah terkunci, jadi layar itu terbaca sebagai "fitur belum jadi" atau
 * "aplikasinya rusak". Padahal endpoint-nya sehat dan menjawab 200.
 *
 * Ini kelas cacat yang berulang di repo ini, dan selalu lolos karena TIDAK
 * ADA GEJALA: nol galat, nol log, nol test merah. Layar kosong tak pernah
 * gagal — ia cuma tak menolong.
 *
 * ── Yang ditegakkan (spec 2026-08-16-cecep-rombak-ui-design §5)
 *
 * Tiap layar yang bisa kosong wajib memuat TIGA hal:
 *
 *     1. APA benda ini   — satu kalimat bahasa lapangan
 *     2. KENAPA kosong   — prasyarat yang belum terpenuhi
 *     3. TOMBOL ke sana  — jalan keluar, bukan jalan buntu
 *
 * Komponen `LayarKosong` sudah membuat ketiganya WAJIB lewat tipe (`apa`,
 * `kenapa`, `aksi` non-opsional). Penjaga ini menutup celah yang tersisa:
 * halaman yang menulis kekosongannya SENDIRI, tanpa memakai komponen itu.
 *
 * ── Cara memeriksa
 *
 * Mencari frasa kekosongan yang ditulis lepas — "Belum ada", "Tidak ada",
 * "belum ada data" — di dalam berkas halaman, lalu memastikan berkas itu juga
 * memakai `LayarKosong`. Kalau sebuah halaman menyatakan dirinya kosong tapi
 * tak pernah memanggil `LayarKosong`, kemungkinan besar itu jalan buntu.
 *
 * ── Kenapa memeriksa SUMBER, bukan peramban
 *
 * Alasan yang sama dengan `uji-judul-halaman-ada.mjs`: CI tak punya sesi
 * ber-login. Penjaga yang butuh kredensial berakhir seperti
 * `audit-a11y-runtime` yang pernah memindai 1 dari 118 halaman lalu keluar 0 —
 * hijau karena tak melihat apa-apa.
 *
 * Konsekuensinya ini PROKSI, dan proksi bisa dikelabui. Ia tak membuktikan
 * empty state-nya bagus; ia membuktikan halaman yang bicara soal kekosongan
 * tidak melakukannya tanpa jalan keluar.
 *
 * ── Kenapa ratchet, bukan ambang NOL
 *
 * Berbeda dari `uji-judul-halaman-ada` yang lantainya nol karena ke-13
 * halamannya diperbaiki di commit yang sama: di sini ada 100+ halaman lama
 * dengan kekosongan tertulis lepas, dan memperbaiki semuanya sekaligus bukan
 * pekerjaan satu commit. Yang dijaga: jumlahnya TIDAK BOLEH NAIK.
 *
 * Turunkan lantainya dengan `--turunkan` setelah memperbaiki halaman.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(__dirname, '..')
const AKAR = join(WEB, 'app', '(dashboard)')
const LANTAI_BERKAS = join(__dirname, '.lantai-layar-kosong.json')

/** Frasa yang menyatakan "di sini sedang kosong". */
const FRASA_KOSONG = [
  /Belum ada\b/,
  /belum ada\b/,
  /Tidak ada\b/,
  /Belum punya\b/,
  /masih kosong\b/,
]

/** Halaman yang memakai ini sudah dijamin tipenya punya `aksi`. */
const KOMPONEN = 'LayarKosong'

/**
 * Buang komentar sebelum memeriksa.
 *
 * Ketahuan saat uji mutasi (2026-08-16): berkas pelanggar yang MENYEBUT
 * `LayarKosong` di komentarnya sendiri lolos, karena pemeriksaannya cuma
 * `isi.includes(KOMPONEN)`. Penjaga yang bisa dipuaskan oleh sebuah komentar
 * bukan penjaga.
 *
 * Ini persis alasan CLAUDE.md §8a.2 mewajibkan mutasi sengaja: tanpa itu,
 * penjaga ini akan di-commit dalam keadaan hijau selamanya dan tak seorang
 * pun tahu ia tak pernah bisa merah.
 */
function tanpaKomentar(isi) {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, '')   // blok  /* … */
    .replace(/^\s*\/\/.*$/gm, '')        // baris //
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX {/* … */}
}

function semuaHalaman(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama)
    if (statSync(p).isDirectory()) semuaHalaman(p, keluar)
    else if (nama === 'page.tsx') keluar.push(p)
  }
  return keluar
}

const halaman = semuaHalaman(AKAR)
const pelanggar = []

for (const p of halaman) {
  const isi = tanpaKomentar(readFileSync(p, 'utf8'))
  const menyatakanKosong = FRASA_KOSONG.some((r) => r.test(isi))
  if (!menyatakanKosong) continue
  if (isi.includes(KOMPONEN)) continue
  pelanggar.push(relative(WEB, p).replace(/\\/g, '/'))
}

const turunkan = process.argv.includes('--turunkan')
let lantai = Number.POSITIVE_INFINITY
try {
  lantai = JSON.parse(readFileSync(LANTAI_BERKAS, 'utf8')).lantai
} catch {
  lantai = pelanggar.length
  writeFileSync(LANTAI_BERKAS, JSON.stringify({ lantai }, null, 2) + '\n')
  console.log(`ℹ  lantai awal ditetapkan: ${lantai}`)
}

if (turunkan) {
  writeFileSync(LANTAI_BERKAS, JSON.stringify({ lantai: pelanggar.length }, null, 2) + '\n')
  console.log(`✅ lantai diturunkan ${lantai} → ${pelanggar.length}`)
  process.exit(0)
}

console.log(`\n══ Layar kosong tanpa jalan keluar ══════════════════════════`)
console.log(`  halaman diperiksa : ${halaman.length}`)
console.log(`  menyatakan kosong tanpa ${KOMPONEN} : ${pelanggar.length}`)
console.log(`  lantai            : ${lantai}`)

if (pelanggar.length > lantai) {
  console.error(`\n❌ NAIK dari ${lantai} → ${pelanggar.length}. Halaman baru yang`)
  console.error(`   menyatakan dirinya kosong wajib memakai <${KOMPONEN}> —`)
  console.error(`   komponen itu menuntut \`apa\`, \`kenapa\`, dan \`aksi\`.\n`)
  for (const p of pelanggar.slice(0, 12)) console.error(`     ${p}`)
  if (pelanggar.length > 12) console.error(`     … dan ${pelanggar.length - 12} lagi`)
  console.error('')
  process.exit(1)
}

if (pelanggar.length < lantai) {
  console.log(`\n✅ TURUN dari ${lantai} → ${pelanggar.length}.`)
  console.log(`   Jalankan \`node scripts/uji-layar-kosong-menjelaskan.mjs --turunkan\``)
  console.log(`   untuk mengunci angka baru.\n`)
  process.exit(0)
}

console.log(`\n✅ tidak bertambah.\n`)
