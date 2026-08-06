#!/usr/bin/env node
/**
 * UJI INVARIAN SERTIFIKAT IPC — membuktikan constraint benar-benar menolak.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya diam-diam. Satu-satunya cara tahu adalah MENCOBA
 * MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa ini soal uang masuk
 *
 * IPC adalah pintu masuk uang dari owner proyek. Diukur 2026-08-07: 40 termin
 * (18 dibayar · 7 tertagih), 26 invoice, Rp 4,88 miliar nilai kontrak — dan
 * nol jejak dasar penagihannya.
 *
 * Tiap invarian menutup satu jalur di mana uang ditagih atas dasar yang tak
 * bisa dipertanggungjawabkan:
 *
 *   • progres > 100%          → menagih lebih dari nilai kontrak
 *   • dua sertifikat / termin  → termin yang sama ditagih DUA KALI, ketahuan
 *                                saat owner menolak invoice kedua
 *   • "disetujui" tanpa penyetuju → tanda tangan kosong
 *   • potongan lain tanpa alasan  → kolom yang menyerap selisih apa pun
 *                                   tanpa pernah ditanyakan
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-sertifikat-ipc.mjs
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
const { rows: termin } = await db.query('SELECT id FROM termin_schedules LIMIT 2')

if (!proyek.length) {
  console.log('⚠️  Butuh minimal 1 project. Dilewati.')
  await db.end()
  process.exit(0)
}
const PID = proyek[0].id
const T1 = termin[0]?.id ?? null

let lolos = 0
let bocor = 0
let nomor = 0

const DITOLAK = new Set(['23514', '23502', '23503', '23505', '22003'])
const nomorUji = () => `UJI-IPC-${++nomor}-${PID.slice(0, 8)}`

async function coba(nama, isi, harusMasuk) {
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO sertifikat_ipc (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      k.map((x) => isi[x]))
    await db.query('DELETE FROM sertifikat_ipc WHERE id = $1', [rows[0].id])
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

const s = (o) => ({
  project_id: PID, nomor: nomorUji(),
  progres_diakui_pct: 40, nilai_kontrak: 500000000, ...o,
})

console.log('\nINVARIAN sertifikat_ipc\n')

// ── Yang HARUS ditolak ────────────────────────────────────────────────────
await coba('progres 150% (menagih di atas kontrak)', s({ progres_diakui_pct: 150 }), false)
await coba('progres NEGATIF', s({ progres_diakui_pct: -5 }), false)
await coba('retensi 120%', s({ retensi_pct: 120 }), false)
await coba('nilai kontrak NOL', s({ nilai_kontrak: 0 }), false)
await coba('nilai kontrak NEGATIF', s({ nilai_kontrak: -1 }), false)
await coba('potongan DP NEGATIF', s({ potongan_dp: -1000 }), false)
await coba('kumulatif NEGATIF', s({ kumulatif_sebelumnya: -1 }), false)
await coba('status karangan', s({ status: 'entah' }), false)
await coba('proyek karangan', s({ project_id: '00000000-0000-0000-0000-0000000000ff' }), false)
await coba('potongan lain TANPA alasan', s({ potongan_lain: 5000000 }), false)
await coba('potongan lain, alasan terlalu pendek', s({ potongan_lain: 5000000, potongan_lain_alasan: 'x' }), false)
await coba('DISETUJUI tanpa penyetuju', s({ status: 'disetujui' }), false)
await coba('DITAGIHKAN tanpa invoice', s({ status: 'ditagihkan' }), false)

// ── Yang HARUS diterima ───────────────────────────────────────────────────
await coba('sertifikat draft sah', s({ retensi_pct: 5 }), true)
await coba('progres 100% (prestasi penuh)', s({ progres_diakui_pct: 100, retensi_pct: 5 }), true)
await coba('progres 0% (belum ada prestasi)', s({ progres_diakui_pct: 0 }), true)
await coba('potongan lain DENGAN alasan cukup',
  s({ potongan_lain: 5000000, potongan_lain_alasan: 'Denda keterlambatan minggu 12' }), true)

// ── Dua sertifikat hidup atas termin yang SAMA ────────────────────────────
//
// Termin yang sama ditagih dua kali — dan itu baru ketahuan saat owner
// menolak invoice kedua. Dijaga index unik parsial, bukan hanya aplikasi.
if (T1) {
  const { rows: a } = await db.query(
    `INSERT INTO sertifikat_ipc (project_id, termin_id, nomor, progres_diakui_pct, nilai_kontrak)
     VALUES ($1,$2,$3,40,500000000) RETURNING id`, [PID, T1, nomorUji()])
  await coba('DUA sertifikat hidup atas termin yang sama',
    s({ termin_id: T1 }), false)

  // Yang DITOLAK harus boleh diganti sertifikat baru — kalau tidak, satu
  // penolakan mengunci terminnya selamanya.
  await db.query(`UPDATE sertifikat_ipc SET status = 'ditolak' WHERE id = $1`, [a[0].id])
  await coba('sertifikat baru sesudah yang lama DITOLAK', s({ termin_id: T1 }), true)

  await db.query('DELETE FROM sertifikat_ipc WHERE id = $1', [a[0].id])
} else {
  console.log('  ⚠️  tak ada termin_schedules — uji termin ganda dilewati')
}

// ── RLS ───────────────────────────────────────────────────────────────────
{
  const { rows: pol } = await db.query(
    `SELECT polpermissive, pg_get_expr(polqual, polrelid) q
       FROM pg_policy WHERE polrelid = 'sertifikat_ipc'::regclass`)
  const restr = pol.find((p) => p.polpermissive === false)
  if (restr && (restr.q || '').includes('project_company_id')) {
    console.log('  ✅ RLS RESTRICTIVE menyaring lewat company proyek')
    lolos++
  } else {
    console.log('  ❌ BOCOR   tak ada policy RESTRICTIVE yang menyaring tenant')
    bocor++
  }

  // ADR-004 Rule #2 — pelajaran migrasi 202: policy WAJIB memakai
  // has_permission(), bukan membandingkan nama peran.
  const literal = pol.filter((p) => (p.q || '').includes('auth_role'))
  if (literal.length === 0) {
    console.log('  ✅ nol policy memakai literal peran (ADR-004 Rule #2)')
    lolos++
  } else {
    console.log(`  ❌ BOCOR   ${literal.length} policy memakai auth_role() — peran kustom akan diblokir`)
    bocor++
  }

  const { rows: rls } = await db.query(
    `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'sertifikat_ipc'::regclass`)
  if (rls[0]?.relrowsecurity && rls[0]?.relforcerowsecurity) {
    console.log('  ✅ RLS aktif DAN dipaksa (FORCE)')
    lolos++
  } else {
    console.log('  ❌ BOCOR   RLS tidak aktif atau tidak dipaksa')
    bocor++
  }
}

console.log(`\n${bocor === 0 ? '✅' : '❌'} ${lolos} invarian terjaga, ${bocor} bocor\n`)
await db.end()
process.exit(bocor === 0 ? 0 : 1)
