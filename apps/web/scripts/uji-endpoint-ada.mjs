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
  const isi = readFileSync(f, 'utf8')

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
  const isi = readFileSync(f, 'utf8')
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
  // Pendekatan sederhana ini tak bisa membedakan path yang dipanggil dari
  // path yang cuma disebut di komentar. Itu diterima: kelebihan-tangkap
  // hanya berarti satu-dua path ekstra diperiksa, sedangkan yang dicari —
  // path yang TAK ADA padanannya di API — tetap ketahuan.
  for (const m of isi.matchAll(/[`'"](\/api\/v\d[^`'"?\s]*)/g)) {
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
