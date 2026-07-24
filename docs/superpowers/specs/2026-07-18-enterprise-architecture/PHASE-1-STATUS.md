# PHASE 1 — Core Platform Foundation · Status Rollup

**Rollup tunggal** seluruh Phase 1 (= Program A). Menutup celah "tidak ada status Phase 1 terpadu" — sebelumnya status tersebar di audit per sub-fase. Penomoran: Program A–F ↔ Phase 1–9; di dalam Program A ada Sub-Fase 1A–1D. Peta otoritatif: [Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md](Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md).

Legenda: ✅ selesai & merged · ♻️ dibangun lalu diretire · 📌 backlog · 🔵 pending

| Sub-Fase | Nama | Status | Bukti (single source) |
|---|---|---|---|
| **1A** | Foundation Hardening (test suite, CI/CD, permission engine, RLS sync, audit trail) | ✅ **selesai & merged** | [Implementation-Kickoff/STATUS.md](Implementation-Kickoff/STATUS.md) · [PHASE-1A-COMPLETION-AUDIT.md](Implementation-Kickoff/PHASE-1A-COMPLETION-AUDIT.md) |
| **1B** | Configuration Foundation (1B.1 config engine · 1B.2 menu registry · 1B.3 module/feature-flags · 1B.4 role enum→FK) | ✅ **selesai & merged** | [Sub-Fase-1B/STATUS.md](Implementation-Kickoff-Sub-Fase-1B/STATUS.md) · [PHASE-1B-COMPLETION-AUDIT.md](Implementation-Kickoff-Sub-Fase-1B/PHASE-1B-COMPLETION-AUDIT.md) |
| **1C** | Workflow Engine (strangler-fig) | ♻️ **DIBANGUN lalu DIRETIRE** — bukan "delivered" | [ADR-006](Engineering-Constitution/adr/ADR-006-retire-workflow-engine-shadow.md) · [runbook-kasbon-workflow-cutover.md](Implementation-Kickoff-Sub-Fase-1B/runbook-kasbon-workflow-cutover.md) (§ OUTCOME) |
| **1D** | Observability (structured logging · correlation ID · metrics prep) | ✅ **selesai** | [PHASE-1D-COMPLETION-AUDIT.md](Implementation-Kickoff-Sub-Fase-1B/PHASE-1D-COMPLETION-AUDIT.md) |
| **Config-First** (AKTA 0–5) | Lintas-cutting di atas 1A–1D: re-audit authorization, financial engine effective-dated, denda, master data (units/kategori/tujuan kasbon), governance | ✅ **selesai & merged** (#24–#38) | [CONFIG-FIRST-COMPLETION-AUDIT.md](Implementation-Kickoff-Sub-Fase-1B/CONFIG-FIRST-COMPLETION-AUDIT.md) · [HARDCODE-CENSUS.md](../../../../HARDCODE-CENSUS.md) |

## Catatan penting

- **1C bukan fitur selesai.** Workflow engine dibangun (kasbon + change_order dual-write) lalu **diretire** via fase CONTRACT (rekonsiliasi nol divergensi terbukti; permission derive-capability ADR-004 cukup untuk approval satu-langkah). Tabel workflow di-drop (migration 095). Revival butuh ADR baru + bukti kebutuhan approval multi-langkah. Lihat ADR-006.
- **RLS: defense-in-depth, TIDAK di live path.** Diverifikasi memfilter baris per role di level DB, TAPI API pakai service_role (bypass RLS) dan web hanya auth+storage. Detail jujur: [PHASE-1-COMPLETION-AUDIT.md](PHASE-1-COMPLETION-AUDIT.md) § RLS.
- **Backlog produk (bukan hutang Phase 1):** OPEN-1 (`kasbons.status='settled'` — mekanisme settlement belum dibangun). Lihat AUDIT_REPORT.

## Verdict

Lihat **[PHASE-1-COMPLETION-AUDIT.md](PHASE-1-COMPLETION-AUDIT.md)** untuk verdict objektif (Phase 1 layak dinyatakan tuntas + prasyarat masuk Phase 2).

---
*Dibuat 2026-07-24 (penutupan Phase 1). Rollup — detail tetap di audit per sub-fase yang ditaut.*
