#!/usr/bin/env node
/**
 * UJI INVARIAN NCR — membuktikan constraint database benar-benar menolak
 * keadaan yang tak boleh terjadi.
 *
 * ── Kenapa diuji lewat database, bukan unit test
 *
 * Constraint yang ditulis di migrasi bisa saja tak pernah aktif: salah nama
 * kolom, sintaks yang diterima tapi selalu benar, atau tabelnya sudah ada
 * lebih dulu sehingga `CREATE TABLE IF NOT EXISTS` melewatinya diam-diam.
 * Satu-satunya cara tahu adalah MENCOBA MELANGGARNYA.
 *
 * Setiap uji di bawah menyisipkan baris yang seharusnya DITOLAK. Kalau ia
 * berhasil masuk, invariannya bocor.
 *
 * Pakai (dari apps/api): node scripts/uji-invarian-ncr.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

// Env dibaca dari apps/api/.env — BOM dan tanda kutip dilucuti (CLAUDE.md §7).
const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
// Env var LEBIH DULU, `.env` cadangan: di CI tak ada `apps/api/.env`, dan
// `readFileSync` akan melempar sebelum satu pun invarian diuji.
if (!process.env.DIRECT_URL)
for (const baris of readFileSync(join(AKAR, '.env'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
  const m = baris.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const db = new Client({
  connectionString: process.env.DIRECT_URL || env.DIRECT_URL || env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await db.connect()

// Data pinjaman: satu proyek + dua user nyata. NCR butuh keduanya sebagai FK.
const { rows: proyek } = await db.query('SELECT id FROM projects LIMIT 1')
const { rows: user } = await db.query('SELECT id FROM users LIMIT 2')
if (!proyek.length || user.length < 2) {
  console.log('⚠️  Butuh minimal 1 proyek dan 2 user di database. Dilewati.')
  await db.end()
  process.exit(0)
}
const PID = proyek[0].id
const [U1, U2] = user.map((u) => u.id)

let lolos = 0
let bocor = 0
let nomor = 0

/**
 * Menyisipkan baris dan MENGHARAPKAN ditolak.
 * Kalau ia masuk, invariannya bocor — dan barisnya dihapus supaya uji ini
 * tak meninggalkan sampah.
 */
async function harusDitolak(nama, kolom) {
  nomor++
  const n = `UJI-${Date.now()}-${nomor}`
  const isi = { project_id: PID, nomor: n, judul: 'uji invarian', dilaporkan_oleh: U1, ...kolom }
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO ncr_items (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      Object.values(isi),
    )
    await db.query('DELETE FROM ncr_items WHERE id = $1', [rows[0].id])
    console.log(`  ✗ BOCOR  ${nama}`)
    bocor++
  } catch (e) {
    // Hanya pelanggaran CHECK yang dihitung lolos. Galat lain (kolom tak
    // ada, tipe salah) berarti UJINYA yang salah, bukan invariannya bekerja
    // — dan itu harus terlihat, bukan disamarkan sebagai keberhasilan.
    if (e.code === '23514') {
      console.log(`  ✓ ditolak  ${nama}`)
      lolos++
    } else {
      console.log(`  ⚠ galat lain (${e.code}) ${nama}: ${e.message.split('\n')[0].slice(0, 80)}`)
      bocor++
    }
  }
}

/** Menyisipkan baris yang seharusnya DITERIMA — memastikan uji di atas tak
 *  lolos hanya karena semua insert kebetulan gagal. */
async function harusDiterima(nama, kolom) {
  nomor++
  const n = `UJI-${Date.now()}-${nomor}`
  const isi = { project_id: PID, nomor: n, judul: 'uji invarian', dilaporkan_oleh: U1, ...kolom }
  const k = Object.keys(isi)
  const v = k.map((_, i) => `$${i + 1}`).join(', ')
  try {
    const { rows } = await db.query(
      `INSERT INTO ncr_items (${k.join(', ')}) VALUES (${v}) RETURNING id`,
      Object.values(isi),
    )
    await db.query('DELETE FROM ncr_items WHERE id = $1', [rows[0].id])
    console.log(`  ✓ diterima ${nama}`)
    lolos++
  } catch (e) {
    console.log(`  ✗ DITOLAK PADAHAL SAH  ${nama}: ${e.message.split('\n')[0].slice(0, 90)}`)
    bocor++
  }
}

const KINI = new Date().toISOString()

console.log('── Penjaga berdaya: baris SAH harus bisa masuk ──')
await harusDiterima('NCR baru, status terbuka', {})
await harusDiterima('ditutup dengan jejak lengkap', {
  status: 'ditutup',
  disposisi: 'perbaiki', disposisi_oleh: U1, disposisi_pada: KINI,
  diverifikasi_oleh: U2, diverifikasi_pada: KINI, ditutup_pada: KINI,
  tindakan_perbaikan: 'dikerjakan ulang sesuai gambar A-12',
  akar_masalah: 'gambar revisi tak sampai ke tukang',
})

console.log('\n── Invarian: lanjut tanpa disposisi ──')
await harusDitolak('status perbaikan tanpa disposisi', { status: 'perbaikan' })
await harusDitolak('status verifikasi tanpa disposisi', { status: 'verifikasi' })

console.log('\n── Invarian: tutup tanpa jejak lengkap ──')
const dasarTutup = {
  status: 'ditutup',
  disposisi: 'perbaiki', disposisi_oleh: U1, disposisi_pada: KINI,
  diverifikasi_oleh: U2, diverifikasi_pada: KINI, ditutup_pada: KINI,
  tindakan_perbaikan: 'dikerjakan ulang',
  akar_masalah: 'gambar tak sampai',
}
await harusDitolak('tutup tanpa akar masalah', { ...dasarTutup, akar_masalah: null })
await harusDitolak('tutup dengan akar masalah kosong', { ...dasarTutup, akar_masalah: '   ' })
await harusDitolak('tutup tanpa tindakan perbaikan', { ...dasarTutup, tindakan_perbaikan: null })
await harusDitolak('tutup tanpa verifikator', { ...dasarTutup, diverifikasi_oleh: null })

console.log('\n── Invarian: verifikator bukan pelapor ──')
await harusDitolak('pelapor memverifikasi sendiri', { ...dasarTutup, diverifikasi_oleh: U1 })

console.log('\n── Invarian: batal tanpa alasan ──')
await harusDitolak('dibatalkan tanpa catatan', { status: 'dibatalkan' })
await harusDiterima('dibatalkan dengan alasan', {
  status: 'dibatalkan', disposisi_catatan: 'salah baca gambar, ternyata sesuai',
})

console.log(`\n${lolos} invarian tegak · ${bocor} bocor`)
await db.end()
process.exit(bocor ? 1 : 0)
