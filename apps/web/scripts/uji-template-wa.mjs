#!/usr/bin/env node
/**
 * Menguji panel template WhatsApp SEBAGAI PEMAKAI, bukan sebagai gambar.
 *
 * ── Kenapa terpisah dari test Vitest
 *
 * `wa-template-rute.test.ts` mengunci rutenya, dan `wa-template.test.ts`
 * mengunci perenderannya. Keduanya tak menyentuh yang paling mudah rusak diam-
 * diam: apakah KLIK-nya bekerja. Chip variabel yang menyisipkan di tempat
 * salah, tombol Simpan yang tak pernah terkunci, atau perubahan yang tampak
 * tersimpan tetapi hilang saat dimuat ulang — semuanya lolos test API dan
 * lolos tangkapan layar.
 *
 * Yang diperiksa:
 *   1. klik chip variabel menyisipkan `{{…}}` DI POSISI KURSOR
 *   2. variabel asing memerahkan kotak DAN mengunci tombol Simpan
 *   3. simpan sungguhan BERTAHAN sesudah muat ulang
 *
 * Teks aslinya dipulihkan di akhir — alat pemeriksa yang meninggalkan jejak
 * membuat pemeriksaan berikutnya mengukur bekas dirinya sendiri.
 *
 * ── Pemakaian (butuh web :3000 dan API hidup)
 *
 *   LAYAR_EMAIL=… LAYAR_SANDI=… node apps/web/scripts/uji-template-wa.mjs
 */
import { chromium } from '@playwright/test'

const BASIS = 'http://localhost:3000'
let gagal = 0
const cek = (nama, ok, tambahan = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${nama}${tambahan ? ` — ${tambahan}` : ''}`)
  if (!ok) gagal++
}

const peramban = await chromium.launch()
const hal = await peramban.newContext({ viewport: { width: 1600, height: 1000 } }).then((c) => c.newPage())

await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })
await hal.fill('#login-email', process.env.LAYAR_EMAIL)
await hal.fill('#login-password', process.env.LAYAR_SANDI)
await hal.click('button[type=submit]')
await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })

await hal.goto(`${BASIS}/pengaturan/whatsapp`, { waitUntil: 'domcontentloaded' })
await hal.waitForTimeout(3_500)

const kotak = hal.getByLabel('Isi pesan — Kode verifikasi nomor')
const asli = await kotak.inputValue()

// ── 1. chip menyisipkan di posisi kursor ────────────────────────────────────
await kotak.click()
await kotak.evaluate((el) => el.setSelectionRange(0, 0))
await hal.getByRole('button', { name: '{{menit}}' }).click()
await hal.waitForTimeout(200)
const sesudahSisip = await kotak.inputValue()
cek('chip menyisipkan di awal', sesudahSisip.startsWith('{{menit}}'), sesudahSisip.slice(0, 24))

// ── 2. variabel asing → merah + Simpan terkunci ─────────────────────────────
await kotak.fill('Halo {{nma}} salah ketik')
await hal.waitForTimeout(250)
cek('kotak ditandai tak sah', (await kotak.getAttribute('aria-invalid')) === 'true')
const peringatan = hal.getByRole('alert').filter({ hasText: 'nma' })
cek('peringatan menyebut variabel asing', (await peringatan.count()) > 0)
const simpan = hal.getByRole('button', { name: 'Simpan' }).first()
cek('tombol Simpan terkunci', await simpan.isDisabled())

// ── 3. simpan sungguhan bertahan ────────────────────────────────────────────
const baru = `Kode verifikasi Puraloka Suite: {{kode}}\n\nBerlaku {{menit}} menit. UJI-${Date.now()}`
await kotak.fill(baru)
await hal.waitForTimeout(250)
cek('Simpan terbuka lagi', await simpan.isEnabled())
await simpan.click()
await hal.waitForTimeout(1_500)

await hal.reload({ waitUntil: 'domcontentloaded' })
await hal.waitForTimeout(3_000)
const sesudahMuat = await hal.getByLabel('Isi pesan — Kode verifikasi nomor').inputValue()
cek('perubahan BERTAHAN sesudah muat ulang', sesudahMuat === baru)

// ── pulihkan ────────────────────────────────────────────────────────────────
const k2 = hal.getByLabel('Isi pesan — Kode verifikasi nomor')
await k2.fill(asli)
await hal.waitForTimeout(250)
await hal.getByRole('button', { name: 'Simpan' }).first().click()
await hal.waitForTimeout(1_500)
await hal.reload({ waitUntil: 'domcontentloaded' })
await hal.waitForTimeout(3_000)
cek('teks asli pulih', (await hal.getByLabel('Isi pesan — Kode verifikasi nomor').inputValue()) === asli)

await peramban.close()
process.exit(gagal === 0 ? 0 : 1)
