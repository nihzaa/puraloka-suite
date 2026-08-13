#!/usr/bin/env node
/**
 * POTRET SATU BAGIAN halaman — pelengkap `tangkap-layar.mjs`, bukan penggantinya.
 *
 * ── Kenapa ada
 *
 * `tangkap-layar.mjs` memotret `fullPage`, dan itu benar untuk menilai halaman
 * sebagai keseluruhan. Tetapi begitu halamannya panjang, gambarnya diperkecil
 * saat dibaca — dan panel yang mau dinilai tinggal setinggi beberapa ratus
 * piksel dari gambar 3200px. Teksnya tak terbaca, dan penilaian visual atas
 * gambar yang tak terbaca adalah penilaian yang dikarang.
 *
 * Itu terjadi 2026-08-10: panel template WhatsApp dinyatakan "sudah dilihat"
 * dari tangkapan fullPage, padahal yang benar-benar terbaca hanya bagian
 * atasnya. Berkas ini menggulir ke penanda lalu memotret VIEWPORT — apa yang
 * dilihat pemakai saat ia sampai di bagian itu.
 *
 * ── Pemakaian (dari root repo, seperti `tangkap-layar.mjs`)
 *
 *   LAYAR_EMAIL=… LAYAR_SANDI=… \
 *     node apps/web/scripts/potret-bagian.mjs /pengaturan/whatsapp "Isi pesan" keluar.png
 *
 * Di Git Bash, awali dengan `MSYS_NO_PATHCONV=1` — tanpa itu argumen berawalan
 * `/` diterjemahkan jadi path Windows dan URL-nya rusak.
 */
import { chromium } from '@playwright/test'

const [URL, PENANDA, KELUAR] = process.argv.slice(2)
// Port web BUKAN angka tetap — CLAUDE.md §7 mencatat jebakan yang sudah
// memakan empat jam: web di :3007 sementara dokumen menulis :3001, dan tiap
// lapisan menjawab benar untuk dirinya sendiri sehingga tak ada galat yang
// menunjuk penyebabnya. Skrip yang memaku :3000 gagal dengan cara yang sama
// samarnya: ia menunggu #login-email di server yang tak ada, lalu timeout.
const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

const peramban = await chromium.launch()
const kon = await peramban.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
})
const hal = await kon.newPage()

await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })
await hal.fill('#login-email', EMAIL)
await hal.fill('#login-password', SANDI)
await hal.click('button[type=submit]')
await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })

await hal.goto(`${BASIS}${URL}`, { waitUntil: 'domcontentloaded' })
await hal.waitForTimeout(3_500)

const el = hal.locator(`text=${PENANDA}`).first()
await el.evaluate((n) => n.scrollIntoView({ block: 'start' }))
await hal.waitForTimeout(600)

// Viewport apa adanya — yang dinilai adalah apa yang dilihat pemakai saat
// menggulir ke bagian itu, bukan elemen yang dipotong dari konteksnya.
await hal.screenshot({ path: KELUAR })
console.log(`✓ ${KELUAR}`)

await peramban.close()
