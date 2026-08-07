#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// BUKTI PERILAKU — halaman yang kemarin yatim kini terjangkau DAN berisi.
//
// ── Kenapa ini ada, padahal `audit-nav-yatim.mjs` sudah menjaga
//
// Penjaga itu membuktikan href menunjuk halaman yang ADA. Ia TIDAK membuktikan
// halaman itu menampilkan sesuatu. Menu bisa menunjuk `/jadwal` yang benar-benar
// ada, sementara halamannya masih placeholder "segera hadir" — dan penjaga tetap
// hijau. Persis kelas cacat yang membuat 20 menu kemarin membohongi pengguna.
//
// Yang diperiksa di sini hanya bisa dijawab peramban nyata:
//   1. halamannya termuat sesudah login sungguhan
//   2. ia BUKAN halaman placeholder
//   3. isinya memuat penanda modulnya (CPM, Transmittal, Payung, …)
//
// ── Positif palsu yang sudah pernah terjadi
//
// Pola pertama mencocokkan "belum dikerjakan" dan MENUDUH /dokumen/kendali
// sebagai placeholder — padahal frasa itu ada di kalimat sah halaman ("butir
// rapat mana yang belum dikerjakan"). Halaman yang membahas status pekerjaan
// akan selalu memuat kata semacam itu. Yang dicari PENANDA placeholder, bukan
// kata lepas di dalam prosa.
//
// Pakai (dari apps/web, butuh server :3000 & :3001 hidup):
//   LAYAR_EMAIL=... LAYAR_SANDI=... node scripts/uji-nav-terjangkau.mjs
//
// Kredensial LEWAT ENV, tidak pernah ditulis ke berkas — repo ini publik.
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test'

const BASIS = 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI
const KELUAR = 'E:/Project/puraloka-suite/apps/web/.layar'

const HALAMAN = [
  { url: '/jadwal', nama: 'jadwal', tanda: ['CPM', 'Jalur Kritis', 'Kalender'] },
  { url: '/kepatuhan', nama: 'kepatuhan', tanda: ['Kepatuhan', 'Izin Kerja'] },
  { url: '/aset/operasional', nama: 'aset-operasional', tanda: ['Alat', 'Perawatan'] },
  { url: '/dokumen/kendali', nama: 'dokumen-kendali', tanda: ['Transmittal', 'Gambar'] },
  { url: '/procurement/lanjutan', nama: 'procurement-lanjutan', tanda: ['Payung', 'Expediting'] },
]

const peramban = await chromium.launch()
const konteks = await peramban.newContext({ viewport: { width: 1440, height: 950 } })
const hal = await konteks.newPage()

await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })
await hal.waitForSelector('#login-email', { timeout: 20_000 })
await hal.fill('#login-email', EMAIL)
await hal.fill('#login-password', SANDI)
await hal.click('button[type=submit]')
await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })

let gagal = 0
for (const h of HALAMAN) {
  await hal.goto(`${BASIS}${h.url}`, { waitUntil: 'networkidle', timeout: 30_000 })
  await hal.waitForTimeout(1200)
  const teks = await hal.locator('body').innerText()

  // Yang paling penting: BUKAN halaman "segera hadir".
  //
  // Pola pertama saya mencocokkan "belum dikerjakan" dan MENUDUH
  // /dokumen/kendali sebagai placeholder — padahal frasa itu muncul di
  // kalimat sah halaman ("butir rapat mana yang belum dikerjakan").
  // Pencocokan kata lepas pada halaman yang memang membahas status pekerjaan
  // akan selalu punya positif palsu; yang dicari adalah PENANDA halaman
  // placeholder, bukan kata di dalam prosa.
  const comingSoon = /Segera Hadir|Fitur ini belum digarap|Belum Digarap/.test(teks)
  const adaIsi = h.tanda.some((t) => teks.includes(t))

  console.log(`\n── ${h.url}`)
  console.log(`   ${comingSoon ? '❌ masih halaman "segera hadir"' : '✅ bukan halaman "segera hadir"'}`)
  console.log(`   ${adaIsi ? '✅ isinya nyata' : '❌ tak ada penanda isi'} (${h.tanda.join('/')})`)
  if (comingSoon || !adaIsi) gagal++

  await hal.screenshot({ path: `${KELUAR}/nav-${h.nama}.png`, fullPage: false })
  console.log(`   📷 nav-${h.nama}.png`)
}

await peramban.close()
console.log(`\n${gagal === 0 ? '✅ SEMUA TERJANGKAU & BERISI' : `❌ ${gagal} gagal`}\n`)
process.exit(gagal === 0 ? 0 : 1)
