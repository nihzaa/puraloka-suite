#!/usr/bin/env node
/**
 * PENJAGA — env yang menentukan perilaku PRODUKSI wajib terdokumentasi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-19: *"saya mau nya selesai semua dulu baru persiapan
 * deploy"*. Urutan itu benar — alamat produksi adalah keputusan deploy,
 * bukan keputusan fitur.
 *
 * Tapi ia menuntut satu hal: **saat deploy tiba, tak boleh ada kejutan.**
 * Dan diukur hari itu, kejutannya sudah menunggu — delapan variabel dibaca
 * kode tetapi tak pernah disebut `.env.example`:
 *
 *   COOKIE_SECRET · RESEND_API_KEY · APP_URL · EMAIL_FROM
 *   KURS_USD_IDR · VAPID_PRIVATE_KEY · VAPID_PUBLIC_KEY · VAPID_SUBJECT
 *
 * ── Yang membuatnya berbahaya: BAWAAN YANG MASUK AKAL
 *
 * Tak satu pun dari mereka melempar saat kosong. Mereka jatuh ke bawaan yang
 * TERLIHAT benar:
 *
 *   APP_URL        → 'http://localhost:3000'
 *                    Empat tombol di surel ke KLIEN menunjuk ke komputer
 *                    penerimanya sendiri. Kliennya mengklik, tak terjadi
 *                    apa-apa, dan yang ia simpulkan adalah aplikasinya rusak.
 *
 *   RESEND_API_KEY → sendEmail() jadi no-op TANPA melempar.
 *                    Jadwal berjalan, `terakhir_dikirim` ter-update, nol
 *                    surel terkirim. Diam yang terbaca seperti berhasil.
 *
 *   COOKIE_SECRET  → jatuh ke JWT_SECRET.
 *                    Bekerja, tapi menyatukan dua rahasia yang seharusnya
 *                    bisa dirotasi sendiri-sendiri.
 *
 * Kegagalan semacam ini tak muncul di log dan tak muncul di test. Ia muncul
 * sebagai keluhan pengguna berminggu-minggu kemudian, tentang gejala yang
 * menunjuk ke tempat lain.
 *
 * ── Yang diperiksa DI SINI, dan yang TIDAK
 *
 * Penjaga ini TIDAK menuntut `.env` Anda terisi — mesin pengembang memang
 * tak perlu kunci Resend. Yang dituntut: tiap variabel produksi **disebut di
 * `.env.example`**, supaya saat deploy tiba daftarnya sudah lengkap dan tak
 * ada yang ditemukan lewat keluhan pengguna.
 *
 * Ambang NOL.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readdirSync, statSync } from 'node:fs'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTOH = join(AKAR, '.env.example')

/**
 * Variabel yang BUKAN urusan produksi — sengaja dikecualikan.
 *
 * `NODE_ENV`/`PORT`/`HOST`/`LOG_LEVEL` disetel platformnya sendiri.
 * `TEST_SCHEMA` hanya hidup saat test. `DIRECT_URL` sudah tercakup contoh
 * koneksi basis.
 */
const KECUALI = new Set([
  'NODE_ENV', 'PORT', 'HOST', 'LOG_LEVEL', 'TEST_SCHEMA',
  'OTEL_ENABLED', 'KREDENSIAL_TANPA_JATUHAN_ENV',
])

function berkasTs(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama === '__tests__') continue
    const p = join(dir, nama)
    if (statSync(p).isDirectory()) berkasTs(p, keluar)
    else if (nama.endsWith('.ts')) keluar.push(p)
  }
  return keluar
}

const dipakai = new Set()
for (const f of berkasTs(join(AKAR, 'src'))) {
  const isi = readFileSync(f, 'utf8')
  for (const m of isi.matchAll(/process\.env\.([A-Z][A-Z0-9_]{3,})/g)) {
    if (!KECUALI.has(m[1])) dipakai.add(m[1])
  }
}

let contoh = ''
try {
  contoh = readFileSync(CONTOH, 'utf8')
} catch {
  console.error('❌ apps/api/.env.example tak ada — tak ada daftar apa pun untuk deploy.')
  process.exit(1)
}

const disebut = new Set()
for (const baris of contoh.split(/\r?\n/)) {
  const m = baris.match(/^\s*#?\s*([A-Z][A-Z0-9_]{3,})\s*=/)
  if (m) disebut.add(m[1])
}

const hilang = [...dipakai].filter((v) => !disebut.has(v)).sort()

console.log('══ Env produksi terdokumentasi ════════════════════════════════')
console.log(`  dibaca kode      : ${dipakai.size}`)
console.log(`  disebut example  : ${[...dipakai].filter((v) => disebut.has(v)).length}`)
console.log(`  HILANG           : ${hilang.length} (ambang 0)`)

if (hilang.length > 0) {
  console.error('\n❌ Dibaca kode tapi tak pernah disebut .env.example:')
  for (const v of hilang) console.error(`     ${v}`)
  console.error('\n   Tambahkan ke apps/api/.env.example — boleh dikomentari (#) dan')
  console.error('   boleh kosong nilainya. Yang penting NAMANYA ADA, supaya saat')
  console.error('   deploy tiba daftarnya lengkap.')
  console.error('\n   Kenapa ini ditegakkan: variabel yang hilang tidak melempar. Ia')
  console.error('   jatuh ke bawaan yang TERLIHAT benar — APP_URL jadi localhost:3000')
  console.error('   di surel ke klien, RESEND_API_KEY kosong membuat pengiriman jadi')
  console.error('   no-op tanpa satu pun galat. Kegagalannya muncul sebagai keluhan')
  console.error('   pengguna berminggu-minggu kemudian, tentang gejala yang menunjuk')
  console.error('   ke tempat lain.')
  console.error('\n   Daftar lengkap + apa yang terjadi kalau kosong: docs/SIAP-DEPLOY.md')
  process.exit(1)
}

console.log('\n✅ Seluruh env produksi punya namanya di .env.example.')
