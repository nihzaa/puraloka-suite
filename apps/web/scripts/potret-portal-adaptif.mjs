#!/usr/bin/env node
/**
 * potret-portal-adaptif.mjs — HP vs PC berdampingan, terang & gelap
 *
 * ── Kenapa memotret, bukan cukup typecheck
 *
 * Layout adaptif gagal dengan cara yang tak terlihat dari kode: elemen saling
 * menimpa, teks melar melewati batas baca, sidebar dan bottom-nav muncul
 * bersamaan, atau justru KEDUANYA hilang. `tsc` hijau untuk semuanya.
 *
 * Repo ini sudah membuktikan itu: sesudah 32/32 jenis gambar "lengkap",
 * MEMOTRET LAYAR masih menemukan tiga cacat yang tak satu pun dari 1.028 test
 * tangkap — `Infinity%`, judul berupa kunci mentah, dan dua baris angka yang
 * saling menimpa.
 *
 * ── Yang diperiksa otomatis, bukan hanya dilihat
 *
 * Selain menyimpan PNG, skrip ini MENGUKUR tiga hal yang punya jawaban benar:
 *   1. di HP    bottom-nav terlihat, sidebar tidak
 *   2. di PC    sidebar terlihat, bottom-nav tidak
 *   3. di PC    lebar baris teks tak melewati ~90 karakter
 *
 * Tanpa pengukuran itu, "potret tersimpan" hanya berarti browser tak jatuh.
 *
 * Butuh web + API hidup. Ukur portnya (CLAUDE.md §7).
 *
 *   LAYAR_EMAIL=… LAYAR_SANDI=… LAYAR_BASIS=http://localhost:3000 \
 *     node apps/web/scripts/potret-portal-adaptif.mjs [--gelap]
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL ?? process.env.UJI_EMAIL
const SANDI = process.env.LAYAR_SANDI ?? process.env.UJI_SANDI
const GELAP = process.argv.includes('--gelap')

if (!EMAIL || !SANDI) {
  console.error('❌ LAYAR_EMAIL / LAYAR_SANDI kosong — tak ada yang bisa dipotret.')
  process.exit(2)
}

const KELUAR = join(dirname(dirname(fileURLToPath(import.meta.url))), '.layar')
mkdirSync(KELUAR, { recursive: true })

/* Halaman portal yang dipotret. Sengaja yang paling padat isinya — layout
   yang tahan halaman kosong belum tentu tahan halaman penuh.

   ⚠ Tiap portal membawa AKUNNYA SENDIRI.

   Versi pertama memakai satu akun (admin) untuk semuanya, dan hasilnya nol
   potret: `/pm-portal` dan `/mandor-portal` MENGALIHKAN admin ke
   `/dashboard`. Itu bukan cacat portalnya — portal peran memang menyaring
   berdasarkan peran, dan admin bukan PM maupun mandor.

   Kegagalan itu terbaca seperti "layout rusak" padahal artinya "akun salah".
   Batas yang sama sudah tercatat di CLAUDE.md §8a.3 untuk audit a11y: tiga
   rute tak teraudit karena butuh peran lain, bukan karena skripnya.

   Sandinya dipakai bersama dari LAYAR_SANDI — akun uji di basis dev
   memakai sandi yang sama. Kalau suatu hari berbeda, tambahkan
   LAYAR_SANDI_PM / LAYAR_SANDI_MANDOR di sini. */
const HALAMAN = [
  /*
    admin-portal DULU: akun admin berhak, jadi ia terukur TANPA menunggu
    sandi akun peran. Meletakkan yang terblokir di depan membuat seluruh
    laporan jadi nol temuan — dan nol temuan dari korpus kosong tak
    membuktikan apa pun.
  */
  ['admin-portal', '/admin-portal', EMAIL],
  ['admin-keuangan', '/admin-portal/keuangan/kas', EMAIL],
  ['pm-portal', '/pm-portal', process.env.LAYAR_EMAIL_PM ?? 'uji.pm.portal@puraloka.test'],
  ['mandor-portal', '/mandor-portal', process.env.LAYAR_EMAIL_MANDOR ?? 'uji.mandor.portal@puraloka.test'],
]

/* Dua lebar yang mewakili sisi berlawanan dari breakpoint 1024px. */
const LEBAR = [
  ['hp', 390, 844],
  ['pc', 1440, 900],
]

const browser = await chromium.launch()
const masalah = []
let dipotret = 0

/*
  ⚠ Urutan loop DIBALIK: halaman di luar, lebar di dalam.

  Tiap portal butuh akun yang berbeda, dan sesi login tinggal di konteks
  browser. Loop lama membuat satu sesi lalu mengunjungi semua halaman —
  bentuk yang benar untuk satu akun, mustahil untuk banyak.
*/
try {
  for (const [label, jalur, emailPeran] of HALAMAN) {
  for (const [nama, lebar, tinggi] of LEBAR) {
    const ctx = await browser.newContext({
      viewport: { width: lebar, height: tinggi },
      colorScheme: GELAP ? 'dark' : 'light',
    })
    const page = await ctx.newPage()

    await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
    await page.fill('input[type=email]', emailPeran)
    await page.fill('input[type=password]', SANDI)
    await page.click('button[type=submit]')
    await page.waitForURL(/dashboard|portal|beranda/, { timeout: 30000 }).catch(() => {})

    /*
      Tema ditekan lewat tombol APLIKASI, bukan `colorScheme` Playwright.
      Aplikasi ini menyimpan pilihan temanya sendiri — `colorScheme: dark`
      saja menghasilkan halaman yang tetap TERANG, dan potretnya terlihat
      berhasil sambil tak menguji mode gelap sama sekali.
    */
    if (GELAP) {
      const tombol = page.locator('[aria-label="Ganti ke mode gelap"]').first()
      if (await tombol.count()) {
        await tombol.click()
        await page.waitForTimeout(600)
      } else {
        console.error('  ⚠ tombol tema tak ditemukan — potret mungkin TETAP TERANG')
      }
    }

    {
      const r = await page.goto(`${BASIS}${jalur}`, { waitUntil: 'networkidle' })
      if (r && r.status() >= 400) {
        masalah.push(`${label} @${nama}: HTTP ${r.status()}`)
        await ctx.close()
        continue
      }
      /* Dialihkan ke login/dashboard = peran akun uji tak berhak. Dilaporkan,
         bukan dipotret diam-diam — potret halaman yang salah lebih buruk
         daripada tak ada potret.

         Emailnya IKUT dilaporkan: tanpa itu "dialihkan ke /dashboard" tak
         bisa dibedakan antara akun yang salah dan portal yang rusak. */
      const url = page.url()
      if (!url.includes(jalur)) {
        masalah.push(`${label} @${nama}: dialihkan ke ${url.replace(BASIS, '')} (akun ${emailPeran})`)
        await ctx.close()
        continue
      }

      await page.waitForTimeout(500)
      const berkas = `portal-${label}-${nama}${GELAP ? '-gelap' : ''}.png`
      await page.screenshot({ path: join(KELUAR, berkas), fullPage: false })
      dipotret++

      /* ── Pengukuran, bukan sekadar potret ─────────────────────────────── */
      const ukur = await page.evaluate(() => {
        const terlihat = (sel) => {
          const el = document.querySelector(sel)
          if (!el) return false
          const g = getComputedStyle(el)
          return g.display !== 'none' && g.visibility !== 'hidden'
        }
        const isi = document.querySelector('.portal-isi')
        return {
          bawah: terlihat('.portal-bawah'),
          sidebar: terlihat('.portal-sidebar-nav'),
          lebarIsi: isi ? Math.round(isi.getBoundingClientRect().width) : 0,
        }
      })

      if (nama === 'hp') {
        if (!ukur.bawah) masalah.push(`${label} @hp: bottom-nav TIDAK terlihat`)
        if (ukur.sidebar) masalah.push(`${label} @hp: sidebar ikut tampil`)
      } else {
        if (ukur.bawah) masalah.push(`${label} @pc: bottom-nav masih tampil`)
        if (!ukur.sidebar) masalah.push(`${label} @pc: sidebar TIDAK terlihat`)
        /* ~90 karakter pada 16px ≈ 1180px. Lebih lebar dari itu, mata
           kehilangan awal baris berikutnya saat kembali ke kiri. */
        if (ukur.lebarIsi > 1250) {
          masalah.push(`${label} @pc: konten ${ukur.lebarIsi}px — baris terlalu panjang untuk dibaca`)
        }
      }

      console.log(
        `  ${nama.padEnd(3)} ${label.padEnd(15)} bottom-nav=${ukur.bawah ? 'ya ' : 'tdk'} ` +
          `sidebar=${ukur.sidebar ? 'ya ' : 'tdk'} lebar-isi=${ukur.lebarIsi}px`
      )
    }
    await ctx.close()
  }
  }
} finally {
  await browser.close()
}

console.log(`\n  potret tersimpan : ${dipotret} → ${KELUAR}`)

/*
  ⚠ `masalah` dicetak SEBELUM keluar, termasuk saat nol potret.

  Versi pertama keluar lebih dulu dengan `exit(2)` dan tak pernah mencetak
  sebabnya — justru pada keadaan yang paling butuh penjelasan. Yang
  terlihat cuma "NOL potret", dan itu bisa berarti apa saja: web mati,
  login gagal, peran tak berhak, atau rutenya memang tak ada.

  Kegagalan yang tak menyebut sebabnya memaksa orang berikutnya mengulang
  seluruh penyelidikan dari nol.
*/
if (masalah.length) {
  console.error(`\n❌ ${masalah.length} masalah:`)
  for (const m of masalah) console.error('     ·', m)
}

if (dipotret === 0) {
  console.error('\n❌ NOL potret — tak ada yang teruji. Ini BUKAN kelulusan.')
  if (!masalah.length) {
    console.error('   Dan tak ada satu pun masalah tercatat — berarti daftar')
    console.error('   HALAMAN kosong, atau loop-nya tak pernah berjalan.')
  }
  process.exit(2)
}
if (masalah.length) process.exit(1)
console.log('\n✅ HP menampilkan bottom-nav, PC menampilkan sidebar, lebar baca terjaga.')
