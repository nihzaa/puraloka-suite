#!/usr/bin/env node
// ============================================================================
// PENJAGA — medan `jumlah` milik RUTE, bukan milik modul.
// ============================================================================
//
// ── Cacat yang melahirkannya
//
// Rute `struktur.ts` menyusun input tiap modul begini:
//
//     const dgnJumlah = { ...input, jumlah }
//
// `jumlah` di sana berarti BERAPA BANYAK ELEMEN INI ADA — 12 kolom yang sama,
// 40 m sloof yang sama — dan dipakai sebagai pengali volume. Ia ditimpakan DI
// ATAS input pengguna, jadi apa pun yang pengguna tulis di medan bernama
// `jumlah` akan HILANG.
//
// Modul sambungan kayu ditulis 2026-08-19 dengan medan `jumlah` yang berarti
// JUMLAH ALAT SAMBUNG. Akibatnya:
//
//   pengguna menulis  14 paku
//   rute mengirim      1 (jumlah elemen)
//   hasil             kapasitas seperdelapan belas, verdict MERAH palsu
//
// Dan sebaliknya, kalau elemennya dibuat berjumlah 20, sambungan berpaku 4
// akan dihitung berpaku 20 — verdict HIJAU palsu pada sambungan yang kurang.
//
// Yang membuatnya berbahaya: TIDAK ADA GALAT. Bentuknya sah, tipenya cocok,
// angkanya masuk akal. Ditemukan hanya karena satu jalan lewat rute hidup
// memberi 117% sementara pemanggilan langsung fungsinya memberi 29% —
// dua angka dari fungsi yang SAMA.
//
// ── Yang dijaga
//
// Tak satu pun modul analisa boleh memakai `jumlah` sebagai medan input yang
// artinya BUKAN "banyaknya elemen". Modul yang butuh mencacah sesuatu yang
// lain wajib memberinya nama sendiri: `jumlahAlat`, `jumlahSekrup`,
// `nTarik`, `jumlahTiang`, dan seterusnya.
//
// Ambang NOL. Tiap pelanggaran adalah verdict struktur yang salah tanpa
// gejala — dan verdict struktur yang salah adalah bangunan.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = process.cwd()
const LIB = join(AKAR, 'src', 'lib')
const RUTE = join(AKAR, 'src', 'routes', 'v1', 'struktur.ts')

/* Dibaca dari rutenya, bukan ditulis ulang — kalau rute berhenti menimpa
   `jumlah`, penjaga ini harus ikut berubah, bukan bertahan sendiri. */
const isiRute = readFileSync(RUTE, 'utf8')
const menimpa = /\{\s*\.\.\.input,\s*jumlah\s*\}/.test(isiRute)

if (!menimpa) {
  console.log('══ Medan `jumlah` — rute tak lagi menimpanya ══════════════')
  console.log('')
  console.log('   Rute tidak lagi menyusun `{ ...input, jumlah }`.')
  console.log('   Penjaga ini menjaga akibat dari pola itu; kalau polanya')
  console.log('   hilang, PERIKSA apakah penjaga ini masih perlu — jangan')
  console.log('   dibiarkan hijau selamanya tanpa menjaga apa pun.')
  process.exit(0)
}

/* Modul mana yang dipanggil rute — hanya itu yang terkena `dgnJumlah`. */
const modulTerpakai = new Set()
for (const m of isiRute.matchAll(/from '\.\.\/\.\.\/lib\/([\w-]+)\.js'/g)) {
  modulTerpakai.add(m[1])
}

const pelanggaran = []

for (const berkas of readdirSync(LIB)) {
  if (!berkas.endsWith('.ts')) continue
  const nama = berkas.replace(/\.ts$/, '')
  if (!modulTerpakai.has(nama)) continue

  const isi = readFileSync(join(LIB, berkas), 'utf8')

  /*
    Medan `jumlah` di dalam antarmuka INPUT — bukan di hasil, bukan di
    variabel lokal. Dicari per-antarmuka supaya `jumlah` pada tipe hasil
    (yang tak pernah ditimpa rute) tidak dituduh.
  */
  for (const m of isi.matchAll(/export interface (Input\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, namaAntarmuka, badan] = m
    const baris = badan.split('\n').find((l) => /^\s*jumlah\??\s*:/.test(l))
    if (!baris) continue

    /*
      `jumlah` yang artinya BANYAKNYA ELEMEN boleh — itu justru yang
      ditimpakan rute, dan modul memang perlu membacanya sebagai pengali
      volume.

      Dikenalinya dari OPSIONALITAS, bukan dari komentar. Alasannya diukur,
      bukan ditebak: medan pengali selalu `jumlah?: number` dengan
      `?? 1` di pemakaiannya — rute selalu mengirimnya, jadi modul tak
      pernah mewajibkannya. Medan yang mencacah sesuatu yang LAIN (baut,
      angkur, paku) selalu WAJIB, karena tanpanya modul tak bisa menghitung
      apa pun.

      Versi pertama penjaga ini mencari komentar dan `const jumlah = …` di
      SELURUH berkas, dan karena itu menuduh `InputBasePlate` — yang benar —
      sekaligus melewatkan yang salah di berkas yang sama.
    */
    const opsional = /^\s*jumlah\?\s*:/.test(baris)

    /*
      Dipakai sebagai pengali — LANGSUNG (`input.jumlah ?? 1`) atau
      DITERUSKAN utuh ke modul lain (`jumlah: input.jumlah`).

      Bentuk kedua nyata: `struktur-sloof.ts` meneruskannya ke
      `analisaBalok`, yang melakukan `?? 1`-nya. Penjaga yang hanya mengenali
      bentuk pertama menuduh sloof — dan penjaga yang menuduh hal yang benar
      akan dimatikan orang.
    */
    const dipakaiSebagaiPengali =
      /input\.jumlah\s*\?\?\s*1/.test(isi)
      || /\bjumlah:\s*input\.jumlah\b/.test(isi)

    if (opsional && dipakaiSebagaiPengali) continue

    pelanggaran.push({
      berkas: `src/lib/${berkas}`,
      antarmuka: namaAntarmuka,
      baris: baris.trim(),
    })
  }
}

console.log('══ Medan `jumlah` tak boleh bentrok dengan pengali elemen ══')
console.log(`  modul analisa dipakai rute : ${modulTerpakai.size}`)
console.log(`  pelanggaran                : ${pelanggaran.length}`)
console.log('  ambang                     : 0 (bukan ratchet)')

if (pelanggaran.length) {
  console.log('')
  console.error('❌ Medan `jumlah` dipakai untuk hal SELAIN banyaknya elemen:')
  console.error('')
  for (const p of pelanggaran) {
    console.error(`     ${p.berkas} — ${p.antarmuka}`)
    console.error(`       ${p.baris}`)
    console.error('')
  }
  console.error('   Rute menyusun `{ ...input, jumlah }`, jadi nilai pengguna di')
  console.error('   medan itu DITIMPA oleh banyaknya elemen — tanpa satu pun galat,')
  console.error('   dan verdict strukturnya berubah.')
  console.error('')
  console.error('   Perbaikan: beri nama sendiri — `jumlahAlat`, `jumlahSekrup`,')
  console.error('   `jumlahTiang`, dan seterusnya.')
  process.exit(1)
}

console.log('')
console.log('✅ Tak ada modul yang memakai `jumlah` untuk arti selain banyaknya elemen')
