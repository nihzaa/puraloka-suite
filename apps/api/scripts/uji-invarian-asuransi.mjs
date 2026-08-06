#!/usr/bin/env node
/**
 * UJI INVARIAN POLIS ASURANSI — membuktikan constraint benar-benar menolak
 * keadaan yang tak boleh terjadi.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya karena tabelnya sudah ada. Satu-satunya cara tahu
 * adalah MENCOBA MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa itu soal klaim yang ditolak
 *
 * Polis adalah bukti pertanggungan. Tiap invarian menutup satu jalur di mana
 * registernya terlihat lengkap tapi tak berguna saat klaim:
 *
 *   • periode TERBALIK        → seluruh perhitungan celah menghasilkan angka
 *                               negatif yang terbaca "lebih dari cukup"
 *   • polis GANDA             → nilai pertanggungan terhitung dua kali, dan
 *                               perusahaan tampak lebih terlindungi
 *   • nilai NEGATIF           → total pertanggungan berkurang oleh baris
 *                               yang seharusnya menambah
 *   • `jenis_lain` pada jenis baku → kolom terisi di baris tak relevan akan
 *                               dibaca laporan berikutnya sebagai fakta
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-asuransi.mjs
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
if (!proyek.length) {
  console.log('⚠️  Butuh minimal 1 project. Dilewati.')
  await db.end()
  process.exit(0)
}
const PID = proyek[0].id

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

const nomorUji = () => `UJI-POLIS-${++nomor}-${PID.slice(0, 8)}`

async function coba(nama, kolom, harusMasuk) {
  const isi = {
    project_id: PID, jenis: 'car', nomor_polis: nomorUji(), penerbit: 'PT Uji Asuransi',
    periode_mulai: '2026-01-01', periode_selesai: '2026-12-31', ...kolom,
  }
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO polis_asuransi (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      k.map((x) => isi[x]))
    await db.query('DELETE FROM polis_asuransi WHERE id = $1', [rows[0].id])
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

console.log('\nINVARIAN polis_asuransi\n')

// ── Yang HARUS ditolak ─────────────────────────────────────────────────────
await coba('periode TERBALIK', { periode_mulai: '2026-12-31', periode_selesai: '2026-01-01' }, false)
await coba('jenis karangan', { jenis: 'entah' }, false)
await coba('status karangan', { status: 'entah' }, false)
await coba('nilai pertanggungan NEGATIF', { nilai_pertanggungan: -1000 }, false)
await coba('premi NEGATIF', { premi: -1 }, false)
await coba('proyek NULL', { project_id: null }, false)
await coba('proyek karangan', { project_id: '00000000-0000-0000-0000-0000000000ff' }, false)
await coba('nomor polis NULL', { nomor_polis: null }, false)
await coba('penerbit NULL', { penerbit: null }, false)
await coba('periode_mulai NULL', { periode_mulai: null }, false)
await coba('jenis_lain terisi pada jenis BAKU', { jenis: 'car', jenis_lain: 'ngawur' }, false)

// ── Yang HARUS diterima ────────────────────────────────────────────────────
//
// Penjaga yang hanya menolak akan tetap hijau kalau tabelnya menolak SEMUA
// hal, termasuk polis yang sah.
await coba('polis sah lengkap',
  { nilai_pertanggungan: 2_500_000_000, premi: 12_500_000, tertanggung: 'PT Puraloka Persada' }, true)
await coba('periode SATU HARI (mulai = selesai)',
  { periode_mulai: '2026-05-05', periode_selesai: '2026-05-05' }, true)
await coba('jenis lainnya DENGAN jenis_lain',
  { jenis: 'lainnya', jenis_lain: 'Asuransi Alat Berat' }, true)
await coba('nilai & premi boleh kosong', { nilai_pertanggungan: null, premi: null }, true)

// ── Polis GANDA (proyek + penerbit + nomor sama) ───────────────────────────
//
// Salinan kedua membuat nilai pertanggungan terhitung dua kali, dan
// perusahaan tampak lebih terlindungi daripada kenyataannya.
{
  const n = nomorUji()
  const { rows } = await db.query(
    `INSERT INTO polis_asuransi (project_id, jenis, nomor_polis, penerbit, periode_mulai, periode_selesai)
     VALUES ($1,'car',$2,'PT Uji Asuransi','2026-01-01','2026-12-31') RETURNING id`, [PID, n])
  await coba('polis GANDA (proyek+penerbit+nomor sama)', { nomor_polis: n }, false)
  await db.query('DELETE FROM polis_asuransi WHERE id = $1', [rows[0].id])
}

// ── RLS ────────────────────────────────────────────────────────────────────
//
// Diperiksa lewat definisi policy, bukan dengan mencoba menembusnya: koneksi
// ini memakai peran pemilik tabel yang MELEWATI RLS, jadi percobaan tembus di
// sini akan selalu "berhasil" dan ujinya jadi teater.
{
  const { rows: pol } = await db.query(
    `SELECT polpermissive, pg_get_expr(polqual, polrelid) q
       FROM pg_policy WHERE polrelid = 'polis_asuransi'::regclass`)
  const restr = pol.find((p) => p.polpermissive === false)
  if (restr && (restr.q || '').includes('project_company_id')) {
    console.log('  ✅ RLS RESTRICTIVE menyaring lewat company proyek')
    lolos++
  } else {
    console.log('  ❌ BOCOR   tak ada policy RESTRICTIVE yang menyaring tenant')
    bocor++
  }

  const { rows: rls } = await db.query(
    `SELECT relrowsecurity FROM pg_class WHERE oid = 'polis_asuransi'::regclass`)
  if (rls[0]?.relrowsecurity) {
    console.log('  ✅ RLS aktif di tabel')
    lolos++
  } else {
    console.log('  ❌ BOCOR   RLS TIDAK aktif — semua policy tak berlaku')
    bocor++
  }
}

console.log(`\n${bocor === 0 ? '✅' : '❌'} ${lolos} invarian terjaga, ${bocor} bocor\n`)
await db.end()
process.exit(bocor === 0 ? 0 : 1)
