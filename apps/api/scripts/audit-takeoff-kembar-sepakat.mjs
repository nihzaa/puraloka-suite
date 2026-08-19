#!/usr/bin/env node
// ============================================================================
// PENJAGA — kalkulator volume di LAYAR wajib sepakat dengan modul di API.
// ============================================================================
//
// ── Kenapa ada DUA implementasi, dan kenapa itu disengaja
//
// Rumus take-off ditulis dua kali:
//
//   apps/api/src/lib/takeoff-sektor.ts                    (sumber kebenaran)
//   apps/web/app/(dashboard)/estimasi/_bersama/
//     hitung-volume.tsx                                   (kalkulator di layar)
//
// Yang kedua BUKAN duplikasi malas. Estimator mengetik dimensi lalu ingin
// melihat volumenya SEKETIKA — memanggil API tiap ketukan tombol berarti
// layar yang tersendat, dan kalkulator yang tersendat tak dipakai orang.
//
// ── Yang berbahaya
//
// Dua implementasi rumus yang sama akan MENYIMPANG, dan penyimpangannya tak
// mengeluarkan galat: layar memperlihatkan satu angka, basis menyimpan angka
// lain, dan RAB memakai yang tersimpan. Estimator memeriksa yang di layar.
//
// Yang paling mudah menyimpang adalah AMBANG, karena ia ditulis sebagai
// angka telanjang di kedua sisi:
//
//   API  `KEMIRINGAN_MAKS_DERAJAT = 60`
//   web  `if (der > 60) return { galat: … }`
//
// Ubah salah satunya, dan layar menerima kemiringan yang ditolak basis —
// estimator mengisi seluruh dimensinya, menekan simpan, lalu melihat pesan
// constraint mentah yang tak menyebut sektor apa pun.
//
// ── Yang dijaga
//
//   1. daftar SEKTOR di kedua sisi sama persis
//   2. ambang kemiringan maksimum sama
//   3. satuan tiap sektor sama
//
// Ambang NOL. Tiap ketidaksepakatan adalah angka di layar yang berbeda dari
// angka yang masuk RAB — dan yang masuk RAB itulah yang ditawarkan ke klien.
// ============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = process.cwd()
const API = join(AKAR, 'src', 'lib', 'takeoff-sektor.ts')
const WEB = join(
  AKAR, '..', 'web', 'app', '(dashboard)', 'estimasi', '_bersama',
  'hitung-volume.tsx',
)

for (const [nama, p] of [['modul API', API], ['kalkulator web', WEB]]) {
  if (!existsSync(p)) {
    console.error(`❌ ${nama} tak ditemukan: ${p}`)
    console.error('   Jalankan dari apps/api.')
    process.exit(1)
  }
}

const isiApi = readFileSync(API, 'utf8')
const isiWeb = readFileSync(WEB, 'utf8')

const masalah = []

// ── 1. Daftar sektor ────────────────────────────────────────────────────────
const mApi = isiApi.match(/export const SEKTOR_SAH: readonly Sektor\[\] = \[([\s\S]*?)\]/)
if (!mApi) {
  console.error('❌ `SEKTOR_SAH` tak terbaca di modul API — bentuknya berubah.')
  console.error('   Perbaiki polanya, jangan matikan penjaganya.')
  process.exit(1)
}
const sektorApi = [...mApi[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()

const mWeb = isiWeb.match(/const SEKTOR = \[([\s\S]*?)\n\]/)
if (!mWeb) {
  console.error('❌ Konstanta `SEKTOR` tak terbaca di kalkulator web.')
  process.exit(1)
}
/* Entri pertama sengaja bernilai kosong ("tanpa sektor"), jadi disaring. */
const sektorWeb = [...mWeb[1].matchAll(/nilai:\s*"([a-z_]*)"/g)]
  .map((m) => m[1]).filter(Boolean).sort()

for (const s of sektorApi) {
  if (!sektorWeb.includes(s)) {
    masalah.push(
      `sektor "${s}" ada di API tetapi TIDAK di kalkulator layar — `
      + 'estimator tak punya cara menghitungnya, dan sektornya hanya '
      + 'terjangkau lewat API',
    )
  }
}
for (const s of sektorWeb) {
  if (!sektorApi.includes(s)) {
    masalah.push(
      `sektor "${s}" ditawarkan layar tetapi TIDAK dikenal API — `
      + 'estimator mengisi seluruh dimensinya, lalu simpannya ditolak',
    )
  }
}

// ── 2. Ambang kemiringan ────────────────────────────────────────────────────
const mAmbangApi = isiApi.match(/KEMIRINGAN_MAKS_DERAJAT = (\d+)/)
if (!mAmbangApi) {
  console.error('❌ `KEMIRINGAN_MAKS_DERAJAT` tak terbaca di modul API.')
  process.exit(1)
}
const ambangApi = Number(mAmbangApi[1])

/*
  Di web angkanya ditulis telanjang (`der > 60`). Diambil dari perbandingan
  itu, bukan dari teks pesannya — pesan bisa saja tertinggal saat ambangnya
  diubah, dan yang menentukan perilaku adalah perbandingannya.
*/
const mAmbangWeb = isiWeb.match(/if \(der > (\d+)\)/)
if (!mAmbangWeb) {
  masalah.push(
    'batas kemiringan tak terbaca di kalkulator layar — layar mungkin '
    + 'MENERIMA kemiringan yang ditolak API',
  )
} else if (Number(mAmbangWeb[1]) !== ambangApi) {
  masalah.push(
    `batas kemiringan BERBEDA: API ${ambangApi}°, layar ${mAmbangWeb[1]}°. `
    + 'Salah satunya menerima angka yang ditolak yang lain, dan estimator '
    + 'baru tahu sesudah menekan simpan.',
  )
}

// ── 3. Satuan per sektor ────────────────────────────────────────────────────
const mSatuan = isiApi.match(/export const SATUAN_SEKTOR: Record<Sektor, string> = \{([\s\S]*?)\}/)
if (mSatuan) {
  const satuanApi = Object.fromEntries(
    [...mSatuan[1].matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
  )
  /*
    Satuan di layar muncul sebagai `satuan: "m²"` di tiap cabang. Dibandingkan
    setelah dinormalkan — API memakai `m2` (aman untuk basis & AHSP), layar
    memakai `m²` (terbaca manusia). Keduanya SAH, yang tak sah adalah beda
    DIMENSInya (m vs m² vs unit).
  */
  const norm = (u) => u.replace('²', '2').replace('³', '3').trim()
  for (const [sektor, satuan] of Object.entries(satuanApi)) {
    /*
      Cabang dicari sampai `return` PERTAMA sesudah penyebutan sektornya,
      bukan sampai `satuan:` pertama di sisa berkas.

      Versi pertama memakai `[\s\S]*?satuan:` dan langsung menuduh dua sektor
      yang BENAR: `sanitair` dan `mep_titik` berbagi satu cabang dengan
      ternary (`satuan: sektor === "sanitair" ? "unit" : "titik"`), dan
      polanya melewati ternary itu lalu menangkap `satuan: "m"` milik cabang
      BERIKUTNYA.

      Penjaga yang menuduh hal yang benar akan dimatikan orang — dan yang
      dimatikan tak lagi menjaga yang sungguhan.
    */
    const iSektor = isiWeb.indexOf(`sektor === "${sektor}"`)
    if (iSektor < 0) continue
    /* Batas cabang: `if (sektor ===` berikutnya, atau akhir fungsi. */
    const sisa = isiWeb.slice(iSektor)
    const iBatas = sisa.slice(1).search(/\n  if \(sektor ===/)
    const cabang = iBatas > 0 ? sisa.slice(0, iBatas + 1) : sisa

    /* Satuan bisa literal ATAU ternary yang menyebut sektornya. */
    const semuaSatuan = [...cabang.matchAll(/satuan:\s*([^,\n]+)/g)].map((m) => m[1])
    if (!semuaSatuan.length) continue

    const cocok = semuaSatuan.some((ekspresi) => {
      /* Ternary: cukup satuan yang benar muncul di dalamnya. */
      const literal = [...ekspresi.matchAll(/"([^"]+)"/g)].map((m) => norm(m[1]))
      return literal.includes(norm(satuan))
    })

    if (!cocok) {
      masalah.push(
        `satuan sektor "${sektor}" BERBEDA: API "${satuan}", `
        + `layar memulangkan ${semuaSatuan.map((x) => x.trim()).join(' / ')} — `
        + 'volume yang benar dengan satuan yang salah tetap menghasilkan '
        + 'harga yang salah, karena AHSP dicari dari satuannya',
      )
    }
  }
}

console.log('══ Kalkulator layar vs modul API: take-off sektor ══════════')
console.log(`  sektor di API      : ${sektorApi.length}`)
console.log(`  sektor di layar    : ${sektorWeb.length}`)
console.log(`  batas kemiringan   : ${ambangApi}°`)
console.log(`  ketidaksepakatan   : ${masalah.length}`)
console.log('  ambang             : 0 (bukan ratchet)')

if (masalah.length) {
  console.log('')
  console.error('❌ Kalkulator layar tak sepakat dengan modul API:')
  console.error('')
  for (const m of masalah) console.error(`     • ${m}`)
  console.error('')
  console.error('   Dua implementasi rumus yang sama akan menyimpang, dan')
  console.error('   penyimpangannya TAK mengeluarkan galat: layar memperlihatkan')
  console.error('   satu angka, basis menyimpan angka lain, dan RAB memakai yang')
  console.error('   tersimpan. Estimator memeriksa yang di layar.')
  process.exit(1)
}

console.log('')
console.log(`✅ ${sektorApi.length} sektor — layar dan API sepakat`)
