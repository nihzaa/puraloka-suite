# 04 — Delivery Orchestration: Phase-by-Phase Plan, Milestones, Entry/Exit Criteria

**Kedudukan dokumen ini:** Campuran — Phase 0-9 detail dan Definition of Done pola umum sudah lengkap di [04-roadmap-governance-and-delivery.md](../04-roadmap-governance-and-delivery.md), Sub-Fase 1A-1D detail sudah lengkap di [Phase1/](../Phase1/00-current-state-audit.md). **Kontribusi baru bagian ini:** Milestone Definition eksplisit (checkpoint yang bisa didemokan, belum ada di sumber manapun) dan operasionalisasi Entry/Exit Criteria menjadi checklist per-Program yang bisa langsung dipakai (sumber hanya menyatakan prinsip 5-gate umum, belum diturunkan per Program konkret).

---

## 1. Phase-by-Phase Delivery Plan

**Sumber tunggal:** [04-roadmap-governance-and-delivery.md § Phase 0-9 Transformation Program](../04-roadmap-governance-and-delivery.md#phase-0-9-transformation-program) — deskripsi lengkap tujuan, cakupan, dan "working software di akhir fase" untuk tiap Phase 0-9. **Tidak diparafrase ulang di sini** — baca langsung untuk detail.

**Peta orientasi cepat** (Phase doc 04 ↔ Program Blueprint, sudah didefinisikan [00-executive-delivery-vision.md § 3](00-executive-delivery-vision.md#3-program-structure--kontribusi-baru)):

| Phase (doc 04) | Program (Blueprint) | Status |
|---|---|---|
| Phase 0 — Discovery & Architecture | *(tidak masuk Program — deliverable-nya adalah Architecture Repository itu sendiri)* | ✅ Selesai |
| Phase 1 — Core Platform Foundation | Program A | 🔴 Belum dimulai eksekusi (baru direncanakan) |
| Phase 2 — Configuration Driven Platform | Program B | 🔵 Menunggu Program A |
| Phase 3 — Construction Core Modules | Program C | 🔵 Menunggu Program A (sebagian), Program B (sebagian) |
| Phase 4 — Enterprise Modules | Program D (bagian 1) | 🔵 Menunggu Program A |
| Phase 5 — Automation Platform | Program E (bagian 1) | 🔵 Menunggu Program B |
| Phase 6 — AI Native Platform | Program E (bagian 2) | 🔵 Menunggu Program E bagian 1 |
| Phase 7 — Multi Company Support | Program D (bagian 2) | 🔵 Menunggu Program D bagian 1 |
| Phase 8 — Multi Tenant SaaS Platform | Program F (bagian 1) | 🔵 Menunggu Program D bagian 2 + gate pelanggan eksternal |
| Phase 9 — Enterprise Scale Platform | Program F (bagian 2) | 🔵 Horizon 5-10 tahun, sengaja tidak didesain rinci |

## 2. Milestone Definition — Kontribusi Baru

**Prinsip:** Setiap Milestone **MUST** menghasilkan sesuatu yang bisa **didemokan** (working software terlihat/terpakai), bukan checklist internal yang tidak terlihat dari luar — selaras [04 § Phase 0-9](../04-roadmap-governance-and-delivery.md#phase-0-9-transformation-program): "Setiap fase wajib menghasilkan working software."

| Milestone | Program | Definisi "Selesai" (Demokan) |
|---|---|---|
| **M1 — Otorisasi Terpadu** | Program A | Login sebagai role kustom baru (dibuat via UI, bukan salah satu dari 4 role hardcode) menunjukkan RLS dan permission check konsisten — didemokan lewat skenario nyata: buat role "supervisor", assign ke user, verifikasi akses terbatas sesuai permission yang di-assign. **MUST** demo dijalankan dengan policy RLS lama **dinonaktifkan sementara** (bukan hanya coexist dengan policy baru) untuk kelompok tabel yang didemokan — *(v1.1: selama fase expand [03-migration-strategy.md § Migrasi 1A.2](../Phase1/03-migration-strategy.md#migrasi-1a2--rls-sinkronisasi-migrasi-paling-berisiko-di-seluruh-phase-1), policy lama dan baru hidup berdampingan dengan semantik OR — demo yang tidak mengisolasi policy baru bisa "lolos" karena policy lama kebetulan mengizinkan akses yang sama, menutupi bug di policy baru; isolasi ini menutup gap tersebut, ditemukan Phase 1A Readiness Review)* |
| **M2 — Jaring Pengaman Finansial** | Program A | `pnpm test` menjalankan test suite dan menunjukkan coverage report untuk enam file finansial-kritis; CI pipeline berjalan otomatis di setiap PR |
| **M3 — Kasbon di Atas Workflow Engine** | Program B | Approval kasbon berjalan lewat state machine generik yang sama dipakai domain lain — didemokan lewat perbandingan sebelum/sesudah: kasbon dan (nanti) change order memakai kode approval yang identik, bukan dua implementasi terpisah |
| **M4 — Approval Chain Generik Penuh** | Program B | Change Order dan Procurement juga sudah di atas Workflow Engine — 3 domain finansial, 1 mesin approval |
| **M5 — Kedalaman Domain Konstruksi** | Program C | **CECEP Milestone 1-2** (Cost Code/Resource Identity/Assembly/AHSP/Price Book berjalan, [CECEP/49](../CECEP/49-phase11-implementation-roadmap.md)) — cakupan utama Program C sejak planning CECEP selesai — **DAN/ATAU** minimal 1-2 modul Tier 2 lain (RFI, QC Checklist, atau HSE — dipilih berdasarkan kebutuhan operasional nyata saat Program dimulai, [04 § Phase 3](../04-roadmap-governance-and-delivery.md#phase-3--construction-core-modules-termasuk-cecep)) berjalan dan dipakai di proyek nyata |
| **M6 — Kesiapan Multi-Company** | Program D | `company_id` ada di seluruh tabel transaksional, dual-axis RLS aktif — didemokan lewat skenario nyata: dua "company" berbeda dalam satu instance, data terisolasi terverifikasi |
| **M7 — Otomasi Tanpa Klik Manual** | Program E | `check-milestones`/`check-deadlines` berjalan via scheduler — didemokan lewat log yang menunjukkan eksekusi otomatis tanpa trigger manual dari `/sistem` |
| **M8 — AI Pilot Hidup** | Program E | AI Assistant (1 agent pilot) merespons query nyata dengan guardrail teraudit — didemokan lewat percakapan nyata + audit log yang menunjukkan setiap aksi tercatat |
| **M9 — Pelanggan Eksternal Pertama** | Program F | Bukan milestone teknis — milestone bisnis yang **menjadi gate teknis**: begitu tercapai, Phase 8 boleh dimulai ([04 § Phase 8](../04-roadmap-governance-and-delivery.md#phase-8--multi-tenant-saas-platform)) |

## 3. Entry Criteria — Operasionalisasi per Program

**Sumber prinsip:** [04-roadmap-governance-and-delivery.md § Architecture Governance & Phase Gates](../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates) — 5 gate umum (Architecture Review, Risk Assessment, Security Review, Migration Strategy, Rollback Strategy) berlaku **setiap** fase. Di bawah adalah **penurunan konkret** 5 gate itu jadi entry criteria spesifik per Program (belum ada di doc 04, yang menjelaskan gate secara umum, bukan per-fase individual).

| Program | Entry Criteria Tambahan (di atas 5 gate umum) |
|---|---|
| Program A | Tidak ada — ini titik mulai, hanya 5 gate umum + persetujuan user atas dokumen ini |
| Program B | M2 (Jaring Pengaman Finansial) tercapai — test suite **MUST** sudah berjalan sebelum migrasi approval chain dimulai |
| Program C (Epic RFI/Submittals, **CECEP Milestone 3-4** — Approval Workflow) | M3 atau M4 tercapai (Workflow Engine tersedia) — Epic non-Workflow (QC/HSE/Punch List, **CECEP Milestone 1-2**) tidak butuh entry criteria tambahan, bisa mulai begitu Program A selesai |
| Program D (bagian 1, Phase 4) | M1 (Otorisasi Terpadu) tercapai — modul Enterprise baru **MUST** dibangun di atas Permission Engine yang sudah konsisten |
| Program D (bagian 2, Phase 7 — `company_id`) | M2 tercapai (test suite ada — migrasi skema paling invasif butuh jaring pengaman); minimal 2 kontributor tersedia untuk review (lihat [03-team-topology-and-resourcing.md § 5](03-team-topology-and-resourcing.md#5-resourcing-per-program--estimasi-kualitatif): migrasi ini tidak solo-safe) |
| Program E (bagian 1, Trigger/Event) | M1 dan M2 tercapai |
| Program E (bagian 2, AI Registry) | M4 tercapai (Workflow Engine penuh, untuk HITL approval flow) — **gate keras**, tidak ada pengecualian ([02-master-dependency-graph.md § 2](02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit): "Membangun Phase 6 sebelum Phase 1 & 2 selesai adalah out of order") |
| Program F (bagian 1, Phase 8) | M6 tercapai (`company_id` migration selesai) **DAN** M9 tercapai (pelanggan eksternal committed) — **kedua syarat wajib**, bukan salah satu |

## 4. Exit Criteria — Operasionalisasi per Program

**Sumber prinsip:** [04-roadmap-governance-and-delivery.md § Definition of Done](../04-roadmap-governance-and-delivery.md#definition-of-done) — pola umum "working software + test coverage + 5 gate terpenuhi + Risk Register/Gap Analysis diperbarui." Detail Sub-Fase 1A-1D: [Phase1/09-definition-of-done.md](../Phase1/09-definition-of-done.md).

| Program | Exit Criteria Spesifik |
|---|---|
| Program A | M1 dan M2 tercapai (didemokan) + [Phase1/09-definition-of-done.md § Sub-Fase 1A](../Phase1/09-definition-of-done.md#sub-fase-1a--security-foundation) checklist lengkap |
| Program B | M3 dan M4 tercapai + tidak ada regresi pada test suite Program A (dibuktikan via CI hijau) |
| Program C | Minimal M5 tercapai untuk modul yang dipilih saat Program dimulai |
| Program D | M6 tercapai + verifikasi manual isolasi data 2 company (tidak cukup hanya lolos test otomatis untuk perubahan seinvasif ini) |
| Program E | M7 dan M8 tercapai + audit log AI Agent pilot menunjukkan nol pelanggaran guardrail selama periode observasi |
| Program F | M9 tercapai sebagai prasyarat + infrastruktur billing/tenant berjalan untuk minimal 1 pelanggan nyata (bukan sandbox/demo) |

**Begitu Exit Criteria satu Program tercapai:** kickoff package Program berikutnya ditulis mengikuti [13-implementation-kickoff-playbook.md](13-implementation-kickoff-playbook.md) — bukan sebelum itu (lihat prinsip governing di file tersebut, kenapa menulis kickoff detail lebih awal adalah investasi yang basi sebelum dipakai).

## 5. Prinsip Governance yang Mengikat Bagian Ini

1. Program **MUST NOT** dimulai sebelum Entry Criteria (Bagian 3) terpenuhi — ini **MUST** diverifikasi eksplisit (bukan diasumsikan), konsisten [Engineering-Constitution/05-team-process/16-definition-of-ready.md](../Engineering-Constitution/05-team-process/16-definition-of-ready.md).
2. Program **MUST NOT** dinyatakan selesai tanpa Exit Criteria (Bagian 4) terverifikasi — konsisten [Engineering-Constitution/05-team-process/17-definition-of-done.md](../Engineering-Constitution/05-team-process/17-definition-of-done.md).
3. Milestone (Bagian 2) **MUST** didemokan ke pemangku kepentingan (minimal diri sendiri sebagai solo developer, dicatat tertulis) — bukan hanya "kode sudah di-merge."

## 6. References

- [04-roadmap-governance-and-delivery.md § Phase 0-9 Transformation Program](../04-roadmap-governance-and-delivery.md#phase-0-9-transformation-program)
- [04-roadmap-governance-and-delivery.md § Architecture Governance & Phase Gates](../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates)
- [04-roadmap-governance-and-delivery.md § Definition of Done](../04-roadmap-governance-and-delivery.md#definition-of-done)
- [Phase1/09-definition-of-done.md](../Phase1/09-definition-of-done.md)
- [02-master-dependency-graph.md](02-master-dependency-graph.md)
- [11-decision-gates-and-change-management.md](11-decision-gates-and-change-management.md)

---

*File selanjutnya: [05-risk-and-debt-orchestration.md](05-risk-and-debt-orchestration.md)*
