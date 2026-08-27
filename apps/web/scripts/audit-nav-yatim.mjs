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
  ['/admin-portal/klien',
   'subhalaman portal, dicapai dari tautan di badan halaman Tender Subkon 
    (`/admin-portal/tender`) dan sebaliknya — keduanya sama-sama 
    pra-konstruksi. TIDAK dapat entri kategori karena key menunya 
    (`md-klien`) ada di grup `g-master`, dan grup itu SENGAJA belum 
    diaktifkan: seluruh item lainnya (Users, Roles, Master data) adalah CRUD 
    katalog lebar yang tak wajar disunting di layar 390px, jadi 
    mengaktifkannya membuat grup itu tampil hampir kosong. Pola sama dengan 
    /admin-portal/kontrak/asuransi sebelum Task 12.'],
  ['/mandor-portal/progress', 'subhalaman portal, dicapai dari badan halaman'],
  ['/mandor-portal/laporan', 'subhalaman portal, dicapai dari badan halaman'],
  ['/admin-portal/kontrak/asuransi',
   'subhalaman portal, dicapai DUA jalur sejak Task 12: (1) tautan "Register \n    Asuransi" di atas daftar kontrak pada `/admin-portal/kontrak/register` \n    (Task 8 Step 3) — pola sama dengan mandor-portal/progress dan \n    mandor-portal/laporan di atas; (2) grid kategori "Lainnya" → "Kontrak" \n    (`g-kontrak` diaktifkan Task 12 di `lib/admin-portal-kategori.ts`, key \n    `kt-asuransi` di `PETA_HREF_PORTAL`). Cross-link (1) DIPERTAHANKAN sebagai \n    pintasan — orang yang sedang membaca daftar kontrak tak perlu kembali ke \n    grid kategori untuk membuka polis asuransinya.'],
  ['/admin-portal/kontrak/eot-ld-bond',
   'subhalaman portal, dicapai DUA jalur sejak Task 12: (1) tautan "EOT, Denda \n    & Jaminan" di atas daftar kontrak pada `/admin-portal/kontrak/register` \n    (Task 9 Step 3); (2) grid kategori "Lainnya" → "Kontrak", key `kt-eot`/\n    `kt-ld`/`kt-bond` di `PETA_HREF_PORTAL` (Task 12) — ketiganya menunjuk \n    halaman ini. Cross-link (1) DIPERTAHANKAN sebagai pintasan, pola sama \n    /admin-portal/kontrak/asuransi di atas.'],
  ['/admin-portal/kontrak/klaim',
   'subhalaman portal, dicapai DUA jalur sejak Task 12: (1) tautan "Klaim \n    Kontraktual" di atas daftar kontrak pada `/admin-portal/kontrak/register` \n    (Task 9 Step 4); (2) grid kategori "Lainnya" → "Kontrak", key `kt-claims` \n    di `PETA_HREF_PORTAL` (Task 12). Cross-link (1) DIPERTAHANKAN sebagai \n    pintasan, pola sama /admin-portal/kontrak/asuransi di atas.'],
  ['/admin-portal/kontrak/surat',
   'subhalaman portal, dicapai DUA jalur sejak Task 12: (1) tautan "Surat \n    Masuk & Keluar" di atas daftar kontrak pada `/admin-portal/kontrak/\n    register` (Task 10 Step 3); (2) grid kategori "Lainnya" → "Kontrak", key \n    `kt-surat` di `PETA_HREF_PORTAL` (Task 12). Cross-link (1) DIPERTAHANKAN \n    sebagai pintasan, pola sama /admin-portal/kontrak/asuransi di atas.'],
  ['/admin-portal/kontrak/change-order',
   'subhalaman portal, dicapai DUA jalur sejak Task 12: (1) tautan "Change \n    Order" di atas daftar kontrak pada `/admin-portal/kontrak/register` \n    (Task 10 Step 4); (2) grid kategori "Lainnya" → "Kontrak", key `kt-co` di \n    `PETA_HREF_PORTAL` (Task 12). Cross-link (1) DIPERTAHANKAN sebagai \n    pintasan, pola sama /admin-portal/kontrak/asuransi di atas. Gerbang \n    `change_order:approve` (admin-only, direktur TIDAK) dipertahankan di \n    halaman itu sendiri — lihat komentar kepala berkasnya.'],
  ['/admin-portal/jadwal',
   'subhalaman portal, dicapai DUA jalur sejak Task 12: (1) tautan "Jadwal & \n    Baseline" di atas daftar kontrak pada `/admin-portal/kontrak/register` \n    (Task 11 Step 2); (2) grid kategori "Lainnya" → "Perencanaan", key \n    `jd-cpm`/`jd-histogram`/`jd-method`/`jd-baseline` di `PETA_HREF_PORTAL` \n    (Task 12, `g-jadwal` diaktifkan) — keempatnya menunjuk satu halaman ini \n    (SegmentedTab 4-arah). Cross-link (1) DIPERTAHANKAN sebagai pintasan, \n    pola sama /admin-portal/kontrak/asuransi di atas.'],
  ['/admin-portal/jadwal/keterlambatan',
   'subhalaman portal, dicapai DUA jalur sejak Task 12: (1) tautan "Analisa \n    Keterlambatan" di atas daftar kontrak pada `/admin-portal/kontrak/\n    register` (Task 11 Step 3); (2) grid kategori "Lainnya" → "Perencanaan", \n    key `jd-delay` di `PETA_HREF_PORTAL` (Task 12). Cross-link (1) \n    DIPERTAHANKAN sebagai pintasan, pola sama /admin-portal/kontrak/asuransi \n    di atas.'],
  ['/admin-portal/keuangan/piutang',
   'subhalaman portal, dicapai DUA jalur sejak Task 19: (1) tautan "Register \n    Piutang" di atas Dashboard Keuangan `/admin-portal/keuangan` (Task 14 \n    Step, sebelum g-keuangan aktif); (2) grid kategori "Lainnya" → \n    "Keuangan"/"Penagihan", key `fn-ar`/`tg-retensi`/`tg-uangmuka`/\n    `tg-followup` di `PETA_HREF_PORTAL` (Task 19, `g-keuangan`/`g-tagih` \n    diaktifkan). Cross-link (1) DIPERTAHANKAN sebagai pintasan, pola sama \n    /admin-portal/kontrak/asuransi di atas.'],
  ['/admin-portal/keuangan/ipc',
   'subhalaman portal, dicapai DUA jalur sejak Task 19: (1) tautan "Sertifikat \n    IPC" di atas Dashboard Keuangan `/admin-portal/keuangan` (Task 14); (2) \n    grid kategori "Lainnya" → "Penagihan", key `tg-ipc` di `PETA_HREF_PORTAL` \n    (Task 19). Cross-link (1) DIPERTAHANKAN sebagai pintasan, pola sama \n    /admin-portal/kontrak/asuransi di atas.'],
  ['/admin-portal/keuangan/gl',
   'subhalaman portal, dicapai DUA jalur sejak Task 19: (1) tautan "General \n    Ledger" di atas Dashboard Keuangan `/admin-portal/keuangan` (Task 15); \n    (2) grid kategori "Lainnya" → "Keuangan", key `fn-gl`/`fn-jurnal`/\n    `gl-peta-akun`/`gl-jurnalkan`/`fn-laporan`/`fn-wip`/`fn-tutup-buku` di \n    `PETA_HREF_PORTAL` (Task 19) — ketujuhnya menunjuk satu halaman ini \n    (SegmentedTab 4-arah, pola sama /admin-portal/jadwal di atas). \n    Cross-link (1) DIPERTAHANKAN sebagai pintasan, pola sama \n    /admin-portal/kontrak/asuransi di atas.'],
  ['/admin-portal/keuangan/rekonsiliasi-bank',
   'subhalaman portal, dicapai DUA jalur sejak Task 19: (1) tautan \n    "Rekonsiliasi Bank" di atas Dashboard Keuangan `/admin-portal/keuangan` \n    (Task 16); (2) grid kategori "Lainnya" → "Keuangan", key \n    `fn-rekonsiliasi` di `PETA_HREF_PORTAL` (Task 19). Cross-link (1) \n    DIPERTAHANKAN sebagai pintasan, pola sama /admin-portal/kontrak/asuransi \n    di atas.'],
  ['/admin-portal/keuangan/kas',
   'subhalaman portal, dicapai DUA jalur sejak Task 19: (1) tautan "Kas & \n    Pengeluaran" di atas Dashboard Keuangan `/admin-portal/keuangan` (Task \n    17); (2) grid kategori "Lainnya" → "Keuangan", key `fn-kas`/`fn-petty` \n    di `PETA_HREF_PORTAL` (Task 19) — keduanya menunjuk halaman ini. \n    Cross-link (1) DIPERTAHANKAN sebagai pintasan, pola sama \n    /admin-portal/kontrak/asuransi di atas.'],
  ['/admin-portal/keuangan/pengadaan-lanjutan',
   'subhalaman portal, dicapai DUA jalur sejak Task 19: (1) tautan "Pengadaan \n    Lanjutan" di atas Dashboard Keuangan `/admin-portal/keuangan` (Task 18); \n    (2) grid kategori "Lainnya" → "Penagihan", key `tg-nota-kredit` di \n    `PETA_HREF_PORTAL` (Task 19). Cross-link (1) DIPERTAHANKAN sebagai \n    pintasan, pola sama /admin-portal/kontrak/asuransi di atas.'],
  ['/pm-portal/gudang/lokasi',
   'subhalaman portal, dicapai dari badan halaman `/pm-portal/gudang` (tautan \n    "Kelola Lokasi" di header ikhtisar, Task 25 Step 2/3) — pola sama dengan \n    mandor-portal/progress dan mandor-portal/laporan di atas. `md-gudang` di \n    PETA_HREF_PORTAL sengaja menunjuk ikhtisar dulu, bukan langsung ke lokasi, \n    supaya PM melihat ringkasan lintas-gudang sebelum masuk mode kelola.'],
  ['/kalender',
   'kalender lintas-proyek; jalan masuknya dari dashboard (SectionHeader "Milestone \n    Mendatang", kartu, dan spanduk tenggat) — dashboard/page.tsx:593,611,812. Menu \n    `md-kalender` sengaja menunjuk /jadwal: yang dicari orang dari sidebar adalah \n    kalender HARI KERJA & libur (dasar hitungan CPM), bukan agenda milestone.'],
  ['/pm-portal/kontrak',
   'ringkasan BACA SAJA nilai/model/pajak/retensi/denda kontrak (subset kolom \n    `projects`, TANPA endpoint sendiri — lihat komentar di berkasnya). Task 16 \n    sempat menaut `kt-co` ke sini sebagai FALLBACK sementara Change Order \n    sungguhan belum ada; Task 21/22 membangun halaman Change Order asli \n    (`kontrak-lengkap/change-order`) dan `kt-co` kini menunjuk ke sana — benar, \n    karena keduanya BUKAN halaman yang sama (lihat komentar `kontrak-lengkap/\n    register/page.tsx` yang membedakan `kontrak/page.tsx` dari dokumen kontrak \n    `kontrak` tabel). Tak ada key `g-kontrak` lain yang cocok untuk ringkasan \n    nilai/pajak/model ini — mengarahkan key yang salah makna (mis. kt-termin, \n    tentang jadwal tagihan bukan nilai kontrak) lebih menyesatkan daripada \n    membiarkannya di sini sebagai utang navigasi tercatat, bukan disembunyikan \n    diam-diam. Kandidat pemetaan berikutnya: key baru g-kontrak "Ringkasan \n    Kontrak", atau tab di hub `proyek/[id]` (Task 26).'],
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

// ── href dari halaman kategori portal PM (Task 9) ───────────────────────────
//
// Task 9 (2026-08-20) mengganti grid datar `pm-portal/lainnya/page.tsx`
// dengan navigasi berkategori: kartu kategori menunjuk `/pm-portal/kategori/
// [key]` (bukan lagi href modul langsung), dan href MODULNYA sendiri pindah
// ke `PETA_HREF_PORTAL`/`EKSTRA_PORTAL` di dalam `kategori/[key]/page.tsx`.
// Tanpa sumber ini, penjaga hanya melihat SATU href literal per halaman
// (rute `/pm-portal/kategori/[key]` itu sendiri) dan melaporkan SEMBILAN
// halaman portal PM yang sebenarnya terjangkau (lewat kategori → modul)
// sebagai yatim. Dipersempit ke berkas bernama PERSIS `kategori/[key]/
// page.tsx` dengan alasan sama seperti pembatasan `lainnya/page.tsx` di atas
// — supaya penjaga tak jadi longgar dan menganggap href apa pun di halaman
// mana pun sebagai tautan nav.
const kategoriPages = execSync('find apps/web/app -path "*/kategori/*/page.tsx"', { cwd: AKAR, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)

// Dua bentuk literal dipindai di sini, bukan satu: `href: "/jalur"` (pola
// `EKSTRA_PORTAL`, objek beratribut `href`) DAN `"key": "/jalur"` (pola
// `PETA_HREF_PORTAL`, `Record<string,string>` — key-nya bukan literal kata
// `href`, jadi regex `lainnya` di atas tak menangkapnya). Nilai yang tak
// diawali `/` (bukan path) diabaikan supaya key non-href seperti label tak
// ikut kebaca sebagai tautan.
const kategori = new Map()
for (const f of kategoriPages) {
  const isi = readFileSync(join(AKAR, f), 'utf8')
  for (const m of isi.matchAll(/href:\s*["'`]([^"'`]+)["'`]/g)) {
    if (!kategori.has(m[1])) kategori.set(m[1], f)
  }
  for (const m of isi.matchAll(/["'`][\w-]+["'`]:\s*["'`](\/[^"'`]+)["'`]/g)) {
    if (!kategori.has(m[1])) kategori.set(m[1], f)
  }
}

const nav = new Set([
  ...sidebar,
  ...[...tab.keys()].map(tanpaQuery),
  ...[...lainnya.keys()].map(tanpaQuery),
  ...[...kategori.keys()].map(tanpaQuery),
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
console.log(`  href kategori PM    : ${kategori.size}`)

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
      : kategori.has(h) ? 'kategori: ' + kategori.get(h)
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
