# CECEP — Architecture Roadmap Index

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** BUKAN desain, BUKAN discovery, BUKAN dokumen fase apa pun — **peta navigasi**. Berbeda dari README (yang menjelaskan APA CECEP) dan berbeda dari [`04-architecture-constitution.md`](04-architecture-constitution.md) (yang berisi ISI prinsip secara verbatim) — dokumen ini murni **indeks terstruktur**: Input/Output/Freeze/Transition/Dependencies per fase, supaya siapa pun (termasuk sesi Claude Code baru, atau anggota tim baru) bisa memahami keseluruhan roadmap tanpa membaca 29 dokumen dari awal.

**Kenapa dokumen ini dibutuhkan sekarang (bukan lebih awal):** Founder mengidentifikasi bahwa jumlah dokumen sudah melewati titik di mana navigasi manual (menyusuri rujukan silang satu per satu) menjadi tidak praktis — dan akan terus bertambah seiring Phase H-L. Dokumen ini adalah investasi navigasi, ditulis di titik transisi G→H karena di sinilah pola tujuh-lapisan + Transition Brief pertama kali terbukti lengkap sebagai satu siklus penuh.

**Aturan pemeliharaan:** Setiap kali sebuah fase baru di-freeze dan Transition Brief-nya selesai, baris fase itu di tabel § 2 WAJIB diperbarui (status Freeze + link Transition Brief). Dokumen ini TIDAK menyalin isi keputusan — hanya link + ringkasan satu baris. Kalau ringkasan di sini pernah terasa berbeda dari isi dokumen aslinya, dokumen asli yang benar (index ini bisa basi, sumber kebenaran selalu dokumen fase itu sendiri).

---

## 1. Cara Membaca Roadmap Ini

```
Setiap Fase Besar (A, B, C, D, E, F, G, H, I, J, K, L) mengikuti pola:

  Discovery → Philosophy → Validation → Discovery Completion Assessment
       → Design → Stress Test → Freeze → Transition Brief

Tidak semua fase (terutama A-C, sebelum pola ini distandarkan) melalui
ketujuh lapisan secara eksplisit terpisah — fase awal (A-C.5) memakai
pola yang lebih sederhana (Discovery → langsung Freeze) karena pola
tujuh-lapisan baru DITEMUKAN dan distandarkan sejak Phase G. Ini BUKAN
inkonsistensi — ini jejak evolusi metodologi itu sendiri (lihat § 4).
```

**Simbol status:**
- 🔒 **Frozen** — tidak boleh diubah tanpa ACR
- ▶️ **Ready to Start** — fondasi siap, belum dimulai
- ⏳ **Not Started** — menunggu fase sebelumnya

---

## 2. Tabel Fase A → L

### Phase A — Repository Discovery

| | |
|---|---|
| Dokumen | [`00`](00-phase-a-repository-discovery.md) |
| Input | Repository Puraloka Suite existing (kode, skema DB, dokumentasi) |
| Output | Pemetaan sistem existing yang relevan untuk CECEP (Notification System, dll.) |
| Freeze | 🔒 |
| Dependencies | Tidak ada (titik awal) |

### Phase B — Cost Engineering Discovery

| | |
|---|---|
| Dokumen | [`01`](01-phase-b-cost-engineering-discovery.md) |
| Input | Domain konstruksi Indonesia, kebutuhan bisnis Puraloka Persada |
| Output | Foundational Principles (4) — termasuk Company Intelligence Loop |
| Freeze | 🔒 |
| Dependencies | Phase A |

### Phase B.5 — Core Cost Engineering Architecture

| | |
|---|---|
| Dokumen | [`02`](02-phase-b5-core-cost-engineering-architecture.md) |
| Input | Foundational Principles (Phase B) |
| Output | Prinsip Final (10) + Architectural Constraints (6) — LOCKED |
| Freeze | 🔒 |
| Dependencies | Phase B |

### Phase C — Problem Discovery

| | |
|---|---|
| Dokumen | [`03`](03-phase-c-problem-discovery.md) |
| Input | Prinsip Final B.5 |
| Output | First Principles (4), Architectural Invariants (10) |
| Freeze | 🔒 |
| Dependencies | Phase B.5 |

### Phase C.5 — Core Domain Discovery

| | |
|---|---|
| Dokumen | [`03b`](03b-phase-c5-core-domain-discovery.md) |
| Input | First Principles + Invariants (Phase C) |
| Output | Kosakata DDD, Domain Object, Anti-Corruption Layer (diidentifikasi perlu, belum didesain) |
| Freeze | 🔒 (§ C.4 direvisi via [ACR-003](04a-adr-traceability-log.md)) |
| Dependencies | Phase C |

### Cross-Phase — Architecture Constitution

| | |
|---|---|
| Dokumen | [`04`](04-architecture-constitution.md) + [`04a`](04a-adr-traceability-log.md) |
| Input | Seluruh prinsip Phase B→C.5 |
| Output | Single source of truth 15 section: Foundational Principles, Five Truth Layers (§ 8), Decision Hierarchy (§ 9), Orchestration Separation (§ 10), Progressive Freeze Chain (§ 7), Quality Attributes (§ 11), Decision Checklist (§ 12), Traceability Obligation (§ 13), Operational Perspective (§ 14), **Discovery Completion Rule (§ 15)** |
| Freeze | 🔒 — hidup terus, diperbarui setiap fase baru mengunci prinsip baru |
| Dependencies | Semua fase sebelumnya; dirujuk semua fase sesudahnya |

### Phase D — Capability Architecture

| | |
|---|---|
| Dokumen | [`05`](05-phase-d-capability-architecture.md) |
| Input | Constitution (`04`) |
| Output | Capability Catalog CAP-001 s.d. CAP-013, Engine-Based Thinking |
| Freeze | 🔒 |
| Dependencies | `04` |

### Phase D.1 — Capability Validation & Freeze

| | |
|---|---|
| Dokumen | [`05b`](05b-phase-d1-capability-validation-freeze.md) |
| Input | Phase D |
| Output | Capability Catalog tervalidasi, Dependency Matrix terkunci |
| Freeze | 🔒 |
| Dependencies | Phase D |

### Phase E — Calculation Strategy

| | |
|---|---|
| Dokumen | [`06`](06-phase-e-calculation-strategy.md) |
| Input | Capability Catalog (D.1), khususnya CAP-006 |
| Output | Konstitusi Calculation Strategy ("AI tidak pernah menghitung sendiri"), Formula Definition, Dependency Graph, Override Hierarchy, Explanation Tree |
| Freeze | 🔒 (Assumption 2 direvisi via [ACR-001](04a-adr-traceability-log.md)) |
| Dependencies | Phase D.1 |

### Phase E.1 — Calculation Validation & Freeze

| | |
|---|---|
| Dokumen | [`06b`](06b-phase-e1-calculation-validation-freeze.md) |
| Input | Phase E |
| Output | Deterministic Result terverifikasi, Circular Dependency proof |
| Freeze | 🔒 |
| Dependencies | Phase E |

### Phase F — Enterprise Information Architecture

| | |
|---|---|
| Dokumen | [`07`](07-phase-f-enterprise-data-model.md) |
| Input | Capability + Calculation (D.1, E.1) |
| Output | 16 Information Classes (§ A), Canonical Information Contract 11-elemen (§ C, direvisi via [ACR-002](04a-adr-traceability-log.md)), Data Ownership (§ B) |
| Freeze | 🔒 |
| Dependencies | Phase D.1, E.1 |

### Phase F.1 — Information Validation & Freeze

| | |
|---|---|
| Dokumen | [`07b`](07b-phase-f1-information-validation-freeze.md) |
| Input | Phase F |
| Output | Information Model tervalidasi |
| Freeze | 🔒 |
| Dependencies | Phase F |

### Cross-Phase — Orchestration Readiness Assessment

| | |
|---|---|
| Dokumen | [`07c`](07c-orchestration-readiness-assessment.md) |
| Input | Phase F.1 + kebutuhan bisnis nyata (Procurement, Cashflow) |
| Output | Orchestration Gap-1 (Material Requirement), Gap-2 (Cashflow) — dikonfirmasi Orchestration Gap bukan Capability Gap, memicu Orchestration Separation Principle (`04` § 10) |
| Freeze | 🔒 |
| Dependencies | Phase F.1 |

### Phase G — Enterprise Orchestration Architecture

**Fase pertama yang menjalankan pola tujuh-lapisan penuh secara eksplisit.**

| Lapisan | Dokumen | Ringkasan Satu Baris |
|---|---|---|
| Discovery | [`08`](../enterprise-architecture-framework/08-phase-g-enterprise-orchestration-architecture.md) | Enterprise Event Catalog (19 event) + 7 artefak discovery |
| Philosophy | [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) | Definisi Orchestration, batas Orchestrator, 19 section |
| Philosophy Validation | [`08b`](../enterprise-architecture-framework/08b-phase-g0-orchestration-philosophy-validation.md) | Cross-Layer Leak ditemukan+diperbaiki (§ P) |
| Rule Taxonomy | [`08d`](../enterprise-architecture-framework/08d-rule-taxonomy-discovery.md) | 10 jenis Rule → 3 kelompok |
| Rule Meta Model | [`08e`](../enterprise-architecture-framework/08e-rule-meta-model-discovery.md) | Rule+Formula = Executable Knowledge Model |
| Rule Storage | [`08f`](../enterprise-architecture-framework/08f-rule-storage-philosophy.md) | Family→Template→Instance |
| Information Classification | [`08g`](../enterprise-architecture-framework/08g-information-classification-discovery.md) | Computed ≠ Derived, non-ACR |
| Information Characteristic | [`08h`](../enterprise-architecture-framework/08h-information-characteristic-discovery.md) | Dua sumbu Classification×Characteristic |
| Rule Ontology Validation | [`08i`](../enterprise-architecture-framework/08i-rule-ontology-validation.md) | 4 sudut pandang diverifikasi konsisten |
| Discovery Completion | [`08j`](../enterprise-architecture-framework/08j-discovery-completion-assessment.md) | 14 Open Question dinilai, Discovery Completion Rule lahir |
| Design | [`08c`](../enterprise-architecture-framework/08c-orchestration-rule-design.md) v1 (superseded) → [`08c v2`](../enterprise-architecture-framework/08c-orchestration-rule-design-v2.md) | Rule-001 s.d. 005 konkret |
| Stress Test & Freeze | [`08k`](../enterprise-architecture-framework/08k-phase-g1-rule-design-validation-freeze.md) | 12 skenario adversarial, 6 perbaikan aditif |
| Dashboard (bukan gate) | [`09`](../enterprise-architecture-framework/09-cecep-architecture-readiness-review-v2.md) | Readiness Review v2, status lintas-layer |
| Transition Brief | [`10`](../enterprise-architecture-framework/10-phase-transition-g-to-h.md) | Handover formal G→H |

| | |
|---|---|
| Freeze | 🔒 (Phase G penuh, per [`08k`](../enterprise-architecture-framework/08k-phase-g1-rule-design-validation-freeze.md)) |
| Dependencies | Phase F.1, `07c` |

### Phase H — Integration Architecture

| | |
|---|---|
**Fase kedua yang menjalankan pola lapisan penuh, dengan tambahan Asset Model (bukan sekadar Meta Model Rule) — lihat § 4 evolusi metodologi.**

| Lapisan | Dokumen | Ringkasan Satu Baris |
|---|---|---|
| Discovery (ontologi) | [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 0-12 | Definisi Integration, Determinism Boundary, Sibling terhadap Orchestration (2 alat uji), 10 Ontology Relation |
| Discovery Completion | [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 13 | Meta-discovery ditutup, pergeseran ke substansi |
| Discovery substansi | [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 14-15 | Struktur tiga-elemen (Titik Serah/Uncertainty Window/Reconciliation), 14+ skenario mekanisme |
| Philosophy/Design | [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 16-20 | Timeout, CAP-013 Strategy Pattern, Join Policy, Payload Contract, Adapter |
| Asset Model | [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 22 | Integration Point = Configuration Data, Lifecycle+Degraded, Dual Ownership |
| Reality Stress Validation & Freeze | [`15`](../enterprise-architecture-framework/15-phase-h1-reality-stress-validation.md) | 38 skenario 10 kelompok, 13 perbaikan, 1 perluasan struktural |
| Transition Brief | [`16`](../enterprise-architecture-framework/16-phase-transition-h-to-i.md) | Handover formal H→I |

| | |
|---|---|
| Freeze | 🔒 (Phase H penuh, per [`15`](../enterprise-architecture-framework/15-phase-h1-reality-stress-validation.md)) |
| Dependencies | Phase G (frozen), `10` |

### Phase I — AI Architecture

**Fase ketiga pola lapisan penuh — Discovery tiga putaran (dua definisi ditarik sebelum bertahan), Meta Model lima kandidat, Audit Ketergantungan H→I.**

| Lapisan | Dokumen | Ringkasan Satu Baris |
|---|---|---|
| Discovery (ontologi, 3 putaran) | [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § 0-9 | AI = sumber jawaban dari aturan hasil ekstraksi, bukan spesifikasi eksplisit — bertahan setelah 2 definisi sebelumnya ditarik |
| Philosophy | [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § 11 | 9 konsekuensi arsitektural, AI di luar Determinism Boundary sisi sama Integration |
| Meta Model | [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § 12-13 | AI = kategori Meta Model tersendiri, bukan Capability/Strategy/Configuration/Executable Knowledge Model |
| Reality Stress Validation & Freeze | [`18`](../enterprise-architecture-framework/18-phase-i1-ai-reality-stress-validation.md) § 1-10 | 32 skenario 10 kelompok khas-AI, 19 field baru, temuan validitas temporal |
| Audit Ketergantungan | [`18`](../enterprise-architecture-framework/18-phase-i1-ai-reality-stress-validation.md) § 11 | 3 Kategori Dependency (Ontologis/Implementasi/Reuse Murni) |
| Transition Brief | [`19`](../enterprise-architecture-framework/19-phase-transition-i-to-j.md) | Handover formal I→J |

| | |
|---|---|
| Freeze | 🔒 (Phase I penuh, per [`18`](../enterprise-architecture-framework/18-phase-i1-ai-reality-stress-validation.md)) |
| Dependencies | Phase H (frozen), `16` |

### Phase J — Future Vision

| | |
|---|---|
| Dokumen | *(belum ditulis)* |
| Input | Lihat [`19`](../enterprise-architecture-framework/19-phase-transition-i-to-j.md) § 2 (AI Meta Model, Tiga Kategori Dependency, dua Observasi Metodologi sebagai data point ketiga) |
| Perspektif wajib | Operational Evolution (`04` § 14) |
| Freeze | ▶️ Ready to Start |
| Dependencies | Phase I (frozen), `19` |

### Phase K — Impact Analysis

| | |
|---|---|
| Dokumen | *(belum ditulis)* |
| Perspektif wajib | Deployment Impact (`04` § 14) — backup strategy, storage growth, tenant migration |
| Freeze | ⏳ Not Started |
| Dependencies | Phase J |

### Phase L — Documentation

| | |
|---|---|
| Dokumen | *(belum ditulis)* |
| Perspektif wajib | Operational Blueprint (`04` § 14) — runbook, DR plan, retention policy |
| Freeze | ⏳ Not Started |
| Dependencies | Phase K |

---

## 3. Peta Ketergantungan (Ringkas)

```
A → B → B.5 → C → C.5 ─────────────────┐
                                         ▼
                              04 Constitution (hidup terus)
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
              D → D.1              E → E.1              F → F.1
                    │                    │                    │
                    └────────────────────┴──────────┬─────────┘
                                                      ▼
                                              07c Readiness
                                                      │
                                                      ▼
                                        G (14 lapisan, lihat § 2)
                                                      │
                                                      ▼
                                        10 Transition Brief G→H
                                                      │
                                                      ▼
                                        H (Integration) 🔒 Frozen
                                                      │
                                                      ▼
                                        16 Transition Brief H→I
                                                      │
                                                      ▼
                                              I (AI) 🔒 Frozen
                                                      │
                                                      ▼
                                        19 Transition Brief I→J
                                                      │
                                                      ▼
                                        J (Future Vision) ▶️ ← ANDA DI SINI
                                                      │
                                                      ▼
                                              K → L ⏳
```

---

## 4. Evolusi Metodologi — Kenapa Fase Awal Terlihat Berbeda dari Phase G

**Ditulis eksplisit supaya pembaca baru tidak bingung kenapa Phase A-C.5 tidak punya "Discovery Completion Assessment" atau "Stress Test" terpisah:**

Pola tujuh-lapisan (Discovery→Philosophy→Validation→Discovery Completion→Design→Stress Test→Freeze) **TIDAK ada sejak awal** — ia adalah hasil evolusi bertahap sepanjang perjalanan CECEP sendiri:

- **A-C.5**: pola sederhana, Discovery→Freeze langsung (metodologi belum matang, masih fase pembentukan Foundational Principles).
- **D-F.1**: mulai muncul pola Philosophy+Design+Validation terpisah (Capability Philosophy, Calculation Philosophy, Information Philosophy) — TAPI belum ada Discovery Completion Assessment maupun Stress Test formal.
- **G-G.1**: pola tujuh-lapisan PERTAMA KALI lengkap dan eksplisit — termasuk penemuan **Momentum Bias** (kesalahan yang MEMICU lahirnya `08d`-`08j`) dan **Discovery Completion Rule** (`04` § 15, kelahirannya sendiri didokumentasikan di `08j`).
- **H ke atas**: WAJIB mengikuti pola tujuh-lapisan penuh sejak awal (tidak ada lagi alasan "belum ditemukan polanya") + Transition Brief sebagai lapisan kedelapan.

**Ini bukan inkonsistensi yang perlu diperbaiki secara retroaktif** — Phase A-F.1 TIDAK di-ACR untuk "disamakan" dengan pola G, karena isinya sudah benar dan frozen; yang berubah hanya KETAT-nya prosedur, bukan validitas hasilnya. Mencoba menyeragamkan secara retroaktif akan melanggar Progressive Freeze Chain (`04` § 7) tanpa alasan substantif.

---

## Assumptions

1. Tabel § 2 adalah snapshot pada saat dokumen ini ditulis (Phase G baru frozen, Phase H belum dimulai) — akan menjadi BASI begitu Phase H menghasilkan dokumen nyata. Aturan pemeliharaan (pembuka dokumen) mewajibkan update, tapi ini bergantung disiplin manual, bukan otomatis.
2. Dependency Map (§ 3) disederhanakan untuk keterbacaan — tidak menunjukkan SEMUA rujukan silang detail (mis. `08k` merujuk balik ke `06` § D.2 untuk algoritma DFS) yang ada di teks masing-masing dokumen. Untuk detail rujukan, dokumen aslinya tetap sumber kebenaran.

## Open Questions

(Tidak ada — dokumen ini murni indeks dari keputusan yang sudah dikunci.)

## Status

**Master Index selesai — dipetakan dalam satu tabel navigasi.** Bukan pengganti README maupun Constitution — pelengkap navigasi untuk roadmap yang sudah melewati titik kompleksitas manual. **Wajib diperbarui setiap kali fase baru di-freeze** — dimulai dari Phase H begitu dokumennya ditulis.

**Catatan:** [`12-glossary.md`](12-glossary.md) (kamus istilah) dan [`13-working-methodology.md`](../enterprise-architecture-framework/13-working-methodology.md) (SOP kerja, diturunkan dari Constitution § 17 setelah diuji "Batas Constitution") ditulis SETELAH tabel § 2 disusun — keduanya dokumen navigasi/metodologi, bukan fase A-L, jadi tidak masuk tabel § 2 (yang murni memetakan fase). Dirujuk di sini sebagai pelengkap: [`12`](12-glossary.md) untuk istilah, [`13`](../enterprise-architecture-framework/13-working-methodology.md) untuk kebiasaan kerja seperti Pre-Discovery Framing dan Uji Universalitas.
