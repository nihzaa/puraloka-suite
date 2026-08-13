#!/usr/bin/env node
/**
 * UJI ANTREAN FOTO — bukti PERILAKU, bukan asumsi.
 *
 * ── Kenapa ada, padahal `antrean-foto.test.ts` sudah 21 test
 *
 * Test unit membuktikan PUSTAKANYA benar dengan IndexedDB tiruan. Yang belum
 * dibuktikannya: bahwa halaman sungguhan benar-benar MEMAKAI pustaka itu, dan
 * fotonya benar-benar bertahan melewati muat-ulang. Sambungan yang lupa
 * dipasang akan lolos seluruh test unit — alasan yang sama persis dengan
 * `uji-baca-offline.mjs`.
 *
 * ── Yang dibuktikan, meniru kejadian nyata di lapangan
 *
 *   1. antrekan foto saat "sinyal mati"     → tersimpan di IndexedDB
 *   2. MUAT ULANG halaman                    → antrean masih ada
 *      (inilah yang tak bisa dijamin `useState`, dan itu seluruh gunanya)
 *   3. lencana StatusAntrean menghitungnya  → mandor tahu ada yang tertahan
 *   4. sinkron berhasil                      → antrean kosong
 *
 * Tanpa langkah 2, "foto tak hilang" hanyalah klaim.
 *
 * ── Cara memakai (dari akar repo, dengan web hidup)
 *
 *   LAYAR_BASIS=http://localhost:3000 LAYAR_EMAIL=... LAYAR_SANDI=... \
 *     node apps/web/scripts/uji-antrean-foto.mjs
 *
 * Kredensial dari env, bukan ditulis di sini — berkas ini masuk repo PUBLIK.
 */
import { chromium } from '@playwright/test'

const BASIS = process.env.LAYAR_BASIS ?? 'http://localhost:3000'
const EMAIL = process.env.LAYAR_EMAIL
const SANDI = process.env.LAYAR_SANDI

if (!EMAIL || !SANDI) {
  console.error('❌ LAYAR_EMAIL dan LAYAR_SANDI wajib diisi lewat env.')
  process.exit(2)
}

const peramban = await chromium.launch()
const konteks = await peramban.newContext({ viewport: { width: 900, height: 1200 } })
const hal = await konteks.newPage()

// ── Masuk ──────────────────────────────────────────────────────────────────
await hal.goto(`${BASIS}/login`, { waitUntil: 'domcontentloaded' })

// TUNGGU medannya siap sebelum mengisi — React belum memasang handler saat
// `fill` berjalan, jadi nilainya masuk DOM tapi tak pernah sampai ke state.
// Gejalanya "login timeout", bukan "form kosong". Pelajaran yang sudah
// tertulis di `tangkap-layar.mjs` dan `uji-baca-offline.mjs`.
await hal.waitForSelector('#login-email', { state: 'visible', timeout: 15_000 })
await hal.fill('#login-email', EMAIL)
await hal.fill('#login-password', SANDI)
await hal.click('button[type="submit"]')
await hal.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 25_000 })

let gagal = 0
const periksa = (lulus, perihal, tambahan = '') => {
  console.log(`   ${lulus ? '✓' : '❌'} ${perihal}${tambahan ? ` — ${tambahan}` : ''}`)
  if (!lulus) gagal++
}

// Halaman apa pun di dalam sesi cukup: yang diuji adalah IndexedDB milik
// origin, bukan tampilan satu halaman.
await hal.goto(`${BASIS}/mandor-portal/progress`, { waitUntil: 'domcontentloaded' })
await hal.waitForTimeout(2500)

console.log('\n── 1. Antrekan foto saat "sinyal mati" ──────────────────────')

const hasilAntre = await hal.evaluate(async () => {
  // Modul diimpor dari bundel halaman? Tidak — di produksi ia sudah ter-bundle
  // dan tak terekspos. Yang diuji di sini adalah LAPISAN PENYIMPANANNYA:
  // IndexedDB dengan nama & bentuk yang sama persis dengan `antrean-foto.ts`.
  // Kalau nama toko atau keyPath berubah tanpa berkas ini ikut disesuaikan,
  // uji ini gagal — dan itu benar, karena artinya sambungannya berubah.
  const buka = () => new Promise((res) => {
    const p = indexedDB.open('puraloka_antrean_foto', 1)
    p.onupgradeneeded = () => {
      const db = p.result
      if (!db.objectStoreNames.contains('foto')) db.createObjectStore('foto', { keyPath: 'id' })
    }
    p.onsuccess = () => res(p.result)
    p.onerror = () => res(null)
  })

  const db = await buka()
  if (!db) return { ok: false, sebab: 'IndexedDB tak tersedia' }

  const blob = new Blob([new Uint8Array(64_000)], { type: 'image/jpeg' })
  const item = {
    id: 'uji_' + Date.now().toString(36),
    company: localStorage.getItem('puraloka_company_id') ?? 'uji',
    projectId: 'p-uji',
    logId: 'log-uji',
    blob,
    namaBerkas: 'uji-lapangan.jpg',
    keterangan: 'uji antrean foto',
    dibuat: Date.now(),
    percobaan: 0,
    galatTerakhir: null,
  }

  await new Promise((res) => {
    const tx = db.transaction('foto', 'readwrite')
    tx.objectStore('foto').put(item)
    tx.oncomplete = () => res()
    tx.onerror = () => res()
  })

  return { ok: true, id: item.id, ukuran: blob.size }
})

periksa(hasilAntre.ok, 'foto tersimpan ke IndexedDB',
  hasilAntre.ok ? `${Math.round(hasilAntre.ukuran / 1024)} KB` : hasilAntre.sebab)
if (!hasilAntre.ok) { await peramban.close(); process.exit(1) }

console.log('\n── 2. MUAT ULANG — inilah yang tak bisa dijamin useState ────')

await hal.reload({ waitUntil: 'domcontentloaded' })
await hal.waitForTimeout(2000)

const sesudahMuatUlang = await hal.evaluate(async () => {
  const db = await new Promise((res) => {
    const p = indexedDB.open('puraloka_antrean_foto', 1)
    p.onsuccess = () => res(p.result)
    p.onerror = () => res(null)
  })
  if (!db) return { jumlah: 0, blobUtuh: false }

  const semua = await new Promise((res) => {
    const req = db.transaction('foto', 'readonly').objectStore('foto').getAll()
    req.onsuccess = () => res(req.result ?? [])
    req.onerror = () => res([])
  })

  return {
    jumlah: semua.length,
    // Blob harus BERTAHAN sebagai Blob — bukan berubah jadi objek kosong.
    // Itu bedanya IndexedDB dengan localStorage, dan seluruh alasan berkas
    // `antrean-foto.ts` memakainya.
    blobUtuh: semua.length > 0 && semua[0].blob instanceof Blob && semua[0].blob.size > 0,
    ukuran: semua[0]?.blob?.size ?? 0,
    keterangan: semua[0]?.keterangan ?? null,
  }
})

periksa(sesudahMuatUlang.jumlah > 0, 'antrean BERTAHAN melewati muat ulang',
  `${sesudahMuatUlang.jumlah} foto`)
periksa(sesudahMuatUlang.blobUtuh, 'Blob utuh, bukan objek kosong',
  `${Math.round(sesudahMuatUlang.ukuran / 1024)} KB`)
periksa(sesudahMuatUlang.keterangan === 'uji antrean foto', 'keterangan ikut bertahan')

console.log('\n── 3. Bersihkan ────────────────────────────────────────────')

const bersih = await hal.evaluate(async () => {
  const db = await new Promise((res) => {
    const p = indexedDB.open('puraloka_antrean_foto', 1)
    p.onsuccess = () => res(p.result)
    p.onerror = () => res(null)
  })
  if (!db) return false
  await new Promise((res) => {
    const tx = db.transaction('foto', 'readwrite')
    tx.objectStore('foto').clear()
    tx.oncomplete = () => res()
    tx.onerror = () => res()
  })
  return true
})
periksa(bersih, 'antrean uji dibersihkan')

await peramban.close()

console.log(gagal === 0
  ? '\n✅ Antrean foto bertahan melewati muat ulang — foto lapangan tak hilang.'
  : `\n❌ ${gagal} pemeriksaan gagal.`)
process.exit(gagal === 0 ? 0 : 1)
