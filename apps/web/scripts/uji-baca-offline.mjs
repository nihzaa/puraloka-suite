#!/usr/bin/env node
/**
 * UJI BACA OFFLINE — bukti PERILAKU, bukan asumsi.
 *
 * ── Kenapa ada, padahal `cache-baca.test.ts` sudah 19 test
 *
 * Test unit membuktikan PUSTAKANYA benar dengan IndexedDB tiruan. Yang belum
 * dibuktikannya: bahwa halaman sungguhan benar-benar MEMAKAI pustaka itu, dan
 * pitanya benar-benar muncul di layar. Sambungan yang lupa dipasang akan
 * lolos seluruh test unit.
 *
 * ── Cara memakai (dari akar repo, dengan dev server hidup)
 *
 *   LAYAR_EMAIL=... LAYAR_SANDI=... node apps/web/scripts/uji-baca-offline.mjs
 *
 * Kredensial dari env, bukan ditulis di sini — berkas ini masuk repo PUBLIK.
 */
//
// Alurnya meniru kejadian nyata di lapangan:
//   1. buka halaman saat sinyal ADA  → data tersimpan ke IndexedDB
//   2. putus jaringan ke API         → muat ulang halaman
//   3. periksa: daftarnya MASIH ADA, dan pita penanda muncul
//
// Tanpa langkah 3, "cache berfungsi" hanyalah klaim.
import { chromium } from '@playwright/test'

const BASIS = 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

const HALAMAN = [
  { url: '/procurement/permintaan', nama: 'permintaan-material',
    penandaDaftar: 'MR-', perihal: 'Permintaan material' },
  { url: '/lapangan/inspeksi', nama: 'checklist-inspeksi',
    penandaDaftar: 'in-halaman', perihal: 'Daftar permintaan inspeksi' },
]

const peramban = await chromium.launch()
const konteks = await peramban.newContext({ viewport: { width: 1280, height: 900 } })
const hal = await konteks.newPage()

// ── Masuk ──────────────────────────────────────────────────────────────────
await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })

// TUNGGU medannya siap sebelum mengisi — pelajaran yang sudah tertulis di
// `tangkap-layar.mjs`: React belum memasang handler saat `fill` berjalan,
// jadi nilainya masuk ke DOM tapi tak pernah sampai ke state, dan tombol
// Masuk mengirim form KOSONG. Gejalanya "login timeout", bukan "form kosong".
await hal.waitForSelector('#login-email', { state: 'visible', timeout: 15_000 })
await hal.fill('#login-email', EMAIL)
await hal.fill('#login-password', SANDI)

const terisi = await hal.inputValue('#login-email')
if (terisi !== EMAIL) {
  console.error(`❌ Medan email tak terisi (isinya: "${terisi}") — bukan soal kredensial.`)
  await peramban.close()
  process.exit(2)
}

await hal.click('button[type="submit"]')
await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25_000 })
  .catch(async () => {
    const pesan = await hal.locator('[role="alert"]').first().textContent().catch(() => null)
    console.error(`❌ Login tak berpindah halaman.${pesan ? ` Pesan: ${pesan.trim()}` : ''}`)
  })

let gagal = 0
/** Halaman yang jalurnya tak bisa diuji karena datanya kosong — lihat blok PRASYARAT. */
let takTeruji = 0

for (const h of HALAMAN) {
  console.log(`\n── ${h.url} ─────────────────────────────────`)

  // ── 1. ONLINE: muat, biarkan cache terisi ────────────────────────────────
  await hal.goto(`${BASIS}${h.url}`, { waitUntil: 'networkidle', timeout: 30_000 })
  await hal.waitForTimeout(1500)

  /*
    PRASYARAT: halamannya harus BERISI saat online.

    Halaman berdaftar kosong menyimpan array kosong ke cache, dan saat offline
    ia benar TIDAK memasang pita — tak ada data lama untuk ditandai. Penjaga
    yang tetap menuntut pita di sana melaporkan MERAH untuk perilaku yang
    justru diinginkan.

    Terjadi 2026-08-13: `/procurement/permintaan` dilaporkan "data lama tampil
    tanpa peringatan", padahal diukur di peramban baris tabelnya NOL bahkan
    saat jaringan SEHAT — basis dev tak punya permintaan material sama sekali.

    Dilaporkan TAK TERUJI: bukan gagal, dan bukan hijau. Keduanya bohong, dan
    hijau palsu lebih berbahaya — ia menyatakan jalur offline sudah dijaga
    padahal tak pernah dijalankan sekali pun.
  */
  // `tbody tr` SAJA tidak cukup: percobaan pertama memakai itu, dan
  // `/lapangan/inspeksi` — yang jalur offline-nya justru sudah benar —
  // ikut tervonis TAK TERUJI. Diukur di peramban: ia merender 17 `<li>`,
  // nol `<tr>`. Penjaga yang mengenali satu bentuk daftar saja akan
  // memvonis halaman sehat setiap kali bentuknya berbeda.
  const barisOnline = await hal.evaluate(() =>
    document.querySelectorAll('tbody tr').length +
    document.querySelectorAll('main li').length)
  if (barisOnline === 0) {
    console.log('  ⚠ TAK TERUJI: daftar KOSONG saat online — tak ada data untuk di-cache.')
    console.log(`     Isi data uji untuk ${h.url}, lalu jalankan ulang.`)
    takTeruji++
    continue
  }

  const adaPitaSaatOnline = await hal.locator('[role=status]')
    .filter({ hasText: 'Data tersimpan' }).count()
  if (adaPitaSaatOnline === 0) {
    console.log('  ✅ online: TANPA pita penanda (data segar)')
  } else {
    console.log('  ❌ online: pita penanda MUNCUL padahal jaringan baik')
    gagal++
  }

  const jumlahCache = await hal.evaluate(async () => {
    return new Promise((resolve) => {
      const p = indexedDB.open('puraloka_cache_baca')
      p.onsuccess = () => {
        const db = p.result
        if (!db.objectStoreNames.contains('jawaban')) { db.close(); return resolve(0) }
        const t = db.transaction('jawaban', 'readonly')
        const c = t.objectStore('jawaban').count()
        c.onsuccess = () => { const n = c.result; db.close(); resolve(n) }
        c.onerror = () => { db.close(); resolve(-1) }
      }
      p.onerror = () => resolve(-1)
    })
  })
  if (jumlahCache > 0) {
    console.log(`  ✅ IndexedDB terisi: ${jumlahCache} jawaban tersimpan`)
  } else {
    console.log(`  ❌ IndexedDB TIDAK terisi (${jumlahCache}) — cache tak pernah menulis`)
    gagal++
  }

  // ── 2. OFFLINE: putus HANYA panggilan API, bukan aset halaman ────────────
  //
  // Memutus seluruh jaringan juga memutus JS/CSS Next.js, sehingga yang
  // teruji jadi "halaman gagal dimuat" — bukan "API gagal, cache dipakai".
  await hal.route('**/api/v1/**', (r) => r.abort('failed'))
  await hal.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
  await hal.waitForTimeout(2500)

  const pita = hal.locator('[role=status]').filter({ hasText: 'Data tersimpan' })
  const adaPita = await pita.count()
  if (adaPita > 0) {
    const teks = (await pita.first().innerText()).replace(/\s+/g, ' ').slice(0, 110)
    console.log(`  ✅ offline: pita penanda MUNCUL — "${teks}"`)
  } else {
    console.log('  ❌ offline: pita penanda TIDAK muncul — data lama tampil tanpa peringatan')
    gagal++
  }

  const isiHalaman = await hal.locator('body').innerText()
  if (isiHalaman.includes(h.penandaDaftar) || isiHalaman.length > 400) {
    console.log('  ✅ offline: daftarnya MASIH TERBACA, bukan layar kosong')
  } else {
    console.log('  ❌ offline: halaman kosong meski cache ada')
    gagal++
  }

  await hal.screenshot({
    path: `E:/Project/puraloka-suite/apps/web/.layar/offline-${h.nama}.png`,
    fullPage: true,
  })
  console.log(`  📷 offline-${h.nama}.png`)

  await hal.unroute('**/api/v1/**')
}

await peramban.close()

/*
  Halaman TAK TERUJI disebut TERPISAH, dan ikut menentukan kode keluar.

  Penjaga yang melaporkan "SEMUA LULUS" sambil diam-diam melewati separuh
  halamannya adalah kelas cacat yang sama dengan audit a11y yang melewati
  tujuh rute dinamis lalu melaporkan "0 pelanggaran" (2026-08-13). Angka
  hijau yang tak menyebut cakupannya bukan bukti apa-apa.

  Exit 3 — bukan 0, bukan 1: ini bukan kegagalan jalur offline, tapi juga
  bukan keberhasilan. Yang perlu diperbaiki adalah DATA UJI-nya, bukan kodenya.
*/
const sisipan = takTeruji > 0 ? `  ·  ${takTeruji} halaman TAK TERUJI (daftar kosong)` : ''

if (gagal > 0) {
  console.log(`\n❌ ${gagal} bukti GAGAL${sisipan}\n`)
  process.exit(1)
}

if (takTeruji > 0) {
  console.log(`\n⚠ Bukti yang JALAN semuanya lulus, tapi ${takTeruji} halaman TAK TERUJI`)
  console.log('  (daftarnya kosong saat online — isi data ujinya lalu jalankan ulang)\n')
  process.exit(3)
}

console.log('\n✅ SEMUA BUKTI OFFLINE LULUS\n')
process.exit(0)
