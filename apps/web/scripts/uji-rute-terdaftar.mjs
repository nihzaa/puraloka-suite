#!/usr/bin/env node
/**
 * UJI RUTE TERDAFTAR — memastikan setiap halaman punya izin di middleware.
 *
 * ── Kenapa ada
 *
 * `middleware.ts` menyaring akses per-role lewat daftar prefiks rute. Halaman
 * baru yang tak terdaftar akan DIALIHKAN diam-diam ke home — tanpa galat,
 * tanpa 404, tanpa jejak di konsol.
 *
 * Itu terjadi pada `/mutu/ncr`: halamannya jadi, API-nya jalan, rutenya
 * benar — dan yang tampil adalah dashboard. Butuh membaca middleware untuk
 * tahu sebabnya, padahal gejalanya terlihat seperti "halamannya tidak
 * dibuat".
 *
 * Kelas kegagalan yang sama dengan endpoint salah tulis: tak ada yang rusak,
 * yang salah hanya apa yang muncul.
 *
 * ── Batasnya
 *
 * Alat ini memeriksa KETERDAFTARAN, bukan kebenaran izinnya. Rute yang
 * sengaja hanya untuk admin akan lolos selama ia ada di salah satu daftar —
 * memutuskan role mana yang berhak adalah keputusan manusia.
 *
 * Pakai (DARI ROOT REPO): node apps/web/scripts/uji-rute-terdaftar.mjs
 */
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

const AKAR_APP = join('apps', 'web', 'app')

// ── Rute halaman dari struktur berkas ─────────────────────────────────────
const halaman = []
const jelajah = (d) => {
  for (const n of readdirSync(d)) {
    if (n[0] === '.' || n === 'node_modules') continue
    const p = join(d, n)
    if (statSync(p).isDirectory()) jelajah(p)
    else if (n === 'page.tsx') halaman.push(p)
  }
}
jelajah(AKAR_APP)

// Segmen pertama saja — middleware menyaring per prefiks, bukan per halaman.
const segmenPertama = new Set()
for (const p of halaman) {
  const rute = p.split(sep).join('/')
    .replace('apps/web/app', '')
    .replace('/page.tsx', '')
    .replace(/\/\([^)]+\)/g, '')       // grup rute tak muncul di URL
  const seg = rute.split('/').filter(Boolean)[0]
  if (seg && !seg.startsWith('[')) segmenPertama.add('/' + seg)
}

// ── Prefiks yang terdaftar di middleware ──────────────────────────────────
const mw = readFileSync(join('apps', 'web', 'middleware.ts'), 'utf8')
const terdaftar = new Set()
for (const m of mw.matchAll(/["'](\/[a-z0-9-]+)["']/gi)) terdaftar.add(m[1])

/**
 * Rute yang SAH tak ada di middleware. Disebut satu per satu supaya
 * penambahan ke sini terlihat saat review.
 */
const WAJAR = new Set([
  '/login',      // titik masuk — middleware justru mengalihkan KE sini
  '/verify',     // verifikasi invoice publik, tanpa sesi
  '/uji-gulir',  // halaman uji internal
  // Pendaratan OAuth Google. Dibuka SEBELUM sesi ada — menyaringnya per-role
  // akan mengalihkan orang keluar tepat saat login hendak selesai.
  '/auth',
])

const hilang = [...segmenPertama]
  .filter((r) => !terdaftar.has(r) && !WAJAR.has(r))
  .sort()

console.log(`Segmen rute halaman : ${segmenPertama.size}`)
console.log(`Terdaftar middleware: ${[...terdaftar].filter((t) => segmenPertama.has(t)).length}`)

if (hilang.length) {
  console.log(`\n❌ ${hilang.length} rute TIDAK terdaftar di middleware.ts:\n`)
  for (const r of hilang) {
    console.log(`  ${r}`)
    const contoh = halaman
      .map((p) => p.split(sep).join('/'))
      .filter((p) => p.replace('apps/web/app', '').replace(/\/\([^)]+\)/g, '').startsWith(r))
      .slice(0, 2)
    for (const c of contoh) console.log(`     ${c}`)
  }
  console.log(
    '\nHalaman yang tak terdaftar DIALIHKAN diam-diam ke home — tanpa galat,\n' +
    'tanpa 404. Tambahkan ke `ROLE_ALLOWED` untuk role yang berhak membukanya.\n' +
    'Kalau memang sengaja publik, tambahkan ke daftar WAJAR di berkas ini.',
  )
  process.exit(1)
}

console.log('\n✓ Semua rute halaman terdaftar di middleware.')
