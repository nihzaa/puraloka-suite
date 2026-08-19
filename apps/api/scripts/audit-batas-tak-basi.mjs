#!/usr/bin/env node
// ============================================================================
// PENJAGA — catatan "BELUM diperiksa" tak boleh menyebut yang SUDAH ADA.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Tiap modul struktur membawa catatan jujur tentang batasnya:
//
//     'Yang BELUM diperiksa: tekanan tanah saat GEMPA (Mononobe-Okabe), …'
//
// Kejujuran itu berharga, dan justru karena itu ia berbahaya saat BASI.
// Diukur 2026-08-20: dua catatan menyebut hal yang sudah dibangun berjam-jam
// sebelumnya —
//
//   `struktur-dinding.ts`         "BELUM diperiksa: … (Mononobe-Okabe)"
//                                 padahal `analisaGempaDinding` ada dan
//                                 tersambung ke modul itu SENDIRI
//   `struktur-pondasi-dangkal.ts` "Penurunan BELUM diperiksa"
//                                 padahal `struktur-penurunan.ts` ada
//
// Akibatnya bukan sekadar berantakan. Catatan itu tampil DI LAYAR, dan
// pembacanya — yang justru memakai lapisan awam karena tak paham teknik —
// akan menyimpulkan bahwa pemeriksaan itu tak ada. Ia lalu mencari konsultan
// lain untuk hal yang sudah dihitung aplikasi ini.
//
// Ini persis racun konteks yang dilarang CLAUDE.md pembuka: fakta yang bisa
// basi, ditulis sebagai fakta. Bedanya, yang ini basi DI DALAM KODE dan
// tampil ke pengguna.
//
// ── Cara memeriksanya
//
// Tiap frasa kunci di bawah dipetakan ke bukti keberadaannya (nama fungsi
// yang diekspor). Kalau frasanya muncul di dalam catatan "BELUM diperiksa"
// SEMENTARA fungsinya ada, itu catatan basi.
//
// Daftarnya sengaja PENDEK dan eksplisit: penjaga yang menebak-nebak dari
// kata kunci akan menuduh hal yang benar, dan penjaga yang menuduh hal yang
// benar akan dimatikan orang.
//
// Ambang NOL. Tiap pelanggaran adalah kalimat di layar yang menyangkal
// kemampuan yang sudah dibayar dan sudah diuji.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const LIB = join(process.cwd(), 'src', 'lib')

/**
 * frasa yang muncul di catatan  →  bukti bahwa ia SUDAH ADA
 *
 * `fungsi` dicari sebagai `export function <nama>` di seluruh src/lib.
 */
/*
  ══════════════════════════════════════════════════════════════════════════════
  Frasanya DIPERSEMPIT sesudah tiga tuduhan palsu pada percobaan pertama.

  Versi pertama mencocokkan kata kunci telanjang (`/P-?Delta/`,
  `/ketahanan api/`), dan langsung menuduh tiga catatan yang BENAR:

    struktur-baja-gording  "Efek orde-kedua (P-Delta) belum dihitung eksplisit"
                           → benar: itu P-δ pada BATANG, ruang lingkup yang
                             berbeda dari `analisaPDelta` yang bekerja per
                             TINGKAT
    struktur-api           "ketahanan api SAMBUNGAN DAN TUMPUAN"
                           → benar: modulnya memeriksa balok/kolom/pelat,
                             bukan sambungan
    struktur-komposit      kata "ketahanan api" ada di komentar KEPALA berkas,
                           bukan di catatannya sama sekali

  Semuanya batas yang jujur dan masih berlaku. Penjaga yang menuduh hal yang
  benar akan dimatikan orang — dan yang dimatikan tak lagi menjaga yang
  sungguhan. Ini KETIGA kalinya pola itu muncul di sesi ini.

  Sekarang frasanya menuntut bentuk kalimat yang benar-benar menyangkal
  keberadaan pemeriksaannya, bukan sekadar menyebut namanya.
  ══════════════════════════════════════════════════════════════════════════════
*/
const KLAIM = [
  {
    frasa: /BELUM diperiksa[^.]*Mononobe-?Okabe/i,
    fungsi: 'analisaGempaDinding',
  },
  {
    /* "P-Delta belum ada" pada tingkat BANGUNAN — bukan P-δ batang. */
    frasa: /BELUM diperiksa[^.]*\bP-?Delta\b(?![^.]*batang)/i,
    fungsi: 'analisaPDelta',
  },
  {
    frasa: /BELUM diperiksa[^.]*Hankinson/i,
    fungsi: 'analisaSambunganKayu',
  },
  {
    /* Ketahanan api ELEMEN — bukan sambungan/tumpuan, yang memang belum. */
    frasa: /BELUM diperiksa[^.]*ketahanan api(?![^.]*(sambungan|tumpuan))/i,
    fungsi: 'analisaKetahananApi',
  },
  {
    frasa: /[Pp]enurunan \(settlement\) BELUM diperiksa\./,
    fungsi: 'analisaPenurunan',
  },
  /*
    ══════════════════════════════════════════════════════════════════════════
    Dua klaim ini DITAMBAHKAN 2026-08-20 sesudah penjaga ini MELEWATKAN
    keduanya.

    `struktur-atap-ringan` masih menulis "BELUM diperiksa: SAMBUNGAN (paku,
    baut, pelat gigi)" dan "BELUM diperiksa: SAMBUNGAN sekrup" — padahal
    `analisaSambunganKayu` dan `analisaSekrupBajaRingan` sudah ada sejak hari
    yang sama.

    Penjaganya tak menangkapnya karena daftar klaimnya hanya memuat lima
    frasa yang saya ingat saat menulisnya. Itu batas yang jujur dari
    pendekatan "daftar eksplisit": ia hanya menjaga yang didaftarkan.

    Pelajarannya bukan "ganti dengan tebakan otomatis" — versi yang menebak
    dari kata kunci sudah terbukti menuduh tiga hal yang benar. Yang benar:
    daftar ini WAJIB ditambah tiap kali batas baru ditutup, dan komentar ini
    yang mengingatkannya.
    ══════════════════════════════════════════════════════════════════════════
  */
  {
    frasa: /BELUM diperiksa:\s*SAMBUNGAN \(paku/i,
    fungsi: 'analisaSambunganKayu',
  },
  {
    frasa: /BELUM diperiksa:\s*SAMBUNGAN sekrup/i,
    fungsi: 'analisaSekrupBajaRingan',
  },
]

const berkas = readdirSync(LIB).filter((f) => f.endsWith('.ts'))

/* Fungsi apa saja yang BENAR-BENAR diekspor. */
const fungsiAda = new Set()
for (const f of berkas) {
  const isi = readFileSync(join(LIB, f), 'utf8')
  for (const m of isi.matchAll(/export function (\w+)/g)) fungsiAda.add(m[1])
}

const masalah = []

for (const f of berkas) {
  const isi = readFileSync(join(LIB, f), 'utf8')

  /*
    Ambil tiap blok `catatan.push( … )` yang memuat "BELUM diperiksa".
    Dicari sebagai teks di dalam push, bukan di seluruh berkas — komentar
    yang MENJELASKAN sejarah batas justru harus boleh menyebutnya.
  */
  for (const m of isi.matchAll(/catatan\.push\(([\s\S]*?)\n\s*\)/g)) {
    const blok = m[1]
    if (!/BELUM diperiksa|BELUM dihitung/i.test(blok)) continue

    for (const { frasa, fungsi } of KLAIM) {
      if (!frasa.test(blok)) continue
      if (!fungsiAda.has(fungsi)) continue      // memang belum ada — sah
      masalah.push({
        berkas: `src/lib/${f}`,
        fungsi,
        kutipan: blok.replace(/\s+/g, ' ').trim().slice(0, 120),
      })
    }
  }
}

console.log('══ Catatan "BELUM diperiksa" tak boleh menyebut yang SUDAH ADA ══')
console.log(`  berkas modul diperiksa : ${berkas.length}`)
console.log(`  klaim yang dipetakan   : ${KLAIM.length}`)
console.log(`  catatan BASI           : ${masalah.length}`)
console.log('  ambang                 : 0 (bukan ratchet)')

if (masalah.length) {
  console.log('')
  console.error('❌ Catatan ini menyangkal kemampuan yang SUDAH ADA:')
  console.error('')
  for (const p of masalah) {
    console.error(`     ${p.berkas}`)
    console.error(`       menyebut BELUM diperiksa, padahal ${p.fungsi}() ada`)
    console.error(`       "${p.kutipan}…"`)
    console.error('')
  }
  console.error('   Catatan ini TAMPIL DI LAYAR. Pembacanya — yang justru memakai')
  console.error('   lapisan awam karena tak paham teknik — akan menyimpulkan bahwa')
  console.error('   pemeriksaannya tak ada, lalu mencari konsultan lain untuk hal')
  console.error('   yang sudah dihitung aplikasi ini.')
  console.error('')
  console.error('   Perbaikan: hapus frasa itu dari catatannya, atau nyatakan')
  console.error('   dengan tepat BAGIAN MANA yang belum tersambung.')
  process.exit(1)
}

console.log('')
console.log('✅ Tak ada catatan batas yang menyangkal kemampuan yang sudah ada')
