#!/usr/bin/env node
// ============================================================================
// NOTIFIKASI TAK BOLEH KEMBAR — dedup harian wajib benar-benar menahan
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Founder, 2026-08-14: *"emang ini semuanya hasil test? kenapa banyak banget?"*
//
// Diukur: 14.568 notifikasi, 14.563 belum dibaca — 5.598 di antaranya milik
// akun founder sendiri. Lonceng menampilkan `99+` sepanjang hari.
//
// Sebabnya BUKAN test. Alur terjadwal `2.10 kasbon-outstanding` membuat
// notifikasi yang sama berulang kali karena dedup hariannya mati: kuncinya
// ditulis dengan pemisah `NUL` (kode 0) tetapi dicari dengan SPASI —
// satu byte yang tak kasat mata di editor mana pun.
//
//     terkirim.add(`${n.type}<NUL>${rid}`)     ← ditulis
//     terkirim.has(`${type} ${recordId}`)      ← dicari
//
// Sudah diperbaiki commit `e8ba8d02` (12 Agustus), dan test dedupnya hijau.
// Tetapi residunya tetap ada, dan yang lebih penting: **tak ada yang
// mengukur akibatnya di basis**. Test membuktikan fungsinya benar untuk dua
// panggilan berturut; ia tak pernah bertanya "berapa kembar yang sudah
// terlanjur ada".
//
// Bedanya nyata: dari 11 Agustus, 8.478 baris untuk 234 kombinasi unik —
// 36× lipat. Test dedup saat itu MERAH, tapi merahnya dibaca sebagai cacat
// test, bukan sebagai 8 ribu notifikasi sungguhan.
//
// ── Yang dijaga
//
// Rasio kembar HARI INI. Bukan seluruh riwayat — residu lama tak bisa
// dihapus penjaga, dan memerahkan CI karenanya selamanya membuat penjaga
// ini berhenti dibaca (pelajaran `rls-initplan`, 2026-08-14).
//
// Ambang: nol kembar untuk notifikasi yang dibuat HARI INI. Kalau dedup
// rusak lagi, ia terlihat dalam hitungan jam — bukan setelah 8 ribu baris.
//
// Butuh basis. Dilewati bila DATABASE_URL tak ada (pola `audit-sod-gerbang`).
// ============================================================================

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')

/*
  ⚠ Kredensial dibaca dari `.env` JUGA, bukan `process.env` saja.

  Diukur 2026-09-04: SEBELAS penjaga di direktori ini melewati DIRINYA SENDIRI
  di mesin yang jelas punya basis — mereka menanyakan `process.env`, sementara
  kredensial repo ini tinggal di `apps/api/.env`.

  Akibatnya "223 penjaga hijau" memuat sebelas yang tak pernah memeriksa apa
  pun. Penjaga berambang NOL yang selalu dilewati memberi rasa aman yang
  salah — lebih buruk daripada tak ada penjaga.

  `bacaEnv()` membaca sumber yang SAMA dengan `buatClient()`.
*/
const { bacaEnv: _bacaEnv } = await import('../../../scripts/db/_koneksi.mjs')
const _envBerkas = _bacaEnv()
const DB =
  process.env.DATABASE_URL || process.env.DIRECT_URL
  || _envBerkas.DATABASE_URL || _envBerkas.DIRECT_URL
if (!DB) {
  console.log('  ⏭  notifikasi kembar: DILEWATI (tak ada DATABASE_URL)')
  process.exit(0)
}

const requireDari = createRequire(join(AKAR_API, 'package.json'))
let pg = null
try { pg = requireDari('pg') } catch { /* dilaporkan di bawah */ }
if (!pg) {
  console.log('  ⏭  notifikasi kembar: DILEWATI (pg tak ter-resolve)')
  process.exit(0)
}

const c = new pg.Client({ connectionString: DB })
await c.connect()

/*
  Kembar = baris ke-2 dan seterusnya untuk kombinasi
  (penerima, jenis, record_id, tanggal) yang SAMA.

  `record_id` wajib ada — tanpa itu tak ada cara menilai dua notifikasi
  merujuk hal yang sama, dan menebaknya dari judul/pesan akan salah untuk
  notifikasi yang memang sengaja berulang (mis. pengingat berbeda tanggal).

  `sent_at::date` bukan `created_at`: dedup di `otomasi-terjadwal.ts`
  menyaring `sent_at`, jadi penjaga harus mengukur kolom yang SAMA. Mengukur
  kolom lain berarti penjaga dan kode memakai dua definisi "hari ini".

  ⚠ `company_id` WAJIB ikut di partisi — dan ketiadaannya membuat penjaga ini
  menuduh selama entah berapa lama.

  Diukur 2026-09-01: penjaga melaporkan 46 kembar hari itu. Dibuka satu per
  satu, ke-46-nya notifikasi SAH:

      01:55:25  rid=05e21439  user=ca951b9f  co=8e7e65b0
      01:55:46  rid=05e21439  user=ca951b9f  co=3c69311b   ← perusahaan LAIN

  Satu orang bisa jadi anggota beberapa badan usaha — itu justru inti produk
  ini (satu pemilik, beberapa PT). `record_id` menunjuk material master yang
  dipakai bersama, jadi dua perusahaan yang sama-sama kehabisan material itu
  masing-masing WAJIB memberi tahu orangnya. Menekan yang kedua berarti satu
  perusahaan diam-diam tak pernah dikabari kehabisan stok.

  Diukur dengan `company_id` ikut: 46 → **0**. Nol kembar sungguhan.

  Bentuk kesalahannya sama dengan yang ditemukan hari itu juga pada
  `otomasi_jalan` vs `jadwal_tugas`: mengukur dengan kunci yang lebih sempit
  daripada yang dipakai kode, lalu percaya pada angkanya. Penjaga yang
  menuduh perilaku benar lebih berbahaya daripada tak ada penjaga — ia
  mengajari pembacanya bahwa merahnya boleh diabaikan.
*/
const { rows: [hari] } = await c.query(`
  WITH b AS (
    SELECT row_number() OVER (
             PARTITION BY user_id, type, action_data->>'record_id',
                          company_id, sent_at::date
             ORDER BY sent_at
           ) rn
      FROM notifications
     WHERE action_data->>'record_id' IS NOT NULL
       AND sent_at::date = CURRENT_DATE
  )
  SELECT count(*) FILTER (WHERE rn > 1)::int AS kembar,
         count(*)::int                       AS total
    FROM b
`)

// Konteks riwayat — dilaporkan, TIDAK memerahkan. Residu lama bukan
// tanggung jawab commit yang sedang diperiksa.
const { rows: [riwayat] } = await c.query(`
  WITH b AS (
    SELECT row_number() OVER (
             PARTITION BY user_id, type, action_data->>'record_id',
                          company_id, sent_at::date
             ORDER BY sent_at
           ) rn
      FROM notifications
     WHERE action_data->>'record_id' IS NOT NULL
  )
  SELECT count(*) FILTER (WHERE rn > 1)::int AS kembar FROM b
`)

await c.end()

if (riwayat.kembar > 0) {
  console.log(`  ℹ  residu riwayat: ${riwayat.kembar} notifikasi kembar dari sebelum hari ini.`)
  console.log('     Tidak memerahkan CI — ia peninggalan dedup yang sudah diperbaiki')
  console.log('     (commit e8ba8d02). Pembersihannya keputusan founder, bukan penjaga.')
}

if (hari.kembar > 0) {
  console.error('\n❌ Notifikasi KEMBAR dibuat hari ini:\n')
  console.error(`   ${hari.kembar} dari ${hari.total} notifikasi hari ini adalah kembar`)
  console.error('   (penerima, jenis, dan record_id yang sama, pada hari yang sama).\n')
  console.error('   Dedup harian di `otomasi-terjadwal.ts` tidak menahan. Cacat ini')
  console.error('   pernah terjadi karena SATU BYTE: pemisah kunci ditulis `NUL`,')
  console.error('   dicari dengan SPASI — tak terlihat di editor mana pun.\n')
  console.error('   Periksa `pembuatDedup()`: kunci yang ditulis dan yang dicari')
  console.error('   harus identik byte-per-byte.\n')
  process.exit(1)
}

console.log(
  `✅ Notifikasi hari ini: ${hari.total} baris, nol kembar — dedup harian menahan`,
)
