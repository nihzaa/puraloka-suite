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
