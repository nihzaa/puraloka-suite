#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// BUKTI PERILAKU — sidebar disiplin: tepat SATU link aktif, induknya terbuka.
//
// ── Kenapa ini yang diuji
//
// Founder 2026-08-07:
//
//   "ketika 1 halaman dibuka, link di sidebarnya harus aktif dan menu induknya
//    terbuka, tapi kalo link sidebar yg aktifnya 2 kan jadi aneh."
//
// Dua hal yang tak bisa dijawab unit test maupun SQL:
//
//   1. berapa BANYAK link menyala saat satu halaman dibuka — jawabannya harus
//      tepat 1, tidak 0 dan tidak 2
//   2. apakah kelompok induknya IKUT TERBUKA, sehingga link aktifnya terlihat
//      tanpa pemakai harus membuka kelompok itu sendiri
//
// Migrasi 232 menjamin satu route = satu link DI DATA. Skrip ini membuktikan
// jaminan itu benar-benar sampai ke layar.
//
// ── Kenapa `aria-current`, bukan warna
//
// Warna latar dan garis bawah tak bisa dibaca skrip maupun pembaca layar.
// `aria-current="page"` adalah satu-satunya penanda yang berarti bagi keduanya
// — dan itu sebabnya ia ditambahkan ke sidebar pada hari yang sama.
//
// Pakai (dari apps/web, butuh server :3000 & :3001 hidup):
//   LAYAR_EMAIL=... LAYAR_SANDI=... node scripts/uji-sidebar-disiplin.mjs
//
// Kredensial LEWAT ENV, tidak pernah ditulis ke berkas — repo ini publik.
// ════════════════════════════════════════════════════════════════════════════
import { chromium } from '@playwright/test'

const BASIS = 'http://localhost:3000'

// Sengaja mencakup semua bentuk: item lepas (Beranda), anak kelompok satu
// segmen, anak kelompok dua segmen, dan sub-menu yang dibedakan query.
//
// `/jadwal` polos TIDAK diuji: sesudah migrasi 233 halaman itu tak lagi punya
// link tanpa query — ketiga modulnya (CPM, histogram, method) masing-masing
// punya linknya sendiri. Membukanya langsung tanpa `?bagian=` memang tak
// menyalakan apa pun, dan itu benar: tak ada menu yang menunjuk ke sana.
const HALAMAN = [
  '/dashboard',
  '/proyek',
  '/keuangan/invoice',
  '/procurement/pesanan',
  '/mandor/upah',
  '/lapangan/inspeksi',
  '/pengaturan/roles',
  '/peta-modul',
  // Sub-menu yang alamatnya dibedakan query (migrasi 233). Inilah yang paling
  // rawan: dua link ke halaman yang sama, dibedakan hanya oleh `?bagian=`.
  '/dokumen/kendali?bagian=notulen',
  '/dokumen/kendali?bagian=transmittal',
  '/akuntansi?tab=besar',
  '/jadwal?bagian=histogram',
  '/kepatuhan?bagian=evaluasi',
]

const peramban = await chromium.launch()
const konteks = await peramban.newContext({ viewport: { width: 1440, height: 950 } })
const hal = await konteks.newPage()

await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })
await hal.waitForSelector('#login-email', { timeout: 60_000 })
await hal.fill('#login-email', process.env.LAYAR_EMAIL)
await hal.fill('#login-password', process.env.LAYAR_SANDI)
await hal.click('button[type=submit]')
await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90_000 })

let gagal = 0

for (const rute of HALAMAN) {
  await hal.goto(`${BASIS}${rute}`, { waitUntil: 'networkidle', timeout: 60_000 })
  await hal.waitForTimeout(1100)

  const hasil = await hal.evaluate(() => {
    const sisi = document.querySelector('aside') ?? document.body
    const aktif = [...sisi.querySelectorAll('a[aria-current="page"]')]
    return {
      jumlah: aktif.length,
      href: aktif.map((a) => a.getAttribute('href')),
      // Terlihat = benar-benar punya ukuran di layar. Submenu grup tertutup
      // tetap ada di DOM (untuk diukur tingginya), jadi memeriksa
      // keberadaannya saja akan selalu hijau — dan itu lolos palsu.
      terlihat: aktif.map((a) => {
        const r = a.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }),
    }
  })

  const satu = hasil.jumlah === 1
  const tampak = hasil.terlihat.every(Boolean) && hasil.terlihat.length > 0
  const benar = hasil.href[0] === rute

  const tanda = satu && tampak && benar ? '✅' : '❌'
  console.log(`  ${tanda} ${rute.padEnd(24)} aktif=${hasil.jumlah} terlihat=${tampak ? 'ya' : 'TIDAK'} href=${hasil.href.join(',') || '—'}`)

  if (!satu) console.log(`       ↳ harus TEPAT 1 link aktif, dapat ${hasil.jumlah}`)
  else if (!tampak) console.log('       ↳ link aktifnya ada tapi TERSEMBUNYI — kelompok induknya tak terbuka')
  else if (!benar) console.log(`       ↳ yang menyala ${hasil.href[0]}, bukan ${rute}`)

  if (!(satu && tampak && benar)) gagal++
}

await peramban.close()
console.log(gagal === 0
  ? `\n✅ ${HALAMAN.length} halaman: tepat satu link aktif, induknya terbuka\n`
  : `\n❌ ${gagal} dari ${HALAMAN.length} gagal\n`)
process.exit(gagal === 0 ? 0 : 1)
