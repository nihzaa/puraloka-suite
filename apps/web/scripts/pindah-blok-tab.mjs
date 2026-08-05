#!/usr/bin/env node
/**
 * PINDAH BLOK TAB — memindahkan isi `{tab === "x" && (...)}` jadi halaman
 * rute, utuh.
 *
 * ── Kenapa dipindah utuh, bukan ditulis ulang
 *
 * Blok arus kas 271 baris memuat grafik, saringan majemuk, dan tabel dengan
 * enam jenis transaksi. Menulisnya ulang "sambil merapikan" adalah cara
 * paling mudah menghilangkan satu jenis transaksi tanpa ada yang sadar —
 * dan angka arus kas yang kurang satu kategori tetap terlihat masuk akal.
 *
 * Jadi: pindahkan apa adanya, buktikan sama, baru perbaiki di commit
 * terpisah yang diff-nya bisa dibaca.
 *
 * Yang dilakukan alat ini hanyalah membuka bungkus `{tab === "x" && (` dan
 * `)}`, lalu menurunkan indentasinya. Isinya tak disentuh.
 *
 * Pakai: node scripts/pindah-blok-tab.mjs <berkas> <namaTab>
 */
import { readFileSync } from 'node:fs'

const [berkas, tab] = process.argv.slice(2)
if (!berkas || !tab) {
  console.log('Pakai: pindah-blok-tab.mjs <berkas> <namaTab>')
  process.exit(1)
}

const baris = readFileSync(berkas, 'utf8').split(/\r?\n/)
const mulai = baris.findIndex((l) => l.trim().startsWith(`{tab === "${tab}"`))
if (mulai < 0) { console.log(`✗ blok tab "${tab}" tak ditemukan`); process.exit(1) }

// Penutupnya adalah `)}` pada indentasi yang SAMA dengan pembuka.
const indent = baris[mulai].match(/^\s*/)[0]
let akhir = -1
for (let i = mulai + 1; i < baris.length; i++) {
  if (baris[i] === `${indent})}`) { akhir = i; break }
}
if (akhir < 0) { console.log('✗ penutup blok tak ditemukan'); process.exit(1) }

// Buang baris pembungkus, lalu turunkan indentasi 2 tingkat (4 spasi):
// isi blok berada di dalam `{tab && (` DAN di dalam `<div style=...>`.
const isi = baris.slice(mulai + 1, akhir)
  .map((l) => (l.startsWith('    ') ? l.slice(4) : l))
  .join('\n')

console.log(`// blok "${tab}": baris ${mulai + 2}–${akhir} (${akhir - mulai - 1} baris)`)
console.log(isi)
