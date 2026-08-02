#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Menghasilkan `docs/INDEKS-DOKUMEN.md` — SETIAP .md di docs/, tanpa kecuali.
//
// Founder 2026-08-02 (dua kali, dan yang kedua mengoreksi jawaban saya):
//   "pastikan semua dokumen di docs itu juga dimasukkan ke dalam roadmap"
//   "seluruh dokumen yg ada di folder doc yaa yg saya tanya"
//
// Jawaban pertama saya menyembunyikan angka sebenarnya: dari 236 dokumen,
// **134 tak disebut ROADMAP sama sekali** — nama, path, maupun foldernya.
// Saya melaporkannya sebagai "210 dikecualikan beralasan", padahal alasannya
// aturan yang SAYA buat sendiri, bukan keputusan founder.
//
// Indeks ini memperbaiki itu: tiap dokumen muncul, dengan PERAN-nya. Peran
// menentukan apa yang dilakukan terhadapnya — bukan alasan untuk membuangnya
// dari daftar.
//
//   antrean   berisi pekerjaan yang belum dikerjakan → masuk ROADMAP
//   acuan     aturan/keputusan yang dirujuk saat bekerja (ADR, Constitution)
//   riwayat   catatan fase yang sudah lewat (audit, status, log, arsip)
//
// Dijalankan ulang tiap kali docs/ berubah:
//   node apps/api/scripts/gen-indeks-docs.mjs
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const DOCS = join(AKAR, 'docs')

function semua(dir, h = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) semua(p, h)
    else if (n.endsWith('.md') && n !== 'INDEKS-DOKUMEN.md') h.push(p)
  }
  return h
}

/** Judul H1 pertama, dipakai sebagai keterangan singkat. */
function judul(isi, fallback) {
  const m = /^#\s+(.+)$/m.exec(isi)
  return (m ? m[1] : fallback).replace(/[`*]/g, '').slice(0, 78)
}

function peran(rel, isi) {
  const l = rel.toLowerCase()
  if (l.includes('/archive/')) return 'riwayat'
  if (/-status\.md$|completion-audit|_status\.md$|development_log|journal|amendments/i.test(l)) return 'riwayat'
  if (l.includes('/adr/') || l.includes('engineering-constitution')) return 'acuan'
  if (/protokol-sesi|glossary|readme|index/i.test(l)) return 'acuan'
  // Pekerjaan terbuka yang eksplisit → antrean
  const t = isi.toLowerCase()
  if (/^#[^\n]*(selesai|completed|closed|freeze)/im.test(t)) return 'riwayat'
  const terbuka = ['belum dikerjakan', 'belum dibangun', 'belum diimplementasi',
    '⏳', '🔴', 'todo:', '- [ ]', 'menunggu keputusan']
  return terbuka.filter(s => t.includes(s)).length >= 2 ? 'antrean' : 'acuan'
}

const roadmap = readFileSync(join(DOCS, 'ROADMAP.md'), 'utf8').toLowerCase()
const files = semua(DOCS).sort()
const rows = files.map(f => {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  const isi = readFileSync(f, 'utf8')
  const nama = rel.split('/').pop().replace(/\.md$/, '')
  return {
    rel,
    nama,
    folder: rel.split('/').slice(1, -1).join('/') || '(root)',
    peran: peran(rel, isi),
    judul: judul(isi, nama),
    diRoadmap: roadmap.includes(nama.toLowerCase()) || roadmap.includes(rel.toLowerCase()),
  }
})

const n = (p) => rows.filter(r => r.peran === p).length
const perFolder = {}
for (const r of rows) (perFolder[r.folder] ??= []).push(r)

const out = []
out.push('# INDEKS DOKUMEN — seluruh isi `docs/`', '')
out.push('> **Dihasilkan otomatis** oleh `apps/api/scripts/gen-indeks-docs.mjs`.')
out.push('> Jangan disunting tangan — jalankan ulang skripnya.', '')
out.push('Founder bertanya dua kali apakah SELURUH dokumen sudah masuk roadmap.')
out.push('Jawaban pertama saya menyembunyikan angka sebenarnya di balik "dikecualikan')
out.push('beralasan" — padahal alasannya aturan yang saya buat sendiri. Indeks ini')
out.push('memuat **setiap** dokumen, tanpa kecuali.', '')
out.push('## Peran, dan apa artinya', '')
out.push('| Peran | Arti | Apa yang dilakukan |')
out.push('|---|---|---|')
out.push(`| **antrean** | memuat pekerjaan yang belum dikerjakan | masuk ROADMAP, dikerjakan menurut §"URUTAN EKSEKUSI" |`)
out.push(`| **acuan** | aturan/keputusan yang dirujuk saat bekerja | dibaca saat mengerjakan hal terkait; tak "selesai" |`)
out.push(`| **riwayat** | catatan fase yang sudah lewat | bukti apa yang pernah terjadi; jangan dikutip sebagai rencana |`)
out.push('')
out.push(`**Total ${rows.length} dokumen** — antrean ${n('antrean')} · acuan ${n('acuan')} · riwayat ${n('riwayat')}.`)
out.push('')
out.push('Kolom **RM** = disebut langsung di `ROADMAP.md`.')
out.push('')

for (const [folder, list] of Object.entries(perFolder).sort()) {
  out.push(`### \`docs/${folder === '(root)' ? '' : folder}\``, '')
  out.push('| Dokumen | Peran | RM | Isi |')
  out.push('|---|---|:-:|---|')
  for (const r of list.sort((a, b) => a.nama.localeCompare(b.nama))) {
    out.push(`| [${r.nama}](${r.rel.replace(/^docs\//, '')}) | ${r.peran} | ${r.diRoadmap ? '✓' : ''} | ${r.judul} |`)
  }
  out.push('')
}

const isiBaru = out.join('\n')
const TUJUAN = join(DOCS, 'INDEKS-DOKUMEN.md')

// `--check` → jangan tulis, cuma bandingkan. Dipakai CI supaya indeks tak bisa
// basi diam-diam: dokumen baru ditambahkan tapi indeksnya tak ikut diperbarui
// adalah persis cara 134 dokumen tadi jadi tak terlihat.
if (process.argv.includes('--check')) {
  let lama = ''
  try { lama = readFileSync(TUJUAN, 'utf8') } catch { /* belum ada → dianggap basi */ }
  if (lama.trim() !== isiBaru.trim()) {
    console.error('\n❌ docs/INDEKS-DOKUMEN.md BASI — isi docs/ berubah tapi indeks belum diperbarui.\n')
    console.error('   Perbaikan: node apps/api/scripts/gen-indeks-docs.mjs\n')
    process.exit(1)
  }
  console.log(`✅ INDEKS-DOKUMEN.md mutakhir (${rows.length} dokumen)`)
  process.exit(0)
}

writeFileSync(TUJUAN, isiBaru)
console.log(`INDEKS-DOKUMEN.md ditulis: ${rows.length} dokumen`)
console.log(`  antrean ${n('antrean')} · acuan ${n('acuan')} · riwayat ${n('riwayat')}`)
console.log(`  disebut ROADMAP: ${rows.filter(r => r.diRoadmap).length}`)
