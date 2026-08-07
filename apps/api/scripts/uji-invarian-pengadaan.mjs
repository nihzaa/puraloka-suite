#!/usr/bin/env node
/**
 * UJI INVARIAN PENGADAAN LANJUTAN — membuktikan constraint migrasi 219 menolak.
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
 *   • terpakai > kuota → PO menarik 1.200 ton dari kontrak 1.000 ton;
 *     kelebihannya ditagih di luar harga kontrak, dan baru ketahuan saat
 *     rekonsiliasi akhir tahun
 *   • barang tertahan tanpa sebab tercatat → tak seorang pun mengejarnya
 *   • "tiba" tanpa tanggal → keterlambatan jadi tak bisa dihitung sama sekali
 *   • nota kredit tanpa alasan → pengurangan uang yang tak bisa dibedakan
 *     dari kesalahan pencatatan
 *   • nota kredit DITERAPKAN tanpa pernah disetujui → uang hilang tanpa satu
 *     pun tanda tangan
 *   • pemutus nota kredit = pengajunya → potongan yang disetujui sendiri
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-pengadaan.mjs
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

const { rows: sp } = await db.query(`SELECT id, company_id FROM suppliers LIMIT 1`)
const { rows: us } = await db.query(`SELECT id FROM users ORDER BY created_at, id LIMIT 2`)
const { rows: po } = await db.query(`SELECT id FROM purchase_orders LIMIT 1`)

if (!sp.length || us.length < 2) {
  console.log('⚠️  Butuh 1 pemasok dan 2 pengguna berbeda. Dilewati.')
  await db.end()
  process.exit(0)
}
const SID = sp[0].id
const CID = sp[0].company_id
const U1 = us[0].id
const U2 = us[1].id
const POID = po[0]?.id ?? null

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

console.log('\nINVARIAN pengadaan lanjutan (migrasi 219)\n')

// ── kontrak_payung ────────────────────────────────────────────────────────
const kp = (o) => ({
  company_id: CID, supplier_id: SID, nomor: `BO-UJI-${++seri}`,
  judul: 'Besi beton 2026', berlaku_dari: '2026-01-01',
  berlaku_sampai: '2026-12-31', ...o,
})

await coba('kontrak_payung', 'jendela berlaku TERBALIK',
  kp({ berlaku_dari: '2026-12-31', berlaku_sampai: '2026-01-01' }), false)
await coba('kontrak_payung', 'pagu nilai NOL', kp({ pagu_nilai: 0 }), false)
await coba('kontrak_payung', 'pagu nilai NEGATIF', kp({ pagu_nilai: -1 }), false)
await coba('kontrak_payung', 'status karangan', kp({ status: 'entah' }), false)
await coba('kontrak_payung', 'pemasok karangan',
  kp({ supplier_id: '00000000-0000-0000-0000-0000000000ff' }), false)
await coba('kontrak_payung', 'kontrak payung sah', kp({ pagu_nilai: 5000000000 }), true)
await coba('kontrak_payung', 'kontrak tanpa pagu nilai sah', kp({ pagu_nilai: null }), true)

{
  const n = `BO-UJI-KEMBAR-${++seri}`
  const { rows } = await db.query(
    `INSERT INTO kontrak_payung (company_id, supplier_id, nomor, judul, berlaku_dari, berlaku_sampai)
     VALUES ($1,$2,$3,'A','2026-01-01','2026-12-31') RETURNING id`, [CID, SID, n])
  const kid = rows[0].id

  await coba('kontrak_payung', 'nomor kontrak GANDA dalam satu company',
    { company_id: CID, supplier_id: SID, nomor: n, judul: 'B',
      berlaku_dari: '2026-01-01', berlaku_sampai: '2026-12-31' }, false)

  // ── kontrak_payung_item ─────────────────────────────────────────────────
  const ki = (o) => ({
    company_id: CID, kontrak_id: kid, uraian: 'Besi D16 #' + (++seri),
    satuan: 'ton', harga_satuan: 14000000, kuota: 100, ...o,
  })

  await coba('kontrak_payung_item', 'harga satuan NOL', ki({ harga_satuan: 0 }), false)
  await coba('kontrak_payung_item', 'kuota NOL', ki({ kuota: 0 }), false)
  await coba('kontrak_payung_item', 'terpakai NEGATIF', ki({ terpakai: -1 }), false)

  // INTI kontrak payung.
  await coba('kontrak_payung_item', 'TERPAKAI MELEBIHI KUOTA',
    ki({ kuota: 100, terpakai: 101 }), false)

  await coba('kontrak_payung_item', 'item kontrak sah', ki({ terpakai: 30 }), true)
  await coba('kontrak_payung_item', 'terpakai TEPAT kuota sah (batas inklusif)',
    ki({ kuota: 100, terpakai: 100 }), true)

  {
    const u = 'Besi D13 kembar'
    const { rows: r2 } = await db.query(
      `INSERT INTO kontrak_payung_item (company_id, kontrak_id, uraian, satuan, harga_satuan, kuota)
       VALUES ($1,$2,$3,'ton',1000,10) RETURNING id`, [CID, kid, u])
    await coba('kontrak_payung_item', 'item GANDA (kontrak+uraian+satuan sama)',
      { company_id: CID, kontrak_id: kid, uraian: u, satuan: 'ton',
        harga_satuan: 2000, kuota: 20 }, false)
    await db.query('DELETE FROM kontrak_payung_item WHERE id = $1', [r2[0].id])
  }

  // UPDATE yang melewati kuota juga harus ditolak — bukan cuma INSERT.
  {
    const { rows: r3 } = await db.query(
      `INSERT INTO kontrak_payung_item (company_id, kontrak_id, uraian, satuan, harga_satuan, kuota, terpakai)
       VALUES ($1,$2,'Uji update',' ton',1000,50,10) RETURNING id`, [CID, kid])
    try {
      await db.query('UPDATE kontrak_payung_item SET terpakai = 51 WHERE id = $1', [r3[0].id])
      console.log('  ❌ BOCOR   UPDATE terpakai melewati kuota DITERIMA')
      bocor++
    } catch (e) {
      if (DITOLAK.has(e.code)) {
        console.log(`  ✅ ditolak UPDATE terpakai melewati kuota (${e.code})`)
        lolos++
      } else {
        console.log(`  ❌ BOCOR   UPDATE ditolak galat lain: ${e.code}`)
        bocor++
      }
    }
    await db.query('DELETE FROM kontrak_payung_item WHERE id = $1', [r3[0].id])
  }

  await db.query('DELETE FROM kontrak_payung WHERE id = $1', [kid])
}

// ── expediting ────────────────────────────────────────────────────────────
if (POID) {
  const ex = (o) => ({ company_id: CID, po_id: POID, ...o })

  await coba('expediting', 'status karangan', ex({ status: 'entah' }), false)
  await coba('expediting', 'moda karangan', ex({ moda: 'roket' }), false)
  await coba('expediting', 'TERTAHAN tanpa sebab',
    ex({ status: 'tertahan' }), false)
  await coba('expediting', 'TERTAHAN, sebab terlalu pendek',
    ex({ status: 'tertahan', sebab_tertahan: 'x' }), false)
  await coba('expediting', 'TIBA tanpa tanggal tiba',
    ex({ status: 'tiba' }), false)
  await coba('expediting', 'expediting sah',
    ex({ status: 'dalam_perjalanan', janji_vendor: '2026-08-20',
         perkiraan_tiba: '2026-08-22', moda: 'darat' }), true)

  {
    const { rows } = await db.query(
      `INSERT INTO expediting (company_id, po_id, status) VALUES ($1,$2,'dipesan') RETURNING id`,
      [CID, POID])
    await coba('expediting', 'expediting GANDA untuk PO yang sama',
      { company_id: CID, po_id: POID, status: 'dipesan' }, false)
    await db.query('DELETE FROM expediting WHERE id = $1', [rows[0].id])
  }
} else {
  console.log('  ⚠️  Tak ada purchase_order — uji expediting dilewati.')
}

// ── nota_kredit ───────────────────────────────────────────────────────────
const ALASAN = 'Besi D16 sebanyak 2 ton berkarat berat, ditolak QC dan diretur'
const nk = (o) => ({
  company_id: CID, supplier_id: SID, nomor: `CN-UJI-${++seri}`,
  tanggal: '2026-08-01', jumlah: 25000000, alasan: ALASAN, ...o,
})

await coba('nota_kredit', 'jumlah NOL', nk({ jumlah: 0 }), false)
await coba('nota_kredit', 'jumlah NEGATIF', nk({ jumlah: -1 }), false)
await coba('nota_kredit', 'alasan terlalu pendek', nk({ alasan: 'rusak' }), false)
await coba('nota_kredit', 'jenis karangan', nk({ jenis: 'entah' }), false)
await coba('nota_kredit', 'DISETUJUI tanpa tanggal keputusan',
  nk({ status: 'disetujui' }), false)
await coba('nota_kredit', 'DITOLAK tanpa alasan penolakan',
  nk({ status: 'ditolak', diputuskan_pada: new Date().toISOString() }), false)

// INTI: uang hilang tanpa tanda tangan.
await coba('nota_kredit', 'DITERAPKAN tanpa pernah disetujui',
  nk({ status: 'diterapkan', diterapkan_pada: new Date().toISOString() }), false)
await coba('nota_kredit', 'DITERAPKAN tanpa tanggal penerapan',
  nk({ status: 'diterapkan', diputuskan_pada: new Date().toISOString() }), false)

// INTI: pemisahan tugas.
await coba('nota_kredit', 'DISETUJUI SENDIRI oleh pengajunya',
  nk({ status: 'disetujui', diputuskan_pada: new Date().toISOString(),
       diajukan_oleh: U1, diputuskan_oleh: U1 }), false)

await coba('nota_kredit', 'nota kredit draft sah', nk({}), true)
await coba('nota_kredit', 'DISETUJUI oleh orang BERBEDA sah',
  nk({ status: 'disetujui', diajukan_oleh: U1, diputuskan_oleh: U2,
       diputuskan_pada: new Date().toISOString() }), true)
await coba('nota_kredit', 'DITERAPKAN lengkap sah',
  nk({ status: 'diterapkan', diajukan_oleh: U1, diputuskan_oleh: U2,
       diputuskan_pada: new Date().toISOString(),
       diterapkan_pada: new Date().toISOString() }), true)
await coba('nota_kredit', 'DITOLAK dengan alasan cukup sah',
  nk({ status: 'ditolak', diajukan_oleh: U1, diputuskan_oleh: U2,
       diputuskan_pada: new Date().toISOString(),
       alasan_tolak: 'Barang sudah dipakai di lapangan, retur tak bisa diterima' }), true)

{
  const n = `CN-UJI-KEMBAR-${++seri}`
  const { rows } = await db.query(
    `INSERT INTO nota_kredit (company_id, supplier_id, nomor, tanggal, jumlah, alasan)
     VALUES ($1,$2,$3,'2026-08-01',1000000,$4) RETURNING id`, [CID, SID, n, ALASAN])
  await coba('nota_kredit', 'nomor nota kredit GANDA dalam satu company',
    { company_id: CID, supplier_id: SID, nomor: n, tanggal: '2026-08-02',
      jumlah: 2000000, alasan: ALASAN }, false)
  await db.query('DELETE FROM nota_kredit WHERE id = $1', [rows[0].id])
}

// ── Kolom penarik kontrak payung di PO ────────────────────────────────────
{
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'purchase_orders' AND column_name = 'kontrak_payung_id'`)
  if (rows.length) { console.log('  ✅ purchase_orders.kontrak_payung_id ada'); lolos++ }
  else { console.log('  ❌ BOCOR   purchase_orders.kontrak_payung_id tak ada'); bocor++ }
}

// ── RLS ───────────────────────────────────────────────────────────────────
const TABEL = ['kontrak_payung', 'kontrak_payung_item', 'expediting',
  'expediting_jejak', 'nota_kredit']

for (const t of TABEL) {
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
