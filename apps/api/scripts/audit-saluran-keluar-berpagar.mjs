#!/usr/bin/env node
// ============================================================================
// SALURAN KELUAR WAJIB BERPAGAR TERHADAP TEST
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Founder mengirim tangkapan layar WhatsApp 2026-08-14: enam pesan "KASBON
// BARU DIAJUKAN" identik dalam dua menit, dan bertanya apakah itu error.
//
// Bukan error. Itu **suite test**. Enam berkas test memanggil endpoint
// pengajuan kasbon, tiap panggilan melewati `createNotifications()`, dan
// jembatan `terbit-peristiwa.ts` meneruskannya ke webhook n8n sungguhan yang
// mengirim WhatsApp sungguhan.
//
// Terukur di basis: pola berulang tiap ~20 menit dengan isi identik —
// 15:21 (n=20), 16:01 (n=20), 16:17 (n=18). Itu jadwal `vitest run`.
//
// ── Kenapa ini kelas cacat, bukan kelalaian sekali
//
// `wa-kirim.ts` juga menyentuh dunia luar, dan ia AMAN — tapi amannya lewat
// disiplin: test-nya menyetel `konfigurasi: null` supaya adaptornya tak
// pernah terpanggil. Itu bekerja selama penulis test-nya tahu ia sedang
// menyentuh saluran keluar.
//
// `terbit-peristiwa.ts` bocor justru karena tak seorang pun tahu. Ia dipanggil
// dari corong `createNotifications()` — enam berkas test itu mengira sedang
// menguji retensi, opname, dan approval. Tak satu pun menyebut WhatsApp.
//
// Disiplin melindungi yang sengaja. Yang tak sengaja butuh pagar.
//
// ── Yang dijaga
//
// Tiap modul yang memanggil `fetch()` ke dunia luar wajib punya pagar
// terhadap `NODE_ENV === 'test'` — kecuali yang terdaftar sebagai
// DIKECUALIKAN di bawah, dengan alasannya tertulis.
//
// Ambang NOL. Modul saluran-keluar BARU akan merahkan CI sampai penulisnya
// memutuskan secara sadar: beri pagar, atau daftarkan pengecualiannya beserta
// alasan kenapa test aman menyentuhnya.
//
// ── Kenapa BUKAN memeriksa saat runtime
//
// Runtime hanya membuktikan jalur yang kebetulan terlewati. Cacat ini justru
// lolos karena jalurnya tak pernah terpikirkan — jadi yang harus diperiksa
// adalah SELURUH modul yang punya kemampuan keluar, bukan yang kebetulan
// dijalankan.
// ============================================================================

import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')

/*
  ── Yang DIKECUALIKAN, dan kenapa

  Pengecualian ditulis di sini — bukan lewat komentar penekan di berkasnya —
  supaya daftarnya bisa dibaca sekaligus. Penekan yang tersebar membuat
  "berapa saluran keluar yang tak berpagar" jadi pertanyaan yang harus
  dijawab dengan grep, dan pertanyaan begitu berhenti ditanyakan.
*/
const DIKECUALIKAN = {
  'src/lib/wa-kirim.ts':
    'Adaptornya hanya jalan bila `konfigurasi` terisi. Seluruh test menyetelnya ' +
    'null secara eksplisit dan menuliskan alasannya di tempat. Pagar NODE_ENV di ' +
    'sini akan menyembunyikan test yang LUPA menyetel null — dan justru test itu ' +
    'yang harus merah.',

  'src/lib/ai-penyedia-openai.ts':
    '`ai-penyedia.test.ts` menyadap `globalThis.fetch` dengan balasan tiruan. Itu ' +
    'LEBIH BAIK daripada pagar NODE_ENV: jalur HTTP-nya tetap teruji — bentuk ' +
    'permintaan, penguraian balasan, penanganan galat — sementara tak ada satu ' +
    'byte pun keluar. Pagar NODE_ENV justru akan membuat jalur itu tak teruji.',

  'src/routes/v1/wa-instance.ts':
    '`evo()` butuh `cfg` dari kredensial Evolution milik tenant. Tanpa itu rutenya ' +
    'membalas 422 dan tak pernah sampai ke fetch — dan `wa-instance.test.ts` ' +
    'MENERIMA 422 sebagai hasil sah (baris 149), jadi ia memang berhenti sebelum ' +
    'saluran keluar.\n' +
    '    Catatan jujur: alasan pertama yang saya tulis di sini SALAH — "nol berkas ' +
    'test menyebutnya". Glob yang saya pakai untuk mengukur (`src/**/__tests__/*.ts` ' +
    'lewat shell) tak menjangkau kedalamannya, dan saya menuliskan hasilnya sebagai ' +
    'fakta. Berkas testnya ada dan memanggil endpointnya. Yang membuat aman bukan ' +
    'ketiadaan test melainkan kredensial yang tak terpasang — pengecualian yang ' +
    'benar dengan alasan yang keliru tetap alasan yang keliru.',
}

const berkas = globSync('src/**/*.ts', { cwd: AKAR_API })
  .filter(f => !f.includes('__tests__') && !f.includes('test-utils'))

const tanpaPagar = []

for (const rel of berkas) {
  const jalur = rel.replace(/\\/g, '/')
  const isi = readFileSync(join(AKAR_API, rel), 'utf8')

  // Hanya modul yang benar-benar memanggil fetch — bukan yang menyebutnya
  // dalam komentar.
  const barisKode = isi
    .split(/\r?\n/)
    .filter(b => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join('\n')
  if (!/\bfetch\s*\(/.test(barisKode)) continue

  if (DIKECUALIKAN[jalur]) continue
  if (/NODE_ENV\s*===?\s*['"]test['"]/.test(barisKode)) continue

  tanpaPagar.push(jalur)
}

if (tanpaPagar.length > 0) {
  console.error('\n❌ Saluran keluar TANPA pagar terhadap test:\n')
  for (const j of tanpaPagar) console.error(`   ${j}`)
  console.error('\n   Modul ini memanggil `fetch()` ke dunia luar dan tak memeriksa')
  console.error('   `NODE_ENV === \'test\'`. Setiap `vitest run` yang kebetulan')
  console.error('   melewatinya mengirim sesuatu yang sungguhan — pesan, tagihan,')
  console.error('   atau permintaan berbiaya — dan itu tak bisa ditarik kembali.\n')
  console.error('   Persis yang terjadi 2026-08-14: enam berkas test mengira sedang')
  console.error('   menguji retensi dan approval, sementara tiap run mengirim')
  console.error('   belasan WhatsApp sungguhan lewat corong `createNotifications()`.\n')
  console.error('   Pilih satu:')
  console.error('     • beri pagar  → `if (process.env.NODE_ENV === \'test\') return`')
  console.error('     • kecualikan  → daftarkan di DIKECUALIKAN pada penjaga ini,')
  console.error('                     BESERTA alasan kenapa test aman menyentuhnya.\n')
  process.exit(1)
}

const nDikecualikan = Object.keys(DIKECUALIKAN).length
console.log(
  `✅ Saluran keluar berpagar: semua modul ber-fetch punya pagar test ` +
  `(${nDikecualikan} dikecualikan dengan alasan tertulis)`,
)
