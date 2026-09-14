#!/usr/bin/env node
/**
 * PENJAGA — rute TULIS wajib punya gerbang otorisasi, bukan cuma `authenticate`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-14 saat menelusuri R-020 (116 menu tanpa izin). R-020
 * menyimpulkan — dengan benar untuk cakupannya — bahwa yang bocor PINTU,
 * bukan isi: *"finance.ts memagari rutenya dengan requirePermission, dan
 * klien tak memegangnya"*.
 *
 * Tetapi cakupan itu hanya `finance.ts`. Diperiksa ke SELURUH rute:
 *
 *     rute ber-authenticate + requirePermission : 243
 *     rute ber-authenticate TANPA gerbang apa pun : lihat keluaran
 *
 * Dan yang terburuk di antaranya rute TULIS. Contoh yang diverifikasi baris
 * demi baris:
 *
 *     DELETE /api/v1/mandor/workers/:id   → preHandler: [authenticate] SAJA
 *
 * Satu-satunya pemeriksaan di dalamnya:
 *
 *     if (user.role === 'mandor' && worker.mandor_id !== user.id) → 403
 *
 * Artinya peran SELAIN mandor — termasuk `client` — lolos tanpa diperiksa,
 * dan penghapusannya berjalan lewat `request.db!` yang hanya menyaring
 * TENANT. Jadi klien bisa menghapus tukang milik perusahaan yang sama.
 *
 * ── Kenapa ini tak sama dengan temuan R-020
 *
 * R-020 soal MENU yang tampil lalu ditolak API — cacat pengalaman. Yang ini
 * kebalikannya: API-nya TIDAK menolak. Isolasi tenant tetap utuh (tak ada
 * kebocoran lintas perusahaan), yang hilang pembatasan SIAPA di dalam tenant.
 *
 * ── ⚠ KENAPA `canParticipateInChain` DIHITUNG SAH
 *
 * Ini bagian terpenting berkas ini, dan ia lahir dari kekeliruan pengukuran
 * pertama saya: hitungan mentah "rute tanpa requirePermission" MELEBIH-
 * LEBIHKAN masalahnya.
 *
 * `PATCH /procurement/material-requests/:id/approve` tak memakai
 * `requirePermission`, dan itu DISENGAJA — berapa level & siapa yang boleh
 * ditentukan rantai approval (ADR-007), bukan satu izin tetap. Gerbangnya
 * `canParticipateInChain()`, dan alasannya tertulis di atas rutenya.
 *
 * Penjaga yang merah atas rute itu akan diabaikan seluruh keluarannya, lalu
 * berhenti menjaga tanpa gejala (CLAUDE.md §8a.2). Karena itu yang dihitung
 * "bergerbang" mencakup `requirePermission`, `canParticipateInChain`,
 * `requireModul`, dan pemeriksaan kepemilikan-diri yang eksplisit.
 *
 * ── RATCHET, bukan ambang NOL
 *
 * Sebagian rute memang SAH tanpa izin peran, dan menuntutnya nol akan salah:
 *
 *   · `POST /keamanan/mfa/daftar`      — mendaftarkan MFA DIRI SENDIRI
 *   · `PATCH /notifications/:id/read`  — menandai notifikasi SENDIRI
 *   · `POST /notifications/subscribe`  — langganan push perangkat SENDIRI
 *
 * Menuntut izin di sana berarti pengguna tak bisa mengelola datanya sendiri.
 * Jadi yang dijaga: **jumlahnya TIDAK BOLEH NAIK**, dan lantainya menyimpan
 * DAFTAR NAMA — merah tanpa menyebut pelakunya memaksa orang berikutnya
 * menyisir puluhan rute (§8a.2).
 *
 * ⚠ BATAS: yang dibaca BENTUK KODE di `preHandler` dan ~40 baris awal
 * handler. Ia tak tahu apakah pemeriksaan di dalam handler benar-benar
 * menutup semua peran — `DELETE /mandor/workers/:id` di atas justru contoh
 * pemeriksaan yang ADA tapi hanya menutup satu peran.
 *
 * ── ⚠ VERSI PERTAMA PENJAGA INI HAMPIR SELURUHNYA BUTA
 *
 * Layak ditulis, sebab hijaunya terlihat sama persis dengan hijau yang sah.
 *
 * Regex pertama menuntut jalur berada di BARIS YANG SAMA dengan
 * `app.post(`. Padahal pola dominan di repo ini menaruh tipe generik lebih
 * dulu, jalurnya beberapa baris di bawah:
 *
 *     app.post<{ Params: {...}; Body: {...} }>(
 *       '/api/v1/projects/:projectId/ncr',
 *       { preHandler: [authenticate, requirePermission('ncr:manage')] },
 *
 * Diukur sesudah mutasi gagal memerahkannya:
 *
 *     rute TULIS jalur se-baris (TERLIHAT) : 147
 *     rute TULIS app.post<{...}> (TERLEWAT): 265
 *
 * Jadi penjaga ini melewatkan LEBIH BANYAK daripada yang diperiksanya, dan
 * hanya uji mutasi yang menunjukkannya: gerbang `ncr:manage` dicabut dengan
 * sengaja, penjaga tetap HIJAU.
 *
 * Inilah sebabnya CLAUDE.md §8a.2 menuntut penjaga baru dibuktikan bisa
 * MERAH — bukan sebagai formalitas.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const API = join(AKAR, 'apps', 'api', 'src', 'routes', 'v1')

/*
  LANTAI — rute TULIS yang hari ini tanpa gerbang peran.

  Tiap entri di sini adalah utang yang diakui, bukan keadaan yang disetujui.
  Yang bertanda SAH memang tak boleh diberi izin peran (data milik diri
  sendiri); sisanya menunggu keputusan founder (R-023).
*/
const LANTAI = new Set([
  // SAH — data milik pengguna sendiri, izin peran justru salah di sini
  'POST /api/v1/keamanan/mfa/daftar',
  'POST /api/v1/keamanan/mfa/verifikasi',
  'PATCH /api/v1/notifications/:id/read',
  'PATCH /api/v1/notifications/read-all',
  'DELETE /api/v1/notifications/:id',
  'POST /api/v1/notifications/:id/action',
  'POST /api/v1/notifications/subscribe',
  'POST /api/v1/notifications/perangkat',
  'DELETE /api/v1/notifications/perangkat',
  'PATCH /api/v1/my/companies/:id/default',
  /*
    DELETE mfa/:faktorId — mematikan MFA DIRI SENDIRI. Alasannya tertulis di
    atas rutenya: menuntut kode dari perangkat yang mungkin HILANG justru
    mengunci orang di luar akunnya, dan itu alasan paling umum seseorang
    membuka halaman itu.
  */
  'DELETE /api/v1/keamanan/mfa/:faktorId',
  /*
    Dua tahap impor yang TIDAK MENULIS — diperiksa: nol `.insert/.update/
    .delete` di keduanya. Tahap yang menulis (`/impor/commit`) BERGERBANG,
    dan izinnya dipilih per-skema (`requirePermission(IZIN[s.kunci])`) sebab
    satu izin untuk semua skema akan terlalu longgar.
  */
  'POST /api/v1/impor/baca',
  'POST /api/v1/impor/pratinjau',

  /*
    ⚠ TIGA rute dikeluarkan dari lantai 2026-09-14 sesudah diperiksa satu per
    satu: `kasbons/:id/status` dan `mandor/scope-items/:id/progress` bergerbang
    `canParticipateInChain` (ADR-007) di dalam handler, dan
    `DELETE notifications/subscribe` mengelola langganan push milik sendiri.
    Hitungan mentah "tanpa requirePermission" melebih-lebihkan masalahnya.
  */
  // UTANG — menunggu R-023. Bukan disetujui, cuma dibekukan supaya tak tumbuh.
  'POST /api/v1/cash/expenses',
  'POST /api/v1/companies',
  'POST /api/v1/companies/:id/members',
  'PATCH /api/v1/companies/:id/members/:userId',
  'PATCH /api/v1/companies/:id/pengaturan',
  'POST /api/v1/kasbons',
  'POST /api/v1/mandor/workers',
  'PATCH /api/v1/mandor/workers/:id',
  'DELETE /api/v1/mandor/workers/:id',
  'POST /api/v1/mandor/worker-kasbons',
  'PATCH /api/v1/mandor/worker-kasbons/:id/cicilan',
  'POST /api/v1/mandor/wage-reports',
  'POST /api/v1/mandor/kasbon-photo/upload',
  'POST /api/v1/documents/:documentId/access-log',
  'POST /api/v1/projects/:projectId/progress-logs',
])

/* Bentuk gerbang yang DIHITUNG SAH — bukan hanya requirePermission. */
/*
  Bentuk gerbang yang DIHITUNG SAH.

  ⚠ `hasPermission(` ikut — dan itu KOREKSI 2026-09-14. Sebagian rute
  memasang gerbangnya DI DALAM handler, bukan di `preHandler`, karena izinnya
  bergantung parameter: `recycle-bin/:kunci/:id/pulihkan` memilih
  `e.izinPulih` menurut jenis entitas yang dipulihkan, jadi satu
  `requirePermission` tetap tak bisa dipakai di sana.

  Tanpa `hasPermission` di daftar ini, penjaga merah atas rute yang justru
  bergerbang dengan benar — dan penjaga yang merah atas hal benar akan
  diabaikan seluruh keluarannya (CLAUDE.md §8a.2).
*/
const GERBANG = /requirePermission|hasPermission|canParticipateInChain|requireModul|requireOwnerGrup|requireSaasAdmin/

const tanpa = []
let bergerbang = 0

function sisir(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== '__tests__') sisir(p)
      continue
    }
    if (!e.name.endsWith('.ts')) continue
    const baris = readFileSync(p, 'utf8').replace(/\r/g, '').split('\n')
    for (let i = 0; i < baris.length; i++) {
      /*
        DUA bentuk, dan yang kedua justru MAYORITAS di repo ini:

            app.post('/jalur', { preHandler: … })      jalur se-baris
            app.post<{ Params… }>(                     jalur BEBERAPA BARIS
              '/jalur',                                 di bawahnya
              { preHandler: … },

        Versi pertama penjaga ini hanya mengenali yang pertama dan melewatkan
        265 rute — lihat catatan di kepala berkas.
      */
      const langsung = baris[i].match(/app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/)
      const generik = baris[i].match(/app\.(get|post|put|patch|delete)<\{/)
      if (!langsung && !generik) continue

      const metode = (langsung ?? generik)[1]
      if (metode === 'get') continue // hanya rute TULIS

      let jalur
      if (langsung) {
        jalur = langsung[2]
      } else {
        /* Jalur = string pertama sesudah `>(` — dicari maks 30 baris ke depan. */
        const cari = baris.slice(i, i + 30).join('\n').match(/>\(\s*\n?\s*['"`]([^'"`]+)['"`]/)
        if (!cari) continue // bentuk tak dikenali: dilewati, dan itu BATAS
        jalur = cari[1]
      }

      /*
        40 baris dari `app.xxx(` cukup untuk yang se-baris. Untuk bentuk
        generik, blok tipenya bisa panjang (ncr.ts ~15 baris), jadi
        jendelanya dihitung dari LETAK JALUR, bukan dari `app.post<`.
      */
      const mulai = langsung
        ? i
        : i + baris.slice(i, i + 30).findIndex((b) => b.includes(jalur))
      const blok = baris.slice(mulai, mulai + 40).join(' ')

      if (!/authenticate/.test(blok)) continue // rute publik: di luar cakupan
      if (GERBANG.test(blok)) {
        bergerbang++
        continue
      }
      tanpa.push(`${metode.toUpperCase()} ${jalur}`)
    }
  }
}
sisir(API)

const baru = tanpa.filter((t) => !LANTAI.has(t))
const membaik = [...LANTAI].filter((t) => !tanpa.includes(t))

console.log('── rute TULIS bergerbang ──')
console.log(`  bergerbang            : ${bergerbang}`)
console.log(`  TANPA gerbang peran   : ${tanpa.length}  (lantai ${LANTAI.size})`)

if (membaik.length) {
  console.log(`\n  ✅ ${membaik.length} rute kini BERGERBANG (atau hilang):`)
  for (const t of membaik) console.log(`     ${t}`)
  console.log('\n     Turunkan LANTAI di berkas ini supaya perbaikannya terkunci.')
}

if (baru.length) {
  console.error(`\n❌ ${baru.length} rute TULIS BARU tanpa gerbang otorisasi:`)
  for (const t of baru) console.error(`   ${t}`)
  console.error('\n   `authenticate` hanya membuktikan SIAPA, bukan BOLEH APA. Tanpa gerbang,')
  console.error('   setiap peran di tenant itu — termasuk `client` — lolos. Isolasi tenant')
  console.error('   tetap utuh, yang hilang pembatasan SIAPA di dalamnya.')
  console.error('\n   Pasang `requirePermission(<kunci>)`, atau `canParticipateInChain` bila')
  console.error('   keputusannya milik rantai approval (ADR-007).')
  console.error('\n   Kalau rute ini memang mengelola data pengguna SENDIRI, tambahkan ke')
  console.error('   LANTAI beserta alasannya — bukan dibiarkan tanpa catatan.')
  process.exit(1)
}

console.log(`\n✅ Nol rute tulis baru tanpa gerbang (${bergerbang} bergerbang).`)
