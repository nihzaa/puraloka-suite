# Sub-Fase 1A — Status Ledger

**Single source of truth** untuk status eksekusi Sub-Fase 1A (Foundation Hardening / Program A). Diupdate saat sebuah Epic/unit ditutup administratif — bukan diasumsikan dari commit. Status di dokumen lain (`02-phase-1a-sequence.md`, `05-feature-implementation-order.md`, `01-capability-to-task-mapping.md`) merujuk ke sini.

> **Penomoran:** "Sub-Fase 1A" adalah bagian pertama **Program A (= Phase 1)**. Program A-F ↔ Phase 1-9; di dalam Program A ada Sub-Fase 1A-1D. Selalu tulis "Sub-Fase 1B" (jangan "1B" telanjang). Peta otoritatif: [../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md](../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md).

Legenda: ✅ selesai & merged · 🔵 pending · ⏳ pending, unblocked · ⚠️ catatan

| Unit | Epic | Nama | Status | Bukti |
|---|---|---|---|---|
| 1A.4 | Epic 1 | Financial Test Suite | ✅ **Selesai** (merged `main`) | 53 test, 4 pure function + 3 golden-path; menemukan+fix 2 bug (kasbon double-approve, GR over-receipt) |
| 1A.5 | Epic 2 | CI/CD Foundation | ✅ **Selesai** (merged `main`) | ESLint `apps/api` + `.github/workflows/ci.yml`; CI hijau; 5 GitHub Secrets di-set |
| 1A.1 | Epic 3 | Permission Engine Consolidation | ✅ **Selesai** (PR #2, merge `818eeb5`) | `requireRole`=0, `requirePermission`=107; migration 060+061 **applied ke dev**; CI main hijau (1m57s). ⚠️ smoke test login-based belum diverifikasi manual |
| — | Arch. Remediation 3.5 | Inline authorization gate cleanup | ✅ **Selesai** (PR #3, merge `233c8b4`) | 3 gate → `hasPermission()` helper (kasbon/wage/foto); audit ulang: 0 role-literal authorization. autoApprove & data-scoping diberi komentar, tidak dimigrasi |
| 1A.2 | Epic 4 | RLS Synchronization | ✅ **SELESAI 100%** (PR #4-#7 merged) | `has_permission()` (062) + harness + fix recursion (065/ADR-005) + expand 4 kelompok (063,066,067/068,069/070) + **contract (071 — drop 59 policy literal-role)**. RLS kini HANYA has_permission + ownership helpers, nol auth_role() literal. Capability: progress/workers/finance/cash:manage (admin+pm default, UI-configurable). 106 test hijau. Safety: WAL archiving on + daily backup + dry-run + in-tx verify. Rollback: re-create dari 049 |
| — | CI race fix | Per-run test schema | ✅ **Selesai** (PR #6) | Root cause "type user_role already exists" di main: shared `test` schema. Fix: TEST_SCHEMA=test_<run_id> unik per CI run + cleanup |
| — | ADR-005 | RLS ownership via SECURITY DEFINER | ✅ **Diterima** | Fix infinite recursion `projects ↔ mandor_assignments` (bug pre-existing 049, ditemukan RLS harness). Helper `is_assigned_mandor`/`is_pm_of_project`/`is_owning_client` |
| 1A.3 | Epic 5 | Audit Trail Helper | 🟢 **SELESAI (F5.1-F5.5)** | `audit.ts` helper terpusat + migration 072. Instrumentasi 5/6 event. `payment.deleted` N/A. **F5.5 append-only trigger (073) APPLIED** — audit_logs immutable (UPDATE/DELETE ditolak, INSERT boleh); founder setujui, applied 2026-07-23. 119 test hijau (test integration di-refactor jadi rollback-safe + test khusus verifikasi immutability). Bug drift 046 fixed |

## Gate 1A → 1B

**Seluruh implementasi Sub-Fase 1A SELESAI & merged:** Epic 1 (test suite) ✅ · Epic 2 (CI/CD) ✅ · Epic 3 (permission engine) ✅ · Remediation 3.5 (inline auth) ✅ · Epic 4 (RLS sync, expand+contract) ✅ · Epic 5 (audit trail **F5.1-F5.5, append-only applied via PR #13**) ✅. `requireRole` dihapus ✅, RLS 100% permission-based ✅, 119 test hijau ✅, CI main hijau ✅.

**Gate 1A→1B: ✅ APPROVED oleh founder (2026-07-23).** Ketiga pemblokir RESOLVED:
- **F5.5 append-only** — ✅ **APPLIED** (PR #13, `d9ea114`; trigger `trg_audit_logs_no_update/no_delete` di DB, audit_logs immutable). Maintenance koreksi audit: DROP trigger sementara → edit → re-create.
- **Smoke test login 4 role** — ✅ **DIJALANKAN** (admin/pm/mandor/client login-verified, authorization semua benar; `direktur` automated-only karena enum). Lihat [gate-1a-preconditions-response.md § #2b](gate-1a-preconditions-response.md).
- **Approval eksplisit** — ✅ diberikan.

Migration drift — ✅ **DIPERBAIKI** (058 3 kolom re-apply; `schema_migrations` rekonsiliasi 52→70, deep-verify column-level). Sisa non-blocking: apply 043-047 saat fitur dibangun.

⚠️ **Drift tracking baru (dicatat, belum diperbaiki — bukan run ini):** migration 073 sudah applied (trigger ada di DB) tapi **belum tercatat di `schema_migrations`** (apply lewat pg langsung di PR #13, bukan supabase push). Rekonsiliasi tracking 073 = item run implementasi berikutnya, bukan planning ini.

## Kandidat item Sub-Fase 1B (dicatat, jangan mengambang)

- **`users.role` enum → data-driven** (dari #1 gate response): RBAC v2 config-driven setengah jadi — `users.role` masih enum `user_role` 4-nilai, role custom (`direktur`) tak bisa di-assign ke user. **Keputusan 1B:** migrasi enum→TEXT/FK ke `roles` (Opsi A, direkomendasi — menuntaskan config-driven) atau tunda dengan alasan (Opsi B). Detail: [gate-1a-preconditions-response.md § #1](gate-1a-preconditions-response.md).

## Disiplin deployment (disepakati, jaga terus)

Commit kecil per task · branch + PR (bukan langsung `main`, sejak Epic 3) · urutan **Review → Migration → Verification → Merge** (migration di-apply setelah PR approved) · CI hijau wajib sebelum merge · migration kembar `db/migrations/` + `supabase/migrations/`.

---

*Terakhir diupdate: penutupan administratif Epic 3 (2026-07-23).*
