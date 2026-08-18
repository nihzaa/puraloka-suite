import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Pembersihan antar-test.
 *
 * ⚠️ Tanpa ini, komponen dari test SEBELUMNYA tetap terpasang di DOM — dan
 * `useTutupEsc` memasang penangan di `document`, jadi modal test #1 masih
 * mendengarkan Esc saat test #2 berjalan. Kegagalannya akan menuduh KODE
 * padahal yang bocor adalah antar-test.
 *
 * Kelas kesalahan itu sudah terjadi sekali di repo ini (`notifications-push.test.ts`,
 * 2026-08-01) dan mahal: ia mengirim orang memperbaiki hal yang tak rusak.
 */
afterEach(() => {
  cleanup()
})

/**
 * Polyfill `<dialog>` untuk jsdom.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PERLU, DAN KENAPA KEGAGALANNYA MENYESATKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * jsdom belum mengimplementasikan `HTMLDialogElement.showModal()`. Setiap
 * komponen yang memakai `DialogBersama` — dan itu SELURUH modal di aplikasi
 * ini — gagal dengan `d.showModal is not a function`.
 *
 * Yang berbahaya bukan kegagalannya, melainkan BENTUKNYA: 8 test
 * `tagihan-co.test.tsx` merah dengan pesan yang tak menyebut jsdom sama
 * sekali. Diukur 2026-08-17, kegagalan itu sempat saya baca sebagai
 * "fiturnya rusak" — padahal komponen, endpoint, tombol, dan modalnya utuh.
 * Test yang gagal karena lingkungannya menuduh kode yang baik-baik saja.
 *
 * ── Kenapa polyfill, bukan mengubah komponennya
 *
 * `showModal()` yang memberi fokus terkunci dan lapisan teratas; atribut
 * `open` saja tidak. Mengganti komponen demi test berarti yang diuji bukan
 * lagi yang dipakai orang.
 *
 * Sengaja MINIM: hanya membuka/menutup + `returnValue`. Menirukan seluruh
 * perilaku dialog (fokus terkunci, backdrop, tumpukan) akan jadi
 * implementasi kedua yang pelan-pelan berbeda dari peramban — dan test yang
 * lolos di implementasi tiruan tak membuktikan apa pun tentang yang asli.
 */
if (typeof HTMLDialogElement !== 'undefined'
  && typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, nilai?: string) {
    this.open = false
    if (nilai !== undefined) this.returnValue = nilai
    // `close` event DIBANGKITKAN — komponen yang membersihkan diri di
    // penangan `close` (dan `DialogBersama` melakukannya) tak akan pernah
    // terpanggil tanpa ini, jadi kebocoran antar-test kembali muncul lewat
    // pintu lain.
    this.dispatchEvent(new Event('close'))
  }
}
