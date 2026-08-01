import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

/**
 * HARNESS TEST `apps/web` — sebelumnya TIDAK ADA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sisi API punya 1.215 test yang berjalan tiap CI. Sisi web punya NOL —
 * yang dijaga hanya bentuk kode (lint, tsc, ratchet a11y), bukan perilaku.
 *
 * Konsekuensinya nyata, bukan teoretis. Sepanjang 2026-08-01/02 dipasang:
 *   · `useTutupEsc` di 51 tempat — tak ada yang membuktikan Esc menutup
 *   · `dapatDitekan` di 7 tempat — tak ada yang membuktikan Enter/Space jalan
 *   · 40+ modal, 213 label, puluhan tombol
 *
 * Semua diverifikasi lewat lint dan pembacaan kode. Tak satu pun lewat
 * MENJALANKANNYA. Kalau besok seseorang menghapus `useTutupEsc(onClose)` saat
 * merapikan, lint tetap hijau (`modal-esc-ratchet` menangkap KEBERADAANNYA,
 * bukan efeknya) — dan modal kembali menjebak pemakai keyboard tanpa gejala.
 *
 * Itu persis kelas cacat yang sesi ini habiskan waktu memperbaiki di tempat
 * lain: kode yang benar menurut setiap pemeriksaan statis, tapi mati saat
 * dijalankan.
 *
 * ── Kenapa Vitest, bukan Jest
 *
 * Sisi API sudah memakai Vitest 3.2.7. Satu runner untuk dua workspace berarti
 * satu cara menjalankan, satu format laporan, satu hal yang perlu dipelajari
 * orang berikutnya. Jest akan menambah rantai konfigurasi kedua tanpa
 * memberi apa pun yang Vitest tak punya di sini.
 *
 * ── Kenapa `jsdom`, bukan browser sungguhan
 *
 * Yang diuji adalah perilaku komponen: penanganan papan tik, atribut ARIA,
 * cabang render. Semuanya hidup di DOM, dan jsdom menyediakannya tanpa
 * biaya menjalankan browser di tiap CI. Untuk yang benar-benar butuh browser
 * (tata letak, kontras nyata) repo ini sudah punya penjaga terpisah.
 */
/**
 * Menyelesaikan paket lewat RESOLUSI NODE, bukan menebak jalur `.pnpm`.
 *
 * ⚠️ Versi pertama menebak jalur (`node_modules/.pnpm/lucide-react@…`), dan
 * itu PECAH begitu `pnpm install` dijalankan ulang: struktur `.pnpm` berubah,
 * salinan lokal berpindah pohon, dan bug React-ganda kembali tanpa ada yang
 * menyentuh kode. Alat yang rusak oleh `pnpm install` bukan alat.
 *
 * `createRequire` memakai algoritma resolusi yang sama dengan Node dan
 * bundler Next.js — jadi apa pun yang di-resolve di sini adalah apa yang
 * benar-benar dipakai aplikasi.
 */
function jalurPaket(spesifier: string): string {
  return createRequire(import.meta.url).resolve(spesifier)
}

export default defineConfig({
  // ⚠️ TANPA `@vitejs/plugin-react`, dan itu disengaja.
  //
  // Versi 6.x-nya menuntut Vite 7 sementara Vitest 3.2.7 (versi yang dipakai
  // sisi API) membawa Vite 6 — memasangnya menghasilkan
  // ERR_PACKAGE_PATH_NOT_EXPORTED sebelum satu test pun berjalan. Menaikkan
  // Vitest ke 4.x hanya untuk plugin ini berarti dua workspace memakai runner
  // berbeda, dan itu harga yang lebih mahal daripada manfaatnya.
  //
  // Vitest sudah memproses JSX/TSX lewat esbuild bawaannya. Plugin React
  // dibutuhkan untuk Fast Refresh dan React Compiler — keduanya urusan dev
  // server, bukan test.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',

    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['{app,components,lib}/**/*.test.{ts,tsx}'],
    // `ds-bundle` adalah keluaran bundler yang di-gitignore; ia tak pernah
    // punya test dan memindainya hanya memperlambat.
    exclude: ['node_modules/**', '.next/**', 'ds-bundle/**'],
  },
  resolve: {
    conditions: ['browser', 'import', 'default'],
    // ⚠️ Bentuk ARRAY, bukan objek — urutannya load-bearing.
    //
    // Alias objek di Vite mencocokkan PREFIKS, jadi entri `react` menelan
    // `react/jsx-dev-runtime` sebelum entri spesifiknya sempat dievaluasi:
    // "Failed to resolve import react/jsx-dev-runtime". Bentuk array dicoba
    // berurutan, jadi sub-path yang lebih spesifik harus didaftarkan LEBIH
    // DULU dan `react` telanjang paling akhir.
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('.', import.meta.url)) },

      // ⚠️ React, react-dom, dan lucide-react DIPAKU ke satu pohon.
      //
      // Tanpa ini SETIAP komponen ber-ikon gagal `Cannot read properties of
      // null (reading 'useContext')` — errornya menuduh React, lalu menuduh
      // komponennya, keduanya salah alamat.
      //
      // Sebabnya struktur pnpm workspace: `lucide-react` dan `react` bisa
      // di-resolve dari POHON node_modules yang berbeda (root vs apps/web).
      // Versi React-nya identik, OBJEKNYA berbeda — hook dari salinan A tak
      // menemukan dispatcher salinan B.
      //
      // Yang TIDAK menyelesaikannya, semuanya sudah dicoba: `dedupe`,
      // `server.deps.inline`, `resolve.conditions`, dan alias ke jalur `.pnpm`
      // yang ditebak. Tiga yang pertama bekerja pada satu pohon; ini dua
      // pohon. Yang keempat pecah begitu `pnpm install` dijalankan ulang.
      //
      // Sub-path SPESIFIK didaftarkan LEBIH DULU: alias Vite mencocokkan
      // prefiks, jadi `react` telanjang akan menelan `react/jsx-runtime`.
      { find: /^react\/jsx-dev-runtime$/, replacement: jalurPaket('react/jsx-dev-runtime') },
      { find: /^react\/jsx-runtime$/, replacement: jalurPaket('react/jsx-runtime') },
      { find: /^react-dom\/client$/, replacement: jalurPaket('react-dom/client') },
      { find: /^react-dom$/, replacement: jalurPaket('react-dom') },
      { find: /^react$/, replacement: jalurPaket('react') },
      { find: /^lucide-react$/, replacement: jalurPaket('lucide-react') },
    ],
    dedupe: ['react', 'react-dom'],
  },
})
