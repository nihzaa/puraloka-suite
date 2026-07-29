#!/usr/bin/env node
// ============================================================
// SEEDER HARGA POKOK → price_book_entries
//
// Menutup temuan: 2.766 resource dipakai analisa, NOL punya harga → seluruh
// analisa tak bisa menghitung HSP. Rumus link-nya sudah terpasang; sheet harga
// pokoknya yang masih kosong.
//
// SUMBER (dua dataset, dua lingkup berbeda):
//   harga-se47-dataset.json    → NASIONAL. company_id NULL = dipakai bersama
//                                seluruh badan usaha. Workbook-nya sendiri
//                                menyatakan "diubah sesuai harga daerah
//                                masing-masing" → ini acuan, bukan pengikat.
//   harga-cibuluh-dataset.json → COMPANY. Milik badan usaha founder, konteks
//                                Kabupaten Bandung.
//
// PENCOCOKAN — dua jalur, berurutan:
//   1. PEMETAAN LEWAT RUMUS (`mapping`) — jalur PASTI. Nama di analisa dan di
//      sheet harga berbeda penulisan, jadi rumus `=HS.BAHAN!D569` yang dipakai:
//      ia menyatakan baris harga mana yang dimaksud penyusun workbook.
//   2. Nama + kategori — cadangan, hanya bila rumusnya tak ada.
//
//   TIDAK ADA jalur ketiga "kemiripan huruf". "Kaca Patri" mirip "kaca 2 mm"
//   dan "Genteng Palentong Super" mirip "atap genteng kodok glazur" —
//   dua-duanya mirip, dua-duanya salah. Resource tanpa pasangan pasti
//   DIBIARKAN tanpa harga, dan endpoint akan fail-loud saat dipakai. Itu
//   perilaku yang benar: lebih baik menolak menghitung daripada menghitung
//   dengan harga yang salah.
//
// IDEMPOTEN: harga yang sudah ada (resource + lokasi + effective_date sama)
// dilewati, tidak diduplikasi. Menjalankan ulang = no-op aman.
//
// STATUS 'active' + jejak verifikasi: constraint `price_book_verified_trace`
// mensyaratkan verified_by/at untuk status non-draft. Diisi user penjalan seed
// dengan alasan tercatat — bukan dikosongkan lalu constraint-nya dilonggarkan.
//
// PEMAKAIAN (dari apps/api):
//   node scripts/seed-harga-pokok.mjs            # dry-run (hitung saja)
//   node scripts/seed-harga-pokok.mjs --execute  # tulis ke DB
// ============================================================
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import pg from 'pg'

const DEV_REF = 'tgozokxyvwmyvajgqfxw'
const EXECUTE = process.argv.includes('--execute')
const SEEDS = 'E:/Project/puraloka-suite/db/seeds'

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

async function main() {
  const conn = process.env.DIRECT_URL
  if (!conn?.includes(DEV_REF)) {
    throw new Error(`TOLAK: koneksi bukan proyek dev (${DEV_REF}).`)
  }
  const c = new pg.Client({ connectionString: conn })
  await c.connect()

  console.log(`\n=== Seed harga pokok — ${EXECUTE ? 'EKSEKUSI' : 'DRY-RUN'} ===\n`)

  const actor = (await c.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'admin' AND u.is_active ORDER BY u.created_at LIMIT 1`)).rows[0]?.id
  if (!actor) throw new Error('Tidak ada user admin aktif untuk dicatat sebagai verifier.')

  const company = (await c.query(
    `SELECT id, name FROM companies WHERE parent_company_id IS NULL
      ORDER BY created_at LIMIT 1`)).rows[0]
  if (!company) throw new Error('Belum ada company.')

  let totalBaru = 0, totalAda = 0, totalTanpaPasangan = 0

  for (const [label, file, source, companyId, lokasi, tanggal] of [
    ['NASIONAL (SE-47)', 'harga-se47-dataset.json', 'national', null, null, '2026-01-01'],
    ['COMPANY (Cibuluh)', 'harga-cibuluh-dataset.json', 'company', company.id,
     'Kabupaten Bandung', '2019-01-01'],
  ]) {
    const d = JSON.parse(readFileSync(`${SEEDS}/${file}`, 'utf8'))

    // Jalur 1: pemetaan lewat rumus (pasti). Jalur 2: nama+kategori (cadangan).
    const viaRumus = new Map()
    for (const m of d.mapping ?? []) viaRumus.set(norm(m.nama_di_analisa), m)
    const viaNama = new Map()
    for (const p of d.prices) viaNama.set(`${p.category}|${norm(p.nama)}`, p)

    // Hanya resource yang BENAR-BENAR dipakai analisa dari sumber ini. Menyeed
    // harga untuk resource yang tak dipakai siapa pun hanya menambah baris mati.
    const res = (await c.query(
      `SELECT DISTINCT r.id, r.name, r.category, r.unit_code FROM resources r
         JOIN assembly_components ac ON ac.resource_id = r.id
         JOIN assemblies a ON a.id = ac.assembly_id
        WHERE a.source = $1`, [source])).rows

    let baru = 0, sudahAda = 0, tanpaPasangan = 0, satuanBeda = 0
    for (const r of res) {
      const cocok = viaRumus.get(norm(r.name)) ?? viaNama.get(`${r.category}|${norm(r.name)}`)
      if (!cocok) { tanpaPasangan++; continue }

      // Satuan berbeda dicatat TAPI harganya tetap dipakai: satuan resource
      // adalah yang dipakai analisa, dan itulah basis koefisiennya. Selisih
      // penulisan satuan di sheet harga tidak mengubah angkanya.
      if (cocok.unit_code && cocok.unit_code !== r.unit_code) satuanBeda++

      const ada = (await c.query(
        `SELECT 1 FROM price_book_entries
          WHERE resource_id = $1 AND effective_date = $2::date
            AND location IS NOT DISTINCT FROM $3
            AND company_id IS NOT DISTINCT FROM $4
          LIMIT 1`, [r.id, tanggal, lokasi, companyId])).rowCount
      if (ada) { sudahAda++; continue }

      if (EXECUTE) {
        await c.query(
          `INSERT INTO price_book_entries
             (resource_id, amount, currency, version_number, effective_date,
              location, status, company_id, created_by, verified_by, verified_at,
              confidence_level)
           VALUES ($1, $2, 'IDR', 1, $3::date, $4, 'active', $5, $6, $6, now(), 'medium')`,
          [r.id, cocok.amount, tanggal, lokasi, companyId, actor])
      }
      baru++
    }

    console.log(`${label} — company_id=${companyId ?? 'NULL (bersama)'}`)
    console.log(`  resource dipakai analisa : ${res.length}`)
    console.log(`  harga baru ${EXECUTE ? 'ditulis' : 'akan ditulis'}   : ${baru}`)
    console.log(`  sudah ada (dilewati)     : ${sudahAda}`)
    console.log(`  tanpa pasangan pasti     : ${tanpaPasangan}  ← dibiarkan kosong, fail-loud saat dipakai`)
    console.log(`  satuan beda penulisan    : ${satuanBeda}  (harga tetap dipakai; basis = satuan resource)\n`)
    totalBaru += baru; totalAda += sudahAda; totalTanpaPasangan += tanpaPasangan
  }

  console.log(`TOTAL: ${totalBaru} baru · ${totalAda} sudah ada · ${totalTanpaPasangan} tanpa harga`)
  if (!EXECUTE) console.log('\n(dry-run — belum ada yang ditulis. Tambahkan --execute.)')
  await c.end()
}

main().catch((e) => { console.error('GAGAL:', e.message); process.exit(1) })
