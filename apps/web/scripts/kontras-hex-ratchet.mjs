#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Kontras pada warna HEX MENTAH — yang lolos dari `kontras-ratchet.mjs`.
//
// `kontras-ratchet.mjs` memeriksa 38 pasangan TOKEN di `globals.css` dan
// menemukan `--danger` mode gelap yang gagal 4,47:1. Tapi ia berhenti di token:
// 394 warna hex ditulis langsung di komponen, 302 di antaranya untuk `color`
// — dan `color` adalah teks, persis yang WCAG atur.
//
// Penjaga ini menutup celah itu untuk kasus yang bisa dinilai dengan pasti:
// `color` dan `background` yang ditulis pada BARIS YANG SAMA. Keduanya jelas
// berpasangan, jadi kontrasnya bisa dihitung tanpa menebak apa yang ada di
// belakang elemen.
//
// Temuan pada jalan pertamanya (2026-08-02), keduanya TOMBOL bukan teks hias:
//   proyek/[id]:935          #EA580C pada #FFF7ED = 3,35:1  (tombol "+ Update", 9px)
//   progress-log-modal:319   #94a3b8 pada #f8fafc = 2,45:1  (tombol tutup dialog)
//
// Keduanya diperbaiki dengan TOKEN (`var(--warning)`, `var(--text-secondary)`),
// bukan hex baru — sekaligus mengurangi jumlah hex mentah.
//
// ── Yang TIDAK dijangkau
//
// Warna yang latarnya diwarisi dari induk (mayoritas dari 302 itu). Menilainya
// butuh menghitung kaskade CSS sungguhan — itu pekerjaan browser, dan tempatnya
// di audit axe, bukan di penjaga statis. Dicatat supaya angka 0 di sini tak
// dibaca sebagai "seluruh kontras aman".
//
// ── Ambang
//
// NOL. Pasangan yang keduanya ditulis eksplisit di satu baris tak punya alasan
// untuk gagal AA — nilainya diketahui saat menulis.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function berkas(dir, hasil = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) { if (n !== 'node_modules' && n !== '.next' && n !== 'ds-bundle') berkas(p, hasil) }
    else if (n.endsWith('.tsx')) hasil.push(p)
  }
  return hasil
}

function lum(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length === 8) h = h.slice(0, 6)
  const v = [0, 2, 4].map(i => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}
const rasio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const temuan = []
for (const f of [...berkas(join(AKAR, 'app')), ...berkas(join(AKAR, 'components'))]) {
  const teks = readFileSync(f, 'utf8')
  const baris = teks.split('\n')
  baris.forEach((isi, i) => {
    // color + background dalam SATU baris style = pasangan yang pasti berdampingan
    const c = /(?:^|[^-\w])color:\s*["']?(#[0-9a-fA-F]{3,8})/.exec(isi)
    const b = /background(?:Color)?:\s*["']?(#[0-9a-fA-F]{3,8})/.exec(isi)
    if (c && b) {
      const r = rasio(c[1], b[1])
      if (r < 4.5) temuan.push({ f: f.slice(AKAR.length), i: i + 1, fg: c[1], bg: b[1], r: r.toFixed(2) })
    }
  })
}
if (temuan.length === 0) {
  console.log('✅ Kontras hex-mentah: nol pasangan sebaris yang gagal WCAG AA')
  process.exit(0)
}

console.error(`
❌ ${temuan.length} pasangan warna gagal WCAG AA (<4,5:1)
`)
for (const t of temuan) {
  console.error(`   ${t.f}:${t.i}`)
  console.error(`     ${t.fg} pada ${t.bg} = ${t.r}:1  (syarat 4,5:1)`)
}
console.error(`
Teks dengan kontras di bawah 4,5:1 sulit dibaca di layar terang, pada perangkat
lama, dan oleh mata yang tak lagi muda — tiga hal yang justru menggambarkan
orang lapangan yang memakai aplikasi ini.

Perbaikan: pakai token yang sudah lulus (\`var(--text-secondary)\`,
\`var(--warning)\`, dst) alih-alih hex baru.
`)
process.exit(1)
