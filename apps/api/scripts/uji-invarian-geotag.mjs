#!/usr/bin/env node
/**
 * UJI INVARIAN GEOTAG — membuktikan constraint koordinat menolak nilai yang
 * mustahil.
 *
 * ── Yang dijaga, dan kenapa
 *
 * Koordinat salah TIDAK menghasilkan galat apa pun — ia hanya menaruh titik
 * di tempat yang salah. Dua kesalahan paling umum:
 *
 *   lintang/bujur TERTUKAR  → titik di tengah Samudra Hindia
 *   satu diisi, satu tidak  → "ada lokasi" yang tak bisa dipetakan
 *
 * Keduanya terlihat masuk akal di database. Yang menangkapnya harus
 * constraint, dan constraint yang tak pernah dicoba dilanggar sama saja tak
 * ada.
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-geotag.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const baris of readFileSync(join(AKAR, '.env'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
  const m = baris.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const db = new Client({
  connectionString: env.DIRECT_URL || env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await db.connect()

const { rows: proyek } = await db.query('SELECT id FROM projects LIMIT 1')
const { rows: user } = await db.query('SELECT id FROM users LIMIT 1')
if (!proyek.length || !user.length) {
  console.log('⚠️  Butuh minimal 1 proyek dan 1 user. Dilewati.')
  await db.end()
  process.exit(0)
}
const PID = proyek[0].id
const UID = user[0].id

let lolos = 0
let bocor = 0
let n = 0

async function coba(nama, kolom, harusDitolak) {
  n++
  const isi = {
    project_id: PID,
    uploaded_by: UID,
    url: `uji-geotag-${Date.now()}-${n}`,
    ...kolom,
  }
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO project_photos (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      Object.values(isi),
    )
    await db.query('DELETE FROM project_photos WHERE id = $1', [rows[0].id])
    if (harusDitolak) { console.log(`  ✗ BOCOR    ${nama}`); bocor++ }
    else { console.log(`  ✓ diterima ${nama}`); lolos++ }
  } catch (e) {
    if (!harusDitolak) {
      console.log(`  ✗ DITOLAK PADAHAL SAH  ${nama}: ${e.message.split('\n')[0].slice(0, 80)}`)
      bocor++
    } else if (e.code === '23514') {
      console.log(`  ✓ ditolak  ${nama}`)
      lolos++
    } else {
      // Galat selain CHECK berarti UJINYA yang salah — dan itu harus
      // terlihat, bukan disamarkan sebagai keberhasilan.
      console.log(`  ⚠ galat lain (${e.code}) ${nama}: ${e.message.split('\n')[0].slice(0, 70)}`)
      bocor++
    }
  }
}

console.log('── Baris SAH harus bisa masuk ──')
await coba('foto tanpa koordinat sama sekali', {}, false)
await coba('koordinat Bandung + sumber GPS', {
  lintang: -6.9174639, bujur: 107.6191228,
  akurasi_m: 12.5, sumber_lokasi: 'perangkat',
  lokasi_dicatat_pada: new Date().toISOString(),
}, false)
await coba('koordinat dari EXIF, tanpa akurasi', {
  lintang: -6.2, bujur: 106.8, sumber_lokasi: 'exif',
}, false)

console.log('\n── Koordinat mustahil ──')
await coba('lintang 95 (di luar ±90)', {
  lintang: 95, bujur: 107, sumber_lokasi: 'manual',
}, true)
await coba('bujur 200 (di luar ±180)', {
  lintang: -6.9, bujur: 200, sumber_lokasi: 'manual',
}, true)
await coba('lintang/bujur TERTUKAR (107 sebagai lintang)', {
  lintang: 107.6191228, bujur: -6.9174639, sumber_lokasi: 'perangkat',
}, true)

console.log('\n── Koordinat harus berpasangan ──')
await coba('lintang tanpa bujur', { lintang: -6.9, sumber_lokasi: 'manual' }, true)
await coba('bujur tanpa lintang', { bujur: 107.6, sumber_lokasi: 'manual' }, true)

console.log('\n── Koordinat harus bersumber ──')
await coba('koordinat tanpa sumber_lokasi', { lintang: -6.9, bujur: 107.6 }, true)

console.log('\n── Radius proyek ──')
try {
  await db.query('UPDATE projects SET radius_lokasi_m = 0 WHERE id = $1', [PID])
  console.log('  ✗ BOCOR    radius 0 diterima')
  bocor++
  await db.query('UPDATE projects SET radius_lokasi_m = 500 WHERE id = $1', [PID])
} catch (e) {
  if (e.code === '23514') { console.log('  ✓ ditolak  radius 0'); lolos++ }
  else { console.log(`  ⚠ galat lain (${e.code}) radius 0`); bocor++ }
}

console.log(`\n${lolos} invarian tegak · ${bocor} bocor`)
await db.end()
process.exit(bocor ? 1 : 0)
