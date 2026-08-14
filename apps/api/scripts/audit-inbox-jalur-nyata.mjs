#!/usr/bin/env node
// ============================================================================
// JALUR UI DI INBOX APPROVAL WAJIB MENUNJUK HALAMAN YANG BENAR-BENAR ADA
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Ditemukan 2026-08-14 saat menambahkan `purchase_order` ke inbox. Sebelum
// menulis `jalurUi` saya mengukur dulu halaman mana yang benar-benar ada —
// tebakan pertama saya (`/procurement/purchase-order`) SALAH; yang benar
// `/procurement/pesanan`.
//
// Sekalian memeriksa dua belas entri lain yang sudah ada, dan hasilnya:
//
//     TAK ADA   /kontrak/change-order
//     TAK ADA   /procurement/material-request
//     TAK ADA   /kontrak/submittal
//     TAK ADA   /lessons-learned
//
// **Empat dari tiga belas jalur menunjuk halaman yang tidak ada.**
//
// (Pengukuran manual saya semula menyebut LIMA — `/mandor/back-charge` ikut
// terhitung. Penjaga ini menemukan bahwa ia dilayani rute dinamis, jadi
// hidup. Pemeriksaan harfiah `existsSync` per folder terlalu kasar untuk
// Next.js; itulah kenapa `adaHalaman()` di bawah mencocokkan segmen.)
//
// ── Kenapa ini tak pernah terlihat
//
// `audit-inbox-lengkap.mjs` menjaga hal yang berbeda dan penting: bahwa tiap
// jenis approval PUNYA entri, dan kolom-kolomnya nyata di schema. Ia tak
// pernah memeriksa `jalurUi`, karena jalur itu urusan web dan penjaganya
// hidup di `apps/api`.
//
// Akibatnya kelas cacat yang khas repo ini: approver membuka inbox, melihat
// dokumen yang menunggu keputusannya, menekan tautannya — dan mendarat di
// 404. Tak ada galat di server, tak ada yang merah di CI, dan dokumennya
// tertahan tanpa seorang pun tahu sebabnya.
//
// Itu persis kerusakan yang `audit-inbox-lengkap` berusaha cegah, lewat
// pintu yang tak ia jaga.
//
// ── Yang dijaga
//
// Tiap `jalurUi` di `lib/inbox-approval.ts` wajib punya `page.tsx` yang
// bersesuaian di `apps/web/app/(dashboard)/`.
//
// **AMBANG NOL** — lahir sebagai ratchet (lantai 4), lalu keempat jalur
// buntunya diperbaiki di commit yang sama begitu terukur. Sejak itu tak boleh
// ada satu pun jalur buntu.
//
// Rute dinamis (`[id]`) diterima: `/kontrak/submittal` boleh dilayani
// `/kontrak/[id]/submittal`. Yang dicari adalah adanya halaman yang bisa
// melayani jalur itu, bukan kecocokan folder harfiah.
// ============================================================================

import { readFileSync, existsSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const AKAR_WEB = join(AKAR, 'apps', 'web', 'app', '(dashboard)')
const KATALOG = join(AKAR, 'apps', 'api', 'src', 'lib', 'inbox-approval.ts')

/*
  Lantai NOL — dan ia sempat 4.

  Penjaga ini lahir sebagai ratchet: empat jalur sudah buntu saat dibuat, dan
  memerahkan CI karena utang lama membuat penjaga berhenti dibaca (pelajaran
  `rls-initplan`). Keempatnya diperbaiki di commit yang sama begitu terukur:

      /procurement/material-request → /procurement/permintaan
      /kontrak/submittal            → /lapangan/submittal
      /lessons-learned              → /mutu/pelajaran
      /kontrak/change-order         → /proyek   (lihat catatan di katalog:
                                      CO tak punya halaman sendiri, ini
                                      perbaikan SEBAGIAN)

  Jadi lantainya turun 4 → 0, dan sejak itu ia ambang nol: tak boleh ada satu
  pun jalur buntu. Menaikkannya kembali butuh ratifikasi (G-5).
*/
const LANTAI = 0

const isi = readFileSync(KATALOG, 'utf8')

// `jalurUi: '/x/y'` — dibaca dari katalog, bukan didaftar ulang di sini.
// Daftar yang ditulis dua kali adalah daftar yang akan berselisih.
const jalur = [...isi.matchAll(/jalurUi:\s*'([^']+)'/g)].map(m => m[1])

if (jalur.length === 0) {
  console.error('❌ Nol `jalurUi` terbaca dari inbox-approval.ts — pola bacanya rusak,')
  console.error('   dan penjaga yang tak membaca apa pun akan selalu hijau.')
  process.exit(1)
}

/** Semua rute halaman dashboard yang benar-benar ada. */
const halaman = globSync('**/page.tsx', { cwd: AKAR_WEB })
  .map(p => '/' + p.replace(/\\/g, '/').replace(/\/page\.tsx$/, '').replace(/^page\.tsx$/, ''))

/**
 * Apakah ada halaman yang bisa melayani jalur ini?
 *
 * Cocok harfiah, ATAU lewat segmen dinamis: `/kontrak/submittal` dilayani
 * `/kontrak/[id]/submittal`. Tanpa ini penjaga akan merah palsu untuk rute
 * yang sebenarnya hidup — dan penjaga yang meneriaki kode benar berhenti
 * dibaca.
 */
function adaHalaman(j) {
  if (existsSync(join(AKAR_WEB, j.replace(/^\//, ''), 'page.tsx'))) return true
  const seg = j.replace(/^\//, '').split('/')
  return halaman.some(h => {
    const hs = h.replace(/^\//, '').split('/')
    if (hs.length !== seg.length) return false
    return hs.every((x, i) => x === seg[i] || /^\[.+\]$/.test(x))
  })
}

const buntu = jalur.filter(j => !adaHalaman(j))

console.log(`  jalur diperiksa : ${jalur.length}`)
console.log(`  buntu           : ${buntu.length}`)
console.log(`  lantai          : ${LANTAI}`)

if (buntu.length > 0) {
  console.log('')
  for (const b of buntu) console.log(`   ✗ ${b}`)
}

if (buntu.length > LANTAI) {
  console.error('')
  console.error('❌ Jalur inbox buntu BERTAMBAH.\n')
  console.error('   Approver membuka inbox, melihat dokumen yang menunggu keputusannya,')
  console.error('   menekan tautannya — dan mendarat di 404. Tak ada galat di server,')
  console.error('   tak ada yang merah, dan dokumennya tertahan tanpa seorang pun tahu')
  console.error('   sebabnya.\n')
  console.error('   Perbaikannya: samakan `jalurUi` di `src/lib/inbox-approval.ts`')
  console.error('   dengan rute halaman yang benar-benar ada di')
  console.error('   `apps/web/app/(dashboard)/`. UKUR, jangan tebak — tebakan pertama')
  console.error('   saya sendiri (`/procurement/purchase-order`) salah; yang benar')
  console.error('   `/procurement/pesanan`.\n')
  process.exit(1)
}

if (buntu.length < LANTAI) {
  console.log('')
  console.log(`  ℹ Jalur buntu BERKURANG (${buntu.length} < ${LANTAI}).`)
  console.log(`    Turunkan LANTAI di penjaga ini ke ${buntu.length} supaya perbaikannya terkunci.`)
}

console.log('')
console.log(`✅ Jalur inbox: ${buntu.length} buntu, tidak bertambah dari lantai ${LANTAI}`)
