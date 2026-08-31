#!/usr/bin/env node
/**
 * PENJAGA: MENU AKTIF DI SIDEBAR WAJIB MENUNJUK HALAMAN YANG ADA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKAN PENJAGA INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 2026-08-16, founder mengeklik menu di sidebar aplikasinya sendiri dan
 * terlempar ke dashboard. Yang diklik `/aset/perawatan` — menu AKTIF, terlihat
 * normal, dan halamannya tak pernah dibuat.
 *
 * Diukur sesudahnya: dari 153 menu aktif, **empat** menunjuk halaman yang tak
 * ada. Keempatnya punya backend lengkap — tabel, rute, izin — yang hilang
 * hanya layarnya. Persis pola yang CLAUDE.md §8 sebut: *"Kolom DB sudah ada
 * BUKAN selesai"*.
 *
 * ── Kenapa penjaga yang sudah ada tidak menangkapnya
 *
 * `audit-peta-modul-vs-halaman.mjs` memeriksa arah SEBALIKNYA: entri Peta
 * Modul berstatus `rencana` yang ternyata PUNYA halaman (klaim terlalu
 * pesimistis). Ia hijau sepanjang waktu di sini, karena keempat menu ini tak
 * pernah tercatat di Peta Modul sama sekali.
 *
 * `audit-nav-yatim.mjs` memeriksa halaman yang tak punya menu. Juga arah
 * sebaliknya.
 *
 * Jadi ada lubang di antara ketiganya, dan lubang itulah yang dipijak founder:
 *
 *     menu ADA  →  halaman TIDAK ADA  →  tak satu pun penjaga peduli
 *
 * ── Kenapa hanya yang AKTIF
 *
 * `menu_items` memuat 351 baris ber-href; 198 di antaranya `is_active=false` —
 * sengaja dimatikan karena modulnya memang belum digarap (mayoritas ber-href
 * buatan `/m/<key>`). Memerahkan itu semua akan mengubah penjaga jadi 198
 * baris kebisingan yang diabaikan orang.
 *
 * Yang dijaga: menu yang BISA DIKLIK. Menu mati tak bisa diklik, jadi ia tak
 * pernah membohongi siapa pun.
 *
 * ── Kenapa AMBANG NOL, bukan ratchet
 *
 * Ratchet cocok untuk utang yang dicicil. Ini bukan utang — ini menu yang
 * berbohong kepada penggunanya hari ini. Satu saja sudah cukup untuk membuat
 * orang kehilangan kepercayaan pada seluruh sidebar, dan itu persis yang
 * terjadi.
 *
 * Kalau modulnya memang belum siap: MATIKAN menunya (`is_active=false`),
 * jangan biarkan ia mengundang klik ke halaman yang tak ada.
 *
 * ── Kenapa membaca BASIS, bukan berkas
 *
 * Sumber sidebar adalah tabel `menu_items`, bukan konstanta di kode. Penjaga
 * yang membaca berkas akan menjawab pertanyaan yang salah — dan itu kelas
 * cacat yang sama dengan `audit-taksonomi-vs-kode` yang hijau sepanjang waktu
 * karena memeriksa dokumen, bukan `peta-menu.ts`.
 *
 * Tanpa DATABASE_URL penjaga ini DILEWATI dengan jujur — dan "dilewati" bukan
 * "lulus". CI wajib menyediakan kredensialnya.
 *
 * Pakai:  node apps/web/scripts/audit-menu-punya-halaman.mjs
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))
const APP = join(DIR, '..', 'app')

/**
 * Apakah `href` punya halaman Next.js nyata?
 *
 * Sengaja SAMA BENTUKNYA dengan `adaHalaman()` di
 * `audit-peta-modul-vs-halaman.mjs` — dua penjaga yang menjawab pertanyaan
 * "apakah halamannya ada" dengan cara berbeda akan berselisih suatu hari,
 * dan yang salah satunya diam-diam meloloskan.
 */
function adaHalaman(href) {
  if (!href || !href.startsWith('/')) return true // bukan rute internal
  const jalur = href.split(/[?#]/)[0].replace(/\/$/, '')
  if (jalur === '') return existsSync(join(APP, 'page.tsx'))

  const bagian = jalur.split('/').filter(Boolean)
  const grup = ['', '(dashboard)', '(auth)', '(public)']

  for (const g of grup) {
    const dasar = g ? join(APP, g) : APP
    if (existsSync(join(dasar, ...bagian, 'page.tsx'))) return true
  }

  /*
    Rute dinamis: `/proyek/<uuid>` dilayani `/proyek/[id]/page.tsx`.

    ⚠ Nama parameternya DIBACA dari disk, bukan ditebak `[id]`.

    Diukur 2026-08-31: penjaga ini menuduh 85 menu menunjuk halaman yang tak
    ada — seluruhnya berpola `/m/<kunci>`. Halamannya ADA:
    `app/(dashboard)/m/[key]/page.tsx`, halaman "belum dibangun" yang sengaja
    dan informatif (ia menjelaskan APA, KENAPA belum ada, dan apa gantinya).

    Yang keliru penjaganya: ia hanya mencoba `[id]`, sementara Next.js
    menerima nama parameter apa pun. Penjaga yang salah tuduh membuat orang
    "memperbaiki" hal yang sudah benar — dan pada 85 baris sekaligus, ia
    justru mengajari orang mengabaikan penjaganya.
  */
  for (let i = bagian.length - 1; i >= 0; i--) {
    for (const g of grup) {
      const dasar = g ? join(APP, g) : APP
      const indukJalur = join(dasar, ...bagian.slice(0, i))
      if (!existsSync(indukJalur)) continue

      // Nama parameter dinamis yang BENAR-BENAR ada di direktori itu.
      let anak
      try { anak = readdirSync(indukJalur, { withFileTypes: true }) } catch { continue }
      for (const e of anak) {
        if (!e.isDirectory() || !/^\[.+\]$/.test(e.name)) continue
        const uji = [...bagian]
        uji[i] = e.name
        if (existsSync(join(dasar, ...uji, 'page.tsx'))) return true
      }
    }
  }
  return false
}

async function utama() {
  // `scripts/db/_koneksi.mjs` KANONIK — ia sudah menangani BOM + tanda kutip
  // pada `.env` repo ini (jebakan yang tertulis di CLAUDE.md §7), dan `pg`
  // ter-resolve dari sana sementara dari `apps/web/scripts` tidak. Parser env
  // buatan sendiri pernah memulangkan galat `ENOTFOUND base` karena keduanya.
  /*
    KREDENSIAL DIPERIKSA SENDIRI, SEBELUM `buatClient()`.

    `try/catch` di bawah TIDAK cukup: `buatClient()` memanggil `process.exit(2)`
    saat DIRECT_URL/DATABASE_URL tak ada, dan `process.exit` TAK BISA ditangkap
    `catch` — prosesnya mati sebelum blok penangkap sempat berjalan.

    Diukur di CI 2026-08-31: keenam shard "API — test" gagal dengan exit code 2
    pada langkah ini. Bukan test yang merah (itu exit 1) — penjaga yang mati
    karena job-nya memang tak diberi kredensial basis.

    Komentar di bawah sudah menjanjikan perilaku yang benar ("DILEWATI dengan
    jujur"); yang tak ada kodenya. Kelas cacat yang sama persis dengan
    `apps/web-publik/scripts/audit-em-dash.mjs`, diperbaiki pada hari yang
    sama — dan keduanya memakai `_koneksi.mjs` yang sama, jadi penjaga lain
    yang memakainya patut diperiksa dengan pertanyaan yang sama.
  */
  const ADA_DSN = Boolean(
    process.env.DIRECT_URL
    || process.env.DATABASE_URL
    || existsSync(join(DIR, '..', '..', 'api', '.env')),
  )

  let c
  try {
    if (!ADA_DSN) throw new Error('tak ada DIRECT_URL/DATABASE_URL')
    c = buatClient()
    await c.connect()
  } catch (e) {
    console.log(`  ⏭  menu punya halaman: DILEWATI (${e.message.slice(0, 60)})`)
    console.log('     ⚠ DILEWATI bukan LULUS — CI wajib menyediakan kredensial.')
    process.exit(0)
  }
  let rows
  try {
    ;({ rows } = await c.query(
      `SELECT key, label, href FROM menu_items
        WHERE is_active = true AND href IS NOT NULL AND href <> ''
        ORDER BY href`,
    ))
  } finally {
    await c.end()
  }

  const yatim = rows.filter((m) => !adaHalaman(m.href))

  console.log('\n══ Menu AKTIF vs halaman nyata ═════════════════════════════')
  console.log(`  menu aktif ber-href : ${rows.length}`)
  console.log(`  tanpa halaman       : ${yatim.length}`)
  console.log('  ambang              : 0 (bukan ratchet)\n')

  if (yatim.length === 0) {
    console.log('✅ Tiap menu yang bisa diklik menuju halaman yang benar-benar ada.\n')
    process.exit(0)
  }

  for (const y of yatim) {
    console.log(`   ✗ ${String(y.href).padEnd(32)} ${y.key.padEnd(22)} ${y.label}`)
  }

  console.log(`
   Menu ini BISA DIKLIK dan tak menuju ke mana-mana. Yang dilihat pengguna
   bukan galat yang menjelaskan dirinya — ia terlempar ke dashboard (kalau
   prefiksnya diizinkan middleware) atau mendarat di halaman 404.

   Dua jalan keluar, dan keduanya sah:

     1. BUAT halamannya — backend-nya sering sudah ada, yang hilang layarnya.
     2. MATIKAN menunya  — UPDATE menu_items SET is_active=false WHERE key=…

   Yang TIDAK boleh: membiarkannya aktif. Menu yang mengundang klik ke
   halaman yang tak ada membuat orang berhenti memercayai seluruh sidebar.
`)
  process.exit(1)
}

utama().catch((e) => {
  console.error('❌ audit-menu-punya-halaman gagal:', e.message)
  process.exit(1)
})
