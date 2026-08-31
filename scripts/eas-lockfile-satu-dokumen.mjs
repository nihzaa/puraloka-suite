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
*/
const dok = [
  baris.slice(pemisah[0], pemisah[1]).join('\n'),
  baris.slice(pemisah[1]).join('\n'),
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
console.log('[eas-pre-install] selesai.')
