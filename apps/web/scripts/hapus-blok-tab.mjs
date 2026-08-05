#!/usr/bin/env node
/**
 * HAPUS BLOK TAB — membuang `{tab === "x" && (...)}` yang isinya sudah
 * dipindah ke rute sendiri.
 *
 * Dijalankan SETELAH `pindah-blok-tab.mjs` dan setelah halaman barunya
 * terbukti typecheck. Urutan itu penting: menghapus lebih dulu berarti
 * satu-satunya salinan kode ada di berkas yang belum tentu benar.
 *
 * Pakai: node scripts/hapus-blok-tab.mjs <berkas> <namaTab>...
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [berkas, ...tabs] = process.argv.slice(2)
if (!berkas || !tabs.length) {
  console.log('Pakai: hapus-blok-tab.mjs <berkas> <namaTab>...')
  process.exit(1)
}

let baris = readFileSync(berkas, 'utf8').split(/\r?\n/)

for (const tab of tabs) {
  const mulai = baris.findIndex((l) => l.trim().startsWith(`{tab === "${tab}"`))
  if (mulai < 0) { console.log(`✗ ${tab}: tak ditemukan`); continue }

  const indent = baris[mulai].match(/^\s*/)[0]
  let akhir = -1
  for (let i = mulai + 1; i < baris.length; i++) {
    if (baris[i] === `${indent})}`) { akhir = i; break }
  }
  if (akhir < 0) { console.log(`✗ ${tab}: penutup tak ditemukan`); continue }

  console.log(`${tab.padEnd(16)} dihapus baris ${mulai + 1}–${akhir + 1} (${akhir - mulai + 1} baris)`)
  baris = [...baris.slice(0, mulai), ...baris.slice(akhir + 1)]
}

writeFileSync(berkas, baris.join('\n'))
console.log(`\nSisa: ${baris.length} baris`)
