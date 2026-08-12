#!/usr/bin/env node
/**
 * PENJAGA: ENTRI "RENCANA" DI PETA MODUL TAK BOLEH PUNYA HALAMAN YANG JALAN.
 *
 * ── Cacat yang melahirkan penjaga ini
 *
 * 2026-08-12, founder membuka `/peta-modul` dan bertanya *"masih banyak yang
 * belum dikerjakan, bener?"*. Dari empat kartu berstatus "Direncanakan", TIGA
 * sudah punya halaman yang jalan:
 *
 *     Markup & Margin          → /pengaturan/markup       (selesai hari itu)
 *     Dokumen Prakualifikasi   → /procurement/kualifikasi (selesai 5 hari lalu)
 *     API & Integrasi          → /pengaturan/api-key      (selesai hari itu)
 *
 * Peta Modul adalah SATU-SATUNYA layar yang menjawab "apa yang sudah bisa
 * dipakai". Founder membacanya persis untuk itu, dan mendapat jawaban yang
 * salah tentang pekerjaannya sendiri.
 *
 * ── Kenapa penjaga yang ada tak menangkapnya
 *
 * `audit-taksonomi-vs-kode.mjs` sudah dibuat untuk cacat sekelas ini (CLAUDE.md
 * §8a.4, tujuh sub-menu ditandai merah padahal hidup berbulan-bulan). Ia HIJAU
 * sepanjang waktu — karena ia memeriksa `ERP-KONTRAKTOR-TAKSONOMI-MENU.md`,
 * bukan `peta-menu.ts`.
 *
 * Dua dokumen berbeda, dua sumber kebenaran, satu penjaga.
 *
 * ── Yang diperiksa
 *
 * Tiap entri berstatus `rencana` atau `gerbang` diperiksa: apakah ada halaman
 * Next.js yang cocok dengan `href`-nya? Kalau ADA, entrinya berbohong.
 *
 * Sebaliknya TIDAK diperiksa: entri `hidup` tanpa href sah — banyak modul
 * hidup di dalam tab halaman lain (mis. Price Book di tab Harga halaman
 * Estimasi), dan memaksa tiap entri punya href akan mendorong href karangan.
 *
 * Ambang NOL. Satu entri yang berbohong sudah cukup — itulah yang terjadi.
 *
 * Pakai:  node apps/web/scripts/audit-peta-modul-vs-halaman.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const PETA = join(DIR, '..', 'lib', 'peta-menu.ts')
const APP = join(DIR, '..', 'app')

/** Apakah `href` punya halaman Next.js yang nyata? */
function adaHalaman(href) {
  if (!href || !href.startsWith('/')) return false
  // Buang query & hash — `/laporan?tab=wip` tetap halaman `/laporan`.
  const jalur = href.split(/[?#]/)[0].replace(/\/$/, '')
  if (jalur === '') return existsSync(join(APP, 'page.tsx'))

  const bagian = jalur.split('/').filter(Boolean)

  // Halaman bisa berada di dalam route group `(dashboard)`, `(auth)`, dst.
  // — jadi dicoba dengan dan tanpa prefiks grup.
  const grup = ['', '(dashboard)', '(auth)', '(public)']
  for (const g of grup) {
    const p = join(APP, g, ...bagian, 'page.tsx')
    if (existsSync(p)) return true
  }
  return false
}

const isi = readFileSync(PETA, 'utf8')

// Entri ditulis satu baris per item, tetapi URUTAN MEDANNYA TIDAK SERAGAM:
// dua entri (`crm-eskalasi`, `iv-rekonsiliasi`) menulis `href` SEBELUM
// `status`, sisanya sesudah.
//
// Versi pertama penjaga ini memakai pola berurutan dan membaca 224 dari 226 —
// melewatkan tepat kedua entri itu, dan salah satunya (`iv-rekonsiliasi`)
// justru berstatus `gerbang` dengan halaman yang ADA. Penjaga yang melewatkan
// entri adalah penjaga yang berbohong tentang cakupannya sendiri.
//
// Karena itu: baris diambil utuh, medannya dibaca terpisah tanpa mengandaikan
// urutan. Jumlah yang terbaca diverifikasi terhadap jumlah `key` di bawah.
const barisEntri = isi.split('\n').filter((l) => /^\s*\{ key: '/.test(l))

const berbohong = []
let total = 0
for (const baris of barisEntri) {
  const key = baris.match(/key: '([^']+)'/)?.[1]
  const label = baris.match(/label: '([^']+)'/)?.[1]
  const status = baris.match(/status: '([a-z]+)'/)?.[1]
  const href = baris.match(/href: '([^']*)'/)?.[1]
  if (!key || !status) continue
  total++
  if (status !== 'rencana' && status !== 'gerbang') continue
  if (href && adaHalaman(href)) {
    berbohong.push({ key, label: label ?? key, status, href })
  }
}

// Cakupan diverifikasi: tiap `key` di berkas HARUS terbaca. Kalau tidak,
// penjaga ini punya titik buta dan angkanya tak bisa dipercaya.
// Pembanding TIDAK BOLEH memakai pola yang sama dengan pembacanya.
//
// Versi sebelumnya membandingkan `{ key: '` dengan `{ key: '` — dua sisi yang
// bergerak bersama. Mutasi yang mengubah `key:` jadi `keyX:` mengurangi
// KEDUANYA, selisihnya tetap nol, dan penjaga melaporkan cakupan penuh
// sambil diam-diam melewatkan entri itu.
//
// Jadi pembandingnya dihitung dari BENTUK BARIS ENTRI — baris berindentasi
// yang dibuka `{` dan ditutup `},` — yang tak bergantung pada nama medannya.
const jumlahBarisObjek = (isi.match(/^\s{4,}\{ [a-zA-Z]+: '[^\n]*\},$/gm) ?? []).length
const jumlahKey = jumlahBarisObjek
if (total !== jumlahKey) {
  console.error(`\n❌ Penjaga ini hanya membaca ${total} dari ${jumlahKey} entri.`)
  console.error('   Titik buta di parser berarti angka di bawah tak bisa dipercaya —')
  console.error('   dan entri yang terlewat justru yang paling mungkin salah bentuk.\n')
  process.exit(1)
}

console.log('\n══ Peta Modul vs halaman nyata ═════════════════════════════')
console.log(`  entri terbaca        : ${total}`)

if (total === 0) {
  console.error('\n❌ Nol entri terbaca dari peta-menu.ts.')
  console.error('   Penjaga yang tak membaca apa pun selalu hijau — dan itu')
  console.error('   lebih buruk daripada tak ada penjaga sama sekali.')
  process.exit(1)
}

let gagal = 0

// ── Entri non-`hidup` WAJIB menjelaskan apa yang kurang ─────────────────────
//
// Diukur 2026-08-12: 20 dari 50 entri `sebagian` tak punya satu kata catatan.
// Kata "Sebagian" terdengar seperti jawaban yang wajar untuk apa saja, jadi
// ketiadaan penjelasan tak pernah terlihat sebagai cacat — padahal isinya
// salah ke DUA arah:
//
//   cc-acl, iv-gudang, hr-karyawan   sebenarnya HIDUP penuh
//   sk-wo, sk-opname, lp-serah,      sebenarnya BELUM DIMULAI
//   sk-backcharge, hr-reimburse      (nol tabel, nol rute, nol halaman)
//
// Founder membaca layar ini untuk tahu sisa pekerjaannya. Entri "sebagian"
// tanpa penjelasan memberi angka yang tak bisa dipakai merencanakan apa pun:
// ia tak memberitahu apakah yang tersisa satu layar atau satu modul.
//
// Catatan WAJIB memaksa yang menandai `sebagian` untuk menyebutkan apa yang
// sudah ada dan apa yang belum — dan itu tak bisa dijawab tanpa mengukur.
const tanpaCatatan = []
for (const baris of barisEntri) {
  const key = baris.match(/key: '([^']+)'/)?.[1]
  const status = baris.match(/status: '([a-z]+)'/)?.[1]
  if (!key || !status || status === 'hidup') continue
  if (!/catatan: '[^']/.test(baris)) tanpaCatatan.push({ key, status })
}

console.log(`  non-'hidup' tanpa catatan: ${tanpaCatatan.length}`)

if (tanpaCatatan.length > 0) {
  console.error(`\n❌ ${tanpaCatatan.length} entri non-'hidup' tanpa catatan:\n`)
  for (const t of tanpaCatatan) console.error(`     ${t.key.padEnd(20)} status '${t.status}'`)
  console.error('\n   Tulis APA yang sudah ada dan APA yang belum, dengan buktinya')
  console.error('   (nama tabel, berkas rute, jalur halaman). "Sebagian" tanpa')
  console.error('   penjelasan tak memberitahu apakah sisanya satu layar atau')
  console.error('   satu modul — dan itu yang dibaca founder untuk merencanakan.\n')
  gagal++
}

if (berbohong.length > 0) {
  console.error(`\n❌ ${berbohong.length} entri berstatus rencana/gerbang PADAHAL halamannya ADA:\n`)
  for (const b of berbohong) {
    console.error(`     ${b.key.padEnd(20)} "${b.label}"`)
    console.error(`     ${''.padEnd(20)} status '${b.status}' tetapi ${b.href} punya page.tsx\n`)
  }
  console.error('   Peta Modul adalah SATU-SATUNYA layar yang menjawab "apa yang')
  console.error('   sudah bisa dipakai". Entri yang berbohong membuat founder')
  console.error('   salah menilai pekerjaannya sendiri — dan itu sudah terjadi')
  console.error('   pada 2026-08-12 (tiga dari empat kartu "Direncanakan").\n')
  gagal++
}

// Exit SESUDAH kedua pemeriksaan, bukan di dalam salah satunya.
//
// Versi sebelumnya `process.exit(1)` di dalam blok `berbohong`, dan saat
// pemeriksaan "tanpa catatan" ditambahkan di ATASNYA, ia mencetak seluruh
// keluhannya lalu jatuh ke baris "✅" dan keluar dengan kode 0.
//
// Ditemukan mutasi, bukan oleh mata: penjaganya MENCETAK bahwa ada
// pelanggaran dan tetap melaporkan lulus. Penjaga yang bicara tapi tak
// menghentikan CI adalah penjaga yang paling meyakinkan sekaligus paling
// tak berguna.
if (gagal > 0) process.exit(1)

console.log('\n✅ Status jujur: nol entri rencana/gerbang berhalaman, nol tanpa penjelasan.\n')
