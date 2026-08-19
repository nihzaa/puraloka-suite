#!/usr/bin/env node
// ============================================================================
// KLAIM "sudah ada layarnya" di peta-menu WAJIB terbukti di kode halamannya.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Ditemukan 2026-08-19. Entri `crm-boq` di `lib/peta-menu.ts` berbunyi:
//
//     status: 'hidup'
//     "SELESAI 2026-08-16 — celah terakhirnya ditutup migrasi 431 + tab
//      'Take-off Volume' … layarnya menampilkan RANTAI perhitungannya"
//
// Migrasinya ADA. Endpoint-nya ADA. **Tab itu tidak pernah dibangun.** Diukur:
// `/estimasi/rab` memuat NOL rujukan takeoff, dan pencarian di seluruh
// `apps/web` hanya menemukan satu penyebutan — di peta-menu itu sendiri.
//
// Akibatnya bukan sekadar dokumen yang keliru: seluruh take-off dimensional
// hanya terjangkau lewat API, jadi estimator tetap mengetik volume langsung ke
// RAB — persis masalah yang hendak diselesaikan migrasi 431.
//
// Ini kelas cacat yang sama dengan tujuh sub-menu yang pernah ditandai 🔴
// padahal UI-nya sudah hidup berbulan-bulan (F5-1 §3a), hanya BERLAWANAN ARAH:
// di sana dokumen mengingkari layar yang ada, di sini dokumen mengklaim layar
// yang tak ada. Arah yang kedua lebih berbahaya — yang membacanya menyilang
// pekerjaan itu dari daftar dan tak pernah kembali.
//
// `audit-taksonomi-vs-kode.mjs` tak menangkapnya karena ia memeriksa TABEL:
// tabelnya memang ada, jadi klaimnya lolos.
//
// ── Cara memutuskannya
//
// Bukan dengan daftar kata terlarang (daftar begitu ikut membusuk). Yang
// dipakai: catatan yang menyebut sebuah LAYAR/TAB dengan namanya harus punya
// jejak nama itu di berkas halaman yang ditunjuk `href`-nya.
//
// Sengaja LONGGAR — hanya pola yang benar-benar menjanjikan layar
// ("tab X", "layarnya di Y") yang diperiksa, dan pencocokannya per KATA, bukan
// frasa utuh. Penjaga yang terlalu ketat pada teks bebas akan merah karena
// kalimat yang benar, lalu dimatikan orang.
//
// Ambang RATCHET, bukan nol: catatan lama di repo ini panjang-panjang dan
// sebagian menyebut layar dengan penamaan yang tak persis. Yang dijaga adalah
// klaim BARU tidak bertambah.
// ============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = process.cwd()
const PETA = join(AKAR, 'lib', 'peta-menu.ts')
const APP = join(AKAR, 'app')

/**
 * Ambang ratchet. Angka hari ini adalah LANTAI — menaikkannya butuh alasan
 * tertulis, karena tiap kenaikan berarti satu klaim layar yang tak terbukti.
 */
const AMBANG = 0

const isi = readFileSync(PETA, 'utf8')

/*
  Entri diurai dengan regex, bukan diimpor. Berkas ini TypeScript ber-tipe dan
  mengimpornya dari skrip Node biasa menuntut transpile — pola yang sama dengan
  `audit-jenis-struktur-cocok` yang membaca konstanta dari teks.
*/
const entri = [...isi.matchAll(
  /\{\s*key:\s*'([^']+)'[^}]*?href:\s*'([^']+)'[^}]*?\}/g,
)].map((m) => ({ key: m[1], href: m[2], teks: m[0] }))

/*
  Pola yang dianggap MENJANJIKAN LAYAR. Sengaja sedikit: hanya kalimat yang
  menyebut sebuah tab/layar dengan namanya. "endpoint-nya ada", "migrasi 431",
  "rutenya ada" TIDAK termasuk — itu klaim tentang backend, dan benar adanya.
*/
const POLA_JANJI = [
  /tab\s+["'“”]([^"'“”]{3,40})["'“”]/gi,
]

/*
  Pola yang menunjuk halaman LAIN, bukan halaman ber-href entri itu.

  Dipisahkan karena cara memeriksanya berbeda: yang dijanjikan adalah
  KEBERADAAN halaman itu, bukan sebuah tab di dalam halaman ini. Versi pertama
  menyatukan keduanya dan langsung memulangkan positif palsu — `md-resource`
  berbunyi "layarnya di /gudang/susut", halaman itu ADA, tetapi penjaganya
  mencari kata "gudang" dan "susut" di dalam `/master/ahsp`.

  Positif palsu pada penjaga dokumen sangat mahal: yang membacanya berhenti
  memercayai seluruh keluarannya, lalu mematikannya.
*/
const POLA_RUJUK_HALAMAN = [
  /layarnya di\s+(\/[\w/-]{2,60})/gi,
]

/** Kata yang terlalu umum untuk membuktikan apa pun. */
const KATA_UMUM = new Set([
  'tab', 'layar', 'halaman', 'volume', 'data', 'daftar', 'menu', 'baru',
  'lama', 'total', 'detail', 'ada', 'dan', 'yang', 'untuk', 'dari', 'di',
])

/** Semua berkas page.tsx yang mungkin cocok dengan sebuah href. */
function berkasUntukHref(href) {
  const bersih = href.split('?')[0].replace(/^\//, '')
  if (!bersih) return []
  const kandidat = [
    join(APP, '(dashboard)', bersih, 'page.tsx'),
    join(APP, bersih, 'page.tsx'),
  ]
  return kandidat.filter((f) => existsSync(f))
}

const temuan = []

for (const e of entri) {
  /*
    Rujukan ke halaman lain diperiksa lebih dulu, dan cukup dengan menanyakan
    apakah halamannya ADA — itu persis yang dijanjikan kalimatnya.
  */
  for (const pola of POLA_RUJUK_HALAMAN) {
    for (const m of e.teks.matchAll(pola)) {
      const tujuan = m[1].trim().replace(/[.,;)]+$/, '')
      if (!berkasUntukHref(tujuan).length) {
        temuan.push({
          key: e.key, href: e.href, janji: `layarnya di ${tujuan}`,
          kata: `(halaman ${tujuan} tidak ada)`,
        })
      }
    }
  }

  const janji = []
  for (const pola of POLA_JANJI) {
    for (const m of e.teks.matchAll(pola)) janji.push(m[1].trim())
  }
  if (!janji.length) continue

  const berkas = berkasUntukHref(e.href)
  if (!berkas.length) {
    /*
      href yang tak menunjuk halaman mana pun sudah dijaga `audit-nav-yatim`.
      Dilewati di sini supaya satu cacat tak dilaporkan dua penjaga dengan
      kalimat berbeda — yang membacanya lalu mengira ada dua masalah.
    */
    continue
  }

  const isiHalaman = berkas.map((f) => readFileSync(f, 'utf8')).join('\n').toLowerCase()

  for (const j of janji) {
    const kata = j.toLowerCase().split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !KATA_UMUM.has(w))
    if (!kata.length) continue          // tak ada kata yang cukup khas
    const cocok = kata.filter((w) => isiHalaman.includes(w))
    /*
      Cukup SATU kata khas yang cocok. Penjaga yang menuntut seluruh kata akan
      merah karena penamaan yang wajar ("tab Take-off Volume" vs judul
      "Take-off dimensional"), dan penjaga yang merah karena hal benar akan
      dimatikan orang.
    */
    if (!cocok.length) {
      temuan.push({ key: e.key, href: e.href, janji: j, kata: kata.join(', ') })
    }
  }
}

console.log('══ Klaim layar di peta-menu vs kode halamannya ══════════════')
console.log(`  entri ber-href      : ${entri.length}`)
console.log(`  klaim tak terbukti  : ${temuan.length}`)
console.log(`  ambang (ratchet)    : ${AMBANG}`)

if (temuan.length > AMBANG) {
  console.log('')
  console.error('❌ Catatan menjanjikan LAYAR yang tak ada jejaknya di halamannya:')
  console.error('')
  for (const t of temuan) {
    console.error(`     ${t.key}  →  ${t.href}`)
    console.error(`       menjanjikan : "${t.janji}"`)
    console.error(`       dicari kata : ${t.kata}  → tak satu pun ada di halaman`)
    console.error('')
  }
  console.error('   Dokumen yang mengklaim layar yang tak ada LEBIH BERBAHAYA')
  console.error('   daripada dokumen yang mengingkari layar yang ada: yang')
  console.error('   membacanya menyilang pekerjaan itu dari daftar dan tak')
  console.error('   pernah kembali.')
  console.error('')
  console.error('   Perbaikan: bangun layarnya, ATAU koreksi catatannya dan')
  console.error("   turunkan statusnya ke 'sebagian'.")
  process.exit(1)
}

console.log('')
console.log('✅ Tiap klaim layar di peta-menu punya jejak di halaman yang ditunjuknya')
