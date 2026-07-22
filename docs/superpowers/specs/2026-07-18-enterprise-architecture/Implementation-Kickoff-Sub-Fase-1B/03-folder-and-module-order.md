# 03 — Folder & Module Order (Sub-Fase 1B)

Urutan file/modul presisi, berdasarkan struktur repo terkini (verified 2026-07-23).

## 1B.1 Configuration Engine

| # | File | Aksi |
|---|---|---|
| 1 | `db/migrations/075_company_settings.sql` (+ kembar `supabase/`) | Baru — tabel + seed tax rate |
| 2 | `apps/api/src/routes/v1/settings.ts` | Extend — endpoint GET/PUT config |
| 3 | `apps/api/src/lib/tax-calculation.ts` | Ubah — baca rate dari config + fallback (Red-Line #2) |
| 4 | `apps/api/src/lib/__tests__/tax-calculation.test.ts` | Extend — test config-driven + fallback |
| 5 | `apps/web/app/(dashboard)/pengaturan/page.tsx` | Extend — tab Konfigurasi Pajak (skill `frontend-design`) |

## 1B.2 Menu Registry

| # | File | Aksi |
|---|---|---|
| 1 | `db/migrations/076_menu_registry.sql` (+ kembar) | Baru — `menu_items` + seed 1:1 dari sidebar |
| 2 | `apps/api/src/routes/v1/menu.ts` | Baru — GET /menu (role-aware) |
| 3 | `apps/web/lib/api.ts` atau hook baru | Fetch + cache menu |
| 4 | `apps/web/components/sidebar.tsx` | Refactor — renderer DB-driven, visibility `perms.has()` dipertahankan |
| 5 | test menu render + count | Baru |

## 1B.3 Module Registry & Feature Flags

| # | File | Aksi |
|---|---|---|
| 1 | `db/migrations/077_module_feature_flags.sql` (+ kembar) | Baru — `modules` + `feature_flags`, seed existing=ON |
| 2 | `apps/api/src/routes/v1/modules.ts` | Baru — CRUD flag |
| 3 | integrasi flag-check | Additive di API/UI |

## 1B.4 enum→FK (Red-Line, jika Opsi A)

| # | File | Aksi |
|---|---|---|
| 1 | `db/migrations/078_users_role_fk_expand.sql` | Baru — kolom `role_id` FK (expand) |
| 2 | backfill + swap read path | Bertahap |
| 3 | `db/migrations/0XX_users_role_contract.sql` | Contract (drop enum) — **setelah** stabil |

Detail 1B.4: [execution/1b4-role-enum-migration.md](execution/1b4-role-enum-migration.md).

## Prinsip

- Migration kembar `db/migrations/` + `supabase/migrations/` (konsisten 1A).
- UI baru → skill `frontend-design` dulu (AUTOPILOT §1).
- Additive-first: nol objek existing dihapus di 1B.1-1B.3.
