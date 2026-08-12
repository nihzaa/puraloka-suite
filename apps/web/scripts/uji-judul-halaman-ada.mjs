#!/usr/bin/env node
/**
 * PENJAGA: TIAP HALAMAN DASHBOARD WAJIB PUNYA JUDUL `<h1>`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur di peramban 2026-08-12 dengan menyapu SELURUH rute dashboard (113
 * halaman ber-`<h1>` + 13 tanpa): tiga belas halaman tak punya `<h1>` sama
 * sekali, dan `<h1>` yang ada tersebar di lima ukuran berbeda.
 *
 * Yang menipu pada pengukuran pertama: halaman-halaman itu TERLIHAT berjudul.
 * Judul yang terbaca — "Ajukan cuti", "Tambah sertifikat", "Tetapkan tarif
 * baru" — ternyata judul FORM di tengah halaman, bukan judul halamannya.
 * Mata membaca sesuatu di puncak dan menganggapnya judul; pembaca layar
 * membaca struktur, dan struktur itu bolong.
 *
 * ── Dua akibat, dua-duanya nyata
 *
 * 1. **A11y (WCAG 1.3.1).** Pembaca layar menyusun peta dokumen dari urutan
 *    heading. Halaman yang mulai dari `<h2>` tak memberi jangkar "ini halaman
 *    apa", dan daftar heading-nya bolong di puncak. Pemakainya harus menebak
 *    dari isi.
 *
 * 2. **Visual.** Judul 20px di satu halaman dan 26px di halaman berikutnya
 *    membuat yang kecil terasa seperti sub-halaman dari yang besar — padahal
 *    keduanya setara. Founder menyebutnya sebagai halaman yang "beda sendiri".
 *
 * ── Kenapa ambang NOL, bukan ratchet
 *
 * Ratchet cocok untuk utang yang dibersihkan bertahap. Ini bukan utang: ke-13
 * halamannya SUDAH diperbaiki di commit yang sama dengan penjaga ini, jadi
 * lantainya memang nol. Halaman baru tanpa judul adalah cacat baru, bukan
 * sisa masa lalu.
 *
 * ── Kenapa memeriksa SUMBER, bukan peramban
 *
 * CI tak punya sesi ber-login, dan halaman dashboard butuh auth. Penjaga yang
 * butuh kredensial akan berakhir seperti `audit-a11y-runtime` yang pernah
 * memindai 1 dari 118 halaman lalu keluar 0 — hijau karena tak melihat apa-apa.
 *
 * Konsekuensinya penjaga ini memeriksa PROKSI: apakah berkas merender
 * `KepalaHalaman` (yang isinya `<h1>`) atau `<h1>` sendiri. Proksi bisa
 * dikelabui — `KepalaHalaman` di balik `if (!izin) return` tak akan terlihat
 * pemakainya. Itu batasnya, dan ia disebutkan di sini supaya tak dikira
 * jaminan. Pengukuran peramban tetap yang berwenang; penjaga ini menjaring
 * kelas cacat yang paling sering: halaman baru yang lupa diberi judul.
 *
 * Pakai:  node apps/web/scripts/uji-judul-halaman-ada.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(__dirname, '..')
const AKAR = join(WEB, 'app', '(dashboard)')

/**
 * Halaman yang memang TAK BOLEH punya judul halaman sendiri.
 *
 * Daftar ini sengaja pendek dan tiap barisnya beralasan. Menambahkannya
 * adalah cara termudah membuat penjaga ini jadi hiasan, jadi tiap entri wajib
 * menyebut KENAPA — bukan sekadar "halaman ini beda".
 */
const DIKECUALIKAN = new Map([
  // `layout.tsx` bukan halaman; ia pembungkus. Judulnya milik halaman di dalamnya.
  ['layout.tsx', 'pembungkus, bukan halaman'],
])

function berkasHalaman(dir, keluar = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) berkasHalaman(p, keluar)
    else if (e === 'page.tsx') keluar.push(p)
  }
  return keluar
}

/**
 * Tiga cara sah menyediakan judul halaman — semuanya berujung `<h1>`:
 *
 *   `KepalaHalaman`  judul tulis-tangan + ubin ikon + aksi (components/dasar)
 *   `JudulBagian`    judul DIAMBIL dari label `menu_items` (components/judul-bagian)
 *   `<h1>` langsung  halaman yang bentuk kepalanya khas
 *
 * `JudulBagian` sempat luput dari daftar ini, dan penjaganya menuduh 31
 * halaman yang sudah benar. Keduanya kini merender `<h1>` seukuran
 * `--t-halaman`, jadi tak ada lagi alasan memilih salah satunya demi ukuran.
 */
/**
 * Komentar DIBUANG sebelum diperiksa.
 *
 * Berkas di repo ini berkomentar panjang, dan komentarnya sering menyebut
 * nama komponen (`KepalaHalaman` disebut enam kali di `/kepatuhan/page.tsx` —
 * sekali di JSX, lima kali sebagai penjelasan). Penjaga yang menghitung
 * komentar akan menyatakan hijau untuk halaman yang cuma MEMBICARAKAN judul
 * tanpa merendernya.
 *
 * Ini bukan kekhawatiran teoretis: ia ketahuan dari bukti mutasi, ketika M1
 * tetap hijau padahal judulnya sudah dilumpuhkan.
 */
const tanpaKomentar = (isi) =>
  isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const punyaJudul = (isiMentah) => {
  const isi = tanpaKomentar(isiMentah)
  return /<KepalaHalaman\b/.test(isi) || /<JudulBagian\b/.test(isi) || /<h1\b/.test(isi)
}

/**
 * Judul boleh datang dari `layout.tsx` LELUHUR, bukan hanya dari halamannya.
 *
 * Versi pertama penjaga ini tak tahu itu dan menuduh 36 halaman — termasuk
 * lima halaman `pengaturan/asisten/*` yang judulnya dirender layout grupnya
 * dengan benar. Kalau saya percaya angka itu, saya akan "memperbaiki" halaman
 * yang sudah benar dan menghasilkan DUA `<h1>` per halaman: cacat a11y yang
 * lebih buruk daripada yang sedang diperbaiki.
 *
 * Yang menyelamatkan: pengukuran peramban sebelumnya sudah mencatat
 * `/keuangan` dan `/procurement` PUNYA `<h1>`. Dua sumber tak cocok → ukur
 * lagi, jangan pilih yang lebih nyaman (CHARTER §7).
 */
function layoutBerjudul(berkas) {
  let dir = dirname(berkas)
  while (dir.startsWith(AKAR)) {
    const l = join(dir, 'layout.tsx')
    try {
      if (punyaJudul(readFileSync(l, 'utf8'))) return relative(WEB, l).replace(/\\/g, '/')
    } catch { /* tak ada layout di lapis ini */ }
    dir = dirname(dir)
  }
  return null
}

const pelanggar = []
for (const berkas of berkasHalaman(AKAR)) {
  const rel = relative(WEB, berkas).replace(/\\/g, '/')
  if (DIKECUALIKAN.has(rel)) continue

  if (punyaJudul(readFileSync(berkas, 'utf8'))) continue
  if (layoutBerjudul(berkas)) continue
  pelanggar.push(rel)
}

if (pelanggar.length) {
  console.error(`\n❌ ${pelanggar.length} halaman dashboard tanpa judul <h1>:\n`)
  for (const p of pelanggar) console.error(`   ${p}`)
  console.error(
    `\nTiap halaman wajib merender <KepalaHalaman judul="…" /> (components/dasar.tsx)` +
    `\natau <h1> sendiri. Judulnya ambil dari label \`menu_items\` supaya cocok` +
    `\ndengan yang tertulis di sidebar.\n` +
    `\nAmbang NOL — lihat kepala berkas ini untuk alasannya.\n`,
  )
  process.exit(1)
}

console.log(`✅ ${berkasHalaman(AKAR).length} halaman dashboard: semuanya punya judul <h1>`)
