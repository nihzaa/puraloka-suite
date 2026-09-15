#!/usr/bin/env node
// ============================================================================
// `.limit(N)` TAK BISA MENEMBUS 1.000 — DAN YANG MENGANDALKANNYA BERBOHONG
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA, DAN KENAPA IA BUKAN DUPLIKAT
// ══════════════════════════════════════════════════════════════════════════
//
// `audit-baca-tak-terpotong.mjs` sudah menjaga kelas yang bersebelahan:
// pembacaan tabel PENUH yang terpotong senyap di 1.000 baris PostgREST.
// Ia hijau, dan ia BENAR — tetapi batasnya tertulis di kodenya sendiri:
//
//     const PEMBATAS = /\.(range|limit|single|maybeSingle|eq|in|…)\s*\(/
//     …
//     if (PEMBATAS.test(rantai)) continue           // sudah dibatasi
//
// `.limit(` ada di daftar pembatas. Artinya `.limit(20000)` dianggap SUDAH
// DIBATASI dan dilewati tanpa diperiksa — padahal 20.000 adalah angka yang
// TIDAK BISA dicapai. PostgREST memulangkan maksimal 1.000, jadi batas itu
// bukan pagar melainkan hiasan: ia menenangkan yang membacanya sambil tak
// mengubah apa pun.
//
// Cacatnya hidup PERSIS di celah antara kedua penjaga — bentuk yang sama
// dengan `audit-daftar-berhalaman-jujur` vs `audit-baca-tak-terpotong`
// (CLAUDE.md §6), dan dengan `audit-mobile-tanpa-webview` vs
// `audit-sesi-webview-nyambung`: dua penjaga yang keduanya jujur, dan yang
// lolos justru di antara mereka.
//
// ── DUA bentuk yang dijaga
//
// (a) `.limit(N)` dengan N > 1.000 — batas yang tak pernah tercapai.
//
//     Diukur 2026-09-15: 27 situs. Terburuk `ahsp.ts:900` dan `gl.ts:606`,
//     keduanya 20.000. Dan yang pertama BUKAN teoretis:
//     `assembly_components` berisi 33.682 baris hari ini, jadi
//     `.limit(20000)` memulangkan 1.000 dan 32.682 baris tak pernah
//     terbaca — tanpa galat, tanpa penanda.
//
// (b) Idiom `.limit(X + 1)` untuk MENDETEKSI pemotongan.
//
//     Ini yang paling berbahaya dari keduanya, sebab ia tak sekadar diam:
//     ia AKTIF MENJANJIKAN bahwa pemotongan akan ketahuan.
//
//         const BATAS = 5000
//         … .limit(BATAS + 1)                  // minta satu lebih
//         const terpotong = semua.length > BATAS
//
//     `.limit(5001)` memulangkan 1.000. `1000 > 5000` bernilai false
//     SELAMANYA. Maka header `x-ekspor-terpotong` — yang dipasang justru
//     untuk memperingatkan hal ini — tak pernah menyala sekali pun, dan
//     keterangan "DIPOTONG" tak pernah tercetak.
//
//     Akibat terparahnya bukan baris yang hilang melainkan UANG: keempat
//     rute ekspor menjumlahkan totalTagih/totalBelum/total kasbon/total PO
//     dari himpunan yang sudah terpotong, lalu mencetaknya di keterangan
//     berkas sebagai jumlah lengkap. Angka yang terlalu KECIL terbaca
//     persis seperti kabar baik.
//
// ── Bukti pengukuran (PostgREST sungguhan, 2026-09-15)
//
//     notifications  11.863 baris → .limit(5001) memulangkan  1.000
//     audit_logs    102.363 baris → .limit(5001) memulangkan  1.000
//     .range(0, 4999)             → memulangkan  1.000
//     .range(1000, 1999)          → memulangkan  1.000 baris LAIN  ← jalan keluar
//
// ── Kenapa ratchet, bukan ambang NOL
//
// Ke-27 situs `.limit(N>1000)` tak bisa diperbaiki sekaligus tanpa membuat
// satu perubahan raksasa yang tak bisa ditinjau. Yang dijaga di sini adalah
// PERTUMBUHAN: yang ada boleh tinggal, yang baru ditolak.
//
// Bentuk (b) berambang NOL — keempatnya sudah diperbaiki, dan idiom yang
// terbukti tak pernah bisa bekerja tak punya alasan untuk kembali.
//
// ── Lantai menyimpan DAFTAR NAMA, bukan cuma angka
//
// CLAUDE.md §8a.2: "Periksa DUA hal per mutasi: penjaga MERAH _dan_
// menyebut namanya. Merah tanpa menyebut entri yang bermasalah memaksa
// orang berikutnya mencari sendiri." Dengan 27 situs di daftar, merah yang
// cuma berkata "28 > 27" akan memaksa penyisiran 27 baris untuk menemukan
// yang satu. Daftar nama membuat yang BARU bisa disebut langsung.
//
// Tak butuh basis — yang dibaca BENTUK DI KODE.
//
// ⚠ Batas yang jujur: penjaga ini tak tahu apakah tabel di balik sebuah
// `.limit()` benar-benar akan melewati 1.000 baris. Yang diketahuinya
// cuma bahwa ANGKANYA menjanjikan sesuatu yang PostgREST tak bisa penuhi.
// Untuk pertanyaan "sudah terpotong hari ini?", `audit-baca-tak-terpotong`
// yang mengukurnya — ia menghitung baris sungguhan di basis.
// ============================================================================

import { readFileSync, writeFileSync, existsSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const LANTAI_BERKAS = join(AKAR_API, 'scripts', 'batas-baca-lantai.json')

/** Batas keras PostgREST. Bukan setelan — ini kenyataan di sisi server. */
const BATAS_POSTGREST = 1000

const SEP = String.fromCharCode(92)

/*
  ── KOMENTAR DIBUANG LEBIH DULU, dan itu bukan kerapian ───────────────────

  Jalan PERTAMA penjaga ini melaporkan 6 pelanggaran idiom `.limit(X + 1)`
  dan KEENAMNYA adalah komentar — termasuk komentar di berkas ini sendiri
  yang menerangkan kenapa idiom itu buruk, dan komentar di keempat rute yang
  BARU SAJA diperbaiki (`Bentuk lamanya .limit(BATAS + 1) lalu …`).

  Nol pelanggaran nyata, enam merah. Persis bentuk yang diperingatkan
  CLAUDE.md §8a.2: "komentar yang menyebut hal terlarang untuk menjelaskan
  kenapa ia TIDAK dipakai — penjaga memindai teks, jadi tetap terhitung
  sebagai pemakaian."

  Akibatnya bukan sekadar berisik. Penjaga yang merah atas hal yang BENAR
  akan diabaikan seluruh keluarannya, lalu berhenti menjaga tanpa gejala —
  dan di sini ia akan membuat perbaikan yang benar MUSTAHIL didokumentasikan,
  sebab menjelaskan cacatnya memerahkan penjaganya.

  Yang dibuang: komentar blok, komentar baris, dan isi string/template —
  string karena pesan galat penjaga ini sendiri memuat teks idiomnya.
  Panjang baris DIPERTAHANKAN (diganti spasi) supaya nomor barisnya tetap
  menunjuk tempat yang benar di berkas aslinya.

  ⚠ DUA PASS, dan urutannya menentukan — versi pertama menggabungkannya
  dalam SATU mesin keadaan dan salah. Mesin itu memperlakukan petik sebagai
  pembuka string di mana pun ia berada, sehingga backtick di dalam KOMENTAR
  (`ekspor-tabel.ts:192` — prosa Indonesia yang mengutip nama format dengan
  backtick) membukanya, dan keadaan `petik` bertahan RATUSAN baris sampai
  backtick berikutnya. Seluruh komentar di antaranya lalu diproses sebagai
  isi string, bukan komentar — dan `.limit(BATAS + 1)` di baris 225 lolos.

  Gejalanya menipu ke arah yang salah: yang terlihat cuma SATU pelanggaran
  tersisa, terbaca seperti pembersih yang HAMPIR benar. Ia bukan hampir
  benar; ia kehilangan sinkronisasi 33 baris sebelumnya.

  Komentar dibuang LEBIH DULU, baru string. Sesudah komentar hilang, tiap
  petik yang tersisa memang milik kode.
*/
function buangKomentarSaja(isi) {
  const n = isi.length
  const keluar = new Array(n).fill('')
  let i = 0
  let mode = 'kode'   // kode | blok | baris

  while (i < n) {
    const c = isi[i]
    const d = isi[i + 1]

    if (mode === 'kode') {
      if (c === '/' && d === '*') { mode = 'blok'; keluar[i] = ' '; keluar[i + 1] = ' '; i += 2; continue }
      if (c === '/' && d === '/') { mode = 'baris'; keluar[i] = ' '; keluar[i + 1] = ' '; i += 2; continue }
      keluar[i] = c; i++; continue
    }

    if (mode === 'blok') {
      if (c === '*' && d === '/') { mode = 'kode'; keluar[i] = ' '; keluar[i + 1] = ' '; i += 2; continue }
      keluar[i] = c === '\n' ? '\n' : ' '; i++; continue
    }

    // mode === 'baris'
    if (c === '\n') { mode = 'kode'; keluar[i] = '\n'; i++; continue }
    keluar[i] = ' '; i++
  }

  return keluar.join('')
}

function buangString(isi) {
  const n = isi.length
  const keluar = new Array(n).fill('')
  let i = 0
  let petik = ''   // '' = di luar string

  while (i < n) {
    const c = isi[i]

    if (!petik) {
      if (c === '"' || c === "'" || c === '`') { petik = c; keluar[i] = ' '; i++; continue }
      keluar[i] = c; i++; continue
    }

    if (c === SEP) { keluar[i] = ' '; if (i + 1 < n) keluar[i + 1] = ' '; i += 2; continue }
    if (c === petik) { petik = ''; keluar[i] = ' '; i++; continue }
    keluar[i] = c === '\n' ? '\n' : ' '
    i++
  }

  return keluar.join('')
}

function buangKomentar(isi) {
  return buangString(buangKomentarSaja(isi))
}

const berkas = globSync('src/**/*.ts', { cwd: AKAR_API })
  .filter((f) => !f.includes('__tests__') && !f.includes('test-utils'))
  .map((f) => f.split(SEP).join('/'))
  .sort()

/** (a) `.limit(N)` dengan N literal > 1.000 */
const berlebih = []
/** (b) idiom `.limit(X + 1)` — deteksi pemotongan yang tak bisa bekerja */
const idiomPlus1 = []

for (const rel of berkas) {
  const mentah = readFileSync(join(AKAR_API, rel), 'utf8')
  // CR dibuang lebih dulu — CLAUDE.md §7a: perbandingan baris yang diam-diam
  // membawa CR memulangkan nol, dan nol terbaca seperti "tidak ada".
  const baris = buangKomentar(mentah).split('\n').map((b) => b.replace(/\r/g, ''))
  // Baris ASLI disimpan terpisah: yang DIPINDAI kode tanpa komentar, yang
  // DITAMPILKAN teks aslinya — pelanggaran yang dilaporkan sebagai deretan
  // spasi tak bisa ditindaklanjuti siapa pun.
  const barisAsli = mentah.split('\n').map((b) => b.replace(/\r/g, ''))

  baris.forEach((b, i) => {
    // (b) diperiksa LEBIH DULU: `.limit(BATAS + 1)` juga cocok dengan pola
    // literal bila X kebetulan angka, dan yang lebih spesifik harus menang.
    const p1 = b.match(/\.limit\(\s*([A-Za-z_$][\w$]*|\d+)\s*\+\s*1\s*\)/)
    if (p1) {
      idiomPlus1.push({ rel, baris: i + 1, ident: p1[1], teks: (barisAsli[i] ?? b).trim() })
      return
    }

    const re = /\.limit\(\s*(\d+)\s*\)/g
    let m
    while ((m = re.exec(b))) {
      const n = Number(m[1])
      if (n > BATAS_POSTGREST) {
        berlebih.push({ rel, baris: i + 1, n, kunci: rel + ':' + (i + 1) })
      }
    }
  })
}

berlebih.sort((a, b) => b.n - a.n || a.kunci.localeCompare(b.kunci))

console.log('── Batas baca waras ──────────────────────────────────────────')
console.log(`  batas keras PostgREST : ${BATAS_POSTGREST}`)
console.log(`  .limit(N > ${BATAS_POSTGREST})       : ${berlebih.length} situs`)
console.log(`  idiom .limit(X + 1)   : ${idiomPlus1.length} situs (ambang NOL)`)

/* ── (b) ambang NOL ─────────────────────────────────────────────────────── */
if (idiomPlus1.length > 0) {
  console.error('')
  console.error(`❌ Idiom ".limit(X + 1)" untuk mendeteksi pemotongan: ${idiomPlus1.length} situs.`)
  console.error('')
  for (const t of idiomPlus1) {
    console.error(`   ${t.rel}:${t.baris}`)
    console.error(`      ${t.teks}`)
  }
  console.error('')
  console.error('   Idiom ini TIDAK BISA bekerja. PostgREST memotong di')
  console.error(`   ${BATAS_POSTGREST} baris KERAS, jadi .limit(X + 1) memulangkan`)
  console.error(`   ${BATAS_POSTGREST} dan syarat "length > X" bernilai false SELAMANYA.`)
  console.error('')
  console.error('   Yang hilang bukan cuma barisnya: total uang dijumlahkan dari')
  console.error('   himpunan terpotong lalu dicetak sebagai jumlah lengkap, dan')
  console.error('   angka yang terlalu KECIL terbaca seperti kabar baik.')
  console.error('')
  console.error('   Perbaikannya: `ambilSeluruhnya()` dari `lib/ekspor-tabel.ts`,')
  console.error('   yang mengambil bertahap per 1.000 lewat `.range()` sampai habis.')
  console.error('')
  process.exit(1)
}

/* ── (a) ratchet berdaftar-nama ─────────────────────────────────────────── */
const simpanan = existsSync(LANTAI_BERKAS)
  ? JSON.parse(readFileSync(LANTAI_BERKAS, 'utf8'))
  : null
const lantai = simpanan?.situs ?? null
const lantaiDaftar = simpanan?.daftar ?? []

if (process.argv.includes('--turunkan')) {
  writeFileSync(
    LANTAI_BERKAS,
    JSON.stringify(
      { situs: berlebih.length, daftar: berlebih.map((t) => t.kunci).sort() },
      null,
      2,
    ) + '\n',
  )
  console.log(`\n✅ lantai batas-baca disetel ke ${berlebih.length}`)
  process.exit(0)
}

if (lantai == null) {
  console.error(`\n❌ ${LANTAI_BERKAS} belum ada. Tetapkan lantai:`)
  console.error('   node scripts/audit-batas-baca-waras.mjs --turunkan\n')
  process.exit(1)
}

console.log(`  lantai                : ${lantai}`)

if (berlebih.length > lantai) {
  const baru = berlebih.filter((t) => !lantaiDaftar.includes(t.kunci))

  console.error('')
  console.error(`❌ BERTAMBAH: ${berlebih.length} situs .limit(N > ${BATAS_POSTGREST}) (lantai ${lantai}).`)
  console.error('')
  if (baru.length > 0) {
    console.error('  YANG BARU — ini yang menaikkan angkanya:')
    for (const t of baru) console.error(`     ❌ ${t.rel}:${t.baris}  .limit(${t.n})`)
    console.error('')
  } else {
    /*
      Angka naik tanpa nama baru berarti daftar lantai sudah basi — baris
      bergeser karena suntingan di atasnya, atau berkas di-rename. Dikatakan
      apa adanya: selisih yang tak bisa dijelaskan adalah temuan yang belum
      dibuka, dan menutupnya dengan tebakan lebih mahal (CLAUDE.md §8a.2).
    */
    console.error('  ⚠ Angka naik tetapi tak ada situs BARU dibanding daftar lantai —')
    console.error('    kemungkinan baris bergeser atau berkas di-rename. Daftar')
    console.error('    lantai perlu disetel ulang SESUDAH diperiksa, bukan sebelum.')
    console.error('')
  }
  console.error('  Sepuluh terbesar yang terhitung:')
  for (const t of berlebih.slice(0, 10)) {
    console.error(`     ${String(t.n).padStart(6)}  ${t.rel}:${t.baris}`)
  }
  console.error('')
  console.error(`  .limit(N) dengan N > ${BATAS_POSTGREST} adalah batas yang TIDAK BISA tercapai:`)
  console.error(`  PostgREST memulangkan maksimal ${BATAS_POSTGREST} baris, tanpa galat dan`)
  console.error('  tanpa penanda. Angkanya menenangkan yang membacanya sambil tak')
  console.error('  mengubah apa pun.')
  console.error('')
  console.error('  Ambil bertahap lewat `.range(dari, dari+999)` sampai satu halaman')
  console.error('  memulangkan kurang dari ukuran halaman. Contoh yang benar:')
  console.error('  `lib/ekspor-tabel.ts` (ambilSeluruhnya) dan `utils/role-guard.ts`.')
  console.error('')
  process.exit(1)
}

if (berlebih.length < lantai) {
  console.log('')
  console.log(`📉 Turun ${lantai - berlebih.length} dari lantai — kencangkan:`)
  console.log('   node scripts/audit-batas-baca-waras.mjs --turunkan')
}

console.log('')
console.log(`✅ ${berlebih.length} situs .limit(N > ${BATAS_POSTGREST}) (lantai ${lantai}) — tidak bertambah.`)
console.log('✅ 0 idiom .limit(X + 1) — deteksi pemotongan yang tak bisa bekerja.')
