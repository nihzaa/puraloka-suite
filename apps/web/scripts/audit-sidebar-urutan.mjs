#!/usr/bin/env node
/**
 * PENJAGA URUTAN SIDEBAR — `sort_order` tak boleh bentrok dalam satu grup.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-12 atas keluhan founder (*"susunan dan penempatannya ada yg
 * masih ga sesuai"*): **5 pasang item berbagi `sort_order` di grup yang sama**,
 * dan DUA di antaranya lahir dari migrasi 276 & 278 — keduanya milik saya,
 * keduanya memakai `max(sort_order) + n` tanpa memeriksa angka itu sudah
 * dipakai atau belum.
 *
 * ── Kenapa ini cacat, meski urutannya TIDAK acak
 *
 * Dugaan pertama: tanpa tie-break, Postgres bebas mengurutkan berbeda tiap
 * query. Diperiksa ke `routes/v1/menu.ts` — ia sudah memakai
 * `.order('section').order('sort_order').order('key')`. Urutannya deterministik.
 *
 * Cacatnya lebih halus: urutan tampil ditentukan **abjad `key`**, bukan niat
 * siapa pun. Di AI & Otomasi hasilnya lima halaman asisten — satu rangkaian
 * yang sengaja dipecah migrasi 276 — terpotong oleh "Pemakaian & Biaya" dan
 * "Kanal WhatsApp" yang nyempil di tengah. Orang yang mencari "Asisten Staf"
 * berhenti di sisipan itu lalu mengira daftarnya sudah habis.
 *
 * Bentrok karena itu bukan sekadar kerapian: ia membuat urutan menu ditentukan
 * kebetulan penamaan kunci, dan penulis migrasi berikutnya tak punya cara tahu
 * urutan mana yang akan muncul.
 *
 * ── DB tak terhubung
 *
 * Berhenti exit 0 dan MENGATAKANNYA. Penjaga yang diam-diam melewatkan diri
 * lebih berbahaya daripada penjaga yang absen — pola yang sama dipakai
 * `audit-menu-berbagi-href.mjs`.
 *
 * Pakai (dari akar repo): node apps/web/scripts/audit-sidebar-urutan.mjs
 *
 * TIDAK ada `--naikkan`: ambangnya NOL mutlak. Menyisipkan menu baru selalu
 * bisa memakai angka yang belum terpakai — tak ada kasus sah untuk bentrok.
 */

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

let baris
try {
  const koneksi = await import(
    'file://' + join(AKAR, 'scripts', 'db', '_koneksi.mjs').replace(/\\/g, '/'))
  const db = koneksi.buatClient('DIRECT_URL')
  await db.connect()
  const r = await db.query(`
    SELECT g.label AS grup,
           i.sort_order,
           count(*)::int AS n,
           string_agg(i.label, ' | ' ORDER BY i.key) AS item
      FROM menu_items i
      JOIN menu_items g ON g.id = i.parent_id
     WHERE i.is_active AND g.is_active
     GROUP BY g.label, g.sort_order, i.sort_order
    HAVING count(*) > 1
     ORDER BY g.sort_order, i.sort_order`)
  await db.end()
  baris = r.rows
} catch (e) {
  console.log('⚠️  DB tak terhubung — pemeriksaan DILEWATI, bukan dinyatakan lulus.')
  console.log(`   ${e.message.slice(0, 100)}`)
  process.exit(0)
}

console.log('\n══ Urutan sidebar ═════════════════════════════════════════════')
console.log(`  sort_order bentrok : ${baris.length}`)

if (baris.length) {
  console.log('')
  for (const r of baris) {
    console.log(`   ${String(r.grup).padEnd(22)} ${String(r.sort_order).padStart(5)}  ×${r.n}`)
    console.log(`        ${r.item}`)
  }

  console.error(`\n❌ MERAH: ${baris.length} sort_order dipakai lebih dari satu item.`)
  console.error('')
  console.error('   Urutan tampilnya jatuh ke tie-break `key` (abjad), bukan ke')
  console.error('   niat siapa pun — dan penulis migrasi berikutnya tak punya')
  console.error('   cara tahu urutan mana yang akan muncul.')
  console.error('')
  console.error('   Perbaiki di MIGRASI MAJU bernomor, bukan dengan meregenerasi')
  console.error('   153_peta_menu_penuh.sql — itu membatalkan 232_sidebar_disiplin')
  console.error('   (alasan lengkap di migrasi 273).')
  console.error('')
  console.error('   Nomori grupnya ulang dengan JARAK 10, bukan +1: angka rapat')
  console.error('   adalah sebab langsung tabrakan ini — dengan +1, sisipan')
  console.error('   berikutnya tak punya ruang dan penulisnya memakai angka yang')
  console.error('   sudah ada. Contohnya migrasi 319.')
  process.exit(1)
}

console.log('\n  ✅ Nol sort_order bentrok.\n')
process.exit(0)
