#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Penjaga saldo yang bisa DILEWATI DIAM-DIAM.
//
// ── Pola yang dicari
//
//     const { data: acc } = await db.from('cash_accounts').select('balance')…
//     if (acc && Number(acc.balance) < jumlah) {   // ← `acc &&`
//       return reply.status(400).send({ error: 'Saldo tidak mencukupi' })
//     }
//
// Terlihat defensif, dan justru itu masalahnya: kalau query gagal atau id-nya
// salah, `acc` bernilai null — kondisinya jadi false, pemeriksaan DILEWATI,
// dan transaksi lolos. Saldo bisa jatuh di bawah nol tanpa satu pun pesan.
//
// Ditemukan 2026-08-02 saat menelusuri tiga kas kecil bersaldo negatif di dev
// (sampai −Rp 213 juta). Saldo itu sendiri ternyata residu data lama, bukan
// hasil pola ini — tapi menelusurinya menemukan LIMA penjaga di `cash.ts` yang
// semuanya bisa dilewati begitu.
//
// ── Kenapa penjaga statis, bukan test per-endpoint
//
// Test membuktikan endpoint yang ADA hari ini benar. Yang ini menangkap
// endpoint BERIKUTNYA — dan pola `if (x && …)` cukup wajar sehingga akan
// ditulis lagi oleh siapa pun yang menyalin dari tetangganya.
//
// ── Ambang
//
// NOL. Ini bukan ratchet: tak ada satu pun kasus sah untuk melewati
// pemeriksaan saldo saat akunnya tak ketemu. Yang benar adalah menolak
// (404), bukan melanjutkan.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

/** Semua file .ts di bawah `dir`, kecuali test. */
function berkasTs(dir, hasil = []) {
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama)
    if (statSync(p).isDirectory()) {
      if (nama !== '__tests__' && nama !== 'test-utils') berkasTs(p, hasil)
    } else if (nama.endsWith('.ts') && !nama.endsWith('.test.ts')) {
      hasil.push(p)
    }
  }
  return hasil
}

// `if (x && …balance…)` — variabel dipakai sebagai penjaga keberadaan DI DALAM
// kondisi yang memeriksa saldo. Sengaja sempit: hanya baris yang menyebut
// `balance`, supaya tak menandai `if (user && user.aktif)` yang tak ada
// hubungannya dengan uang.
const POLA = /if\s*\(\s*(\w+)\s*&&\s*[^)]*\bbalance\b[^)]*\)/

const temuan = []
for (const berkas of berkasTs(AKAR)) {
  const baris = readFileSync(berkas, 'utf8').split('\n')
  baris.forEach((isi, i) => {
    const m = POLA.exec(isi)
    if (m) temuan.push({ berkas: berkas.slice(AKAR.length + 1), baris: i + 1, isi: isi.trim(), vari: m[1] })
  })
}

if (temuan.length === 0) {
  console.log('✅ Penjaga saldo: nol pemeriksaan yang bisa dilewati diam-diam')
  process.exit(0)
}

console.error(`\n❌ ${temuan.length} pemeriksaan saldo bisa DILEWATI DIAM-DIAM\n`)
for (const t of temuan) {
  console.error(`   ${t.berkas}:${t.baris}`)
  console.error(`     ${t.isi}`)
  console.error(`     → \`${t.vari} &&\` membuat pemeriksaan dilewati saat ${t.vari} null.`)
  console.error(`       Tolak lebih dulu: if (!${t.vari}) return reply.status(404)…\n`)
}
console.error('Saldo yang lolos pemeriksaan bisa jatuh di bawah nol tanpa pesan apa pun.\n')
process.exit(1)
