#!/usr/bin/env node
/**
 * NAV YATIM — halaman jadi yang tak bisa dicapai dari mana pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pada 2026-08-07, empat halaman lengkap — `/jadwal`, `/kepatuhan`,
 * `/aset/operasional`, `/dokumen/kendali` — hanya bisa dibuka dengan MENGETIK
 * URL. Halamannya jadi, endpoint-nya hidup, test-nya hijau, penjaga invariannya
 * merah-lalu-hijau. Yang tak dikerjakan: memindahkan 20 entri menunya dari
 * `/m/<key>` (halaman "segera hadir") ke halaman yang baru dibangun.
 *
 * Yang membuatnya lebih buruk daripada sekadar tak terjangkau: pengguna yang
 * mengklik "Jalur Kritis (CPM)" mendarat di halaman yang MENYATAKAN fitur itu
 * belum ada. Fitur yang sudah dibayar tampak belum dibangun.
 *
 * Tak ada satu pun test yang gagal. Tak ada satu pun penjaga yang berbunyi.
 * Karena tak ada yang pernah menanyakan: **halaman ini bisa dicapai dari mana?**
 *
 * `gen-migrasi-menu.mjs` bahkan sudah meramalkannya secara harfiah:
 *   "menu bisa muncul tanpa halaman atau sebaliknya."
 * Risikonya diprediksi, generatornya ditulis, penjaganya tidak. Ini penjaga itu.
 *
 * ── Dua arah, dua bahaya berbeda
 *
 *   YATIM      halaman ada, nol tautan  → pekerjaan tak terlihat pengguna
 *   LINK MATI  tautan ada, nol halaman  → pengguna mengklik lalu 404
 *
 * Keduanya diperiksa. Link mati diperlakukan lebih keras: ia langsung merusak
 * kepercayaan, sedangkan yatim "hanya" menyembunyikan.
 *
 * ── Kenapa membaca DATABASE, bukan `peta-menu.ts`
 *
 * Sidebar mengambil strukturnya dari `GET /api/v1/menu` — tabel `menu_items`.
 * `peta-menu.ts` adalah sumber GENERATOR migrasi, bukan yang ditampilkan.
 * Memeriksa berkas TS akan melaporkan hijau untuk sidebar yang sebenarnya
 * rusak; justru selisih antara keduanya yang melahirkan cacat ini.
 *
 * Kalau DB tak bisa dihubungi, skrip ini BERHENTI dengan exit 0 dan berkata
 * begitu — penjaga yang diam-diam melewatkan dirinya lebih berbahaya daripada
 * penjaga yang absen, karena CI-nya tetap hijau.
 *
 * Pakai (dari apps/web): node scripts/audit-nav-yatim.mjs
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// ── Halaman yang memang tak pernah ditaut dari navigasi ─────────────────────
//
// Tiap entri WAJIB punya alasan tertulis. Daftar pengecualian tanpa alasan
// berubah jadi tempat pembuangan — dan penjaga ini kehilangan gigi.
const WAJAR = new Map([
  ['/', 'root — mengalihkan sesuai peran, bukan tujuan navigasi'],
  ['/login', 'pra-sesi; sidebar belum ada'],
  ['/auth/callback', 'pra-sesi; tujuan OAuth, bukan halaman'],
  ['/uji-gulir', 'halaman uji internal, sengaja tak dipasarkan'],
  ['/mandor-portal/progress', 'subhalaman portal, dicapai dari badan halaman'],
  ['/mandor-portal/laporan', 'subhalaman portal, dicapai dari badan halaman'],
  ['/kalender',
   'kalender lintas-proyek; jalan masuknya dari dashboard (SectionHeader "Milestone \n    Mendatang", kartu, dan spanduk tenggat) — dashboard/page.tsx:593,611,812. Menu \n    `md-kalender` sengaja menunjuk /jadwal: yang dicari orang dari sidebar adalah \n    kalender HARI KERJA & libur (dasar hitungan CPM), bukan agenda milestone.'],
])

async function hrefDariDb() {
  const koneksi = await import(
    'file://' + join(AKAR, 'scripts', 'db', '_koneksi.mjs').replace(/\\/g, '/'))
  const db = koneksi.buatClient('DIRECT_URL')
  await db.connect()
  const { rows } = await db.query(
    `SELECT href, label, kesiapan FROM menu_items WHERE is_active AND href IS NOT NULL`)
  await db.end()
  return rows
}

let menu
try {
  menu = await hrefDariDb()
} catch (e) {
  console.log('⚠️  DB tak terhubung — pemeriksaan DILEWATI, bukan dinyatakan lulus.')
  console.log(`   ${e.message.slice(0, 100)}`)
  process.exit(0)
}

// ── href dari tab-bagian (layout.tsx) ───────────────────────────────────────
const layouts = execSync('find apps/web/app -name layout.tsx', { cwd: AKAR, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)

const tab = new Map()
for (const f of layouts) {
  for (const m of readFileSync(join(AKAR, f), 'utf8').matchAll(/href:\s*["'`]([^"'`]+)["'`]/g)) {
    if (!tab.has(m[1])) tab.set(m[1], f)
  }
}

// Query string DIBUANG sebelum dibandingkan dengan daftar halaman.
//
// `/akuntansi?tab=besar` dan `/akuntansi` adalah halaman yang SAMA; yang
// berbeda hanya tab yang terbuka (`lib/use-tab-url.ts`). Tanpa pemangkasan
// ini, penjaga melaporkan empat "link mati" untuk halaman yang jelas ada —
// dan penjaga yang merah karena hal yang benar akan dimatikan orang.
const tanpaQuery = (h) => (h ? h.split('?')[0].split('#')[0] : h)

/*
  Menu berlabel `rencana` DIKECUALIKAN dari pemeriksaan "link mati".

  Migrasi 241 mendaftarkan seluruh menu taksonomi ke sidebar — termasuk yang
  halamannya belum dibangun — atas permintaan founder supaya yang belum
  digarap tak terlupa. Kekhawatiran asli R-3 ("mengecewakan saat diklik")
  dijawab dengan MENANDAI: titik abu di sidebar, dan `kesiapan = 'rencana'`
  di basis.

  Tanpa pengecualian ini penjaga melaporkan 12 "link mati" yang justru
  DISENGAJA — dan penjaga yang merah karena hal yang benar akan dimatikan
  orang. Persis alasan yang sama dengan pemangkasan query string di atas.

  Yang TETAP dijaga: menu ber-`hidup`/`sebagian` yang halamannya hilang.
  Itu janji yang tak ditepati, dan `uji-sidebar-struktur.mjs` S-5
  memeriksanya dari sisi migrasi.
*/
const RENCANA = new Set(
  menu.filter((r) => r.kesiapan === 'rencana').map((r) => tanpaQuery(r.href)))

const sidebar = new Set(menu.map((r) => tanpaQuery(r.href)))

// ── href dari grid "Lainnya" portal mobile (mandor/PM/klien) ────────────────
//
// Rombak portal (2026-08-19) memindahkan menu sekunder dari `layout.tsx` ke
// grid `ActionCard` di `<portal>/lainnya/page.tsx` — bottom nav mobile hanya
// mengurasi 4 item + tombol "Lainnya", sisanya hidup di halaman itu
// (`PortalShell.tsx`). Tanpa sumber ini, penjaga memindai HANYA `href:` di
// `layout.tsx` (blok tab-bagian di atas) dan tak pernah melihat grid
// tersebut — enam halaman mandor sungguh-sungguh terjangkau pengguna lewat
// grid ini dilaporkan YATIM begitu saja. Dipersempit ke berkas bernama PERSIS
// `lainnya/page.tsx` (bukan semua `page.tsx`) supaya penjaga tak jadi longgar
// dan menganggap href apa pun di halaman mana pun sebagai tautan nav.
const lainnyaPages = execSync('find apps/web/app -name lainnya -type d', { cwd: AKAR, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
  .map((d) => join(d, 'page.tsx'))

const lainnya = new Map()
for (const f of lainnyaPages) {
  for (const m of readFileSync(join(AKAR, f), 'utf8').matchAll(/href:\s*["'`]([^"'`]+)["'`]/g)) {
    if (!lainnya.has(m[1])) lainnya.set(m[1], f)
  }
}

const nav = new Set([
  ...sidebar,
  ...[...tab.keys()].map(tanpaQuery),
  ...[...lainnya.keys()].map(tanpaQuery),
])

// ── route nyata ─────────────────────────────────────────────────────────────
const rute = execSync('find apps/web/app -name page.tsx', { cwd: AKAR, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)
  .map((f) => {
    const p = f.replace('apps/web/app', '').replace('/page.tsx', '')
    return p.split('/').filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/') || '/'
  })
const adaHalaman = new Set(rute)

console.log('\n══ Nav yatim & link mati ══════════════════════════════════════')
console.log(`  halaman (page.tsx)  : ${rute.length}`)
console.log(`  href sidebar (DB)   : ${sidebar.size}`)
console.log(`  href tab-bagian     : ${tab.size}`)
console.log(`  href grid Lainnya   : ${lainnya.size}`)

// ── 1. LINK MATI ────────────────────────────────────────────────────────────
//
// `/m/<key>` sengaja dilewati: seluruhnya dilayani satu route dinamis
// `app/(dashboard)/m/[key]/page.tsx`.
const mati = [...nav].filter(
  (h) => !h.startsWith('/m/') && !adaHalaman.has(h) && !RENCANA.has(h))

// ── 2. YATIM ────────────────────────────────────────────────────────────────
//
// Segmen dinamis (`[id]`) dilewati: ia dicapai dari daftar induknya, bukan
// dari tautan nav bernilai tetap.
const yatim = rute
  .filter((p) => !p.includes('[') && !nav.has(p) && !WAJAR.has(p))
  .sort()

let merah = false

if (mati.length) {
  merah = true
  console.log(`\n❌ LINK MATI — nav menunjuk halaman yang tak ada: ${mati.length}`)
  for (const h of mati) {
    const sumber = tab.has(h) ? 'tab: ' + tab.get(h)
      : lainnya.has(h) ? 'lainnya: ' + lainnya.get(h)
      : 'sidebar/DB'
    console.log(`     ${h}   (${sumber})`)
  }
  console.log('\n   Pengguna yang mengkliknya mendapat 404.')
}

if (yatim.length) {
  merah = true
  console.log(`\n❌ YATIM — halaman jadi tanpa satu pun tautan nav: ${yatim.length}`)
  for (const p of yatim) console.log(`     ${p}`)
  console.log('\n   Halaman ini hanya bisa dibuka dengan mengetik URL. Perbaiki dengan')
  console.log('   migrasi yang mengarahkan menunya (pola: db/migrations/220), ATAU')
  console.log('   daftarkan di WAJAR pada skrip ini — DENGAN ALASAN TERTULIS.')
}

if (!merah) {
  console.log('\n✅ Nol link mati, nol halaman yatim.')
}
console.log()
process.exit(merah ? 1 : 0)
