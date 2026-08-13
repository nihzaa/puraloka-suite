#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// BUKTI PERILAKU — lebar halaman ikut layar, tanpa pernah menggeser mendatar.
//
// ── Kenapa ini diuji di peramban, bukan dibaca dari CSS
//
// `clamp(1280px, 82vw, 1800px)` mudah dibaca salah. Yang menentukan bukan
// nilainya melainkan HASILNYA pada tiap lebar layar nyata, dan hasil itu juga
// bergantung lebar sidebar yang menciut sendiri di bawah 900px.
//
// Founder 2026-08-08, memakai layar 2K: *"kanan kirinya ada jarak yg lumayan
// banyak"*. Diukur, dan benar:
//
//     2560px  → tersedia 2340 · isi 1280  →  1060px KOSONG
//
// Batas 1280 lahir dari aturan "±75 karakter per baris". Aturan itu benar
// untuk PROSA satu kolom, tapi halaman ini grid KPI dan tabel — memaksakan
// batas baca ke grid menyempitkan kartu tanpa satu pun manfaat.
//
// ── Tiga hal yang dijaga di tiap resolusi
//
//   1. TAK ADA scroll mendatar. Ini yang paling mahal: begitu muncul, seluruh
//      halaman jadi sulit dipakai, dan gejalanya baru terlihat di layar
//      tertentu saja.
//   2. Isi MENGISI ruang, tepat sebanyak yang dijanjikan tokennya. Lebar
//      terukur dibandingkan dengan `clamp()` yang dihitung ulang di sini,
//      bukan dengan ambang tebakan — lihat `lebarSeharusnya`.
//   3. Widget dashboard ikut melebar. `react-grid-layout` memakai lebar
//      piksel MUTLAK — kalau lebar wadahnya tak diamati, seluruh widget
//      mandek di lebar saat halaman pertama dimuat, dan tak satu pun galat
//      muncul. `--w-form` sendiri sengaja TIDAK ikut melebar: 900px adalah
//      batas mata, dan itu tak berubah walau monitornya 4K.
//
// Pakai (dari apps/web, butuh server :3000 & :3001 hidup):
//   LAYAR_EMAIL=... LAYAR_SANDI=... node scripts/uji-lebar-responsif.mjs
//
// Kredensial LEWAT ENV, tidak pernah ditulis ke berkas — repo ini publik.
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test'

// Port web BUKAN angka tetap — CLAUDE.md §7 mencatat jebakan yang sudah
// memakan empat jam: web di :3007 sementara dokumen menulis :3001, dan tiap
// lapisan menjawab benar untuk dirinya sendiri sehingga tak ada galat yang
// menunjuk penyebabnya. Skrip yang memaku :3000 gagal dengan cara yang sama
// samarnya: ia menunggu #login-email di server yang tak ada, lalu timeout.
const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'

// Resolusi nyata, bukan angka bulat karangan.
const LAYAR = [
  { w: 1366, h: 768,  nama: 'laptop 1366' },
  { w: 1440, h: 900,  nama: 'laptop 1440' },
  { w: 1920, h: 1080, nama: 'FHD' },
  { w: 2560, h: 1440, nama: '2K' },
  { w: 3840, h: 2160, nama: '4K' },
]

const HALAMAN = [
  { url: '/dashboard', jenis: 'luas' },
  { url: '/proyek',    jenis: 'page' },
  { url: '/estimasi',  jenis: 'luas' },
]

/**
 * Lebar yang SEHARUSNYA dihasilkan token, dihitung ulang di sini.
 *
 * ── Kenapa dihitung, bukan dibandingkan ke ambang tebakan
 *
 * Versi pertama uji ini memakai tabel ambang ("di 1920 sisa boleh 400px").
 * Angka-angka itu dikarang dari hasil pengukuran SEBELUM tokennya diperbaiki,
 * jadi ia menguji ingatan saya soal tata letak lama — bukan aturannya. Ia pun
 * langsung salah menuduh: `/proyek` di 1920 melebar ke 1574 (benar, itu
 * `82vw`), tapi tabel menyebutnya boros karena mengharap 1280.
 *
 * Yang benar: hitung ulang `min(clamp(min, ideal·vw, maks), 100%)` di sini,
 * lalu tuntut hasil terukur sama dengan hitungan itu. Kalau seseorang mengubah
 * tokennya, angka di sini HARUS ikut diubah — dan perubahan itu terlihat di
 * diff, bukan lolos diam-diam di balik ambang yang longgar.
 *
 * `vw` mengukur SELURUH viewport, termasuk yang ditutupi sidebar. Itu memang
 * perilaku CSS, dan sengaja tidak dikoreksi: `82vw` dipilih justru karena
 * hasilnya pas SESUDAH sidebar 220px + padding tepi terpotong.
 */
const TOKEN = {
  page: { min: 1280, vw: 0.82, maks: 1800 },
  luas: { min: 1500, vw: 0.92, maks: 2200 },
}

function lebarSeharusnya(jenis, lebarLayar, tersedia) {
  const t = TOKEN[jenis]
  const clamp = Math.min(Math.max(t.min, lebarLayar * t.vw), t.maks)
  // `100%` di sini = lebar induk, yaitu ruang tersedia sesudah sidebar+padding.
  return Math.min(clamp, tersedia)
}

/** Pembulatan sub-piksel peramban — 2px, bukan toleransi tata letak. */
const TOLERANSI_PX = 2

const peramban = await chromium.launch()
let gagal = 0

for (const L of LAYAR) {
  const konteks = await peramban.newContext({ viewport: { width: L.w, height: L.h } })
  const hal = await konteks.newPage()

  await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })
  await hal.waitForSelector('#login-email', { timeout: 60_000 })
  await hal.fill('#login-email', process.env.LAYAR_EMAIL)
  await hal.fill('#login-password', process.env.LAYAR_SANDI)

  // Enter, bukan click: pada 2560×1440 tombol submit pernah berada di luar
  // viewport dan `click()` menggantung 90 detik tanpa satu pun pesan. Enter
  // mengirim formulir tanpa bergantung posisi tombol di layar.
  await hal.press('#login-password', 'Enter')

  try {
    await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60_000 })
  } catch {
    // Gagal login = uji ini tak bisa mengukur apa pun, dan diam-diam melewati
    // satu resolusi lebih berbahaya daripada merah: laporannya akan terbaca
    // "semua hijau" padahal 2K tak pernah diperiksa.
    const galat = await hal.locator('[role=alert]').first()
      .textContent().catch(() => null)
    console.error(`\n❌ ${L.nama}: gagal masuk — ${galat ?? 'tanpa pesan di layar'}`)
    console.error('   Periksa LAYAR_EMAIL/LAYAR_SANDI dan API :3001.')
    await konteks.close()
    gagal++
    continue
  }

  console.log(`\n── ${L.nama} (${L.w}×${L.h})`)

  for (const H of HALAMAN) {
    await hal.goto(`${BASIS}${H.url}`, { waitUntil: 'networkidle', timeout: 60_000 })
    await hal.waitForTimeout(1000)

    const m = await hal.evaluate(() => {
      /*
        Ruang tersedia = lebar `<main>`, BUKAN `innerWidth - sidebar`.

        Versi lama mengurangi `querySelector('aside')` — yang hanya menangkap
        sidebar KIRI. Rail KANAN selebar 300px (pengingat, asisten, kalender)
        tak ikut dikurangi, jadi penjaga ini menuntut isi selebar 1146px di
        ruang yang sebenarnya cuma 846px.

        Akibatnya tujuh pemeriksaan MERAH untuk tata letak yang benar. Diukur
        di peramban 2026-08-13, viewport 1446: main=926, rail kanan=300,
        sidebar=220 — 926+300+220 = 1446, pas. Yang salah alat ukurnya.

        `<main>` menjawabnya tanpa perlu tahu ada berapa rail: apa pun yang
        mengapitnya sudah keluar dari kotaknya.
      */
      const utama = document.querySelector('main')
      const sw = utama
        ? window.innerWidth - utama.getBoundingClientRect().width
        : (document.querySelector('aside')?.getBoundingClientRect().width ?? 0)
      const kandidat = [...document.querySelectorAll('main *')].filter((e) => {
        const s = getComputedStyle(e)
        return s.maxWidth && s.maxWidth !== 'none' && e.getBoundingClientRect().width > 300
      })
      const c = kandidat[0]

      // Widget dashboard: ditempatkan `react-grid-layout` dengan lebar piksel
      // MUTLAK, jadi ia tak ikut melebar saat wadahnya melebar — kecuali
      // lebar wadah benar-benar diamati (lihat `useLebarKontainer`).
      //
      // Diperiksa terpisah karena `maxWidth` widget-nya `none`: penyaring di
      // atas tak akan pernah melihatnya, dan halaman terbaca "hijau" walau
      // seluruh widgetnya berhenti di 1280px. Persis yang terjadi 2026-08-08.
      const wadah = document.querySelector('.react-grid-layout')
      const petak = wadah?.querySelector('.react-grid-item')
      const rglSisa = wadah && petak
        ? Math.round(wadah.getBoundingClientRect().width - petak.getBoundingClientRect().width)
        : null
      return {
        // `scrollWidth > clientWidth` = halaman menggeser mendatar.
        geserMendatar: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        tersedia: Math.round(window.innerWidth - sw),
        isi: c ? Math.round(c.getBoundingClientRect().width) : 0,
        rglSisa,
      }
    })

    const harap = Math.round(lebarSeharusnya(H.jenis, L.w, m.tersedia))
    const selisih = Math.abs(m.isi - harap)
    const okGeser = !m.geserMendatar
    const okLebar = selisih <= TOLERANSI_PX
    // Widget selebar-penuh (`w: 12`) harus menghabiskan wadahnya. Toleransi
    // sama: sub-piksel, bukan tata letak.
    const okRgl = m.rglSisa === null || m.rglSisa <= TOLERANSI_PX
    const ok = okGeser && okLebar && okRgl

    const catatanRgl = m.rglSisa === null ? '' : `  rgl-sisa=${m.rglSisa}`
    console.log(`   ${ok ? '✅' : '❌'} ${H.url.padEnd(12)} tersedia=${String(m.tersedia).padStart(4)} isi=${String(m.isi).padStart(4)} harap=${String(harap).padStart(4)}${catatanRgl}`)
    if (!okGeser) console.log('        ↳ HALAMAN MENGGESER MENDATAR — cacat paling mahal')
    if (!okLebar) console.log(`        ↳ meleset ${selisih}px dari yang dijanjikan token --w-${H.jenis}`)
    if (!okRgl) console.log(`        ↳ widget dashboard menyisakan ${m.rglSisa}px — lebar wadah tak teramati`)
    if (!ok) gagal++
  }

  await konteks.close()
}

await peramban.close()
console.log(gagal === 0
  ? `\n✅ ${LAYAR.length} resolusi × ${HALAMAN.length} halaman: isi mengikuti layar, nol geser mendatar\n`
  : `\n❌ ${gagal} pemeriksaan gagal\n`)
process.exit(gagal === 0 ? 0 : 1)
