#!/usr/bin/env node
// ============================================================
// SEED harga dari sheet ANALISA Cibuluh → price_book_entries (status DRAFT).
//
// Sumber: db/seeds/harga-analisa-cibuluh-dataset.json (ekstraksi verbatim,
// extractor ter-commit, sha256 sumber di meta).
//
// ── Kenapa DRAFT, bukan active
//
// Harga ini diekstrak dari kolom HARGA di dalam baris analisa — bukan dari
// sheet daftar harga resmi. Angkanya milik founder dan konteksnya jelas
// (Kabupaten Bandung), tapi ia belum melewati mata manusia SEJAK diekstrak.
//
// Price book punya jenjang draft → verified → active justru untuk ini. Menulis
// langsung `active` berarti angka hasil ekstraksi tak bisa dibedakan dari angka
// yang benar-benar diperiksa — dan enam bulan lagi tak ada yang ingat mana yang
// mana. Founder mengaktifkan setelah melihat; itu satu klik per kategori, jauh
// lebih murah daripada salah harga yang menyebar ke ratusan analisa.
//
// ── Yang TIDAK di-seed, dengan alasan
//
//   • nama BENTROK (>1 harga di workbook)  → butuh keputusan manusia
//   • satuan BEDA dengan resource di DB    → menyamakan berarti menebak
//   • resource yang SUDAH punya harga aktif → tak disentuh sama sekali
//
// Idempoten: entri yang sudah ada (resource+amount+effective_date sama) dilewati.
//
// Jalankan: node apps/api/scripts/seed-harga-analisa-cibuluh.mjs [--tulis]
// Tanpa --tulis: hanya melaporkan apa yang AKAN terjadi (dry-run).
// ============================================================
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATASET = resolve(__dirname, '..', '..', '..', 'db', 'seeds',
  'harga-analisa-cibuluh-dataset.json')
const TULIS = process.argv.includes('--tulis')

/** Tanggal berlaku = tanggal workbook, bukan hari ini. */
const EFFECTIVE = '2026-01-01'
const LOKASI = 'Kabupaten Bandung'

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const data = JSON.parse(readFileSync(DATASET, 'utf8'))
const byName = new Map(data.prices.map((p) => [norm(p.nama), p]))

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) { console.error('FATAL: DIRECT_URL/DATABASE_URL kosong'); process.exit(1) }

const c = new pg.Client({ connectionString: url })
await c.connect()

try {
  // Hanya resource yang BELUM punya harga aktif. Yang sudah berharga tak
  // disentuh — seed tak boleh menimpa keputusan yang sudah diambil.
  const { rows: target } = await c.query(`
    SELECT r.id, r.name, r.unit_code
      FROM resources r
     WHERE r.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM price_book_entries p
                        WHERE p.resource_id = r.id AND p.status = 'active')`)

  const akan = []
  const lewat = { tak_ada_di_file: 0, satuan_beda: [], sudah_ada_draft: 0 }

  for (const r of target) {
    const p = byName.get(norm(r.name))
    if (!p) { lewat.tak_ada_di_file++; continue }
    if (p.unit_code !== r.unit_code) {
      lewat.satuan_beda.push(`${r.name} (db=${r.unit_code} file=${p.unit_code})`)
      continue
    }
    akan.push({ resource_id: r.id, nama: r.name, unit: r.unit_code, amount: p.amount, sumber: p.sumber })
  }

  console.log(`resource tanpa harga aktif : ${target.length}`)
  console.log(`  akan di-seed (DRAFT)     : ${akan.length}`)
  console.log(`  tak ada di file          : ${lewat.tak_ada_di_file}`)
  console.log(`  satuan beda (dilewati)   : ${lewat.satuan_beda.length}`)
  lewat.satuan_beda.slice(0, 5).forEach((s) => console.log(`     ${s}`))
  console.log(`\ncatatan: ${data.conflicts.length} nama BENTROK di workbook tak pernah masuk kandidat`)

  if (!TULIS) {
    console.log('\n(dry-run — jalankan ulang dengan --tulis untuk benar-benar menyimpan)')
    process.exit(0)
  }

  let ditulis = 0, dilewati = 0
  for (const a of akan) {
    // Idempoten. Pembandingnya `resource_id + effective_date`, BUKAN nominalnya:
    // `amount` bertipe NUMERIC dan nilai berdesimal (mis. 129020.92) tak selalu
    // cocok persis saat dibandingkan dari JS — satu entri sempat tertulis dua
    // kali karena itu. Lagi pula satu resource memang hanya boleh punya satu
    // draft per tanggal berlaku; nominal yang berbeda pada tanggal yang sama
    // adalah kontradiksi, bukan entri baru.
    const { rows: ada } = await c.query(
      `SELECT 1 FROM price_book_entries
        WHERE resource_id=$1 AND effective_date=$2 AND status='draft'`,
      [a.resource_id, EFFECTIVE])
    if (ada.length) { dilewati++; continue }

    await c.query(
      `INSERT INTO price_book_entries
         (resource_id, amount, currency, version_number, effective_date, location,
          supplier, confidence_level, status)
       VALUES ($1,$2,'IDR',1,$3,$4,$5,'medium','draft')`,
      [a.resource_id, a.amount, EFFECTIVE, LOKASI,
       `workbook Cibuluh ${a.sumber}`])
    ditulis++
  }

  console.log(`\n✅ ditulis ${ditulis} entri DRAFT · ${dilewati} sudah ada (dilewati)`)
  console.log('   Aktifkan lewat tab Harga setelah diperiksa — draft TIDAK dipakai menghitung HSP.')
} finally {
  await c.end()
}
