#!/usr/bin/env node
/**
 * Daftar panjang di mobile wajib `FlatList`, bukan `ScrollView` + `.map()`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04:
 *
 *     `FlatList` di SELURUH apps/mobile   : 0
 *     layar ber-`ScrollView` + `.map()`   : 14
 *
 * Lalu diukur langsung ke API produksi, berapa baris yang sesungguhnya
 * dirender layar-layar itu:
 *
 *     kasbons        67 baris
 *     notifications  30 baris
 *     projects       19 baris
 *     pekerjaan      63 baris  (25 perlu tindakan + 29 berjalan + 9 selesai)
 *
 * Ambang virtualisasi menurut pedoman stack `react-native` adalah **50**,
 * severity **High**: *"Use FlatList for long lists — FlatList for 50+ items,
 * don't use ScrollView with map"*.
 *
 * `ScrollView` merakit dan MENAHAN seluruh anaknya di memori sekaligus,
 * termasuk yang tak pernah tergulir ke layar. Yang memakai aplikasi ini HP
 * kelas menengah milik mandor di lokasi proyek — bukan perangkat penguji.
 *
 * ── Kenapa tak bergejala
 *
 * Tak ada galat, tak ada peringatan, dan `tsc` tak punya pendapat soal ini.
 * Yang muncul cuma gulir yang tersendat dan pemakaian memori yang naik
 * SEIRING BERTAMBAHNYA DATA — jadi ia makin parah persis saat aplikasinya
 * makin dipakai, dan gejalanya paling mudah disalahkan pada "HP-nya tua".
 *
 * Di perangkat penguji dengan 5 baris data, semuanya terasa mulus.
 *
 * ── Yang DIJAGA, dan kenapa RATCHET
 *
 * Yang dijaga: jumlah layar yang merender daftar dengan `ScrollView` +
 * `.map()` tak boleh BERTAMBAH. Empat belas layar tak bisa dipindahkan
 * dalam satu commit, dan penjaga yang menuntut nol pada hari pertama akan
 * dimatikan orang pertama yang terhalang.
 *
 * ── Yang sengaja TIDAK dijaga
 *
 * `.map()` atas daftar PENDEK yang jumlahnya dibatasi kode — misalnya lima
 * chip pilihan, atau `projects_list.slice(0, 5)` di dashboard. Virtualisasi
 * di situ menambah kerumitan tanpa menghemat apa pun.
 *
 * Penjaga ini tak bisa membedakan keduanya dari teks, jadi ia menghitung
 * BERKAS, bukan panggilan `.map()`. Angkanya turun saat sebuah layar benar
 * benar berpindah ke `FlatList`; layar yang `.map()`-nya memang pendek
 * tinggal dikeluarkan dari daftar lewat `--turunkan` setelah diperiksa.
 *
 * Batas itu disebutkan supaya hijaunya tak dibaca sebagai "semua daftar
 * mobile sudah tervirtualisasi".
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile')
const LANTAI_BERKAS = join(dirname(fileURLToPath(import.meta.url)), 'daftar-mobile-lantai.json')

if (!existsSync(MOBILE)) {
  console.error(`❌ apps/mobile tak ada di ${MOBILE} — jalurnya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

function sapu(dir, keluar = []) {
  if (!existsSync(dir)) return keluar
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) sapu(p, keluar)
    else if (/\.tsx$/.test(n)) keluar.push(p)
  }
  return keluar
}

const berkas = [...sapu(join(MOBILE, 'app')), ...sapu(join(MOBILE, 'components'))]

if (berkas.length === 0) {
  console.error('❌ Nol berkas .tsx ditemukan — jalurnya meleset.')
  console.error('   Hijau dari korpus kosong adalah kebohongan.')
  process.exit(1)
}

/*
  Komentar dibuang lebih dulu — CLAUDE.md §8a.2.

  Berkas yang SUDAH dipindahkan ke `FlatList` menjelaskan panjang lebar di
  komentarnya kenapa `ScrollView` + `.map()` berbahaya, dan penjaga yang
  memindai teks mentah akan menghitung penjelasan itu sebagai pelanggaran.
  Persis yang menggigit `audit-a11y-mobile.mjs` hari ini juga.

  ⚠ CR dibuang juga — CLAUDE.md §7a.
*/
const tanpaKomentar = (teks) =>
  teks
    .replace(/\r/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')

const temuan = []

for (const p of berkas) {
  const kode = tanpaKomentar(readFileSync(p, 'utf8'))
  const rel = relative(MOBILE, p).replace(/\\/g, '/')

  const punyaScrollView = /<ScrollView\b/.test(kode)
  const punyaFlatList = /<FlatList\b/.test(kode)
  const jumlahMap = (kode.match(/\.map\(\(/g) ?? []).length

  /*
    Yang dihitung: berkas yang PUNYA ScrollView, PUNYA .map(), dan TIDAK
    punya FlatList sama sekali.

    Sebuah berkas yang sudah memakai `FlatList` untuk daftar utamanya boleh
    tetap punya `.map()` untuk hal pendek (chip, baris ringkasan) — itu
    justru pemakaian yang benar.
  */
  if (punyaScrollView && jumlahMap > 0 && !punyaFlatList) {
    temuan.push({ rel, map: jumlahMap })
  }
}

temuan.sort((a, b) => b.map - a.map)

console.log('══ Daftar mobile tervirtualisasi ══════════════════════════════')
console.log(`  berkas dipindai       : ${berkas.length}`)
console.log(`  ScrollView + map, nol FlatList : ${temuan.length}`)

/*
  ⚠ Lantai menyimpan DAFTAR NAMANYA, bukan cuma angkanya.

  Versi pertama hanya menyimpan jumlah, dan uji mutasi membuktikan itu tak
  cukup: layar baru ber-`ScrollView`+`.map()` memang memerahkan penjaga,
  tetapi keluarannya diurut berdasarkan jumlah `.map()` — jadi berkas baru
  dengan satu `.map()` tenggelam di dasar daftar 14 baris.

  Merah tanpa menyebut PELAKUNYA memaksa orang berikutnya menyisir sendiri.
  CLAUDE.md §8a.2: "Periksa DUA hal per mutasi: penjaga MERAH _dan_
  menyebut namanya. Biayanya dibayar orang lain, bukan penulis penjaganya."
*/
const simpanan = existsSync(LANTAI_BERKAS)
  ? JSON.parse(readFileSync(LANTAI_BERKAS, 'utf8'))
  : null
const lantai = simpanan?.berkas ?? null
const lantaiDaftar = simpanan?.daftar ?? []

if (process.argv.includes('--turunkan')) {
  writeFileSync(
    LANTAI_BERKAS,
    JSON.stringify(
      { berkas: temuan.length, daftar: temuan.map((t) => t.rel).sort() },
      null,
      2
    ) + '\n'
  )
  console.log(`\n✅ lantai daftar-mobile disetel ke ${temuan.length}`)
  process.exit(0)
}

if (lantai == null) {
  console.error(`\n❌ ${LANTAI_BERKAS} belum ada. Tetapkan lantai:`)
  console.error('   node scripts/audit-daftar-mobile-virtual.mjs --turunkan\n')
  process.exit(1)
}

console.log(`  lantai                : ${lantai}`)

if (temuan.length > lantai) {
  /* Yang BARU sejak lantai ditetapkan — inilah yang harus dibaca lebih dulu. */
  const baru = temuan.filter((t) => !lantaiDaftar.includes(t.rel))

  console.error('')
  console.error(`❌ BERTAMBAH: ${temuan.length} layar (lantai ${lantai}).`)
  console.error('')
  if (baru.length > 0) {
    console.error('  YANG BARU — ini yang menaikkan angkanya:')
    for (const t of baru) {
      console.error(`     ❌ ${t.rel}  (${t.map} .map())`)
    }
    console.error('')
  } else {
    /*
      Angka naik tapi tak ada nama baru: berarti daftar lantai sudah basi
      (mis. berkas di-rename). Dikatakan apa adanya, bukan didiamkan —
      selisih yang tak bisa dijelaskan adalah temuan yang belum dibuka.
    */
    console.error('  ⚠ Angka naik tetapi tak ada berkas BARU dibanding daftar')
    console.error('    lantai — kemungkinan ada berkas yang di-rename. Daftar')
    console.error('    lantai perlu disetel ulang setelah diperiksa.')
    console.error('')
  }
  console.error('  Seluruh layar yang terhitung:')
  for (const t of temuan.slice(0, 8)) {
    console.error(`     ${String(t.map).padStart(2)} .map()  ${t.rel}`)
  }
  console.error('')
  console.error('  Pakai `FlatList` untuk daftar yang bisa melewati 50 baris:')
  console.error('')
  console.error('     <FlatList data={…} keyExtractor={ambilKunci}')
  console.error('               renderItem={renderKartu} />')
  console.error('')
  console.error('  `ScrollView` menahan SELURUH anaknya di memori, termasuk yang')
  console.error('  tak pernah tergulir. Tak ada galat — yang muncul cuma gulir')
  console.error('  tersendat yang MAKIN PARAH seiring bertambahnya data, dan')
  console.error('  paling mudah disalahkan pada "HP-nya sudah tua".')
  console.error('')
  process.exit(1)
}

if (temuan.length < lantai) {
  console.log('')
  console.log(`📉 Turun ${lantai - temuan.length} dari lantai — kencangkan:`)
  console.log('   node scripts/audit-daftar-mobile-virtual.mjs --turunkan')
}

console.log('')
console.log(`✅ ${temuan.length} layar (lantai ${lantai}) — tidak bertambah.`)
if (temuan.length > 0) {
  console.log('')
  console.log('   Sisa terbesar:')
  for (const t of temuan.slice(0, 3)) {
    console.log(`     ${String(t.map).padStart(2)} .map()  ${t.rel}`)
  }
  console.log('')
  console.log('   Batas: yang dihitung BERKAS, bukan panjang daftarnya. `.map()`')
  console.log('   atas lima chip pilihan ikut terhitung — periksa sebelum')
  console.log('   memindahkannya.')
}
