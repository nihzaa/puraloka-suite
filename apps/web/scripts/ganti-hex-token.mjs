#!/usr/bin/env node
// ============================================================================
// F4-1 — GANTI hex yang punya padanan token, satu berkas per jalan.
//
//   node scripts/ganti-hex-token.mjs <berkas>            # pratinjau saja
//   node scripts/ganti-hex-token.mjs <berkas> --tulis    # benar-benar ganti
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA SATU BERKAS PER JALAN, BUKAN SEKALIGUS
// ══════════════════════════════════════════════════════════════════════════
//
// 391 penggantian di 60 berkas dalam satu perintah berarti satu kesalahan
// mustahil dilacak. Aturan F2-3 sudah membuktikan ongkosnya ("tiap langkah
// terpisah"), dan warna punya masalah tambahan: kegagalannya TAK MEMBUAT
// TEST MERAH. Ia hanya membuat tampilan salah, dan yang menyadarinya pemakai.
//
// ── Yang membuat penggantian ini AMAN
//
// Hanya hex yang nilainya PERSIS SAMA dengan sebuah token yang diganti.
// `#E5E7EB` → `var(--border)` tak mengubah piksel apa pun di tema terang.
//
// ⚠️ Tetapi ia MENGUBAH perilaku di tema gelap — dan itu justru maksudnya.
// `--border` bernilai #2A2D3E di gelap, sementara `#E5E7EB` mentah tetap
// terang di kedua tema. Jadi penggantian ini memperbaiki tema gelap yang
// selama ini rusak diam-diam di berkas-berkas itu.
//
// ── Yang TIDAK disentuh
//
//   · `globals.css` — di sanalah token didefinisikan
//   · hex tanpa padanan token — butuh keputusan, bukan penggantian
//   · hex di dalam komentar — bukan nilai yang dipakai
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Peta token — logika sama dengan peta-hex-token.mjs, dan alasan pemotongan
// bloknya ditulis lengkap di sana.
const css = readFileSync(join(WEB, 'app', 'globals.css'), 'utf8')
const mulai = css.indexOf(':root')
const gelap = (() => {
  const k = [
    css.indexOf('prefers-color-scheme: dark'),
    css.indexOf('[data-theme="dark"]'),
    css.indexOf("[data-theme='dark']"),
  ].filter((i) => i > mulai)
  return k.length ? Math.min(...k) : css.length
})()
const light = css.slice(mulai, gelap)

const tokenDari = new Map()
for (const m of light.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
  const hex = m[2].toUpperCase()
  if (!tokenDari.has(hex)) tokenDari.set(hex, m[1])
}

const target = process.argv[2]
if (!target) {
  console.error('pakai: node scripts/ganti-hex-token.mjs <berkas> [--tulis]')
  process.exit(1)
}

const path = resolve(WEB, target)
if (path.endsWith('globals.css')) {
  console.error('❌ globals.css adalah SUMBER token — jangan diganti.')
  process.exit(1)
}

const asli = readFileSync(path, 'utf8')
const baris = asli.split('\n')
const ubah = []

const hasil = baris.map((teks, i) => {
  // Lewati baris komentar — hex di sana bukan nilai yang dipakai.
  const bersih = teks.trim()
  if (bersih.startsWith('//') || bersih.startsWith('*') || bersih.startsWith('/*')) return teks

  return teks.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => {
    const nama = tokenDari.get(hex.toUpperCase())
    if (!nama) return hex
    ubah.push(`  ${String(i + 1).padStart(4)}  ${hex} → var(--${nama})`)
    return `var(--${nama})`
  })
}).join('\n')

if (!ubah.length) {
  console.log('  nol hex ber-padanan di berkas ini.')
  process.exit(0)
}

console.log(`  ${ubah.length} penggantian di ${target}:\n`)
for (const u of ubah.slice(0, 40)) console.log(u)
if (ubah.length > 40) console.log(`  … ${ubah.length - 40} lagi`)

if (process.argv.includes('--tulis')) {
  writeFileSync(path, hasil)
  console.log(`\n  ✅ ditulis. Jalankan typecheck + lint sebelum commit.`)
} else {
  console.log(`\n  (pratinjau — tambahkan --tulis untuk benar-benar mengganti)`)
}
