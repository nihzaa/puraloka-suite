#!/usr/bin/env node
// ============================================================================
// Daftar jenis elemen struktur di KODE wajib sama dengan CHECK di BASIS.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Jenis elemen didefinisikan di DUA tempat yang harus sama:
//
//   basis  CHECK `struktur_elemen_jenis_check` (migrasi 458 + 463)
//   kode   konstanta `JENIS` di `routes/v1/struktur.ts`
//
// Kalau berbeda, kegagalannya berbeda arah dan keduanya menyesatkan:
//
//   ada di KODE, tak ada di BASIS
//     → rute menerima, basis menolak dengan pesan constraint MENTAH
//       ("violates check constraint"). Pengguna melihat galat yang tak
//       menyebut jenis apa yang salah, dan estimator menyimpulkan
//       aplikasinya rusak.
//
//   ada di BASIS, tak ada di KODE
//     → rute menolak dengan "jenis harus salah satu dari: …" padahal
//       barisnya SAH dan bisa disimpan lewat SQL. Jenis itu jadi tak
//       terjangkau siapa pun lewat aplikasi, tanpa satu pun galat.
//
// Kelas cacat yang sama dengan `audit-izin-benar-ada`: dua daftar yang harus
// sama, disimpan di dua tempat, tanpa apa pun yang memaksanya.
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

const BERKAS_RUTE = join(process.cwd(), 'src', 'routes', 'v1', 'struktur.ts')

/** Baca konstanta `JENIS` dari berkas rute. */
function jenisDariKode() {
  const isi = readFileSync(BERKAS_RUTE, 'utf8')
  const m = isi.match(/const JENIS = \[([\s\S]*?)\] as const/)
  if (!m) throw new Error(`Konstanta JENIS tak ditemukan di ${BERKAS_RUTE}`)
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
}

/** Baca daftar jenis dari CHECK constraint di basis. */
async function jenisDariBasis() {
  const c = new Client({ connectionString: DB })
  await c.connect()
  try {
    const { rows } = await c.query(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
        WHERE conrelid = 'struktur_elemen'::regclass
          AND conname = 'struktur_elemen_jenis_check'`,
    )
    if (!rows.length) throw new Error('CHECK struktur_elemen_jenis_check tak ada di basis')
    return [...rows[0].d.matchAll(/'([a-z_]+)'::text/g)].map((x) => x[1])
  } finally {
    await c.end()
  }
}

/*
  DILEWATI bila basis tak terjangkau — mengikuti pola `audit-izin-benar-ada`.

  Penjaga yang MATI karena lingkungan tak lengkap menyembunyikan temuan
  sebenarnya: pesannya berbunyi "DIRECT_URL tak diset", dan yang membacanya
  menyimpulkan penjaganya rusak alih-alih melihat bahwa ia tak pernah
  dijalankan. Dilewati dengan pesan yang jelas lebih jujur daripada merah
  karena alasan yang salah.
*/
/*
  ⚠ Kredensial dibaca dari `.env` JUGA, bukan `process.env` saja.

  Diukur 2026-09-04: SEBELAS penjaga di direktori ini melewati DIRINYA SENDIRI
  di mesin yang jelas punya basis — mereka menanyakan `process.env`, sementara
  kredensial repo ini tinggal di `apps/api/.env`.

  Akibatnya "223 penjaga hijau" memuat sebelas yang tak pernah memeriksa apa
  pun. Penjaga berambang NOL yang selalu dilewati memberi rasa aman yang
  salah — lebih buruk daripada tak ada penjaga.

  `bacaEnv()` membaca sumber yang SAMA dengan `buatClient()`.
*/
const { bacaEnv: _bacaEnv } = await import('../../../scripts/db/_koneksi.mjs')
const _envBerkas = _bacaEnv()
const DB =
  process.env.DATABASE_URL || process.env.DIRECT_URL
  || _envBerkas.DATABASE_URL || _envBerkas.DIRECT_URL
if (!DB) {
  console.log('══ Jenis elemen struktur: KODE vs BASIS ════════════════════')
  console.log('  ⏭  DILEWATI — tak ada DATABASE_URL / DIRECT_URL')
  process.exit(0)
}

const kode = jenisDariKode().sort()
const basis = (await jenisDariBasis()).sort()

const hanyaKode = kode.filter((j) => !basis.includes(j))
const hanyaBasis = basis.filter((j) => !kode.includes(j))

console.log('══ Jenis elemen struktur: KODE vs BASIS ════════════════════')
console.log(`  di kode  : ${kode.length}`)
console.log(`  di basis : ${basis.length}`)
console.log(`  selisih  : ${hanyaKode.length + hanyaBasis.length}`)
console.log('  ambang   : 0 (bukan ratchet)')

if (hanyaKode.length || hanyaBasis.length) {
  console.log('')
  if (hanyaKode.length) {
    console.error('❌ Ada di KODE tetapi TIDAK di basis:')
    for (const j of hanyaKode) console.error(`     ${j}`)
    console.error('   → rute menerimanya, basis menolak dengan pesan constraint')
    console.error('     MENTAH yang tak menyebut jenis apa yang salah.')
  }
  if (hanyaBasis.length) {
    console.error('❌ Ada di BASIS tetapi TIDAK di kode:')
    for (const j of hanyaBasis) console.error(`     ${j}`)
    console.error('   → barisnya SAH tetapi tak terjangkau lewat aplikasi,')
    console.error('     tanpa satu pun galat yang menunjuk sebabnya.')
  }
  console.error('')
  console.error(`   Perbaikan: samakan konstanta JENIS di ${BERKAS_RUTE}`)
  console.error('   dengan CHECK struktur_elemen_jenis_check lewat migrasi maju.')
  process.exit(1)
}

console.log('')
console.log(`✅ ${kode.length} jenis elemen — kode dan basis cocok`)
