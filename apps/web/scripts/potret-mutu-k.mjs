/*
  Memotret PADANAN K di layar — dan membuktikan ia IKUT BERUBAH saat diketik.

  ── Kenapa "ikut berubah" itu yang diuji

  Keterangan K dihitung DI PERAMBAN dari angka yang sedang diketik. Keterangan
  yang tampil tapi tak ikut berubah adalah yang paling menyesatkan: pengguna
  mengubah f'c 25 → 30, melihat "setara K-300" yang basi, lalu memesan beton
  kelas yang salah — dan tak ada satu pun galat.

  ── Dan mutu BAJA tak boleh punya K

  fy 400 MPa bukan mutu kubus. Menampilkan "setara K-..." di sana mengarang
  satuan yang tak ada.

  Pakai: LAYAR_BASIS=http://localhost:3030 UJI_BASIS=http://127.0.0.1:3021 \
           node scripts/potret-mutu-k.mjs
*/
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3030'
const API = process.env.UJI_BASIS ?? 'http://127.0.0.1:3021'

function env(k) {
  const isi = readFileSync('.env.local', 'utf8')
  const m = isi.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^"|"$/g, '').replace(/\r$/, '') : undefined
}
const EMAIL = process.env.LAYAR_EMAIL ?? env('LAYAR_EMAIL')
const SANDI = process.env.LAYAR_SANDI ?? env('LAYAR_SANDI')
if (!EMAIL || !SANDI) { console.error('LAYAR_EMAIL/LAYAR_SANDI kosong'); process.exit(1) }

const KELUAR = join(process.cwd(), '.layar')
mkdirSync(KELUAR, { recursive: true })

const masuk = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
})
if (!masuk.ok) { console.error(`login API gagal ${masuk.status} — UKUR portnya`); process.exit(1) }
const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0]).filter((c) => /^puraloka_(token|refresh)=/.test(c)).join('; ')
const H = { 'content-type': 'application/json', cookie }

const jp = await (await fetch(`${API}/api/v1/projects?limit=1`, { headers: H })).json()
const proyek = (jp.data ?? jp.projects ?? jp)[0]
if (!proyek?.id) { console.error('tak ada proyek'); process.exit(1) }

let gagal = 0
const browser = await chromium.launch()

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', SANDI)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })

  await page.goto(`${BASIS}/estimasi/struktur?proyek=${proyek.id}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  /* Buka form tambah elemen — di sanalah medan mutu berada. */
  /* .first() — ada dua tombol bernama mirip: 'Tambah elemen' di bilah
     aksi dan 'Tambah elemen pertama' di layar kosong. */
  await page.getByRole('button', { name: 'Tambah elemen', exact: true }).first().click()
  await page.waitForTimeout(1500)

  const isian = page.locator('#f-mutu\\.fcMpa')
  if (!(await isian.count())) {
    console.error('❌ medan mutu.fcMpa tak ditemukan di form')
    gagal++
  } else {
    /* Isi contoh dulu supaya medannya terisi angka wajar. */
    const tombolContoh = page.getByRole('button', { name: /isi contoh/i }).first()
    if (await tombolContoh.count()) { await tombolContoh.click(); await page.waitForTimeout(800) }

    const teksAwal = await page.locator('body').innerText()
    if (!/setara K-/i.test(teksAwal)) {
      console.error('❌ keterangan "setara K-…" TAK muncul di bawah medan mutu beton')
      gagal++
    } else {
      const m = teksAwal.match(/setara (K-\d+|~K-\d+)/)
      console.log(`✓ keterangan muncul: "setara ${m?.[1]}"`)
    }

    /*
      ── Berubah saat diketik

      Keterangan yang tampil tapi BASI adalah yang paling menyesatkan.
      25 -> K-300, 30 -> K-350: keduanya kelas baku, jadi labelnya harus
      berbeda dan keduanya tanpa tanda ~.
    */
    for (const [nilai, harap] of [['25', 'K-300'], ['30', 'K-350'], ['20', 'K-250']]) {
      await isian.fill(nilai)
      await page.waitForTimeout(500)
      const teks = await page.locator('body').innerText()
      if (!teks.includes(`setara ${harap}`)) {
        const m = teks.match(/setara (~?K-\d+)/)
        console.error(`❌ f'c ${nilai} MPa -> "${m?.[1] ?? '(tak ada)'}", seharusnya "${harap}"`)
        console.error('   Keterangan yang tak ikut berubah membuat orang memesan kelas yang salah.')
        gagal++
      } else console.log(`✓ f'c ${nilai} MPa -> setara ${harap}`)
    }

    /*
      ── Mutu BAJA tak boleh punya padanan K

      fy 400 MPa bukan mutu kubus; "setara K-..." di sana mengarang satuan.
    */
    /*
      Diperiksa lewat ATRIBUT medannya sendiri, bukan dengan memanjat DOM.

      Versi pertama memakai `xpath=ancestor::*[3]` dan MENUDUH SALAH: ia
      memanjat cukup tinggi sampai ikut menangkap teks milik medan f'c di
      sebelahnya. Tangkapan layarnya membuktikan produknya benar — keterangan
      K memang hanya ada di bawah "Mutu beton f'c".

      `Isian` menyambungkan bantuan lewat aria-describedby, jadi itu yang
      ditanya: medan fy tak boleh punya penjelas yang menyebut K.
    */
    /*
      Dicek pada PEMBUNGKUS medannya sendiri.

      Dua versi sebelumnya sama-sama tak berguna: `ancestor::*[3]` memanjat
      terlalu tinggi dan MENUDUH SALAH (ikut menangkap teks medan f'c di
      sebelahnya), lalu `aria-describedby` ternyata tak dipasang `Isian`
      sama sekali — pemeriksanya diam dan diamnya terbaca seperti lulus.

      `Isian` menaruh bantuannya sebagai <p> TERAKHIR di dalam pembungkus
      yang sama dengan kotak isiannya. Itu yang dibaca.
    */
    const pembungkusFy = page.locator('[id="f-mutu.fyMpa"]').locator('xpath=..')
    if (await pembungkusFy.count()) {
      const teksFy = await pembungkusFy.innerText().catch(() => '')
      if (/setara K-/i.test(teksFy)) {
        console.error('❌ mutu BAJA (fy) menampilkan padanan K — satuan yang tak ada')
        gagal++
      } else console.log('✓ mutu baja (fy) TIDAK menampilkan padanan K')

      /* Dan pemeriksa ini WAJIB bisa melihat bantuan bila memang ada —
         kalau tidak, diamnya bukan bukti. Dibuktikan pada medan f'c. */
      const pembungkusFc = isian.locator('xpath=..')
      const teksFc = await pembungkusFc.innerText().catch(() => '')
      if (!/setara K-/i.test(teksFc)) {
        console.error("❌ pemeriksa tak melihat bantuan K di medan fc — ia buta, bukan lulus")
        gagal++
      } else console.log("✓ pemeriksa terbukti BISA melihat bantuan (terlihat di fc)")
    }
    await isian.fill('25')
    await page.waitForTimeout(500)
    await isian.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(KELUAR, 'mutu-k.png'), fullPage: false })
  }

  await ctx.close()
} finally {
  await browser.close()
}

console.log(`\ntangkapan layar → ${KELUAR}`)
if (gagal) { console.error(`\n❌ ${gagal} masalah\n`); process.exit(1) }
console.log('\n✅ Padanan K tampil di layar dan ikut berubah saat diketik\n')
