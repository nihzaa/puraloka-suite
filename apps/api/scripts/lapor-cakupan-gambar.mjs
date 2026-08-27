#!/usr/bin/env node
// ============================================================================
// LAPORAN — jenis mana yang punya GAMBAR KERJA, dan mana yang cuma meteran.
// ============================================================================
//
// Ini LAPORAN, bukan penjaga: tak pernah exit 1. Jenis yang belum punya gambar
// adalah urutan kerja, bukan cacat.
//
// ⚠⚠ LAPORAN INI PERKIRAAN, BUKAN BUKTI. Baca peringatan di bawah. ⚠⚠
//
// ── Kenapa perlu diukur, bukan diingat
//
// `gambarUntuk()` memutuskan lewat rantai `if (el.jenis === …)`, dan jenis yang
// tak disebut satu pun cabangnya HANYA mendapat meteran kekuatan — batang
// persen yang menjawab "seberapa terpakai", tanpa memperlihatkan bendanya.
//
// Diamnya tak bisa dibedakan dari "elemen ini memang tak punya penampang".
// Karena itu daftar ini dibaca dari KODE, bukan ditulis tangan.
//
// ══════════════════════════════════════════════════════════════════════════
// ── DAN JUSTRU ITULAH BATASNYA. Ia salah EMPAT KALI dalam satu sesi.
//
// Tiap kali sebabnya sama: cabang baru ditulis dengan bentuk yang belum
// dikenali pembacaan teks ini, dan tiap kali angkanya TERLIHAT masuk akal.
//
//   1. penampang baja dipilih dari `input.profil`, bukan `el.jenis === …`
//      → melapor  7/32, sesungguhnya 17/32
//   2. empat sambungan memakai TABEL berkunci jenis
//      → melapor 26/32, sesungguhnya 29/32
//   3. satu entri tabel berbadan blok `() => { … }`
//      → melapor 31/32, sesungguhnya 32/32
//   4. `kuda_kuda_kayu` & `baja_ringan` disangka bergambar karena modulnya
//      menyebut medan `profil` — padahal `profil` di sana KUNCI KATALOG
//      berupa teks ("C75_100"), bukan objek berdimensi
//      → melapor 32/32, sesungguhnya 30/32
//
// Yang keempat paling berbahaya: ia melapor SUDAH LENGKAP saat dua jenis
// masih kosong. Laporan yang salah ke arah "sudah selesai" menghentikan
// pekerjaan yang belum selesai.
//
// **Yang berwenang adalah `uji-gambar-semua-jenis.mjs`** — ia MEMBUAT elemen
// untuk tiap jenis lewat rute sungguhan, meminta gambarnya, dan MEMBUKA
// SVG-nya. Ia tak membaca kode sama sekali, jadi ia tak bisa dibohongi oleh
// cara kode ditulis.
//
// Laporan ini tetap berguna karena tak butuh API hidup — cukup untuk melihat
// arah, tak cukup untuk menyatakan selesai.
// ══════════════════════════════════════════════════════════════════════════
// ============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RUTE = join(process.cwd(), 'src', 'routes', 'v1', 'struktur.ts')
const isi = readFileSync(RUTE, 'utf8')

const mJenis = isi.match(/const JENIS = \[([\s\S]*?)\] as const/)
if (!mJenis) { console.error('❌ Konstanta JENIS tak ditemukan'); process.exit(0) }
const semua = [...mJenis[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])

/* Badan gambarUntuk() — hanya di dalamnya penyebutan jenis berarti "digambar". */
const mFn = isi.match(/function gambarUntuk\([\s\S]*?\n\}\n/)
if (!mFn) { console.error('❌ gambarUntuk() tak ditemukan'); process.exit(0) }
const badan = mFn[0]

const bergambar = new Set()
for (const m of badan.matchAll(/el\.jenis === '([a-z_]+)'/g)) bergambar.add(m[1])

/*
  Bentuk KEDUA: tabel pencarian berkunci jenis.

  Empat jenis sambungan (baut, angkur, kayu, sekrup) memakai SATU fungsi gambar
  yang sama dan dipilih lewat tabel:

      const polaSambungan: Record<string, () => …> = {
        baja_sambungan_baut: () => ({ … }),
        …
      }

  Menuliskannya sebagai rantai `if (el.jenis === …)` berarti empat cabang yang
  isinya nyaris sama. Tetapi laporan yang hanya mengenali bentuk pertama akan
  melaporkan keempatnya BELUM bergambar, padahal sudah.

  Ini kedua kalinya laporan ini salah karena mengukur BENTUK KODE, bukan
  akibatnya — yang pertama saat penampang baja dipilih lewat `input.profil`.
  Pelajaran yang sama: setiap kali cabang baru ditulis dengan cara lain,
  laporan ini ikut buta sampai diberi tahu.
*/
/*
  Dua bentuk badan panah: ringkas `() => ({…})` dan berblok `() => {…}`.
  Versi pertama pola ini hanya mengenali yang ringkas, dan melaporkan
  `baja_sambungan_momen` BELUM bergambar padahal sudah — persis kesalahan
  yang sama, ketiga kalinya, dalam satu berkas laporan.
*/
for (const m of badan.matchAll(/^\s{6}([a-z_]+):\s*\(\)\s*=>\s*[({]/gm)) {
  bergambar.add(m[1])
}

/*
  ══════════════════════════════════════════════════════════════════════════════
  Tidak semua cabang memutuskan lewat `el.jenis`.

  Penampang profil BAJA dipilih dari ADANYA `input.profil`, bukan dari daftar
  jenis — sepuluh jenis baja memakai medan yang sama, dan menuliskan kesepuluh
  namanya di `if` berarti daftar kesebelas yang bisa basi sendiri.

  Versi pertama laporan ini hanya membaca `el.jenis === …`, dan karena itu
  melaporkan 7/32 SESUDAH sepuluh jenis baja mulai bergambar. Laporan yang
  mengukur bentuk kodenya, bukan akibatnya, akan salah setiap kali kodenya
  ditulis dengan cara lain.

  Jenis yang bergambar lewat medan diambil dari MODULNYA: jenis yang modul
  analisanya menerima `profil` pasti melewati cabang itu.
  ══════════════════════════════════════════════════════════════════════════════
*/
const petaFungsi = new Map()
for (const m of isi.matchAll(/case '([a-z_]+)': return (\w+)\(/g)) petaFungsi.set(m[1], m[2])

const imporModul = new Map()
for (const m of isi.matchAll(/import \{([^}]+)\} from '\.\.\/\.\.\/lib\/([\w-]+)\.js'/g)) {
  for (const nama of m[1].split(',').map((x) => x.trim().replace(/^type\s+/, ''))) {
    if (nama) imporModul.set(nama, m[2])
  }
}

const lewatMedanProfil = /input\.profil|\bprofil &&/.test(badan)
if (lewatMedanProfil) {
  const { readFileSync: rf, existsSync } = await import('node:fs')
  for (const [jenis, fungsi] of petaFungsi) {
    const modul = imporModul.get(fungsi)
    if (!modul) continue
    const berkas = join(process.cwd(), 'src', 'lib', `${modul}.ts`)
    if (!existsSync(berkas)) continue
    const isiModul = rf(berkas, 'utf8')
    /* Antarmuka input fungsi ini menerima `profil`? */
    if (/^\s*profil\s*[?:]/m.test(isiModul) || /profil:\s*ProfilBaja/.test(isiModul)) {
      bergambar.add(jenis)
    }
    /* Rangka: profilnya di dalam tiap batang. */
    if (/batang:\s*(ReadonlyArray<|Array<|\w+\[)/.test(isiModul)
        && /profil:\s*ProfilBaja/.test(isiModul)) {
      bergambar.add(jenis)
    }
  }
}

const punya = semua.filter((j) => bergambar.has(j))
const belum = semua.filter((j) => !bergambar.has(j))

console.log('══ Cakupan GAMBAR KERJA per jenis elemen ═══════════════════')
console.log('')
for (const j of semua) {
  console.log(`  ${bergambar.has(j) ? '✓' : '·'} ${j}`)
}
console.log('')
console.log(`  BERGAMBAR ${punya.length} / ${semua.length}  (${Math.round((punya.length / semua.length) * 100)}%)`)
console.log('')
console.log(`  Belum: ${belum.join(', ')}`)
console.log('')
console.log('  Yang belum bergambar TETAP mendapat meteran kekuatan — ia')
console.log('  menjawab "seberapa terpakai", bukan "bendanya seperti apa".')
console.log('')
console.log('  Ini LAPORAN, bukan penjaga — tak pernah exit 1.')
console.log('')
console.log('  ⚠ ANGKA DI ATAS PERKIRAAN, dibaca dari BENTUK kode. Ia sudah')
console.log('    salah EMPAT kali di sesi yang sama (lihat kepala berkas),')
console.log('    sekali di antaranya melapor 32/32 saat sesungguhnya 30/32.')
console.log('')
console.log('    Yang berwenang: uji-gambar-semua-jenis.mjs — ia MEMBUAT')
console.log('    elemen tiap jenis lewat rute hidup dan MEMBUKA SVG-nya.')
