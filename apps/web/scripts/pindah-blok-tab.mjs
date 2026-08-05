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

// Kemunculan ke-berapa. Nama tab yang sama sering muncul DUA KALI: sekali di
// header untuk tombol aksi (`{tab === "laporan" && <button>Ajukan Upah}`) dan
// sekali untuk isinya. Tanpa ini, alat memungut blok tombol 3 baris dan
// melaporkannya seolah itu seluruh tab — kesalahan yang terlihat sepele tapi
// menghasilkan halaman kosong.
const ke = Number(process.argv[4] ?? 1)

const baris = readFileSync(berkas, 'utf8').split(/\r?\n/)
const semua = []
baris.forEach((l, i) => {
  if (l.trim().startsWith(`{tab === "${tab}"`)) semua.push(i)
})
if (semua.length < ke) {
  console.log(`✗ blok tab "${tab}" kemunculan ke-${ke} tak ada (hanya ${semua.length})`)
  process.exit(1)
}
const mulai = semua[ke - 1]

// Penutupnya pada indentasi yang SAMA dengan pembuka. Ada DUA bentuk:
//
//   {tab === "x" && (          →  penutup  )}
//   {tab === "x" && (() => {   →  penutup  })()}
//
// Bentuk kedua dipakai kalau blok butuh variabel lokal. Alat versi pertama
// hanya mengenali `)}`, jadi untuk blok IIFE ia terus mencari sampai
// menemukan penutup blok BERIKUTNYA — hasilnya rentang tumpang tindih yang
// terlihat masuk akal (angkanya berurutan) padahal salah total.
const indent = baris[mulai].match(/^\s*/)[0]
const iife = baris[mulai].includes('(() => {')
const penutup = iife ? `${indent}})()}` : `${indent})}`

let akhir = -1
for (let i = mulai + 1; i < baris.length; i++) {
  if (baris[i] === penutup) { akhir = i; break }
}
if (akhir < 0) {
  console.log(`✗ penutup blok tak ditemukan (mencari ${JSON.stringify(penutup)})`)
  process.exit(1)
}

// Buang baris pembungkus, lalu turunkan indentasi 2 tingkat (4 spasi):
// isi blok berada di dalam `{tab && (` DAN di dalam `<div style=...>`.
const isi = baris.slice(mulai + 1, akhir)
  .map((l) => (l.startsWith('    ') ? l.slice(4) : l))
  .join('\n')

console.log(`// blok "${tab}": baris ${mulai + 2}–${akhir} (${akhir - mulai - 1} baris)`)
console.log(isi)
