#!/usr/bin/env node
/**
 * PENJAGA TOKEN DERET GRAFIK DIPAKAI SEBAGAI WARNA TEKS.
 *
 * ── Kelas cacat, bukan kejadian tunggal
 *
 * `--data-1`…`--data-8` adalah deret KATEGORI untuk grafik. Ambangnya 3:1
 * sebagai komponen non-teks (WCAG 1.4.11) — mereka memang dipilih supaya
 * saling terbedakan di bawah simulasi deutan/protan, bukan supaya terbaca
 * sebagai huruf.
 *
 * Dipakai sebagai warna TEKS mereka gagal ambang 4,5:1. Diukur: `--data-5`
 * (#EA580C) di atas `--warning-bg` menghasilkan 3,43:1.
 *
 * Cacat yang sama diperbaiki LIMA KALI di tempat berbeda:
 *   /audit · keuangan/arus-kas · piutang · proyek/[id] · absorption-log-table
 *
 * Tiap kali perbaikannya benar dan tiap kali yang berikutnya muncul lagi.
 * Selama tak ada yang menolaknya, yang keenam hanya soal waktu.
 *
 * ── Yang BUKAN pelanggaran
 *
 * `background`, `fill`, `stroke`, `borderColor` — di situ token deret memang
 * pada tempatnya, dan ambang 3:1 berlaku. Penjaga yang menolaknya akan
 * mematikan seluruh palet grafik.
 *
 * Pakai: node apps/web/scripts/uji-token-grafik-bukan-teks.mjs
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Akar diturunkan dari lokasi berkas ini, bukan `process.cwd()` — penjaga
// yang cuma bisa dijalankan dari satu direktori adalah penjaga yang berhenti
// dijalankan orang.
const AKAR_WEB = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * `color:` yang nilainya token deret data.
 *
 * Jendela pencarian `[^,;{}]*?` mengizinkan bentuk TERNARY —
 * `color: x > 0 ? "var(--data-5)" : C.muted` — tapi berhenti di koma pemisah
 * properti supaya `background: var(--data-5), … color: var(--info)` tak
 * dilaporkan palsu.
 *
 * Versi pertama menuntut token tepat sesudah `color:` dan melewatkan ternary,
 * yaitu bentuk yang paling umum untuk warna bersyarat. Kelas kesalahan yang
 * sama pernah membuat `uji-warna-buta-mode` buta terhadap
 * `background: aktif ? "#fff" : …`.
 */
const TEKS_DERET = /(?<![a-zA-Z-])color\s*:\s*[^,;{}]*?var\(--data-\d\)/

const berkas = execSync('grep -rl "var(--data-" app components --include=*.tsx || true', {
  encoding: 'utf8', cwd: AKAR_WEB,
}).trim().split('\n').filter(Boolean)

const temuan = []

for (const f of berkas) {
  const baris = readFileSync(join(AKAR_WEB, f), 'utf8').split(/\r?\n/)
  let dalamBlok = false
  for (let i = 0; i < baris.length; i++) {
    const b = baris[i]
    // Komentar tak boleh dibaca sebagai kode — pelajaran dari `uji-warna-buta-mode`
    // yang sempat menuduh catatan tentang cacat, bukan cacatnya.
    if (dalamBlok) { if (/\*\//.test(b)) dalamBlok = false; continue }
    if (/\{?\/\*/.test(b) && !/\*\//.test(b)) { dalamBlok = true; continue }
    if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(b)) continue
    if (!TEKS_DERET.test(b)) continue
    // `backgroundColor`/`borderColor` mengandung "color" — sudah ditolak oleh
    // lookbehind di regex, tapi diperiksa ulang di sini supaya jelas.
    if (/background[Cc]olor|border[Cc]olor/.test(b)) continue

    temuan.push({ di: `${f}:${i + 1}`, isi: b.trim().slice(0, 96) })
  }
}

console.log('')
if (temuan.length === 0) {
  console.log(`✅ Token grafik: ${berkas.length} berkas memakai --data-*, nol dipakai sebagai warna TEKS`)
  process.exit(0)
}

console.log(`❌ ${temuan.length} token deret grafik dipakai sebagai warna TEKS.\n`)
console.log('   `--data-*` ambangnya 3:1 (komponen non-teks). Sebagai warna teks')
console.log('   ia gagal 4,5:1 — diukur: --data-5 di atas --warning-bg = 3,43:1.\n')
console.log('   Perbaikan: pakai token teks yang sepadan.')
console.log('       --data-5 (oranye) → var(--warning)  atau  C.orangeTeks')
console.log('       --data-2 (biru)   → var(--info)')
console.log('   Untuk PENANDA (background/fill/stroke) token deret tetap benar.\n')
for (const t of temuan) {
  console.log(`   ${t.di}`)
  console.log(`      ${t.isi}\n`)
}
process.exit(1)
