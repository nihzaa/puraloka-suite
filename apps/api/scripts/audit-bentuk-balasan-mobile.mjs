#!/usr/bin/env node
/**
 * Layar mobile wajib membaca bentuk balasan yang BENAR-BENAR dikirim rute.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-04, potret pertama dashboard mobile yang berhasil login:
 *
 *     Proyek Aktif        0
 *     Total Kontrak       Rp 0
 *     Invoice Belum Lunas Rp 0
 *     Kas Bersih          Rp 0
 *
 * Semuanya nol. Diukur langsung ke API produksi pada detik yang sama:
 * **15 proyek aktif, Rp 7.135.525.000 nilai kontrak.**
 *
 * Sebabnya satu tingkat sarang:
 *
 *     API mengirim   { kpis: { active_projects: 15, … } }
 *     layar membaca    data?.active_projects ?? 0
 *
 * Plus dua nama yang tak pernah cocok: `net_cash` (sebenarnya
 * `net_cash_estimate`) dan `recent_projects` (sebenarnya `projects_list`,
 * berisi 19 proyek yang tak pernah tampil).
 *
 * ── Kenapa ini bertahan tanpa satu pun gejala
 *
 * `?? 0` mengubah `undefined` jadi nol, dan **nol yang salah tak bisa
 * dibedakan dari nol yang benar**. Layar memuat cepat, tak ada galat, tak
 * ada spanduk merah — dan memberi tahu pemilik perusahaan bahwa ia punya
 * nol proyek dan nol nilai kontrak.
 *
 * Semua alat menjawab hijau:
 *
 *     tsc         `res.data` bertipe `any` dari axios; TypeScript dengan
 *                 senang hati mencocokkan apa pun ke `DashboardData`
 *     test        tak ada test yang membandingkan bentuk balasan rute
 *                 dengan tipe yang dipakai layar
 *     penjaga     nol yang memeriksa lintas-batas API↔mobile
 *     mata        nol adalah angka yang sah; tak ada yang mencurigakan
 *                 tentang perusahaan baru dengan nol proyek
 *
 * ── Yang DIJAGA
 *
 * Kunci puncak yang dibaca layar mobile dari `res.data` wajib ADA di objek
 * yang dikembalikan rutenya. Yang diperiksa BENTUK, bukan nilai — nilai
 * berubah tiap hari, bentuk tidak.
 *
 * ── Yang sengaja TIDAK dijaga
 *
 * Kedalaman penuh (`data.kpis.active_projects` sampai ke daun). Rute di repo
 * ini merakit balasannya dari banyak query, dan melacak tiap cabang lewat
 * pembacaan teks akan salah ke dua arah — melewatkan yang benar, dan
 * merahkan yang benar. Yang dijaga LAPIS PERTAMA, tempat cacat 2026-09-04
 * terjadi dan tempat kesalahan sarang paling mungkin muncul.
 *
 * Batas itu disebutkan supaya hijaunya tak dibaca sebagai "bentuk balasan
 * mobile sudah terjamin".
 *
 * ⚠ BATAS YANG TERUKUR, bukan diperkirakan.
 *
 * Uji mutasi mengembalikan KEDUA kunci datar dari cacat aslinya:
 *
 *     recent_projects   → TERTANGKAP (rute tak punya kunci itu sama sekali)
 *     active_projects   → LOLOS      (kunci itu ADA di rute — di dalam
 *                                     `kpis`, dan pembacaan lapis-pertama
 *                                     ini tak tahu ia bersarang)
 *
 * Jadi penjaga ini menangkap kunci yang SALAH NAMA, tidak kunci yang SALAH
 * SARANG. Cacat 2026-09-04 punya keduanya, dan ia hanya akan menangkap
 * separuhnya.
 *
 * Ditulis di sini alih-alih diperbaiki, karena memperbaikinya berarti
 * memodelkan sarang objek dari pembacaan teks — dan penjaga yang salah
 * merah lebih cepat dimatikan daripada penjaga yang jangkauannya sempit
 * tapi jujur. Separuh yang tertangkap tetap separuh lebih banyak daripada
 * nol, ASALKAN pembacanya tahu separuh mana.
 *
 * ── Ambang NOL
 *
 * Satu kunci yang salah = satu angka salah di layar keputusan, tanpa gejala.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MOBILE = join(AKAR, 'apps', 'mobile', 'app')
const RUTE = join(AKAR, 'apps', 'api', 'src', 'routes', 'v1')

for (const [nama, p] of [['apps/mobile/app', MOBILE], ['apps/api/src/routes/v1', RUTE]]) {
  if (!existsSync(p)) {
    console.error(`❌ ${nama} tak ada di ${p} — jalurnya meleset.`)
    console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
    process.exit(1)
  }
}

/* CR dibuang sebelum apa pun — CLAUDE.md §7a. */
const baca = (p) => readFileSync(p, 'utf8').replace(/\r/g, '')
const tanpaKomentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

function sapu(dir, keluar = []) {
  if (!existsSync(dir)) return keluar
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '__tests__' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) sapu(p, keluar)
    else if (/\.tsx?$/.test(n)) keluar.push(p)
  }
  return keluar
}

/*
  Pasangan yang diperiksa.

  Ditulis tangan dan sengaja PENDEK: penjaga yang mencoba menemukan
  pasangannya sendiri lewat pembacaan teks akan salah ke dua arah, dan
  penjaga yang salah merah lebih cepat dimatikan daripada penjaga yang
  tak ada.

  Menambah baris di sini adalah cara memperluas jangkauannya — dan tiap
  baris baru wajib dibuktikan bisa merah lewat mutasi.
*/
const PASANGAN = [
  {
    layar: 'app/(app)/dashboard.tsx',
    rute: 'dashboard.ts',
    tipe: 'DashboardData',
  },
]

const temuan = []
const laporan = []

for (const { layar, rute, tipe } of PASANGAN) {
  const pLayar = join(AKAR, 'apps', 'mobile', layar)
  const pRute = join(RUTE, rute)

  for (const [nama, p] of [[layar, pLayar], [`routes/v1/${rute}`, pRute]]) {
    if (!existsSync(p)) {
      console.error(`❌ ${nama} tak ada — pasangan di PASANGAN sudah basi.`)
      console.error('   Penjaga yang memeriksa berkas yang tak ada selalu hijau.')
      process.exit(1)
    }
  }

  const kodeLayar = tanpaKomentar(baca(pLayar))
  const kodeRute = tanpaKomentar(baca(pRute))

  /*
    Kunci yang DIBACA layar: dari deklarasi `interface <tipe> { … }`.

    Diambil dari interface, bukan dari `data?.x` di JSX: interface adalah
    tempat kontraknya dinyatakan, dan membacanya menangkap juga medan yang
    dideklarasikan tetapi belum dipakai — yang justru paling mungkin salah,
    karena tak ada yang pernah melihat hasilnya di layar.
  */
  const blok = new RegExp(`interface\\s+${tipe}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(kodeLayar)
  if (!blok) {
    console.error(`❌ interface ${tipe} tak ditemukan di ${layar}.`)
    console.error('   Namanya berubah, atau bentuknya bukan `interface` lagi.')
    console.error('   Nol kunci dari interface yang tak ketemu akan HIJAU — dan itu bohong.')
    process.exit(1)
  }

  /* Hanya medan LAPIS PERTAMA: baris berindentasi tepat dua spasi. */
  const kunciLayar = [
    ...new Set(
      [...blok[1].matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm)].map((m) => m[1])
    ),
  ]

  if (kunciLayar.length === 0) {
    console.error(`❌ Nol kunci terbaca dari interface ${tipe} — pembacaannya meleset.`)
    process.exit(1)
  }

  /*
    Kunci yang DIKIRIM rute: dari objek yang dikembalikan.

    Rute di repo ini memulangkan lewat `return reply.send({ … })` atau
    `return { … }`. Yang dicari kunci di lapis pertama objek itu — dicocokkan
    dengan pola `^      nama:` / `^    nama:` (indentasi 4-6 spasi, bentuk
    yang dipakai berkas rute), plus bentuk singkat `nama,`.
  */
  const kunciRute = new Set()
  for (const m of kodeRute.matchAll(/^ {4,8}([a-z_][a-z0-9_]*)\s*[:,]/gm)) {
    kunciRute.add(m[1])
  }

  const hilang = kunciLayar.filter((k) => !kunciRute.has(k))

  laporan.push({
    layar,
    rute,
    dibaca: kunciLayar.length,
    dikirim: kunciRute.size,
    hilang,
  })

  for (const k of hilang) {
    temuan.push({
      layar,
      rute,
      kunci: k,
      akibat:
        `layar membaca \`data.${k}\`, dan rutenya tak pernah mengirim kunci itu. ` +
        'Dengan `?? 0` hasilnya NOL di layar — dan nol yang salah tak bisa ' +
        'dibedakan dari nol yang benar.',
    })
  }
}

console.log('══ Bentuk balasan mobile cocok dengan rutenya ═════════════════')
for (const r of laporan) {
  console.log(`  ${r.layar}`)
  console.log(`    ← routes/v1/${r.rute}`)
  console.log(`    kunci dibaca layar : ${r.dibaca}`)
  console.log(`    kunci dikirim rute : ${r.dikirim}`)
  console.log(`    tak terkirim       : ${r.hilang.length}`)
}

if (temuan.length > 0) {
  console.error('')
  for (const t of temuan) {
    console.error(`  ❌ ${t.layar} — kunci \`${t.kunci}\``)
    console.error(`     ${t.akibat}`)
  }
  console.error('')
  console.error('  Diukur 2026-09-04: cacat persis ini membuat dashboard mobile')
  console.error('  menampilkan "Proyek Aktif 0 · Total Kontrak Rp 0" sementara')
  console.error('  API mengirim 15 proyek dan Rp 7,14 miliar. Tak ada galat,')
  console.error('  tak ada spanduk merah, dan layarnya memuat cepat.')
  console.error('')
  process.exit(1)
}

console.log('')
console.log('✅ Tiap kunci yang dibaca layar mobile benar-benar dikirim rutenya.')
console.log('   Batas: yang diperiksa LAPIS PERTAMA. Kedalaman penuh sengaja')
console.log('   tak dijaga — hijaunya bukan "bentuk balasan mobile terjamin".')
