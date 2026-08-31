#!/usr/bin/env node
/**
 * Memangkas workspace `apps/web-publik` dari lockfile — hanya di server EAS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Build APK kesebelas dan kedua belas gagal dengan galat yang sama:
 *
 *     PackageList.java:16: error: cannot find symbol
 *     import expo.core.ExpoModulesPackage;
 *
 * `expo.core.ExpoModulesPackage` adalah kelas yang tak ada. Kelasnya nyata,
 * hanya di paket lain — diukur di disk:
 *
 *     .pnpm/expo@53.0.27_*\/node_modules/expo/android/src/main/java/
 *       expo/modules/ExpoModulesPackage.kt
 *
 * `expo.modules`, bukan `expo.core`. Autolinking menghasilkan impor untuk
 * tata letak paket LAMA.
 *
 * ── Lacakannya, dan dua hipotesis yang SALAH lebih dulu
 *
 * Hipotesis 1: ada paket warisan (`expo-core`, `@unimodules/*`) di
 * package.json mobile. DIPERIKSA — nol. Dua puluh tiga dependensi,
 * semuanya modern.
 *
 * Hipotesis 2: `react-native-webview` bercabang dua versi (13.13.5 dan
 * 14.0.1). Nyata, dan sudah dipaku — build kedua belas TETAP gagal dengan
 * galat yang sama persis. Duplikasi itu ada, tetapi bukan penyebabnya.
 *
 * Sebab sesungguhnya, dilacak dari log build ke induk di lockfile:
 *
 *     apps/web-publik  →  @react-three/fiber@9.7.0
 *
 * `@react-three/fiber` mendeklarasikan `expo`, `expo-asset`,
 * `expo-file-system`, `expo-gl`, dan `react-native` sebagai peer OPSIONAL —
 * supaya paket 3D yang sama bisa dipakai di React Native. Karena semuanya
 * kebetulan ada di workspace ini (dipakai apps/mobile), pnpm memenuhinya:
 *
 *     react-native@0.79.6 + react@19.0.0    98 resolusi  ← mobile, BENAR
 *     react-native@0.79.6 + react@19.2.4    32 resolusi  ← lahir dari fiber
 *
 * Dua pohon Expo paralel. Autolinking Android memindai node_modules dan
 * memungut salah satunya; yang salah membawa tata letak paket Java lama.
 *
 * ── Bukti, bukan dugaan
 *
 * Diukur di salinan terpisah (E:\tmp\ujipeer) — `apps/web-publik` dibuang,
 * lockfile dibangun ulang:
 *
 *     sebelum   rn+19.2.4 = 32   expo entri = 3
 *     sesudah   rn+19.2.4 =  0   expo entri = 2
 *
 * ── Tiga jalan yang dicoba lebih dulu, dan kenapa gagal
 *
 *   1. `ignoredOptionalDependencies` di pnpm-workspace.yaml
 *      → pnpm MEMBACANYA (tercatat di lockfile) tetapi pohonnya tak
 *        berubah, bahkan sesudah lockfile dibangun dari nol. Kunci itu
 *        untuk `optionalDependencies`, BUKAN peer opsional. Dicabut.
 *
 *   2. `peerDependencyRules.ignoreMissing`
 *      → untuk peer yang HILANG, bukan yang hadir dan tak diinginkan.
 *        rn+19.2.4 tetap 32. Dicabut.
 *
 *   3. Mengosongkan `dependencies` workspace non-mobile di server
 *      → `pnpm install --frozen-lockfile` menolak: "specifiers in the
 *        lockfile don't match specifiers in package.json — 32 dependencies
 *        were removed". Lockfile beku menuntut kecocokan persis.
 *
 * Yang tersisa: buang workspace-nya UTUH — dari daftar `packages:`, dari
 * `importers:` lockfile, dan foldernya dari kiriman (.easignore). Ketiganya
 * harus sejalan, atau pnpm menolak dengan galat yang menuduh hal lain.
 *
 * ── Kenapa membuang fiber dari compro BUKAN pilihan
 *
 * `apps/web-publik/components/adegan/Massing.tsx` benar-benar memakainya
 * untuk WebGL. Itu pekerjaan sesi lain, dan compro memang butuh 3D.
 *
 * Yang tak dibutuhkan compro adalah Expo dan React Native — peer itu ada
 * semata supaya paket yang sama bisa dipakai di aplikasi RN.
 *
 * ── Dan kenapa web-publik boleh dibuang dari build MOBILE
 *
 * Yang dirakit APK cuma `apps/mobile`. Compro tak dipakai, tak diimpor,
 * dan tak punya kode native. Membuangnya dari kiriman tak mengubah satu
 * baris pun yang masuk ke dalam APK — ia hanya berhenti mencemari pohon
 * dependensi.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
  ⚠ HANYA jalan di server EAS Build.

  Skrip ini MENULIS pnpm-lock.yaml dan pnpm-workspace.yaml di tempatnya.
  Menjalankannya dari mesin pengembang akan memangkas workspace repo
  sungguhan — kesalahan yang sudah benar-benar terjadi dengan skrip
  saudaranya (dua kali, 2026-09-01; `git checkout` menyelamatkannya).
*/
if (!process.env.EAS_BUILD && !process.env.PAKSA_PANGKAS_WEB_PUBLIK) {
  console.log('[eas-pangkas] bukan di server EAS (EAS_BUILD kosong) — dilewati.')
  console.log('   Untuk menguji: PAKSA_PANGKAS_WEB_PUBLIK=1, dan bekerjalah di')
  console.log('   SALINAN — skrip ini menulis lockfile di tempatnya.')
  process.exit(0)
}

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCK = join(AKAR, 'pnpm-lock.yaml')
const WS = join(AKAR, 'pnpm-workspace.yaml')

const NL = String.fromCharCode(10)
const BUANG = 'apps/web-publik'

console.log(`[eas-pangkas] memangkas ${BUANG} dari lockfile & workspace`)

if (!existsSync(LOCK) || !existsSync(WS)) {
  console.log('[eas-pangkas] lockfile atau workspace.yaml tak ada — dilewati.')
  process.exit(0)
}

/* ── 1. Buang blok importer `apps/web-publik:` dari lockfile ────────────
 *
 * Bentuknya di lockfile v9:
 *
 *     importers:
 *       .:
 *         ...
 *       apps/web-publik:
 *         dependencies:
 *           ...
 *       apps/mobile:
 *
 * Blok berakhir saat muncul baris berindentasi 2 spasi berikutnya, atau
 * saat `importers:` habis.
 */
const baris = readFileSync(LOCK, 'utf8').split(NL).map((b) => b.replace(/[\r]/g, ''))

const iImporters = baris.findIndex((l) => l === 'importers:')
if (iImporters < 0) {
  console.error('[eas-pangkas] `importers:` tak ada di lockfile — bentuk tak dikenali.')
  console.error('   Berhenti TANPA mengubah apa pun. Nol perubahan lebih baik')
  console.error('   daripada lockfile yang dipotong di tempat yang salah.')
  process.exit(1)
}

const iMulai = baris.findIndex((l, i) => i > iImporters && l === `  ${BUANG}:`)
if (iMulai < 0) {
  console.log(`[eas-pangkas] ${BUANG} tak ada di importers — sudah bersih.`)
} else {
  let iAkhir = baris.length
  for (let i = iMulai + 1; i < baris.length; i++) {
    const l = baris[i]
    if (!l.trim()) continue
    // baris berindentasi TEPAT 2 spasi = importer berikutnya;
    // baris tanpa indentasi = kunci tingkat-atas berikutnya
    if (/^ {2}\S/.test(l) || /^\S/.test(l)) { iAkhir = i; break }
  }
  const dibuang = iAkhir - iMulai
  baris.splice(iMulai, dibuang)
  writeFileSync(LOCK, baris.join(NL), 'utf8')
  console.log(`[eas-pangkas] ${dibuang} baris importer dibuang dari lockfile`)
}

/* ── 2. Daftar workspace jadi EKSPLISIT, tanpa web-publik ──────────────
 *
 * `apps/*` akan memungut web-publik lagi kalau foldernya ikut terkirim.
 * .easignore membuangnya, tetapi mengandalkan itu saja membuat dua berkas
 * harus sepakat tanpa ada yang memeriksanya. Lebih aman menyebutkan
 * daftarnya di sini.
 */
const isiWs = readFileSync(WS, 'utf8')
const barisWs = isiWs.split(NL).map((b) => b.replace(/[\r]/g, ''))
const iPkg = barisWs.findIndex((l) => l === 'packages:')

if (iPkg < 0) {
  console.error('[eas-pangkas] `packages:` tak ada di pnpm-workspace.yaml.')
  process.exit(1)
}

let iPkgAkhir = barisWs.length
for (let i = iPkg + 1; i < barisWs.length; i++) {
  const l = barisWs[i]
  if (l && !/^\s/.test(l)) { iPkgAkhir = i; break }
}

const gantiPkg = [
  'packages:',
  "  - 'apps/api'",
  "  - 'apps/mobile'",
  "  - 'apps/web'",
  "  - 'packages/*'",
]

barisWs.splice(iPkg, iPkgAkhir - iPkg, ...gantiPkg)
writeFileSync(WS, barisWs.join(NL), 'utf8')
console.log('[eas-pangkas] daftar packages jadi eksplisit (tanpa web-publik)')

console.log('[eas-pangkas] selesai.')
