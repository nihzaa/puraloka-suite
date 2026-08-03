#!/usr/bin/env node
// ============================================================================
// RATCHET COVERAGE — angka hari ini jadi LANTAI, tidak boleh turun.
// ============================================================================
//
// ── Kenapa ratchet, bukan target
//
// Audit 2026-08-02 memberi skor Testing 80 tanpa mengukur coverage sama sekali
// (cacat C-6) — skor yang tidak dibayar. Saat akhirnya diukur, hasilnya jauh dari
// kesan yang diberikan angka "1276 test lulus":
//
//     Statements : 31,98%   Lines : 31,98%
//     Branches   : 68,49%   Functions : 81,96%
//
// Angka rendah itu BUKAN berarti test-nya buruk. `vitest.config.ts` sudah lama
// membatasi coverage gate ke `src/lib/**` (pure function finansial) dengan ambang
// 90% — keputusan sadar, terdokumentasi. Yang tidak terukur adalah `src/routes/**`
// dan `src/utils/**`, dan di sanalah 31,98% itu berasal: sebagian besar baris route
// memang tereksekusi lewat integration test, tapi cabang penanganan galatnya tidak.
//
// Menetapkan target aspirasional (mis. 80%) akan membuat CI merah hari ini dan
// mendorong orang mematikan gate-nya — kegagalan yang lebih buruk daripada tidak
// punya gate. Maka: **angka hari ini dikunci sebagai lantai.** Boleh naik,
// tidak boleh turun. Setiap kenaikan mengunci dirinya sendiri.
//
// ── Cara pakai
//
//   1. Hasilkan ringkasan coverage:
//        npx vitest run --coverage \
//          --coverage.include='src/**/*.ts' \
//          --coverage.reporter=json-summary --coverage.reportsDirectory=./coverage
//   2. Jalankan penjaga ini:
//        node scripts/coverage-ratchet.mjs
//
// Untuk MENAIKKAN lantai setelah coverage benar-benar naik:
//        node scripts/coverage-ratchet.mjs --naikkan
//
// Menurunkan lantai TIDAK disediakan sebagai perintah. Kalau coverage turun,
// yang benar adalah menambah test — bukan menurunkan standar.
// ============================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RINGKASAN = join(API_ROOT, 'coverage', 'coverage-summary.json')
const LANTAI = join(API_ROOT, 'scripts', 'coverage-lantai.json')

const naikkan = process.argv.includes('--naikkan')

if (!existsSync(RINGKASAN)) {
  console.error(`FATAL: ${RINGKASAN} tidak ada.

Hasilkan lebih dulu:
  npx vitest run --coverage \\
    --coverage.include='src/**/*.ts' \\
    --coverage.exclude='src/**/*.test.ts' \\
    --coverage.exclude='src/**/__tests__/**' \\
    --coverage.reporter=json-summary --coverage.reportsDirectory=./coverage`)
  process.exit(2)
}

const lantaiAda = existsSync(LANTAI)
const ringkasan = JSON.parse(readFileSync(RINGKASAN, 'utf8'))
const total = ringkasan.total
const sekarang = {
  statements: total.statements.pct,
  branches: total.branches.pct,
  functions: total.functions.pct,
  lines: total.lines.pct,
}

// ── Penjaga apel-vs-jeruk ───────────────────────────────────────────────────
//
// Lantai diukur dari SUITE PENUH. Kalau ringkasan yang dibandingkan ternyata
// berasal dari sebagian test saja (mis. `vitest run src/lib`), angkanya jatuh
// drastis dan ratchet melaporkan "TURUN" padahal tidak ada yang memburuk —
// penjaga yang berbohong, dan penjaga yang berbohong akan dimatikan orang.
//
// Ditemukan saat membangun penjaga ini: run `src/lib` saja menghasilkan
// statements 8,57% terhadap lantai 31,98%. Bukan regresi, melainkan cakupan
// pengukuran yang berbeda.
//
// Sidik cakupan yang dipakai adalah JUMLAH BARIS TERCAKUP (`lines.covered`),
// bukan jumlah berkas. Alasannya ditemukan lewat percobaan: run `src/lib` saja
// tetap MEMUAT 111 berkas di ringkasan (v8 mendaftar semua berkas yang di-include,
// termasuk yang nol tercakup), sehingga jumlah berkas nyaris tak berubah dan tak
// bisa membedakan run penuh dari run sebagian. Yang berubah drastis justru baris
// yang benar-benar tereksekusi: 1.821 (lib saja) vs 6.794 (suite penuh).
const barisTercakup = total.lines.covered ?? 0
const MIN_BARIS_TERCAKUP = Math.floor((lantaiAda ? 6794 : barisTercakup) * 0.5)
if (lantaiAda && barisTercakup < MIN_BARIS_TERCAKUP) {
  console.error(`══ RATCHET COVERAGE — DITOLAK ${'═'.repeat(38)}

  Ringkasan ini hanya mencakup ${barisTercakup.toLocaleString('id-ID')} baris tereksekusi;
  lantai diukur dari suite PENUH (~6.794 baris). Membandingkan keduanya
  menghasilkan vonis "turun" yang palsu.

  Jalankan coverage atas SELURUH suite:

    npx vitest run --coverage \\
      --coverage.include='src/**/*.ts' \\
      --coverage.exclude='src/**/*.test.ts' \\
      --coverage.exclude='src/**/__tests__/**' \\
      --coverage.reporter=json-summary --coverage.reportsDirectory=./coverage`)
  process.exit(2)
}

if (!existsSync(LANTAI)) {
  writeFileSync(LANTAI, JSON.stringify({ _catatan: 'Lantai coverage — boleh naik, tak boleh turun. Lihat scripts/coverage-ratchet.mjs.', ...sekarang }, null, 2) + '\n')
  console.log('══ RATCHET COVERAGE — lantai awal ditulis ' + '═'.repeat(27))
  for (const [k, v] of Object.entries(sekarang)) console.log(`  ${k.padEnd(12)} ${v}%`)
  process.exit(0)
}

const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
const TOLERANSI = 0.5   // v8 bisa bergoyang sedikit antar-run; jangan bikin CI cerewet

let turun = 0
const baris = []
for (const k of ['statements', 'branches', 'functions', 'lines']) {
  const now = sekarang[k]
  const min = lantai[k] ?? 0
  const delta = now - min
  const status = delta < -TOLERANSI ? '❌ TURUN' : delta > TOLERANSI ? '⬆️  naik' : '✅ tetap'
  if (delta < -TOLERANSI) turun++
  baris.push(`  ${k.padEnd(12)} ${String(now).padStart(6)}%   lantai ${String(min).padStart(6)}%   ${status}`)
}

console.log('══ RATCHET COVERAGE ' + '═'.repeat(48))
baris.forEach((b) => console.log(b))

if (naikkan) {
  const baru = {}
  for (const k of ['statements', 'branches', 'functions', 'lines']) {
    baru[k] = Math.max(lantai[k] ?? 0, sekarang[k])
  }
  writeFileSync(LANTAI, JSON.stringify({ _catatan: lantai._catatan, ...baru }, null, 2) + '\n')
  console.log('\n  lantai DINAIKKAN ke angka saat ini.')
  process.exit(0)
}

if (turun > 0) {
  console.error(`
  ❌ ${turun} metrik turun di bawah lantai.

  Coverage yang turun berarti ada kode baru tanpa test, atau test yang dihapus.
  Perbaikannya menambah test — BUKAN menurunkan lantai.

  Kalau penurunan ini memang disengaja dan bisa dipertanggungjawabkan, jelaskan
  alasannya di docs/execution/DECISIONS.md, lalu jalankan dengan --naikkan.`)
  process.exit(1)
}

console.log('\n  ✅ tidak ada metrik yang turun.')
process.exit(0)
