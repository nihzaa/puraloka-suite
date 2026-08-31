#!/usr/bin/env node
/**
 * Versi paket mobile wajib cocok dengan Expo SDK yang dipakai.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-31, pertama kalinya `expo export` dijalankan di repo ini:
 *
 *     Android Bundling failed 4257ms (1059 modules)
 *     SyntaxError: react-native-screens/src/fabric/SearchBarNativeComponent.ts
 *       Unknown prop type for "onSearchFocus": "undefined"
 *
 * Aplikasi mobile TAK PERNAH BISA DI-BUILD. Bukan karena kode — `expo
 * install --check` menyebut SEBELAS paket tak cocok dengan Expo 53, termasuk
 * React (18 vs 19), React Native (0.76 vs 0.79), dan expo-router (4 vs 5,
 * beda MAYOR).
 *
 * Yang membuatnya bertahan begitu lama: `tsc` hijau, 16 layar typecheck
 * bersih, seluruh penjaga mobile hijau. Tak satu pun menjalankan Metro.
 * TypeScript memeriksa tipe; ia tak tahu apa-apa soal transformasi Babel
 * yang gagal pada berkas di dalam node_modules.
 *
 * Satu keluarga dengan cacat lain yang ditemukan hari ini: `template_penerapan`
 * (tenant-map yakin tabelnya ada, basis tidak) dan pgvector (dev selalu
 * punya ekstensinya, target restore tidak). Benar di satu lapis, patah di
 * lapis yang sesungguhnya dipakai.
 *
 * ── Kenapa memeriksa `package.json`, bukan menjalankan `expo install --check`
 *
 * Perintah itu menyentuh jaringan dan butuh registry — di CI itu lambat dan
 * bisa gagal karena hal yang tak ada hubungannya. Yang dijaga di sini
 * PERJANJIANNYA: daftar versi yang dituntut Expo SDK ini, ditulis eksplisit,
 * dan dibandingkan dengan apa yang benar-benar tertulis di package.json.
 *
 * Konsekuensinya: daftar di bawah HARUS diperbarui saat Expo SDK dinaikkan.
 * Itu disengaja — kenaikan SDK adalah keputusan yang memang harus dilihat
 * orang, bukan sesuatu yang diserap diam-diam.
 *
 * ── Cara memperbarui daftarnya
 *
 *     cd apps/mobile && npx expo install --check
 *
 * Tempel keluarannya ke `DITUNTUT` di bawah, lalu jalankan `expo install
 * --fix` supaya package.json menyusul.
 *
 * ── Dan satu pelajaran yang jadi sebab langsung penjaga ini
 *
 * `react-native-webview` dipasang 2026-08-31 dengan `pnpm add` biasa, dan
 * mendapat 14.0.1 — sementara Expo 53 menuntut 13.13.5. Untuk paket yang
 * dikenal Expo, `npx expo install <paket>` memilih versi yang cocok;
 * `pnpm add` memilih yang terbaru. Bedanya tak terlihat sampai Metro
 * berjalan.
 */
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const PKG = join(AKAR, 'apps', 'mobile', 'package.json')

/**
 * Versi yang dituntut Expo SDK 53, dari `npx expo install --check`
 * (diukur 2026-08-31). Kunci = nama paket, nilai = versi yang diharapkan
 * tanpa penanda rentang.
 */
const SDK = '53'
const DITUNTUT = {
  'react': '19.0.0',
  'react-native': '0.79.6',
  'expo-router': '5.1.11',
  'react-native-screens': '4.11.1',
  'react-native-safe-area-context': '5.4.0',
  'react-native-webview': '13.13.5',
  'expo-camera': '16.1.11',
  'expo-splash-screen': '0.30.10',
  '@react-native-async-storage/async-storage': '2.1.2',
  '@types/react': '19.0.10',
  'typescript': '5.8.3',
}

const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
const semua = { ...pkg.dependencies, ...pkg.devDependencies }

/* Expo SDK yang benar-benar dipakai — daftar di atas hanya sah untuknya. */
const expoTerpasang = (semua.expo ?? '').replace(/[~^]/g, '')
if (!expoTerpasang.startsWith(SDK + '.')) {
  console.error(`❌ Daftar versi di penjaga ini untuk Expo ${SDK}, tetapi package.json memakai ${expoTerpasang || '(tak ada)'}.`)
  console.error('')
  console.error('   Perbarui DITUNTUT dari:  cd apps/mobile && npx expo install --check')
  console.error('   Daftar yang tertinggal SDK akan menjaga hal yang salah — dan itu')
  console.error('   lebih buruk daripada tak menjaga apa pun.')
  process.exit(1)
}

const bersih = (v) => String(v).replace(/^[~^>=<\s]+/, '')

/**
 * Cocok atau tidak — dan ini TIDAK boleh perbandingan string.
 *
 * `expo install --fix` sendiri menulis `~19.0.14` untuk paket yang dituntut
 * `~19.0.10`, karena tilde mengizinkan patch lebih tinggi. Versi pertama
 * penjaga ini membandingkan string dan melaporkannya sebagai pelanggaran —
 * merah untuk keadaan yang justru dihasilkan perintah perbaikannya sendiri.
 *
 * Aturannya: mayor dan minor WAJIB sama, patch boleh >= yang dituntut.
 * Perbedaan mayor/minor itulah yang mematahkan bundling (react-native-screens
 * 4.25 vs 4.11, expo-router 4 vs 5); patch tidak.
 */
function cocok(ada, harap) {
  const a = bersih(ada).split('.').map(Number)
  const h = harap.split('.').map(Number)
  if (a[0] !== h[0] || a[1] !== h[1]) return false
  return (a[2] ?? 0) >= (h[2] ?? 0)
}

const tidakCocok = []
const tidakAda = []

for (const [nama, harap] of Object.entries(DITUNTUT)) {
  const ada = semua[nama]
  if (!ada) { tidakAda.push(nama); continue }
  if (!cocok(ada, harap)) tidakCocok.push({ nama, ada: bersih(ada), harap })
}

console.log(`══ Versi paket mobile vs Expo SDK ${SDK} ═══════════════════════`)
console.log(`  expo terpasang  : ${expoTerpasang}`)
console.log(`  paket diperiksa : ${Object.keys(DITUNTUT).length}`)
console.log(`  tidak cocok     : ${tidakCocok.length}`)
if (tidakAda.length) console.log(`  tidak terpasang : ${tidakAda.length} (${tidakAda.join(', ')})`)

if (tidakCocok.length > 0) {
  console.log('')
  for (const t of tidakCocok) {
    console.log(`  ❌ ${t.nama.padEnd(42)} ${t.ada.padStart(8)} → ${t.harap}`)
  }
  console.log('')
  console.log('  Versi yang tak cocok TIDAK terlihat dari `tsc` — TypeScript memeriksa')
  console.log('  tipe, bukan transformasi Babel di dalam node_modules. Yang gagal')
  console.log('  adalah `expo export`, dan itu berarti aplikasinya tak bisa jadi APK.')
  console.log('')
  console.log('  Perbaikan:  cd apps/mobile && npx expo install --fix')
  console.log('  Lalu BUKTIKAN:  npx expo export --platform android')
  console.log('')
  console.log(`❌ ${tidakCocok.length} paket tak cocok dengan Expo ${SDK}.`)
  process.exit(1)
}

console.log('')
console.log(`✅ ${Object.keys(DITUNTUT).length} paket cocok dengan Expo ${SDK}.`)
