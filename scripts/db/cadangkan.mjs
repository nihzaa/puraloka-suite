#!/usr/bin/env node
// ============================================================================
// F1-4 — CADANGKAN DATABASE.
//
//   node scripts/db/cadangkan.mjs [--keluaran DIR]
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA SKRIP INI ADA, PADAHAL SUPABASE SUDAH PUNYA BACKUP OTOMATIS
// ══════════════════════════════════════════════════════════════════════════
//
// Backup otomatis Supabase itu nyata dan berguna. Tetapi ia menjawab
// pertanyaan yang BERBEDA dari yang ditanyakan F1-4:
//
//   • Backup penyedia menjawab "apakah datanya tersimpan di suatu tempat?"
//   • F1-4 menanyakan "apakah kami BISA MEMULIHKANNYA, dan berapa lama?"
//
// Pertanyaan kedua tak bisa dijawab dokumen. Ia hanya bisa dijawab dengan
// benar-benar memulihkan, dan mencatat jamnya. Organisasi yang tak pernah
// mencoba restore biasanya baru menemukan backup-nya tak bisa dipakai pada
// hari mereka paling membutuhkannya.
//
// Skrip ini juga memberi kemandirian: cadangan yang hanya hidup di dalam akun
// penyedia akan ikut hilang bila yang hilang justru AKSES ke akun itu.
//
// ── Yang dijamin
//
//   1. READ-ONLY terhadap sumber. `pg_dump` tak pernah menulis ke basis data
//      yang dibacanya. Skrip ini tak menjalankan satu pun perintah lain.
//   2. Menolak berjalan bila versi `pg_dump` lebih tua dari server. Dump dari
//      klien tua terhadap server baru menghasilkan berkas yang RUSAK SEBAGIAN
//      dan sering baru ketahuan saat restore — persis saat paling gawat.
//   3. Format custom (-Fc), bukan SQL polos: bisa di-restore selektif, dan
//      `pg_restore --list` bisa membuktikan isinya tanpa menjalankannya.
// ============================================================================

import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bacaEnv, buatClient, pastikanCwdRootRepo, REPO_ROOT } from './_koneksi.mjs'

pastikanCwdRootRepo()

const argv = process.argv.slice(2)
const ambil = (n, d) => {
  const i = argv.indexOf(n)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const DIR = resolve(REPO_ROOT, ambil('--keluaran', 'cadangan'))

// ── Cari pg_dump yang versinya CUKUP BARU ───────────────────────────────────
//
// Ini bukan kerewelan. `pg_dump` menolak server yang lebih baru darinya, dan
// ketika ia TIDAK menolak (beda minor), hasilnya bisa kehilangan objek yang
// belum dikenali versi tuanya — kegagalan senyap.
function cariPgDump() {
  const kandidat = ['pg_dump']
  // Windows: Postgres jarang ada di PATH walau terpasang.
  for (const v of [18, 17]) {
    kandidat.push(`/c/Program Files/PostgreSQL/${v}/bin/pg_dump.exe`)
    kandidat.push(`C:\\Program Files\\PostgreSQL\\${v}\\bin\\pg_dump.exe`)
  }
  for (const p of kandidat) {
    try {
      const v = execFileSync(p, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const m = v.match(/(\d+)\.(\d+)/)
      if (m) return { jalur: p, mayor: Number(m[1]), teks: v.trim() }
    } catch { /* kandidat berikutnya */ }
  }
  return null
}

// URL diambil dari berkas .env lewat parser bersama — BUKAN dirakit ulang di
// sini. Merakit ulang string koneksi adalah akar galat `ENOTFOUND base` yang
// pernah menyesatkan seluruh pengukuran schema di repo ini (lihat header
// _koneksi.mjs).
const env = bacaEnv()
const URL_SUMBER = env.DIRECT_URL || env.DATABASE_URL
if (!URL_SUMBER) {
  console.error('❌ DIRECT_URL/DATABASE_URL tak ada di apps/api/.env')
  process.exit(1)
}

const c = buatClient()
await c.connect()
const { rows } = await c.query('SELECT version() AS v, current_database() AS db')
await c.end()
const serverMayor = Number(rows[0].v.match(/PostgreSQL (\d+)/)[1])
console.log(`server  : PostgreSQL ${serverMayor} (${rows[0].db})`)

const pd = cariPgDump()
if (!pd) {
  console.error(`
❌ pg_dump tidak ditemukan.

   Cadangan TIDAK BISA dibuat tanpa perkakas klien Postgres. Pasang salah satu:

     • Windows : https://www.postgresql.org/download/windows/  (versi ${serverMayor}+)
     • Docker  : docker run --rm postgres:${serverMayor} pg_dump …

   Lihat docs/ops/RUNBOOK-PEMULIHAN.md §Prasyarat.`)
  process.exit(1)
}
console.log(`pg_dump : ${pd.teks}`)

if (pd.mayor < serverMayor) {
  console.error(`
❌ pg_dump ${pd.mayor} LEBIH TUA dari server ${serverMayor}. DITOLAK.

   Dump dari klien yang lebih tua bisa kehilangan objek yang belum dikenalinya,
   dan kerusakannya sering baru ketahuan saat restore — pada saat paling gawat.
   Pasang pg_dump ${serverMayor} atau lebih baru.`)
  process.exit(1)
}

mkdirSync(DIR, { recursive: true })

// Cap waktu UTC dalam nama berkas: cadangan tanpa waktu yang jelas tak bisa
// diurutkan saat panik, dan "yang mana yang terbaru" jadi tebakan.
const cap = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const berkas = resolve(DIR, `puraloka-${cap}.dump`)

console.log(`\nmencadangkan → ${berkas}`)
const t0 = Date.now()
try {
  execFileSync(
    pd.jalur,
    [
      '--format=custom',
      '--no-owner', // pemilik peran berbeda antar lingkungan; jangan dipaku.
      '--no-privileges', // GRANT dipulihkan oleh migrasi, bukan oleh dump.
      '--verbose',
      `--file=${berkas}`,
      URL_SUMBER,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'], env: process.env, maxBuffer: 1 << 28 },
  )
} catch (e) {
  console.error(`\n❌ pg_dump gagal (kode ${e.status}). Berkas cadangan TIDAK sah.`)
  process.exit(1)
}
const detik = ((Date.now() - t0) / 1000).toFixed(1)
const ukuran = statSync(berkas).size

// ── Bukti isi — dump yang "berhasil" tapi kosong adalah jebakan ─────────────
const daftar = execSync(`"${pd.jalur.replace('pg_dump', 'pg_restore')}" --list "${berkas}"`, {
  encoding: 'utf8', maxBuffer: 1 << 28,
})
const jumlahTabel = (daftar.match(/^\d+;.*TABLE DATA/gm) || []).length

writeFileSync(`${berkas}.info.txt`, [
  `berkas    : ${berkas}`,
  `dibuat    : ${new Date().toISOString()}`,
  `server    : PostgreSQL ${serverMayor}`,
  `pg_dump   : ${pd.teks}`,
  `ukuran    : ${(ukuran / 1048576).toFixed(1)} MB`,
  `durasi    : ${detik} dtk`,
  `TABLE DATA: ${jumlahTabel}`,
  '',
  'Cadangan ini BELUM TERBUKTI sampai di-restore. Jalankan:',
  '  node scripts/db/uji-pemulihan.mjs --dari ' + berkas,
].join('\n'))

console.log(`
✅ ${(ukuran / 1048576).toFixed(1)} MB · ${detik} dtk · ${jumlahTabel} tabel berisi data

⚠️  Cadangan ini BELUM TERBUKTI. Berkas yang bisa dibuat belum tentu bisa
    dipulihkan. Buktikan sekarang, bukan saat keadaan darurat:

      node scripts/db/uji-pemulihan.mjs --dari ${berkas}
`)
