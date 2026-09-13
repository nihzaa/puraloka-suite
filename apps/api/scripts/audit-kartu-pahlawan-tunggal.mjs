#!/usr/bin/env node
/**
 * PENJAGA — SATU kartu pahlawan per layar, dan angka pahlawan lewat
 * komponennya, bukan digambar ulang tiap layar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026` §3d menulis aturannya, dan menyebutnya sendiri sebagai
 * yang **paling mudah dilanggar**:
 *
 *   > "Satu aksen per layar. Kalau tiga hal berwarna indigo, tak ada yang
 *   >  menonjol — dan halaman kembali monoton dengan warna yang berbeda."
 *
 * Aturan yang cuma tertulis di dokumen akan dilanggar oleh orang yang tak
 * pernah membaca dokumen itu — termasuk saya, enam bulan dari sekarang.
 *
 * ── Kenapa ditulis SEBELUM sembilan layar dipindahkan, bukan sesudah
 *
 * Penjaga yang lahir sesudah pekerjaannya selesai hanya MENGESAHKAN apa pun
 * yang sempat ditulis. Yang ini ditulis lebih dulu supaya ia sempat menolak
 * pekerjaan saya sendiri.
 *
 * ── Yang diperiksa
 *
 *   1. Tiap layar memakai `<KartuPahlawan` PALING BANYAK sekali.
 *   2. Angka sebesar `HURUF.displayBesar` hanya boleh lahir di dalam
 *      komponen itu — layar yang menuliskannya sendiri melewati seluruh
 *      penjagaan kontras, nada, dan pembungkusan angka yang sudah dibayar
 *      mahal (JOURNAL 2026-09-12: "Rp 1.200.00" lalu "0").
 *
 * ⚠ `HURUF.display` (38) TIDAK dilarang. Ia tingkat di bawahnya dan masih
 * sah dipakai layar langsung — yang dijaga cuma tingkat PAHLAWAN. Melarang
 * keduanya akan memerahkan layar yang sudah benar, dan penjaga yang merah
 * atas hal benar akan diabaikan seluruh keluarannya (CLAUDE.md §6).
 *
 * ⚠ BATAS: yang dibaca KEPUTUSAN DI KODE. Apakah kartunya benar-benar
 * menonjol di layar tak terukur dari sini — itu hanya ketahuan dari
 * MEMOTRET (CLAUDE.md §8a.3), dan potret itulah yang menemukan panah NAIK
 * di sebelah kerugian Rp 97 juta pada jalan pertama komponen ini.
 *
 * Ambang NOL.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const APP = join(AKAR, 'apps', 'mobile', 'app')
const KOMPONEN = join(AKAR, 'apps', 'mobile', 'components', 'ui', 'KartuPahlawan.tsx')

if (!existsSync(APP)) {
  console.log('⏭  kartu pahlawan tunggal: DILEWATI (apps/mobile/app tak ada)')
  process.exit(0)
}

/** ⚠ CR dibuang lebih dulu — CLAUDE.md §7a. */
const baca = (p) => readFileSync(p, 'utf8').replace(/\r/g, '')

/**
 * Buang komentar, pertahankan nomor baris.
 *
 * Komponen ini MENERANGKAN aturannya panjang-lebar di kepalanya, dan
 * penjelasan itu menyebut `displayBesar` berkali-kali. Memindai teks mentah
 * akan menghitung penjelasan sebagai pelanggaran — bentuk cacat yang sudah
 * tercatat di CLAUDE.md §8a.2.
 */
function tanpaKomentar(isi) {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (b) => ' '.repeat(b.length))
}

function berkasTsx(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama)
    if (statSync(p).isDirectory()) berkasTsx(p, keluar)
    else if (nama.endsWith('.tsx')) keluar.push(p)
  }
  return keluar
}

const semua = berkasTsx(APP)

/*
  Korpus kosong bukan bukti apa pun — pola yang meleset memulangkan nol
  temuan, dan nol terbaca seperti "semuanya benar".
*/
if (semua.length < 10) {
  console.error(`❌ Cuma ${semua.length} berkas tsx terbaca — polanya meleset.`)
  process.exit(1)
}

const ganda = []
const displayLiar = []
let pemakai = 0

for (const p of semua) {
  const nama = relative(AKAR, p).replace(/\\/g, '/')
  const kode = tanpaKomentar(baca(p))

  const n = (kode.match(/<KartuPahlawan[\s/>]/g) || []).length
  if (n > 0) pemakai += 1
  if (n > 1) ganda.push({ nama, n })

  /*
    `displayBesar` di LUAR komponennya. Layar yang menggambar angka 48px
    sendiri melewati `numberOfLines`, `adjustsFontSizeToFit`, pemilihan
    warna nada, dan seluruh pengukuran kontras yang sudah dibayar.
  */
  if (/HURUF\.displayBesar/.test(kode)) {
    displayLiar.push(nama)
  }
}

console.log('── kartu pahlawan tunggal ──')
console.log(`  berkas tsx dipindai  : ${semua.length}`)
console.log(`  layar memakai kartu  : ${pemakai}`)
console.log(`  memakai LEBIH dari 1 : ${ganda.length}`)
console.log(`  displayBesar di layar: ${displayLiar.length}`)

/*
  Komponennya sendiri WAJIB ada. Tanpa pemeriksaan ini, menghapus
  `KartuPahlawan.tsx` membuat penjaga ini HIJAU — nol pemakaian, nol
  pelanggaran — sambil menghapus seluruh hal yang dijaganya.
*/
if (!existsSync(KOMPONEN)) {
  console.error('\n❌ `components/ui/KartuPahlawan.tsx` TAK ADA.')
  console.error('   Nol pelanggaran di sini bukan bukti apa-apa kalau subjeknya hilang.')
  process.exit(1)
}

const masalah = []

for (const g of ganda) {
  masalah.push(
    `${g.nama}: ${g.n} kartu pahlawan dalam SATU layar.\n` +
      `      Kalau dua hal jadi pahlawan, tak ada yang memimpin — dan layar\n` +
      `      kembali monoton, hanya dengan warna yang berbeda (ARAH-VISUAL §3d).`,
  )
}

for (const d of displayLiar) {
  masalah.push(
    `${d}: memakai HURUF.displayBesar di LUAR <KartuPahlawan>.\n` +
      `      Angka 48px yang digambar sendiri melewati numberOfLines,\n` +
      `      adjustsFontSizeToFit, pemilihan warna nada, dan pengukuran\n` +
      `      kontras di permukaan gelap. Ketiganya sudah dibayar mahal —\n` +
      `      "Rp 1.200.00" lalu "0" (JOURNAL 2026-09-12).`,
  )
}

if (masalah.length > 0) {
  console.error(`\n❌ ${masalah.length} pelanggaran:`)
  for (const m of masalah) console.error(`   • ${m}`)
  process.exit(1)
}

console.log('\n✅ tiap layar paling banyak satu kartu pahlawan; nol displayBesar liar.')
