#!/usr/bin/env node
// ============================================================================
// GABUNG COVERAGE — menyatukan hasil semua shard menjadi satu ringkasan.
// ============================================================================
//
// ── Kenapa berkas ini ada
//
// Suite test dipecah 4 shard (CI-PROFIL.md: langkah test = 91% durasi job).
// Tiap shard menghasilkan `coverage-final.json`-nya sendiri, yang hanya memuat
// baris yang tereksekusi oleh SEBAGIAN test.
//
// Menjalankan ratchet atas satu shard = menilai ~25% kode lalu membandingkannya
// dengan lantai yang diukur dari suite penuh. Hasilnya: build sehat divonis
// regresi. `coverage-ratchet.mjs` sudah punya penjaga "apel vs jeruk" yang akan
// MENOLAK membandingkan (exit 2) — tapi menolak bukan tujuan; yang dibutuhkan
// adalah angka gabungan yang benar.
//
// ── Cara menggabung
//
// Format v8/istanbul `coverage-final.json` adalah peta:
//   { "<path berkas>": { s: {id: hitungan}, f: {...}, b: {...}, statementMap, … } }
//
// Menggabung = menjumlahkan `s`/`f`/`b` per-id untuk berkas yang sama. Sebuah
// baris dianggap tercakup bila TERCAKUP DI SHARD MANA PUN — itulah arti
// "coverage seluruh suite".
//
// Peta struktural (`statementMap`, `fnMap`, `branchMap`) identik antar shard
// karena berasal dari berkas sumber yang sama, jadi cukup diambil salah satu.
//
// ── Keluaran
//
// `coverage/coverage-summary.json` — format json-summary yang dibaca
// `coverage-ratchet.mjs`, dengan `total` dan entri per-berkas.
//
// ── ⚠️ Angka `branches`/`functions` TIDAK sebanding dengan lantai lama
//
// Diverifikasi 2026-08-03 dengan menjalankan keempat shard lokal lalu
// membandingkan hasil gabungan dengan run suite penuh tak ter-shard:
//
//     statements  31,99% (6794/21241)  vs  31,98% (6794/21241)   ← IDENTIK
//     branches    72,81% (1615/2218)   vs  68,49% (1735/2533)
//     functions   84,81% (268/316)     vs  81,96% (259/316)
//
// `statements` cocok PERSIS sampai ke angka pembilang/penyebutnya — itulah bukti
// penggabungannya benar.
//
// `branches` dan `functions` naik BUKAN karena cakupan bertambah, melainkan
// karena **penyebutnya berbeda**: reporter `json-summary` bawaan v8 menghitung
// cabang secara berbeda dari peta mentah di `coverage-final.json` (2.218 vs 2.533).
//
// Konsekuensinya penting: kenaikan itu **semu**. Menaikkan lantai berdasarkan
// angka ini akan mengunci ambang yang tak pernah benar-benar dicapai, dan
// membuat setiap perubahan metode pengukuran berikutnya tampak seperti regresi.
// Karena itu lantai TIDAK dinaikkan otomatis — `coverage-ratchet.mjs --naikkan`
// tetap tindakan sadar manusia.
// ============================================================================

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHARD_DIR = join(API_ROOT, 'coverage-shards')
const OUT_DIR = join(API_ROOT, 'coverage')

if (!existsSync(SHARD_DIR)) {
  console.error(`FATAL: ${SHARD_DIR} tidak ada. Jalankan setelah mengunduh artifact shard.`)
  process.exit(2)
}

// artifact ter-unduh sebagai coverage-shards/coverage-shard-<n>/coverage-final.json
const berkasShard = []
for (const entri of readdirSync(SHARD_DIR, { withFileTypes: true })) {
  if (entri.isDirectory()) {
    const p = join(SHARD_DIR, entri.name, 'coverage-final.json')
    if (existsSync(p)) berkasShard.push(p)
  } else if (entri.name.endsWith('.json')) {
    berkasShard.push(join(SHARD_DIR, entri.name))
  }
}

if (berkasShard.length === 0) {
  console.error(`FATAL: nol coverage-final.json ditemukan di ${SHARD_DIR}.`)
  process.exit(2)
}

console.log(`══ GABUNG COVERAGE ${'═'.repeat(50)}`)
console.log(`  shard ditemukan: ${berkasShard.length}`)

/** Jumlahkan peta hitungan {id: n} milik dua shard. */
function jumlahkan(a = {}, b = {}) {
  const hasil = { ...a }
  for (const [k, v] of Object.entries(b)) {
    if (Array.isArray(v)) {
      // cabang (`b`) berbentuk array hitungan per-cabang
      const lama = Array.isArray(hasil[k]) ? hasil[k] : []
      hasil[k] = v.map((n, i) => (lama[i] ?? 0) + n)
    } else {
      hasil[k] = (hasil[k] ?? 0) + v
    }
  }
  return hasil
}

const gabungan = {}
for (const p of berkasShard) {
  const data = JSON.parse(readFileSync(p, 'utf8'))
  for (const [berkas, cov] of Object.entries(data)) {
    if (!gabungan[berkas]) {
      gabungan[berkas] = { ...cov }
      continue
    }
    gabungan[berkas].s = jumlahkan(gabungan[berkas].s, cov.s)
    gabungan[berkas].f = jumlahkan(gabungan[berkas].f, cov.f)
    gabungan[berkas].b = jumlahkan(gabungan[berkas].b, cov.b)
  }
}

/** Hitung {total, covered, pct} dari peta hitungan. */
function hitung(peta = {}) {
  let total = 0
  let covered = 0
  for (const v of Object.values(peta)) {
    if (Array.isArray(v)) {
      for (const n of v) { total++; if (n > 0) covered++ }
    } else {
      total++
      if (v > 0) covered++
    }
  }
  return { total, covered, skipped: 0, pct: total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2)) }
}

const ringkasan = {}
const akumulasi = { s: {}, f: {}, b: {} }
let idx = 0
for (const [berkas, cov] of Object.entries(gabungan)) {
  ringkasan[berkas] = {
    lines: hitung(cov.s),
    statements: hitung(cov.s),
    functions: hitung(cov.f),
    branches: hitung(cov.b),
  }
  // Akumulasi total memakai kunci ber-prefix supaya id antar-berkas tak bertabrakan.
  for (const jenis of ['s', 'f', 'b']) {
    for (const [k, v] of Object.entries(cov[jenis] ?? {})) {
      akumulasi[jenis][`${idx}:${k}`] = v
    }
  }
  idx++
}

const totalS = hitung(akumulasi.s)
const totalF = hitung(akumulasi.f)
const totalB = hitung(akumulasi.b)
ringkasan.total = { lines: totalS, statements: totalS, functions: totalF, branches: totalB }

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'coverage-summary.json'), JSON.stringify(ringkasan, null, 2) + '\n')

console.log(`  berkas tergabung: ${idx}`)
console.log(`  statements : ${totalS.pct}%  (${totalS.covered}/${totalS.total})`)
console.log(`  branches   : ${totalB.pct}%  (${totalB.covered}/${totalB.total})`)
console.log(`  functions  : ${totalF.pct}%  (${totalF.covered}/${totalF.total})`)
console.log(`\n  → ${join(OUT_DIR, 'coverage-summary.json')}`)
