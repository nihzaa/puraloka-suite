#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// PENJAGA KONTRAS SITUS PUBLIK — pasangan warna dihitung, bukan ditaksir.
// ════════════════════════════════════════════════════════════════════════════
//
// ── Kenapa penjaga ini ada
//
// Saat menambahkan keluarga token terang (2026-08-08), saya menulis tiga angka
// kontras di komentar `globals.css` dari taksiran: 16,84 / 5,92 / 9,71.
// Dihitung ulang dengan rumus WCAG, **ketiganya meleset** — yang benar
// 16,99 / 7,41 / 11,64. Kebetulan ketiganya meleset ke arah yang aman.
//
// Lain kali bisa tidak. Angka kontras yang ditulis tangan di komentar adalah
// klaim tanpa bukti, dan klaim tanpa bukti di berkas token akan dipercaya oleh
// orang berikutnya yang menyunting warnanya.
//
// ── Yang dijaga
//
// Tiap pasangan (teks, latar) yang BENAR-BENAR dipakai bersama di situs harus
// lolos ambangnya. Pasangan didaftarkan di sini secara eksplisit — bukan
// diturunkan otomatis dari CSS, karena mesin tak tahu warna mana dipakai di
// atas warna mana.
//
// ── Kenapa AKSEN KUNING sengaja diperiksa GAGAL
//
// `--aksen: #ffd600` hanya 1,30:1 di atas kanvas terang. Itu bukan cacat yang
// perlu diperbaiki — itu pagar. Selama kuning cuma bisa hidup di navy,
// kelangkaannya dijaga fisika warna, bukan disiplin penyuntingnya. Penjaga ini
// MENUNTUT ia tetap gagal di latar terang; kalau suatu saat lolos, artinya
// seseorang mencerahkan kuningnya dan aturan "satu aksen langka" bocor.
//
// Jalankan (dari akar repo): node apps/web-publik/scripts/kontras-situs.mjs
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const CSS = readFileSync(join(AKAR, 'app/globals.css'), 'utf8')

/** Baca nilai token dari globals.css — sumber tunggal, bukan disalin ke sini. */
function token(nama) {
  const m = CSS.match(new RegExp(`--${nama}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`Token --${nama} tak ditemukan di globals.css`)
  return m[1].toLowerCase()
}

/** Luminansi relatif WCAG 2.1 — https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function luminansi(hex) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

function kontras(a, b) {
  const [t, r] = [luminansi(a), luminansi(b)].sort((x, y) => y - x)
  return (t + 0.05) / (r + 0.05)
}

/**
 * Pasangan yang benar-benar dipakai bersama.
 *
 * `min` = ambang yang harus DILAMPAUI. `maks` = ambang yang TIDAK BOLEH
 * dilampaui — dipakai khusus untuk membuktikan kuning tetap tak terpakai di
 * latar terang.
 */
const PASANGAN = [
  // Latar navy (hero, kontak, seksi gelap)
  { teks: 'pada-navy', latar: 'navy-pekat', min: 7, guna: 'judul & logo di hero' },
  { teks: 'pada-navy-redup', latar: 'navy-pekat', min: 4.5, guna: 'teks pendukung di hero' },
  { teks: 'aksen', latar: 'navy-pekat', min: 4.5, guna: 'eyebrow kuning di navy' },
  { teks: 'pada-navy', latar: 'navy', min: 7, guna: 'teks di navy sedang' },
  { teks: 'pada-navy-redup', latar: 'navy', min: 4.5, guna: 'pendukung di navy sedang' },

  // Latar terang (portofolio, proses, legalitas)
  { teks: 'pada-kanvas', latar: 'kanvas', min: 7, guna: 'judul di seksi terang' },
  { teks: 'pada-kanvas-redup', latar: 'kanvas', min: 4.5, guna: 'teks pendukung di seksi terang' },
  { teks: 'navy', latar: 'kanvas', min: 4.5, guna: 'judul navy di seksi terang' },
  { teks: 'pada-kanvas', latar: 'kanvas-tenggelam', min: 7, guna: 'teks di atas kartu' },
  { teks: 'pada-kanvas-redup', latar: 'kanvas-tenggelam', min: 4.5, guna: 'keterangan di kartu' },

  // PAGAR: kuning WAJIB tetap gagal di latar terang.
  { teks: 'aksen', latar: 'kanvas', maks: 3, guna: 'PAGAR — kuning tak boleh terpakai di terang' },
]

/**
 * `opacity` pada teks adalah WARNA YANG TAK TERDAFTAR.
 *
 * Penjaga ini menghitung nilai token. `opacity` mengubah warna EFEKTIF di luar
 * jangkauan perhitungan itu, jadi teks bisa lolos di sini dan tetap gagal di
 * axe-core.
 *
 * Terjadi 2026-08-08: `.porto-jumlah { opacity: 0.7 }` aman di latar navy,
 * lalu jadi pelanggaran `color-contrast` serious begitu seksi portofolio
 * berubah terang. Penjaga token melaporkan 11/11 hijau sepanjang waktu itu.
 *
 * Yang dilarang: `opacity` pada aturan yang juga menyetel `color` atau
 * `font-size` — tanda ia mengatur TEKS. `opacity` pada gambar, lapisan, dan
 * elemen dekoratif tetap sah dan tak diperiksa.
 */
function opacityPadaTeks() {
  const temuan = []
  // Tiap blok aturan: `.pemilih { ... }`
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const pemilih = m[1].trim()
    const isi = m[2]
    if (!/(^|\s|;)opacity\s*:/.test(isi)) continue
    // Hanya yang jelas mengatur teks.
    if (!/(^|\s|;)(color|font-size)\s*:/.test(isi)) continue
    const nilai = (isi.match(/opacity\s*:\s*([\d.]+)/) || [])[1]
    if (Number(nilai) >= 1) continue
    temuan.push(`${pemilih.split('\n').pop().trim()}  opacity: ${nilai}`)
  }
  return temuan
}

console.log('\n══ Kontras situs publik ═══════════════════════════════════════')

const gagal = []
for (const p of PASANGAN) {
  const r = kontras(token(p.teks), token(p.latar))
  const nilai = r.toFixed(2)
  const label = `${p.teks} / ${p.latar}`.padEnd(34)

  if (p.maks !== undefined) {
    const ok = r <= p.maks
    console.log(`  ${ok ? '✅' : '❌'} ${label} ${nilai.padStart(6)}  (pagar ≤ ${p.maks})  ${p.guna}`)
    if (!ok) gagal.push(`${label} ${nilai} MELAMPAUI pagar ${p.maks} — ${p.guna}`)
    continue
  }

  const ok = r >= p.min
  console.log(`  ${ok ? '✅' : '❌'} ${label} ${nilai.padStart(6)}  (min ${p.min})     ${p.guna}`)
  if (!ok) gagal.push(`${label} ${nilai} < ${p.min} — ${p.guna}`)
}

const opacity = opacityPadaTeks()
if (opacity.length) {
  console.log(`\n  opacity pada teks : ${opacity.length}`)
  for (const o of opacity) gagal.push(`opacity pada teks — ${o}`)
}

if (gagal.length) {
  console.error(`\n❌ MERAH — ${gagal.length} pasangan tak lolos:\n`)
  for (const g of gagal) console.error(`     ${g}`)
  console.error('\n   Perbaiki NILAI TOKENNYA di app/globals.css, jangan turunkan')
  console.error('   ambang di berkas ini. Ambang yang diturunkan sekali akan')
  console.error('   diturunkan lagi.\n')
  process.exit(1)
}

console.log(`\n✅ ${PASANGAN.length} pasangan lolos, termasuk 1 pagar aksen.\n`)
process.exit(0)
