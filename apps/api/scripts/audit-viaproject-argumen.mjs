#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// PENJAGA: `viaProject(tabel, id)` diberi id yang COCOK dengan kolomnya.
// ════════════════════════════════════════════════════════════════════════════
//
// ── Cacat yang melahirkannya — dan ia sudah TERULANG
//
// `viaProject(tabel, id)` menyusun `.eq(kolom, id)`, dengan `kolom` diambil
// dari `lewat:` di `tenant-map.generated.ts`. Untuk sebagian besar tabel C
// kolom itu `project_id`, jadi mengoper `projectId` benar.
//
// Tapi **22 tabel** mewarisi tenancy lewat kolom LAIN — `assignment_id`,
// `rap_budget_id`, `invoice_id`, `po_id`, dan seterusnya. Mengoper `projectId`
// ke sana menyusun perbandingan antara dua jenis id yang berbeda:
//
//     .eq('assignment_id', <uuid proyek>)   → NOL BARIS, tanpa satu pun error
//
// Bukan galat. Bukan peringatan. Hanya laporan yang kosong dan terlihat
// seperti "memang belum ada datanya".
//
// ── Kenapa penjaga, bukan sekadar kehati-hatian
//
// Bug ini ditemukan pertama kali **2026-07-30** di `rap.ts:102`
// (`estimate_items` diberi `projectId`), diperbaiki, dan didokumentasikan
// panjang lebar tepat di tempatnya:
//
//     "BUG DITEMUKAN 2026-07-30 (verifikasi E2E, bukan laporan): kode lama
//      memanggil `.viaProject('estimate_items', projectId)` … `items` selalu
//      kosong, gagal SENYAP (bukan error, endpoint tetap 201)."
//
// Lalu **2026-08-08 ia terulang** — `weekly_wage_reports` diberi `projectId`
// di `cost-control.ts`, menyembunyikan Rp 243 juta upah dari laporan biaya.
// Penulisnya (saya) sudah membaca komentar `rap.ts` di sesi yang sama.
//
// Dokumentasi yang bagus tidak mencegah pengulangan. Penjaga mencegahnya.
//
// ── Yang diperiksa
//
// Panggilan `viaProject('<tabel>', <arg>)` di mana `<tabel>` mewarisi lewat
// kolom BUKAN `project_id`, tapi `<arg>` bernama seperti id proyek
// (`projectId`, `project_id`, `pid`, `p.id`, …).
//
// Nama variabel memang bukan bukti mutlak — tapi di repo ini konvensinya
// konsisten, dan ketiga kejadian nyata semuanya tertangkap pola ini.
// Positif palsu ditangani daftar putih beralasan, bukan dengan melonggarkan.
//
// Jalankan: node apps/api/scripts/audit-viaproject-argumen.mjs
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const PETA = join(AKAR, 'apps/api/src/utils/tenant-map.generated.ts')
const SUMBER = [join(AKAR, 'apps/api/src/routes'), join(AKAR, 'apps/api/src/utils')]

/**
 * Argumen yang SAH meski namanya berbau proyek.
 *
 * Kosong hari ini — dan itu disengaja. Tiap pengecualian di sini harus
 * menyebut ALASAN, karena daftar putih tanpa alasan adalah cara paling halus
 * melumpuhkan penjaga.
 *
 * Contoh yang SAH: `stock_transfers` mewarisi lewat `project_asal_id`, jadi
 * `viaProject('stock_transfers', b.project_asal_id)` benar — nama argumennya
 * memang menyebut kolomnya sendiri, dan pola di bawah sudah membedakannya.
 */
const DIKECUALIKAN = new Map([
  // ['berkas.ts:123', 'alasan tertulis'],
])

if (!existsSync(PETA)) {
  console.error(`❌ Peta tenancy tak ditemukan: ${PETA}`)
  process.exit(2)
}

// ── Tabel yang mewarisi lewat kolom BUKAN project_id ───────────────────────
const isiPeta = readFileSync(PETA, 'utf8')
const lewatKolom = new Map()
for (const m of isiPeta.matchAll(/'([a-z_]+)':\s*\{\s*kategori:\s*'C',\s*lewat:\s*'([a-z_]+)'/g)) {
  if (m[2] !== 'project_id') lewatKolom.set(m[1], m[2])
}

if (lewatKolom.size === 0) {
  console.error('❌ Nol tabel ber-`lewat` non-project_id — peta berubah bentuk?')
  console.error('   Penjaga yang tak menemukan apa pun karena polanya berubah')
  console.error('   adalah penjaga yang mati diam-diam. Periksa regex-nya.')
  process.exit(2)
}

function berkasTs(akar) {
  const hasil = []
  const telusuri = (d) => {
    if (!existsSync(d)) return
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n === '__tests__') continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) telusuri(p)
      else if (n.endsWith('.ts')) hasil.push(p)
    }
  }
  telusuri(akar)
  return hasil
}

/** Argumen yang bernama seperti id PROYEK. */
const BERBAU_PROYEK = /^(projectId|project_id|pid|proyekId|[A-Za-z_.]*\.project_id)$/

const temuan = []
for (const p of SUMBER.flatMap(berkasTs)) {
  const rel = p.replace(AKAR, '').replace(/\\/g, '/').replace(/^\//, '')
  const baris = readFileSync(p, 'utf8').split('\n')

  /*
    Komentar BLOK dilacak, bukan hanya baris berawalan `//` atau `*`.

    Versi sebelumnya menyatakan "komentar dilewati" dan hanya memeriksa awalan
    baris. Isi komentar blok yang ditulis rata tanpa `*` di depan karena itu
    LOLOS — dan `otomasi-terjadwal.ts` menyimpan catatan panjang yang
    menceritakan cacat ini beserta bentuk kodenya:

        Saya sempat menulis `viaProject('work_scopes', pid)` — mengoper id
        PROYEK ke tempat yang menunggu id PENUGASAN.

    Kalimat yang MENJELASKAN cacat yang sudah diperbaiki dilaporkan sebagai
    cacat. Penjaga yang menghukum dokumentasi perbaikannya sendiri mengajari
    orang berhenti menulis alasan — dan justru catatan itulah yang mencegah
    cacatnya terulang untuk ketiga kalinya.
  */
  let dalamBlok = false

  baris.forEach((b, i) => {
    if (dalamBlok) {
      if (b.includes('*/')) dalamBlok = false
      return
    }
    const buka = b.lastIndexOf('/*')
    if (buka >= 0 && b.indexOf('*/', buka) === -1) {
      dalamBlok = true
      return
    }
    // Komentar satu baris: penjelasan yang MENYEBUT bug ini bukan bug.
    if (/^\s*(\/\/|\*)/.test(b)) return

    const m = b.match(/viaProject\(\s*'([a-z_]+)'\s*,\s*([A-Za-z_][A-Za-z0-9_.]*)/)
    if (!m) return
    const [, tabel, arg] = m
    const kolom = lewatKolom.get(tabel)
    if (!kolom) return                       // lewat project_id — benar
    if (!BERBAU_PROYEK.test(arg)) return     // argumennya bukan id proyek

    // Argumen yang menyebut kolomnya sendiri adalah benar, bukan cacat —
    // `viaProject('stock_transfers', b.project_asal_id)` dengan
    // `lewat: 'project_asal_id'`.
    if (arg.endsWith(kolom)) return

    const kunci = `${rel.split('/').pop()}:${i + 1}`
    if (DIKECUALIKAN.has(kunci)) return

    temuan.push({ rel, baris: i + 1, tabel, kolom, arg })
  })
}

console.log('\n  PENJAGA: argumen `viaProject` cocok dengan kolom `lewat`-nya\n')
console.log(`  tabel non-project_id : ${lewatKolom.size}`)
console.log(`  panggilan salah      : ${temuan.length}\n`)

if (temuan.length > 0) {
  for (const t of temuan) {
    console.error(`   ❌ ${t.rel}:${t.baris}`)
    console.error(`      viaProject('${t.tabel}', ${t.arg})`)
    console.error(`      → menyusun .eq('${t.kolom}', ${t.arg}) — dua jenis id berbeda\n`)
  }
  console.error(`  Hasilnya NOL BARIS tanpa satu pun error. Bukan galat, bukan
  peringatan — hanya laporan kosong yang terlihat seperti "memang belum ada
  datanya".

  Bug ini sudah TERULANG: ditemukan 2026-07-30 di rap.ts, terjadi lagi
  2026-08-08 di cost-control.ts (menyembunyikan Rp 243 juta upah).

  Perbaikannya: kumpulkan id induknya lebih dulu dari sisi yang MEMANG
  ber-scope proyek, lalu saring dengan \`.in(kolom, idInduk)\` lewat
  \`db.unsafe(tabel, alasan)\`.
`)
  process.exit(1)
}

console.log('  ✅ Semua panggilan `viaProject` memakai id yang cocok.\n')
process.exit(0)
