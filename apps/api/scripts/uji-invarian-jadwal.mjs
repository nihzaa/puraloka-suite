#!/usr/bin/env node
/**
 * UJI INVARIAN JADWAL (CPM · kalender · sumber daya · method statement) —
 * membuktikan constraint migrasi 212 benar-benar menolak.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya diam-diam. Satu-satunya cara tahu adalah MENCOBA
 * MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa ini soal uang
 *
 *   • pekerjaan menunggu DIRINYA SENDIRI → jadwal yang tak pernah bisa
 *     dimulai, tapi daftarnya terlihat rapi
 *   • pola kerja TANPA satu pun hari kerja → setiap durasi jadi tak
 *     terhingga; perhitungan tak pernah selesai, tanpa gejala
 *   • kuantitas sumber daya nol/negatif → histogram yang menyembunyikan
 *     puncak, lalu tenaga kurang di minggu yang paling padat
 *   • method statement DITOLAK tanpa alasan → pelaksana mengajukan dokumen
 *     yang sama berulang, dan siklusnya tak putus
 *   • keputusan tanpa tanggal → tak bisa dibuktikan kapan disetujui, dan
 *     itu persis yang ditanya saat ada kecelakaan kerja
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-jadwal.mjs
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

// Dua milestone yang BELUM saling berelasi.
//
// Versi pertama skrip ini mengambil dua yang tertua begitu saja, lalu gagal
// dengan 23505 begitu seed `seed_jadwal_cpm.sql` mengisi relasi di antara
// keduanya. Yang gagal INSERT penyiapannya — bukan invariannya — dan pesan
// galatnya menunjuk ke tempat yang salah.
const { rows: ms } = await db.query(`
  SELECT m.id, p.company_id, m.project_id
    FROM milestones m JOIN projects p ON p.id = m.project_id
   WHERE NOT EXISTS (
     SELECT 1 FROM milestone_dependencies d
      WHERE d.milestone_id = m.id OR d.bergantung_pada = m.id)
     -- Satu proyek: pasangan lintas-proyek diuji terpisah lewat endpoint,
     -- dan di sini akan mengaburkan invarian yang sedang diperiksa.
     AND m.project_id = (
       SELECT m2.project_id FROM milestones m2
        WHERE NOT EXISTS (
          SELECT 1 FROM milestone_dependencies d2
           WHERE d2.milestone_id = m2.id OR d2.bergantung_pada = m2.id)
        GROUP BY m2.project_id HAVING count(*) >= 2
        ORDER BY min(m2.created_at) LIMIT 1)
   ORDER BY m.created_at LIMIT 2`)

if (ms.length < 2) {
  console.log('⚠️  Butuh minimal 2 milestone yang belum berelasi. Dilewati.')
  await db.end()
  process.exit(0)
}
const [M1, M2] = ms
const CID = M1.company_id
const PID = M1.project_id

let lolos = 0
let bocor = 0
let hari = 0

const DITOLAK = new Set(['23514', '23502', '23503', '23505', '22003'])
const tgl = () => new Date(Date.UTC(2031, 0, ++hari)).toISOString().slice(0, 10)

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
      console.log(`  ❌ BOCOR   ${nama} — ditolak karena galat lain: ${e.code} ${e.message.slice(0, 60)}`)
      bocor++
    }
  }
}

console.log('\nINVARIAN jadwal CPM & kalender (migrasi 212)\n')

// ── milestone_dependencies ────────────────────────────────────────────────
await coba('milestone_dependencies', 'pekerjaan menunggu DIRINYA SENDIRI',
  { company_id: CID, milestone_id: M1.id, bergantung_pada: M1.id }, false)
await coba('milestone_dependencies', 'jenis relasi karangan',
  { company_id: CID, milestone_id: M1.id, bergantung_pada: M2.id, jenis: 'ZZ' }, false)
await coba('milestone_dependencies', 'milestone karangan',
  { company_id: CID, milestone_id: M1.id,
    bergantung_pada: '00000000-0000-0000-0000-0000000000ff' }, false)
await coba('milestone_dependencies', 'dependensi FS sah',
  { company_id: CID, milestone_id: M1.id, bergantung_pada: M2.id, jenis: 'FS' }, true)
await coba('milestone_dependencies', 'jeda NEGATIF (tumpang tindih terencana) sah',
  { company_id: CID, milestone_id: M1.id, bergantung_pada: M2.id, jeda_hari: -3 }, true)

{
  const { rows } = await db.query(
    `INSERT INTO milestone_dependencies (company_id, milestone_id, bergantung_pada)
     VALUES ($1,$2,$3) RETURNING id`, [CID, M1.id, M2.id])
  await coba('milestone_dependencies', 'dependensi GANDA (pasangan sama)',
    { company_id: CID, milestone_id: M1.id, bergantung_pada: M2.id }, false)
  await db.query('DELETE FROM milestone_dependencies WHERE id = $1', [rows[0].id])
}

// ── pola_kerja ────────────────────────────────────────────────────────────
const pk = (o) => ({ company_id: CID, ...o })

await coba('pola_kerja', 'pola TANPA satu pun hari kerja',
  pk({ project_id: PID, senin: false, selasa: false, rabu: false,
       kamis: false, jumat: false, sabtu: false, minggu: false }), false)
await coba('pola_kerja', 'jam per hari NOL', pk({ project_id: PID, jam_per_hari: 0 }), false)
await coba('pola_kerja', 'jam per hari 25', pk({ project_id: PID, jam_per_hari: 25 }), false)
await coba('pola_kerja', 'pola Senin-Jumat sah',
  pk({ project_id: PID, sabtu: false, jam_per_hari: 8 }), true)

// ── hari_libur ────────────────────────────────────────────────────────────
await coba('hari_libur', 'hari libur sah',
  { company_id: CID, tanggal: tgl(), nama: 'Cuti bersama' }, true)
await coba('hari_libur', 'jenis libur karangan',
  { company_id: CID, tanggal: tgl(), nama: 'X', jenis: 'entah' }, false)
await coba('hari_libur', 'libur yang TETAP dikerjakan (lembur terencana) sah',
  { company_id: CID, tanggal: tgl(), nama: 'HUT RI', tetap_bekerja: true }, true)

{
  const t = tgl()
  const { rows } = await db.query(
    `INSERT INTO hari_libur (company_id, tanggal, nama) VALUES ($1,$2,'A') RETURNING id`,
    [CID, t])
  await coba('hari_libur', 'libur GANDA pada tanggal yang sama',
    { company_id: CID, tanggal: t, nama: 'B' }, false)
  await db.query('DELETE FROM hari_libur WHERE id = $1', [rows[0].id])
}

// ── kebutuhan_sumber_daya ─────────────────────────────────────────────────
const sd = (o) => ({ company_id: CID, milestone_id: M1.id, jenis: 'tenaga', ...o })

await coba('kebutuhan_sumber_daya', 'kuantitas NOL', sd({ nama: 'Tukang A', kuantitas: 0 }), false)
await coba('kebutuhan_sumber_daya', 'kuantitas NEGATIF', sd({ nama: 'Tukang B', kuantitas: -5 }), false)
await coba('kebutuhan_sumber_daya', 'tersedia NEGATIF',
  sd({ nama: 'Tukang C', kuantitas: 10, tersedia: -1 }), false)
await coba('kebutuhan_sumber_daya', 'jenis sumber daya karangan',
  sd({ nama: 'X', kuantitas: 5, jenis: 'entah' }), false)
await coba('kebutuhan_sumber_daya', 'kebutuhan tenaga sah',
  sd({ nama: 'Tukang batu', kuantitas: 25, tersedia: 30, satuan: 'orang' }), true)
await coba('kebutuhan_sumber_daya', 'tersedia NOL (belum ada sama sekali) sah',
  sd({ nama: 'Tukang las', kuantitas: 5, tersedia: 0 }), true)

{
  const { rows } = await db.query(
    `INSERT INTO kebutuhan_sumber_daya (company_id, milestone_id, jenis, nama, kuantitas)
     VALUES ($1,$2,'tenaga','Mandor',3) RETURNING id`, [CID, M1.id])
  await coba('kebutuhan_sumber_daya', 'kebutuhan GANDA (pekerjaan+jenis+nama sama)',
    sd({ nama: 'Mandor', kuantitas: 5 }), false)
  await db.query('DELETE FROM kebutuhan_sumber_daya WHERE id = $1', [rows[0].id])
}

// ── method_statement ──────────────────────────────────────────────────────
let nomor = 0
const mst = (o) => ({
  company_id: CID, project_id: PID,
  nomor: `MS-UJI-${++nomor}`, judul: 'Pengecoran kolom lantai 2', ...o,
})

await coba('method_statement', 'DITOLAK tanpa alasan',
  mst({ status: 'ditolak', diputuskan_pada: new Date().toISOString() }), false)
await coba('method_statement', 'DITOLAK, alasan terlalu pendek',
  mst({ status: 'ditolak', alasan_tolak: 'tdk', diputuskan_pada: new Date().toISOString() }), false)
await coba('method_statement', 'DISETUJUI tanpa tanggal keputusan',
  mst({ status: 'disetujui' }), false)
await coba('method_statement', 'status karangan', mst({ status: 'entah' }), false)
await coba('method_statement', 'draft sah', mst({}), true)
await coba('method_statement', 'DISETUJUI lengkap sah',
  mst({ status: 'disetujui', diputuskan_pada: new Date().toISOString(),
        pengendalian_risiko: 'Barikade radius 5 m; helm & body harness wajib' }), true)
await coba('method_statement', 'DITOLAK dengan alasan cukup sah',
  mst({ status: 'ditolak', diputuskan_pada: new Date().toISOString(),
        alasan_tolak: 'Pengendalian risiko bekerja di ketinggian belum dijelaskan' }), true)

{
  const { rows } = await db.query(
    `INSERT INTO method_statement (company_id, project_id, nomor, judul)
     VALUES ($1,$2,'MS-UJI-KEMBAR','A') RETURNING id`, [CID, PID])
  await coba('method_statement', 'nomor GANDA dalam satu company',
    { company_id: CID, project_id: PID, nomor: 'MS-UJI-KEMBAR', judul: 'B' }, false)
  await db.query('DELETE FROM method_statement WHERE id = $1', [rows[0].id])
}

// ── RLS ───────────────────────────────────────────────────────────────────
const TABEL = ['milestone_dependencies', 'hari_libur', 'pola_kerja',
  'kebutuhan_sumber_daya', 'method_statement']

for (const t of TABEL) {
  const { rows: pol } = await db.query(
    `SELECT polpermissive, pg_get_expr(polqual, polrelid) q
       FROM pg_policy WHERE polrelid = $1::regclass`, [t])

  const restr = pol.find((p) => p.polpermissive === false)
  if (restr && (restr.q || '').includes('auth_company_id')) {
    console.log(`  ✅ RLS RESTRICTIVE ${t} menyaring company`)
    lolos++
  } else {
    console.log(`  ❌ BOCOR   ${t}: tak ada policy RESTRICTIVE penyaring tenant`)
    bocor++
  }

  // ADR-004 Rule #2 — pelajaran migrasi 202.
  const literal = pol.filter((p) => (p.q || '').includes('auth_role'))
  if (literal.length === 0) { console.log(`  ✅ ${t}: nol literal peran`); lolos++ }
  else { console.log(`  ❌ BOCOR   ${t}: ${literal.length} policy memakai auth_role()`); bocor++ }

  const { rows: rls } = await db.query(
    `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass`, [t])
  if (rls[0]?.relrowsecurity && rls[0]?.relforcerowsecurity) {
    console.log(`  ✅ RLS aktif & dipaksa di ${t}`)
    lolos++
  } else {
    console.log(`  ❌ BOCOR   RLS tak aktif/tak dipaksa di ${t}`)
    bocor++
  }
}

console.log(`\n${bocor === 0 ? '✅' : '❌'} ${lolos} invarian terjaga, ${bocor} bocor\n`)
await db.end()
process.exit(bocor === 0 ? 0 : 1)
