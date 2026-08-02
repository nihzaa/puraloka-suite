#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Dokumen di `docs/` yang TIDAK terhubung ke ROADMAP.
//
// Founder 2026-08-02: "pastikan semua dokumen di docs itu juga dimasukkan ke
// dalam roadmap agar bisa dikerjakan dan saling terhubung semuanya."
//
// Masalah nyatanya: rencana yang ditulis rapi lalu tak pernah dikerjakan —
// bukan karena diputuskan ditunda, melainkan karena tak ada yang tahu ia ada.
// Repo ini sudah punya preseden: `ERP_MASTER_PLAN` Modul 9a/9b,
// `AHSP-EDITION-BUILDER-DESIGN` §3.5, `GOLDEN-FILE-SPEC` paritas end-to-end —
// semuanya "rancangan terlantar" yang baru ketahuan saat audit menyeluruh.
//
// ── Yang dilaporkan, dan yang TIDAK
//
// Skrip ini TIDAK menuntut semua 236 dokumen masuk roadmap. Sebagian besar
// memang bukan pekerjaan:
//
//   arsip/riwayat  — `docs/archive/**`, DEVELOPMENT_LOG, journal
//   aturan tetap   — Engineering-Constitution, ADR, protokol sesi
//   status/audit   — PHASE-*-STATUS, *-COMPLETION-AUDIT
//
// Yang harus terhubung: dokumen yang ISINYA rencana kerja — spec, design,
// plan, blueprint, execution — karena di situlah pekerjaan bisa hilang.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, basename, sep, relative } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const DOCS = join(AKAR, 'docs')

function semuaMd(dir, hasil = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) semuaMd(p, hasil)
    else if (n.endsWith('.md')) hasil.push(p)
  }
  return hasil
}

const roadmap = readFileSync(join(DOCS, 'ROADMAP.md'), 'utf8').toLowerCase()
const files = semuaMd(DOCS)

/** Dokumen yang memang tak perlu masuk roadmap, beserta alasannya. */
function dikecualikan(rel) {
  const l = rel.toLowerCase()
  if (l.includes('archive')) return 'arsip — riwayat, bukan pekerjaan'
  if (l.includes('engineering-constitution')) return 'aturan tetap, dirujuk bukan dikerjakan'
  if (l.includes(`${sep}adr${sep}`) || l.includes('/adr/')) return 'keputusan arsitektur — acuan'
  if (/development_log|journal|protokol-sesi|readme/i.test(l)) return 'log/protokol'
  if (/-status\.md$|completion-audit|_status\.md$/i.test(l)) return 'laporan status'
  if (basename(rel).toLowerCase() === 'roadmap.md') return 'dokumen ini sendiri'
  return null
}

/**
 * Apakah dokumen ini memuat pekerjaan yang BELUM dikerjakan?
 *
 * Bukan "menyebut kata rencana" — versi pertama memakai kriteria itu dan
 * melaporkan 100 dokumen, mayoritas spec fase yang justru sudah SELESAI
 * (discovery, validation-freeze). Angka besar yang tak bisa ditindaklanjuti.
 *
 * Yang dicari sekarang: penanda pekerjaan terbuka yang eksplisit.
 */
function adaPekerjaanTerbuka(isi) {
  const l = isi.toLowerCase()
  // Penanda SELESAI di header → dokumen ini laporan, bukan antrean.
  if (/^#[^\n]*(selesai|completed|closed|freeze)/im.test(l)) return false
  const terbuka = [
    'belum dikerjakan', 'belum dibangun', 'belum diimplementasi',
    '⏳', '🔴', 'todo:', '- [ ]', 'pending', 'menunggu keputusan',
  ]
  return terbuka.filter(s => l.includes(s)).length >= 2
}

const terhubung = [], terlantar = [], dikecualikanList = []
for (const f of files) {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  const alasan = dikecualikan(rel)
  if (alasan) { dikecualikanList.push({ rel, alasan }); continue }

  const nama = basename(rel, '.md').toLowerCase()
  const disebut = roadmap.includes(nama) || roadmap.includes(rel.toLowerCase())
  if (disebut) { terhubung.push(rel); continue }

  const isi = readFileSync(f, 'utf8')
  ;(adaPekerjaanTerbuka(isi) ? terlantar : dikecualikanList).push(
    adaPekerjaanTerbuka(isi) ? rel : { rel, alasan: 'tak memuat sinyal rencana kerja' },
  )
}

console.log(`Dokumen .md di docs/     : ${files.length}`)
console.log(`  terhubung ke ROADMAP   : ${terhubung.length}`)
console.log(`  dikecualikan (beralasan): ${dikecualikanList.length}`)
console.log(`  ⚠️  RENCANA TERLANTAR   : ${terlantar.length}\n`)

if (terlantar.length) {
  console.log('— Berisi rencana kerja tapi TIDAK dirujuk ROADMAP:')
  for (const r of terlantar) console.log(`   ${r}`)
  process.exitCode = 1
} else {
  console.log('✅ Tak ada rencana kerja yang terputus dari ROADMAP.')
}
