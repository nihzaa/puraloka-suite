#!/usr/bin/env node
/**
 * PENJAGA: TIAP MODUL PUNYA NAMA DI BREADCRUMB — bukan tebakan dari URL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `getPageTitle` di `topbar.tsx` punya cadangan yang menurunkan nama dari
 * rutenya sendiri, dan komentarnya menyatakan alasannya:
 *
 *     Halaman baru yang belum terdaftar akan tampil apa adanya ("Uji Gulir")
 *     — terlihat mentah, dan itu memang tujuannya: yang mentah menuntut
 *     diperbaiki, yang berbohong tidak.
 *
 * Alasan itu benar. Masalahnya, "menuntut diperbaiki" hanya bekerja kalau
 * ada yang MELIHAT. Diukur di peramban 2026-08-12: `/sdm/timesheet`
 * menampilkan **"Sdm"** — satu kata mentah yang bertahan entah berapa lama,
 * dan sebelas modul lain sedang menunggu giliran yang sama.
 *
 * Yang mentah tak menuntut apa-apa dari orang yang tak membuka halamannya.
 * Penjaga inilah yang menagih janji itu.
 *
 * ── Yang diperiksa
 *
 * Tiap direktori tingkat-satu di `app/(dashboard)/` harus punya entri di
 * `breadcrumbMap`. Ambang NOL — kesebelasnya sudah diisi di commit yang
 * sama, jadi lantainya memang nol.
 *
 * ── Kenapa tidak sekalian memeriksa labelnya cocok dengan `menu_items`
 *
 * Karena sebagian penyimpangan itu SENGAJA dan benar. Breadcrumb menyebut
 * MODUL ("Keuangan") sementara sidebar menyebut HALAMAN ("Ringkasan
 * Keuangan") — dua tingkat berbeda, dua kata berbeda, keduanya tepat.
 *
 * Penjaga yang menuntut keduanya sama akan memaksa breadcrumb berbunyi
 * "Ringkasan Keuangan / Kasbon", yang salah. Jadi yang dijaga hanya
 * KEBERADAAN entri, bukan isinya. Ketepatan katanya dijaga
 * `topbar.test.ts` per-entri, tempat alasannya bisa ditulis satu-satu.
 *
 * Pakai:  node apps/web/scripts/uji-remah-lengkap.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(__dirname, '..')
const AKAR = join(WEB, 'app', '(dashboard)')
const TOPBAR = join(WEB, 'components', 'topbar.tsx')

const isi = readFileSync(TOPBAR, 'utf8')
const blok = isi.slice(isi.indexOf('const breadcrumbMap'), isi.indexOf('];', isi.indexOf('const breadcrumbMap')))
if (!blok) {
  console.error('❌ `breadcrumbMap` tak ditemukan di components/topbar.tsx — penjaga ini kehilangan sasarannya')
  process.exit(2)
}

const terdaftar = new Set([...blok.matchAll(/\["(\/[^"]*)"/g)].map((m) => m[1]))

/**
 * Direktori yang memang BUKAN modul, jadi tak butuh entri sendiri.
 * Tiap baris wajib menyebut alasannya — daftar pengecualian tanpa alasan
 * adalah cara termudah membuat penjaga ini jadi hiasan.
 */
const BUKAN_MODUL = new Map([
  ['_bersama', 'folder bersama, bukan rute'],
])

const hilang = []
for (const e of readdirSync(AKAR)) {
  if (!statSync(join(AKAR, e)).isDirectory()) continue
  if (e.startsWith('(') || e.startsWith('[') || e.startsWith('_')) continue
  if (BUKAN_MODUL.has(e)) continue
  if (!terdaftar.has(`/${e}`)) hilang.push(`/${e}`)
}

if (hilang.length) {
  console.error(`\n❌ ${hilang.length} modul tanpa nama di breadcrumb:\n`)
  for (const h of hilang) {
    const tebakan = h.slice(1).split('-').map((k) => k[0].toUpperCase() + k.slice(1)).join(' ')
    console.error(`   ${h.padEnd(20)} akan tampil sebagai "${tebakan}"`)
  }
  console.error(
    `\nTambahkan ke \`breadcrumbMap\` di components/topbar.tsx.` +
    `\nNamanya AMBIL dari label grup sidebar (\`menu_items\`, key \`g-*\`) —` +
    `\norang yang mengklik grup itu harus membaca kata yang sama di breadcrumb.\n` +
    `\nAmbang NOL — lihat kepala berkas ini untuk alasannya.\n`,
  )
  process.exit(1)
}

console.log(`✅ ${terdaftar.size} entri breadcrumb: tiap modul punya namanya sendiri`)
