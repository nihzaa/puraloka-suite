#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Taksonomi menu vs KODE — mana yang statusnya basi?
//
// `ERP-KONTRAKTOR-TAKSONOMI-MENU.md` adalah penyebut yang dipakai ROADMAP
// untuk mengukur kemajuan ("32% selesai"). Kalau statusnya basi, seluruh
// angka itu ikut salah — dan itu yang ditemukan 2026-08-02: `WIP/PSAK`
// ditandai 🔴 padahal `lib/wip-psak.ts` + `routes/v1/wip.ts` + endpoint
// `/api/v1/reports/wip` hidup dan dipanggil halaman laporan.
//
// ── Kenapa versi pertama skrip ini DIBUANG
//
// Ia mencocokkan kata kunci dari nama menu ke seluruh korpus kode, dan
// melaporkan skor 1.00 untuk "Critical path (CPM)" yang berkas kodenya NOL —
// karena kata "path" dan "analisa" muncul di mana-mana. Angka yang terlihat
// meyakinkan tapi menyesatkan; itu lebih buruk daripada tak ada angka.
//
// Versi ini memakai bukti yang TIDAK bisa palsu:
//   1. berkas `routes/v1/<x>.ts` atau `lib/<x>.ts` yang namanya cocok
//   2. endpoint `/api/v1/...` yang terdaftar
//   3. tabel yang benar-benar dibuat migrasi (`CREATE TABLE <x>`)
//
// Petanya DITULIS TANGAN per-menu, bukan diturunkan dari nama. Menu yang
// belum punya entri dilaporkan terpisah sebagai "belum dipetakan" — bukan
// diam-diam dihitung sebagai belum ada.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const R_API = join(AKAR, 'apps/api/src/routes/v1')
const L_API = join(AKAR, 'apps/api/src/lib')
const D_WEB = join(AKAR, 'apps/web/app')
const D_SQL = join(AKAR, 'db/migrations')

/**
 * Peta menu → bukti yang dicari. Ditulis tangan; tiap entri adalah klaim yang
 * bisa diperiksa, bukan tebakan dari nama.
 *
 * berkas : nama berkas di routes/v1 atau lib (tanpa .ts)
 * tabel  : nama tabel yang harus ada `CREATE TABLE`-nya di migrasi
 * rute   : potongan path endpoint
 */
const PETA = {
  'WIP / persentase penyelesaian (PSAK)': { berkas: ['wip', 'wip-psak'], rute: ['/reports/wip'] },
  'Master schedule + baseline': { berkas: ['rab-schedule'], tabel: ['rab_schedule'] },
  'Look-ahead schedule': { berkas: ['rab-schedule'], tabel: ['rab_schedule'] },
  'Cost-to-complete forecast': { rute: ['/cashflow-forecast', '/cost-analytics'] },
  'Commitment tracking (PO + borongan)': { tabel: ['purchase_orders'], rute: ['/procurement/purchase-orders'] },
  'Analisa varians (budget vs commit vs aktual)': { rute: ['/cost-analytics'] },
  'Critical path (CPM)': { berkas: ['cpm'], tabel: ['critical_path'] },
  'Resource histogram / leveling': { tabel: ['resource_histogram'] },
  'RFQ ke vendor': { tabel: ['rfq', 'rfqs'] },
  'Perbandingan penawaran (bid tabulation)': { tabel: ['bid_tabulation'] },
  'Surat masuk/keluar (correspondence)': { tabel: ['correspondence'] },
  'Claims management': { tabel: ['claims'] },
  'Jaminan penawaran (bid bond)': { tabel: ['contract_bonds'] },
  'Eskalasi harga': { tabel: ['price_escalation'] },
  'Kalender kerja & hari libur': { tabel: ['work_calendar', 'holidays'] },
  'Prakualifikasi vendor': { tabel: ['vendor_prequalification'] },
  'Register asuransi': { tabel: ['insurance_register'] },
  'Cost Value Reconciliation (CVR)': { tabel: ['cvr'], rute: ['/cvr'] },
  'Transfer stok antar proyek': { rute: ['/stocks/transfer'] },
  'Rekonsiliasi material (teoritis vs aktual)': { rute: ['/stocks/opname'] },
  'Perusahaan / badan hukum (multi-entity)': { tabel: ['companies'], rute: ['/companies'] },
  'Revisi & transfer anggaran': { tabel: ['rap_change_log'], rute: ['/rap'] },
  'Manajemen contingency': { tabel: ['contingency'] },
  'Analisa keterlambatan': { tabel: ['delay_analysis'] },
  'Method statement': { tabel: ['method_statements'] },
  'Evaluasi kinerja vendor': { tabel: ['vendor_performance'] },
  'Kontrak payung / blanket order': { tabel: ['blanket_orders'] },
  'Expediting & logistik': { tabel: ['expediting'] },
  'Dokumen prakualifikasi': { tabel: ['vendor_prequalification'] },
  'Master Subkontraktor': { tabel: ['subcontractors'] },
  'Analisa markup, margin, contingency': { rute: ['/estimate-versions'] },
  'Profitabilitas per proyek / per cost code': { rute: ['/cost-analytics'] },
  'Earned Value Management': { rute: ['/kurva-s'] },
}

const berkasApi = new Set([
  ...(existsSync(R_API) ? readdirSync(R_API) : []),
  ...(existsSync(L_API) ? readdirSync(L_API) : []),
].filter(n => n.endsWith('.ts')).map(n => n.replace(/\.ts$/, '')))

const sumberApi = (existsSync(R_API) ? readdirSync(R_API) : [])
  .filter(n => n.endsWith('.ts'))
  .map(n => readFileSync(join(R_API, n), 'utf8')).join('\n')

const sqlAll = (existsSync(D_SQL) ? readdirSync(D_SQL) : [])
  .filter(n => n.endsWith('.sql'))
  .map(n => readFileSync(join(D_SQL, n), 'utf8')).join('\n').toLowerCase()

function bukti(spec) {
  const b = []
  for (const f of spec.berkas ?? []) if (berkasApi.has(f)) b.push(`berkas:${f}.ts`)
  for (const t of spec.tabel ?? []) {
    if (new RegExp(`create table (if not exists )?(public\\.)?${t}\\b`).test(sqlAll)) b.push(`tabel:${t}`)
  }
  for (const r of spec.rute ?? []) if (sumberApi.includes(r)) b.push(`rute:${r}`)
  return b
}

const baris = readFileSync(join(AKAR, 'docs/ERP-KONTRAKTOR-TAKSONOMI-MENU.md'), 'utf8').split('\n')
const basi = [], benarKosong = [], takDipetakan = []

for (const l of baris) {
  if (!l.startsWith('|')) continue
  const status = (l.match(/🔴|🟡|✅|🔵|⛔/) || [])[0]
  if (status !== '🔴') continue
  const kol = l.split('|').map(c => c.trim())
  const nama = kol.slice(1).find(c => c && !/^(🔴|🟡|✅|🔵|⛔)$/.test(c) && c.length > 3)
  if (!nama) continue
  const bersih = nama.replace(/\*\*|`/g, '')

  const spec = PETA[bersih]
  if (!spec) { takDipetakan.push(bersih); continue }
  const b = bukti(spec)
  ;(b.length > 0 ? basi : benarKosong).push({ nama: bersih, b })
}

console.log(`Ditandai 🔴 di taksonomi : ${basi.length + benarKosong.length + takDipetakan.length}`)
console.log(`  status BASI (ada bukti): ${basi.length}`)
console.log(`  benar belum ada        : ${benarKosong.length}`)
console.log(`  belum dipetakan skrip  : ${takDipetakan.length}\n`)

if (basi.length) {
  console.log('— 🔴 tapi buktinya ADA (status perlu diperbarui):')
  for (const h of basi) console.log(`   ${h.nama}\n      ${h.b.join(' · ')}`)
}
if (takDipetakan.length) {
  console.log('\n— Belum punya entri di PETA (tambahkan supaya ikut terperiksa):')
  for (const n of takDipetakan.slice(0, 40)) console.log(`   ${n}`)
}
