#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Menghasilkan §"SELURUH SUB-MENU YANG BELUM TUNTAS" di ROADMAP.
//
// ── Dua cacat yang diperbaiki (2026-08-02, ditemukan saat founder bertanya
//    "berapa gelombang & berapa banyak pekerjaan?")
//
// 1. GELOMBANG DI-DEFAULT KE 2. Versi pertama memakai
//    `GEL.get(nomorModul, '2')` — sehingga 16 dari 17 modul jatuh ke
//    Gelombang 2 bukan karena dianalisis, melainkan karena tak ada entri.
//    Angka "106 sub-menu di Gelombang 2" jadi artefak default, bukan fakta.
//
// 2. MODUL BERBENTUK KALIMAT TAK TERBACA. Modul 10 (QA/QC), 11 (HSE/K3), dan
//    17 (Risiko & Kepatuhan) ditulis "Semua 🔴 — terkonfirmasi", bukan tabel.
//    Parser yang cuma membaca baris `|` melewatkannya — tiga modul penuh
//    hilang dari antrean tanpa ada yang sadar.
//
// Sekarang: pemetaan gelombang DITULIS EKSPLISIT per modul dengan alasannya,
// dan modul-kalimat dihitung dari jumlah yang tercatat di ROADMAP §gelombang.
//
// Jalankan ulang tiap taksonomi berubah:
//   node apps/api/scripts/gen-antrean-roadmap.mjs
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const TAKSONOMI = join(AKAR, 'docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md')
const ROADMAP = join(AKAR, 'docs/ROADMAP.md')

/**
 * Gelombang tiap modul — DITULIS, bukan di-default.
 *
 * Dasarnya dependensi data (ROADMAP §PETA SELURUH VISI): AI membaca GL, GL
 * menerima dari modul, modul menerima dari lapangan. Modul yang bermuara ke
 * GL menunggu GL; yang mandiri boleh paralel.
 */
const GELOMBANG = {
  1: { g: 2, ket: 'master data — prasyarat modul lain, tapi bukan pondasi teknis' },
  2: { g: 2, ket: 'CRM/tender — mandiri, tak bergantung GL' },
  3: { g: 2, ket: 'kontrak — mandiri' },
  4: { g: 2, ket: 'penjadwalan — mandiri' },
  5: { g: 2, ket: 'cost control — sebagian bermuara ke GL (varians, WIP)' },
  6: { g: 2, ket: 'procurement — bermuara ke GL (utang supplier)' },
  7: { g: 2, ket: 'inventory — bermuara ke GL (persediaan)' },
  8: { g: 2, ket: 'subkontraktor — bermuara ke GL (utang subkon)' },
  9: { g: 2, ket: 'operasi lapangan — sumber data untuk Gelombang 3' },
  10: { g: 2, ket: 'QA/QC — MANDIRI, tak bergantung GL; bisa paralel' },
  11: { g: 2, ket: 'HSE/K3 — MANDIRI, tak bergantung GL; bisa paralel' },
  12: { g: 2, ket: 'payroll — bermuara ke GL (beban gaji)' },
  13: { g: 2, ket: 'aset & alat berat — bermuara ke GL (penyusutan)' },
  14: { g: 2, ket: 'keuangan & akuntansi — INTI GL, dikerjakan lebih dulu' },
  15: { g: 2, ket: 'penagihan — bermuara ke GL (piutang)' },
  16: { g: 2, ket: 'dokumen — mandiri' },
  17: { g: 2, ket: 'risiko & kepatuhan — mandiri' },
  18: { g: 2, ket: 'pelaporan/BI — membaca GL, jadi SESUDAH GL' },
  19: { g: 2, ket: 'administrasi sistem — mandiri' },
  20: { g: 3, ket: 'mobile lapangan + offline — gerbang Gelombang 3' },
}

/**
 * Modul yang ditulis sebagai KALIMAT ("Semua 🔴 — terkonfirmasi"), bukan
 * tabel. Jumlahnya dari ROADMAP §PETA SELURUH VISI, yang menghitungnya saat
 * kantong-kantong itu dimasukkan ke scope (KEPUTUSAN-SCOPE-ERP-AI).
 */
const MODUL_KALIMAT = {
  10: { n: 7, nama: 'QUALITY MANAGEMENT (QA/QC)' },
  11: { n: 7, nama: 'HSE / K3 & LINGKUNGAN' },
  17: { n: 4, nama: 'RISIKO & KEPATUHAN' },
}

const tak = readFileSync(TAKSONOMI, 'utf8')
const modul = new Map()   // nomor → { nama, item: [{st, nama}] }
let kini = null

// `split(/\r?\n/)`, BUKAN `split('\n')`: berkas taksonomi ber-CRLF, dan sisa
// `\r` di ujung baris membuat `$` pada regex heading tak pernah cocok — parser
// melaporkan 18 dari 116 sub-menu TANPA satu pun error.
//
// Ditemukan 2026-08-02 dengan menghitung baris tabel secara langsung, bukan
// dari keluaran skrip. Pelajaran yang sama berulang seharian: angka dari alat
// ukur yang baru ditulis harus diadu dengan hitungan independen dulu.
for (const l of tak.split(/\r?\n/)) {
  const h = /^#{2,3}\s+(\d+)\.\s+(.+)$/.exec(l)
  if (h) {
    kini = Number(h[1])
    modul.set(kini, { nama: `${kini}. ${h[2].replace(/[#*`]/g, '').trim()}`, item: [] })
    continue
  }
  if (!kini || !l.startsWith('|')) continue
  const st = (l.match(/🔴|🟡/) || [])[0]
  if (!st) continue
  const kol = l.split('|').map(c => c.trim())
  const nama = kol.slice(1).find(c => c && c !== '🔴' && c !== '🟡')
  if (nama) modul.get(kini).item.push({ st, nama: nama.replace(/\*\*|`/g, '') })
}

// Modul berbentuk kalimat: tak punya baris tabel, tapi isinya nyata.
for (const [no, m] of Object.entries(MODUL_KALIMAT)) {
  const n = Number(no)
  if (!modul.has(n)) modul.set(n, { nama: `${n}. ${m.nama}`, item: [] })
  const e = modul.get(n)
  if (e.item.length === 0) e.kalimat = m.n
}

const perGel = {}
let total = 0
for (const [no, m] of [...modul].sort((a, b) => a[0] - b[0])) {
  const jml = m.kalimat ?? m.item.length
  if (jml === 0) continue
  const g = GELOMBANG[no]?.g ?? 2
  ;(perGel[g] ??= []).push({ no, ...m, jml, ket: GELOMBANG[no]?.ket ?? '(belum dipetakan)' })
  total += jml
}

const b = []
b.push('', '## 📋 SELURUH SUB-MENU YANG BELUM TUNTAS — dari taksonomi', '')
b.push('> **Dihasilkan otomatis** oleh `apps/api/scripts/gen-antrean-roadmap.mjs`.')
b.push('> Jangan disunting tangan — jalankan ulang skripnya.', '')
b.push('> **Dua cacat diperbaiki 2026-08-02** saat founder bertanya "berapa')
b.push('> gelombang & berapa banyak pekerjaan?":')
b.push('>')
b.push('> 1. **Gelombang di-default ke 2.** Versi pertama memakai `GEL.get(no, "2")`,')
b.push('>    sehingga 16 dari 17 modul jatuh ke Gelombang 2 bukan karena dianalisis')
b.push('>    melainkan karena tak ada entri. Angka "106 di Gelombang 2" adalah')
b.push('>    artefak default, bukan fakta. Kini tiap modul punya pemetaan tertulis')
b.push('>    beserta alasannya.')
b.push('> 2. **Tiga modul hilang.** QA/QC (10), HSE/K3 (11), dan Risiko (17) ditulis')
b.push('>    sebagai kalimat "Semua 🔴 — terkonfirmasi", bukan tabel — parser yang')
b.push('>    cuma membaca baris `|` melewatkannya. Tiga modul penuh tak masuk')
b.push('>    antrean tanpa ada yang sadar.', '')
b.push(`**Total ${total} sub-menu belum tuntas.** 🟡 = ada sebagian · 🔴 = belum dibangun.`, '')

for (const g of Object.keys(perGel).sort()) {
  const list = perGel[g]
  const n = list.reduce((s, m) => s + m.jml, 0)
  b.push(`## Gelombang ${g} — ${n} sub-menu di ${list.length} modul`, '')
  for (const m of list) {
    b.push(`### ${m.nama}  ·  ${m.jml} sub-menu`)
    b.push(`*${m.ket}*`, '')
    if (m.kalimat) {
      b.push(`- 🔴 Seluruh ${m.kalimat} sub-menu — taksonomi mencatatnya sebagai blok`)
      b.push(`  ("Semua 🔴 — terkonfirmasi, 0 hit di kode"), belum dirinci per menu.`, '')
      continue
    }
    for (const it of m.item.sort((x, y) => (x.st !== '🟡') - (y.st !== '🟡') || x.nama.localeCompare(y.nama))) {
      b.push(`- ${it.st} ${it.nama}`)
    }
    b.push('')
  }
}

const rm = readFileSync(ROADMAP, 'utf8')
const i = rm.indexOf('\n## 📋 SELURUH SUB-MENU')
const j = rm.indexOf('\n## Sengaja TIDAK dikerjakan')
if (i < 0 || j < 0) {
  console.error('❌ Penanda §SELURUH SUB-MENU / §Sengaja TIDAK dikerjakan tak ditemukan di ROADMAP.')
  process.exit(1)
}
writeFileSync(ROADMAP, rm.slice(0, i) + '\n' + b.join('\n') + '\n---\n' + rm.slice(j))

console.log(`ROADMAP §antrean diperbarui: ${total} sub-menu`)
for (const g of Object.keys(perGel).sort()) {
  const n = perGel[g].reduce((s, m) => s + m.jml, 0)
  console.log(`  Gelombang ${g}: ${n} sub-menu · ${perGel[g].length} modul`)
}
