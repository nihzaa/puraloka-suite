#!/usr/bin/env node
/**
 * RAPIKAN KERAPATAN — memetakan nilai padding/font/radius/shadow yang
 * tersebar ke tangga skala terdekat.
 *
 * ── Kenapa alat, bukan tangan
 *
 * Diukur: 272 nilai padding berbeda di 117 berkas. Memperbaikinya satu per
 * satu adalah ribuan suntingan, dan tiap suntingan adalah peluang salah.
 *
 * ── Kenapa PEMBULATAN ke tangga, bukan penggantian sembarang
 *
 * `9px` → `8px` dan `10px` → `8px` menggeser tata letak paling banyak 2px —
 * tak terlihat sendirian, tapi begitu SELURUH aplikasi memakai tangga yang
 * sama, ritme vertikalnya sejajar. Itu yang membuat halaman terasa satu
 * sistem.
 *
 * Yang TIDAK dilakukan: mengubah nilai yang jauh dari tangga (mis. 47px).
 * Itu biasanya angka yang dihitung, bukan dipilih — dan membulatkannya bisa
 * merusak sesuatu yang bergantung padanya.
 *
 * Pakai:
 *   node scripts/rapikan-kerapatan.mjs            # laporan
 *   node scripts/rapikan-kerapatan.mjs --terapkan
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'

const TERAPKAN = process.argv.includes('--terapkan')

/** Tangga kerapatan — kelipatan 4, plus 6 yang terlalu sering dipakai untuk
 *  dibuang (jarak ikon-teks). */
const TANGGA = [0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64]

/** Tangga tipografi. Sengaja TIDAK memuat 12.5 dan 11.5 — nilai pecahan
 *  lahir dari penyetelan satu-satu, dan itu persis yang dibongkar di sini. */
const TANGGA_FONT = [10, 11, 12, 13, 15, 17, 20, 26, 28, 34]

/** Radius: empat nilai. 5/7/9px tak bisa dibedakan mata tapi merusak
 *  keselarasan sudut saat elemen bersebelahan. */
const TANGGA_RADIUS = [0, 6, 10, 14, 99]

const dekat = (n, tangga, toleransi) => {
  let terbaik = null
  let jarak = Infinity
  for (const t of tangga) {
    const d = Math.abs(t - n)
    if (d < jarak) { jarak = d; terbaik = t }
  }
  // Nilai yang jauh dari tangga dibiarkan: biasanya angka hasil hitungan,
  // bukan pilihan desain.
  return jarak <= toleransi ? terbaik : null
}

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

let ubahPadding = 0, ubahFont = 0, ubahRadius = 0, ubahShadow = 0
const tersentuh = new Set()

for (const p of berkas) {
  // Primitif dan token TIDAK disentuh — di sanalah tangganya didefinisikan.
  const rel = p.split(sep).join('/')
  if (rel.endsWith('components/dasar.tsx')) continue

  const asli = readFileSync(p, 'utf8')
  let isi = asli

  // ── padding: "9px 12px" → "8px 12px" ─────────────────────────────────
  isi = isi.replace(/padding:\s*(["'])([^"']+)\1/g, (m, q, nilai) => {
    const bagian = nilai.trim().split(/\s+/)
    if (!bagian.every((b) => /^\d+px$/.test(b))) return m
    const baru = bagian.map((b) => {
      const n = parseInt(b, 10)
      const t = dekat(n, TANGGA, 2)
      return t == null ? b : `${t}px`
    })
    const hasil = baru.join(' ')
    if (hasil !== nilai.trim()) ubahPadding++
    return `padding: ${q}${hasil}${q}`
  })

  // ── padding: 20 (angka telanjang) ────────────────────────────────────
  isi = isi.replace(/padding:\s*(\d+)(?=[,\s}])/g, (m, v) => {
    const t = dekat(parseInt(v, 10), TANGGA, 2)
    if (t == null || t === parseInt(v, 10)) return m
    ubahPadding++
    return `padding: ${t}`
  })

  // ── gap ──────────────────────────────────────────────────────────────
  isi = isi.replace(/\bgap:\s*(\d+)(?=[,\s}])/g, (m, v) => {
    const t = dekat(parseInt(v, 10), TANGGA, 2)
    if (t == null || t === parseInt(v, 10)) return m
    ubahPadding++
    return `gap: ${t}`
  })

  // ── fontSize ─────────────────────────────────────────────────────────
  isi = isi.replace(/fontSize:\s*(\d+(?:\.\d+)?)(?=[,\s}])/g, (m, v) => {
    const n = parseFloat(v)
    const t = dekat(n, TANGGA_FONT, 1.5)
    if (t == null || t === n) return m
    ubahFont++
    return `fontSize: ${t}`
  })

  // ── borderRadius ─────────────────────────────────────────────────────
  isi = isi.replace(/borderRadius:\s*(\d+)(?=[,\s}])/g, (m, v) => {
    const n = parseInt(v, 10)
    const t = dekat(n, TANGGA_RADIUS, 3)
    if (t == null || t === n) return m
    ubahRadius++
    return `borderRadius: ${t}`
  })

  // ── boxShadow → tiga tingkat elevasi ─────────────────────────────────
  //
  // Dipetakan menurut BLUR-nya: bayangan blur kecil = kartu menempel,
  // blur besar = modal mengambang. Itu satu-satunya sumbu yang bermakna;
  // opasitas dan offset yang berbeda-beda hanyalah penyetelan tak sengaja.
  isi = isi.replace(/boxShadow:\s*(["'])(0 [^"']+)\1/g, (m, q, nilai) => {
    if (nilai.includes('inset') || nilai.includes('var(')) return m
    const blur = parseInt(nilai.match(/\d+px\s+(\d+)px/)?.[1] ?? '0', 10)
    const tingkat = blur <= 6 ? 1 : blur <= 24 ? 2 : 3
    ubahShadow++
    return `boxShadow: ${q}var(--naik-${tingkat})${q}`
  })

  if (isi !== asli) {
    tersentuh.add(rel)
    if (TERAPKAN) writeFileSync(p, isi)
  }
}

console.log(`Berkas dipindai : ${berkas.length}`)
console.log(`Berkas berubah  : ${tersentuh.size}`)
console.log(`\n  padding/gap : ${ubahPadding} penyesuaian`)
console.log(`  fontSize    : ${ubahFont}`)
console.log(`  radius      : ${ubahRadius}`)
console.log(`  boxShadow   : ${ubahShadow} → var(--naik-N)`)

if (!TERAPKAN) {
  console.log('\n(laporan saja — tambahkan --terapkan untuk mengubah)')
} else {
  console.log('\nDiterapkan. JALANKAN tsc + potret layar sekarang.')
}
