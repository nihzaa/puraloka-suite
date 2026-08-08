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
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ARG = process.argv.slice(2)
const GELAP = ARG.includes('--gelap')
const urlIdx = ARG.indexOf('--url')
const URL_TUNGGAL = urlIdx >= 0 ? ARG[urlIdx + 1] : null

// :3000 — WEB. Bukan :3001, yang itu API.
//
// Sampai 2026-08-07 nilai ini `http://localhost:3001`, dan tiap upaya
// memotret gagal dengan pesan yang menyesatkan: "menunggu #login-email"
// — seolah halaman loginnya yang rusak, padahal skrip ini memuat API yang
// memang tak punya form. Menebak-nebak `networkidle`, `addInitScript`, dan
// `deviceScaleFactor` lebih dulu tak menemukan apa pun; yang menemukan
// adalah membaca nilainya.
const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

/**
 * Daftar halaman DITURUNKAN dari filesystem, bukan ditulis tangan.
 *
 * Versi sebelumnya memuat empat nama yang diketik manual. Itu berarti
 * setiap halaman yang dibuat setelahnya tak pernah ikut dipotret —
 * termasuk halaman yang rusak. Daftar tulis-tangan di alat pemeriksa
 * punya kegagalan yang sama dengan angka di dokumen: ia membusuk diam-
 * diam, dan "sudah saya periksa semua" jadi klaim yang tidak benar.
 *
 * Rute dinamis (`[id]`, `[key]`) dilewati: tanpa id yang sah ia hanya
 * menghasilkan halaman galat, yang bukan bukti apa pun.
 */
function halamanDariBerkas() {
  const akar = join(process.cwd(), 'apps', 'web', 'app')
  const hasil = []

  const telusuri = (dir, rute) => {
    for (const isi of readdirSync(dir, { withFileTypes: true })) {
      if (isi.isDirectory()) {
        if (isi.name.startsWith('[')) continue          // rute dinamis
        if (isi.name.startsWith('_')) continue          // berkas pendukung
        // Grup rute `(dashboard)` tak muncul di URL.
        const segmen = isi.name.startsWith('(') ? '' : `/${isi.name}`
        telusuri(join(dir, isi.name), rute + segmen)
      } else if (isi.name === 'page.tsx') {
        const url = rute || '/'
        hasil.push({ nama: url.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'akar', url })
      }
    }
  }
  telusuri(akar, '')
  // Urut supaya perbandingan antar-jalan bisa dibaca.
  return hasil.sort((a, b) => a.url.localeCompare(b.url))
}

const HALAMAN = URL_TUNGGAL
  ? [{ nama: URL_TUNGGAL.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'akar', url: URL_TUNGGAL }]
  : halamanDariBerkas()

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
  await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })

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
  await hal.goto(`${BASIS}${h.url}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  // Jeda tetap: cukup untuk data pertama tiba sesudah hidrasi.
  await hal.waitForTimeout(2_500)
    .catch((e) => console.log(`⚠️  ${h.url}: ${e.message.split('\n')[0]}`))

  // Beri waktu animasi masuk selesai (kartu KPI naik 300ms, hitung-naik 400ms).
  // Memotret di tengah animasi menghasilkan gambar yang tak pernah dilihat
  // pemakai sungguhan.
  await hal.waitForTimeout(1200)

  /*
   * TUNGGU `react-grid-layout` SELESAI MENGUKUR ULANG.
   *
   * Dashboard menempatkan widget dengan lebar PIKSEL MUTLAK hasil hitungan JS
   * (`useLebarKontainer` + ResizeObserver, lihat `ARAH-VISUAL-2026.md` §4a).
   * Jeda tetap di atas cukup saat wadahnya selebar halaman — tetapi begitu
   * wadahnya menyempit (rail kanan, UIR-4), pengukuran ulang datang SESUDAH
   * jepretan.
   *
   * Akibatnya nyata dan sangat menyesatkan: 2026-08-08 tangkapan layar
   * menunjukkan dua widget TUMPANG TINDIH di atas grafik dan tabel. Diperiksa
   * di browser sesudah tenang — nol tumpang tindih. Gambarnya salah, bukan
   * halamannya. Nyaris memicu "perbaikan" atas cacat yang tak ada.
   *
   * Karena itu yang ditunggu adalah KEADAAN, bukan waktu: posisi seluruh
   * widget harus berhenti berubah selama dua pemeriksaan berturut-turut.
   */
  await hal.waitForFunction(
    () => {
      const el = [...document.querySelectorAll('.react-grid-item')]
      if (el.length === 0) return true // halaman tanpa RGL — tak ada yang ditunggu
      const kini = el.map((e) => {
        const b = e.getBoundingClientRect()
        return `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}`
      }).join('|')
      const stabil = window.__tataLetakTerakhir === kini
      window.__tataLetakTerakhir = kini
      return stabil
    },
    { timeout: 15_000, polling: 400 },
  ).catch(() => console.log(`⚠️  ${h.url}: tata letak widget belum tenang — gambar bisa menyesatkan`))

  const nama = `${h.nama}${GELAP ? '-gelap' : ''}.png`
  await hal.screenshot({ path: join(KELUAR, nama), fullPage: true })
  console.log(`✓ ${nama}${galat.length ? `   ⚠️ ${galat.length} galat konsol` : ''}`)
  if (galat.length) galat.slice(0, 3).forEach((g) => console.log(`    ${g.slice(0, 140)}`))
}

await peramban.close()
console.log(`\nTersimpan di ${KELUAR}`)
