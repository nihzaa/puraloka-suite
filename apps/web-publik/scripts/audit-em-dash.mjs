#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// PENJAGA: nol em-dash (—) dan en-dash (–) di situs publik.
// ════════════════════════════════════════════════════════════════════════════
//
// ── Kenapa
//
// Em-dash adalah tanda tangan tulisan mesin, dan tiga dari sekian kalimat di
// situs ini memakainya (diukur 2026-08-08):
//
//     hero.sub     "...bisa disebut namanya — dan kliennya memesan lagi."
//     legal.sub    "Bukan daftar layanan — daftar izin yang sudah terbit."
//     meta.judul   "Puraloka Persada — Kontraktor pabrik, gudang..."
//
// Bukan soal selera tipografi. Situs ini menjual kredibilitas kontraktor yang
// benar-benar membangun pabrik; kalimat yang berbunyi seperti keluaran mesin
// merusak persis hal yang sedang dijualnya.
//
// Yang ditulis ulang bukan sekadar diganti hubung: "Bukan daftar layanan,
// melainkan daftar izin yang sudah terbit" menyampaikan hal yang sama tanpa
// jeda panjang yang dibuat-buat.
//
// ── Kenapa memeriksa BASIS, bukan hanya berkas
//
// Seluruh teks situs tinggal di `situs_konten`, dan bisa disunting lewat
// `/pengaturan/situs` tanpa deploy. Penjaga yang hanya membaca `.tsx` akan
// hijau selamanya sementara kalimatnya berubah di belakangnya.
//
// Butuh koneksi basis. Di CI tanpa DB, ia melewati pemeriksaan basis dengan
// pesan yang jelas — bukan diam-diam lulus.
//
// Jalankan: node apps/web-publik/scripts/audit-em-dash.mjs
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const REPO = join(AKAR, '..', '..')

const DASH = /[–—]/

// ── 1. Berkas sumber ────────────────────────────────────────────────────────
function berkasTsx(dir) {
  if (!existsSync(dir)) return []
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkasTsx(p))
    else if (/\.(tsx|ts)$/.test(e.name) && !e.name.includes('.test.')) hasil.push(p)
  }
  return hasil
}

/**
 * Buang komentar sebelum memeriksa.
 *
 * Percobaan pertama hanya membuang baris yang DIAWALI `//`, `*`, atau `/*` —
 * dan langsung salah menuduh empat komentar: komentar JSX (`{/* ... *​/}`)
 * yang membentang beberapa baris, dan komentar blok yang barisnya tak diawali
 * bintang. Empat tuduhan palsu dari lima temuan; penjaga sebusuk itu akan
 * diabaikan pada pemakaian kedua.
 *
 * Yang dijaga adalah teks yang SAMPAI KE LAYAR, bukan alasan di baliknya.
 * Komentar justru sering perlu mengutip karakter yang dilarangnya.
 */
function tanpaKomentar(isi) {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, (blok) => blok.replace(/[^\n]/g, ' ')) // blok, nomor baris dijaga
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, d) => d)                        // baris, bukan URL https://
}

const pelanggarBerkas = []
for (const f of [...berkasTsx(join(AKAR, 'app')), ...berkasTsx(join(AKAR, 'components'))]) {
  tanpaKomentar(readFileSync(f, 'utf8')).split(/\r?\n/).forEach((baris, i) => {
    if (DASH.test(baris)) {
      pelanggarBerkas.push(`${f.replace(REPO, '').replace(/\\/g, '/')}:${i + 1}  ${baris.trim().slice(0, 80)}`)
    }
  })
}

console.log('\n══ Em-dash di situs publik ════════════════════════════════════')
console.log(`  berkas melanggar : ${pelanggarBerkas.length}`)

// ── 2. Basis ────────────────────────────────────────────────────────────────
let pelanggarDb = []
let dbTerperiksa = false
try {
  const { buatClient } = await import(
    new URL('../../../scripts/db/_koneksi.mjs', import.meta.url).href)
  const c = buatClient()
  await c.connect()

  // SELURUH tabel `situs_*`, ditemukan sendiri — bukan daftar tulis tangan.
  //
  // Versi pertama hanya memeriksa `situs_konten`, dan melaporkan HIJAU
  // sementara tiga em-dash tampil di layar dari `situs_milestone`. Diukur:
  // 26 baris melanggar tersebar di `situs_kategori`, `situs_media`, dan
  // `situs_milestone` — tiga dari tujuh tabel yang tak pernah dilihat.
  //
  // Daftar tabel yang ditulis tangan akan tertinggal begitu tabel kedelapan
  // ditambahkan, dan yang tertinggal tak akan berbunyi. Katalog Postgres
  // sudah tahu tabel apa saja yang ada; tinggal ditanya.
  // `string_agg`, bukan `array_agg`: driver ini mengembalikan array Postgres
  // sebagai STRING (`{a,b,c}`), dan `.filter` atas string melempar
  // `kolom.filter is not a function`. Galat itu tertangkap `catch` di bawah,
  // yang lalu mencetak "DB DILEWATI" dan **keluar 0** — penjaga hijau yang
  // tak memeriksa apa pun. Persis bahaya yang komentar di bawah peringatkan.
  const { rows: tabel } = await c.query(`
    SELECT c.relname AS tabel,
           string_agg(a.attname, ',' ORDER BY a.attnum) AS kolom
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      JOIN pg_type t ON t.oid = a.atttypid
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname LIKE 'situs\\_%'
       AND t.typname IN ('text', 'varchar', 'jsonb')
     GROUP BY c.relname
     ORDER BY c.relname`)

  for (const { tabel: tb, kolom } of tabel) {
    // `path_storage` DIKECUALIKAN: itu jalur berkas di Storage, bukan teks
    // yang dibaca orang. Nama berkas foto tak pernah sampai ke layar.
    const dipakai = String(kolom).split(",").filter((k) => k !== "path_storage")
    if (!dipakai.length) continue

    const syarat = dipakai.map((k) => `COALESCE("${k}"::text, '') ~ '[–—]'`).join(' OR ')
    const pilih = dipakai.map((k) => `"${k}"::text`).join(` || ' | ' || `)
    const { rows } = await c.query(
      `SELECT ${pilih} AS v FROM "${tb}" WHERE ${syarat} LIMIT 20`)
    for (const r of rows) pelanggarDb.push(`${tb}  ${String(r.v).slice(0, 90)}`)
  }

  await c.end()
  dbTerperiksa = true
  console.log(`  konten DB melanggar: ${pelanggarDb.length}`)
} catch (e) {
  // DINYATAKAN, bukan ditelan. Penjaga yang diam-diam melewati separuh
  // pemeriksaannya lebih berbahaya daripada penjaga yang tak ada.
  console.log(`  konten DB          : DILEWATI (${String(e.message).slice(0, 60)})`)
}

const semua = [...pelanggarBerkas, ...pelanggarDb]
if (semua.length) {
  console.error(`\n❌ MERAH — ${semua.length} tempat memakai em/en-dash:\n`)
  for (const p of semua) console.error(`     ${p}`)
  console.error('')
  console.error('   Ganti dengan tanda baca yang menyampaikan hal yang sama:')
  console.error('     · dua kalimat dengan titik')
  console.error('     · koma, atau "melainkan" / "yaitu" / "sedangkan"')
  console.error('     · titik dua bila yang menyusul adalah penjelasan')
  console.error('     · tanda hubung biasa (-) untuk rentang angka & tahun')
  console.error('')
  process.exit(1)
}

console.log(`\n✅ Nol em/en-dash${dbTerperiksa ? ' (berkas + konten DB)' : ' di berkas; DB dilewati'}.\n`)
process.exit(0)
