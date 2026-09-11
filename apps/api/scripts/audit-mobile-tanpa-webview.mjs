#!/usr/bin/env node
/**
 * PENJAGA — APLIKASI MOBILE TIDAK BOLEH MEMAKAI WEBVIEW LAGI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — keputusan founder 2026-09-11
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     "saya gamau ada webview lagi, suka gagal dan ga nampil"
 *
 * Diukur ke produksi pada hari yang sama, dan keluhannya benar — SEMUA
 * modul, bukan sebagian:
 *
 *     app.puraloka-suite.duckdns.org/keuangan       307 → /login
 *     …procurement · gudang · mutu · k3             307 → /login
 *
 * ── KENAPA PENJAGA LAIN HIJAU SELAMA ITU
 *
 * `audit-sesi-webview-nyambung.mjs` memeriksa bahwa NAMA cookie yang
 * ditulis WebView sama dengan yang dibaca `middleware.ts`. Itu memang
 * benar, dan ia hijau dengan jujur — batasnya tertulis di kepalanya
 * sendiri: *"ini sambungan NAMA, bukan bukti sesi hidup"*.
 *
 * `audit-modul-mobile-nyata.mjs` juga hijau: ketujuh belas modul memang
 * menunjuk halaman web yang ADA. Yang tak bisa dilihat keduanya adalah
 * apakah halamannya TAMPIL.
 *
 * Dua penjaga yang keduanya benar, dan cacatnya hidup di antara mereka.
 *
 * ── KENAPA ARSITEKTURNYA MEMANG RAPUH, BUKAN SEKADAR SALAH SETEL
 *
 * Tiga lapis yang masing-masing sah sendiri:
 *
 *   1. `web/[modul].tsx` menanam token ke `localStorage` + header
 *   2. `middleware.ts` menggerbang lewat `request.cookies`
 *   3. middleware Next.js berjalan di SERVER, sebelum satu baris JS
 *      halaman ada — `localStorage` belum berwujud di sana
 *
 * Yang patah cuma sambungannya, dan bentuk kegagalan itu tak menghasilkan
 * galat di lapisan mana pun. Memperbaikinya berarti menambah lapis
 * keempat; menghapusnya menghilangkan ketiganya sekaligus.
 *
 * Layar native memanggil API dengan header `Authorization` yang sama
 * seperti layar native lain yang sudah terbukti bekerja setiap hari.
 *
 * ── YANG DIPERIKSA
 *
 *   1. nol `import`/`require` dari `react-native-webview` di apps/mobile
 *   2. `react-native-webview` tak ada di `dependencies` package.json —
 *      paket yang terpasang mengundang pemakaian berikutnya, dan menambah
 *      unduhan ke tiap APK tanpa satu baris pun memakainya
 *   3. nol berkas rute `app/(app)/web/**` — pintu masuknya sendiri
 *   4. nol `Tabs.Screen name="web/…"` tertinggal di layout — layar
 *      terdaftar yang berkasnya tak ada memberi galat rute yang menuduh
 *      navigasi, bukan berkas yang hilang
 *
 * ⚠ BATAS YANG JUJUR: yang dibaca KODE, bukan APK. Penjaga ini tak tahu
 * apakah sebuah paket lain menarik WebView sebagai dependensi transitif,
 * dan tak bisa melihat isi bundle. Yang dijamin: WebView tak kembali lewat
 * kode yang ditulis di repo ini.
 *
 * ── AMBANG NOL
 *
 * Tak ada nilai parsial. Satu WebView yang kembali berarti kelas kegagalan
 * yang sama kembali utuh — dan gejalanya, seperti sebelumnya, adalah layar
 * kosong tanpa galat.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const AKAR_MOBILE = join(AKAR_REPO, 'apps', 'mobile')

if (!existsSync(AKAR_MOBILE)) {
  console.log('⏭  mobile tanpa WebView: DILEWATI (apps/mobile tak ada)')
  process.exit(0)
}

/** Semua berkas sumber di apps/mobile, tanpa node_modules & artefak build. */
function berkasSumber(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama === '.expo' || nama === 'dist') continue
    if (nama === '.uji-bundle' || nama === '.layar') continue
    const p = join(dir, nama)
    if (statSync(p).isDirectory()) berkasSumber(p, keluar)
    else if (/\.(ts|tsx|js|jsx)$/.test(nama)) keluar.push(p)
  }
  return keluar
}

const pelanggaran = []
const sumber = berkasSumber(AKAR_MOBILE)

/*
  ── 1. Pemakaian di kode ───────────────────────────────────────────────

  ⚠ Yang dicari `import`/`require`, BUKAN sekadar teks "webview".

  Berkas ini sendiri, dan komentar di `lainnya.tsx`/`_layout.tsx`, menyebut
  kata itu berkali-kali untuk MENERANGKAN kenapa ia tak dipakai. Penjaga
  yang memindai teks telanjang akan merah atas penjelasannya sendiri —
  kelas cacat yang sudah tercatat di CLAUDE.md §8a.2 ("komentar yang
  menyebut hal terlarang untuk menjelaskan kenapa ia TIDAK dipakai").
*/
for (const f of sumber) {
  const isi = readFileSync(f, 'utf8').replace(/\r/g, '')
  const baris = isi.split('\n')
  baris.forEach((b, i) => {
    const kode = b.replace(/\/\/.*$/, '')
    if (/(?:^|\s)import\s[\s\S]*?['"]react-native-webview['"]/.test(kode)
      || /require\(\s*['"]react-native-webview['"]\s*\)/.test(kode)
      || /from\s+['"]react-native-webview['"]/.test(kode)) {
      pelanggaran.push({
        jenis: 'impor',
        berkas: relative(AKAR_REPO, f).replace(/\\/g, '/'),
        baris: i + 1,
      })
    }
  })
}

/* ── 2. Dependensi terpasang ──────────────────────────────────────────── */
const pkgPath = join(AKAR_MOBILE, 'package.json')
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  for (const medan of ['dependencies', 'devDependencies']) {
    if (pkg[medan]?.['react-native-webview']) {
      pelanggaran.push({
        jenis: 'paket',
        berkas: 'apps/mobile/package.json',
        detail: `${medan}.react-native-webview = ${pkg[medan]['react-native-webview']}`,
      })
    }
  }
}

/* ── 3. Berkas rute WebView ───────────────────────────────────────────── */
const dirWeb = join(AKAR_MOBILE, 'app', '(app)', 'web')
if (existsSync(dirWeb)) {
  pelanggaran.push({
    jenis: 'rute',
    berkas: 'apps/mobile/app/(app)/web/',
    detail: 'direktori rute WebView masih ada',
  })
}

/* ── 4. Pendaftaran layar yang tertinggal ─────────────────────────────── */
for (const f of sumber) {
  if (!/_layout\.tsx?$/.test(f)) continue
  const isi = readFileSync(f, 'utf8').replace(/\r/g, '')
  const m = isi.match(/name=["']web\/[^"']*["']/)
  if (m) {
    pelanggaran.push({
      jenis: 'layout',
      berkas: relative(AKAR_REPO, f).replace(/\\/g, '/'),
      detail: `${m[0]} — layar terdaftar tanpa berkas`,
    })
  }
}

console.log('══ Mobile tanpa WebView ═══════════════════════════════════════')
console.log(`  berkas sumber dipindai : ${sumber.length}`)
console.log(`  pelanggaran            : ${pelanggaran.length}`)
console.log('  ambang                 : 0')

if (pelanggaran.length === 0) {
  console.log('\n✅ Nol WebView di apps/mobile — modul dibuka lewat layar native.')
  process.exit(0)
}

console.error('\n❌ WebView kembali ke apps/mobile:\n')
for (const p of pelanggaran) {
  console.error(`   [${p.jenis}] ${p.berkas}${p.baris ? `:${p.baris}` : ''}`)
  if (p.detail) console.error(`        ${p.detail}`)
}
console.error(`
   Keputusan founder 2026-09-11: tidak ada WebView lagi — "suka gagal dan
   ga nampil". Diukur ke produksi: SELURUH 17 modul menjawab 307 → /login.

   Yang membuatnya tak layak dipertahankan bukan satu bug, melainkan
   bentuknya: TIGA lapis yang masing-masing benar sendiri (token di klien,
   gerbang cookie di middleware, SSR yang berjalan sebelum JS halaman ada),
   dan yang patah cuma sambungannya — tanpa galat di lapisan mana pun.

   Modul baru dibangun sebagai LAYAR NATIVE. Polanya ada di
   apps/mobile/app/(app)/persetujuan/index.tsx — FlatList + React.memo,
   token tema, galat muat terpisah dari keadaan kosong.

   Melemahkan penjaga ini butuh ratifikasi (Gerbang Keras G-5).`)
process.exit(1)
