# Sub-Fase 1A — Status Ledger

**Single source of truth** untuk status eksekusi Sub-Fase 1A (Foundation Hardening / Program A). Diupdate saat sebuah Epic/unit ditutup administratif — bukan diasumsikan dari commit. Status di dokumen lain (`02-phase-1a-sequence.md`, `05-feature-implementation-order.md`, `01-capability-to-task-mapping.md`) merujuk ke sini.

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
| 1A.3 | Epic 5 | Audit Trail Helper | 🟢 **F5.1-F5.4 SELESAI** · F5.5 gated | `audit.ts` helper terpusat (logAuditEvent, computeDiff, fire-and-forget, auto ip/user_agent) + migration 072 (correlation_id/workflow_id/reason + defensive diff/severity). Instrumentasi 5/6 event (kasbon.status, project.status, user.role, invoice.amount, rab_materials.override, + change_order). `payment.deleted` N/A (endpoint delete belum ada). 113 test hijau. **Ditemukan+fix bug drift: migration 046 tak ter-apply** (kolom diff/severity hilang). ⏳ **F5.5 append-only trigger = GATE founder** (073 dorman) — lihat [epic-5-decisions.md](epic-5-decisions.md) |

## Gate 1A → 1B

Belum tercapai. Butuh: seluruh authorization-gate termigrasi (Epic 3 ✅ + Remediation 3.5 🔵), `requireRole` dihapus (✅), RLS kelompok Finansial minimal expand (Epic 4 ⏳), test suite (✅), CI hijau (✅). **Founder approval eksplisit** tetap wajib — bukan otomatis saat checklist penuh.

## Disiplin deployment (disepakati, jaga terus)

Commit kecil per task · branch + PR (bukan langsung `main`, sejak Epic 3) · urutan **Review → Migration → Verification → Merge** (migration di-apply setelah PR approved) · CI hijau wajib sebelum merge · migration kembar `db/migrations/` + `supabase/migrations/`.

---

*Terakhir diupdate: penutupan administratif Epic 3 (2026-07-23).*
