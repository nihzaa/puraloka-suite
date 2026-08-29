#!/usr/bin/env node
/**
 * PENJAGA: kotak berpadding tak boleh langsung membungkus kotak berpadding.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG DIJAGA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kartu ber-`--pad-kartu` yang isinya SATU anak yang juga berpadding membuat
 * jarak tepi terhitung DUA KALI: 24px + 24px = 48px. Isinya lalu terlihat
 * mengambang di kotak yang terlalu besar, dan yang paling merugikan, jaraknya
 * BERBEDA dari kartu tetangganya yang tak kebetulan bertumpuk.
 *
 * Cacat ini tak pernah mengeluarkan galat, tak tertangkap tsc, dan tak
 * tertangkap test mana pun — ia hanya terlihat oleh mata yang membandingkan
 * dua kartu bersebelahan.
 *
 * ── Kenapa DIUKUR DI DOM, bukan dibaca dari sumber
 *
 * Padding datang dari tiga tempat sekaligus: `style` inline, kelas Tailwind,
 * dan `var(--pad-*)` di globals.css. Membacanya dari sumber berarti menebak
 * hasil kaskade — dan kaskade justru tempat cacat ini lahir.
 *
 * `getComputedStyle` menjawab pertanyaan yang sesungguhnya: berapa piksel yang
 * BENAR-BENAR dipakai saat halaman dirender.
 *
 * ── Yang TIDAK dihitung pelanggaran
 *
 *   • induk dengan lebih dari satu anak — padding induk memberi jarak ANTAR
 *     anak, jadi keduanya punya tugas berbeda dan tak saling menggandakan;
 *   • padding di bawah 8px — itu jarak halus (sel tabel, pil status), bukan
 *     bantalan kotak;
 *   • anak yang menggulir sendiri — paddingnya bagian dari area gulirnya;
 *   • anak yang punya garis atau latar berbeda — ia kotak TERSENDIRI di dalam
 *     kartu, dan bantalannya memang miliknya.
 *
 * ── Kenapa RATCHET, bukan ambang nol
 *
 * Sebagian tumpukan memang disengaja: pembungkus gulir, kotak dalam kotak yang
 * beda warna, panel ber-header. Yang ditegakkan bukan nol — melainkan bahwa
 * jumlahnya TIDAK BERTAMBAH, sehingga halaman baru mengikuti konvensi alih-alih
 * menumpuk bantalan baru.
 *
 * Jalankan (butuh web hidup + kredensial di apps/web/.env.local):
 *   node apps/web/scripts/uji-padding-tak-ganda.mjs
 */
import { chromium } from '@playwright/test'
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DI_SINI = dirname(fileURLToPath(import.meta.url))
const AKAR = join(DI_SINI, '..')
const LANTAI = join(DI_SINI, 'lantai-padding-ganda.json')

const env = {}
for (const b of readFileSync(join(AKAR, '.env.local'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
  const i = b.indexOf('=')
  if (i < 1 || b.trimStart().startsWith('#')) continue
  env[b.slice(0, i).trim().replace(/^﻿/, '')] = b.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const BASIS = env.LAYAR_BASIS ?? 'http://localhost:3000'
if (!env.LAYAR_EMAIL || !env.LAYAR_SANDI) {
  console.error('LAYAR_EMAIL / LAYAR_SANDI kosong di apps/web/.env.local.')
  console.error('Tanpa sesi, tiap halaman dialihkan ke /login dan hasilnya PALSU.')
  process.exit(1)
}

/** Rute dibaca dari STRUKTUR BERKAS — halaman baru masuk jangkauan sendiri. */
function ruteDari(dir, awalan = '') {
  const hasil = []
  for (const nama of readdirSync(dir)) {
    const jalur = join(dir, nama)
    if (!statSync(jalur).isDirectory()) continue
    const segmen = nama.startsWith('(') && nama.endsWith(')') ? '' : '/' + nama
    const anak = awalan + segmen
    if (existsSync(join(jalur, 'page.tsx'))) hasil.push(anak === '' ? '/' : anak)
    hasil.push(...ruteDari(jalur, anak))
  }
  return hasil
}

const rute = ruteDari(join(AKAR, 'app', '(dashboard)')).filter((r) => !r.includes('['))

const browser = await chromium.launch()
const hal = await (await browser.newContext()).newPage()

await hal.goto(BASIS + '/login', { waitUntil: 'domcontentloaded' })
await hal.fill('input[type="email"]', env.LAYAR_EMAIL)
await hal.fill('input[type="password"]', env.LAYAR_SANDI)
await hal.click('form button[type="submit"]')
/*
  Menunggu SESI, bukan navigasi.

  `waitForURL` melewatkan perpindahan yang terjadi lebih cepat daripada
  pemasangan pengamatnya — dan saat dev server baru selesai kompilasi,
  perpindahannya memang secepat itu. Gejalanya timeout yang terbaca seperti
  LOGIN GAGAL, padahal log server menunjukkan /dashboard 200.

  Yang ditunggu di sini keadaan yang sesungguhnya penting: URL tak lagi
  /login. Diperiksa berulang, jadi tak peduli kapan perpindahannya terjadi.
*/
for (let i = 0; i < 40; i++) {
  if (!new URL(hal.url()).pathname.startsWith('/login')) break
  await hal.waitForTimeout(1000)
}
if (new URL(hal.url()).pathname.startsWith('/login')) {
  console.error('Gagal masuk — masih di /login sesudah 40 detik.')
  console.error('Teks layar: ' + (await hal.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 160))
  await browser.close()
  process.exit(1)
}

const PEMERIKSA = () => {
  const AMBANG = 8
  const hasil = []
  const pad = (el) => {
    const g = getComputedStyle(el)
    return {
      atas: parseFloat(g.paddingTop) || 0,
      kiri: parseFloat(g.paddingLeft) || 0,
      overflow: g.overflow + g.overflowY + g.overflowX,
      border: parseFloat(g.borderTopWidth) || 0,
      bg: g.backgroundColor,
    }
  }
  for (const induk of document.querySelectorAll('div, section, article, main')) {
    const anakEl = [...induk.children].filter(
      (c) => c.nodeType === 1 && ['SCRIPT', 'STYLE', 'TEMPLATE'].indexOf(c.tagName) === -1
    )
    if (anakEl.length !== 1) continue
    const a = anakEl[0]
    if (!(a instanceof HTMLElement)) continue
    const pi = pad(induk)
    const pa = pad(a)
    if (pa.overflow.indexOf('auto') !== -1 || pa.overflow.indexOf('scroll') !== -1) continue
    if (pa.border > 0) continue
    if (pa.bg !== pi.bg && pa.bg !== 'rgba(0, 0, 0, 0)') continue
    const gandaX = pi.kiri >= AMBANG && pa.kiri >= AMBANG
    const gandaY = pi.atas >= AMBANG && pa.atas >= AMBANG
    if (!gandaX && !gandaY) continue
    hasil.push({
      induk: (induk.className || induk.tagName).toString().slice(0, 60),
      anak: (a.className || a.tagName).toString().slice(0, 60),
      x: gandaX ? pi.kiri + '+' + pa.kiri : '-',
      y: gandaY ? pi.atas + '+' + pa.atas : '-',
    })
  }
  return hasil
}

const temuan = []
let dipindai = 0
let dialihkan = 0

for (const r of rute) {
  await hal.goto(BASIS + r, { waitUntil: 'domcontentloaded' })
  await hal.waitForTimeout(500)
  if (new URL(hal.url()).pathname !== r) {
    dialihkan++
    continue
  }
  dipindai++
  for (const t of await hal.evaluate(PEMERIKSA)) temuan.push({ rute: r, ...t })
}
await browser.close()

console.log('\n== PENJAGA: padding tak ganda ' + '='.repeat(34))
console.log('  halaman dipindai : ' + dipindai + ' (dialihkan ' + dialihkan + ')')
console.log('  padding ganda    : ' + temuan.length)

// Cakupan runtuh — angka nol atas halaman yang tak pernah dibuka bukan bukti.
if (dipindai === 0 || dialihkan > rute.length / 4) {
  console.error('\nCAKUPAN RUNTUH: ' + dipindai + '/' + rute.length + ' terpindai. Hasil TIDAK SAH.')
  process.exit(1)
}

const lantai = existsSync(LANTAI) ? JSON.parse(readFileSync(LANTAI, 'utf8')).jumlah : null

if (lantai === null) {
  writeFileSync(
    LANTAI,
    JSON.stringify({ jumlah: temuan.length, diukur: new Date().toISOString().slice(0, 10) }, null, 2) + '\n'
  )
  console.log('\nLantai dipasang di ' + temuan.length + '. Jalankan lagi untuk menegakkannya.')
  for (const t of temuan.slice(0, 15)) {
    console.log('   ' + t.rute + '  x=' + t.x + ' y=' + t.y + '  ' + t.anak)
  }
  process.exit(0)
}

if (temuan.length > lantai) {
  console.error('\nNAIK: ' + temuan.length + ' (lantai ' + lantai + ').\n')
  for (const t of temuan.slice(0, 12)) {
    console.error('   ' + t.rute + '  x=' + t.x + ' y=' + t.y)
    console.error('      induk: ' + t.induk)
    console.error('      anak : ' + t.anak)
  }
  console.error('\n   Kotak berpadding membungkus kotak berpadding: jarak tepi terhitung')
  console.error('   DUA KALI. Buang salah satunya, atau beri anaknya garis/latar sendiri')
  console.error('   kalau ia memang kotak terpisah.')
  process.exit(1)
}

if (temuan.length < lantai) {
  writeFileSync(
    LANTAI,
    JSON.stringify({ jumlah: temuan.length, diukur: new Date().toISOString().slice(0, 10) }, null, 2) + '\n'
  )
  console.log('\nTURUN ' + lantai + ' -> ' + temuan.length + '. Lantai diketatkan.')
  process.exit(0)
}

console.log('\nTetap di lantai ' + lantai + '.')
