#!/usr/bin/env node
/**
 * UJI ENDPOINT ADA — memastikan setiap `api.get/post/patch/delete("/api/...")`
 * di web menunjuk rute yang BENAR-BENAR didaftarkan di API.
 *
 * ── Kenapa ada
 *
 * Saat memecah modul Keuangan, DUA endpoint ditulis dari ingatan dan keduanya
 * salah: `/api/v1/invoices` (yang benar `/api/v1/finance/invoices`) dan
 * `/api/v1/payments` (yang benar `/api/v1/finance/payments`).
 *
 * Yang membuatnya berbahaya bukan galatnya — melainkan bentuk kegagalannya:
 * 404 hanya muncul di konsol peramban, sementara halamannya tampil rapi
 * bertuliskan "Tidak ada invoice". Kegagalan yang menyamar jadi kabar baik,
 * di layar keuangan. Tanpa sapuan layar otomatis, itu bisa bertahan berbulan.
 *
 * ── Cara kerja
 *
 * Kumpulkan semua literal path di `apps/web` dan semua rute terdaftar di
 * `apps/api`, lalu cocokkan dengan menormalkan segmen dinamis (`${id}` dan
 * `:id` sama-sama jadi `*`).
 *
 * ── Batasnya, dinyatakan terus terang
 *
 * Path yang dirangkai dari variabel (`api.get(url)` dengan `url` dihitung di
 * tempat lain) TIDAK terdeteksi. Alat ini menangkap kesalahan ketik dan
 * tebakan — bukan semua kemungkinan.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

const kumpul = (akar, filter) => {
  const out = []
  const jelajah = (d) => {
    for (const n of readdirSync(d)) {
      if (n[0] === '.' || n === 'node_modules' || n === 'dist') continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) jelajah(p)
      else if (filter(n)) out.push(p)
    }
  }
  jelajah(akar)
  return out
}

/**
 * Buang komentar sebelum memindai.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI PERLU — 17 LAPORAN PALSU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi sebelumnya menyatakan asumsinya terus terang: "kelebihan-tangkap hanya
 * berarti satu-dua path ekstra diperiksa". Asumsi itu SALAH, dan diukur
 * 2026-08-27: penjaga ini melaporkan **17 path menunjuk rute yang TIDAK ADA**,
 * dan tiga di antaranya berasal dari KOMENTAR yang justru menjelaskan bahwa
 * path itu TIDAK dipakai:
 *
 *     // GET/POST /api/v1/projects/:projectId/punch-items   (bukan flat
 *     // `/api/v1/punch-items` seperti pola K3 — modul ini SELALU
 *     // project-scoped …)
 *
 * Kodenya benar (`/api/v1/projects/${id}/punch-items`); yang dilaporkan
 * hilang adalah kalimat yang menerangkan kenapa bentuk itu TIDAK dipakai.
 * Sama untuk `/api/v1/k3/inspeksi` dan `/api/v1/cash` — ketiganya hanya ada
 * di komentar penjelas.
 *
 * Penjaga yang berisik akan diabaikan, dan penjaga yang diabaikan tak menjaga
 * apa pun — kalimat itu tertulis di berkas ini sendiri, lalu dilanggar oleh
 * berkas ini sendiri.
 *
 * Pembuangannya sengaja sederhana (baris `//` dan blok `/* … *\/`). Ia bisa
 * salah pada string yang MEMUAT `//` — mis. URL `https://…` — tetapi path yang
 * dicari selalu diawali `/api/`, tak pernah punya skema, jadi kerugiannya nol
 * di sini.
 */
const tanpaKomentar = (isi) => isi
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const norm = (p) =>
  // Query string dibuang LEBIH DULU. Kalau tidak, `?q=${x}` ikut terkonversi
  // jadi `?q=*` dan path-nya tak akan pernah cocok — persis yang terjadi pada
  // `/api/v1/cecep/resources?q=...`, dilaporkan hilang padahal rutenya ada.
  p.split('?')[0]
   .replace(/\$\{[^}]+\}/g, '*')      // template literal  → *
   .replace(/:[a-zA-Z_]+/g, '*')      // param Fastify     → *
   .replace(/\/+$/, '')

// ── Rute yang DIDAFTARKAN di API ──────────────────────────────────────────
const TERDAFTAR = new Set()
for (const f of kumpul(join('apps', 'api', 'src', 'routes'), (n) => n.endsWith('.ts') && !n.includes('.test.'))) {
  /*
    Komentar dibuang di sisi API juga — tetapi alasannya BERBEDA dan lebih
    lemah: di sini kelebihan-tangkap membuat daftar TERDAFTAR lebih longgar,
    yang aman. Yang tak aman adalah kebalikannya: rute yang disebut hanya di
    komentar lalu dianggap ADA, sehingga path web yang benar-benar salah
    lolos. Itulah yang ditutup di sini.
  */
  const isi = tanpaKomentar(readFileSync(f, 'utf8'))

  // ⚠️ Path TIDAK selalu di baris yang sama dengan `app.patch<...>(`.
  // Beberapa rute menyelipkan komentar penjelas di antaranya:
  //
  //     app.patch<{ Params: { id: string } }>(
  //       // F2 (AKTA 0 lockout fix): otorisasi via capability ...
  //       '/api/v1/change-orders/:id/approve',
  //
  // Versi pertama alat ini hanya melihat sebaris, jadi ia melaporkan rute
  // approve/reject change-order sebagai "tidak ada" padahal jelas ada —
  // positif palsu yang, kalau dipercaya, akan membuat orang "memperbaiki"
  // kode yang sehat.
  //
  // Yang paling andal dan tetap sederhana: kumpulkan SEMUA literal berawalan
  // `/api/` di berkas rute. Kelebihan-tangkap (mis. path di komentar) hanya
  // membuat daftar terdaftar lebih longgar — dan longgar di sini aman,
  // karena tujuannya menangkap path web yang TAK ADA padanannya.
  for (const m of isi.matchAll(/['"`](\/api\/[^'"`\s]+)['"`]/g)) {
    TERDAFTAR.add(norm(m[1]))
  }
}

// ── Path yang DIPAKAI di web ──────────────────────────────────────────────
const dipakai = new Map()
for (const f of kumpul(join('apps', 'web'), (n) => /\.(tsx?|mjs)$/.test(n))) {
  // Berkas uji dikecualikan: mereka memakai path karangan (`/api/v1/x`,
  // `/api/v1/terima`) sebagai umpan mock, dan itu memang TIDAK boleh ada di
  // API. Melaporkannya sebagai kesalahan akan membuat alat ini berisik, lalu
  // diabaikan — dan penjaga yang diabaikan tak menjaga apa pun.
  //
  // `scripts/` juga dilewati: berkas ini sendiri menyebut path contoh di
  // komentarnya.
  if (
    f.includes(`${sep}.next${sep}`) ||
    f.includes(`${sep}ds-bundle${sep}`) ||
    f.includes(`${sep}scripts${sep}`) ||
    /\.(test|spec)\.[tj]sx?$/.test(f)
  ) continue
  const isi = tanpaKomentar(readFileSync(f, 'utf8'))
  // Path diambil sampai pemisah yang PASTI mengakhirinya — bukan sampai
  // kutip berikutnya. Sebabnya: template literal seperti
  //   `/api/v1/cecep/resources?q=${encodeURIComponent(q)}&limit=20`
  // memuat kutip DI DALAM interpolasinya, jadi `[^`'"]+` berhenti terlalu
  // cepat dan menyisakan potongan yang tak pernah cocok.
  //
  // Berhenti di `?` sudah cukup: yang dibandingkan hanyalah bagian path.
  // Kumpulkan SEMUA literal berawalan `/api/`, tanpa memeriksa apakah ia
  // argumen `api.get(...)`.
  //
  // Tiga percobaan berbasis konteks gagal berturut-turut, masing-masing
  // karena bentuk penulisan yang sah:
  //   `<[^>]*>` berhenti di `>` pertama dari `Array<{ id: string }>`
  //   `[^`'"]+` berhenti di kutip DI DALAM `${encodeURIComponent(q)}`
  //   `[\s\S]{0,220}` tak cukup untuk tipe generik yang panjang
  //
  /*
    Komentar SUDAH dibuang di atas (`tanpaKomentar`), jadi catatan lama di
    sini — "tak bisa membedakan path yang dipanggil dari path yang cuma
    disebut di komentar, itu diterima" — sudah tak berlaku. Catatan itu
    terbukti keliru: ia menghasilkan 17 laporan palsu (lihat `tanpaKomentar`).

    Yang MASIH belum dibedakan: path di dalam string biasa yang bukan
    pemanggilan. Itu tetap diterima, karena kerugiannya hanya satu path ekstra
    yang diperiksa — bukan satu path yang dilaporkan HILANG.
  */
  for (const m of isi.matchAll(/[`'"](\/api\/v\d[^`'"?\s]*)/g)) {
    /*
      Potongan yang berhenti DI TENGAH interpolasi dibuang.

      `/api/v1/procurement/stocks${projectFilter` bukan path — ia hasil regex
      yang berhenti sebelum `}`. Lima laporan palsu 2026-08-27 berbentuk
      begini, semuanya dari halaman procurement yang kodenya benar.

      `norm()` mengubah `${…}` UTUH jadi `*`; yang tersisa berisi `${` berarti
      kurungnya tak pernah tertutup di dalam potongan itu.
    */
    if (m[1].includes('${')) continue
    /*
      Path yang diakhiri `/` adalah AWALAN, bukan endpoint.

      `invalidasi("/api/v1/cash/")` membuang seluruh cache yang berawalan itu —
      garis miringnya SENGAJA, supaya `/cash/accounts` dan `/cash/summary` ikut
      terbuang tanpa ikut membuang `/cash-flow`. Semantiknya tertulis di nama
      test `data-cache.test.ts`: "invalidasi berawalan membuang yang cocok
      saja".

      `norm()` melucuti garis miring akhir, jadi awalan itu menjadi
      `/api/v1/cash` — rute yang memang tak pernah ada, dan dilaporkan hilang
      2026-08-27 di dua halaman portal yang kodenya benar.
    */
    if (m[1].endsWith('/')) continue
    const p = norm(m[1])
    if (!dipakai.has(p)) dipakai.set(p, [])
    dipakai.get(p).push(f.split(sep).join('/'))
  }
}

// Path yang berakhir `*` dirangkai dinamis — mis. `/cecep/resources${q}`
// dengan `q` memuat query string utuh. Ia dianggap cocok bila ada rute
// terdaftar yang berawalan sama.
//
// Ini melonggarkan pemeriksaan, dan itu disengaja: alternatifnya adalah satu
// positif palsu permanen, yang membuat orang terbiasa mengabaikan keluaran
// alat ini. Penjaga yang selalu merah sama tak bergunanya dengan yang selalu
// hijau.
const cocok = (p) => {
  if (TERDAFTAR.has(p)) return true
  if (!p.endsWith('*')) return false
  const awalan = p.slice(0, -1)
  return [...TERDAFTAR].some((t) => t === awalan || t.startsWith(awalan))
}

const hilang = [...dipakai.entries()].filter(([p]) => !cocok(p))

console.log(`Rute terdaftar di API : ${TERDAFTAR.size}`)
console.log(`Path dipakai di web   : ${dipakai.size}`)

if (hilang.length) {
  console.log(`\n❌ ${hilang.length} path menunjuk rute yang TIDAK ADA:\n`)
  for (const [p, berkas] of hilang) {
    console.log(`  ${p}`)
    for (const b of [...new Set(berkas)].slice(0, 3)) console.log(`     ${b}`)
    // Tawarkan kandidat terdekat — kesalahan ini hampir selalu awalan yang
    // hilang, dan menyebutkan kandidatnya memangkas waktu cari.
    const ekor = p.split('/').pop()
    const mirip = [...TERDAFTAR].filter((t) => t.endsWith('/' + ekor)).slice(0, 2)
    if (mirip.length) console.log(`     mungkin maksudnya: ${mirip.join('  ·  ')}`)
  }
  process.exit(1)
}

console.log('\n✓ Semua path API di web menunjuk rute yang terdaftar.')
