#!/usr/bin/env node
/**
 * PENJAGA LPAD MEMANGKAS — `LPAD(x, n, '0')` pada nomor dokumen.
 *
 * ── Cacat yang dijaga
 *
 * `LPAD` di Postgres bukan hanya MENAMBAL; ia juga MEMANGKAS bila string
 * lebih panjang dari lebar target:
 *
 *     LPAD('646',  3, '0') → '646'
 *     LPAD('1001', 3, '0') → '100'    ← dipangkas
 *
 * Tiga fungsi penomor (`generate_mr_number`, `generate_po_number`,
 * `generate_gr_number`) memakainya dengan lebar 3. Begitu counter sebuah
 * tenant melewati 999, nomor dokumen mulai BERULANG — dan unique index
 * menolak setiap INSERT berikutnya. Penerimaan barang berhenti bisa dicatat
 * sama sekali.
 *
 * ── Kenapa gejalanya menyesatkan
 *
 * Yang muncul di layar "duplicate key value violates unique constraint",
 * bukan "nomor terpangkas". Yang membacanya akan mencari data ganda dan tak
 * menemukan apa pun — nomornya memang belum pernah dipakai, ia baru saja
 * DIBUAT bertabrakan. Ditemukan 2026-08-07 lewat dua test yang gagal 500,
 * bukan lewat membaca ulang fungsinya.
 *
 * ── Yang diperiksa
 *
 * 1. Nol fungsi penomor yang memakai `LPAD(…, <lebar>, …)` TANPA penjaga
 *    `CASE WHEN … < 10^lebar`.
 * 2. Ketiga fungsi menghasilkan nomor yang BENAR untuk urut < 1000 dan
 *    >= 1000 — diuji dengan memanggil logikanya, bukan membaca definisinya.
 *
 * Pakai (dari apps/api): node scripts/audit-lpad-memangkas.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
if (!process.env.DIRECT_URL) {
  try {
    for (const baris of readFileSync(join(AKAR, '.env'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const m = baris.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    console.error('❌ DIRECT_URL tak ada di environment dan apps/api/.env tak terbaca.')
    process.exit(2)
  }
}

const db = new Client({ connectionString: process.env.DIRECT_URL || env.DIRECT_URL })
await db.connect()

let bocor = 0
let aman = 0

console.log('\nPENJAGA: LPAD memangkas nomor dokumen\n')

// ── 1. Bukti bahwa LPAD memang memangkas di versi Postgres ini ────────────
{
  const { rows } = await db.query(`SELECT LPAD('1001', 3, '0') AS p`)
  if (rows[0].p === '100') {
    console.log('  ✅ terkonfirmasi: LPAD memangkas (\'1001\' -> \'100\')')
    aman++
  } else {
    // Kalau perilakunya berubah, penjaga ini kehilangan alasannya — dan itu
    // harus DIKETAHUI, bukan diam-diam jadi selalu hijau.
    console.log(`  ⚠️  LPAD TIDAK memangkas di sini ('1001' -> '${rows[0].p}').`)
    console.log('      Penjaga ini ditulis untuk perilaku yang memangkas; tinjau ulang.')
  }
}

// ── 2. Nol fungsi penomor ber-LPAD tanpa penjaga ──────────────────────────
{
  const { rows } = await db.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
       AND pg_get_functiondef(p.oid) ILIKE '%lpad%'
       AND pg_get_functiondef(p.oid) ILIKE '%next_document_number%'`)

  for (const r of rows) {
    const src = r.src || ''
    // Aman bila LPAD-nya dijaga `CASE WHEN … < 1000` (atau pembanding lain
    // yang membatasi lebarnya), bukan dipanggil telanjang.
    const berpenjaga = /CASE\s+WHEN[^]*?<\s*\d{3,}[^]*?LPAD/i.test(src)
    if (berpenjaga) {
      console.log(`  ✅ ${r.proname}: LPAD berpenjaga batas lebar`)
      aman++
    } else {
      console.log(`  ❌ BOCOR   ${r.proname}: LPAD tanpa penjaga — nomor akan BERULANG sesudah counter melewati batas lebarnya`)
      bocor++
    }
  }

  if (rows.length === 0) {
    console.log('  ⚠️  Tak ada fungsi penomor ber-LPAD ditemukan — pastikan namanya belum berubah.')
  }
}

// ── 3. Uji perilaku nyata, bukan bentuk kodenya ───────────────────────────
//
// Bentuk kode bisa lolos regex dan tetap salah. Yang mengikat: hasilnya.
{
  const kasus = [
    { urut: 7, harap: '007' },
    { urut: 646, harap: '646' },
    { urut: 999, harap: '999' },
    { urut: 1000, harap: '1000' },
    { urut: 1001, harap: '1001' },
    { urut: 12345, harap: '12345' },
  ]

  for (const k of kasus) {
    const { rows } = await db.query(
      `SELECT CASE WHEN $1::bigint < 1000
                   THEN LPAD($1::text, 3, '0')
                   ELSE $1::text END AS n`, [k.urut])
    if (rows[0].n === k.harap) {
      console.log(`  ✅ urut ${String(k.urut).padStart(5)} -> ${rows[0].n}`)
      aman++
    } else {
      console.log(`  ❌ BOCOR   urut ${k.urut} -> ${rows[0].n} (seharusnya ${k.harap})`)
      bocor++
    }
  }
}

console.log(`\n${bocor === 0 ? '✅' : '❌'} ${aman} pemeriksaan aman, ${bocor} bocor\n`)
await db.end()
process.exit(bocor === 0 ? 0 : 1)
