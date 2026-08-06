#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Penjaga: setiap direktori rute dashboard HARUS punya entri di ROLE_ALLOWED.
//
// ── Kejadian yang melahirkan penjaga ini (2026-08-06)
//
// Halaman `/gudang/rekonsiliasi` selesai dibangun: endpoint jalan, tenancy
// terjaga, typecheck hijau, menu sudah diarahkan ke sana. Dibuka di browser —
// yang muncul `/dashboard`.
//
// `middleware.ts` menyaring per-prefiks lewat daftar yang ditulis tangan, dan
// `/gudang` tak pernah ditambahkan ke sana. Tidak ada 404, tidak ada pesan,
// tidak ada baris log. Halaman yang sudah jadi hanya... tidak pernah tampil.
//
// ── Kenapa ini kelas cacat, bukan kelalaian sekali
//
// Membuat halaman baru butuh menyentuh dua berkas yang berjauhan — direktori
// rutenya dan daftar izin di middleware. Yang kedua tak punya satu pun sinyal
// kalau terlewat: build hijau, test hijau, typecheck hijau. Satu-satunya cara
// menemukannya adalah membuka halaman itu di browser dengan mata sendiri.
//
// Penjaga ini menukar "harus ingat" dengan "tak bisa lupa".
//
// ── Kenapa hanya memeriksa `admin`
//
// Role lain memang SENGAJA tidak melihat semua halaman — `client` hanya
// `/portal`, dan itu benar. Yang tak boleh terjadi adalah halaman yang tak
// bisa dibuka SIAPA PUN. `admin` adalah role yang mestinya melihat semuanya,
// jadi ialah patokan "rute ini bisa dijangkau".
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Berlabuh ke lokasi berkas ini, bukan ke cwd. Penjaga yang bergantung pada
// direktori pemanggil akan lulus dengan nol temuan saat CI memanggilnya dari
// akar repo — hijau karena tak menemukan apa-apa untuk diperiksa.
const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')

const dirRute = readdirSync(join(AKAR, 'app', '(dashboard)'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('('))
  .map((d) => '/' + d.name)

const sumber = readFileSync(join(AKAR, 'middleware.ts'), 'utf8')
const cocok = sumber.match(/admin:\s*\[([^\]]*)\]/)
if (!cocok) {
  console.error('GAGAL: `admin:` tak ditemukan di ROLE_ALLOWED middleware.ts.')
  console.error('       Bentuk daftarnya berubah — penjaga ini ikut disesuaikan,')
  console.error('       JANGAN dihapus. Penjaga yang tak bisa membaca sasarannya')
  console.error('       harus berteriak, bukan diam-diam lulus.')
  process.exit(1)
}
const diizinkan = (cocok[1].match(/"[^"]+"/g) ?? []).map((s) => s.slice(1, -1))

const hilang = dirRute.filter((d) => !diizinkan.includes(d))

if (hilang.length > 0) {
  console.error(`GAGAL: ${hilang.length} direktori rute tanpa entri di ROLE_ALLOWED.admin:`)
  for (const h of hilang) console.error(`  ${h}  → app/(dashboard)${h}/`)
  console.error('')
  console.error('Akibatnya: membuka halaman itu diarahkan diam-diam ke home.')
  console.error('Tanpa 404, tanpa pesan, tanpa log. Halamannya jadi tak terjangkau.')
  console.error('')
  console.error('Perbaikan: tambahkan prefiksnya ke `admin` di apps/web/middleware.ts,')
  console.error('dan ke role lain yang memang berhak membukanya.')
  process.exit(1)
}

console.log(`OK: ${dirRute.length} direktori rute, semuanya punya entri di ROLE_ALLOWED.admin.`)
