# 01 — Capability → Domain → Program → Initiative → Epic → Feature → Task Mapping

**Kedudukan dokumen ini:** Orkestrasi Baru — hierarki ini belum pernah didefinisikan di dokumen manapun. **Sumber data:** setiap baris di bawah berasal langsung dari [00-vision-and-business-architecture.md § Module Catalog & Tiering](../00-vision-and-business-architecture.md#module-catalog--tiering) (Domain → Module → Submodule → Tier → Build Priority → Dependency) — dokumen ini **menambahkan** 3 lapisan hierarki yang hilang (Program, Initiative, Epic/Feature/Task) di atas struktur yang sudah ada, **tidak mengubah** nama modul, tier, atau dependency yang sudah ditetapkan doc 00.

---

## 1. Kenapa Hierarki Ini Dibutuhkan

Doc 00 menjawab "modul apa saja yang ada dan seberapa penting" (Tier 1-4) dan "kapan dikerjakan secara kasar" (Now/Next/Later/Optional). Yang tidak dijawab: **bagaimana satu modul besar seperti "Workflow Platform" dipecah menjadi unit kerja yang bisa di-assign, ditest, dan dilacak progresnya** — inilah gap yang diisi hierarki 7-lapis berikut:

```
Capability          — Kemampuan bisnis level tertinggi (mis. "Mengelola Persetujuan Finansial")
  └─ Domain          — Sudah ada di doc 00 (mis. "Platform Services")
       └─ Program     — Sudah ada di 00-executive-delivery-vision.md § 3 (mis. "Program B — Dynamic Engine Platform")
            └─ Initiative — Inisiatif konkret dalam satu Program (mis. "Bangun Workflow Engine generik")
                 └─ Epic      — Kumpulan pekerjaan besar dalam satu Initiative (mis. "Migrasi Kasbon ke Workflow Engine")
                      └─ Feature   — Kemampuan spesifik yang bisa didemokan (mis. "Kasbon approval chain dinamis per company")
                           └─ Task      — Unit kerja individual (mis. "Tulis migration workflow_transitions untuk kasbon")
```

**Prinsip pemecahan:** Capability dan Domain **MUST** tetap konsisten persis dengan doc 00 (tidak ada modul baru diciptakan di sini). Program **MUST** konsisten dengan [00-executive-delivery-vision.md § 3](00-executive-delivery-vision.md#3-program-structure--kontribusi-baru). Initiative ke bawah adalah **kontribusi baru** dokumen ini — dipecah cukup dalam untuk actionable, tidak dipecah sampai level yang akan basi dalam hitungan hari (Task individual sengaja **tidak** didaftar exhaustive di sini — itu tanggung jawab task tracker operasional harian, bukan dokumen strategis; Blueprint berhenti di level Epic/Feature dengan Task sebagai **contoh ilustratif**, bukan daftar lengkap).

## 2. Master Capability Matrix

Matrix berikut hanya mencakup Capability dengan Build Priority **Now** atau **Next** (Tier 1-2 mayoritas) — Capability `Later`/`Optional` (Tier 3-4) dirujuk di Bagian 4 tanpa breakdown Epic/Feature penuh, konsisten prinsip YAGNI ([00-executive-delivery-vision.md § 4](00-executive-delivery-vision.md#4-prinsip-governance-program-baru)): merinci pekerjaan yang jaraknya bertahun-tahun adalah investasi yang akan basi sebelum dipakai.

### Capability 1 — Mengelola Anggaran & Progres Proyek (Domain: Project Delivery, Program A + Program C)

| Initiative | Epic | Feature (contoh) | Fase/Program | Status Hari Ini |
|---|---|---|---|---|
| Perkuat RAB & Kurva-S/EVM (fondasi sudah matang) | Komponen Biaya RAB | Breakdown material/upah/alat/other per item | Program A (existing, matang) | ✅ Selesai (migration 052) |
| | Kurva-S 3-Garis + EVM | CPI/SPI/EAC/dst dengan traffic-light | Program A (existing, matang) | ✅ Selesai (Phase 2 ERP upgrade — lihat CLAUDE.md) |
| Perkuat Field Operations Tier 2 | RFI (Request for Information) | Submit RFI → routing → jawaban tercatat | Program C, **butuh Workflow Engine (Program B) selesai dulu** | 🔵 Belum dibangun |
| | Submittals | Submit dokumen → review → approve/reject | Program C, butuh Document Mgmt + Workflow Engine | 🔵 Belum dibangun |
| | Punch List / Snagging | Daftar defect → assign → tracking closure | Program C, butuh Field Ops core (sudah ada) | 🔵 Belum dibangun |
| Perkuat Quality Control | QC Checklist per item RAB | Checklist terikat RAB item, submit hasil inspeksi | Program C, butuh struktur RAB item (sudah ada) | 🔵 Belum dibangun |
| Perkuat HSE | Incident Report + Safety Checklist | Form insiden K3, checklist keselamatan harian | Program C | 🔵 Belum dibangun |

**Dependency kritis:** RFI dan Submittals **MUST NOT** dikerjakan sebelum Workflow Engine (Program B, Phase 2) tersedia — keduanya butuh approval chain generik, membangunnya sekarang berarti implementasi hardcode ketiga yang harus dimigrasikan lagi nanti (mengulang persis masalah yang Program B sengaja diselesaikan). Lihat [02-master-dependency-graph.md](02-master-dependency-graph.md).

### Capability 2 — Mengelola Persetujuan Finansial (Domain: Platform Services + Finance, Program A + Program B)

| Initiative | Epic | Feature (contoh) | Fase/Program | Status Hari Ini |
|---|---|---|---|---|
| Perbaiki Permission Engine | Konsolidasi 3 mekanisme otorisasi | Hapus `requireRole`, migrasi inline role check ke `requirePermission()` | Program A (Phase 1, item #1 tertinggi) | 🟡 Sebagian (103 call site `requirePermission`, 57 inline masih ada) |
| | Sinkronisasi RLS ↔ RBAC v2 | RLS policy baca dari `role_permissions`, bukan hardcode 4 role | Program A (Phase 1, item #1) | 🔴 Belum — 0 referensi RBAC v2 di RLS |
| Bangun Test Suite Finansial | Unit test kalkulasi murni | Test `calculateEVM`, bubble-up progress, dst | Program A (Phase 1, item #2) | 🔴 Belum — 0% coverage |
| | Integration test Golden Path | Approve kasbon end-to-end, bayar termin end-to-end | Program A (Phase 1, item #2) | 🔴 Belum |
| Bangun Workflow Engine | Skema generik | `workflow_definitions`/`states`/`transitions` | Program B (Phase 2, item #5) | 🔵 Didesain ([Phase1/02 § 1C](../Phase1/02-target-architecture.md#sub-fase-1c--workflow-foundation)), belum diimplementasikan |
| | Migrasi Kasbon ke Workflow Engine | Approval chain kasbon lewat state machine generik | Program B, urutan pertama (paling sederhana — strangler-fig) | 🔵 Belum dimulai |
| | Migrasi Change Order | Approval CO lewat state machine generik | Program B, urutan kedua | 🔵 Belum dimulai |
| | Migrasi Procurement | Approval MR/PO lewat state machine generik | Program B, urutan terakhir (paling kompleks) | 🔵 Belum dimulai |
| Bangun Notification Routing Engine | `notification_rules` table | Rule-based routing, bukan fungsi resolusi hardcode | Program B (Phase 2, item #6), **paralel dengan Workflow Engine** | 🔵 Belum dimulai |

**Dependency kritis:** Test Suite (Program A item #2) **MUST** selesai sebelum migrasi Workflow Engine (Program B) menyentuh logic kasbon/CO/procurement — tanpa jaring pengaman ini, migrasi berisiko regresi finansial silent. Ini adalah dependency Program-ke-Program paling ketat di seluruh Blueprint (detail: [02-master-dependency-graph.md](02-master-dependency-graph.md)).

### Capability 3 — Mengelola Rantai Pasok & Vendor (Domain: Supply Chain, Program C)

| Initiative | Epic | Feature (contoh) | Fase/Program | Status Hari Ini |
|---|---|---|---|---|
| Procurement (fondasi sudah matang) | MR/PO/GR + FIFO stock | Sudah 20+ endpoint, 8 tab UI | Program A (existing) | ✅ Selesai |
| Perkuat Inventory Multi-warehouse | Multi-gudang stock tracking | Transfer antar gudang, stock per lokasi | Program C, Tier 2 Later | 🔵 Belum dibangun |
| Perkuat Vendor Management | Vendor Scoring & Evaluation | Skor otomatis dari riwayat PO (harga, ketepatan waktu) | Program C, Tier 2 Later, butuh riwayat PO cukup (sudah ada data) | 🔵 Belum dibangun |

### Capability 4 — Mengelola Keuangan & Kepatuhan (Domain: Finance & Compliance, Program A + Program C)

| Initiative | Epic | Feature (contoh) | Fase/Program | Status Hari Ini |
|---|---|---|---|---|
| Cash Management (fondasi sudah matang) | Cash accounts, transfer, invoice, payment | Saldo otomatis via trigger DB | Program A (existing) | ✅ Selesai |
| Perkuat Accounting | Retention/Retainage Tracking | Potongan retensi per termin, pelunasan bertahap | Program C, Tier 2 Next | 🔵 Belum dibangun |
| | Budget vs Actual Cost Control | Kontrol biaya terpisah dari EVM (EVM=progress, ini=governance biaya) | Program C, Tier 2 Next, butuh RAB (sudah ada) | 🔵 Belum dibangun |
| Perkuat Risk Management | Risk Register formal (level proyek) | Risk register per proyek, beda dari Risk Register roadmap ini | Program C, Tier 2 Next | 🔵 Belum dibangun |

### Capability 5 — Automation & Intelligence Platform (Domain: Platform Services + AI Platform, Program E)

| Initiative | Epic | Feature (contoh) | Fase/Program | Status Hari Ini |
|---|---|---|---|---|
| Bangun Trigger/Event Engine | Scheduler otomatis | `check-milestones`/`check-deadlines` jalan otomatis, bukan diklik manual | Program E (Phase 5) | 🔵 Belum dibangun |
| | Event Bus internal | Event emitter in-process untuk efek samping lintas-domain | Program E (Phase 5) | 🔵 Belum dibangun |
| Bangun AI Agent Registry | AI Assistant (pilot pertama) | 1 agent pilot, guardrail least-privilege | Program E (Phase 6), **gate keras: Program A+B selesai** | 🔵 Belum dibangun |
| | 7 agent lanjutan (CFO, PM, Scheduler, dst) | Sesuai spesifikasi [03](../03-platform-and-intelligence-architecture.md#ai-architecture) | Program E (Phase 6), bertahap setelah pilot tervalidasi | 🔵 Belum dibangun |

**Dependency kritis:** AI Agent Registry **MUST NOT** dimulai sebelum Program A (Permission Engine) dan Program B (Workflow Engine) selesai — guardrail AI didesain [03](../03-platform-and-intelligence-architecture.md#ai-architecture) bergantung penuh pada RBAC/PBAC solid. Ini gate paling eksplisit di seluruh doc 04.

## 3. Format Task — Contoh Ilustratif (Bukan Daftar Lengkap)

Untuk menunjukkan bagaimana Feature dipecah ke Task tanpa mendaftar exhaustive (yang akan basi cepat), berikut contoh satu Feature dari Capability 2:

**Feature:** "Migrasi Kasbon ke Workflow Engine" (Epic: Migrasi Kasbon, Initiative: Bangun Workflow Engine, Program B)

| Task (ilustratif) | Jenis | Prasyarat |
|---|---|---|
| Desain skema `workflow_definitions`, `workflow_states`, `workflow_transitions` | Database | Test suite Program A selesai |
| Tulis migration skema (idempotent-safe, sesuai [Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md](../Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md)) | Database | Skema didesain + direview |
| Ekstrak fungsi state-transition kasbon existing ke service murni (sesuai [Engineering-Constitution/02-architecture/03-clean-architecture-rules.md](../Engineering-Constitution/02-architecture/03-clean-architecture-rules.md)) | Backend | — |
| Tulis unit test untuk state-transition sebelum migrasi (regression-safe refactor, sesuai [Engineering-Constitution/06-governance/31-refactoring-policy.md](../Engineering-Constitution/06-governance/31-refactoring-policy.md)) | Testing | Fungsi diekstrak |
| Implementasi endpoint kasbon baca dari Workflow Engine, bukan hardcode status enum | Backend | Skema + test siap |
| Deploy di belakang feature flag (default OFF) | DevOps | [Engineering-Constitution/07-domain-specific/26-feature-flag-standard.md](../Engineering-Constitution/07-domain-specific/26-feature-flag-standard.md) |
| Verifikasi paralel: kasbon lama vs kasbon baru menghasilkan hasil sama | QA | Flag aktif di staging |
| Rollout bertahap, hapus flag setelah 100% stabil | DevOps | Verifikasi lolos |

**Task tracker operasional** (Linear, GitHub Issues, atau alat sejenis begitu dipakai) adalah tempat Task individual sesungguhnya dikelola hari-ke-hari — Blueprint tidak mencoba menggantikan fungsi itu, hanya menunjukkan pola pemecahan yang konsisten.

## 4. Capability Tier 3/4 (Later/Optional) — Referensi Tanpa Breakdown

Konsisten prinsip YAGNI, Capability berikut **tidak** dipecah ke Epic/Feature/Task di Blueprint ini — breakdown akan dilakukan saat Program-nya benar-benar dimulai (Program D, E lanjutan, F):

- **Capital Planning & Program Management** (Tier 3, butuh `company_id` migration dulu) — lihat [doc 00 § Domain: Capital Planning](../00-vision-and-business-architecture.md#domain-capital-planning--program-management-core-untuk-unifier-class--domain-baru-hilang-sepenuhnya)
- **Facilities Management & O&M Handover** (Tier 3/4, sebagian besar Never Build) — lihat [doc 00 § Domain: Facilities Management](../00-vision-and-business-architecture.md#domain-facilities-management--om-handover-domain-baru--hilang-sepenuhnya)
- **SaaS Operations Platform** (seluruhnya Optional, gate Phase 8) — lihat [doc 00 § Domain: SaaS Operations Platform](../00-vision-and-business-architecture.md#domain-saas-operations-platform-domain-baru--hilang-sepenuhnya-spesifik-untuk-l3) dan [09-saas-and-tenancy-readiness.md](09-saas-and-tenancy-readiness.md)
- **AI Platform lanjutan** (Document Intelligence, Anomaly Detection, Predictive Delay Risk — Tier 3 Optional) — lihat [doc 00 § Domain: AI Platform](../00-vision-and-business-architecture.md#domain-ai-platform-tier-3--pelengkap-8-agent-di-03)
- **Enterprise Modules** (Payroll/HR/GL formal, Tier 2-3) — Program D, lihat [00-executive-delivery-vision.md § 3](00-executive-delivery-vision.md#3-program-structure--kontribusi-baru)

## 5. Prinsip Pemeliharaan Matrix Ini

1. Baris baru di Master Capability Matrix **MUST** merujuk Module/Submodule yang sudah ada di [doc 00 Module Catalog](../00-vision-and-business-architecture.md#module-catalog--tiering) — **MUST NOT** memperkenalkan modul baru langsung di Blueprint tanpa lebih dulu menambahkannya ke doc 00 (single source of truth untuk *apa* yang dibangun tetap doc 00).
2. Status "Hari Ini" **MUST** diverifikasi langsung terhadap kode (grep/baca file), bukan diasumsikan — konsisten [Engineering-Constitution/07-domain-specific/36-ai-coding-guideline.md](../Engineering-Constitution/07-domain-specific/36-ai-coding-guideline.md).
3. Matrix ini **SHOULD** diupdate saat Program baru dimulai — Epic/Feature breakdown ditambahkan begitu Program tersebut mendekati eksekusi, bukan didesain jauh di muka (selaras Bagian 4).

## 6. References

- [00-vision-and-business-architecture.md § Module Catalog & Tiering](../00-vision-and-business-architecture.md#module-catalog--tiering)
- [00-executive-delivery-vision.md § 3 Program Structure](00-executive-delivery-vision.md#3-program-structure--kontribusi-baru)
- [02-master-dependency-graph.md](02-master-dependency-graph.md)
- [Phase1/02-target-architecture.md](../Phase1/02-target-architecture.md)

---

*File selanjutnya: [02-master-dependency-graph.md](02-master-dependency-graph.md)*
