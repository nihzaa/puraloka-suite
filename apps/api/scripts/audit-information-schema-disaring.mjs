#!/usr/bin/env node
/**
 * PENJAGA — query `information_schema` di migrasi WAJIB menyaring `table_schema`.
 *
 * ── Cacat yang dijaga
 *
 * CLAUDE.md §1 mencatatnya sebagai peringatan tercetak besar, dan ia sudah
 * memakan korban: basis ini punya skema `test` yang membayangi SEMBILAN tabel
 * `public` bernama sama, plus `extensions` yang membayangi lima lagi.
 *
 * Tanpa `WHERE table_schema = 'public'`, query kolom memulangkan tiap kolom
 * DUA KALI. Migrasi yang mencacah kolomnya lalu melihat angka ganda:
 *
 *     447 gagal: hanya 10 dari 5 kolom PKP terpasang
 *
 * Kalimat yang mustahil — "hanya 10 dari 5" — dan itu bentuk paling ramahnya.
 * Yang lebih berbahaya senyap: `rows[0]` tanpa saringan bisa jatuh ke baris
 * skema `test` dan menjawab BENAR secara kebetulan, sampai suatu hari tidak.
 *
 * ── Diukur 2026-08-31
 *
 * 31 migrasi menanyakan `information_schema` tanpa saringan itu. Tak satu pun
 * merah hari ini — karena skema pembayangnya kebetulan tak memuat kolom yang
 * mereka cari. "Kebetulan tak merah" bukan aman: satu skema baru (sebuah
 * worktree, sebuah percobaan, sebuah alat ukur yang lupa dibersihkan) sudah
 * cukup membuat migrasi yang benar gagal.
 *
 * Saya sendiri membuatnya terjadi hari ini: skema `sim` yang saya pakai untuk
 * menguji migrasi lain tertinggal, dan 447 langsung melaporkan 10 dari 5.
 *
 * ── Ratchet, bukan ambang nol
 *
 * Menuntut nol berarti menyunting 31 migrasi lama sekaligus, dan §5.5 melarang
 * mengedit migrasi yang sudah jalan tanpa alasan kuat. Yang mendesak:
 * menghentikan pertumbuhan. Migrasi BARU wajib menyaring.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const DIR = path.join(AKAR, 'db', 'migrations')
const LANTAI = 31

const temuan = []
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
  const isi = fs.readFileSync(path.join(DIR, f), 'utf8')
  if (!/information_schema\.(columns|tables|table_constraints)/i.test(isi)) continue

  // Buang komentar supaya contoh di dokumentasi tak dituduh.
  const kode = isi
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((b) => b.replace(/--.*$/, '')).join('\n')
  if (!/information_schema\.(columns|tables|table_constraints)/i.test(kode)) continue

  // Saringan sah: table_schema disebut, ATAU dibatasi ke satu tabel lewat
  // to_regclass/pg_class yang memang tak ambigu.
  if (/table_schema/i.test(kode)) continue

  temuan.push(f)
}

console.log(`migrasi query information_schema TANPA saringan table_schema: ${temuan.length} (lantai ${LANTAI})`)
if (temuan.length > LANTAI) {
  console.error('\n❌ BERTAMBAH — migrasi baru wajib menyaring `table_schema`.\n')
  for (const f of temuan.slice(LANTAI)) console.error('   ·', f)
  console.error(`
   Basis ini punya skema \`test\` yang membayangi 9 tabel public bernama sama,
   dan \`extensions\` 5 lagi. Tanpa saringan, cacah kolom jadi DUA KALI —
   "hanya 10 dari 5 kolom terpasang" — dan yang lebih buruk, \`rows[0]\` bisa
   jatuh ke baris skema lain dan menjawab benar secara KEBETULAN.

   Perbaikannya satu baris:

       AND table_schema = 'public'
`)
  process.exit(1)
}
if (temuan.length < LANTAI) {
  console.log(`\n📉 Turun dari lantai — kencangkan LANTAI ke ${temuan.length} di skrip ini.`)
}
