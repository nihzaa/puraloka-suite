#!/usr/bin/env node
/**
 * PENJAGA: berkas yang MENGHASILKAN dokumen tak boleh memakai `var(--token)`.
 *
 * ── Kenapa
 *
 * `@react-pdf/renderer` bukan peramban — ia tak punya CSSOM, jadi
 * `var(--navy)` tak pernah di-resolve dan nilainya jatuh ke HITAM. Termasuk
 * `backgroundColor`. Hasilnya halaman hitam pekat dengan teks hitam di
 * atasnya: dokumen yang tercipta "berhasil" tapi tak terbaca sama sekali.
 *
 * Ditemukan 2026-08-29 dari invoice yang benar-benar diunduh founder
 * (INV/PRL/2026/016): 33 `var(--…)` di `components/invoice-pdf.tsx`. Yang
 * masih terlihat hanya logo dan QR — keduanya GAMBAR, bukan warna CSS.
 *
 * Tak ada satu pun galat, di peramban maupun konsol. Tak ada test yang merah.
 * Cacat ini hanya bisa dilihat oleh mata yang membuka berkasnya.
 *
 * Berlaku sama untuk generator SVG/XLSX sisi server: apa pun yang keluar dari
 * aplikasi sebagai BERKAS dibaca di luar peramban, tempat token CSS tak ada.
 *
 * Ambang NOL. Jalankan: node apps/web/scripts/audit-pdf-tanpa-var-css.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('../../..', import.meta.url))

/** Berkas dianggap "penghasil dokumen" kalau ia mengimpor pustakanya. */
const PENANDA = [
  '@react-pdf/renderer',
  'jspdf',
  'pdfkit',
  'exceljs',
]

function berkasSumber(dir, hasil = []) {
  let isi
  try { isi = readdirSync(dir) } catch { return hasil }
  for (const nama of isi) {
    if (nama === 'node_modules' || nama === '.next' || nama === 'dist') continue
    const jalur = join(dir, nama)
    if (statSync(jalur).isDirectory()) berkasSumber(jalur, hasil)
    else if (/\.(ts|tsx)$/.test(nama) && !/\.test\.tsx?$/.test(nama)) hasil.push(jalur)
  }
  return hasil
}

const kandidat = [
  ...berkasSumber(join(AKAR, 'apps', 'web', 'components')),
  ...berkasSumber(join(AKAR, 'apps', 'web', 'app')),
  ...berkasSumber(join(AKAR, 'apps', 'api', 'src', 'lib')),
]

const pelanggaran = []
let diperiksa = 0

for (const jalur of kandidat) {
  const isi = readFileSync(jalur, 'utf8')
  if (!PENANDA.some((p) => isi.includes(p))) continue

  /*
    Hanya berkas yang MENDEFINISIKAN dokumennya yang diperiksa — bukan yang
    sekadar memanggil `pdf()` lewat impor malas. Pembeda yang bisa diandalkan:
    berkas dokumen memakai StyleSheet/komponen react-pdf, bukan cuma import.
  */
  const berkasDokumen =
    /StyleSheet\.create|<Document|<Page\b|new jsPDF|new PDFDocument|new ExcelJS/.test(isi)
  if (!berkasDokumen) continue

  diperiksa++

  /*
    Komentar dilewati — penjelasan BOLEH menyebut var(--…), dan justru
    penjelasan itu yang mencegah orang mengulangi cacatnya.

    ⚠ Keadaan blok komentar DILACAK, bukan dicocokkan per baris. Versi pertama
    penjaga ini memakai `/^\s*(\*|\/\/)/` saja lalu MEMERAHKAN komentarnya
    sendiri: baris di tengah blok yang tak diawali `*` tak dikenali sebagai
    komentar. Penjaga yang menuduh dokumentasinya sendiri akan dimatikan
    orang, bukan diperbaiki.
  */
  const baris = isi.split('\n')
  let dalamBlok = false
  for (let i = 0; i < baris.length; i++) {
    const b = baris[i]
    const diKomentar = dalamBlok || /^\s*(\*|\/\/)/.test(b)

    const buka = b.lastIndexOf('/*')
    const tutup = b.lastIndexOf('*/')
    if (buka !== -1 && buka > tutup) dalamBlok = true
    else if (tutup !== -1 && tutup > buka) dalamBlok = false

    if (diKomentar) continue
    if (!b.includes('var(--')) continue
    pelanggaran.push({ jalur: relative(AKAR, jalur), baris: i + 1, isi: b.trim().slice(0, 110) })
  }
}

console.log('══ PENJAGA: dokumen tanpa var(--token) ' + '═'.repeat(32))
console.log(`  berkas penghasil dokumen : ${diperiksa}`)
console.log(`  pemakaian var(--…)       : ${pelanggaran.length} (ambang 0)`)

if (diperiksa === 0) {
  console.error(
    '\n❌ NOL berkas penghasil dokumen ditemukan — penjaga ini tak menjaga apa pun.\n' +
    '   Kalau pustakanya diganti, perbarui PENANDA di berkas ini.'
  )
  process.exit(1)
}

if (pelanggaran.length === 0) {
  console.log('\n✅ Nol token CSS di berkas penghasil dokumen.')
  process.exit(0)
}

console.error('\n❌ Token CSS di berkas yang menghasilkan BERKAS:\n')
for (const p of pelanggaran) console.error(`   ${p.jalur}:${p.baris}\n      ${p.isi}`)
console.error(
  '\n   Pustaka PDF/XLSX tak punya CSSOM: `var(--x)` jatuh ke HITAM, termasuk\n' +
  '   backgroundColor — dokumennya jadi hitam pekat dan tak terbaca, TANPA GALAT.\n' +
  '   Pakai nilai hex literal (palet mode TERANG — dokumen dicetak di kertas putih).'
)
process.exit(1)
