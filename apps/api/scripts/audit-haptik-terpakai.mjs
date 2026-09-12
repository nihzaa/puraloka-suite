#!/usr/bin/env node
/**
 * PENJAGA — haptik yang DIPASANG wajib DIPAKAI, dan dipakai di tempat
 * yang benar: layar TULIS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diminta langsung oleh QUEUE `MOBILE-HAPTIK-BELUM-DIPAKAI`:
 *
 *   > "Kalau dipakai, pertimbangkan penjaga sejenis
 *   >  `audit-font-mobile-terpakai` supaya ia tak jadi terpasang-tapi-
 *   >  menganggur lagi."
 *
 * `expo-haptics` dipasang 2026-09-12 bersama reanimated dan
 * linear-gradient, lalu dipakai di SATU berkas. Diukur 2026-09-13: lima
 * layar TULIS nol pemakaian.
 *
 * Ini bentuk cacat yang melahirkan `audit-font-mobile-terpakai.mjs`:
 * biaya penuh (paket ikut bundle), nol hasil, dan SEMUA alat hijau
 * karena tak ada yang SALAH — cuma tak ada yang memanggilnya.
 *
 * ── Kenapa layar TULIS yang dijaga, bukan sekadar "ada pemakaian"
 *
 * Menjaga "dipakai minimal sekali" akan hijau selamanya berkat satu
 * pemanggilan di `BilahTab`. Yang bernilai bukan jumlahnya melainkan
 * TEMPATNYA: layar yang mengirim data adalah tempat orang perlu tahu
 * sesuatu benar-benar terjadi.
 *
 * Ini aplikasi lapangan — HP di bawah matahari, sering bersarung tangan.
 * Konfirmasi VISUAL adalah yang paling mudah terlewat di sana, dan
 * tekanan yang tak terasa terjadi akan DIULANG. Bentuk kegagalan yang
 * sama sudah tercatat: `audit-tekan-berumpan.mjs` menyebut akibatnya
 * langsung — "dua NCR dari satu temuan".
 *
 * ── Kenapa RATCHET, bukan ambang nol
 *
 * Layar tulis BARU akan lahir, dan memaksa tiap layar baru punya haptik
 * sejak commit pertama akan membuat penjaga ini dimatikan orang. Yang
 * dijaga: jumlahnya tak boleh TURUN, dan lantainya menyimpan DAFTAR NAMA
 * — merah tanpa menyebut pelakunya memaksa orang berikutnya menyisir
 * sendiri (CLAUDE.md §8a.2).
 *
 * ⚠ BATAS: yang dibaca KEPUTUSAN DI KODE. Penjaga ini tak tahu apakah
 * getarannya benar-benar terasa di perangkat, dan tak bisa tahu — haptik
 * hidup ~100ms di jari, kelas cacat yang bahkan MEMOTRET tak bisa temukan
 * (CLAUDE.md §6, `audit-tekan-berumpan.mjs`).
 */
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const APP = join(AKAR, 'apps', 'mobile', 'app')
const LANTAI = join(dirname(fileURLToPath(import.meta.url)), '.lantai-haptik.json')

if (!existsSync(APP)) {
  console.log('⏭  haptik terpakai: DILEWATI (apps/mobile/app tak ada)')
  process.exit(0)
}

/** ⚠ CR dibuang lebih dulu — CLAUDE.md §7a. */
const baca = (p) => readFileSync(p, 'utf8').replace(/\r/g, '')

function berkasTsx(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama)
    if (statSync(p).isDirectory()) berkasTsx(p, keluar)
    else if (nama.endsWith('.tsx')) keluar.push(p)
  }
  return keluar
}

/*
  Layar TULIS = layar yang mengirim data ke server. Dibaca dari BENTUK
  kode (`api.post`/`put`/`patch`, atau `antrekan(`), bukan dari daftar
  nama berkas — daftar nama selalu tertinggal dari layar yang baru lahir,
  dan yang tertinggal justru yang belum ditimbang siapa pun.
*/
const POLA_TULIS = /\bapi\.(post|put|patch)\s*[(<]|\bantrekan\s*\(/
const POLA_HAPTIK = /\bgetar\s*\(|expo-haptics/

const tulis = []
for (const p of berkasTsx(APP)) {
  const isi = baca(p)
  /* Komentar dibuang: penjelasan bukan pemakaian (CLAUDE.md §8a.2). */
  const kode = isi
    .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (b) => ' '.repeat(b.length))

  if (!POLA_TULIS.test(kode)) continue
  tulis.push({
    nama: relative(AKAR, p).replace(/\\/g, '/'),
    punyaHaptik: POLA_HAPTIK.test(kode),
  })
}

/*
  Korpus kosong bukan bukti apa pun — pola yang meleset memulangkan nol
  temuan, dan nol terbaca seperti "semuanya benar".
*/
if (tulis.length < 3) {
  console.error(`❌ Cuma ${tulis.length} layar tulis terbaca — polanya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

const berhaptik = tulis.filter((t) => t.punyaHaptik)
const telanjang = tulis.filter((t) => !t.punyaHaptik)

console.log('── haptik di layar tulis ──')
console.log(`  layar tulis        : ${tulis.length}`)
console.log(`  punya haptik       : ${berhaptik.length}`)
console.log(`  telanjang          : ${telanjang.length}`)

/* ── Ratchet: lantai menyimpan DAFTAR NAMA, bukan cuma angka ──────────── */
let lantai = { jumlah: 0, nama: [] }
if (existsSync(LANTAI)) {
  try {
    lantai = JSON.parse(baca(LANTAI))
  } catch {
    console.error('❌ lantai haptik rusak — tak bisa dibaca sebagai JSON.')
    process.exit(1)
  }
}

if (process.argv.includes('--kunci')) {
  writeFileSync(
    LANTAI,
    JSON.stringify({ jumlah: berhaptik.length, nama: berhaptik.map((b) => b.nama).sort() }, null, 2) + '\n',
  )
  console.log(`\n🔒 lantai dikunci di ${berhaptik.length}.`)
  process.exit(0)
}

const hilang = (lantai.nama ?? []).filter((n) => !berhaptik.some((b) => b.nama === n))

if (hilang.length > 0) {
  console.error(`\n❌ ${hilang.length} layar KEHILANGAN haptiknya:`)
  for (const n of hilang) console.error(`   • ${n}`)
  console.error('\n   Ratchet: yang sudah berhaptik tak boleh mundur.')
  process.exit(1)
}

if (berhaptik.length < (lantai.jumlah ?? 0)) {
  console.error(`\n❌ pemakaian TURUN: ${berhaptik.length} < lantai ${lantai.jumlah}.`)
  process.exit(1)
}

/*
  Paket yang terpasang tetapi NOL dipakai adalah keadaan yang melahirkan
  penjaga ini. Itu merah, bukan sekadar peringatan.
*/
if (berhaptik.length === 0) {
  console.error('\n❌ `expo-haptics` terpasang tetapi NOL layar tulis memakainya.')
  console.error('   Biaya penuh (paket ikut bundle), nol hasil, semua alat hijau.')
  process.exit(1)
}

if (telanjang.length > 0) {
  console.log(`\n⚠ ${telanjang.length} layar tulis belum berhaptik (belum merah — ratchet):`)
  for (const t of telanjang) console.log(`   • ${t.nama}`)
}

console.log(`\n✅ ${berhaptik.length} layar tulis berhaptik; tak ada yang mundur.`)
