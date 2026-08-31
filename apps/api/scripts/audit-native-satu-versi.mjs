#!/usr/bin/env node
/**
 * Paket ber-KODE NATIVE wajib hanya SATU versi di seluruh workspace.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Build APK kesebelas gagal di RUN_GRADLEW — tahap terjauh yang pernah
 * dicapai, sesudah sepuluh kegagalan sebelumnya:
 *
 *     PackageList.java:16: error: cannot find symbol
 *     import expo.core.ExpoModulesPackage;
 *     Execution failed for task ':app:compileReleaseJavaWithJavac'
 *
 * `expo.core.ExpoModulesPackage` adalah kelas yang sudah DIBUANG Expo
 * modern. Galatnya menuduh kode Java yang tak seorang pun tulis — berkas
 * `PackageList.java` itu DIHASILKAN autolinking.
 *
 * ── Kenapa dugaan pertama salah
 *
 * Tebakan yang wajar: ada paket warisan di `package.json`. Diperiksa —
 * `expo-core`, `@unimodules/*`, `react-native-unimodules`, `expo-random`,
 * `expo-permissions`: NOL. Dua puluh tiga dependensi, semuanya modern.
 *
 * Sebab sesungguhnya ada di LOCKFILE, bukan di package.json:
 *
 *     react-native-webview@13.13.5 + @types/react@19.0.14 + react@19.0.0
 *     react-native-webview@14.0.1  + @types/react@19.2.17 + react@19.2.4
 *
 * Dua pohon dependensi paralel. Autolinking Android memindai
 * `node_modules` dan memungut versi mana pun yang ditemuinya lebih dulu.
 *
 * ── Kenapa membangun ulang lockfile TIDAK menolong
 *
 * `rm pnpm-lock.yaml && pnpm install` dicoba: duplikasinya BERTAHAN. Itu
 * petunjuk pentingnya — ini bukan sisa pemasangan lama, melainkan lahir
 * dari dua tuntutan yang sama-sama SAH:
 *
 *     apps/web      react 19.2.4   (Next.js)
 *     apps/mobile   react 19.0.0   (dikunci Expo 53)
 *
 * Dua React itu MEMANG BOLEH berbeda — satu untuk DOM, satu untuk native.
 * Yang tak boleh berbeda adalah paket yang punya kode native, karena
 * hanya SATU yang bisa dirakit ke dalam APK.
 *
 * Maka penjaga ini TIDAK memeriksa react. Memaksa react satu versi akan
 * merusak salah satu sisi — dan itulah yang membuat cacat ini tak bisa
 * diperbaiki dengan "samakan saja semuanya".
 *
 * ── Kenapa tak terlihat dari mana pun di mesin ini
 *
 * `tsc` hijau. Test hijau. `pnpm install` hijau. Metro bundler di
 * pengembangan hijau — ia memakai JavaScript, dan JS dari dua versi
 * webview sama-sama jalan. Yang patah cuma perakitan Android, di server,
 * dua puluh menit kemudian, dengan galat yang menyebut nama kelas Java.
 *
 * ── Yang DIJAGA, dan yang TIDAK
 *
 * DIJAGA: tiap paket native yang dipakai mobile hanya punya satu versi
 * di lockfile.
 *
 * TIDAK DIJAGA: bahwa build-nya berhasil. Penjaga CI tak punya kredensial
 * Expo, dan perakitan Android punya banyak cara lain untuk gagal. Batas
 * itu disebutkan supaya hijaunya tak dibaca sebagai "APK pasti jadi".
 *
 * ── Ambang NOL
 *
 * Satu paket native bercabang dua sudah cukup mematikan perakitan, dan
 * gejalanya menunjuk berkas yang tak seorang pun tulis.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const LOCK = join(AKAR, 'pnpm-lock.yaml')
const PKG_MOB = join(AKAR, 'apps', 'mobile', 'package.json')

for (const [nama, p] of [['pnpm-lock.yaml', LOCK], ['apps/mobile/package.json', PKG_MOB]]) {
  if (!existsSync(p)) {
    console.error(`❌ ${nama} tak ada di ${p} — jalurnya meleset.`)
    console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
    process.exit(1)
  }
}

/*
  Dependensi mobile jadi korpusnya — bukan daftar tulisan tangan.

  Daftar tangan hanya menjaga yang didaftarkan, dan paket native yang
  ditambahkan besok tak akan masuk. Kelas kesalahan yang sama dengan
  `audit-batas-terpetakan`: penjaga yang tak bisa tahu dirinya tertinggal
  akan pelan-pelan berhenti menjaga tanpa gejala.
*/
const pkgMob = JSON.parse(readFileSync(PKG_MOB, 'utf8'))
const deps = Object.keys({ ...pkgMob.dependencies, ...pkgMob.devDependencies })

/*
  Paket yang TIDAK punya kode native, jadi dua versinya tak merusak APK.

  `react` dan `react-dom` justru WAJIB boleh bercabang: web memakai
  19.2.4, mobile dikunci 19.0.0 oleh Expo. Memasukkan keduanya ke sini
  akan membuat penjaga menuntut perbaikan yang merusak salah satu sisi.
*/
const MURNI_JS = new Set([
  'react', 'react-dom', 'react-native-web',
  '@types/react', '@types/react-dom',
  'typescript', 'axios', 'zod', 'dayjs', 'date-fns',
  '@babel/core', 'babel-preset-expo',
])

const native = deps.filter((d) => !MURNI_JS.has(d) && !d.startsWith('@types/'))

if (native.length === 0) {
  console.error('❌ Nol paket native terbaca dari apps/mobile/package.json.')
  console.error('   Hijau dari korpus kosong adalah kebohongan.')
  process.exit(1)
}

const lock = readFileSync(LOCK, 'utf8')

/*
  ⚠ CR dibuang sebelum memisah baris.

  Lockfile bisa CRLF di disk, dan pemeriksaan akhir-baris tak pernah
  cocok dengan `nama@1.2.3:\r`. Versi begitu memulangkan "nol versi
  ditemukan" dan terlihat hijau. Nol hasil bukan bukti ketiadaan — kelas
  kesalahan yang menggigit repo ini lima kali dalam satu sesi
  (CLAUDE.md §7a).
*/
const barisLock = lock.replace(/\r/g, '').split(String.fromCharCode(10))

/** Versi yang tercatat di blok `packages:` lockfile, untuk satu nama paket. */
function versiDi(nama) {
  const awalan = '  ' + nama + '@'
  const versi = new Set()
  for (const l of barisLock) {
    if (!l.startsWith(awalan)) continue
    const sisa = l.slice(awalan.length)
    // `nama@1.2.3:` — entri paket. `nama@1.2.3(peer)...` — resolusi peer.
    const m = sisa.match(/^([0-9][^(:\s]*)[(:]/)
    if (m) versi.add(m[1])
  }
  return [...versi].sort()
}

const temuan = []
let terbaca = 0

console.log('══ Paket native satu versi ════════════════════════════════════')
console.log(`  dependensi mobile  : ${deps.length}`)
console.log(`  berpotensi native  : ${native.length}`)
console.log('')

for (const nama of native) {
  const v = versiDi(nama)
  if (v.length === 0) continue
  terbaca++
  if (v.length > 1) {
    console.log(`  ❌ ${nama.padEnd(30)} ${v.join(' · ')}`)
    temuan.push({ nama, versi: v })
  }
}

if (terbaca === 0) {
  console.error('')
  console.error('❌ Nol paket terbaca dari lockfile padahal dependensinya ada —')
  console.error('   polanya meleset. Hijau dari korpus kosong bukan bukti.')
  process.exit(1)
}

console.log(`  terbaca di lockfile: ${terbaca}`)
console.log(`  bercabang          : ${temuan.length}`)

if (temuan.length > 0) {
  console.log('')
  for (const t of temuan) {
    console.log(`  ❌ ${t.nama} punya ${t.versi.length} versi: ${t.versi.join(', ')}`)
    console.log(`     → paku satu versi di \`overrides\` pnpm-workspace.yaml`)
  }
  console.log('')
  console.log('  Autolinking Android memindai node_modules dan memungut versi')
  console.log('  mana pun yang ditemuinya. Gejalanya bukan galat versi, melainkan')
  console.log('  kelas Java yang tak ada — di berkas yang tak seorang pun tulis:')
  console.log('')
  console.log('      PackageList.java: cannot find symbol')
  console.log('      import expo.core.ExpoModulesPackage;')
  console.log('')
  console.log('  Tak terlihat dari tsc, test, atau Metro — JS dari dua versi')
  console.log('  sama-sama jalan. Yang patah cuma perakitan APK di server.')
  console.log('')
  process.exit(1)
}

console.log('')
console.log(`✅ ${terbaca} paket native, semuanya satu versi.`)
