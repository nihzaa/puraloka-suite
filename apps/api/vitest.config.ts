import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'

// Task 1.1.2 — Vitest tidak otomatis memuat .env seperti runtime aplikasi
// (yang pakai dotenv.config() manual di src/utils/supabase.ts). Tanpa ini,
// DIRECT_URL/DATABASE_URL tidak terlihat oleh test, gagal dengan error
// membingungkan seolah connection string salah padahal env belum termuat.
// Pakai `dotenv` (dependency existing, sama seperti runtime aplikasi) —
// bukan `vite`, yang hanya transitive dependency, tidak boleh diimpor langsung.
dotenv.config()

// Konfigurasi test — Sub-Fase 1A (Financial Test Suite).
// Coverage gate HANYA untuk src/lib/ (pure function kalkulasi finansial),
// bukan blanket threshold seluruh apps/api/src.
// Rationale: docs/superpowers/specs/2026-07-18-enterprise-architecture/Phase1/06-test-strategy.md
// § Realisme Target Coverage 90%.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Sub-Fase 1A baru mulai — belum ada test file ditulis (Task 1.1.1 adalah
    // fondasi, bukan Task ekstraksi pure function). Tanpa ini, `vitest run`
    // exit 1 pada repo yang sepenuhnya sehat, memblokir verifikasi infrastruktur
    // itu sendiri. Dihapus otomatis begitu Task 1.2.x (ekstraksi lib/) dimulai.
    passWithNoTests: true,
    // Task 1.3.1 — file test dijalankan SEQUENTIAL, bukan default paralel.
    // Ditemukan: integration test yang memakai schema `test` bersama
    // (resetTestSchema di kasbons.test.ts, destruktif) race dengan test lain
    // yang memakai schema sama secara bersamaan ("schema already exists" /
    // koneksi ditutup di tengah query lain). Berlaku untuk seluruh Feature 1.3
    // (kasbon/CO/procurement), bukan hanya kasbon.
    fileParallelism: false,
    // Default vitest 5 detik terlalu ketat untuk repo ini: mayoritas test adalah
    // INTEGRATION test terhadap Postgres nyata (Supabase pooler, lintas jaringan),
    // bukan unit test in-memory. Di lokal 5 detik cukup karena koneksi hangat dan
    // DB tidak diperebutkan; di CI — yang berbagi satu database dan berjalan
    // sequential — test yang sama rutin menembus 5 detik.
    //
    // Gejalanya menipu: "Test timed out in 5000ms" terlihat seperti test/kode
    // yang salah, padahal tidak ada yang salah. Sudah tiga kali membuat CI merah
    // di sesi T3/T4 (supplier-invoice-3way, estimate-custom-item, ahsp-endpoint),
    // masing-masing menghabiskan satu siklus ~9 menit untuk didiagnosis ulang.
    //
    // 30 detik dipilih, bukan angka besar sembarang: cukup longgar untuk query
    // lintas jaringan yang lambat, tapi tetap menangkap test yang benar-benar
    // menggantung (hang) alih-alih membiarkannya berjalan sampai job timeout.
    // Test yang butuh lebih lama (DDL 32 tabel, rollback penuh) tetap menyatakan
    // timeout-nya sendiri secara eksplisit — lihat ADR-011 §9.6.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts', 'src/lib/**/__tests__/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
})
