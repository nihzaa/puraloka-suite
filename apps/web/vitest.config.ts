import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

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
 * Jalur `lucide-react` yang SEPOHON dengan React milik `apps/web`.
 *
 * Mencari di `.pnpm` lokal alih-alih menulis versi, supaya upgrade paket tak
 * diam-diam mengembalikan bug React-ganda yang dijelaskan di bawah.
 */
function lucideLokal(): string {
  const pnpm = fileURLToPath(new URL('./node_modules/.pnpm', import.meta.url))
  const dir = readdirSync(pnpm).find((d) => d.startsWith('lucide-react@'))
  if (!dir) {
    throw new Error(
      'lucide-react tak ditemukan di apps/web/node_modules/.pnpm. ' +
      'Jalankan `pnpm install` di apps/web — tanpa salinan lokal, test yang ' +
      'merender ikon gagal dengan "Cannot read properties of null (reading ' +
      'useContext)", dan pesan itu tak menunjuk ke sini sama sekali.',
    )
  }
  return join(pnpm, dir, 'node_modules/lucide-react/dist/esm/lucide-react.mjs')
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

      // `lucide-react` diarahkan ke salinan yang SEPOHON dengan React milik
      // `apps/web`.
      //
      // ⚠️ Ini menghabiskan waktu paling lama saat harness dibangun, dan
      // gejalanya menyesatkan: SETIAP komponen yang memakai ikon gagal dengan
      // `Cannot read properties of null (reading 'useContext')` — errornya
      // menuduh React, lalu menuduh komponennya. Keduanya salah alamat.
      //
      // Sebabnya: `apps/web/node_modules/lucide-react` adalah symlink ke
      // ROOT `.pnpm`, dan salinan root itu membawa React-nya sendiri. Versi
      // React-nya identik (19.2.4) tapi OBJEKNYA berbeda, jadi hook dari
      // salinan A tak menemukan dispatcher salinan B.
      //
      // Yang TIDAK menyelesaikannya, semuanya sudah dicoba: `dedupe`,
      // `server.deps.inline`, `resolve.conditions`, dan alias `react` ke path
      // absolut. Ketiga yang pertama bekerja pada satu pohon; ini dua pohon.
      // Yang keempat memaku React tapi tak memaku SIAPA yang memuatnya.
      //
      // Jalurnya dicari saat runtime, bukan ditulis versi — supaya
      // `pnpm update lucide-react` tak diam-diam mengembalikan bug ini.
      { find: /^lucide-react$/, replacement: lucideLokal() },

      // ⚠️ React & react-dom DIPAKU ke salinan milik `apps/web`.
      //
      // Tanpa ini SETIAP komponen yang memakai ikon gagal dengan `Cannot read
      // properties of null (reading 'useContext')` — yaitu hampir seluruh repo.
      //
      // Sebabnya struktur pnpm, dan butuh beberapa langkah untuk terlihat:
      //   · `lucide-react` di-hoist ke ROOT `node_modules/.pnpm`
      //   · React yang IA lihat: `<root>/.pnpm/react@19.2.4/…`
      //   · React yang komponen web lihat: `apps/web/.pnpm/react@19.2.4/…`
      //
      // Versinya identik, objeknya BERBEDA. Hook dari salinan A tak menemukan
      // dispatcher salinan B, dan React melempar seolah komponennya salah.
      //
      // `dedupe` saja tak cukup — ia menyatukan yang di-resolve dari satu
      // pohon, bukan dua pohon terpisah. Path absolut yang menyelesaikannya.
      //
      // Next.js tak terkena karena bundler-nya menyatukan React lewat
      // konfigurasinya sendiri; Vitest tak mewarisi itu.
    ],
    dedupe: ['react', 'react-dom'],
  },
})
