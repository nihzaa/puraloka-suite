#!/usr/bin/env node
/**
 * PENJAGA SUSPENSE — `useSearchParams()` tanpa batas Suspense.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Next 16 menolak **prerender** halaman mana pun yang memuat `useSearchParams()`
 * tanpa `<Suspense>` di atasnya. Build gagal, bukan sekadar memberi peringatan.
 *
 * ── Kenapa cacat ini sangat mahal untuk didiagnosis
 *
 * Galatnya menunjuk **halaman yang kebetulan diprerender lebih dulu**, bukan
 * berkas yang bersalah. Diukur 2026-08-08, build melaporkan:
 *
 *     ⨯ /procurement/lanjutan
 *     ⨯ /keuangan/contingency
 *
 * Padahal **kedua berkas itu tak memakai `useSearchParams` sama sekali.**
 * Penyebabnya `components/sidebar.tsx` — yang dirender di `(dashboard)/layout.tsx`,
 * jadi SELURUH halaman dashboard mewarisinya. Satu titik, gejala di mana-mana,
 * dan penunjuknya salah alamat.
 *
 * Sesi sebelumnya sempat mencatatnya sebagai "masalah di /procurement/lanjutan".
 * Itu keliru, dan penjaga ini ada supaya kekeliruan yang sama tak terulang:
 * ia menunjuk **berkas yang benar-benar memanggil**, bukan korbannya.
 *
 * ── Kenapa larangan, bukan ratchet
 *
 * Berbeda dari `hex-ratchet` atau `kerapatan-ratchet` yang menoleransi utang
 * lama, di sini **tak ada nilai lantai yang masuk akal**: satu pelanggaran =
 * build merah = tak ada yang bisa dirilis. Tak ada gunanya mengizinkan "tiga
 * pelanggaran seperti kemarin".
 *
 * ── Yang dianggap aman
 *
 *   1. Berkas memanggil `useSearchParams` DAN memuat `Suspense` sendiri
 *      (pola `judul-bagian.tsx`: komponen menanggung batasnya sendiri, jadi
 *      pemanggil tak bisa lupa).
 *   2. Berkas hanya MERENDER komponen ber-`useSearchParams` — itu tanggung
 *      jawab komponennya, bukan pemanggil.
 *
 * Cek statis ini sengaja tidak menelusuri pohon render (butuh analisis lintas
 * modul yang jauh lebih mahal). Ia menangkap kelas yang paling sering terjadi
 * dan paling sulit dilacak: pemanggil langsung yang lupa batasnya.
 *
 * Pakai: node apps/web/scripts/suspense-ratchet.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(fileURLToPath(new URL('.', import.meta.url)), '..')

function berkasSumber(dir, keluar = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) berkasSumber(p, keluar)
    else if (/\.tsx$/.test(e.name) && !e.name.includes('.test.')) keluar.push(p)
  }
  return keluar
}

/**
 * Buang komentar sebelum menganalisis — DUA arah, dan keduanya terbukti perlu.
 *
 * Diukur saat menguji penjaga ini terhadap dirinya sendiri:
 *
 *   sisi DETEKSI  `(dashboard)/layout.tsx` hanya MENYEBUT `useSearchParams()`
 *                 di komentar penjelas, lalu dilaporkan sebagai pelanggar.
 *                 Positif palsu di berkas yang justru sudah benar.
 *
 *   sisi PEMBEBAS `judul-bagian.tsx` penuh komentar yang menyebut "Suspense",
 *                 jadi batasnya bisa DIHAPUS dari kode sementara penjaga tetap
 *                 hijau — diselamatkan kalimat penjelasannya sendiri.
 *
 * Repo ini sengaja berkomentar padat; penjaga yang membaca komentar sebagai
 * kode akan salah di kedua arah justru pada berkas yang paling dijelaskan.
 */
function tanpaKomentar(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // blok /* … */ dan /** … */
    .replace(/^\s*\/\/.*$/gm, ' ') // baris // …
}

const pelanggar = []
for (const f of [...berkasSumber(join(AKAR, 'app')), ...berkasSumber(join(AKAR, 'components'))]) {
  const isi = tanpaKomentar(readFileSync(f, 'utf8'))
  // Hanya PEMANGGIL langsung; sekadar mengimpor tipe tak dihitung.
  if (!/\buseSearchParams\s*\(/.test(isi)) continue

  /*
   * Menuntut `<Suspense` — TAG-nya, bukan sekadar kata "Suspense".
   *
   * Versi pertama memakai /\bSuspense\b/ dan ketahuan lemah saat diuji mutasi:
   * berkas ini penuh komentar yang menyebut "Suspense", jadi batas Suspense
   * bisa DIHAPUS dari kode sementara penjaga tetap hijau — dijaga oleh
   * kalimat penjelasannya sendiri. Penjaga yang diselamatkan komentar adalah
   * penjaga yang tak menjaga apa pun.
   */
  if (/<Suspense[\s>]/.test(isi)) continue
  pelanggar.push(relative(AKAR, f).split(sep).join('/'))
}

console.log('══ PENJAGA Suspense (UIR-0C) ═══════════════════════════════════════')
console.log(`  useSearchParams() tanpa <Suspense> : ${pelanggar.length}`)

if (pelanggar.length > 0) {
  console.error('\n❌ Build Next akan GAGAL.\n')
  console.error('   Berkas yang memanggil useSearchParams() tanpa batas Suspense:')
  for (const p of pelanggar) console.error(`     ${p}`)
  console.error('\n   Perbaikan — pilih satu:')
  console.error('     a) Bungkus pemakainya: <Suspense fallback={…}><Isi /></Suspense>')
  console.error('     b) Lebih baik untuk komponen bersama: tanggung batasnya')
  console.error('        DI DALAM komponen, seperti components/judul-bagian.tsx.')
  console.error('        Diukur 2026-08-08: kelima pemanggil JudulBagian lupa,')
  console.error('        dan empat di antaranya layout.tsx — satu kelupaan')
  console.error('        menjatuhkan seluruh cabang halaman di bawahnya.\n')
  console.error('   ⚠️ Galat build menunjuk halaman yang kebetulan diprerender')
  console.error('      lebih dulu, BUKAN berkas yang bersalah. Percayai daftar')
  console.error('      di atas, bukan nama halaman di pesan Next.\n')
  process.exit(1)
}

console.log('\n  ✅ nol pelanggaran.\n')
