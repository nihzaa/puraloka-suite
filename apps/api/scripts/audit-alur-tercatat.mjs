#!/usr/bin/env node
// ============================================================================
// ALUR OTOMASI WAJIB TERCATAT DI `otomasi_jalan`
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Founder bertanya "selanjutnya apa?", dan jawaban yang saya usulkan adalah
// mengukur saluran keluar yang sudah hidup — karena empat cacat hari ini
// sekelas: sistem melakukan sesuatu ke dunia nyata tanpa ada yang mengukur
// akibatnya.
//
// Pengukuran pertama langsung membantah klaim saya sendiri:
//
//     11 alur "aktif", 9 di antaranya NOL eksekusi seumur hidup —
//     termasuk `teruskan-kasbon-diajukan`, yang hari itu juga
//     mengirim 28 WhatsApp ke founder.
//
// Buku eksekusi bilang alurnya tak pernah jalan. Kenyataannya founder
// menerima puluhan pesan. Yang salah bukan bukunya melainkan penulis yang
// melewatinya: `utils/terbit-peristiwa.ts` — yang saya tulis sendiri sesi itu
// — menembak webhook n8n dengan `fetch()` langsung, tanpa menyentuh
// `otomasi_jalan` sama sekali.
//
// ── Kenapa ini lebih berbahaya daripada sekadar angka meleset
//
// `otomasi_jalan` adalah SATU-SATUNYA tempat pertanyaan "otomasi ini
// benar-benar jalan tidak?" bisa dijawab tanpa menebak. Selama ia kosong,
// setiap jawaban tentang otomasi adalah tebakan yang terdengar seperti fakta
// — dan halaman pemantauan otomasi menampilkan "belum pernah jalan" untuk
// alur yang justru paling sering menembak.
//
// Cacat ini tak berbunyi. Webhooknya berhasil, pesannya terkirim, dan buku
// yang seharusnya mencatatnya diam.
//
// ── Yang dijaga
//
// Tiap berkas yang MEMANGGIL webhook n8n wajib melakukannya lewat
// `jalankanAlur()` di `lib/otomasi-n8n.ts` — satu-satunya jalan yang
// mencatat mulai, selesai, status, dan durasi.
//
// Yang dicari: berkas yang menyebut `/webhook/` ATAU membangun URL n8n
// sendiri, tetapi tak memanggil `jalankanAlur`. Ambang NOL.
//
// ── Kenapa BUKAN memeriksa isi basis
//
// "Berapa alur yang punya catatan" bergantung pada apa yang kebetulan
// dijalankan hari ini. Alur yang belum pernah dipicu sah-sah saja kosong,
// dan memerahkan CI karenanya membuat penjaga ini berhenti dibaca —
// pelajaran `rls-initplan` (2026-08-14).
//
// Yang diperiksa adalah JALANNYA: siapa pun yang menembak webhook harus
// lewat pintu yang mencatat. Itu berlaku sebelum eksekusi pertama terjadi.
// ============================================================================

import { readFileSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')

/*
  ── Yang DIKECUALIKAN, dan kenapa

  Sama seperti `audit-saluran-keluar-berpagar`: pengecualian ditulis di sini
  supaya daftarnya terbaca sekaligus, bukan tersebar sebagai komentar penekan.
*/
const DIKECUALIKAN = {
  'src/lib/otomasi-n8n.ts':
    'Ia SENDIRI pintunya. `jalankanAlur()` yang menembak webhook sekaligus '
    + 'menulis `otomasi_jalan` — memeriksanya memanggil dirinya sendiri.',
}

const berkas = globSync('src/**/*.ts', { cwd: AKAR_API })
  .filter(f => !f.includes('__tests__') && !f.includes('test-utils'))

const tanpaCatatan = []

for (const rel of berkas) {
  const jalur = rel.replace(/\\/g, '/')
  if (DIKECUALIKAN[jalur]) continue

  const isi = readFileSync(join(AKAR_API, rel), 'utf8')

  // Baris komentar dibuang — berkas ini sendiri menyebut `/webhook/` panjang
  // lebar dalam penjelasannya, dan penjaga yang tersandung komentar akan
  // dianggap rusak lalu dimatikan.
  const kode = isi
    .split(/\r?\n/)
    .filter(b => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join('\n')

  /*
    ── Yang diperiksa: ADANYA `fetch` ke `/webhook/`, bukan ketiadaan
       `jalankanAlur` (diperbaiki 2026-08-14)

    Versi pertama penjaga ini berbunyi: "menyebut /webhook/ DAN fetch, TAPI
    tak memanggil jalankanAlur". Ia HIJAU saat dimutasi — saya menyuntikkan
    `fetch(url)` langsung ke `terbit-peristiwa.ts` dan penjaganya diam, karena
    berkas itu TETAP memanggil `jalankanAlur` beberapa baris di bawahnya.

    Kehadiran pintu yang benar tidak membuktikan tak ada pintu belakang.
    Cacat aslinya pun begitu bentuknya: satu berkas, satu `fetch` yang lewat
    begitu saja.

    Jadi yang dicari sekarang adalah `fetch(...)` yang argumennya mengandung
    `/webhook/` — pola tembakan langsung itu sendiri, ada atau tidak ada
    `jalankanAlur` di berkas yang sama.

    (Kesalahan yang sama saya buat hari ini pada test konkurensi K3:
    melonggarkan sampai hijau, lalu mutasi membuktikannya hiasan. Yang
    membedakan penjaga sungguhan dari hiasan cuma satu langkah — mutasi.)
  */
  /*
    Diperiksa dalam DUA bentuk, karena bentuk pertama saja masih lolos mutasi:

      inline    fetch(`${basis}/webhook/${kode}`)
      variabel  const u = `${basis}/webhook/${kode}`; fetch(u)

    Percobaan kedua saya hanya menangkap yang inline, dan mutasi lewat
    variabel — bentuk yang justru lebih wajar ditulis orang — lolos diam-diam.
    Dua kali berturut penjaga ini terbukti hiasan sebelum benar; keduanya
    ketahuan HANYA lewat mutasi, tak satu pun lewat membaca ulang kodenya.

    Jadi yang dicari adalah MEMBANGUN URL webhook di berkas yang bukan pintu
    resmi — ada fetch atau tidak. Membangunnya tanpa menembaknya memang tak
    berbahaya, tetapi juga tak ada alasan melakukannya; merahnya murah, dan
    lolosnya mahal.
  */
  const bangunUrlWebhook = /['"`][^'"`\n]*\/webhook\/|\/webhook\/\$\{/
  if (!bangunUrlWebhook.test(kode)) continue

  tanpaCatatan.push(jalur)
}

if (tanpaCatatan.length > 0) {
  console.error('\n❌ Webhook n8n ditembak TANPA lewat `jalankanAlur()`:\n')
  for (const j of tanpaCatatan) console.error(`   ${j}`)
  console.error('\n   Berkas ini memanggil webhook n8n langsung, jadi eksekusinya')
  console.error('   TIDAK tercatat di `otomasi_jalan` — buku yang jadi satu-satunya')
  console.error('   sumber jawaban untuk "otomasi ini benar-benar jalan tidak?".\n')
  console.error('   Persis yang terjadi 2026-08-14: 11 alur tercatat "aktif", 9 di')
  console.error('   antaranya NOL eksekusi seumur hidup — termasuk yang hari itu juga')
  console.error('   mengirim 28 WhatsApp sungguhan ke founder. Webhooknya berhasil,')
  console.error('   pesannya terkirim, dan bukunya diam.\n')
  console.error('   Perbaikannya: panggil `jalankanAlur()` dari `lib/otomasi-n8n.ts`.')
  console.error('   Ia menerima `db: TenantDb` — dan jalur tanpa `request` cukup')
  console.error('   memakai `createTenantDb(companyId)` (preseden: wa-webhook.ts).')
  console.error('   Contoh: `src/utils/terbit-peristiwa.ts`.\n')
  process.exit(1)
}

console.log(
  '✅ Alur tercatat: setiap penembak webhook n8n lewat `jalankanAlur()` '
  + `(${Object.keys(DIKECUALIKAN).length} dikecualikan dengan alasan tertulis)`,
)
