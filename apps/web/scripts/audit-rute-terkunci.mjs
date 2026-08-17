#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// PENJAGA: halaman yang punya tautan sidebar tapi DITOLAK middleware.
// ════════════════════════════════════════════════════════════════════════════
//
// ── Cacat yang melahirkannya
//
// 2026-08-11 (G2b): `/sdm/timesheet` dibangun lengkap — halaman, endpoint,
// migrasi menu, entri `peta-menu.ts`. `audit-nav-yatim.mjs` HIJAU, karena
// tautannya memang ada di sidebar.
//
// Tapi mengkliknya membawa pengguna ke `/dashboard`. `middleware.ts` punya
// daftar prefiks rute per peran (`ROLE_ALLOWED`), dan `/sdm` tak ada di sana.
// Halamannya tak bisa dicapai SIAPA PUN — termasuk admin.
//
// Bentuk kegagalannya sama dengan yang sudah berulang di repo ini: dua sumber
// yang masing-masing konsisten dengan dirinya sendiri, nol galat, dan
// hasilnya fitur yang sudah jadi tak bisa dipakai. Yang berbeda: kali ini
// penjaga yang seharusnya menangkapnya (`nav-yatim`) memang tak dirancang
// untuk itu — ia memeriksa TAUTAN, bukan IZIN.
//
// Redirect diam-diam lebih buruk daripada 403: tak ada pesan galat, tak ada
// jejak di log, dan yang mengklik menyangka salah klik.
//
// ── Yang diperiksa
//
// Untuk tiap `href` menu yang AKTIF di basis:
//   apakah ada SATU PERAN pun yang boleh membukanya menurut `ROLE_ALLOWED`?
//
// Kalau tidak ada, menu itu menjanjikan halaman yang pasti ditolak.
//
// ── Kenapa RATCHET, bukan ambang nol
//
// Penjaga ini langsung menemukan ENAM menu yang sudah terkunci sebelum G2b:
//
//     crm-proposal   → /crm/penawaran            crm-lead  → /crm/prospek
//     md-karyawan    → /master/karyawan          md-wbs    → /master/wbs
//     md-penomoran   → /master/penomoran
//     md-template-dok → /master/template-dokumen
//
// Diukur: folder `app/(dashboard)/master/` dan `app/(dashboard)/crm/` TIDAK
// ADA. Jadi keenamnya bukan sekadar terkunci — halamannya memang belum
// dibangun, dan menunya menjanjikan sesuatu yang tak ada.
//
// Memperbaikinya berarti membangun enam halaman atau menonaktifkan enam menu
// yang mungkin sengaja dipasang sebagai penanda roadmap. Dua-duanya keputusan
// tersendiri, bukan pekerjaan sampingan G2b — dan mencampurnya ke commit ini
// akan menyembunyikan keduanya.
//
// Karena itu: LANTAI, bukan nol. Yang dijaga adalah **tak boleh bertambah**.
// Turunkan angkanya saat keenamnya diselesaikan.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Lantai: jumlah menu terkunci yang sudah ada sebelum penjaga ini dibuat.
 *
 * Diukur 2026-08-11 (6). Menaikkannya butuh alasan tertulis di sini — dan
 * alasan yang sah hanya satu: menu baru yang halamannya sengaja belum
 * dibangun, yang seharusnya dinonaktifkan alih-alih dibiarkan terkunci.
 *
 * 6 → 0 pada 2026-08-17, diukur di cabang rombak UI CECEP: 160 menu aktif
 * diadu dengan 39 prefiks middleware, nol terkunci. Keenamnya ditutup oleh
 * pekerjaan yang memang menyelesaikannya — `/master` ditambahkan ke
 * `ROLE_ALLOWED.admin` (dua kali secara terpisah: `732fba72` di induk untuk
 * WBS/karyawan/penomoran, dan cabang ini saat memindahkan katalog AHSP +
 * price book ke `/master`) — bukan oleh pelonggaran penjaga.
 *
 * Sekarang lantainya NOL, jadi satu menu terkunci saja langsung merah.
 */
const LANTAI = 0

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MIDDLEWARE = join(AKAR, 'apps/web/middleware.ts')

/**
 * Baca `ROLE_ALLOWED` dari `middleware.ts`.
 *
 * Regex, bukan impor: berkas itu memakai `next/server` yang tak bisa dimuat
 * di luar Next. Yang dibaca hanya daftar string di dalam blok — bentuk yang
 * stabil dan mudah diperiksa manusia.
 */
function bacaIzin() {
  const src = readFileSync(MIDDLEWARE, 'utf8')
  const m = /const ROLE_ALLOWED[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src)
  if (!m) {
    console.error('❌ `ROLE_ALLOWED` tak ditemukan di middleware.ts.')
    console.error('   Penjaga ini membacanya lewat regex; kalau bentuknya berubah,')
    console.error('   perbarui regex-nya — JANGAN hapus penjaganya.')
    process.exit(1)
  }
  const prefiks = new Set()
  // Ambil hanya baris penugasan peran (`nama: [...]`), bukan komentar.
  for (const baris of m[1].split('\n')) {
    const t = baris.trim()
    if (t.startsWith('//') || t.startsWith('*')) continue
    for (const p of t.matchAll(/"([^"]+)"/g)) prefiks.add(p[1])
  }
  return [...prefiks]
}

const izin = bacaIzin()
if (izin.length === 0) {
  console.error('❌ Nol prefiks terbaca dari ROLE_ALLOWED — regex kemungkinan tak lagi cocok.')
  process.exit(1)
}

/**
 * Buang query string & fragment sebelum mencocokkan.
 *
 * Middleware memeriksa `request.nextUrl.pathname` — yang TIDAK memuat `?tab=`
 * maupun `#`. Versi pertama penjaga ini membandingkan href mentah dan
 * melaporkan `/akuntansi?tab=akun` sebagai terkunci, padahal `/akuntansi`
 * ada di daftar izin dan halamannya terbuka normal.
 *
 * Lima positif palsu sekaligus — dan penjaga yang berbohong akan dimatikan
 * orang, bukan diperbaiki.
 */
const jalur = (href) => href.split('?')[0].split('#')[0]

/** Cocok di BATAS SEGMEN — sama dengan `cocokRute` di middleware. */
const bolehDibuka = (href) => {
  const j = jalur(href)
  return izin.some((p) => j === p || j.startsWith(p + '/'))
}

const c = buatClient()
await c.connect()
const { rows } = await c.query(
  `SELECT key, label, href FROM menu_items
    WHERE is_active AND href IS NOT NULL AND href LIKE '/%'
    ORDER BY href`)
await c.end()

const terkunci = rows.filter((r) => !bolehDibuka(r.href))

console.log(`  menu aktif ber-href : ${rows.length}`)
console.log(`  prefiks di middleware: ${izin.length}`)
console.log(`  terkunci            : ${terkunci.length}`)
console.log(`  lantai              : ${LANTAI}`)

if (terkunci.length > 0) {
  console.log('\n— Menu aktif yang halamannya DITOLAK middleware untuk semua peran:\n')
  for (const t of terkunci) {
    console.log(`   ${t.key.padEnd(20)} ${t.label}`)
    console.log(`   ${''.padEnd(20)} → ${t.href}`)
  }
}

if (terkunci.length > LANTAI) {
  console.log(`\n❌ NAIK dari ${LANTAI} ke ${terkunci.length}.`)
  console.log('\n   Mengklik menu ini membawa pengguna ke halaman lain TANPA pesan')
  console.log('   galat — ia menyangka salah klik, dan tak ada jejak di log.')
  console.log('\n   Perbaiki dengan menambahkan prefiksnya ke `ROLE_ALLOWED` di')
  console.log('   apps/web/middleware.ts — pikirkan peran MANA yang boleh, jangan')
  console.log('   tambahkan ke semua. ATAU nonaktifkan menunya kalau halamannya')
  console.log('   memang belum siap (pola migrasi 281/285).')
  process.exit(1)
}

if (terkunci.length < LANTAI) {
  console.log(`\n✅ TURUN dari ${LANTAI} ke ${terkunci.length} — turunkan LANTAI di skrip ini.`)
} else {
  console.log('\n✅ Tidak bertambah.')
}
