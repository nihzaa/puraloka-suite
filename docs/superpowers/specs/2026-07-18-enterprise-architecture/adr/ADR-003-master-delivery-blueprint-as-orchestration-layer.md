# ADR-003 — Master Delivery Blueprint sebagai Orchestration Layer, Bukan Roadmap Kedua

**Status:** Diterima
**Tanggal:** 2026-07-18
**Konteks pemicu:** Permintaan "Master Delivery Blueprint" — dokumen 35-item CTO-level yang menjadi "GPS" implementasi Puraloka Suite dari Phase 1 sampai visi Enterprise SaaS.

---

## 1. Masalah

Brief Master Delivery Blueprint meminta 35 bagian wajib, termasuk beberapa yang **sudah punya jawaban lengkap** di dokumen existing:

| # Brief | Topik | Sudah dijawab lengkap di |
|---|---|---|
| 9 | Phase-by-Phase Delivery Plan | [04-roadmap-governance-and-delivery.md § Phase 0-9](../04-roadmap-governance-and-delivery.md#phase-0-9-transformation-program) |
| 11, 12 | Exit/Entry Criteria per phase | [04 § Architecture Governance & Phase Gates](../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates), [04 § Definition of Done](../04-roadmap-governance-and-delivery.md#definition-of-done) |
| 13 | Risk Register per phase | [04 § Risk Register](../04-roadmap-governance-and-delivery.md#risk-register) (9 item makro) + [Phase1/04-risk-register.md](../Phase1/04-risk-register.md) (R1-R10 Sub-Fase 1A-1D) |
| 14 | Technical Debt Strategy | [04 § Technical Debt Register](../04-roadmap-governance-and-delivery.md#technical-debt-register) + [Engineering-Constitution/06-governance/30-technical-debt-policy.md](../Engineering-Constitution/06-governance/30-technical-debt-policy.md) |
| 15 | Refactoring Strategy | [Engineering-Constitution/06-governance/31-refactoring-policy.md](../Engineering-Constitution/06-governance/31-refactoring-policy.md) |
| 16 | Migration Strategy | [04 § Migration Strategy](../04-roadmap-governance-and-delivery.md#migration-strategy-prinsip-lintas-fase) (prinsip lintas-fase) + [Phase1/03-migration-strategy.md](../Phase1/03-migration-strategy.md) (detail 1A-1D) + [Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md](../Engineering-Constitution/03-core-implementation/34-schema-migration-policy.md) (aturan kode) |
| 17 | Release Strategy | [04 § Release Strategy](../04-roadmap-governance-and-delivery.md#release-strategy) |
| 18 | Branching Strategy | [Engineering-Constitution/05-team-process/14-git-workflow-standard.md](../Engineering-Constitution/05-team-process/14-git-workflow-standard.md) |
| 19 | Versioning Strategy | [Engineering-Constitution/06-governance/25-versioning-standard.md](../Engineering-Constitution/06-governance/25-versioning-standard.md) |
| 20 | Rollback Strategy | [04 § Rollback Strategy](../04-roadmap-governance-and-delivery.md#rollback-strategy-prinsip-lintas-fase) |
| 21 | Testing Strategy Mapping | [Phase1/06-test-strategy.md](../Phase1/06-test-strategy.md) + [Engineering-Constitution/04-quality-and-observability/08-testing-standard.md](../Engineering-Constitution/04-quality-and-observability/08-testing-standard.md) |
| 22 | Security Validation Gates | [02-security-and-compliance-architecture.md § Security Checklist](../02-security-and-compliance-architecture.md#security-checklist-ringkas-actionable) + [Engineering-Constitution/08-metrics-and-closing/38-security-checklist.md](../Engineering-Constitution/08-metrics-and-closing/38-security-checklist.md) |
| 24 | Observability Rollout | [Phase1/08-observability-plan.md](../Phase1/08-observability-plan.md) + [Engineering-Constitution/04-quality-and-observability/10-observability-standard.md](../Engineering-Constitution/04-quality-and-observability/10-observability-standard.md) |
| 25 | AI & Automation Rollout | [06-agentic-ai-and-automation-architecture.md](../06-agentic-ai-and-automation-architecture.md) (140 automation catalog, 14 agent, phase gate per Level 1-10) |
| 26 | UI/UX Rollout | [05-design-system-and-ui-ux-architecture.md](../05-design-system-and-ui-ux-architecture.md) |
| 27, 28 | SaaS Readiness, Multi-company/tenant Readiness | [00-vision-and-business-architecture.md § Long-Term SaaS Vision](../00-vision-and-business-architecture.md#long-term-saas-vision-l1--l4-evolution-model) |
| 34 | Change Management Process | [Engineering-Constitution/00-principles/00-engineering-principles.md § Amendment Process](../Engineering-Constitution/00-principles/00-engineering-principles.md#9-amendment-process) + [Engineering-Constitution/06-governance/19-architecture-decision-record-guide.md](../Engineering-Constitution/06-governance/19-architecture-decision-record-guide.md) |

Menulis ulang 15+ dari 35 bagian ini dari nol di dokumen baru akan menghasilkan **konten yang sama di dua tempat berbeda** — pelanggaran langsung terhadap prinsip Single Source of Truth yang sudah ditegakkan ketat sepanjang Architecture Repository, Phase 1 Planning, dan Engineering Constitution (203 file, nol duplikasi konten terverifikasi di seluruh sesi sebelumnya). Ini juga bertentangan literal dengan instruksi brief itu sendiri: *"Jangan membuat roadmap yang bertentangan... Pastikan tidak ada roadmap ganda."*

Namun brief juga meminta hal-hal yang **belum pernah dibuat di dokumen manapun**: peta Capability → Program → Initiative → Epic → Feature → Task, dependency graph lintas-fase yang eksplisit, critical path analysis, strategi kerja paralel, team topology, KPI Engineering/Product/Business, architecture fitness functions, dan traceability matrix lintas-dokumen. Ini adalah gap nyata — dokumen existing menjelaskan *apa* yang dibangun tiap fase dan *bagaimana* kode ditulis, tapi tidak ada satu pun dokumen yang menjelaskan *urutan eksekusi presisi, siapa mengerjakan apa, dan bagaimana 203 file existing saling terhubung sebagai satu sistem*.

## 2. Opsi yang Dipertimbangkan

**Opsi A — Blueprint sebagai dokumen mandiri lengkap.** Tulis seluruh 35 item penuh, termasuk memparafrase ulang Risk Register, Migration Strategy, dst. Kelebihan: bisa dibaca berdiri sendiri tanpa membuka dokumen lain. Kekurangan: duplikasi konten permanen yang harus dijaga sinkron manual selamanya — begitu doc 04 Risk Register diupdate (mis. risiko baru ditemukan), Blueprint berpotensi jadi basi tanpa ada mekanisme yang memaksa update bersamaan. Ini persis anti-pattern yang [Engineering-Constitution/06-governance/24-documentation-standard.md](../Engineering-Constitution/06-governance/24-documentation-standard.md) sudah identifikasi sebagai "Dokumentasi Basi yang Dipercaya Buta."

**Opsi B — Blueprint sebagai orchestration/mission-control layer.** Untuk topik yang sudah lengkap di dokumen existing, Blueprint **merujuk balik** ke sumber tunggal tersebut (tidak memparafrase). Blueprint fokus menulis **lapisan baru** yang benar-benar belum ada: Capability-to-Task mapping, dependency graph, critical path, parallel work stream, team topology, KPI, fitness functions, decision gates operasional, traceability matrix. Kelebihan: nol duplikasi, Single Source of Truth dipertahankan, setiap update ke dokumen sumber otomatis tetap akurat direferensikan Blueprint tanpa perlu sinkronisasi manual. Kekurangan: pembaca Blueprint kadang perlu membuka dokumen lain untuk detail penuh (dimitigasi dengan link presisi ke section spesifik, bukan hanya nama dokumen).

**Opsi C — Tunda keputusan, tanya per-item saat menulis.** Tidak menetapkan strategi di depan, berhenti tiap kali overlap ditemukan. Kelebihan: tidak ada asumsi struktural besar yang salah. Kekurangan: untuk dokumen 35-bagian, ini berarti puluhan interupsi berpotensi — lambat dan tidak proporsional mengingat pola overlap sudah bisa dipetakan penuh di muka (tabel di atas).

## 3. Keputusan

**Opsi B — Blueprint sebagai orchestration/mission-control layer.**

Dikonfirmasi eksplisit oleh user: *"Saya ingin Master Delivery Blueprint menjadi lapisan orkestrasi yang menghubungkan seluruh Enterprise Architecture Repository, Phase 1 Planning, dan Engineering Constitution menjadi satu sistem eksekusi yang utuh... Jangan menduplikasi isi dokumen yang sudah ada. Pertahankan prinsip Single Source of Truth."*

Untuk 35 item brief, aturan penanganan:

1. **Item yang sudah punya jawaban lengkap di dokumen existing** (lihat tabel Bagian 1): Blueprint menulis **ringkasan 2-4 kalimat + link presisi ke section sumber**. Blueprint TIDAK memparafrase ulang isi lengkapnya. Jika Blueprint perlu menambahkan sesuatu yang belum tercakup sumber (mis. bagaimana Risk Register makro dan Risk Register Phase1 berinteraksi lintas-fase), itu ditulis sebagai **lapisan tambahan eksplisit ditandai "Blueprint-only"**, bukan disatukan tanpa penanda dengan isi rujukan.
2. **Item yang belum pernah dibuat di dokumen manapun** (Capability→Task mapping, dependency graph, critical path, parallel strategy, team topology, KPI, fitness functions, traceability matrix): Blueprint menulis penuh sebagai kontribusi baru — ini adalah nilai inti Blueprint.
3. **Setiap section Blueprint yang merujuk dokumen lain WAJIB menyatakan eksplisit di baris pertama**: "Sumber tunggal: [link]. Bagian ini HANYA menambahkan: [apa yang baru]." — pola ini mencegah pembaca masa depan (manusia atau AI) menganggap Blueprint sebagai sumber independen untuk topik yang sebenarnya dimiliki dokumen lain.

## 4. Struktur Dokumen

Blueprint ditempatkan di `docs/superpowers/specs/2026-07-18-enterprise-architecture/Master-Delivery-Blueprint/` (sejajar dengan `Phase1/` dan `Engineering-Constitution/`, bukan di dalam salah satunya — Blueprint mengorkestrasi ketiganya, tidak dimiliki salah satu).

File dipecah per kelompok topik (bukan satu file 35-bagian raksasa — konsisten prinsip file per domain yang sudah dipegang di seluruh Architecture Repository):

```
Master-Delivery-Blueprint/
├── README.md                              (peta 35 item -> file, status overlap vs new-layer)
├── 00-executive-delivery-vision.md         (item 1-3: Vision, Principles, Program Structure)
├── 01-capability-to-task-mapping.md        (item 4: Master Capability Matrix — KONTRIBUSI BARU)
├── 02-master-dependency-graph.md           (item 5-7: Dependency Graph, Critical Path, Parallel Strategy — KONTRIBUSI BARU)
├── 03-team-topology-and-resourcing.md      (item 8: Team Topology — KONTRIBUSI BARU)
├── 04-delivery-orchestration.md            (item 9-12: Phase Plan, Milestone, Exit/Entry — REFERENSI + orkestrasi lintas-fase)
├── 05-risk-and-debt-orchestration.md       (item 13-15: Risk, Tech Debt, Refactoring — REFERENSI + agregasi lintas-fase)
├── 06-engineering-delivery-mechanics.md    (item 16-20: Migration, Release, Branching, Versioning, Rollback — REFERENSI penuh)
├── 07-quality-and-validation-gates.md      (item 21-23: Testing, Security, Performance Gates — REFERENSI + gate operasional)
├── 08-platform-rollout-orchestration.md    (item 24-26: Observability, AI/Automation, UI/UX Rollout — REFERENSI + sequencing lintas-fase)
├── 09-saas-and-tenancy-readiness.md        (item 27-28: SaaS Readiness, Multi-company/tenant — REFERENSI + readiness checklist)
├── 10-kpi-and-fitness-functions.md         (item 29-32: KPI Engineering/Product/Business, Fitness Functions — KONTRIBUSI BARU)
├── 11-decision-gates-and-change-management.md (item 33-35: Decision Gates, Change Mgmt, Continuous Improvement — REFERENSI + operasionalisasi)
└── 12-traceability-matrix.md               (Cross-Document Traceability Matrix — KONTRIBUSI BARU, mengunci seluruh 203+ file existing + Blueprint sendiri ke satu peta)
```

Setiap file mengikuti header wajib:
```markdown
**Kedudukan dokumen ini:** [Referensi Penuh | Orkestrasi Baru | Campuran]
**Sumber tunggal (jika ada):** [link ke dokumen otoritatif]
**Kontribusi baru bagian ini:** [apa yang TIDAK ada di sumber manapun]
```

## 5. Konsekuensi

**Positif:**
- Nol duplikasi konten — update ke doc 04/Phase1/Constitution tidak pernah membuat Blueprint basi untuk topik yang direferensikan.
- Blueprint benar-benar bernilai tambah: 100% isinya adalah orkestrasi/sintesis yang belum pernah ada, bukan rewording.
- Traceability matrix (item baru, bukan diminta eksplisit di 35-list tapi diminta user di pesan susulan) menjadi index tunggal yang menjawab "modul/kemampuan X ada progressnya di mana" lintas 200+ file — nilai operasional tinggi untuk siapa pun (termasuk investor due diligence) yang perlu menavigasi seluruh corpus dokumen.

**Negatif/trade-off diterima sadar:**
- Membaca Blueprint sendirian tanpa membuka dokumen lain tidak memberi detail penuh untuk 15 dari 35 topik — dimitigasi dengan ringkasan 2-4 kalimat yang cukup untuk orientasi cepat + link presisi section, bukan hanya nama file.
- Struktur 13-file lebih kompleks dibanding satu dokumen tunggal — diterima karena preseden Engineering Constitution (39 file) sudah membuktikan pola file-per-domain lebih terpelihara daripada monolith untuk dokumen berskala ini.

## 6. Referensi

- Tabel overlap Bagian 1 (audit lengkap 35 item brief terhadap 3 dokumen sumber)
- [Engineering-Constitution/06-governance/24-documentation-standard.md](../Engineering-Constitution/06-governance/24-documentation-standard.md) — prinsip dokumentasi basi yang jadi alasan penolakan Opsi A
- [Engineering-Constitution/06-governance/19-architecture-decision-record-guide.md](../Engineering-Constitution/06-governance/19-architecture-decision-record-guide.md) — format ADR yang diikuti dokumen ini
- Pesan user yang mengonfirmasi Opsi B secara eksplisit (dikutip Bagian 3)

---

*ADR ini mengunci struktur Master Delivery Blueprint sebelum penulisan konten dimulai — konsisten pola ADR-first yang sudah ditetapkan untuk Engineering Constitution (ADR-000/001/002).*
