#!/usr/bin/env node
// ============================================================================
// IDENTITAS APLIKASI MOBILE — konsisten, dan yang TERKUNCI dinyatakan.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Founder bertanya 2026-08-27: "kalau nama aplikasinya nanti bukan
// puraloka-suite lagi, apa masih relevan?" Jawabannya berbeda per medan, dan
// perbedaannya tak terlihat dari membaca `app.json`:
//
//   name, slug, scheme        bisa diubah kapan saja
//   bundleIdentifier, package TERKUNCI PERMANEN setelah rilis ke store
//
// Yang terkunci itu tak punya gejala saat salah. Ia baru menggigit berbulan
// kemudian: mengubahnya berarti aplikasi BARU di mata store — pengguna lama
// tak dapat pembaruan, harus pasang ulang, dan data lokalnya hilang.
//
// ── Yang dijaga (ambang NOL)
//
//   1. `slug` di app.json wajib COCOK dengan yang dipakai `eas.json`/dasbor.
//      Slug yang menyimpang membuat `eas build` menolak dengan pesan yang
//      tak menyebut app.json sama sekali.
//
//   2. `bundleIdentifier` dan `package` wajib SAMA. Membiarkannya berbeda
//      antar-platform adalah pilihan sah pada sebagian proyek, tetapi di sini
//      keduanya sengaja seragam — dan penyimpangan diam-diam biasanya salah
//      ketik, bukan keputusan.
//
//   3. Keduanya wajib berbentuk reverse-DNS yang sah. Play Store menolak
//      package yang tak memenuhi itu, DAN penolakannya terjadi di akhir —
//      sesudah build selesai dan waktu terbuang.
//
//   4. `name` dan `slug` wajib ADA. Kosongnya membuat `eas init` mengarang
//      nilai sendiri, dan yang dikarang itulah yang terkunci.
//
// ── Yang TIDAK dijaga, dengan sengaja
//
// Penjaga ini tak menuntut nama tertentu. Nama produk adalah keputusan
// founder yang memang masih terbuka — yang dijaga adalah KONSISTENSInya, dan
// bahwa yang terkunci tak berubah tanpa disadari.
// ============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const APP = join(AKAR, 'apps/mobile/app.json')

if (!existsSync(APP)) {
  console.log('  ⏭  identitas mobile: DILEWATI — apps/mobile/app.json tak ada')
  process.exit(0)
}

let app
try {
  app = JSON.parse(readFileSync(APP, 'utf8'))
} catch (e) {
  console.error(`❌ apps/mobile/app.json tak bisa dibaca: ${e.message}`)
  process.exit(1)
}

const e = app?.expo ?? {}
const masalah = []

console.log('══ Identitas aplikasi mobile ═══════════════════════════════')
console.log(`  name              : ${e.name ?? '(kosong)'}`)
console.log(`  slug              : ${e.slug ?? '(kosong)'}`)
console.log(`  scheme            : ${e.scheme ?? '(kosong)'}`)
console.log(`  ios.bundleId      : ${e.ios?.bundleIdentifier ?? '(kosong)'}`)
console.log(`  android.package   : ${e.android?.package ?? '(kosong)'}`)

/* 4. Wajib ada. */
for (const [medan, nilai] of [['name', e.name], ['slug', e.slug]]) {
  if (!nilai || !String(nilai).trim()) {
    masalah.push(
      `\`${medan}\` kosong. \`eas init\` akan mengarang nilainya sendiri —\n`
      + `     dan yang dikarang itulah yang kelak terkunci.`,
    )
  }
}

/* 2. Dua pengenal store wajib sama. */
const iosId = e.ios?.bundleIdentifier
const androidId = e.android?.package
if (!iosId || !androidId) {
  masalah.push(
    'bundleIdentifier (iOS) atau package (Android) kosong.\n'
    + '     Keduanya TERKUNCI PERMANEN setelah rilis ke store — tak boleh\n'
    + '     diserahkan ke nilai bawaan.',
  )
} else if (iosId !== androidId) {
  masalah.push(
    `bundleIdentifier (${iosId}) ≠ package (${androidId}).\n`
    + '     Di repo ini keduanya sengaja seragam; penyimpangan biasanya salah\n'
    + '     ketik, bukan keputusan. Kalau memang disengaja, longgarkan penjaga\n'
    + '     ini dengan alasan tertulis.',
  )
}

/*
  3. Bentuk reverse-DNS. Play Store menuntut minimal dua segmen, huruf awal
     tiap segmen bukan angka, dan tanpa tanda hubung.

     Penolakannya terjadi DI AKHIR proses unggah — sesudah build selesai dan
     waktunya terbuang. Lebih murah ditangkap di sini.
*/
const POLA_ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/
for (const [medan, nilai] of [['ios.bundleIdentifier', iosId], ['android.package', androidId]]) {
  if (nilai && !POLA_ID.test(nilai)) {
    masalah.push(
      `\`${medan}\` = "${nilai}" bukan reverse-DNS yang sah.\n`
      + '     Wajib minimal dua segmen, huruf kecil, tanpa tanda hubung —\n'
      + '     mis. com.puraloka.suite. Store menolaknya SESUDAH build selesai.',
    )
  }
}

/* 1. Slug wajib cocok bila eas.json menyebutnya. */
const EAS = join(AKAR, 'apps/mobile/eas.json')
if (existsSync(EAS)) {
  try {
    const eas = JSON.parse(readFileSync(EAS, 'utf8'))
    const slugEas = eas?.build?.production?.slug ?? eas?.slug
    if (slugEas && slugEas !== e.slug) {
      masalah.push(
        `slug app.json ("${e.slug}") ≠ slug eas.json ("${slugEas}").\n`
        + '     `eas build` menolak, dengan pesan yang tak menyebut app.json.',
      )
    }
  } catch { /* bentuk eas.json dijaga penjaga port */ }
}

/*
  Peringatan — bukan kegagalan. Selama `projectId` belum ada, `eas build` tak
  bisa jalan sama sekali; tetapi mengisinya butuh akun Expo founder, jadi
  ketiadaannya BUKAN pelanggaran yang bisa diperbaiki CI.
*/
const projectId = e.extra?.eas?.projectId
console.log('')
if (projectId) {
  console.log(`  ✅ extra.eas.projectId terisi (${String(projectId).slice(0, 8)}…)`)
} else {
  console.log('  ⚠  extra.eas.projectId BELUM ada — `eas build` tak bisa jalan.')
  console.log('     Diisi otomatis oleh: cd apps/mobile && npx eas-cli init')
  console.log('     Butuh akun Expo; itu langkah founder, bukan CI.')
}

if (masalah.length > 0) {
  console.error('')
  console.error('❌ Identitas mobile bermasalah:')
  console.error('')
  for (const m of masalah) console.error(`   · ${m}\n`)
  console.error('   ⚠ `bundleIdentifier` dan `package` TERKUNCI PERMANEN begitu')
  console.error('     aplikasi masuk store. Mengubahnya sesudah itu = aplikasi')
  console.error('     BARU: pengguna lama tak dapat pembaruan, harus pasang')
  console.error('     ulang, dan data lokalnya hilang.')
  process.exit(1)
}

console.log('')
console.log('✅ Identitas mobile konsisten.')
