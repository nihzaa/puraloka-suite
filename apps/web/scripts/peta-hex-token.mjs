#!/usr/bin/env node
// ============================================================================
// F4-1 — PETA hex → token desain.
//
//   node scripts/peta-hex-token.mjs            # ringkasan
//   node scripts/peta-hex-token.mjs --daftar   # per berkas, siap dikerjakan
//   node scripts/peta-hex-token.mjs --yatim    # hex yang BELUM punya token
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA ALAT INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// F4-1 menuntut "hex literal hanya boleh di berkas token". Kenyataannya 1.118
// hex tersebar di puluhan berkas, dan menggantinya secara mekanis akan
// merusak: `#15803D` di satu tempat berarti "sukses", di tempat lain bisa
// sekadar hijau dekoratif.
//
// Yang alat ini lakukan: mencocokkan tiap hex dengan token yang SUDAH ADA di
// `globals.css`, lalu memisahkan dua kelompok yang penanganannya berbeda:
//
//   PUNYA TOKEN — penggantian mekanis aman; nilainya identik.
//   YATIM       — butuh keputusan manusia: token baru, atau memang harus hex?
//
// ── Kenapa hanya blok LIGHT yang dibaca
//
// Token yang sama punya NILAI BERBEDA di blok dark (`--surface` #FFFFFF vs
// #1A1D27). Memetakan dari kedua blok akan membuat satu hex punya dua nama
// token, dan penggantian jadi menebak. Blok light adalah acuan tunggal.
//
// Alat ini TIDAK mengubah berkas apa pun — ia hanya melaporkan.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CSS = join(WEB, 'app', 'globals.css')

// ── Peta token dari blok LIGHT ──────────────────────────────────────────────
//
// ⚠️ JANGAN memotong dari komentar "Warm Clay tokens — Light".
//
// Percobaan pertama melakukannya, dan hasilnya SALAH TOTAL: komentar itu ada
// di baris 83, sementara token light yang sesungguhnya (`--border: #E5E7EB`)
// hidup di baris 22–81 — SEBELUM komentarnya. Yang tertangkap justru nilai
// DARK, sehingga `#E5E7EB` dan `#15803D` dilaporkan "yatim" padahal keduanya
// jelas-jelas token.
//
// Yang benar: potong dari `:root {` PERTAMA sampai deklarasi tema gelap
// (`@media (prefers-color-scheme: dark)` atau `[data-theme="dark"]`).
// Struktur berkas yang menentukan, bukan teks komentarnya — komentar bisa
// dipindah orang tanpa memindahkan isinya.
const css = readFileSync(CSS, 'utf8')
const mulai = css.indexOf(':root')
const gelap = (() => {
  const kandidat = [
    css.indexOf('prefers-color-scheme: dark'),
    css.indexOf('[data-theme="dark"]'),
    css.indexOf("[data-theme='dark']"),
  ].filter((i) => i > mulai)
  return kandidat.length ? Math.min(...kandidat) : css.length
})()
const light = css.slice(mulai, gelap)

const tokenDari = new Map()   // hex → nama token
for (const m of light.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
  const hex = m[2].toUpperCase()
  // Token PERTAMA yang memakai sebuah hex menang. Urutan di globals.css
  // menaruh yang paling umum di atas (`--surface` sebelum `--surface-raised`),
  // jadi yang terpilih adalah nama yang paling sering benar.
  if (!tokenDari.has(hex)) tokenDari.set(hex, m[1])
}

// ── Pindai pemakaian ────────────────────────────────────────────────────────
const LEWATI = new Set(['node_modules', '.next', 'dist', 'scripts'])

function* berkas(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (LEWATI.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* berkas(p)
    else if (/\.(tsx?|css)$/.test(e.name)) yield p
  }
}

const perBerkas = new Map()   // berkas → { punya, yatim }
const hitungHex = new Map()   // hex → jumlah
let totalPunya = 0
let totalYatim = 0

for (const dir of ['app', 'components', 'lib']) {
  let isiDir
  try { isiDir = [...berkas(join(WEB, dir))] } catch { continue }

  for (const p of isiDir) {
    // globals.css adalah SUMBER token — hex di sana bukan pelanggaran.
    if (p.endsWith('globals.css')) continue

    const isi = readFileSync(p, 'utf8')
    let punya = 0, yatim = 0
    for (const m of isi.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const hex = m[0].toUpperCase()
      hitungHex.set(hex, (hitungHex.get(hex) ?? 0) + 1)
      if (tokenDari.has(hex)) { punya++; totalPunya++ } else { yatim++; totalYatim++ }
    }
    if (punya + yatim > 0) {
      perBerkas.set(relative(WEB, p).replace(/\\/g, '/'), { punya, yatim })
    }
  }
}

const argv = process.argv.slice(2)

if (argv.includes('--yatim')) {
  const yatim = [...hitungHex.entries()]
    .filter(([h]) => !tokenDari.has(h))
    .sort((a, b) => b[1] - a[1])
  console.log('  hex TANPA token padanan (butuh keputusan, bukan penggantian mekanis):\n')
  for (const [h, n] of yatim.slice(0, 30)) console.log(`  ${String(n).padStart(4)}x  ${h}`)
  console.log(`\n  ${yatim.length} nilai · ${totalYatim} kemunculan`)
  process.exit(0)
}

if (argv.includes('--daftar')) {
  const urut = [...perBerkas.entries()].sort((a, b) =>
    (b[1].punya + b[1].yatim) - (a[1].punya + a[1].yatim))
  console.log('  punya  yatim  berkas')
  for (const [f, v] of urut) {
    console.log(`  ${String(v.punya).padStart(5)}  ${String(v.yatim).padStart(5)}  ${f}`)
  }
  console.log(`\n  ${perBerkas.size} berkas · ${totalPunya} bisa diganti mekanis · ${totalYatim} yatim`)
  process.exit(0)
}

console.log('══ PETA hex → token (F4-1) ' + '═'.repeat(42))
console.log(`  token ber-hex di globals.css : ${tokenDari.size}`)
console.log(`  berkas memuat hex            : ${perBerkas.size}`)
console.log(`  hex PUNYA token padanan      : ${totalPunya}  ← penggantian aman`)
console.log(`  hex YATIM (tanpa padanan)    : ${totalYatim}  ← butuh keputusan`)
console.log(`\n  --daftar   per berkas`)
console.log(`  --yatim    hex yang belum punya token`)
