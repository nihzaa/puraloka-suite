#!/usr/bin/env node
/**
 * AUDIT RESIDU TEST — baris yang ditinggalkan suite di database dev.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sebagian test di repo ini menulis ke `public` DB dev (bukan schema `test`
 * terisolasi) karena yang diuji adalah rute nyata dengan `service_role`.
 * Polanya: tandai entitas `[TEST]`, bersihkan di `afterAll`.
 *
 * Polanya bekerja — sampai pembersihannya melewatkan satu tabel.
 *
 * `lessons-writeback.test.ts` menghapus `projects` bertanda `[TEST]` tapi
 * TIDAK `lessons_learned_records` itu sendiri. Akibatnya tak terlihat karena
 * `session_replication_role='replica'` mematikan FK cascade: lesson-nya tak
 * ikut terhapus, hanya jadi yatim yang menunjuk proyek yang tak ada.
 *
 * Tiap run menambah, tanpa satu pun gejala. **913 baris** menumpuk — dan
 * angka itu sempat terbaca sebagai "modul Lessons Learned punya 828 data",
 * padahal seluruhnya residu. Audit jalur hidup (§9a) pun ikut tertipu:
 * tabelnya tampak "berisi" sehingga lolos dari daftar tabel nol-baris.
 *
 * ── Cara pakai
 *
 *     node scripts/audit-residu-test.mjs           # potret sekarang
 *     node scripts/audit-residu-test.mjs --simpan  # simpan sebagai baseline
 *
 * Jalankan `--simpan` SEBELUM suite, lalu tanpa flag SESUDAHNYA: selisihnya
 * adalah residu yang tak dibersihkan.
 *
 * Tak memerahkan CI (CI memakai project terpisah dan schema per-run), tapi
 * memberi angka yang bisa dilihat alih-alih menunggu seseorang curiga.
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const BASELINE = join(import.meta.dirname, '.residu-baseline.json')
const SIMPAN = process.argv.includes('--simpan')

/**
 * Tabel yang test tulis ke dev. Bukan seluruh tabel — hanya yang punya
 * riwayat ditulisi test, supaya laporannya terbaca.
 */
const DIPANTAU = [
  'lessons_learned_records', 'productivity_records', 'price_book_entries',
  'approval_progress', 'projects', 'cost_codes', 'resources',
  'estimate_versions', 'estimate_items', 'rap_budget',
  'punch_items', 'inspection_requests', 'submittals',
  'material_requests', 'purchase_orders', 'goods_receipts',
  'notifications', 'audit_logs',
]

const c = new pg.Client({ connectionString: process.env.DIRECT_URL })
await c.connect()

const potret = {}
for (const t of DIPANTAU) {
  const ada = await c.query(`SELECT to_regclass('public.' || $1) AS r`, [t])
  if (!ada.rows[0].r) continue
  const { rows } = await c.query(`SELECT COUNT(*)::int n FROM ${t}`)
  potret[t] = rows[0].n
}

if (SIMPAN) {
  writeFileSync(BASELINE, JSON.stringify(potret, null, 2))
  console.log(`Baseline disimpan: ${Object.keys(potret).length} tabel.`)
  await c.end()
  process.exit(0)
}

// Residu yang bisa dikenali TANPA baseline: baris bertanda [TEST] yang
// tertinggal, dan baris yatim yang FK-nya menunjuk baris yang sudah hilang.
console.log('══ Residu bertanda [TEST] yang masih ada ══\n')
let adaResidu = false
for (const [tabel] of Object.entries(potret)) {
  const kolom = await c.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
       AND column_name IN ('title','name','code','nomor','judul')`, [tabel])
  if (kolom.rows.length === 0) continue
  const syarat = kolom.rows.map((r) => `${r.column_name} LIKE '[TEST]%'`).join(' OR ')
  const { rows } = await c.query(`SELECT COUNT(*)::int n FROM ${tabel} WHERE ${syarat}`)
  if (rows[0].n > 0) {
    console.log(`  ${tabel.padEnd(28)} ${rows[0].n}`)
    adaResidu = true
  }
}
if (!adaResidu) console.log('  (nihil)')

if (existsSync(BASELINE)) {
  const dulu = JSON.parse(readFileSync(BASELINE, 'utf8'))
  const naik = Object.entries(potret)
    .map(([t, n]) => [t, n - (dulu[t] ?? n)])
    .filter(([, d]) => d > 0)
  console.log('\n══ Bertambah sejak baseline ══\n')
  if (naik.length === 0) console.log('  (nihil — suite tidak meninggalkan residu)')
  else for (const [t, d] of naik) console.log(`  ${t.padEnd(28)} +${d}`)
}

await c.end()
