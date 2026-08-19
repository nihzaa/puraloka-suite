#!/usr/bin/env node
// ============================================================================
// PENJAGA — tiap jenis gambar wajib punya JUDUL di layar.
// ============================================================================
//
// ── Cacat yang melahirkannya
//
// Rute menaruh gambar di `badan.gambar` sebagai objek berkunci: `penampang`,
// `potongan`, `pondasi`, `diagramPM`, `denah`, `tampak`, `pola`. Halaman detail
// merender SEMUANYA secara umum, dengan judul dari tabel `JUDUL_GAMBAR`:
//
//     {JUDUL_GAMBAR[nama] ?? nama}
//
// `?? nama` itu yang berbahaya. Kunci yang tak terdaftar TIDAK menghilang dan
// TIDAK menggagalkan apa pun — ia muncul sebagai judul apa adanya. Pengguna
// melihat kata "pola" atau "tampak" sebagai kepala gambar, dan itu terbaca
// seperti cacat aplikasi.
//
// Ditemukan 2026-08-19: sepuluh jenis gambar baru dibuat, tiga kunci baru
// (`denah`, `tampak`, `pola`) lahir bersamanya, dan tabel judulnya tetap
// berisi EMPAT entri. Gambarnya terbit dengan benar — hanya kepalanya yang
// berupa kunci mentah, dan tak satu pun test menangkapnya karena tak ada yang
// salah secara teknis.
//
// ── Yang dijaga
//
// Tiap kunci yang ditulis rute ke `g.<kunci>` (selain `…Gagal` dan `meteran`,
// yang memang ditangani terpisah) wajib ada di `JUDUL_GAMBAR` pada halaman
// detail.
//
// Ambang NOL. Tiap pelanggaran adalah kata teknis yang bocor ke layar orang
// yang justru tak paham istilah teknis — masalah yang sama dengan yang
// dijaga `struktur-awam.ts`, di tempat yang berbeda.
// ============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = process.cwd()
const RUTE = join(AKAR, 'src', 'routes', 'v1', 'struktur.ts')
const HAL = join(
  AKAR, '..', 'web', 'app', '(dashboard)', 'estimasi', 'struktur', 'page.tsx',
)

if (!existsSync(RUTE)) {
  console.error(`❌ Rute tak ditemukan: ${RUTE}`)
  process.exit(1)
}
if (!existsSync(HAL)) {
  console.error(`❌ Halaman detail tak ditemukan: ${HAL}`)
  console.error('   Jalankan dari apps/api.')
  process.exit(1)
}

const isiRute = readFileSync(RUTE, 'utf8')
const isiHal = readFileSync(HAL, 'utf8')

/*
  Kunci gambar yang ditulis rute. Dicari dari `g.<kunci> = ` di dalam
  `gambarUntuk()` — bentuk yang dipakai seluruh cabangnya.
*/
const mFn = isiRute.match(/function gambarUntuk\([\s\S]*?\n\}\n/)
if (!mFn) {
  console.error('❌ gambarUntuk() tak ditemukan di rute')
  process.exit(1)
}

const DIKECUALIKAN = new Set([
  /*
    `meteran` ditampilkan TERPISAH di panel ringkasan awam, bukan di galeri
    gambar benda — halaman detail menyaringnya keluar dengan sengaja.
  */
  'meteran',
])

const kunci = new Set()
for (const m of mFn[0].matchAll(/\bg\.([a-zA-Z][a-zA-Z0-9]*)\s*=/g)) {
  const k = m[1]
  if (k.endsWith('Gagal')) continue     // pesan galat, bukan gambar
  if (DIKECUALIKAN.has(k)) continue
  kunci.add(k)
}

if (!kunci.size) {
  console.error('❌ Tak satu pun kunci gambar terbaca dari gambarUntuk() —')
  console.error('   bentuk penulisannya berubah, dan penjaga ini berhenti')
  console.error('   memeriksa apa pun. Perbaiki polanya, jangan matikan penjaganya.')
  process.exit(1)
}

/* Tabel judul di halaman detail. */
const mJudul = isiHal.match(/const JUDUL_GAMBAR: Record<string, string> = \{([\s\S]*?)\n  \}/)
if (!mJudul) {
  console.error('❌ Tabel JUDUL_GAMBAR tak ditemukan di halaman detail')
  process.exit(1)
}
const berjudul = new Set(
  [...mJudul[1].matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map((m) => m[1]),
)

const tanpaJudul = [...kunci].filter((k) => !berjudul.has(k))
const judulBasi = [...berjudul].filter((k) => !kunci.has(k))

console.log('══ Tiap jenis gambar wajib punya judul di layar ════════════')
console.log(`  kunci gambar di rute : ${kunci.size}`)
console.log(`  punya judul di UI    : ${berjudul.size}`)
console.log(`  tanpa judul          : ${tanpaJudul.length}`)
console.log('  ambang               : 0 (bukan ratchet)')

if (judulBasi.length) {
  console.log('')
  console.log(`  ⓘ judul untuk kunci yang tak lagi ditulis rute: ${judulBasi.join(', ')}`)
  console.log('    Bukan galat — hanya entri yang bisa dibersihkan.')
}

if (tanpaJudul.length) {
  console.log('')
  console.error('❌ Kunci gambar ini tak punya judul di halaman detail:')
  console.error('')
  for (const k of tanpaJudul) {
    console.error(`     g.${k}`)
  }
  console.error('')
  console.error('   Halaman detail memakai `JUDUL_GAMBAR[nama] ?? nama`, jadi kunci')
  console.error('   yang tak terdaftar MUNCUL APA ADANYA sebagai kepala gambar.')
  console.error('   Pengguna melihat kata teknis mentah, dan itu terbaca seperti')
  console.error('   cacat aplikasi — tanpa satu pun galat.')
  console.error('')
  console.error('   Perbaikan: tambahkan judulnya di `JUDUL_GAMBAR` pada')
  console.error('   apps/web/app/(dashboard)/estimasi/struktur/page.tsx')
  process.exit(1)
}

console.log('')
console.log(`✅ ${kunci.size} jenis gambar — semuanya punya judul di layar`)
