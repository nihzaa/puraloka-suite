#!/usr/bin/env node
/**
 * PENJAGA — lambang mobile wajib SAMA dengan lambang web.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `buat-aset-merek.mjs` dan `components/SplashMerek.tsx` menyalin bentuk
 * lambang dari `apps/web/public/puraloka-lambang.svg`. Salinan tanpa penjaga
 * adalah janji, bukan fakta: kalau lambang web diperbarui, tak ada apa pun
 * yang memberi tahu bahwa HP mandor masih membawa bentuk lama.
 *
 * Ini kelas cacat yang SUDAH tercatat di repo ini — `logo-puraloka.tsx`
 * menuliskannya sendiri: *"berkas yang terpisah selalu lupa diperbarui
 * bersama-sama."* Web memilih SVG sebaris supaya tak ada salinan. Mobile tak
 * bisa: Expo menuntut PNG, dan React Native tak membaca SVG tanpa dependensi
 * tambahan. Jadi salinannya tak terhindarkan — yang bisa dihindari adalah
 * salinan yang MENYIMPANG DIAM-DIAM.
 *
 * ── Yang diperiksa, dan yang TIDAK
 *
 * Diperiksa: kedelapan `d=` di web ada persis di skrip aset mobile.
 *
 * TIDAK diperiksa: apakah PNG-nya sudah dibangkitkan ulang sesudah path
 * berubah. Itu butuh membandingkan piksel, dan hasilnya bergantung versi
 * peramban — penjaga yang merah karena Chromium naik versi akan dimatikan
 * orang, dan penjaga yang dimatikan tak menjaga apa pun.
 *
 * Ambang: NOL selisih.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const AKAR = join(DIR, '..', '..', '..')

const SUMBER = join(AKAR, 'apps', 'web', 'public', 'puraloka-lambang.svg')
const SALINAN = [
  join(AKAR, 'apps', 'mobile', 'scripts', 'buat-aset-merek.mjs'),
]

/** Semua nilai `d="..."` dalam sebuah berkas, apa pun bentuk kutipnya. */
function ambilPath(teks) {
  return [...teks.matchAll(/d="([^"]+)"/g)].map((m) => m[1].trim())
              .concat([...teks.matchAll(/'(M[^']*?z)'/g)].map((m) => m[1].trim()))
}

const webPath = [...new Set(ambilPath(readFileSync(SUMBER, 'utf8')))]

console.log('\n== Lambang mobile sinkron dengan web ==========================\n')
console.log(`  sumber : apps/web/public/puraloka-lambang.svg (${webPath.length} path)`)

if (webPath.length === 0) {
  console.error('\n  GAGAL: tak satu pun path terbaca dari lambang web.')
  console.error('  Nol hasil BUKAN bukti ketiadaan — periksa dulu bentuk berkasnya.\n')
  process.exit(1)
}

let hilangTotal = 0
for (const berkas of SALINAN) {
  const isi = readFileSync(berkas, 'utf8')
  const hilang = webPath.filter((d) => !isi.includes(d))
  const nama = berkas.replace(AKAR, '').replace(/\\/g, '/').replace(/^\//, '')
  if (hilang.length === 0) {
    console.log(`  OK     ${nama} — ${webPath.length}/${webPath.length} cocok`)
  } else {
    console.log(`  BEDA   ${nama} — ${hilang.length} path tak ditemukan:`)
    hilang.forEach((d) => console.log(`           ${d.slice(0, 62)}...`))
    hilangTotal += hilang.length
  }
}

console.log(`\n  selisih : ${hilangTotal} (ambang 0)\n`)

if (hilangTotal > 0) {
  console.error('  Lambang web berubah tetapi salinan mobile tidak ikut.')
  console.error('  Perbarui BADAN/ALAS di apps/mobile/scripts/buat-aset-merek.mjs')
  console.error('  dan components/SplashMerek.tsx, lalu jalankan:')
  console.error('    node apps/mobile/scripts/buat-aset-merek.mjs\n')
  process.exit(1)
}
