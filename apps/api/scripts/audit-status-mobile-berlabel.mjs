#!/usr/bin/env node
/**
 * Tiap nilai status yang bisa sampai ke layar mobile wajib punya LABEL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ditemukan 2026-09-04 dari MEMOTRET layar mandor: lencana statusnya
 * berbunyi **"submitted"** — kunci basis, apa adanya, di aplikasi
 * berbahasa Indonesia.
 *
 * `statusLabel()` di `components/ui/Badge.tsx` memakai:
 *
 *     return map[status] ?? status
 *
 * Jadi status yang tak terdaftar TIDAK gagal — ia MUNCUL MENTAH. Tak ada
 * galat, tak ada tanda; yang terlihat cuma kata Inggris teknis di layar
 * orang yang justru tak paham istilah teknis.
 *
 * Diukur dari data produksi saat itu, tiga dari sepuluh status hilang dari
 * peta: `draft`, `submitted`, `settled`.
 *
 * ── Kelas cacat yang sama sudah dijaga di WEB, dan mobile tak tercakup
 *
 * `audit-jenis-tulis-punya-label.mjs` menjaga hal yang sama untuk layar
 * keputusan di web ("kunci mentah muncul di layar keputusan uang"). Mobile
 * memakai peta yang berbeda, di berkas yang berbeda, dan tak pernah ikut.
 *
 * ── Dari mana daftar statusnya
 *
 * Dari **tipe ENUM PostgreSQL** — `kasbon_status`, `project_status`,
 * `wage_report_status`. Sumber yang tak bisa menyimpang dari kenyataan.
 *
 * Bukan dari data yang KEBETULAN ada: tabel yang hari ini hanya berisi
 * `draft` dan `submitted` tetap boleh menghasilkan `rejected` besok, dan
 * penjaga yang belajar dari isi tabel akan hijau sampai hari itu tiba.
 *
 * ⚠ Draf pertama membaca CHECK constraint, dan memulangkan "tanpa CHECK
 * status" untuk `kasbons` dan `projects` — keduanya jelas punya status.
 * Alat yang membaca sumber yang salah memulangkan nol yang terbaca seperti
 * keadaan bersih.
 *
 * ── Dua kesalahan draf pertama, dicatat supaya tak diulang
 *
 *   1. Nama tabel ditebak dari nama rute (`/mandor/wage-reports` →
 *      `mandor_wage_reports`). Yang benar `weekly_wage_reports`, dan
 *      tabel yang tak ada memulangkan nol yang terlihat sama persis
 *      dengan keadaan bersih.
 *
 *   2. `punch_items`/`ncr_items`/`izin_kerja` didaftarkan, padahal
 *      `pekerjaan.tsx` memakai petanya SENDIRI. Hasilnya lima temuan
 *      palsu dari satu tabel — cukup untuk membuat orang berikutnya
 *      menganggap seluruh keluaran penjaga ini sampah.
 *
 * ── Ambang NOL
 *
 * Satu status tanpa label = satu kata Inggris di layar keputusan.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const BADGE = join(AKAR, 'apps', 'mobile', 'components', 'ui', 'Badge.tsx')

if (!existsSync(BADGE)) {
  console.error(`❌ Badge.tsx tak ada di ${BADGE} — jalurnya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

/*
  Tabel yang statusnya BISA sampai ke layar mobile.

  Ditulis tangan dan sengaja: menyapu seluruh basis akan menarik status
  dari tabel yang tak pernah dirender di HP, dan penjaga yang merah untuk
  hal di luar jangkauannya lebih cepat dimatikan daripada diperbaiki.

  Tiap baris di sini punya layar mobilenya sendiri — daftarnya bertambah
  saat layar baru dibuat.
*/
const TABEL = [
  /*
    ⚠ `weekly_wage_reports`, BUKAN `mandor_wage_reports`.

    Draf pertama penjaga ini menebak namanya dari nama rutenya
    (`/mandor/wage-reports`) dan memulangkan "tanpa CHECK status" — yang
    terbaca seperti "tabel ini memang tak punya status", padahal tabelnya
    yang tak ada. Diukur: `weekly_wage_reports.status` bertipe
    `wage_report_status` dengan lima nilai.

    Nol hasil dari nama yang salah terlihat sama persis dengan nol hasil
    dari keadaan yang bersih.
  */
  ['weekly_wage_reports', 'app/(app)/mandor/index.tsx'],
  ['kasbons', 'app/(app)/kasbon/index.tsx'],
  ['projects', 'app/(app)/proyek/index.tsx'],
  /*
    `punch_items`, `ncr_items`, dan `izin_kerja` SENGAJA tak didaftarkan.

    Ketiganya dirender `pekerjaan.tsx`, yang punya petanya SENDIRI —
    `STATUS_PUNCH`, `STATUS_NCR`, `STATUS_IZIN` — bukan `Badge.statusLabel`.
    Statusnya juga sudah bahasa Indonesia di basis (`terbuka`, `ditutup`,
    `diajukan`), jadi memeriksanya terhadap peta `Badge` akan merah untuk
    lima status yang sebenarnya BENAR.

    Draf pertama penjaga ini melakukan persis itu: lima temuan palsu dari
    satu tabel. Penjaga yang salah merah lebih cepat dimatikan daripada
    penjaga yang jangkauannya sempit — jadi jangkauannya dipersempit, dan
    batasnya ditulis, bukan disembunyikan.

    Menjaga ketiga peta itu butuh penjaga terpisah yang membaca berkas
    layarnya, bukan `Badge.tsx`.
  */
]

/* CR dibuang — CLAUDE.md §7a. Komentar juga: contoh status di dokumentasi
   bukan pendaftaran. */
const kode = readFileSync(BADGE, 'utf8')
  .replace(/\r/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')

/*
  Kunci yang TERDAFTAR di peta `statusLabel`.

  Dibaca dari isi `const map: Record<string, string> = { … }`, bukan dari
  seluruh berkas: `statusVariant` di atasnya memuat nama status yang sama
  sebagai `case`, dan membacanya akan membuat penjaga hijau untuk status
  yang punya WARNA tapi tak punya KATA.
*/
const blokMap = /const map: Record<string, string> = \{([\s\S]*?)\n\s*\}/.exec(kode)
if (!blokMap) {
  console.error('❌ Peta `map` di statusLabel tak ditemukan di Badge.tsx.')
  console.error('   Bentuknya berubah — nol kunci dari peta yang tak ketemu akan')
  console.error('   HIJAU, dan itu bohong.')
  process.exit(1)
}

const berlabel = new Set(
  [...blokMap[1].matchAll(/^\s*([a-z_][a-z0-9_]*)\s*:/gm)].map((m) => m[1])
)

if (berlabel.size === 0) {
  console.error('❌ Nol kunci terbaca dari peta — pembacaannya meleset.')
  process.exit(1)
}

const c = buatClient()
await c.connect()

const temuan = []
const laporan = []

for (const [tabel, layar] of TABEL) {
  /*
    Status diambil dari ENUM PostgreSQL, bukan dari CHECK dan bukan dari
    isi tabel.

    ⚠ Draf pertama membaca CHECK constraint dan memulangkan "tanpa CHECK
    status" untuk `kasbons` dan `projects` — keduanya JELAS punya status.
    Sebabnya repo ini memakai tipe enum (`kasbon_status`, `project_status`,
    `wage_report_status`), bukan `text` + CHECK.

    Alat yang membaca sumber yang salah memulangkan nol yang terbaca
    seperti keadaan bersih — kelas yang sama dengan "nol hasil bukan bukti
    ketiadaan" di CLAUDE.md §7a.

    Kenapa bukan dari isi tabel: tabel yang hari ini hanya berisi `draft`
    dan `submitted` tetap boleh menghasilkan `rejected` besok, dan penjaga
    yang belajar dari isi akan hijau sampai hari itu tiba.
  */
  const { rows } = await c.query(
    `SELECT e.enumlabel AS nilai
       FROM information_schema.columns col
       JOIN pg_type t  ON t.typname = col.udt_name
       JOIN pg_enum e  ON e.enumtypid = t.oid
      WHERE col.table_schema = 'public'
        AND col.table_name  = $1
        AND col.column_name = 'status'
      ORDER BY e.enumsortorder`,
    [tabel]
  )

  if (rows.length === 0) {
    /*
      Nol enum = tabelnya tak ada, kolomnya tak ada, atau tipenya bukan
      enum. Ketiganya berarti daftar TABEL di atas sudah basi — dan
      penjaga yang diam untuk daftar basi berhenti menjaga tanpa gejala.
    */
    console.error(`❌ \`${tabel}\`.status bukan enum, atau tabelnya tak ada.`)
    console.error('   Daftar TABEL di penjaga ini basi — perbaiki namanya.')
    await c.end()
    process.exit(1)
  }

  const nilai = new Set(rows.map((r) => r.nilai))

  const hilang = [...nilai].filter((s) => !berlabel.has(s)).sort()
  laporan.push({ tabel, layar, status: [...nilai].sort(), hilang })
  for (const s of hilang) temuan.push({ tabel, layar, status: s })
}

await c.end()

console.log('══ Status mobile berlabel ═════════════════════════════════════')
console.log(`  kunci berlabel di Badge.tsx : ${berlabel.size}`)
for (const r of laporan) {
  const sisa = `${r.status.length} status · ${r.hilang.length} tanpa label`
  console.log(`  ${r.tabel.padEnd(22)} ${sisa}`)
}

if (temuan.length > 0) {
  console.error('')
  console.error('  ❌ Status tanpa label — akan muncul MENTAH di layar:')
  for (const t of temuan) {
    console.error(`     "${t.status}"  dari ${t.tabel}  →  ${t.layar}`)
  }
  console.error('')
  console.error('  `statusLabel()` memakai `map[status] ?? status`, jadi kunci yang')
  console.error('  tak terdaftar TIDAK gagal — ia tampil apa adanya. Diukur')
  console.error('  2026-09-04: lencana layar mandor berbunyi "submitted".')
  console.error('')
  console.error('  Tambahkan di `apps/mobile/components/ui/Badge.tsx`:')
  console.error('     statusLabel → map  (kata Indonesia)')
  console.error('     statusVariant      (warna semantik)')
  console.error('')
  process.exit(1)
}

console.log('')
console.log('✅ Tiap status yang bisa sampai ke layar mobile punya label Indonesia.')
console.log('   Batas, dan ada DUA:')
console.log('     · daftar TABEL ditulis tangan — layar baru yang menampilkan')
console.log('       status dari tabel lain tak terjaga sampai didaftarkan;')
console.log('     · hanya peta `Badge.statusLabel` yang diperiksa. `pekerjaan.tsx`')
console.log('       punya STATUS_PUNCH / STATUS_NCR / STATUS_IZIN sendiri, dan')
console.log('       ketiganya TIDAK dijaga di sini.')
