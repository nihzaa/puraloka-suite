# 07 — Release & Rollback Plan (Sub-Fase 1B)

## Strategi branch/merge

- Branch per Epic: `feature/1b1-configuration-engine`, `feature/1b2-menu-registry`, `feature/1b3-module-feature-flags`, `feature/1b4-role-enum-migration`.
- PR kecil per Epic (atau per slice bermakna). CI hijau wajib sebelum merge.
- 1B.1-1B.3: merge otonom saat CI hijau (Green-Zone, AUTOPILOT §4).
- 1B.4: **DANGER GATE + ack founder** sebelum eksekusi (Red-Line #1); merge tetap butuh CI hijau + smoke test.

## Rollback per migration

| Migration | Rollback | Risiko |
|---|---|---|
| 075 company_settings | `DROP TABLE company_settings CASCADE` + revert tax-calculation.ts ke hardcode | Nol (additive; 8 test jadi jaring calc) |
| 076 menu_registry | `DROP TABLE menu_items CASCADE` + revert sidebar.tsx ke JSX (git) | Rendah (UI; JSX lama di git history) |
| 077 module_feature_flags | `DROP TABLE modules, feature_flags CASCADE` | Nol (additive; existing default ON) |
| 078 users_role_fk_expand | `ALTER TABLE users DROP COLUMN role_id` (enum masih hidup — expand belum sentuh read path) | **Rendah selama expand** (dual-write) |
| 0XX users_role_contract | re-create enum dari `001_extensions_and_enums.sql` + backfill balik | **TINGGI** — hanya setelah observasi stabil; independent review wajib |

## Prinsip (dari 1A)

- **Expand-contract** untuk 1B.4: kolom `role_id` baru hidup berdampingan enum, read path pindah bertahap, drop enum hanya setelah stabil.
- **Verifikasi DDL via koneksi baru** (pelajaran F5.5).
- **Migration additive (075-077) aman deploy kapan saja**; contract 1B.4 butuh maintenance window + backup verified (pola contract Epic 4).
- Data yang di-backfill (role→role_id di 1B.4): rollback butuh mapping balik — didesain sebelum expand, bukan diasumsikan.
