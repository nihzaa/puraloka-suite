#!/usr/bin/env node
/**
 * BUANG UNUSED — menghapus deklarasi `useState`/`const`/`function` yang
 * dilaporkan eslint sebagai tak terpakai, dan membersihkan impor.
 *
 * ── Dibuat untuk apa
 *
 * Memecah modul 3.449 baris menyisakan 64 variabel yatim di berkas induk:
 * state milik tab yang sudah pindah rute. Menghapusnya satu per satu dengan
 * tangan berarti 64 kesempatan salah potong.
 *
 * ── Yang TIDAK dilakukan
 *
 * Alat ini hanya menyentuh yang eslint sendiri sebut tak terpakai, dan
 * hanya bentuk yang dikenalinya: baris `const [a, setA] = useState(...)`,
 * `const x = ...` satu baris, dan anggota daftar impor. Fungsi multi-baris
 * dilewati dan dilaporkan — itu urusan `ekstrak-fungsi.mjs` atau tangan.
 *
 * Setelah dijalankan, WAJIB typecheck: eslint bisa keliru menandai sesuatu
 * yang dipakai lewat jalur yang tak dilacaknya.
 *
 * Pakai: node scripts/buang-unused.mjs <berkas> [--terapkan]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const berkas = process.argv[2]
const TERAPKAN = process.argv.includes('--terapkan')
if (!berkas) { console.log('Pakai: buang-unused.mjs <berkas> [--terapkan]'); process.exit(1) }

const laporan = JSON.parse(
  execSync(`npx eslint "${berkas}" -f json`, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' })
)
const pesan = laporan[0]?.messages.filter((m) => m.ruleId?.includes('no-unused-vars')) ?? []
if (!pesan.length) { console.log('Tak ada yang tak terpakai.'); process.exit(0) }

const baris = readFileSync(berkas, 'utf8').split(/\r?\n/)
const nama = pesan.map((m) => ({
  n: m.message.match(/'([^']+)'/)?.[1],
  baris: m.line - 1,
})).filter((x) => x.n)

const hapusBaris = new Set()
const lewat = []

for (const { n, baris: i } of nama) {
  const l = baris[i]
  if (l == null) continue

  // 1. Anggota daftar impor: buang namanya saja, biarkan barisnya.
  //
  // ⚠️ Syarat `!/\bfunction\b/` WAJIB. Tanpa itu, pola `^\s{2}[A-Za-z]`
  // ikut mencocokkan `  async function handleDownloadPDF(inv: Invoice) {`
  // — fungsi berindentasi dua spasi di dalam komponen — dan yang terhapus
  // adalah NAMA FUNGSINYA, meninggalkan `async function (inv: Invoice) {`.
  // Itu benar-benar terjadi dan merusak tiga fungsi sekaligus.
  //
  // `(` juga ditolak: apa pun yang punya kurung buka bukan anggota daftar
  // impor.
  const bisaJadiImpor =
    (/^\s*import /.test(l) || /^\s{2}[A-Za-z]/.test(l)) &&
    !l.includes('=') && !/\bfunction\b/.test(l) && !l.includes('(')

  if (bisaJadiImpor) {
    // `type ` ikut dibuang bersama namanya. Tanpa itu, `type Foo, type Bar`
    // menyisakan `type type Bar` — kata kunci yatim yang membuat berkasnya
    // gagal parse, dan penyebabnya tak terlihat dari pesan galatnya.
    const baru = l
      .replace(new RegExp(`(type\\s+)?\\b${n}\\s*,\\s*`), '')
      .replace(new RegExp(`,\\s*(type\\s+)?\\b${n}\\b`), '')
      .replace(new RegExp(`(type\\s+)?\\b${n}\\b`), '')
    if (baru !== l) {
      baris[i] = baru
      // Baris impor yang jadi kosong ikut dibuang.
      if (!/[A-Za-z]/.test(baru)) hapusBaris.add(i)
      continue
    }
  }

  // 2. Deklarasi satu baris yang berakhir titik-koma.
  if (/^\s*(const|let|var|type|interface) /.test(l) && /;\s*$/.test(l)) {
    hapusBaris.add(i)
    continue
  }

  lewat.push(`${i + 1}: ${n}  →  ${l.trim().slice(0, 70)}`)
}

console.log(`Dihapus: ${hapusBaris.size} baris`)
if (lewat.length) {
  console.log(`\nDilewati (perlu tangan): ${lewat.length}`)
  for (const x of lewat) console.log('  ' + x)
}

if (TERAPKAN) {
  writeFileSync(berkas, baris.filter((_, i) => !hapusBaris.has(i)).join('\n'))
  console.log('\nDiterapkan. JALANKAN typecheck sekarang.')
} else {
  console.log('\n(laporan saja — tambahkan --terapkan)')
}
