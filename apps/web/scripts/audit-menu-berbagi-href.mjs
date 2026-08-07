#!/usr/bin/env node
/**
 * MENU BERBAGI HREF — label menjanjikan hal spesifik, yang muncul halaman umum.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pada 2026-08-07 diukur: **144 item menu berbagi 27 href**. `/proyek` sendiri
 * dipakai 22 item — klik "Cost Baseline (BAC)" mendarat di daftar proyek biasa,
 * klik "Denda Keterlambatan" juga, klik "Kurva S" juga.
 *
 * Bahayanya bukan estetika. Pengguna belajar bahwa **sub-menu tak bisa
 * dipercaya**, lalu berhenti memakainya — dan itu menghapus seluruh nilai dari
 * taksonomi 191 sub-menu yang disusun justru supaya orang bisa menemukan
 * sesuatu. Menu yang diabaikan sama saja dengan menu yang tak ada.
 *
 * ── Kenapa RATCHET, bukan larangan mutlak
 *
 * Berbagi href tidak selalu salah. "Upah Harian & Borongan" dan "Upah Harian
 * Lapangan" memang dua nama untuk satu halaman `/mandor/upah`, dan itu sah:
 * dua kelompok berbeda (Mandor, SDM) mencari hal yang sama. Melarangnya akan
 * memaksa salah satu kelompok kehilangan jalan masuk.
 *
 * Yang dijaga adalah **arahnya**: angka hari ini adalah lantai. Sub-menu baru
 * yang ditambahkan tanpa tujuan sendiri akan menaikkannya, dan itu merah.
 *
 * ── `/m/<key>` sengaja dikecualikan
 *
 * Seluruhnya dilayani satu route dinamis, tapi tiap key menampilkan isi
 * berbeda dari `PETA_MENU` — ia BUKAN "banyak menu, satu halaman". Justru
 * sebaliknya: `/m/<key>` adalah jawaban yang jujur untuk menu yang halamannya
 * belum ada.
 *
 * ── Hubungannya dengan `lib/menu-berbagi-href.ts`
 *
 * Berkas itu menangani GEJALA VISUAL-nya: saat satu href dipakai >1 item, hanya
 * satu "wakil" yang menyala, sisanya diredupkan dengan titik penanda. Ia matang
 * dan tetap dipakai. Yang TIDAK bisa dilakukannya: membuat orang yang mengklik
 * "Cost Baseline (BAC)" mendarat di cost baseline. Penjaga ini menjaga agar
 * jumlah kasus semacam itu tak bertambah.
 *
 * ── DB tak terhubung
 *
 * Berhenti exit 0 dan MENGATAKANNYA — penjaga yang diam-diam melewatkan diri
 * lebih berbahaya daripada penjaga yang absen.
 *
 * Pakai (dari akar repo): node apps/web/scripts/audit-menu-berbagi-href.mjs
 *                         node apps/web/scripts/audit-menu-berbagi-href.mjs --naikkan
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const LANTAI = join(AKAR, 'apps', 'web', 'scripts', 'lantai-nav.json')

let baris
try {
  const koneksi = await import(
    'file://' + join(AKAR, 'scripts', 'db', '_koneksi.mjs').replace(/\\/g, '/'))
  const db = koneksi.buatClient('DIRECT_URL')
  await db.connect()
  const r = await db.query(`
    SELECT href, count(*)::int AS n, string_agg(label, ' · ' ORDER BY label) AS label
      FROM menu_items
     WHERE is_active AND href IS NOT NULL AND href NOT LIKE '/m/%'
     GROUP BY href HAVING count(*) > 1
     ORDER BY count(*) DESC, href`)
  await db.end()
  baris = r.rows
} catch (e) {
  console.log('⚠️  DB tak terhubung — pemeriksaan DILEWATI, bukan dinyatakan lulus.')
  console.log(`   ${e.message.slice(0, 100)}`)
  process.exit(0)
}

const item = baris.reduce((s, r) => s + r.n, 0)

console.log('\n══ Menu berbagi href ══════════════════════════════════════════')
console.log(`  href dipakai >1 item : ${baris.length}`)
console.log(`  item terlibat        : ${item}`)

if (baris.length) {
  console.log('\n— terbesar dulu:')
  for (const r of baris.slice(0, 12)) {
    console.log(`   ${String(r.n).padStart(3)}  ${r.href}`)
    console.log(`        ${r.label.slice(0, 96)}${r.label.length > 96 ? '…' : ''}`)
  }
  if (baris.length > 12) console.log(`   … dan ${baris.length - 12} href lagi`)
}

// ── Ratchet ─────────────────────────────────────────────────────────────────
// ── Yang diukur: JUMLAH ITEM, bukan jumlah href ────────────────────────────
//
// `berbagiHref` (banyaknya href yang dipakai >1 item) terlihat masuk akal, tapi
// ia BERGERAK KE ARAH SALAH saat keadaan membaik. Contoh nyata 2026-08-07:
// memecah 8 item `/laporan` ke tiga tab berbeda menurunkan item 96 → 87 —
// perbaikan jelas — sementara jumlah href-nya justru NAIK 23 → 25, karena
// `?tab=wip` dan `?tab=pajak` adalah dua href baru yang masing-masing dipakai
// dua item.
//
// Penjaga yang merah saat pekerjaan membaik akan dimatikan orang, dan penjaga
// yang dimatikan tak menjaga apa pun. Yang benar-benar merugikan pengguna
// adalah **berapa banyak item yang mendarat di tempat yang tak mereka minta** —
// dan itu `berbagiItem`.
//
// `berbagiHref` tetap DILAPORKAN (berguna untuk membaca sebarannya) tapi tidak
// lagi di-ratchet.
const kini = { berbagiItem: item }

let lantai
try {
  lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
} catch {
  lantai = {}
}

// Kunci yang diperiksa, BUKAN kunci lama `berbagiHref` yang sudah dibuang.
// Menguji kunci yang tak ada membuat penjaga menimpa lantainya diam-diam pada
// setiap run — dan sejak itu ia tak pernah merah lagi, apa pun yang terjadi.
if (lantai.berbagiItem === undefined) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, ...kini }, null, 2) + '\n')
  console.log('\nLantai dibuat pertama kali.')
  process.exit(0)
}

if (process.argv.includes('--naikkan')) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, ...kini }, null, 2) + '\n')
  console.log(`\nLantai diperbarui: ${JSON.stringify(kini)}`)
  process.exit(0)
}

let merah = false
for (const k of Object.keys(kini)) {
  if (kini[k] > lantai[k]) {
    console.error(`\nMERAH: ${k} naik ${lantai[k]} -> ${kini[k]}`)
    console.error('  Sub-menu baru wajib punya tujuan sendiri. Kalau halamannya')
    console.error('  belum ada, arahkan ke /m/<key> — itu jujur, dan tak dihitung.')
    merah = true
  } else if (kini[k] < lantai[k]) {
    console.log(`Turun: ${k} ${lantai[k]} -> ${kini[k]}. Kunci dengan --naikkan`)
  }
}
if (!merah) console.log('\n✅ Tidak bertambah.')
console.log()
process.exit(merah ? 1 : 0)
