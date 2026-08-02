#!/usr/bin/env node
// ============================================================================
// PENJAGA: penomoran migrasi — nomor ganda dilarang, lompatan BARU dilarang.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Audit 2026-08-02 melaporkan "174 migrasi" padahal berkasnya 171 — kesalahan
// yang terjadi karena penomorannya melompat dan tak ada yang menyadarinya
// (cacat C-9, turunan dari koreksi §3 di KOREKSI.md).
//
// Dua kelas cacat yang dijaga, dan keduanya PUNYA preseden nyata di repo ini:
//
//   1. **Nomor ganda.** Dua berkas bernomor sama = urutan penerapan jadi
//      bergantung pada urutan abjad nama berkas, dan `ci-project-setup.mjs`
//      mencatat versinya lewat `version` yang sama sehingga yang kedua dianggap
//      "sudah jalan" lalu DILEWATI SENYAP selamanya. Ini persis mekanisme cacat
//      P0 047↔167: dua definisi bertabrakan, satu menang tanpa pesan galat.
//
//   2. **Lompatan baru.** Nomor yang hilang membuat siapa pun yang menghitung
//      "migrasi terakhir 174" menyimpulkan ada 174 migrasi. Audit sudah pernah
//      tergelincir persis di situ.
//
// ── Kenapa lompatan LAMA tidak dipaksa hilang
//
// Tiga lompatan sudah ada sejak lama: 030, 059, 064. Menomori ulang berkas
// migrasi yang SUDAH TERCATAT di buku migrasi adalah operasi berbahaya —
// `schema_migrations` menyimpan versinya, dan mengubah nomor berarti migrasi
// dianggap belum pernah jalan lalu dijalankan ulang di setiap lingkungan.
//
// Jadi lompatan lama DIKUNCI sebagai pengecualian bernama (dengan alasannya),
// dan yang dijaga adalah lompatan BARU. Ratchet, bukan pembersihan retroaktif.
//
// Keluar 0 = bersih. Keluar 1 = ada nomor ganda atau lompatan baru.
// ============================================================================

import { readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MIGRASI = join(REPO_ROOT, 'db', 'migrations')

// Lompatan yang SUDAH ADA sebelum penjaga ini dibuat. Masing-masing dengan
// alasan — daftar pengecualian tanpa alasan akan tumbuh tanpa batas.
const LOMPATAN_LAMA = {
  30: 'nomor tak pernah dipakai; tak ada berkas 030_* di histori git mana pun',
  59: 'dipakai `db/seeds/seed_dummy_data.sql` — tercatat di schema_migrations sebagai versi 059, tetapi memang SEED, bukan migrasi',
  64: 'nomor tak pernah dipakai; tak ada berkas 064_* di histori git mana pun',
}

if (!existsSync(MIGRASI)) {
  console.error(`FATAL: ${MIGRASI} tidak ada.`)
  process.exit(2)
}

const berkas = readdirSync(MIGRASI).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
const perNomor = new Map()
for (const f of berkas) {
  const n = Number(f.match(/^(\d+)_/)[1])
  if (!perNomor.has(n)) perNomor.set(n, [])
  perNomor.get(n).push(f)
}

const nomor = [...perNomor.keys()].sort((a, b) => a - b)
const ganda = [...perNomor.entries()].filter(([, fs]) => fs.length > 1)

const lompatanBaru = []
for (let i = 1; i < nomor.length; i++) {
  for (let hilang = nomor[i - 1] + 1; hilang < nomor[i]; hilang++) {
    if (!(hilang in LOMPATAN_LAMA)) lompatanBaru.push(hilang)
  }
}

console.log('══ PENJAGA penomoran migrasi ' + '═'.repeat(40))
console.log(`  berkas          : ${berkas.length}`)
console.log(`  nomor tertinggi : ${nomor[nomor.length - 1]}`)
console.log(`  lompatan lama   : ${Object.keys(LOMPATAN_LAMA).join(', ')} (dikecualikan, beralasan)`)

if (ganda.length === 0 && lompatanBaru.length === 0) {
  console.log('  ✅ nol nomor ganda, nol lompatan baru.')
  console.log(`\n  Catatan: ${berkas.length} berkas ≠ nomor tertinggi ${nomor[nomor.length - 1]} —`)
  console.log('  itu WAJAR karena lompatan lama. Jangan simpulkan jumlah dari nomor terakhir.')
  process.exit(0)
}

if (ganda.length) {
  console.error(`\n  ❌ ${ganda.length} NOMOR GANDA:`)
  for (const [n, fs] of ganda) {
    console.error(`     ${String(n).padStart(3, '0')} → ${fs.join('  DAN  ')}`)
  }
  console.error(`
     Nomor ganda membuat urutan penerapan bergantung pada abjad nama berkas, dan
     membuat ci-project-setup mencatat keduanya sebagai satu versi — yang kedua
     DILEWATI SENYAP di setiap lingkungan baru. Ini mekanisme yang sama dengan
     cacat P0 047 vs 167.`)
}

if (lompatanBaru.length) {
  console.error(`\n  ❌ ${lompatanBaru.length} LOMPATAN BARU: ${lompatanBaru.join(', ')}`)
  console.error(`
     Nomor yang hilang membuat orang menyimpulkan jumlah migrasi dari nomor
     terakhir — audit 2026-08-02 sudah pernah tergelincir persis di situ
     (melaporkan 174 padahal berkasnya 171).

     Kalau lompatan ini memang disengaja, daftarkan di LOMPATAN_LAMA pada berkas
     ini BESERTA ALASANNYA.`)
}

process.exit(1)
