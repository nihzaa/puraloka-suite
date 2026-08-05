#!/usr/bin/env node
/**
 * PINDAH DEKLARASI — memindahkan `const`/`interface`/`type` tingkat-modul
 * dari satu berkas ke berkas lain, dengan `export`.
 *
 * Pendamping `ekstrak-fungsi.mjs`, untuk hal yang bukan fungsi.
 *
 * Pakai: node scripts/pindah-deklarasi.mjs <dari> <ke> <Nama>...
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'

const [dari, ke, ...nama] = process.argv.slice(2)
if (!dari || !ke || !nama.length) {
  console.log('Pakai: pindah-deklarasi.mjs <dari> <ke> <Nama>...')
  process.exit(1)
}

const baris = readFileSync(dari, 'utf8').split(/\r?\n/)
const temuan = []

for (const n of nama) {
  const mulai = baris.findIndex((l) =>
    l.startsWith(`const ${n} `) || l.startsWith(`const ${n}:`) ||
    l.startsWith(`interface ${n} `) || l.startsWith(`interface ${n}<`) ||
    l.startsWith(`type ${n} `) || l.startsWith(`type ${n}=`)
  )
  if (mulai < 0) { console.log(`✗ ${n}: tak ditemukan`); continue }

  let akhir = mulai
  if (baris[mulai].startsWith('type ')) {
    // Alias tipe berakhir di titik-koma — bisa satu baris atau beberapa.
    while (akhir < baris.length && !/;\s*$/.test(baris[akhir])) akhir++
  } else if (/\{/.test(baris[mulai]) && !/\}/.test(baris[mulai])) {
    // Blok berkurawal: cari penutup di kolom 0.
    while (akhir < baris.length && !/^\}/.test(baris[akhir + 1] ?? '')) akhir++
    akhir++
  }
  temuan.push({ n, mulai, akhir })
  console.log(`${n.padEnd(22)} baris ${mulai + 1} → ${akhir + 1}`)
}

if (!temuan.length) process.exit(1)

let teks = ''
for (const t of temuan) teks += '\n' + 'export ' + baris.slice(t.mulai, t.akhir + 1).join('\n') + '\n'
appendFileSync(ke, teks)

// Potong dari BELAKANG supaya indeks yang belum diproses tak bergeser.
let sisa = [...baris]
for (const t of [...temuan].sort((a, b) => b.mulai - a.mulai)) {
  sisa = [...sisa.slice(0, t.mulai), ...sisa.slice(t.akhir + 1)]
}
writeFileSync(dari, sisa.join('\n'))
console.log(`\n${temuan.length} deklarasi dipindah ke ${ke}`)
