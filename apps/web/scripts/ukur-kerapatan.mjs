#!/usr/bin/env node
/**
 * UKUR KERAPATAN — menghitung seberapa tidak seragam tata letak antar halaman.
 *
 * ── Kenapa ada
 *
 * Warna sudah dijaga penjaga (hex-ratchet, uji-token-merek). Kerapatan tidak:
 * dua halaman bisa sama-sama lolos semua penjaga warna tapi terasa berbeda
 * karena padding, tinggi baris, dan ukuran fontnya beda.
 *
 * "Terasa tidak menyatu" hampir selalu soal ini, bukan warna — dan ia tak
 * bisa diperbaiki tanpa diukur lebih dulu.
 *
 * Pakai: node scripts/ukur-kerapatan.mjs           # ringkasan
 *        node scripts/ukur-kerapatan.mjs --detail  # per berkas
 */
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

const DETAIL = process.argv.includes('--detail')

const berkas = []
const jelajah = (d) => {
  for (const n of readdirSync(d)) {
    if (n[0] === '.' || n === 'node_modules') continue
    const p = join(d, n)
    if (statSync(p).isDirectory()) jelajah(p)
    else if (n.endsWith('.tsx') && !n.includes('.test.')) berkas.push(p)
  }
}
jelajah('app')
jelajah('components')

/** Nilai yang ditemukan, dan di mana. */
const kumpul = (regex, ubah = (x) => x) => {
  const peta = new Map()
  for (const p of berkas) {
    const isi = readFileSync(p, 'utf8')
    for (const m of isi.matchAll(regex)) {
      const v = ubah(m[1])
      if (v == null) continue
      if (!peta.has(v)) peta.set(v, new Set())
      peta.get(v).add(p.split(sep).join('/'))
    }
  }
  return peta
}

const laporan = (judul, peta, catatan) => {
  const urut = [...peta.entries()].sort((a, b) => b[1].size - a[1].size)
  console.log(`\n── ${judul} — ${peta.size} nilai berbeda ──`)
  if (catatan) console.log(`   ${catatan}`)
  for (const [v, files] of urut.slice(0, DETAIL ? 40 : 12)) {
    console.log(`   ${String(v).padEnd(24)} ${files.size} berkas`)
    if (DETAIL && files.size <= 3) {
      for (const f of files) console.log(`      ${f}`)
    }
  }
  if (urut.length > (DETAIL ? 40 : 12)) {
    console.log(`   … ${urut.length - (DETAIL ? 40 : 12)} nilai lain`)
  }
  return peta.size
}

console.log(`Berkas .tsx dipindai: ${berkas.length}`)

// ── Padding kartu ────────────────────────────────────────────────────────
// Pola `padding: "14px 16px"` dan `padding: 20`.
const padding = kumpul(/padding:\s*["']?([\d]+px[^"',}]*|\d+)["']?/g, (v) => v.trim())
const nPadding = laporan('Nilai padding', padding,
  'Satu skala kerapatan seharusnya menghasilkan 4-6 nilai, bukan puluhan.')

// ── Ukuran font ──────────────────────────────────────────────────────────
const font = kumpul(/fontSize:\s*(\d+(?:\.\d+)?)/g, (v) => `${v}px`)
const nFont = laporan('Ukuran font', font,
  'Skala tipografi yang sehat: 6-8 langkah. Lebih dari itu = tak ada skala.')

// ── Radius sudut ─────────────────────────────────────────────────────────
const radius = kumpul(/borderRadius:\s*(\d+)/g, (v) => `${v}px`)
const nRadius = laporan('Border radius', radius,
  'Bentuk yang konsisten butuh 3-4 nilai: kecil, sedang, besar, pil.')

// ── Gap flex/grid ────────────────────────────────────────────────────────
const gap = kumpul(/\bgap:\s*(\d+)/g, (v) => `${v}px`)
const nGap = laporan('Gap', gap,
  'Ritme 4/8px seharusnya menghasilkan 5-6 nilai.')

// ── Bayangan ─────────────────────────────────────────────────────────────
const shadow = kumpul(/boxShadow:\s*["']([^"']+)["']/g, (v) => v.slice(0, 40))
const nShadow = laporan('Box shadow', shadow,
  'Skala elevasi: 3-4 tingkat. Nilai acak membuat kedalaman tak bisa dibaca.')

// ── Ringkasan ────────────────────────────────────────────────────────────
const total = nPadding + nFont + nRadius + nGap + nShadow
console.log(`\n══ Total nilai berbeda: ${total} ══`)
console.log(`   padding ${nPadding} · font ${nFont} · radius ${nRadius} · gap ${nGap} · shadow ${nShadow}`)
console.log(
  '\nSasaran wajar untuk sistem yang seragam: padding ≤8, font ≤10,\n' +
  'radius ≤5, gap ≤7, shadow ≤5 — totalnya di bawah 35.',
)
