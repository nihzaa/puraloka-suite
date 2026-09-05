#!/usr/bin/env node
/**
 * Tiap pasangan token mobile wajib >= 7:1 (WCAG AAA).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA AAA, BUKAN AA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit-kontras-mobile.mjs` menjaga 4.5:1 (AA) — ambang untuk layar di
 * dalam ruangan. Aplikasi ini dipakai di LOKASI PROYEK: layar berdebu,
 * matahari langsung, dan mata yang sudah lelah.
 *
 * Riset praktik lapangan menyarankan 7:1 untuk teks kritis dalam kondisi
 * itu, dan menyebut 4.5:1 sebagai LANTAI, bukan target:
 *
 *     Corvus Intell — Ruggedized UX for field operators
 *     ABLEMKR      — App Accessibility for Skilled Workers
 *
 * Keputusan founder 2026-09-05: naikkan SEMUANYA ke 7:1, bukan hanya teks
 * kritis.
 *
 * ── Yang diukur, dan kenapa PASANGAN
 *
 * Kontras bukan sifat satu warna — ia sifat DUA warna bersama. Menjaga
 * "tiap warna teks cukup gelap" tak bermakna tanpa menyebut di atas apa ia
 * dipakai.
 *
 * Daftar `PASANGAN` di bawah memuat kombinasi yang BENAR-BENAR terjadi di
 * layar. Bukan semua kombinasi: `danger` di atas `successBg` tak pernah
 * ada, dan memaksanya lolos akan menggeser warna untuk keadaan yang tak
 * pernah dirender.
 *
 * ── `rgba` dicampur dulu
 *
 * Latar semantik mode gelap adalah `rgba(...)` 10% di atas surface. Menilai
 * kontras terhadap nilai rgba mentah memberi angka yang salah — yang
 * dilihat mata adalah hasil campurannya.
 *
 * ── Ambang NOL
 *
 * Satu pasangan di bawah 7:1 berarti satu teks yang sulit dibaca di bawah
 * matahari — dan yang paling sering tak terbaca justru angka dan status,
 * bagian yang menentukan tindakan.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TEMA = join(AKAR, 'apps', 'mobile', 'lib', 'tema.ts')

if (!existsSync(TEMA)) {
  console.error(`❌ tema.ts tak ada di ${TEMA} — jalurnya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

/* CR dibuang — CLAUDE.md §7a. */
const isi = readFileSync(TEMA, 'utf8').replace(/\r/g, '')

function ambilPalet(nama) {
  const m = new RegExp(`export const ${nama}: Palet = \\{([\\s\\S]*?)\\n\\}`).exec(isi)
  if (!m) throw new Error(`palet ${nama} tak ketemu`)
  const p = {}
  for (const mm of m[1].matchAll(/(\w+):\s*'([^']+)'/g)) p[mm[1]] = mm[2]
  return p
}

const lum = (h) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const R = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/* rgba(r,g,b,a) di atas latar → hex efektif */
function campur(warna, latar) {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(warna)
  if (!m) return warna
  const [, r, g, b, a] = m
  const al = parseFloat(a)
  const hx = (i) => {
    const f = parseInt([r, g, b][i], 10)
    const bg = parseInt(latar.slice(1 + i * 2, 3 + i * 2), 16)
    return Math.round(f * al + bg * (1 - al)).toString(16).padStart(2, '0')
  }
  return '#' + hx(0) + hx(1) + hx(2)
}

/*
  Pasangan yang BENAR-BENAR dipakai — teks di atas permukaannya.
  Bukan semua kombinasi: `danger` di atas `successBg` tak pernah terjadi.
*/
const PASANGAN = [
  ['textPrimary', 'surface'], ['textPrimary', 'surfaceRaised'], ['textPrimary', 'surfaceSubtle'],
  ['textSecondary', 'surface'], ['textSecondary', 'surfaceRaised'], ['textSecondary', 'surfaceSubtle'],
  ['textMuted', 'surface'], ['textMuted', 'surfaceRaised'],
  ['navy', 'surface'], ['navy', 'surfaceRaised'], ['navy', 'surfaceSubtle'],
  ['onNavy', 'navy'],
  /*
    Bidang merek — panel navy besar di login & dashboard.

    ⚠ Ditambahkan 2026-09-05 bersamaan lahirnya token itu, dan urutannya
    layak dicatat: penjaga ini HIJAU sebelum pasangannya didaftarkan, sebab
    ia hanya memeriksa yang ada di daftar ini. Hijaunya tak mengatakan
    apa pun tentang token baru — nol pemeriksaan terlihat sama persis
    dengan nol pelanggaran.

    Daftar tulisan tangan punya batas itu secara bawaan. Yang bisa
    dilakukan: menambahkannya di commit yang SAMA dengan tokennya.
  */
  ['onMerek', 'merekBidang'],
  ['success', 'successBg'], ['warning', 'warningBg'],
  ['danger', 'dangerBg'], ['info', 'infoBg'],
  ['success', 'surfaceRaised'], ['warning', 'surfaceRaised'],
  ['danger', 'surfaceRaised'], ['info', 'surfaceRaised'],
]

let totalGagal = 0
const temuan = []

for (const nama of ['TERANG', 'GELAP']) {
  const p = ambilPalet(nama)
  console.log(`\n══ ${nama} ═══════════════════════════════════════════════`)
  console.log('  pasangan                        rasio   AA    AAA')
  console.log('  ' + '─'.repeat(56))
  let gagalAAA = 0
  let gagalAA = 0
  for (const [fg, bg] of PASANGAN) {
    if (!p[fg] || !p[bg]) continue
    const latar = campur(p[bg], p.surface)
    const depan = campur(p[fg], latar)
    const r = R(depan, latar)
    const aa = r >= 4.5
    const aaa = r >= 7
    if (!aaa) {
      gagalAAA++
      totalGagal++
      temuan.push({ mode: nama, fg, bg, rasio: r, depan, latar })
    }
    if (!aa) gagalAA++
    console.log(
      `  ${(fg + ' / ' + bg).padEnd(30)} ${r.toFixed(2).padStart(5)}  ${aa ? ' ok ' : ' ❌ '}  ${aaa ? ' ok ' : ' ❌ '}`
    )
  }
  console.log(`\n  gagal AA (4.5:1)  : ${gagalAA}`)
  console.log(`  gagal AAA (7:1)   : ${gagalAAA} dari ${PASANGAN.length}`)
}

/*
  ⚠ Blok ini SEMPAT HILANG, dan penjaganya lolos uji mutasi karenanya.

  Versi pertama menghitung `totalGagal` dengan benar dan MENCETAK tiap
  pelanggaran dengan tanda ❌ — lalu keluar dengan exit 0. Uji mutasi
  (mengembalikan `textSecondary` ke nilai AA) menghasilkan tiga baris ❌
  di keluaran dan `exit=0` di bawahnya.

  Laporan yang benar, exit code yang salah. Tak satu pun pelari CI membaca
  keluaran teks — mereka membaca exit code, jadi penjaga ini akan hijau
  selamanya sambil mencetak kegagalan yang tak seorang pun lihat.

  Kelas yang sama dengan yang dikejar sepanjang dua hari ini: alat ukur
  yang melapor benar tentang keadaan yang salah.
*/
if (totalGagal > 0) {
  console.error('')
  console.error(`❌ ${totalGagal} pasangan di bawah 7:1 (WCAG AAA):`)
  for (const t of temuan) {
    console.error(
      `     ${t.mode}  ${t.fg} / ${t.bg}  =  ${t.rasio.toFixed(2)}:1` +
        `   (${t.depan} di atas ${t.latar})`
    )
  }
  console.error('')
  console.error('  Aplikasi ini dibaca di LOKASI PROYEK — layar berdebu, matahari')
  console.error('  langsung. 4.5:1 adalah lantai WCAG AA untuk dalam ruangan, dan')
  console.error('  riset praktik lapangan menyarankan 7:1 untuk kondisi ini.')
  console.error('')
  console.error('  Perbaiki di `apps/mobile/lib/tema.ts`. Geser LIGHTNESS-nya,')
  console.error('  jangan hue atau saturasi — mengganti hue mengubah identitas')
  console.error('  merek, dan itu keputusan founder (ARAH-VISUAL §2).')
  console.error('')
  process.exit(1)
}

console.log('')
console.log('✅ Seluruh pasangan token mobile >= 7:1 (WCAG AAA).')
console.log('   Batas: yang diperiksa PASANGAN TOKEN, bukan hasil render.')
console.log('   Warna yang masuk lewat prop komponen atau `Record` tak')
console.log('   tercakup di sini — itu wilayah `audit-kontras-mobile.mjs`.')
