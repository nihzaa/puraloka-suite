#!/usr/bin/env node
/**
 * audit-skema-pajak-lengkap.mjs — ambang NOL
 *
 * Tiap nilai enum `tax_scheme` di basis wajib punya penanganan di KODE:
 * tarif, label UI, dan tipe TypeScript.
 *
 * ── Cacat yang ditutup
 *
 * Migrasi 566 menambah `tanpa_pajak` atas permintaan founder 2026-09-04
 * ("pas bikin proyek juga bisa gapake pajak … ada saklar on off nya").
 *
 * Menambah nilai enum itu SATU baris. Yang tak terlihat: belasan tempat
 * memakai pola `scheme === 'ppn' ? A : B`, dan tiap satunya diam-diam
 * memperlakukan nilai BARU sebagai cabang `else`.
 *
 * Diukur saat 566 ditulis — dua `getTaxRate` (`utils/config.ts` dan
 * `utils/financial-config.ts`) keduanya berbunyi
 *
 *     const key = scheme === 'ppn' ? 'tax.ppn_rate' : 'tax.pph_final_rate'
 *
 * jadi proyek yang pajaknya SENGAJA DIMATIKAN tetap dipotong PPh Final 2%.
 * Tak ada galat: angkanya sah, jurnalnya seimbang, invoicenya tercetak rapi.
 * Yang salah cuma jumlah uang yang ditagihkan ke klien.
 *
 * ── Kenapa dijaga
 *
 * Nilai enum berikutnya pasti ada (PPN 12%, PPh 21, bebas-PPN kawasan
 * tertentu), dan cacatnya akan berbentuk sama persis: satu ALTER TYPE yang
 * berhasil, lalu belasan `else` yang menebak.
 *
 * ── Yang diperiksa
 *
 * Untuk tiap nilai enum di basis:
 *   1. disebut di `getTaxRate` (kedua berkas) — supaya tarifnya bukan tebakan
 *   2. punya label di UI — supaya tak muncul sebagai kunci mentah
 *   3. ada di tipe TypeScript `tax_scheme` di web
 *
 * Butuh basis. Dilewati bila DATABASE_URL tak ada (pola audit-sod-gerbang).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const DB = process.env.DATABASE_URL || process.env.DIRECT_URL
if (!DB) {
  console.log('⏭  skema pajak: DILEWATI (tak ada DATABASE_URL)')
  process.exit(0)
}

const { buatClient } = await import('../../../scripts/db/_koneksi.mjs')
const c = buatClient()
await c.connect()
const { rows } = await c.query(`
  SELECT e.enumlabel AS nilai
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
   WHERE t.typname = 'tax_scheme'
   ORDER BY e.enumsortorder`)
await c.end()

const nilai = rows.map((r) => r.nilai)
if (nilai.length === 0) {
  console.error('❌ enum `tax_scheme` tak ditemukan di basis')
  process.exit(1)
}

/*
  Komentar DIBUANG sebelum diperiksa.

  Uji mutasi 2026-09-04: baris `if (scheme === 'tanpa_pajak') return 0`
  dihapus dari `financial-config.ts`, dan penjaga versi pertama tetap HIJAU —
  karena komentar panjang yang MENJELASKAN baris itu masih menyebut
  `tanpa_pajak`, dan `includes()` menemukannya di sana.

  Bentuk yang sama persis dengan cacat di CLAUDE.md §8a.2: penjelasan yang
  BENAR mendampingi keadaan yang SALAH. Kelas kesalahan ini muncul TIGA kali
  dalam satu hari di repo ini — penjaga yang memindai teks wajib memindai
  KODE, bukan prosa di sekitarnya.
*/
const tanpaKomentar = (isi) =>
  isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((b) => !/^\s*\/\//.test(b))
    .join('\n')

const baca = (p) =>
  existsSync(join(AKAR, p)) ? tanpaKomentar(readFileSync(join(AKAR, p), 'utf8')) : ''

const SUMBER = {
  'tarif (utils/config.ts)': baca('apps/api/src/utils/config.ts'),
  'tarif (utils/financial-config.ts)': baca('apps/api/src/utils/financial-config.ts'),
  'label UI (pm-portal/kontrak)': baca('apps/web/app/pm-portal/kontrak/page.tsx'),
  'tipe TS (project-modal)': baca('apps/web/components/project-modal.tsx'),
}

const temuan = []
for (const v of nilai) {
  for (const [nama, isi] of Object.entries(SUMBER)) {
    if (!isi) { temuan.push({ v, nama, sebab: 'berkasnya tak ditemukan' }); continue }
    if (!isi.includes(v)) temuan.push({ v, nama, sebab: 'nilai tak disebut sama sekali' })
  }
}

if (temuan.length > 0) {
  console.error(`❌ ${temuan.length} nilai tax_scheme tak tertangani:\n`)
  for (const t of temuan) console.error(`   '${t.v}' — ${t.nama}: ${t.sebab}`)
  console.error(`
   Pola \`scheme === 'ppn' ? A : B\` memperlakukan nilai BARU sebagai cabang
   else — diam-diam, tanpa galat. Diukur 2026-09-04: proyek yang pajaknya
   sengaja dimatikan tetap dipotong PPh Final 2%, dan yang salah cuma jumlah
   uang yang ditagihkan ke klien.

   Nilai enum di basis : ${nilai.join(', ')}
`)
  process.exit(1)
}

console.log(`✅ ${nilai.length} nilai tax_scheme tertangani di tarif, label, dan tipe: ${nilai.join(', ')}`)
