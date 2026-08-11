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
  'Critical path (CPM)': { berkas: ['cpm'], tabel: ['milestone_dependencies'] },
  'Resource histogram / leveling': { tabel: ['resource_histogram'] },
  'RFQ ke vendor': { tabel: ['rfq', 'rfq_penawaran'] },
  // Tabulasi TIDAK punya tabel sendiri: ia DITURUNKAN dari `rfq_penawaran`
  // tiap kali diminta. Menyimpannya sebagai tabel membuat angka "termurah"
  // bisa basi diam-diam saat satu penawaran disunting.
  'Perbandingan penawaran (bid tabulation)': { tabel: ['rfq_penawaran'], rute: ['/rfq'] },
  'Surat masuk/keluar (correspondence)': { berkas: ['surat-korespondensi'], tabel: ['project_letters'] },
  'Claims management': { berkas: ['klaim-kontraktual'], tabel: ['contract_claims'] },
  'Jaminan penawaran (bid bond)': { tabel: ['contract_bonds'] },
  'Kalender kerja & hari libur': { tabel: ['hari_libur'] },
  'Prakualifikasi vendor': { tabel: ['prakualifikasi_vendor'] },
  // Diperbaiki 2026-08-07: nama tabel yang SEBENARNYA dibangun, bukan tebakan.
  // Entri lama menebak `insurance_register`/`contingency`/`delay_analysis` —
  // tak satu pun ada, jadi penjaga ini hijau abadi untuk kelimanya.
  // CVR belum dibangun — TERTUNDA dengan alasan terukur: `project_expenses`
  // nol baris, jadi "biaya terpakai" tak ada untuk dibandingkan dengan "nilai
  // terpasang". Entri tetap ada supaya ia ikut terhitung sebagai "benar belum
  // ada", bukan hilang dari pemeriksaan.
  // CVR TIDAK punya tabel sendiri — alasan yang sama dengan tabulasi RFQ di
  // atas: ia DITURUNKAN dari `work_scopes` × `weekly_wage_reports` tiap kali
  // diminta. Menyimpannya membuat angka untung-rugi bisa basi diam-diam saat
  // satu laporan upah disunting — dan yang paling berkepentingan
  // menyuntingnya adalah orang yang angkanya sedang buruk.
  //
  // Entri lama menuntut tabel `cvr` yang tak pernah ada, dan penjaga ini
  // melaporkannya sebagai "tabel hantu" begitu CVR dibangun (2026-08-08).
  // Yang salah entrinya, bukan kodenya.
  'Cost Value Reconciliation (CVR)': {
    berkas: ['cvr'], tabel: ['work_scopes', 'weekly_wage_reports'], rute: ['/cvr'],
  },
  'Register asuransi': { tabel: ['polis_asuransi'], rute: ['/asuransi'] },
  'Manajemen contingency': { tabel: ['pos_contingency'], rute: ['/contingency'] },
  'Analisa keterlambatan': { tabel: ['contract_eot'], rute: ['/analisa-keterlambatan'] },
  'Eskalasi harga': { rute: ['/riwayat-harga'] },
  'Tender & award subkontraktor': { tabel: ['tender_subkon'], rute: ['/tender-subkon'] },
  // Empat di bawah sebelumnya TAK PUNYA entri, jadi tak pernah diperiksa —
  // penjaga yang tak memetakan sesuatu akan hijau abadi untuknya.
  // ⚠️ `waste_tracking` TIDAK PERNAH ADA — diukur ke basis 2026-08-08.
  //
  // Entri ini saya tulis sendiri dengan menebak nama tabel dari nama barisnya,
  // dan tebakan itu membuat penjaga mencari benda yang tak pernah dibangun:
  // modulnya nyata (`/gudang/rekonsiliasi`, 552 baris, `lib/rekonsiliasi-
  // material.ts` 34 test), hanya namanya berbeda. Hasilnya taksonomi bertahan
  // 🔴 sementara penjaga setuju — dua sumber sepakat pada hal yang salah.
  //
  // Pelajaran yang lebih umum: entri PETA harus dibuat dari ARTEFAK YANG
  // TERBUKTI ADA, bukan dari nama yang terdengar masuk akal. Nama yang
  // ditebak menghasilkan penjaga yang hijau abadi — bentuk kebutaan yang
  // paling sulit dilihat, karena angkanya terlihat sehat.
  'Tracking waste / susut': { rute: ['/gudang/rekonsiliasi'] },
  'Material milik klien (free issue)': { tabel: ['penerimaan_material_klien'], rute: ['/material-klien'] },
  'Evaluasi kinerja subkontraktor': { tabel: ['evaluasi_subkon'] },
  'Transfer stok antar proyek': { tabel: ['stock_transfers'], rute: ['/transfer-stok'] },
  'Rekonsiliasi material (teoritis vs aktual)': { rute: ['/rekonsiliasi-material'] },
  // Ditambahkan 2026-08-08 — dan pelajarannya SAMA PERSIS dengan komentar
  // enam baris di atas, yang saya tulis sendiri saat menambah empat entri
  // sebelumnya. "Rekonsiliasi bank" bertahan 🔴 di taksonomi sementara
  // migrasi 234, `lib/rekonsiliasi-bank.ts` (22 test), 6 endpoint, dan
  // halaman `/kas/rekonsiliasi` sudah hidup — dan penjaga ini exit 0 setiap
  // kali, karena barisnya memang tak pernah ada di peta.
  //
  // Menambah entri satu per satu saat ketahuan bukan perbaikan yang tuntas;
  // yang tuntas adalah penjaga yang tahu baris mana yang BELUM dipetakan.
  // Itu ada di bawah, sesudah PETA.
  'Rekonsiliasi bank': { tabel: ['rekening_koran'], rute: ['/kas/rekonsiliasi'] },

  // ── CECEP: lima baris yang mengaku "DB-only" padahal terpakai ──────────
  //
  // Ditambahkan 2026-08-08 sesudah koreksi status basi ke-12 s.d. ke-15.
  // Taksonomi menyebut kelimanya "0 route/UI", "DB-only", atau "0 endpoint".
  // Diukur ke kode DAN ke basis, empat dari lima SALAH:
  //
  //     cost_codes          3 query API · 12 rujukan UI ·    44 baris
  //     resources           7 query API · 90 rujukan UI · 2.830 baris
  //     price_book_entries 10 query API ·  dipakai /estimasi · 3.025 baris
  //     scenarios           5 query API · 16 rujukan UI ·   208 baris
  //     wbs_nodes           0 · 0 · 0   ← satu-satunya yang benar DB-only
  //
  // Klaim "belum dibangun" yang salah lebih berbahaya daripada yang benar:
  // ia membuat orang membangun ulang sesuatu yang sudah ada, atau
  // menganggap produknya lebih jauh dari selesai daripada kenyataannya.
  'Struktur Cost Code / CBS': { tabel: ['cost_codes'], rute: ['/varians'] },
  'Master Resource (tenaga/bahan/alat)': { tabel: ['resources'], rute: ['/cecep/resources'] },
  'Price Book / rate library': { tabel: ['price_book_entries'], rute: ['/cecep/price-book'] },
  'Skenario penawaran (what-if)': { tabel: ['scenarios'], rute: ['/estimate-versions'] },
  // `wbs_nodes` dipetakan lewat RUTE, bukan tabel.
  //
  // Memetakannya ke `tabel: ['wbs_nodes']` membuat penjaga langsung merah:
  // tabelnya MEMANG ada di migrasi 109, jadi "bukti" ditemukan dan barisnya
  // dilaporkan sebagai status basi. Padahal diukur, ia nol query API, nol
  // rujukan UI, dan NOL BARIS di basis — tabel yang ada tapi tak pernah
  // dipakai.
  //
  // Pelajarannya: `CREATE TABLE` adalah bukti yang terlalu lemah untuk baris
  // yang mengaku "belum dibangun". Yang membedakan "dibangun" dari "ada
  // tabelnya" adalah jalan masuknya. Karena itu bukti yang dituntut di sini
  // rutenya, dan rute itu memang belum ada.
  'WBS template': { rute: ['/wbs'] },
  // Ditambahkan bersama koreksi basi ke-16: taksonomi menyebut cashflow
  // forecast "tanpa UI", padahal `/estimasi` memanggil endpointnya (termasuk
  // varian `?periods=`). Dipetakan lewat RUTE, karena yang membedakan
  // "dibangun" dari "ada pustakanya" memang jalan masuknya.
  'Cashflow forecast': { berkas: ['cashflow-forecast'], rute: ['/cashflow-forecast'] },
  'Perusahaan / badan hukum (multi-entity)': { tabel: ['companies'], rute: ['/companies'] },
  'Revisi & transfer anggaran': { tabel: ['rap_change_log'], rute: ['/rap'] },
  'Method statement': { tabel: ['method_statement'] },
  'Evaluasi kinerja vendor': { tabel: ['evaluasi_vendor'] },
  'Kontrak payung / blanket order': { tabel: ['kontrak_payung'] },
  'Expediting & logistik': { tabel: ['expediting'] },
  'Dokumen prakualifikasi': { tabel: ['dokumen_prakualifikasi'] },
  'Master Subkontraktor': { tabel: ['subcontractors'] },
  'Analisa markup, margin, contingency': { rute: ['/estimate-versions'] },
  'Profitabilitas per proyek / per cost code': { rute: ['/cost-analytics'] },
  'Earned Value Management': { rute: ['/kurva-s'] },
  'Retensi subkontrak': { berkas: ['mandor'], web: ['/mandor/retensi'] },
  'Instruksi lapangan': { berkas: ['instruksi-lapangan'], web: ['/field-instructions'] },
  'Non-Conformance Report (NCR)': { berkas: ['ncr'], web: ['/ncr'] },
  'Absensi lapangan': { berkas: ['absensi'], web: ['/absensi'] },

  // ── G1d (2026-08-11) — didaftarkan di commit yang SAMA dengan kodenya ──
  //
  // R-011 menyatakannya sebagai kewajiban: begitu sebuah item mulai dibangun,
  // entrinya wajib masuk PETA di commit yang sama. Kalau tidak, ia menempuh
  // jalan yang sudah dilalui tujuh sub-menu lain — kode hidup berbulan-bulan
  // sementara taksonomi menandainya 🔴 dan penjaga ini setuju, karena barisnya
  // memang tak pernah dipetakan.
  //
  // Bukti dipilih dari artefak yang TERBUKTI ADA (migrasi 279 + `mutu.ts` +
  // halaman web), bukan dari nama yang terdengar masuk akal — pelajaran yang
  // tertulis dua kali di komentar-komentar di atas dan sudah menghasilkan dua
  // penjaga hijau abadi.
  'Checklist inspeksi mutu': { berkas: ['mutu'], tabel: ['inspeksi_checklist'] },
  'Hasil uji material': {
    berkas: ['mutu-checklist'], tabel: ['uji_material'], web: ['/uji-material'],
  },

  // ── G1e (2026-08-11) — juga di commit yang SAMA dengan kodenya ────────
  'Rencana Mutu Proyek': {
    berkas: ['rencana-mutu'], tabel: ['rencana_mutu'], web: ['/mutu/rencana'],
  },
  // ITP dipetakan lewat TABEL + rute, bukan halaman sendiri: ia tinggal di
  // halaman Rencana Mutu (ITP adalah ISI dari RMP, bukan dokumen lain), dan
  // menuntut `web: ['/itp']` akan mencari halaman yang memang sengaja tak
  // dibuat — bentuk penjaga hijau abadi yang komentar-komentar di atas
  // peringatkan dua kali.
  'Inspection & Test Plan': {
    tabel: ['itp_titik'], rute: ['/rencana-mutu'],
  },

  // ── G1f (2026-08-11) — item TERAKHIR kelompok G1 ─────────────────────
  'Audit mutu': {
    berkas: ['audit-mutu'], tabel: ['audit_mutu', 'temuan_audit'], web: ['/mutu/audit'],
  },

  // ── G2a (2026-08-11) — tarif payroll sebagai DATA ────────────────────
  //
  // Dipetakan ke TABEL + halaman, bukan ke jumlah barisnya: tabelnya sengaja
  // KOSONG sampai founder mengisi (R-011). Menuntut baris di sini akan
  // membuat penjaga merah untuk keadaan yang justru benar.
  'Potongan statutori (BPJS)': {
    berkas: ['tarif-payroll'], tabel: ['tarif_payroll_periode'], web: ['/pengaturan/tarif-payroll'],
  },
  'PPh 21': {
    berkas: ['tarif-payroll'], tabel: ['tarif_payroll_baris'], web: ['/pengaturan/tarif-payroll'],
  },

  // ── G2b (2026-08-11) — timesheet staf kantor ─────────────────────────
  'Absensi & timesheet': {
    berkas: ['timesheet-staf'], tabel: ['timesheet_staf'], web: ['/sdm/timesheet'],
  },

  // ── G2c (2026-08-11) — payroll staf ──────────────────────────────────
  'Payroll staf': {
    berkas: ['payroll-staf'], tabel: ['slip_gaji', 'payroll_periode'], web: ['/sdm/payroll'],
  },

  // ── G2d (2026-08-11) — cuti & izin karyawan ──────────────────────────
  'Cuti & izin': {
    berkas: ['cuti-karyawan'], tabel: ['cuti_ambil', 'cuti_hak'], web: ['/sdm/cuti'],
  },

  // ── G2e (2026-08-11) — tiga item TERAKHIR kelompok G2 ────────────────
  'Sertifikasi & kompetensi': {
    berkas: ['kompetensi-sdm'], tabel: ['sertifikat_pegawai'], web: ['/sdm/kompetensi'],
  },
  // Kinerja & rekrutmen dipetakan lewat TABEL saja: keduanya tab di halaman
  // yang sama (`/sdm/kompetensi`), dan menuntut `web` masing-masing akan
  // mencari halaman yang memang sengaja tak dibuat — bentuk penjaga hijau
  // abadi yang komentar-komentar di atas peringatkan.
  'Penilaian kinerja': {
    berkas: ['kompetensi-sdm'], tabel: ['penilaian_kinerja'],
  },
  'Rekrutmen & onboarding': {
    berkas: ['kompetensi-sdm'], tabel: ['lamaran_kerja'],
  },

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

const adaTabel = (t) =>
  new RegExp(`create table (if not exists )?(public\\.)?${t}\\b`).test(sqlAll)

function bukti(spec) {
  const b = []
  for (const f of spec.berkas ?? []) if (berkasApi.has(f)) b.push(`berkas:${f}.ts`)
  for (const t of spec.tabel ?? []) if (adaTabel(t)) b.push(`tabel:${t}`)
  for (const r of spec.rute ?? []) if (sumberApi.includes(r)) b.push(`rute:${r}`)
  for (const w of spec.web ?? []) if (teksWeb.includes(w)) b.push(`web:${w}`)
  return b
}

/**
 * PEMERIKSAAN DIRI — nama tabel di PETA yang tak pernah dibuat migrasi mana pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI MEMERIKSA DIRINYA SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-08: **14 dari 29 nama tabel di PETA tidak ada di basis**, dan
 * sembilan di antaranya karena namanya DITEBAK dalam bahasa Inggris sementara
 * tabel nyatanya berbahasa Indonesia:
 *
 *     claims          → contract_claims        method_statements → method_statement
 *     rfqs            → rfq                    holidays          → hari_libur
 *     correspondence  → surat_korespondensi    blanket_orders    → kontrak_payung
 *     vendor_performance → evaluasi_vendor     subcontractor_evaluations → evaluasi_subkon
 *     vendor_prequalification → prakualifikasi_vendor
 *
 * Akibatnya modul yang SUDAH HIDUP dicari lewat nama yang tak pernah ada,
 * penjaga setuju dengan taksonomi yang bilang 🔴, dan dua sumber sepakat pada
 * hal yang salah. Kebutaan yang paling sulit dilihat: angkanya terlihat sehat.
 *
 * Sisanya (`critical_path`, `cvr`, `resource_histogram`, `subcontractors`,
 * `work_calendar`) memang belum dibangun — itu SAH, dan entrinya sengaja
 * dipertahankan supaya ikut terhitung "benar belum ada" alih-alih hilang dari
 * pemeriksaan. Karena itu daftar ini bersifat LAPORAN, bukan kegagalan: yang
 * membedakan "belum dibangun" dari "salah nama" adalah mata manusia.
 *
 * Yang dituntut: siapa pun yang menambah entri PETA melihat namanya di sini
 * dan memastikan itu memang benda yang belum ada — bukan tebakan.
 */
function tabelHantu() {
  const semua = new Set()
  for (const spec of Object.values(PETA)) for (const t of spec.tabel ?? []) semua.add(t)
  return [...semua].filter((t) => !adaTabel(t)).sort()
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

const hantu = tabelHantu()
if (hantu.length) {
  console.log('\n— Nama tabel di PETA yang TAK ADA di migrasi mana pun:')
  console.log('   (sah bila modulnya memang belum dibangun; CACAT bila modulnya')
  console.log('    hidup dengan nama lain — lihat `tabelHantu`)')
  for (const t of hantu) console.log(`   ${t}`)
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
