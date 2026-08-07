import type { Kategori, Media } from '@/lib/konten'

/**
 * Logika saring & navigasi portofolio — MURNI, tanpa React dan tanpa DOM.
 *
 * ── Kenapa dipisah dari komponennya
 *
 * Bagian yang bisa salah DIAM-DIAM di portofolio bukan render-nya, melainkan
 * aritmetika indeks: foto yang keliru muncul saat panah ditekan, atau saringan
 * yang menampilkan kategori lain. Keduanya tetap terlihat rapi di layar, jadi
 * tak ada yang tahu sampai seseorang membandingkan dengan aslinya.
 *
 * `apps/web-publik` memakai `environment: 'node'` tanpa React testing library
 * (diperiksa di `vitest.config.ts`). Fungsi murni bisa diuji apa adanya di
 * situ; komponennya tidak. Yang tak bisa diuji di sini — fokus terkunci, Esc,
 * fokus kembali ke pemicu — dibuktikan di peramban nyata.
 */

export type Petak = { media: Media; kunci: string; indeks: number }

/**
 * Petak yang terlihat, SUDAH membawa asal-usulnya.
 *
 * Mengembalikan `{ media, kunci, indeks }`, bukan `Media[]` telanjang: dialog
 * perlu tahu foto ini milik kategori mana dan urutan ke berapa DI DALAM
 * kategorinya, supaya panah kiri-kanan bergerak di dalam kategori itu.
 *
 * Percobaan pertama mencarinya kembali dengan `k.media.includes(m)` — itu
 * perbandingan REFERENSI objek. Ia bekerja hari ini karena `konten.kategori`
 * dilewatkan apa adanya, dan akan diam-diam gagal begitu datanya disalin,
 * di-serialisasi ulang, atau dinormalisasi. Asal-usul yang dibawa sejak awal
 * tak punya cara gagal seperti itu.
 */
export function petakTerlihat(kategori: Kategori[], saring: string | null): Petak[] {
  return kategori
    .filter((k) => !saring || k.kunci === saring)
    .flatMap((k) => k.media.map((media, indeks) => ({ media, kunci: k.kunci, indeks })))
}

/**
 * Indeks berikutnya, BERPUTAR.
 *
 * Berputar, bukan berhenti di ujung: panah yang mati di foto terakhir terbaca
 * sebagai tombol rusak, bukan sebagai batas.
 *
 * `((n % j) + j) % j`, bukan `(n + j) % j` saja. Di JavaScript `(0 - 1) % 1`
 * menghasilkan **-0**, dan indeks negatif mengembalikan `undefined` dari array
 * tanpa satu pun galat — dialog jadi kosong dan tak ada yang menjelaskan
 * kenapa. Pola dua-modulo ini selalu menghasilkan bilangan tak-negatif.
 */
export function geserIndeks(indeks: number, arah: 1 | -1, jumlah: number): number {
  if (jumlah <= 0) return 0
  const n = indeks + arah
  return ((n % jumlah) + jumlah) % jumlah
}
