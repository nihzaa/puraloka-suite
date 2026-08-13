#!/usr/bin/env node
/**
 * Menguji FORMULIR alur otomasi sebagai pemakai.
 *
 * Yang diuji adalah janji-janji yang bisa rusak tanpa mengubah tampilan:
 *   1. kode terisi OTOMATIS dari nama (mengetik kode dua kali = kerja mesin)
 *   2. kode tak sah menolak simpan, dan sebabnya dinyatakan
 *   3. kotak pemicu berganti sesuai pilihan (cron vs webhook), tak muncul dua-duanya
 *   4. alur baru BENAR-BENAR tersimpan dan muncul di daftar sesudah muat ulang
 *   5. saat mengubah, kode DIKUNCI — ia yang menautkan jejak jalan
 *
 *   LAYAR_EMAIL=… LAYAR_SANDI=… node apps/web/scripts/uji-form-alur.mjs
 */
import { chromium } from '@playwright/test'

// Port web BUKAN angka tetap — CLAUDE.md §7 mencatat jebakan yang sudah
// memakan empat jam: web di :3007 sementara dokumen menulis :3001, dan tiap
// lapisan menjawab benar untuk dirinya sendiri sehingga tak ada galat yang
// menunjuk penyebabnya. Skrip yang memaku :3000 gagal dengan cara yang sama
// samarnya: ia menunggu #login-email di server yang tak ada, lalu timeout.
const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'
const KODE_UJI = `uji-form-${Date.now().toString(36)}`
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

// ── buka formulir ───────────────────────────────────────────────────────────
await hal.getByRole('button', { name: 'Daftarkan alur' }).click()
await hal.waitForTimeout(700)
cek('dialog terbuka', await hal.locator('dialog[open]').count() > 0)

// ── 1. kode terisi otomatis dari nama ───────────────────────────────────────
await hal.getByLabel('Nama alur').fill('Uji Formulir Otomatis')
await hal.waitForTimeout(300)
const kodeAuto = await hal.getByLabel('Kode').inputValue()
cek('kode terisi otomatis dari nama', kodeAuto === 'uji-formulir-otomatis', kodeAuto)

// ── 2. kode tak sah ditolak, sebabnya dinyatakan ────────────────────────────
await hal.getByLabel('Kode').fill('Kode SALAH!!')
await hal.waitForTimeout(300)
cek('kode tak sah ditandai', (await hal.getByLabel('Kode').getAttribute('aria-invalid')) === 'true')
cek(
  'sebabnya dinyatakan',
  (await hal.locator('dialog[open]').innerText()).includes('huruf kecil'),
)
cek('tombol Daftarkan terkunci', await hal.getByRole('button', { name: 'Daftarkan' }).isDisabled())

// ── 3. kotak pemicu berganti sesuai pilihan ─────────────────────────────────
await hal.getByRole('radio', { name: /Terjadwal/ }).check()
await hal.waitForTimeout(300)
cek('pemicu jadwal → kotak cron muncul', await hal.getByLabel('Jadwal (cron)').count() > 0)
cek('kotak webhook TIDAK ikut muncul', await hal.getByLabel('Jalur webhook').count() === 0)

await hal.getByRole('radio', { name: /Otomatis/ }).check()
await hal.waitForTimeout(300)
cek('pemicu webhook → kotak webhook muncul', await hal.getByLabel('Jalur webhook').count() > 0)
cek('kotak cron hilang', await hal.getByLabel('Jadwal (cron)').count() === 0)

// ── 4. simpan sungguhan, dan BERTAHAN sesudah muat ulang ────────────────────
await hal.getByLabel('Kode').fill(KODE_UJI)
await hal.getByLabel('Jalur webhook').fill('puraloka/uji-form')
await hal.waitForTimeout(300)
cek('Daftarkan terbuka lagi', await hal.getByRole('button', { name: 'Daftarkan' }).isEnabled())
await hal.getByRole('button', { name: 'Daftarkan' }).click()
await hal.waitForTimeout(2_000)

cek('dialog tertutup sesudah simpan', await hal.locator('dialog[open]').count() === 0)

await hal.reload({ waitUntil: 'domcontentloaded' })
await hal.waitForTimeout(3_500)
const teks = await hal.locator('body').innerText()
cek('alur baru BERTAHAN sesudah muat ulang', teks.includes('Uji Formulir Otomatis'))
cek('ditandai belum tersambung (tanpa n8n_id)', teks.includes('Belum tersambung'))

// ── 5. saat mengubah, kode DIKUNCI ──────────────────────────────────────────
await hal.getByRole('button', { name: 'Ubah Uji Formulir Otomatis' }).click()
await hal.waitForTimeout(800)
cek('kode dikunci saat mengubah', await hal.getByLabel('Kode').isDisabled())
cek(
  'alasan penguncian dinyatakan',
  (await hal.locator('dialog[open]').innerText()).includes('memutus'),
)

// Esc menutup dialog — `<dialog>` memberi ini gratis, dan penjaga
// audit-modal-dialog ada justru karena versi `div fixed` tidak.
await hal.keyboard.press('Escape')
await hal.waitForTimeout(500)
cek('Esc menutup dialog', await hal.locator('dialog[open]').count() === 0)

await peramban.close()
console.log(`\n  (alur uji "${KODE_UJI}" tertinggal di katalog — hapus manual bila perlu)`)
process.exit(gagal === 0 ? 0 : 1)
