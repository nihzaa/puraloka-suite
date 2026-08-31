#!/usr/bin/env node
/**
 * Kontras teks mobile DIHITUNG, bukan ditaksir.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DIHITUNG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Preseden di repo ini: `kontras-situs.mjs` lahir 2026-08-08 karena TIGA
 * angka kontras yang ditulis dari taksiran ketiganya meleset. Mata manusia
 * buruk menilai rasio kontras, dan `#9CA3AF` terlihat "abu-abu sedang yang
 * wajar" padahal 2.54:1 — hampir setengah dari yang dituntut WCAG AA.
 *
 * Diukur 2026-08-31, sebelum perbaikan:
 *
 *     #9CA3AF pada #FFFFFF   2.54:1   15 tempat `color:` + label tab
 *     #6B7280 pada #FFFFFF   4.83:1   lulus
 *
 * Label tab yang tak aktif memakai warna itu, dan bilah tab hadir di SETIAP
 * layar — jadi teks 11px berkontras 2.54:1 adalah hal yang paling sering
 * dilihat pengguna aplikasi ini.
 *
 * ── Yang diperiksa, dan yang sengaja TIDAK
 *
 * Diperiksa: tiap `color: '#RRGGBB'` di StyleSheet mobile, terhadap latar
 * yang dipakai layar (putih dan #F8FAFC — dua-duanya, dan yang terburuk
 * yang dinilai).
 *
 * TIDAK diperiksa:
 *
 *   placeholderTextColor  WCAG 1.4.3 mengecualikan teks placeholder, dan
 *                         menggelapkannya membuat placeholder sulit
 *                         dibedakan dari nilai yang sudah diisi — menukar
 *                         satu masalah dengan yang lain.
 *   backgroundColor       bukan teks. Tombol mati justru harus redup.
 *   warna di atas latar   `chipTeksAktif: '#FFFFFF'` dipakai DI ATAS navy,
 *   gelap                 bukan di atas putih. Menilainya terhadap putih
 *                         akan merah untuk hal yang benar, jadi putih dan
 *                         warna terang lainnya dilewati (daftar PUTIH).
 *
 * Ini pemeriksaan STATIS: ia tak tahu pasangan warna sesungguhnya saat
 * render. Batas itu disebutkan supaya hijaunya tak dibaca sebagai "kontras
 * mobile sudah teraudit" — ia menangkap kelas kesalahan yang paling umum
 * (teks abu-abu terlalu muda di atas latar terang), bukan semuanya.
 *
 * ── Ambang NOL
 *
 * Lantainya sudah nol sesudah perbaikan hari ini. Tak ada hutang yang
 * sedang dicicil, jadi yang dijaga keadaan bersih itu sendiri.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile')
const AMBANG = Number(process.env.AMBANG_KONTRAS_MOBILE ?? 0)

/** Latar terang yang benar-benar dipakai layar mobile. */
const LATAR = ['#FFFFFF', '#F8FAFC']

/**
 * Warna yang JELAS dipakai di atas latar gelap, bukan di atas putih.
 * Menilainya terhadap putih akan merah untuk hal yang benar.
 */
const DI_ATAS_GELAP = new Set(['#FFFFFF', '#FFF', '#F8FAFC', '#C7D7E8', '#E5E7EB', '#F3F4F6'])

/**
 * Berkas yang SELURUH layarnya berlatar gelap.
 *
 * Daftar warna di atas tak cukup: `SplashMerek.tsx` memakai `#7FA8CC` yang
 * bukan warna terang, tetapi latarnya navy. Diukur — 5.03:1 di atas
 * #003366 (LULUS), 2.51:1 di atas putih. Menilainya terhadap putih
 * melaporkan pelanggaran atas warna yang benar.
 *
 * Itu kelas kesalahan yang ditulis di kepala berkas ini, dan versi pertama
 * penjaga ini tetap melakukannya. Latar gelap diperiksa terhadap NAVY,
 * bukan dilewati — supaya warna yang benar-benar buruk di sana tetap
 * tertangkap.
 */
const BERLATAR_GELAP = new Map([
  ['components/SplashMerek.tsx', '#003366'],
])

function luminansi(hex) {
  const h = hex.replace('#', '')
  const p = h.length === 3 ? h.split('').map((c) => c + c) : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)]
  const [r, g, b] = p.map((x) => {
    const c = parseInt(x, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function rasio(a, b) {
  const [x, y] = [luminansi(a), luminansi(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

function jelajah(d, hasil = []) {
  let isi
  try { isi = readdirSync(d, { withFileTypes: true }) } catch { return hasil }
  for (const e of isi) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const f = join(d, e.name)
    if (e.isDirectory()) jelajah(f, hasil)
    else if (f.endsWith('.tsx')) hasil.push(f)
  }
  return hasil
}

const berkas = [...jelajah(join(MOBILE, 'app')), ...jelajah(join(MOBILE, 'components'))]

if (berkas.length < 10) {
  console.error(`❌ Korpus cuma ${berkas.length} berkas .tsx — jalurnya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

let diperiksa = 0
const gagal = []

for (const f of berkas) {
  const isi = readFileSync(f, 'utf8')
  const nama = f.replace(/\\/g, '/').replace(AKAR.replace(/\\/g, '/') + '/', '')

  /*
    Hanya `color:` — bukan `backgroundColor:`, `borderColor:`,
    `placeholderTextColor`, `tintColor`. Lookbehind memastikan huruf
    sebelumnya bukan bagian dari nama properti lain.
  */
  for (const m of isi.matchAll(/(?<![A-Za-z])color:\s*'(#[0-9A-Fa-f]{3,6})'/g)) {
    const warna = m[1].toUpperCase()
    if (DI_ATAS_GELAP.has(warna)) continue
    diperiksa++
    // Yang dinilai latar TERBURUK yang mungkin di antara latar terang.
    const gelap = [...BERLATAR_GELAP].find(([jalur]) => nama.endsWith(jalur))
    const latar = gelap ? [gelap[1]] : LATAR
    const r = Math.min(...latar.map((bg) => rasio(warna, bg)))
    if (r < 4.5) {
      gagal.push({
        nama,
        baris: isi.slice(0, m.index).split('\n').length,
        warna,
        r,
      })
    }
  }
}

console.log('══ Kontras teks mobile (WCAG 2.1 AA, >= 4.5:1) ════════════════')
console.log(`  berkas .tsx      : ${berkas.length}`)
console.log(`  warna teks diuji : ${diperiksa}`)
console.log(`  di bawah 4.5:1   : ${gagal.length}`)
console.log(`  ambang           : ${AMBANG}`)

if (gagal.length > AMBANG) {
  console.log('')
  for (const g of gagal) {
    console.log(`  ❌ ${g.r.toFixed(2)}:1  ${g.warna}  ${g.nama}:${g.baris}`)
  }
  console.log('')
  console.log('  Teks di bawah 4.5:1 sulit dibaca di bawah matahari, pada layar')
  console.log('  retak, dan oleh mata yang tak muda lagi — tiga keadaan yang')
  console.log('  justru normal bagi pengguna aplikasi lapangan.')
  console.log('')
  console.log('  Abu-abu yang LULUS di atas putih: #6B7280 (4.83:1) · #64748B (4.76:1)')
  console.log('')
  console.log(`❌ ${gagal.length} warna teks di bawah WCAG AA (ambang ${AMBANG}).`)
  process.exit(1)
}

console.log('')
console.log(`✅ ${diperiksa} warna teks, semuanya >= 4.5:1 di latar terang.`)
