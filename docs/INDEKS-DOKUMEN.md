# INDEKS DOKUMEN — seluruh isi `docs/`

> **Dihasilkan otomatis** oleh `apps/api/scripts/gen-indeks-docs.mjs`.
> Jangan disunting tangan — jalankan ulang skripnya.

Founder bertanya dua kali apakah SELURUH dokumen sudah masuk roadmap.
Jawaban pertama saya menyembunyikan angka sebenarnya di balik "dikecualikan
beralasan" — padahal alasannya aturan yang saya buat sendiri. Indeks ini
memuat **setiap** dokumen, tanpa kecuali.

## Peran, dan apa artinya

| Peran | Arti | Apa yang dilakukan |
|---|---|---|
| **antrean** | memuat pekerjaan yang belum dikerjakan | masuk ROADMAP, dikerjakan menurut §"URUTAN EKSEKUSI" |
| **acuan** | aturan/keputusan yang dirujuk saat bekerja | dibaca saat mengerjakan hal terkait; tak "selesai" |
| **riwayat** | catatan fase yang sudah lewat | bukti apa yang pernah terjadi; jangan dikutip sebagai rencana |

**Total 257 dokumen** — antrean 11 · acuan 188 · riwayat 58.

Kolom **RM** = disebut langsung di `ROADMAP.md`.

### `docs/`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [API_ENDPOINTS](API_ENDPOINTS.md) | acuan |  | API Endpoints — Puraloka Suite |
| [DATABASE_SCHEMA](DATABASE_SCHEMA.md) | acuan |  | Database Schema — Puraloka Suite |
| [DEVELOPMENT_LOG](DEVELOPMENT_LOG.md) | riwayat | ✓ | Puraloka Suite — Development Log |
| [ERP_MASTER_PLAN](ERP_MASTER_PLAN.md) | riwayat | ✓ | Puraloka Suite — ERP Master Plan |
| [ERP-KONTRAKTOR-TAKSONOMI-MENU](ERP-KONTRAKTOR-TAKSONOMI-MENU.md) | riwayat | ✓ | Taksonomi Menu ERP Kontraktor — Referensi Lengkap (TERVERIFIKASI) |
| [KEPUTUSAN-MULTI-COMPANY](KEPUTUSAN-MULTI-COMPANY.md) | acuan | ✓ | Keputusan Arsitektur: Multi-Company (dan Arsip Multi-Currency) |
| [KEPUTUSAN-SCOPE-ERP-AI](KEPUTUSAN-SCOPE-ERP-AI.md) | acuan | ✓ | KEPUTUSAN SCOPE — ERP Kontraktor Lengkap, Terintegrasi, Berbasis AI |
| [MODULE_STATUS](MODULE_STATUS.md) | riwayat |  | Module Status Tracker |
| [PETA-PRIORITAS-ERP](PETA-PRIORITAS-ERP.md) | acuan | ✓ | PETA PRIORITAS ERP — Dokumen Induk Pemersatu |
| [PROTOKOL-SESI](PROTOKOL-SESI.md) | acuan |  | PROTOKOL SESI — baca ini dulu, di setiap sesi, sebelum aksi apa pun |
| [RANCANGAN-DIKERJAKAN](RANCANGAN-DIKERJAKAN.md) | acuan |  | Sub-menu berisiko yang digarap sebelum disiplin rancangan berlaku |
| [ROADMAP](ROADMAP.md) | riwayat | ✓ | ROADMAP — Puraloka Suite |

### `docs/audit/2026-08-02`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [00-EXECUTIVE-SUMMARY](audit/2026-08-02/00-EXECUTIVE-SUMMARY.md) | acuan |  | 00 — RINGKASAN EKSEKUTIF |
| [01-INVENTORY](audit/2026-08-02/01-INVENTORY.md) | acuan |  | 01 — INVENTARISASI FAKTUAL |
| [02-DOCS-INVENTORY](audit/2026-08-02/02-DOCS-INVENTORY.md) | acuan |  | 02 — AUDIT DOKUMENTASI |
| [03-CODE-QUALITY](audit/2026-08-02/03-CODE-QUALITY.md) | acuan |  | 03 — AUDIT KUALITAS KODE |
| [04-SECURITY](audit/2026-08-02/04-SECURITY.md) | acuan |  | 04 — AUDIT KEAMANAN |
| [05-DATABASE](audit/2026-08-02/05-DATABASE.md) | acuan |  | 05 — AUDIT DATABASE & DATA |
| [06-API](audit/2026-08-02/06-API.md) | acuan |  | 06 — AUDIT API / ROUTE |
| [07-FRONTEND-UX](audit/2026-08-02/07-FRONTEND-UX.md) | acuan |  | 07 — AUDIT FRONTEND / UI / UX |
| [08-TEST-CI](audit/2026-08-02/08-TEST-CI.md) | acuan |  | 08 — TEST, CI, DX |
| [09-VISION-GAP](audit/2026-08-02/09-VISION-GAP.md) | acuan |  | 09 — VISI & GAP ANALYSIS |
| [10-SCORECARD-RISKS](audit/2026-08-02/10-SCORECARD-RISKS.md) | acuan |  | 10 — PENILAIAN & PRIORITAS |
| [KOREKSI](audit/2026-08-02/KOREKSI.md) | acuan | ✓ | KOREKSI — Angka Audit yang Diverifikasi Ulang |

### `docs/execution`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [CHARTER](execution/CHARTER.md) | acuan |  | CHARTER — Sumber Kewenangan Eksekusi Otonom |
| [CI-BUKTI](execution/CI-BUKTI.md) | acuan | ✓ | CI-BUKTI — Setiap Penjaga Terbukti Bisa MERAH |
| [CI-PROFIL](execution/CI-PROFIL.md) | acuan | ✓ | CI-PROFIL — Durasi Nyata, Diukur Bukan Diperkirakan |
| [COVERAGE-BASELINE](execution/COVERAGE-BASELINE.md) | acuan |  | Coverage Baseline — Angka Sesungguhnya (C-6) |
| [GOLDEN-FILE-INVESTIGASI](execution/GOLDEN-FILE-INVESTIGASI.md) | acuan | ✓ | Investigasi Golden File — Angka Jangkar (C-5 / R-005) |
| [JOURNAL](execution/JOURNAL.md) | riwayat | ✓ | JOURNAL — Catatan Sesi |
| [LEDGER-DIFF](execution/LEDGER-DIFF.md) | acuan |  | LEDGER-DIFF — Buku Migrasi vs Artefak Fisik |
| [RATIFIKASI](execution/RATIFIKASI.md) | riwayat | ✓ | RATIFIKASI — Satu-satunya Berkas yang Perlu Dibaca Founder |

### `docs/superpowers/plans`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [2026-07-15-warm-clay-design-system](superpowers/plans/2026-07-15-warm-clay-design-system.md) | acuan | ✓ | Warm Clay Design System (Phase 1) Implementation Plan |

### `docs/superpowers/specs`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [2026-07-15-warm-clay-redesign-design](superpowers/specs/2026-07-15-warm-clay-redesign-design.md) | acuan |  | Warm Clay — Redesign UI/UX Puraloka Suite (2026) |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [00-vision-and-business-architecture](superpowers/specs/2026-07-18-enterprise-architecture/00-vision-and-business-architecture.md) | acuan |  | 00 — Vision & Business Architecture |
| [01-application-and-data-architecture](superpowers/specs/2026-07-18-enterprise-architecture/01-application-and-data-architecture.md) | acuan |  | 01 — Application & Data Architecture |
| [02-security-and-compliance-architecture](superpowers/specs/2026-07-18-enterprise-architecture/02-security-and-compliance-architecture.md) | acuan |  | 02 — Security & Compliance Architecture |
| [03-platform-and-intelligence-architecture](superpowers/specs/2026-07-18-enterprise-architecture/03-platform-and-intelligence-architecture.md) | acuan |  | 03 — Platform & Intelligence Architecture |
| [04-roadmap-governance-and-delivery](superpowers/specs/2026-07-18-enterprise-architecture/04-roadmap-governance-and-delivery.md) | acuan |  | 04 — Roadmap, Governance & Delivery |
| [05-design-system-and-ui-ux-architecture](superpowers/specs/2026-07-18-enterprise-architecture/05-design-system-and-ui-ux-architecture.md) | acuan | ✓ | 05 — Design System & UI/UX Architecture |
| [06-agentic-ai-and-automation-architecture](superpowers/specs/2026-07-18-enterprise-architecture/06-agentic-ai-and-automation-architecture.md) | antrean | ✓ | 06 — Agentic AI & Automation Architecture |
| [ERP-KONTRAKTOR-TAKSONOMI-MENU](superpowers/specs/2026-07-18-enterprise-architecture/ERP-KONTRAKTOR-TAKSONOMI-MENU.md) | antrean | ✓ | Taksonomi Menu ERP Kontraktor — Referensi Lengkap (TERVERIFIKASI) |
| [JOURNAL-READY-METADATA-DESIGN](superpowers/specs/2026-07-18-enterprise-architecture/JOURNAL-READY-METADATA-DESIGN.md) | riwayat |  | Journal-Ready Metadata — Rancangan (REPORT ONLY, belum diterapkan) |
| [PHASE-1-COMPLETION-AUDIT](superpowers/specs/2026-07-18-enterprise-architecture/PHASE-1-COMPLETION-AUDIT.md) | riwayat | ✓ | PHASE 1 — Completion Audit (Core Platform Foundation) |
| [PHASE-1-STATUS](superpowers/specs/2026-07-18-enterprise-architecture/PHASE-1-STATUS.md) | riwayat | ✓ | PHASE 1 — Core Platform Foundation · Status Rollup |
| [PHASE-2-STATUS](superpowers/specs/2026-07-18-enterprise-architecture/PHASE-2-STATUS.md) | riwayat |  | Phase 2 (Program B) — Configuration Driven Platform · STATUS |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/CECEP`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [00-phase-a-repository-discovery](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/00-phase-a-repository-discovery.md) | acuan |  | CECEP — Phase A: Repository Discovery |
| [01-phase-b-cost-engineering-discovery](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/01-phase-b-cost-engineering-discovery.md) | acuan |  | CECEP — Phase B: Construction Cost Engineering Discovery (v2 — Lengkap) |
| [02-phase-b5-core-cost-engineering-architecture](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/02-phase-b5-core-cost-engineering-architecture.md) | acuan |  | CECEP — Phase B.5: Core Cost Engineering Architecture (v4 — Final) |
| [03-phase-c-problem-discovery](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/03-phase-c-problem-discovery.md) | acuan |  | CECEP — Phase C: Problem Discovery (First Principles Analysis) — v3 |
| [03b-phase-c5-core-domain-discovery](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/03b-phase-c5-core-domain-discovery.md) | riwayat |  | CECEP — Phase C.5: Core Domain Discovery |
| [04-architecture-constitution](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/04-architecture-constitution.md) | riwayat |  | CECEP — Architecture Constitution |
| [04a-adr-traceability-log](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/04a-adr-traceability-log.md) | acuan |  | CECEP — ADR Traceability Log |
| [05-phase-d-capability-architecture](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/05-phase-d-capability-architecture.md) | acuan |  | CECEP — Phase D: Capability Architecture |
| [05b-phase-d1-capability-validation-freeze](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/05b-phase-d1-capability-validation-freeze.md) | riwayat |  | CECEP — Phase D.1: Capability Validation & Freeze |
| [06-phase-e-calculation-strategy](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/06-phase-e-calculation-strategy.md) | acuan |  | CECEP — Phase E: Calculation Strategy (Enterprise Calculation Architecture) |
| [06b-phase-e1-calculation-validation-freeze](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/06b-phase-e1-calculation-validation-freeze.md) | riwayat |  | CECEP — Phase E.1: Calculation Validation & Freeze |
| [07-phase-f-enterprise-data-model](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/07-phase-f-enterprise-data-model.md) | acuan |  | CECEP — Phase F: Enterprise Information Architecture (Canonical Enterprise Dat |
| [07b-phase-f1-information-validation-freeze](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/07b-phase-f1-information-validation-freeze.md) | riwayat |  | CECEP — Phase F.1: Information Validation & Freeze |
| [07c-orchestration-readiness-assessment](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/07c-orchestration-readiness-assessment.md) | acuan |  | CECEP — Orchestration Readiness Assessment |
| [11-architecture-roadmap-index](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/11-architecture-roadmap-index.md) | acuan |  | CECEP — Architecture Roadmap Index |
| [12-glossary](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/12-glossary.md) | acuan |  | CECEP — Glossary |
| [29-context-integrity-audit](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/29-context-integrity-audit.md) | acuan |  | CECEP — Context Integrity Audit |
| [30-cecep-constitution](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/30-cecep-constitution.md) | riwayat |  | CECEP Constitution |
| [31-adr-cecep-framework-separation](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/31-adr-cecep-framework-separation.md) | acuan |  | ADR — Separation of CECEP Domain and Enterprise Architecture Framework |
| [32-cecep-roadmap-v2](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/32-cecep-roadmap-v2.md) | acuan |  | CECEP Roadmap v2 — Restructured Post-Audit |
| [33-roadmap-integrity-audit](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/33-roadmap-integrity-audit.md) | riwayat |  | CECEP — Roadmap Integrity Audit |
| [34-roadmap-definition-of-done](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/34-roadmap-definition-of-done.md) | riwayat |  | CECEP Roadmap V2 — Definition of Done |
| [35-phase3-capability-architecture](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/35-phase3-capability-architecture.md) | acuan |  | CECEP — Phase 3: Capability Architecture |
| [36-phase3-capability-boundary-validation](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/36-phase3-capability-boundary-validation.md) | acuan |  | CECEP — Phase 3 Capability Boundary Validation |
| [37-phase3-capability-interaction-map](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/37-phase3-capability-interaction-map.md) | acuan |  | CECEP — Phase 3: Capability Interaction Map |
| [38-phase3-domain-readiness-assessment](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/38-phase3-domain-readiness-assessment.md) | acuan |  | CECEP — Phase 3 → Domain Readiness Assessment |
| [39-phase-transition-notice-discovery-closed](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/39-phase-transition-notice-discovery-closed.md) | riwayat |  | CECEP — Phase Transition Notice: Discovery Closed, Derivation Mode Begins |
| [40-architecture-derivation-constitution](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/40-architecture-derivation-constitution.md) | acuan |  | CECEP — Architecture Derivation Constitution |
| [41-evidence-hierarchy](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/41-evidence-hierarchy.md) | riwayat |  | CECEP — Evidence Hierarchy |
| [42-phase5-calculation-strategy-architecture](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/42-phase5-calculation-strategy-architecture.md) | riwayat |  | CECEP — Phase 5: Calculation Strategy Architecture |
| [43-phase5-derivation-audit](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/43-phase5-derivation-audit.md) | acuan |  | CECEP — Phase 5 Derivation Audit |
| [44-phase6-derive-domain-model](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/44-phase6-derive-domain-model.md) | riwayat |  | CECEP — Phase 6: Derive Domain Model |
| [45-phase7-data-architecture](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/45-phase7-data-architecture.md) | riwayat |  | CECEP — Phase 7: Data Architecture |
| [46-phase8-integration-architecture](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/46-phase8-integration-architecture.md) | riwayat |  | CECEP — Phase 8: Integration Architecture |
| [47-phase9-automation-architecture](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/47-phase9-automation-architecture.md) | riwayat |  | CECEP — Phase 9: Automation Architecture |
| [48-phase10-ai-cost-engineering](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/48-phase10-ai-cost-engineering.md) | riwayat |  | CECEP — Phase 10: AI Cost Engineering |
| [49-phase11-implementation-roadmap](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/49-phase11-implementation-roadmap.md) | riwayat |  | CECEP — Phase 11: Implementation Roadmap |
| [50-phase12-documentation-package](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/50-phase12-documentation-package.md) | riwayat |  | CECEP — Phase 12: Documentation Package |
| [51-final-audit-and-main-roadmap-position](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/51-final-audit-and-main-roadmap-position.md) | riwayat |  | CECEP — Final Audit (12-Fase Roadmap V2) & Posisi di Main Roadmap Puraloka Sui |
| [52-gap-closure-cashflow-baseline-analytics](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/52-gap-closure-cashflow-baseline-analytics.md) | acuan |  | CECEP — Gap Closure: Cashflow Forecast, Cost Baseline, Executive Analytics |
| [AHSP-EDITION-BUILDER-DESIGN](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/AHSP-EDITION-BUILDER-DESIGN.md) | antrean | ✓ | CECEP — Sumbu EDISI + Builder + Alur Item-Baru (RANCANGAN, belum dibangun) |
| [AHSP-GOLDEN-PROVENANCE](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/AHSP-GOLDEN-PROVENANCE.md) | acuan |  | Provenance Angka Golden — 21 test engine CECEP |
| [AHSP-RECON-REPORT](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/AHSP-RECON-REPORT.md) | acuan |  | AHSP Workbook Recon — SE Bina Konstruksi No. 47/SE/Dk/2026 |
| [AHSP-TEARDOWN-DEFECTS](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/AHSP-TEARDOWN-DEFECTS.md) | acuan |  | AHSP Workbook — Teardown Total + Daftar Cacat Excel |
| [CI-ISOLATION-SETUP](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/CI-ISOLATION-SETUP.md) | acuan | ✓ | CI Isolation — Proyek Supabase CI Terpisah (aksi founder) |
| [DISCOVERY-RAP-VS-REALISASI](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/DISCOVERY-RAP-VS-REALISASI.md) | acuan | ✓ | Discovery — Rekonsiliasi Pagu RAP vs Realisasi Belanja (ROADMAP #8) |
| [GOLDEN-FILE-SPEC](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/GOLDEN-FILE-SPEC.md) | acuan | ✓ | Golden-File Paritas — Kebutuhan dari Founder |
| [MATERIAL-RAP-COMPANY-UI-DESIGN](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/MATERIAL-RAP-COMPANY-UI-DESIGN.md) | acuan |  | CECEP — Material Take-off · RAP/Pagu · AHSP Company · UI (RANCANGAN, belum dib |
| [NEXT-EXEC-PREP](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/NEXT-EXEC-PREP.md) | acuan |  | CECEP — Persiapan Eksekusi (D10 gate · CI isolation · konstanta) |
| [SE47-VS-CIBULUH-ANALYSIS](superpowers/specs/2026-07-18-enterprise-architecture/CECEP/SE47-VS-CIBULUH-ANALYSIS.md) | acuan |  | SE 47/2026 vs Cibuluh — Analisis Perbandingan (4d, REPORT ONLY) |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [GLOSSARY](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/GLOSSARY.md) | acuan |  | Glossary — Definisi Istilah Otoritatif |
| [IMPROVEMENT-PLAN-v1.1](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/IMPROVEMENT-PLAN-v1.1.md) | acuan |  | Engineering Constitution v1.1 — Improvement Plan |
| [README](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/README.md) | acuan |  | Puraloka Suite — Engineering Constitution |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/00-principles`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [00-engineering-principles](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/00-principles/00-engineering-principles.md) | acuan |  | 00 — Engineering Principles |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/01-foundations`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [01-coding-standards](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/01-foundations/01-coding-standards.md) | acuan |  | 01 — Coding Standards |
| [02-folder-architecture](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/01-foundations/02-folder-architecture.md) | acuan |  | 02 — Folder Architecture |
| [22-project-conventions](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/01-foundations/22-project-conventions.md) | acuan |  | 22 — Project Conventions |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/02-architecture`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [03-clean-architecture-rules](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/02-architecture/03-clean-architecture-rules.md) | acuan |  | 03 — Clean Architecture Rules |
| [04-domain-driven-design-rules](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/02-architecture/04-domain-driven-design-rules.md) | acuan |  | 04 — Domain-Driven Design Rules |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/03-core-implementation`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [05-database-engineering-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/03-core-implementation/05-database-engineering-standard.md) | acuan |  | 05 — Database Engineering Standard |
| [06-api-engineering-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/03-core-implementation/06-api-engineering-standard.md) | acuan |  | 06 — API Engineering Standard |
| [07-security-engineering-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/03-core-implementation/07-security-engineering-standard.md) | acuan |  | 07 — Security Engineering Standard |
| [34-schema-migration-policy](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md) | acuan |  | 34 — Schema Migration Policy |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/04-quality-and-observability`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [08-testing-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/04-quality-and-observability/08-testing-standard.md) | acuan |  | 08 — Testing Standard |
| [09-performance-budget](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/04-quality-and-observability/09-performance-budget.md) | acuan |  | 09 — Performance Budget |
| [10-observability-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/04-quality-and-observability/10-observability-standard.md) | acuan |  | 10 — Observability Standard |
| [28-error-handling-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/04-quality-and-observability/28-error-handling-standard.md) | acuan |  | 28 — Error Handling Standard |
| [29-logging-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/04-quality-and-observability/29-logging-standard.md) | acuan |  | 29 — Logging Standard |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/05-team-process`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [11-devsecops-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/05-team-process/11-devsecops-standard.md) | acuan |  | 11 — DevSecOps Standard |
| [14-git-workflow-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/05-team-process/14-git-workflow-standard.md) | acuan |  | 14 — Git Workflow Standard |
| [15-code-review-checklist](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/05-team-process/15-code-review-checklist.md) | acuan |  | 15 — Code Review Checklist |
| [16-definition-of-ready](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/05-team-process/16-definition-of-ready.md) | acuan |  | 16 — Definition of Ready |
| [17-definition-of-done](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/05-team-process/17-definition-of-done.md) | acuan |  | 17 — Definition of Done |
| [20-checklist-before-merge](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/05-team-process/20-checklist-before-merge.md) | acuan |  | 20 — Checklist Before Merge |
| [21-checklist-before-release](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/05-team-process/21-checklist-before-release.md) | acuan |  | 21 — Checklist Before Release |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/06-governance`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [18-never-build-list](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/06-governance/18-never-build-list.md) | acuan |  | 18 — Never Build List |
| [19-architecture-decision-record-guide](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/06-governance/19-architecture-decision-record-guide.md) | acuan |  | 19 — Architecture Decision Record Guide |
| [23-dependency-management](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/06-governance/23-dependency-management.md) | acuan |  | 23 — Dependency Management |
| [24-documentation-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/06-governance/24-documentation-standard.md) | acuan |  | 24 — Documentation Standard |
| [25-versioning-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/06-governance/25-versioning-standard.md) | acuan |  | 25 — Versioning Standard |
| [30-technical-debt-policy](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/06-governance/30-technical-debt-policy.md) | acuan |  | 30 — Technical Debt Policy |
| [31-refactoring-policy](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/06-governance/31-refactoring-policy.md) | acuan |  | 31 — Refactoring Policy |
| [32-library-selection-policy](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/06-governance/32-library-selection-policy.md) | acuan |  | 32 — Library Selection Policy |
| [33-package-approval-policy](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/06-governance/33-package-approval-policy.md) | acuan |  | 33 — Package Approval Policy |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/07-domain-specific`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [12-ui-engineering-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/07-domain-specific/12-ui-engineering-standard.md) | acuan |  | 12 — UI Engineering Standard |
| [26-feature-flag-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/07-domain-specific/26-feature-flag-standard.md) | acuan |  | 26 — Feature Flag Standard |
| [27-configuration-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/07-domain-specific/27-configuration-standard.md) | acuan |  | 27 — Configuration Standard |
| [35-event-driven-guideline](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/07-domain-specific/35-event-driven-guideline.md) | acuan |  | 35 — Event-Driven Guideline |
| [36-ai-coding-guideline](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/07-domain-specific/36-ai-coding-guideline.md) | acuan |  | 36 — AI Coding Guideline |
| [40-ai-governance-and-agent-engineering-standard](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/07-domain-specific/40-ai-governance-and-agent-engineering-standard.md) | acuan |  | 40 — AI Governance & Agent Engineering Standard |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/08-metrics-and-closing`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [37-engineering-metrics](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/08-metrics-and-closing/37-engineering-metrics.md) | acuan |  | 37 — Engineering Metrics |
| [38-security-checklist](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/08-metrics-and-closing/38-security-checklist.md) | acuan |  | 38 — Security Checklist |
| [39-final-engineering-manifesto](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/08-metrics-and-closing/39-final-engineering-manifesto.md) | acuan |  | 39 — Final Engineering Manifesto |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [ADR-000-batching-strategy](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-000-batching-strategy.md) | acuan |  | ADR-000 — Strategi Batching Engineering Constitution |
| [ADR-001-structure-and-governance-model](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-001-structure-and-governance-model.md) | acuan |  | ADR-001 — Struktur, Hierarki, dan Model Governance Engineering Constitution |
| [ADR-002-enforcement-levels-and-template](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-002-enforcement-levels-and-template.md) | acuan |  | ADR-002 — Enforcement Levels dan Template Standar |
| [ADR-004-permission-is-architecture-role-is-configuration](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-004-permission-is-architecture-role-is-configuration.md) | acuan |  | ADR-004 — Permission adalah Arsitektur, Role adalah Konfigurasi |
| [ADR-005-rls-ownership-via-security-definer-helpers](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-005-rls-ownership-via-security-definer-helpers.md) | acuan |  | ADR-005 — RLS Ownership Checks via SECURITY DEFINER Helpers |
| [ADR-006-retire-workflow-engine-shadow](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-006-retire-workflow-engine-shadow.md) | acuan |  | ADR-006 — Pensiun Workflow Engine (dual-write shadow diretire, permission deri |
| [ADR-007-configurable-approval-engine](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-007-configurable-approval-engine.md) | acuan |  | ADR-007 — Approval Engine yang SELURUHNYA Config (revival ber-bukti dari ADR-0 |
| [ADR-008-notification-routing-engine](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-008-notification-routing-engine.md) | acuan |  | ADR-008 — Notification Routing Engine (penerima notifikasi jadi konfigurasi) |
| [ADR-009-cecep-persistence-derivation](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-009-cecep-persistence-derivation.md) | acuan |  | ADR-009 — Persistensi CECEP diturunkan, bukan dikarang (mulai Cost Code Regist |
| [ADR-011-multi-tenant-strategy](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-011-multi-tenant-strategy.md) | acuan |  | ADR-011 — Strategi Multi-Tenant Puraloka Suite |
| [ADR-011-T1-AUDIT-KLASIFIKASI-TABEL](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-011-T1-AUDIT-KLASIFIKASI-TABEL.md) | acuan |  | T1 — Audit Klasifikasi 94 Tabel (lampiran ADR-011) |
| [ADR-011-T3-AUDIT-PRA-EKSEKUSI](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-011-T3-AUDIT-PRA-EKSEKUSI.md) | acuan |  | T3 — Dokumen Audit Pra-Eksekusi (menunggu ack tertulis founder) |
| [ADR-011-T4-AUDIT-CELAH-TENANCY](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/adr/ADR-011-T4-AUDIT-CELAH-TENANCY.md) | acuan |  | T4 — Audit Celah Isolasi Tenant (temuan audit keamanan 2026-07-29) |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/amendments`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [2026-07-18-v1.1-freeze](superpowers/specs/2026-07-18-enterprise-architecture/Engineering-Constitution/amendments/2026-07-18-v1.1-freeze.md) | riwayat |  | Amandemen — Engineering Constitution v1.1 (Freeze) |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [00-executive-summary](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/00-executive-summary.md) | acuan |  | Implementation Kickoff — 00. Executive Summary |
| [01-implementation-readiness](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/01-implementation-readiness.md) | acuan |  | Implementation Kickoff — 01. Implementation Readiness Scorecard |
| [02-phase-1a-sequence](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/02-phase-1a-sequence.md) | acuan |  | Implementation Kickoff — 02. Phase 1A Sequence |
| [03-folder-and-module-order](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/03-folder-and-module-order.md) | riwayat |  | Implementation Kickoff — 03. Folder and Module Order |
| [04-database-migration-plan](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/04-database-migration-plan.md) | acuan |  | Implementation Kickoff — 04. Database Migration Plan |
| [05-feature-implementation-order](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/05-feature-implementation-order.md) | acuan |  | Implementation Kickoff — 05. Feature Implementation Order |
| [06-testing-execution-plan](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/06-testing-execution-plan.md) | acuan |  | Implementation Kickoff — 06. Testing Execution Plan |
| [07-release-and-rollback-plan](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/07-release-and-rollback-plan.md) | acuan |  | Implementation Kickoff — 07. Release and Rollback Plan |
| [08-day-one-checklist](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/08-day-one-checklist.md) | antrean | ✓ | Implementation Kickoff — 08. Day One Checklist |
| [09-definition-of-ready](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/09-definition-of-ready.md) | acuan |  | Implementation Kickoff — 09. Definition of Ready |
| [10-go-no-go-checklist](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/10-go-no-go-checklist.md) | acuan |  | Implementation Kickoff — 10. Go/No-Go Checklist |
| [ARCHITECTURE-REVIEW-GATE-1A](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/ARCHITECTURE-REVIEW-GATE-1A.md) | acuan |  | Architecture Review Gate — Sub-Fase 1A |
| [contract-gate-epic-4](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/contract-gate-epic-4.md) | riwayat |  | Epic 4 — Contract Phase Gate (RLS) |
| [epic-5-decisions](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/epic-5-decisions.md) | acuan |  | Epic 5 — Audit Trail Helper: Keputusan & Temuan |
| [gate-1a-preconditions-response](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/gate-1a-preconditions-response.md) | acuan |  | Gate 1A→1B — Respons 5 Prasyarat Founder |
| [PHASE-1A-COMPLETION-AUDIT](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/PHASE-1A-COMPLETION-AUDIT.md) | riwayat |  | Sub-Fase 1A — Final Engineering Completion Audit |
| [role-literal-reaudit-2026-07-24](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/role-literal-reaudit-2026-07-24.md) | acuan |  | Re-Audit Role-Literal Authorization (AKTA 0) — 2026-07-24 |
| [STATUS](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/STATUS.md) | acuan | ✓ | Sub-Fase 1A — Status Ledger |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [00-executive-summary](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/00-executive-summary.md) | acuan |  | 00 — Executive Summary (Sub-Fase 1B) |
| [01-implementation-readiness](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/01-implementation-readiness.md) | acuan |  | 01 — Implementation Readiness (Sub-Fase 1B) |
| [02-sub-fase-1b-sequence](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/02-sub-fase-1b-sequence.md) | acuan |  | 02 — Sub-Fase 1B Sequence |
| [03-folder-and-module-order](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/03-folder-and-module-order.md) | acuan |  | 03 — Folder & Module Order (Sub-Fase 1B) |
| [04-database-migration-plan](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/04-database-migration-plan.md) | acuan |  | 04 — Database Migration Plan (Sub-Fase 1B) |
| [05-feature-implementation-order](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/05-feature-implementation-order.md) | acuan |  | 05 — Feature Implementation Order (Sub-Fase 1B) |
| [06-testing-execution-plan](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/06-testing-execution-plan.md) | acuan |  | 06 — Testing Execution Plan (Sub-Fase 1B) |
| [07-release-and-rollback-plan](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/07-release-and-rollback-plan.md) | acuan |  | 07 — Release & Rollback Plan (Sub-Fase 1B) |
| [08-day-one-checklist](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/08-day-one-checklist.md) | acuan | ✓ | 08 — Day One Checklist (Sub-Fase 1B) |
| [09-definition-of-ready](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/09-definition-of-ready.md) | acuan |  | 09 — Definition of Ready (Sub-Fase 1B) |
| [10-go-no-go-checklist](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/10-go-no-go-checklist.md) | acuan |  | 10 — Go/No-Go Checklist (Sub-Fase 1B) |
| [CONFIG-FIRST-COMPLETION-AUDIT](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/CONFIG-FIRST-COMPLETION-AUDIT.md) | riwayat |  | Config-First Program — Completion Audit (AKTA 0–5 + CONTRACT + A7) |
| [GATE-3-MANIFEST](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/GATE-3-MANIFEST.md) | acuan |  | Gate 3 Manifest — Kickoff Sub-Fase 1B (Configuration Foundation) |
| [PHASE-1B-COMPLETION-AUDIT](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/PHASE-1B-COMPLETION-AUDIT.md) | riwayat |  | Sub-Fase 1B — Completion Audit |
| [PHASE-1D-COMPLETION-AUDIT](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/PHASE-1D-COMPLETION-AUDIT.md) | riwayat |  | Sub-Fase 1D — Completion Audit (Platform Foundation / Observability) |
| [README](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/README.md) | acuan |  | Kickoff Package — Sub-Fase 1B (Configuration Foundation) |
| [runbook-financial-config](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/runbook-financial-config.md) | acuan |  | Runbook — Financial Config Engine (effective-dated) |
| [runbook-kasbon-workflow-cutover](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/runbook-kasbon-workflow-cutover.md) | riwayat | ✓ | Runbook — Cutover Kasbon ke Workflow Engine (produksi) |
| [STATUS](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/STATUS.md) | antrean | ✓ | Sub-Fase 1B — Status Ledger |
| [SUB-FASE-1B-COMPLETION-AUDIT](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/SUB-FASE-1B-COMPLETION-AUDIT.md) | riwayat | ✓ | Sub-Fase 1B — Completion Audit (SUPERSEDED) |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/execution`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [1b2-menu-registry](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/execution/1b2-menu-registry.md) | acuan |  | Execution Plan — 1B.2 Menu Registry |
| [1b2-visual-parity-evidence](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/execution/1b2-visual-parity-evidence.md) | acuan |  | 1B.2 Menu Registry — Bukti Paritas Visual (F2.4) |
| [1b4-role-enum-migration](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff-Sub-Fase-1B/execution/1b4-role-enum-migration.md) | riwayat |  | Execution Plan — 1B.4 users.role enum → FK (RED-LINE #1) |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/execution`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [architecture-remediation-3.5-inline-authorization](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/execution/architecture-remediation-3.5-inline-authorization.md) | acuan |  | Architecture Remediation 3.5 — Inline Role-Based Authorization |
| [epic-3-execution-plan](superpowers/specs/2026-07-18-enterprise-architecture/Implementation-Kickoff/execution/epic-3-execution-plan.md) | riwayat |  | Epic 3 — Permission Engine Konsolidasi — Execution Plan |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [00-executive-delivery-vision](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/00-executive-delivery-vision.md) | acuan |  | 00 — Executive Delivery Vision, Delivery Principles, Program Structure |
| [01-capability-to-task-mapping](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/01-capability-to-task-mapping.md) | antrean | ✓ | 01 — Capability → Domain → Program → Initiative → Epic → Feature → Task Mappin |
| [02-master-dependency-graph](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/02-master-dependency-graph.md) | acuan |  | 02 — Master Dependency Graph, Critical Path Analysis, Parallel Development Str |
| [03-team-topology-and-resourcing](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/03-team-topology-and-resourcing.md) | acuan |  | 03 — Team Topology and Resourcing |
| [04-delivery-orchestration](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/04-delivery-orchestration.md) | acuan |  | 04 — Delivery Orchestration: Phase-by-Phase Plan, Milestones, Entry/Exit Crite |
| [05-risk-and-debt-orchestration](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/05-risk-and-debt-orchestration.md) | acuan |  | 05 — Risk Register Orchestration, Technical Debt Strategy, Refactoring Strateg |
| [06-engineering-delivery-mechanics](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/06-engineering-delivery-mechanics.md) | acuan |  | 06 — Engineering Delivery Mechanics: Migration, Release, Branching, Versioning |
| [07-quality-and-validation-gates](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/07-quality-and-validation-gates.md) | acuan |  | 07 — Testing Strategy Mapping, Security Validation Gates, Performance Validati |
| [08-platform-rollout-orchestration](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/08-platform-rollout-orchestration.md) | antrean | ✓ | 08 — Observability Rollout, AI & Automation Rollout, UI/UX Rollout |
| [09-saas-and-tenancy-readiness](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/09-saas-and-tenancy-readiness.md) | acuan |  | 09 — SaaS Readiness Strategy, Multi-company & Multi-tenant Readiness |
| [10-kpi-and-fitness-functions](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/10-kpi-and-fitness-functions.md) | acuan |  | 10 — KPI Engineering, KPI Product, KPI Business, Architecture Fitness Function |
| [11-decision-gates-and-change-management](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/11-decision-gates-and-change-management.md) | acuan |  | 11 — Decision Gates, Change Management Process, Continuous Improvement Process |
| [12-traceability-matrix](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/12-traceability-matrix.md) | acuan |  | 12 — Cross-Document Traceability Matrix & Master Capability Matrix Index |
| [13-implementation-kickoff-playbook](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/13-implementation-kickoff-playbook.md) | antrean | ✓ | 13 — Implementation Kickoff Playbook (Template Reusable, Bukan Kickoff Package |
| [NUMBERING-GLOSSARY](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/NUMBERING-GLOSSARY.md) | acuan |  | Numbering Glossary — Peta Penomoran Otoritatif |
| [README](superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/README.md) | acuan |  | Puraloka Suite — Master Delivery Blueprint |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/Phase1`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [00-current-state-audit](superpowers/specs/2026-07-18-enterprise-architecture/Phase1/00-current-state-audit.md) | acuan |  | Phase 1 — 00. Current State Audit |
| [01-gap-analysis](superpowers/specs/2026-07-18-enterprise-architecture/Phase1/01-gap-analysis.md) | antrean | ✓ | Phase 1 — 01. Gap Analysis |
| [02-target-architecture](superpowers/specs/2026-07-18-enterprise-architecture/Phase1/02-target-architecture.md) | antrean | ✓ | Phase 1 — 02. Target Architecture |
| [03-migration-strategy](superpowers/specs/2026-07-18-enterprise-architecture/Phase1/03-migration-strategy.md) | acuan |  | Phase 1 — 03. Migration Strategy |
| [04-risk-register](superpowers/specs/2026-07-18-enterprise-architecture/Phase1/04-risk-register.md) | acuan | ✓ | Phase 1 — 04. Risk Register |
| [05-rollout-plan](superpowers/specs/2026-07-18-enterprise-architecture/Phase1/05-rollout-plan.md) | acuan | ✓ | Phase 1 — 05. Rollout Plan |
| [06-test-strategy](superpowers/specs/2026-07-18-enterprise-architecture/Phase1/06-test-strategy.md) | acuan |  | Phase 1 — 06. Test Strategy |
| [07-security-review](superpowers/specs/2026-07-18-enterprise-architecture/Phase1/07-security-review.md) | acuan |  | Phase 1 — 07. Security Review |
| [08-observability-plan](superpowers/specs/2026-07-18-enterprise-architecture/Phase1/08-observability-plan.md) | antrean | ✓ | Phase 1 — 08. Observability Plan |
| [09-definition-of-done](superpowers/specs/2026-07-18-enterprise-architecture/Phase1/09-definition-of-done.md) | riwayat |  | Phase 1 — 09. Definition of Done |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/adr`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [ADR-003-master-delivery-blueprint-as-orchestration-layer](superpowers/specs/2026-07-18-enterprise-architecture/adr/ADR-003-master-delivery-blueprint-as-orchestration-layer.md) | acuan |  | ADR-003 — Master Delivery Blueprint sebagai Orchestration Layer, Bukan Roadmap |
| [ADR-011-T5c-AUDIT-PRA-EKSEKUSI](superpowers/specs/2026-07-18-enterprise-architecture/adr/ADR-011-T5c-AUDIT-PRA-EKSEKUSI.md) | acuan |  | ADR-011 T5c — Audit Pra-Eksekusi: Melepas service_role |
| [ADR-011-T9-RENCANA-L2-PENUH-UI](superpowers/specs/2026-07-18-enterprise-architecture/adr/ADR-011-T9-RENCANA-L2-PENUH-UI.md) | acuan |  | ADR-011 T9 — Rencana: L2 Penuh dari UI (kelola badan usaha tanpa SQL) |

### `docs/superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework`

| Dokumen | Peran | RM | Isi |
|---|---|:-:|---|
| [08-phase-g-enterprise-orchestration-architecture](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08-phase-g-enterprise-orchestration-architecture.md) | acuan |  | CECEP — Phase G: Enterprise Orchestration Architecture |
| [08a-enterprise-orchestration-philosophy](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) | riwayat |  | CECEP — Enterprise Orchestration Philosophy |
| [08b-phase-g0-orchestration-philosophy-validation](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08b-phase-g0-orchestration-philosophy-validation.md) | riwayat |  | CECEP — Phase G.0: Enterprise Orchestration Philosophy Validation |
| [08c-orchestration-rule-design](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08c-orchestration-rule-design.md) | riwayat |  | CECEP — Orchestration Rule Design |
| [08c-orchestration-rule-design-v2](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08c-orchestration-rule-design-v2.md) | riwayat |  | CECEP — Orchestration Rule Design v2 |
| [08d-rule-taxonomy-discovery](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08d-rule-taxonomy-discovery.md) | acuan |  | CECEP — Phase G-A: Rule Taxonomy Discovery |
| [08e-rule-meta-model-discovery](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08e-rule-meta-model-discovery.md) | acuan |  | CECEP — Phase G-B: Rule Meta Model Discovery |
| [08f-rule-storage-philosophy](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08f-rule-storage-philosophy.md) | acuan |  | CECEP — Phase G-C: Rule Storage Philosophy & Reuse Strategy |
| [08g-information-classification-discovery](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08g-information-classification-discovery.md) | acuan |  | CECEP — Enterprise Information Classification Discovery |
| [08h-information-characteristic-discovery](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08h-information-characteristic-discovery.md) | acuan |  | CECEP — Information Characteristic Discovery |
| [08i-rule-ontology-validation](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08i-rule-ontology-validation.md) | acuan |  | CECEP — Phase G-D: Rule Ontology Validation |
| [08j-discovery-completion-assessment](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08j-discovery-completion-assessment.md) | acuan |  | CECEP — Discovery Completion Assessment (Phase G, Rule Design) |
| [08k-phase-g1-rule-design-validation-freeze](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/08k-phase-g1-rule-design-validation-freeze.md) | riwayat |  | CECEP — Phase G.1: Orchestration Rule Design Validation & Freeze |
| [09-cecep-architecture-readiness-review-v2](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/09-cecep-architecture-readiness-review-v2.md) | acuan |  | CECEP — Architecture Readiness Review v2 |
| [10-phase-transition-g-to-h](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/10-phase-transition-g-to-h.md) | riwayat |  | CECEP — Phase Transition Brief: G → H |
| [13-working-methodology](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/13-working-methodology.md) | acuan |  | CECEP — Working Methodology |
| [14-phase-h-integration-discovery](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/14-phase-h-integration-discovery.md) | acuan |  | CECEP — Phase H: Integration Architecture Discovery |
| [15-phase-h1-reality-stress-validation](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/15-phase-h1-reality-stress-validation.md) | riwayat |  | CECEP — Phase H.1: Integration Reality Stress Validation & Freeze |
| [16-phase-transition-h-to-i](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/16-phase-transition-h-to-i.md) | riwayat |  | CECEP — Phase Transition Brief: H → I |
| [17-phase-i-ai-discovery](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/17-phase-i-ai-discovery.md) | acuan |  | CECEP — Phase I: AI Architecture Discovery |
| [18-phase-i1-ai-reality-stress-validation](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/18-phase-i1-ai-reality-stress-validation.md) | riwayat |  | CECEP — Phase I.1: AI Reality Stress Validation & Freeze |
| [19-phase-transition-i-to-j](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/19-phase-transition-i-to-j.md) | riwayat |  | CECEP — Phase Transition Brief: I → J |
| [20-phase-j-future-vision-discovery](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/20-phase-j-future-vision-discovery.md) | acuan |  | CECEP — Phase J: Future Vision Discovery |
| [21-phase-j1-epistemic-stress-validation](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/21-phase-j1-epistemic-stress-validation.md) | riwayat |  | CECEP — Phase J.1: Design Space Epistemic Stress Validation & Freeze |
| [22-phase-transition-j-to-k](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/22-phase-transition-j-to-k.md) | riwayat |  | CECEP — Phase Transition Brief: J → K |
| [23-phase-k-discovery-eligibility-test](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/23-phase-k-discovery-eligibility-test.md) | riwayat |  | CECEP — Phase K: Discovery Eligibility Test |
| [24-phase-k-design-contract](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/24-phase-k-design-contract.md) | acuan |  | CECEP — Design Contract for Phase K (Synthesis Design) |
| [25-phase-k6-relation-algebra-atom](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/25-phase-k6-relation-algebra-atom.md) | riwayat |  | CECEP — K.6: Relation Algebra — Atom Discovery & Minimal Algebra Test |
| [26-phase-k-full-design](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/26-phase-k-full-design.md) | riwayat |  | CECEP — Phase K: Full Design (Repository, Engines, Interaction, Validation, Fr |
| [27-phase-transition-k-to-l](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/27-phase-transition-k-to-l.md) | riwayat |  | CECEP — Phase Transition Brief: K → L |
| [28-phase-l-discovery-eligibility-test](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/28-phase-l-discovery-eligibility-test.md) | acuan |  | CECEP — Phase L: Discovery Eligibility Test |
| [README](superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/README.md) | acuan |  | Enterprise Architecture Discovery Framework |
