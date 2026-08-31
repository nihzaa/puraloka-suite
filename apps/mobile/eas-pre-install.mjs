#!/usr/bin/env node
/**
 * Hook `eas-build-pre-install` — pencari akar, lalu penerus.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA, ALIH-ALIH SATU BARIS DI package.json
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi pertama hook ini satu baris:
 *
 *     "eas-build-pre-install": "node ../../scripts/eas-lockfile-satu-dokumen.mjs"
 *
 * Itu mengasumsikan hook dijalankan DARI `apps/mobile`. Kalau EAS
 * menjalankannya dari akar repo, `../../scripts` menunjuk DI LUAR repo, dan
 * build gagal dengan "Cannot find module" — galat yang menuduh Node alih-alih
 * asumsi jalurnya.
 *
 * Saya tak punya cara membuktikan direktori kerjanya dari sini, dan menebak
 * lalu menunggu 20 menit antrean untuk tahu jawabannya adalah cara paling
 * mahal untuk memeriksa satu asumsi.
 *
 * Jadi berkas ini MENCARI akar: naik maksimal lima tingkat sampai menemukan
 * `pnpm-workspace.yaml`. Benar dari direktori mana pun.
 *
 * ── Kenapa tidak ditulis sebagai `node -e "..."` di package.json
 *
 * Sempat begitu, dan panjangnya ~450 karakter dalam satu baris JSON dengan
 * escape bertingkat. Tak ada yang bisa membacanya, dan satu kutip yang salah
 * merusaknya tanpa gejala sampai build berjalan.
 *
 * ── Kalau skripnya tak ditemukan
 *
 * Ia MELEWATI dengan pesan, bukan gagal. Alasannya: normalisasi lockfile
 * hanya perlu di server EAS; kalau seseorang menjalankan `pnpm install` di
 * apps/mobile dari mesinnya, hook ini ikut jalan dan tak boleh menghentikan
 * apa pun.
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

let dir = process.cwd()
let akar = null
for (let i = 0; i < 5; i++) {
  if (existsSync(join(dir, 'pnpm-workspace.yaml'))) { akar = dir; break }
  const naik = resolve(dir, '..')
  if (naik === dir) break
  dir = naik
}

if (!akar) {
  console.log('[eas-pre-install] akar workspace tak ditemukan dari', process.cwd())
  console.log('   Dilewati — tak ada yang bisa dinormalkan tanpa tahu akarnya.')
  process.exit(0)
}

const skrip = join(akar, 'scripts', 'eas-lockfile-satu-dokumen.mjs')
if (!existsSync(skrip)) {
  console.log('[eas-pre-install] skrip tak ada di', skrip, '— dilewati.')
  process.exit(0)
}

console.log('[eas-pre-install] akar:', akar)
execFileSync(process.execPath, [skrip], { stdio: 'inherit' })

/*
  Skrip KEDUA: memangkas apps/web-publik.

  Urutannya mengikat — normalisasi dokumen HARUS lebih dulu. Skrip
  pangkas memotong berdasarkan nomor baris di lockfile, dan lockfile
  dua-dokumen punya penomoran yang berbeda.

  Kalau skripnya tak ada, build tetap jalan: yang hilang cuma
  pemangkasannya, dan itu ketahuan dari galat autolinking — bukan
  dari kesenyapan.
*/
const pangkas = join(akar, 'scripts', 'eas-pangkas-web-publik.mjs')
if (existsSync(pangkas)) {
  execFileSync(process.execPath, [pangkas], { stdio: 'inherit' })
} else {
  console.log('[eas-pre-install] skrip pangkas tak ada di', pangkas, '— dilewati.')
}
