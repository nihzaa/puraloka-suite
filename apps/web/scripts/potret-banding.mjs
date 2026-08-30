/*
  Memotret PANEL BANDING — dan benar-benar MENJALANKANNYA dari layar.

  Rutenya sudah diuji hidup (`uji-banding-hidup.mjs`). Yang BELUM terbukti:
  apakah ada orang yang bisa memakainya. Daftar medan di layar diturunkan dari
  input elemen DI PERAMBAN, jadi bagian itu tak tersentuh uji rute sama sekali
  — dan medan yang tak muncul di daftar berarti fiturnya tak bisa dipakai
  untuk medan itu, tanpa satu pun galat.

  Pakai: LAYAR_BASIS=http://localhost:3030 UJI_BASIS=http://127.0.0.1:3021 \
           node scripts/potret-banding.mjs
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

const HAL = join(process.cwd(), 'app', '(dashboard)', 'estimasi', 'struktur', 'page.tsx')
const isiHal = readFileSync(HAL, 'utf8')
const iAwal = isiHal.indexOf('const CONTOH')
const iKurung = isiHal.indexOf('{', iAwal)
let dalam = 0
let iAkhir = -1
for (let k = iKurung; k < isiHal.length; k++) {
  if (isiHal[k] === '{') dalam++
  else if (isiHal[k] === '}') { dalam--; if (dalam === 0) { iAkhir = k; break } }
}
const badan = isiHal.slice(iKurung, iAkhir + 1)
const tanpaStr = badan.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""')
const konst = []
for (const nama of new Set([...tanpaStr.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]))) {
  const m = isiHal.match(new RegExp(`^const ${nama} = ([\\s\\S]*?);$`, 'm'))
  if (m) konst.push(`const ${nama} = ${m[1]};`)
}
// `new Function` disengaja: berkas ini MEMBACA contoh data dari sumber
// TypeScript lalu mengevaluasinya, supaya potret selalu memakai contoh
// yang sama dengan yang dipakai kode — bukan salinan yang bisa menyimpang.
//
// Direktif `eslint-disable no-new-func` yang dulu di sini DIBUANG: aturan
// itu tak pernah dikonfigurasi di repo ini, jadi direktifnya menonaktifkan
// sesuatu yang tak ada — dan ESLint melaporkannya sebagai warning sendiri.
const CONTOH = new Function(konst.join('\n') + '\nreturn (' + badan + ')')()

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

const JALAN = (process.hrtime.bigint() % 100000n).toString(36)
const KODE = `POTBND-${JALAN}`
const dibuat = []
let gagal = 0

try {
  const awal = structuredClone(CONTOH.balok)
  const buat = await fetch(`${API}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      kode: KODE, nama: 'potret banding', jenis: 'balok', jumlah: 1, input: awal,
      catatan: 'potret-banding.mjs — dihapus otomatis',
    }),
  })
  if (!buat.ok) { console.error(`BUAT gagal ${buat.status}: ${(await buat.text()).slice(0, 200)}`); process.exit(1) }
  const jb = await buat.json()
  const id = (jb.data ?? jb)?.id
  if (!id) { console.error('balasan BUAT tak memuat id'); process.exit(1) }
  dibuat.push(id)
  console.log(`✓ ${KODE} dibuat`)

  const browser = await chromium.launch()
  for (const mode of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: mode })
    const page = await ctx.newPage()
    await page.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', SANDI)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })

    await page.goto(`${BASIS}/estimasi/struktur?proyek=${proyek.id}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    await page.locator('tr', { hasText: KODE }).first().getByRole('button').first().click()
    await page.waitForTimeout(2500)

    const pilih = page.locator('#banding-medan')
    if (!(await pilih.count())) {
      console.error(`❌ [${mode}] pemilih medan banding TAK ADA di panel detail`)
      gagal++
      await ctx.close()
      continue
    }

    /*
      Daftar medan diturunkan DI PERAMBAN dari input elemen. Medan yang tak
      muncul berarti fiturnya tak bisa dipakai untuk medan itu — tanpa galat.
    */
    const opsi = await pilih.locator('option').allInnerTexts()
    for (const wajib of ['hMm', 'selimutMm', 'mutu.fcMpa']) {
      if (!opsi.some((o) => o.trim() === wajib)) {
        console.error(`❌ [${mode}] medan "${wajib}" tak ada di daftar pilihan`)
        gagal++
      }
    }
    if (!gagal) console.log(`✓ [${mode}] daftar medan memuat ${opsi.length - 1} medan angka`)

    await pilih.selectOption('selimutMm')
    await page.locator('#banding-nilai').fill('30, 50, 60')
    await page.getByRole('button', { name: /Bandingkan/i }).click()
    await page.waitForTimeout(3000)

    const teks = await page.locator('body').innerText()
    if (!/memenuhi syarat/i.test(teks)) {
      console.error(`❌ [${mode}] tabel hasil banding tak memuat satu pun vonis`)
      gagal++
    } else {
      console.log(`✓ [${mode}] tabel banding terisi`)
      /*
        Selimut 50/60 mm HARUS lolos api dan 30 mm tidak — kalau semuanya
        sama, yang tampil bukan perbandingan melainkan tiga salinan.
      */
      if (!/tidak memenuhi/i.test(teks)) {
        console.error(`❌ [${mode}] tak ada kandidat yang GAGAL — tabelnya tak membandingkan apa pun`)
        gagal++
      } else console.log(`✓ [${mode}] ada yang lolos DAN ada yang tidak`)
    }

    /* Digulir ke TABEL HASILNYA, bukan ke judul bagiannya: yang perlu
       dinilai adalah tabelnya, dan ia ada di bawah kontrol isian. */
    const judul = page.getByText(/memenuhi syarat/i).first()
    if (await judul.count()) { await judul.scrollIntoViewIfNeeded(); await page.waitForTimeout(600) }
    await page.screenshot({ path: join(KELUAR, `banding-${mode}.png`), fullPage: false })
    await ctx.close()
  }
  await browser.close()
} finally {
  for (const id of dibuat) {
    const d = await fetch(`${API}/api/v1/struktur/${id}`, { method: 'DELETE', headers: { cookie } })
    if (!d.ok) { console.error(`⚠ elemen uji ${id} TAK terhapus (${d.status})`); gagal++ }
  }
  const sisa = await fetch(`${API}/api/v1/projects/${proyek.id}/struktur`, { headers: { cookie } })
  if (sisa.ok) {
    for (const y of ((await sisa.json()).data ?? []).filter((x) => x.kode === KODE)) {
      const d = await fetch(`${API}/api/v1/struktur/${y.id}`, { method: 'DELETE', headers: { cookie } })
      console.error(`⚠ baris yatim ${y.kode} disapu (${d.ok ? 'terhapus' : 'GAGAL'})`)
    }
  }
}

console.log(`\ntangkapan layar → ${KELUAR}`)
if (gagal) { console.error(`\n❌ ${gagal} masalah\n`); process.exit(1) }
console.log('\n✅ Panel banding bisa dipakai dari layar dan hasilnya membandingkan\n')
