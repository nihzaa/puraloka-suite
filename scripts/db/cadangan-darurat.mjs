#!/usr/bin/env node
// ============================================================================
// CADANGAN DARURAT — jalan pintas saat `pg_dump` TIDAK BISA dipakai.
//
//   node scripts/db/cadangan-darurat.mjs [--keluaran DIR]
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Database produksi tak bisa di-`pg_dump` sama sekali (R-006): satu fungsi
// yatim menunjuk schema yang sudah dihapus, dan pg_dump berhenti di sana.
// Lima varian diuji, kelimanya gagal. Hanya Supabase Support yang bisa
// membersihkannya — dan itu perlu waktu.
//
// Sementara menunggu, "tidak ada cadangan sama sekali" bukan pilihan yang
// bisa diterima. Jadi jalan lain diukur, dan ternyata ada:
//
//     COPY ... TO STDOUT  ✅ jalan — ia hanya membaca DATA tabel,
//                            tak pernah menelusuri pg_depend
//
// ── Yang diselamatkan, dan yang TIDAK
//
//   ✅ SELURUH ISI setiap tabel (CSV per tabel)
//   ✅ daftar tabel, jumlah baris, urutan pemulihan
//   ❌ struktur, index, RLS, policy, trigger, fungsi
//
// Yang tidak tertutup itu BUKAN kehilangan permanen: seluruh struktur bisa
// dibangun ulang dari `db/migrations/` (178 berkas bernomor, di git). Itulah
// gunanya migrasi disimpan sebagai berkas, bukan hanya dijalankan.
//
// Urutan pemulihan dari cadangan ini:
//   1. buat database kosong
//   2. jalankan seluruh db/migrations/*.sql berurutan  → struktur + RLS
//   3. muat CSV per tabel sesuai urutan di MANIFES.json → data
//
// ⚠️ INI BUKAN PENGGANTI pg_dump. Ia jaring pengaman sementara sampai R-006
//    selesai. Jangan biarkan keberadaannya jadi alasan menunda R-006.
//
// Skrip ini READ-ONLY terhadap database. Tak ada satu pun perintah tulis.
// ============================================================================

import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { resolve } from 'node:path'
import { bacaEnv, pastikanCwdRootRepo, REPO_ROOT, pg } from './_koneksi.mjs'

pastikanCwdRootRepo()

const argv = process.argv.slice(2)
const ambil = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const DIR = resolve(REPO_ROOT, ambil('--keluaran', 'cadangan'))

const env = bacaEnv()
const URL = env.DIRECT_URL || env.DATABASE_URL
if (!URL) { console.error('❌ DIRECT_URL tak ada di apps/api/.env'); process.exit(1) }

// `pg-copy-streams` menyediakan COPY TO sebagai stream. Kalau tak terpasang,
// skrip ini jatuh ke jalur SELECT biasa — lebih lambat tetapi tetap benar.
let copyTo = null
try {
  const { createRequire } = await import('node:module')
  const req = createRequire(resolve(REPO_ROOT, 'apps/api/package.json'))
  copyTo = req('pg-copy-streams').to
} catch { /* jalur cadangan di bawah */ }

const c = new pg.Client({ connectionString: URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const cap = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const tujuan = resolve(DIR, `darurat-${cap}`)
mkdirSync(tujuan, { recursive: true })

console.log(`cadangan darurat → ${tujuan}\n`)

// Urutan berdasarkan ketergantungan FK: induk lebih dulu, supaya pemulihan
// bisa mengikuti urutan berkas apa adanya tanpa mematikan constraint.
const { rows: tabel } = await c.query(`
  WITH RECURSIVE dep AS (
    SELECT c.oid, c.relname, 0 AS tingkat
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint k
          WHERE k.conrelid = c.oid AND k.contype = 'f' AND k.confrelid <> c.oid)
    UNION ALL
    SELECT c.oid, c.relname, d.tingkat + 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_constraint k ON k.conrelid = c.oid AND k.contype = 'f'
      JOIN dep d ON d.oid = k.confrelid
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND d.tingkat < 12
  )
  SELECT relname, max(tingkat) AS tingkat FROM dep GROUP BY relname
  UNION
  SELECT c.relname, 99 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND c.relname NOT IN (SELECT relname FROM dep)
  ORDER BY 2, 1`)

const manifes = []
let totalBaris = 0
const t0 = Date.now()

for (const { relname: t, tingkat } of tabel) {
  const n = Number((await c.query(`SELECT count(*)::int n FROM "${t}"`)).rows[0].n)
  totalBaris += n
  const berkas = resolve(tujuan, `${t}.csv`)

  if (copyTo) {
    // COPY: satu perjalanan, tak memuat seluruh tabel ke memori.
    const s = c.query(copyTo(`COPY (SELECT * FROM "${t}") TO STDOUT WITH CSV HEADER`))
    await pipeline(s, createWriteStream(berkas))
  } else {
    // Jalur cadangan tanpa pg-copy-streams. Sengaja sederhana: kebenaran lebih
    // penting daripada kecepatan saat ini jaring pengaman satu-satunya.
    const { rows, fields } = await c.query(`SELECT * FROM "${t}"`)
    const kutip = (v) =>
      v === null ? '' :
      v instanceof Date ? v.toISOString() :
      typeof v === 'object' ? '"' + JSON.stringify(v).replace(/"/g, '""') + '"' :
      /[",\n\r]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v)
    const isi = [fields.map((f) => f.name).join(',')]
      .concat(rows.map((r) => fields.map((f) => kutip(r[f.name])).join(',')))
      .join('\n')
    writeFileSync(berkas, isi + '\n')
  }

  manifes.push({ tabel: t, baris: n, urutan: tingkat, berkas: `${t}.csv` })
  if (n > 0) console.log(`  ${t.padEnd(38)} ${String(n).padStart(7)} baris`)
}

const detik = ((Date.now() - t0) / 1000).toFixed(1)

writeFileSync(resolve(tujuan, 'MANIFES.json'), JSON.stringify({
  dibuat: new Date().toISOString(),
  alasan: 'pg_dump terblokir fungsi yatim — lihat RATIFIKASI.md R-006',
  tabel: manifes.length,
  total_baris: totalBaris,
  detik: Number(detik),
  cara_memulihkan: [
    '1. buat database kosong',
    '2. jalankan db/migrations/*.sql berurutan (struktur + RLS + policy)',
    '3. muat CSV mengikuti urutan `urutan` menaik di daftar tabel di bawah',
    'CATATAN: cadangan ini TIDAK memuat struktur. Ia mengandalkan migrasi di git.',
  ],
  daftar: manifes,
}, null, 2))

console.log(`
✅ ${manifes.length} tabel · ${totalBaris.toLocaleString('id-ID')} baris · ${detik} dtk
   ${tujuan}

⚠️  Cadangan ini hanya DATA. Struktur dipulihkan dari db/migrations/*.sql.
    Ia jaring pengaman sementara sampai R-006 selesai — bukan penggantinya.
`)

await c.end()
