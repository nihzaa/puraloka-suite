#!/usr/bin/env node
/**
 * UJI INVARIAN TRANSFER STOK — membuktikan constraint & RLS benar-benar
 * menolak keadaan yang tak boleh terjadi.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya diam-diam karena tabelnya sudah ada. Satu-satunya cara
 * tahu adalah MENCOBA MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa itu soal barang hilang
 *
 * Transfer memindahkan material antar proyek. Tiap invarian menutup satu
 * jalur di mana barang bisa lenyap atau berlipat tanpa satu pun gejala:
 *
 *   • qty <= 0        → qty negatif MENAMBAH stok di asal dan menguranginya
 *                       di tujuan: persis kebalikan dari yang tertulis di
 *                       layar, tanpa galat apa pun
 *   • asal = tujuan   → dua mutasi saling meniadakan di proyek yang sama;
 *                       kartu stok ramai tanpa barang yang bergerak
 *   • proyek NULL     → transfer bergantung pada dua sisi; satu sisi hilang
 *                       berarti barang keluar tanpa ada yang menerimanya
 *   • RLS dua sisi    → tenant A mendorong material ke proyek tenant B:
 *                       barangnya hilang dari kartu stok A dengan alasan yang
 *                       terlihat sah, dan muncul di tenant yang tak memintanya
 *
 * Yang terakhir paling mahal, dan paling sunyi: tak ada satu pun layar yang
 * akan menunjukkannya.
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-transfer-stok.mjs
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

// Dua proyek dari SATU tenant + satu material nyata.
const { rows: proyek } = await db.query(
  `SELECT id, company_id FROM projects WHERE company_id IS NOT NULL
   ORDER BY company_id LIMIT 2`)
const { rows: bahan } = await db.query('SELECT id FROM materials LIMIT 1')

if (proyek.length < 2 || !bahan.length || proyek[0].company_id !== proyek[1].company_id) {
  console.log('⚠️  Butuh 2 proyek dalam satu company + 1 material. Dilewati.')
  await db.end()
  process.exit(0)
}
const A = proyek[0].id
const B = proyek[1].id
const MAT = bahan[0].id

let lolos = 0
let bocor = 0

/** Kode galat yang berarti "database MENOLAK nilainya". */
const DITOLAK = new Set([
  '23514', // check_violation
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '22003', // numeric_value_out_of_range
  '22P02', // invalid_text_representation
])

async function harusDitolak(nama, kolom) {
  const isi = { project_asal_id: A, project_tujuan_id: B, material_id: MAT, qty: 1, ...kolom }
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO stock_transfers (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      k.map((x) => isi[x]))
    // Masuk = invariannya TIDAK menjaga apa pun. Dibersihkan supaya uji ini
    // tak meninggalkan data buruk yang dipercaya laporan lain.
    await db.query('DELETE FROM stock_transfers WHERE id = $1', [rows[0].id])
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

console.log('\nINVARIAN stock_transfers\n')

await harusDitolak('qty nol',            { qty: 0 })
await harusDitolak('qty negatif',        { qty: -5 })
await harusDitolak('asal = tujuan',      { project_tujuan_id: A })
await harusDitolak('proyek asal NULL',   { project_asal_id: null })
await harusDitolak('proyek tujuan NULL', { project_tujuan_id: null })
await harusDitolak('material NULL',      { material_id: null })
await harusDitolak('qty NULL',           { qty: null })
await harusDitolak('proyek asal karangan',
  { project_asal_id: '00000000-0000-0000-0000-0000000000ff' })

// ── Yang HARUS diterima ────────────────────────────────────────────────────
//
// Penjaga yang hanya menolak akan tetap hijau kalau tabelnya menolak SEMUA
// hal — termasuk transfer yang sah. Uji ini memastikan pagarnya tidak lebih
// rapat dari yang dimaksud.
try {
  const { rows } = await db.query(
    `INSERT INTO stock_transfers (project_asal_id, project_tujuan_id, material_id, qty, alasan)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [A, B, MAT, 2.5, 'uji invarian — dihapus otomatis'])
  await db.query('DELETE FROM stock_transfers WHERE id = $1', [rows[0].id])
  console.log('  ✅ diterima transfer sah (qty pecahan 2,5)')
  lolos++
} catch (e) {
  console.log(`  ❌ BOCOR   transfer SAH ditolak (${e.code} ${e.message.slice(0, 70)})`)
  bocor++
}

// ── RLS: policy tenant memeriksa DUA sisi ─────────────────────────────────
//
// Diperiksa lewat definisi policy, bukan dengan mencoba menembusnya: koneksi
// ini memakai peran pemilik tabel yang MELEWATI RLS, jadi percobaan tembus di
// sini akan selalu "berhasil" dan uji-nya jadi teater.
const { rows: pol } = await db.query(
  `SELECT polname, polpermissive, pg_get_expr(polqual, polrelid) q
     FROM pg_policy WHERE polrelid = 'stock_transfers'::regclass`)

const restr = pol.find((p) => p.polpermissive === false)
if (!restr) {
  console.log('  ❌ BOCOR   tak ada policy RESTRICTIVE — isolasi tenant bergantung pada policy PERMISSIVE saja')
  bocor++
} else {
  const q = restr.q || ''
  const punyaAsal = q.includes('project_asal_id')
  const punyaTujuan = q.includes('project_tujuan_id')
  if (punyaAsal && punyaTujuan) {
    console.log('  ✅ RLS RESTRICTIVE memeriksa asal DAN tujuan')
    lolos++
  } else {
    console.log(`  ❌ BOCOR   RLS hanya memeriksa ${punyaAsal ? 'asal' : 'tujuan'} — material bisa didorong ke tenant lain`)
    bocor++
  }
}

const { rows: rls } = await db.query(
  `SELECT relrowsecurity FROM pg_class WHERE oid = 'stock_transfers'::regclass`)
if (rls[0]?.relrowsecurity) {
  console.log('  ✅ RLS aktif di tabel')
  lolos++
} else {
  console.log('  ❌ BOCOR   RLS TIDAK aktif — semua policy di atas tak berlaku')
  bocor++
}

console.log(`\n${bocor === 0 ? '✅' : '❌'} ${lolos} invarian terjaga, ${bocor} bocor\n`)
await db.end()
process.exit(bocor === 0 ? 0 : 1)
