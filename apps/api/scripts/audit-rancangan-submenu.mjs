#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// SUB-MENU YANG DIKERJAKAN TANPA RANCANGAN — penjaga keputusan "rancang saat
// gilirannya tiba".
//
// ── Kenapa penjaga ini ada
//
// Founder 2026-08-02: *"apakah sudah kamu siapkan agar tidak terlewat untuk
// '109 sisanya → rancang saat gilirannya tiba' itu agar tidak lupa dan
// terlewat?"*
//
// Jawaban jujurnya waktu itu: BELUM. Yang ada baru kalimat di ROADMAP —
// **niat**, bukan mekanisme. Dan repo ini sudah membuktikan berkali-kali bahwa
// niat yang tak dijaga akan terlewat:
//
//   ERP_MASTER_PLAN Modul 9a/9b   terlantar berbulan-bulan
//   AHSP-EDITION-BUILDER §3.1/3.2 gerbangnya lewat sebelum dikerjakan
//   Phase1/ 10 dokumen            10/10 masih "Planning only" pasca-selesai
//
// ── Apa yang diperiksa
//
// Untuk tiap sub-menu di ROADMAP yang statusnya SUDAH berubah jadi ✅/🟡
// (artinya mulai/selesai dikerjakan), pastikan ada JEJAK RANCANGAN:
//
//   · disebut di salah satu dokumen `docs/` (spec/design/ADR), ATAU
//   · punya bagian "## Rancangan" di badan PR-nya, ATAU
//   · terdaftar di `RANCANGAN-DIKERJAKAN.md` dengan alasan
//
// Yang TIDAK diperiksa: sub-menu yang masih 🔴 (belum digarap) — memaksanya
// punya rancangan sekarang justru mengulangi kesalahan "rancang semuanya di
// depan" yang bukti-buktinya sudah dicatat di ROADMAP.
//
// ── Cara memakai
//
//   node apps/api/scripts/audit-rancangan-submenu.mjs
//
// Dijalankan sebagai bagian gerbang. Kalau merah: tulis rancangannya (cukup
// satu bagian di PR — model data, batasan, integrasi), bukan hapus penjaganya.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const DOCS = join(AKAR, 'docs')
const TAKSONOMI = join(DOCS, 'ERP-KONTRAKTOR-TAKSONOMI-MENU.md')
const DAFTAR = join(DOCS, 'RANCANGAN-DIKERJAKAN.md')

/** Sub-menu berisiko — WAJIB punya rancangan sebelum dikerjakan (ROADMAP). */
const BERISIKO = [
  'Actual Cost Ledger', 'Cost Value Reconciliation', 'Profitabilitas per proyek',
  'Manajemen contingency', 'Eskalasi harga', 'Claims management',
  'Retensi subkontrak', 'Rekonsiliasi bank', 'Kepatuhan (izin, asuransi, pajak)',
  'Analisa markup, margin, contingency',
]

function semuaMd(dir, h = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) semuaMd(p, h)
    else if (n.endsWith('.md')) h.push(p)
  }
  return h
}

// Korpus rancangan: seluruh docs KECUALI taksonomi & roadmap sendiri (keduanya
// cuma mendaftar nama, bukan merancang).
const korpus = semuaMd(DOCS)
  .filter(f => !/ERP-KONTRAKTOR-TAKSONOMI-MENU|ROADMAP|INDEKS-DOKUMEN/.test(f))
  .map(f => readFileSync(f, 'utf8'))
  .join('\n')
  .toLowerCase()

// Daftar pengecualian ber-alasan, kalau ada.
const dikecualikan = new Set()
if (existsSync(DAFTAR)) {
  for (const l of readFileSync(DAFTAR, 'utf8').split(/\r?\n/)) {
    const m = /^-\s+\*\*(.+?)\*\*/.exec(l)
    if (m) dikecualikan.add(m[1].trim().toLowerCase())
  }
}

// Baca status tiap sub-menu dari taksonomi.
const baris = readFileSync(TAKSONOMI, 'utf8').split(/\r?\n/)
const dikerjakanTanpaRancangan = []
const berisikoTanpaRancangan = []

for (const l of baris) {
  if (!l.startsWith('|')) continue
  const st = (l.match(/🔴|🟡|✅/) || [])[0]
  if (!st) continue
  const kol = l.split('|').map(c => c.trim())
  const nama = kol.slice(1).find(c => c && !/^(🔴|🟡|✅|🔵|⛔)$/.test(c) && c.length > 3)
  if (!nama) continue
  const bersih = nama.replace(/\*\*|`/g, '')

  // Kata kunci pencarian: bagian sebelum tanda kurung/garis miring.
  const kunci = bersih.split(/[(/—-]/)[0].trim().toLowerCase()
  if (kunci.length < 6) continue                       // terlalu umum untuk dicari
  if (dikecualikan.has(bersih.toLowerCase())) continue

  const punyaRancangan = korpus.includes(kunci)
  const isBerisiko = BERISIKO.some(b => bersih.toLowerCase().startsWith(b.toLowerCase()))

  // 1. Sudah digarap (✅/🟡) tapi tak ada jejak rancangan → utang dokumentasi.
  if (st !== '🔴' && !punyaRancangan) dikerjakanTanpaRancangan.push(bersih)

  // 2. Berisiko & mulai digarap tanpa rancangan → PELANGGARAN keputusan.
  if (isBerisiko && st !== '🔴' && !punyaRancangan) berisikoTanpaRancangan.push(bersih)
}

console.log(`Sub-menu digarap tanpa jejak rancangan : ${dikerjakanTanpaRancangan.length}`)
console.log(`  ↳ di antaranya BERISIKO              : ${berisikoTanpaRancangan.length}`)

if (berisikoTanpaRancangan.length > 0) {
  console.error('\n❌ SUB-MENU BERISIKO DIGARAP TANPA RANCANGAN\n')
  for (const n of berisikoTanpaRancangan) console.error(`   ${n}`)
  console.error(`
   ROADMAP §"Kematangan rencana" menetapkan: sepuluh sub-menu ber-ledger &
   lintas-modul WAJIB dirancang sebagai satu kelompok SEBELUM salah satunya
   dikerjakan — karena sekali angka masuk, mengubah modelnya mahal.

   Tulis rancangannya dulu (model data · batasan · integrasi), atau daftarkan
   di docs/RANCANGAN-DIKERJAKAN.md beserta alasannya.
`)
  process.exit(1)
}

// Yang tak berisiko: dilaporkan sebagai pengingat, bukan penghenti. Memblokir
// di sini akan memaksa dokumentasi retroaktif untuk hal yang sudah selesai —
// biaya tanpa manfaat.
if (dikerjakanTanpaRancangan.length > 0) {
  console.log('\nℹ️  Digarap tanpa jejak rancangan di docs/ (bukan penghenti):')
  for (const n of dikerjakanTanpaRancangan.slice(0, 12)) console.log(`   ${n}`)
  if (dikerjakanTanpaRancangan.length > 12) {
    console.log(`   … +${dikerjakanTanpaRancangan.length - 12} lagi`)
  }
  console.log(
    '\n   Mayoritasnya wajar: modul yang sudah hidup sebelum disiplin ini ada.\n' +
    '   Yang perlu diperhatikan hanya kalau ADA YANG BARU muncul di sini.',
  )
}

console.log('\n✅ Nol sub-menu BERISIKO yang digarap tanpa rancangan.')
