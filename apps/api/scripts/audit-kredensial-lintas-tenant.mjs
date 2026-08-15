#!/usr/bin/env node
// ============================================================================
// KREDENSIAL TAK BOLEH DIPAKAI TENANT YANG BUKAN PEMILIKNYA
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Founder, 2026-08-14: *"lanjut, tapi harus disiapkan kalo nanti banyak
// perusahaan"*.
//
// Hari ini basis punya SATU perusahaan nyata, jadi setiap kekeliruan isolasi
// kredensial "kebetulan benar" — kunci `.env` milik founder memang dipakai
// perusahaan founder. Cacatnya baru terlihat saat perusahaan kedua masuk, dan
// saat itu ia sudah terlanjur mengirim atau menagih atas nama orang lain.
//
// ── Tiga jalan sebuah tenant bisa memakai kunci yang bukan miliknya
//
//   1. kunci sendiri     → SAH, dan selalu menang
//   2. warisan grup      → SAH bila `warisi_kredensial_induk` menyala DAN
//                          induknya memang induk tenant ini (migrasi 393)
//   3. jatuhan `.env`    → jaring satu-instalasi, HANYA grup AI
//
// Yang dijaga di sini: jalan KEEMPAT tidak boleh ada, dan jalan ke-3 tidak
// boleh melebar ke kunci yang salah-kirimnya tak bisa ditarik.
//
// ── Yang diperiksa
//
//   K-1  Jatuhan `.env` hanya untuk grup AI. Kunci WhatsApp/Email yang
//        terisi di env server berarti tenant B bisa mengirim lewat NOMOR
//        tenant A — kerusakan yang tak bisa dibatalkan, beda kelas dengan
//        tagihan yang cuma perlu dihentikan.
//
//   K-2  Warisan hanya dari INDUK LANGSUNG. Kode yang membaca kredensial
//        company lain tanpa memeriksa `parent_company_id` adalah kebocoran
//        lintas-tenant, bukan warisan.
//
//   K-3  Tiap pembacaan kredensial lintas-company wajib memeriksa
//        `warisi_kredensial_induk`. Tanpa saklarnya, "anak grup pake api
//        sendiri" tak pernah bisa dipenuhi.
//
// Ambang NOL. Penjaga ini membaca KODE, bukan isi basis: isi basis hari ini
// (satu perusahaan) tak bisa membuktikan apa pun tentang perilaku saat ada
// sepuluh.
// ============================================================================

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const KRED = join(AKAR_API, 'src', 'lib', 'kredensial.ts')

const isi = readFileSync(KRED, 'utf8')
const kode = isi
  .split(/\r?\n/)
  .filter(b => !/^\s*(\/\/|\*|\/\*)/.test(b))
  .join('\n')

const pelanggaran = []

// ── K-1: jatuhan env hanya grup AI ────────────────────────────────────────
//
// Dicari: pembacaan `process.env[meta.env]` yang TIDAK dipagari
// `grup === 'AI'` di dekatnya. Dua tempat memakainya (jalur ber-request dan
// jalur tanpa-request); keduanya wajib berpagar.
const blokEnv = [...kode.matchAll(/process\.env\[meta[^\]]*\]/g)]
for (const m of blokEnv) {
  const sekitar = kode.slice(Math.max(0, m.index - 700), m.index + 200)
  if (!/grup\s*===\s*'AI'/.test(sekitar)) {
    const baris = kode.slice(0, m.index).split('\n').length
    pelanggaran.push({
      kode: 'K-1',
      pesan: `jatuhan env di sekitar baris ${baris} tak dipagari \`grup === 'AI'\``,
      rinci:
        'Kunci WhatsApp/Email yang jatuh ke env server membuat tenant B mengirim '
        + 'lewat NOMOR tenant A. Tagihan salah bisa dihentikan; pesan terkirim tidak.',
    })
  }
}

// ── K-2 & K-3: warisan wajib berpagar induk DAN saklar ────────────────────
//
// Tiap pembacaan `app_credentials` yang menyaring `company_id` ke nilai LAIN
// (bukan `companyId` tenant ini) hanya sah bila `parent_company_id` dan
// `warisi_kredensial_induk` sama-sama diperiksa lebih dulu.
const bacaLintas = [...kode.matchAll(/from\('app_credentials'\)[\s\S]{0,400}?\.eq\('company_id',\s*(\w+)\)/g)]
for (const m of bacaLintas) {
  const variabel = m[1]
  if (variabel === 'companyId') continue // tenant sendiri — selalu sah

  // Jendela SEMPIT (300), dan atas KODE yang komentarnya sudah dibuang di atas.
  // Jendela lebar sempat membuat K-3 selalu hijau: ia menangkap kata
  // `warisi_kredensial_induk` dari komentar penjelas, bukan dari pemeriksaan
  // yang sungguh berjalan. Penjaga yang membaca komentar bukan penjaga.
  const sebelum = kode.slice(Math.max(0, m.index - 300), m.index)
  const baris = kode.slice(0, m.index).split('\n').length

  if (!/parent_company_id/.test(sebelum)) {
    pelanggaran.push({
      kode: 'K-2',
      pesan: `baris ${baris}: baca kredensial company lain (\`${variabel}\`) tanpa memeriksa \`parent_company_id\``,
      rinci: 'Membaca kredensial company yang bukan induk tenant ini adalah kebocoran lintas-tenant, bukan warisan.',
    })
  }
  /*
    Yang dicari: saklarnya benar-benar DIPAKAI sebagai syarat, bukan sekadar
    disebut di dekatnya.

    Mutasi K-3 pertama LOLOS: saya mencabut syarat `if`-nya, tetapi variabel
    `bolehWarisi` masih dideklarasikan dengan nama kolom itu di dalamnya —
    jadi string `warisi_kredensial_induk` tetap ada di jendela, dan penjaga
    mengira penjagaannya utuh. String ada, penjagaan tidak.

    Jadi yang diperiksa adalah pola CABANG: sebuah `if` yang menyertakan
    induk DAN saklarnya sekaligus. Itu satu-satunya bentuk yang benar-benar
    menghentikan pembacaan saat saklarnya mati.
  */
  const cabangSah = /if\s*\([^)]*induk[^)]*&&[^)]*(bolehWarisi|warisi_kredensial_induk)[^)]*\)/i
  if (!cabangSah.test(sebelum)) {
    pelanggaran.push({
      kode: 'K-3',
      pesan: `baris ${baris}: warisan tanpa memeriksa \`warisi_kredensial_induk\``,
      rinci: 'Tanpa saklarnya, anak grup tak pernah bisa memakai kunci sendiri — janji yang dinyatakan founder.',
    })
  }
}

if (pelanggaran.length > 0) {
  console.error('\n❌ Kredensial bisa dipakai tenant yang bukan pemiliknya:\n')
  for (const p of pelanggaran) {
    console.error(`   [${p.kode}] ${p.pesan}`)
    console.error(`          ${p.rinci}\n`)
  }
  console.error('   Urutan yang sah (lihat komentar `ambilKredensial`):')
  console.error('     1. kunci tenant sendiri   → selalu menang')
  console.error('     2. kunci INDUK LANGSUNG   → hanya bila saklarnya menyala')
  console.error('     3. jatuhan `.env`         → hanya grup AI\n')
  process.exit(1)
}

console.log(
  `✅ Kredensial lintas-tenant: ${blokEnv.length} jatuhan env berpagar grup AI · `
  + `${bacaLintas.length} pembacaan app_credentials, semuanya sah`,
)
