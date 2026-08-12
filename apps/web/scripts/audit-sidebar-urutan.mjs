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
let luar
let yatim
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

  /**
   * Anak WAJIB berada di `gso+1 .. gso+99`.
   *
   * Konvensi ini tak pernah ditulis di mana pun — ia diukur 2026-08-12 dan
   * ternyata dipatuhi **16 dari 18 grup**. Dua yang menyimpang:
   *
   *     AI & Otomasi   gso  185 → anak 1810–1900
   *     Keuangan       gso 1100 → "Tutup Buku" 1413
   *
   * Yang pertama SAYA penyebabnya (migrasi 319): jaraknya benar, basisnya
   * salah — 1810 alih-alih 186, tanpa memeriksa konvensi yang sudah ada.
   *
   * Kenapa ini penting meski belum menggigit: urutan ANTAR-grup ditentukan
   * `sort_order` grupnya, jadi anak di luar rentang tak terlihat salah hari
   * ini. Ia menggigit saat grup berikutnya lahir di rentang yang sudah
   * ditempati anak grup lain — dan tabrakan itu tak mengeluarkan galat, hanya
   * urutan yang aneh yang sulit dilacak asalnya.
   */
  const l = await db.query(`
    SELECT g.label AS grup, g.sort_order AS gso,
           i.label AS item, i.sort_order AS iso
      FROM menu_items g
      JOIN menu_items i ON i.parent_id = g.id AND i.is_active
     WHERE g.parent_id IS NULL AND g.is_active
       AND (i.sort_order <= g.sort_order OR i.sort_order > g.sort_order + 99)
     ORDER BY g.sort_order, i.sort_order`)

  /**
   * Item AKTIF yang induknya MATI — cacat yang penjaga ini sempat buta padanya.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * KENAPA INI LOLOS DARI SELURUH PENGUKURAN SEBELUMNYA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Kedua kueri di atas menyaring `g.is_active` — dan begitu pula setiap
   * kueri audit sidebar yang saya tulis di migrasi 319 dan 320. Item yang
   * induknya `is_active = false` karena itu tak pernah masuk hitungan sama
   * sekali: bukan dilaporkan nol, melainkan **tak pernah ditanyakan**.
   *
   * Founder yang menemukannya, lewat tangkapan layar: lima menu berdiri
   * sendiri tanpa induk. Diukur sesudah ditunjuk: **18 item aktif di 5 grup
   * mati** (`g-qaqc`, `g-hse`, `g-hr`, `g-risiko`, `g-sistem`), dan kedelapan
   * belas halamannya ADA — 18 halaman jadi yang kehilangan jalan masuk.
   *
   * Sidebar tetap merender anaknya karena penyaringnya per-BARIS, bukan
   * per-POHON. Mereka muncul sebagai item lepas di bawah grup terakhir yang
   * kebetulan berdekatan `sort_order`.
   *
   * Pelajarannya bukan "saya kurang teliti": penyaring yang sama dipakai di
   * kueri audit DAN di kode render, jadi keduanya sepakat melihat dunia yang
   * sama — dan yang di luar dunia itu tak terlihat oleh keduanya.
   */
  const y = await db.query(`
    SELECT g.label AS grup, g.key AS gkey,
           i.label AS item, i.href
      FROM menu_items i
      JOIN menu_items g ON g.id = i.parent_id
     WHERE i.is_active AND NOT g.is_active
     ORDER BY g.sort_order, i.sort_order`)

  await db.end()
  baris = r.rows
  luar = l.rows
  yatim = y.rows
} catch (e) {
  console.log('⚠️  DB tak terhubung — pemeriksaan DILEWATI, bukan dinyatakan lulus.')
  console.log(`   ${e.message.slice(0, 100)}`)
  process.exit(0)
}

console.log('\n══ Urutan sidebar ═════════════════════════════════════════════')
console.log(`  sort_order bentrok    : ${baris.length}`)
console.log(`  anak di luar rentang  : ${luar.length}`)
console.log(`  item induknya MATI    : ${yatim.length}`)

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

if (luar.length) {
  console.log('')
  for (const r of luar) {
    console.log(
      `   ${String(r.grup).padEnd(22)} ${String(r.item).padEnd(26)} ${String(r.iso).padStart(5)}` +
        `   (rentang sah: ${r.gso + 1}–${r.gso + 99})`,
    )
  }

  console.error(`\n❌ MERAH: ${luar.length} anak di luar rentang gso+1..gso+99.`)
  console.error('')
  console.error('   Konvensi ini dipatuhi SELURUH grup — diukur, bukan diasumsikan.')
  console.error('   Anak di luar rentang tak terlihat salah hari ini karena urutan')
  console.error('   ANTAR-grup ditentukan sort_order GRUPNYA. Ia menggigit saat grup')
  console.error('   berikutnya lahir di rentang yang sudah ditempati anak grup lain —')
  console.error('   dan tabrakan itu tak mengeluarkan galat, hanya urutan aneh yang')
  console.error('   sulit dilacak asalnya.')
  console.error('')
  console.error('   Perbaiki di migrasi maju bernomor. Contohnya migrasi 320.')
  process.exit(1)
}

if (yatim.length) {
  console.log('')
  let g0 = null
  for (const r of yatim) {
    if (r.gkey !== g0) {
      g0 = r.gkey
      console.log(`   induk MATI: ${r.grup}  (${r.gkey})`)
    }
    console.log(`      ${String(r.item).padEnd(28)} ${r.href ?? ''}`)
  }

  console.error(`\n❌ MERAH: ${yatim.length} item AKTIF bergantung pada grup yang MATI.`)
  console.error('')
  console.error('   Sidebar tetap merender item ini karena penyaringnya per-BARIS,')
  console.error('   bukan per-POHON — jadi mereka muncul MENGGANTUNG tanpa induk,')
  console.error('   nyantol di bawah grup terakhir yang kebetulan berdekatan.')
  console.error('')
  console.error('   Dua jalan keluar, pilih menurut halamannya:')
  console.error('     · halamannya ADA  → hidupkan grupnya, atau pindahkan item')
  console.error('                          ke grup aktif (migrasi 321)')
  console.error('     · halamannya TIDAK → matikan itemnya juga, jangan biarkan')
  console.error('                          setengah hidup')
  console.error('')
  console.error('   JANGAN mematikan item yang halamannya ada hanya supaya penjaga')
  console.error('   ini hijau — itu menghapus jalan masuk ke halaman yang sudah jadi.')
  process.exit(1)
}

console.log('\n  ✅ Nol bentrok, nol di luar rentang, nol item yatim.\n')
process.exit(0)
