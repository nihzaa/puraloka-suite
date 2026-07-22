# Sub-Fase 1A — Status Ledger

**Single source of truth** untuk status eksekusi Sub-Fase 1A (Foundation Hardening / Program A). Diupdate saat sebuah Epic/unit ditutup administratif — bukan diasumsikan dari commit. Status di dokumen lain (`02-phase-1a-sequence.md`, `05-feature-implementation-order.md`, `01-capability-to-task-mapping.md`) merujuk ke sini.

Legenda: ✅ selesai & merged · 🔵 pending · ⏳ pending, unblocked · ⚠️ catatan

| Unit | Epic | Nama | Status | Bukti |
|---|---|---|---|---|
| 1A.4 | Epic 1 | Financial Test Suite | ✅ **Selesai** (merged `main`) | 53 test, 4 pure function + 3 golden-path; menemukan+fix 2 bug (kasbon double-approve, GR over-receipt) |
| 1A.5 | Epic 2 | CI/CD Foundation | ✅ **Selesai** (merged `main`) | ESLint `apps/api` + `.github/workflows/ci.yml`; CI hijau; 5 GitHub Secrets di-set |
| 1A.1 | Epic 3 | Permission Engine Consolidation | ✅ **Selesai** (PR #2, merge `818eeb5`) | `requireRole`=0, `requirePermission`=107; migration 060+061 **applied ke dev**; CI main hijau (1m57s). ⚠️ smoke test login-based belum diverifikasi manual |
| — | Arch. Remediation 3.5 | Inline authorization gate cleanup | ✅ **Selesai** (PR #3, merge `233c8b4`) | 3 gate → `hasPermission()` helper (kasbon/wage/foto); audit ulang: 0 role-literal authorization. autoApprove & data-scoping diberi komentar, tidak dimigrasi |
| 1A.2 | Epic 4 | RLS Synchronization | 🚧 **In progress** | Prasyarat (Epic 3 + Remediation 3.5) selesai. Gap terbesar Phase 1A: RLS nol referensi RBAC v2. `has_permission()` SQL function + migrasi per-kelompok tabel. Migration mulai 062+ |
| 1A.3 | Epic 5 | Audit Trail Helper | 🔵 **Pending** (boleh paralel) | `logAuditEvent` + instrumentasi 6 event |

## Gate 1A → 1B

Belum tercapai. Butuh: seluruh authorization-gate termigrasi (Epic 3 ✅ + Remediation 3.5 🔵), `requireRole` dihapus (✅), RLS kelompok Finansial minimal expand (Epic 4 ⏳), test suite (✅), CI hijau (✅). **Founder approval eksplisit** tetap wajib — bukan otomatis saat checklist penuh.

## Disiplin deployment (disepakati, jaga terus)

Commit kecil per task · branch + PR (bukan langsung `main`, sejak Epic 3) · urutan **Review → Migration → Verification → Merge** (migration di-apply setelah PR approved) · CI hijau wajib sebelum merge · migration kembar `db/migrations/` + `supabase/migrations/`.

---

*Terakhir diupdate: penutupan administratif Epic 3 (2026-07-23).*
