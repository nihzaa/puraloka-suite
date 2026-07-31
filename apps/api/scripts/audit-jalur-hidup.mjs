#!/usr/bin/env node
// ============================================================
// AUDIT JALUR HIDUP — menemukan yang "benar tapi mati".
//
// Menegakkan AUTOPILOT §9a. HANYA MEMBACA — tak menulis apa pun.
//
// ── Kenapa ada
//
// 2026-07-31, lima hal ditemukan dalam satu hari yang LOLOS seluruh Definition
// of Done dan tetap tak terpakai:
//
//   • ACL cost code (migrasi 112)  — ber-test, 0 baris berbulan-bulan
//   • lib/cashflow-forecast.ts     — ber-test, nol pemanggil dari web
//   • kuota RAB (migrasi 043)      — tabelnya TAK PERNAH terbentuk
//   • jejak pengiriman PO          — kolom ada, terisi 0 dari 4 PO
//   • 423 analisa perusahaan       — ada, tapi filter UI membuangnya
//
// Tak satu pun melanggar DoD. Yang kurang bukan kualitas kode, melainkan
// pertanyaan yang tak pernah ditanyakan: siapa yang memakainya.
//
// Skrip ini menanyakannya secara mekanis, supaya tak bergantung pada seseorang
// kebetulan membuka halamannya.
//
// ── Yang diperiksa
//
//   1. Tabel yang ADA di migrasi tapi TIDAK ADA di database (migrasi hantu)
//   2. Tabel yang ada tapi NOL BARIS — dan tak ada endpoint yang menulisinya
//   3. Berkas lib yang nol pemanggil di luar test-nya sendiri
//   4. Endpoint API yang tak pernah dipanggil dari apps/web
//
// Temuan di sini BUKAN otomatis bug: sebagian sah (fitur baru yang gerbangnya
// belum terbuka, tabel yang memang diisi manusia lewat UI). Karena itu keluaran
// berupa LAPORAN untuk ditinjau, bukan exit code yang memerahkan CI.
//
// Jalankan: node apps/api/scripts/audit-jalur-hidup.mjs
// ============================================================
import 'dotenv/config'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')
const MIGRASI = join(AKAR, 'db', 'migrations')
const SRC_API = join(AKAR, 'apps', 'api', 'src')
const SRC_WEB = join(AKAR, 'apps', 'web')

/**
 * Tabel yang memang WAJAR kosong — dikecualikan dengan alasan tertulis, bukan
 * disembunyikan diam-diam. Daftar ini harus tetap pendek; kalau memanjang,
 * itu sendiri sinyal.
 */
const WAJAR_KOSONG = new Map(Object.entries({
  audit_logs: 'terisi saat ada aktivitas; kosong di lingkungan baru itu wajar',
  notifications: 'idem',
  schema_migrations: 'tabel sistem',
}))

function berkasBerulang(dir, ext = '.ts') {
  const hasil = []
  const telusuri = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) {
        if (['node_modules', '.next', 'dist', '__tests__'].includes(e.name)) continue
        telusuri(p)
      } else if (e.name.endsWith(ext)) hasil.push(p)
    }
  }
  telusuri(dir)
  return hasil
}

/** Seluruh isi berkas sumber, digabung — untuk pencarian pemanggil. */
function isiGabungan(berkas) {
  return berkas.map((f) => readFileSync(f, 'utf8')).join('\n')
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) { console.error('FATAL: DIRECT_URL/DATABASE_URL kosong'); process.exit(1) }

const c = new pg.Client({ connectionString: url })
await c.connect()

const temuan = { hantu: [], kosong: [], libMati: [], endpointMati: [] }

try {
  // ── 1 & 2. Tabel: hantu (di migrasi, tak ada di DB) & kosong ─────────────
  // Tabel yang DIBUAT, dikurangi yang kemudian SENGAJA di-DROP. Tanpa
  // pengurangan itu, seluruh scaffolding workflow 1C (diretire per ADR-006,
  // di-DROP migrasi 092/095) dilaporkan sebagai "hantu" — padahal justru
  // dihapus dengan sengaja.
  const dibuat = new Set()
  const didrop = new Set()
  for (const f of readdirSync(MIGRASI).filter((x) => x.endsWith('.sql')).sort()) {
    // Baris komentar DIBUANG sebelum dipindai. Migrasi di repo ini banyak
    // menjelaskan dirinya sendiri, dan kalimat seperti "`CREATE TABLE IF NOT
    // EXISTS` di bawah akan dilewati" ikut terbaca sebagai DDL — migrasi 143
    // sempat melaporkan tabel bernama "if" karena itu.
    const isi = readFileSync(join(MIGRASI, f), 'utf8')
      .split('\n').filter((b) => !b.trim().startsWith('--')).join('\n')
    // `\s+` setelah IF NOT EXISTS, bukan `?` di grup — versi lama menangkap
    // kata "IF" sendiri sebagai nama tabel saat penulisannya multi-baris.
    for (const m of isi.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      dibuat.add(m[1].toLowerCase())
    }
    for (const m of isi.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      didrop.add(m[1].toLowerCase())
    }
  }
  const diMigrasi = new Set([...dibuat].filter((t) => !didrop.has(t)))

  // pg_class lewat koneksi ini — bukan information_schema pada koneksi lama.
  const { rows: adaDiDb } = await c.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'`)
  const nyata = new Set(adaDiDb.map((r) => r.relname))

  for (const t of diMigrasi) {
    if (!nyata.has(t)) temuan.hantu.push(t)
  }

  const isiApi = isiGabungan(berkasBerulang(SRC_API))
  for (const t of nyata) {
    if (WAJAR_KOSONG.has(t)) continue
    const { rows } = await c.query(`SELECT count(*)::int n FROM public."${t}"`)
    if (rows[0].n > 0) continue
    // Kosong + tak pernah disebut kode = kandidat kuat "dibangun lalu mati".
    const disebutKode = isiApi.includes(`'${t}'`) || isiApi.includes(`"${t}"`)
    temuan.kosong.push({ tabel: t, disebutKode })
  }

  // ── 3. lib tanpa pemanggil ────────────────────────────────────────────────
  const berkasLib = berkasBerulang(join(SRC_API, 'lib'))
  const isiTanpaLib = isiGabungan(
    berkasBerulang(SRC_API).filter((f) => !f.includes(`${join('src', 'lib')}`)))
  for (const f of berkasLib) {
    if (f.endsWith('.test.ts')) continue
    const nama = f.split(/[\\/]/).pop().replace(/\.ts$/, '')
    if (!isiTanpaLib.includes(`lib/${nama}.js`) && !isiTanpaLib.includes(`lib/${nama}'`)) {
      temuan.libMati.push(nama)
    }
  }

  // ── 4. endpoint tanpa pemanggil dari web ──────────────────────────────────
  const isiWeb = isiGabungan([
    ...berkasBerulang(join(SRC_WEB, 'app'), '.tsx'),
    ...berkasBerulang(join(SRC_WEB, 'components'), '.tsx'),
    ...berkasBerulang(join(SRC_WEB, 'lib'), '.ts'),
  ])
  const rute = new Set()
  for (const m of isiApi.matchAll(/['"`](\/api\/v1\/[a-z0-9\-/:_]+)['"`]/gi)) rute.add(m[1])
  for (const r of rute) {
    // Bandingkan potongan STATIS-nya saja: `/api/v1/rap/:id/lock` dipanggil web
    // sebagai template literal, jadi mencocokkan string utuh selalu gagal.
    const statis = r.split('/:')[0]
    if (statis.length < 12) continue           // terlalu pendek → cocok palsu
    if (!isiWeb.includes(statis)) temuan.endpointMati.push(r)
  }
} finally {
  await c.end()
}

// ── Laporan ────────────────────────────────────────────────────────────────
const garis = (t) => console.log(`\n${'═'.repeat(70)}\n${t}\n${'═'.repeat(70)}`)

garis('1. MIGRASI HANTU — tabel di migrasi, TIDAK ADA di database')
if (!temuan.hantu.length) console.log('  ✅ nihil')
else {
  console.log('  ⚠️  Migrasi tercatat sukses tapi objeknya tak pernah terbentuk.')
  temuan.hantu.forEach((t) => console.log(`     ${t}`))
}

garis('2. TABEL KOSONG — ada di DB, nol baris')
const tanpaKode = temuan.kosong.filter((x) => !x.disebutKode)
const denganKode = temuan.kosong.filter((x) => x.disebutKode)
console.log(`  ${temuan.kosong.length} tabel kosong · ${tanpaKode.length} di antaranya TAK PERNAH disebut kode API`)
if (tanpaKode.length) {
  console.log('\n  Kosong DAN tak disebut kode — kandidat kuat "dibangun lalu mati":')
  tanpaKode.forEach((x) => console.log(`     ${x.tabel}`))
}
if (denganKode.length) {
  console.log('\n  Kosong tapi ada kodenya (mungkin sah — menunggu dipakai):')
  denganKode.slice(0, 12).forEach((x) => console.log(`     ${x.tabel}`))
  if (denganKode.length > 12) console.log(`     … dan ${denganKode.length - 12} lagi`)
}

garis('3. LIB TANPA PEMANGGIL')
if (!temuan.libMati.length) console.log('  ✅ nihil')
else temuan.libMati.forEach((n) => console.log(`     lib/${n}.ts`))

garis('4. ENDPOINT TANPA PEMANGGIL DARI apps/web')
if (!temuan.endpointMati.length) console.log('  ✅ nihil')
else {
  console.log(`  ${temuan.endpointMati.length} endpoint. Sebagian SAH (dipanggil skrip/mobile/`)
  console.log('  eksternal) — yang perlu ditinjau: fitur yang seharusnya punya UI.\n')
  temuan.endpointMati.slice(0, 25).forEach((r) => console.log(`     ${r}`))
  if (temuan.endpointMati.length > 25) {
    console.log(`     … dan ${temuan.endpointMati.length - 25} lagi`)
  }
}

console.log(`\n${'─'.repeat(70)}`)
console.log('Temuan di sini BUKAN otomatis bug — sebagian sah (gerbang belum terbuka,')
console.log('tabel yang diisi manusia lewat UI). Ini bahan TINJAUAN, bukan vonis.')
console.log('Aturannya: AUTOPILOT.md §9a — Jalur Hidup.')
