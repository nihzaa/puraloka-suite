#!/usr/bin/env node
/**
 * PENJAGA: BARIS MENU MATI PADAHAL HALAMANNYA HIDUP.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * GEJALA YANG MEMBAWA KE SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-15, membuka `/pengaturan/asisten/pemilik`:
 *
 *   *"untuk tab yg aktiv kaya gini kenapa di sidebarnya kebaca gaada yang
 *    aktif, ini aneh"*
 *
 * Halamannya hidup, tabnya menyala, breadcrumb-nya benar — tetapi tak satu
 * pun baris sidebar tersorot. Sebabnya bukan logika penyorotan: keempat
 * sub-menu Asisten ber-`is_active = false`, dan `routes/v1/menu.ts` menyaring
 * `is_active = true`. Yang tak pernah dikirim tak bisa disorot.
 *
 * ── Kenapa ini kelas cacat, bukan satu kejadian
 *
 * `is_active` berguna: sub-menu yang halamannya BELUM ada memang harus bisa
 * disembunyikan. Yang tak ada sampai hari ini adalah pemeriksaan arah
 * sebaliknya — **halaman sudah dibuat, barisnya lupa dinyalakan**.
 *
 * Kegagalannya senyap sempurna. Tak ada galat, halamannya bisa dibuka lewat
 * URL, dan satu-satunya gejalanya adalah sidebar yang "terasa aneh". Diukur
 * 2026-08-15: **146 baris** menunjuk halaman yang benar-benar ada sementara
 * barisnya mati. (Hitungan pertama saya menyebut 64 — itu SALAH: ia hanya
 * memeriksa href dua segmen, jadi melewatkan seluruh sub-menu yang menunjuk
 * halaman induk satu segmen seperti `/proyek` dan `/mandor`.)
 *
 * ── Kenapa RATCHET, bukan ambang nol
 *
 * Keseratus empat puluh enam itu BUKAN semuanya cacat. Sebagian memang sengaja
 * disembunyikan: modul yang halamannya ada tetapi belum layak dipakai, atau
 * sub-menu yang sengaja ditunda (triase F5-1). Memaksanya ke nol berarti
 * menyalakan 146 baris sekaligus — perubahan besar pada navigasi yang tak
 * seorang pun minta, dan keputusan itu milik founder.
 *
 * Yang dijaga: **angkanya tak boleh NAIK**. Halaman baru yang dibuat tanpa
 * menyalakan barisnya akan merah di sini, sementara yang sengaja disembunyikan
 * tetap tenang.
 *
 * Pakai:  node apps/web/scripts/uji-menu-halaman-hidup.mjs
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { buatClient, adaKoneksi } from '../../../scripts/db/_koneksi.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DASH = resolve(__dirname, '..', 'app', '(dashboard)')

/**
 * LANTAI — jumlah pasangan (halaman ada, menu mati) saat penjaga dibuat.
 *
 * Diukur 2026-08-15 SESUDAH migrasi 384 menyalakan empat baris Asisten.
 * Menurunkannya boleh dan bagus; menaikkannya butuh alasan tertulis.
 */
const LANTAI = 146

/** Halaman yang benar-benar ada untuk sebuah href. */
function halamanAda(href) {
  if (!href || !href.startsWith('/')) return false
  // Rute dinamis (`[id]`) tak pernah jadi href menu, jadi cukup periksa
  // berkas `page.tsx` di jalur harfiahnya.
  return existsSync(join(DASH, href, 'page.tsx'))
}

// Diperiksa SEBELUM buatClient(): ia `process.exit(2)` saat DSN tak ada,
// dan `process.exit` TIDAK bisa ditangkap `try/catch` di bawah. Diukur
// 2026-08-31 — enam penjaga menulis penangkap yang tak pernah bekerja.
if (!adaKoneksi()) {
  console.log('  ⏭  DILEWATI (tak ada DIRECT_URL/DATABASE_URL) — bukan LULUS.')
  process.exit(0)
}
const c = buatClient()
await c.connect()

let baris
try {
  const { rows } = await c.query(
    `SELECT href, label FROM menu_items
      WHERE is_active = false AND href IS NOT NULL
      ORDER BY href, label`,
  )
  baris = rows
} finally {
  await c.end()
}

const mati = baris.filter((r) => halamanAda(r.href))

if (mati.length > LANTAI) {
  console.error('\n✗ BARIS MENU MATI PADAHAL HALAMANNYA HIDUP\n')
  for (const r of mati) {
    console.error(`  • ${String(r.href).padEnd(38)} ${r.label}`)
  }
  console.error(
    `\n  ${mati.length} pasangan, LANTAI ${LANTAI}. Naik ${mati.length - LANTAI}.\n` +
      '  Halaman yang dibuat tanpa menyalakan barisnya tak akan pernah\n' +
      '  muncul di sidebar — dan tak ada galat yang menyebutkannya.\n' +
      "  Perbaiki dengan migrasi maju: UPDATE menu_items SET is_active = true.\n",
  )
  process.exit(1)
}

if (mati.length < LANTAI) {
  console.log(
    `✓ Menu vs halaman — ${mati.length} pasangan (TURUN dari lantai ${LANTAI}).\n` +
      `  Turunkan LANTAI di berkas ini ke ${mati.length} supaya perbaikannya terkunci.`,
  )
} else {
  console.log(`✓ Menu vs halaman — ${mati.length} pasangan, tepat di lantai.`)
}
