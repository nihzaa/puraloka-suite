#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// GERBANG LOKAL — seluruh pemeriksaan CI, dijalankan di sini.
//
// Founder 2026-08-02: CI GitHub Actions berhenti (kuota), dan upgrade Pro
// maupun menjadikan repo publik sama-sama ditolak. Keduanya memang tak perlu.
//
// **CI bukan syarat kualitas — ia cuma tempat menjalankannya.** Ketiga belas
// penjaga itu skrip biasa; yang hilang saat CI mati bukan pemeriksaannya,
// melainkan (a) database yang dibangun bersih dari migrasi, dan (b) jaminan
// tak ada langkah yang terlewat karena buru-buru.
//
// (a) tak bisa digantikan di sini dan itu ditulis apa adanya di ringkasan
// akhir — bukan disembunyikan. (b) justru inti skrip ini: satu perintah,
// urutan tetap, dan gagal keras di penjaga pertama yang merah.
//
//   node scripts/gerbang.mjs           seluruh gerbang
//   node scripts/gerbang.mjs --cepat   lewati test (untuk iterasi cepat)
//
// Wajib hijau SEBELUM commit. Bukan pengganti CI saat CI hidup lagi —
// pendamping, karena menjalankannya lebih awal selalu lebih murah.
// ════════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = join(AKAR, 'apps', 'api')
const WEB = join(AKAR, 'apps', 'web')
const cepat = process.argv.includes('--cepat')

/** Satu langkah gerbang. `wajibDB` = butuh koneksi DB (dilewati kalau nihil). */
const LANGKAH = [
  // ── Sisi API ───────────────────────────────────────────────────────────
  { nama: 'API · typecheck', cwd: API, cmd: 'npx', args: ['tsc', '--noEmit'] },
  { nama: 'API · lint (ratchet)', cwd: API, cmd: 'node', args: ['scripts/lint-ratchet.mjs'] },
  { nama: 'API · gerbang tenancy', cwd: API, cmd: 'node', args: ['scripts/audit-gerbang-tenancy.mjs'] },
  { nama: 'API · kegagalan senyap', cwd: API, cmd: 'node', args: ['scripts/audit-kegagalan-senyap.mjs'] },
  { nama: 'API · penulisan tanpa periksa', cwd: API, cmd: 'node', args: ['scripts/audit-tulis-tanpa-periksa.mjs'] },
  { nama: 'API · catch senyap', cwd: API, cmd: 'node', args: ['scripts/audit-catch-senyap.mjs'] },
  { nama: 'API · guard sadar-schema', cwd: API, cmd: 'node', args: ['scripts/audit-guard-schema.mjs'] },
  { nama: 'API · penjaga saldo', cwd: API, cmd: 'node', args: ['scripts/audit-penjaga-saldo.mjs'] },
  { nama: 'API · migrasi sadar-schema', cwd: API, cmd: 'node', args: ['scripts/audit-migrasi-skema-dipaku.mjs'] },
  { nama: 'API · kolom .select() ada di skema', cwd: API, cmd: 'node', args: ['scripts/audit-kolom-select.mjs'] },

  // ── Dokumentasi ────────────────────────────────────────────────────────
  { nama: 'Docs · tautan tak rusak', cwd: AKAR, cmd: 'node', args: ['scripts/cek-tautan-docs.mjs'] },
  { nama: 'Docs · rencana terhubung ROADMAP', cwd: API, cmd: 'node', args: ['scripts/audit-docs-vs-roadmap.mjs'] },
  { nama: 'Docs · indeks mutakhir', cwd: API, cmd: 'node', args: ['scripts/gen-indeks-docs.mjs', '--check'] },
  { nama: 'Docs · sub-menu berisiko punya rancangan', cwd: API, cmd: 'node', args: ['scripts/audit-rancangan-submenu.mjs'] },

  // ── Sisi Web ───────────────────────────────────────────────────────────
  { nama: 'Web · typecheck', cwd: WEB, cmd: 'npx', args: ['tsc', '--noEmit'] },
  { nama: 'Web · lint (ratchet)', cwd: WEB, cmd: 'node', args: ['scripts/lint-ratchet.mjs'] },
  { nama: 'Web · tata letak', cwd: WEB, cmd: 'node', args: ['scripts/tata-letak-ratchet.mjs'] },
  { nama: 'Web · sidebar', cwd: WEB, cmd: 'node', args: ['scripts/sidebar-ratchet.mjs'] },
  { nama: 'Web · aksesibilitas', cwd: WEB, cmd: 'node', args: ['scripts/a11y-ratchet.mjs'] },
  { nama: 'Web · kontras token', cwd: WEB, cmd: 'node', args: ['scripts/kontras-ratchet.mjs'] },
  { nama: 'Web · kontras hex-mentah', cwd: WEB, cmd: 'node', args: ['scripts/kontras-hex-ratchet.mjs'] },
  { nama: 'Web · ADR-004 (permission)', cwd: WEB, cmd: 'node', args: ['scripts/adr004-ratchet.mjs'] },
  { nama: 'Web · medan hantu', cwd: WEB, cmd: 'node', args: ['scripts/medan-hantu-ratchet.mjs'] },
  { nama: 'Web · modal punya jalan keluar', cwd: WEB, cmd: 'node', args: ['scripts/modal-esc-ratchet.mjs'] },
  { nama: 'Web · catch senyap', cwd: WEB, cmd: 'node', args: ['scripts/catch-senyap-ratchet.mjs'] },

  // ── Test (paling lama; ditaruh terakhir supaya kesalahan murah ketahuan dulu)
  { nama: 'API · test (1.251)', cwd: API, cmd: 'npx', args: ['vitest', 'run'], lama: true },
  { nama: 'Web · test (56)', cwd: WEB, cmd: 'npx', args: ['vitest', 'run'], lama: true },
  { nama: 'Browser · test (14)', cwd: AKAR, cmd: 'pnpm', args: ['exec', 'playwright', 'test'], lama: true, env: { CI: '1' } },
]

const mulai = Date.now()
const gagal = []
let dijalankan = 0

for (const l of LANGKAH) {
  if (cepat && l.lama) continue
  process.stdout.write(`  ${l.nama.padEnd(38)} `)
  const t = Date.now()
  const r = spawnSync(l.cmd, l.args, {
    cwd: l.cwd, encoding: 'utf8', shell: true,
    env: { ...process.env, ...(l.env ?? {}) },
  })
  dijalankan++
  const detik = ((Date.now() - t) / 1000).toFixed(0)
  if (r.status === 0) {
    console.log(`✅  ${detik}s`)
  } else {
    console.log(`❌  ${detik}s`)
    const keluaran = ((r.stdout ?? '') + (r.stderr ?? '')).trim().split('\n')
    gagal.push({ nama: l.nama, ekor: keluaran.slice(-14).join('\n') })
  }
}

console.log(`\n${'─'.repeat(64)}`)
const total = ((Date.now() - mulai) / 1000 / 60).toFixed(1)
if (gagal.length === 0) {
  console.log(`✅ GERBANG LOLOS — ${dijalankan} pemeriksaan, ${total} menit`)
  if (cepat) console.log('   ⚠️  Mode --cepat: TEST DILEWATI. Jalankan penuh sebelum commit.')
  console.log(
    '\n   Catatan jujur: gerbang ini TIDAK menggantikan satu hal yang hanya bisa\n' +
    '   dilakukan CI — membangun database BERSIH dari migrasi. Cacat seperti\n' +
    '   "migrasi 100 tak pernah sampai ke schema test" dan "trigger hilang di\n' +
    '   dev tapi ada di CI" hanya terlihat dari sana. Lokal memakai dev, yang\n' +
    '   punya riwayat.',
  )
  process.exit(0)
}

console.error(`❌ GERBANG GAGAL — ${gagal.length} dari ${dijalankan} pemeriksaan\n`)
for (const g of gagal) {
  console.error(`── ${g.nama}`)
  console.error(g.ekor.split('\n').map(x => '   ' + x).join('\n'))
  console.error('')
}
process.exit(1)
