#!/usr/bin/env node
/**
 * PENJAGA — tiap ambang otomasi WAJIB bisa disetel dari UI. Ambang NOL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG SUDAH TERJADI, DAN KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman `/pengaturan/otomasi` pernah memelihara daftar ambangnya SENDIRI:
 * array yang ditulis tangan di frontend, berisi kunci, judul, penjelasan,
 * satuan, batas, dan langkah — semuanya disalin dari `lib/ambang-otomasi.ts`.
 *
 * Diukur 2026-08-16: **37 ambang di kode, 15 di halaman.** Dua puluh dua tak
 * bisa disetel dari UI mana pun. Nilainya ada di basis, rutenya membacanya,
 * dan satu-satunya cara mengubahnya SQL langsung.
 *
 * Itu persis yang dilarang CHARTER §8:
 *
 *     "Kolom DB sudah ada BUKAN selesai. Config-first berarti ada halaman
 *      pengaturannya di UI."
 *
 * Penyebabnya bukan kelalaian satu orang melainkan BENTUKNYA: dua daftar yang
 * harus dijaga sejalan pasti melenceng, dan melencengnya tak bergejala —
 * halaman tetap tampil rapi, hanya lebih pendek.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG DIPERIKSA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. Tiap entri `AMBANG_OTOMASI` punya metadata yang dibutuhkan UI untuk
 *    menampilkannya: `judul`, `akibat`, `satuan`, `langkah`. Entri tanpa itu
 *    akan tampil sebagai kartu kosong — hadir tetapi tak bisa dimengerti.
 *
 * 2. Halaman pengaturan TIDAK memaku kunci ambang apa pun. Begitu ia mulai
 *    menyebut `otomasi.…` sendiri, daftar kedua lahir kembali dan
 *    kemundurannya cuma soal waktu.
 *
 * Yang TIDAK diperiksa di sini: apakah nilainya benar. Itu urusan test dan
 * blok verifikasi migrasi.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const BERKAS_AMBANG = join(AKAR, 'apps/api/src/lib/ambang-otomasi.ts')
const BERKAS_HALAMAN = join(
  AKAR, 'apps/web/app/(dashboard)/pengaturan/otomasi/page.tsx')

const WAJIB = ['judul', 'akibat', 'satuan', 'langkah']

function gagal(pesan, rincian = []) {
  console.error(`\n❌ audit-ambang-bisa-disetel: ${pesan}\n`)
  for (const r of rincian) console.error(`     · ${r}`)
  console.error('')
  process.exit(1)
}

if (!existsSync(BERKAS_AMBANG)) {
  gagal(`berkas ambang tak ditemukan: ${BERKAS_AMBANG}`)
}

const isiAmbang = readFileSync(BERKAS_AMBANG, 'utf8')

/*
  Entri dipotong per blok `'otomasi.x': { … },` — bukan diurai sebagai TS.

  Mengurai TypeScript di penjaga menuntut kompiler, dan penjaga yang butuh
  kompiler cenderung dimatikan saat kompilernya berubah. Pemotongan tekstual
  cukup di sini karena bentuk berkasnya seragam, dan kalau kelak berubah,
  penjaga ini MERAH — bukan diam.
*/
/*
  WAJIB `\r?` di KEDUA tempat — dan ketiadaannya membuat penjaga ini BUTA.

  `ambang-otomasi.ts` berakhiran CRLF, sementara pola lama menuntut `\n`
  telanjang untuk pembuka blok dan `$` untuk penutupnya. Hasilnya NOL dari
  72 entri terbaca — bukan sebagian, melainkan seluruhnya.

  Yang menyelamatkan keadaan ini adalah penjaga itu SENDIRI: ia menolak
  melapor hijau saat tak satu pun entri terbaca ("bentuk berkasnya berubah,
  dan penjaga ini berhenti memeriksa apa pun"). Tanpa penolakan itu ia akan
  hijau selamanya tanpa memeriksa apa pun — nasib LIMA penjaga lain yang
  ditemukan mati pada hari yang sama (2026-08-27).

  Pelajarannya: tiap penjaga yang membaca kode lewat regex butuh pemeriksaan
  "apakah saya menemukan apa pun", dan harus memperlakukan NOL sebagai
  KEGAGALAN — bukan sebagai kebersihan.
*/
const blok = [...isiAmbang.matchAll(/^ {2}'(otomasi\.[^']+)': \{\r?\n([\s\S]*?)^ {2}\},\r?$/gm)]

if (blok.length === 0) {
  gagal('tak satu pun entri ambang terbaca — bentuk berkasnya berubah, dan '
    + 'penjaga ini berhenti memeriksa apa pun. Perbaiki polanya, jangan '
    + 'matikan penjaganya')
}

const kurang = []
for (const [, kunci, isi] of blok) {
  const hilang = WAJIB.filter((f) => !new RegExp(`^\\s{4}${f}:`, 'm').test(isi))
  if (hilang.length > 0) kurang.push(`${kunci} — tanpa ${hilang.join(', ')}`)
}

if (kurang.length > 0) {
  gagal(
    `${kurang.length} ambang tak punya metadata yang dibutuhkan halaman `
    + 'pengaturan. Tanpa itu ia tampil sebagai kartu kosong: hadir, tetapi '
    + 'tak bisa dimengerti siapa pun',
    kurang)
}

/*
  Halaman pengaturan tak boleh menyebut kunci ambang sendiri.

  Yang dicari `'otomasi.…'` di dalam KODE, bukan di komentar: komentar yang
  menjelaskan sejarahnya justru harus boleh menyebutnya, dan penjaga yang
  melarang itu memaksa orang menghapus penjelasan terbaiknya.
*/
if (existsSync(BERKAS_HALAMAN)) {
  const isiHalaman = readFileSync(BERKAS_HALAMAN, 'utf8')
  const tanpaKomentar = isiHalaman
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  const dipaku = [...tanpaKomentar.matchAll(/["'`](otomasi\.[a-z0-9_.]+)["'`]/g)]
    .map((m) => m[1])

  if (dipaku.length > 0) {
    gagal(
      `halaman pengaturan memaku ${dipaku.length} kunci ambang. Daftar kedua `
      + 'lahir kembali, dan melencengnya dari kode cuma soal waktu — persis '
      + 'cacat yang membuat 22 ambang tak bisa disetel siapa pun. Halaman '
      + 'harus menampilkan apa pun yang dikirim '
      + 'GET /api/v1/settings/ambang-otomasi',
      [...new Set(dipaku)])
  }
}

console.log(
  `✅ audit-ambang-bisa-disetel: ${blok.length} ambang lengkap metadatanya, `
  + 'halaman pengaturan tak memaku satu pun kunci')
