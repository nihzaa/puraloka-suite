#!/usr/bin/env node
/**
 * PENJAGA JUDUL — `<h1>` buatan sendiri di halaman.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-08, sebelum UIR-2: `KepalaHalaman` dipakai **0 dari 105
 * halaman** — padahal komponennya ada di `components/dasar.tsx:82`, bertoken
 * penuh, dan sudah ber-test. Setiap halaman menulis judulnya sendiri, dan
 * hasilnya **27 varian gaya `<h1>` berbeda**:
 *
 *     fontSize    20 · 22 · 24 · 26 · 28
 *     fontWeight  700 · 800
 *     warna       C.text · var(--text-primary) · campuran
 *
 * Itu sumber paling langsung dari keluhan "tiap halaman terasa buatan sendiri"
 * (`ARAH-VISUAL-2026.md`), dan yang paling murah diperbaiki — judul tak
 * menyentuh isi halaman sama sekali.
 *
 * ── Kenapa RATCHET, bukan larangan
 *
 * 51 `<h1>` tersisa, dan sebagiannya memang BUKAN judul halaman: sapaan
 * dinamis di beranda ("Selamat datang, {nama}"), judul di dalam portal yang
 * shell-nya berbeda. Melarang hari ini berarti menolak kode yang benar.
 *
 * Yang ditegakkan: **angka hari ini adalah lantai.** Halaman baru tak bisa
 * menambah `<h1>` tangan, dan tiap kali sebagian dipindahkan, lantainya ikut
 * turun dan terkunci.
 *
 * ── Komentar DIBUANG lebih dulu, dan itu bukan kehati-hatian berlebih
 *
 * Repo ini berkomentar padat, dan beberapa halaman menyimpan catatan seperti
 * *"menulis <h1> lagi di sini menghasilkan DUA <h1>"*. Tanpa membuang
 * komentar, penjaga menghitung kalimat penjelasan sebagai pelanggaran.
 *
 * Ini bukan dugaan: saat UIR-2 diukur, enam halaman sempat tercatat
 * "punya dua `<h1>`" — **keenamnya artefak komentar**, nol yang nyata. Kalau
 * dipercaya, enam halaman yang sudah benar akan "diperbaiki" jadi rusak.
 * Cacat yang sama muncul di `suspense-ratchet` sehari sebelumnya.
 *
 * ── Yang TIDAK dihitung
 *
 *   components/       `KepalaHalaman` sendiri berisi `<h1>` — itu justru
 *                     satu-satunya tempat yang benar.
 *   berkas .test.     test memang merender `<h1>` untuk diperiksa.
 *
 * Pakai:            node apps/web/scripts/judul-ratchet.mjs
 * Kencangkan lantai: node apps/web/scripts/judul-ratchet.mjs --naikkan
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const BERKAS_LANTAI = join(AKAR, 'scripts', 'judul-lantai.json')

/** Lihat catatan "Komentar DIBUANG" di kepala berkas. */
function tanpaKomentar(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
}

function halaman(dir, keluar = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) halaman(p, keluar)
    else if (e.name === 'page.tsx') keluar.push(p)
  }
  return keluar
}

const pelanggar = []
for (const f of halaman(join(AKAR, 'app'))) {
  const n = (tanpaKomentar(readFileSync(f, 'utf8')).match(/<h1[\s>]/g) ?? []).length
  if (n > 0) pelanggar.push({ berkas: relative(AKAR, f).split(sep).join('/'), jumlah: n })
}
pelanggar.sort((a, b) => b.jumlah - a.jumlah)

const sekarang = pelanggar.reduce((s, p) => s + p.jumlah, 0)

let lantai
try {
  lantai = JSON.parse(readFileSync(BERKAS_LANTAI, 'utf8'))
} catch {
  lantai = { nilai: sekarang, _catatan: 'diukur otomatis pada jalan pertama' }
}

const simpan = (nilai, tanda) =>
  writeFileSync(
    BERKAS_LANTAI,
    JSON.stringify(
      {
        ...lantai,
        nilai,
        _diukur: new Date().toISOString().slice(0, 10),
        _riwayat: [...(lantai._riwayat || []), `${lantai.nilai} → ${nilai}${tanda}`],
      },
      null,
      2,
    ) + '\n',
  )

if (process.argv.includes('--naikkan')) {
  simpan(sekarang, '')
  console.log(`Lantai diperbarui: ${lantai.nilai} → ${sekarang}`)
  process.exit(0)
}

console.log('══ RATCHET judul (UIR-2) ═══════════════════════════════════════════')
console.log(`  <h1> ditulis sendiri di halaman : ${sekarang}`)
console.log(`  lantai (maks)                   : ${lantai.nilai}`)

if (sekarang > lantai.nilai) {
  console.error(`\n❌ BERTAMBAH ${sekarang - lantai.nilai}.\n`)
  console.error('   Pakai <KepalaHalaman>, bukan <h1> sendiri:')
  console.error('     <KepalaHalaman judul="…" keterangan="…" />')
  console.error('     <KepalaHalaman judul="…" ikon={<Ruler size={19} />} />')
  console.error('     <KepalaHalaman judul="…" aksi={<button>…</button>} />\n')
  console.error('   Kenapa ditegakkan: sebelum UIR-2 ada 27 VARIAN gaya <h1>')
  console.error('   berbeda (20–28px, bobot 700/800, tiga sumber warna) — itu')
  console.error('   sumber paling langsung dari "tiap halaman terasa buatan')
  console.error('   sendiri", dan paling murah diperbaiki.\n')
  console.error('   Kalau judulnya sudah disediakan layout lewat <JudulBagian>,')
  console.error('   JANGAN tambahkan judul di halaman — dua <h1> dalam satu')
  console.error('   halaman adalah cacat a11y.\n')
  console.error('   Pelanggar terbesar:')
  for (const p of pelanggar.slice(0, 6)) {
    console.error(`     ${String(p.jumlah).padStart(3)} × ${p.berkas}`)
  }
  process.exit(1)
}

if (sekarang < lantai.nilai) {
  simpan(sekarang, ' (otomatis)')
  console.log(`\n  ✅ TURUN ${lantai.nilai} → ${sekarang}. Lantai ikut turun — terkunci.\n`)
  process.exit(0)
}

console.log('\n  ✅ tidak bertambah.\n')
