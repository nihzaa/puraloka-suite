#!/usr/bin/env node
/**
 * ukur-kerapatan-portal.mjs — ANGKA dari DOM, bukan tebakan dari gambar
 *
 * ── Kenapa skrip ini ada
 *
 * 2026-08-31: saya mengusulkan perbaikan kerapatan berdasarkan diagnosis
 * `ARAH-VISUAL-2026.md` §1a ("padding kartu 24px, 2x terlalu longgar; font
 * tabel 9-11px, terlalu kecil"). Diukur sesudah diterapkan:
 *
 *     A sekarang : padding 0px  · tinggi kartu 111px · font angka 36px
 *     B usul     : padding 14px · tinggi kartu 139px · font angka 36px
 *
 * Usul itu membuat kartu LEBIH TINGGI, bukan lebih rapat — kebalikan dari
 * tujuannya. Dan font angkanya sudah 36px, lebih besar daripada yang saya
 * usulkan.
 *
 * Sebabnya: diagnosis itu ditulis 2026-08-04 tentang halaman DASHBOARD, dan
 * saya menerapkannya ke PORTAL tanpa mengukur ulang. Angka di dokumen
 * membusuk; itu peringatan pertama di CLAUDE.md, dan saya melanggarnya.
 *
 * Tiga kali dalam satu putaran saya salah membaca gambar: mengira angka KPI
 * mengecil, mengira hierarki terbalik (ternyata 15px bold vs 13px normal —
 * sudah benar), mengira padding terlalu longgar. Angkanya membantah ketiganya.
 *
 * Mata bukan alat ukur. Skrip ini yang jadi alat ukurnya.
 *
 * ── Yang diukur, dan kenapa itu
 *
 * Enam besaran yang menentukan apakah antarmuka terasa "padat dan mahal" atau
 * "longgar dan murah" — semuanya dari `getComputedStyle`, bukan dari sumber:
 *
 *   1. padding kartu        longgar = ruang terbuang
 *   2. tinggi kartu         akibat dari 1, dan yang benar-benar terasa
 *   3. font isi & label     terlalu kecil = tak terbaca perangkat lama
 *   4. font angka KPI       yang dicari mata lebih dulu
 *   5. jarak antar-kartu    gap grid
 *   6. rasio isi:ruang      berapa persen kartu yang benar-benar berisi
 *
 * Keluarannya ANGKA, bukan penilaian. Yang menilai founder, dari angka dan
 * gambar — bukan dari kata sifat saya.
 *
 * Butuh web hidup. Ukur portnya (CLAUDE.md §7).
 *
 *   UJI_SANDI_PERAN=… LAYAR_BASIS=http://localhost:3010 \
 *     node apps/web/scripts/ukur-kerapatan-portal.mjs
 */
import { chromium } from '@playwright/test'

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3010'
const SANDI = process.env.UJI_SANDI_PERAN

if (!SANDI) {
  console.error('❌ UJI_SANDI_PERAN kosong — tak ada yang bisa diukur.')
  console.error('   Jalankan `siapkan-akun-uji-peran.mjs` lebih dulu.')
  process.exit(2)
}

/* Halaman yang diukur, dan akun yang memang berhak membukanya. */
const HALAMAN = [
  ['pm-portal', '/pm-portal', 'uji.pm@puraloka.test'],
  ['mandor-portal', '/mandor-portal', 'uji.mandor@puraloka.test'],
  ['dashboard', '/dashboard', 'uji.admin@puraloka.test'],
]

/* Acuan data-dense. Bukan karangan — angka yang dipakai Linear/Ramp dan
   dicatat `ARAH-VISUAL-2026.md` §1a sebagai standar. */
const ACUAN = {
  paddingKartu: [10, 16],   // px, rentang sehat
  fontIsi: [12, 14],        // px, isi yang paling sering dibaca
  gapGrid: [8, 16],         // px
}

const browser = await chromium.launch()
const laporan = []

try {
  for (const [label, jalur, akun] of HALAMAN) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

    await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
    await page.waitForSelector('input[type=email]', { timeout: 15000 })
    await page.fill('input[type=email]', akun)
    await page.fill('input[type=password]', SANDI)
    await page.click('button[type=submit]')
    await page.waitForURL(/portal|dashboard/, { timeout: 30000 }).catch(() => {})

    const r = await page.goto(`${BASIS}${jalur}`, { waitUntil: 'networkidle' })
    const url = page.url()
    if (!url.includes(jalur)) {
      laporan.push({ label, galat: `dialihkan ke ${url.replace(BASIS, '')}` })
      await ctx.close()
      continue
    }
    if (r && r.status() >= 400) {
      laporan.push({ label, galat: `HTTP ${r.status()}` })
      await ctx.close()
      continue
    }
    await page.waitForTimeout(400)

    const ukur = await page.evaluate(() => {
      const px = (v) => Math.round(parseFloat(v) || 0)

      /*
        "Kartu" dicari dari BENTUKNYA, bukan dari nama kelas: elemen dengan
        latar berbeda dari induknya, bersudut, dan cukup besar. Mencari lewat
        nama kelas gagal di sini — kartu portal ditulis inline tanpa kelas,
        dan itu persis yang membuat usul pertama saya mengenai wadah yang
        salah.
      */
      const semua = [...document.querySelectorAll('main *')]
      const kartu = semua.filter((el) => {
        const g = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return (
          px(g.borderRadius) >= 6 &&
          r.width >= 160 && r.height >= 60 && r.height <= 400 &&
          g.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
          el.children.length > 0
        )
      })

      const pad = kartu.map((el) => px(getComputedStyle(el).paddingTop)).filter((v) => v > 0)
      const tinggi = kartu.map((el) => Math.round(el.getBoundingClientRect().height))

      /* Font teks daun (tanpa anak) — yang benar-benar dibaca orang. */
      const daun = semua.filter((el) => el.children.length === 0 && (el.textContent || '').trim().length > 1)
      const fonts = daun.map((el) => px(getComputedStyle(el).fontSize))
      const sebaran = {}
      for (const f of fonts) sebaran[f] = (sebaran[f] || 0) + 1

      /* Angka besar = KPI. Dicari dari ukurannya, bukan namanya. */
      const angka = daun
        .filter((el) => /^[\d.,%\sRp-]+$/.test((el.textContent || '').trim()))
        .map((el) => px(getComputedStyle(el).fontSize))

      /* Gap grid: jarak vertikal antar dua kartu bersaudara pertama. */
      let gap = 0
      if (kartu.length >= 2) {
        const a = kartu[0].getBoundingClientRect()
        const b = kartu[1].getBoundingClientRect()
        gap = Math.round(Math.abs(b.left - a.right) || Math.abs(b.top - a.bottom))
      }

      const median = (arr) => {
        if (!arr.length) return 0
        const s = [...arr].sort((x, y) => x - y)
        return s[Math.floor(s.length / 2)]
      }

      return {
        kartu: kartu.length,
        paddingMedian: median(pad),
        tinggiMedian: median(tinggi),
        fontIsiMedian: median(fonts),
        fontTerkecil: fonts.length ? Math.min(...fonts) : 0,
        fontAngkaMaks: angka.length ? Math.max(...angka) : 0,
        gap,
        sebaranFont: Object.entries(sebaran)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([f, n]) => `${f}px×${n}`)
          .join(' '),
        elemenTeks: daun.length,
      }
    })

    laporan.push({ label, ...ukur })
    await ctx.close()
  }
} finally {
  await browser.close()
}

console.log('══ Kerapatan portal — diukur dari DOM ═════════════════════════\n')

let adaGalat = false
for (const l of laporan) {
  if (l.galat) {
    console.log(`  ${l.label.padEnd(15)} GAGAL: ${l.galat}`)
    adaGalat = true
    continue
  }
  console.log(`  ${l.label}`)
  console.log(`    kartu terdeteksi : ${l.kartu}`)
  console.log(`    padding (median) : ${l.paddingMedian}px    acuan ${ACUAN.paddingKartu.join('-')}px`)
  console.log(`    tinggi kartu     : ${l.tinggiMedian}px`)
  console.log(`    font isi (median): ${l.fontIsiMedian}px    acuan ${ACUAN.fontIsi.join('-')}px`)
  console.log(`    font TERKECIL    : ${l.fontTerkecil}px`)
  console.log(`    font angka maks  : ${l.fontAngkaMaks}px`)
  console.log(`    gap antar-kartu  : ${l.gap}px     acuan ${ACUAN.gapGrid.join('-')}px`)
  console.log(`    sebaran font     : ${l.sebaranFont}`)
  console.log(`    elemen teks      : ${l.elemenTeks}\n`)
}

if (laporan.every((l) => l.galat)) {
  console.error('❌ NOL halaman terukur — hasil ini bukan kelulusan.')
  process.exit(2)
}

/*
  Kegagalan SEBAGIAN juga dilaporkan — 2026-08-31.

  `adaGalat` diisi di atas tetapi tak pernah dibaca (`no-unused-vars` yang
  memerahkan ratchet lint), dan itu bukan sekadar variabel menganggur: cek di
  atas hanya menyerah bila SELURUH halaman gagal terukur. Satu halaman yang
  gagal di antara empat lewat tanpa jejak di exit code, dan angka yang
  dilaporkan alat ini terbaca lengkap padahal tidak.

  Alat ukur yang diam soal apa yang tak terukur adalah alat ukur yang
  membohongi pembacanya — dan seluruh gunanya justru sebagai sumber angka.
*/
if (adaGalat) {
  const gagal = laporan.filter((l) => l.galat).length
  console.error(
    `
⚠ ${gagal} dari ${laporan.length} halaman GAGAL terukur — angka di bawah ` +
    'hanya mewakili yang berhasil, bukan seluruh portal.')
}

/* Temuan dinyatakan sebagai SELISIH terhadap acuan, bukan sebagai penilaian. */
console.log('── Yang menyimpang dari acuan ────────────────────────────────')
let temuan = 0
for (const l of laporan) {
  if (l.galat) continue
  if (l.fontTerkecil > 0 && l.fontTerkecil < ACUAN.fontIsi[0]) {
    console.log(`  ${l.label}: font terkecil ${l.fontTerkecil}px < ${ACUAN.fontIsi[0]}px — tak terbaca di perangkat lama`)
    temuan++
  }
  if (l.paddingMedian > ACUAN.paddingKartu[1]) {
    console.log(`  ${l.label}: padding ${l.paddingMedian}px > ${ACUAN.paddingKartu[1]}px — ruang terbuang`)
    temuan++
  }
  if (l.gap > ACUAN.gapGrid[1]) {
    console.log(`  ${l.label}: gap ${l.gap}px > ${ACUAN.gapGrid[1]}px`)
    temuan++
  }
}
if (temuan === 0) console.log('  (nol — kerapatan sudah di dalam acuan)')

console.log('\n  Angka di atas adalah FAKTA. Penilaiannya milik founder.')
