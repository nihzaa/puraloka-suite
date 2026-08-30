#!/usr/bin/env node
/**
 * MENU BERBAGI HREF — label menjanjikan hal spesifik, yang muncul halaman umum.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pada 2026-08-07 diukur: **144 item menu berbagi 27 href**. `/proyek` sendiri
 * dipakai 22 item — klik "Cost Baseline (BAC)" mendarat di daftar proyek biasa,
 * klik "Denda Keterlambatan" juga, klik "Kurva S" juga.
 *
 * Bahayanya bukan estetika. Pengguna belajar bahwa **sub-menu tak bisa
 * dipercaya**, lalu berhenti memakainya — dan itu menghapus seluruh nilai dari
 * taksonomi 191 sub-menu yang disusun justru supaya orang bisa menemukan
 * sesuatu. Menu yang diabaikan sama saja dengan menu yang tak ada.
 *
 * ── Dulu RATCHET, sekarang LARANGAN MUTLAK
 *
 * Bagian ini pernah berjudul "Kenapa RATCHET, bukan larangan mutlak" dan
 * beralasan bahwa berbagi href tidak selalu salah — "Upah Harian & Borongan"
 * dan "Upah Harian Lapangan" memang dua nama untuk satu halaman, dan dua
 * kelompok berbeda mencari hal yang sama.
 *
 * Alasan itu sah SELAMA 144 item berbagi href. Migrasi 232 merombak sidebar
 * jadi satu route = satu link, dan angkanya kini NOL — ambangnya larangan
 * mutlak, bukan lantai (lihat catatan panjangnya tepat di atas pemeriksaan).
 *
 * Dibiarkan dalam bentuk terkoreksi, bukan dihapus: sampai 2026-08-11 kepala
 * berkas ini menyatakan "ratchet" sementara badannya menyatakan "larangan
 * mutlak". Pembaca yang berhenti di kepala akan menyimpulkan boleh menambah
 * sedikit — dan penjaganya akan merah tanpa ia mengerti kenapa.
 *
 * ── `/m/<key>` sengaja dikecualikan
 *
 * Seluruhnya dilayani satu route dinamis, tapi tiap key menampilkan isi
 * berbeda dari `PETA_MENU` — ia BUKAN "banyak menu, satu halaman". Justru
 * sebaliknya: `/m/<key>` adalah jawaban yang jujur untuk menu yang halamannya
 * belum ada.
 *
 * ── Hubungannya dengan `lib/menu-berbagi-href.ts`
 *
 * Berkas itu menangani GEJALA VISUAL-nya: saat satu href dipakai >1 item, hanya
 * satu "wakil" yang menyala, sisanya diredupkan dengan titik penanda. Ia matang
 * dan tetap dipakai. Yang TIDAK bisa dilakukannya: membuat orang yang mengklik
 * "Cost Baseline (BAC)" mendarat di cost baseline. Penjaga ini menjaga agar
 * jumlah kasus semacam itu tak bertambah.
 *
 * ── DB tak terhubung
 *
 * Berhenti exit 0 dan MENGATAKANNYA — penjaga yang diam-diam melewatkan diri
 * lebih berbahaya daripada penjaga yang absen.
 *
 * Pakai (dari akar repo): node apps/web/scripts/audit-menu-berbagi-href.mjs
 *
 * TIDAK ada `--naikkan`. Baris itu pernah tertulis di sini bersama impor
 * `writeFileSync` dan konstanta `LANTAI` — sisa dari era ketika penjaga ini
 * masih ratchet (lihat catatan "LARANGAN MUTLAK" di bawah). Sesudah migrasi
 * 232 ambangnya NOL mutlak, jadi tak ada lantai untuk dinaikkan.
 *
 * Bendera yang didokumentasikan tapi tak diimplementasikan lebih buruk
 * daripada bendera yang tak ada: menjalankannya tidak menghasilkan galat, ia
 * hanya diam — dan pemakainya menyimpulkan lantainya sudah dinaikkan.
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

let baris
try {
  const koneksi = await import(
    'file://' + join(AKAR, 'scripts', 'db', '_koneksi.mjs').replace(/\\/g, '/'))
  // Diperiksa SEBELUM buatClient(): ia `process.exit(2)` saat DSN tak ada,
  // dan `process.exit` TIDAK bisa ditangkap `try/catch` di sekelilingnya.
  // Diukur 2026-08-31: enam penjaga menulis penangkap yang tak pernah bekerja,
  // dan keenamnya mati exit 2 di job CI yang memang tak diberi kredensial.
  if (!koneksi.adaKoneksi('DIRECT_URL')) {
    console.log('  ⏭  DILEWATI (tak ada DIRECT_URL/DATABASE_URL) — bukan LULUS.')
    process.exit(0)
  }
  const db = koneksi.buatClient('DIRECT_URL')
  await db.connect()
  const r = await db.query(`
    SELECT href, count(*)::int AS n, string_agg(label, ' · ' ORDER BY label) AS label
      FROM menu_items
     WHERE is_active AND href IS NOT NULL AND href NOT LIKE '/m/%'
     GROUP BY href HAVING count(*) > 1
     ORDER BY count(*) DESC, href`)
  await db.end()
  baris = r.rows
} catch (e) {
  console.log('⚠️  DB tak terhubung — pemeriksaan DILEWATI, bukan dinyatakan lulus.')
  console.log(`   ${e.message.slice(0, 100)}`)
  process.exit(0)
}

const item = baris.reduce((s, r) => s + r.n, 0)

console.log('\n══ Menu berbagi href ══════════════════════════════════════════')
console.log(`  href dipakai >1 item : ${baris.length}`)
console.log(`  item terlibat        : ${item}`)

if (baris.length) {
  console.log('\n— terbesar dulu:')
  for (const r of baris.slice(0, 12)) {
    console.log(`   ${String(r.n).padStart(3)}  ${r.href}`)
    console.log(`        ${r.label.slice(0, 96)}${r.label.length > 96 ? '…' : ''}`)
  }
  if (baris.length > 12) console.log(`   … dan ${baris.length - 12} href lagi`)
}

// ── LARANGAN MUTLAK, bukan ratchet lagi ─────────────────────────────────────
//
// Sampai migrasi 232 ini ratchet: angka hari ini jadi lantai, boleh turun,
// tak boleh naik. Itu tepat selama 144 item berbagi href dan menurunkannya
// butuh berhari-hari — menuntut nol seketika hanya akan membuat penjaga ini
// dimatikan pada hari pertama.
//
// Migrasi 232 merombak sidebar jadi satu route = satu link, dan angkanya kini
// NOL. Ratchet kehilangan gunanya: yang dijaga bukan lagi "jangan bertambah"
// melainkan "jangan ada sama sekali". Aturan yang boleh dilanggar sedikit
// bukan aturan.

if (baris.length > 0) {
  console.error(`\nMERAH: ${item} item menu berbagi ${baris.length} href.`)
  console.error('  Aturan sesudah migrasi 232: SATU route = SATU link sidebar.')
  console.error('  Kalau dua peran mencari halaman yang sama, letakkan di satu')
  console.error('  tempat — peran lain menemukannya lewat pencarian, bukan lewat')
  console.error('  link kedua yang membuat dua item menyala bersamaan.')
  console.error('')
  console.error('  Kalau halamannya belum ada, JANGAN taut dari sidebar sama')
  console.error('  sekali — daftarnya ada di /peta-modul.')
  process.exit(1)
}

console.log('\n✅ Nol href dipakai lebih dari satu link.\n')
process.exit(0)