# Implementation Kickoff — 06. Testing Execution Plan

**Sumber tunggal:** [Phase1/06-test-strategy.md](../Phase1/06-test-strategy.md). Dokumen ini menjawab **kapan** setiap jenis test dijalankan (siklus, trigger, gate) — Phase1/06 mendesain **apa** dan **bagaimana**, bukan jadwal eksekusi.

---

## Jenis Test dan Kapan Dijalankan

| Jenis Test | Kapan Ditulis | Kapan Dijalankan | Gate Apa |
|---|---|---|---|
| **Unit test** (pure function: tax/EVM/RAB/retention) | Bersamaan dengan ekstraksi function-nya (Epic 1, Tahap 1) — **tidak pernah** menyusul setelah kode ditulis | Setiap `pnpm vitest run lib/` lokal (manual, sebelum commit) + otomatis di CI setiap PR | Coverage ≥90% untuk `lib/` adalah gate CI wajib |
| **Integration test** (kasbon/CO/procurement golden path + kegagalan) | Setelah test database terisolasi terverifikasi (T1.1.2) | Otomatis di CI setiap PR (`pnpm vitest run routes/`) | Wajib hijau sebelum merge, tidak ada coverage percentage gate (fokus golden path + kegagalan spesifik, bukan blanket %) |
| **Permission test** (verifikasi `requirePermission` per endpoint yang dimigrasi) | Saat setiap file dimigrasi di Epic 3 (F3.2) | Manual: login sebagai tiap role, verifikasi behavior identik sebelum/sesudah — **per commit**, bukan di akhir batch | Wajib sebelum commit berikutnya di rantai migrasi yang sama |
| **RLS test** | Saat setiap kelompok tabel dimigrasikan (Epic 4) | Otomatis (`pnpm vitest run rls/`) — 4 test user role built-in + 1 role kustom, per tabel | Wajib hijau sebelum lanjut ke kelompok tabel berikutnya — **tidak ada tabel yang lanjut tanpa test-nya sendiri lulus** |
| **API test manual** (role admin masih akses `/audit`, `/reports` setelah `requireRole` dihapus) | — | Manual, sekali, tepat setelah F3.3 (hapus `requireRole`) | Wajib sebelum commit "hapus fungsi requireRole" |
| **UI test — mobile, 3 skenario terpisah** (⚠️ dikoreksi dari draft awal yang keliru menggabungkan menjadi satu baris "test manual sekali di Gate") | Tiga trigger berbeda, **bukan satu test gabungan**: (1) login 4 role setelah migrasi Permission Engine (Epic 3) selesai; (2) alur kasbon setelah migrasi RLS kelompok Finansial (F4.6) selesai; (3) alur progress+foto — **berkelanjutan**, dicek ulang di **setiap** perubahan 1A-1D, bukan sekali di akhir | Manual, sesuai trigger masing-masing — skenario (1) dan (2) di titik migrasi terkait, skenario (3) di setiap Gate | Ketiganya wajib per [Phase1/09-definition-of-done.md § Kompatibilitas Mobile](../Phase1/09-definition-of-done.md#kompatibilitas-mobile-app-wajib-di-setiap-sub-fase-yang-menyentuh-permissionrls) — **bukan** satu checklist tunggal di Gate 1A→1B saja |
| **UI test — web** (tidak rusak oleh perubahan permission/RLS) | — | Manual, di setiap Gate | Wajib sebelum Gate 1A→1B diajukan — lihat [Phase1/03-migration-strategy.md § Compatibility Strategy Mobile](../Phase1/03-migration-strategy.md#compatibility-strategy--mobile-app) |
| **E2E test** | Tidak dalam cakupan Sub-Fase 1A | — | Eksplisit di luar cakupan — [Phase1/06-test-strategy.md](../Phase1/06-test-strategy.md) tidak mendesain E2E framework (Playwright dsb) untuk Phase 1 |
| **Regression test** | Test suite Epic 1 itu sendiri **adalah** regression suite untuk Epic 3/4 | Setiap PR di Epic 3/4 menjalankan seluruh suite Epic 1, bukan hanya test baru | CI wajib — `pnpm vitest run` (seluruh suite) bukan filtered |
| **Performance test** | Tidak dalam cakupan Sub-Fase 1A | — | Eksplisit di luar cakupan — tidak ada load testing/benchmark yang didesain di Phase1 set untuk 1A; observability (1D) mempersiapkan RED metrics tapi belum ada threshold performa yang ditetapkan |

---

## Urutan Eksekusi Test Relatif terhadap Kode

**Prinsip yang tidak bisa ditawar (dari [Phase1/05-rollout-plan.md](../Phase1/05-rollout-plan.md)):** Test suite (Epic 1) dan CI (Epic 2) **selalu mendahului** kode berisiko tinggi (Epic 3/4). Tidak ada commit Epic 3/4 yang boleh masuk sebelum Epic 1 & 2 hijau di CI.

```
Epic 1 (test) + Epic 2 (CI) hijau
  → per-commit Epic 3 (Permission Engine):
      migrasi 1 file → manual role test → commit → CI hijau → lanjut file berikutnya
  → per-tabel Epic 4 (RLS):
      migrasi 1 tabel/kelompok → RLS test otomatis → commit → CI hijau → lanjut tabel berikutnya
      (khusus Finansial: + independent review + interim detection query sebelum contract)
  → Gate 1A→1B:
      UI test manual (web+mobile, 4 role) → founder approval eksplisit
```

**Kenapa manual role test per-commit di Epic 3, bukan hanya di akhir:** [Phase1/03-migration-strategy.md:25](../Phase1/03-migration-strategy.md) eksplisit — setiap file migrasi authorization-gate diverifikasi manual sebelum lanjut ke file berikutnya, karena kesalahan di file berisiko rendah (mis. `users.ts`) lebih mudah dideteksi dan diperbaiki di tempat daripada ditemukan setelah 9 file lain juga berubah.

---

## Test Database — Konfigurasi Wajib Sebelum Test Pertama Ditulis

**Prasyarat keras** (bukan best-effort): Test tidak pernah menyentuh database development/production yang berisi data seed asli (5 proyek Bandung, 12 user, dst — lihat CLAUDE.md § Seed Data). Dua opsi yang valid:
1. `supabase start` (Supabase local, Docker-based) — direkomendasikan karena paling mendekati production schema/RLS behavior.
2. Schema Postgres terpisah di instance yang sama (lebih ringan, tapi butuh disiplin ekstra memastikan tidak accidentally cross-reference schema dev).

**Verifikasi wajib sebelum T1.3.1 (integration test kasbon) ditulis:** konfirmasi eksplisit connection string test menunjuk ke database terisolasi, bukan `.env` development yang sama.

---

## CI Test Execution — Detail Command

```yaml
# Bagian dari .github/workflows/ci.yml
- name: Unit tests (pure function, target 90% coverage)
  run: pnpm --filter api vitest run --coverage src/lib/
- name: Integration tests (golden path + kegagalan finansial)
  run: pnpm --filter api vitest run src/routes/v1/__tests__/
- name: RLS policy tests
  run: pnpm --filter api vitest run src/lib/__tests__/rls/
```

**Coverage gate di CI:** Hanya untuk `src/lib/` — bukan blanket threshold seluruh `apps/api/src`. Ini keputusan sadar (lihat [Phase1/06-test-strategy.md § Realisme Target Coverage](../Phase1/06-test-strategy.md#realisme-target-coverage-90--pembahasan-jujur)), bukan standar yang diturunkan karena keterbatasan waktu.

---

*Dokumen selanjutnya: [07 — Release and Rollback Plan](07-release-and-rollback-plan.md) — strategi branch, merge, release, rollback, backup, hotfix.*
