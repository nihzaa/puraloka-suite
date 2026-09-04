#!/usr/bin/env node
/**
 * PENJAGA: SETIAP PERSETUJUAN MELEWATI GERBANG SoD.
 *
 * ── Cacat yang melahirkan penjaga ini
 *
 * Diukur 2026-08-12: `recordApproval` — satu-satunya pintu persetujuan di repo
 * ini (ADR-007) — menerima `approvedBy` dan TIDAK PERNAH membandingkannya
 * dengan pengaju. Sembilan jenis entitas, 18 pemanggilan, nol pengecekan.
 *
 * Seorang mandor dengan izin approve bisa mengajukan kasbon lalu menyetujuinya
 * sendiri dalam dua ketukan. Uang tunai, ke rekeningnya sendiri.
 *
 * Yang ADA hanyalah penanda tampilan: `approval-inbox.ts` mengirim
 * `saya_pengajunya: boolean` dan halamannya menampilkan lencana "pengajuan
 * Anda". Tombolnya disembunyikan; rutenya tidak. Tombol tersembunyi itu UX,
 * bukan batas keamanan — rute API bisa dipanggil langsung.
 *
 * ── Yang diperiksa: DUA hal
 *
 * 1. CAKUPAN RUTE — tiap berkas yang memanggil `recordApproval` wajib juga
 *    memanggil `periksaGerbangSod`. Gerbangnya berdiri terpisah (karena
 *    `recordApproval` tak menerima `request`, jadi tak bisa membaca izin),
 *    dan "terpisah" tanpa penjaga berarti "boleh dilupakan".
 *
 * 2. KELENGKAPAN REGISTRI — tiap jenis di `ApprovalEntityType` wajib punya
 *    entri di `ATURAN_SOD`, dan kolom pengaju yang disebutkannya wajib ADA
 *    di schema. Pemeriksaan kedua ini yang paling penting: `inbox-approval.ts`
 *    punya dua entri `kolomPengaju: null` yang TERNYATA SALAH —
 *    `project_expenses.submitted_by` dan `submittals.diajukan_oleh`
 *    dua-duanya ada. Registri ditulis sekali lalu tak pernah diperiksa lagi
 *    terhadap basis, dan membusuk diam-diam.
 *
 * Ambang NOL untuk keduanya.
 *
 * Pakai:  node apps/api/scripts/audit-sod-gerbang.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const SRC = join(DIR, '..', 'src')
const RUTE = join(SRC, 'routes', 'v1')

let gagal = 0

// ── 1. Cakupan rute ─────────────────────────────────────────────────────────
const berkasRute = readdirSync(RUTE).filter(f => f.endsWith('.ts'))
const pemanggil = []
const bolong = []

for (const f of berkasRute) {
  const isi = readFileSync(join(RUTE, f), 'utf8')
  if (!/\brecordApproval\s*\(/.test(isi)) continue
  pemanggil.push(f)
  if (!/\bperiksaGerbangSod\s*\(/.test(isi)) bolong.push(f)
}

console.log('\n══ SoD: gerbang di jalur persetujuan ═══════════════════════')
console.log(`  berkas memanggil recordApproval : ${pemanggil.length}`)
console.log(`  tanpa periksaGerbangSod          : ${bolong.length}`)

// Ratchet cakupan, bukan sekadar "bukan nol".
//
// Mutasi M4 saat penjaga ini dibuat: nama `recordApproval` diubah di satu
// berkas → hitungan turun 9 ke 8, dan penjaga tetap HIJAU. Berkas itu keluar
// dari pengawasan tanpa satu pun galat, karena "tak memanggil recordApproval"
// terlihat sama persis dengan "tak ada jalur approval di sini".
//
// Angka ini LANTAI. Rute approval baru menaikkannya (sunting angkanya, sadar);
// rute yang hilang dari pengawasan menurunkannya (CI merah, tak bisa senyap).
const LANTAI_PEMANGGIL = 9

if (pemanggil.length < LANTAI_PEMANGGIL) {
  console.error(`\n❌ Hanya ${pemanggil.length} berkas memanggil recordApproval, lantainya ${LANTAI_PEMANGGIL}.`)
  console.error('   Sebuah jalur approval keluar dari pengawasan penjaga ini.')
  console.error('   Kalau memang rutenya dihapus, turunkan LANTAI_PEMANGGIL')
  console.error('   dengan sadar — jangan biarkan angkanya merosot diam-diam.')
  process.exit(1)
}

if (bolong.length > 0) {
  console.error('\n❌ Berkas memanggil recordApproval TANPA gerbang SoD:\n')
  for (const f of bolong) console.error(`     routes/v1/${f}`)
  console.error('\n   Pengaju bisa menyetujui pengajuannya sendiri lewat rute ini.')
  console.error('   Tambahkan `periksaGerbangSod` sebelum `recordApproval`.\n')
  gagal++
}

// ── 2. Kelengkapan registri ─────────────────────────────────────────────────
const isiApproval = readFileSync(join(SRC, 'utils', 'approval.ts'), 'utf8')
const isiSod = readFileSync(join(SRC, 'lib', 'sod.ts'), 'utf8')

// `ApprovalEntityType` ditulis sebagai union `| 'x'` bertingkat, dengan
// komentar panjang di antaranya. Diambil dari blok tipenya saja supaya
// literal string di tempat lain tak ikut terbaca.
// `\n\n` saja TIDAK cukup: berkas ini berakhiran CRLF, jadi baris kosong
// pemisahnya adalah `\r\n\r\n`. Penjaga versi pertama memakai `\n\n` dan
// mati dengan "bentuknya berubah" pada berkas yang bentuknya sama sekali
// tidak berubah — hanya line endingnya yang tak pernah saya perhitungkan.
const blokTipe = isiApproval.match(/export type ApprovalEntityType =([\s\S]*?)\r?\n\s*\r?\n/)
if (!blokTipe) {
  console.error('\n❌ Blok `ApprovalEntityType` tak terbaca di utils/approval.ts.')
  console.error('   Bentuknya berubah — penjaga ini menolak berjalan buta.')
  process.exit(1)
}
const jenisTipe = [...blokTipe[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1])
const jenisRegistri = [...isiSod.matchAll(/jenis: '([a-z_]+)'/g)].map(m => m[1])

const tanpaAturan = jenisTipe.filter(j => !jenisRegistri.includes(j))
const yatim = jenisRegistri.filter(j => !jenisTipe.includes(j))

console.log(`  jenis di ApprovalEntityType      : ${jenisTipe.length}`)
console.log(`  jenis di ATURAN_SOD              : ${jenisRegistri.length}`)

if (jenisTipe.length === 0) {
  console.error('\n❌ Nol jenis terbaca dari ApprovalEntityType.')
  process.exit(1)
}

if (tanpaAturan.length > 0) {
  console.error('\n❌ Jenis approval TANPA aturan SoD:\n')
  for (const j of tanpaAturan) console.error(`     ${j}`)
  console.error('\n   `periksaGerbangSod` menolak jenis tak terdaftar (fail-closed),')
  console.error('   jadi approval jenis ini akan MATI TOTAL — bukan lolos, tetapi')
  console.error('   juga bukan bekerja. Daftarkan di lib/sod.ts.\n')
  gagal++
}

if (yatim.length > 0) {
  console.error('\n❌ Aturan SoD untuk jenis yang tak ada di ApprovalEntityType:\n')
  for (const j of yatim) console.error(`     ${j}`)
  console.error('\n   Aturan yang tak pernah dipanggil membusuk tanpa terlihat.\n')
  gagal++
}

// ── 3. Kolom pengaju wajib nyata ────────────────────────────────────────────
//
// Butuh basis. Tanpa DATABASE_URL (mis. lint lokal cepat), pemeriksaan ini
// DILEWATI DENGAN SUARA — bukan dilaporkan sebagai lulus.
/*
  ⚠ Kredensial dibaca dari `.env` JUGA, bukan `process.env` saja — 2026-09-04.

  Penjaga ini melewati DIRINYA SENDIRI di mesin yang punya basis: ia
  menanyakan `process.env`, sementara kredensial repo ini di `apps/api/.env`.
  Salah satu dari SEBELAS yang ditemukan sekaligus.

  Dua tempat wajib diperbaiki bersama — pemeriksaan `punyaDb` DAN
  `connectionString`. Kalau hanya yang pertama, ia melapor "punya basis" lalu
  gagal menyambung dengan galat yang menuduh jaringan.
*/
const { bacaEnv: _bacaEnv } = await import('../../../scripts/db/_koneksi.mjs')
const _envBerkas = _bacaEnv()
const _DB =
  process.env.DATABASE_URL || process.env.DIRECT_URL
  || _envBerkas.DATABASE_URL || _envBerkas.DIRECT_URL

const punyaDb = !!(_DB)
if (!punyaDb) {
  console.log('\n  ⏭  kolom pengaju vs schema: DILEWATI (tak ada DATABASE_URL)')
  console.log('     Ini pemeriksaan yang menangkap `kolomPengaju` salah —')
  console.log('     CI menjalankannya dengan basis, lokal boleh tanpa.')
} else {
  const { default: pg } = await import('pg')
  const c = new pg.Client({ connectionString: _DB })
  await c.connect()
  const entri = [...isiSod.matchAll(/jenis: '([a-z_]+)',\s*tabel: '([a-z_]+)',\s*kolomPengaju: '([a-z_]+)'/g)]
  const salah = []
  for (const [, jenis, tabel, kolom] of entri) {
    const r = await c.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3',
      ['public', tabel, kolom],
    )
    if (r.rowCount === 0) salah.push({ jenis, tabel, kolom })
  }
  await c.end()

  console.log(`  entri diperiksa vs schema        : ${entri.length}`)
  if (entri.length !== jenisRegistri.length) {
    console.error(`\n❌ Hanya ${entri.length} dari ${jenisRegistri.length} entri terbaca polanya.`)
    console.error('   Entri yang tak terbaca tak terperiksa — dan justru yang')
    console.error('   paling mungkin salah bentuk.\n')
    gagal++
  }
  if (salah.length > 0) {
    console.error('\n❌ Kolom pengaju TIDAK ADA di schema:\n')
    for (const s of salah) console.error(`     ${s.jenis.padEnd(18)} ${s.tabel}.${s.kolom}`)
    console.error('\n   `periksaGerbangSod` akan gagal membaca pengaju, dan karena')
    console.error('   fail-closed, seluruh approval jenis ini ditolak.\n')
    gagal++
  }
}

if (gagal > 0) process.exit(1)
console.log('\n✅ Semua jalur persetujuan bergerbang SoD; registri lengkap & cocok schema.\n')
