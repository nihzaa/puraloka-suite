# 06 — Testing Execution Plan (Sub-Fase 1B)

Infrastruktur test dari 1A (Vitest + RLS harness + TEST_SCHEMA per-run) dipakai ulang.

## Kapan tiap jenis test dijalankan

| Jenis | Kapan | Gate |
|---|---|---|
| **Unit — config read** | Saat 1B.1 F1.3 (tax config integration) | 8 test tax existing **MUST tetap hijau** + test config-driven + test fallback (config kosong → default, tidak pernah 0) |
| **Integration — settings API** | Saat 1B.1 F1.2 | GET/PUT config; write butuh `settings:manage` (mandor/client 403) |
| **RLS — config/menu/module** | Tiap tabel baru (075-077) | Via RLS harness: admin write OK, non-authorized ditolak |
| **Menu render** | Saat 1B.2 F2.4 | Count menu = existing (~24); visibility per-role identik sebelum/sesudah refactor |
| **Feature flag toggle** | Saat 1B.3 F3.4 | Toggle flag mengubah behavior; modul existing default ON |
| **Regression (full suite)** | Tiap PR | Seluruh suite (119+ test) hijau |
| **Smoke test per-role live** | Gate Core 1B + gate 1B.4 | Login 4 role betulan, negative test 403, additive-first (menu tak hilang) |

## Prinsip khusus 1B

- **1B.1 finansial:** test tax **MUST** membuktikan hasil identik untuk config default (regression guard calc pajak — Red-Line #2).
- **1B.2 additive-first:** test **MUST** assert jumlah menu terlihat per-role SAMA sebelum/sesudah DB-driven (nol menu hilang).
- **1B.4 (jika Opsi A):** smoke test 4 role + role custom, verifikasi `auth_role()` RLS tetap resolve benar setelah enum→FK (nol lockout — pelajaran lockout 1A).

## Target coverage

Pure function baru (config resolver) target ≥90% (pola 1A). Bukan blanket coverage.
