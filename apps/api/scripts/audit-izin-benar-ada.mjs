#!/usr/bin/env node
// ============================================================================
// KUNCI IZIN YANG DIPAKAI KODE WAJIB BENAR-BENAR ADA DI BASIS
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Saat membangun automation 1.1 (2026-08-15) saya menulis
// `izin: 'expenses:create'` untuk entitas pengeluaran — kunci yang TIDAK ADA
// di tabel `permissions`. Yang benar `cash:expense:create`.
//
// Ketahuannya kebetulan: saya sedang mengukur hal lain dan iseng memeriksa
// kuncinya ke basis. Tak ada test yang merah, tak ada typecheck yang menahan,
// dan tak ada penjaga yang menyebutnya.
//
// ── Kenapa kunci hantu tak pernah berbunyi
//
// `requirePermission('yang-tak-ada')` tidak melempar. Ia memeriksa apakah
// pengguna memiliki kunci itu — dan karena tak seorang pun memilikinya,
// jawabannya selalu TIDAK.
//
// Jadi fiturnya menolak SEMUA ORANG, selamanya, dengan 403 yang terbaca
// seperti "Anda tak punya izin" — bukan seperti "kuncinya salah ketik". Orang
// akan memeriksa peran, menambah permission ke role, memeriksa ulang RBAC,
// dan tak satu pun dari itu menolong.
//
// Kelas cacat yang sama sudah tercatat berkali-kali di repo ini: gagal DIAM,
// gejalanya sepuluh langkah dari sebabnya.
//
// ── Yang dijaga
//
// Tiap kunci di `requirePermission('…')` (literal, bukan variabel) wajib ada
// sebagai baris `permissions.key`.
//
// Ambang NOL, dan itu bukan ambisi: diukur 2026-08-15, **180 kunci dipakai di
// kode dan NOL di antaranya hantu**. Repo ini sudah bersih — penjaga ini
// mengunci keadaan itu, bukan menuntut perbaikan besar.
//
// Kunci di `ai-tool-siapkan.ts` (`izin:`) ikut diperiksa, karena di situlah
// kekeliruannya lahir.
//
// Butuh basis. Dilewati bila DATABASE_URL tak ada (pola `audit-sod-gerbang`).
// ============================================================================

import { readFileSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')

/*
  ⚠ Kredensial dibaca dari `.env` JUGA, bukan `process.env` saja.

  Diukur 2026-09-04: SEBELAS penjaga di direktori ini melewati DIRINYA SENDIRI
  di mesin yang jelas punya basis — mereka menanyakan `process.env`, sementara
  kredensial repo ini tinggal di `apps/api/.env`.

  Akibatnya "223 penjaga hijau" memuat sebelas yang tak pernah memeriksa apa
  pun. Penjaga berambang NOL yang selalu dilewati memberi rasa aman yang
  salah — lebih buruk daripada tak ada penjaga.

  `bacaEnv()` membaca sumber yang SAMA dengan `buatClient()`.
*/
const { bacaEnv: _bacaEnv } = await import('../../../scripts/db/_koneksi.mjs')
const _envBerkas = _bacaEnv()
const DB =
  process.env.DATABASE_URL || process.env.DIRECT_URL
  || _envBerkas.DATABASE_URL || _envBerkas.DIRECT_URL
if (!DB) {
  console.log('  ⏭  izin benar ada: DILEWATI (tak ada DATABASE_URL)')
  process.exit(0)
}

const requireDari = createRequire(join(AKAR_API, 'package.json'))
let pg = null
try { pg = requireDari('pg') } catch { /* dilaporkan di bawah */ }
if (!pg) {
  console.log('  ⏭  izin benar ada: DILEWATI (pg tak ter-resolve)')
  process.exit(0)
}

/** kunci → daftar tempat ia dipakai */
const dipakai = new Map()

const berkas = globSync('src/**/*.ts', { cwd: AKAR_API })
  .filter((f) => !f.includes('__tests__') && !f.includes('test-utils'))

for (const rel of berkas) {
  const jalur = rel.replace(/\\/g, '/')
  const isi = readFileSync(join(AKAR_API, rel), 'utf8')

  /*
    Hanya LITERAL yang diperiksa. `requirePermission(variabel)` sengaja
    dilewati — nilainya baru diketahui saat berjalan, dan menebaknya di sini
    menghasilkan positif palsu yang membuat penjaga ini berhenti dibaca.
  */
  const pola = [
    /requirePermission\(\s*'([a-z0-9:_]+)'\s*\)/g,
    /\bizin:\s*'([a-z0-9:_]+)'/g,
  ]

  for (const p of pola) {
    for (const m of isi.matchAll(p)) {
      const kunci = m[1]
      const baris = isi.slice(0, m.index).split('\n').length
      if (!dipakai.has(kunci)) dipakai.set(kunci, [])
      dipakai.get(kunci).push(`${jalur}:${baris}`)
    }
  }
}

const c = new pg.Client({ connectionString: DB })
await c.connect()
const { rows } = await c.query('SELECT key FROM permissions')
await c.end()

const ada = new Set(rows.map((r) => r.key))
const hantu = [...dipakai.keys()].filter((k) => !ada.has(k)).sort()

if (hantu.length > 0) {
  console.error('\n❌ Kunci izin dipakai kode tetapi TIDAK ADA di tabel `permissions`:\n')
  for (const k of hantu) {
    console.error(`   ✗ '${k}'`)
    for (const t of dipakai.get(k).slice(0, 4)) console.error(`        ${t}`)
  }
  console.error('')
  console.error('   `requirePermission` untuk kunci yang tak ada TIDAK melempar — ia')
  console.error('   memeriksa kepemilikan, dan tak seorang pun memiliki kunci hantu.')
  console.error('   Fiturnya menolak SEMUA ORANG dengan 403 yang terbaca seperti')
  console.error('   "Anda tak punya izin", bukan seperti "kuncinya salah ketik".\n')
  console.error('   Perbaikannya: samakan dengan kunci yang benar-benar ada')
  console.error("   (`SELECT key FROM permissions WHERE key LIKE '…'`), ATAU tambahkan")
  console.error('   kuncinya lewat migrasi bila ia memang izin baru.\n')
  process.exit(1)
}

console.log(
  `✅ Izin benar ada: ${dipakai.size} kunci dipakai kode, semuanya terdaftar di basis`,
)
