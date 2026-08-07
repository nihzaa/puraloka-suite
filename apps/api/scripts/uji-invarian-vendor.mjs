#!/usr/bin/env node
/**
 * UJI INVARIAN PRAKUALIFIKASI & EVALUASI VENDOR — membuktikan constraint
 * benar-benar menolak.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya. Satu-satunya cara tahu adalah MENCOBA MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa ini soal uang dan nama baik
 *
 *   • ditolak tanpa alasan       → vendor bertanya kenapa kalah, dan tak ada
 *                                  yang bisa dijawab
 *   • daftar hitam tanpa alasan  → menutup pintu rezeki orang tanpa jejak
 *   • skor 150                   → peringkat vendor jadi omong kosong
 *   • masa berlaku mundur        → prakualifikasi yang "berlaku sampai"
 *                                  sebelum tanggal terbitnya
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-vendor.mjs
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

const { rows: sup } = await db.query('SELECT id FROM suppliers LIMIT 1')
const { rows: co } = await db.query('SELECT id FROM companies WHERE is_active ORDER BY created_at LIMIT 1')

if (!sup.length || !co.length) {
  console.log('⚠️  Butuh minimal 1 supplier dan 1 company aktif. Dilewati.')
  await db.end()
  process.exit(0)
}
const SID = sup[0].id
const CID = co[0].id

let lolos = 0
let bocor = 0
let hari = 0

const DITOLAK = new Set(['23514', '23502', '23503', '23505', '22003'])
/** Tanggal unik per percobaan — constraint UNIQUE(supplier_id, tanggal). */
const tgl = () => new Date(Date.UTC(2030, 0, ++hari)).toISOString().slice(0, 10)

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

const pk = (o) => ({ supplier_id: SID, company_id: CID, tanggal: tgl(), ...o })
const ev = (o) => ({ supplier_id: SID, company_id: CID, periode: tgl(), ...o })

console.log('\nINVARIAN prakualifikasi_vendor & evaluasi_vendor\n')

// ── Yang HARUS ditolak ────────────────────────────────────────────────────
await coba('prakualifikasi_vendor', 'skor legalitas 150', pk({ skor_legalitas: 150 }), false)
await coba('prakualifikasi_vendor', 'skor teknis NEGATIF', pk({ skor_teknis: -1 }), false)
await coba('prakualifikasi_vendor', 'status karangan', pk({ status: 'entah' }), false)
await coba('prakualifikasi_vendor', 'DITOLAK tanpa alasan', pk({ status: 'ditolak' }), false)
await coba('prakualifikasi_vendor', 'DITOLAK, alasan terlalu pendek',
  pk({ status: 'ditolak', alasan_tolak: 'x' }), false)
await coba('prakualifikasi_vendor', 'berlaku_sampai SEBELUM tanggal',
  { supplier_id: SID, company_id: CID, tanggal: '2030-06-01', berlaku_sampai: '2030-05-01' }, false)
await coba('prakualifikasi_vendor', 'supplier karangan',
  pk({ supplier_id: '00000000-0000-0000-0000-0000000000ff' }), false)

await coba('evaluasi_vendor', 'skor mutu 200', ev({ skor_mutu: 200 }), false)
await coba('evaluasi_vendor', 'DAFTAR HITAM tanpa alasan',
  ev({ masuk_daftar_hitam: true }), false)
await coba('evaluasi_vendor', 'DAFTAR HITAM, alasan terlalu pendek',
  ev({ masuk_daftar_hitam: true, alasan_daftar_hitam: 'jelek' }), false)

// ── Yang HARUS diterima ───────────────────────────────────────────────────
await coba('prakualifikasi_vendor', 'prakualifikasi sah',
  pk({ skor_legalitas: 90, skor_keuangan: 75, skor_teknis: 80, skor_pengalaman: 65 }), true)
await coba('prakualifikasi_vendor', 'DITOLAK dengan alasan cukup',
  pk({ status: 'ditolak', alasan_tolak: 'SBU sudah kedaluwarsa sejak Maret 2026' }), true)
await coba('evaluasi_vendor', 'evaluasi sah',
  ev({ skor_mutu: 85, skor_waktu: 70, skor_harga: 90, skor_layanan: 80 }), true)
await coba('evaluasi_vendor', 'DAFTAR HITAM dengan alasan cukup',
  ev({ masuk_daftar_hitam: true, alasan_daftar_hitam: 'Mengirim besi tak ber-SNI pada PO-2026-004' }), true)

// ── Prakualifikasi GANDA pada tanggal yang sama ───────────────────────────
{
  const t = tgl()
  const { rows } = await db.query(
    `INSERT INTO prakualifikasi_vendor (supplier_id, company_id, tanggal)
     VALUES ($1,$2,$3) RETURNING id`, [SID, CID, t])
  await coba('prakualifikasi_vendor', 'prakualifikasi GANDA (vendor+tanggal sama)',
    { supplier_id: SID, company_id: CID, tanggal: t }, false)
  await db.query('DELETE FROM prakualifikasi_vendor WHERE id = $1', [rows[0].id])
}

// ── Dokumen: jenis karangan ───────────────────────────────────────────────
{
  const { rows } = await db.query(
    `INSERT INTO prakualifikasi_vendor (supplier_id, company_id, tanggal)
     VALUES ($1,$2,$3) RETURNING id`, [SID, CID, tgl()])
  const pid = rows[0].id
  await coba('dokumen_prakualifikasi', 'jenis dokumen karangan',
    { prakualifikasi_id: pid, company_id: CID, jenis: 'entah' }, false)
  await coba('dokumen_prakualifikasi', 'dokumen SIUJK sah',
    { prakualifikasi_id: pid, company_id: CID, jenis: 'siujk', nomor: 'SIUJK-001' }, true)
  await db.query('DELETE FROM prakualifikasi_vendor WHERE id = $1', [pid])
}

// ── RLS ───────────────────────────────────────────────────────────────────
for (const t of ['prakualifikasi_vendor', 'dokumen_prakualifikasi', 'evaluasi_vendor']) {
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
