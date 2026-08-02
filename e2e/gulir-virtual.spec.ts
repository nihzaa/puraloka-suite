import { test, expect, type Page } from '@playwright/test'

// ═════════════════════════════════════════════════════════════════════════════
// `useVirtualList` — dua invarian yang jsdom secara struktural TAK BISA jaga.
//
// `apps/web/lib/use-virtual-list.test.tsx` mencatatnya sendiri (baca §"BATAS
// yang diketahui"): uji mutasi di sana menemukan bahwa mengubah `padTop` jadi
// `mulai * tinggiBaris * 2` dan melepas `Math.max(0, …)` dari `padBottom`
// KEDUANYA lolos — karena di jsdom `scrollTop` selalu 0, jadi `mulai` juga 0,
// dan `0 × 2` tetap 0.
//
// File ini menutup dua celah itu dengan menggulir SUNGGUHAN.
//
// ── Kenapa ini penting untuk orang yang memakainya
//
// Katalog AHSP 3.043 analisa. Jendela yang meleset berarti baris HILANG dari
// layar — dan orang tak melihat baris yang hilang, mereka menyimpulkan
// "datanya tak ada" lalu berhenti mencari. Pada RAB itu berarti item pekerjaan
// yang tak pernah diisi harganya.
// ═════════════════════════════════════════════════════════════════════════════

const TINGGI_BARIS = 40
const JUMLAH = 1000

/** Baca nilai hook dari atribut data pada halaman uji. */
async function nilai(page: Page) {
  const el = page.locator('[data-uji="nilai"]')
  const angka = async (n: string) => Number(await el.getAttribute(n))
  return {
    mulai: await angka('data-mulai'),
    akhir: await angka('data-akhir'),
    padTop: await angka('data-pad-top'),
    padBottom: await angka('data-pad-bottom'),
  }
}

/** Gulir viewport ke `y` piksel, tunggu hook selesai bereaksi. */
async function gulirKe(page: Page, y: number) {
  await page.locator('[data-uji="viewport"]').evaluate(
    (el, top) => { el.scrollTop = top },
    y,
  )
  // Hook memperbarui state lewat event `scroll`. Menunggu nilainya benar-benar
  // berubah, bukan menunggu durasi tetap — durasi tetap membuat test rapuh di
  // mesin yang lebih lambat.
  await expect
    .poll(async () => (await nilai(page)).mulai, { timeout: 5000 })
    .toBeGreaterThan(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/uji-gulir')
  await expect(page.locator('[data-uji="viewport"]')).toBeVisible()
})

test('jendela BERGESER saat digulir — bukan diam di baris awal', async ({ page }) => {
  // Prasyarat semua test lain di file ini: kalau `scrollTop` tak mengalir ke
  // hook, sisa test hanya mengulang apa yang sudah dijaga jsdom.
  const awal = await nilai(page)
  expect(awal.mulai, 'sebelum digulir, jendela harus mulai dari 0').toBe(0)

  await gulirKe(page, 4000) // 100 baris ke bawah

  const sesudah = await nilai(page)
  expect(
    sesudah.mulai,
    'jendela tak bergeser saat digulir — daftar menampilkan baris yang sama ' +
      'sejauh apa pun orang menggulir',
  ).toBeGreaterThan(50)
})

test('padTop = mulai × tinggiBaris — baris tak melompat saat digulir', async ({ page }) => {
  // Invarian #1 yang tak terjaga di jsdom. Kalau `padTop` meleset dari posisi
  // sesungguhnya, isi daftar bergeser relatif terhadap scrollbar: orang
  // menggulir ke tengah dan melihat baris dari tempat lain.
  await gulirKe(page, 4000)

  const { mulai, padTop } = await nilai(page)
  expect(
    padTop,
    `padTop (${padTop}) tak sama dengan mulai × tinggiBaris (${mulai * TINGGI_BARIS}) — ` +
      'isi daftar bergeser relatif terhadap posisi gulir',
  ).toBe(mulai * TINGGI_BARIS)
})

test('padBottom tak pernah NEGATIF, bahkan di ujung daftar', async ({ page }) => {
  // Invarian #2. `Math.max(0, …)` yang menjaganya tak pernah teruji di jsdom
  // karena di sana nilainya selalu 0 sejak awal.
  await gulirKe(page, JUMLAH * TINGGI_BARIS) // paksa ke paling bawah

  const { padBottom, akhir } = await nilai(page)
  expect(padBottom, 'padding bawah negatif — tinggi daftar menyusut secara visual').toBeGreaterThanOrEqual(0)
  expect(akhir, '`akhir` melewati jumlah data').toBeLessThanOrEqual(JUMLAH)
})

test('tinggi total tetap utuh sesudah digulir — scrollbar tak berubah panjang', async ({ page }) => {
  // Invarian yang menjaga scrollbar: padTop + baris dirender + padBottom harus
  // selalu sama dengan tinggi seluruh daftar. Kalau meleset, panjang scrollbar
  // berubah-ubah saat menggulir dan posisi gulir melompat sendiri.
  await gulirKe(page, 12_000)

  const { mulai, akhir, padTop, padBottom } = await nilai(page)
  expect(
    padTop + (akhir - mulai) * TINGGI_BARIS + padBottom,
    'tinggi total berubah saat digulir — scrollbar berubah panjang dan posisi ' +
      'gulir melompat sendiri',
  ).toBe(JUMLAH * TINGGI_BARIS)
})

test('baris yang dirender cocok dengan jendela yang dilaporkan', async ({ page }) => {
  // Nilai hook bisa saja benar sementara yang DIRENDER berbeda. Ini
  // memeriksa DOM sungguhan, bukan angka yang dilaporkan hook.
  await gulirKe(page, 4000)

  const { mulai, akhir } = await nilai(page)
  const baris = page.locator('[data-uji="baris"]')

  expect(await baris.count(), 'jumlah baris dirender tak sama dengan lebar jendela').toBe(akhir - mulai)
  expect(
    Number(await baris.first().getAttribute('data-indeks')),
    'baris pertama yang dirender bukan `mulai` — isi daftar tak cocok dengan posisi gulir',
  ).toBe(mulai)
})
