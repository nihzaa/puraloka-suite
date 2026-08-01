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
