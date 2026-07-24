# 05 — Risk Register Orchestration, Technical Debt Strategy, Refactoring Strategy

**Kedudukan dokumen ini:** Campuran — Risk Register makro sudah lengkap di [04-roadmap-governance-and-delivery.md § Risk Register](../04-roadmap-governance-and-delivery.md#risk-register) (9 item) dan [Phase1/04-risk-register.md](../Phase1/04-risk-register.md) (R1-R10 Sub-Fase 1A-1D). Technical Debt sudah lengkap di [04 § Technical Debt Register](../04-roadmap-governance-and-delivery.md#technical-debt-register) dan [Engineering-Constitution/06-governance/30-technical-debt-policy.md](../Engineering-Constitution/06-governance/30-technical-debt-policy.md). Refactoring sudah lengkap di [Engineering-Constitution/06-governance/31-refactoring-policy.md](../Engineering-Constitution/06-governance/31-refactoring-policy.md). **Kontribusi baru bagian ini:** memetakan risiko mana terkait Program mana (sumber tidak mengelompokkan per Program), dan mengidentifikasi risiko **yang muncul dari sequencing/paralelisme itu sendiri** — kategori risiko yang secara definisi tidak bisa ada di dokumen manapun sebelum Master Dependency Graph ([02-master-dependency-graph.md](02-master-dependency-graph.md)) ditulis.

---

## 1. Risk Register — Peta ke Program

**Sumber tunggal:** [04-roadmap-governance-and-delivery.md § Risk Register](../04-roadmap-governance-and-delivery.md#risk-register) (9 item lengkap dengan Likelihood/Impact/Mitigasi). Tidak diparafrase — tabel di bawah **hanya menambahkan kolom Program** yang belum ada di sumber.

| # Risiko (ringkas) | Kategori | Program Terdampak |
|---|---|---|
| 1. Role kustom cakupan RLS nol | Security | Program A |
| 2. Perubahan logic finansial tanpa test | Operasional/Finansial | Program A, B (setiap Program yang menyentuh 6 file finansial-kritis) |
| 3. Migrasi `company_id` human error | Data Integrity | Program D (bagian 2) |
| 4. Tidak ada DR terverifikasi | Operasional | Lintas-Program (infrastruktur, bukan spesifik satu Program) |
| 5. Solo engineer = bus factor 1 | Organisasi | Lintas-Program — lihat [03-team-topology-and-resourcing.md](03-team-topology-and-resourcing.md) untuk mitigasi detail |
| 6. Phase 8 tanpa pelanggan eksternal | Bisnis/Strategis | Program F |
| 7. AI Platform sebelum Permission Engine solid | Security | Program E (bagian 2) — lihat [02-master-dependency-graph.md § 2](02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit) |
| 8. Deploy cloud tanpa observability | Operasional | Program A-E (kapan pun deployment cloud pertama terjadi) |
| 9. `SUPABASE_SECRET_KEY` bocor | Security | Lintas-Program |

**Untuk detail Likelihood/Impact/Mitigasi/Dokumen Rujukan lengkap tiap item:** baca [04-roadmap-governance-and-delivery.md § Risk Register](../04-roadmap-governance-and-delivery.md#risk-register) langsung.

**Risk Register Sub-Fase 1A-1D (R1-R10, lebih granular):** [Phase1/04-risk-register.md](../Phase1/04-risk-register.md) — seluruhnya berada di dalam Program A, tidak diparafrase ulang di sini.

## 2. Risiko Baru — Muncul dari Sequencing/Paralelisme (Kontribusi Baru)

Kategori risiko ini **tidak bisa ada** sebelum [02-master-dependency-graph.md](02-master-dependency-graph.md) ditulis — risiko ini bukan tentang satu Program, tapi tentang **interaksi** antar Program:

| # | Risiko | Kategori | Likelihood | Impact | Mitigasi |
|---|---|---|---|---|---|
| S1 | Tim (begitu bertambah) mengeksekusi Program C Epic RFI/Submittals **atau CECEP Milestone 3-4 (Approval Workflow)** sebelum Program B selesai, karena dependency non-obvious (lihat [02-master-dependency-graph.md § 2, B→C](02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit)) tidak dibaca — risiko khusus CECEP: planning arsitekturnya SUDAH selesai penuh ([CECEP/32](../CECEP/32-cecep-roadmap-v2.md)), godaan "mulai coding karena sudah didesain" lebih besar daripada Epic lain yang belum di-planning sama sekali | Delivery/Rework | Menengah (dependency ini mudah terlewat karena tidak eksplisit di doc 04 asli) | Tinggi (kerja diulang — CECEP Approval Workflow jadi implementasi keempat yang harus dimigrasi, [CECEP/51](../CECEP/51-final-audit-and-main-roadmap-position.md#bagian-4--kapan-main-roadmap-ini-dikerjakan)) | Entry Criteria eksplisit per Program ([04-delivery-orchestration.md § 3](04-delivery-orchestration.md#3-entry-criteria--operasionalisasi-per-program)) **MUST** dicek sebelum Epic RFI/Submittals atau CECEP Milestone 3-4 dimulai |
| S2 | Program D1 (Phase 4, Enterprise Modules) diimplementasikan dengan asumsi hardcode single-company "karena Phase 7 belum jelas kapan," melanggar prinsip *company-aware by design* ([02-master-dependency-graph.md § 2, D1→D2](02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit)) | Technical Debt | Menengah (godaan shortcut nyata saat under deadline) | Tinggi (retrofit `company_id` ke modul yang sudah hardcode lebih mahal daripada desain benar sejak awal) | Code review checklist Program D1 **MUST** eksplisit memeriksa "tidak ada asumsi single-company hardcode" sebagai item wajib, bukan asumsi implisit |
| S3 | Kontributor kedua bergabung (Skala 2, [03-team-topology-and-resourcing.md](03-team-topology-and-resourcing.md)) mengerjakan Program paralel tanpa membaca Master Dependency Graph, menciptakan konflik integrasi saat kedua jalur paralel bertemu (mis. Program B mengubah struktur data yang diasumsikan stabil oleh Program C) | Delivery/Coordination | Rendah hari ini (solo), naik signifikan begitu tim bertambah | Menengah | [02-master-dependency-graph.md § 5](02-master-dependency-graph.md#5-dependency-yang-sengaja-tidak-ada-mencegah-asumsi-salah) **MUST** dibaca sebagai bagian onboarding kontributor baru — ditambahkan sebagai item wajib begitu proses onboarding dibuat |
| S4 | Critical Path menuju L2 (Program A → D1 → D2, [02-master-dependency-graph.md § 3](02-master-dependency-graph.md#3-critical-path-analysis)) diambil sebagai jalan pintas melewati Program B/C karena tekanan bisnis, tapi Program D1 ternyata *tetap* diam-diam bergantung pada sebagian Workflow Engine yang belum terdeteksi saat dependency graph pertama ditulis | Architecture | Rendah | Tinggi jika terjadi | Setiap kali Critical Path jalan pintas diambil ([02-master-dependency-graph.md § 3](02-master-dependency-graph.md#3-critical-path-analysis)), **MUST** ada Architecture Review tambahan ([04 § Architecture Governance](../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates) gate #1) khusus memverifikasi tidak ada dependency tersembunyi ke Program yang dilewati |

**Prinsip penambahan risiko baru:** Item S1-S4 di atas **MUST** ditambahkan ke [Phase1/04-risk-register.md](../Phase1/04-risk-register.md) atau [04-roadmap-governance-and-delivery.md § Risk Register](../04-roadmap-governance-and-delivery.md#risk-register) begitu Program terkait benar-benar dimulai — Blueprint ini adalah tempat risiko **diidentifikasi** (karena hanya di sini dependency lintas-Program terlihat utuh), tapi **pelacakan** tetap di Risk Register sumber tunggal (tidak ada Risk Register ketiga terpisah).

## 3. Technical Debt Strategy

**Sumber tunggal:** [04-roadmap-governance-and-delivery.md § Technical Debt Register](../04-roadmap-governance-and-delivery.md#technical-debt-register) (5 item: CQRS/Event Sourcing, Saga Pattern, Field-level Encryption, Full HRIS/Payroll, Microservices/Kafka — masing-masing dengan kondisi eksplisit kapan diangkat kembali) dan [Engineering-Constitution/06-governance/30-technical-debt-policy.md](../Engineering-Constitution/06-governance/30-technical-debt-policy.md) (aturan dokumentasi debt per-PR).

**Ringkasan untuk pembaca Blueprint:** Kelima item debt di doc 04 sudah punya kondisi "kapan diangkat kembali" yang presisi — Blueprint tidak menambah item baru, hanya menegaskan: **setiap Program yang berpotensi memicu kondisi tersebut** ([04-roadmap-governance-and-delivery.md § Technical Debt Register](../04-roadmap-governance-and-delivery.md#technical-debt-register)) **MUST** eksplisit memeriksa Technical Debt Register sebagai bagian Entry Criteria ([04-delivery-orchestration.md § 3](04-delivery-orchestration.md#3-entry-criteria--operasionalisasi-per-program)) — misalnya Program F (SaaS, banyak tenant) adalah kandidat pemicu "Read-load jadi bottleneck terukur" (kondisi CQRS diangkat kembali).

## 4. Refactoring Strategy

**Sumber tunggal:** [Engineering-Constitution/06-governance/31-refactoring-policy.md](../Engineering-Constitution/06-governance/31-refactoring-policy.md) — aturan lengkap (refactoring dipicu sinyal konkret, dipisah dari PR fitur, disertai test regression-safe untuk domain finansial-kritis).

**Ringkasan untuk pembaca Blueprint:** Program B (Workflow Engine migration) **adalah** refactoring skala besar by design — [Engineering-Constitution/06-governance/31-refactoring-policy.md § Example Good](../Engineering-Constitution/06-governance/31-refactoring-policy.md#7-example-good) secara eksplisit mencontohkan pola strangler-fig kasbon→CO→procurement yang **sama persis** dengan urutan migrasi Program B ([01-capability-to-task-mapping.md § Capability 2](01-capability-to-task-mapping.md#capability-2--mengelola-persetujuan-finansial-domain-platform-services--finance-program-a--program-b)) — konfirmasi bahwa kebijakan refactoring existing dan rencana eksekusi Blueprint sudah selaras tanpa perlu penyesuaian.

## 5. References

- [04-roadmap-governance-and-delivery.md § Risk Register](../04-roadmap-governance-and-delivery.md#risk-register)
- [04-roadmap-governance-and-delivery.md § Technical Debt Register](../04-roadmap-governance-and-delivery.md#technical-debt-register)
- [Phase1/04-risk-register.md](../Phase1/04-risk-register.md)
- [Engineering-Constitution/06-governance/30-technical-debt-policy.md](../Engineering-Constitution/06-governance/30-technical-debt-policy.md)
- [Engineering-Constitution/06-governance/31-refactoring-policy.md](../Engineering-Constitution/06-governance/31-refactoring-policy.md)
- [02-master-dependency-graph.md](02-master-dependency-graph.md)

---

*Batch E selesai. File selanjutnya: [06-engineering-delivery-mechanics.md](06-engineering-delivery-mechanics.md)*
