#!/usr/bin/env node
/**
 * UJI MUTASI untuk `audit-klaim-status-atomik.mjs`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI BERKAS, BUKAN PERINTAH SEKALI-PAKAI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Penjaga yang tak pernah merah adalah hiasan (CLAUDE.md §8a.2). Tapi
 * membuktikannya lewat perintah shell sekali-pakai GAGAL EMPAT KALI berturut
 * di sesi 2026-08-09, dan tiap kegagalan melaporkan "hijau":
 *
 *   1. `.replace()` tak cocok karena akhiran baris CRLF → tak ada yang disuntik
 *   2. `cp` gagal tapi skrip lanjut → penjaga "lulus" atas kode yang utuh
 *   3. ratchet berbasis JUMLAH diam saat satu berkas keluar & satu masuk
 *   4. tanda kutip bentrok antara bash dan JS → regex tak pernah terbentuk
 *
 * Keempatnya kelas yang sama: **alat uji yang gagal diam-diam lebih berbahaya
 * daripada tak ada alat uji**, karena ia menghasilkan keyakinan palsu.
 *
 * Sebagai berkas, ia bisa: memverifikasi mutasinya benar-benar masuk sebelum
 * menilai, memulihkan berkas lewat `try/finally` sehingga kegagalan di tengah
 * tak meninggalkan kode termutasi, dan dijalankan ulang kapan saja.
 *
 * Pakai:  node apps/api/scripts/uji-mutasi-klaim-status.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')
const RUTE = join(AKAR, 'apps', 'api', 'src', 'routes', 'v1')
const PENJAGA = join(AKAR, 'apps', 'api', 'scripts', 'audit-klaim-status-atomik.mjs')

/**
 * Tiap kasus melepas SATU klaim atomik yang sungguhan dipakai di produksi.
 * Dipilih supaya mencakup keempat bentuk yang pernah membutakan penjaga:
 * `.update(variabel)`, `.update({literal})`, `.neq`, dan kolom akumulatif.
 */
const KASUS = [
  { berkas: 'kasbons.ts',        cari: ".eq('status', 'pending')",                    bentuk: '.update(variabel)' },
  { berkas: 'notifications.ts',  cari: ".eq('status', 'pending')",                    bentuk: 'jalur kedua kasbon' },
  { berkas: 'change-orders.ts',  cari: ".neq('status', 'approved')",                  bentuk: '.neq' },
  { berkas: 'rantai-kontrak.ts', cari: ".eq('status', 'diajukan')",                   bentuk: 'status variabel' },
  { berkas: 'finance.ts',        cari: ".eq('amount_paid', invoice.amount_paid)",     bentuk: 'kolom akumulatif' },
]

function penjagaHijau() {
  try {
    execFileSync(process.execPath, [PENJAGA], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

let gagal = 0

console.log('══ Uji mutasi: audit-klaim-status-atomik ═══════════════════\n')

if (!penjagaHijau()) {
  console.error('✗ BASELINE SUDAH MERAH — perbaiki dulu sebelum menguji mutasi.')
  process.exit(1)
}
console.log('  baseline                                    HIJAU ✓\n')

for (const { berkas, cari, bentuk } of KASUS) {
  const path = join(RUTE, berkas)
  const asli = readFileSync(path, 'utf8')

  // Buang SEMUA kemunculan klaimnya, bukan yang pertama saja.
  //
  // Percobaan pertama memakai `indexOf` tunggal dan gagal pada tiga dari lima
  // berkas: polanya muncul 2–3 kali (di jalur produksi DAN di komentar yang
  // menjelaskan pola itu), sehingga yang terbuang justru bukan yang diuji.
  // Alat ini menolak menilai saat itu terjadi — dan penolakannya benar.
  if (!asli.includes(cari)) {
    console.error(`  ✗ ${berkas.padEnd(22)} pola tak ditemukan — uji ini TIDAK sah`)
    gagal++
    continue
  }
  let termutasi = asli
  for (;;) {
    const i = termutasi.indexOf(cari)
    if (i === -1) break
    let mulai = i
    while (mulai > 0 && (termutasi[mulai - 1] === ' ' || termutasi[mulai - 1] === '\t')) mulai--
    let akhir = i + cari.length
    if (termutasi[akhir] === '\r') akhir++
    if (termutasi[akhir] === '\n') akhir++
    termutasi = termutasi.slice(0, mulai) + termutasi.slice(akhir)
  }

  try {
    writeFileSync(path, termutasi)

    // Verifikasi mutasinya BENAR-BENAR masuk sebelum menilai apa pun.
    if (readFileSync(path, 'utf8').includes(cari)) {
      console.error(`  ✗ ${berkas.padEnd(22)} mutasi tak tersuntik — uji ini TIDAK sah`)
      gagal++
      continue
    }

    if (penjagaHijau()) {
      console.error(`  ✗ ${berkas.padEnd(22)} ${bentuk.padEnd(20)} penjaga BUTA`)
      gagal++
    } else {
      console.log(`  ✓ ${berkas.padEnd(22)} ${bentuk.padEnd(20)} MERAH`)
    }
  } finally {
    // Pulihkan APA PUN yang terjadi — termasuk kalau proses ini dilempar galat.
    writeFileSync(path, asli)
  }
}

console.log('')
if (!penjagaHijau()) {
  console.error('✗ TIDAK PULIH: penjaga merah sesudah semua berkas dikembalikan.')
  console.error('  Periksa `git status` — ada berkas yang tertinggal dalam keadaan termutasi.')
  process.exit(1)
}
console.log('  dipulihkan                                  HIJAU ✓\n')

if (gagal > 0) {
  console.error(`✗ ${gagal} dari ${KASUS.length} mutasi TIDAK terdeteksi.`)
  process.exit(1)
}
console.log(`✓ ${KASUS.length}/${KASUS.length} mutasi terdeteksi. Penjaga terbukti bisa merah.`)
