#!/usr/bin/env node
/**
 * UJI INVARIAN ABSENSI — membuktikan constraint benar-benar menolak keadaan
 * yang tak boleh terjadi.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau tabelnya sudah ada
 * lebih dulu sehingga `CREATE TABLE IF NOT EXISTS` melewatinya diam-diam.
 * Satu-satunya cara tahu adalah MENCOBA MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa itu soal uang
 *
 * `absensi_harian` menjadi sumber `days_worked` di laporan upah. Setiap
 * invarian di bawah menutup satu jalur di mana angka upah bisa salah tanpa
 * satu pun gejala:
 *
 *   • porsi > 1     → satu hari dihitung lebih dari satu hari
 *   • porsi < 0     → hari kerja negatif mengurangi total orang lain
 *   • lembur > 16   → salah ketik (240) jadi nominal yang mustahil
 *   • tanggal depan → absensi untuk hari yang belum terjadi
 *   • DOBEL         → satu hari tercatat dua kali = upah ganda
 *
 * Yang terakhir paling mahal: dobel-absen tidak terlihat di layar mana pun
 * sampai seseorang menjumlahkan ulang secara manual.
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-absensi.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

/**
 * Koneksi: variabel lingkungan LEBIH DULU, `.env` sebagai cadangan.
 *
 * Di CI tak ada `apps/api/.env` — `readFileSync` akan melempar sebelum satu
 * pun invarian diuji, dan langkahnya merah karena alasan yang tak ada
 * hubungannya dengan skema. Di mesin lokal `.env` yang dipakai.
 *
 * BOM dan tanda kutip dilucuti saat membaca berkas (CLAUDE.md §7).
 */
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

// Data pinjaman: satu lingkup kerja + satu pekerja nyata.
const { rows: scope } = await db.query('SELECT id FROM work_scopes LIMIT 1')
const { rows: worker } = await db.query('SELECT id FROM workers LIMIT 1')
if (!scope.length || !worker.length) {
  console.log('⚠️  Butuh minimal 1 work_scope dan 1 worker di database. Dilewati.')
  await db.end()
  process.exit(0)
}
const SID = scope[0].id
const WID = worker[0].id

/*
  ⚠ BERSIHKAN SISA JALAN SEBELUMNYA — 2026-09-04, dua kali diperbaiki.

  Tiap uji menghapus barisnya sendiri SESUDAH berhasil. Tetapi kalau satu
  jalan terputus di tengah — galat tak terduga, timeout, atau run CI yang
  dibatalkan push berikutnya — barisnya TERTINGGAL, dan jalan berikutnya
  menabraknya SELAMANYA sampai seseorang membersihkan basis dengan tangan.

  Gejalanya menuduh invariannya, dua lapis berbeda:

      ✗ DITOLAK PADAHAL SAH  porsi 0.5 (setengah hari):
        duplicate key ... "uq_absensi_scope_worker_tanggal"

  "DITOLAK PADAHAL SAH" terbaca seperti CHECK yang terlalu ketat — padahal
  yang menolak keunikan, dan barisnya milik penjaga ini sendiri.

  ⚠ SAPUAN PERTAMA MENGUNCI KE SID/WID, dan itu tak cukup.

  `SID`/`WID` dipilih `LIMIT 1` TANPA `ORDER BY` — jalan berikutnya bisa
  mendapat scope/worker LAIN, dan sapuan yang terkunci ke pasangan hari ini
  tak menyentuh sisa milik pasangan kemarin.

  Ketahuan dari CI: bagian `porsi_hari` LOLOS (perbaikan pertama bekerja),
  lalu mati di bagian keunikan — yang insert PERTAMANYA ada DI LUAR `try`,
  sehingga bentrok di situ mematikan proses, bukan dihitung sebagai bocor.

  Sapuan kini hanya menyaring RENTANG TANGGAL. Tahun 2021 tak dipakai data
  uji lain di repo ini, jadi ia tetap sempit — dan tak lagi bergantung pada
  scope/worker mana yang kebetulan terpilih.

  (Tanggal masa depan TIDAK perlu disapu: CHECK `absensi_tanggal` menolaknya,
  jadi baris seperti itu mustahil tersisa. Diuji langsung — percobaan menanam
  satu ditolak `23514`.)
*/
const { rowCount: sisa } = await db.query(
  `DELETE FROM absensi_harian
    WHERE tanggal >= DATE '2021-01-01' AND tanggal < DATE '2022-01-01'`,
)
if (sisa > 0) console.log(`  (dibersihkan ${sisa} baris sisa jalan sebelumnya)`)

let lolos = 0
let bocor = 0
let nomor = 0

/** Tanggal unik per uji supaya keunikan (scope, worker, tanggal) tak
 *  menabrak uji lain — kecuali saat keunikan ITU yang sedang diuji. */
function tanggalUji() {
  nomor++
  const d = new Date('2021-01-01')
  d.setDate(d.getDate() + nomor)
  return d.toISOString().slice(0, 10)
}

/**
 * Kode galat yang berarti "database MENOLAK nilainya".
 *
 * Bukan hanya `23514` (CHECK). `NUMERIC(4,2)` menolak 240 lewat `22003`
 * (numeric field overflow) SEBELUM CHECK sempat menilainya — nilainya tetap
 * tidak masuk, hanya penjaganya yang berbeda.
 *
 * Uji versi pertama hanya menerima `23514` dan melaporkan itu sebagai
 * "BOCOR". Itu salah dan menyesatkan: yang diuji adalah apakah nilai buruk
 * bisa MASUK, bukan mekanisme mana yang menghentikannya. Penjaga yang
 * menuntut jalur penolakan tertentu akan berteriak setiap kali skema
 * diperketat dengan cara lain.
 */
const DITOLAK = new Set([
  '23514', // check_violation
  '22003', // numeric_value_out_of_range
  '22P02', // invalid_text_representation
])

async function harusDitolak(nama, kolom, kodeDiharap = DITOLAK) {
  const isi = { scope_id: SID, worker_id: WID, tanggal: tanggalUji(), ...kolom }
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO absensi_harian (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      Object.values(isi),
    )
    await db.query('DELETE FROM absensi_harian WHERE id = $1', [rows[0].id])
    console.log(`  ✗ BOCOR  ${nama}`)
    bocor++
  } catch (e) {
    // Hanya kode yang DIHARAPKAN dihitung lolos. Galat lain (kolom tak ada,
    // tipe salah) berarti UJINYA yang salah, bukan invariannya bekerja — dan
    // itu harus terlihat, bukan disamarkan sebagai keberhasilan.
    const cocok = kodeDiharap instanceof Set ? kodeDiharap.has(e.code) : e.code === kodeDiharap
    if (cocok) {
      console.log(`  ✓ ditolak  ${nama}`)
      lolos++
    } else {
      console.log(`  ⚠ galat lain (${e.code}) ${nama}: ${e.message.split('\n')[0].slice(0, 80)}`)
      bocor++
    }
  }
}

/** Menyisipkan baris yang seharusnya DITERIMA — memastikan uji di atas tak
 *  lolos hanya karena semua insert kebetulan gagal. */
async function harusDiterima(nama, kolom) {
  const isi = { scope_id: SID, worker_id: WID, tanggal: tanggalUji(), ...kolom }
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO absensi_harian (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      Object.values(isi),
    )
    await db.query('DELETE FROM absensi_harian WHERE id = $1', [rows[0].id])
    console.log(`  ✓ diterima ${nama}`)
    lolos++
  } catch (e) {
    console.log(`  ✗ DITOLAK PADAHAL SAH  ${nama}: ${e.message.split('\n')[0].slice(0, 80)}`)
    bocor++
  }
}

console.log('\n══ INVARIAN ABSENSI LAPANGAN ══\n')

console.log('porsi_hari — satu hari tak boleh dihitung lebih dari satu hari')
await harusDitolak('porsi 1.5 (lebih dari satu hari)', { porsi_hari: 1.5 })
await harusDitolak('porsi 2 (dua hari dalam satu hari)', { porsi_hari: 2 })
await harusDitolak('porsi negatif', { porsi_hari: -0.5 })
await harusDiterima('porsi 0 (tidak hadir — DICATAT, bukan dihapus)', { porsi_hari: 0 })
await harusDiterima('porsi 0.5 (setengah hari)', { porsi_hari: 0.5 })
await harusDiterima('porsi 1 (hari penuh)', { porsi_hari: 1 })

console.log('\njam_lembur — salah ketik tak boleh jadi nominal mustahil')
await harusDitolak('lembur 24 jam (melebihi batas wajar 16)', { jam_lembur: 24 })
await harusDitolak('lembur 240 (salah ketik khas)', { jam_lembur: 240 })
await harusDitolak('lembur negatif', { jam_lembur: -1 })
await harusDiterima('lembur 3 jam', { jam_lembur: 3 })
await harusDiterima('lembur 16 jam (tepat di batas)', { jam_lembur: 16 })

console.log('\ntanggal — absensi masa depan tak punya arti')
{
  const besokLusa = new Date()
  besokLusa.setDate(besokLusa.getDate() + 7)
  const isi = { scope_id: SID, worker_id: WID, tanggal: besokLusa.toISOString().slice(0, 10) }
  try {
    const { rows } = await db.query(
      `INSERT INTO absensi_harian (scope_id, worker_id, tanggal) VALUES ($1,$2,$3) RETURNING id`,
      [isi.scope_id, isi.worker_id, isi.tanggal],
    )
    await db.query('DELETE FROM absensi_harian WHERE id = $1', [rows[0].id])
    console.log('  ✗ BOCOR  tanggal seminggu ke depan')
    bocor++
  } catch (e) {
    if (e.code === '23514') { console.log('  ✓ ditolak  tanggal seminggu ke depan'); lolos++ }
    else { console.log(`  ⚠ galat lain (${e.code})`); bocor++ }
  }
}

console.log('\nkeunikan — dobel-absen menggandakan upah tanpa gejala')
{
  const tgl = tanggalUji()
  const { rows } = await db.query(
    `INSERT INTO absensi_harian (scope_id, worker_id, tanggal, porsi_hari)
     VALUES ($1,$2,$3,1) RETURNING id`, [SID, WID, tgl])
  try {
    const { rows: dua } = await db.query(
      `INSERT INTO absensi_harian (scope_id, worker_id, tanggal, porsi_hari)
       VALUES ($1,$2,$3,1) RETURNING id`, [SID, WID, tgl])
    await db.query('DELETE FROM absensi_harian WHERE id = $1', [dua[0].id])
    console.log('  ✗ BOCOR  baris kedua untuk (scope, worker, tanggal) yang SAMA')
    bocor++
  } catch (e) {
    if (e.code === '23505') { console.log('  ✓ ditolak  dobel (scope, worker, tanggal)'); lolos++ }
    else { console.log(`  ⚠ galat lain (${e.code})`); bocor++ }
  }
  await db.query('DELETE FROM absensi_harian WHERE id = $1', [rows[0].id])
}

console.log('\nRLS — tabel wajib punya penyaring tenant RESTRICTIVE')
{
  const { rows } = await db.query(
    `SELECT c.relrowsecurity,
            (SELECT count(*)::int FROM pg_policies p
              WHERE p.tablename='absensi_harian' AND p.permissive='RESTRICTIVE') AS restr
       FROM pg_class c WHERE c.relname='absensi_harian'`)
  if (rows[0]?.relrowsecurity && rows[0].restr > 0) {
    console.log('  ✓ RLS aktif + policy RESTRICTIVE ada')
    lolos++
  } else {
    console.log(`  ✗ BOCOR  RLS=${rows[0]?.relrowsecurity} restrictive=${rows[0]?.restr}`)
    bocor++
  }
}

// Bersih-bersih: apa pun yang tertinggal dari uji ini (tanggal 2021 khusus
// dipakai supaya tak menyentuh data nyata).
await db.query(`DELETE FROM absensi_harian WHERE tanggal BETWEEN DATE '2021-01-01' AND DATE '2021-03-01'`)

console.log('')
if (bocor === 0) {
  console.log(`✅ ${lolos} invarian tegak · 0 bocor\n`)
  await db.end()
  process.exit(0)
}
console.log(`❌ ${bocor} invarian BOCOR (dari ${lolos + bocor})\n`)
await db.end()
process.exit(1)
