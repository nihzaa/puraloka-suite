#!/usr/bin/env node
/**
 * Menormalkan `pnpm-lock.yaml` jadi SATU dokumen — hanya di server EAS Build.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Build APK gagal TIGA KALI berturut-turut dengan galat yang sama:
 *
 *     Running "pnpm install --frozen-lockfile"
 *     ERR_PNPM_BROKEN_LOCKFILE  The lockfile is broken:
 *       expected a single document in the stream, but found more
 *
 * Lockfile-nya TIDAK rusak. pnpm 11 menulisnya sebagai DUA dokumen YAML —
 * salah satunya berisi `packageManagerDependencies`, fitur pnpm 11 yang
 * mengelola versi pnpm-nya sendiri. Diukur:
 *
 *     grep -c "^lockfileVersion" pnpm-lock.yaml     → 2
 *     pnpm install --frozen-lockfile LOKAL (11.8.0) → exit=0, nol keluhan
 *
 * Yang menolak adalah pnpm bawaan server EAS — versi lebih lama yang belum
 * paham bentuk multi-dokumen.
 *
 * ── Tiga jalan yang dicoba lebih dulu, dan kenapa gagal
 *
 *   1. `packageManager: pnpm@11.8.0` di package.json AKAR
 *      → EAS tak membacanya. Log fase READ_PACKAGE_JSON mencetak
 *        `@puraloka/mobile`, jadi yang dibaca apps/mobile.
 *
 *   2. `packageManager` di apps/mobile/package.json juga
 *      → build ketiga (commit db8450bb, terbukti memuat field itu) TETAP
 *        gagal dengan galat sama. EAS mengabaikannya untuk memilih pnpm.
 *
 *   3. `managePackageManagerVersions: false` di pnpm-workspace.yaml
 *      → lockfile dibangun ulang dari nol dan TETAP 2 dokumen, 15.386 baris
 *        identik. Tak berpengaruh pada pnpm versi ini. Dibuang.
 *
 * ── Kenapa hook, bukan mengecualikan lockfile
 *
 * Jalan termudah adalah menaruh `pnpm-lock.yaml` di `.easignore`, sehingga
 * EAS jatuh ke `pnpm install` tanpa `--frozen-lockfile`. Itu MENUKAR
 * reproduksibilitas dengan build yang jalan: versi paket diselesaikan ulang
 * dari rentang (`~`, `^`), dan APK bisa memuat versi yang tak pernah diuji.
 *
 * Hook ini menahan keduanya: lockfile tetap terkirim dan tetap mengunci
 * versi dependensi; hanya dokumen berisi versi PNPM yang dibuang.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
  ⚠ HANYA jalan di server EAS Build.

  Skrip ini mencari lockfile relatif terhadap lokasinya sendiri, jadi
  menjalankannya dari mesin pengembang MENGUBAH lockfile repo. Itu benar-benar
  terjadi DUA KALI saat saya mengujinya 2026-09-01 — `git checkout`
  menyelamatkannya, tetapi kalau tak diperiksa ia akan ter-commit sebagai
  "perbaikan" yang justru membuang `overrides`.

  `EAS_BUILD` disetel server; di mesin lokal ia kosong.
*/
if (!process.env.EAS_BUILD && !process.env.PAKSA_NORMALISASI_LOCKFILE) {
  console.log('[eas-pre-install] bukan di server EAS (EAS_BUILD kosong) — dilewati.')
  console.log('   Untuk menguji: PAKSA_NORMALISASI_LOCKFILE=1, dan bekerjalah di')
  console.log('   SALINAN — skrip ini menulis pnpm-lock.yaml di tempatnya.')
  process.exit(0)
}

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCK = join(AKAR, 'pnpm-lock.yaml')

console.log('[eas-pre-install] menormalkan pnpm-lock.yaml jadi satu dokumen')

if (!existsSync(LOCK)) {
  console.log('[eas-pre-install] pnpm-lock.yaml tak ada — dilewati.')
  process.exit(0)
}

const asli = readFileSync(LOCK, 'utf8')
const baris = asli.split('\n')

const pemisah = []
baris.forEach((b, i) => { if (b === '---') pemisah.push(i) })

if (pemisah.length < 2) {
  console.log(`[eas-pre-install] cuma ${pemisah.length} pemisah '---' — sudah satu dokumen.`)
  process.exit(0)
}
if (pemisah.length > 2) {
  console.error(`[eas-pre-install] ${pemisah.length} pemisah '---' — bentuk tak dikenali.`)
  console.error('   Skrip ini hanya menangani DUA dokumen. Berhenti tanpa mengubah apa pun.')
  process.exit(1)
}

/*
  ⚠ JANGAN memilih dokumen berdasarkan URUTANNYA.

  Versi pertama skrip ini memakai `baris.slice(pemisah[1])` — menyimpan
  dokumen KEDUA — dan SALAH: `---` pertama ada di BARIS 1, sehingga
  pemotongannya menyisakan dokumen yang justru harus dibuang.

  Akibatnya `overrides` HILANG, dan pnpm menolak dengan galat yang menuduh
  hal lain sama sekali:

      ERR_PNPM_LOCKFILE_CONFIG_MISMATCH
      The current "overrides" configuration doesn't match the lockfile

  Galat itu tak menyebut lockfile terpotong; ia menyebut konfigurasi. Kalau
  saya percaya, saya akan mengejar `overrides` di pnpm-workspace.yaml —
  tempat yang sama sekali tak bersalah.

  Yang benar: pilih berdasarkan ISI. Dokumen yang DIPERTAHANKAN adalah yang
  memuat `overrides`/`settings` — itu lockfile sesungguhnya.

  ── Dan pemisah `---` HARUS ikut dibuang

  Versi kedua sudah memilih dokumen yang benar, tetapi menyisakan `---` di
  awalnya — dan pnpm TETAP menolak dengan galat yang sama persis:

      ERR_PNPM_LOCKFILE_CONFIG_MISMATCH
      The current "overrides" configuration doesn't match the lockfile

  Padahal `overrides`-nya utuh dan identik: 12 baris, `diff` nol.

  Diukur 2026-09-01, tiga bentuk di salinan yang sama:

      lockfile asli (2 dokumen)   → LOLOS
      dokumen ke-2 DENGAN '---'   → ERR_PNPM_LOCKFILE_CONFIG_MISMATCH
      dokumen ke-2 TANPA '---'    → LOLOS

  Satu baris tiga karakter, dan galatnya menunjuk ke tempat lain sama
  sekali. Berkas berawalan `---` dibaca sebagai dokumen bernomor, dan itu
  mengubah cara pnpm menafsirkan konfigurasinya.

  Itu sebabnya `+ 1` pada kedua `slice` di bawah.
*/
const dok = [
  baris.slice(pemisah[0] + 1, pemisah[1]).join('\n'),
  baris.slice(pemisah[1] + 1).join('\n'),
]
const kandidat = dok.filter((d) => /^overrides:/m.test(d) || /^settings:/m.test(d))

if (kandidat.length !== 1) {
  console.error(`[eas-pre-install] ${kandidat.length} dokumen memuat overrides/settings — harus tepat 1.`)
  console.error('   Bentuknya tak dikenali. Berhenti tanpa mengubah apa pun.')
  process.exit(1)
}
const sisa = kandidat[0]

/*
  Tiga pemeriksaan sebelum menulis. Skrip yang "memperbaiki" berkas yang tak
  dikenalinya lebih berbahaya daripada build yang gagal — build gagal
  terlihat, lockfile yang rusak diam-diam tidak.
*/
if (!/^lockfileVersion:/m.test(sisa)) {
  console.error('[eas-pre-install] dokumen terpilih tak punya `lockfileVersion`. Berhenti.')
  process.exit(1)
}
if (!/^importers:/m.test(sisa)) {
  console.error('[eas-pre-install] dokumen terpilih tak punya `importers`. Berhenti.')
  process.exit(1)
}
if (/packageManagerDependencies:/.test(sisa) && !/^overrides:/m.test(sisa)) {
  console.error('[eas-pre-install] dokumen terpilih tampak blok packageManagerDependencies. Berhenti.')
  process.exit(1)
}

writeFileSync(LOCK, sisa, 'utf8')

const cek = readFileSync(LOCK, 'utf8')
const nVer = (cek.match(/^lockfileVersion:/gm) ?? []).length
const nOvr = (cek.match(/^overrides:/gm) ?? []).length
console.log(`[eas-pre-install] ${baris.length} → ${cek.split('\n').length} baris · lockfileVersion ×${nVer} · overrides ×${nOvr}`)

if (nVer !== 1) {
  console.error('[eas-pre-install] hasilnya bukan satu dokumen — install akan gagal lagi.')
  process.exit(1)
}
/*
  ══════════════════════════════════════════════════════════════════════════
  `overrides` DISALIN ke package.json — pnpm 9 tak membacanya dari workspace
  ══════════════════════════════════════════════════════════════════════════

  Normalisasi di atas menghilangkan ERR_PNPM_BROKEN_LOCKFILE, tetapi server
  lalu menolak dengan galat kedua:

      ERR_PNPM_LOCKFILE_CONFIG_MISMATCH
      The current "overrides" configuration doesn't match the lockfile

  Sebabnya BUKAN lockfile-nya. Diukur 2026-09-01 dengan meniru versi server:

      pnpm 9.15.5 menulis lockfile-nya sendiri → `overrides` HILANG seluruhnya

  `overrides` di repo ini tinggal di `pnpm-workspace.yaml` — fitur pnpm 10+.
  **pnpm 9 tak membacanya dari sana.** Jadi ia melihat "nol overrides" di
  konfigurasi sementara lockfile memuat dua belas, dan menyimpulkan keduanya
  tak cocok.

  Galatnya benar; yang menyesatkan adalah ia menuduh lockfile, sementara yang
  kurang justru pembacaan konfigurasinya.

  Server EAS memakai pnpm 9.15.5 (terbaca di fase SPIN_UP_BUILDER); mesin
  pengembang memakai 11.8.0. Itu sebabnya lokal selalu lolos dan server
  selalu menolak — delapan build.

  ── Kenapa menulis package.json, bukan mengubah pnpm-workspace.yaml

  `overrides` di workspace.yaml adalah bentuk yang BENAR untuk pnpm 11, dan
  memindahkannya ke package.json akan menurunkan repo ke bentuk lama demi
  satu server build. Hook ini menyalin — bukan memindahkan — dan hanya di
  server (`EAS_BUILD`).

  Diuji dengan pnpm 9.15.5 sungguhan lewat `npx pnpm@9.15.5`:

      tanpa salinan → ERR_PNPM_LOCKFILE_CONFIG_MISMATCH
      dengan salinan → Done in 305ms
*/
function salinOverrides() {
  const WS = join(AKAR, 'pnpm-workspace.yaml')
  const PKG = join(AKAR, 'package.json')
  if (!existsSync(WS) || !existsSync(PKG)) return

  const baris = readFileSync(WS, 'utf8').split(String.fromCharCode(10))
  const mulai = baris.findIndex((l) => l === 'overrides:')
  if (mulai < 0) {
    console.log('[eas-pre-install] `overrides:` tak ada di pnpm-workspace.yaml — dilewati.')
    return
  }

  const ov = {}
  for (let i = mulai + 1; i < baris.length; i++) {
    const l = baris[i]
    if (l && !/^\s/.test(l)) break            // kunci tingkat-atas berikutnya
    if (/^\s*#/.test(l) || !l.trim()) continue // komentar / baris kosong
    const m = l.match(/^  '?([^':]+?)'?:\s*'?([^'#]+?)'?\s*(?:#.*)?$/)
    if (m) ov[m[1]] = m[2].trim()
  }

  if (Object.keys(ov).length === 0) {
    console.log('[eas-pre-install] nol overrides terbaca — package.json tak disentuh.')
    return
  }

  const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
  pkg.pnpm = { ...(pkg.pnpm ?? {}), overrides: ov }
  writeFileSync(PKG, JSON.stringify(pkg, null, 2) + String.fromCharCode(10), 'utf8')
  console.log(`[eas-pre-install] ${Object.keys(ov).length} overrides disalin ke package.json`)
}

salinOverrides()

console.log('[eas-pre-install] selesai.')
