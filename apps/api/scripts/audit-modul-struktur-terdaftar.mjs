#!/usr/bin/env node
// ============================================================================
// Tiap modul analisa struktur WAJIB terdaftar di penjaga terjemahan awam.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// `struktur-awam.test.ts` menuntut tiap pemeriksaan punya terjemahan
// non-teknis. Ia bekerja dengan MENJALANKAN modul analisa, mengumpulkan nama
// pemeriksaan yang nyata muncul, lalu mencocokkannya ke kamus.
//
// Kelemahannya: ia hanya menjalankan modul yang DIDAFTARKAN di dalamnya.
// Modul baru yang lupa ditambahkan lolos tanpa gejala — dan itu sudah terjadi
// DUA KALI dalam satu hari:
//
//   1. `struktur-baja` ditambahkan → 3 pemeriksaan tanpa terjemahan
//   2. `struktur-baja` (kolom) + `struktur-baja-sambungan` → 7 lagi
//
// Keduanya ketahuan dari audit MANUAL yang kebetulan saya jalankan. Kalau
// tidak, istilah teknik bocor ke layar orang awam tanpa satu pun test merah —
// dan verdict merah yang tak dipahami akan dilewati.
//
// Penjaga ini menutup celahnya dengan MEMINDAI berkas: tiap `struktur-*.ts`
// yang mengekspor fungsi `analisa*` wajib disebut di berkas test itu.
//
// ── Kenapa skrip, bukan test
//
// Test tak bisa memindai daftar berkas dengan andal tanpa I/O, dan modul pure
// di repo ini sengaja tak ber-I/O. Pemindaian berkas adalah pekerjaan penjaga
// CI, dan di sanalah ia diletakkan.
// ============================================================================

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR_LIB = join(process.cwd(), 'src', 'lib')
const BERKAS_PENJAGA = join(DIR_LIB, '__tests__', 'struktur-awam.test.ts')

/*
  Modul yang SENGAJA tak punya fungsi analisa ber-`periksa`.

  Didaftarkan dengan alasannya masing-masing supaya pengecualian tak jadi
  tempat sampah: yang masuk ke sini harus bisa dijelaskan.
*/
const DIKECUALIKAN = {
  'struktur-awam': 'berkas terjemahannya sendiri',
  'struktur-gambar': 'penggambar SVG, tak menghasilkan verdict',
  'struktur-bbs': 'bar bending schedule — kuantitas, bukan pemeriksaan',
  'struktur-tabel-plat': 'tabel koefisien PBI, data murni',
  'struktur-diagram-pm': 'kurva interaksi; verdict-nya lewat struktur-kolom-lengkap',
  'struktur-baja-sambungan': null,   // TIDAK dikecualikan — lihat di bawah
}

let gagal = 0
const berkas = readdirSync(DIR_LIB)
  .filter((f) => f.startsWith('struktur-') && f.endsWith('.ts'))
  .map((f) => f.replace(/\.ts$/, ''))

let isiPenjaga
try {
  isiPenjaga = readFileSync(BERKAS_PENJAGA, 'utf8')
} catch {
  console.error(`❌ Berkas penjaga tak ditemukan: ${BERKAS_PENJAGA}`)
  process.exit(1)
}

const tanpaDaftar = []
const tanpaAnalisa = []

for (const modul of berkas) {
  const alasan = DIKECUALIKAN[modul]
  if (alasan) continue

  const isi = readFileSync(join(DIR_LIB, `${modul}.ts`), 'utf8')

  /*
    Modul dianggap menghasilkan verdict bila ia mengekspor `analisa*` DAN
    menyusun larik bernama `periksa`.

    ⚠ Deteksi `periksa` SENGAJA longgar.

    Versi pertama mencari `Periksa[]` — dan MELEWATKAN `struktur-tiang`, yang
    menulis tipenya inline (`periksa: { nama: string; ... }[]`) alih-alih
    memakai tipe bersama. Penjaga tetap hijau meski tiang tak terdaftar, yaitu
    kegagalan yang persis sama dengan yang penjaga ini ada untuk mencegah.

    Sekarang yang dicari cuma DEKLARASI larik bernama `periksa` dalam bentuk
    apa pun. Longgar ke arah yang aman: modul yang salah dianggap ber-verdict
    akan menuntut pendaftaran (paling buruk: satu impor tak terpakai), bukan
    lolos diam-diam.
  */
  const punyaAnalisa = /export function analisa/.test(isi)
  const punyaPeriksa = /const periksa/.test(isi) || /periksa.push\(/.test(isi)

  if (!punyaAnalisa || !punyaPeriksa) {
    tanpaAnalisa.push(modul)
    continue
  }

  // Terdaftar bila namanya disebut di impor berkas penjaga.
  if (!isiPenjaga.includes(`'../${modul}'`)) {
    tanpaDaftar.push(modul)
    gagal++
  }
}

console.log('══ Modul struktur terdaftar di penjaga terjemahan awam ══════')
console.log(`  modul struktur      : ${berkas.length}`)
console.log(`  dikecualikan        : ${Object.values(DIKECUALIKAN).filter(Boolean).length}`)
console.log(`  tanpa fungsi analisa: ${tanpaAnalisa.length}${tanpaAnalisa.length ? ` (${tanpaAnalisa.join(', ')})` : ''}`)
console.log(`  belum terdaftar     : ${tanpaDaftar.length}`)
console.log(`  ambang              : 0 (bukan ratchet)`)

if (gagal > 0) {
  console.log('')
  console.error(`❌ ${gagal} modul analisa BELUM terdaftar di penjaga terjemahan awam:`)
  for (const m of tanpaDaftar) console.error(`     ${m}`)
  console.error('')
  console.error('   Akibatnya: pemeriksaan dari modul itu bisa muncul di layar')
  console.error('   TANPA terjemahan non-teknis, dan tak ada test yang merah.')
  console.error('   Verdict merah yang tak dipahami akan dilewati — itulah yang')
  console.error('   membuat kelalaian ini mahal, bukan kerapiannya.')
  console.error('')
  console.error(`   Perbaikan: impor modulnya di ${BERKAS_PENJAGA}`)
  console.error('   dan panggil fungsi analisanya di `semuaNamaPemeriksaan()`.')
  process.exit(1)
}

console.log('')
console.log('✅ semua modul analisa struktur terdaftar')
