# Phase 1 — 09. Definition of Done

**Upstream:** Konsolidasi checklist dari seluruh dokumen [00](00-current-state-audit.md)–[08](08-observability-plan.md).
**Status:** Planning only — checklist ini adalah gate yang akan dipakai **saat implementasi berjalan**, bukan sudah tercentang sekarang.
**Cara pakai:** Setiap sub-fase (1A/1B/1C/1D) punya definisi selesai sendiri. **Tidak ada sub-fase yang dianggap selesai tanpa persetujuan eksplisit founder** ([05-rollout-plan.md § Gate 1A → 1B](05-rollout-plan.md#gate-1a--1b)), checklist di bawah adalah syarat minimum untuk gate itu diajukan — bukan pengganti keputusan manusia.

---

## Sub-Fase 1A — Security Foundation

### Architecture Review Gate (v1.1 — item baru)
- [ ] Architecture Review (Gate 1 doc04, [§ Architecture Governance & Phase Gates](../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates)) dilakukan dan didokumentasikan **sebelum** implementasi Sub-Fase 1A dimulai — untuk solo developer, ini berbentuk dokumentasi tertulis singkat + jeda minimal 1 hari sebelum eksekusi (sesuai definisi gate itu sendiri), dicatat sebagai entry terpisah (tanggal + ringkasan keputusan), bukan diasumsikan otomatis terpenuhi oleh checklist teknis di bawah *(v1.1: item ini sebelumnya tidak ada — Phase 1A Readiness Review menemukan Sub-Fase 1A bisa dinyatakan 100% selesai secara harfiah tanpa Gate 1 doc04 pernah benar-benar dilakukan; item ini menutup gap tersebut)*

### Permission Engine
- [ ] 4 pemanggilan `requireRole` dihapus dan diganti `requirePermission` yang setara *(v1.1: angka 4 diverifikasi ulang langsung terhadap `apps/api/src/` — `audit.ts:10`, `audit.ts:59`, `reports.ts:967`, `reports.ts:1038` — lihat [02-target-architecture.md § 1A.1](02-target-architecture.md#1a1-permission-engine-v2--desain-konsolidasi); jumlah final **MUST** tetap diverifikasi ulang sekali lagi di awal eksekusi 1A untuk menangkap perubahan kode sejak dokumen ini ditulis, tidak diasumsikan permanen)*
- [ ] Fungsi `requireRole` dihapus dari `apps/api/src/plugins/auth.ts` (bukan hanya tidak dipanggil — benar-benar dihapus, mencegah dipakai lagi di masa depan)
- [ ] Seluruh 21 baris authorization-gate inline yang teridentifikasi ([00 § 1.5](00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file)) dimigrasikan ke `requirePermission`, dicentang satu per satu (bukan diasumsikan "sudah semua")
- [ ] 36 baris data-scoping inline diberi komentar eksplisit menandai jenisnya (mencegah tertukar sebagai authorization gate di refactor masa depan)
- [ ] Tabel `permission_scopes` dibuat dan diisi untuk PM existing, **diverifikasi manual** terhadap `projects.pm_id`

### RLS
- [ ] Function `has_permission()` dibuat dan diverifikasi
- [ ] Kelompok tabel "Referensi read-mostly" bermigrasi (expand+contract selesai)
- [ ] Kelompok "Operasional non-finansial" bermigrasi
- [ ] Kelompok "Field ops" bermigrasi
- [ ] Kelompok "Finansial" (kasbons, invoices, payments, cash_accounts, expense_reports) **minimal expand selesai** (policy baru hidup berdampingan policy lama) — contract boleh menyusul
- [ ] ~17 tabel tanpa RLS dienumerasi eksplisit, setiap satu diputuskan sadar (butuh RLS / sengaja terbuka) — daftar final dilampirkan sebagai addendum dokumen ini setelah enumerasi selesai
- [ ] Test RLS memverifikasi role kustom baru mendapat akses benar di setiap kelompok tabel yang sudah dimigrasikan

### Audit Trail
- [ ] `apps/api/src/utils/audit.ts` dibangun (helper `logAuditEvent`)
- [ ] 3 kolom baru (`correlation_id`, `workflow_id` nullable, `reason` nullable) ditambahkan ke `audit_logs`
- [ ] `change-orders.ts:576` dimigrasikan ke helper baru, `severity: 'critical'` terisi
- [ ] 6 event wajib yang belum terinstrumentasi ([00 § 3.4](00-current-state-audit.md#34-event-wajib-per-migration-046-yang-tidak-terinstrumentasi)) — `invoice.amount`, `payment.deleted`, `kasbon.status`, `user.role`, `project.status`, `rab_materials.override` — masing-masing tercentang saat selesai

### Financial Test Suite
- [ ] Vitest terpasang dan dikonfigurasi
- [ ] 4 pure function diekstrak (`evm-calculation.ts`, `tax-calculation.ts`, `retention-calculation.ts`, `rab-aggregation.ts`) dengan test coverage ≥90%
- [ ] Integration test golden-path untuk kasbon, change order, procurement
- [ ] Integration test untuk 3 kegagalan finansial paling mungkin ([06 § Integration Test](06-test-strategy.md#integration-test--golden-path--kegagalan-finansial-paling-mungkin)) — approve ganda kasbon, approve CO ter-reject, over-receipt GR
- [ ] Test database terisolasi (bukan development/production) — diverifikasi konfigurasi sebelum test pertama ditulis

### CI/CD
- [ ] `.github/workflows/ci.yml` berjalan di setiap PR: lint + typecheck + test + build
- [ ] CI hijau di branch `main` sebelum sub-fase 1A dianggap selesai
- [ ] (Opsional, keputusan founder) Branch protection rule diaktifkan

**Gate 1A tidak diajukan sampai seluruh item di atas tercentang DAN founder menyetujui secara eksplisit.**

---

## Sub-Fase 1B — Configuration Foundation

- [ ] Tabel `company_settings` dibuat
- [ ] Tax rate (`0.11`/`0.02`) dimigrasikan dari hardcode ke `company_settings`, dengan fallback selama transisi lalu fallback dihapus setelah verifikasi
- [ ] Tabel `menu_items` dibuat, `sidebar.tsx` direfactor jadi renderer generik
- [ ] Tabel `modules` dan `feature_flags` dibuat (skema tersedia, seed data awal sesuai module existing)
- [ ] **Eksplisit TIDAK dikerjakan** (dicentang sebagai "sengaja di luar cakupan," bukan lupa): approval limit nominal, payment terms, quotation validity — lihat [01 — Gap 9](01-gap-analysis.md#gap-9--configuration-engine-sebagian-besar-adalah-gap-fitur-bukan-hardcode)

## Sub-Fase 1C — Workflow Foundation

- [ ] Skema `workflow_definitions`/`states`/`transitions` (dari [01 — Application Architecture](../01-application-and-data-architecture.md#dynamic-workflow--approval-engine)) diimplementasikan
- [ ] Perluasan skema: `sla_hours`, `escalation_role`, `approval_mode` di `workflow_transitions`
- [ ] Tabel `approval_delegations` dan `workflow_instances` dibuat
- [ ] Kasbon bermigrasi ke engine generik (modul pertama, strangler-fig)
- [ ] Change Order bermigrasi
- [ ] Procurement bermigrasi (modul terakhir, paling kompleks)
- [ ] Data in-flight (kasbon/CO/PO berstatus pending saat migrasi) di-backfill eksplisit ke `workflow_instances` — bukan diabaikan (R7, [Risk Register](04-risk-register.md#r7--workflow-registry-migration-1c-mengubah-alur-approval-yang-sedang-berjalan-in-flight))

## Sub-Fase 1D — Platform Foundation

- [ ] Logger `pino-pretty` hanya aktif saat `NODE_ENV !== 'production'` — nilai `NODE_ENV` production/staging diverifikasi eksplisit sebelum deploy
- [ ] `genReqId` UUID per-request aktif, dipakai konsisten di log + `audit_logs.correlation_id` + `workflow_instances.correlation_id`
- [ ] `@fastify/otel` terpasang (import saja, belum dikonfigurasi aktif)
- [ ] `/health` diperluas untuk verifikasi konektivitas database
- [ ] Log operasi finansial-kritis memakai field terstruktur (bukan free-text)

---

## Item Tambahan dari Security Review (Keputusan Founder Diperlukan)

- [ ] Verifikasi status PITR Supabase ([07 — Security Review](07-security-review.md)) — administratif, direkomendasikan dikerjakan kapan saja, tidak menghambat gate manapun
- [ ] **Keputusan:** apakah trigger append-only untuk `audit_logs` masuk cakupan 1A (direkomendasikan) atau dicatat terpisah — lihat [07 — Rekomendasi Tambahan](07-security-review.md#rekomendasi-tambahan-berbiaya-rendah-opsional-tidak-menghambat-phase-1)

---

## Kompatibilitas Mobile App (Wajib di Setiap Sub-Fase yang Menyentuh Permission/RLS)

- [ ] Test manual login sebagai admin/PM/mandor/client di mobile app setelah migrasi Permission Engine (1A)
- [ ] Test manual alur kasbon (ajukan, approve, notifikasi) di mobile app setelah migrasi RLS kelompok "Finansial"
- [ ] Test manual alur progress+foto di mobile app tidak terganggu perubahan apa pun di 1A-1D

---

## Kriteria Selesai Keseluruhan "Phase 1" (Payung 1A-1D)

Phase 1 dianggap selesai — dan Puraloka Suite siap secara fondasional untuk Phase 2 (Construction ERP Expansion, sesuai crosswalk [05-rollout-plan.md](05-rollout-plan.md)) — ketika:

1. Seluruh checklist 1A-1D di atas tercentang.
2. Setiap gate antar sub-fase sudah melalui persetujuan eksplisit founder (bukan asumsi otomatis lanjut).
3. **Working software** yang bisa didemonstrasikan (bukan hanya "kode sudah di-merge"):
   - Role kustom yang dibuat lewat UI benar-benar berfungsi identik di API dan database (bukti penutupan Gap 2, temuan paling kritis di seluruh audit ini).
   - Approval kasbon berjalan di atas workflow engine generik dengan SLA/reminder otomatis.
   - CI hijau menjalankan test finansial otomatis di setiap perubahan kode.
   - Log production terstruktur JSON dengan correlation ID yang bisa menelusuri satu request lintas log-audit-workflow.
4. **Tidak ada regresi** di mobile app maupun web app untuk keempat role (admin/PM/mandor/client) — diverifikasi manual, bukan diasumsikan aman karena "kontrak endpoint tidak berubah."

**Setelah kriteria ini terpenuhi**, dokumen ini (dan seluruh Phase1/ set) diarsipkan sebagai referensi historis — [04 — Roadmap utama](../04-roadmap-governance-and-delivery.md) diperbarui untuk mencatat Phase 1 selesai, dan proses [Architecture Governance & Phase Gates](../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates) yang sama dijalankan ulang untuk merencanakan detail Phase 2.

---

*Ini adalah dokumen terakhir dari Phase 1 Planning Set (10 dokumen: 00-09). Kembali ke [00 — Current State Audit](00-current-state-audit.md) untuk memulai dari awal, atau [05 — Rollout Plan](05-rollout-plan.md) untuk ringkasan urutan eksekusi.*
