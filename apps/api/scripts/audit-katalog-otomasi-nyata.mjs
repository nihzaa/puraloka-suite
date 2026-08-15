#!/usr/bin/env node
/**
 * PENJAGA — katalog otomasi wajib menjelaskan otomasi yang BENAR-BENAR ADA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Repo ini sudah pernah punya katalog otomasi yang membusuk:
 * `06-agentic-ai-and-automation-architecture.md`. Tujuh otomasi yang sudah
 * hidup masih tertulis `Next` di sana, dan salah membacanya memakan biaya dua
 * kali dalam satu hari (2026-08-14) — sekali melapor angka salah ke founder,
 * sekali nyaris membangun ulang otomasi yang sudah ada.
 *
 * CLAUDE.md menyebut jenis kerusakan ini racun konteks paling produktif di
 * repo, dan aturan yang lahir darinya berbunyi: **kalau sebuah fakta bisa
 * basi, jangan tulis faktanya — tulis cara mengukurnya.**
 *
 * `katalog-otomasi.ts` menuruti aturan itu dengan tidak menyimpan status sama
 * sekali. Tapi masih ada satu hal yang bisa basi di sana: **daftar entrinya.**
 * Rute baru yang lupa dijelaskan, atau entri yang menjelaskan rute yang sudah
 * dihapus, keduanya membuat katalog berbohong tanpa satu pun galat.
 *
 * Jadi yang diperiksa di sini persis itu, DUA ARAH:
 *
 *   rute terdaftar tanpa entri katalog  → katalog tertinggal dari kode
 *   entri katalog tanpa rute terdaftar  → katalog menjelaskan yang tak ada
 *
 * Arah kedua sama pentingnya, dan lebih mudah terlewat. Katalog yang
 * menjelaskan otomasi yang sudah dihapus akan membuat orang menunggu pesan
 * yang tak akan pernah datang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * AMBANG NOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan ratchet. Katalog yang tak lengkap tak punya nilai parsial — orang yang
 * mencari penjelasan satu otomasi tak terbantu oleh sebelas otomasi lain yang
 * terjelaskan.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const BERKAS_RUTE = join(AKAR, 'src/routes/v1/otomasi-terjadwal.ts')
const BERKAS_KATALOG = join(AKAR, 'src/lib/katalog-otomasi.ts')

const sumberRute = readFileSync(BERKAS_RUTE, 'utf8')
const sumberKatalog = readFileSync(BERKAS_KATALOG, 'utf8')

/*
  Rute dibaca dari SUMBER, bukan dengan mengimpor modulnya.

  Mengimpornya berarti menjalankan seluruh rantai impor Fastify hanya untuk
  membaca sederet nama, dan penjaga yang butuh basis hidup akan dimatikan orang
  pertama yang CI-nya merah karena koneksi.
*/
const ruteKode = [...sumberRute.matchAll(/'\/api\/v1\/otomasi\/jalankan\/([a-z0-9-]+)'/g)]
  .map((m) => m[1])

const ruteUnik = [...new Set(ruteKode)].sort()

/*
  Entri katalog juga dibaca dari sumber, dengan alasan yang sama — dan dengan
  satu kehati-hatian tambahan: hanya entri yang TIDAK bertanda
  `kunci_bukan_rute` yang dianggap rute.

  Tanda itu ditulis eksplisit di katalog, bukan ditebak dari `pemicu`. Penjaga
  yang menebak dari `pemicu` akan diam-diam berhenti memeriksa begitu ada jenis
  pemicu baru yang tak terpikirkan hari ini.
*/
/*
  Dibaca dari `kunci:` sampai `nama:` — batas yang dipilih karena `nama` ada di
  SETIAP entri dan selalu sesudah tanda opsionalnya.

  Bentuk pertama berhenti di `(?=\n\s{4}\w)` — baris berindentasi empat
  berikutnya — dan itu justru melewatkan `kunci_bukan_rute` yang persis berada
  di sana. Akibatnya kelima otomasi percakapan dilaporkan sebagai "menjelaskan
  rute yang tak ada": penjaga yang merah untuk alasan yang salah, dan yang
  memperbaikinya akan tergoda melonggarkan pemeriksaan alih-alih regex-nya.
*/
const entri = [...sumberKatalog.matchAll(
  /\bkunci:\s*'([a-z0-9_-]+)',([\s\S]*?)\bnama:/g,
)]

const katalogRute = []
const katalogBukanRute = []
for (const [, kunci, ekor] of entri) {
  if (/kunci_bukan_rute:\s*true/.test(ekor)) katalogBukanRute.push(kunci)
  else katalogRute.push(kunci)
}
katalogRute.sort()

const tanpaEntri = ruteUnik.filter((r) => !katalogRute.includes(r))
const tanpaRute = katalogRute.filter((k) => !ruteUnik.includes(k))

/*
  Penjelasan yang KOSONG sama buruknya dengan entri yang hilang — dan lebih
  menyesatkan, karena ia terlihat lengkap dari daftar.

  Ambang 40 karakter bukan angka estetis: ia menolak "Mengecek kasbon." yang
  tak menambah apa pun di atas namanya sendiri.
*/
const penjelasanTipis = [...sumberKatalog.matchAll(
  /\bkunci:\s*'([a-z0-9_-]+)',[\s\S]*?penjelasan:\s*((?:'[^']*'\s*\+?\s*)+)/g,
)]
  .map(([, kunci, blok]) => [kunci, blok.replace(/'\s*\+\s*'/g, '').replace(/'/g, '').trim()])
  .filter(([, teks]) => teks.length < 40)
  .map(([kunci]) => kunci)

/*
  Istilah teknis di `penjelasan` — dilarang, dan bukan soal selera.

  CLAUDE.md §8a.3 dan ARAH-VISUAL-2026 sama-sama menyebut batasan yang sama:
  banyak pengguna berliterasi digital rendah. Penjelasan yang menyebut nama
  tabel tak menjelaskan apa pun bagi mereka — ia hanya memindahkan
  kebingungan.
*/
const ISTILAH_TEKNIS = /\b(SELECT|INSERT|UPDATE|JOIN|WHERE|query|endpoint|webhook|payload|API|null|boolean|foreign key|trigger)\b/i
const bahasaTeknis = [...sumberKatalog.matchAll(
  /\bkunci:\s*'([a-z0-9_-]+)',[\s\S]*?penjelasan:\s*((?:'[^']*'\s*\+?\s*)+)/g,
)]
  .filter(([, , blok]) => ISTILAH_TEKNIS.test(blok))
  .map(([, kunci]) => kunci)

const masalah = []
if (tanpaEntri.length) {
  masalah.push(
    `${tanpaEntri.length} rute otomasi TANPA penjelasan di katalog:\n` +
    tanpaEntri.map((r) => `     · ${r}`).join('\n') +
    '\n   → tambahkan entrinya di src/lib/katalog-otomasi.ts',
  )
}
if (tanpaRute.length) {
  masalah.push(
    `${tanpaRute.length} entri katalog menjelaskan rute yang TIDAK ADA:\n` +
    tanpaRute.map((r) => `     · ${r}`).join('\n') +
    '\n   → rutenya dihapus/diganti nama, atau entrinya butuh `kunci_bukan_rute: true`',
  )
}
if (penjelasanTipis.length) {
  masalah.push(
    `${penjelasanTipis.length} entri berpenjelasan terlalu tipis (<40 huruf):\n` +
    penjelasanTipis.map((r) => `     · ${r}`).join('\n'),
  )
}
if (bahasaTeknis.length) {
  masalah.push(
    `${bahasaTeknis.length} entri memakai istilah teknis di penjelasannya:\n` +
    bahasaTeknis.map((r) => `     · ${r}`).join('\n') +
    '\n   → tulis ulang untuk pembaca yang bukan engineer',
  )
}

if (masalah.length) {
  console.error('❌ audit-katalog-otomasi-nyata: katalog tak cocok dengan kode\n')
  for (const m of masalah) console.error(`   ${m}\n`)
  console.error(`   rute di kode   : ${ruteUnik.length}`)
  console.error(`   entri rute     : ${katalogRute.length}`)
  console.error(`   entri non-rute : ${katalogBukanRute.length} (percakapan/peristiwa)`)
  process.exit(1)
}

console.log(
  `✅ audit-katalog-otomasi-nyata: ${ruteUnik.length} rute terjadwal semuanya `
  + `terjelaskan, + ${katalogBukanRute.length} otomasi percakapan/peristiwa`,
)
