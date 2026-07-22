# Numbering Glossary — Peta Penomoran Otoritatif

**Kedudukan:** Sumber kebenaran tunggal untuk penomoran fase/program di seluruh repo enterprise-architecture. Dibuat karena dua skema penomoran koeksis dan sempat menimbulkan kebingungan (Program vs Sub-Fase). Dokumen lain **MUST** merujuk peta ini, bukan mendefinisikan ulang.

## Dua sumbu penomoran (koeksis, bukan kontradiksi)

| Sumbu | Dipakai di | Rentang |
|---|---|---|
| **Phase 0-9** | [../04-roadmap-governance-and-delivery.md](../04-roadmap-governance-and-delivery.md) — roadmap makro asli | Phase 0 (repo) … Phase 9 (SaaS) |
| **Program A-F** | [00-executive-delivery-vision.md](00-executive-delivery-vision.md), Blueprint — unit delivery | A … F |
| **Sub-Fase 1A-1D** | [../Phase1/02-target-architecture.md](../Phase1/02-target-architecture.md) — pemecahan **di dalam Program A** | 1A … 1D |

## Pemetaan Program ↔ Phase (otoritatif)

| Program | = Phase | Nama |
|---|---|---|
| **A** | Phase 1 | Foundation Hardening |
| B | Phase 2 | Dynamic Engine Platform (Workflow) |
| C | Phase 3 | Domain Depth (termasuk CECEP) |
| D | Phase 4, 7 | Enterprise Readiness |
| E | Phase 5, 6 | Automation & Intelligence |
| F | Phase 8, 9 | SaaS Transformation |

## Sub-Fase di dalam Program A (= Phase 1)

| Sub-Fase | Nama | Status |
|---|---|---|
| **1A** | Security Foundation (Permission Engine, RLS, Audit, Test, CI/CD) | ✅ SELESAI (Gate 1A→1B approved 2026-07-23) |
| **1B** | Configuration Foundation (Config Engine, Menu Registry, Module/Feature Flags) | 🔜 kickoff (paket [../Implementation-Kickoff-Sub-Fase-1B/](../Implementation-Kickoff-Sub-Fase-1B/README.md)) |
| **1C** | Workflow Foundation (Workflow Registry, Approval/SLA/Escalation) | ⏳ belum |
| **1D** | Platform Foundation (Structured Logging, Correlation ID, Metrics) | ⏳ belum |

**Catatan:** Program B (Phase 2, Workflow Engine generik) ≠ Sub-Fase 1C (Workflow Foundation di dalam Program A). Keduanya soal workflow tapi lapis berbeda — 1C adalah fondasi di Program A, Program B adalah engine penuh. Lihat [../Phase1/02-target-architecture.md § 1C](../Phase1/02-target-architecture.md) vs [01-capability-to-task-mapping.md](01-capability-to-task-mapping.md).

## Konvensi penulisan (WAJIB di dokumen baru)

- **Selalu tulis "Sub-Fase 1B"**, jangan "1B" telanjang — mencegah kebingungan dengan Program B.
- Tulis "Program A (= Phase 1)" saat pertama kali menyebut di sebuah dokumen.
- Epic di dalam Sub-Fase pakai nama fungsional (mis. "Epic Configuration Engine"), bukan nomor global.

---

*Dibuat 2026-07-23 saat kickoff Sub-Fase 1B, menutup kebingungan penomoran yang muncul di recon Gate 1A→1B.*
