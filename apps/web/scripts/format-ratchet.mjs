#!/usr/bin/env node
/**
 * PENJAGA FORMAT — `toLocaleString`/`Intl` dipanggil langsung di halaman.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-08: 124 pemanggilan `toLocaleString`/`Intl` tersebar di
 * `app/` + `components/`. Dua bentuk mendominasi — 53 formatter rupiah dan
 * 51 pemisah ribuan — dan tiap penyalinan adalah kesempatan berbeda satu
 * detail. Nominal yang formatnya berbeda antar halaman tidak terbaca sebagai
 * ketidakrapian; ia terbaca sebagai aplikasi yang tak bisa dipercaya.
 *
 * `lib/format.ts` menyelesaikannya di satu tempat. Penjaga ini menjaga supaya
 * penyelesaiannya tidak pelan-pelan bocor lagi.
 *
 * ── Kenapa RATCHET, bukan larangan
 *
 * Melarang hari ini menolak 124 tempat yang sudah jalan — dan sebagiannya
 * memang belum jelas harus jadi apa (`toLocaleString` polos dipakai untuk
 * kuantitas dan luas, bukan uang; menggantinya butuh tahu konteks satu per
 * satu). Yang ditegakkan: **angka hari ini adalah lantai.** Halaman baru tak
 * bisa menambah, dan tiap kali sebagian dipindahkan, lantainya ikut turun
 * dan terkunci di sana.
 *
 * Pola ini sudah terbukti tiga kali di repo ini (tabel-mentah, kerapatan,
 * hex): yang gagal bukan pembangunan fondasinya, melainkan penyebarannya —
 * dan tanpa penjaga, rasio yang sudah diperbaiki pulih ke keadaan semula
 * dalam hitungan minggu.
 *
 * ── Yang TIDAK dihitung, dan kenapa
 *
 *   lib/format.ts        justru DI SINI `Intl` seharusnya dipanggil.
 *                        Menghitungnya berarti menghukum satu-satunya tempat
 *                        yang benar.
 *   berkas .test.        test memang membandingkan keluaran mentah.
 *
 * ── Pelajaran yang membentuk penjaga ini
 *
 * `kerapatan-ratchet` sempat merah berbulan-bulan karena lantainya ditulis
 * dari satu jalan yang membaca angka berbeda dari pohon yang di-commit
 * (lihat `kerapatan-lantai.json`). Karena itu lantai di sini **ditulis dari
 * hasil pengukuran pohon yang benar-benar di-commit**, dan diverifikasi ulang
 * tepat sebelum commit — bukan dari jalan pertama yang kebetulan.
 *
 * Pakai:            node apps/web/scripts/format-ratchet.mjs
 * Kencangkan lantai: node apps/web/scripts/format-ratchet.mjs --naikkan
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const BERKAS_LANTAI = join(AKAR, 'scripts', 'format-lantai.json')

/** Satu-satunya tempat `Intl` boleh dipanggil. */
const DIKECUALIKAN = ['lib/format.ts']

function berkasSumber(dir, keluar = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) berkasSumber(p, keluar)
    else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) keluar.push(p)
  }
  return keluar
}

const POLA = /\btoLocaleString\b|\bIntl\.(NumberFormat|DateTimeFormat)\b/g

const pelanggar = []
for (const f of [...berkasSumber(join(AKAR, 'app')), ...berkasSumber(join(AKAR, 'components'))]) {
  const rel = relative(AKAR, f).split(sep).join('/')
  if (DIKECUALIKAN.includes(rel)) continue
  const n = (readFileSync(f, 'utf8').match(POLA) ?? []).length
  if (n > 0) pelanggar.push({ berkas: rel, jumlah: n })
}
pelanggar.sort((a, b) => b.jumlah - a.jumlah)

const sekarang = pelanggar.reduce((s, p) => s + p.jumlah, 0)

let lantai
try {
  lantai = JSON.parse(readFileSync(BERKAS_LANTAI, 'utf8'))
} catch {
  lantai = { nilai: sekarang, _catatan: 'diukur otomatis pada jalan pertama' }
}

if (process.argv.includes('--naikkan')) {
  writeFileSync(
    BERKAS_LANTAI,
    JSON.stringify(
      {
        ...lantai,
        nilai: sekarang,
        _diukur: new Date().toISOString().slice(0, 10),
        _riwayat: [...(lantai._riwayat || []), `${lantai.nilai} → ${sekarang}`],
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`Lantai diperbarui: ${lantai.nilai} → ${sekarang}`)
  process.exit(0)
}

console.log('══ RATCHET format (UIR-1) ══════════════════════════════════════════')
console.log(`  toLocaleString/Intl dipanggil langsung : ${sekarang}`)
console.log(`  lantai (maks)                         : ${lantai.nilai}`)

if (sekarang > lantai.nilai) {
  console.error(`\n❌ BERTAMBAH ${sekarang - lantai.nilai}.\n`)
  console.error('   Pakai lib/format.ts, bukan Intl/toLocaleString langsung:')
  console.error('     formatRupiah(n)         Rp 1.250.000.000')
  console.error('     formatRupiahSingkat(n)  Rp 1,25 M   (rb/jt/M/T)')
  console.error('     formatMutasi(n)         (Rp 1.200.000) untuk negatif')
  console.error('     formatAngka(n, desimal) 1.248,5')
  console.error('     formatPersen(n)         68,5%')
  console.error('     formatTanggal(d)        20 Mei 2026')
  console.error('     formatTanggalJam(d)     20 Mei 2026 · 10.45  (WIB)')
  console.error('     formatRelatif(d)        2 jam lalu\n')
  console.error('   Kenapa ditegakkan: format yang disalin antar halaman')
  console.error('   pelan-pelan berbeda, dan nominal yang formatnya berbeda')
  console.error('   terbaca sebagai aplikasi yang tak bisa dipercaya.\n')
  console.error('   Pelanggar terbesar:')
  for (const p of pelanggar.slice(0, 6)) {
    console.error(`     ${String(p.jumlah).padStart(3)} × ${p.berkas}`)
  }
  process.exit(1)
}

if (sekarang < lantai.nilai) {
  writeFileSync(
    BERKAS_LANTAI,
    JSON.stringify(
      {
        ...lantai,
        nilai: sekarang,
        _diukur: new Date().toISOString().slice(0, 10),
        _riwayat: [...(lantai._riwayat || []), `${lantai.nilai} → ${sekarang} (otomatis)`],
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`\n  ✅ TURUN ${lantai.nilai} → ${sekarang}. Lantai ikut turun — terkunci.\n`)
  process.exit(0)
}

console.log('\n  ✅ tidak bertambah.\n')
