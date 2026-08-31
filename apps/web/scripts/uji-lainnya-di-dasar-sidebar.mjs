#!/usr/bin/env node
/**
 * Entri "Lainnya" wajib bertanda `akhirDiSidebar` — dan wajib jadi yang
 * TERAKHIR bertanda itu.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-01 di /admin-portal @1440px — sidebar PC menampilkan:
 *
 *     Beranda · Approval · Proyek · Keuangan · Lainnya · Kontrak
 *
 * "Lainnya" di TENGAH, dengan tujuan nyata sesudahnya. Terbaca seperti menu
 * yang salah susun, dan orang berhenti membaca setelah melihatnya — kata
 * itu menandakan akhir daftar di hampir setiap aplikasi.
 *
 * ── Kenapa urutannya begitu, dan kenapa itu BUKAN kesalahan layout
 *
 * `navItems` melayani DUA pembaca dengan aturan berbeda:
 *
 *     bottom nav HP   navItems.slice(0, 4)   — hanya empat pertama
 *     sidebar PC      seluruh array          — semuanya
 *
 * Saat "Kontrak" ditambahkan ke admin-portal, ia ditaruh SESUDAH "Lainnya"
 * supaya empat slot HP tak bergeser. Itu keputusan yang benar untuk HP, dan
 * terdokumentasi panjang di `admin-portal/layout.tsx`.
 *
 * Yang tak terpikirkan: sidebar merender urutan yang sama apa adanya.
 *
 * ── Kenapa tak terlihat dari mana pun
 *
 * `tsc` hijau. Test hijau. Bahkan `potret-portal-adaptif.mjs` HIJAU untuk
 * ketiga pengukurannya — sidebar memang tampil, bottom nav memang
 * tersembunyi, lebar baca memang 1176px. Semua benar; menunya tetap salah
 * susun.
 *
 * Ketahuan hanya dengan MEMBUKA potretnya dan membacanya sebagai manusia.
 * Penjaga ini menggantikan mata itu untuk kasus yang punya jawaban benar.
 *
 * ── Yang DIJAGA, dan yang TIDAK
 *
 * DIJAGA: tiap entri berlabel "Lainnya" bertanda `akhirDiSidebar: true`,
 * dan tak ada entri LAIN bertanda itu sesudahnya.
 *
 * TIDAK DIJAGA: urutan sisanya. Apakah "Keuangan" sebaiknya sebelum
 * "Proyek" adalah selera, bukan cacat — dan penjaga yang menghakimi selera
 * akan dilemahkan orang pertama yang tak setuju.
 *
 * ── Ambang NOL
 *
 * Satu menu yang salah susun sudah cukup membuat orang berhenti membaca.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORTAL = ['admin-portal', 'mandor-portal', 'pm-portal']

const temuan = []
let terbaca = 0

console.log('══ "Lainnya" di dasar sidebar ═════════════════════════════════')
console.log('')

for (const p of PORTAL) {
  const f = join(AKAR, 'app', p, 'layout.tsx')
  if (!existsSync(f)) {
    temuan.push({ portal: p, apa: `layout.tsx tak ada di ${f}` })
    continue
  }

  /*
    ⚠ CR dibuang sebelum memisah baris. Berkas TSX di repo ini bisa CRLF,
    dan pola berjangkar akhir-baris tak pernah cocok dengan `},\r`. Versi
    begitu memulangkan "nol entri" dan terlihat hijau — kelas kesalahan
    yang menggigit repo ini lima kali dalam satu sesi (CLAUDE.md §7a).
  */
  const baris = readFileSync(f, 'utf8').replace(/\r/g, '').split(String.fromCharCode(10))

  /*
    Hanya baris KODE yang dihitung. `admin-portal/layout.tsx` membahas
    entri-entri ini panjang lebar di komentarnya, dan mencocokkan apa
    adanya akan memungut kalimat prosa sebagai entri menu.
  */
  const entri = []
  for (const l of baris) {
    if (/^\s*(\/\/|\*|\/\*)/.test(l)) continue
    const m = l.match(/\{\s*href:\s*["'][^"']+["'],\s*label:\s*["']([^"']+)["']/)
    if (m) entri.push({ label: m[1], akhir: /akhirDiSidebar:\s*true/.test(l) })
  }

  if (entri.length === 0) {
    temuan.push({ portal: p, apa: 'nol entri menu terbaca — polanya meleset' })
    continue
  }
  terbaca++

  const urut = [
    ...entri.filter((e) => !e.akhir),
    ...entri.filter((e) => e.akhir),
  ]

  console.log(`  ${p}`)
  console.log(`     navItems : ${entri.map((e) => e.label).join(' · ')}`)
  console.log(`     sidebar  : ${urut.map((e) => e.label).join(' · ')}`)

  const lainnya = entri.filter((e) => /^lainnya$/i.test(e.label))
  for (const e of lainnya) {
    if (!e.akhir) {
      temuan.push({
        portal: p,
        apa: `entri "${e.label}" tak bertanda \`akhirDiSidebar: true\``,
        akibat: 'sidebar PC menampilkannya di posisi array — dengan tujuan '
          + 'nyata sesudahnya kalau menu bertambah',
      })
    }
  }

  // Yang bertanda `akhirDiSidebar` selain "Lainnya" harus mendahuluinya.
  const bertanda = urut.filter((e) => e.akhir)
  const iLainnya = bertanda.findIndex((e) => /^lainnya$/i.test(e.label))
  if (iLainnya >= 0 && iLainnya !== bertanda.length - 1) {
    temuan.push({
      portal: p,
      apa: `"Lainnya" bukan yang terakhir di antara ${bertanda.length} entri bertanda`,
      akibat: 'ada tujuan nyata SESUDAH "Lainnya" di sidebar — kata itu '
        + 'menandakan akhir daftar, dan orang berhenti membaca di sana',
    })
  }
  console.log('')
}

if (terbaca === 0) {
  console.error('❌ Nol portal terbaca — jalurnya meleset atau polanya salah.')
  console.error('   Hijau dari korpus kosong adalah kebohongan.')
  process.exit(1)
}

console.log(`  portal terbaca : ${terbaca}`)
console.log(`  pelanggaran    : ${temuan.length}`)

if (temuan.length > 0) {
  console.log('')
  for (const t of temuan) {
    console.log(`  ❌ ${t.portal}`)
    console.log(`     ${t.apa}`)
    if (t.akibat) console.log(`     → ${t.akibat}`)
  }
  console.log('')
  console.log('  Cacat ini TAK menggagalkan tsc, TAK menyentuh test, dan bahkan')
  console.log('  LOLOS potret-portal-adaptif — sidebar memang tampil, bottom nav')
  console.log('  memang tersembunyi, lebar baca memang terjaga. Semua benar;')
  console.log('  menunya tetap salah susun.')
  console.log('')
  process.exit(1)
}

console.log('')
console.log('✅ "Lainnya" di dasar sidebar pada semua portal.')
