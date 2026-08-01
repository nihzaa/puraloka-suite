#!/usr/bin/env node
/**
 * PENJAGA SIDEBAR — tinggi collapse tak boleh jadi angka mati lagi.
 *
 * ── Kenapa ada
 *
 * Sebelum 2026-08-01, sidebar memakai `maxHeight: "140px"` untuk grup Keuangan
 * dan `"80px"` untuk Pengaturan. Angka itu kebetulan cukup — 140px muat 4
 * submenu, dan Keuangan memang punya 4.
 *
 * Lalu peta menu penuh masuk: 20 grup, sampai 18 submenu per grup. Grup 18
 * anak butuh ±540px; `140px` akan **memotong 13 di antaranya** — tanpa
 * scrollbar, tanpa error, tanpa gejala apa pun. Orang akan menyimpulkan
 * menunya memang belum dibuat.
 *
 * Itulah kelas cacat yang paling mahal di repo ini: yang gagal DALAM DIAM.
 *
 * ── Yang dijaga
 *
 * 1. Tak ada `maxHeight` ber-angka-px di sidebar (harus diukur `scrollHeight`)
 * 2. State grup bukan per-nama (`keuanganOpen`, `pengaturanOpen`) — dengan 20
 *    grup, pola itu berarti 20 state, dan grup ke-21 takkan bisa dibuka
 * 3. `prefers-reduced-motion` dihormati — sidebar dipakai puluhan kali sehari,
 *    tempat terburuk untuk mengabaikan orang yang mual oleh gerakan
 * 4. Tombol grup punya `aria-expanded` — tanpa itu pembaca layar tak tahu
 *    grupnya terbuka atau tertutup
 *
 * Jalankan: node apps/web/scripts/sidebar-ratchet.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BERKAS = join(import.meta.dirname, '..', 'components', 'sidebar.tsx')
const mentah = readFileSync(BERKAS, 'utf8')

/**
 * Komentar dibuang sebelum diperiksa.
 *
 * Tanpa ini, penjaga menolak berkas yang BENAR: komentar di sini menyebut
 * `maxHeight: "140px"` sebagai contoh cacat yang diperbaiki, dan alat yang
 * membacanya sebagai kode akan melarang orang MENJELASKAN kesalahan lama.
 * Penjaga yang menghukum dokumentasi melatih orang berhenti menulisnya.
 */
const isi = mentah
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((b) => b.replace(/(^|\s)\/\/.*$/, '$1'))
  .join('\n')

const pelanggaran = []

// 1. maxHeight ber-angka-px.
const maxHeightMati = [...isi.matchAll(/maxHeight:\s*(?:terbuka\s*\?\s*)?["'](\d+)px["']/g)]
if (maxHeightMati.length > 0) {
  pelanggaran.push(
    `maxHeight ber-angka mati: ${maxHeightMati.map((m) => m[1] + 'px').join(', ')}\n` +
    '      Grup dengan 18 submenu butuh ±540px. Angka mati memotong isinya\n' +
    '      DIAM-DIAM — tanpa scrollbar, tanpa error. Ukur `scrollHeight`.',
  )
}

// 2. State per-nama-grup.
const statePerNama = [...isi.matchAll(/const \[(\w+Open)\b/g)].map((m) => m[1])
if (statePerNama.length > 0) {
  pelanggaran.push(
    `State collapse per-nama: ${statePerNama.join(', ')}\n` +
    '      Dengan 20 grup, pola ini berarti 20 state — dan grup ke-21 takkan\n' +
    '      bisa dibuka sama sekali. Pakai satu Set berisi key grup yang terbuka.',
  )
}

// 3. Reduced motion. Dicek pada `isi` (tanpa komentar) — menyebutnya di
// komentar tidak membuat sidebar menghormatinya.
if (!isi.includes('prefers-reduced-motion')) {
  pelanggaran.push(
    'Nol penanganan `prefers-reduced-motion`.\n' +
    '      Sidebar dibuka puluhan kali sehari; sebagian orang benar-benar mual\n' +
    '      oleh gerakan. WCAG 2.3.3.',
  )
}

// 4. aria-expanded pada tombol grup.
if (!isi.includes('aria-expanded')) {
  pelanggaran.push(
    'Tombol grup tanpa `aria-expanded`.\n' +
    '      Pembaca layar tak bisa tahu grupnya terbuka atau tertutup — ia hanya\n' +
    '      mendengar "tombol", lalu isinya muncul entah dari mana. WCAG 4.1.2.',
  )
}

if (pelanggaran.length) {
  console.error('\n❌ PENJAGA SIDEBAR GAGAL:\n')
  pelanggaran.forEach((p) => console.error('   ' + p + '\n'))
  console.error(
    '   Kenapa ditegakkan: sidebar kini memuat 20 grup & 202 sub-menu (migrasi\n' +
    '   153). Pola lama yang menulis tinggi & state per-grup secara harfiah\n' +
    '   sudah tak sanggup, dan kegagalannya TIDAK BERBUNYI.\n',
  )
  process.exit(1)
}

console.log('✅ Sidebar: tinggi diukur · state generik · reduced-motion · aria-expanded')
