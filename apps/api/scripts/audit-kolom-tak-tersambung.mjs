#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// PENJAGA: kolom yang API baca/terima, tapi UI tak punya cara mengisinya.
// ════════════════════════════════════════════════════════════════════════════
//
// ── Cacat yang melahirkannya — tiga kali, dan lolos tiap kali
//
// Pola yang sama muncul tiga kali dalam dua hari, dan seluruh 17 penjaga CI
// hijau setiap kalinya:
//
//   2026-08-07  `rfq.po_id`      DIBACA di UI, tak pernah DITULIS siapa pun
//   2026-08-08  `POST /rfq/:id/penawaran`  hidup & ber-test, NOL tombol
//               memanggilnya — layar berhenti di "Belum ada penawaran masuk"
//   2026-08-08  `rfq.mr_id`      ada di schema, rute POST menerimanya,
//               UI nol rujukan → 3 dari 3 RFQ ber-`mr_id` NULL
//
// Bentuknya selalu identik: **tiap bagian ada dan ber-test sendiri-sendiri,
// hanya sambungannya yang tidak.** Dan ia lolos JUSTRU karena tiap bagiannya
// ber-test — test satuan membuktikan potongan bekerja, bukan bahwa potongan
// itu terhubung ke apa pun.
//
// Akibatnya bukan galat. Akibatnya kolom yang selamanya NULL, dan pertanyaan
// yang tak terjawab: "RFQ ini untuk kebutuhan apa?", "PO mana yang lahir dari
// RFQ ini?". Laporan tetap tampil rapi, hanya kehilangan satu kolom yang tak
// pernah ada isinya.
//
// ── Yang diperiksa
//
// Kolom `*_id` yang dibaca dari **body request** (`b.xxx_id` / `body.xxx_id`)
// di rute API — artinya rute itu MENGHARAPKANNYA DATANG DARI KLIEN — tapi
// **nol** disebut di seluruh `apps/web`.
//
// Kalau tak satu pun berkas UI menyebutkan namanya, tak ada layar yang bisa
// mengirimnya. Rute menunggu sesuatu yang tak akan pernah datang.
//
// Sinyalnya sengaja SEMPIT. Versi pertama penjaga ini memeriksa semua `*_id`
// yang muncul di mana pun di `routes/`, dan menemukan 64 — termasuk parameter
// path (`rfq_id`, `gr_id`) dan kolom yang memang diisi server. Penjaga yang
// berteriak 64 kali akan diabaikan, dan penjaga yang diabaikan sama tak
// bergunanya dengan penjaga yang tak ada.
//
// ── Kenapa STATIS, bukan menghitung baris NULL di basis
//
// Menghitung NULL butuh koneksi, dan CI menjalankan penjaga sebelum ada basis
// yang terisi. Lebih penting lagi: basis dev berisi data dummy, jadi "nol
// terisi" di sana tak membuktikan apa pun tentang produksi. Yang benar-benar
// menentukan adalah **apakah ADA JALAN mengisinya** — dan itu pertanyaan
// tentang kode, bukan tentang data.
//
// ── Kenapa RATCHET
//
// Diukur 2026-08-08: 36 kolom FK opsional nol terisi di basis dev, dan
// sebagian di antaranya SAH kosong (`company_id` pada tabel global, `parent_id`
// pada hierarki yang memang datar). Membedakannya butuh keputusan per-kolom,
// bukan aturan.
//
// Yang dijaga: **jumlahnya tak boleh naik.** Kolom baru yang diterima API
// wajib punya jalan pengisian di UI, atau dinyatakan sengaja di berkas lantai
// dengan alasan tertulis.
//
// Jalankan: node apps/api/scripts/audit-kolom-tak-tersambung.mjs
//           node apps/api/scripts/audit-kolom-tak-tersambung.mjs --naikkan
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const LANTAI = join(AKAR, 'apps/api/scripts/kolom-tersambung-lantai.json')
const NAIKKAN = process.argv.includes('--naikkan')

const API = [join(AKAR, 'apps/api/src/routes'), join(AKAR, 'apps/api/src/utils')]
const WEB = [join(AKAR, 'apps/web/app'), join(AKAR, 'apps/web/components'), join(AKAR, 'apps/web/lib')]

/**
 * Kolom yang TIDAK dihitung sebagai sambungan yang hilang.
 *
 * Bukan daftar pengecualian sembarangan — tiap kelompok punya alasan yang
 * membuatnya mustahil, bukan sekadar belum:
 */
const DIKECUALIKAN = [
  // Diisi server dari sesi/tenant. UI TIDAK BOLEH mengirimnya — kalau bisa,
  // itu justru celah: klien memilih tenant-nya sendiri.
  /^(company_id|tenant_id|created_by|updated_by|deleted_by|user_id|auth_id)$/,
  // Kunci utama dan penunjuk diri sendiri.
  /^(id|parent_id)$/,
  // Diturunkan sistem saat kejadian, bukan dipilih manusia.
  /^(journal_entry_id|audit_id|session_id)$/,
]

function berkas(akar, ekstensi) {
  const hasil = []
  const telusuri = (d) => {
    if (!existsSync(d)) return
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n === '.next' || n === '__tests__') continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) telusuri(p)
      else if (ekstensi.some((e) => n.endsWith(e))) hasil.push(p)
    }
  }
  telusuri(akar)
  return hasil
}

/** Buang komentar — nama yang hanya DISEBUT di komentar bukan jalan pengisian. */
const tanpaKomentar = (isi) =>
  isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Kolom yang rute BACA DARI BODY — `b.xxx_id` / `body.xxx_id`.
 *
 * Inilah yang benar-benar diharapkan datang dari klien. Parameter path
 * (`request.params`) dan kolom yang diisi server tidak tertangkap pola ini,
 * dan memang tak seharusnya.
 */
function dariBody(akar) {
  const nama = new Map()
  for (const p of akar.flatMap((a) => berkas(a, ['.ts']))) {
    const kode = tanpaKomentar(readFileSync(p, 'utf8'))

    // `b`/`body` harus BENAR-BENAR berasal dari `request.body`, dan
    // pemakaiannya harus DEKAT dengan deklarasinya.
    //
    // ── Dua putaran positif palsu, keduanya 2026-08-08
    //
    // 1. Versi pertama menangkap `b.<kolom>_id` di berkas mana pun. Tapi `b`
    //    juga nama pendek yang lazim untuk baris hasil query, sehingga
    //    `baris.map((b) => b.alur_id)` di `otomasi-alur.ts` tertangkap sebagai
    //    "kolom yang diharapkan dari klien" — padahal ia properti baris yang
    //    baru saja dibaca DARI basis.
    //
    // 2. Memeriksa "berkas punya `const b = request.body`" TETAP salah:
    //    `otomasi-alur.ts` punya keduanya — deklarasi di baris ~121, dan
    //    `map((b) => b.alur_id)` di baris ~427. Variabel `b` yang berbeda,
    //    berkas yang sama.
    //
    // Yang dipakai sekarang: pemakaian dihitung hanya bila ada deklarasi
    // `request.body` dalam 60 baris SEBELUMNYA. Bukan analisis lingkup
    // sungguhan, tapi cukup memisahkan handler dari callback jauh di bawahnya.
    //
    // Kenapa ini penting: penjaga yang menuduh kode yang benar akan dimatikan
    // orang, dan penjaga yang dimatikan tak menjaga apa pun.
    const barisKode = kode.split('\n')
    const dekatBody = (i) => {
      for (let j = i; j >= Math.max(0, i - 60); j--) {
        if (/(?:const|let)\s+(?:b|body)\s*=\s*request\.body/.test(barisKode[j])) return true
      }
      return false
    }

    barisKode.forEach((teks, i) => {
      if (!dekatBody(i)) return
      for (const m of teks.matchAll(/\b(?:b|body)\.([a-z][a-z0-9]*(?:_[a-z0-9]+)*_id)\b/g)) {
        if (!nama.has(m[1])) nama.set(m[1], new Set())
        nama.get(m[1]).add(p)
      }
    })
  }
  return nama
}

/** Semua nama `*_id` yang muncul di sekumpulan berkas UI. */
function kumpulkanNama(akar, ekstensi) {
  const nama = new Set()
  for (const p of akar.flatMap((a) => berkas(a, ekstensi))) {
    for (const m of tanpaKomentar(readFileSync(p, 'utf8'))
      .matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)*_id)\b/g)) nama.add(m[1])
  }
  return nama
}

const diApi = dariBody(API)
const diWeb = kumpulkanNama(WEB, ['.ts', '.tsx'])

const temuan = []
for (const [nama, berkasApi] of diApi) {
  if (DIKECUALIKAN.some((r) => r.test(nama))) continue
  if (diWeb.has(nama)) continue
  temuan.push({ nama, berkas: berkasApi.size })
}
temuan.sort((a, b) => b.berkas - a.berkas || a.nama.localeCompare(b.nama))

const lantai = existsSync(LANTAI)
  ? JSON.parse(readFileSync(LANTAI, 'utf8'))
  : { jumlah: temuan.length, kolom: {}, catatan: '' }

console.log('\n  PENJAGA: kolom yang API kenal tapi UI tak punya cara mengisinya\n')
console.log(`  ditemukan  : ${temuan.length}`)
console.log(`  lantai     : ${lantai.jumlah}\n`)

const disengaja = new Set(Object.keys(lantai.kolom ?? {}))
const baru = temuan.filter((t) => !disengaja.has(t.nama))

if (temuan.length > 0) {
  for (const t of temuan) {
    const alasan = lantai.kolom?.[t.nama]
    console.log(`   · ${t.nama.padEnd(28)} ${String(t.berkas).padStart(2)} berkas API` +
      (alasan ? `  — sengaja: ${alasan}` : ''))
  }
  console.log('')
}

if (NAIKKAN) {
  writeFileSync(LANTAI, JSON.stringify({
    ...lantai,
    jumlah: temuan.length,
    kolom: Object.fromEntries(temuan.map((t) => [t.nama, lantai.kolom?.[t.nama] ?? 'BELUM DIJELASKAN'])),
  }, null, 2) + '\n')
  console.log(`  ✏️  lantai dinaikkan ke ${temuan.length}. Isi alasan tiap kolom yang "BELUM DIJELASKAN".\n`)
  process.exit(0)
}

if (temuan.length > lantai.jumlah) {
  console.error(`  ❌ NAIK dari ${lantai.jumlah} ke ${temuan.length}.\n`)
  for (const t of baru) console.error(`     · ${t.nama}`)
  console.error(`
     Kolom yang diterima API tapi tak punya jalan pengisian di UI akan
     selamanya NULL — dan pertanyaan yang ia jawab tak pernah terjawab.
     Pola ini sudah lolos TIGA KALI (po_id, endpoint penawaran, mr_id).

     Pilih satu:
       • bangun jalan pengisiannya di UI, atau
       • nyatakan sengaja di ${LANTAI.replace(AKAR, '')} beserta ALASANNYA
`)
  process.exit(1)
}

const belumDijelaskan = Object.entries(lantai.kolom ?? {})
  .filter(([n, a]) => a === 'BELUM DIJELASKAN' && temuan.some((t) => t.nama === n))
if (belumDijelaskan.length > 0) {
  console.error(`  ❌ ${belumDijelaskan.length} kolom di lantai belum punya alasan tertulis:\n`)
  for (const [n] of belumDijelaskan) console.error(`     · ${n}`)
  console.error('\n     Lantai tanpa alasan adalah daftar yang tak bisa ditinjau siapa pun.\n')
  process.exit(1)
}

if (temuan.length < lantai.jumlah) {
  console.log(`  ✅ TURUN dari ${lantai.jumlah} ke ${temuan.length}. Turunkan lantainya:`)
  console.log('     node apps/api/scripts/audit-kolom-tak-tersambung.mjs --naikkan\n')
  process.exit(0)
}

console.log('  ✅ Tidak ada sambungan baru yang hilang.\n')
process.exit(0)
