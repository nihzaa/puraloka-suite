#!/usr/bin/env node
/**
 * AUDIT A11Y RUNTIME — axe-core di halaman yang BENAR-BENAR dirender.
 *
 * ── Kenapa runtime, bukan hanya statis
 *
 * `a11y-ratchet.mjs` memindai sumber dan menangkap kontrol tanpa nama.
 * Itu berguna, tapi buta terhadap tiga hal yang hanya ada saat dirender:
 *
 *   • kontras warna sesungguhnya (token → nilai terhitung, per mode)
 *   • urutan heading setelah komponen disusun
 *   • landmark: apakah isi halaman benar-benar berada di dalam `<main>`
 *
 * Audit axe terakhir menemukan 296 pelanggaran yang SELURUHNYA lolos
 * eslint-plugin-jsx-a11y. Sejak itu semuanya ditutup — berkas ini
 * memastikan tak tumbuh lagi setelah perombakan UI besar.
 *
 * ── Kenapa axe di-bundle, bukan diunduh dari CDN
 *
 * Halaman ini punya CSP dan berjalan tanpa jaringan di CI. `axe-core`
 * sudah ada di node_modules (dependensi @axe-core/playwright), jadi
 * sumbernya dibaca dari disk lalu disuntikkan — tak ada permintaan
 * keluar yang bisa gagal diam-diam dan membuat audit "hijau" palsu.
 *
 * Pakai:
 *   LAYAR_EMAIL=... LAYAR_SANDI=... node scripts/audit-a11y-runtime.mjs
 *   ... --gelap        # mode gelap
 *   ... --url /kas     # satu halaman
 */
import { chromium } from '@playwright/test'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ARG = process.argv.slice(2)
const GELAP = ARG.includes('--gelap')
const iUrl = ARG.indexOf('--url')
const URL_TUNGGAL = iUrl >= 0 ? ARG[iUrl + 1] : null

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

// axe-core dari node_modules — lihat alasan di header.
let AXE_SRC
try {
  AXE_SRC = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
} catch {
  console.error('❌ axe-core tak ditemukan di node_modules.')
  console.error('   pnpm add -D axe-core   (atau @axe-core/playwright)')
  process.exit(2)
}

/**
 * Contoh nilai untuk rute dinamis (`[id]`), lewat env.
 *
 * ── Kenapa perlu
 *
 * Versi lama MELEWATI seluruh rute `[...]`. Akibatnya `/proyek/[id]` — 20
 * bagian, 12.554px, halaman terkaya di aplikasi ini — tak pernah sekali pun
 * diaudit. Cacat nyata bersembunyi di sana: lencana EVM memakai
 * `opacity: 0.7` yang menjatuhkan kontras 4,79:1 → 2,82:1, kelas cacat
 * persis yang dulu menyumbang 227 dari 235 pelanggaran lewat sidebar.
 *
 * Audit yang melewati halaman terpenting lalu melaporkan "nol pelanggaran"
 * memberi rasa aman yang tidak dibayar dengan pemeriksaan apa pun.
 *
 * Nilainya lewat env supaya tak ada UUID yang dipaku di berkas ini —
 * basis berbeda punya id berbeda, dan id yang basi membuat audit memindai
 * halaman 404 sambil tampak berhasil.
 */
const CONTOH_ID = {
  '/proyek/[id]': process.env.LAYAR_ID_PROYEK,
  '/mandor/[id]': process.env.LAYAR_ID_MANDOR,
  '/portal/proyek/[id]': process.env.LAYAR_ID_PROYEK,
  '/pm-portal/proyek/[id]': process.env.LAYAR_ID_PROYEK,
  // Ditambahkan 2026-08-07. Keduanya sebelumnya selalu "TERLEWAT", dan
  // rute yang tak pernah dipindai adalah rute yang cacatnya tak pernah
  // ketahuan — audit yang melaporkan "0 pelanggaran" sambil melewati enam
  // halaman terbaca seperti cakupan penuh.
  '/m/[key]': process.env.LAYAR_KUNCI_MENU,
  '/verify/invoice/[id]': process.env.LAYAR_ID_INVOICE,
}

function halamanDariBerkas() {
  const akar = join(process.cwd(), 'apps', 'web', 'app')
  const hasil = []
  const telusuri = (dir, rute) => {
    for (const isi of readdirSync(dir, { withFileTypes: true })) {
      if (isi.isDirectory()) {
        if (isi.name.startsWith('_')) continue
        telusuri(join(dir, isi.name), rute + (isi.name.startsWith('(') ? '' : `/${isi.name}`))
      } else if (isi.name === 'page.tsx') hasil.push(rute || '/')
    }
  }
  telusuri(akar, '')

  return [...new Set(hasil)]
    .map((r) => {
      if (!r.includes('[')) return r
      const contoh = CONTOH_ID[r]
      // Rute dinamis tanpa contoh id tetap dilewati — tapi itu kini pilihan
      // yang bisa dilihat (dilaporkan di ringkasan), bukan penghilangan diam.
      return contoh ? r.replace(/\[[^\]]+\]/, contoh) : null
    })
    .filter(Boolean)
    .sort()
}

const HALAMAN = URL_TUNGGAL ? [URL_TUNGGAL] : halamanDariBerkas()

// Rute dinamis yang dilewati karena tak diberi contoh id — dinyatakan, bukan
// dihilangkan diam-diam.
const DINAMIS_TERLEWAT = URL_TUNGGAL ? [] : (() => {
  const akar = join(process.cwd(), 'apps', 'web', 'app')
  const semua = []
  const telusuri = (dir, rute) => {
    for (const isi of readdirSync(dir, { withFileTypes: true })) {
      if (isi.isDirectory()) {
        if (isi.name.startsWith('_')) continue
        telusuri(join(dir, isi.name), rute + (isi.name.startsWith('(') ? '' : `/${isi.name}`))
      } else if (isi.name === 'page.tsx' && rute.includes('[')) semua.push(rute)
    }
  }
  telusuri(akar, '')
  return [...new Set(semua)].filter((r) => !CONTOH_ID[r]).sort()
})()

const peramban = await chromium.launch()
const konteks = await peramban.newContext({
  viewport: { width: 1600, height: 1000 },
  colorScheme: GELAP ? 'dark' : 'light',
})
await konteks.addInitScript((g) => localStorage.setItem('theme', g ? 'dark' : 'light'), GELAP)
const hal = await konteks.newPage()

if (EMAIL && SANDI) {
  await hal.goto(`${BASIS}/login`, { waitUntil: 'networkidle' })
  await hal.waitForSelector('#login-email', { timeout: 15_000 })
  await hal.fill('#login-email', EMAIL)
  await hal.fill('#login-password', SANDI)
  await hal.click('button[type="submit"]')
  await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25_000 }).catch(() => {})
  if (hal.url().includes('/login')) {
    console.error('❌ Login gagal — audit akan memindai layar masuk, bukan halamannya.')
    await peramban.close()
    process.exit(2)
  }
} else {
  console.log('⚠️  LAYAR_EMAIL/LAYAR_SANDI tak diisi — hanya halaman publik yang terukur.\n')
}

const semua = []

for (const url of HALAMAN) {
  await hal.goto(`${BASIS}${url}`, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
  await hal.waitForTimeout(1200)

  // Halaman yang mengalihkan ke tempat lain tak dihitung sebagai dirinya.
  const nyata = new URL(hal.url()).pathname
  if (nyata !== url && !(url === '/' )) {
    semua.push({ url, dialihkan: nyata })
    continue
  }

  await hal.evaluate(AXE_SRC)
  const hasil = await hal.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    })
    return {
      lolos: r.passes.length,
      langgar: r.violations.map((v) => ({
        id: v.id,
        dampak: v.impact,
        deskripsi: v.description,
        jumlah: v.nodes.length,
        contoh: v.nodes.slice(0, 2).map((n) => ({
          html: (n.html || '').slice(0, 150),
          target: String(n.target?.[0] ?? ''),
        })),
      })),
    }
  })
  semua.push({ url, ...hasil })
}

await peramban.close()

// ── Laporan ────────────────────────────────────────────────────────────
const mode = GELAP ? 'gelap' : 'terang'
const dialihkan = semua.filter((s) => s.dialihkan)
const dipindai = semua.filter((s) => !s.dialihkan)
const total = dipindai.reduce((n, s) => n + s.langgar.reduce((m, v) => m + v.jumlah, 0), 0)

console.log(`\n══ AUDIT A11Y RUNTIME (axe-core · WCAG 2.1 AA · mode ${mode}) ══\n`)
console.log(`  halaman dipindai : ${dipindai.length}`)
if (dialihkan.length) console.log(`  dialihkan        : ${dialihkan.length} (bukan halaman ini)`)
if (DINAMIS_TERLEWAT.length) {
  // Cakupan yang berkurang HARUS terlihat. "Nol pelanggaran" dari audit yang
  // diam-diam melewati halaman terpenting adalah rasa aman yang tak dibayar.
  console.log(`  rute dinamis TERLEWAT : ${DINAMIS_TERLEWAT.length} — beri contoh id lewat env untuk memindainya`)
  for (const r of DINAMIS_TERLEWAT) console.log(`     ${r}`)
}
console.log(`  pelanggaran      : ${total}\n`)

// Kelompokkan per rule — itu yang menentukan berapa PERBAIKAN, bukan berapa node.
const perRule = new Map()
for (const s of dipindai) {
  for (const v of s.langgar) {
    const k = v.id
    if (!perRule.has(k)) perRule.set(k, { ...v, jumlah: 0, halaman: new Set() })
    const e = perRule.get(k)
    e.jumlah += v.jumlah
    e.halaman.add(s.url)
    if (!e.contoh?.length) e.contoh = v.contoh
  }
}

const URUT = { critical: 0, serious: 1, moderate: 2, minor: 3 }
const daftar = [...perRule.values()].sort(
  (a, b) => (URUT[a.dampak] ?? 9) - (URUT[b.dampak] ?? 9) || b.jumlah - a.jumlah,
)

for (const v of daftar) {
  console.log(`  [${v.dampak}] ${v.id} — ${v.jumlah} node di ${v.halaman.size} halaman`)
  console.log(`     ${v.deskripsi}`)
  if (v.contoh?.[0]) console.log(`     contoh: ${v.contoh[0].html.replace(/\s+/g, ' ')}`)
  console.log(`     halaman: ${[...v.halaman].slice(0, 5).join(', ')}${v.halaman.size > 5 ? ' …' : ''}\n`)
}

const keluar = join(process.cwd(), 'apps', 'web', `.a11y-${mode}.json`)
writeFileSync(keluar, JSON.stringify({ mode, total, halaman: dipindai }, null, 1))
console.log(`  rincian: ${keluar}\n`)

process.exit(total > 0 ? 1 : 0)
