#!/usr/bin/env node
/**
 * PENJAGA: SUMBER LAPORAN HARUS ADA DI SKEMA NYATA.
 *
 * ── Cacat yang melahirkan penjaga ini
 *
 * `lib/laporan-susun.ts` mendaftarkan sumber data beserta kolomnya, dan
 * seluruh keamanan report builder bersandar pada daftar itu: apa pun yang tak
 * ada di daftar ditolak. Yang TIDAK dijaga siapa pun: apakah yang ADA di
 * daftar benar-benar ada di basis.
 *
 * Versi pertama mendaftarkan `project_expenses.amount`. Kolom itu tak ada —
 * yang benar `total_amount`. Konsekuensinya khas: kolom karangan **lolos
 * seluruh pemeriksaan pustaka** (ia ada di daftar, jadi sah), lalu gagal di
 * basis dengan pesan yang menunjuk query. Yang membacanya akan mengira
 * query-nya salah, bukan daftarnya.
 *
 * Ditemukan dengan mengukur ke `information_schema` sebelum menulis test.
 * Penjaga ini membuat pengukuran itu berulang di CI, bukan sekali di kepala
 * saya.
 *
 * ── Yang diperiksa
 *
 *   1. tiap `tabel` di SUMBER benar-benar ada
 *   2. tiap `kolom` benar-benar ada di tabelnya
 *   3. tabel ber-tenancy `company` punya `company_id`
 *   4. tabel ber-tenancy `project` punya `project_id`
 *
 * Nomor 3 dan 4 yang paling penting: sumber yang salah menyatakan cara
 * penyaringannya menghasilkan laporan yang menarik data perusahaan lain —
 * dan hasilnya terlihat seperti laporan yang wajar.
 *
 * Ambang NOL. Ini bukan ratchet: satu sumber yang salah sudah cukup.
 *
 * Pakai:  node apps/api/scripts/audit-sumber-laporan-nyata.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

/**
 * Jalur dihitung dari LETAK BERKAS INI, bukan dari `process.cwd()`.
 *
 * Penjaga API lain dijalankan CI dengan `working-directory: apps/api`,
 * sementara `pastikanCwdRootRepo()` menuntut root. Memakai keduanya berarti
 * penjaga ini gagal di CI karena alasan yang tak ada hubungannya dengan apa
 * yang dijaganya — dan penjaga yang gagal karena cwd biasanya berakhir
 * dinonaktifkan, bukan diperbaiki.
 */
const DIR = dirname(fileURLToPath(import.meta.url))
const BERKAS = join(DIR, '..', 'src', 'lib', 'laporan-susun.ts')

/**
 * Membaca daftar sumber dari berkas TypeScript tanpa mengeksekusinya.
 *
 * Regex dan bukan impor: berkas itu TypeScript, dan menjalankan `tsx` dari
 * penjaga menambah ketergantungan yang bisa gagal karena alasan yang tak ada
 * hubungannya dengan apa yang dijaga.
 */
function bacaSumber() {
  const isi = readFileSync(BERKAS, 'utf8')
  const hasil = []

  // Tiap blok sumber diawali `kunci:` dan diakhiri `],\n  },`
  const blokRe = /\{\s*\n\s*kunci: '([^']+)',[\s\S]*?tabel: '([^']+)',[\s\S]*?tenancy: '([^']+)',[\s\S]*?kolom: \[([\s\S]*?)\n\s*\],/g
  let m
  while ((m = blokRe.exec(isi)) !== null) {
    const [, kunci, tabel, tenancy, blokKolom] = m
    const kolom = [...blokKolom.matchAll(/kunci: '([^']+)'/g)].map((k) => k[1])
    hasil.push({ kunci, tabel, tenancy, kolom })
  }
  return hasil
}

const sumber = bacaSumber()

console.log('\n══ Sumber laporan vs skema NYATA ═══════════════════════════')
console.log(`  sumber terdaftar : ${sumber.length}`)

if (sumber.length === 0) {
  console.error('\n❌ Nol sumber terbaca dari laporan-susun.ts.')
  console.error('   Penjaga yang tak membaca apa pun selalu hijau — dan itu')
  console.error('   lebih buruk daripada tak ada penjaga sama sekali.')
  process.exit(1)
}

const c = buatClient()
await c.connect()

const pelanggaran = []

for (const s of sumber) {
  const { rows } = await c.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`, [s.tabel])

  if (rows.length === 0) {
    pelanggaran.push(`${s.kunci}: tabel "${s.tabel}" TIDAK ADA di basis`)
    continue
  }

  const ada = new Set(rows.map((r) => r.column_name))

  for (const k of s.kolom) {
    if (!ada.has(k)) {
      pelanggaran.push(`${s.kunci}: kolom "${k}" tak ada di ${s.tabel}`)
    }
  }

  // Penyaringan tenant — bagian yang paling mahal kalau salah.
  if (s.tenancy === 'company' && !ada.has('company_id')) {
    pelanggaran.push(
      `${s.kunci}: tenancy 'company' tetapi ${s.tabel} TAK PUNYA company_id — `
      + 'laporannya akan menarik data perusahaan lain')
  }
  if (s.tenancy === 'project' && !ada.has('project_id')) {
    pelanggaran.push(
      `${s.kunci}: tenancy 'project' tetapi ${s.tabel} TAK PUNYA project_id`)
  }
  if (s.tenancy !== 'company' && s.tenancy !== 'project') {
    pelanggaran.push(`${s.kunci}: tenancy "${s.tenancy}" tak dikenal`)
  }

  console.log(`  ✓ ${s.kunci.padEnd(14)} ${s.tabel.padEnd(20)} ${s.kolom.length} kolom`)
}

await c.end()

if (pelanggaran.length > 0) {
  console.error(`\n❌ ${pelanggaran.length} pelanggaran:\n`)
  for (const p of pelanggaran) console.error(`     ${p}`)
  console.error('\n   Kolom karangan LOLOS seluruh pemeriksaan pustaka — ia ada')
  console.error('   di daftar, jadi sah — lalu gagal di basis dengan pesan yang')
  console.error('   menunjuk query. Yang membacanya akan mengira query-nya')
  console.error('   yang salah, bukan daftarnya.\n')
  process.exit(1)
}

console.log('\n✅ Seluruh sumber laporan cocok dengan skema nyata.\n')
