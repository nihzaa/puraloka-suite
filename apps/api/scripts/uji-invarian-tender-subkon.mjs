#!/usr/bin/env node
/**
 * UJI INVARIAN TENDER SUBKONTRAKTOR — membuktikan constraint benar-benar
 * menolak keadaan yang tak boleh terjadi.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya. Satu-satunya cara tahu adalah MENCOBA MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa itu soal borongan ratusan juta
 *
 * Diukur: 20 lingkup kerja Rp 15jt–280jt, semuanya tanpa jejak pemilihan.
 * Tiap invarian menutup satu jalur di mana borongan bisa jatuh ke pihak yang
 * keliru tanpa satu pun gejala:
 *
 *   • harga 0 tanpa `tidak_menawar`  → 0 SELALU menang sebagai termurah
 *   • yang tak menawar bisa MENANG   → pelaksana yang tak pernah mengajukan
 *                                      harga ditunjuk lewat satu salah klik
 *   • DUA pemenang                   → dua kontrak untuk pekerjaan yang sama,
 *                                      baru ketahuan saat keduanya menagih
 *   • penawaran GANDA                → satu mandor terhitung dua kali dengan
 *                                      dua harga berbeda
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-tender-subkon.mjs
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

const { rows: proyek } = await db.query('SELECT id FROM projects LIMIT 1')
const { rows: pekerja } = await db.query('SELECT id FROM workers LIMIT 2')

if (!proyek.length || pekerja.length < 2) {
  console.log('⚠️  Butuh minimal 1 project dan 2 worker. Dilewati.')
  await db.end()
  process.exit(0)
}
const PID = proyek[0].id
const W1 = pekerja[0].id
const W2 = pekerja[1].id

let lolos = 0
let bocor = 0
let nomor = 0

const DITOLAK = new Set(['23514', '23502', '23503', '23505', '22003'])
const nomorUji = () => `UJI-TND-${++nomor}-${PID.slice(0, 8)}`

/*
  ⚠ BERSIHKAN SISA JALAN SEBELUMNYA — ditambahkan 2026-09-04.

  Penjaga ini menghapus barisnya di AKHIR (baris ~194). Kalau satu jalan
  terputus di tengah — galat tak terduga, timeout, atau run CI yang dibatalkan
  push berikutnya — barisnya TERTINGGAL, dan `nomorUji()` yang deterministik
  membuat jalan berikutnya menabraknya:

      duplicate key value violates unique constraint
      "tender_subkon_nomor_per_proyek"

  Kelas yang sama dengan `uji-invarian-absensi`, diperbaiki hari ini juga.

  ⚠ Dan penjaga INI termasuk yang saya uji "dua kali berturut" saat menyisir
  kelas itu — ia LOLOS di dev, karena di sana jalan sebelumnya selesai dan
  membersihkan diri. Uji dua-kali hanya menemukan yang bentrok dengan jalan
  yang BERHASIL; ia buta terhadap sisa jalan yang TERPUTUS.

  Awalan `UJI-TND-` cukup spesifik: nomor sungguhan memakai format penomoran
  dokumen, tak pernah berawalan itu.
*/
const { rowCount: sisa } = await db.query(
  `DELETE FROM tender_subkon WHERE project_id = $1 AND nomor LIKE 'UJI-TND-%'`,
  [PID],
)
if (sisa > 0) console.log(`  (dibersihkan ${sisa} baris sisa jalan sebelumnya)`)

// Tender induk sementara.
const { rows: induk } = await db.query(
  `INSERT INTO tender_subkon (project_id, nomor, judul, nilai_perkiraan)
   VALUES ($1, $2, 'Uji invarian', 100000000) RETURNING id`, [PID, nomorUji()])
const TND = induk[0].id

async function coba(tabel, nama, isi, harusMasuk) {
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO ${tabel} (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      k.map((x) => isi[x]))
    await db.query(`DELETE FROM ${tabel} WHERE id = $1`, [rows[0].id])
    if (harusMasuk) { console.log(`  ✅ diterima ${nama}`); lolos++ }
    else { console.log(`  ❌ BOCOR   ${nama} — basis MENERIMA nilai yang tak boleh masuk`); bocor++ }
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

const tender = (o) => ({ project_id: PID, nomor: nomorUji(), judul: 'Uji', ...o })
const tawar = (o) => ({ tender_id: TND, worker_id: W1, nilai_penawaran: 50000000, ...o })

console.log('\nINVARIAN tender_subkon & penawaran_subkon\n')

// ── tender_subkon: yang HARUS ditolak ─────────────────────────────────────
await coba('tender_subkon', 'status karangan', tender({ status: 'entah' }), false)
await coba('tender_subkon', 'nilai perkiraan NEGATIF', tender({ nilai_perkiraan: -1000 }), false)
await coba('tender_subkon', 'nilai perkiraan NOL', tender({ nilai_perkiraan: 0 }), false)
await coba('tender_subkon', 'batas_masuk SEBELUM tanggal',
  tender({ tanggal: '2026-06-01', batas_masuk: '2026-05-01' }), false)
await coba('tender_subkon', 'proyek karangan',
  tender({ project_id: '00000000-0000-0000-0000-0000000000ff' }), false)
await coba('tender_subkon', 'judul NULL', tender({ judul: null }), false)

// ── penawaran_subkon: yang HARUS ditolak ──────────────────────────────────
await coba('penawaran_subkon', 'harga 0 TANPA tandai tidak_menawar',
  tawar({ nilai_penawaran: 0 }), false)
await coba('penawaran_subkon', 'harga NEGATIF', tawar({ nilai_penawaran: -5000 }), false)
await coba('penawaran_subkon', 'waktu kerja NEGATIF', tawar({ waktu_kerja_hari: -1 }), false)
await coba('penawaran_subkon', 'waktu kerja 9999 hari', tawar({ waktu_kerja_hari: 9999 }), false)
await coba('penawaran_subkon', 'status karangan', tawar({ status: 'entah' }), false)
await coba('penawaran_subkon', 'TAK MENAWAR tapi MENANG',
  tawar({ nilai_penawaran: 0, tidak_menawar: true, status: 'menang' }), false)
await coba('penawaran_subkon', 'mandor karangan',
  tawar({ worker_id: '00000000-0000-0000-0000-0000000000ff' }), false)

// ── Yang HARUS diterima ───────────────────────────────────────────────────
await coba('tender_subkon', 'tender sah lengkap',
  tender({ nilai_perkiraan: 250000000, lingkup_kerja: 'Cor struktur lantai 2' }), true)
await coba('penawaran_subkon', 'penawaran sah',
  tawar({ nilai_penawaran: 95000000, waktu_kerja_hari: 60 }), true)
await coba('penawaran_subkon', 'TAK MENAWAR dengan harga 0',
  tawar({ nilai_penawaran: 0, tidak_menawar: true }), true)

// ── Penawaran GANDA (tender + mandor sama) ────────────────────────────────
{
  const { rows } = await db.query(
    `INSERT INTO penawaran_subkon (tender_id, worker_id, nilai_penawaran)
     VALUES ($1,$2,80000000) RETURNING id`, [TND, W2])
  await coba('penawaran_subkon', 'penawaran GANDA (tender+mandor sama)',
    tawar({ worker_id: W2, nilai_penawaran: 75000000 }), false)
  await db.query('DELETE FROM penawaran_subkon WHERE id = $1', [rows[0].id])
}

// ── DUA pemenang dalam satu tender ────────────────────────────────────────
//
// Dua kontrak untuk pekerjaan yang sama — dan itu baru ketahuan saat keduanya
// menagih. Dijaga index unik parsial, bukan hanya aplikasi.
{
  const { rows: a } = await db.query(
    `INSERT INTO penawaran_subkon (tender_id, worker_id, nilai_penawaran, status)
     VALUES ($1,$2,90000000,'menang') RETURNING id`, [TND, W1])
  try {
    const { rows: b } = await db.query(
      `INSERT INTO penawaran_subkon (tender_id, worker_id, nilai_penawaran, status)
       VALUES ($1,$2,95000000,'menang') RETURNING id`, [TND, W2])
    await db.query('DELETE FROM penawaran_subkon WHERE id = $1', [b[0].id])
    console.log('  ❌ BOCOR   DUA pemenang dalam satu tender diterima')
    bocor++
  } catch (e) {
    if (e.code === '23505') { console.log('  ✅ ditolak DUA pemenang dalam satu tender (23505)'); lolos++ }
    else { console.log(`  ❌ BOCOR   dua pemenang ditolak karena galat lain: ${e.code}`); bocor++ }
  }
  await db.query('DELETE FROM penawaran_subkon WHERE id = $1', [a[0].id])
}

// ── RLS ───────────────────────────────────────────────────────────────────
for (const t of ['tender_subkon', 'penawaran_subkon']) {
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
    console.log(`  ❌ BOCOR   RLS TIDAK aktif di ${t}`)
    bocor++
  }
}

await db.query('DELETE FROM tender_subkon WHERE id = $1', [TND])

console.log(`\n${bocor === 0 ? '✅' : '❌'} ${lolos} invarian terjaga, ${bocor} bocor\n`)
await db.end()
process.exit(bocor === 0 ? 0 : 1)
