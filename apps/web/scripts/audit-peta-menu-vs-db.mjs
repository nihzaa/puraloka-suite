#!/usr/bin/env node
/**
 * DRIFT `peta-menu.ts` ↔ `menu_items` — dua sumber yang diam-diam berpisah.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Repo ini punya DUA sumber kebenaran untuk menu:
 *
 *   apps/web/lib/peta-menu.ts   dipakai halaman "segera hadir" `/m/<key>`
 *                               untuk menjelaskan status & rencana tiap menu
 *   tabel `menu_items`          dipakai SIDEBAR (lewat GET /api/v1/menu)
 *
 * `gen-migrasi-menu.mjs` membangkitkan migrasi dari yang pertama ke yang kedua,
 * dan header berkas itu sudah menuliskan risikonya secara harfiah:
 *
 *   "ia akan berbeda dari `peta-menu.ts` begitu salah satunya disunting, dan
 *    perbedaan itu tak akan berbunyi — sidebar memakai DB, halaman coming-soon
 *    memakai peta, jadi menu bisa muncul tanpa halaman atau sebaliknya."
 *
 * Risikonya diprediksi, generatornya ditulis, **penjaganya tidak**. Dan
 * ramalannya terbukti: pada 2026-08-07 ditemukan ~23 href berbeda, yang
 * melahirkan empat halaman lengkap tak bisa dicapai siapa pun (migrasi 220).
 *
 * ── Apa yang dibandingkan, dan apa yang sengaja TIDAK
 *
 *   href    dibandingkan — inilah yang menentukan ke mana orang mendarat
 *   label   dibandingkan — nama berbeda di dua tempat membingungkan
 *   keberadaan  dibandingkan — key di satu sisi tapi tidak di sisi lain
 *
 *   status/guna/catatan  TIDAK — itu hanya ada di peta-menu.ts, dan memang
 *                        tak punya kolom padanan di `menu_items`
 *   is_active            TIDAK — menu bisa dinonaktifkan lewat migrasi tanpa
 *                        menghapus entrinya dari peta (mis. `bi-eksekutif`
 *                        yang dipensiunkan migrasi 221 tapi tetap
 *                        terdokumentasi). Yang diperiksa hanya yang AKTIF.
 *
 * ── Ratchet, bukan nol-mutlak
 *
 * Selisih hari ini adalah LANTAI. Ia boleh turun, tak boleh naik. Menuntut nol
 * seketika akan membuat penjaga ini dimatikan pada hari pertama — dan penjaga
 * yang dimatikan tak menjaga apa pun.
 *
 * ── DB tak terhubung
 *
 * Berhenti dengan exit 0 dan MENGATAKANNYA. Penjaga yang diam-diam melewatkan
 * dirinya lebih berbahaya daripada penjaga yang absen: CI-nya tetap hijau.
 *
 * Pakai (dari akar repo): node apps/web/scripts/audit-peta-menu-vs-db.mjs
 *                         node apps/web/scripts/audit-peta-menu-vs-db.mjs --naikkan
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const LANTAI = join(AKAR, 'apps', 'web', 'scripts', 'lantai-nav.json')

// ── Sisi TS ─────────────────────────────────────────────────────────────────
//
// Dibaca sebagai TEKS, bukan diimpor. `peta-menu.ts` memakai path alias `@/`
// dan direktif "use client"; mengimpornya dari skrip Node menuntut seluruh
// rantai bundler ikut hidup — biaya besar untuk membaca daftar literal.
const src = readFileSync(join(AKAR, 'apps', 'web', 'lib', 'peta-menu.ts'), 'utf8')

const petaTs = new Map()
for (const m of src.matchAll(/\{\s*key:\s*'([a-z0-9-]+)'[^}]*?\}/g)) {
  const blok = m[0]
  const key = m[1]
  const href = blok.match(/href:\s*'([^']*)'/)?.[1] ?? null
  const label = blok.match(/label:\s*'((?:\\'|[^'])*)'/)?.[1]?.replace(/\\'/g, "'") ?? null
  petaTs.set(key, { href, label })
}

// ── Sisi DB ─────────────────────────────────────────────────────────────────
let baris
try {
  const koneksi = await import(
    'file://' + join(AKAR, 'scripts', 'db', '_koneksi.mjs').replace(/\\/g, '/'))
  const db = koneksi.buatClient('DIRECT_URL')
  await db.connect()
  const r = await db.query(
    `SELECT key, label, href FROM menu_items WHERE is_active ORDER BY key`)
  await db.end()
  baris = r.rows
} catch (e) {
  console.log('⚠️  DB tak terhubung — pemeriksaan DILEWATI, bukan dinyatakan lulus.')
  console.log(`   ${e.message.slice(0, 100)}`)
  process.exit(0)
}

const petaDb = new Map(baris.map((r) => [r.key, { href: r.href, label: r.label }]))

// ── Bandingkan ──────────────────────────────────────────────────────────────
const hrefBeda = []
const labelBeda = []
const hanyaDb = []

for (const [key, db] of petaDb) {
  const ts = petaTs.get(key)
  if (!ts) { hanyaDb.push(key); continue }
  // Kelompok induk (`g-*`) SENGAJA tanpa href di DB: ia tombol buka-tutup,
  // bukan tautan. `peta-menu.ts` memberinya href sebagai "wakil isi kelompok"
  // — dipakai halaman lain, bukan sidebar. Menghitungnya sebagai drift akan
  // memenuhi laporan dengan 20 baris yang tak satu pun perlu diperbaiki.
  if (key.startsWith('g-') && db.href === null) continue
  // `/m/<key>` di DB berarti "belum punya halaman sendiri" — dan peta-menu.ts
  // menyatakan hal yang sama dengan TIDAK memberi href sama sekali. Keduanya
  // sepakat; bentuknya saja berbeda.
  // Query string dibuang: `?tab=besar` menentukan tab yang terbuka, bukan
  // halaman yang dituju. Membandingkannya akan melaporkan drift untuk menu
  // yang justru BARU SAJA diperbaiki supaya menunjuk tab yang tepat.
  // Dipangkas di KEDUA sisi. Memangkas satu sisi saja hanya memindahkan
  // selisihnya: `/akuntansi` (DB terpangkas) vs `/akuntansi?tab=besar` (TS
  // utuh) tetap terhitung berbeda, dan angkanya tak pernah turun.
  const potong = (h) => (h ? h.split('?')[0] : h)
  const hrefTanpaQuery = potong(db.href)
  const tsHref = potong(ts.href ?? null)
  const dbHref = hrefTanpaQuery === `/m/${key}` ? null : hrefTanpaQuery
  if ((tsHref ?? null) !== (dbHref ?? null)) {
    hrefBeda.push({ key, ts: ts.href ?? '(tanpa href)', db: db.href })
  }
  if (ts.label && db.label && ts.label !== db.label) {
    labelBeda.push({ key, ts: ts.label, db: db.label })
  }
}

// Key yang hanya ada di TS TIDAK dihitung pelanggaran: peta-menu.ts memang
// mendokumentasikan rencana yang belum masuk DB, dan itu sah.

console.log('\n══ Drift peta-menu.ts ↔ menu_items ═══════════════════════════')
console.log(`  entri di peta-menu.ts : ${petaTs.size}`)
console.log(`  entri aktif di DB     : ${petaDb.size}`)
console.log(`  href berbeda          : ${hrefBeda.length}`)
console.log(`  label berbeda         : ${labelBeda.length}`)
console.log(`  ada di DB, tidak di TS: ${hanyaDb.length}`)

if (hrefBeda.length) {
  console.log('\n— href berbeda (sidebar memakai kolom DB):')
  for (const d of hrefBeda.slice(0, 30)) {
    console.log(`   ${d.key.padEnd(22)} TS: ${String(d.ts).padEnd(26)} DB: ${d.db}`)
  }
  if (hrefBeda.length > 30) console.log(`   … dan ${hrefBeda.length - 30} lagi`)
}
if (labelBeda.length) {
  console.log('\n— label berbeda:')
  for (const d of labelBeda.slice(0, 20)) {
    console.log(`   ${d.key.padEnd(22)} TS: ${String(d.ts).padEnd(30)} DB: ${d.db}`)
  }
}
if (hanyaDb.length) {
  console.log(`\n— ada di DB tapi tidak di peta-menu.ts: ${hanyaDb.slice(0, 20).join(', ')}`)
  console.log('   Halaman /m/<key> untuk key ini akan menampilkan "Menu tidak dikenal".')
}

// ── Ratchet ─────────────────────────────────────────────────────────────────
const kini = {
  hrefBeda: hrefBeda.length,
  labelBeda: labelBeda.length,
  hanyaDb: hanyaDb.length,
}

let lantai
try {
  lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
} catch {
  lantai = { _catatan: 'Lantai drift nav. Boleh turun, TIDAK boleh naik.', ...kini }
  writeFileSync(LANTAI, JSON.stringify(lantai, null, 2) + '\n')
  console.log('\nLantai dibuat pertama kali.')
  process.exit(0)
}

if (process.argv.includes('--naikkan')) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, ...kini }, null, 2) + '\n')
  console.log(`\nLantai diperbarui: ${JSON.stringify(kini)}`)
  process.exit(0)
}

let merah = false
for (const k of Object.keys(kini)) {
  if (kini[k] > (lantai[k] ?? 0)) {
    console.error(`\nMERAH: ${k} naik ${lantai[k]} -> ${kini[k]}`)
    console.error('  Sunting peta-menu.ts DAN tulis migrasinya — jangan salah satu saja.')
    merah = true
  } else if (kini[k] < (lantai[k] ?? 0)) {
    console.log(`Turun: ${k} ${lantai[k]} -> ${kini[k]}. Kunci dengan --naikkan`)
  }
}
if (!merah) console.log('\n✅ Drift tidak bertambah.')
console.log()
process.exit(merah ? 1 : 0)
