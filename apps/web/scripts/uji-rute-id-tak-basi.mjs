#!/usr/bin/env node
// ============================================================================
// `useData` WAJIB MENGIKAT DATA KE URL ASALNYA
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Bentuk pertama `useData` menyimpan `data` sebagai state LEPAS dan tidak
// mengosongkannya saat `url` berganti: ia menaikkan `memuat`, lalu menimpa
// `data` sesudah jawaban baru tiba. Di antara keduanya, `data` masih berisi
// jawaban untuk URL SEBELUMNYA.
//
// Untuk halaman ber-saringan itu tak berbahaya — sekejap melihat hasil filter
// lama bukan kerusakan, dan justru menghindari kedip.
//
// Untuk halaman rute [id] itu KEBOCORAN IDENTITAS:
//
//     /mandor/A  ->  /mandor/B
//     layar menampilkan profil A di bawah URL B sampai jawaban B tiba
//
// Data orang lain, di halaman orang lain, tanpa satu pun galat. Di
// `/portal/proyek/[id]` (dibuka KLIEN) dan `/verify/invoice/[id]`, itu bukan
// tampilan keliru — itu memperlihatkan data pihak lain.
//
// ── Ditemukan 2026-08-16, dua kali
//
// Pertama saat memindahkan `mandor/[id]`: kode LAMA-nya punya pelacakan
// `dimuat !== id` yang justru ada untuk mencegah ini, dan pemindahan polos ke
// `useData` menghapusnya. Tak ada test yang merah — test tak pernah berpindah
// dari satu id ke id lain.
//
// Lalu terulang di `proyek/[id]/baseline` — dan DI SANA responsnya bahkan tak
// memuat id proyeknya, jadi pemanggil tak punya apa pun untuk dicocokkan.
//
// ── KENAPA PENJAGA INI MEMERIKSA LAPISAN, BUKAN TIAP HALAMAN
//
// Bentuk pertama penjaga ini menuntut TIAP halaman rute [id] mencocokkan
// identitasnya sendiri (`data.mandor.id === id`). Kasus kedua menolaknya
// sendiri: `baseline` tak bisa memenuhinya karena datanya memang tak membawa
// id — jadi penjaganya menuntut hal yang mustahil, dan penjaga semacam itu
// dimatikan orang alih-alih diperbaiki.
//
// Lebih dari itu: menuntut tiap halaman berjaga sendiri berarti mengulang
// pertahanan yang sama di puluhan tempat, dan SATU yang lupa cukup untuk
// memperlihatkan data pihak lain.
//
// Jadi perbaikannya dipindah ke `useData`: `data` disimpan bersama url asalnya
// dan hanya dikembalikan bila keduanya cocok. Harganya satu kedip rangka saat
// berpindah id — jauh lebih murah daripada kebocoran.
//
// Penjaga ini mengunci invarian itu. Diuji juga di `lib/data-cache.test.ts`
// ("data terikat ke URL-nya"); penjaga ini lapis kedua — test bisa dihapus,
// invariannya tidak boleh.
//
// Ambang NOL.
// ============================================================================

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const SUMBER = join(AKAR, 'lib', 'data-cache.ts')

// Komentar dilucuti sebelum diperiksa — EMPAT kali dalam satu sesi sebuah
// pemeriksaan di repo ini membaca komentarnya sendiri sebagai kode, dan sekali
// mutasinya LOLOS karenanya.
const kode = readFileSync(SUMBER, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const gagal = []

// 1. `data` WAJIB disimpan bersama url asalnya, bukan sebagai state lepas.
if (!/useState<\{\s*url:\s*string;\s*nilai:\s*T\s*\}\s*\|\s*null>/.test(kode)) {
  gagal.push('`data` tidak lagi disimpan bersama url asalnya ({ url, nilai })')
}

// 2. Dan WAJIB dibandingkan sebelum dikembalikan.
if (!/entri\s*&&\s*entri\.url\s*===\s*url/.test(kode)) {
  gagal.push('`entri.url === url` hilang, data URL lama bisa lolos ke URL baru')
}

if (gagal.length > 0) {
  console.error('\nIkatan data-URL di `lib/data-cache.ts` RUSAK:\n')
  for (const g of gagal) console.error(`   x ${g}`)
  console.error(`
  Tanpa ikatan itu, \`useData\` mengembalikan jawaban URL SEBELUMNYA selama
  jawaban baru belum tiba. Untuk halaman ber-saringan itu tak berbahaya; untuk
  rute [id] itu KEBOCORAN IDENTITAS: /x/A ke /x/B menampilkan data A di bawah
  URL B.

  Di \`/portal/proyek/[id]\` (dibuka KLIEN) dan \`/verify/invoice/[id]\`, itu
  memperlihatkan data pihak lain.

  Bentuknya yang benar:

     const [entri, setEntri] = useState<{ url: string; nilai: T } | null>(null)
     const data = entri && entri.url === url ? entri.nilai : null
`)
  process.exit(1)
}

console.log('OK rute [id] tak basi: `useData` mengikat data ke URL asalnya')
