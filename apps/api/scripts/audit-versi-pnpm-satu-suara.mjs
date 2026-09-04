#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// PENJAGA — versi pnpm wajib SAMA di SEPULUH tempat
// ═══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-09-04, PR #148: menaikkan pnpm 11.8.0 -> 11.11.0 di
// `package.json` membuat SELURUH CI merah — sepuluh job sekaligus, termasuk
// tiga yang tak menyentuh kode sama sekali:
//
//     Run pnpm/action-setup@v4
//     Error: Multiple versions of pnpm specified:
//     Remove one of these versions to avoid version mismatch errors
//     like ERR_PNPM_BAD_PM_VERSION
//
// `pnpm/action-setup` membaca DUA sumber — `version:` di workflow dan
// `packageManager` di `package.json` — dan MENOLAK bila keduanya berbeda.
//
// ── Kenapa ini tak terlihat sebelum di-push
//
// `_catatan_packageManager` di `package.json` sudah memperingatkan bahwa dua
// deklarasi harus sama versinya, dan saya menaikkan keduanya. Yang tak
// disebut catatan itu: ada DELAPAN tempat LAIN di `.github/workflows/`.
//
// Sepuluh angka yang harus sama, tersebar di empat berkas, dan tak satu pun
// alat lokal membacanya — `tsc`, test, dan 222 penjaga semuanya hijau
// sementara CI merah total.
//
// Ini bentuk yang sama dengan `NEXT_PUBLIC_API_URL` vs `PORT` di CLAUDE.md
// §7: dua tempat menyimpan angka yang sama, tak ada yang membandingkannya,
// dan selisihnya baru terasa di lapisan yang jauh dari sebabnya.
//
// ── Kenapa tidak dihapus saja `version:` dari workflow
//
// `action-setup` bisa membaca `packageManager` sendiri, dan menghapus
// `version:` memang membuat satu sumber kebenaran. Tapi itu mengubah
// perilaku SEPULUH job sekaligus — perubahan yang layak dinilai sendiri,
// bukan diselundupkan sebagai efek samping perbaikan versi.
//
// Penjaga ini menerima kedua bentuk: kalau `version:` dihapus nanti, ia
// tinggal tak menemukan apa-apa untuk dibandingkan dan tetap hijau.
//
// Ambang: NOL.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DIR_WF = join(AKAR, '.github', 'workflows')

/**
 * ⚠ CR dibuang SEBELUM membandingkan baris apa pun.
 *
 * CLAUDE.md §7a mencatat lima kali dalam satu hari perbandingan gagal karena
 * baris diam-diam membawa CR — dan hasilnya selalu NOL, yang terbaca seperti
 * "tidak ada" alih-alih "tidak terdeteksi". Berkas di `.github/workflows/`
 * termasuk yang ber-CRLF.
 */
function baris(isi) {
  return isi.split('\n').map((b) => b.replace(/\r/g, ''))
}

function versiPackageJson() {
  const pkg = JSON.parse(readFileSync(join(AKAR, 'package.json'), 'utf8'))
  const hasil = []
  if (pkg.packageManager) {
    const m = /^pnpm@(.+)$/.exec(pkg.packageManager)
    if (m) hasil.push({ dari: 'package.json packageManager', versi: m[1] })
  }
  const de = pkg.devEngines?.packageManager
  if (de?.name === 'pnpm' && de.version) {
    hasil.push({ dari: 'package.json devEngines', versi: de.version })
  }
  return hasil
}

function versiWorkflow() {
  if (!existsSync(DIR_WF)) return []
  const hasil = []
  for (const nama of readdirSync(DIR_WF).filter((n) => /\.ya?ml$/.test(n))) {
    const isi = readFileSync(join(DIR_WF, nama), 'utf8')
    baris(isi).forEach((b, i) => {
      // Hanya baris SETELAN (`version: X`), bukan komentar yang kebetulan
      // menyebut angka. Komentar di ci.yml memang menyebut "11.8.0" saat
      // menjelaskan celah pnpm 9 vs 11 — menyaring lewat teks polos akan
      // menghitungnya dan melapor bentrok yang tak ada.
      const m = /^\s+version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$/.exec(b)
      if (m) hasil.push({ dari: `.github/workflows/${nama}:${i + 1}`, versi: m[1] })
    })
  }
  return hasil
}

const semua = [...versiPackageJson(), ...versiWorkflow()]

if (semua.length === 0) {
  console.log('LEWAT: tak ada versi pnpm yang dideklarasikan di mana pun.')
  process.exit(0)
}

const unik = [...new Set(semua.map((x) => x.versi))]

console.log(`Versi pnpm dideklarasikan di ${semua.length} tempat:\n`)
for (const v of unik) {
  const tempat = semua.filter((x) => x.versi === v)
  console.log(`  ${v}  (${tempat.length} tempat)`)
  for (const t of tempat) console.log(`      ${t.dari}`)
}
console.log('')

if (unik.length > 1) {
  console.log(`MERAH: ${unik.length} versi pnpm BERBEDA dideklarasikan.\n`)
  console.log('  `pnpm/action-setup` membaca `version:` DAN `packageManager`,')
  console.log('  lalu MENOLAK bila keduanya berbeda:')
  console.log('      Error: Multiple versions of pnpm specified\n')
  console.log('  Akibatnya SELURUH job gagal di langkah setup — termasuk job')
  console.log('  yang tak menyentuh kode. Samakan kesepuluhnya, atau hapus')
  console.log('  `version:` dari workflow agar `packageManager` jadi satu-')
  console.log('  satunya sumber.')
  process.exit(1)
}

console.log(`HIJAU: satu suara — pnpm ${unik[0]} di ${semua.length} tempat.`)
