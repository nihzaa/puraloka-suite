#!/usr/bin/env node
/**
 * Menguji halaman Alur Otomasi SEBAGAI PEMAKAI.
 *
 * ── Yang tak bisa dibuktikan tangkapan layar
 *
 * Gambar membuktikan bentuk. Yang diuji di sini adalah janji-janji halaman
 * yang bisa rusak tanpa mengubah bentuknya sama sekali:
 *
 *   1. urutan "yang rusak dulu" — gambar hanya membuktikan urutan HARI INI,
 *      untuk data hari ini. Logikanya bisa terbalik dan gambarnya tetap wajar.
 *   2. tombol Jalankan MENOLAK saat n8n tak tersambung — dan menolaknya harus
 *      lewat atribut `disabled`, bukan sekadar warna redup.
 *   3. jejak bisa dibuka dan memuat barisnya.
 *   4. cron dibacakan, bukan ditampilkan mentah.
 *
 * ── Pemakaian (butuh web :3000 dan API hidup)
 *
 *   LAYAR_EMAIL=… LAYAR_SANDI=… node apps/web/scripts/uji-alur-otomasi.mjs
 */
import { chromium } from '@playwright/test'

const BASIS = 'http://localhost:3000'
let gagal = 0
const cek = (nama, ok, tambahan = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nama}${tambahan ? ` — ${tambahan}` : ''}`)
  if (!ok) gagal++
}

const peramban = await chromium.launch()
const hal = await peramban
  .newContext({ viewport: { width: 1600, height: 1000 } })
  .then((c) => c.newPage())

await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })
await hal.fill('#login-email', process.env.LAYAR_EMAIL)
await hal.fill('#login-password', process.env.LAYAR_SANDI)
await hal.click('button[type=submit]')
await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })

await hal.goto(`${BASIS}/otomasi/alur`, { waitUntil: 'domcontentloaded' })
await hal.waitForTimeout(3_500)

// ── 1. yang GAGAL berada di atas yang BERHASIL ──────────────────────────────
const teks = await hal.locator('body').innerText()
const iGagal = teks.indexOf('Peringatan stok material menipis')
const iBerhasil = teks.indexOf('Pengingat invoice jatuh tempo')
cek(
  'alur GAGAL diurutkan di atas yang berhasil',
  iGagal > 0 && iBerhasil > 0 && iGagal < iBerhasil,
  `gagal@${iGagal} berhasil@${iBerhasil}`,
)

// ── 2. sebab kegagalan terbaca TANPA membuka apa pun ────────────────────────
cek(
  'pesan gagal tampil langsung di daftar',
  teks.includes('Tak ada jawaban dalam 15 detik'),
)

// ── 3. Jalankan benar-benar DISABLED saat n8n tak tersambung ────────────────
const tombol = hal.getByRole('button', { name: /Jalankan/ })
const n = await tombol.count()
if (n === 0) {
  cek('tombol Jalankan ada', false, 'nol tombol — izin otomasi:alur:jalankan hilang?')
} else {
  const semuaMati = (
    await Promise.all(Array.from({ length: n }, (_, i) => tombol.nth(i).isDisabled()))
  ).every(Boolean)
  const adaSpanduk = teks.includes('n8n belum tersambung')
  cek(
    'saat n8n tak tersambung, SEMUA tombol Jalankan disabled',
    adaSpanduk ? semuaMati : true,
    adaSpanduk ? `${n} tombol` : 'n8n tersambung — pemeriksaan dilewati',
  )
}

// ── 4. cron DIBACAKAN, bukan mentah ─────────────────────────────────────────
cek('cron dibacakan manusia', /tiap (hari|Senin|Selasa)/.test(teks), teks.match(/tiap [^,]+, \d{2}:\d{2}/)?.[0] ?? '')
cek('cron mentah tak bocor ke layar', !teks.includes('* * *'))

// ── 5. jejak bisa dibuka dan berisi ─────────────────────────────────────────
await hal.getByRole('button', { name: 'Lihat jejak' }).first().click()
await hal.waitForTimeout(1_200)
const sesudah = await hal.locator('body').innerText()
cek('jejak terbuka dan memuat tabel', sesudah.includes('jalan terakhir'))
cek('jejak menyebut pemicunya', /peristiwa|jadwal|manual/.test(sesudah))

await peramban.close()
process.exit(gagal === 0 ? 0 : 1)
