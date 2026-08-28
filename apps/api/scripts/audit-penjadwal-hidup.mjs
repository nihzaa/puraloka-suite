#!/usr/bin/env node
/**
 * PENJAGA — PENJADWAL YANG DILEWATI TAK BOLEH DIAM SELAMANYA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — cacat nyata, diukur 2026-08-20
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur pada repo dan pada GitHub:
 *
 *   jadwal_tugas aktif di basis     72 tugas
 *   jumlah yang pernah dipanggil    0
 *   SCHEDULER_SECRET di GitHub      ADA (sejak 9 Agustus)
 *   SCHEDULER_URL di GitHub         TIDAK ADA
 *   workflow jadwal-tugas.yml       TIDAK terdaftar di GitHub
 *   commit lokal belum ter-push     930
 *
 * Tujuh puluh dua tugas berstatus `aktif = true`, migrasinya lulus verifikasi,
 * katalog UI menampilkannya sebagai terpasang — dan tak satu pun pernah
 * berjalan.
 *
 * ── YANG MEMBUATNYA BERTAHAN: `exit 0` YANG NIATNYA BAIK
 *
 * `jadwal-tugas.yml` sengaja melewati langkahnya saat rahasia belum disetel,
 * dan alasannya tertulis di berkas itu: gagal merah tiap 15 menit akan
 * melatih orang mengabaikan notifikasi CI.
 *
 * Alasannya benar. Akibatnya tidak: penjadwal bisa mati SELAMANYA dengan
 * status HIJAU. Tak ada galat, tak ada merah, tak ada satu baris pun yang
 * menyebut bahwa 72 tugas sedang tidak berjalan. Satu-satunya gejalanya
 * adalah sesuatu yang TIDAK terjadi — dan hal yang tidak terjadi tak
 * menimbulkan tiket.
 *
 * Ini bentuk kegagalan yang sama dengan tiga penjaga rantai penjadwal yang
 * sudah ada, cuma satu lapis lebih ke luar:
 *
 *   jadwal_tugas → KATALOG_TUGAS → app.get(jalur) → [WORKFLOW] → GitHub
 *      ^ dijaga      ^ dijaga        ^ dijaga        ^ INI      ^ di luar repo
 *
 * ── YANG DIPERIKSA DI SINI, DAN YANG TIDAK
 *
 * Penjaga ini TIDAK bisa memeriksa GitHub — ia berjalan di CI, tak punya
 * kewenangan membaca daftar rahasia, dan menuntutnya berarti penjaga yang
 * merah di mesin pengembang mana pun.
 *
 * Yang diperiksa: berkas workflow-nya utuh dan syaratnya terdokumentasi.
 *
 *   1. `jadwal-tugas.yml` ADA dan punya pemicu `schedule`
 *   2. Rahasia yang dipakainya disebut di komentar berkas itu sendiri
 *   3. Cabang "dilewati" WAJIB memakai `::warning::` atau `::error::`,
 *      bukan `::notice::`
 *   4. Ada dokumen persiapan deploy yang menyebut rahasianya
 *
 * Poin 3 yang mengubah keadaan. Anotasi `notice` tidak muncul di ringkasan
 * run; `warning` muncul. Dengan warning, tiap denyut meninggalkan jejak
 * kuning yang terbaca "penjadwal sedang mati" — dengan notice, jejaknya
 * praktis tak terlihat, dan itu persis yang terjadi.
 *
 * ⚠ Penjaga ini TIDAK menjamin penjadwalnya hidup. Yang dijamin: kalau ia
 * mati, keadaannya TERLIHAT. Perbedaan itu yang menentukan.
 *
 * Ambang NOL.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WF = join(AKAR, '.github', 'workflows', 'jadwal-tugas.yml')

const salah = []

if (!existsSync(WF)) {
  console.error('✗ .github/workflows/jadwal-tugas.yml TIDAK ADA.')
  console.error('  Tanpa berkas ini tak ada yang memanggil /api/v1/jadwal/jalankan,')
  console.error('  dan seluruh tugas terjadwal diam tanpa satu pun galat.')
  process.exit(1)
}

const isi = readFileSync(WF, 'utf8')

/*
  Buang komentar sebelum memindai BAGIAN YANG DIEKSEKUSI.

  Kelas cacat yang sudah memakan waktu berkali-kali di repo ini: contoh di
  dalam komentar dibaca sebagai kode. Di sini bahayanya nyata — berkas
  workflow itu menyebut nama-nama anotasi di komentarnya sendiri untuk
  menjelaskan sejarahnya, dan penjaga yang tak memisahkan keduanya akan
  merah selamanya atau hijau selamanya, dua-duanya salah.
*/
const tanpaKomentar = isi
  .split(/\r?\n/)
  .filter((b) => !/^\s*#/.test(b))
  .join('\n')

// ── 1. Pemicu terjadwal wajib ada ──────────────────────────────────────────
if (!/^\s*schedule:/m.test(tanpaKomentar)) {
  salah.push([
    'tak punya pemicu `schedule:`',
    'Workflow tanpa jadwal hanya berjalan bila ada yang menekannya — persis '
    + 'keadaan yang penjadwal ini dibangun untuk menggantikan.',
  ])
}

// ── 2. Rahasia yang dipakai wajib disebut di komentar berkasnya ────────────
//
// Supaya yang membuka berkas ini saat deploy langsung tahu apa yang harus
// disetel, tanpa menelusuri skripnya baris per baris.
const rahasia = [...tanpaKomentar.matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1])
const unik = [...new Set(rahasia)]
const komentar = isi.split(/\r?\n/).filter((b) => /^\s*#/.test(b)).join('\n')
for (const r of unik) {
  if (!komentar.includes(r)) {
    salah.push([
      `rahasia ${r} dipakai tapi tak disebut di komentar berkas`,
      'Saat deploy, yang membuka berkas ini harus bisa membaca daftar '
      + 'lengkapnya tanpa menelusuri skripnya.',
    ])
  }
}

// ── 3. Cabang "dilewati" WAJIB TERLIHAT ────────────────────────────────────
//
// INI YANG PALING PENTING, dan yang menutup cacat 2026-08-20.
const adaCabangLewat = /\bexit 0\b/.test(tanpaKomentar)
let pakaiNotice = false
let pakaiTerlihat = false

if (adaCabangLewat) {
  const baris = tanpaKomentar.split('\n')
  const iExit = baris.findIndex((b) => /\bexit 0\b/.test(b))
  // Enam baris sebelum `exit 0` — cukup untuk memuat pesan cabangnya, cukup
  // sempit supaya tak menyerap anotasi milik langkah lain.
  const jendela = baris.slice(Math.max(0, iExit - 6), iExit + 1).join('\n')

  pakaiNotice = /::notice::/.test(jendela)
  pakaiTerlihat = /::warning::|::error::/.test(jendela)

  if (pakaiNotice && !pakaiTerlihat) {
    salah.push([
      'cabang "dilewati" memakai `::notice::`, bukan `::warning::`',
      'Anotasi notice TIDAK muncul di ringkasan run. Penjadwal yang dilewati '
      + 'karena rahasianya belum disetel akan diam SELAMANYA dengan status '
      + 'hijau — dan itu persis yang terjadi 2026-08-20: 72 tugas aktif, nol '
      + 'pernah dipanggil, nol gejala.',
    ])
  }
  if (!pakaiNotice && !pakaiTerlihat) {
    salah.push([
      'cabang "dilewati" keluar tanpa pesan apa pun',
      'Keluar diam-diam dengan `exit 0` adalah kegagalan senyap sempurna.',
    ])
  }
}

// ── 4. Syarat deploy wajib tercatat di tempat yang dibaca orang ────────────
//
// Berkas workflow bukan tempat orang mencari saat menyiapkan deploy.
const RUJUKAN = [
  join(AKAR, 'docs', 'execution', 'SIAP-DEPLOY.md'),
  join(AKAR, 'docs', 'DEPLOY.md'),
  join(AKAR, 'apps', 'api', '.env.example'),
]
const rujukanAda = RUJUKAN.filter(
  (f) => existsSync(f) && /SCHEDULER_URL/.test(readFileSync(f, 'utf8')),
)
if (rujukanAda.length === 0) {
  salah.push([
    'SCHEDULER_URL tak disebut di dokumen persiapan deploy mana pun',
    'Diperiksa: docs/execution/SIAP-DEPLOY.md, docs/DEPLOY.md, '
    + 'apps/api/.env.example. Rahasia yang cuma hidup di berkas workflow akan '
    + 'terlewat saat deploy — dan terlewatnya tak menghasilkan galat.',
  ])
}

// ── Laporan ────────────────────────────────────────────────────────────────
console.log('Penjaga penjadwal hidup')
console.log(`  rahasia dipakai   : ${unik.join(', ') || '(tak ada)'}`)
console.log(`  cabang "dilewati" : ${adaCabangLewat ? (pakaiTerlihat ? 'ada, TERLIHAT' : 'ada, tak terlihat') : 'tak ada'}`)
console.log(`  dokumen deploy    : ${rujukanAda.length > 0 ? rujukanAda.map((f) => f.replace(AKAR, '.')).join(', ') : '(tak ada)'}`)

if (salah.length > 0) {
  console.error(`\n✗ ${salah.length} masalah:\n`)
  for (const [apa, kenapa] of salah) {
    console.error(`  • ${apa}`)
    console.error(`    ${kenapa}\n`)
  }
  process.exit(1)
}

console.log('\n✓ Penjadwal: workflow utuh, cabang dilewati terlihat, syarat deploy tercatat.')
