#!/usr/bin/env node
/**
 * PENJAGA — daftar yang BERHALAMAN wajib memberi tahu masih ada sisa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-13: **17 rute daftar** memakai `.range(off, off+lim-1)`
 * lalu membalas hanya barisnya — tanpa `total`, tanpa `has_more`, tanpa
 * apa pun yang memberi tahu klien bahwa halaman berikutnya ada.
 *
 * Yang terbesar `/api/v1/notifications`: **10.767 baris** di basis.
 *
 * ── Kenapa ini berbahaya justru karena TAK bergejala
 *
 * Rutenya benar. Query-nya benar. Layarnya benar. Yang hilang cuma satu
 * kalimat di balasan — dan tanpa kalimat itu, daftar yang berhenti di
 * baris ke-30 TIDAK BISA DIBEDAKAN dari daftar yang memang cuma punya 30.
 *
 * Orang lalu menyimpulkan itulah semuanya, dan mengambil keputusan dari
 * sebagian data tanpa tahu ia sebagian.
 *
 * Kelas cacat yang sama sudah tercatat di CLAUDE.md §8a.3, dan biayanya
 * sudah dibayar sekali:
 *
 *   > `/notifications`: 8.947 baris di basis, 30 yang bisa dilihat dari
 *   > HP, **nol tanda**.
 *
 * Dan `audit-baca-tak-terpotong.mjs` TIDAK menutup ini — ia menjaga
 * pembacaan PENUH tak terpotong senyap di 1.000 baris PostgREST. Yang di
 * sini kebalikannya: pembacaan yang memang SENGAJA berhalaman, tetapi
 * tak mengaku berhalaman. Dua penjaga, dua cacat berbeda, dan cacat ini
 * hidup di celah antara keduanya.
 *
 * ── Kontraknya BUKAN karangan baru
 *
 * `audit.ts` sudah memakainya sejak lama, dan bentuk itulah yang
 * dijadikan baku — bukan bentuk yang saya pilih sendiri:
 *
 *     reply.send({ logs, meta: { total, page, limit, pages } })
 *
 * `count` diambil dari query yang SAMA (`{ count: 'exact' }`), jadi tak
 * ada perjalanan tambahan ke basis.
 *
 * ── Yang DIKECUALIKAN, dan kenapa
 *
 * `otomasi-terjadwal.ts` dan jalur `/otomasi/` dilewati: itu rute yang
 * dipanggil PENJADWAL, hasilnya jadi notifikasi, bukan layar bergulir.
 * Tak ada manusia yang menunggu halaman kedua di sana.
 *
 * ⚠ Pengecualian ini bukan kehalusan. Tanpanya penjaga melaporkan **43**
 * pelanggaran, 26 di antaranya rute otomasi — dan penjaga yang merah atas
 * hal yang benar akan diabaikan seluruh keluarannya (CLAUDE.md §6).
 *
 * ⚠ Dan pengukuran PER-BERKAS juga salah, ke arah sebaliknya: satu berkas
 * bisa punya rute ekspor yang menyebut `total` DAN rute daftar yang bisu.
 * Menilai per-berkas membuat yang kedua lolos karena yang pertama jujur —
 * terukur 2026-09-13, `kasbons.ts` lolos padahal daftarnya bisu. Penjaga
 * ini menilai PER-HANDLER.
 *
 * ⚠ BATAS: yang dibaca BENTUK BALASAN di kode, bukan balasan sungguhan.
 * Ia tak tahu apakah `total`-nya benar — hanya bahwa ia dijanjikan.
 *
 * Ratchet; lantainya menyimpan DAFTAR NAMA, bukan cuma angka.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DIR = join(AKAR, 'apps', 'api', 'src', 'routes', 'v1')
const LANTAI = join(dirname(fileURLToPath(import.meta.url)), '.lantai-daftar-jujur.json')

if (!existsSync(DIR)) {
  console.log('⏭  daftar berhalaman jujur: DILEWATI (routes/v1 tak ada)')
  process.exit(0)
}

/** ⚠ CR dibuang lebih dulu — CLAUDE.md §7a. */
const baca = (p) => readFileSync(p, 'utf8').replace(/\r/g, '')

/** Komentar dibuang: penjelasan bukan pemakaian (CLAUDE.md §8a.2). */
const tanpaKomentar = (isi) =>
  isi
    .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (b) => ' '.repeat(b.length))

/** Rute penjadwal — bukan daftar yang dibaca orang. Lihat kepala berkas. */
const BERKAS_DIKECUALIKAN = new Set(['otomasi-terjadwal.ts'])

const bisu = []
let jujur = 0
let berhalaman = 0

for (const f of readdirSync(DIR)) {
  if (!f.endsWith('.ts')) continue
  if (BERKAS_DIKECUALIKAN.has(f)) continue
  const kode = tanpaKomentar(baca(join(DIR, f)))

  for (const m of kode.matchAll(/app\.get\(\s*[`'"]([^`'"]+)[`'"]([\s\S]*?)(?=\n  app\.|$)/g)) {
    const jalur = m[1]
    const badan = m[2]
    if (!/\.range\(/.test(badan)) continue
    if (/\/otomasi\//.test(jalur)) continue

    berhalaman += 1
    /*
      `total:` TELANJANG ikut dihitung jujur.

      ⚠ Versi pertama penjaga ini tak memuatnya, dan melaporkan TUJUH
      rute sebagai bisu padahal mereka sudah mengirim jumlahnya —
      termasuk `/finance/invoices`, jalur uang. Penjaga yang merah atas
      hal yang BENAR akan diabaikan seluruh keluarannya (CLAUDE.md §6),
      dan itu cara paling pasti membuat penjaga berhenti menjaga.

      Yang dituntut cuma satu: klien bisa TAHU masih ada sisa. `total`
      sudah cukup; `meta` lebih kaya tetapi bukan syarat.
    */
    const mengaku =
      /has_more|hasMore|total_?count|totalCount|terpotong|meta\s*:|\btotal\s*:/.test(badan)
    if (mengaku) jujur += 1
    else bisu.push(jalur)
  }
}

/*
  Korpus kosong bukan bukti apa pun — pola yang meleset memulangkan nol
  temuan, dan nol terbaca seperti "semuanya benar".
*/
if (berhalaman < 5) {
  console.error(`❌ Cuma ${berhalaman} rute berhalaman terbaca — polanya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

console.log('── daftar berhalaman jujur ──')
console.log(`  rute berhalaman : ${berhalaman}`)
console.log(`  mengaku         : ${jujur}`)
console.log(`  BISU            : ${bisu.length}`)

let lantai = null
if (existsSync(LANTAI)) {
  try {
    lantai = JSON.parse(baca(LANTAI))
  } catch {
    console.error('❌ lantai rusak — tak bisa dibaca sebagai JSON.')
    process.exit(1)
  }
}

if (process.argv.includes('--kunci')) {
  writeFileSync(LANTAI, JSON.stringify({ jumlah: bisu.length, nama: [...bisu].sort() }, null, 2) + '\n')
  console.log(`\n🔒 lantai dikunci di ${bisu.length}.`)
  process.exit(0)
}

if (!lantai) {
  console.error(`\n❌ ${LANTAI} belum ada. Tetapkan lantai dengan --kunci.`)
  process.exit(1)
}

/*
  Yang SUDAH jujur tak boleh mundur. Diperiksa per-NAMA, bukan per-angka:
  satu rute diperbaiki sementara satu lain mundur menghasilkan jumlah yang
  sama, dan penjaga yang cuma mencacah akan hijau atas kemunduran itu.
*/
const mundur = bisu.filter((b) => !(lantai.nama ?? []).includes(b))
if (mundur.length > 0) {
  console.error(`\n❌ ${mundur.length} rute MUNDUR jadi bisu:`)
  for (const m of mundur) console.error(`   • ${m}`)
  console.error('\n   Daftar berhalaman yang tak mengaku berhalaman membuat')
  console.error('   layar berhenti tanpa tanda — dan pembacanya menyimpulkan')
  console.error('   itulah semuanya. Sertakan `meta: { total, page, limit, pages }`')
  console.error('   seperti `audit.ts`; `count` dari query yang SAMA.')
  process.exit(1)
}

if (bisu.length > (lantai.jumlah ?? 0)) {
  console.error(`\n❌ rute bisu BERTAMBAH: ${bisu.length} (lantai ${lantai.jumlah}).`)
  process.exit(1)
}

if (bisu.length > 0) {
  console.log(`\n⚠ ${bisu.length} rute masih bisu (lantai ${lantai.jumlah}) — belum merah:`)
  for (const b of bisu) console.log(`   • ${b}`)
}

console.log(`\n✅ nol kemunduran; ${jujur} rute mengaku berhalaman.`)
