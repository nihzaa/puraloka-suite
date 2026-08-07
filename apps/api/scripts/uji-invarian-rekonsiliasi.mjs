#!/usr/bin/env node
/**
 * UJI INVARIAN REKONSILIASI BANK — membuktikan constraint migrasi 234 menolak.
 *
 * ── Kenapa lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau `CREATE TABLE IF NOT
 * EXISTS` melewatinya diam-diam pada basis yang sudah punya tabel bernama sama.
 * Satu-satunya cara tahu adalah MENCOBA MELANGGARNYA.
 *
 * ── Kenapa penjaga TERPISAH, bukan blok verifikasi di migrasinya
 *
 * Blok `DO $$` di akhir migrasi 234 tak bisa menguji RLS: migrasi itu sendiri
 * menjalankan `ALTER TABLE ... FORCE ROW LEVEL SECURITY` beberapa baris di
 * atasnya, jadi keadaan apa pun yang dirusak akan dipulihkannya sendiri sebelum
 * diperiksa. Diuji, dan mutasinya memang lolos — pesan galat yang muncul justru
 * dari pemeriksaan lain.
 *
 * Penjaga ini berjalan SESUDAH migrasi, terhadap basis apa adanya.
 *
 * ── Apa yang dijaga, dan kenapa ini soal uang
 *
 *   • satu baris koran dicocokkan DUA KALI → satu penerimaan dihitung ganda,
 *     dan saldo buku menjauh dari bank justru saat orang mengira mendekat
 *   • satu transaksi buku dicocokkan ke dua baris koran → hal yang sama dari
 *     arah sebaliknya
 *   • baris mutasi debit DAN kredit sekaligus → salah baca berkas yang
 *     menggeser saldo tanpa gejala
 *   • impor koran yang sama dua kali → seluruh isinya berlipat
 *   • koran "dikunci" tanpa siapa & kapan → tak bisa dipertanggungjawabkan
 *   • penyesuaian bernominal NOL → daftar terlihat lebih panjang dari isinya
 *   • penyesuaian "lainnya" tanpa keterangan → keranjang sampah tempat selisih
 *     yang tak dipahami dibuang, dan rekonsiliasinya berhenti berarti
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-rekonsiliasi.mjs
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

const { rows: ak } = await db.query(
  `SELECT id, company_id FROM cash_accounts WHERE company_id IS NOT NULL LIMIT 1`)
if (!ak.length) {
  console.log('⚠️  Butuh 1 cash_account ber-company. Dilewati.')
  await db.end()
  process.exit(0)
}
const AKUN = ak[0].id
const CID = ak[0].company_id

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
    else { console.log(`  ❌ BOCOR   ${nama} — basis MENERIMA yang tak boleh masuk`); bocor++ }
  } catch (e) {
    if (harusMasuk) {
      console.log(`  ❌ BOCOR   ${nama} DITOLAK (${e.code} ${e.message.slice(0, 66)})`)
      bocor++
    } else if (DITOLAK.has(e.code)) {
      console.log(`  ✅ ditolak ${nama} (${e.code})`)
      lolos++
    } else {
      console.log(`  ❌ BOCOR   ${nama} — ditolak galat lain: ${e.code} ${e.message.slice(0, 56)}`)
      bocor++
    }
  }
}

console.log('\nINVARIAN rekonsiliasi bank (migrasi 234)\n')

// ── rekening_koran ──────────────────────────────────────────────────────────
const kr = (o) => ({
  company_id: CID, cash_account_id: AKUN,
  periode_dari: '2026-07-01', periode_sampai: '2026-07-31',
  saldo_awal: 10000000, saldo_akhir: 12500000, ...o,
})

await coba('rekening_koran', 'periode TERBALIK',
  kr({ periode_dari: '2026-07-31', periode_sampai: '2026-07-01' }), false)
await coba('rekening_koran', 'status karangan', kr({ status: 'entah' }), false)
await coba('rekening_koran', 'DIKUNCI tanpa tanggal & penanggung jawab',
  kr({ status: 'dikunci' }), false)
await coba('rekening_koran', 'rekening karangan',
  kr({ cash_account_id: '00000000-0000-0000-0000-0000000000ff' }), false)
await coba('rekening_koran', 'koran sah', kr({ periode_dari: '2026-01-01', periode_sampai: '2026-01-31' }), true)
await coba('rekening_koran', 'saldo akhir LEBIH KECIL dari awal sah (kas menyusut)',
  kr({ periode_dari: '2026-02-01', periode_sampai: '2026-02-28', saldo_akhir: 500000 }), true)

// ── koran + baris + pencocokan ──────────────────────────────────────────────
{
  const { rows: r1 } = await db.query(
    `INSERT INTO rekening_koran (company_id, cash_account_id, periode_dari, periode_sampai, saldo_awal, saldo_akhir)
     VALUES ($1,$2,'2026-03-01','2026-03-31',0,0) RETURNING id`, [CID, AKUN])
  const KORAN = r1[0].id

  await coba('rekening_koran', 'periode GANDA untuk rekening yang sama',
    { company_id: CID, cash_account_id: AKUN, periode_dari: '2026-03-01',
      periode_sampai: '2026-03-31', saldo_awal: 0, saldo_akhir: 0 }, false)

  const br = (o) => ({
    koran_id: KORAN, tanggal: '2026-03-05', keterangan: 'Transfer masuk',
    debit: 0, kredit: 1000000, hash_baris: 'h-' + (++seri), ...o,
  })

  await coba('rekening_koran_baris', 'debit DAN kredit sekaligus',
    br({ debit: 500000, kredit: 500000 }), false)
  await coba('rekening_koran_baris', 'debit dan kredit sama-sama NOL',
    br({ debit: 0, kredit: 0 }), false)
  await coba('rekening_koran_baris', 'nominal NEGATIF', br({ debit: 0, kredit: -1 }), false)
  await coba('rekening_koran_baris', 'baris masuk sah', br({}), true)
  await coba('rekening_koran_baris', 'baris keluar sah', br({ debit: 750000, kredit: 0 }), true)

  {
    const h = 'hash-kembar'
    const { rows: rb } = await db.query(
      `INSERT INTO rekening_koran_baris (koran_id, tanggal, keterangan, debit, kredit, hash_baris)
       VALUES ($1,'2026-03-06','Setoran',0,2000000,$2) RETURNING id`, [KORAN, h])
    const BARIS = rb[0].id

    // Impor ulang berkas yang sama tak boleh menggandakan barisnya.
    await coba('rekening_koran_baris', 'baris GANDA (hash sama dalam satu koran)',
      { koran_id: KORAN, tanggal: '2026-03-06', keterangan: 'Setoran',
        debit: 0, kredit: 2000000, hash_baris: h }, false)

    // ── pencocokan_bank ─────────────────────────────────────────────────────
    const { rows: py } = await db.query(`SELECT id FROM payments LIMIT 1`)
    if (py.length) {
      const PAY = py[0].id

      await coba('pencocokan_bank', 'sumber_tabel karangan',
        { company_id: CID, baris_id: BARIS, sumber_tabel: 'entah', sumber_id: PAY }, false)
      await coba('pencocokan_bank', 'jenis karangan',
        { company_id: CID, baris_id: BARIS, sumber_tabel: 'payments', sumber_id: PAY,
          jenis: 'ajaib' }, false)

      const { rows: rc } = await db.query(
        `INSERT INTO pencocokan_bank (company_id, baris_id, sumber_tabel, sumber_id)
         VALUES ($1,$2,'payments',$3) RETURNING id`, [CID, BARIS, PAY])

      // INTI: hitung-ganda dari dua arah.
      await coba('pencocokan_bank', 'baris koran dicocokkan DUA KALI',
        { company_id: CID, baris_id: BARIS, sumber_tabel: 'cash_transfers',
          sumber_id: '00000000-0000-0000-0000-000000000001' }, false)

      {
        const { rows: rb2 } = await db.query(
          `INSERT INTO rekening_koran_baris (koran_id, tanggal, keterangan, debit, kredit, hash_baris)
           VALUES ($1,'2026-03-07','Lain',0,3000,'h-lain') RETURNING id`, [KORAN])
        await coba('pencocokan_bank', 'transaksi buku dicocokkan ke DUA baris koran',
          { company_id: CID, baris_id: rb2[0].id, sumber_tabel: 'payments', sumber_id: PAY }, false)
        await db.query('DELETE FROM rekening_koran_baris WHERE id = $1', [rb2[0].id])
      }

      await db.query('DELETE FROM pencocokan_bank WHERE id = $1', [rc[0].id])
      await coba('pencocokan_bank', 'pencocokan sah',
        { company_id: CID, baris_id: BARIS, sumber_tabel: 'payments', sumber_id: PAY }, true)
    } else {
      console.log('  ⚠️  tak ada payments — pemeriksaan pencocokan dilewati')
    }

    await db.query('DELETE FROM rekening_koran_baris WHERE id = $1', [BARIS])
  }

  // ── penyesuaian_rekonsiliasi ──────────────────────────────────────────────
  const ps = (o) => ({
    company_id: CID, koran_id: KORAN, jenis: 'biaya_admin',
    keterangan: 'Biaya administrasi bulanan', nominal: -15000, ...o,
  })

  await coba('penyesuaian_rekonsiliasi', 'jenis karangan', ps({ jenis: 'entah' }), false)
  await coba('penyesuaian_rekonsiliasi', 'nominal NOL', ps({ nominal: 0 }), false)
  await coba('penyesuaian_rekonsiliasi', '"lainnya" TANPA keterangan memadai',
    ps({ jenis: 'lainnya', keterangan: 'lain' }), false)
  await coba('penyesuaian_rekonsiliasi', 'penyesuaian sah (biaya admin)', ps({}), true)
  await coba('penyesuaian_rekonsiliasi', 'jasa giro POSITIF sah',
    ps({ jenis: 'jasa_giro', keterangan: 'Bunga giro Maret', nominal: 8500 }), true)
  await coba('penyesuaian_rekonsiliasi', '"lainnya" berketerangan panjang sah',
    ps({ jenis: 'lainnya', keterangan: 'Koreksi salah pindah buku dari bank tanggal 12' }), true)

  await db.query('DELETE FROM rekening_koran WHERE id = $1', [KORAN])
}

// ── RLS ─────────────────────────────────────────────────────────────────────
//
// Diperiksa DI SINI, bukan di blok verifikasi migrasi: migrasi itu sendiri
// menjalankan `ALTER TABLE ... FORCE` beberapa baris di atas blok verifikasinya,
// jadi mutasi apa pun dipulihkannya sendiri sebelum sempat diperiksa.
console.log('\n  ── RLS (Ember [C] — tak boleh bisa dimatikan) ──')
{
  const { rows } = await db.query(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
     WHERE c.relname IN ('rekening_koran','rekening_koran_baris',
                         'pencocokan_bank','penyesuaian_rekonsiliasi')
     ORDER BY c.relname`)
  for (const t of rows) {
    if (t.relrowsecurity && t.relforcerowsecurity) {
      console.log(`  ✅ RLS aktif & forced  ${t.relname}`)
      lolos++
    } else {
      console.log(`  ❌ BOCOR   RLS tidak lengkap ${t.relname} (enabled=${t.relrowsecurity} forced=${t.relforcerowsecurity})`)
      bocor++
    }
  }
}

await db.end()
console.log(bocor === 0
  ? `\n✅ ${lolos} invarian terjaga, 0 bocor\n`
  : `\n❌ ${bocor} BOCOR dari ${lolos + bocor} pemeriksaan\n`)
process.exit(bocor === 0 ? 0 : 1)
