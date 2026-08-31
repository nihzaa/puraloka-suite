#!/usr/bin/env node
/**
 * Tiap modul WebView mobile wajib menunjuk halaman web yang BENAR-BENAR ADA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Layar "Lainnya" di mobile menampilkan daftar modul kantor; menekan satu
 * membuka halaman web di dalam WebView. Kalau jalurnya tak punya
 * `page.tsx`, yang terbuka adalah 404 Next.js — di dalam bingkai aplikasi,
 * tanpa tombol kembali yang jelas, dan tanpa penjelasan apa pun.
 *
 * Yang membuatnya mudah terjadi: peta modul ada di `web/[modul].tsx` dan
 * halaman webnya di `apps/web/app/(dashboard)/`. Dua tempat, dua orang,
 * tak ada yang menghubungkan. Menghapus atau memindahkan satu halaman web
 * tak menimbulkan galat apa pun di sisi mobile.
 *
 * Diukur 2026-08-31 saat lima modul lapangan ditambahkan: kelimanya nyata
 * (lapangan 528 baris, k3 853, proyek 713, kalender 449, risiko 889).
 * Penjaga ini mengunci keadaan itu.
 *
 * ── Dua arah yang diperiksa
 *
 *   1. tiap `jalur` di peta MODUL punya `page.tsx`   -> kalau tidak, 404
 *   2. tiap `kunci` di daftar "Lainnya" ada di peta MODUL, kecuali yang
 *      punya `nativeJalur`                            -> kalau tidak,
 *      layar WebView menampilkan "tidak ada dalam daftar modul"
 *
 * Arah kedua pernah hampir terjadi: `approval` memakai kunci yang berbeda
 * dari jalurnya (`/approval-inbox`), dan pengukur yang menebak jalur dari
 * kunci akan salah. Karena itu yang dibaca peta MODUL, bukan kuncinya.
 *
 * ── Ambang NOL
 *
 * Modul yang menuju 404 tak punya keadaan "boleh sedikit". Satu saja sudah
 * mengajari orang bahwa aplikasinya tak bisa dipercaya.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const JEMBATAN = join(AKAR, 'apps', 'mobile', 'app', '(app)', 'web', '[modul].tsx')
const LAINNYA = join(AKAR, 'apps', 'mobile', 'app', '(app)', 'lainnya.tsx')
const DASH = join(AKAR, 'apps', 'web', 'app', '(dashboard)')

const jembatan = readFileSync(JEMBATAN, 'utf8')
const lainnya = readFileSync(LAINNYA, 'utf8')

/** Peta MODUL: kunci -> jalur. */
const modul = new Map()
for (const m of jembatan.matchAll(/^\s*([a-z0-9-]+):\s*\{\s*judul:\s*'[^']*',\s*jalur:\s*'([^']+)'/gm)) {
  modul.set(m[1], m[2])
}

/** Kunci yang dipakai daftar "Lainnya", dan mana yang native. */
const entri = []
for (const m of lainnya.matchAll(/kunci:\s*'([a-z0-9-]+)'/g)) entri.push(m[1])
const native = new Set()
for (const m of lainnya.matchAll(/kunci:\s*'([a-z0-9-]+)'[\s\S]{0,220}?nativeJalur:/g)) native.add(m[1])

if (modul.size < 5) {
  console.error(`❌ Cuma ${modul.size} modul terbaca dari peta — polanya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}
if (entri.length < 5) {
  console.error(`❌ Cuma ${entri.length} entri terbaca dari lainnya.tsx — polanya meleset.`)
  process.exit(1)
}

const buntu = []
for (const [kunci, jalur] of modul) {
  const hal = join(DASH, jalur.replace(/^\//, ''), 'page.tsx')
  if (!existsSync(hal)) buntu.push({ kunci, jalur, sebab: 'halaman web tak ada -> 404' })
}

const takTerdaftar = []
for (const k of entri) {
  if (native.has(k)) continue
  if (!modul.has(k)) takTerdaftar.push(k)
}

console.log('══ Modul mobile menunjuk halaman nyata ════════════════════════')
console.log(`  modul di peta WebView : ${modul.size}`)
console.log(`  entri di "Lainnya"    : ${entri.length} (${native.size} native)`)
console.log(`  jalur buntu (404)     : ${buntu.length}`)
console.log(`  entri tak terdaftar   : ${takTerdaftar.length}`)

if (buntu.length || takTerdaftar.length) {
  console.log('')
  for (const b of buntu) console.log(`  ❌ ${b.kunci.padEnd(14)} ${b.jalur.padEnd(20)} ${b.sebab}`)
  for (const k of takTerdaftar) {
    console.log(`  ❌ ${k.padEnd(14)} ada di "Lainnya" tetapi tidak di peta MODUL —`)
    console.log(`     ${''.padEnd(14)} layar WebView menolaknya: "tidak ada dalam daftar modul"`)
  }
  console.log('')
  console.log('  Modul buntu membuka 404 Next.js DI DALAM bingkai aplikasi —')
  console.log('  tanpa tombol kembali yang jelas dan tanpa penjelasan apa pun.')
  console.log('')
  process.exit(1)
}

console.log('')
console.log(`✅ ${modul.size} modul, semuanya menunjuk halaman web yang ada.`)
