#!/usr/bin/env node
/**
 * PENJAGA: pendirian tenant menyiapkan alur persetujuannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * F7-1 mensyaratkan "tenant baru sekali klik". Diukur 2026-08-07, company
 * kedua di basis ini punya **0 dari 7** jenis rantai approval — ia lahir
 * tanpa satu pun.
 *
 * Yang membuatnya berbahaya bukan ketiadaannya, melainkan KESUNYIANNYA:
 * pengajuan tetap masuk, lalu tak pernah bisa diputuskan siapa pun karena
 * tak ada rantai yang menentukan siapa berwenang. Tak ada galat, tak ada
 * log — hanya antrean yang tak pernah bergerak.
 *
 * Ketahuannya pun kebetulan: `submittal-aturan.test.ts` merah untuk SATU
 * jenis dari tujuh, karena hanya `submittal` yang punya test. Enam sisanya
 * tak akan pernah berteriak.
 *
 * ── Yang dijaga di sini
 *
 * Endpoint pembuatan company memanggil `siapkanRantaiApproval`. Itu saja —
 * statis, tak butuh basis, dan cukup untuk menangkap penulisan ulang yang
 * "membersihkan" pemanggilan itu.
 *
 * ── Yang TIDAK dijaga
 *
 * Apakah penyalinannya benar dan lengkap. Itu tugas
 * `pendirian-tenant-lengkap.test.ts` — 3 test, 2 mutasi tertangkap.
 *
 * Pakai (dari apps/api): node scripts/audit-pendirian-tenant.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BERKAS = join(API, 'src', 'routes', 'v1', 'companies.ts')

if (!existsSync(BERKAS)) {
  console.error('❌ src/routes/v1/companies.ts tak ditemukan.')
  console.error('   Kalau berkasnya dipindah, perbarui penjaga ini — jangan dihapus.')
  process.exit(2)
}

const isi = readFileSync(BERKAS, 'utf8')

/** Blok handler `POST /api/v1/companies` — bukan seluruh berkas. */
const m = isi.match(/app\.post\(\s*'\/api\/v1\/companies'[\s\S]*?\n  \}\)/)

console.log('')
console.log('══ Pendirian tenant: rantai approval disiapkan ═══════════════')
console.log('')

if (!m) {
  console.error('❌ Handler `POST /api/v1/companies` tak ditemukan.')
  console.error('   Kalau rutenya berubah bentuk, perbarui penjaga ini.')
  console.error('')
  process.exit(1)
}

const handler = m[0]
const memanggil = /siapkanRantaiApproval\s*\(/.test(handler)
const mengimpor = /siapkanRantaiApproval/.test(isi.slice(0, isi.indexOf('app.post')))

if (memanggil && mengimpor) {
  console.log('✅ Pendirian tenant memanggil `siapkanRantaiApproval`.')
  console.log('')
  process.exit(0)
}

console.error('❌ Pendirian tenant TIDAK menyiapkan rantai approval:')
if (!mengimpor) console.error('     `siapkanRantaiApproval` tak diimpor')
if (!memanggil) console.error('     `POST /api/v1/companies` tak memanggilnya')
console.error('')
console.error('   Tambahkan sesudah keanggotaan pembuat dibuat:')
console.error('')
console.error('     const rantai = await siapkanRantaiApproval(baru.id)')
console.error('     if (!rantai.ok) { /* log + audit critical */ }')
console.error('')
console.error('   Kenapa ini ditegakkan: tenant tanpa rantai approval tetap')
console.error('   menerima pengajuan — yang lalu tak pernah bisa diputuskan')
console.error('   siapa pun. Tak ada galat, hanya antrean yang tak bergerak.')
console.error('   Diukur 2026-08-07: company kedua punya 0 dari 7 jenis.')
console.error('')
process.exit(1)
