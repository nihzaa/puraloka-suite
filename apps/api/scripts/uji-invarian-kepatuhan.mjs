#!/usr/bin/env node
/**
 * UJI INVARIAN KEPATUHAN & K3 — membuktikan constraint migrasi 218 menolak.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya diam-diam. Satu-satunya cara tahu adalah MENCOBA
 * MELANGGARNYA.
 *
 * ── Apa yang dijaga, dan kenapa ini soal nyawa
 *
 *   • izin kerja disetujui SENDIRI oleh pengajunya → bukan pengendalian apa
 *     pun; ini inti pemisahan tugas, dan yang pertama ditanya saat ada
 *     kecelakaan
 *   • izin disetujui TANPA pengendalian risiko → tanda tangan atas dokumen
 *     kosong
 *   • jendela izin terbalik → izin yang tak pernah berlaku
 *   • dokumen kepatuhan tanpa pemilik → tak bisa ditagih ke siapa pun
 *   • "terverifikasi" tanpa siapa & kapan → klaim yang tak bisa ditelusuri
 *   • daftar hitam tanpa alasan → menutup pintu rezeki orang tanpa jejak
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-kepatuhan.mjs
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

const { rows: pr } = await db.query(
  `SELECT id, company_id FROM projects ORDER BY created_at LIMIT 1`)
const { rows: us } = await db.query(`SELECT id FROM users ORDER BY created_at LIMIT 2`)
const { rows: sp } = await db.query(`SELECT id FROM suppliers LIMIT 1`)

if (!pr.length || us.length < 2) {
  console.log('⚠️  Butuh 1 proyek dan 2 pengguna berbeda. Dilewati.')
  await db.end()
  process.exit(0)
}
const PID = pr[0].id
const CID = pr[0].company_id
const U1 = us[0].id
const U2 = us[1].id
const SID = sp[0]?.id ?? null

let lolos = 0
let bocor = 0
let seri = 0

const DITOLAK = new Set(['23514', '23502', '23503', '23505', '22003', '22P02'])

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

console.log('\nINVARIAN kepatuhan & K3 (migrasi 218)\n')

// ── dokumen_kepatuhan ─────────────────────────────────────────────────────
const dk = (o) => ({ company_id: CID, jenis: 'siujk', pihak_nama: 'PT Uji ' + (++seri), ...o })

await coba('dokumen_kepatuhan', 'dokumen TANPA pemilik',
  { company_id: CID, jenis: 'siujk' }, false)
await coba('dokumen_kepatuhan', 'pemilik nama KOSONG (spasi saja)',
  { company_id: CID, jenis: 'siujk', pihak_nama: '   ' }, false)
await coba('dokumen_kepatuhan', 'jenis dokumen karangan', dk({ jenis: 'entah' }), false)
await coba('dokumen_kepatuhan', 'masa berlaku MUNDUR (sampai < dari)',
  dk({ berlaku_dari: '2026-06-01', berlaku_sampai: '2026-01-01' }), false)
await coba('dokumen_kepatuhan', 'nilai pertanggungan NEGATIF',
  dk({ nilai_pertanggungan: -1 }), false)
await coba('dokumen_kepatuhan', 'TERVERIFIKASI tanpa siapa & kapan',
  dk({ terverifikasi: true }), false)
await coba('dokumen_kepatuhan', 'TERVERIFIKASI tanpa tanggal',
  dk({ terverifikasi: true, diverifikasi_oleh: U1 }), false)
await coba('dokumen_kepatuhan', 'dokumen sah (belum diverifikasi)',
  dk({ nomor: 'SIUJK-001', berlaku_dari: '2026-01-01', berlaku_sampai: '2027-01-01' }), true)
await coba('dokumen_kepatuhan', 'dokumen sah TERVERIFIKASI lengkap',
  dk({ terverifikasi: true, diverifikasi_oleh: U1,
       diverifikasi_pada: new Date().toISOString() }), true)
await coba('dokumen_kepatuhan', 'NPWP tanpa masa berlaku sah',
  dk({ jenis: 'npwp', berlaku_sampai: null }), true)

if (SID) {
  await coba('dokumen_kepatuhan', 'dokumen milik supplier terdaftar sah',
    { company_id: CID, jenis: 'asuransi_car', supplier_id: SID,
      nilai_pertanggungan: 5000000000 }, true)
}

// ── evaluasi_subkon ───────────────────────────────────────────────────────
const es = (o) => ({
  company_id: CID, project_id: PID, pihak_nama: 'CV Uji ' + (++seri),
  periode: '2026-07-01', ...o,
})

await coba('evaluasi_subkon', 'evaluasi TANPA pihak',
  { company_id: CID, periode: '2026-07-01' }, false)
await coba('evaluasi_subkon', 'skor K3 150', es({ skor_k3: 150 }), false)
await coba('evaluasi_subkon', 'skor mutu NEGATIF', es({ skor_mutu: -1 }), false)
await coba('evaluasi_subkon', 'jumlah kecelakaan NEGATIF',
  es({ jumlah_kecelakaan: -1 }), false)
await coba('evaluasi_subkon', 'jumlah pelanggaran K3 NEGATIF',
  es({ jumlah_pelanggaran_k3: -2 }), false)
await coba('evaluasi_subkon', 'DAFTAR HITAM tanpa alasan',
  es({ masuk_daftar_hitam: true }), false)
await coba('evaluasi_subkon', 'DAFTAR HITAM, alasan terlalu pendek',
  es({ masuk_daftar_hitam: true, alasan_daftar_hitam: 'jelek' }), false)
await coba('evaluasi_subkon', 'evaluasi sah',
  es({ skor_mutu: 85, skor_waktu: 80, skor_k3: 90,
       skor_kepatuhan: 85, skor_kerjasama: 75 }), true)
await coba('evaluasi_subkon', 'DAFTAR HITAM dengan alasan cukup sah',
  es({ masuk_daftar_hitam: true,
       alasan_daftar_hitam: 'Dua kecelakaan kerja dalam satu proyek; APD tak pernah dipakai' }), true)
await coba('evaluasi_subkon', 'kecelakaan tercatat sah (angkanya bukan pelanggaran)',
  es({ jumlah_kecelakaan: 2, jumlah_pelanggaran_k3: 5 }), true)

// ── izin_kerja ────────────────────────────────────────────────────────────
const RISIKO = 'APAR 2 unit di lokasi, fire watcher berjaga, barikade radius 5 m'
const ik = (o) => ({
  company_id: CID, project_id: PID, nomor: `WP-UJI-${++seri}`,
  jenis: 'pekerjaan_panas', uraian_pekerjaan: 'Pengelasan rangka atap',
  berlaku_dari: '2026-08-10T07:00:00Z', berlaku_sampai: '2026-08-10T17:00:00Z', ...o,
})

await coba('izin_kerja', 'jenis pekerjaan karangan', ik({ jenis: 'entah' }), false)
await coba('izin_kerja', 'uraian pekerjaan KOSONG',
  ik({ uraian_pekerjaan: '   ' }), false)
await coba('izin_kerja', 'jendela waktu TERBALIK (sampai < dari)',
  ik({ berlaku_dari: '2026-08-10T17:00:00Z', berlaku_sampai: '2026-08-10T07:00:00Z' }), false)
await coba('izin_kerja', 'jendela waktu NOL (sampai = dari)',
  ik({ berlaku_dari: '2026-08-10T07:00:00Z', berlaku_sampai: '2026-08-10T07:00:00Z' }), false)
await coba('izin_kerja', 'DISETUJUI tanpa tanggal keputusan',
  ik({ status: 'disetujui', pengendalian_risiko: RISIKO }), false)
await coba('izin_kerja', 'DISETUJUI tanpa pengendalian risiko — tanda tangan atas dokumen kosong',
  ik({ status: 'disetujui', diputuskan_pada: new Date().toISOString(),
       diajukan_oleh: U1, diputuskan_oleh: U2 }), false)
await coba('izin_kerja', 'DISETUJUI, pengendalian risiko terlalu pendek',
  ik({ status: 'disetujui', pengendalian_risiko: 'hati2',
       diputuskan_pada: new Date().toISOString(), diajukan_oleh: U1, diputuskan_oleh: U2 }), false)
await coba('izin_kerja', 'DITOLAK tanpa alasan',
  ik({ status: 'ditolak', diputuskan_pada: new Date().toISOString() }), false)

// ── INTI: pemutus tak boleh pengaju ───────────────────────────────────────
await coba('izin_kerja', 'DISETUJUI SENDIRI oleh pengajunya',
  ik({ status: 'disetujui', pengendalian_risiko: RISIKO,
       diputuskan_pada: new Date().toISOString(),
       diajukan_oleh: U1, diputuskan_oleh: U1 }), false)

await coba('izin_kerja', 'izin draft sah', ik({}), true)
await coba('izin_kerja', 'DISETUJUI lengkap oleh orang BERBEDA sah',
  ik({ status: 'disetujui', pengendalian_risiko: RISIKO,
       apd_wajib: 'Helm, sarung tangan las, apron, sepatu safety',
       diajukan_pada: new Date().toISOString(), diajukan_oleh: U1,
       diputuskan_pada: new Date().toISOString(), diputuskan_oleh: U2 }), true)
await coba('izin_kerja', 'DITOLAK dengan alasan cukup sah',
  ik({ status: 'ditolak', diajukan_oleh: U1, diputuskan_oleh: U2,
       diputuskan_pada: new Date().toISOString(),
       alasan_tolak: 'Fire watcher belum ditunjuk dan APAR di lokasi kedaluwarsa' }), true)
await coba('izin_kerja', 'DITUTUP tanpa tanggal tutup',
  ik({ status: 'ditutup' }), false)

{
  const n = `WP-UJI-KEMBAR-${++seri}`
  const { rows } = await db.query(
    `INSERT INTO izin_kerja (company_id, project_id, nomor, jenis, uraian_pekerjaan,
                             berlaku_dari, berlaku_sampai)
     VALUES ($1,$2,$3,'galian','Galian pondasi','2026-08-10T07:00:00Z','2026-08-10T17:00:00Z')
     RETURNING id`, [CID, PID, n])
  await coba('izin_kerja', 'nomor izin GANDA dalam satu company',
    { company_id: CID, project_id: PID, nomor: n, jenis: 'galian',
      uraian_pekerjaan: 'X', berlaku_dari: '2026-08-11T07:00:00Z',
      berlaku_sampai: '2026-08-11T17:00:00Z' }, false)
  await db.query('DELETE FROM izin_kerja WHERE id = $1', [rows[0].id])
}

// ── Permission benar-benar terpasang ──────────────────────────────────────
//
// Permission yang tak dimiliki peran mana pun membuat halamannya lahir
// TERKUNCI — dan gejalanya layar kosong, bukan "akses ditolak".
for (const key of ['kepatuhan:view', 'kepatuhan:manage',
                   'k3:permit:view', 'k3:permit:manage', 'k3:permit:decide']) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id WHERE p.key = $1`, [key])
  if (rows[0].n > 0) { console.log(`  ✅ permission ${key} terpasang ke ${rows[0].n} peran`); lolos++ }
  else { console.log(`  ❌ BOCOR   permission ${key} tak dimiliki peran mana pun — halaman lahir terkunci`); bocor++ }
}

// ── RLS ───────────────────────────────────────────────────────────────────
for (const t of ['dokumen_kepatuhan', 'evaluasi_subkon', 'izin_kerja']) {
  const { rows: pol } = await db.query(
    `SELECT polname, polpermissive, pg_get_expr(polqual, polrelid) q
       FROM pg_policy WHERE polrelid = $1::regclass`, [t])

  const restr = pol.find((p) => p.polpermissive === false)
  if (restr && restr.polname === 'tenant_isolation' && (restr.q || '').includes('auth_company_id')) {
    console.log(`  ✅ RLS tenant_isolation RESTRICTIVE di ${t}`)
    lolos++
  } else {
    console.log(`  ❌ BOCOR   ${t}: tak ada tenant_isolation RESTRICTIVE penyaring tenant`)
    bocor++
  }

  // ADR-004 Rule #2 — pelajaran migrasi 202.
  const literal = pol.filter((p) => (p.q || '').includes('auth_role'))
  if (literal.length === 0) { console.log(`  ✅ ${t}: nol literal peran`); lolos++ }
  else { console.log(`  ❌ BOCOR   ${t}: ${literal.length} policy memakai auth_role()`); bocor++ }

  // InitPlan — pelajaran migrasi 214.
  const telanjang = pol.filter((p) => {
    const q = (p.q || '').replace(/\(\s*SELECT\s+(auth_company_id|has_permission)/gi, '(WRAPPED')
    return /(auth_company_id|has_permission)\s*\(/.test(q)
  })
  if (telanjang.length === 0) { console.log(`  ✅ ${t}: helper InitPlan (bukan per-baris)`); lolos++ }
  else { console.log(`  ❌ BOCOR   ${t}: ${telanjang.length} policy memanggil helper per baris`); bocor++ }

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
