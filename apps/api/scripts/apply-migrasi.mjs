#!/usr/bin/env node
/**
 * APPLY SATU MIGRASI + CATAT BUKUNYA.
 *
 * ── Kenapa ada
 *
 * 2026-07-31 ditemukan **20 migrasi sudah jalan tapi tak tercatat** di
 * `supabase_migrations.schema_migrations` — termasuk seluruh seri multi-tenant
 * 126–137. Sebabnya: DDL dijalankan lewat skrip sekali-pakai yang lupa menulis
 * bukunya. Bahayanya konkret — `ci-project-setup.mjs` memutuskan "apa yang perlu
 * dijalankan" murni dari buku itu, jadi diarahkan ke dev ia akan MENJALANKAN
 * ULANG 20 migrasi termasuk penulisan ulang policy RLS.
 *
 * Skrip ini menutup akar masalahnya: apply dan pencatatan terjadi bersama, dan
 * pencatatan HANYA setelah migrasinya benar-benar berhasil.
 *
 * ── Kenapa TIDAK memakai transaksi pembungkus
 *
 * Berkas migrasi membawa BEGIN/COMMIT-nya sendiri. Membungkusnya lagi membuat
 * `RAISE EXCEPTION` di blok verifikasi tak bisa membatalkan apa-apa dengan
 * benar, dan Postgres menolak transaksi bersarang.
 *
 * PEMAKAIAN (dari apps/api, supaya dotenv/pg ter-resolve):
 *   node scripts/apply-migrasi.mjs 149_asset_register
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const nama = process.argv[2]
if (!nama) {
  console.error('Pemakaian: node scripts/apply-migrasi.mjs <nama_migrasi_tanpa_.sql>')
  process.exit(1)
}

const versi = nama.split('_')[0]
const berkas = join(import.meta.dirname, '..', '..', '..', 'db', 'migrations', `${nama}.sql`)
const sql = readFileSync(berkas, 'utf8')

const c = new pg.Client({ connectionString: process.env.DIRECT_URL })
await c.connect()

// Notice dari blok verifikasi (RAISE NOTICE) adalah bukti utama migrasi
// berhasil — tanpa ini, "tidak ada error" jadi satu-satunya sinyal, dan itu
// persis yang membuat migrasi hantu 043 lolos.
c.on('notice', (n) => console.log('  [db]', n.message))

try {
  const sudah = await c.query(
    `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1`, [versi])
  if (sudah.rowCount) {
    console.log(`⚠️  Versi ${versi} SUDAH tercatat di buku. Berhenti.`)
    console.log('   Kalau ini forward-draft yang baru mau di-apply, hapus dulu catatannya')
    console.log('   secara sadar — jangan di-apply diam-diam di atas catatan lama.')
    process.exit(1)
  }

  console.log(`▶ Menjalankan ${nama} …`)
  await c.query(sql)
  console.log('✅ Migrasi berhasil.')

  await c.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING`,
    [versi, nama, [sql]])
  console.log(`📖 Tercatat di schema_migrations sebagai versi ${versi}.`)
} catch (e) {
  console.error('❌ GAGAL:', e.message)
  console.error('   Buku TIDAK ditulis — mencatat migrasi yang gagal persis cacat 043.')
  process.exitCode = 1
} finally {
  await c.end()
}
