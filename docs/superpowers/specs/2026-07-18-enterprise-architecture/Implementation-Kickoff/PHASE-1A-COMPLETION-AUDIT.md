# Sub-Fase 1A — Final Engineering Completion Audit

**Tanggal:** 2026-07-23. **Metode:** bukti objektif dari kode/DB/git — bukan klaim implementasi. Semua angka diverifikasi langsung (grep, query DB, `vitest run`, `pg_policies`).

---

## 1. Completion Audit — Deliverable / DoD / Exit Criteria

| # | Requirement | Evidence | Status | Ref |
|---|---|---|---|---|
| 1A.4 | Financial Test Suite (Vitest + pure functions + golden path) | 4 pure-fn test (evm/tax/retention/rab) + 3 golden-path (kasbon/CO/procurement); `vitest run` = 113 pass | PASS | PR #1-#2 |
| 1A.5 | CI/CD (lint→typecheck→test→build tiap PR) | `.github/workflows/ci.yml` aktif; CI hijau semua PR #2-#8 | PASS | PR #2 |
| 1A.1 | Permission Engine — hapus `requireRole`, ke `requirePermission` | `grep requireRole apps/api/src` = **0**; `requirePermission` = 106 call sites | PASS | PR #2 |
| 3.5 | Inline authorization gate → permission | 3 gate (notifications×2, progress foto) → `hasPermission()` = 3 call sites | PASS | PR #3 |
| 1A.2 | RLS Sinkronisasi — RLS baca `role_permissions`, bukan literal role | DB: `has_permission()` ada; **0 policy literal-role** di 19 tabel contracted (pg_policies query) | PASS | PR #4-#7 |
| 1A.2 | RLS recursion resolved | `is_assigned_mandor`/`is_pm_of_project`/`is_owning_client`/`mandor_owns_kasbon_scope` ada (SECURITY DEFINER, ADR-005); test recursion pass | PASS | PR #4 |
| 1A.3 | Audit Trail Helper (`logAuditEvent`) + instrumentasi | `audit.ts` ada; 5/6 event instrumented; `audit_logs.diff/severity/correlation_id` ada di DB | PASS* | PR #8 |
| Gate | `requireRole` dihapus total | grep = 0 di seluruh `apps/api/src` | PASS | — |
| Gate | Test suite hijau + CI hijau | 113 pass, 0 skip; CI main `8e76680` success | PASS | — |

*Epic 5 PASS untuk F5.1-F5.4. F5.5 (append-only) sengaja gated (governance). `payment.deleted` N/A (endpoint tak ada). Lihat §6.

---

## 2. Repository Audit

| Check | Command | Result | Status |
|---|---|---|---|
| `requireRole()` | `grep -rn requireRole apps/api/src` | 0 | PASS |
| role-literal `.includes()` auth | `grep includes(user.role) routes/` | 0 | PASS |
| `requirePermission` call sites | grep | 106 | — |
| `hasPermission` call sites | grep | 3 | — |
| TODO/FIXME/XXX/HACK | grep | 0 | PASS |
| Temp/debug files (`_*.mjs`) | find | 0 | PASS |
| Skipped/only/todo tests | grep `.skip/.only/.todo` | 0 | PASS |
| **Inline role-literal authorization murni tersisa** | re-audit pasca-remediasi | **0** | PASS |

**Temuan awal (2 endpoint) — SUDAH DIPERBAIKI langsung** (bugfix kecil-terisolasi-aman, bukan fase remediasi baru):
- `cash.ts:40` `GET /cash/accounts/:id` — `role === 'mandor'/'client' → 403` diganti `requirePermission('cash:view')` di preHandler; PM-ownership check dipertahankan (data-scoping). `cash:view` di-seed admin+pm (migration 074).
- `progress.ts:240` `DELETE /progress-logs/:logId` — inline role check diganti `hasPermission('progress:manage') || (mandor-owner)`; client tertolak otomatis.

Re-audit: **0 authorization gate murni role-literal**. Semua `user.role ===` yang tersisa adalah **data-scoping ownership** sah per ADR-004 Rule #1 (pola `role === 'x' && ownership !== user.id`) atau business-rule ber-komentar (`autoApprove`). Bonus: fix `cash:view` juga membuat role kustom `direktur` (yang sudah punya `cash:view` via UI) dapat akses konsisten — gate role-literal lama justru tidak menangani role di luar 4 built-in.

---

## 3. Migration Audit — Drift Report

| Aspek | Temuan | Status |
|---|---|---|
| File count | `db/migrations`=70, `supabase/migrations`=71 | — |
| File-level drift | `059_seed_dummy_data` hanya di `supabase/` (seed dummy, bukan schema — Finding F3 lama, known) | ACCEPTED |
| `schema_migrations` tracking | Hanya **52 entri, berhenti di 057** | **DRIFT** |
| Migration 058-073 | **Tidak tercatat** di `schema_migrations` (di-apply manual via `pg`, bukan `supabase db push`) | **DRIFT** |
| Schema aktual (objek Epic 3-5) | Semua PASS: permission_scopes, has_permission, 4 ownership helper, audit diff/severity/correlation_id, 4 capability baru, RLS 0 literal-role, trigger 073 dorman (belum ada) | PASS |

**Kesimpulan drift:** schema **aktual database benar & lengkap** (semua objek Epic 3-5 terverifikasi ada). Yang drift adalah **tracking table** `schema_migrations` — tidak akurat karena dua jalur apply (supabase CLI berhenti di 057; 058+ manual pg). Ini **tidak berbahaya fungsional** tapi berarti `supabase db push`/`db diff` tidak bisa diandalkan sampai direkonsiliasi. Root cause pertama kali terekspos saat Epic 5 (migration 046 tak ter-apply). Rekonsiliasi = pekerjaan infrastruktur terpisah (§6).

---

## 4. Documentation Audit

| Dokumen | Temuan status usang | Tindakan |
|---|---|---|
| `STATUS.md` | — (sudah diupdate saat Epic 5) | OK |
| `02-phase-1a-sequence.md` | Status ringkas masih "Epic 4 ⏳ · Epic 5 🔵" | ✅ Diperbaiki |
| `01-capability-to-task-mapping.md` | "Epic 4 pending, 0 referensi RBAC v2" | ✅ Diperbaiki |
| `ADR-004` | Status "Menunggu persetujuan founder" | ✅ → "Diterima" |
| `05-feature-implementation-order.md` | Migration 067/068 (usang) untuk F5.1/F5.5 | ✅ → 072/073 |
| `CLAUDE.md` | **"RLS: DISABLED di semua tabel"** (menyesatkan — bertentangan realita) | ✅ → "AKTIF & 100% permission-based" |

Semua status usang yang ditemukan sudah diperbaiki dalam audit ini.

---

## 5. Testing Audit (angka eksak)

| Metric | Angka | Status |
|---|---|---|
| Test files | 16 | — |
| Tests | **113 pass, 0 fail, 0 skip** | PASS |
| Typecheck (`tsc --noEmit`) | exit 0 | PASS |
| Lint (`eslint src`) | **0 error** (39 warning pre-existing unused-vars) | PASS |
| Build (`tsc`) | exit 0 | PASS |
| RLS tests | 29 (recursion 5, reference 8, operational 4, field-ops 5, financial 4, contract 3) | PASS |
| Audit tests | 7 (unit 5, integration 2) | PASS |
| Pure-fn + integration (Epic 1) | 50 (evm 10, rab 10, retention 7, tax 8, kasbon 4, CO 5, procurement 6) + test-db 3 | PASS |

Skipped tests: **0** (grep `.skip/.only/.todo` = 0).

---

## 6. Technical Debt Report

### Governance decisions (menunggu founder)
- **F5.5 append-only trigger** — migration 073 dorman siap; aktifkan audit immutable? Trade-off forensik vs kontrol hapus. ([epic-5-decisions.md](epic-5-decisions.md))
- **Gate 1A→1B** — approval eksplisit founder sebelum lanjut Sub-Fase 1B.

### Product decisions
- **`payment.deleted` audit event** — endpoint delete/void payment belum ada; instrumentasi menyusul saat fitur dibuat (keputusan bisnis: boleh hapus payment?).
- **Smoke test login manual per-role** — verifikasi end-to-end admin/pm/mandor/client; butuh kredensial Supabase Auth (founder).

### Infrastructure issues
- **Migration tracking drift** — `schema_migrations` berhenti di 057; 058-073 tak tercatat. Rekonsiliasi jalur apply (supabase CLI vs pg manual) diperlukan agar `db push`/`db diff` andal.

### Future backlog (technical debt kode)
- ~~2 endpoint role-literal authorization~~ — **SUDAH DIPERBAIKI** (bugfix langsung, cash:view + progress:manage, migration 074; re-audit 0 tersisa). Bukan dipromosikan jadi fase remediasi karena kecil-terisolasi-aman.
- **39 lint warning** unused-vars pre-existing (bukan Phase 1A) — cleanup opsional, tidak memblokir.

---

## 7. Final Readiness Report

### Status: **CONDITIONAL PASS** — implementasi 100% complete, blocked HANYA oleh governance/external

**Revisi pasca-remediasi:** temuan kode minor (2 endpoint role-literal) **sudah ditutup langsung** sebagai bugfix (bukan dipromosikan jadi debt). Tidak ada lagi implementation gap. Re-audit: **0 authorization gate role-literal**.

**Sub-Fase 1A implementation objektif SELESAI** — seluruh Deliverable/DoD/Exit Criteria teknis PASS terverifikasi: `requireRole`=0, **0 role-literal authorization** (kode & RLS), RLS 100% permission-based, audit trail helper + instrumentasi, 113 test hijau (0 skip), typecheck/lint/build bersih, CI main hijau, 9 PR merged.

**Yang tersisa BUKAN implementasi — semuanya external/governance (di luar kewenangan engineering):**
1. **Governance decision founder:** F5.5 append-only (aktifkan?) + Gate 1A→1B approval.
2. **Product/external:** smoke test login manual per-role (butuh kredensial Supabase Auth); `payment.deleted` (endpoint belum ada, keputusan bisnis).
3. **Infrastruktur (paralel, tidak memblokir 1B fungsional):** migration tracking drift — rekonsiliasi jalur apply.

**Verdict CONDITIONAL PASS adalah verdict akhir yang benar:** tidak FAIL (nol implementation gap), tidak PASS penuh (item governance/external nyata masih terbuka, dan itu memang bukan sesuatu yang boleh engineering putuskan sendiri). Ini persis definisi CONDITIONAL PASS: "implementation complete but blocked by governance items."
3. **Infrastruktur**: migration tracking drift (schema benar, tracking tidak) perlu rekonsiliasi.

**Rekomendasi (STATUS TERKINI — ketiga syarat RESOLVED):** Sub-Fase 1A "implementation complete". Gate 1A→1B ✅ **APPROVED founder (2026-07-23)** — ketiga syarat lama sudah ditutup:
- ~~(a) founder memutuskan F5.5~~ → ✅ **RESOLVED**: append-only applied (PR #13, `d9ea114`).
- ~~(b) 2 endpoint role-literal dibereskan ("Remediation 3.6")~~ → ✅ **RESOLVED** (PR #10): sudah permission-based, bukan fase remediasi terpisah — cek `apps/api/src/routes/v1/progress.ts:260-263` (`hasPermission('progress:manage') || mandor-owner`) dan `cash.ts:41` (`requirePermission('cash:view')`). Konsisten dengan §Technical Debt yang menandai ini "SUDAH DIPERBAIKI". Istilah "Remediation 3.6" **tidak jadi fase** — diselesaikan sebagai bugfix biasa.
- ~~(c) smoke test login manual~~ → ✅ **RESOLVED**: 4 role login-verified (PR #12, [gate-1a-preconditions-response.md § #2b](gate-1a-preconditions-response.md)).

Migration tracking drift: 058 mismatch nyata diperbaiki; rekonsiliasi 52→70. Sisa (043-047 apply, tracking 073) non-blocking.

**Verdict: CONDITIONAL PASS → sekarang efektif PASS untuk lingkup engineering** — nol implementation gap, Gate approved. Item 1B (enum→FK) & governance ke depan bukan bagian 1A.
