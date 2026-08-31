#!/usr/bin/env node
/**
 * UJI INVARIAN CONTINGENCY — membuktikan constraint benar-benar menolak
 * keadaan yang tak boleh terjadi.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya karena tabelnya sudah ada. Satu-satunya cara tahu
 * adalah MENCOBA MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa itu soal uang yang disetujui
 *
 * Sisa cadangan adalah dasar keputusan "boleh ambil lagi atau tidak". Tiap
 * invarian menutup satu jalur di mana angkanya bisa salah tanpa gejala:
 *
 *   • cadangan NOL/negatif   → pembagi nol; persentase terpakai jadi tak
 *                              berarti, dan status "aman" muncul untuk pos
 *                              yang sebenarnya tak punya isi
 *   • penarikan NOL/negatif  → negatif adalah PENGEMBALIAN, peristiwa
 *                              berbeda yang butuh alasannya sendiri
 *   • alasan KOSONG          → cadangan terpakai tanpa jejak = persis
 *                              "hilang ke biaya lain-lain" yang modul ini
 *                              dibuat untuk mengakhiri
 *   • nama pos GANDA         → dua pos bernama sama membuat penarikan
 *                              masuk ke pos yang keliru
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-contingency.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

// Berlabuh ke lokasi berkas ini, bukan ke cwd.
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
if (!proyek.length) {
  console.log('⚠️  Butuh minimal 1 project. Dilewati.')
  await db.end()
  process.exit(0)
}
const PID = proyek[0].id

let lolos = 0
let bocor = 0
let nomor = 0

const DITOLAK = new Set(['23514', '23502', '23503', '23505', '22003'])
/*
  NAMA FIXTURE HARUS UNIK PER JALAN — DIPERBAIKI 2026-08-31.

  Versi sebelumnya memakai `UJI-POS-<n>-<8 char proyek>`: deterministik,
  jadi jalan KEDUA menabrak barisnya sendiri:

      error: duplicate key value violates unique constraint
             "pos_contingency_nama_unik"

  Crash-nya exit 1 — terbaca persis seperti penjaga yang MENEMUKAN
  pelanggaran, padahal ia mati sebelum memeriksa apa pun.

  Skrip ini membersihkan fixture di akhir, tetapi hanya bila SAMPAI ke
  sana. Satu kegagalan di tengah meninggalkan barisnya, dan seluruh jalan
  berikutnya mati di baris pertama — kelas cacat yang sama dengan migrasi
  471 hari ini (fixture yang menuduh dirinya sendiri pada jalan kedua).

  Dua perbaikan: nama diberi akhiran acak, DAN sisa fixture dari jalan
  sebelumnya disapu di awal.
*/
const SESI = Math.random().toString(36).slice(2, 8)
const namaUji = () => `UJI-POS-${++nomor}-${PID.slice(0, 8)}-${SESI}`

/*
  Sisa fixture dari jalan yang gagal di tengah — disapu, TAPI hanya yang TUA.

  ⚠ DIPERSEMPIT 2026-08-31, sesudah sapuan pertama saya merusak shard lain.

  Penjaga ini berjalan di KEENAM shard CI bersamaan, pada SATU basis. Sapuan
  `LIKE 'UJI-POS-%'` tanpa syarat umur menghapus pos induk milik shard yang
  sedang berjalan, dan shard itu lalu gagal dengan galat yang menuduh FK:

      ❌ BOCOR penarikan sah DITOLAK (23503 insert or update on table
         "penggunaan_contingency" violates foreign key)

  Dua invarian terbaca BOCOR padahal basisnya benar — tuduhan paling buruk
  yang bisa dikeluarkan penjaga keamanan, karena ia mengarahkan orang
  memperbaiki pagar yang tak rusak.

  Batas 10 menit: lebih lama daripada satu jalan penjaga ini (detik), jauh
  lebih pendek daripada sisa yang benar-benar tertinggal dari jalan yang mati.
*/
await db.query(
  `DELETE FROM penggunaan_contingency WHERE pos_id IN
     (SELECT id FROM pos_contingency
       WHERE nama LIKE 'UJI-POS-%' AND created_at < now() - INTERVAL '10 minutes')`)
await db.query(
  `DELETE FROM pos_contingency
    WHERE nama LIKE 'UJI-POS-%' AND created_at < now() - INTERVAL '10 minutes'`)

// Pos induk sementara untuk menguji penarikan.
const { rows: induk } = await db.query(
  `INSERT INTO pos_contingency (project_id, nama, nilai) VALUES ($1, $2, 10000000) RETURNING id`,
  [PID, namaUji()])
const POS = induk[0].id

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

const pos = (o) => ({ project_id: PID, nama: namaUji(), nilai: 1000000, ...o })
const tarik = (o) => ({ pos_id: POS, nilai: 100000, alasan: 'uji invarian', ...o })

console.log('\nINVARIAN contingency\n')

// ── pos_contingency: yang HARUS ditolak ───────────────────────────────────
await coba('pos_contingency', 'cadangan NOL', pos({ nilai: 0 }), false)
await coba('pos_contingency', 'cadangan NEGATIF', pos({ nilai: -5000 }), false)
await coba('pos_contingency', 'persen kontrak 0', pos({ persen_kontrak: 0 }), false)
await coba('pos_contingency', 'persen kontrak > 100', pos({ persen_kontrak: 150 }), false)
await coba('pos_contingency', 'status karangan', pos({ status: 'entah' }), false)
await coba('pos_contingency', 'proyek NULL', pos({ project_id: null }), false)
await coba('pos_contingency', 'nama NULL', pos({ nama: null }), false)

// ── penggunaan_contingency: yang HARUS ditolak ────────────────────────────
await coba('penggunaan_contingency', 'penarikan NOL', tarik({ nilai: 0 }), false)
await coba('penggunaan_contingency', 'penarikan NEGATIF', tarik({ nilai: -1000 }), false)
await coba('penggunaan_contingency', 'alasan KOSONG', tarik({ alasan: '' }), false)
await coba('penggunaan_contingency', 'alasan hanya SPASI', tarik({ alasan: '   ' }), false)
await coba('penggunaan_contingency', 'alasan NULL', tarik({ alasan: null }), false)
await coba('penggunaan_contingency', 'pos karangan',
  tarik({ pos_id: '00000000-0000-0000-0000-0000000000ff' }), false)

// ── Yang HARUS diterima ───────────────────────────────────────────────────
//
// Penjaga yang hanya menolak akan tetap hijau kalau tabelnya menolak SEMUA
// hal, termasuk pencatatan yang sah.
await coba('pos_contingency', 'pos sah dengan persen & dasar',
  pos({ nilai: 28500000, persen_kontrak: 5, dasar: '5% nilai kontrak' }), true)
await coba('penggunaan_contingency', 'penarikan sah',
  tarik({ nilai: 2500000, alasan: 'Perbaikan pondasi tak terduga' }), true)
await coba('penggunaan_contingency', 'penarikan MELEBIHI cadangan tetap diterima',
  // Secara fisik itu mungkin: uangnya sudah keluar sebelum ada yang memeriksa.
  // Menolaknya di basis akan MENYEMBUNYIKAN kejadian yang paling perlu
  // dilihat — yang benar adalah menandainya di lapis perhitungan.
  tarik({ nilai: 999000000, alasan: 'defisit disengaja untuk uji' }), true)

// ── Nama pos GANDA ────────────────────────────────────────────────────────
{
  const n = namaUji()
  const { rows } = await db.query(
    `INSERT INTO pos_contingency (project_id, nama, nilai) VALUES ($1,$2,1000) RETURNING id`, [PID, n])
  await coba('pos_contingency', 'nama pos GANDA di proyek sama', pos({ nama: n }), false)
  await db.query('DELETE FROM pos_contingency WHERE id = $1', [rows[0].id])
}

// ── RLS ───────────────────────────────────────────────────────────────────
//
// Diperiksa lewat definisi policy, bukan dengan mencoba menembusnya: koneksi
// ini memakai peran pemilik tabel yang MELEWATI RLS.
for (const t of ['pos_contingency', 'penggunaan_contingency']) {
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

await db.query('DELETE FROM pos_contingency WHERE id = $1', [POS])

console.log(`\n${bocor === 0 ? '✅' : '❌'} ${lolos} invarian terjaga, ${bocor} bocor\n`)
await db.end()
process.exit(bocor === 0 ? 0 : 1)
