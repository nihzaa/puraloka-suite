#!/usr/bin/env node
// ============================================================================
// UBIN JUDUL SERAGAM — dua komponen judul tak boleh menggambar ubin berbeda,
// dan halaman tak boleh menggambar ubin ketiga sendiri.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Founder, 2026-08-14, dalam satu pesan menyebut tiga gejala yang tampak
// terpisah:
//
//   "ada yg double icon"
//   "semua halaman di grup pengadaan/akuntansi/keuangan masih belum ada iconnya"
//   "grup mandor & subkon juga ini iconnya belum konsisten"
//
// Ketiganya punya SATU penyebab: ubin ikon judul digambar di lebih dari satu
// tempat, dan tempat-tempat itu tak pernah saling tahu.
//
//   • `KepalaHalaman` (dasar.tsx) menggambar ubin 40px gradien.
//   • `JudulBagian` (judul-bagian.tsx) — dipakai layout empat modul terbesar,
//     34 halaman — dulu tak menggambar ubin sama sekali. → "belum ada iconnya"
//   • Sebagian halaman menggambar ubin 42px sendiri SEBELUM memanggil
//     `KepalaHalaman`. Saat prop `ikon` ditambahkan, keduanya terlukis.
//     → "double icon"
//   • Sebagian lagi menaruh ikon INLINE di dalam `<h1>`, ukuran 22px tanpa
//     ubin. Ikonnya ada, bentuknya beda. → "iconnya belum konsisten"
//
// Tak satu pun dari itu menimbulkan galat. Tiap halaman terlihat wajar saat
// ditatap sendirian; yang salah hanya terasa saat BERPINDAH halaman — dan
// itulah kenapa ia bertahan lama dan kembali berulang kali.
//
// ── Yang dijaga
//
//   1. Kedua komponen judul menggambar ubin dengan angka yang sama persis
//      (40px, `--rad-sedang`, `--grad-aksen`, `--on-aksen`, `--naik-1`).
//   2. Nol halaman menggambar ubin ikonnya sendiri berdampingan dengan
//      komponen judul bersama.
//
// Ambang NOL, bukan ratchet: keduanya sudah bersih hari ini, dan pelanggaran
// baru selalu berarti cacat yang persis sama kembali.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function berkasTsx(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama === '.next') continue
    const p = join(dir, nama)
    if (statSync(p).isDirectory()) berkasTsx(p, keluar)
    else if (nama.endsWith('.tsx')) keluar.push(p)
  }
  return keluar
}

const pelanggaran = []

// ── 1. Kedua komponen judul memakai angka ubin yang sama ────────────────────
//
// Dicocokkan sebagai HIMPUNAN sifat, bukan sebagai teks yang sama persis:
// keduanya menulis gaya dengan tata letak berbeda (satu di dalam `<span>`
// beratribut, satu lagi di komponen `UbinIkon` terpisah), dan menuntut teks
// identik akan merah untuk perbedaan yang tak terlihat pengguna.
const SIFAT_WAJIB = [
  ['lebar 40px',        /width:\s*40\b/],
  ['tinggi 40px',       /height:\s*40\b/],
  ['radius --rad-sedang', /borderRadius:\s*"var\(--rad-sedang\)"/],
  ['latar --grad-aksen', /background:\s*"var\(--grad-aksen\)"/],
  ['warna --on-aksen',  /color:\s*"var\(--on-aksen\)"/],
  ['bayang --naik-1',   /boxShadow:\s*"var\(--naik-1\)"/],
]

const SUMBER_UBIN = [
  ['components/dasar.tsx',        'KepalaHalaman'],
  ['components/judul-bagian.tsx', 'JudulBagian'],
]

for (const [rel, nama] of SUMBER_UBIN) {
  const isi = readFileSync(join(AKAR, rel), 'utf8')
  const i = isi.indexOf('data-ubin-ikon')
  if (i === -1) {
    pelanggaran.push(`${rel}: ${nama} tak lagi menggambar ubin ber-\`data-ubin-ikon\``)
    continue
  }
  // Blok gaya ubin: dari penanda sampai penutup `</span>` pertama sesudahnya.
  //
  // BUKAN jendela sejumlah karakter tetap. `KepalaHalaman` menyimpan komentar
  // 18 baris di tengah gaya ubinnya (alasan `--grad-aksen` dipakai di sini
  // dan tidak di tempat lain), dan jendela 700 karakter berhenti sebelum tiga
  // sifat terakhir — penjaganya merah untuk berkas yang benar. Batas
  // sintaksis tak punya masalah itu.
  const tutup = isi.indexOf('</span>', i)
  const blok = isi.slice(i, tutup === -1 ? i + 2000 : tutup)
  for (const [label, pola] of SIFAT_WAJIB) {
    if (!pola.test(blok)) {
      pelanggaran.push(`${rel}: ubin ${nama} kehilangan ${label} — dua judul jadi beda bentuk`)
    }
  }
}

// ── 2. Nol halaman menggambar ubin sendiri di samping komponen judul ────────
//
// Gejalanya "double icon": halaman sudah punya ubin buatan sendiri, lalu
// komponen bersama menambahkan ubin kedua. Dideteksi dari kedekatannya —
// sebuah kotak ~40-44px bergradien dalam 700 karakter SEBELUM pemanggilan
// komponen judul.
const POLA_UBIN_SENDIRI = /width:\s*4[0-8],\s*height:\s*4[0-8][^}]*?(linear-gradient|--grad-aksen)/s

for (const p of berkasTsx(join(AKAR, 'app'))) {
  const isi = readFileSync(p, 'utf8')
  const rel = p.slice(AKAR.length).replace(/\\/g, '/')

  for (const komponen of ['<KepalaHalaman', '<JudulBagian']) {
    let dari = 0
    for (;;) {
      const i = isi.indexOf(komponen, dari)
      if (i === -1) break
      dari = i + 1
      const sebelum = isi.slice(Math.max(0, i - 700), i)
      if (POLA_UBIN_SENDIRI.test(sebelum)) {
        pelanggaran.push(
          `${rel}: ubin ikon buatan sendiri tepat sebelum ${komponen.slice(1)} — ` +
          `dua ikon akan terlukis berdampingan`,
        )
      }
    }
  }
}

if (pelanggaran.length > 0) {
  console.error('\n❌ Ubin judul tidak seragam:\n')
  for (const g of pelanggaran) console.error('   ' + g)
  console.error(
    `\n   ${pelanggaran.length} pelanggaran (ambang: 0)\n\n` +
    '   Ubin ikon judul HANYA digambar `KepalaHalaman` atau `JudulBagian`.\n' +
    '   Halaman memberi prop `ikon`, bukan menggambar kotaknya sendiri.\n',
  )
  process.exit(1)
}

console.log('✅ Ubin judul seragam: dua komponen judul sebentuk, nol ubin ganda di halaman')
