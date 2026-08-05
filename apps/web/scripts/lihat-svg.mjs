#!/usr/bin/env node
/**
 * Merender SVG jadi PNG supaya bisa DILIHAT, bukan dibayangkan dari path-nya.
 * Menggambar ulang logo dari koordinat tanpa memeriksa hasilnya adalah cara
 * paling cepat menghasilkan bentuk yang salah dengan percaya diri.
 *
 * Pakai: node apps/web/scripts/lihat-svg.mjs public/puraloka-lambang.svg
 */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'

const berkas = process.argv[2]
if (!berkas) { console.log('Pakai: lihat-svg.mjs <path.svg> [warna]'); process.exit(1) }
const warna = process.argv[3] ?? '#003366'

const svg = readFileSync(resolve(berkas), 'utf8')
const keluar = join(process.cwd(), 'apps', 'web', '.layar')
mkdirSync(keluar, { recursive: true })

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 520, height: 300 }, deviceScaleFactor: 2 })
// Dua ukuran sekaligus: besar untuk menilai bentuk, 24px untuk menilai apakah
// ia masih terbaca sebagai favicon.
await p.setContent(`<body style="margin:0;display:flex;gap:40px;align-items:center;
  justify-content:center;height:300px;background:#fff;color:${warna}">
  <div style="width:160px">${svg}</div>
  <div style="width:64px">${svg}</div>
  <div style="width:24px">${svg}</div>
  <div style="width:160px;background:#0F1117;padding:12px;color:#7ABDFF">${svg}</div>
</body>`)
const nama = basename(berkas, '.svg') + '-lihat.png'
await p.screenshot({ path: join(keluar, nama) })
await b.close()
console.log(`✓ ${nama}`)
