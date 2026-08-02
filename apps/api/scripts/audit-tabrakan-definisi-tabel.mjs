#!/usr/bin/env node
// ============================================================================
// PENJAGA: tabrakan definisi tabel — dua migrasi mendefinisikan tabel yang sama.
// ============================================================================
//
// ── Kenapa penjaga ini ada (R-001 syarat 3)
//
// Migrasi 047 dan 167 sama-sama membuat `accounts` + `journal_entries` dengan
// bentuk tak kompatibel (047 single-tenant, 167 ber-`company_id`). Karena 167
// memakai `CREATE TABLE IF NOT EXISTS`, di lingkungan yang menjalankan 047 lebih
// dulu ia **no-op senyap**: tak ada galat, tak ada test merah, dan buku besar
// diam-diam kehilangan kemampuan memisahkan perusahaan.
//
// Founder mensyaratkan: jangan hanya perbaiki satu kasus — **sapu seluruh 171
// migrasi** untuk pasangan pendefinisi tabel yang sama, dan pasang penjaga agar
// pola ini tak bisa masuk lagi.
//
// ── Dua hal yang diperiksa
//
//   1. **Tabrakan**: tabel yang di-`CREATE TABLE` oleh ≥2 migrasi berbeda.
//      Tidak semua tabrakan berbahaya — pola sah yang dikenali:
//        · migrasi kedua men-`DROP` tabelnya lebih dulu (create-ulang sengaja)
//        · migrasi pertama sudah dipensiunkan/di-contract migrasi lain
//      Yang berbahaya: dua definisi hidup berdampingan, yang belakangan pakai
//      `IF NOT EXISTS` sehingga kalah diam-diam.
//
//   2. **`CREATE TABLE IF NOT EXISTS` tanpa penegas bentuk**: migrasi yang
//      membuat tabel dengan `IF NOT EXISTS` TAPI tidak memverifikasi bentuknya
//      setelah itu. `IF NOT EXISTS` sendiri tidak salah — ia yang membuat
//      migrasi idempoten. Yang salah adalah memakainya **tanpa memastikan tabel
//      yang sudah ada punya bentuk yang benar**. Penegas bentuk = blok yang
//      memeriksa kolom kunci lalu `RAISE EXCEPTION` bila tak sesuai.
//
// Keluar 0 = bersih. Keluar 1 = ada tabrakan baru / IF NOT EXISTS tanpa penegas.
// ============================================================================

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MIGRASI = join(REPO_ROOT, 'db', 'migrations')

// ── Pengecualian bernama ────────────────────────────────────────────────────
//
// Tabrakan yang SUDAH ADA dan sudah dinilai. Tiap entri wajib beralasan —
// daftar pengecualian tanpa alasan akan tumbuh tanpa batas dan berhenti bermakna.
const TABRAKAN_DIKETAHUI = {
  // Tabrakan yang AMAN karena migrasi belakangan memakai pola buang-bentuk-lama
  // (`DROP TABLE` bersyarat sebelum `CREATE`) — pola yang dirintis migrasi 149.
  'project_rab_materials': '043 (forward-draft) vs 142 — definisi identik, 142 memverifikasi keberadaannya',
  'po_delivery_log': '043 (forward-draft) vs 143 — 143 memakai to_regclass guard sebelum membuat',
  'assets': '045 (forward-draft) vs 149 — 149 MEMBUANG bentuk 045 (tanpa company_id) lebih dulu; lihat komentar 149 baris 50-73',
  'asset_movements': 'idem assets (149 DROP CASCADE bentuk 045)',
  'asset_depreciation_logs': 'idem assets (149 DROP CASCADE bentuk 045)',
  'workflow_definitions': '081 & 093 (restore) — workflow engine dipensiunkan ADR-006, tabelnya tak ada di dev',
  'workflow_instances': 'idem workflow_definitions (ADR-006)',
  'workflow_states': 'idem workflow_definitions (ADR-006)',
  'workflow_transitions': 'idem workflow_definitions (ADR-006)',
  'approval_delegations': 'idem workflow_definitions (ADR-006)',
}

// Pendefinisi terakhir yang boleh memakai `CREATE TABLE IF NOT EXISTS` tanpa
// penegas bentuk. Tiap entri wajib beralasan.
//
// Kriteria kelayakan: bentuk kedua definisi IDENTIK, sehingga "yang mana yang
// menang" tidak mengubah apa pun. Ini berbeda dari kasus 047↔167 (bentuk
// berbeda: satu tanpa `company_id`) dan 045↔149 (149 membuang bentuk lama).
const IF_NOT_EXISTS_DIIZINKAN = {
  '093_restore_workflow_foundation.sql': {
    alasan:
      'Restore verbatim dari 081 — bentuk kolom IDENTIK (diverifikasi kolom demi kolom ' +
      'untuk workflow_definitions & approval_delegations), jadi tak ada bentuk yang bisa ' +
      'kalah diam-diam. Lagipula workflow engine sudah dipensiunkan ADR-006 dan kelima ' +
      'tabelnya TIDAK ADA di dev.',
  },
}

if (!existsSync(MIGRASI)) {
  console.error(`FATAL: ${MIGRASI} tidak ada.`)
  process.exit(2)
}

const berkas = readdirSync(MIGRASI).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()

/** Buang komentar baris supaya `-- CREATE TABLE ...` tak ikut terhitung. */
const tanpaKomentar = (sql) =>
  sql.split('\n').filter((b) => !b.trim().startsWith('--')).join('\n')

const pendefinisi = new Map()   // tabel -> [{berkas, ifNotExists, adaPenegas}]
const dropOleh = new Map()      // tabel -> [berkas]

for (const f of berkas) {
  const sql = tanpaKomentar(readFileSync(join(MIGRASI, f), 'utf8'))

  for (const m of sql.matchAll(
    /CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    const ifNotExists = Boolean(m[1])
    const tabel = m[2].toLowerCase()

    // ── Penjaga bentuk untuk tabel INI (bukan sekadar "ada RAISE di berkas") ──
    //
    // Versi pertama pemeriksa ini menganggap sebuah migrasi "punya penegas"
    // hanya karena berkasnya memuat `RAISE EXCEPTION` di suatu tempat. Itu
    // terlalu longgar: hampir semua migrasi memuatnya untuk keperluan lain,
    // sehingga penjaga akan lolos-kan justru pola yang ia cari.
    //
    // Yang benar-benar melindungi adalah salah satu dari dua pola, dan keduanya
    // harus menyebut NAMA TABEL yang bersangkutan:
    //
    //   a. **Buang-bentuk-lama** (pola migrasi 149, 143): periksa apakah tabel
    //      sudah ada dengan bentuk lama, lalu `DROP TABLE` sebelum membuat ulang.
    //   b. **Gagal-keras**: periksa kolom kunci lewat katalog lalu
    //      `RAISE EXCEPTION` bila bentuknya tak sesuai.
    //
    // Keduanya dicari dalam jendela teks yang menyebut nama tabel ini.
    const sebutTabel = new RegExp(`\\b${tabel}\\b`, 'i')
    const punyaDropGuard = [...sql.matchAll(
      /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^;]+);/gi)]
      .some((d) => sebutTabel.test(d[1]))
    const punyaGagalKeras = [...sql.matchAll(
      /DO\s+\$\$[\s\S]*?\$\$/gi)]
      .some((blok) =>
        sebutTabel.test(blok[0]) &&
        /RAISE\s+EXCEPTION/i.test(blok[0]) &&
        /(information_schema\.columns|pg_attribute|to_regclass)/i.test(blok[0]))
    const adaPenegas = punyaDropGuard || punyaGagalKeras

    if (!pendefinisi.has(tabel)) pendefinisi.set(tabel, [])
    pendefinisi.get(tabel).push({ berkas: f, ifNotExists, adaPenegas })
  }

  for (const m of sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    const t = m[1].toLowerCase()
    if (!dropOleh.has(t)) dropOleh.set(t, [])
    dropOleh.get(t).push(m.input === sql ? f : f)
  }
}

// ── 1. Tabrakan ─────────────────────────────────────────────────────────────
const tabrakan = [...pendefinisi.entries()]
  .filter(([, def]) => def.length > 1)
  .map(([tabel, def]) => ({ tabel, def, dikenal: tabel in TABRAKAN_DIKETAHUI }))

const tabrakanBaru = tabrakan.filter((t) => !t.dikenal)

// ── 2. IF NOT EXISTS tanpa penegas — HANYA pendefinisi TERAKHIR ─────────────
//
// Yang menanggung beban penjagaan adalah migrasi yang datang BELAKANGAN, bukan
// yang pertama. Pendefinisi pertama membuat tabel di lingkungan bersih dan tak
// punya apa pun untuk dijaga; pendefinisi terakhirlah yang bisa menemukan tabel
// sudah ada dengan bentuk lain, lalu kalah diam-diam karena `IF NOT EXISTS`.
//
// Versi pertama pemeriksa ini menuduh SEMUA pendefinisi, termasuk 043/045/081
// yang justru forward-draft yang sudah dipensiunkan — 18 tuduhan, hampir
// semuanya salah sasaran. Penjaga yang berteriak pada pihak yang tak bisa
// memperbaiki apa pun akan diabaikan, lalu dimatikan.
const rawan = []
for (const { tabel, def } of tabrakan) {
  const terakhir = def[def.length - 1]   // `berkas` sudah terurut menaik
  if (!terakhir.ifNotExists || terakhir.adaPenegas) continue
  if (terakhir.berkas in IF_NOT_EXISTS_DIIZINKAN) continue
  rawan.push({ tabel, ...terakhir })
}

console.log('══ PENJAGA tabrakan definisi tabel ' + '═'.repeat(34))
console.log(`  berkas migrasi dipindai : ${berkas.length}`)
console.log(`  tabel didefinisikan     : ${pendefinisi.size}`)
console.log(`  tabel bertabrakan       : ${tabrakan.length} (${tabrakan.length - tabrakanBaru.length} dikenal, ${tabrakanBaru.length} baru)`)

if (tabrakan.length) {
  console.log('\n── Tabrakan yang sudah dinilai ' + '─'.repeat(38))
  for (const { tabel, def, dikenal } of tabrakan) {
    if (!dikenal) continue
    console.log(`  ${tabel}`)
    console.log(`      ${def.map((d) => d.berkas.match(/^(\d+)_/)[1] + (d.ifNotExists ? '(IF NOT EXISTS)' : '')).join('  +  ')}`)
    console.log(`      → ${TABRAKAN_DIKETAHUI[tabel]}`)
  }
}

let gagal = false

if (tabrakanBaru.length) {
  gagal = true
  console.error(`\n  ❌ ${tabrakanBaru.length} TABRAKAN BARU:`)
  for (const { tabel, def } of tabrakanBaru) {
    console.error(`     ${tabel} ← ${def.map((d) => d.berkas).join('  DAN  ')}`)
  }
  console.error(`
     Dua migrasi mendefinisikan tabel yang sama. Kalau yang belakangan memakai
     CREATE TABLE IF NOT EXISTS, ia akan NO-OP SENYAP di lingkungan yang sudah
     menjalankan yang pertama — tanpa galat, tanpa test merah.

     Ini persis cacat P0 047 vs 167 (accounts tenant-blind di CI/produksi).

     Perbaikan: pensiunkan salah satu definisi, ATAU daftarkan di
     TABRAKAN_DIKETAHUI pada berkas ini BESERTA ALASANNYA.`)
}

if (rawan.length) {
  gagal = true
  console.error(`\n  ❌ ${rawan.length} CREATE TABLE IF NOT EXISTS TANPA PENEGAS BENTUK`)
  console.error('     (pada tabel yang punya lebih dari satu pendefinisi):')
  for (const r of rawan) console.error(`     ${r.berkas} → ${r.tabel}`)
  console.error(`
     IF NOT EXISTS membuat migrasi idempoten — itu benar. Yang salah adalah
     memakainya tanpa memastikan tabel yang SUDAH ADA punya bentuk yang benar.

     Tambahkan penegas bentuk: periksa kolom kunci lewat information_schema.columns
     lalu RAISE EXCEPTION bila tak sesuai. Contoh: db/migrations/175_*.sql`)
}

if (gagal) process.exit(1)

console.log('\n  ✅ nol tabrakan baru, nol IF NOT EXISTS tanpa penegas.')
process.exit(0)
