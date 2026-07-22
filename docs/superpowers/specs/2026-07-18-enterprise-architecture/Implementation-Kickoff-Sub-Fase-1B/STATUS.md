# Sub-Fase 1B — Status Ledger

**Single source of truth** status eksekusi Sub-Fase 1B (Configuration Foundation / Program A). Living document — diupdate tiap Epic/slice ditutup. Penomoran: [../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md](../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md).

Legenda: ✅ selesai & merged · 🚧 in progress · 🔵 pending · ⏳ pending unblocked · ⚠️ catatan · 🔴 Red-Line (butuh ack)

## Prasyarat
Gate 1A→1B ✅ approved (2026-07-23). Migration mulai 075 (074 terakhir).

## Epic

| Epic | Nama | Status | Bukti |
|---|---|---|---|
| **1B.1** | Configuration Engine | 🔵 pending | migration 075 company_settings + tax config; execution di [02 § 1B.1](02-sub-fase-1b-sequence.md) (skip execution/ — additive lugas) |
| **1B.2** | Menu Registry | 🔵 pending | migration 076 menu_items + sidebar DB-driven; [execution/1b2-menu-registry.md](execution/1b2-menu-registry.md) |
| **1B.3** | Module Registry & Feature Flags | 🔵 pending | migration 077 modules+feature_flags; execution di [02 § 1B.3](02-sub-fase-1b-sequence.md) (skip execution/ — CRUD standar) |
| — | **Gate Core 1B** | 🔵 pending | 1B.1-1B.3 selesai + additive-first terverifikasi |
| **1B.4** | users.role enum→FK | 🔴 **Red-Line, pending keputusan founder (Opsi A/B)** | [execution/1b4-role-enum-migration.md](execution/1b4-role-enum-migration.md); DANGER GATE sebelum eksekusi |

## Day-1 (sebelum migration 1B pertama)
- ⏳ Rekonsiliasi drift tracking 073 (append-only trigger di DB, belum di `schema_migrations`)
- ⏳ Baseline test 119 hijau + catat menu per-role (additive-first baseline)

## Keputusan founder menggantung
- **1B.4 Opsi A (migrasi enum→FK) vs Opsi B (tunda)** — tidak memblokir core 1B (1B.1-1B.3). Detail [02 § 1B.4](02-sub-fase-1b-sequence.md).
- **Strategi caching menu 1B.2** (revalidate-on-change vs TTL).

## Disiplin (AUTOPILOT)
Green-Zone 1B.1-1B.3 (additive, otonom, merge saat CI hijau) · Red-Line #1 di 1B.4 (DANGER GATE) · Red-Line #2 di 1B.1 F1.3 (tax calc, DANGER GATE ringan) · additive-first: nol fitur/menu existing hilang · verify column-level + koneksi baru.

---
*Dibuat 2026-07-23 (kickoff). Diupdate tiap slice.*
