#!/usr/bin/env node
/**
 * UJI INVARIAN OPERASIONAL ALAT — membuktikan constraint benar-benar menolak.
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
 *   • meter mundur            → excavator "berkurang" jam operasinya; biaya
 *                               per jam melonjak tanpa sebab, laporan bohong
 *   • pemakaian ganda sehari  → jam operasi terhitung dua kali; jadwal
 *                               perawatan jatuh tempo lebih cepat dari nyata
 *   • jadwal tanpa interval   → jadwal yang TAK PERNAH jatuh tempo, dan
 *                               terlihat seperti alat yang terawat
 *   • biaya nol/negatif       → BBM "gratis"; harga pokok proyek kurang saji
 *   • akumulasi < nilai       → penyusutan bulan ini melebihi totalnya sendiri
 *   • jurnal setengah jadi    → `journal_entry_id` terisi tanpa jejak kapan;
 *                               rekonsiliasi GL kehilangan jangkarnya
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-alat.mjs
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

const { rows: as } = await db.query('SELECT id, company_id FROM assets LIMIT 1')
if (!as.length) {
  console.log('⚠️  Butuh minimal 1 baris di `assets`. Dilewati.')
  await db.end()
  process.exit(0)
}
const AID = as[0].id
const CID = as[0].company_id

let lolos = 0
let bocor = 0
let hari = 0

const DITOLAK = new Set(['23514', '23502', '23503', '23505', '22003'])
/** Tanggal unik per percobaan — banyak tabel di sini ber-UNIQUE(asset, tanggal). */
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

const pk = (o) => ({ asset_id: AID, company_id: CID, tanggal: tgl(), ...o })

console.log('\nINVARIAN operasional alat (migrasi 211)\n')

// ── pemakaian_alat: meter tak boleh mundur ────────────────────────────────
await coba('pemakaian_alat', 'meter MUNDUR (selesai < mulai)',
  pk({ jam_mulai: 1200, jam_selesai: 1100 }), false)
await coba('pemakaian_alat', 'jam meter NEGATIF', pk({ jam_mulai: -5 }), false)
await coba('pemakaian_alat', 'pemakaian sah', pk({ jam_mulai: 1200, jam_selesai: 1208 }), true)
await coba('pemakaian_alat', 'alat karangan',
  pk({ asset_id: '00000000-0000-0000-0000-0000000000ff' }), false)

// Pemakaian GANDA di tanggal yang sama — jam operasi terhitung dua kali.
{
  const t = tgl()
  const { rows } = await db.query(
    `INSERT INTO pemakaian_alat (asset_id, company_id, tanggal, jam_mulai, jam_selesai)
     VALUES ($1,$2,$3,100,108) RETURNING id`, [AID, CID, t])
  await coba('pemakaian_alat', 'pemakaian GANDA (alat+tanggal sama)',
    { asset_id: AID, company_id: CID, tanggal: t, jam_mulai: 108, jam_selesai: 116 }, false)
  await db.query('DELETE FROM pemakaian_alat WHERE id = $1', [rows[0].id])
}

// ── jadwal_perawatan: jadwal tanpa interval tak pernah jatuh tempo ─────────
const jd = (o) => ({ asset_id: AID, company_id: CID, jenis: 'berkala', ...o })

await coba('jadwal_perawatan', 'jadwal TANPA interval apa pun',
  jd({ nama: 'Tanpa interval ' + tgl() }), false)
await coba('jadwal_perawatan', 'interval jam NOL',
  jd({ nama: 'Nol jam ' + tgl(), setiap_jam: 0 }), false)
await coba('jadwal_perawatan', 'interval hari NEGATIF',
  jd({ nama: 'Hari negatif ' + tgl(), setiap_hari: -30 }), false)
await coba('jadwal_perawatan', 'jenis karangan',
  jd({ nama: 'Jenis salah ' + tgl(), jenis: 'entah', setiap_jam: 250 }), false)
await coba('jadwal_perawatan', 'jadwal interval JAM saja',
  jd({ nama: 'Ganti oli ' + tgl(), setiap_jam: 250 }), true)
await coba('jadwal_perawatan', 'jadwal interval HARI saja',
  jd({ nama: 'Kalibrasi ' + tgl(), setiap_hari: 365, jenis: 'kalibrasi' }), true)
await coba('jadwal_perawatan', 'jadwal interval KEDUANYA',
  jd({ nama: 'Servis ' + tgl(), setiap_jam: 250, setiap_hari: 180 }), true)

// Jadwal GANDA dengan nama sama pada alat yang sama.
{
  const n = 'Servis unik ' + tgl()
  const { rows } = await db.query(
    `INSERT INTO jadwal_perawatan (asset_id, company_id, nama, jenis, setiap_jam)
     VALUES ($1,$2,$3,'berkala',250) RETURNING id`, [AID, CID, n])
  await coba('jadwal_perawatan', 'jadwal GANDA (alat+nama sama)',
    { asset_id: AID, company_id: CID, nama: n, jenis: 'berkala', setiap_jam: 500 }, false)
  await db.query('DELETE FROM jadwal_perawatan WHERE id = $1', [rows[0].id])
}

// ── riwayat_perawatan ─────────────────────────────────────────────────────
await coba('riwayat_perawatan', 'biaya perawatan NEGATIF',
  pk({ biaya: -100000 }), false)
await coba('riwayat_perawatan', 'jam meter NEGATIF saat servis',
  pk({ biaya: 500000, jam_meter: -1 }), false)
await coba('riwayat_perawatan', 'servis terjadwal sah',
  pk({ biaya: 750000, jam_meter: 1250, uraian: 'Ganti oli & filter' }), true)
await coba('riwayat_perawatan', 'servis MENDADAK sah',
  pk({ biaya: 4500000, tak_terjadwal: true, uraian: 'Selang hidrolik pecah' }), true)

// ── biaya_operasional_alat ────────────────────────────────────────────────
await coba('biaya_operasional_alat', 'biaya NOL (BBM "gratis")',
  pk({ jenis: 'bbm', jumlah: 0 }), false)
await coba('biaya_operasional_alat', 'biaya NEGATIF',
  pk({ jenis: 'operator', jumlah: -1 }), false)
await coba('biaya_operasional_alat', 'kuantitas NOL liter',
  pk({ jenis: 'bbm', jumlah: 500000, kuantitas: 0 }), false)
await coba('biaya_operasional_alat', 'jenis biaya karangan',
  pk({ jenis: 'entah', jumlah: 100000 }), false)
await coba('biaya_operasional_alat', 'biaya BBM sah',
  pk({ jenis: 'bbm', jumlah: 4500000, kuantitas: 300, satuan: 'liter' }), true)

// ── penyusutan_alat ───────────────────────────────────────────────────────
const py = (o) => ({ asset_id: AID, company_id: CID, periode: tgl(), ...o })

await coba('penyusutan_alat', 'nilai penyusutan NEGATIF',
  py({ nilai: -1, akumulasi: 0 }), false)
await coba('penyusutan_alat', 'akumulasi LEBIH KECIL dari nilai bulan ini',
  py({ nilai: 5000000, akumulasi: 1000000 }), false)
await coba('penyusutan_alat', 'jurnal SETENGAH JADI (id ada, waktu kosong)',
  py({ nilai: 5000000, akumulasi: 5000000,
       journal_entry_id: '00000000-0000-0000-0000-000000000001' }), false)
await coba('penyusutan_alat', 'penyusutan sah, belum dijurnal',
  py({ nilai: 5000000, akumulasi: 25000000 }), true)

// Penyusutan GANDA satu periode — beban dobel di GL.
{
  const p = tgl()
  const { rows } = await db.query(
    `INSERT INTO penyusutan_alat (asset_id, company_id, periode, nilai, akumulasi)
     VALUES ($1,$2,$3,5000000,5000000) RETURNING id`, [AID, CID, p])
  await coba('penyusutan_alat', 'penyusutan GANDA (alat+periode sama)',
    { asset_id: AID, company_id: CID, periode: p, nilai: 5000000, akumulasi: 10000000 }, false)
  await db.query('DELETE FROM penyusutan_alat WHERE id = $1', [rows[0].id])
}

// ── RLS ───────────────────────────────────────────────────────────────────
const TABEL = ['pemakaian_alat', 'jadwal_perawatan', 'riwayat_perawatan',
  'biaya_operasional_alat', 'penyusutan_alat']

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

  // ADR-004 Rule #2 — pelajaran migrasi 202: peran literal di RLS memblokir
  // peran custom yang justru sudah punya permission-nya.
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
