#!/usr/bin/env node
/**
 * PETA HEX — memetakan warna mati di komponen ke token yang setara.
 *
 * ── Kenapa ada
 *
 * Diukur 2026-08-05: 581 hex mati di 55 berkas .tsx. Itu akar dari dua
 * keluhan yang berbeda tapi sebenarnya satu masalah:
 *
 *   • "Mode gelapnya terasa tempelan" — hex mati tak ikut berbalik. Kartu
 *     berlatar #FAFAFA tetap #FAFAFA di mode gelap, jadi ada bercak putih
 *     di halaman gelap.
 *   • "Halamannya tidak menyatu" — 26 nada biru berbeda dipakai untuk hal
 *     yang sama, karena tiap halaman ditulis terpisah.
 *
 * ── Cara kerja
 *
 * Untuk setiap hex mati, cari token yang jarak warnanya (ΔE) paling dekat.
 * Kalau ΔE < 3 → praktis warna yang sama, aman diganti otomatis.
 * Kalau 3-10 → kandidat, tapi butuh mata manusia.
 * Kalau > 10 → warna yang memang berbeda; mungkin butuh token BARU.
 *
 * Pakai:
 *   node apps/web/scripts/peta-hex.mjs           # laporan
 *   node apps/web/scripts/peta-hex.mjs --terapkan  # ganti yang ΔE < 3
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSS = readFileSync(join(AKAR, 'app', 'globals.css'), 'utf8')

// ── Warna ─────────────────────────────────────────────────────────────────
const hexRgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16))
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lab = (hex) => {
  const [r, g, b] = hexRgb(hex).map(lin)
  let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  let y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  ;[x, y, z] = [f(x), f(y), f(z)]
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const dE = (a, b) => { const [l1,a1,b1] = lab(a), [l2,a2,b2] = lab(b); return Math.hypot(l1-l2, a1-a2, b1-b2) }

// ── Token mode TERANG (blok :root, sebelum .dark) ─────────────────────────
const potong = CSS.indexOf('.dark')
const TOKEN = {}
for (const m of CSS.slice(0, potong).matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
  TOKEN[m[1]] = m[2].toUpperCase()
}

// ── Kumpulkan hex mati ────────────────────────────────────────────────────
const berkasTsx = []
const jelajah = (d) => {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue
    const p = join(d, n)
    if (statSync(p).isDirectory()) jelajah(p)
    else if (n.endsWith('.tsx') && !n.includes('.test.')) berkasTsx.push(p)
  }
}
jelajah(join(AKAR, 'app'))
jelajah(join(AKAR, 'components'))

const pakai = new Map()   // hex → [{berkas, jumlah}]
for (const p of berkasTsx) {
  const isi = readFileSync(p, 'utf8')
  for (const m of isi.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
    const h = m[0].toUpperCase()
    if (!pakai.has(h)) pakai.set(h, new Map())
    const per = pakai.get(h)
    per.set(p, (per.get(p) ?? 0) + 1)
  }
}

// ── Cocokkan ──────────────────────────────────────────────────────────────
const cocok = []
for (const [hex, per] of pakai) {
  let terdekat = null, jarak = Infinity
  for (const [nama, nilai] of Object.entries(TOKEN)) {
    const d = dE(hex, nilai)
    if (d < jarak) { jarak = d; terdekat = nama }
  }
  const total = [...per.values()].reduce((a, b) => a + b, 0)
  cocok.push({ hex, token: terdekat, dE: jarak, total, berkas: per })
}
cocok.sort((a, b) => a.dE - b.dE || b.total - a.total)

const AMAN = cocok.filter((c) => c.dE < 3)
const KANDIDAT = cocok.filter((c) => c.dE >= 3 && c.dE < 10)
const BEDA = cocok.filter((c) => c.dE >= 10)

// ── Pemetaan yang DIPUTUSKAN, bukan dihitung ──────────────────────────────
//
// ΔE mengukur kemiripan warna, bukan kesamaan MAKNA. Dua kesalahan yang
// hampir terjadi kalau ambang dituruti buta:
//
//   #FCE7F3 (pink) → --danger-bg   ΔE 7,5 — mirip, tapi pink dipakai untuk
//     kategori netral, bukan bahaya. Menggantinya membuat baris biasa
//     terbaca sebagai peringatan.
//   #A7F3D0 (hijau border) → --success-border  ΔE 5,7 — ini justru BENAR,
//     maknanya memang sama.
//
// Ungu (#F5F3FF, #EDE9FE, #E0E7FF, #7C3AED, #8B5CF6, #6D28D9, #A78BFA)
// sengaja dipetakan ke navy/info: ungu bukan warna merek Puraloka, dan
// keberadaannya di 9 halaman adalah sisa desain lama.
const PUTUSAN = {
  // Navy — nada biru yang berserakan, semuanya menuju satu tangga merek.
  '#002244': '--aksen-pekat', '#0055AA': '--aksen-terang', '#0066CC': '--aksen-terang',
  '#E0F2FE': '--navy-light', '#DBEAFE': '--navy-light', '#C7D7F5': '--info-border',
  '#C7D9F0': '--info-border',
  // Ungu → navy/info. Bukan penyeragaman malas: ungu memang harus pergi.
  '#F5F3FF': '--navy-light', '#EDE9FE': '--navy-light', '#E0E7FF': '--navy-light',
  '#DDD6FE': '--info-border', '#7C3AED': '--aksen', '#8B5CF6': '--aksen',
  '#6D28D9': '--aksen', '#A78BFA': '--aksen-terang', '#3730A3': '--aksen-pekat',
  // Netral & teks.
  '#0F172A': '--text-primary', '#6B7280': '--text-muted', '#4B5563': '--text-secondary',
  '#64748B': '--text-muted', '#374151': '--text-secondary', '#334155': '--text-secondary',
  '#CBD5E1': '--data-diam', '#94A3B8': '--text-muted',
  // Semantik — makna cocok, bukan sekadar warna cocok.
  '#F0FDFA': '--success-bg', '#ECFEFF': '--success-bg', '#A7F3D0': '--success-border',
  '#D1FAE5': '--success-bg', '#FEE2E2': '--danger-bg', '#FFF7ED': '--warning-bg',
  '#DC2626': '--danger', '#10B981': '--success', '#EF4444': '--danger',
  '#3B82F6': '--info', '#F97316': '--data-5', '#FB923C': '--data-5',
  // Teks lencana di atas latar semantik — token `--on-*-bg` yang baru.
  // Ini sisa terbesar setelah dua penyapuan pertama, dan sebabnya jelas:
  // kelas tokennya belum ada, jadi tiap halaman menuliskan hex sendiri.
  '#92400E': '--on-warning-bg', '#B45309': '--warning', '#D97706': '--warning',
  '#065F46': '--on-success-bg', '#166534': '--on-success-bg', '#15803D': '--success',
  '#16A34A': '--success', '#991B1B': '--on-danger-bg', '#B91C1C': '--danger',
  '#1E40AF': '--on-info-bg', '#1D4ED8': '--info', '#0369A1': '--info',
  '#C2410C': '--data-5',
  // Latar lembut semantik yang tersisa.
  '#FEF3C7': '--warning-bg', '#FED7AA': '--warning-border', '#DCFCE7': '--success-bg',
  '#BBF7D0': '--success-border', '#93C5FD': '--info-border', '#FBBF24': '--warning',
  // Netral sisa.
  '#E2E8F0': '--border', '#F1F5F9': '--surface-hover', '#475569': '--text-secondary',
  '#9CA3AF': '--text-muted', '#1F2937': '--text-primary',
  '#5B21B6': '--aksen-pekat', '#C4B5FD': '--aksen-terang',
  // SENGAJA DIBIARKAN: #FCE7F3 (pink kategori, bukan bahaya),
  // #CFFAFE (cyan lembut khusus grafik).
}

if (process.argv.includes('--putusan')) {
  let diganti = 0
  const tersentuh = new Set()
  for (const [hex, token] of Object.entries(PUTUSAN)) {
    if (!TOKEN[token]) { console.log(`⚠️  token ${token} tak ada di globals.css`); continue }
    for (const p of berkasTsx) {
      let isi = readFileSync(p, 'utf8')
      const sebelum = isi
      isi = isi.replaceAll(new RegExp(`(["'\`])${hex}\\1`, 'gi'), `"var(${token})"`)
      isi = isi.replaceAll(new RegExp(`${hex}(?=[,)\\s;])`, 'gi'), `var(${token})`)
      if (isi !== sebelum) {
        const n = (sebelum.match(new RegExp(hex, 'gi')) ?? []).length
        diganti += n
        tersentuh.add(p)
        writeFileSync(p, isi)
      }
    }
  }
  console.log(`Diganti ${diganti} kemunculan di ${tersentuh.size} berkas (pemetaan berputusan).`)
} else if (process.argv.includes('--terapkan')) {
  let diganti = 0, berkasTersentuh = new Set()
  for (const c of AMAN) {
    for (const p of c.berkas.keys()) {
      let isi = readFileSync(p, 'utf8')
      const sebelum = isi
      // Ganti hanya di dalam string — hex di komentar dibiarkan sebagai jejak.
      isi = isi.replaceAll(new RegExp(`(["'\`])${c.hex}\\1`, 'gi'), `"var(${c.token})"`)
      isi = isi.replaceAll(new RegExp(`${c.hex}(?=[,)\\s;])`, 'gi'), `var(${c.token})`)
      if (isi !== sebelum) {
        writeFileSync(p, isi)
        diganti += c.berkas.get(p)
        berkasTersentuh.add(p)
      }
    }
  }
  console.log(`Diganti ${diganti} kemunculan di ${berkasTersentuh.size} berkas.`)
} else {
  const ringkas = (arr) => arr.reduce((a, c) => a + c.total, 0)
  console.log(`Token mode terang terbaca: ${Object.keys(TOKEN).length}`)
  console.log(`Hex mati unik: ${cocok.length}  ·  total kemunculan: ${ringkas(cocok)}\n`)

  console.log(`── AMAN (ΔE < 3, praktis identik) — ${AMAN.length} warna, ${ringkas(AMAN)} kemunculan ──`)
  for (const c of AMAN.slice(0, 25)) {
    console.log(`  ${c.hex} → ${c.token.padEnd(22)} ΔE ${c.dE.toFixed(1).padStart(4)}  ×${c.total}`)
  }

  console.log(`\n── KANDIDAT (ΔE 3-10, perlu diperiksa) — ${KANDIDAT.length} warna, ${ringkas(KANDIDAT)} kemunculan ──`)
  for (const c of KANDIDAT.slice(0, 20)) {
    console.log(`  ${c.hex} → ${c.token.padEnd(22)} ΔE ${c.dE.toFixed(1).padStart(4)}  ×${c.total}`)
  }

  console.log(`\n── BEDA (ΔE > 10, mungkin butuh token baru) — ${BEDA.length} warna, ${ringkas(BEDA)} kemunculan ──`)
  for (const c of BEDA.slice(0, 20)) {
    console.log(`  ${c.hex} (terdekat ${c.token}, ΔE ${c.dE.toFixed(1)})  ×${c.total}`)
  }
}
