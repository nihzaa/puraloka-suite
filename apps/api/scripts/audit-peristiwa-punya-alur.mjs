#!/usr/bin/env node
// ============================================================================
// PERISTIWA PUNYA ALUR — kode di `PETA_PERISTIWA` wajib menunjuk alur yang ADA
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `utils/terbit-peristiwa.ts` memetakan jenis notifikasi → kode alur otomasi,
// dan kode itu dipakai sebagai `path` webhook n8n:
//
//     kasbon_submitted → 'teruskan-kasbon-diajukan'
//                         └─ POST {N8N}/webhook/teruskan-kasbon-diajukan
//
// Kalau kodenya salah ketik, atau alurnya dihapus, atau resep di
// `scripts/n8n/bangun-alur.mjs` memakai nama lain — panggilannya membalas 404
// dan **tak ada yang tahu**. `terbitkanPeristiwa` sengaja diam pada 404 (itu
// keadaan wajar selama alur belum dinyalakan), jadi salah ketik terlihat
// persis sama dengan "belum dinyalakan".
//
// Itu kelas cacat yang sudah dua kali tercatat di repo ini: `sendWebPush()`
// yang punya nol pemanggil berbulan-bulan, dan `otomasi:umpan:baca` yang
// dipakai tanpa pernah terdaftar. Keduanya baru ketahuan saat ada yang
// kebetulan memeriksa.
//
// ── Tiga hal yang dijaga
//
//   1. Tiap kode di `PETA_PERISTIWA` punya resep di `bangun-alur.mjs`
//      (RESEP_PERISTIWA). Tanpa resep, workflow-nya tak pernah dibuat.
//   2. Tiap kode punya baris `otomasi_alur` di basis — dilewati bila
//      DATABASE_URL tak ada (CI menjalankannya dengan basis; lokal boleh
//      tanpa, seperti `audit-sod-gerbang.mjs`).
//   3. Nama kode CUKUP JADI `path` URL — tak ada spasi/karakter aneh yang
//      akan berubah saat di-encode dan tak pernah cocok dengan n8n.
//
// Ambang NOL. Ketiganya bersih hari ini.
// ============================================================================

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const AKAR_REPO = join(AKAR_API, '..', '..')

const pelanggaran = []

// ── 1. Baca PETA_PERISTIWA dari sumbernya ───────────────────────────────────
//
// Dibaca sebagai TEKS, bukan di-import: berkasnya TypeScript dan meng-import-nya
// dari skrip .mjs menuntut kompilasi, yang berarti penjaga ini gagal di mesin
// yang belum build. Penjaga yang tak bisa dijalankan tak menjaga apa pun.
const sumberPeta = readFileSync(
  join(AKAR_API, 'src', 'utils', 'terbit-peristiwa.ts'),
  'utf8',
)

const blok = sumberPeta.match(/const PETA_PERISTIWA[^=]*=\s*\{([\s\S]*?)\n\}/)
if (!blok) {
  console.error('❌ PETA_PERISTIWA tak ditemukan di utils/terbit-peristiwa.ts')
  console.error('   Kalau namanya diubah, perbarui penjaga ini — jangan dibiarkan')
  console.error('   lolos, karena tanpa peta itu tak ada peristiwa yang terbit.')
  process.exit(1)
}

const peta = [...blok[1].matchAll(/^\s*([a-z_]+):\s*'([^']+)'/gm)]
  .map(([, jenis, kode]) => ({ jenis, kode }))

if (peta.length === 0) {
  console.error('❌ PETA_PERISTIWA kosong — nol peristiwa akan terbit ke otomasi')
  process.exit(1)
}

// ── 2. Tiap kode punya resep di builder ─────────────────────────────────────
const sumberResep = readFileSync(
  join(AKAR_REPO, 'scripts', 'n8n', 'bangun-alur.mjs'),
  'utf8',
)
const kodeResep = new Set(
  [...sumberResep.matchAll(/kode:\s*'([^']+)'/g)].map((m) => m[1]),
)

for (const { jenis, kode } of peta) {
  if (!kodeResep.has(kode)) {
    pelanggaran.push(
      `${jenis} → '${kode}': tak ada resep di scripts/n8n/bangun-alur.mjs — ` +
      `workflow-nya tak akan pernah dibuat, dan panggilannya membalas 404 senyap`,
    )
  }
}

// ── 3. Kode aman jadi path URL ──────────────────────────────────────────────
for (const { jenis, kode } of peta) {
  if (!/^[a-z0-9-]+$/.test(kode)) {
    pelanggaran.push(
      `${jenis} → '${kode}': hanya huruf kecil, angka, dan tanda hubung. ` +
      `Karakter lain berubah saat di-encode dan tak pernah cocok dengan path n8n`,
    )
  }
}

// ── 4. Tiap kode punya baris di `otomasi_alur` ──────────────────────────────
const DB = process.env.DATABASE_URL || process.env.DIRECT_URL
if (!DB) {
  console.log('  ⏭  kode vs otomasi_alur: DILEWATI (tak ada DATABASE_URL)')
  console.log('     CI menjalankannya dengan basis; lokal boleh tanpa.')
} else {
  // `createRequire` dari `apps/api/package.json` — pola yang sama dipakai
  // `scripts/db/_koneksi.mjs`. Import langsung ke `node_modules/pg` gagal di
  // pnpm, yang menyimpannya di `.pnpm/` bukan di tempat yang ditebak.
  const { createRequire } = await import('node:module')
  const requireDari = createRequire(join(AKAR_API, 'package.json'))
  let pg = null
  try { pg = requireDari('pg') } catch { /* dilaporkan di bawah */ }

  if (!pg) {
    console.log('  ⏭  kode vs otomasi_alur: DILEWATI (pg tak ter-resolve)')
  } else {
    const c = new pg.Client({ connectionString: DB })
    await c.connect()
    const { rows } = await c.query('SELECT kode FROM otomasi_alur')
    const adaDiDb = new Set(rows.map((r) => r.kode))
    for (const { jenis, kode } of peta) {
      if (!adaDiDb.has(kode)) {
        pelanggaran.push(
          `${jenis} → '${kode}': tak ada baris otomasi_alur dengan kode itu`,
        )
      }
    }
    await c.end()
  }
}

if (pelanggaran.length > 0) {
  console.error('\n❌ Peristiwa menunjuk alur yang tak ada:\n')
  for (const g of pelanggaran) console.error('   ' + g)
  console.error(
    `\n   ${pelanggaran.length} pelanggaran (ambang: 0)\n\n` +
    '   `terbitkanPeristiwa` sengaja DIAM pada 404 — jadi kode yang salah\n' +
    '   terlihat persis sama dengan "alur belum dinyalakan". Penjaga ini\n' +
    '   satu-satunya yang bisa membedakannya.\n',
  )
  process.exit(1)
}

console.log(
  `✅ ${peta.length} peristiwa menunjuk alur yang ada, resepnya lengkap, ` +
  'kodenya sah sebagai path',
)
