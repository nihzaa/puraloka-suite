#!/usr/bin/env node
/**
 * Font merek yang DIMUAT wajib benar-benar DIPAKAI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04, tepat sesudah Bricolage Grotesque + Plus Jakarta Sans
 * dipasang dan `_layout.tsx` menahan splash sampai keduanya siap:
 *
 *     `useFonts({...})` di _layout.tsx  : ADA
 *     `fontFamily` di seluruh layar      : 0
 *     `FONT.` dipakai                    : 0
 *
 * Aplikasi mengunduh dua keluarga font, menahan layar splash sampai
 * keduanya selesai, lalu merender **seluruh** teksnya dengan huruf bawaan
 * sistem.
 *
 * ── Kenapa ini tak bergejala
 *
 * Semua yang biasa dipercaya menjawab HIJAU:
 *
 *     tsc                 hijau — `useFonts` memang dipanggil dengan benar
 *     Metro/bundle        hijau — fontnya memang ada dan valid
 *     penjaga a11y        hijau — tak ada hubungannya dengan keluarga font
 *     penjaga kontras     hijau — warna tak berubah
 *     mata di layar HP    hampir hijau — Roboto dan Plus Jakarta Sans
 *                                 sama-sama sans-serif; bedanya baru
 *                                 terlihat kalau ditumpuk berdampingan
 *
 * Yang dibayar penuh: dua unduhan font, dan layar splash yang menunggu
 * keduanya sebelum aplikasi boleh tampil. Biaya penuh, nol hasil.
 *
 * ── Kelas kesalahan yang sama
 *
 * Ini kembaran dari cacat `useData()` di web (CLAUDE.md §6): lapis cache
 * dibangun 2026-08-04, lalu tak dipakai satu halaman pun. Dibangun, benar,
 * dan menganggur — bentuk yang tak pernah memunculkan galat karena tak ada
 * yang salah, cuma tak ada yang memanggilnya.
 *
 * ── Kenapa RATCHET dua arah, bukan ambang NOL
 *
 * Yang dijaga bukan "tiap teks wajib ber-fontFamily" — itu akan memaksa
 * suntingan massal dan penjaga yang dimatikan orang pertama yang terhalang.
 *
 * Yang dijaga: **kalau fontnya dimuat, pemakaiannya tak boleh NOL, dan
 * angkanya tak boleh turun.** Nol pemakaian berarti biaya tanpa hasil, dan
 * angka yang turun berarti seseorang mencabut font dari layar yang sudah
 * memakainya — dua-duanya senyap.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile')
const TATA = join(MOBILE, 'app', '_layout.tsx')
const TEMA = join(MOBILE, 'lib', 'tema.ts')
const LANTAI_BERKAS = join(dirname(fileURLToPath(import.meta.url)), 'font-mobile-lantai.json')

for (const [nama, p] of [['app/_layout.tsx', TATA], ['lib/tema.ts', TEMA]]) {
  if (!existsSync(p)) {
    console.error(`❌ ${nama} tak ada di ${p} — jalurnya meleset.`)
    console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
    process.exit(1)
  }
}

/*
  ⚠ CR dibuang sebelum apa pun — CLAUDE.md §7a.

  Berkas .tsx di repo ini bisa CRLF, dan lima kali dalam satu hari
  perbandingan baris memulangkan nol karena CR yang tak terlihat. Nol
  hasil bukan bukti ketiadaan.
*/
const baca = (p) => readFileSync(p, 'utf8').replace(/\r/g, '')

/*
  Komentar dibuang. Berkas-berkas ini MENJELASKAN fontnya panjang lebar di
  komentar, jadi mencari nama font apa adanya akan hijau meski kodenya
  sudah dicabut — persis kelas kesalahan yang digigit repo ini berkali-kali
  (lihat header `audit-auth-mobile-utuh.mjs`).
*/
const tanpaKomentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

const tataKode = tanpaKomentar(baca(TATA))
const temaKode = tanpaKomentar(baca(TEMA))

/** Nama keluarga font yang benar-benar dimuat lewat `useFonts`. */
const dimuat = []
const blokUseFonts = /useFonts\s*\(\s*\{([\s\S]*?)\}\s*\)/.exec(tataKode)
if (blokUseFonts) {
  for (const m of blokUseFonts[1].matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*[,}]/g)) {
    if (!dimuat.includes(m[1])) dimuat.push(m[1])
  }
}

/** Semua .tsx/.ts di app/ dan components/. */
function sapu(dir, keluar = []) {
  if (!existsSync(dir)) return keluar
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) sapu(p, keluar)
    else if (/\.tsx?$/.test(n)) keluar.push(p)
  }
  return keluar
}

const berkas = [...sapu(join(MOBILE, 'app')), ...sapu(join(MOBILE, 'components'))]
  .filter((p) => relative(MOBILE, p).replace(/\\/g, '/') !== 'app/_layout.tsx')

if (berkas.length === 0) {
  console.error('❌ Nol berkas .tsx/.ts ditemukan — jalurnya meleset.')
  console.error('   Hijau dari korpus kosong adalah kebohongan.')
  process.exit(1)
}

let dipakai = 0
const perBerkas = []

for (const p of berkas) {
  const kode = tanpaKomentar(baca(p))
  /*
    Dihitung `fontFamily:` — bukan `FONT.`.

    Sengaja: yang penting teksnya BENAR-BENAR memakai keluarga font, dan
    itu terjadi lewat properti `fontFamily`. Menghitung `FONT.` saja akan
    lolos pada `const x = FONT.judul` yang tak pernah dipasang ke gaya
    apa pun — penjelasan yang benar mendampingi keadaan yang salah
    (CLAUDE.md §8a.2).
  */
  const n = (kode.match(/fontFamily\s*:/g) ?? []).length
  if (n > 0) {
    dipakai += n
    perBerkas.push({ rel: relative(MOBILE, p).replace(/\\/g, '/'), n })
  }
}

perBerkas.sort((a, b) => b.n - a.n)

/** Apakah `lib/tema.ts` benar-benar mengekspor token FONT. */
const punyaTokenFont = /export const FONT\s*=/.test(temaKode)

console.log('══ Font merek mobile terpakai ═════════════════════════════════')
console.log(`  keluarga dimuat   : ${dimuat.length}${dimuat.length ? ` (${dimuat.join(', ')})` : ''}`)
console.log(`  token FONT ada    : ${punyaTokenFont ? 'YA' : 'TIDAK'}`)
console.log(`  berkas dipindai   : ${berkas.length}`)
console.log(`  fontFamily dipakai: ${dipakai}`)

const lantai = existsSync(LANTAI_BERKAS)
  ? JSON.parse(readFileSync(LANTAI_BERKAS, 'utf8')).dipakai
  : null

if (process.argv.includes('--naikkan')) {
  writeFileSync(LANTAI_BERKAS, JSON.stringify({ dipakai }, null, 2) + '\n')
  console.log(`\n✅ lantai font-mobile disetel ke ${dipakai}`)
  process.exit(0)
}

if (lantai == null) {
  console.error(`\n❌ ${LANTAI_BERKAS} belum ada. Tetapkan lantai:`)
  console.error('   node scripts/audit-font-mobile-terpakai.mjs --naikkan\n')
  process.exit(1)
}

console.log(`  lantai            : ${lantai}`)

const temuan = []

/*
  Cacat pokok: font dimuat, splash ditahan menunggunya, nol yang memakai.
  Biaya penuh, nol hasil — dan tak satu pun alat lain bisa melihatnya.
*/
if (dimuat.length > 0 && dipakai === 0) {
  temuan.push(
    `${dimuat.length} keluarga font dimuat, NOL dipakai.\n` +
      '     Aplikasi mengunduh fontnya, menahan splash sampai siap, lalu\n' +
      '     merender semua teks dengan huruf bawaan sistem. Biaya penuh,\n' +
      '     nol hasil — dan tsc, Metro, serta seluruh penjaga tetap hijau.'
  )
}

/* Arah sebaliknya: dipakai tapi tak dimuat → font diam-diam jatuh ke bawaan. */
if (dimuat.length === 0 && dipakai > 0) {
  temuan.push(
    `${dipakai} pemakaian fontFamily, tetapi NOL keluarga dimuat di _layout.tsx.\n` +
      '     React Native jatuh diam-diam ke huruf bawaan saat keluarga tak\n' +
      '     terdaftar — tak ada galat, tak ada peringatan, dan hasilnya\n' +
      '     terlihat "hampir benar".'
  )
}

if (dipakai < lantai) {
  temuan.push(
    `pemakaian TURUN: ${dipakai} (lantai ${lantai}).\n` +
      '     Ada layar yang kehilangan font mereknya. Ini tak menggagalkan\n' +
      '     apa pun dan tak terlihat sampai dua layar ditumpuk berdampingan.'
  )
}

if (temuan.length > 0) {
  console.error('')
  for (const t of temuan) console.error(`  ❌ ${t}`)
  console.error('')
  console.error('  Pakai token dari lib/tema.ts:')
  console.error('')
  console.error("     import { FONT } from '@/lib/tema'")
  console.error("     <Text style={{ fontFamily: FONT.judul }}>Judul</Text>")
  console.error("     <Text style={{ fontFamily: FONT.isi }}>Isi</Text>")
  console.error('')
  process.exit(1)
}

if (dipakai > lantai) {
  console.log('')
  console.log(`📈 Naik ${dipakai - lantai} dari lantai — kencangkan:`)
  console.log('   node scripts/audit-font-mobile-terpakai.mjs --naikkan')
}

console.log('')
console.log(`✅ ${dipakai} pemakaian fontFamily (lantai ${lantai}) — font merek terpakai.`)
if (perBerkas.length > 0) {
  console.log('')
  console.log('   Terbanyak:')
  for (const x of perBerkas.slice(0, 3)) {
    console.log(`     ${String(x.n).padStart(4)}  ${x.rel}`)
  }
}
