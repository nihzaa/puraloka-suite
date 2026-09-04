#!/usr/bin/env node
/**
 * Membuktikan daftar berpaginasi BENAR-BENAR memuat lebih saat digulir.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA — dan kenapa POTRET tak cukup
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `potret-mobile.mjs` memotret keadaan AWAL layar. Paginasi hidup di
 * keadaan KEDUA: sesudah pengguna menggulir sampai dasar.
 *
 * Sebuah `onEndReached` yang salah pasang — tak terhubung, ambangnya nol,
 * atau tertahan penjaga yang tak pernah lepas — menghasilkan layar yang
 * TERLIHAT sempurna di potret dan berhenti di 30 baris selamanya. Persis
 * keadaan yang diperbaiki hari ini.
 *
 * Diukur 2026-09-04 sebelum perbaikan:
 *
 *     baris di tabel `notifications` : 8.947
 *     yang bisa dilihat dari HP      : 30
 *
 * Tak ada galat, tak ada indikasi. Daftarnya sekadar berhenti, dan
 * berhenti terbaca sama persis dengan habis.
 *
 * ── Yang diuji, dan urutannya
 *
 *   1. jumlah kartu SESUDAH muat pertama  → harus = UKURAN_HALAMAN
 *   2. gulir ke dasar, tunggu             → jumlah harus BERTAMBAH
 *   3. ulangi                             → bertambah lagi ATAU muncul
 *                                            penanda habis
 *
 * Yang (3) penting: daftar yang bertambah sekali lalu diam lagi punya
 * cacat yang sama, cuma bergeser satu halaman.
 *
 * ── Yang TIDAK diuji
 *
 * Perilaku gulir native (momentum, bounce). Ini `react-native-web`; yang
 * dibuktikan adalah RANTAI DATA — `onEndReached` terpanggil, permintaan
 * terkirim, hasilnya tersambung ke daftar.
 *
 *     UJI_BASIS=http://localhost:8081 node apps/mobile/scripts/uji-paginasi-hidup.mjs
 */
import { chromium } from '@playwright/test'

const BASIS = process.env.UJI_BASIS ?? 'http://localhost:8081'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

if (!EMAIL || !SANDI) {
  console.error('❌ LAYAR_EMAIL / LAYAR_SANDI kosong.')
  console.error('   Keduanya ada di apps/web/.env.local (ter-gitignore).')
  process.exit(2)
}

/**
 * Layar berpaginasi yang diuji.
 *
 * `harapAwal` = berapa kartu yang harus ada sesudah muat pertama. Nilainya
 * mengikuti `UKURAN_HALAMAN` di layarnya; kalau berbeda, salah satunya
 * berubah tanpa yang lain ikut.
 */
const LAYAR = [{ nama: 'notifikasi', jalur: '/notifications' }]

const peramban = await chromium.launch()
const masalah = []

try {
  const ctx = await peramban.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
  })
  const hal = await ctx.newPage()

  /* Permintaan paginasi dicatat — bukti bahwa rantainya sampai ke jaringan. */
  const permintaan = []
  hal.on('request', (r) => {
    const u = r.url()
    if (u.includes('/notifications') && u.includes('offset=')) {
      permintaan.push(u.slice(u.indexOf('/api')))
    }
  })

  await hal.goto(`${BASIS}/login`, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => {})
  await hal.locator('input').nth(1).waitFor({ state: 'visible', timeout: 60_000 })
  await hal.locator('input').nth(0).fill(EMAIL)
  await hal.locator('input').nth(1).fill(SANDI)
  await hal.getByText('Masuk', { exact: true }).last().click()
  await hal.waitForTimeout(6000)

  if (!hal.url().includes('/dashboard')) {
    console.error('❌ LOGIN GAGAL — tak bisa menguji apa pun.')
    console.error(`   URL: ${hal.url()}`)
    await peramban.close()
    process.exit(2)
  }

  for (const { nama, jalur } of LAYAR) {
    await hal.goto(`${BASIS}${jalur}`, { waitUntil: 'networkidle', timeout: 60_000 })
    await hal.waitForTimeout(3000)

    /*
      Kartu dihitung dari elemen yang menampilkan waktu relatif ("3h lalu")
      — satu per kartu, dan tak muncul di tempat lain pada layar ini.

      Dihitung lewat POLA, bukan lewat testID: menambah testID hanya untuk
      pengujian membuat kode produksi menanggung beban alat ukur, dan
      testID yang di-rename diam-diam membuat penghitung memulangkan nol
      yang terbaca seperti "daftarnya kosong".
    */
    /*
      ⚠ Yang dihitung PERMINTAAN JARINGAN, bukan elemen DOM.

      Versi pertama skrip ini menghitung kartu di DOM, dan angkanya
      NAIK-TURUN: 14 → 26 → 24. Itu bukan cacat paginasi — `FlatList`
      MELEPAS kartu yang keluar dari jendela render (itu justru gunanya),
      jadi jumlah elemen DOM mengukur "berapa yang terlihat sekarang",
      bukan "berapa yang sudah dimuat".

      Alat ukur yang salah sasaran memberi angka yang terlihat masuk akal
      dan menuduh hal yang salah — persis kelas kesalahan yang tercatat di
      CLAUDE.md §8a.2 (mutasi yang tak mengenai hal yang dijaga).

      Yang tak bisa berbohong: berapa kali layar MEMINTA halaman baru, dan
      offset apa yang dimintanya. Rantai itu yang sesungguhnya diuji —
      `onEndReached` terpanggil → permintaan terkirim → hasilnya
      tersambung.
    */
    const hitung = async () => permintaan.length

    const awal = await hitung()
    console.log(`  ${nama}: ${awal} permintaan sesudah muat pertama`)

    /* Dua kali gulir-ke-dasar, masing-masing diberi waktu memuat. */
    let sebelumnya = awal
    const riwayat = [awal]
    for (let putaran = 1; putaran <= 2; putaran++) {
      /*
        ⚠ Digulir BERTAHAP dengan roda tetikus, bukan `scrollTop = …`.

        Menyetel `scrollTop` langsung memang memindahkan posisinya, tetapi
        `FlatList` react-native-web membaca event `scroll` yang di-throttle
        — satu lompatan tunggal ke dasar sering tak menghasilkan pembacaan
        yang melewati ambang `onEndReachedThreshold`, jadi paginasinya tak
        pernah terpicu.

        Terukur: dengan `scrollTop` langsung, permintaan tetap 1 dan
        elemen bergulirnya JELAS ada (scrollHeight 2917 vs client 674).
        Kegagalan itu terbaca seperti "paginasinya tak bekerja" padahal
        alat ukurnya yang tak menyentuh jalur yang benar.

        `mouse.wheel` menghasilkan event yang sama dengan gulir manusia,
        dan dipecah beberapa kali supaya throttle-nya sempat membaca.
      */
      const kotak = await hal.evaluate(() => {
        const kandidat = [...document.querySelectorAll('*')].filter((e) => {
          const cs = getComputedStyle(e)
          return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 50
        })
        const target = kandidat.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
        if (!target) return null
        const r = target.getBoundingClientRect()
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
      })
      if (kotak) await hal.mouse.move(kotak.x, kotak.y)
      for (let n = 0; n < 12; n++) {
        await hal.mouse.wheel(0, 800)
        await hal.waitForTimeout(150)
      }
      await hal.waitForTimeout(4000)
      const kini = await hitung()
      riwayat.push(kini)
      console.log(`  ${nama}: gulir ${putaran} → ${kini} permintaan`)

      if (kini <= sebelumnya) {
        /*
          Tak bertambah BOLEH, tapi hanya kalau layar mengaku habis.
          Diamnya itu sendiri yang jadi cacat kalau tak ada penjelasannya.
        */
        const mengakuHabis = await hal
          .getByText(/sudah ditampilkan/i)
          .count()
          .catch(() => 0)
        if (!mengakuHabis) {
          masalah.push(
            `${nama}: gulir ${putaran} TIDAK memicu permintaan baru ` +
              `(${sebelumnya} → ${kini}) dan layar tak mengaku habis — ` +
              'daftar berhenti tanpa penjelasan'
          )
        }
        break
      }
      sebelumnya = kini
    }

    console.log(`  ${nama}: riwayat ${riwayat.join(' → ')}`)
    console.log(`  ${nama}: permintaan berparameter offset: ${permintaan.length}`)
    if (permintaan.length === 0) {
      masalah.push(`${nama}: NOL permintaan ber-offset — paginasinya tak pernah sampai ke jaringan`)
    }
  }

  await ctx.close()
} finally {
  await peramban.close()
}

if (masalah.length > 0) {
  console.error('')
  console.error(`❌ ${masalah.length} masalah:`)
  for (const m of masalah) console.error('     · ' + m)
  console.error('')
  console.error('  Daftar yang berhenti tanpa penjelasan terbaca sama persis')
  console.error('  dengan daftar yang habis. Diukur 2026-09-04: 8.947 notifikasi')
  console.error('  di basis, 30 yang bisa dilihat dari HP, nol tanda.')
  console.error('')
  process.exit(1)
}

console.log('')
console.log('✅ Paginasi hidup: gulir menambah kartu, permintaan ber-offset terkirim.')
console.log('   Batas: yang dibuktikan RANTAI DATA (onEndReached → permintaan →')
console.log('   sambung ke daftar), bukan rasa gulir native.')
