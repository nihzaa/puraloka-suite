#!/usr/bin/env node
/**
 * Sesi yang DITULIS WebView mobile wajib yang DIBACA gerbang web.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder melaporkan 2026-09-05: "beberapa tak bisa menampilkan WebView".
 * Diukur terhadap produksi, bukan sebagian — SEMUANYA:
 *
 *     GET https://app.…/keuangan                       -> 307  /login
 *     GET …  --cookie "puraloka_token=<access_token>"  -> 200
 *
 * Ketujuh belas modul memberi 307 yang sama. Laporan "beberapa" datang dari
 * orang yang wajar berhenti mencoba sesudah dua atau tiga.
 *
 * ── Tiga lapis yang masing-masing BENAR sendiri
 *
 *   1. `web/[modul].tsx` menanam token ke `localStorage` dan mengirim
 *      header `Authorization` — keduanya sah, dan keduanya dipakai orang
 *      lain di aplikasi ini.
 *   2. `apps/web/middleware.ts` menggerbang dengan
 *      `request.cookies.get('puraloka_token')` — sah, dan itu memang cara
 *      peramban biasa membawa sesi.
 *   3. Middleware Next.js berjalan di SERVER, sebelum satu baris JS halaman
 *      jalan. `localStorage` belum berwujud di sana.
 *
 * Tak ada satu pun lapisan yang salah. Yang salah cuma sambungannya, dan
 * tak ada alat di repo ini yang melihat keduanya sekaligus: `tsc` hijau,
 * `audit-modul-mobile-nyata.mjs` hijau (halamannya MEMANG ada), seluruh
 * test hijau, dan 241 penjaga hijau.
 *
 * ── Kenapa komentar tak menolong
 *
 * Kepala `web/[modul].tsx` justru MENJELASKAN mekanismenya dengan percaya
 * diri: *"Sesi diteruskan lewat token, bukan lewat cookie"*, lengkap dengan
 * alasan kenapa `BeforeContentLoaded` penting. Penalarannya benar untuk
 * pemeriksaan di KLIEN — dan tak menyentuh gerbang di SERVER.
 *
 * Penjelasan yang benar mendampingi keadaan yang salah (CLAUDE.md §8a.2),
 * dan bentuk ini yang paling lama bertahan: pembaca berikutnya menemukan
 * jawaban yang meyakinkan, lalu berhenti mencari.
 *
 * ── Yang diperiksa
 *
 *   1. `middleware.ts` menggerbang lewat cookie bernama X
 *   2. skrip suntik WebView menulis `document.cookie` bernama X juga
 *   3. atribut `Secure` BERSYARAT https — memasangnya di `http://`
 *      pengembangan membuat peramban menolak cookie DIAM-DIAM, dan
 *      gejalanya kembali persis seperti cacat aslinya
 *
 * ⚠ BATAS: ini pemeriksaan SAMBUNGAN NAMA, bukan bukti sesi hidup.
 * Ia tak tahu apakah tokennya sah, belum kedaluwarsa, atau apakah
 * middleware punya cabang lain yang menolak. Yang dibuktikannya: yang
 * ditulis satu sisi adalah yang dibaca sisi lain. Bukti ujung-ke-ujung
 * butuh APK di HP sungguhan dengan sesi nyata.
 *
 * ── Ambang NOL
 *
 * Sesi yang putus bukan cacat bertingkat. Satu saja berarti seluruh modul
 * kantor — 17 dari peta, ~94 halaman web — tak bisa dibuka dari HP, dan
 * gejalanya "layar login" yang terbaca seperti sesi habis.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MODUL_TSX = join(AKAR, 'apps', 'mobile', 'app', '(app)', 'web', '[modul].tsx')
const MIDDLEWARE = join(AKAR, 'apps', 'web', 'middleware.ts')

for (const [nama, p] of [['[modul].tsx', MODUL_TSX], ['middleware.ts', MIDDLEWARE]]) {
  if (!existsSync(p)) {
    console.error(`❌ ${nama} tak ada di ${p} — jalurnya meleset.`)
    console.error('   Hijau dari berkas yang tak terbaca adalah kebohongan.')
    process.exit(1)
  }
}

/* CR dibuang lebih dulu — CLAUDE.md §7a. */
const baca = (p) => readFileSync(p, 'utf8').replace(/\r/g, '')

const mw = baca(MIDDLEWARE)
const tsx = baca(MODUL_TSX)

const galat = []

/* ── 1. Nama cookie yang DIBACA gerbang ───────────────────────────────── */
const dibaca = [...mw.matchAll(/request\.cookies\.get\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map(
  (m) => m[1],
)

if (dibaca.length === 0) {
  galat.push(
    'middleware.ts tak memanggil `request.cookies.get(...)` sama sekali. ' +
      'Entah gerbangnya pindah, entah pola bacanya berubah — penjaga ini ' +
      'jadi tak bermakna sampai diperbarui. NOL temuan bukan bukti aman.',
  )
}

/*
  Yang menggerbang adalah cookie yang dipakai di cabang "tak ada token →
  alihkan". Dibaca dari kode, bukan dipaku namanya di sini: memaku namanya
  membuat penjaga ini hijau selamanya kalau middleware ganti nama cookie.
*/
const gerbang = dibaca.filter((n) => /token/i.test(n))
if (dibaca.length > 0 && gerbang.length === 0) {
  galat.push(
    `middleware.ts membaca cookie [${dibaca.join(', ')}] tetapi tak satu pun ` +
      'bernama *token*. Periksa mana yang jadi gerbang, lalu sesuaikan penjaga ini.',
  )
}

/* ── 2. Skrip suntik WebView wajib MENULIS cookie itu ─────────────────── */
const adaDocumentCookie = /document\.cookie\s*=/.test(tsx)

if (!adaDocumentCookie) {
  galat.push(
    'web/[modul].tsx tak pernah menulis `document.cookie`. Middleware ' +
      'berjalan di SERVER dan hanya membaca cookie; `localStorage` dan ' +
      'header `Authorization` tak terlihat olehnya, jadi SETIAP modul ' +
      'akan dialihkan ke /login.',
  )
} else {
  for (const nama of gerbang) {
    /*
      Dicari nama cookie-nya di dekat penulisan, bukan di seluruh berkas:
      berkas ini juga menyebut nama yang sama untuk `localStorage` dan
      `storage.get()`, jadi pencarian global akan hijau meski cookie-nya
      bernama lain.
    */
    const tulis = new RegExp(`document\\.cookie\\s*=[\\s\\S]{0,200}?${nama}`).test(tsx)
    if (!tulis) {
      galat.push(
        `middleware menggerbang cookie \`${nama}\`, tetapi penulisan ` +
          '`document.cookie` di web/[modul].tsx tak menyebut nama itu dalam ' +
          '200 huruf berikutnya. Nama yang berbeda = sesi tak tersambung, ' +
          'tanpa satu pun galat.',
      )
    }
  }
}

/* ── 3. `Secure` wajib BERSYARAT, bukan dipaku ────────────────────────── */
if (adaDocumentCookie && /Secure/.test(tsx)) {
  /*
    ⚠ Draf pertama memeriksa KEDEKATAN teks: `https` dalam 400 huruf dari
    `Secure`. Ia MERAH pada jalan pertamanya atas kode yang BENAR —
    syaratnya memang ada (`${pakaiHttps ? '; Secure' : ''}`), cuma
    dipisahkan komentar panjang yang menerangkan kenapa syarat itu perlu.

    Bentuk yang sama dengan `audit-kosong-berpetunjuk.mjs` pagi ini:
    mengukur proksi, lalu merah atas hal yang benar. Penjaga yang begitu
    akan diabaikan seluruh keluarannya.

    Yang diperiksa sekarang KEPUTUSANNYA: tiap kemunculan `Secure` (di
    KODE, bukan komentar) wajib berada di dalam ekspresi bersyarat —
    ternary atau `&&` — pada baris yang sama.
  */
  const tanpaKomentar = tsx
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))

  const barisSecure = tanpaKomentar
    .split('\n')
    .filter((b) => /Secure/.test(b))

  const telanjang = barisSecure.filter((b) => !/\?[^\n]*Secure|Secure[^\n]*:|&&[^\n]*Secure/.test(b))

  if (barisSecure.length > 0 && telanjang.length > 0) {
    galat.push(
      '`Secure` dipasang tanpa syarat https. Di `http://` pengembangan ' +
        'peramban MENOLAK cookie ber-Secure diam-diam — gejalanya kembali ' +
        'persis seperti cacat aslinya (semua modul ke /login), tanpa galat.',
    )
  }
}

console.log('══ Sesi WebView nyambung ke gerbang web ═══════════════════════')
console.log(`  cookie dibaca middleware : ${dibaca.length ? dibaca.join(', ') : '(nol)'}`)
console.log(`  yang jadi gerbang        : ${gerbang.length ? gerbang.join(', ') : '(nol)'}`)
console.log(`  document.cookie ditulis  : ${adaDocumentCookie ? 'ya' : 'TIDAK'}`)
console.log(`  temuan                   : ${galat.length}`)

if (galat.length > 0) {
  console.error('')
  for (const g of galat) console.error(`  ❌ ${g}`)
  console.error('')
  console.error('  Perbaiki di apps/mobile/app/(app)/web/[modul].tsx (const suntik).')
  process.exit(1)
}

console.log('')
console.log('✅ Yang ditulis WebView adalah yang dibaca gerbang web.')
console.log('   Batas: ini sambungan NAMA, bukan bukti sesi hidup. Token yang')
console.log('   sah/kedaluwarsa dan cabang middleware lain tak diperiksa di sini.')
