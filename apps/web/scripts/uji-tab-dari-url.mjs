#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// BUKTI PERILAKU — `?tab=` benar-benar membuka tab itu, bukan tab pertama.
//
// ── Kenapa ini perlu diuji di peramban
//
// `lib/use-tab-url.ts` punya 7 unit test, dan seluruhnya lulus dengan router
// yang didudukkan. Yang TIDAK bisa dijawabnya: apakah halaman sungguhan
// memakainya, apakah `<Suspense>` sudah terpasang, dan apakah tab yang terbuka
// memang yang diminta URL.
//
// ── Lolos palsu yang sudah pernah terjadi
//
// Versi pertama uji ini memeriksa `body.includes("Neraca")` — dan HIJAU untuk
// semua tab, karena nama tiap tab muncul di daftar tabnya sendiri. Ia
// membuktikan halamannya termuat, bukan tabnya berpindah.
//
// Sekarang yang diperiksa `aria-selected="true"` pada tombol tab. Atribut itu
// ditambahkan bersama uji ini — sebelumnya tab aktif hanya ditandai warna dan
// garis bawah, yang tak terlihat pembaca layar DAN tak bisa diuji.
//
// Pakai (dari apps/web, butuh server :3000 & :3001 hidup):
//   LAYAR_EMAIL=... LAYAR_SANDI=... node scripts/uji-tab-dari-url.mjs
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

// Dua nama parameter, karena dua jenis pemisahan:
//   `tab`     — bagian dari halaman yang memang sudah bertab sejak awal
//   `bagian`  — modul di halaman yang memuat beberapa modul sekaligus
const KASUS = [
  { url: '/akuntansi', tab: 'besar' },
  { url: '/akuntansi', tab: 'laporan' },
  { url: '/laporan', tab: 'wip' },
  { url: '/laporan', tab: 'pajak' },
  { url: '/estimasi', tab: 'harga' },
  { url: '/estimasi', tab: 'varians' },
  { url: '/dokumen/kendali', tab: 'notulen', param: 'bagian' },
  { url: '/dokumen/kendali', tab: 'transmittal', param: 'bagian' },
  { url: '/kepatuhan', tab: 'evaluasi', param: 'bagian' },
  { url: '/procurement/lanjutan', tab: 'nota', param: 'bagian' },
  { url: '/jadwal', tab: 'histogram', param: 'bagian' },
  { url: '/jadwal', tab: 'method', param: 'bagian' },
  { url: '/aset', tab: 'sewa' },
]

const peramban = await chromium.launch()
const konteks = await peramban.newContext({ viewport: { width: 1440, height: 900 } })
const hal = await konteks.newPage()

await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })
await hal.waitForSelector('#login-email', { timeout: 60_000 })
await hal.fill('#login-email', process.env.LAYAR_EMAIL)
await hal.fill('#login-password', process.env.LAYAR_SANDI)
await hal.click('button[type=submit]')
await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90_000 })

let gagal = 0

for (const k of KASUS) {
  await hal.goto(`${BASIS}${k.url}?${k.param ?? 'tab'}=${k.tab}`, { waitUntil: 'networkidle', timeout: 60_000 })
  await hal.waitForTimeout(1200)

  // Dua pola penanda, keduanya sah dan keduanya lulus a11y:
  //   role="tab" + aria-selected   (/laporan, /estimasi)
  //   tombol-tekan + aria-pressed  (/akuntansi)
  //
  // `data-tab` menyatukan keduanya untuk keperluan uji. Versi pertama skrip ini
  // hanya memeriksa `aria-selected`, jadi /akuntansi jatuh ke pemeriksaan
  // longgar "judul ada" — dan itu HIJAU meski tabnya tak berpindah sama sekali.
  const terpilih =
    (await hal.locator('[role=tab][aria-selected=true]').first()
      .getAttribute('data-tab').catch(() => null)) ??
    (await hal.locator('[aria-pressed=true]').first()
      .getAttribute('data-tab').catch(() => null))

  const ok = terpilih === k.tab
  console.log(`  ${(k.url + '?' + (k.param ?? 'tab') + '=' + k.tab).padEnd(38)} terpilih=${String(terpilih).padEnd(12)} ${ok ? '✅' : '❌'}`)
  if (!ok) gagal++
}

// Nilai tak dikenal TIDAK boleh merusak halaman: URL datang dari luar.
for (const u of ['/laporan', '/estimasi', '/kepatuhan']) {
  await hal.goto(`${BASIS}${u}?tab=ngawur`, { waitUntil: 'networkidle', timeout: 60_000 })
  await hal.waitForTimeout(1000)
  const isi = await hal.locator('body').innerText()
  const ok = isi.length > 300
  console.log(`  ${(u + '?tab=ngawur').padEnd(28)} ${ok ? '✅ halaman tetap tampil' : '❌ halaman rusak'}`)
  if (!ok) gagal++
}

await peramban.close()
console.log(gagal === 0 ? '\n✅ SEMUA LULUS\n' : `\n❌ ${gagal} gagal\n`)
process.exit(gagal === 0 ? 0 : 1)
