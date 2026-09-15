#!/usr/bin/env node
/**
 * PENJAGA — test yang membuat perusahaan wajib membersihkannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: tabel `companies` berisi **597 baris tanpa anggota**, dan
 * NOL di antaranya bukan pola test (`[UJI-S8] Tenant Lain`, `uji-rute-…`).
 * Seluruhnya sisa test yang tak pernah dibersihkan.
 *
 * Itu bukan sekadar kotor. Ia sudah memakan biaya nyata dalam satu hari:
 *
 *   · migrasi 401 menjadwalkan 8 tugas untuk tiap perusahaan → 4.794 baris,
 *     2.018 di antaranya gagal 403 tiap denyut ("bukan anggota perusahaan
 *     tersebut")
 *   · `notification_rules` melewati 1.736 baris → melampaui batas potong
 *     senyap PostgREST, halaman Aturan Notifikasi menampilkan 1.000 dari 1.736
 *   · pembacaan penjadwal terpotong di 1.000 dari 4.794
 *
 * Ketiganya cacat yang penyebabnya sama, dan tak satu pun punya gejala sendiri.
 *
 * Dan jumlahnya TUMBUH: satu kali menjalankan suite penuh menambah ~27 baris.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * RATCHET, BUKAN AMBANG NOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dua puluh tiga berkas belum membersihkan, dan memperbaikinya semua sekaligus
 * adalah perubahan besar yang menyentuh berkas yang tak ada hubungannya dengan
 * pekerjaan mana pun yang sedang berjalan.
 *
 * Yang penting dijaga sekarang: **jumlahnya tak boleh naik.** Berkas ke-24
 * memerahkan CI, dan yang memperbaiki satu berkas lama boleh menurunkan
 * lantainya.
 *
 * ── Yang dianggap "membersihkan"
 *
 * Kehadiran `DELETE FROM companies` di berkas yang sama. Sengaja longgar: ada
 * banyak bentuk pembersihan yang sah (afterAll, helper, kaskade lewat
 * company_members), dan penjaga yang menuntut satu bentuk akan menolak
 * perbaikan yang benar.
 *
 * Yang TIDAK longgar: berkas yang membuat perusahaan tanpa menyebut
 * penghapusan sama sekali. Itu yang menghasilkan 597 baris.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(AKAR, 'src')

/**
 * Lantai — HANYA BOLEH TURUN. Menaikkannya butuh ratifikasi (G-5).
 *
 * 23 → 14 pada 2026-09-14. Bukan sembilan berkas diperbaiki: pengenalan
 * "membersihkan" DIPERLUAS ke penonaktifan (lihat catatan di `MEMBERSIHKAN`),
 * dan sembilan berkas yang selama ini menonaktifkan dengan BENAR ternyata
 * terhitung kotor — sementara tiga yang terhitung bersih justru memakai
 * `DELETE` yang tak pernah berhasil.
 *
 * Angkanya turun karena pengukurannya diperbaiki, bukan karena ambangnya
 * dilonggarkan. Yang dihitung kini benar-benar membersihkan.
 */
const AMBANG = 14

function berkasTest(dir) {
  const hasil = []
  for (const nama of readdirSync(dir)) {
    const jalur = join(dir, nama)
    if (statSync(jalur).isDirectory()) hasil.push(...berkasTest(jalur))
    else if (nama.endsWith('.test.ts')) hasil.push(jalur)
  }
  return hasil
}

/*
  Pola pembuatan DIUKUR dari yang benar-benar dipakai di repo ini, bukan
  dikarang: `INSERT INTO companies` (SQL langsung lewat harness RLS) dan
  `from('companies')…insert` (lewat klien Supabase).
*/
const MEMBUAT = /INSERT\s+INTO\s+companies\b|from\(\s*['"]companies['"]\s*\)[\s\S]{0,120}?\.insert\(/i

/*
  ⚠ MENONAKTIFKAN ikut dihitung membersihkan — DIPERBAIKI 2026-09-14, dan
  ini KOREKSI PREMIS, bukan pelonggaran.

  Versi sebelumnya hanya mengenali `DELETE FROM companies`, dan bagian
  "Perbaikan" di bawah menyarankan persis itu. **Statement itu TAK PERNAH
  BERHASIL.** Dibuktikan ke basis hidup hari ini, di dalam transaksi yang
  langsung di-rollback:

      INSERT companies → DELETE companies
      → ❌ 'Company "…" tidak boleh dihapus. Nonaktifkan (is_active=false)
            atau jalankan prosedur off-boarding tenant.'

  Trigger `fn_company_no_casual_delete` (migrasi 126 §8) menolaknya tanpa
  syarat, dan ia BENAR: penghapusan tenant harus keputusan sadar, bukan efek
  samping teardown test.

  Jadi selama ini penjaga ini menghitung "bersih" berkas yang memuat perintah
  yang selalu gagal — dan galatnya ditelan `supabase-js` (memulangkan
  `{ error }`, tidak melempar). Tiga berkas yang "bersih" menurut aturan lama
  ternyata meninggalkan satu tenant AKTIF tiap jalan suite, dan gejalanya
  muncul di berkas LAIN (`t9-kelola-badan-usaha`: "ada akar grup tanpa
  pemilik").

  Penjaga yang menuntut bentuk yang mustahil akan dipenuhi secara formal dan
  dilanggar secara nyata — persis yang terjadi.

  Yang dikenali sekarang: penghapusan ATAU penonaktifan (termasuk lewat
  `bongkarCompanyUji()`, helper yang MELEMPAR bila gagal).
*/
const MEMBERSIHKAN =
  /DELETE\s+FROM\s+companies\b|from\(\s*['"]companies['"]\s*\)[\s\S]{0,120}?\.delete\(|bongkarCompanyUji\s*\(|UPDATE\s+companies\s+SET\s+is_active\s*=\s*false|from\(\s*['"]companies['"]\s*\)[\s\S]{0,160}?\.update\(\s*\{\s*is_active:\s*false/i

const kotor = []
for (const jalur of berkasTest(SRC)) {
  const isi = readFileSync(jalur, 'utf8')
  if (!MEMBUAT.test(isi)) continue
  if (MEMBERSIHKAN.test(isi)) continue
  kotor.push(relative(AKAR, jalur).replace(/\\/g, '/'))
}

kotor.sort()

console.log('══ Test yang membuat perusahaan WAJIB membersihkannya ══════')
console.log(`  berkas tak membersihkan : ${kotor.length}`)
console.log(`  ambang (lantai)         : ${AMBANG}`)

if (kotor.length > AMBANG) {
  console.error('')
  console.error(`❌ RATCHET GAGAL: ${kotor.length} > ambang ${AMBANG}`)
  console.error('')
  console.error('   Berkas yang membuat perusahaan tanpa menghapusnya:')
  for (const f of kotor) console.error(`     · ${f}`)
  console.error('')
  console.error('   Perbaikan — di `afterAll`, NONAKTIFKAN perusahaan yang dibuat test ini:')
  console.error('')
  console.error("     import { bongkarCompanyUji } from '../../test-utils/bongkar-company-uji.js'")
  console.error('     await bongkarCompanyUji(supabase, companyId)')
  console.error('')
  console.error('   ⚠ JANGAN memakai `DELETE FROM companies` — trigger')
  console.error('   `fn_company_no_casual_delete` (migrasi 126 §8) MENOLAKNYA tanpa syarat,')
  console.error('   dan `supabase-js` menelan galatnya. Teardown-nya lalu "berhasil" dengan')
  console.error('   tenang sambil meninggalkan tenant AKTIF tiap jalan suite.')
  console.error('')
  console.error('   JANGAN menaikkan ambang. Tiap baris yang tertinggal di sini')
  console.error('   menumpuk selamanya, dan tumpukannya sudah memakan biaya:')
  console.error('   2.018 tugas terjadwal gagal 403, dua pembacaan terpotong')
  console.error('   senyap di 1.000 baris. Tak satu pun punya gejala sendiri.')
  process.exit(1)
}

if (kotor.length < AMBANG) {
  console.log('')
  console.log(`📉 Turun dari ambang — kencangkan AMBANG jadi ${kotor.length} di skrip ini.`)
}

console.log('')
console.log(`✅ Pembersihan tenant test: ${kotor.length}/${AMBANG} — tidak bertambah.`)
