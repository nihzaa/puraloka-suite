#!/usr/bin/env node
/**
 * SAPU LAYAR — memotret SEMUA halaman dan melaporkan yang bermasalah.
 *
 * ── Kenapa ada
 *
 * "Perbaiki setiap sudut, setiap detail" tak bisa dikerjakan dengan membuka
 * halaman satu per satu dengan tangan — ada ~50 rute, masing-masing dua mode.
 * Yang lebih penting: halaman yang JARANG dibuka justru yang paling mungkin
 * rusak, dan itu persis halaman yang tak akan diperiksa manual.
 *
 * Alat ini memotret semuanya, mengumpulkan galat konsol per halaman, dan
 * mencetak daftar yang perlu dilihat. Gambarnya ada di `.layar/` untuk
 * ditinjau; laporannya untuk memutuskan mana yang dibuka lebih dulu.
 *
 * Pakai (DARI ROOT REPO):
 *   LAYAR_EMAIL=... LAYAR_SANDI=... node apps/web/scripts/sapu-layar.mjs
 *   ... --gelap        # mode gelap
 *   ... --hanya /kas   # satu rute saja
 */
import { chromium } from '@playwright/test'
import { readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'

const ARG = process.argv.slice(2)
const GELAP = ARG.includes('--gelap')
const iHanya = ARG.indexOf('--hanya')
const HANYA = iHanya >= 0 ? ARG[iHanya + 1] : null

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

// ── Kumpulkan rute dari struktur berkas ───────────────────────────────────
const AKAR_APP = join('apps', 'web', 'app')
const berkasPage = []
const jelajah = (d) => {
  for (const n of readdirSync(d)) {
    if (n[0] === '.' || n === 'node_modules') continue
    const p = join(d, n)
    if (statSync(p).isDirectory()) jelajah(p)
    else if (n === 'page.tsx') berkasPage.push(p)
  }
}
jelajah(AKAR_APP)

const rute = berkasPage
  .map((p) => p.split(sep).join('/'))
  .map((p) => p.replace('apps/web/app', '').replace('/page.tsx', ''))
  // Grup rute `(dashboard)` tak muncul di URL.
  .map((p) => p.replace(/\/\([^)]+\)/g, ''))
  // Rute dinamis butuh id nyata — dilewati, dan ITU DILAPORKAN supaya tak
  // terbaca sebagai "semua halaman sudah diperiksa".
  .filter((p) => !p.includes('['))
  .map((p) => p || '/')
  .filter((p, i, a) => a.indexOf(p) === i)
  .sort()

const dinamis = berkasPage.filter((p) => p.includes('[')).length

const daftar = HANYA ? rute.filter((r) => r.startsWith(HANYA)) : rute
console.log(`Rute statis: ${rute.length}  ·  dilewati (dinamis): ${dinamis}`)
if (HANYA) console.log(`Disaring "${HANYA}": ${daftar.length}\n`)

const KELUAR = join(process.cwd(), 'apps', 'web', '.layar', GELAP ? 'gelap' : 'terang')
mkdirSync(KELUAR, { recursive: true })

const peramban = await chromium.launch()
const konteks = await peramban.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
  colorScheme: GELAP ? 'dark' : 'light',
})
// next-themes menyimpan pilihan di localStorage dan defaultTheme MENANG atas
// preferensi sistem — tanpa ini, "mode gelap" isinya putih semua.
await konteks.addInitScript((g) => {
  localStorage.setItem('theme', g ? 'dark' : 'light')
}, GELAP)

const hal = await konteks.newPage()
let galat = []
hal.on('console', (m) => { if (m.type() === 'error') galat.push(m.text()) })
hal.on('pageerror', (e) => galat.push(String(e)))

if (EMAIL && SANDI) {
  await hal.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
  await hal.waitForSelector('#login-email', { state: 'visible', timeout: 20_000 })
  await hal.fill('#login-email', EMAIL)
  await hal.fill('#login-password', SANDI)
  await hal.click('button[type="submit"]')
  await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
    .catch(() => console.log('⚠️  login tak berpindah halaman'))
} else {
  console.log('⚠️  LAYAR_EMAIL/LAYAR_SANDI kosong — halaman ber-sesi akan jadi layar masuk.')
}

const hasil = []
for (const r of daftar) {
  galat = []
  const nama = (r === '/' ? 'akar' : r.slice(1).replace(/\//g, '-')) + '.png'
  let status = 'ok'
  try {
    const resp = await hal.goto(`${BASIS}${r}`, { waitUntil: 'networkidle', timeout: 25_000 })
    if (resp && resp.status() >= 400) status = `HTTP ${resp.status()}`
  } catch (e) {
    status = e.message.split('\n')[0].slice(0, 60)
  }
  await hal.waitForTimeout(700)

  // ⚠️ Pengalihan HARUS terdeteksi, apa pun tujuannya.
  //
  // Versi pertama hanya memeriksa pengalihan ke `/login`. Akibatnya
  // `/lapangan/punch-list` dilaporkan SEHAT padahal yang tampil adalah
  // dashboard — middleware mengalihkannya diam-diam karena rutenya tak
  // terdaftar. Potretnya bagus, konsolnya bersih, dan halamannya salah.
  //
  // Sekarang: URL akhir dibandingkan dengan yang diminta. Beda = dialihkan.
  const urlAkhir = new URL(hal.url()).pathname
  if (urlAkhir !== r && !(r === '/' && urlAkhir === '/')) {
    // Pengalihan yang WAJAR untuk akun ini: portal peran lain, halaman masuk,
    // dan akar situs. Akun admin memang tidak boleh membuka portal mandor —
    // melaporkannya sebagai kerusakan membuat 22 baris merah yang semuanya
    // benar, dan daftar yang begitu akan berhenti dibaca.
    //
    // Yang TIDAK wajar: halaman modul yang seharusnya bisa dibuka akun ini.
    // Itu yang menyingkap `/lapangan/*` — tiga halaman jadi yang tak pernah
    // terjangkau karena rutenya tak terdaftar di middleware.
    const WAJAR_DIALIHKAN = ['/', '/login', '/auth', '/portal', '/mandor-portal', '/pm-portal']
    const wajar = WAJAR_DIALIHKAN.some((w) => r === w || r.startsWith(w + '/'))
    status = wajar
      ? 'bukan hak akun ini'
      : urlAkhir.includes('/login')
        ? 'butuh izin lain'
        : `DIALIHKAN ke ${urlAkhir}`
  }

  try {
    await hal.screenshot({ path: join(KELUAR, nama), fullPage: true })
  } catch { status = status === 'ok' ? 'gagal potret' : status }

  const g = galat.filter((x) => !x.includes('Download the React DevTools'))
  hasil.push({ rute: r, status, galat: g.length, contoh: g[0]?.slice(0, 110) ?? null })
  const tanda = status !== 'ok' ? '✗' : g.length ? '⚠' : '✓'
  console.log(`${tanda} ${r.padEnd(34)} ${status === 'ok' ? '' : status} ${g.length ? `(${g.length} galat)` : ''}`)
}

await peramban.close()

const bukanHak = hasil.filter((h) => h.status === 'bukan hak akun ini')
const rusak = hasil.filter((h) => h.status !== 'ok' && h.status !== 'bukan hak akun ini')
const bergalat = hasil.filter((h) => h.status === 'ok' && h.galat > 0)
console.log(`\n── Ringkasan (${GELAP ? 'GELAP' : 'TERANG'}) ──`)
console.log(`  sehat          : ${hasil.length - rusak.length - bergalat.length - bukanHak.length}`)
console.log(`  ada galat      : ${bergalat.length}`)
console.log(`  bukan hak akun : ${bukanHak.length}  (portal peran lain — wajar)`)
console.log(`  BERMASALAH     : ${rusak.length}`)
if (rusak.length) {
  console.log('\nHalaman yang seharusnya bisa dibuka tapi tidak:')
  for (const h of rusak) console.log(`  ${h.rute.padEnd(34)} ${h.status}`)
}
if (bergalat.length) {
  console.log('\nHalaman dengan galat konsol:')
  for (const h of bergalat) console.log(`  ${h.rute}\n     ${h.contoh}`)
}

writeFileSync(
  join(process.cwd(), 'apps', 'web', '.layar', `laporan-${GELAP ? 'gelap' : 'terang'}.json`),
  JSON.stringify(hasil, null, 2)
)
console.log(`\nGambar: ${KELUAR}`)
