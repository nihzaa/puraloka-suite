#!/usr/bin/env node
/**
 * Penjaga atas DAFTAR-LEWAT milik `jalankan-semua-penjaga.mjs`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DAFTAR ITU BUTUH PENJAGANYA SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `BUTUH_CI` melewati penjaga yang mustahil dijalankan di luar CI. Itu benar
 * dan berguna — tetapi dibuktikan lewat mutasi 2026-08-31 bahwa mekanismenya
 * BISA MENYEMBUNYIKAN KEGAGALAN NYATA:
 *
 *     penjaga dirusak (process.exit(1)) + namanya ditambahkan ke BUTUH_CI
 *       → hijau 197 → 196, MERAH tetap, dan kegagalannya muncul sebagai
 *         "dilewati" alih-alih "❌"
 *
 * Tak ada satu pun galat. Yang hilang cuma satu baris hijau — angka yang tak
 * ada yang hafal.
 *
 * Jadi daftar itu adalah pintu belakang: siapa pun (termasuk saya, di sesi
 * mendatang, dengan niat baik "penjaga ini rewel di laptop") bisa mematikan
 * penjaga secara permanen dengan satu baris yang terbaca seperti perapian.
 *
 * ── Yang diperiksa di sini
 *
 * Tiap entri BUTUH_CI wajib benar-benar mustahil lokal, dan itu DIUKUR, bukan
 * dipercaya dari komentarnya: skripnya dijalankan, lalu galatnya dicocokkan
 * dengan pola "hilangnya lingkungan" (env CI, berkas artefak, koneksi CI).
 *
 * Penjaga yang MERAH karena kodenya sungguh melanggar akan gagal dengan pesan
 * yang berbeda — dan pesan itulah yang membedakan "tak bisa dijalankan" dari
 * "dijalankan lalu menemukan cacat".
 *
 * Ambang NOL: satu entri yang ternyata bisa jalan lokal berarti daftar itu
 * sedang menutupi sesuatu.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const RUNNER = join(DIR, 'jalankan-semua-penjaga.mjs')

// Galat yang SAH untuk masuk daftar: lingkungannya yang hilang, bukan kodenya
// yang melanggar. Sengaja spesifik — "Error" saja akan meloloskan apa pun.
const POLA_LINGKUNGAN = [
  /CI_DIRECT_URL/i,
  /coverage-summary\.json/i,
  /coverage-shards/i,
  /coverage.*tidak ada/i,
  /mode tak dikenal/i, // schema-fingerprint tanpa argumen CI
  /*
    `FP_URL tidak di-set dan DIRECT_URL tak ditemukan` — ditambahkan 2026-08-31.

    Ini SAH sebagai "lingkungan hilang", dan buktinya bisa diukur dua arah:

      lokal  : `schema-fingerprint.mjs compare ...` JALAN sampai selesai,
               karena ia jatuh ke `DIRECT_URL` dari apps/api/.env
               (=== TOTAL DRIFT public-schema: 161 ===)
      CI     : runner penjaga tak punya apps/api/.env, dan `FP_URL` hanya
               diberikan ke langkah ci.yml-nya sendiri — bukan ke runner ini

    Jadi yang hilang memang LINGKUNGAN (berkas .env + rahasia CI), bukan
    kode yang melanggar. Tanpa pola ini penjaga menuduh entri yang jujur,
    dan tuduhan palsu melatih orang mengabaikan laporannya — persis lawan
    dari tujuan penjaga ini.
  */
  /FP_URL tidak di-set/i,
  /ENOENT/,
  /ECONNREFUSED/,
  /getaddrinfo/,
]

const sumber = readFileSync(RUNNER, 'utf8')
const blok = sumber.match(/const BUTUH_CI = new Map\(\[([\s\S]*?)\]\)/)
if (!blok) {
  console.error('❌ BUTUH_CI tak ditemukan di jalankan-semua-penjaga.mjs.')
  console.error('   Kalau daftarnya sengaja dihapus, hapus penjaga ini juga —')
  console.error('   penjaga yang menjaga sesuatu yang tak ada akan diabaikan.')
  process.exit(1)
}

const entri = [...blok[1].matchAll(/\[\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
if (entri.length === 0) {
  console.log('✅ BUTUH_CI kosong — tak ada yang dilewati.')
  process.exit(0)
}

console.log(`\n══ Daftar-lewat jujur: ${entri.length} entri diuji ═══════════\n`)

const AKAR = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: DIR,
  encoding: 'utf8',
}).trim()

const pelanggar = []

for (const skrip of entri) {
  // Argumen diambil dari CI supaya skrip yang memang butuh argumen (mis.
  // schema-fingerprint `compare <baseline>`) diuji sebagaimana CI menjalankannya.
  let argv = []
  try {
    const ci = readFileSync(join(AKAR, '.github/workflows/ci.yml'), 'utf8')
    const m = ci.match(new RegExp(`node\s+${skrip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\n]*)`))
    if (m) argv = (m[1] ?? '').trim().split(/\s+/).filter(Boolean)
  } catch {
    // CI tak terbaca bukan alasan melewati pemeriksaan — skrip tetap diuji
    // tanpa argumen, dan hasilnya tetap dinilai.
  }

  let keluaran = ''
  let kode = 0
  try {
    execFileSync('node', [skrip, ...argv], {
      cwd: join(AKAR, 'apps/api'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    })
  } catch (galat) {
    kode = galat.status ?? 1
    keluaran = `${galat.stdout ?? ''}${galat.stderr ?? ''}`
  }

  if (kode === 0) {
    // Jalan MULUS di laptop = tak ada alasan melewatinya.
    pelanggar.push({ skrip, sebab: 'LULUS di luar CI — tak ada alasan dilewati' })
    console.log(`❌ ${skrip}\n     lulus lokal (exit 0)\n`)
    continue
  }

  const cocok = POLA_LINGKUNGAN.some((p) => p.test(keluaran))
  if (!cocok) {
    pelanggar.push({
      skrip,
      sebab: 'gagal karena SESUATU YANG LAIN, bukan lingkungan yang hilang',
    })
    console.log(`❌ ${skrip}\n     gagal, tapi bukan karena lingkungan:`)
    console.log(
      keluaran
        .split('\n')
        .filter((b) => b.trim())
        .slice(0, 4)
        .map((b) => `       ${b.trim().slice(0, 110)}`)
        .join('\n') || '       (tanpa keluaran)'
    )
    console.log()
    continue
  }

  console.log(`✅ ${skrip}\n     terbukti butuh lingkungan CI\n`)
}

if (pelanggar.length) {
  console.error(`❌ ${pelanggar.length} entri BUTUH_CI tak terbukti.\n`)
  for (const p of pelanggar) console.error(`   ${p.skrip}\n     ${p.sebab}`)
  console.error(
    '\n   Daftar ini melewati penjaga TANPA menjalankannya. Entri yang tak\n' +
      '   terbukti mustahil-lokal berarti ada penjaga yang dimatikan diam-diam.\n' +
      '   Keluarkan dari daftar, atau perbaiki penyebab kegagalannya.\n'
  )
  process.exit(1)
}

console.log(`✅ Semua ${entri.length} entri terbukti butuh lingkungan CI.\n`)
