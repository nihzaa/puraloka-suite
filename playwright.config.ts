import { defineConfig, devices } from '@playwright/test'

// ═════════════════════════════════════════════════════════════════════════════
// UJI BROWSER SUNGGUHAN — hanya untuk yang TAK BISA dibuktikan di tempat lain.
//
// Repo ini sudah punya 1.231 test API dan 56 test komponen di jsdom. Menambah
// lapisan ketiga hanya masuk akal untuk hal yang kedua lapisan itu secara
// struktural tak bisa jangkau:
//
//   1. Tata letak & gulir SUNGGUHAN — jsdom tak punya layout engine, jadi
//      `scrollTop` selalu 0 dan tinggi elemen selalu 0. Dua invarian
//      `useVirtualList` tercatat menunggu ini (lihat komentar di file test-nya).
//   2. `middleware.ts` — berjalan di server Next, bukan di React. Tak ada
//      test yang menyentuhnya sama sekali, padahal ia yang memutuskan siapa
//      boleh melihat halaman apa.
//   3. Kontras & fokus terhitung — nilai CSS final sesudah kaskade, yang hanya
//      ada kalau ada mesin render.
//
// Yang SENGAJA tidak diuji di sini: alur bisnis yang butuh login. Kredensial
// Supabase Auth adalah blocker eksternal, dan alur uangnya sendiri sudah
// dijaga di level trigger DB (`__tests__/alur-uang-*.test.ts`) — tempat yang
// lebih tepat, karena trigger berlaku untuk SEMUA penulis, bukan hanya UI.
// ═════════════════════════════════════════════════════════════════════════════

const PORT = 3100
// `localhost`, BUKAN `127.0.0.1`. Next 16 memperlakukan keduanya sebagai origin
// BERBEDA dan hanya memercayai `localhost` untuk aset dev; dari `127.0.0.1`
// HTML tetap terkirim utuh tapi bundel klien ditolak — halaman tampak benar,
// teksnya benar, dan TIDAK ADA error di konsol maupun log server. Yang mati
// hanya hidrasi: tak satu pun tombol atau hook bereaksi.
//
// Gejalanya menyesatkan persis seperti kelas cacat yang repo ini berkali-kali
// temui: semuanya terlihat berhasil, hanya tak melakukan apa-apa. Berjam-jam
// 2026-08-02 terbuang mengejar "React tak mengambil alih" sebelum akarnya
// ketemu di `next.config.ts` → `allowedDevOrigins` yang tak memuat 127.0.0.1.
const BASE = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Gagal kalau ada `test.only` tertinggal — di CI itu diam-diam melewatkan
  // seluruh test lain di file yang sama.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Satu worker: `next dev` melayani satu build, dan test yang menggulir
  // bersamaan saling mengganggu lewat pemakaian CPU.
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE,
    // Jejak hanya disimpan saat gagal — kalau tidak, folder ini tumbuh
    // ratusan MB tanpa ada yang membukanya.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // `next dev`, BUKAN `next start`. Pelajaran mahal dari 2026-07-31: berjam-
    // jam terbuang menyimpulkan "token CSS-nya dibuang compiler" padahal yang
    // jalan adalah bundel produksi LAMA dari `next start`.
    // Port lewat FLAG `-p`, bukan lewat `env: { PORT }`. `pnpm --filter` tak
    // meneruskan PORT ke proses anaknya, sehingga `next dev` naik di 3000
    // sementara Playwright memeriksa 3100 — dan kalau kebetulan ada server dev
    // lain di 3000, halamannya TERBUKA dan tampak benar, hanya tak pernah
    // ter-hidrasi karena asetnya dari origin berbeda. Berjam-jam terbuang
    // 2026-08-02 mengejar "React tak mengambil alih" yang sebenarnya
    // "servernya bukan yang ini".
    command: `pnpm --filter web exec next dev -p ${PORT}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
