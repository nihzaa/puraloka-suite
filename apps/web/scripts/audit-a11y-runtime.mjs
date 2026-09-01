#!/usr/bin/env node
/**
 * AUDIT A11Y RUNTIME — axe-core di halaman yang BENAR-BENAR dirender.
 *
 * ── Kenapa runtime, bukan hanya statis
 *
 * `a11y-ratchet.mjs` memindai sumber dan menangkap kontrol tanpa nama.
 * Itu berguna, tapi buta terhadap tiga hal yang hanya ada saat dirender:
 *
 *   • kontras warna sesungguhnya (token → nilai terhitung, per mode)
 *   • urutan heading setelah komponen disusun
 *   • landmark: apakah isi halaman benar-benar berada di dalam `<main>`
 *
 * Audit axe terakhir menemukan 296 pelanggaran yang SELURUHNYA lolos
 * eslint-plugin-jsx-a11y. Sejak itu semuanya ditutup — berkas ini
 * memastikan tak tumbuh lagi setelah perombakan UI besar.
 *
 * ── Kenapa axe di-bundle, bukan diunduh dari CDN
 *
 * Halaman ini punya CSP dan berjalan tanpa jaringan di CI. `axe-core`
 * sudah ada di node_modules (dependensi @axe-core/playwright), jadi
 * sumbernya dibaca dari disk lalu disuntikkan — tak ada permintaan
 * keluar yang bisa gagal diam-diam dan membuat audit "hijau" palsu.
 *
 * ── Pakai — DARI AKAR REPO, dan WAJIB berkredensial
 *
 *   LAYAR_EMAIL=… LAYAR_SANDI=… node apps/web/scripts/audit-a11y-runtime.mjs
 *   ... --gelap        # mode gelap
 *   ... --url /kas     # satu halaman
 *
 * Dua kesalahan pemakaian yang keduanya pernah terjadi pada 2026-08-11, dan
 * keduanya kini BERBUNYI alih-alih diam:
 *
 *   dijalankan dari apps/web  → ENOENT apps/web/apps/web/app (jalur ganda)
 *   tanpa kredensial          → 115 dari 118 halaman dialihkan ke /login;
 *                               dulu tetap exit 0 dengan "2 pelanggaran"
 *                               yang seluruhnya artefak halaman kosong
 *
 * Yang kedua paling menipu: angkanya terbaca seperti audit yang berhasil.
 * Lihat pemeriksaan CAKUPAN RUNTUH di bawah.
 *
 * ── TIDAK dijalankan CI, dan itu disengaja
 *
 * CI repo ini tak menjalankan satu pun penjaga berbasis peramban (lihat
 * `ci.yml` di sekitar `uji-induk-punya-ikhtisar`): penjaga yang butuh server
 * hidup akan merah karena servernya tak ada, lalu dimatikan orang — dan yang
 * dimatikan tidak menjaga apa-apa. Audit ini dijalankan MANUAL sebelum
 * pekerjaan UI besar diserahkan.
 */
import { chromium } from '@playwright/test'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ARG = process.argv.slice(2)
const GELAP = ARG.includes('--gelap')
const iUrl = ARG.indexOf('--url')
const URL_TUNGGAL = iUrl >= 0 ? ARG[iUrl + 1] : null

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

// axe-core dari node_modules — lihat alasan di header.
let AXE_SRC
try {
  AXE_SRC = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
} catch {
  console.error('❌ axe-core tak ditemukan di node_modules.')
  console.error('   pnpm add -D axe-core   (atau @axe-core/playwright)')
  process.exit(2)
}

/**
 * Contoh nilai untuk rute dinamis (`[id]`), lewat env.
 *
 * ── Kenapa perlu
 *
 * Versi lama MELEWATI seluruh rute `[...]`. Akibatnya `/proyek/[id]` — 20
 * bagian, 12.554px, halaman terkaya di aplikasi ini — tak pernah sekali pun
 * diaudit. Cacat nyata bersembunyi di sana: lencana EVM memakai
 * `opacity: 0.7` yang menjatuhkan kontras 4,79:1 → 2,82:1, kelas cacat
 * persis yang dulu menyumbang 227 dari 235 pelanggaran lewat sidebar.
 *
 * Audit yang melewati halaman terpenting lalu melaporkan "nol pelanggaran"
 * memberi rasa aman yang tidak dibayar dengan pemeriksaan apa pun.
 *
 * Nilainya lewat env supaya tak ada UUID yang dipaku di berkas ini —
 * basis berbeda punya id berbeda, dan id yang basi membuat audit memindai
 * halaman 404 sambil tampak berhasil.
 *
 * ── CARA MENGAMBIL ID-nya (2026-08-13)
 *
 * Mekanisme env ini ada sejak 2026-08-07, dan ketujuh rute TETAP terlewat
 * di setiap jalan sesudahnya — bukan karena rusak, tapi karena tak ada yang
 * tahu id apa yang harus diisikan. Peringatan tanpa cara memenuhinya sama
 * saja dengan tak ada peringatan.
 *
 *     node -e "import('./scripts/db/_koneksi.mjs').then(async m=>{
 *       const c=m.buatClient(); await c.connect();
 *       for (const [l,q] of [
 *         ['PROYEK',  'select id from projects order by created_at desc limit 1'],
 *         ['INVOICE', 'select id from invoices order by created_at desc limit 1'],
 *         ['MANDOR',  'select mandor_id from mandor_assignments limit 1'],
 *         ['MENU',    \"select key from menu_items where is_active and href is not null limit 1\"],
 *       ]) { const r = await c.query(q); console.log(l+'='+Object.values(r.rows[0]??{})[0]); }
 *       await c.end();
 *     })"
 *
 * Catatan yang memakan waktu: TIDAK ADA tabel `mandors`. Mandor adalah
 * pengguna berperan mandor; id yang dipakai `/mandor/[id]` diambil dari
 * `mandor_assignments.mandor_id`.
 */
const CONTOH_ID = {
  '/proyek/[id]': process.env.LAYAR_ID_PROYEK,
  '/mandor/[id]': process.env.LAYAR_ID_MANDOR,
  '/portal/proyek/[id]': process.env.LAYAR_ID_PROYEK,
  '/pm-portal/proyek/[id]': process.env.LAYAR_ID_PROYEK,
  // Ditambahkan 2026-08-07. Keduanya sebelumnya selalu "TERLEWAT", dan
  // rute yang tak pernah dipindai adalah rute yang cacatnya tak pernah
  // ketahuan — audit yang melaporkan "0 pelanggaran" sambil melewati enam
  // halaman terbaca seperti cakupan penuh.
  '/m/[key]': process.env.LAYAR_KUNCI_MENU,
  // Halaman modul terkunci (migrasi 548). Nilainya BUKAN id dari basis
  // melainkan kunci modul — dan ia dipaku, bukan dari env: `modul.akuntansi`
  // selalu ada di katalog, jadi menuntut env terisi hanya akan membuat rute
  // ini terlewat pada mesin yang lupa mengisinya. Rute yang tak pernah
  // dipindai adalah rute yang cacatnya tak pernah ketahuan.
  '/modul-terkunci/[modul]': 'modul.akuntansi',
  '/verify/invoice/[id]': process.env.LAYAR_ID_INVOICE,
  // G6b — baseline jadwal. Memakai id proyek yang sama: halamannya sub-rute
  // proyek, jadi tak butuh id tersendiri.
  '/proyek/[id]/baseline': process.env.LAYAR_ID_PROYEK,
  // Portal PM Lengkap Tahap 1, Task 9 — kategori "Lainnya" berjenjang.
  // `key` BUKAN id dari DB — nilai literal tetap dari KATEGORI_AKTIF di
  // lib/pm-portal-kategori.ts ("g-subkon" | "g-lapangan"). Tak butuh env var.
  '/pm-portal/kategori/[key]': 'g-subkon',
  // Portal Admin/Direktur Tahap 0, Task 1 — sama pola persis baris di atas.
  // `KATEGORI_AKTIF` di lib/admin-portal-kategori.ts KOSONG di Tahap 0, jadi
  // `key` apa pun (termasuk `g-master`, grup nyata di PETA_MENU) akan
  // merender cabang "Kategori tidak ditemukan" — itu tetap halaman sungguhan
  // yang sah diaudit a11y-nya (EmptyState), bukan alasan melewati rute ini.
  '/admin-portal/kategori/[key]': 'g-master',
  // Portal Admin/Direktur Tahap 2, Task 7 — detail proyek (projects.id).
  // Memakai id proyek yang sama dengan `/proyek/[id]` — bukan entitas baru.
  '/admin-portal/proyek/[id]': process.env.LAYAR_ID_PROYEK,
  // Portal PM Lengkap Tahap 3, Task 19 — detail RAB (estimate_versions.id).
  '/pm-portal/cecep/rab/[id]': process.env.LAYAR_ID_RAB,
  // Portal PM Lengkap Tahap 3, Task 20 — detail RAP (rap_budget.id).
  '/pm-portal/cecep/rap/[id]': process.env.LAYAR_ID_RAP,
  // Portal PM Lengkap Tahap 4, Task 24 — detail Material Request (material_requests.id)
  // dan detail Purchase Order (purchase_orders.id).
  '/pm-portal/procurement/mr/[id]': process.env.LAYAR_ID_MR,
  '/pm-portal/procurement/po/[id]': process.env.LAYAR_ID_PO,
  // Portal Admin/Direktur Tahap 4, Task 21 — MR/PO detail company-wide.
  // Memakai ULANG env var yang sama dengan pm-portal: id-nya diambil dari
  // tabel yang sama (`material_requests`/`purchase_orders`), dan
  // `jalankan-a11y-lengkap.mjs` sudah mengisinya. Menambah env var baru
  // hanya akan menciptakan isian yang tak pernah diisi siapa pun — persis
  // cacat yang membuat tujuh rute terlewat sampai 2026-08-16.
  '/admin-portal/procurement/mr/[id]': process.env.LAYAR_ID_MR,
  '/admin-portal/procurement/po/[id]': process.env.LAYAR_ID_PO,
  // Portal PM Lengkap Tahap 7, Task 40 — detail Aset & Alat (assets.id).
  '/pm-portal/aset/[id]': process.env.LAYAR_ID_ASET,
  // Portal PM Lengkap Tahap 5, Task 29 — detail NCR (ncr_items.id). Halaman
  // ini juga butuh `?proyek=<id>` (lihat komentar `[id]/page.tsx`) — tanpanya
  // ia jatuh ke EmptyState "tautan tidak lengkap" yang tetap terpindai axe
  // secara sah, tapi tak menguji isi sungguhan. `LAYAR_ID_PROYEK` dipakai
  // ulang untuk query string supaya tak menambah env var baru hanya untuk
  // satu parameter tambahan.
  '/pm-portal/mutu/ncr/[id]': process.env.LAYAR_ID_NCR
    ? `${process.env.LAYAR_ID_NCR}?proyek=${process.env.LAYAR_ID_PROYEK ?? ''}`
    : undefined,
  // Portal PM Lengkap Tahap 5, Task 30 — detail Rencana Mutu Proyek
  // (rencana_mutu.id). Halaman ini TIDAK butuh `?proyek=` — endpoint
  // `GET /rencana-mutu/:id` tak memakai project_id dari query, tenancy
  // dijamin server lewat projectIds() (lihat komentar `[id]/page.tsx`).
  '/pm-portal/mutu/rencana/[id]': process.env.LAYAR_ID_RMP,
  // Portal PM Lengkap Tahap 6, Task 33/34/35 — tiga rute dinamis ditemukan
  // TERLEWAT saat verifikasi akhir Task 37 (uji-rute-dinamis-teraudit.mjs
  // sudah merah SEBELUM Task 37, gap ditinggalkan Task 33-35 yang membangun
  // halamannya tanpa menambah entri di sini). Semua tiga memakai `useParams`
  // polos, tak butuh query string tambahan (dikonfirmasi baca `[id]/page.tsx`
  // masing-masing).
  '/pm-portal/keuangan/kas/[id]': process.env.LAYAR_ID_CASH_ACCOUNT,
  '/pm-portal/keuangan/gl/jurnal/[id]': process.env.LAYAR_ID_JOURNAL,
  '/pm-portal/keuangan/rekonsiliasi-bank/[id]': process.env.LAYAR_ID_REKENING_KORAN,
  // Portal PM Lengkap Tahap 7, Task 41 — detail Klien (clients.id).
  '/pm-portal/klien/[id]': process.env.LAYAR_ID_KLIEN,
  // Portal Admin/Direktur Tahap 3, Task 17/15/16 — tiga rute dinamis
  // SAMA BENTUK dengan pm-portal di atas (entitas identik, cash_accounts/
  // journal_entries/rekening_koran bukan per-role), ditemukan TERLEWAT saat
  // verifikasi akhir Task 19 lewat `uji-rute-dinamis-teraudit.mjs` — gap
  // yang sama persis dengan yang dicatat Task 37 untuk versi pm-portal:
  // halamannya dibangun Task 15-17 tanpa menambah entri di sini. Semua tiga
  // memakai `useParams` polos, tak butuh query string tambahan (dikonfirmasi
  // baca `[id]/page.tsx` masing-masing). Env var DIPAKAI ULANG dari
  // `jalankan-a11y-lengkap.mjs` — sudah ada sejak Task 33-35, tak perlu
  // query SQL baru.
  '/admin-portal/keuangan/kas/[id]': process.env.LAYAR_ID_CASH_ACCOUNT,
  '/admin-portal/keuangan/gl/jurnal/[id]': process.env.LAYAR_ID_JOURNAL,
  '/admin-portal/keuangan/rekonsiliasi-bank/[id]': process.env.LAYAR_ID_REKENING_KORAN,
}

function halamanDariBerkas() {
  const akar = join(process.cwd(), 'apps', 'web', 'app')
  const hasil = []
  const telusuri = (dir, rute) => {
    for (const isi of readdirSync(dir, { withFileTypes: true })) {
      if (isi.isDirectory()) {
        if (isi.name.startsWith('_')) continue
        telusuri(join(dir, isi.name), rute + (isi.name.startsWith('(') ? '' : `/${isi.name}`))
      } else if (isi.name === 'page.tsx') hasil.push(rute || '/')
    }
  }
  telusuri(akar, '')

  return [...new Set(hasil)]
    .map((r) => {
      if (!r.includes('[')) return r
      const contoh = CONTOH_ID[r]
      // Rute dinamis tanpa contoh id tetap dilewati — tapi itu kini pilihan
      // yang bisa dilihat (dilaporkan di ringkasan), bukan penghilangan diam.
      return contoh ? r.replace(/\[[^\]]+\]/, contoh) : null
    })
    .filter(Boolean)
    .sort()
}

const HALAMAN = URL_TUNGGAL ? [URL_TUNGGAL] : halamanDariBerkas()

// Rute dinamis yang dilewati karena tak diberi contoh id — dinyatakan, bukan
// dihilangkan diam-diam.
const DINAMIS_TERLEWAT = URL_TUNGGAL ? [] : (() => {
  const akar = join(process.cwd(), 'apps', 'web', 'app')
  const semua = []
  const telusuri = (dir, rute) => {
    for (const isi of readdirSync(dir, { withFileTypes: true })) {
      if (isi.isDirectory()) {
        if (isi.name.startsWith('_')) continue
        telusuri(join(dir, isi.name), rute + (isi.name.startsWith('(') ? '' : `/${isi.name}`))
      } else if (isi.name === 'page.tsx' && rute.includes('[')) semua.push(rute)
    }
  }
  telusuri(akar, '')
  return [...new Set(semua)].filter((r) => !CONTOH_ID[r]).sort()
})()

const peramban = await chromium.launch()

/*
  Konteks + login dijadikan FUNGSI supaya bisa dibuat ulang.

  `Page crashed` mematikan konteksnya juga; tanpa membuka yang baru, sisa
  halaman gagal beruntun dengan galat yang menuduh halaman-halaman yang
  sebenarnya baik-baik saja.
*/
async function buatKonteks() {
  const k = await peramban.newContext({
    viewport: { width: 1600, height: 1000 },
    colorScheme: GELAP ? 'dark' : 'light',
  })
  await k.addInitScript((g) => localStorage.setItem('theme', g ? 'dark' : 'light'), GELAP)
  const h = await k.newPage()

  if (EMAIL && SANDI) {
    await h.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
    await h.waitForSelector('#login-email', { timeout: 15_000 })
    await h.fill('#login-email', EMAIL)
    await h.fill('#login-password', SANDI)
    await h.click('button[type="submit"]')
    await h.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25_000 }).catch(() => {})
    if (h.url().includes('/login')) return { k, h, gagalLogin: true }
  }
  return { k, h, gagalLogin: false }
}

let { k: konteks, h: hal, gagalLogin } = await buatKonteks()

if (gagalLogin) {
  console.error('❌ Login gagal — audit akan memindai layar masuk, bukan halamannya.')
  await peramban.close()
  process.exit(2)
}
if (!EMAIL || !SANDI) {
  console.log('⚠️  LAYAR_EMAIL/LAYAR_SANDI tak diisi — hanya halaman publik yang terukur.\n')
}

const semua = []

/*
  ⚠ Satu halaman yang CRASH tak boleh mematikan seluruh audit.

  Diukur 2026-09-01, audit pertama portal PM (78 halaman): prosesnya mati
  dengan `page.waitForTimeout: Page crashed` — dan TANPA menyebut halaman
  mana. Loop ini tak mencetak kemajuan, jadi yang terlihat cuma jejak
  tumpukan yang menunjuk baris 278 skrip ini sendiri.

  Kegagalan yang tak menyebut lokasinya memaksa orang berikutnya
  menjalankan ulang seluruh audit sambil menebak. Dan lebih buruk: 77
  halaman lain jadi TAK TERUKUR gara-gara satu yang rusak, sementara
  laporannya tak pernah sampai tercetak.

  Sekarang crash dicatat sebagai temuan halaman itu sendiri, halaman
  berikutnya tetap dipindai, dan konteks browser dibuka ulang — konteks
  yang sudah crash tak bisa dipakai lagi.
*/
let dipindaiSejauhIni = 0

for (const url of HALAMAN) {
  try {
  await hal.goto(`${BASIS}${url}`, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
  await hal.waitForTimeout(1200)

  // Halaman yang mengalihkan ke tempat lain tak dihitung sebagai dirinya.
  const nyata = new URL(hal.url()).pathname
  if (nyata !== url && !(url === '/' )) {
    semua.push({ url, dialihkan: nyata })
    continue
  }

  await hal.evaluate(AXE_SRC)
  const hasil = await hal.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    })
    return {
      lolos: r.passes.length,
      langgar: r.violations.map((v) => ({
        id: v.id,
        dampak: v.impact,
        deskripsi: v.description,
        jumlah: v.nodes.length,
        contoh: v.nodes.slice(0, 2).map((n) => ({
          html: (n.html || '').slice(0, 150),
          target: String(n.target?.[0] ?? ''),
        })),
      })),
    }
  })
  semua.push({ url, ...hasil })
  dipindaiSejauhIni++
  } catch (e) {
    /*
      Halaman ini rusak — dicatat NAMANYA, lalu lanjut.

      `Page crashed` mematikan konteks browsernya juga, jadi halaman
      berikutnya butuh konteks baru. Tanpa membuka ulang, sisa audit
      gagal beruntun dengan galat yang menuduh halaman-halaman yang
      sebenarnya baik-baik saja.
    */
    const pesan = String(e?.message ?? e).split(String.fromCharCode(10))[0].slice(0, 120)
    console.error(`  ✗ ${url} — RUSAK: ${pesan}`)
    semua.push({ url, rusak: pesan, lolos: 0, langgar: [] })

    try { await konteks.close() } catch { /* sudah mati */ }
    const baru = await buatKonteks()
    konteks = baru.k
    hal = baru.h
    if (baru.gagalLogin) {
      console.error('  ✗ login gagal saat memulihkan konteks — audit dihentikan.')
      break
    }
  }
}

if (dipindaiSejauhIni === 0) {
  console.error('\n❌ NOL halaman berhasil dipindai — ini BUKAN kelulusan.')
  process.exit(2)
}

await peramban.close()

// ── Laporan ────────────────────────────────────────────────────────────
const mode = GELAP ? 'gelap' : 'terang'
const dialihkan = semua.filter((s) => s.dialihkan)
/*
  Halaman RUSAK dikeluarkan dari `dipindai`.

  Kalau ikut dihitung, ia menyumbang nol pelanggaran — dan angka "N halaman,
  0 pelanggaran" jadi lebih besar dari yang sebenarnya terukur. Halaman yang
  crash bukan halaman yang lolos; ia halaman yang TAK TERUKUR.
*/
const rusak = semua.filter((s) => s.rusak)
const dipindai = semua.filter((s) => !s.dialihkan && !s.rusak)
const total = dipindai.reduce((n, s) => n + s.langgar.reduce((m, v) => m + v.jumlah, 0), 0)

console.log(`\n══ AUDIT A11Y RUNTIME (axe-core · WCAG 2.1 AA · mode ${mode}) ══\n`)
console.log(`  halaman dipindai : ${dipindai.length}`)
if (rusak.length) {
  console.log(`  RUSAK            : ${rusak.length} — tak terukur, bukan lolos`)
  for (const r of rusak) console.log(`     · ${r.url} — ${r.rusak}`)
}
if (dialihkan.length) {
  console.log(`  dialihkan        : ${dialihkan.length} (bukan halaman ini)`)
  /*
    KE MANA dialihkannya wajib disebut.

    Tanpa ini, laporan hanya berbunyi "1 dialihkan" — dan sebabnya bisa apa
    saja: login gagal, izin kurang, halaman memang mengalihkan sendiri, atau
    URL-nya salah tulis. Diukur 2026-08-19: satu jalan melaporkan "1 dialihkan"
    dan menghabiskan waktu dikira login gagal, padahal halamannya memang
    mengalihkan diri saat proyeknya belum dipilih.

    Yang dilaporkan tanpa tujuannya tak bisa didiagnosis.
  */
  for (const s of dialihkan) console.log(`     ${s.url} → ${s.dialihkan}`)
}
if (DINAMIS_TERLEWAT.length) {
  // Cakupan yang berkurang HARUS terlihat. "Nol pelanggaran" dari audit yang
  // diam-diam melewati halaman terpenting adalah rasa aman yang tak dibayar.
  console.log(`  rute dinamis TERLEWAT : ${DINAMIS_TERLEWAT.length} — beri contoh id lewat env untuk memindainya`)
  for (const r of DINAMIS_TERLEWAT) console.log(`     ${r}`)
}
console.log(`  pelanggaran      : ${total}\n`)

/**
 * CAKUPAN yang runtuh adalah kegagalan, BUKAN kelulusan.
 *
 * ── Kenapa pemeriksaan ini ada
 *
 * Tanpa `LAYAR_EMAIL`/`LAYAR_SANDI`, tiap halaman ber-auth mengalihkan ke
 * `/login`. Audit tetap berjalan sampai selesai dan melaporkan:
 *
 *     halaman dipindai : 1
 *     dialihkan        : 117
 *     pelanggaran      : 2
 *
 * — lalu keluar dengan **exit 0**. Peringatan "hanya halaman publik yang
 * terukur" memang dicetak di awal, tetapi terkubur 120 baris di atas
 * ringkasannya, dan angka "2 pelanggaran" terbaca seperti hasil audit yang
 * berhasil. Dua pelanggaran itu pun artefak: `document-title` dan
 * `html-has-lang` pada kerangka `<html><head></head><body></body></html>`
 * yang kosong.
 *
 * Itu persis yang terjadi 2026-08-11: audit ini dilaporkan "MERAH" di sapuan
 * penjaga padahal ia tak memindai apa pun. Dijalankan dengan kredensial:
 * 97 halaman, 3 pelanggaran NYATA.
 *
 * Penjaga yang gagal senyap lebih berbahaya daripada penjaga yang absen —
 * yang absen setidaknya tak memberi rasa aman palsu.
 */
if (dipindai.length < HALAMAN.length * 0.5) {
  console.error(
    `❌ CAKUPAN RUNTUH: hanya ${dipindai.length} dari ${HALAMAN.length} halaman terpindai ` +
      `(${semua.length - dipindai.length} dialihkan).`,
  )
  console.error('   Angka pelanggaran di atas TIDAK BERMAKNA — sebagian besar')
  console.error('   halaman tak pernah dilihat axe.')
  console.error('')
  console.error('   Hampir selalu sebabnya kredensial:')
  console.error('     LAYAR_EMAIL=… LAYAR_SANDI=… node apps/web/scripts/audit-a11y-runtime.mjs')
  console.error('   Jalankan dari AKAR REPO, bukan dari apps/web.')
  await peramban.close()
  process.exit(2)
}

// Kelompokkan per rule — itu yang menentukan berapa PERBAIKAN, bukan berapa node.
const perRule = new Map()
for (const s of dipindai) {
  for (const v of s.langgar) {
    const k = v.id
    if (!perRule.has(k)) perRule.set(k, { ...v, jumlah: 0, halaman: new Set() })
    const e = perRule.get(k)
    e.jumlah += v.jumlah
    e.halaman.add(s.url)
    if (!e.contoh?.length) e.contoh = v.contoh
  }
}

const URUT = { critical: 0, serious: 1, moderate: 2, minor: 3 }
const daftar = [...perRule.values()].sort(
  (a, b) => (URUT[a.dampak] ?? 9) - (URUT[b.dampak] ?? 9) || b.jumlah - a.jumlah,
)

for (const v of daftar) {
  console.log(`  [${v.dampak}] ${v.id} — ${v.jumlah} node di ${v.halaman.size} halaman`)
  console.log(`     ${v.deskripsi}`)
  if (v.contoh?.[0]) console.log(`     contoh: ${v.contoh[0].html.replace(/\s+/g, ' ')}`)
  console.log(`     halaman: ${[...v.halaman].slice(0, 5).join(', ')}${v.halaman.size > 5 ? ' …' : ''}\n`)
}

const keluar = join(process.cwd(), 'apps', 'web', `.a11y-${mode}.json`)
writeFileSync(keluar, JSON.stringify({ mode, total, halaman: dipindai }, null, 1))
console.log(`  rincian: ${keluar}\n`)

process.exit(total > 0 ? 1 : 0)
