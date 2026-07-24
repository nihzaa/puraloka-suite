# Sub-Fase 1B — Status Ledger

**Single source of truth** status eksekusi Sub-Fase 1B (Configuration Foundation / Program A). Living document — diupdate tiap Epic/slice ditutup. Penomoran: [../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md](../Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md).

Legenda: ✅ selesai & merged · 🚧 in progress · 🔵 pending · ⏳ pending unblocked · ⚠️ catatan · 🔴 Red-Line (butuh ack)

## Prasyarat
Gate 1A→1B ✅ approved (2026-07-23). Migration mulai 075 (074 terakhir).

## Epic

| Epic | Nama | Status | Bukti |
|---|---|---|---|
| **1B.1** | Configuration Engine | ✅ **SELESAI & MERGED** (PR #15, `4bfc257`) | migration 075 company_settings + seed tax; `GET/PUT /settings/config`; `utils/config.ts` (cache+fallback); F1.3 rate injection (DANGER GATE approved — `calculateTax` +param rate opsional, tetap pure). Angka invoice tak berubah (seed = konstanta), E2E ubah 0.11→0.12 terbaca lalu restore. |
| **1B.2** | Menu Registry | ✅ **SELESAI & MERGED** (PR #16, `bb7a5f0`) | migration 076 menu_items (`required_permissions TEXT[]` match-ANY, parent_id); `GET /menu`; sidebar DB-driven + cache. **Paritas per-role 4/4 IDENTIK** (admin/pm/mandor/client), [execution/1b2-visual-parity-evidence.md](execution/1b2-visual-parity-evidence.md). sidebar 0 error TS baru. |
| **1B.3** | Module Registry & Feature Flags | ✅ **SELESAI & MERGED** (PR #17, `d29e8bc`) | migration 077 modules+feature_flags; 14 modul seed enabled (additive-first); `GET/PATCH /modules`, `GET/PUT /feature-flags`; `utils/modules.ts` (isModuleEnabled FAIL-OPEN, isFeatureEnabled FAIL-CLOSED). Integrasi flag LIVE ditunda (registry siap). |
| — | **Gate Core 1B** | ✅ **LULUS** | 1B.1-1B.3 merged + additive-first terverifikasi (14 modul ON, 4/4 menu role identik, angka pajak tak berubah). |
| **1B.4** | users.role enum→FK | ✅ **SELESAI** (PR #18) | Red-Line #1, DANGER GATE Opsi A **penuh** disetujui founder. Expand-Contract: 078 EXPAND (role_id FK+backfill+dual-write) · 079 SWAP (auth_role FK, identik enum 23 user) · 080 CONTRACT (drop enum+type, role_id NOT NULL, read path FK-only). **Verifikasi public 7/7 TUNTAS: role custom `direktur` assignable** (tujuan tercapai). |

## Day-1 (sebelum migration 1B pertama)
- ✅ Rekonsiliasi drift tracking 073 (append-only trigger, ditandai di `schema_migrations`)
- ✅ Baseline test 119 hijau + menu per-role tercatat (additive-first baseline)

## Keputusan founder — SEMUA RESOLVED
- ✅ **1B.4 Opsi A penuh** (EXPAND+SWAP+CONTRACT) — dijalankan, enum di-drop, role custom assignable.
- ✅ **Strategi caching menu 1B.2** — cache localStorage + revalidate-on-mount.
- ✅ **F1.3 rate injection** (Red-Line #2 finansial) — `calculateTax` tetap pure, caller inject tarif dari config.

## Migration applied ke dev
075 company_settings · 076 menu_items · 077 modules+feature_flags · 078 role_id EXPAND · 079 auth_role SWAP · 080 CONTRACT (drop enum) — semua applied + tracked di `schema_migrations` (6/6). Twin folder `db/migrations` + `supabase/migrations` sinkron.

## Penutupan fase
Audit lengkap: [PHASE-1B-COMPLETION-AUDIT.md](PHASE-1B-COMPLETION-AUDIT.md) — 18 kriteria bukti diverifikasi ulang, **drift check 080 = NOL DRIFT**, smoke per-role 4/4 + direktur assignable, 2 lesson learned (quirk pooler DDL, sequencing migration destruktif di DB bersama).

## Sub-Fase 1C — Workflow Engine: DIBANGUN lalu DIRETIRE (2026-07-24)

- **Dibangun:** foundation 081 (`workflow_definitions/states/transitions/instances` + `approval_delegations`) + dual-write shadow modul kasbon (082) & change_order (083). Kolom `status` tabel sumber TETAP otoritatif; `workflow_instances` hanya bayangan.
- **Diretire (CONTRACT, PR #34):** setelah 2 migrasi modul dengan engine stabil, founder memilih fase CONTRACT. **Rekonsiliasi NOL divergensi** dibuktikan (kasbon 56/56, change_order 2/2, nol orphan) → kode dual-write + 7 modul dihapus; kolom `status` sumber = satu-satunya sumber kebenaran. **Behavior-preserving.**
- **Tabel yatim:** migration 092 sempat drop tabel (over-reach) → dikembalikan 093 (keputusan drop ditahan founder). Temuan terbuka: **AUDIT_REPORT OPEN-2**; keputusan & rasional: **[ADR-006](../Engineering-Constitution/adr/ADR-006-retire-workflow-engine-shadow.md)**.
- **Kapan revive:** hanya dengan bukti kebutuhan approval multi-langkah (mis. PO berjenjang, SLA/eskalasi) — ADR baru, bukan default. Approval satu-langkah dijawab permission derive-capability (ADR-004).

## Disiplin (AUTOPILOT)
Green-Zone 1B.1-1B.3 (additive, otonom, merge saat CI hijau) · Red-Line #1 di 1B.4 (DANGER GATE) · Red-Line #2 di 1B.1 F1.3 (tax calc, DANGER GATE ringan) · additive-first: nol fitur/menu existing hilang · verify column-level + koneksi baru.

## Tooling — Plugin Memori (bukan bagian scope 1B, dicatat di sini karena file paling aktif)

- **episodic-memory**: file ter-clone (`obra/episodic-memory` v1.4.2) + `npm install` sukses (exit 0, native build `better-sqlite3`/`sqlite-vec` OK) ke `~/.claude/plugins/manual-install/episodic-memory/` — **PENDING RESTART** proses Claude Code untuk aktivasi (bukan lewat mekanisme `/plugin` resmi, jadi belum terdaftar di `installed_plugins.json`; MCP tool belum tentu ter-load sampai dikonfirmasi sesi baru). Jangan anggap aktif sampai sesi baru mengonfirmasi tool `mcp__episodic-memory__*` muncul.
- **remember**: **BELUM TERPASANG** — butuh command `/plugin install remember@Digital-Process-Tools` interaktif dari terminal fisik, tidak bisa lewat remote-control atau Bash (tidak ada jalur manual terdokumentasi untuk repo ini).

---
*Dibuat 2026-07-23 (kickoff). Diupdate tiap slice.*
