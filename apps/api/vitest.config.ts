import { defineConfig } from 'vitest/config'

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
