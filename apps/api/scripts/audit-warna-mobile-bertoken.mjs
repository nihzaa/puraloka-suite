#!/usr/bin/env node
/**
 * Warna di layar mobile wajib datang dari token, bukan hex yang diketik.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04, sebelum `lib/tema.ts` dibuat:
 *
 *     warna hex ditulis langsung : 39 unik, 400+ pemakaian
 *     `#003366` saja             : 88 kali
 *     berkas token               : 0
 *     mode gelap                 : 0
 *
 * Web punya 105 token dengan riwayat WCAG tertulis; mobile mewarisi nol.
 * Akibatnya dua hal MUSTAHIL: mengubah merek tanpa 400 suntingan, dan
 * menambahkan mode gelap tanpa membuka ulang setiap layar.
 *
 * ── Kenapa RATCHET, bukan ambang NOL
 *
 * Empat ratus pemakaian tak bisa dipindahkan dalam satu commit, dan penjaga
 * yang menuntut nol pada hari pertama akan dimatikan orang pertama yang
 * terhalang. Angka hari ini adalah LANTAI: ia boleh turun, tak boleh naik.
 *
 * Yang dijaga: layar BARU tak menambah hutang, dan tiap layar yang
 * dipindahkan ke token menurunkan angkanya secara permanen.
 *
 * ── Yang SENGAJA dilewati
 *
 * `lib/tema.ts` sendiri — di situlah hex-nya memang harus tinggal.
 * Aset merek (`components/SplashMerek.tsx`) juga: warna lambang adalah
 * identitas yang tak boleh ikut berubah bersama tema.
 *
 * ── Ambang
 *
 * Ratchet. Turunkan dengan `--turunkan` tiap kali ada layar yang benar-benar
 * dipindahkan.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile')
const LANTAI_BERKAS = join(dirname(fileURLToPath(import.meta.url)), 'warna-mobile-lantai.json')

if (!existsSync(MOBILE)) {
  console.error(`❌ apps/mobile tak ada di ${MOBILE} — jalurnya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

/*
  Berkas yang hex-nya SAH.

  `lib/tema.ts`   — sumber tokennya sendiri
  `SplashMerek`   — warna lambang; identitas, bukan tema
  `buat-aset-merek.mjs` — pembangkit ikon/splash, bukan UI berjalan
*/
const DIKECUALIKAN = [
  'lib/tema.ts',
  'components/SplashMerek.tsx',
  'scripts/buat-aset-merek.mjs',
]

/** Semua .tsx/.ts di app/ dan components/, kecuali yang dikecualikan. */
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

const berkas = [
  ...sapu(join(MOBILE, 'app')),
  ...sapu(join(MOBILE, 'components')),
  ...sapu(join(MOBILE, 'hooks')),
].filter((p) => {
  const rel = relative(MOBILE, p).replace(/\\/g, '/')
  return !DIKECUALIKAN.includes(rel)
})

if (berkas.length === 0) {
  console.error('❌ Nol berkas .tsx/.ts ditemukan — jalurnya meleset.')
  console.error('   Hijau dari korpus kosong adalah kebohongan.')
  process.exit(1)
}

/*
  ⚠ CR dibuang sebelum memisah baris — CLAUDE.md §7a.

  Berkas .tsx di repo ini bisa CRLF, dan pola berjangkar akhir-baris tak
  pernah cocok dengan `'#003366'\r`. Versi begitu memulangkan "nol hex"
  dan terlihat hijau. Nol hasil bukan bukti ketiadaan — kelas kesalahan
  yang menggigit repo ini lima kali dalam satu sesi.
*/
const temuan = []
let totalHex = 0

for (const p of berkas) {
  const baris = readFileSync(p, 'utf8').replace(/\r/g, '').split(String.fromCharCode(10))
  const rel = relative(MOBILE, p).replace(/\\/g, '/')
  let n = 0
  for (const [i, l] of baris.entries()) {
    // Komentar dilewati: contoh warna di dokumentasi bukan pemakaian.
    if (/^\s*(\/\/|\*|\/\*)/.test(l)) continue
    const cocok = l.match(/#[0-9A-Fa-f]{6}\b/g)
    if (cocok) {
      n += cocok.length
      totalHex += cocok.length
      if (temuan.length < 400) temuan.push({ rel, baris: i + 1, hex: cocok[0] })
    }
  }
  if (n > 0) temuan.push({ rel, jumlah: n, _ringkas: true })
}

const perBerkas = temuan.filter((t) => t._ringkas).sort((a, b) => b.jumlah - a.jumlah)

console.log('══ Warna mobile bertoken ══════════════════════════════════════')
console.log(`  berkas dipindai   : ${berkas.length}`)
console.log(`  hex ditulis tangan: ${totalHex}`)

const lantai = existsSync(LANTAI_BERKAS)
  ? JSON.parse(readFileSync(LANTAI_BERKAS, 'utf8')).hex
  : null

if (process.argv.includes('--turunkan')) {
  writeFileSync(LANTAI_BERKAS, JSON.stringify({ hex: totalHex }, null, 2) + '\n')
  console.log(`\n✅ lantai hex-mobile disetel ke ${totalHex}`)
  process.exit(0)
}

if (lantai == null) {
  console.error(`\n❌ ${LANTAI_BERKAS} belum ada. Tetapkan lantai:`)
  console.error('   node scripts/audit-warna-mobile-bertoken.mjs --turunkan\n')
  process.exit(1)
}

console.log(`  lantai            : ${lantai}`)

if (totalHex > lantai) {
  console.error('')
  console.error(`❌ Hex tulisan tangan BERTAMBAH: ${totalHex} (lantai ${lantai}).`)
  console.error('')
  console.error('  Lima penyumbang terbesar:')
  for (const x of perBerkas.slice(0, 5)) {
    console.error(`     ${String(x.jumlah).padStart(4)}  ${x.rel}`)
  }
  console.error('')
  console.error('  Pakai `useTema()` — ia memilih palet sesuai mode perangkat:')
  console.error('')
  console.error("     const { c } = useTema()")
  console.error("     <Text style={{ color: c.textPrimary }}>…</Text>")
  console.error('')
  console.error('  Hex yang diketik langsung mengunci layar ke SATU mode, dan')
  console.error('  tak ada gejalanya sampai seseorang menyalakan mode gelap.')
  console.error('')
  process.exit(1)
}

if (totalHex < lantai) {
  console.log('')
  console.log(`📉 Turun ${lantai - totalHex} dari lantai — kencangkan:`)
  console.log('   node scripts/audit-warna-mobile-bertoken.mjs --turunkan')
}

console.log('')
console.log(`✅ ${totalHex} hex (lantai ${lantai}) — tidak bertambah.`)
if (totalHex > 0) {
  console.log('')
  console.log('   Sisa terbesar:')
  for (const x of perBerkas.slice(0, 3)) {
    console.log(`     ${String(x.jumlah).padStart(4)}  ${x.rel}`)
  }
}
