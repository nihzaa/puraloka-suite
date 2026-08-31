#!/usr/bin/env node
// ============================================================================
// Daftar SEKTOR take-off di KODE wajib sama dengan CHECK di BASIS.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Sektor didefinisikan di DUA tempat yang harus sama:
//
//   basis  CHECK `takeoff_sektor_sah` (migrasi 465)
//   kode   konstanta `SEKTOR_SAH` di `lib/takeoff-sektor.ts`
//
// Kalau berbeda, kegagalannya berbeda arah dan keduanya menyesatkan:
//
//   ada di KODE, tak ada di BASIS
//     → rute menerima dan menghitung volumenya, basis menolak dengan pesan
//       constraint MENTAH. Estimator yang sudah mengisi seluruh dimensinya
//       melihat galat yang tak menyebut sektor apa yang salah.
//
//   ada di BASIS, tak ada di KODE
//     → barisnya SAH dan bisa disimpan lewat SQL, tetapi rute menolaknya
//       dengan "sektor tak dikenal". Sektor itu jadi tak terjangkau siapa pun
//       lewat aplikasi, tanpa satu pun galat yang menunjuk sebabnya.
//
// Kelas cacat yang sama dengan `audit-jenis-struktur-cocok` dan
// `audit-izin-benar-ada`: dua daftar yang harus sama, disimpan di dua tempat,
// tanpa apa pun yang memaksanya.
//
// ── Kenapa membaca BASIS, bukan berkas migrasi
//
// Migrasi bisa gagal separuh jalan, atau belum dijalankan di lingkungan ini.
// Yang menentukan perilaku adalah CHECK yang BENAR-BENAR terpasang — dan itu
// hanya bisa dibaca dari basisnya.
// ============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const BERKAS_LIB = join(process.cwd(), 'src', 'lib', 'takeoff-sektor.ts')

/** Baca konstanta `SEKTOR_SAH` dari berkas lib. */
function sektorDariKode() {
  const isi = readFileSync(BERKAS_LIB, 'utf8')
  const m = isi.match(/const SEKTOR_SAH: readonly Sektor\[\] = \[([\s\S]*?)\]/)
  if (!m) throw new Error(`Konstanta SEKTOR_SAH tak ditemukan di ${BERKAS_LIB}`)
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
}

/** Baca daftar sektor dari CHECK constraint di basis. */
async function sektorDariBasis(db) {
  const c = new Client({ connectionString: db })
  await c.connect()
  try {
    const { rows } = await c.query(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
        WHERE conrelid = 'takeoff_dimensi'::regclass
          AND conname = 'takeoff_sektor_sah'`,
    )
    if (!rows.length) throw new Error('CHECK takeoff_sektor_sah tak ada di basis')
    return [...rows[0].d.matchAll(/'([a-z_]+)'::text/g)].map((x) => x[1])
  } finally {
    await c.end()
  }
}

/*
  DILEWATI bila basis tak terjangkau — mengikuti pola `audit-izin-benar-ada`.

  Penjaga yang MATI karena lingkungan tak lengkap menyembunyikan temuan
  sebenarnya: pesannya berbunyi "DIRECT_URL tak diset", dan yang membacanya
  menyimpulkan penjaganya rusak alih-alih melihat bahwa ia tak pernah berjalan.
*/
const DB = process.env.DATABASE_URL || process.env.DIRECT_URL
if (!DB) {
  console.log('══ Sektor take-off: KODE vs BASIS ══════════════════════════')
  console.log('  ⏭  DILEWATI — tak ada DATABASE_URL / DIRECT_URL')
  process.exit(0)
}

const kode = sektorDariKode().sort()
const basis = (await sektorDariBasis(DB)).sort()

const hanyaKode = kode.filter((j) => !basis.includes(j))
const hanyaBasis = basis.filter((j) => !kode.includes(j))

console.log('══ Sektor take-off: KODE vs BASIS ══════════════════════════')
console.log(`  di kode  : ${kode.length}`)
console.log(`  di basis : ${basis.length}`)
console.log(`  selisih  : ${hanyaKode.length + hanyaBasis.length}`)
console.log('  ambang   : 0 (bukan ratchet)')

if (hanyaKode.length || hanyaBasis.length) {
  console.log('')
  if (hanyaKode.length) {
    console.error('❌ Ada di KODE tetapi TIDAK di basis:')
    for (const j of hanyaKode) console.error(`     ${j}`)
    console.error('   → rute menghitung volumenya, basis menolak dengan pesan')
    console.error('     constraint MENTAH yang tak menyebut sektor apa yang salah.')
  }
  if (hanyaBasis.length) {
    console.error('❌ Ada di BASIS tetapi TIDAK di kode:')
    for (const j of hanyaBasis) console.error(`     ${j}`)
    console.error('   → barisnya SAH tetapi rute menolaknya "sektor tak dikenal",')
    console.error('     jadi tak terjangkau siapa pun lewat aplikasi.')
  }
  console.error('')
  console.error(`   Perbaikan: samakan SEKTOR_SAH di ${BERKAS_LIB}`)
  console.error('   dengan CHECK takeoff_sektor_sah lewat migrasi maju.')
  process.exit(1)
}

/*
  Setiap sektor juga wajib punya SATUAN dan cabang perhitungan.

  Sektor yang terdaftar tetapi tak punya cabang di `hitungBarisSektor` lolos
  typecheck (switch tanpa `default` pada union yang lengkap tetap sah bila
  cabangnya dihapus belakangan) dan melempar di jalan — pada layar estimator,
  sesudah ia mengisi seluruh dimensinya.
*/
const isiLib = readFileSync(BERKAS_LIB, 'utf8')
/*
  Menerima kutip TUNGGAL maupun GANDA — diperbaiki 2026-08-31.

  Versi sebelumnya hanya mengenali `nama: '`. Satuan bored pile adalah
  m-aksen (meter panjang, notasi resmi AHSP), dan apostrof di dalamnya
  MEMAKSA kutip ganda di TypeScript.

  Akibatnya penjaga melapor "Sektor tanpa satuan: bored_pile" untuk satuan
  yang JELAS-JELAS ada di berkasnya — temuan palsu yang menuduh kode benar,
  dan menuntun ke perbaikan yang justru merusak: mengganti satuannya jadi
  m biasa akan menyamakannya dengan kusen/pipa.
*/
const tanpaSatuan = kode.filter((s) => !new RegExp(`\\b${s}:\\s*['"]`).test(isiLib))
const tanpaCabang = kode.filter((s) => !new RegExp(`case '${s}':`).test(isiLib))

if (tanpaSatuan.length || tanpaCabang.length) {
  console.log('')
  if (tanpaSatuan.length) {
    console.error(`❌ Sektor tanpa satuan di SATUAN_SEKTOR: ${tanpaSatuan.join(', ')}`)
  }
  if (tanpaCabang.length) {
    console.error(`❌ Sektor tanpa cabang di hitungBarisSektor: ${tanpaCabang.join(', ')}`)
    console.error('   → melempar di jalan, pada layar estimator, sesudah ia')
    console.error('     mengisi seluruh dimensinya.')
  }
  process.exit(1)
}

console.log('')
console.log(`✅ ${kode.length} sektor take-off — kode dan basis cocok, semuanya punya satuan & cabang`)
