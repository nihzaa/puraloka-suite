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

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
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
 * rute   : potongan path endpoint API
 * web    : potongan path endpoint yang dicari di sumber apps/web/** (bukti UI-nya ADA, bukan cuma API)
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
  // Tabulasi TIDAK punya tabel sendiri: ia DITURUNKAN dari `rfq_penawaran`
  // tiap kali diminta. Menyimpannya sebagai tabel membuat angka "termurah"
  // bisa basi diam-diam saat satu penawaran disunting.
  'Perbandingan penawaran (bid tabulation)': { tabel: ['rfq_penawaran'], rute: ['/rfq'] },
  'Surat masuk/keluar (correspondence)': { berkas: ['surat'], tabel: ['correspondence'], web: ['/letters'] },
  'Claims management': { berkas: ['contracts'], tabel: ['claims'], web: ['/claims'] },
  'Jaminan penawaran (bid bond)': { tabel: ['contract_bonds'] },
  'Kalender kerja & hari libur': { tabel: ['work_calendar', 'holidays'] },
  'Prakualifikasi vendor': { tabel: ['vendor_prequalification'] },
  // Diperbaiki 2026-08-07: nama tabel yang SEBENARNYA dibangun, bukan tebakan.
  // Entri lama menebak `insurance_register`/`contingency`/`delay_analysis` —
  // tak satu pun ada, jadi penjaga ini hijau abadi untuk kelimanya.
  // CVR belum dibangun — TERTUNDA dengan alasan terukur: `project_expenses`
  // nol baris, jadi "biaya terpakai" tak ada untuk dibandingkan dengan "nilai
  // terpasang". Entri tetap ada supaya ia ikut terhitung sebagai "benar belum
  // ada", bukan hilang dari pemeriksaan.
  'Cost Value Reconciliation (CVR)': { tabel: ['cvr'], rute: ['/cvr'] },
  'Register asuransi': { tabel: ['polis_asuransi'], rute: ['/asuransi'] },
  'Manajemen contingency': { tabel: ['pos_contingency'], rute: ['/contingency'] },
  'Analisa keterlambatan': { tabel: ['contract_eot'], rute: ['/analisa-keterlambatan'] },
  'Eskalasi harga': { rute: ['/riwayat-harga'] },
  'Tender & award subkontraktor': { tabel: ['tender_subkon'], rute: ['/tender-subkon'] },
  // Empat di bawah sebelumnya TAK PUNYA entri, jadi tak pernah diperiksa —
  // penjaga yang tak memetakan sesuatu akan hijau abadi untuknya.
  'Tracking waste / susut': { tabel: ['waste_tracking'] },
  'Material milik klien (free issue)': { tabel: ['penerimaan_material_klien'], rute: ['/material-klien'] },
  'Evaluasi kinerja subkontraktor': { tabel: ['subcontractor_evaluations'] },
  'Transfer stok antar proyek': { tabel: ['stock_transfers'], rute: ['/transfer-stok'] },
  'Rekonsiliasi material (teoritis vs aktual)': { rute: ['/rekonsiliasi-material'] },
  'Perusahaan / badan hukum (multi-entity)': { tabel: ['companies'], rute: ['/companies'] },
  'Revisi & transfer anggaran': { tabel: ['rap_change_log'], rute: ['/rap'] },
  'Method statement': { tabel: ['method_statements'] },
  'Evaluasi kinerja vendor': { tabel: ['vendor_performance'] },
  'Kontrak payung / blanket order': { tabel: ['blanket_orders'] },
  'Expediting & logistik': { tabel: ['expediting'] },
  'Dokumen prakualifikasi': { tabel: ['vendor_prequalification'] },
  'Master Subkontraktor': { tabel: ['subcontractors'] },
  'Analisa markup, margin, contingency': { rute: ['/estimate-versions'] },
  'Profitabilitas per proyek / per cost code': { rute: ['/cost-analytics'] },
  'Earned Value Management': { rute: ['/kurva-s'] },
  'Retensi subkontrak': { berkas: ['mandor'], web: ['/mandor/retensi'] },
  'Instruksi lapangan': { berkas: ['instruksi-lapangan'], web: ['/field-instructions'] },
  'Non-Conformance Report (NCR)': { berkas: ['ncr'], web: ['/ncr'] },
  'Absensi lapangan': { berkas: ['absensi'], web: ['/absensi'] },

  // Ditambahkan 2026-08-07 sesudah kekeliruan KEDELAPAN (F5-1 §3c).
  //
  // 'Laporan keuangan' tertulis 🔴 selama berminggu-minggu — dan taksonomi
  // bahkan MENYARANKAN memakai aplikasi akuntansi eksternal — padahal
  // pustaka, 13 test, endpoint, dan komponennya sudah hidup. Ia lolos karena
  // tak punya entri di sini: penjaga melaporkan "status BASI: 0" dengan
  // percaya diri sambil tak memeriksanya sama sekali.
  //
  // Daftar-putih yang tak lengkap adalah penjaga yang berbohong. Setiap item
  // INTI wajib punya entri di sini — itu yang membuatnya ikut terperiksa.
  'Laporan keuangan': { berkas: ['laporan-keuangan'], rute: ['/gl/laporan'], web: ['/akuntansi'] },
  'Interim Payment Certificate (IPC)': { berkas: ['ipc'], web: ['/keuangan/ipc'] },
  'Geotag foto': { web: ['/lapangan'] },
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

const D_WEB_SRC = [join(AKAR, 'apps/web/app'), join(AKAR, 'apps/web/components')]

/** Baca rekursif semua .tsx/.ts di apps/web, LEWATI .next (artefak build). */
function sumberWeb(dirs) {
  const out = []
  const walk = (d) => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.next' || e.name === 'node_modules') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name)) out.push(readFileSync(p, 'utf8'))
    }
  }
  dirs.forEach(walk)
  return out.join('\n')
}
const teksWeb = sumberWeb(D_WEB_SRC)

function bukti(spec) {
  const b = []
  for (const f of spec.berkas ?? []) if (berkasApi.has(f)) b.push(`berkas:${f}.ts`)
  for (const t of spec.tabel ?? []) {
    if (new RegExp(`create table (if not exists )?(public\\.)?${t}\\b`).test(sqlAll)) b.push(`tabel:${t}`)
  }
  for (const r of spec.rute ?? []) if (sumberApi.includes(r)) b.push(`rute:${r}`)
  for (const w of spec.web ?? []) if (teksWeb.includes(w)) b.push(`web:${w}`)
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

// ── Ratchet: `basi` dan `takDipetakan` boleh turun, TIDAK boleh naik.
// Lihat catatan di scripts/status-lantai.json.
const LANTAI = join(AKAR, 'apps/api/scripts/status-lantai.json')
const naikkan = process.argv.includes('--naikkan')
const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
const kini = { basi: basi.length, takDipetakan: takDipetakan.length }

if (naikkan) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, ...kini }, null, 2) + '\n')
  console.log(`Lantai diperbarui: basi=${kini.basi} takDipetakan=${kini.takDipetakan}`)
  process.exit(0)
}

let merah = false
for (const k of ['basi', 'takDipetakan']) {
  if (kini[k] > lantai[k]) {
    console.error(`MERAH: ${k} naik ${lantai[k]} -> ${kini[k]}`)
    merah = true
  } else if (kini[k] < lantai[k]) {
    console.log(`Turun: ${k} ${lantai[k]} -> ${kini[k]}. Kunci: --naikkan`)
  }
}
process.exit(merah ? 1 : 0)
