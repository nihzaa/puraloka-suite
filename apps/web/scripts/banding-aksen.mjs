#!/usr/bin/env node
/**
 * BANDING AKSEN — memotret satu halaman dengan DUA palet aksen berbeda,
 * supaya founder memutuskan warna dari GAMBAR, bukan dari hex di tabel.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026.md` §10 no.1 mengusulkan mengganti aksen navy `#003366`
 * dengan indigo `#6366F1`. Founder 2026-08-07 tidak menolak dan tidak
 * menyetujui — ia menolak **memutuskan warna dari teks**:
 *
 *     "tunjukkan dulu, baru saya putuskan"
 *
 * Itu keputusan yang benar. Dua hex berdampingan di tabel markdown tak
 * memberi tahu apa pun tentang rasanya di layar, terutama pada aksen yang
 * dipakai 12+ berkas sebagai gradasi grafik, bukan sebagai blok warna rata.
 *
 * ── Kenapa TIDAK mengubah globals.css
 *
 * Menukar nilai `--aksen*` di berkas itu akan:
 *   1. menyentuh berkas yang sedang digarap SESI LAIN (token kerapatan)
 *   2. mengubah 12+ berkas sekaligus untuk sesuatu yang belum diputuskan
 *   3. memaksa dibalikkan kalau founder memilih navy
 *
 * Override disuntikkan lewat `addStyleTag` saat memotret. Kodenya TIDAK
 * berubah sama sekali; yang berubah cuma isi tangkapan layar.
 *
 * ── Kenapa kedua mode
 *
 * `--aksen` punya nilai berbeda di `.dark` (#7ABDFF, biru terang) — di sana
 * ia bukan warna pekat melainkan warna terang di atas latar gelap. Palet
 * pengganti harus dinilai di kedua keadaan, karena indigo yang bagus di
 * mode terang bisa jadi kelabu-keunguan yang lemah di mode gelap.
 *
 * Jalankan (dari root repo):
 *   LAYAR_EMAIL=... LAYAR_SANDI=... node apps/web/scripts/banding-aksen.mjs
 *   ...tambahkan --url /keuangan untuk halaman lain
 *
 * Hasil: `apps/web/.layar/banding/<palet>-<mode>.png`
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ARG = process.argv.slice(2)
const idxUrl = ARG.indexOf('--url')
const URL_HAL = idxUrl >= 0 ? ARG[idxUrl + 1] : '/dashboard'

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

if (!EMAIL || !SANDI) {
  console.error('LAYAR_EMAIL dan LAYAR_SANDI wajib diisi — halaman ini butuh sesi.')
  process.exit(1)
}

/**
 * Dua palet yang dibandingkan.
 *
 * `navy` sengaja TIDAK menyuntik apa pun: ia adalah keadaan kode hari ini.
 * Menyuntik nilai yang sama akan menyembunyikan perbedaan kalau ternyata
 * ada tempat yang memakai hex mentah alih-alih token.
 *
 * Nilai indigo mode gelap DITURUNKAN, bukan disalin dari usul dokumen:
 * dokumen hanya menyebut satu hex (#6366F1) untuk mode terang. Di mode
 * gelap, aksen berperan sebagai warna TERANG di atas latar gelap — persis
 * seperti `--aksen` navy yang jadi #7ABDFF di sana. Memakai #6366F1 apa
 * adanya di mode gelap akan menghasilkan ungu kusam yang nyaris tak
 * terbaca di atas #0F1117.
 */
const PALET = {
  navy: { terang: null, gelap: null },   // apa adanya — pembanding
  indigo: {
    terang: {
      '--aksen': '#6366F1',
      '--aksen-pekat': '#4338CA',
      '--aksen-terang': '#818CF8',
      '--aksen-lembut': '#EEF0FE',
    },
    gelap: {
      '--aksen': '#A5B4FC',
      '--aksen-pekat': '#818CF8',
      '--aksen-terang': '#C7D2FE',
      '--aksen-lembut': 'rgba(165,180,252,0.14)',
    },
  },
}

const KELUAR = join(process.cwd(), 'apps', 'web', '.layar', 'banding')
mkdirSync(KELUAR, { recursive: true })

const peramban = await chromium.launch()

for (const mode of ['terang', 'gelap']) {
  const konteks = await peramban.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: mode === 'gelap' ? 'dark' : 'light',
  })
  // Sama seperti `tangkap-layar.mjs`: colorScheme SAJA tak cukup, karena
  // next-themes membaca localStorage dan default `light` menang atas
  // preferensi sistem.
  await konteks.addInitScript((g) => {
    localStorage.setItem('theme', g ? 'dark' : 'light')
  }, mode === 'gelap')

  const hal = await konteks.newPage()

  await hal.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
  await hal.waitForSelector('#login-email', { state: 'visible', timeout: 15_000 })
  await hal.fill('#login-email', EMAIL)
  await hal.fill('#login-password', SANDI)
  await hal.click('button[type="submit"]')
  await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25_000 })

  for (const [nama, nilai] of Object.entries(PALET)) {
    await hal.goto(`${BASIS}${URL_HAL}`, { waitUntil: 'networkidle' })

    const suntik = nilai[mode]
    if (suntik) {
      // `:root, .dark` + `!important`: token gelap didefinisikan di `.dark`
      // yang lebih spesifik daripada `:root`, jadi override tanpa keduanya
      // hanya berlaku di mode terang — dan varian gelapnya akan diam-diam
      // memotret palet lama sambil mengaku palet baru.
      const isi = Object.entries(suntik)
        .map(([k, v]) => `${k}: ${v} !important;`)
        .join('\n  ')
      await hal.addStyleTag({ content: `:root, .dark {\n  ${isi}\n}` })
    }

    // Grafik Recharts menggambar ulang lewat animasi; tanpa jeda, sebagian
    // tangkapan menangkapnya di tengah perjalanan dan dua palet jadi tak
    // sebanding karena bentuknya berbeda, bukan warnanya.
    await hal.waitForTimeout(1200)

    const berkas = join(KELUAR, `${nama}-${mode}.png`)
    await hal.screenshot({ path: berkas, fullPage: true })
    console.log(`✓ ${nama}-${mode}.png`)
  }

  await konteks.close()
}

await peramban.close()
console.log(`\nTersimpan di ${KELUAR}`)
