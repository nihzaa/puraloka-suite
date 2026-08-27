#!/usr/bin/env node
// ============================================================================
// BARIS BESI memuat DUA hal berbeda — pembacanya wajib membedakannya.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// `VolumeElemen.besi` menampung dua jenis barang yang sama sekali berbeda:
//
//     tulangan beton   BjTP / BjTS · berdiameter · dijual per lonjor
//     profil baja      WF / H / CNP / INP · berdesignation · per batang
//
// Keduanya berbagi bentuk `BarisBesi` karena keduanya "besi yang ditimbang
// kilogram", dan itu keputusan yang benar untuk perhitungan berat. Yang
// membedakannya cuma satu hal: `peran` diawali `'profil '`.
//
// Awalan itu adalah KONTRAK TERSIRAT, dan tak ada apa pun yang memaksanya.
//
// ── Cacat yang melahirkannya
//
// Ditemukan 2026-08-19 dengan MEMOTRET layar analisa struktur. Tabel
// "Kebutuhan besi per diameter" menampilkan:
//
//     Ulir (BjTS)  ·  D200  ·  profil WF 200x100x5.5x8
//
// Besi ulir D200 tidak ada di pasar. Yang tertulis "D200" itu TINGGI profil,
// bukan diameter — dan estimator yang membaca tabel ini memesan barang yang
// tak bisa dibeli.
//
// 597 test struktur hijau sepanjang waktu: tak satu pun memeriksa bagaimana
// barisnya DITAMPILKAN, hanya bagaimana ia dihitung.
//
// ── Yang dijaga
//
// 1. Awalan `'profil '` dipakai KONSISTEN — modul yang membuat baris profil
//    memakai awalan yang sama dengan modul yang membacanya.
// 2. Tiap PEMBACA baris besi yang menampilkannya ke layar wajib membedakan
//    keduanya. Pembaca yang tidak, menampilkan profil baja sebagai tulangan.
//
// Ambang NOL. Ini bukan utang teknis: tiap pelanggaran adalah baris pesanan
// yang tak bisa dipenuhi supplier.
// ============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = process.cwd()
const WEB = join(AKAR, '..', 'web')

/** Awalan kanonik. Diubah = ubah juga seluruh pembacanya. */
const AWALAN = 'profil '

/** Modul yang MEMBUAT baris besi berjenis profil. */
const PENULIS = [
  'src/lib/struktur-baja.ts',
  'src/lib/struktur-baja-gording.ts',
  'src/lib/struktur-baja-rangka.ts',
]

/** Berkas yang MENAMPILKAN baris besi ke layar. */
const PEMBACA = [
  join(WEB, 'app', '(dashboard)', 'estimasi', 'struktur', 'page.tsx'),
]

const masalah = []

// ── 1. Penulis memakai awalan yang sama ─────────────────────────────────────
for (const rel of PENULIS) {
  const f = join(AKAR, rel)
  if (!existsSync(f)) continue
  const isi = readFileSync(f, 'utf8')
  /*
    Dicari baris yang mengisi `peran:` dengan teks yang menyebut profil.
    Modul yang menulis `peran: \`WF ${…}\`` (tanpa awalan) lolos typecheck —
    `peran` bertipe `string` — dan barisnya jadi tak terkenali pembacanya.
  */
  const peranProfil = [...isi.matchAll(/peran:\s*[`'"]([^`'"]*)/g)]
    .map((m) => m[1])
    .filter((v) => /profil|WF|profile_type|designation/i.test(v))
  for (const v of peranProfil) {
    if (!v.startsWith(AWALAN)) {
      masalah.push({
        jenis: 'penulis', berkas: rel,
        pesan: `peran profil ditulis "${v}…" — wajib diawali "${AWALAN}"`,
      })
    }
  }
}

// ── 2. Pembaca membedakan profil dari tulangan ──────────────────────────────
for (const f of PEMBACA) {
  if (!existsSync(f)) {
    masalah.push({ jenis: 'pembaca', berkas: f, pesan: 'berkas pembaca tak ditemukan — daftar PEMBACA di penjaga ini basi' })
    continue
  }
  const isi = readFileSync(f, 'utf8')

  /*
    Pembaca dikenali dari adanya render tabel besi: kolom yang memformat
    diameter dengan awalan D/Ø. Kalau ada, ia WAJIB juga memuat pembeda profil
    — kalau tidak, ia menampilkan profil baja sebagai tulangan ulir.
  */
  const menampilkanDiameter = /["'`]D["'`]\s*:\s*["'`]Ø["'`]|\? "D" : "Ø"|\? 'D' : 'Ø'/.test(isi)
  const membedakanProfil = new RegExp(`startsWith\\(["'\`]${AWALAN}`).test(isi)

  if (menampilkanDiameter && !membedakanProfil) {
    masalah.push({
      jenis: 'pembaca', berkas: f.replace(AKAR, '.'),
      pesan: 'menampilkan diameter D/Ø tetapi TIDAK membedakan baris profil — '
        + 'WF 200×100 akan muncul sebagai "Ulir (BjTS) D200"',
    })
  }
}

console.log('══ Baris besi: tulangan vs profil dibedakan ════════════════')
console.log(`  penulis diperiksa : ${PENULIS.length}`)
console.log(`  pembaca diperiksa : ${PEMBACA.length}`)
console.log(`  pelanggaran       : ${masalah.length}`)
console.log('  ambang            : 0 (bukan ratchet)')

if (masalah.length) {
  console.log('')
  console.error('❌ Baris profil baja tak dibedakan dari tulangan beton:')
  console.error('')
  for (const m of masalah) {
    console.error(`     [${m.jenis}] ${m.berkas}`)
    console.error(`       ${m.pesan}`)
    console.error('')
  }
  console.error('   Akibatnya bukan kosmetik: tabel menampilkan "Ulir (BjTS)')
  console.error('   D200" untuk profil WF 200×100, dan besi ulir D200 tidak')
  console.error('   ada di pasar. Estimator memesan barang yang tak bisa')
  console.error('   dipenuhi supplier.')
  process.exit(1)
}

console.log('')
console.log('✅ Profil baja dibedakan dari tulangan di penulis maupun pembaca')
