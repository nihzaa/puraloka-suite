#!/usr/bin/env node
// ============================================================================
// PENJAGA: penomoran migrasi — nomor ganda dilarang, lompatan BARU dilarang.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// Audit 2026-08-02 melaporkan "174 migrasi" padahal berkasnya 171 — kesalahan
// yang terjadi karena penomorannya melompat dan tak ada yang menyadarinya
// (cacat C-9, turunan dari koreksi §3 di KOREKSI.md).
//
// Dua kelas cacat yang dijaga, dan keduanya PUNYA preseden nyata di repo ini:
//
//   1. **Nomor ganda.** Dua berkas bernomor sama = urutan penerapan jadi
//      bergantung pada urutan abjad nama berkas, dan `ci-project-setup.mjs`
//      mencatat versinya lewat `version` yang sama sehingga yang kedua dianggap
//      "sudah jalan" lalu DILEWATI SENYAP selamanya. Ini persis mekanisme cacat
//      P0 047↔167: dua definisi bertabrakan, satu menang tanpa pesan galat.
//
//   2. **Lompatan baru.** Nomor yang hilang membuat siapa pun yang menghitung
//      "migrasi terakhir 174" menyimpulkan ada 174 migrasi. Audit sudah pernah
//      tergelincir persis di situ.
//
// ── Kenapa lompatan LAMA tidak dipaksa hilang
//
// Tiga lompatan sudah ada sejak lama: 030, 059, 064. Menomori ulang berkas
// migrasi yang SUDAH TERCATAT di buku migrasi adalah operasi berbahaya —
// `schema_migrations` menyimpan versinya, dan mengubah nomor berarti migrasi
// dianggap belum pernah jalan lalu dijalankan ulang di setiap lingkungan.
//
// Jadi lompatan lama DIKUNCI sebagai pengecualian bernama (dengan alasannya),
// dan yang dijaga adalah lompatan BARU. Ratchet, bukan pembersihan retroaktif.
//
// Keluar 0 = bersih. Keluar 1 = ada nomor ganda atau lompatan baru.
// ============================================================================

import { readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MIGRASI = join(REPO_ROOT, 'db', 'migrations')

// Lompatan yang SUDAH ADA sebelum penjaga ini dibuat. Masing-masing dengan
// alasan — daftar pengecualian tanpa alasan akan tumbuh tanpa batas.
const LOMPATAN_LAMA = {
  30: 'nomor tak pernah dipakai; tak ada berkas 030_* di histori git mana pun',
  59: 'dipakai `db/seeds/seed_dummy_data.sql` — tercatat di schema_migrations sebagai versi 059, tetapi memang SEED, bukan migrasi',
  64: 'nomor tak pernah dipakai; tak ada berkas 064_* di histori git mana pun',
  // 434-436: sama kelasnya dengan 30/59/64 — diperiksa 2026-08-29 dengan
  // `git log --all --diff-filter=A` dan tak ada berkas 434_*/435_*/436_*
  // yang pernah ada di histori mana pun, juga tak tercatat di
  // schema_migrations. Bukan migrasi hilang, melainkan nomor yang tak
  // pernah lahir.
  434: 'nomor tak pernah dipakai; nihil di histori git DAN di schema_migrations (diperiksa 2026-08-29)',
  435: 'nomor tak pernah dipakai; nihil di histori git DAN di schema_migrations (diperiksa 2026-08-29)',
  436: 'nomor tak pernah dipakai; nihil di histori git DAN di schema_migrations (diperiksa 2026-08-29)',
  // 471-477 & 483-488 TIDAK lagi di sini: nomor-nomor itu DIPAKAI 2026-08-29
  // untuk menomori ulang 13 migrasi yang sebelumnya bertabrakan (lihat commit
  // "13 migrasi tak pernah jalan di server baru"). Nomor bebas dipilih di
  // rentang ini justru supaya urutannya tetap SESUDAH aslinya (≤470) dan
  // SEBELUM 511/512 yang bergantung pada tabel struktur.
  //
  // 478-482 & 489-501: dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren
  // memegang nomor-nomor ini di database hidup saat migrasi cabang ini
  // didispatch, jadi penomoran ulang dinamis melompatinya untuk menghindari
  // tabrakan. Praktik yang disengaja & sudah disetujui, bukan kecelakaan.
  478: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  479: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  480: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  481: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  482: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  489: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  490: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  491: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  492: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  493: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  494: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  495: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  496: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  497: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  498: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  499: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  500: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  501: 'dilewati saat renumbering Admin SaaS 2026-08-22 — sesi konkuren memegang nomor ini di database hidup saat migrasi ini didispatch',
  // 582-587: DIPAKAI, tetapi di cabang yang belum menyatu.
  //
  // `feat/sumbu-ui-roadmap` (commit ced37d00, "enam yang NYATA dinomori
  // 582-587") memegang keenamnya: 582_takeoff_sektor_bored_pile,
  // 583_menu_ikon_anak_konsisten, 584_takeoff_sektor_baja_profil,
  // 585_nama_analisa_poer_plat, 586_izin_template_rab,
  // 587_template_item_cost_code.
  //
  // Migrasi berikutnya di `main` karena itu dinomori 588, dan celah ini
  // MENUTUP SENDIRI saat cabang itu di-merge — bukan nomor yang tak pernah
  // lahir seperti 30/64/434.
  //
  // ⚠ Pelajarannya, dan inilah kenapa alasannya ditulis panjang: penomoran
  // 588 semula dipilih 582, sebab `ls db/migrations/` di `main` DAN di
  // worktree keduanya berhenti di 581. Dua checkout yang sepakat bukan
  // bukti nomor itu bebas — yang menentukan histori git SELURUH cabang:
  //     git log --all --name-only | grep -o 'db/migrations/[0-9]*_[a-z_]*\.sql'
  582: 'dipakai feat/sumbu-ui-roadmap (belum merge) — 582_takeoff_sektor_bored_pile',
  583: 'dipakai feat/sumbu-ui-roadmap (belum merge) — 583_menu_ikon_anak_konsisten',
  584: 'dipakai feat/sumbu-ui-roadmap (belum merge) — 584_takeoff_sektor_baja_profil',
  585: 'dipakai feat/sumbu-ui-roadmap (belum merge) — 585_nama_analisa_poer_plat',
  586: 'dipakai feat/sumbu-ui-roadmap (belum merge) — 586_izin_template_rab',
  587: 'dipakai feat/sumbu-ui-roadmap (belum merge) — 587_template_item_cost_code',
}

if (!existsSync(MIGRASI)) {
  console.error(`FATAL: ${MIGRASI} tidak ada.`)
  process.exit(2)
}

const berkas = readdirSync(MIGRASI).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
const perNomor = new Map()
for (const f of berkas) {
  const n = Number(f.match(/^(\d+)_/)[1])
  if (!perNomor.has(n)) perNomor.set(n, [])
  perNomor.get(n).push(f)
}

const nomor = [...perNomor.keys()].sort((a, b) => a - b)
const ganda = [...perNomor.entries()].filter(([, fs]) => fs.length > 1)

const lompatanBaru = []
for (let i = 1; i < nomor.length; i++) {
  for (let hilang = nomor[i - 1] + 1; hilang < nomor[i]; hilang++) {
    if (!(hilang in LOMPATAN_LAMA)) lompatanBaru.push(hilang)
  }
}

console.log('══ PENJAGA penomoran migrasi ' + '═'.repeat(40))
console.log(`  berkas          : ${berkas.length}`)
console.log(`  nomor tertinggi : ${nomor[nomor.length - 1]}`)
console.log(`  lompatan lama   : ${Object.keys(LOMPATAN_LAMA).join(', ')} (dikecualikan, beralasan)`)

if (ganda.length === 0 && lompatanBaru.length === 0) {
  console.log('  ✅ nol nomor ganda, nol lompatan baru.')
  console.log(`\n  Catatan: ${berkas.length} berkas ≠ nomor tertinggi ${nomor[nomor.length - 1]} —`)
  console.log('  itu WAJAR karena lompatan lama. Jangan simpulkan jumlah dari nomor terakhir.')
  process.exit(0)
}

if (ganda.length) {
  console.error(`\n  ❌ ${ganda.length} NOMOR GANDA:`)
  for (const [n, fs] of ganda) {
    console.error(`     ${String(n).padStart(3, '0')} → ${fs.join('  DAN  ')}`)
  }
  console.error(`
     Nomor ganda membuat urutan penerapan bergantung pada abjad nama berkas, dan
     membuat ci-project-setup mencatat keduanya sebagai satu versi — yang kedua
     DILEWATI SENYAP di setiap lingkungan baru. Ini mekanisme yang sama dengan
     cacat P0 047 vs 167.`)
}

if (lompatanBaru.length) {
  console.error(`\n  ❌ ${lompatanBaru.length} LOMPATAN BARU: ${lompatanBaru.join(', ')}`)
  console.error(`
     Nomor yang hilang membuat orang menyimpulkan jumlah migrasi dari nomor
     terakhir — audit 2026-08-02 sudah pernah tergelincir persis di situ
     (melaporkan 174 padahal berkasnya 171).

     Kalau lompatan ini memang disengaja, daftarkan di LOMPATAN_LAMA pada berkas
     ini BESERTA ALASANNYA.`)
}

process.exit(1)
