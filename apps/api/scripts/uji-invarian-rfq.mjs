#!/usr/bin/env node
/**
 * UJI INVARIAN RFQ & PENAWARAN VENDOR — membuktikan constraint benar-benar
 * menolak keadaan yang tak boleh terjadi.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya karena tabelnya sudah ada. Satu-satunya cara tahu
 * adalah MENCOBA MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa itu soal uang yang salah arah
 *
 * Tabel ini MEMILIH VENDOR. Tiap invarian menutup satu jalur di mana vendor
 * yang salah bisa menang tanpa satu pun gejala:
 *
 *   • harga 0 tanpa `tidak_menawar` → 0 SELALU menang sebagai termurah, dan
 *     PO terbit ke vendor yang tak menawarkan apa pun
 *   • harga negatif                 → menang lebih telak lagi, dan totalnya
 *                                     mengurangi belanja seolah vendor membayar kita
 *   • penawaran ganda               → satu vendor terhitung dua kali di tabulasi
 *   • nomor RFQ ganda               → dua RFQ berbeda tak bisa dibedakan di jejak audit
 *   • RLS `rfq_penawaran`           → harga penawaran vendor adalah informasi
 *                                     komersial yang paling merugikan kalau bocor lintas tenant
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-rfq.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

// Berlabuh ke lokasi berkas ini, bukan ke cwd — penjaga yang bergantung pada
// direktori pemanggil akan lulus dengan nol temuan saat dipanggil dari akar.
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

const { rows: proyek } = await db.query('SELECT id FROM projects LIMIT 1')
const { rows: bahan } = await db.query('SELECT id FROM materials LIMIT 1')
const { rows: vendor } = await db.query('SELECT id FROM suppliers LIMIT 1')

if (!proyek.length || !bahan.length || !vendor.length) {
  console.log('⚠️  Butuh minimal 1 project, 1 material, dan 1 supplier. Dilewati.')
  await db.end()
  process.exit(0)
}
const PID = proyek[0].id
const MAT = bahan[0].id
const SUP = vendor[0].id

let lolos = 0
let bocor = 0
let nomor = 0

const DITOLAK = new Set([
  '23514', // check_violation
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '23505', // unique_violation
  '22003', // numeric_value_out_of_range
])

const nomorUji = () => `UJI-RFQ-${++nomor}-${PID.slice(0, 8)}`

/** RFQ induk sementara — dibuang di akhir. */
const { rows: induk } = await db.query(
  `INSERT INTO rfq (nomor, project_id) VALUES ($1, $2) RETURNING id`,
  [nomorUji(), PID])
const RFQ = induk[0].id

async function coba(tabel, nama, isi, harusMasuk) {
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO ${tabel} (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      k.map((x) => isi[x]))
    await db.query(`DELETE FROM ${tabel} WHERE id = $1`, [rows[0].id])
    if (harusMasuk) {
      console.log(`  ✅ diterima ${nama}`)
      lolos++
    } else {
      console.log(`  ❌ BOCOR   ${nama} — basis MENERIMA nilai yang tak boleh masuk`)
      bocor++
    }
  } catch (e) {
    if (harusMasuk) {
      console.log(`  ❌ BOCOR   ${nama} DITOLAK (${e.code} ${e.message.slice(0, 70)})`)
      bocor++
    } else if (DITOLAK.has(e.code)) {
      console.log(`  ✅ ditolak ${nama} (${e.code})`)
      lolos++
    } else {
      console.log(`  ❌ BOCOR   ${nama} — ditolak, tapi karena galat lain: ${e.code} ${e.message.slice(0, 60)}`)
      bocor++
    }
  }
}

const tawar = (o) => ({ rfq_id: RFQ, supplier_id: SUP, material_id: MAT, qty: 10, harga_satuan: 1000, ...o })

console.log('\nINVARIAN rfq & rfq_penawaran\n')

// ── Yang HARUS ditolak ─────────────────────────────────────────────────────
await coba('rfq_penawaran', 'harga 0 TANPA tandai tidak_menawar', tawar({ harga_satuan: 0 }), false)
await coba('rfq_penawaran', 'harga negatif', tawar({ harga_satuan: -5000 }), false)
await coba('rfq_penawaran', 'qty nol', tawar({ qty: 0 }), false)
await coba('rfq_penawaran', 'qty negatif', tawar({ qty: -3 }), false)
await coba('rfq_penawaran', 'waktu kirim negatif', tawar({ waktu_kirim_hari: -1 }), false)
await coba('rfq_penawaran', 'waktu kirim 999 hari', tawar({ waktu_kirim_hari: 999 }), false)
await coba('rfq_penawaran', 'rfq_id NULL', tawar({ rfq_id: null }), false)
await coba('rfq_penawaran', 'supplier NULL', tawar({ supplier_id: null }), false)
await coba('rfq', 'status karangan', { nomor: nomorUji(), project_id: PID, status: 'entah' }, false)
await coba('rfq', 'proyek karangan',
  { nomor: nomorUji(), project_id: '00000000-0000-0000-0000-0000000000ff' }, false)

// ── Yang HARUS diterima ────────────────────────────────────────────────────
//
// Penjaga yang hanya menolak akan tetap hijau kalau tabelnya menolak SEMUA
// hal, termasuk penawaran yang sah.
await coba('rfq_penawaran', 'penawaran sah', tawar({ harga_satuan: 125000.5, waktu_kirim_hari: 7 }), true)
await coba('rfq_penawaran', 'harga 0 DENGAN tandai tidak_menawar',
  tawar({ harga_satuan: 0, tidak_menawar: true }), true)
await coba('rfq', 'RFQ sah tanpa MR (survei harga awal)', { nomor: nomorUji(), project_id: PID }, true)

// ── Penawaran GANDA satu vendor + satu material ────────────────────────────
//
// Tanpa keunikan, penawaran revisi masuk sebagai baris kedua dan tabulasinya
// menghitung vendor yang sama dua kali — dengan dua harga berbeda.
{
  const { rows } = await db.query(
    `INSERT INTO rfq_penawaran (rfq_id, supplier_id, material_id, qty, harga_satuan)
     VALUES ($1,$2,$3,10,1000) RETURNING id`, [RFQ, SUP, MAT])
  await coba('rfq_penawaran', 'penawaran GANDA (vendor+material sama)', tawar({ harga_satuan: 900 }), false)
  await db.query('DELETE FROM rfq_penawaran WHERE id = $1', [rows[0].id])
}

// ── Nomor RFQ ganda ────────────────────────────────────────────────────────
{
  const n = nomorUji()
  const { rows } = await db.query(
    `INSERT INTO rfq (nomor, project_id) VALUES ($1,$2) RETURNING id`, [n, PID])
  await coba('rfq', 'nomor RFQ GANDA', { nomor: n, project_id: PID }, false)
  await db.query('DELETE FROM rfq WHERE id = $1', [rows[0].id])
}

// ── RLS ────────────────────────────────────────────────────────────────────
//
// Diperiksa lewat definisi policy, bukan dengan mencoba menembusnya: koneksi
// ini memakai peran pemilik tabel yang MELEWATI RLS, jadi percobaan tembus di
// sini akan selalu "berhasil" dan ujinya jadi teater.
for (const t of ['rfq', 'rfq_penawaran']) {
  const { rows: pol } = await db.query(
    `SELECT polpermissive, pg_get_expr(polqual, polrelid) q
       FROM pg_policy WHERE polrelid = $1::regclass`, [t])
  const restr = pol.find((p) => p.polpermissive === false)
  if (restr && (restr.q || '').includes('project_company_id')) {
    console.log(`  ✅ RLS RESTRICTIVE ${t} menyaring lewat company proyek`)
    lolos++
  } else {
    console.log(`  ❌ BOCOR   ${t}: tak ada policy RESTRICTIVE yang menyaring tenant`)
    bocor++
  }

  const { rows: rls } = await db.query(
    `SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass`, [t])
  if (rls[0]?.relrowsecurity) {
    console.log(`  ✅ RLS aktif di ${t}`)
    lolos++
  } else {
    console.log(`  ❌ BOCOR   RLS TIDAK aktif di ${t} — semua policy tak berlaku`)
    bocor++
  }
}

await db.query('DELETE FROM rfq WHERE id = $1', [RFQ])

console.log(`\n${bocor === 0 ? '✅' : '❌'} ${lolos} invarian terjaga, ${bocor} bocor\n`)
await db.end()
process.exit(bocor === 0 ? 0 : 1)
