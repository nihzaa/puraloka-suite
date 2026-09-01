#!/usr/bin/env node
/**
 * audit-jadwal-company-hidup.mjs — ambang NOL
 *
 * Menolak `jadwal_tugas` yang aktif tetapi company-nya `is_active = false`.
 *
 * ── Kenapa ini dijaga
 *
 * Diukur 2026-09-01: 122 dari 329 tugas terjadwal berstatus `gagal`, semuanya
 * dengan galat yang SAMA:
 *
 *     /api/v1/otomasi/jalankan/evm-kinerja membalas 403:
 *     {"error":"Anda bukan anggota perusahaan tersebut"}
 *
 * 403-nya BENAR. Dua company uji sudah dinonaktifkan, tapi jadwalnya
 * tertinggal aktif — jadi tiap denyut penjadwal mencoba menjalankan tugas
 * untuk perusahaan yang tak lagi ada.
 *
 * Bahayanya bukan pemborosan denyut. Bahayanya: 122 kegagalan yang WAJAR dan
 * BERULANG membuat papan pemantauan otomasi menyesatkan — yang melihatnya
 * menyimpulkan otomasi rusak padahal 207 sisanya bekerja, lalu belajar
 * mengabaikan kolom status. Kegagalan yang SUNGGUHAN nanti ikut terabaikan.
 *
 * Ditutup migrasi 563. Penjaga ini menahan agar tak terbentuk lagi — company
 * uji berikutnya pasti ada, dan menonaktifkan company tidak otomatis
 * menyentuh jadwalnya.
 *
 * ── Kenapa penjaga, bukan trigger
 *
 * Trigger memperbaiki diam-diam dan menyembunyikan bahwa alur menonaktifkan
 * company memang tak mengurus jadwalnya. Penjaga membuat kelalaian itu
 * terlihat.
 */
import { buatClient, adaKoneksi } from '../../../scripts/db/_koneksi.mjs'

/*
  ⚠ `adaKoneksi()` DULU — `buatClient()` melakukan `process.exit(2)` saat
  DSN tak ada, dan `process.exit` TIDAK bisa ditangkap `try/catch` di
  sekelilingnya.

  Diukur 2026-09-01, run CI pertama sesudah ci.yml diperbaiki: penjaga ini
  MEMERAHKAN ENAM shard job `API — test` dengan

      FATAL: DIRECT_URL/DATABASE_URL tidak ditemukan

  padahal nol cacat data — job itu memang tak diberi kredensial basis.
  Pesan FATAL-nya sendiri sudah menyebutkan perbaikan ini, dan penjaga
  lain di repo ini (`audit-peta-menu-vs-db.mjs`) sudah memakainya.

  DILEWATI, bukan LULUS. Penjaga yang diam-diam melewatkan diri lebih
  berbahaya daripada penjaga yang absen: CI-nya tetap hijau, dan tak ada
  yang tahu pemeriksaannya tak pernah berjalan.
*/
if (!adaKoneksi()) {
  console.log('  ⏭  DILEWATI (tak ada DIRECT_URL/DATABASE_URL) — bukan LULUS.')
  process.exit(0)
}

const c = buatClient()
await c.connect()

const { rows } = await c.query(`
  SELECT co.name, count(*)::int tugas
    FROM jadwal_tugas jt JOIN companies co ON co.id = jt.company_id
   WHERE jt.aktif AND NOT co.is_active
   GROUP BY co.name ORDER BY 2 DESC`)
await c.end()

const total = rows.reduce((n, r) => n + r.tugas, 0)

if (total > 0) {
  console.error(`❌ ${total} jadwal_tugas aktif milik company NONAKTIF:\n`)
  for (const r of rows) console.error(`   ${String(r.name).padEnd(40)} ${r.tugas} tugas`)
  console.error(`
   Tiap denyut penjadwal akan menjalankannya, gagal 403, lalu mencatat galat.
   Kegagalan wajar yang berulang membuat papan pemantauan tak bisa dipercaya.

   Perbaiki lewat migrasi maju (pola 563):

     UPDATE jadwal_tugas jt SET aktif = FALSE
       FROM companies co
      WHERE co.id = jt.company_id AND jt.aktif AND NOT co.is_active;
`)
  process.exit(1)
}

console.log('✅ nol jadwal_tugas aktif milik company nonaktif')
