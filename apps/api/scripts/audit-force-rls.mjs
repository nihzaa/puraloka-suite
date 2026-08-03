#!/usr/bin/env node
// ============================================================================
// PENJAGA — tripwire keputusan F2-6 (`relforcerowsecurity`).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// F2-6 memutuskan TIDAK memaksa RLS, dan keputusan itu bertumpu pada SATU
// fakta yang bisa berubah: koneksi API memakai peran ber-`rolbypassrls`.
//
// Selama itu benar, `FORCE` menghasilkan nol perubahan perilaku — diuji
// langsung: 15 proyek terlihat sebelum dan sesudah `FORCE`, karena
// `rolbypassrls` menang atasnya.
//
// Begitu faktanya berubah, `FORCE` berubah dari tak-berguna menjadi WAJIB.
// Dan perubahan itu tak akan mengumumkan dirinya: ia terjadi saat seseorang
// memindahkan koneksi API ke peran baru (ADR-011 §7 sudah merencanakannya),
// atau saat sebuah migrasi membuat tabel dengan pemilik berbeda.
//
// Dokumen keputusan tak bisa menjaga dirinya sendiri. Penjaga ini yang membuat
// keusangannya jadi MERAH di CI, bukan jadi asumsi yang diam-diam salah.
//
// ⚠️ Butuh koneksi DB. Tanpa DB ia MELEWATI diri sendiri dengan pesan, bukan
//    hijau diam-diam — hijau tanpa memeriksa apa pun adalah kegagalan yang
//    menyamar sebagai keberhasilan.
// ============================================================================

import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const req = createRequire(resolve(REPO, 'apps/api/package.json'))

let pg
try {
  pg = req('pg')
} catch {
  console.log('⏭  DILEWATI — paket pg tak terpasang.')
  process.exit(0)
}

// Parser .env minimal — sengaja tak mengimpor scripts/db/_koneksi.mjs supaya
// penjaga ini tetap jalan walau modul itu sedang diubah.
const { readFileSync, existsSync } = await import('node:fs')
const envPath = resolve(REPO, 'apps/api/.env')
let url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url && existsSync(envPath)) {
  for (const baris of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = baris.replace(/^﻿/, '').match(/^\s*(DIRECT_URL|DATABASE_URL)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (m[1] === 'DIRECT_URL' || !url) url = v
  }
}

if (!url) {
  console.log('⏭  DILEWATI — DIRECT_URL tak ditemukan.')
  console.log('   Penjaga ini butuh DB; ia TIDAK menyatakan hijau tanpa memeriksa.')
  process.exit(0)
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
try {
  await c.connect()
} catch (e) {
  console.log('⏭  DILEWATI — DB tak terjangkau: ' + String(e.message).slice(0, 60))
  process.exit(0)
}

let gagal = false

// ── Tripwire 1: peran koneksi masih ber-bypass? ─────────────────────────────
const { rows: peran } = await c.query(
  `SELECT current_user AS nama,
          (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`)

if (peran[0].bypass !== true) {
  gagal = true
  console.error(`❌ TRIPWIRE 1 — peran koneksi '${peran[0].nama}' TIDAK lagi ber-rolbypassrls.

   Keputusan F2-6 ("tidak memaksa RLS") bertumpu pada fakta itu. Tanpa bypass,
   pemilik tabel MELEWATI policy-nya sendiri kecuali RLS dipaksa — dan seluruh
   123 tabel dimiliki peran yang sama dengan yang dipakai aplikasi.

   Artinya FORCE kini BERARTI, dan keputusan lamanya kedaluwarsa.

   Tinjau ulang: docs/adr/F2-6-KEPUTUSAN-FORCE-RLS.md §6`)
}

// ── Tripwire 2: ada tabel yang pemiliknya bukan `postgres`? ─────────────────
const { rows: asing } = await c.query(`
  SELECT c.relname, pg_get_userbyid(c.relowner) AS pemilik
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND pg_get_userbyid(c.relowner) <> 'postgres'
   ORDER BY 1`)

if (asing.length) {
  gagal = true
  console.error(`\n❌ TRIPWIRE 2 — ${asing.length} tabel dimiliki peran selain 'postgres':\n`)
  for (const t of asing) console.error(`   ${t.relname} → ${t.pemilik}`)
  console.error(`
   Asumsi F2-6 §4 (satu pemilik untuk semua tabel) tak lagi berlaku bagi tabel
   itu. Pemiliknya bisa saja TIDAK punya rolbypassrls, dan bagi tabel itu
   FORCE menentukan.`)
}

// ── Informasi, bukan kegagalan: berapa yang sudah dipaksa ───────────────────
const { rows: hitung } = await c.query(`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE relrowsecurity)::int AS aktif,
         count(*) FILTER (WHERE relforcerowsecurity)::int AS dipaksa
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'`)

// RLS yang MATI adalah kegagalan tersendiri — dan itu bukan bagian keputusan
// F2-6, melainkan Ember [C] (`CLAUDE.md` §5.3: RLS aktif/mati tak boleh
// dikonfigurasi).
if (hitung[0].aktif < hitung[0].total) {
  gagal = true
  console.error(`\n❌ ${hitung[0].total - hitung[0].aktif} tabel dengan RLS MATI.` +
    `\n   Itu Ember [C] — RLS aktif/mati tidak boleh dikonfigurasi.`)
}

await c.end()

if (gagal) process.exit(1)

console.log('✅ tripwire F2-6 aman.')
console.log(`   ${hitung[0].aktif}/${hitung[0].total} tabel ber-RLS · ` +
            `${hitung[0].dipaksa} dipaksa (nol = keputusan F2-6, bukan kelalaian)`)
console.log(`   peran koneksi '${peran[0].nama}' masih ber-rolbypassrls — ` +
            'FORCE tetap tak berpengaruh')
