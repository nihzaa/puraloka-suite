#!/usr/bin/env node
/**
 * Bayangan mobile wajib dari `ELEVASI`, dan TAK BOLEH hitam.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-09-05: *"desain frontend-nya kaya kurang pro anjirr"*. Riset
 * yang menyusul menemukan penyebab yang bisa dikodekan, bukan sekadar rasa:
 *
 *     `#000` pada opacity berapa pun MENCUCI warna di bawahnya jadi kelabu.
 *     Yang benar: hue latar dengan saturation & lightness diturunkan.
 *
 * Navy `#003366` ≈ `hsl(210 100% 20%)`, jadi bayangannya `hsl(210 40% 25%)`
 * = `#26425C`. Pada SATU kartu bedanya nyaris tak terlihat; pada satu layar
 * penuh ia memisahkan "terlihat dirancang" dari "terlihat template".
 *
 * Diukur sebelum penjaga ini: `components/ui/Card.tsx` memakai
 * `shadowColor: '#000000'` — satu berkas, dan tujuh layar memakainya.
 *
 * ── Yang KEDUA, dan lebih mahal daripada warna
 *
 * Kartu DAFTAR tak seharusnya berbayang sama sekali. Material 3 memilih
 * tonal elevation sebagai default; di React Native alasannya bukan selera:
 *
 *   - tiap lapis bayangan = satu alpha blending, dan Android menggambar
 *     bagian yang tertutup juga (overdraw). Daftar nyata di aplikasi ini:
 *     kasbon 67 baris, pekerjaan 63 — dibayar tiap baris, tiap frame.
 *   - anggaran satu frame 16ms untuk 60fps. HP mandor bukan perangkat uji.
 *
 * Gejalanya paling buruk PERSIS saat aplikasi paling dipakai (data banyak),
 * dan tak terlihat sama sekali di perangkat penguji dengan lima baris.
 *
 * ── Yang diperiksa
 *
 *   1. `shadowColor` tak boleh hitam — `#000`, `#000000`, `black`,
 *      `rgba(0,0,0,…)`. Nol toleransi: hitam tak pernah benar di sini.
 *   2. `shadowOffset`/`shadowOpacity`/`shadowRadius`/`elevation` tak boleh
 *      ditulis di layar maupun komponen — tempatnya `ELEVASI` di
 *      `lib/tema.ts`, supaya satu perubahan berlaku ke seluruh aplikasi.
 *
 * ⚠ BATAS: penjaga ini membaca KEPUTUSAN DI KODE, bukan hasil render. Ia
 * tak tahu berapa kartu berbayang yang benar-benar tergambar di satu layar,
 * dan tak bisa mengukur overdraw. Yang dijaganya: nilai bayangan punya SATU
 * sumber, dan sumber itu tak hitam.
 *
 * ── Ambang NOL
 *
 * Bukan ratchet. Saat penjaga ini lahir jumlahnya sudah nol (Card baru saja
 * diperbaiki), jadi lantai apa pun di atas nol akan melegalkan yang belum
 * ada — dan ratchet yang lahir di atas keadaan bersih cuma menunda
 * pekerjaan yang tak pernah perlu ditunda.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile')
const TEMA = join(MOBILE, 'lib', 'tema.ts')

if (!existsSync(MOBILE)) {
  console.error(`❌ apps/mobile tak ada di ${MOBILE} — jalurnya meleset.`)
  console.error('   Hijau dari korpus kosong adalah kebohongan.')
  process.exit(1)
}
if (!existsSync(TEMA)) {
  console.error('❌ lib/tema.ts tak ada — tempat sah bayangan justru hilang.')
  process.exit(1)
}

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
if (berkas.length === 0) {
  console.error('❌ Nol berkas .tsx ditemukan — jalurnya meleset.')
  process.exit(1)
}

/*
  CR dibuang, komentar diganti spasi yang MEMPERTAHANKAN barisnya.

  Dua alasan, keduanya sudah menggigit penjaga lain di repo ini:

    - komentar yang MENJELASKAN hal terlarang ikut terhitung sebagai
      pelanggaran (kepala `Card.tsx` menyebut `shadowColor: '#000000'`
      justru untuk menerangkan kenapa ia dibuang);
    - komentar yang diganti SATU spasi mengempiskan nomor baris, dan
      penjaga yang menunjuk baris salah membuat temuannya terlihat palsu.
*/
const bersih = (s) =>
  s
    .replace(/\r/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))

const HITAM = /shadowColor\s*:\s*['"`]?(#000000|#000|black|rgba?\(\s*0\s*,\s*0\s*,\s*0)/i
const PROP_BAYANG = /\b(shadowOffset|shadowOpacity|shadowRadius|elevation)\s*:/

const temuanHitam = []
const temuanTangan = []

for (const p of berkas) {
  const rel = relative(MOBILE, p).replace(/\\/g, '/')
  const baris = bersih(readFileSync(p, 'utf8')).split('\n')

  baris.forEach((b, i) => {
    if (HITAM.test(b)) temuanHitam.push({ rel, baris: i + 1, isi: b.trim().slice(0, 70) })
    if (PROP_BAYANG.test(b)) temuanTangan.push({ rel, baris: i + 1, isi: b.trim().slice(0, 70) })
  })
}

/* ELEVASI wajib ADA — kalau tokennya hilang, larangan di atas tak punya jalan keluar. */
const temaIsi = bersih(readFileSync(TEMA, 'utf8'))
const adaElevasi = /export const ELEVASI\s*=/.test(temaIsi)

console.log('══ Bayangan mobile bertoken ═══════════════════════════════════')
console.log(`  berkas dipindai       : ${berkas.length}`)
console.log(`  ELEVASI ada di tema   : ${adaElevasi ? 'ya' : 'TIDAK'}`)
console.log(`  shadowColor HITAM     : ${temuanHitam.length}`)
console.log(`  nilai bayangan tangan : ${temuanTangan.length}`)

let gagal = false

if (!adaElevasi) {
  console.error('')
  console.error('  ❌ `ELEVASI` tak ada di lib/tema.ts.')
  console.error('     Tanpa tokennya, melarang bayangan tulisan tangan berarti')
  console.error('     melarang bayangan sama sekali — bukan itu maksudnya.')
  gagal = true
}

if (temuanHitam.length > 0) {
  console.error('')
  console.error('  ❌ Bayangan HITAM — mencuci warna latar jadi kelabu:')
  for (const t of temuanHitam) console.error(`     ${t.rel}:${t.baris}  ${t.isi}`)
  console.error('')
  console.error('     Pakai `ELEVASI` dari lib/tema.ts (bernada navy #26425C).')
  gagal = true
}

if (temuanTangan.length > 0) {
  console.error('')
  console.error('  ❌ Nilai bayangan ditulis di layar/komponen:')
  for (const t of temuanTangan) console.error(`     ${t.rel}:${t.baris}  ${t.isi}`)
  console.error('')
  console.error('     Tempatnya `ELEVASI` di lib/tema.ts — satu sumber, supaya')
  console.error('     satu perubahan berlaku ke seluruh aplikasi. Dan ingat:')
  console.error('     kartu DAFTAR tak boleh berbayang sama sekali (overdraw).')
  gagal = true
}

if (gagal) process.exit(1)

console.log('')
console.log('✅ Nol bayangan hitam, nol nilai bayangan tulisan tangan.')
console.log('   Batas: yang dibaca KEPUTUSAN DI KODE, bukan hasil render.')
console.log('   Berapa kartu berbayang yang benar-benar tergambar sekaligus')
console.log('   — dan overdraw-nya — tak terukur dari sini.')
