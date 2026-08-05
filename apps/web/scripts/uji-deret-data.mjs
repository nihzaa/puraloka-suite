#!/usr/bin/env node
/**
 * UJI DERET DATA — membuktikan warna grafik bisa dibedakan, termasuk oleh
 * mata buta warna.
 *
 * ── Kenapa ada
 *
 * "Dipilih agar bisa dibedakan pada penglihatan deutan/protan" adalah klaim
 * yang selama ini ditulis di globals.css TANPA pernah diuji. Klaim aksesibilitas
 * yang tak diukur adalah klaim kosong — dan yang ini menyangkut apakah orang
 * bisa membaca grafik keuangannya sendiri.
 *
 * Dua hal diuji:
 *   1. Jarak warna antar-deret pada penglihatan normal.
 *   2. Jarak yang sama SETELAH disimulasikan deuteranopia & protanopia
 *      (~8% pria). Warna yang berbeda rona tapi sama terangnya akan runtuh
 *      jadi warna yang sama di sini — itulah jebakannya.
 *
 * Pakai: node apps/web/scripts/uji-deret-data.mjs
 * Keluar dengan kode 1 kalau ada pasangan yang terlalu dekat — bisa dipakai CI.
 */

const hexRgb = (h) => {
  const s = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}

// ── Simulasi buta warna (Brettel/Viénot, matriks LMS yang lazim dipakai) ──
const srgbLinear = (v) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const linearSrgb = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(c * 255)))
}

const MATRIKS = {
  deutan: [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]],
  protan: [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]],
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
}

const simulasi = (hex, jenis) => {
  const [r, g, b] = hexRgb(hex).map(srgbLinear)
  const m = MATRIKS[jenis]
  return [
    m[0][0] * r + m[0][1] * g + m[0][2] * b,
    m[1][0] * r + m[1][1] * g + m[1][2] * b,
    m[2][0] * r + m[2][1] * g + m[2][2] * b,
  ].map(linearSrgb)
}

// ── Jarak warna CIE76 di ruang Lab (perkiraan cukup untuk gerbang ini) ──
const rgbLab = ([r, g, b]) => {
  const [lr, lg, lb] = [r, g, b].map(srgbLinear)
  let x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047
  let y = (0.2126 * lr + 0.7152 * lg + 0.0722 * lb) / 1.0
  let z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  ;[x, y, z] = [f(x), f(y), f(z)]
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

const jarak = (a, b) => {
  const [la, aa, ba] = rgbLab(a)
  const [lb, ab, bb] = rgbLab(b)
  return Math.hypot(la - lb, aa - ab, ba - bb)
}

// Ambang: ΔE 20 adalah "jelas berbeda bagi mata awam pada bidang kecil".
// Potongan donat dan batang grafik itu kecil — ambang longgar tak menolong.
const AMBANG = 20

// Dibaca LANGSUNG dari globals.css, bukan disalin ke sini. Daftar warna yang
// disalin akan basi diam-diam: seseorang mengubah token, uji ini tetap hijau
// menguji warna yang sudah tak dipakai. Itu lebih buruk daripada tak menguji.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'globals.css'),
  'utf8'
)

// Blok `.dark` memuat definisi ulang; yang pertama = mode terang.
const potongGelap = CSS.indexOf('.dark')
const ambil = (teks) => {
  const hasil = []
  for (let i = 1; i <= 5; i++) {
    const m = teks.match(new RegExp(`--data-${i}:\\s*(#[0-9A-Fa-f]{6})`))
    if (!m) throw new Error(`--data-${i} tak ditemukan di globals.css`)
    hasil.push(m[1])
  }
  return hasil
}

const SET = {
  terang: ambil(CSS.slice(0, potongGelap)),
  gelap: ambil(CSS.slice(potongGelap)),
}

let gagal = 0
for (const [mode, warna] of Object.entries(SET)) {
  console.log(`\n══ Mode ${mode.toUpperCase()} ══`)
  for (const jenis of ['normal', 'deutan', 'protan']) {
    const sim = warna.map((w) => simulasi(w, jenis))
    const buruk = []
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const d = jarak(sim[i], sim[j])
        if (d < AMBANG) buruk.push(`data-${i + 1}/data-${j + 1} ΔE=${d.toFixed(1)}`)
      }
    }
    if (buruk.length) {
      gagal += buruk.length
      console.log(`  ${jenis.padEnd(7)} ✗ ${buruk.join('  ')}`)
    } else {
      console.log(`  ${jenis.padEnd(7)} ✓ semua pasangan ≥ ΔE ${AMBANG}`)
    }
  }
}

if (gagal) {
  console.log(`\n${gagal} pasangan terlalu mirip. Deret data harus berbeda TERANGNYA, bukan hanya ronanya.`)
  process.exit(1)
}
console.log('\n✓ Seluruh deret data bisa dibedakan pada normal, deutan, dan protan.')
