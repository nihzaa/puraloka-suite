#!/usr/bin/env node
/**
 * TANGKAP LAYAR — memotret halaman untuk ditinjau founder.
 *
 * ── Kenapa ada
 *
 * Founder tak bisa menilai arah visual dari deskripsi teks, dan saya tak bisa
 * memeriksa hasil kerja saya sendiri tanpa melihatnya. Sebelum berkas ini,
 * setiap "sudah saya perbaiki tampilannya" adalah klaim tanpa bukti.
 *
 * ── Cara memakai
 *
 *   node apps/web/scripts/tangkap-layar.mjs                    # semua, mode terang
 *   node apps/web/scripts/tangkap-layar.mjs --gelap            # mode gelap
 *   node apps/web/scripts/tangkap-layar.mjs --url /keuangan    # satu halaman
 *
 * Hasil: `.layar/<nama>.png` (di .gitignore — gambar tak masuk repo).
 *
 * ── Login
 *
 * Aplikasi ini butuh sesi. Kredensial diambil dari env, bukan ditulis di
 * sini — berkas ini masuk repo PUBLIK.
 *
 *   LAYAR_EMAIL=... LAYAR_SANDI=... node apps/web/scripts/tangkap-layar.mjs
 */
// '@playwright/test' (bukan 'playwright'): itu yang terpasang di root
// workspace. pnpm tak menaikkan dependensi ke apps/*, jadi skrip ini
// DIJALANKAN DARI ROOT — lihat perintah di header.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ARG = process.argv.slice(2)
const GELAP = ARG.includes('--gelap')
const urlIdx = ARG.indexOf('--url')
const URL_TUNGGAL = urlIdx >= 0 ? ARG[urlIdx + 1] : null

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3001'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

const HALAMAN = URL_TUNGGAL
  ? [{ nama: URL_TUNGGAL.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'akar', url: URL_TUNGGAL }]
  : [
      { nama: 'dashboard', url: '/dashboard' },
      { nama: 'proyek', url: '/proyek' },
      { nama: 'keuangan', url: '/keuangan' },
      { nama: 'mandor', url: '/mandor' },
    ]

const KELUAR = join(process.cwd(), 'apps', 'web', '.layar')
mkdirSync(KELUAR, { recursive: true })

const peramban = await chromium.launch()
const konteks = await peramban.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,          // retina — teks kecil tetap terbaca di ss
  colorScheme: GELAP ? 'dark' : 'light',
})
// `colorScheme` SAJA tidak cukup — dan percobaan pertama menghasilkan
// "mode gelap" yang isinya putih semua.
//
// Sebabnya: aplikasi memakai `next-themes` dengan `attribute="class"` dan
// `defaultTheme="light"`. Preferensi disimpan di localStorage; tanpa nilai di
// sana, default menang atas preferensi sistem. Jadi `prefers-color-scheme:
// dark` dari Playwright dibaca, lalu diabaikan.
//
// initScript berjalan SEBELUM skrip halaman, jadi next-themes membacanya saat
// pertama kali memasang kelas — tidak ada kedipan terang lebih dulu.
await konteks.addInitScript((gelap) => {
  localStorage.setItem('theme', gelap ? 'dark' : 'light')
}, GELAP)

const hal = await konteks.newPage()

// Galat konsol dikumpulkan, bukan diabaikan: halaman yang "terlihat baik"
// tapi melempar galat adalah halaman yang rusak dan belum ketahuan.
const galat = []
hal.on('console', (m) => { if (m.type() === 'error') galat.push(m.text()) })
hal.on('pageerror', (e) => galat.push(String(e)))

async function login() {
  if (!EMAIL || !SANDI) {
    console.log('⚠️  LAYAR_EMAIL/LAYAR_SANDI tak diisi — memotret tanpa login.')
    console.log('   Halaman yang butuh sesi akan menampilkan layar masuk.')
    return false
  }
  await hal.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })

  // Pakai `id`, bukan `input[type=...]`, dan TUNGGU elemennya siap.
  // Percobaan pertama memakai selektor tipe + fill langsung: medannya tetap
  // kosong di tangkapan layar. Sebabnya React belum memasang handler saat
  // fill berjalan, jadi nilainya masuk ke DOM tapi tak pernah sampai ke state
  // — dan tombol Masuk mengirim form yang kosong.
  await hal.waitForSelector('#login-email', { state: 'visible', timeout: 15_000 })
  await hal.fill('#login-email', EMAIL)
  await hal.fill('#login-password', SANDI)

  // Verifikasi nilainya BENAR-BENAR masuk sebelum menekan tombol. Tanpa ini,
  // kegagalan login terbaca sebagai "kredensial salah" padahal formnya kosong.
  const terisi = await hal.inputValue('#login-email')
  if (terisi !== EMAIL) {
    console.log(`⚠️  Medan email tak terisi (isinya: "${terisi}") — bukan soal kredensial.`)
  }

  await hal.click('button[type="submit"]')
  await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25_000 })
    .catch(async () => {
      // Tampilkan pesan galat dari halamannya sendiri — jauh lebih berguna
      // daripada menebak.
      const pesan = await hal.locator('[role="alert"]').first().textContent().catch(() => null)
      console.log(`⚠️  Login tak berpindah halaman.${pesan ? ` Pesan: ${pesan.trim()}` : ''}`)
    })
  return true
}

await login()

for (const h of HALAMAN) {
  galat.length = 0
  await hal.goto(`${BASIS}${h.url}`, { waitUntil: 'networkidle', timeout: 30_000 })
    .catch((e) => console.log(`⚠️  ${h.url}: ${e.message.split('\n')[0]}`))

  // Beri waktu animasi masuk selesai (kartu KPI naik 300ms, hitung-naik 400ms).
  // Memotret di tengah animasi menghasilkan gambar yang tak pernah dilihat
  // pemakai sungguhan.
  await hal.waitForTimeout(1200)

  const nama = `${h.nama}${GELAP ? '-gelap' : ''}.png`
  await hal.screenshot({ path: join(KELUAR, nama), fullPage: true })
  console.log(`✓ ${nama}${galat.length ? `   ⚠️ ${galat.length} galat konsol` : ''}`)
  if (galat.length) galat.slice(0, 3).forEach((g) => console.log(`    ${g.slice(0, 140)}`))
}

await peramban.close()
console.log(`\nTersimpan di ${KELUAR}`)
