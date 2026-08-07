#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// PENJAGA: nominal dari PERMINTAAN tak boleh dibaca `parseFloat`/`Number` mentah
// ════════════════════════════════════════════════════════════════════════════
//
// ── Cacat yang melahirkannya, dengan jalur yang sudah dibuktikan
//
// `cash.ts` mencatat pengeluaran proyek begini:
//
//     const qtyNum = parseFloat(qty ?? '1')
//     const total  = parseFloat((qtyNum * priceNum).toFixed(2))
//     if (Number(acc.balance) < total) return 400 'Saldo tidak mencukupi'
//
// Kirim `qty: "abc"` dan seluruh rantai itu runtuh TANPA SATU PUN GEJALA.
// Diukur di Node DAN di Postgres pada 2026-08-08:
//
//   1. `parseFloat('abc')` → NaN, jadi `total` → NaN
//   2. `0 < NaN` bernilai **false** → cek saldo LOLOS, berapa pun saldonya
//   3. Postgres `numeric` **MENERIMA NaN** — kolom NOT NULL tak menahannya
//   4. `CHECK (qty > 0)` juga LOLOS — perbandingan NaN di Postgres bernilai true
//   5. `SELECT sum(v)` atas (100, 250, NaN) = **NaN**
//
// Poin 5 yang paling mahal: satu baris rusak membuat total SELURUH laporan tak
// punya angka. Dan request-nya membalas 201, jadi tak ada yang tahu sampai
// seseorang membuka laporan berminggu-minggu kemudian.
//
// ── Yang dijaga, dan kenapa bentuknya ratchet
//
// Diukur: 24 pemanggilan `parseFloat` di `routes/v1`. Sebagian besar membaca
// nilai yang datang dari BASIS (sudah numeric, tak mungkin NaN) — itu tak
// berbahaya, dan menuntut semuanya diubah sekaligus akan menghasilkan
// perubahan besar yang tak bisa ditinjau dengan sungguh-sungguh.
//
// Karena itu yang dijaga: **jumlahnya tak boleh naik.** Yang menulis kode baru
// memakai `bacaNominal`; yang lama turun sendiri saat berkasnya disentuh.
//
// ── Kenapa `Number(...)` TIDAK ikut dijaga
//
// `Number()` dipakai di ratusan tempat untuk nilai dari basis — melarangnya
// akan menghasilkan penjaga yang merah abadi dan diabaikan. Yang dijaga
// khusus `parseFloat`, karena ia punya cacat TAMBAHAN yang tak dimiliki
// `Number`: `parseFloat('12abc')` = 12. Ia membaca sejauh yang bisa lalu
// berhenti diam-diam, jadi salah ketik menjadi ANGKA YANG SALAH alih-alih
// ditolak. Itu lebih buruk daripada NaN — NaN setidaknya kentara.
//
// Jalankan (dari apps/api): node scripts/audit-nominal-mentah.mjs
//                           node scripts/audit-nominal-mentah.mjs --naikkan
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const RUTE = join(AKAR, 'src/routes/v1')
const LANTAI = join(AKAR, 'scripts/nominal-lantai.json')

const berkas = readdirSync(RUTE).filter((f) => f.endsWith('.ts'))

const temuan = []
for (const f of berkas) {
  const isi = readFileSync(join(RUTE, f), 'utf8')
  isi.split(/\r?\n/).forEach((baris, i) => {
    if (!/parseFloat\s*\(/.test(baris)) return
    // Komentar tak dihitung — berkas ini sendiri menjelaskan cacatnya dengan
    // menuliskan contoh kodenya.
    if (/^\s*(\/\/|\*|\/\*)/.test(baris)) return
    temuan.push(`${f}:${i + 1}  ${baris.trim().slice(0, 88)}`)
  })
}

console.log('\n══ Nominal mentah (parseFloat di routes/v1) ═══════════════════')
console.log(`  berkas dipindai : ${berkas.length}`)
console.log(`  parseFloat      : ${temuan.length}`)

const naikkan = process.argv.includes('--naikkan')
const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))

if (naikkan) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, parseFloat: temuan.length }, null, 2) + '\n')
  console.log(`\nLantai diperbarui: parseFloat=${temuan.length}\n`)
  process.exit(0)
}

if (temuan.length > lantai.parseFloat) {
  console.error(`\n❌ MERAH — nominal mentah BERTAMBAH: ${temuan.length} > ambang ${lantai.parseFloat}\n`)
  for (const t of temuan.slice(0, 30)) console.error(`     ${t}`)
  console.error('')
  console.error('   Nilai dari permintaan (body/fields/query) WAJIB lewat')
  console.error('   `bacaNominal` dari `lib/nominal.ts` — ia menolak NaN,')
  console.error('   Infinity, teks separuh-angka, negatif, dan nilai di luar')
  console.error('   batas wajar, dengan pesan yang bisa dibaca penerimanya.')
  console.error('')
  console.error('   Untuk hasil PERKALIAN, pakai `bulatkanRupiah` — dua angka')
  console.error('   sah bisa menghasilkan Infinity saat dikalikan.')
  console.error('')
  process.exit(1)
}

console.log(`\n✅ Tidak bertambah (ambang ${lantai.parseFloat}).\n`)
process.exit(0)
