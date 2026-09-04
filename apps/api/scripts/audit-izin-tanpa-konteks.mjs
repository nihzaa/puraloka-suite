#!/usr/bin/env node
// ============================================================================
// FUNGSI IZIN TIDAK BOLEH KOSONG TANPA KONTEKS TENANT
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Migrasi 366 membuat `get_role_permissions` sadar-tenant untuk memperbaiki
// izin GANDA sesudah role disalin per-tenant. Penyaringnya benar saat
// `auth_company_id()` terisi — dan **runtuh diam-diam** saat tidak:
//
//     AND (r.company_id = auth_company_id() OR r.company_id IS NULL)
//
// `NULL = NULL` bukan TRUE di SQL. Lewat `supabase.rpc()` dengan service_role
// (yang dipakai `plugins/auth.ts` untuk MEMUAT SELURUH IZIN tiap request),
// `auth_company_id()` NULL, jadi hanya baris template yang lolos.
//
// Diukur 2026-08-14: `get_role_permissions('admin')` mengembalikan **1** izin,
// bukan 217. Akibatnya `requirePermission` menolak SEMUANYA dengan 403.
//
// ── Kenapa tak ketahuan lebih awal
//
// Login tetap benar, karena API menyetel `app.company_id` per-request. Yang
// rusak hanya jalur tanpa konteks — dan ia tak melempar apa pun; ia hanya
// mengembalikan daftar kosong. Gejalanya muncul sebagai "403 untuk admin",
// sepuluh langkah dari sebabnya.
//
// Ketahuan lewat sembilan test `recycle-bin-endpoint` yang KEBETULAN
// memanggil jalur itu. Kalau test itu tak ada, cacatnya sampai produksi.
//
// ── Yang dijaga
//
// Menjalankan kedua fungsi TANPA konteks apa pun, lalu menuntut hasilnya
// masuk akal. Bukan memeriksa teks SQL-nya: bentuk boleh berubah, yang tak
// boleh berubah adalah JAWABANNYA.
//
// Butuh basis. Dilewati bila DATABASE_URL tak ada (pola `audit-sod-gerbang`).
// ============================================================================

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
  console.log('  ⏭  izin tanpa konteks: DILEWATI (tak ada DATABASE_URL)')
  console.log('     CI menjalankannya dengan basis; lokal boleh tanpa.')
  process.exit(0)
}

const requireDari = createRequire(join(AKAR_API, 'package.json'))
let pg = null
try { pg = requireDari('pg') } catch { /* dilaporkan di bawah */ }
if (!pg) {
  console.log('  ⏭  izin tanpa konteks: DILEWATI (pg tak ter-resolve)')
  process.exit(0)
}

const c = new pg.Client({ connectionString: DB })
await c.connect()

const pelanggaran = []

// ── 1. Prasyarat: memang ADA lebih dari satu baris per nama role ────────────
//
// Tanpa ini penjaga bisa hijau pada basis yang belum di-provision per-tenant —
// hijau yang tak membuktikan apa pun.
const { rows: [{ n: nAdmin }] } = await c.query(
  `SELECT count(*)::int n FROM public.roles WHERE name = 'admin'`,
)
if (nAdmin < 2) {
  console.log(`  ⏭  izin tanpa konteks: DILEWATI — hanya ${nAdmin} baris role "admin".`)
  console.log('     Penjaga ini menguji perilaku saat nama role AMBIGU; pada basis')
  console.log('     yang belum punya salinan per-tenant, tak ada yang bisa diuji.')
  await c.end()
  process.exit(0)
}

// ── 2. Tanpa konteks tenant, admin tetap dapat izinnya ──────────────────────
const { rows: [izin] } = await c.query(`
  SELECT count(*)::int total, count(DISTINCT permission_key)::int unik
    FROM public.get_role_permissions('admin')
`)

if (izin.total < 100) {
  pelanggaran.push(
    `get_role_permissions('admin') hanya ${izin.total} izin tanpa konteks tenant. ` +
    'Lewat service_role (plugins/auth.ts) inilah yang terjadi — dan seluruh ' +
    '`requirePermission` akan membalas 403 untuk orang yang jelas berwenang.',
  )
}

if (izin.total !== izin.unik) {
  pelanggaran.push(
    `get_role_permissions('admin') mengembalikan izin GANDA (${izin.total} baris, ` +
    `${izin.unik} unik). Perbaikan migrasi 366 hilang: izin dari template dan ` +
    'salinan tenant tergabung, dan pada tenant kedua gabungannya jadi kebocoran.',
  )
}

// ── 3. Nama role yang TAK ADA tetap mengembalikan kosong ────────────────────
//
// Perbaikan "jatuh ke mana pun saat konteks kosong" tak boleh berubah jadi
// "kembalikan apa saja".
const { rows: [{ n: nHantu }] } = await c.query(
  `SELECT count(*)::int n FROM public.get_role_permissions('peran-yang-tak-pernah-ada')`,
)
if (nHantu > 0) {
  pelanggaran.push(
    `get_role_permissions('peran-yang-tak-pernah-ada') mengembalikan ${nHantu} izin. ` +
    'Nama yang tak terdaftar harus kosong — kalau tidak, salah ketik nama peran ' +
    'memberi wewenang alih-alih menolaknya.',
  )
}

await c.end()

if (pelanggaran.length > 0) {
  console.error('\n❌ Fungsi izin runtuh tanpa konteks tenant:\n')
  for (const g of pelanggaran) console.error('   ' + g + '\n')
  console.error(
    `   ${pelanggaran.length} pelanggaran (ambang: 0)\n\n` +
    '   Cacat kelas ini TIDAK melempar apa pun — ia mengembalikan daftar\n' +
    '   kosong, dan gejalanya muncul sebagai 403 sepuluh langkah dari\n' +
    '   sebabnya. Lihat migrasi 372.\n',
  )
  process.exit(1)
}

console.log(
  `✅ Izin tanpa konteks tenant: admin ${izin.total} izin (${izin.unik} unik), ` +
  'peran hantu nol',
)
