# 12 — Cross-Document Traceability Matrix & Master Capability Matrix Index

**Kedudukan dokumen ini:** Orkestrasi Baru sepenuhnya — tidak diminta eksplisit di 35-item brief asli, diminta user di pesan susulan sebagai "mission control" yang mengorkestrasi seluruh repository. Ini adalah **index tunggal** yang menjawab "di mana X dibahas?" lintas seluruh corpus dokumen (7 Architecture Repository + 10 Phase1 + 44 Engineering Constitution + 1 ADR top-level + 14 Blueprint + **52 CECEP + 29 Enterprise Architecture Framework**, ditambahkan pasca-planning CECEP selesai) tanpa memindahkan atau mengubah isi satu pun file sumber.

---

## 1. Cara Memakai Matrix Ini

Matrix di bawah dikelompokkan per **pertanyaan** yang biasa diajukan (bukan per dokumen — pembaca datang dengan pertanyaan, bukan tahu dulu nama filenya). Setiap baris memetakan pertanyaan ke **lokasi paling otoritatif** — jika sebuah topik dibahas di beberapa tempat dengan sudut pandang berbeda (arsitektur vs eksekusi vs aturan kode), ketiganya dicantumkan dengan perbedaannya dijelaskan singkat.

## 2. "Apa yang dibangun?" — Architecture Repository (doc 00-06)

| Pertanyaan | Lokasi Otoritatif |
|---|---|
| Modul/kapabilitas apa saja yang ada, dan prioritasnya? | [00-vision-and-business-architecture.md § Module Catalog & Tiering](../00-vision-and-business-architecture.md#module-catalog--tiering) |
| Bagaimana modul dikelompokkan jadi domain bisnis? | [00-vision-and-business-architecture.md § Domain Map & Bounded Contexts](../00-vision-and-business-architecture.md#domain-map--bounded-contexts) |
| Bagaimana data dan service disusun secara teknis? | [01-application-and-data-architecture.md](../01-application-and-data-architecture.md) |
| Apa ancaman keamanan dan bagaimana mitigasinya? | [02-security-and-compliance-architecture.md](../02-security-and-compliance-architecture.md) |
| Bagaimana performa, observability, automation platform didesain? | [03-platform-and-intelligence-architecture.md](../03-platform-and-intelligence-architecture.md) |
| Apa roadmap Phase 0-9, dan kenapa urutannya begini? | [04-roadmap-governance-and-delivery.md](../04-roadmap-governance-and-delivery.md) |
| Bagaimana desain visual/interaksi (UI/UX) diatur? | [05-design-system-and-ui-ux-architecture.md](../05-design-system-and-ui-ux-architecture.md) |
| Apa katalog AI agent dan automation (140 item)? | [06-agentic-ai-and-automation-architecture.md](../06-agentic-ai-and-automation-architecture.md) |
| Apa saja yang secara sengaja TIDAK akan dibangun? | [04-roadmap-governance-and-delivery.md § Never Build List](../04-roadmap-governance-and-delivery.md#never-build-list) (juga: [Engineering-Constitution/06-governance/18-never-build-list.md](../Engineering-Constitution/06-governance/18-never-build-list.md) — versi aturan kode yang mengoperasionalkannya) |

## 2b. "Bagaimana CECEP (Cost Intelligence Core) didesain?" — CECEP Planning (52 file) + Enterprise Architecture Framework (29 file)

CECEP adalah isi utama [Phase 3 roadmap besar](../04-roadmap-governance-and-delivery.md#phase-3--construction-core-modules-termasuk-cecep) — planning arsitekturnya SELESAI penuh (12 fase, mode Derivation ketat) sebelum masuk fase eksekusi Phase 0-9 di atas.

| Pertanyaan | Lokasi Otoritatif |
|---|---|
| Apa roadmap 12-fase CECEP, dan status tiap fase? | [CECEP/32-cecep-roadmap-v2.md](../CECEP/32-cecep-roadmap-v2.md) — seluruh 12 fase Derived & Frozen |
| Apa misi asli CECEP, dan apakah roadmap masih selaras? | [CECEP/29-context-integrity-audit.md](../CECEP/29-context-integrity-audit.md) (audit awal, temuan drift G-K), [CECEP/51-final-audit-and-main-roadmap-position.md](../CECEP/51-final-audit-and-main-roadmap-position.md) (audit final pasca-12-fase, Traceability Matrix bisnis) |
| 16 Capability CECEP, boundary, dan interaksinya? | [CECEP/35](../CECEP/35-phase3-capability-architecture.md), [CECEP/36](../CECEP/36-phase3-capability-boundary-validation.md), [CECEP/37](../CECEP/37-phase3-capability-interaction-map.md) |
| 13 Domain Model CECEP (Aggregate Root, Business Responsibility)? | [CECEP/44-phase6-derive-domain-model.md](../CECEP/44-phase6-derive-domain-model.md) |
| AHSP 4 sumber, Calculation Strategy? | [CECEP/42-phase5-calculation-strategy-architecture.md](../CECEP/42-phase5-calculation-strategy-architecture.md) |
| ACL ke data existing Puraloka Suite (`project_expenses`/`kasbons`)? | [CECEP/46-phase8-integration-architecture.md](../CECEP/46-phase8-integration-architecture.md) |
| Urutan implementasi CECEP (4 milestone)? | [CECEP/49-phase11-implementation-roadmap.md](../CECEP/49-phase11-implementation-roadmap.md) |
| Governance/aturan derivasi yang mengikat seluruh planning CECEP? | [CECEP/30](../CECEP/30-cecep-constitution.md), [CECEP/40](../CECEP/40-architecture-derivation-constitution.md), [CECEP/41](../CECEP/41-evidence-hierarchy.md) |
| Kenapa ada folder terpisah "Enterprise Architecture Framework"? | [enterprise-architecture-framework/README.md](../enterprise-architecture-framework/README.md) — metodologi generik (Rule Engine, Integration Ontology, AI epistemology) yang ditemukan TIDAK spesifik CECEP saat audit, dipisah eksplisit ([CECEP/31-adr-cecep-framework-separation.md](../CECEP/31-adr-cecep-framework-separation.md)); **bukan bagian roadmap eksekusi manapun saat ini** — reusable candidate untuk modul Puraloka Suite lain di masa depan, belum diklaim proyek apa pun |
| Eksekusi CECEP di Master Delivery Blueprint? | [01-capability-to-task-mapping.md § Capability 6](01-capability-to-task-mapping.md#capability-6--cecep-cost-intelligence-core-domain-sales--pre-construction--project-delivery-program-c) |

## 3. "Bagaimana Phase 1 spesifik dikerjakan?" — Phase 1 Planning Package

| Pertanyaan | Lokasi Otoritatif |
|---|---|
| Kondisi kode hari ini (audit file:line presisi)? | [Phase1/00-current-state-audit.md](../Phase1/00-current-state-audit.md) |
| Apa gap antara kondisi hari ini dan target? | [Phase1/01-gap-analysis.md](../Phase1/01-gap-analysis.md) |
| Skema database target Sub-Fase 1A-1D? | [Phase1/02-target-architecture.md](../Phase1/02-target-architecture.md) |
| Bagaimana migrasi database dilakukan step-by-step? | [Phase1/03-migration-strategy.md](../Phase1/03-migration-strategy.md) |
| Risiko spesifik Sub-Fase 1A-1D (R1-R10)? | [Phase1/04-risk-register.md](../Phase1/04-risk-register.md) |
| Bagaimana urutan 12-fase (jika ada versi lain) dipetakan ke Phase 0-9? | [Phase1/05-rollout-plan.md](../Phase1/05-rollout-plan.md) |
| Framework test apa dan target coverage berapa? | [Phase1/06-test-strategy.md](../Phase1/06-test-strategy.md) |
| Checklist keamanan spesifik Phase 1? | [Phase1/07-security-review.md](../Phase1/07-security-review.md) |
| Bagaimana logging/metrics/traces di Sub-Fase 1D? | [Phase1/08-observability-plan.md](../Phase1/08-observability-plan.md) |
| Kapan Phase 1/Sub-Fase dianggap selesai? | [Phase1/09-definition-of-done.md](../Phase1/09-definition-of-done.md) |

## 4. "Bagaimana kode ditulis dengan benar?" — Engineering Constitution (39 file + README + GLOSSARY)

| Pertanyaan | Lokasi Otoritatif |
|---|---|
| Prinsip dasar apa yang mengikat semua kode? | [Engineering-Constitution/00-principles/00-engineering-principles.md](../Engineering-Constitution/00-principles/00-engineering-principles.md) |
| Konvensi penamaan, struktur folder? | [Engineering-Constitution/01-foundations/](../Engineering-Constitution/01-foundations/01-coding-standards.md) |
| Aturan Clean Architecture, DDD? | [Engineering-Constitution/02-architecture/](../Engineering-Constitution/02-architecture/03-clean-architecture-rules.md) |
| Standar database, API, security, migrasi skema? | [Engineering-Constitution/03-core-implementation/](../Engineering-Constitution/03-core-implementation/05-database-engineering-standard.md) |
| Standar testing, performa, observability, error handling, logging? | [Engineering-Constitution/04-quality-and-observability/](../Engineering-Constitution/04-quality-and-observability/08-testing-standard.md) |
| Proses Git, code review, DoR/DoD, checklist merge/release? | [Engineering-Constitution/05-team-process/](../Engineering-Constitution/05-team-process/14-git-workflow-standard.md) |
| ADR, dependency management, tech debt, refactoring, versioning? | [Engineering-Constitution/06-governance/](../Engineering-Constitution/06-governance/19-architecture-decision-record-guide.md) |
| Standar UI, feature flag, config, event-driven, AI coding? | [Engineering-Constitution/07-domain-specific/](../Engineering-Constitution/07-domain-specific/12-ui-engineering-standard.md) |
| Metrics, security checklist, manifesto penutup? | [Engineering-Constitution/08-metrics-and-closing/](../Engineering-Constitution/08-metrics-and-closing/37-engineering-metrics.md) |
| Definisi istilah teknis (Aggregate Root, RLS, HITL, dst.)? | [Engineering-Constitution/GLOSSARY.md](../Engineering-Constitution/GLOSSARY.md) |
| Kenapa Engineering Constitution terstruktur begini? | [Engineering-Constitution/adr/ADR-000, ADR-001, ADR-002](../Engineering-Constitution/adr/ADR-000-batching-strategy.md) |

## 5. "Kapan, dalam urutan apa, siapa mengerjakan?" — Master Delivery Blueprint (13 file, dokumen ini)

| Pertanyaan | Lokasi Otoritatif |
|---|---|
| Apa itu Program (pengelompokan Phase 0-9)? | [00-executive-delivery-vision.md](00-executive-delivery-vision.md) |
| Modul mana masuk Epic/Feature apa, di Program mana? | [01-capability-to-task-mapping.md](01-capability-to-task-mapping.md) |
| Program mana bergantung Program mana, dan kenapa? | [02-master-dependency-graph.md](02-master-dependency-graph.md) |
| Kapan tim perlu bertambah, dan bagaimana dibagi? | [03-team-topology-and-resourcing.md](03-team-topology-and-resourcing.md) |
| Milestone apa yang bisa didemokan, kapan Program mulai/selesai? | [04-delivery-orchestration.md](04-delivery-orchestration.md) |
| Risiko apa yang muncul dari urutan/paralelisme pekerjaan? | [05-risk-and-debt-orchestration.md](05-risk-and-debt-orchestration.md) |
| Bagaimana migrasi/release/branch/versioning/rollback bekerja lintas Program? | [06-engineering-delivery-mechanics.md](06-engineering-delivery-mechanics.md) |
| Gate testing/security/performance mana wajib di Program mana? | [07-quality-and-validation-gates.md](07-quality-and-validation-gates.md) |
| Kapan 140 automation dan AI agent boleh mulai dikerjakan? | [08-platform-rollout-orchestration.md](08-platform-rollout-orchestration.md) |
| Bagaimana tahu sudah "siap" L2/L3? | [09-saas-and-tenancy-readiness.md](09-saas-and-tenancy-readiness.md) |
| Bagaimana mengukur keberhasilan (engineering/product/business)? | [10-kpi-and-fitness-functions.md](10-kpi-and-fitness-functions.md) |
| Kapan butuh ADR, bagaimana Blueprint sendiri diupdate? | [11-decision-gates-and-change-management.md](11-decision-gates-and-change-management.md) |
| Bagaimana kickoff package Program 2-9 ditulis nanti (readiness score, day-one checklist, dst)? | [13-implementation-kickoff-playbook.md](13-implementation-kickoff-playbook.md) — template, diisi saat Program sebelumnya selesai, bukan sekarang |
| Di mana X dibahas? (pertanyaan yang menjawab dirinya sendiri) | Dokumen ini |

## 6. Master Capability Matrix Index — Modul ke Seluruh Lokasi Terkait

Untuk modul/kapabilitas berdampak tinggi, index berikut mengumpulkan **semua** lokasi yang membahasnya lintas 4 kelompok dokumen — nilai tambah dibanding Bagian 2-5 (yang dikelompokkan per kategori pertanyaan) adalah pandangan **vertikal** per satu kapabilitas:

### Permission Engine / RBAC
- **Apa:** [00-vision-and-business-architecture.md](../00-vision-and-business-architecture.md), [01-application-and-data-architecture.md § Dynamic Permission Engine](../01-application-and-data-architecture.md#dynamic-permission-engine)
- **Kondisi hari ini:** [Phase1/00-current-state-audit.md § 1](../Phase1/00-current-state-audit.md#1-permission-engine--current-state)
- **Gap:** [Phase1/01-gap-analysis.md § Gap 1](../Phase1/01-gap-analysis.md#gap-1--permission-engine-tiga-mekanisme-paralel)
- **Aturan kode:** [Engineering-Constitution/03-core-implementation/06-api-engineering-standard.md](../Engineering-Constitution/03-core-implementation/06-api-engineering-standard.md), [Engineering-Constitution/03-core-implementation/05-database-engineering-standard.md](../Engineering-Constitution/03-core-implementation/05-database-engineering-standard.md)
- **Eksekusi:** [01-capability-to-task-mapping.md § Capability 2](01-capability-to-task-mapping.md#capability-2--mengelola-persetujuan-finansial-domain-platform-services--finance-program-a--program-b), Program A

### Workflow Engine
- **Apa:** [01-application-and-data-architecture.md § Dynamic Workflow & Approval Engine](../01-application-and-data-architecture.md#dynamic-workflow--approval-engine)
- **Skema target:** [Phase1/02-target-architecture.md § 1C](../Phase1/02-target-architecture.md#sub-fase-1c--workflow-foundation)
- **Eksekusi:** [01-capability-to-task-mapping.md § Capability 2](01-capability-to-task-mapping.md#capability-2--mengelola-persetujuan-finansial-domain-platform-services--finance-program-a--program-b), Program B; contoh Task-level: [01-capability-to-task-mapping.md § 3](01-capability-to-task-mapping.md#3-format-task--contoh-ilustratif-bukan-daftar-lengkap)
- **Dependency:** [02-master-dependency-graph.md § 2 (A→B, B→C)](02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit)

### RAB / Kurva-S / EVM
- **Apa:** [00-vision-and-business-architecture.md § Domain: Project Delivery](../00-vision-and-business-architecture.md#domain-project-delivery-core)
- **Status:** ✅ Matang (basis RAB) — [01-capability-to-task-mapping.md § Capability 1](01-capability-to-task-mapping.md#capability-1--mengelola-anggaran--progres-proyek-domain-project-delivery-program-a--program-c)
- **Aturan kode:** [Engineering-Constitution/03-core-implementation/03-core-implementation](../Engineering-Constitution/02-architecture/03-clean-architecture-rules.md) (contoh ekstraksi `calculateEVM`)
- **Test priority:** [Phase1/00-current-state-audit.md § 4.1](../Phase1/00-current-state-audit.md#41-enam-file-finansial-kritis-prioritas-test-coverage)
- **⚠️ Perubahan basis akan datang (CECEP Milestone 4):** `bac` existing di `kurva-s.ts` memakai `totalRABValue` — CECEP akan menggantikannya dengan RAP Version Frozen (Cost Baseline), menutup root cause EVM yang selama ini menyembunyikan pembengkakan biaya kecil di balik margin RAB. Lihat [CECEP/52 § Gap 2](../CECEP/52-gap-closure-cashflow-baseline-analytics.md#gap-2--cost-baseline-vs-budget-baseline-pembeda-tegas). Migrasi ini **MUST** menunggu Test Suite Finansial (Program A item #2) sebelum menyentuh `kurva-s.ts`/`evm-calculation.ts` existing.

### company_id / Multi-Company
- **Apa:** [01-application-and-data-architecture.md § Entity Strategy](../01-application-and-data-architecture.md#entity-strategy)
- **Roadmap:** [04-roadmap-governance-and-delivery.md § Phase 7](../04-roadmap-governance-and-delivery.md#phase-7--multi-company-support)
- **Eksekusi:** [00-executive-delivery-vision.md § 3, Program D](00-executive-delivery-vision.md#3-program-structure--kontribusi-baru)
- **Dependency non-linear:** [02-master-dependency-graph.md § 2, D1→D2](02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit)
- **Readiness checklist:** [09-saas-and-tenancy-readiness.md § 2](09-saas-and-tenancy-readiness.md#2-multi-company-readiness-checklist-l1--l2--kontribusi-baru)

### AI Agent Registry
- **Apa:** [03-platform-and-intelligence-architecture.md § AI Architecture](../03-platform-and-intelligence-architecture.md#ai-architecture) (8 agent awal), [06-agentic-ai-and-automation-architecture.md § Katalog 14 Agent](../06-agentic-ai-and-automation-architecture.md#katalog-14-agent)
- **Guardrail:** [Engineering-Constitution/GLOSSARY.md — HITL](../Engineering-Constitution/GLOSSARY.md)
- **Gate keras:** [02-master-dependency-graph.md § 2, B→E](02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit)
- **Sequencing 140 automation:** [08-platform-rollout-orchestration.md § 2](08-platform-rollout-orchestration.md#2-ai--automation-rollout)

## 7. Prinsip Pemeliharaan Traceability Matrix

1. Matrix ini **MUST** diupdate saat file baru ditambahkan ke corpus manapun (Architecture Repository, Phase1, Engineering Constitution, Blueprint) yang menjawab pertanyaan kategori baru — **MUST NOT** dibiarkan hilang sinkron dengan struktur corpus nyata.
2. Matrix ini **MUST NOT** menjadi tempat konten baru ditulis — setiap baris **MUST** berupa link, bukan penjelasan substantif (konsisten prinsip Referensi Penuh, [ADR-003](../adr/ADR-003-master-delivery-blueprint-as-orchestration-layer.md)).

## 8. References

Seluruh 74 file lain di corpus ini (Architecture Repository, Phase1, Engineering Constitution, ADR top-level, dan 12 file Blueprint lainnya) — dokumen ini secara definisi merujuk seluruh corpus, tidak ada referensi tunggal yang lebih otoritatif dari daftar di Bagian 2-6 di atas.

---

*Master Delivery Blueprint — 13 file, selesai. Kembali ke [README.md](README.md) untuk peta lengkap.*
