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
- **RLS — dipisah tegas (koreksi):** (a) **TABLE RLS = defense-in-depth DORMANT** (API service_role bypass; web tak query tabel) — terbukti memfilter per role di DB, tapi nol di live path. (b) **STORAGE RLS = LIVE PATH** (browser akses langsung anon key) — **sempat BOCOR** (anon baca semua file bucket privat) → **DITUTUP (PR #39, migration 097)**. Detail: [PHASE-1-COMPLETION-AUDIT.md](PHASE-1-COMPLETION-AUDIT.md) §4.
- **Otorisasi handler = satu-satunya penegak live** untuk data-via-API → kini **ber-jaring 22 test integrasi 403** (11 endpoint sensitif, mutation-tested) — PR #40, §4C.
- **Fitur foto sempat TIDAK PERNAH berfungsi** (bucket tak ada; 36 baris `project_photos` ternyata seed Unsplash) → **diperbaiki PR #40**, **diverifikasi ulang PR #41** yang menemukan 2 cacat lagi: `bodyLimit` base64 (foto 2MB ditolak 413 sebelum validasi) + all-or-nothing yang bisa menghilangkan laporan mandor bersinyal buruk. Kini: log tetap tersimpan meski foto gagal + **retry attach**. CLAUDE.md dikoreksi.
- **Retry-attach diverifikasi lagi (PR #42):** sempat NOL ownership check (bisa menautkan foto ke log orang lain) + gate perbaikannya sempat gagal-tertutup senyap (bug enum) — keduanya dipatch, kini mutation-tested dua arah.
- **Backlog produk (bukan hutang Phase 1):** OPEN-1 (`kasbons.status='settled'` — mekanisme settlement belum dibangun). Lihat AUDIT_REPORT.

## Verdict

✅ **PHASE 1 (Program A) DINYATAKAN TUNTAS** — **7 temuan ditutup & diverifikasi** lewat 4 putaran verifikasi berlapis:
- **#39** storage RLS bocor (anon baca semua file bucket privat)
- **#40** fitur foto tak pernah jalan · jaring otorisasi 403 nol
- **#41** `bodyLimit` base64 (foto 2MB ditolak sebelum validasi) · all-or-nothing yang bisa menghilangkan laporan mandor
- **#42** retry-attach nol ownership check · gate perbaikannya gagal-tertutup senyap

Tiap putaran verifikasi menemukan cacat baru pada perbaikan putaran sebelumnya — semua dipatch + **mutation-tested**. Bukti objektif + prasyarat Phase 2: **[PHASE-1-COMPLETION-AUDIT.md](PHASE-1-COMPLETION-AUDIT.md)**.

---
*Dibuat 2026-07-24 (penutupan Phase 1). Rollup — detail tetap di audit per sub-fase yang ditaut.*
