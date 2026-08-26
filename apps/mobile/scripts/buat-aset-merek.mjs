#!/usr/bin/env node
/**
 * ASET MEREK MOBILE — ikon, splash, dan ikon adaptif, digambar dari LAMBANG
 * YANG SAMA dengan yang dipakai web.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIBANGKITKAN, BUKAN DISIMPAN SEBAGAI PNG SAJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-27: `app.json` menunjuk ./assets/icon.png, splash.png, dan
 * adaptive-icon.png — dan direktori `assets/` TIDAK ADA sama sekali. Artinya
 * `eas build` gagal sebelum sempat memanggil compiler, dan tak ada satu pun
 * APK yang pernah bisa dibuat. Penahan itu tak tercatat di RILIS-MOBILE.md,
 * yang justru mengaku sudah menutup semua penahan rilis.
 *
 * PNG yang ditaruh manual akan mengulang cacat kelas yang sama dengan yang
 * sudah dijelaskan di `logo-puraloka.tsx`: berkas terpisah selalu lupa
 * diperbarui bersama-sama. Kalau lambangnya berubah, yang berubah cuma web,
 * dan HP mandor membawa logo lama selamanya tanpa ada yang sadar.
 *
 * Di sini path-nya DISALIN SATU KALI dari `apps/web/public/puraloka-lambang.svg`
 * dan dijaga `audit-aset-merek-sinkron.mjs` — kalau web berubah dan berkas ini
 * tidak, CI merah. Itu yang membuat "satu sumber" jadi fakta, bukan niat.
 *
 * ── Kenapa Playwright, bukan sharp/resvg
 *
 * Keduanya TIDAK terpasang di repo ini (diukur: `ls node_modules | grep sharp`
 * → nol). `@playwright/test` sudah ada BESERTA browsernya, dan sudah dipakai
 * `banding-aksen.mjs` untuk keperluan yang sama persis: merender lalu memotret.
 * Menambah dependensi biner untuk pekerjaan yang bisa dilakukan alat yang
 * sudah terpasang hanya menambah pihak yang harus dirawat.
 *
 * Jalankan:  node apps/mobile/scripts/buat-aset-merek.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const ASET = join(DIR, '..', 'assets')

/*
  Path lambang — DISALIN PERSIS dari apps/web/public/puraloka-lambang.svg.
  viewBox 120×152. Jangan disunting sebelah tangan; ubah di web lalu jalankan
  ulang skrip ini, dan penjaga sinkron akan mencocokkan keduanya.
*/
export const BADAN = [
  'M6 58 a13 13 0 0 1 13-13 h2 v58 a32 32 0 0 1-15-5 z',
  'M32 44 a13 13 0 0 1 13-13 h2 v72 a42 42 0 0 1-15-2 z',
  'M58 28 a13 13 0 0 1 13-13 h2 v83 a50 50 0 0 1-15 5 z',
  'M84 15 a13 13 0 0 1 13-13 h2 v73 a54 54 0 0 1-15 16 z',
]
export const ALAS = [
  'M6 112 a38 38 0 0 0 15 6 v34 H6 z',
  'M32 118 a46 46 0 0 0 15 2 v32 H32 z',
  'M58 120 a50 50 0 0 0 15-5 v37 H58 z',
  'M84 115 a54 54 0 0 0 15-16 v53 H84 z',
]

const NAVY = '#003366'

/*
  ⚠ viewBox DIPANGKAS ke kotak-batas SUNGGUHAN, bukan `0 0 120 152`.

  Diukur lewat `getBBox()` pada path yang sama persis: isinya menempati
  x 6→99, y 2→152. Artinya di dalam viewBox aslinya ada sisa 6px di kiri
  tetapi 21px di KANAN — lambangnya tidak berada di tengah kotaknya sendiri.

  Di web itu tak pernah terlihat: `logo-puraloka.tsx` menaruhnya di samping
  teks, jadi sisa ruang kanan terbaca sebagai jarak antar-elemen. Di ikon
  aplikasi — satu-satunya isi di tengah bidang bujur sangkar — sisa yang tak
  simetris itu membuat lambang tampak melenceng ke kanan-bawah. Terlihat
  jelas pada render pertama 2026-08-27.

  Yang dipangkas hanya BINGKAINYA. Path-nya tetap identik dengan web, jadi
  penjaga sinkron tetap sah membandingkan keduanya.
*/
const KOTAK = { x: 6, y: 2, w: 93, h: 150 }
const NISBAH = KOTAK.w / KOTAK.h  // 0,62 — lebih tinggi daripada lebar

function lambang(warna) {
  const paths = [...BADAN, ...ALAS].map((d) => `<path d="${d}"/>`).join('')
  return `<svg viewBox="${KOTAK.x} ${KOTAK.y} ${KOTAK.w} ${KOTAK.h}" xmlns="http://www.w3.org/2000/svg"><g fill="${warna}">${paths}</g></svg>`
}

/**
 * Satu halaman = satu aset. `lebar`/`tinggi` dalam piksel FISIK — Expo tak
 * menskala ulang, jadi ukuran di sini adalah ukuran yang dipakai.
 */
async function potret(browser, { nama, lebar, tinggi, html }) {
  const page = await browser.newPage({
    viewport: { width: lebar, height: tinggi },
    deviceScaleFactor: 1,
  })
  await page.setContent(
    `<html><body style="margin:0;width:${lebar}px;height:${tinggi}px;overflow:hidden">${html}</body></html>`,
  )
  const buf = await page.screenshot({ omitBackground: false })
  writeFileSync(join(ASET, nama), buf)
  await page.close()
  console.log(`  OK ${nama.padEnd(24)} ${lebar}x${tinggi}`)
}

async function main() {
  mkdirSync(ASET, { recursive: true })
  const browser = await chromium.launch()
  console.log('\n== Aset merek mobile ==========================================\n')

  /*
    IKON — lambang putih di atas navy, sudut dibiarkan PERSEGI.

    Android & iOS memotong sendiri sudutnya (bulat, superellipse, atau
    lingkaran tergantung peluncur). Ikon yang sudah dibulatkan lebih dulu
    akan terpotong DUA KALI dan meninggalkan sudut putih — cacat yang hanya
    terlihat sesudah terpasang di HP.
  */
  /*
    Ukuran ditentukan dari TINGGI, bukan lebar: lambangnya lebih tinggi
    daripada lebar (nisbah 0,62). Menyetel lebar 44% akan membuat tingginya
    71% — melewati batas aman peluncur dan terpotong di HP berbentuk
    lingkaran.
  */
  /*
    ⚠ ANGKAT OPTIS — lambang digeser NAIK ~3% dari titik tengah geometris.

    Bobot visualnya menumpuk di ATAS (empat pilar tinggi), sementara bagian
    bawah cuma alas pendek berselang celah. Ditaruh persis di tengah secara
    matematis, ia terbaca MELOROT — mata membaca pusat massa, bukan kotak
    batas. Ini koreksi baku pada penataan lambang, sama seperti huruf bulat
    yang sengaja dibuat melewati garis dasar.
  */
  const ikonHtml = (px) => {
    const tinggi = Math.round(px * 0.56)
    return `
    <div style="width:${px}px;height:${px}px;background:${NAVY};
                display:flex;align-items:center;justify-content:center">
      <div style="height:${tinggi}px;width:${Math.round(tinggi * NISBAH)}px;
                  margin-bottom:${Math.round(px * 0.03)}px">${lambang('#FFFFFF')}</div>
    </div>`
  }

  await potret(browser, { nama: 'icon.png', lebar: 1024, tinggi: 1024, html: ikonHtml(1024) })

  /*
    IKON ADAPTIF (Android) — lambang HARUS lebih kecil lagi.

    Android memutar foreground di dalam "safe zone" 66% dari bidang; apa pun
    di luar itu bisa terpotong peluncur berbentuk lingkaran. Latarnya
    dikosongkan (transparan) karena `adaptiveIcon.backgroundColor` di app.json
    yang mengisinya — menggambar navy DI SINI membuat lapisannya dobel dan
    tepinya kotor saat peluncur menganimasikan ikon.
  */
  const adaptifHtml = `
    <div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center">
      <div style="height:600px;width:${Math.round(600 * NISBAH)}px;margin-bottom:31px">${lambang('#FFFFFF')}</div>
    </div>`
  await potret(browser, { nama: 'adaptive-icon.png', lebar: 1024, tinggi: 1024, html: adaptifHtml })

  /*
    SPLASH — `resizeMode: contain` di app.json, jadi gambar ini diletakkan
    UTUH di tengah dan sisanya diisi backgroundColor navy. Karena itu splash
    digambar sebagai bidang navy penuh dengan lambang di tengah: berapa pun
    nisbah layar HP, sambungannya tak terlihat.

    1284x2778 = iPhone 14 Pro Max, cukup besar untuk diturunkan ke HP mana pun
    tanpa pecah.

    Wordmark diikutkan karena splash adalah satu-satunya layar yang dilihat
    SEBELUM login — mandor yang baru dipasangkan aplikasinya oleh orang kantor
    perlu tahu ini aplikasi apa. Di ikon, wordmark justru dibuang: pada 48px
    ia jadi noda abu yang tak terbaca.
  */
  const splashHtml = `
    <div style="width:1284px;height:2778px;background:${NAVY};
                display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div style="height:520px;width:${Math.round(520 * NISBAH)}px;margin-bottom:72px">${lambang('#FFFFFF')}</div>
      <div style="font-family:'Segoe UI',system-ui,sans-serif;color:#FFFFFF;
                  font-size:76px;font-weight:700;letter-spacing:-1.5px">Puraloka</div>
      <div style="font-family:'Segoe UI',system-ui,sans-serif;color:#7FA8CC;
                  font-size:34px;font-weight:500;letter-spacing:7px;margin-top:14px">PERSADA</div>
    </div>`
  await potret(browser, { nama: 'splash.png', lebar: 1284, tinggi: 2778, html: splashHtml })

  /*
    IKON NOTIFIKASI (Android) — SILUET PUTIH DI ATAS TRANSPARAN, bukan
    lambang berwarna.

    Android 5+ membuang seluruh warna ikon notifikasi dan hanya memakai kanal
    alfa-nya. Ikon berlatar navy karena itu tampil sebagai KOTAK PUTIH PENUH
    di baki status — bukan galat, tak ada yang memperingatkan, dan hanya
    terlihat di HP sungguhan.
  */
  const notifHtml = `
    <div style="width:256px;height:256px;display:flex;align-items:center;justify-content:center">
      <div style="height:190px;width:${Math.round(190 * NISBAH)}px">${lambang('#FFFFFF')}</div>
    </div>`
  await potret(browser, { nama: 'notification-icon.png', lebar: 256, tinggi: 256, html: notifHtml })

  await browser.close()
  console.log('\n  Tersimpan di apps/mobile/assets/\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
