# Sub-Fase 1B — Status Ledger

**Single source of truth** status eksekusi Sub-Fase 1B (Configuration Foundation / Program A). Living document — diupdate tiap Epic/slice ditutup. Penomoran: [../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md](../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md).

Legenda: ✅ selesai & merged · 🚧 in progress · 🔵 pending · ⏳ pending unblocked · ⚠️ catatan · 🔴 Red-Line (butuh ack)

## Prasyarat
Gate 1A→1B ✅ approved (2026-07-23). Migration mulai 075 (074 terakhir).

## Epic

| Epic | Nama | Status | Bukti |
|---|---|---|---|
| **1B.1** | Configuration Engine | ✅ **Selesai (PR #15, CI hijau)** — belum merge | migration 075 company_settings + seed tax; `GET/PUT /settings/config`; `utils/config.ts` (cache+fallback); F1.3 rate injection (DANGER GATE approved — `calculateTax` +param rate opsional, tetap pure). 123 test hijau. Angka invoice tak berubah (seed = konstanta), E2E ubah 0.11→0.12 terbaca lalu restore. |
| **1B.2** | Menu Registry | ✅ **Selesai (PR #16, CI hijau)** — belum merge | migration 076 menu_items (`required_permissions TEXT[]` match-ANY, parent_id); `GET /menu`; sidebar DB-driven + cache. **Paritas per-role 4/4 IDENTIK** (admin/pm/mandor/client), [execution/1b2-visual-parity-evidence.md](execution/1b2-visual-parity-evidence.md). sidebar 0 error TS baru. |
| **1B.3** | Module Registry & Feature Flags | ✅ **Selesai (PR #17, CI running)** — belum merge | migration 077 modules+feature_flags; 14 modul seed enabled (additive-first); `GET/PATCH /modules`, `GET/PUT /feature-flags`; `utils/modules.ts` (isModuleEnabled FAIL-OPEN, isFeatureEnabled FAIL-CLOSED). Integrasi flag LIVE ditunda (registry siap). 126 test hijau (+7 gating). |
| — | **Gate Core 1B** | ⏳ **unblocked** — tunggu merge #15→#16→#17 | 1B.1-1B.3 selesai + additive-first terverifikasi (14 modul ON, 4/4 menu role identik, angka pajak tak berubah). Merge urut karena penomoran migration 075→076→077. |
| **1B.4** | users.role enum→FK | 🔴 **Red-Line, pending keputusan founder (Opsi A/B)** | [execution/1b4-role-enum-migration.md](execution/1b4-role-enum-migration.md); DANGER GATE sebelum eksekusi |

## Day-1 (sebelum migration 1B pertama)
- ✅ Rekonsiliasi drift tracking 073 (append-only trigger, ditandai di `schema_migrations`)
- ✅ Baseline test 119 hijau + menu per-role tercatat (additive-first baseline)

## Keputusan founder menggantung
- **1B.4 Opsi A (migrasi enum→FK) vs Opsi B (tunda)** — tidak memblokir core 1B (1B.1-1B.3 selesai). Detail [02 § 1B.4](02-sub-fase-1b-sequence.md). **← titik berhenti berikutnya (DANGER GATE).**
- ✅ **Strategi caching menu 1B.2** — RESOLVED: cache localStorage + revalidate-on-mount (fetch tiap sidebar mount, cache untuk render instan).

## Migration applied ke dev (belum merge)
075 company_settings · 076 menu_items · 077 modules+feature_flags — semua applied + tracked di `schema_migrations`. Twin folder `db/migrations` + `supabase/migrations` sinkron.

## Disiplin (AUTOPILOT)
Green-Zone 1B.1-1B.3 (additive, otonom, merge saat CI hijau) · Red-Line #1 di 1B.4 (DANGER GATE) · Red-Line #2 di 1B.1 F1.3 (tax calc, DANGER GATE ringan) · additive-first: nol fitur/menu existing hilang · verify column-level + koneksi baru.

## Tooling — Plugin Memori (bukan bagian scope 1B, dicatat di sini karena file paling aktif)

- **episodic-memory**: file ter-clone (`obra/episodic-memory` v1.4.2) + `npm install` sukses (exit 0, native build `better-sqlite3`/`sqlite-vec` OK) ke `~/.claude/plugins/manual-install/episodic-memory/` — **PENDING RESTART** proses Claude Code untuk aktivasi (bukan lewat mekanisme `/plugin` resmi, jadi belum terdaftar di `installed_plugins.json`; MCP tool belum tentu ter-load sampai dikonfirmasi sesi baru). Jangan anggap aktif sampai sesi baru mengonfirmasi tool `mcp__episodic-memory__*` muncul.
- **remember**: **BELUM TERPASANG** — butuh command `/plugin install remember@Digital-Process-Tools` interaktif dari terminal fisik, tidak bisa lewat remote-control atau Bash (tidak ada jalur manual terdokumentasi untuk repo ini).

---
*Dibuat 2026-07-23 (kickoff). Diupdate tiap slice.*
