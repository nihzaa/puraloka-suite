#!/usr/bin/env node
/**
 * BANDING SHELL — memotret sidebar + topbar dalam DUA kandidat, supaya
 * founder memutuskan dari GAMBAR, bukan dari daftar perbedaan di teks.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder bertanya: *"topbar dan sidebar sudah kamu samakan?"* Jawabannya
 * belum — dan perbedaannya bukan satu hal, melainkan enam. Menuliskannya
 * sebagai daftar akan mengulang kesalahan usul indigo (§10d): argumen yang
 * rapi di atas kertas, lalu ternyata tidak menyatu begitu dirender.
 *
 * `ARAH-VISUAL-2026.md` §10 mengikat: usul visual yang bertentangan dengan
 * keputusan yang sudah turun **dibangun sebagai perbandingan berdampingan,
 * bukan diterapkan**. Berkas ini adalah perbandingan itu.
 *
 * ── Apa yang DITIRU dan apa yang TIDAK
 *
 * Ditiru dari referensi BuildAxis:
 *   1. item sub-menu aktif  = pill NAVY PEKAT + teks putih (kita: navy muda
 *                             + teks navy + garis kiri 3px)
 *   2. pencarian            = lebar di KIRI, dekat logo (kita: menciut di kanan)
 *   3. tinggi topbar        = 60px (kita: 56px)
 *   4. jarak antar item nav = lebih lega
 *
 * TIDAK ditiru, dan ini disengaja:
 *   - **sidebar gelap permanen** — sudah DITOLAK founder (§5d dicoret):
 *     *"tergantung mode-nya, dark atau light"*. Sidebar ikut tema.
 *   - **warna aksen selain navy** — indigo sudah ditolak sesudah dilihat
 *     (§10d). Pill aktif memakai `--navy`, bukan warna baru.
 *   - **ikon amplop & tanda tanya** di topbar — kita belum punya kotak masuk
 *     maupun pusat bantuan. Ikon yang tak melakukan apa-apa adalah janji
 *     yang tak ditepati; itu justru cacat yang sedang kita hindari.
 *
 * ── Kenapa override, bukan mengubah kode
 *
 * Sama alasannya dengan `banding-aksen.mjs`: yang belum diputuskan tak boleh
 * mengubah 1.051 baris `sidebar.tsx`. Override disuntik lewat `addStyleTag`
 * saat memotret; kodenya tidak berubah satu byte pun.
 *
 * ── Kenapa dua mode
 *
 * `--navy` berbalik jadi biru TERANG (#4D9FFF) di mode gelap. Pill navy pekat
 * yang bagus di mode terang bisa jadi blok menyilaukan di mode gelap — dan
 * cacat kontras seperti itu baru terlihat kalau dirender. Hari ini saja sudah
 * satu kali terjadi (`--on-merek` vs `--on-navy`, 2,72:1).
 *
 * Jalankan (dari ROOT repo):
 *   LAYAR_EMAIL=... LAYAR_SANDI=... node apps/web/scripts/banding-shell.mjs
 *
 * Hasil: `apps/web/.layar/banding-shell/<kandidat>-<mode>.png`
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI
const URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : '/dashboard'

if (!EMAIL || !SANDI) {
  console.error('Butuh LAYAR_EMAIL dan LAYAR_SANDI.')
  process.exit(1)
}

const KELUARAN = join('apps', 'web', '.layar', 'banding-shell')
mkdirSync(KELUARAN, { recursive: true })

/**
 * Kandidat B — "lebih dekat referensi".
 *
 * Ditulis sebagai CSS override, bukan edit komponen. Selector-nya sengaja
 * longgar (elemen aside/header, bukan nama kelas) supaya tak bergantung pada
 * kelas yang bisa berubah; ini alat sekali-pakai, bukan kode produksi.
 */
/*
 * Ditulis dengan array + join, BUKAN template literal.
 *
 * Kenapa: CSS custom property (`var(-` + `-navy)`) di dalam template literal
 * membuat parser JS membaca `--` sebagai operator decrement, dan berkasnya
 * gagal di-parse: "Invalid left-hand side expression in postfix operation".
 * Menyusun tokennya lewat konstanta menghindari seluruh masalah itu.
 */
const V = (nama) => 'var(-' + '-' + nama + ')'

const OVERRIDE_B = [
  /* 1. Topbar sedikit lebih tinggi — referensi 60px, kita 56px. */
  'header { height: 60px !important; }',

  /*
   * 2. Item aktif = pill NAVY PEKAT + teks putih, tanpa garis kiri.
   *    Memakai token on-navy (BUKAN on-merek): ia ikut berbalik jadi teks
   *    GELAP di mode gelap, tempat navy menjadi biru terang. Salah token di
   *    sini memberi 2,72:1 — cacat yang persis terjadi hari ini.
   */
  'aside a[aria-current="page"] {',
  '  background: ' + V('navy') + ' !important;',
  '  color: ' + V('on-navy') + ' !important;',
  '  border-left-color: transparent !important;',
  '  font-weight: 600 !important;',
  '}',
  'aside a[aria-current="page"] svg { color: ' + V('on-navy') + ' !important; }',

  /* 3. Item nav lebih lega — referensi bernapas, kita rapat. */
  'aside a, aside button { min-height: 38px !important; }',
].join('\n')

const KANDIDAT = [
  { nama: 'A-kini', css: '' },
  { nama: 'B-mirip-referensi', css: OVERRIDE_B },
]

const peramban = await chromium.launch()

for (const mode of ['terang', 'gelap']) {
  const konteks = await peramban.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: mode === 'gelap' ? 'dark' : 'light',
  })
  // next-themes membaca localStorage; `colorScheme` saja menghasilkan
  // "mode gelap" yang isinya putih (tangkap-layar.mjs:101).
  await konteks.addInitScript(
    (g) => localStorage.setItem('theme', g ? 'dark' : 'light'),
    mode === 'gelap',
  )

  const hal = await konteks.newPage()
  await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })
  await hal.waitForSelector('#login-email', { state: 'visible', timeout: 15_000 })
  await hal.fill('#login-email', EMAIL)
  await hal.fill('#login-password', SANDI)
  await hal.click('button[type=submit]')
  await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25_000 })

  for (const k of KANDIDAT) {
    await hal.goto(`${BASIS}${URL}`, { waitUntil: 'domcontentloaded' })
    if (k.css) await hal.addStyleTag({ content: k.css })
    await hal.waitForTimeout(3200)

    const berkas = join(KELUARAN, `${k.nama}-${mode}.png`)
    // Dipotong ke pojok kiri-atas: yang dibandingkan sidebar + topbar,
    // bukan isi halaman. Memotret seluruh halaman membuat perbedaan 40px
    // tenggelam di antara 5.000px konten.
    await hal.screenshot({ path: berkas, clip: { x: 0, y: 0, width: 1180, height: 780 } })
    console.log(`✓ ${berkas}`)
  }

  await konteks.close()
}

await peramban.close()
console.log(`\nEmpat gambar di ${KELUARAN} — 2 kandidat x 2 mode.`)
