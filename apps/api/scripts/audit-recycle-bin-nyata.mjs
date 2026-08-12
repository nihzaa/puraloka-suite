#!/usr/bin/env node
/**
 * PENJAGA: ENTRI RECYCLE BIN HARUS PUNYA SOFT DELETE YANG NYATA.
 *
 * ── Kenapa penjaga ini ada sejak hari pertama modulnya
 *
 * `lib/recycle-bin.ts` menyatakan tabel mana yang punya recycle bin. Seluruh
 * modul bersandar pada daftar itu — dan yang TIDAK dijaga siapa pun: apakah
 * tabel yang terdaftar benar-benar punya kolom soft delete.
 *
 * Entri untuk tabel tanpa `is_deleted` akan **lolos seluruh pemeriksaan
 * pustaka** (ia ada di daftar, jadi sah), lalu gagal di basis dengan pesan
 * yang menunjuk query. Yang membacanya akan mengira query-nya yang salah,
 * bukan daftarnya.
 *
 * Kelas cacat yang sama sudah terjadi di G6d (`project_expenses.amount` yang
 * tak ada), dan penjaganya lahir SESUDAH cacatnya. Kali ini penjaganya
 * dibuat bersamaan.
 *
 * ── Yang diperiksa
 *
 *   1. tabelnya ada
 *   2. punya `is_deleted`, `deleted_at`, `deleted_by` — ketiganya
 *   3. `kolomNama` benar-benar ada (ia yang menamai baris di layar)
 *   4. tenancy `company` → punya `company_id`; `project` → punya `project_id`
 *   5. izin yang disebut ADA di tabel `permissions`
 *
 * Nomor 4 yang paling mahal kalau salah: recycle bin yang keliru menyatakan
 * cara penyaringannya akan menampilkan data perusahaan lain — dan daftar
 * "yang terhapus" adalah tempat paling sepi untuk kebocoran, karena jarang
 * dibuka.
 *
 * Ambang NOL. Satu entri salah sudah cukup.
 *
 * Pakai:  node apps/api/scripts/audit-recycle-bin-nyata.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

// Jalur dari LETAK BERKAS INI — penjaga API lain dijalankan CI dengan
// `working-directory: apps/api`, dan penjaga yang gagal karena cwd biasanya
// berakhir dinonaktifkan, bukan diperbaiki.
const DIR = dirname(fileURLToPath(import.meta.url))
const BERKAS = join(DIR, '..', 'src', 'lib', 'recycle-bin.ts')

function bacaRegistry() {
  const isi = readFileSync(BERKAS, 'utf8')
  const hasil = []
  const re = /\{\s*\n\s*kunci: '([^']+)',[\s\S]*?tabel: '([^']+)',[\s\S]*?kolomNama: '([^']+)',[\s\S]*?tenancy: '([^']+)',[\s\S]*?izinLihat: '([^']+)',[\s\S]*?izinPulih: '([^']+)',/g
  let m
  while ((m = re.exec(isi)) !== null) {
    hasil.push({
      kunci: m[1], tabel: m[2], kolomNama: m[3],
      tenancy: m[4], izinLihat: m[5], izinPulih: m[6],
    })
  }
  return hasil
}

const registry = bacaRegistry()

console.log('\n══ Registry recycle bin vs skema NYATA ═════════════════════')
console.log(`  entri terdaftar : ${registry.length}`)

if (registry.length === 0) {
  console.error('\n❌ Nol entri terbaca dari recycle-bin.ts.')
  console.error('   Penjaga yang tak membaca apa pun selalu hijau — dan itu')
  console.error('   lebih buruk daripada tak ada penjaga sama sekali.')
  process.exit(1)
}

const c = buatClient()
await c.connect()

const pelanggaran = []

for (const e of registry) {
  const { rows } = await c.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`, [e.tabel])

  if (rows.length === 0) {
    pelanggaran.push(`${e.kunci}: tabel "${e.tabel}" TIDAK ADA di basis`)
    continue
  }

  const ada = new Set(rows.map((r) => r.column_name))

  for (const k of ['is_deleted', 'deleted_at', 'deleted_by']) {
    if (!ada.has(k)) {
      pelanggaran.push(
        `${e.kunci}: ${e.tabel} tak punya "${k}" — soft delete-nya tak lengkap, `
        + 'dan recycle bin di atasnya tak akan pernah berisi apa pun')
    }
  }

  if (!ada.has(e.kolomNama)) {
    pelanggaran.push(`${e.kunci}: kolomNama "${e.kolomNama}" tak ada di ${e.tabel}`)
  }

  if (e.tenancy === 'company' && !ada.has('company_id')) {
    pelanggaran.push(
      `${e.kunci}: tenancy 'company' tetapi ${e.tabel} TAK PUNYA company_id — `
      + 'recycle bin-nya akan menampilkan data perusahaan lain')
  }
  if (e.tenancy === 'project' && !ada.has('project_id')) {
    pelanggaran.push(`${e.kunci}: tenancy 'project' tetapi ${e.tabel} tak punya project_id`)
  }
  if (e.tenancy !== 'company' && e.tenancy !== 'project') {
    pelanggaran.push(`${e.kunci}: tenancy "${e.tenancy}" tak dikenal`)
  }

  for (const izin of [e.izinLihat, e.izinPulih]) {
    const { rows: p } = await c.query(
      `SELECT 1 FROM permissions WHERE key = $1`, [izin])
    if (p.length === 0) {
      pelanggaran.push(
        `${e.kunci}: izin "${izin}" tak ada di tabel permissions — gerbangnya `
        + 'akan tertutup untuk semua orang')
    }
  }

  console.log(`  ✓ ${e.kunci.padEnd(12)} ${e.tabel.padEnd(16)} ${e.tenancy}`)
}

await c.end()

if (pelanggaran.length > 0) {
  console.error(`\n❌ ${pelanggaran.length} pelanggaran:\n`)
  for (const p of pelanggaran) console.error(`     ${p}`)
  console.error('\n   Entri untuk tabel tanpa soft delete LOLOS seluruh pemeriksaan')
  console.error('   pustaka — ia ada di daftar, jadi sah — lalu gagal di basis')
  console.error('   dengan pesan yang menunjuk query, bukan daftarnya.\n')
  process.exit(1)
}

console.log('\n✅ Seluruh entri recycle bin punya soft delete yang nyata.\n')
