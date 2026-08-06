#!/usr/bin/env node
/**
 * UJI INVARIAN MATERIAL MILIK KLIEN (free issue) — membuktikan constraint
 * benar-benar menolak keadaan yang tak boleh terjadi.
 *
 * ── Uji ini sudah membayar ongkosnya sendiri
 *
 * Rancangan PERTAMA menaruh penanda `milik_klien` di `goods_receipts`. Uji
 * ini langsung merah: `po_id` dan `supplier_id` di tabel itu **NOT NULL**,
 * padahal material owner tak punya keduanya. Melanjutkannya berarti
 * `DROP NOT NULL` pada tabel berisi data finansial hidup — Gerbang Keras G-2,
 * dan `supplier-invoices` sudah membandingkan `gr.supplier_id` sehingga null
 * di sana merambat.
 *
 * Rancangannya diganti jadi tabel tersendiri SEBELUM satu baris pun ditulis.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya karena tabelnya sudah ada. Satu-satunya cara tahu
 * adalah MENCOBA MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa itu soal angka yang menuduh
 *
 * Material owner masuk gudang, dipakai, dan tersisa persis seperti material
 * sendiri. Kalau ia bocor ke sisi "dibeli" di `/gudang/rekonsiliasi`, ia
 * menggelembungkan penyebut susut DAN membuat perusahaan tampak memborong
 * material yang tak pernah ia beli sesen pun.
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-material-klien.mjs
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

if (!proyek.length || !bahan.length) {
  console.log('⚠️  Butuh minimal 1 project dan 1 material. Dilewati.')
  await db.end()
  process.exit(0)
}
const PID = proyek[0].id
const MAT = bahan[0].id

let lolos = 0
let bocor = 0

const DITOLAK = new Set([
  '23514', // check_violation
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '22003', // numeric_value_out_of_range
])

async function harusDitolak(nama, kolom) {
  const isi = { project_id: PID, material_id: MAT, qty: 1, ...kolom }
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO penerimaan_material_klien (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      k.map((x) => isi[x]))
    // Masuk = invariannya TIDAK menjaga apa pun. Dibersihkan supaya uji ini
    // tak meninggalkan data buruk yang dipercaya laporan lain.
    await db.query('DELETE FROM penerimaan_material_klien WHERE id = $1', [rows[0].id])
    console.log(`  ❌ BOCOR   ${nama} — basis MENERIMA nilai yang tak boleh masuk`)
    bocor++
  } catch (e) {
    if (DITOLAK.has(e.code)) {
      console.log(`  ✅ ditolak ${nama} (${e.code})`)
      lolos++
    } else {
      console.log(`  ❌ BOCOR   ${nama} — ditolak, tapi karena galat lain: ${e.code} ${e.message.slice(0, 60)}`)
      bocor++
    }
  }
}

async function harusDiterima(nama, kolom) {
  const isi = { project_id: PID, material_id: MAT, qty: 1, ...kolom }
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO penerimaan_material_klien (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      k.map((x) => isi[x]))
    await db.query('DELETE FROM penerimaan_material_klien WHERE id = $1', [rows[0].id])
    console.log(`  ✅ diterima ${nama}`)
    lolos++
  } catch (e) {
    console.log(`  ❌ BOCOR   ${nama} DITOLAK (${e.code} ${e.message.slice(0, 70)})`)
    bocor++
  }
}

console.log('\nINVARIAN penerimaan material klien (free issue)\n')

await harusDitolak('qty nol', { qty: 0 })
await harusDitolak('qty negatif', { qty: -5 })
await harusDitolak('qty NULL', { qty: null })
await harusDitolak('proyek NULL', { project_id: null })
await harusDitolak('material NULL', { material_id: null })
await harusDitolak('proyek karangan', { project_id: '00000000-0000-0000-0000-0000000000ff' })

// Yang HARUS diterima — pagarnya tak boleh lebih rapat dari maksudnya.
// Penjaga yang hanya menolak akan tetap hijau kalau tabelnya menolak SEMUA
// hal, termasuk penerimaan yang sah.
await harusDiterima('penerimaan sah tanpa PO & tanpa supplier',
  { qty: 2.5, pemasok: 'PT Owner Sejahtera', nomor_surat_jalan: 'SJ-001' })
await harusDiterima('pemasok boleh kosong (owner tak selalu menyebut)', { qty: 1 })

// ── RLS ────────────────────────────────────────────────────────────────────
//
// Diperiksa lewat definisi policy, bukan dengan mencoba menembusnya: koneksi
// ini memakai peran pemilik tabel yang MELEWATI RLS, jadi percobaan tembus di
// sini akan selalu "berhasil" dan ujinya jadi teater.
const { rows: pol } = await db.query(
  `SELECT polname, polpermissive, pg_get_expr(polqual, polrelid) q
     FROM pg_policy WHERE polrelid = 'penerimaan_material_klien'::regclass`)

const restr = pol.find((p) => p.polpermissive === false)
if (restr && (restr.q || '').includes('project_company_id')) {
  console.log('  ✅ RLS RESTRICTIVE menyaring lewat company proyek')
  lolos++
} else {
  console.log('  ❌ BOCOR   tak ada policy RESTRICTIVE yang menyaring tenant')
  bocor++
}

const { rows: rls } = await db.query(
  `SELECT relrowsecurity FROM pg_class WHERE oid = 'penerimaan_material_klien'::regclass`)
if (rls[0]?.relrowsecurity) {
  console.log('  ✅ RLS aktif di tabel')
  lolos++
} else {
  console.log('  ❌ BOCOR   RLS TIDAK aktif — semua policy di atas tak berlaku')
  bocor++
}

// ── `goods_receipts` TIDAK BOLEH ikut berubah ─────────────────────────────
//
// Rancangan pertama menambahkan kolom ke sana dan menuntut `DROP NOT NULL`
// (G-2). Penjaga ini memastikan tak ada yang diam-diam menempuh jalur itu
// lagi: kalau `po_id` suatu hari jadi nullable, pembandingan
// `gr.supplier_id !== body.supplier_id` di `supplier-invoices` mulai
// membandingkan dengan null tanpa ada satu pun yang menyadarinya.
const { rows: grKol } = await db.query(
  `SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_name = 'goods_receipts' AND column_name IN ('po_id','supplier_id')
    ORDER BY column_name`)
const semuaWajib = grKol.length === 2 && grKol.every((k) => k.is_nullable === 'NO')
if (semuaWajib) {
  console.log('  ✅ goods_receipts.po_id & supplier_id tetap NOT NULL (G-2 tak tersentuh)')
  lolos++
} else {
  console.log(`  ❌ BOCOR   nullability goods_receipts berubah: ${JSON.stringify(grKol)}`)
  bocor++
}

console.log(`\n${bocor === 0 ? '✅' : '❌'} ${lolos} invarian terjaga, ${bocor} bocor\n`)
await db.end()
process.exit(bocor === 0 ? 0 : 1)
