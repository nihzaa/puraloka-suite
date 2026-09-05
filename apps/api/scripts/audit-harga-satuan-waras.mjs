#!/usr/bin/env node
// ============================================================================
// HARGA WAJIB MASUK AKAL UNTUK SATUANNYA — Rp 370.200 per KILOGRAM pasir bukan.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Ditemukan 2026-08-19 saat menyambungkan volume struktur ke RAB. Angka yang
// keluar: **beton f'c 25 = Rp 626.849.988 per m³**. Yang benar sekitar sejuta.
//
// Sebabnya bukan di kode mana pun. Sebabnya di price book:
//
//     AHSP-R0101  "Pasir beton"   m3   Rp 370.200      ← benar
//     AHSP-R0076  "Pasir beton"   kg   Rp 370.200      ← harga m³ di baris kg
//     AHSP-R0009  "Kerikil"       m3   Rp 352.300      ← benar
//     AHSP-R0077  "Kerikil"       kg   Rp 352.300      ← angka yang sama persis
//
// Harga per m³ disalin ke baris bersatuan kg. Salahnya sekitar **1.400×**,
// dan menyebar ke **32 AHSP** — seluruh keluarga beton.
//
// ── Kenapa ini tak pernah ketahuan
//
// Tak ada satu pun yang salah secara struktural. Resource-nya ada, satuannya
// terisi, harganya angka positif, resolvernya bekerja benar, AHSP-nya
// menghitung benar. Setiap lapisan menjawab benar untuk dirinya sendiri.
//
// Yang salah cuma BESARAN — dan besaran tak punya penjaga. Sampai ada yang
// benar-benar membaca rupiah per satuannya, angka itu mengalir ke RAB, ke
// penawaran, dan ke kontrak tanpa satu pun galat.
//
// Kelas cacat yang sama dengan yang sudah tercatat di repo ini: `dihitung_pada`
// yang tak pernah basi, `tool_aktif` yang terhapus test. Bukan crash — hasil
// yang salah dengan percaya diri.
//
// ── Bagaimana penjaga ini memutuskan
//
// TIDAK memakai daftar harga wajar per bahan; daftar begitu ikut membusuk dan
// butuh perawatan. Yang dipakai: **bahan yang SAMA muncul di dua satuan dengan
// harga yang SAMA PERSIS**. Itu mustahil secara fisik — satu m³ pasir beratnya
// ~1.400 kg, jadi harga per m³ dan per kg tak mungkin bertemu di angka yang
// sama. Kalau bertemu, satu di antaranya hasil salin.
//
// Ambang NOL. Ini bukan ratchet: tiap pasangan begini adalah rupiah yang salah
// ratusan kali lipat di RAB, bukan utang teknis yang boleh dicicil.
// ============================================================================

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

/*
  DILEWATI bila basis tak terjangkau — mengikuti pola `audit-izin-benar-ada`.
  Penjaga yang MATI karena lingkungan tak lengkap menyembunyikan temuan
  sebenarnya; yang membacanya menyimpulkan penjaganya rusak.
*/
/*
  ⚠ Kredensial dibaca dari `.env` JUGA, bukan `process.env` saja.

  Diukur 2026-09-04: penjaga ini MELEWATI DIRINYA di mesin lokal yang jelas
  punya basis, dan langkah CI-nya tak diberi `DATABASE_URL` sama sekali
  (diperiksa: 0 baris env di ci.yml). Jadi ia tak pernah benar-benar memeriksa
  apa pun — hijau di mana-mana karena selalu dilewati.

  Cacat yang sama persis dengan `audit-nilai-kontrak-waras`, dan berkas INI
  yang saya jadikan contoh "pola yang benar" saat memperbaikinya. Contoh yang
  ditiru ternyata ikut rusak.

  `bacaEnv()` membaca `apps/api/.env` — sumber yang sama dengan
  `buatClient()`, dan sumber yang benar-benar dipakai di mesin pengembang.
*/
const { bacaEnv } = await import('../../../scripts/db/_koneksi.mjs')
const envBerkas = bacaEnv()
const DB =
  process.env.DATABASE_URL || process.env.DIRECT_URL
  || envBerkas.DATABASE_URL || envBerkas.DIRECT_URL
if (!DB) {
  console.log('══ Kewarasan harga vs satuan ═══════════════════════════════')
  console.log('  ⏭  DILEWATI — tak ada DATABASE_URL / DIRECT_URL')
  process.exit(0)
}

/*
  Satuan VOLUME/LUAS vs satuan MASSA. Bahan yang sama tak mungkin berharga sama
  di kedua kelompok — kecuali salah satunya hasil salin.

  `liter` sengaja TIDAK dimasukkan: 1 liter air ≈ 1 kg, jadi harga yang sama di
  kedua satuan justru masuk akal untuk cairan berdensitas ~1.
*/
const RUAH = ['m3', 'm2', 'ton', 'zak', 'sak']
const MASSA = ['kg']

/**
 * Di bawah nilai ini, harga yang kebetulan sama tidak dianggap temuan.
 *
 * Bahan murah banyak yang dibulatkan ke angka yang sama (Rp 25.000, Rp 30.000)
 * tanpa ada yang menyalin apa pun, dan salah 1.400× pada angka sekecil itu
 * tetap tak menggerakkan RAB sebesar satu baris beton. Ambangnya dipilih di
 * atas rentang itu dan jauh di bawah harga ruah yang sesungguhnya bermasalah
 * (pasir/kerikil ratusan ribu per m³).
 */
const AMBANG_SEPELE = 100_000

const c = new Client({ connectionString: DB })
await c.connect()

let temuan = []
try {
  /*
    Dicocokkan pada HARGA yang identik, bukan pada nama.

    Versi pertama mensyaratkan nama yang sama persis — dan MELEWATKAN justru
    baris yang memicu seluruh temuan ini:

        AHSP-R0101  "Pasir beton (quarry - lokasi pekerjaan)"  m3  Rp 370.200
        AHSP-R0076  "Pasir beton"                             kg  Rp 370.200
                     ^^^^^^^^^^^^ nama beda, harga sama persis

    `AHSP-R0076` itulah yang dipakai AHSP beton, dan yang membuat f'c 25
    terhitung Rp 626.849.988 per m³. Penjaga yang melewatkan kasus yang
    melahirkannya adalah hiasan.

    Nama tak bisa diandalkan karena price book ini memang menyimpan varian
    penamaan untuk bahan yang sama. Yang tak bisa kebetulan adalah HARGANYA:
    dua bahan berbeda satuan yang berharga sama sampai ke rupiah terakhir
    hampir pasti hasil salin.

    Harga di bawah AMBANG_SEPELE diabaikan — angka kecil bisa bertabrakan
    secara wajar (banyak bahan murah dibulatkan ke angka yang sama), dan
    salahnya pun tak menggerakkan RAB.
  */
  /*
    Hanya harga yang BERLAKU yang dinilai — satu entri terbaru per resource.

    Versi lama sengaja DIPERTAHANKAN di basis: `fn_price_book_immutable()`
    melarang menimpa harga yang sudah diverifikasi, karena estimasi yang
    merujuknya tak boleh berubah retroaktif. Jadi harga m³ yang salah itu masih
    ada, dan akan selamanya ada, sebagai riwayat.

    Penjaga yang membaca SELURUH entri tetap merah sesudah perbaikannya
    dijalankan — dan penjaga yang tak bisa hijau akan dimatikan orang.
  */
  const { rows } = await c.query(
    `WITH berlaku AS (
       /*
         Satu entri BERLAKU per resource. Ambang harga sengaja TIDAK dipasang
         di sini: WHERE dievaluasi SEBELUM DISTINCT ON, jadi menyaringnya
         lebih dulu membuang entri koreksi yang murah (Rp 264) dan menyisakan
         entri LAMA yang mahal (Rp 370.200) sebagai "yang berlaku" — penjaganya
         lalu tetap merah sesudah perbaikannya dijalankan.
       */
       SELECT DISTINCT ON (r.id)
              r.id, lower(btrim(r.name)) AS nama, r.code, r.unit_code, p.amount
         FROM resources r
         JOIN price_book_entries p ON p.resource_id = r.id
        WHERE p.status = 'active'
        ORDER BY r.id, p.effective_date DESC, p.version_number DESC
     ), h AS (
       SELECT * FROM berlaku WHERE amount >= $3
     )
     SELECT DISTINCT ON (b.code, a.code)
            a.nama AS nama_ruah, a.code AS kode_ruah, a.unit_code AS satuan_ruah, a.amount AS harga_ruah,
            b.nama AS nama_massa, b.code AS kode_massa, b.unit_code AS satuan_massa, b.amount AS harga_massa
       FROM h a JOIN h b ON a.amount = b.amount AND a.id <> b.id
      WHERE a.unit_code = ANY($1) AND b.unit_code = ANY($2)
      ORDER BY b.code, a.code, a.amount DESC`,
    [RUAH, MASSA, AMBANG_SEPELE],
  )

  /*
    Harga sama saja belum cukup — harus BAHAN yang sama pula.

    Tanpa saringan ini penjaganya memulangkan pasangan seperti
    `keramik 60×60 (m²)` vs `bubuk poles (kg)`: dua bahan yang tak
    berhubungan, kebetulan sama-sama Rp 180.000. Penjaga yang mencampur
    temuan nyata dengan kebetulan akan diabaikan orang — dan penjaga yang
    diabaikan sama saja tidak ada.

    Yang dipakai: kedua nama harus berbagi satu KATA INTI (≥ 4 huruf, di luar
    kata umum). `pasir beton` dan `pasir beton (quarry…)` berbagi "pasir";
    `keramik` dan `bubuk poles` tak berbagi apa pun.
  */
  const UMUM = new Set([
    'beton', 'lokasi', 'pekerjaan', 'quarry', 'bahan', 'untuk', 'dengan',
    'buah', 'ukuran', 'jenis', 'biasa', 'campuran',
  ])
  const inti = (nama) => new Set(
    nama.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !UMUM.has(w)),
  )
  temuan = rows.filter((t) => {
    const a = inti(t.nama_ruah)
    return [...inti(t.nama_massa)].some((w) => a.has(w))
  })
} finally {
  await c.end()
}

const rp = (n) => 'Rp ' + Number(n).toLocaleString('id-ID')

console.log('══ Kewarasan harga vs satuan ═══════════════════════════════')
console.log(`  pasangan harga identik lintas satuan ruah/massa : ${temuan.length}`)
console.log('  ambang : 0 (bukan ratchet)')

if (temuan.length) {
  console.log('')
  console.error('❌ Harga bahan yang sama identik di satuan RUAH dan MASSA:')
  console.error('')
  for (const t of temuan) {
    console.error(`     ${t.kode_ruah.padEnd(16)} ${t.satuan_ruah.padEnd(5)} ${rp(t.harga_ruah).padEnd(14)} ${t.nama_ruah}`)
    console.error(`     ${t.kode_massa.padEnd(16)} ${t.satuan_massa.padEnd(5)} ${rp(t.harga_massa).padEnd(14)} ${t.nama_massa}   ← besar kemungkinan salin`)
    console.error('')
  }
  console.error('')
  console.error('   Satu m³ pasir beratnya ~1.400 kg. Harga per m³ dan per kg')
  console.error('   TAK MUNGKIN bertemu di angka yang sama — salah satunya hasil')
  console.error('   salin, dan yang bersatuan kg salah sekitar 1.400×.')
  console.error('')
  console.error('   Dampaknya tak berhenti di satu baris: AHSP mana pun yang')
  console.error('   memakai bahan itu ikut salah, lalu mengalir ke RAB,')
  console.error('   penawaran, dan kontrak tanpa satu pun galat.')
  console.error('')
  console.error('   Perbaikan: koreksi harga bersatuan kg lewat migrasi maju')
  console.error('   (harga m³ ÷ densitas), atau pensiunkan resource kg-nya bila')
  console.error('   memang tak seharusnya ada.')
  process.exit(1)
}

console.log('')
console.log('✅ Tak ada harga bahan yang identik lintas satuan ruah/massa')
