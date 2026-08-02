#!/usr/bin/env node
// ============================================================================
// PENJAGA: no-stale-docs-path — dokumen yang sama tak boleh hidup di dua tempat.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Audit 2026-08-02 (temuan F-005) menemukan `.worktrees/docs-protokol/` dan
// `.worktrees/warm-clay-design-system/` menduplikasi SELURUH pohon `docs/`.
// `grep -r` dan penelusuran agent lalu menemukan dua versi dokumen yang sama
// dengan isi berbeda, tanpa penanda mana yang menang.
//
// Bahayanya halus: agent tidak "melihat konflik" lalu bertanya — ia mengambil
// yang pertama ditemukan dan melanjutkan dengan percaya diri. Dokumen usang jadi
// setara dengan dokumen aktif.
//
// ── Yang diperiksa
//
// Dua berkas `.md` dengan NAMA sama dan ISI IDENTIK di dua lokasi berbeda di
// dalam pohon yang dilacak git. Isi identik dipakai sebagai penanda "ini memang
// duplikat", bukan "kebetulan namanya sama" (mis. banyak `README.md` yang sah).
//
// `.worktrees/` sendiri sudah dikecualikan lewat `.claudeignore` dan `.gitignore`,
// jadi penjaga ini menjaga agar duplikasi serupa tidak muncul di dalam repo yang
// benar-benar ter-track.
//
// Keluar 0 = bersih. Keluar 1 = ada duplikat identik.
// ============================================================================

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// Hanya berkas yang DILACAK GIT — worktree & node_modules otomatis di luar.
let daftar = []
try {
  daftar = execSync('git ls-files "*.md"', { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
} catch (e) {
  console.error('FATAL: gagal menjalankan `git ls-files`:', e.message)
  process.exit(2)
}

// Nama berkas yang memang WAJAR berulang di banyak folder.
const NAMA_WAJAR_BERULANG = new Set(['README.md', 'index.md', 'CHANGELOG.md'])

const perHash = new Map()
for (const rel of daftar) {
  const nama = basename(rel)
  if (NAMA_WAJAR_BERULANG.has(nama)) continue
  let isi
  try { isi = readFileSync(join(REPO_ROOT, rel), 'utf8') } catch { continue }
  if (!isi.trim()) continue
  // Kunci = nama + hash isi. Nama ikut supaya dua dokumen berbeda yang kebetulan
  // isinya sama (mis. dua stub kosong) tidak dilaporkan sebagai duplikat.
  const kunci = `${nama}::${createHash('sha256').update(isi).digest('hex').slice(0, 16)}`
  if (!perHash.has(kunci)) perHash.set(kunci, [])
  perHash.get(kunci).push(rel)
}

const duplikat = [...perHash.entries()].filter(([, lokasi]) => lokasi.length > 1)

console.log('══ PENJAGA no-stale-docs-path ' + '═'.repeat(39))
if (duplikat.length === 0) {
  console.log(`  ✅ bersih — ${daftar.length} berkas .md ter-track, nol duplikat identik.`)
  process.exit(0)
}

console.error(`  ❌ ${duplikat.length} dokumen hidup di lebih dari satu lokasi:\n`)
for (const [kunci, lokasi] of duplikat) {
  console.error(`  ${kunci.split('::')[0]}`)
  lokasi.forEach((l) => console.error(`      ${l}`))
}
console.error(`
  Kenapa ini gagal: agent yang menelusuri repo akan menemukan dua salinan tanpa
  tahu mana yang menang, lalu memakai yang pertama ditemukan sebagai kebenaran.

  Perbaikannya: sisakan SATU lokasi otoritatif, dan ganti salinan lain dengan
  tautan ke sana.`)
process.exit(1)
