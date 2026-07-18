# 08 — Observability Rollout, AI & Automation Rollout, UI/UX Rollout

**Kedudukan dokumen ini:** Campuran — ketiga rollout sudah didesain lengkap di dokumen sumber ([Phase1/08](../Phase1/08-observability-plan.md), [06-agentic-ai-and-automation-architecture.md](../06-agentic-ai-and-automation-architecture.md) dengan 140 automation catalog, [05-design-system-and-ui-ux-architecture.md](../05-design-system-and-ui-ux-architecture.md)). **Kontribusi baru bagian ini:** sequencing eksplisit — 140 automation dan seluruh rollout UI/UX **tunduk** ke Phase 0-9 (bukan roadmap independen, sesuai keputusan desain awal doc 06), tapi belum ada dokumen yang menunjukkan **titik masuk presisi** tiap Level automation ke Program mana.

---

## 1. Observability Rollout

**Sumber tunggal:** [Phase1/08-observability-plan.md](../Phase1/08-observability-plan.md) (Logs/Metrics/Traces, Correlation ID) dan [Engineering-Constitution/04-quality-and-observability/10-observability-standard.md](../Engineering-Constitution/04-quality-and-observability/10-observability-standard.md).

**Sequencing ke Program:** Observability **bukan** Program terpisah — ia lapisan lintas-Program yang aktivasinya bertahap:
- **Sub-Fase 1D (bagian Program A):** Logs environment-aware + Correlation ID dasar — prasyarat sebelum deployment cloud pertama ([04-roadmap-governance-and-delivery.md § Risk Register item #8](../04-roadmap-governance-and-delivery.md#risk-register)).
- **Program D2 (`company_id` migration):** Metrics (RED: Rate, Errors, Duration) **MUST** aktif sebelum migrasi dimulai — migrasi paling berisiko butuh visibility real-time.
- **Program F (SaaS):** Traces (distributed tracing) baru relevan **jika** Service Extraction Strategy benar-benar memecah modular monolith — [Engineering-Constitution/04-quality-and-observability/10-observability-standard.md Principle #3](../Engineering-Constitution/04-quality-and-observability/10-observability-standard.md#3-principles): "Traces baru dibutuhkan saat modular monolith benar-benar dipecah."

## 2. AI & Automation Rollout

**Sumber tunggal:** [06-agentic-ai-and-automation-architecture.md](../06-agentic-ai-and-automation-architecture.md) — 140 automation dalam 10 Level (Owner AI Assistant, Finance, Project, Procurement, Document, HR, Sales, Executive Copilot, Compliance/Legal/Risk, Equipment/Asset). **Prinsip governing tidak bisa ditawar** (doc 06 sendiri): seluruh 140 automation **tunduk** ke Phase Gate Phase 0-9, 0 Now — tidak ada automation yang dikerjakan mendahului fase yang menjadi prasyaratnya.

**Sequencing eksplisit ke Program (kontribusi baru — doc 06 mendaftar per-Level, bukan per-Program):**

| Level (doc 06) | Program Prasyarat | Kenapa |
|---|---|---|
| Level 1 — Owner AI Assistant | Program E bagian 2 (gate: Program A+B selesai) | Pilot pertama AI Agent Registry — sesuai [02-master-dependency-graph.md § 2](02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit) |
| Level 2 — Finance Automation | Program E bagian 2 **DAN** Program B selesai (Workflow Engine kasbon/CO) | Automation finansial butuh approval chain generik untuk HITL — automation tidak bisa mem-bypass approval manusia |
| Level 3 — Project Automation | Program E bagian 2 **DAN** Program C (RFI/Submittals jika automation menyentuh domain itu) | Automation yang menyentuh RFI/Submittals butuh Workflow Engine yang sama dengan modul manusia |
| Level 4 — Procurement Automation | Program E bagian 2 **DAN** Program B (migrasi procurement ke Workflow Engine, urutan terakhir strangler-fig) | Procurement adalah migrasi Workflow Engine paling kompleks — automation menunggu migrasi manual selesai dulu |
| Level 5 — Document Automation | Program E bagian 2 saja | Tidak bergantung Workflow Engine — Document Management sudah matang (Tier 1) |
| Level 6-7 — HR, Sales Automation | Program E bagian 2 **DAN** Program D (modul HR/Sales sendiri harus ada dulu sebelum diotomasi) | Tidak bisa mengotomasi modul yang belum dibangun |
| Level 8 — Executive Copilot | Program E bagian 2, **Later** (butuh Level 1-7 sebagian matang sebagai data source) | Agregasi lintas-domain, prasyarat implisit: domain lain sudah punya data terstruktur |
| Level 9-10 — Compliance/Legal/Risk, Equipment/Asset | Program E bagian 2 **DAN** modul Legal/Equipment terkait (Tier 2-3, Program C/D) | Sama seperti Level 6-7 — automation menunggu modul dasarnya ada |

**Prinsip tidak bisa ditawar (diulang dari doc 06 untuk penekanan orkestrasi):** **MUST NOT** ada Level automation manapun dikerjakan sebelum Program prasyaratnya (tabel di atas) selesai, bahkan jika automation tersebut terlihat "sederhana secara teknis" — guardrail HITL/least-privilege ([GLOSSARY.md — HITL](../Engineering-Constitution/GLOSSARY.md)) bergantung pada fondasi otorisasi dan approval chain yang sama dengan modul manusia.

## 3. UI/UX Rollout

**Sumber tunggal:** [05-design-system-and-ui-ux-architecture.md](../05-design-system-and-ui-ux-architecture.md) (65 topik, Library Evaluation, command palette sebagai pilot pertama) dan [Engineering-Constitution/07-domain-specific/12-ui-engineering-standard.md](../Engineering-Constitution/07-domain-specific/12-ui-engineering-standard.md).

**Sequencing ke Program:** UI/UX rollout **tidak block** Program manapun secara teknis (Warm Clay sudah stabil, doc 05 menambah interaction model di atasnya) — tapi **SHOULD** mengikuti kemunculan kebutuhan nyata per Program:
- **Program B (Workflow Engine):** Approval chain generik butuh UI pattern baru (status tracker generik menggantikan status kasbon/CO/procurement yang masing-masing custom hari ini) — kandidat kedua untuk pilot library setelah command palette.
- **Program D2 (`company_id`):** Company switcher UI (belum ada — user hari ini implisit satu company) diperlukan begitu multi-company aktif.
- **Program F (SaaS):** White-labeling per tenant ([00-vision-and-business-architecture.md § SaaS Operations Platform](../00-vision-and-business-architecture.md#domain-saas-operations-platform-domain-baru--hilang-sepenuhnya-spesifik-untuk-l3)) — token 3-layer ([05 § 31. Design Token Architecture](../05-design-system-and-ui-ux-architecture.md#31-design-token-architecture)) baru benar-benar bernilai penuh di titik ini, konsisten [Engineering-Constitution/07-domain-specific/12-ui-engineering-standard.md Recommended Rule #1](../Engineering-Constitution/07-domain-specific/12-ui-engineering-standard.md#5-recommended-rules).

## 4. Prinsip Orkestrasi Bagian Ini

1. Automation Level manapun **MUST** diverifikasi terhadap tabel Bagian 2 sebelum dikerjakan — **MUST NOT** diasumsikan "boleh mulai" hanya karena secara teknis terlihat independen dari Program lain.
2. Observability **MUST** dianggap prasyarat implisit setiap Program yang melibatkan deployment/migrasi berisiko (Bagian 1) — **MUST NOT** diperlakukan sebagai Program terpisah yang bisa ditunda tanpa batas.

## 5. References

- [Phase1/08-observability-plan.md](../Phase1/08-observability-plan.md)
- [06-agentic-ai-and-automation-architecture.md](../06-agentic-ai-and-automation-architecture.md)
- [05-design-system-and-ui-ux-architecture.md](../05-design-system-and-ui-ux-architecture.md)
- [02-master-dependency-graph.md](02-master-dependency-graph.md)
- [Engineering-Constitution/GLOSSARY.md — HITL](../Engineering-Constitution/GLOSSARY.md)

---

*File selanjutnya: [09-saas-and-tenancy-readiness.md](09-saas-and-tenancy-readiness.md)*
