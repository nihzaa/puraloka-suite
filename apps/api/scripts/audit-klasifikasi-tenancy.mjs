#!/usr/bin/env node
// ============================================================================
// PENJAGA — tabel BARU wajib punya jalur tenancy yang jelas.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// F2-2 mengklasifikasi 123 tabel dan menemukan tepat 4 yang perlu keputusan
// manusia. Angka itu benar HARI INI. Ia akan salah begitu ada migrasi yang
// menambah tabel tanpa jalur tenancy — dan itu terjadi tanpa satu pun galat:
// tabel barunya bekerja normal, hanya saja isinya terlihat oleh semua tenant.
//
// Dokumen klasifikasi tak bisa menjaga dirinya sendiri. Penjaga ini yang
// membuat pertumbuhan angka "PERLU-MATA-MANUSIA" jadi MERAH di CI, bukan
// jadi temuan audit enam bulan lagi.
//
// ── RATCHET, bukan ambang tetap
//
// Lantai adalah angka hari ini. Tabel baru boleh lahir — asalkan ia punya
// company_id sendiri, atau rantai FK NOT NULL ke tabel tenant-owned. Yang
// tidak boleh adalah tabel yang tak punya keduanya.
//
// Menaikkan lantai berarti menyatakan "ada satu lagi tabel yang tenancy-nya
// tak jelas, dan itu tak apa-apa". Itu keputusan yang harus terlihat di diff
// dan diratifikasi — bukan efek samping.
//
// ⚠️ Butuh koneksi DB. Di lingkungan tanpa DB ia MELEWATI diri sendiri
//    dengan pesan, bukan hijau diam-diam — hijau tanpa memeriksa apa pun
//    adalah kegagalan yang menyamar sebagai keberhasilan.
// ============================================================================

import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// Lantai per 2026-08-04, SETELAH F2-3 batch 1 (migrasi 178).
//
// Turun dari 4 → 2: `company_profile` (kategori B) dan `kasbon_purposes`
// (kategori A/B) kini punya `company_id`, jadi tak lagi "perlu keputusan".
//
// ⚠️ Lantai WAJIB ikut turun setiap kali sebuah tabel diselesaikan. Lantai
// yang dibiarkan tinggi berhenti menjaga: ia menyisakan ruang bagi tabel baru
// yang tak punya tenancy untuk lahir tanpa memerahkan CI. Ratchet hanya
// bekerja bila lantainya benar-benar mengikuti kenyataan.
const LANTAI = 2

// Dua sisanya SUDAH diputuskan tetap kategori A (F2-2 §4.2 & §4.4) — mereka
// muncul di sini bukan karena belum diperiksa, melainkan karena alat tak bisa
// membedakan "shared yang disengaja" dari "belum punya tenancy". Keputusannya
// dijaga test f2-3-batch1-tenancy.
const DIKENAL = new Set([
  'material_categories', 'menu_items',
])

let hasil
try {
  const keluaran = execFileSync(
    process.execPath,
    [resolve(REPO, 'scripts/db/klasifikasi-tenancy.mjs'), '--json'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  hasil = JSON.parse(keluaran)
} catch (e) {
  const pesan = String(e.stderr || e.message)
  if (/DIRECT_URL|ENOTFOUND|ECONNREFUSED|password|timeout/i.test(pesan)) {
    console.log('⏭  DILEWATI — database tak terjangkau dari lingkungan ini.')
    console.log('   Penjaga ini butuh DB; ia TIDAK menyatakan hijau tanpa memeriksa.')
    process.exit(0)
  }
  console.error('❌ gagal menjalankan klasifikasi:', pesan.slice(0, 200))
  process.exit(1)
}

const perlu = hasil.filter((h) => h.kategori === 'B?')
const baru = perlu.filter((h) => !DIKENAL.has(h.tabel))

// Rantai kategori C tak boleh berakhir di tabel SHARED — cacat yang ditemukan
// saat F2-2 dikerjakan, dan yang paling mudah kembali diam-diam bila seseorang
// menambah FK baru ke cost_codes/material_pack/modules.
const SHARED = new Set([
  'units', 'work_categories', 'permissions', 'modules', 'ahsp_editions',
  'cost_codes', 'resources', 'steel_profiles', 'material_pack',
  'formula_definitions', 'productivity_records',
  'assemblies', 'price_book_entries', 'cbs_templates', 'feature_flags', 'users',
])
const rantaiPalsu = hasil
  .filter((h) => h.kategori === 'C')
  .filter((h) => {
    const hop = [...h.alasan.matchAll(/→(\w+)/g)].map((m) => m[1])
    return SHARED.has(hop[hop.length - 1])
  })

let gagal = false

if (baru.length) {
  gagal = true
  console.error(`❌ ${baru.length} tabel BARU tanpa jalur tenancy yang jelas:\n`)
  for (const h of baru) console.error(`   ${h.tabel}\n      ${h.alasan}`)
  console.error(`
   Tabel tanpa company_id DAN tanpa rantai FK NOT NULL ke tabel tenant-owned
   akan terlihat oleh SEMUA tenant. Kebocorannya tak menimbulkan galat.

   Perbaiki dengan SALAH SATU:
     • beri kolom company_id (kategori B)
     • beri FK NOT NULL ke tabel tenant-owned (kategori C)
     • kalau ia memang standar publik, daftarkan sebagai kategori A di
       ADR-011 §5 DAN di scripts/db/klasifikasi-tenancy.mjs`)
}

if (rantaiPalsu.length) {
  gagal = true
  console.error(`\n❌ ${rantaiPalsu.length} rantai kategori C berakhir di tabel SHARED:\n`)
  for (const h of rantaiPalsu) console.error(`   ${h.tabel}: ${h.alasan}`)
  console.error(`
   Tabel SHARED boleh punya company_id, tetapi kolom itu BUKAN penanda
   kepemilikan tenant. Rantai yang berhenti di sana membuat tabel dianggap
   punya tenancy padahal tidak.`)
}

if (perlu.length > LANTAI) {
  gagal = true
  console.error(`\n❌ tabel PERLU-MATA-MANUSIA naik: ${LANTAI} → ${perlu.length}`)
}

if (gagal) process.exit(1)

console.log(`✅ klasifikasi tenancy sehat — ${hasil.length} tabel diperiksa.`)
console.log(`   ${perlu.length}/${LANTAI} perlu keputusan manusia (lantai tak naik)`)
console.log(`   nol rantai kategori C yang berakhir di tabel SHARED`)
