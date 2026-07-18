# 09 — SaaS Readiness Strategy, Multi-company & Multi-tenant Readiness

**Kedudukan dokumen ini:** Campuran — L1→L4 evolution model sudah lengkap di [00-vision-and-business-architecture.md § Long-Term SaaS Vision](../00-vision-and-business-architecture.md#long-term-saas-vision-l1--l4-evolution-model), SaaS Operations Platform module catalog sudah lengkap juga di doc 00. **Kontribusi baru bagian ini:** checklist readiness konkret yang menerjemahkan "L2 tercapai" / "L3 boleh dimulai" dari narasi menjadi kriteria yang bisa dicek — sumber menjelaskan *apa* L2/L3/L4, belum menjelaskan *bagaimana tahu sudah siap*.

---

## 1. L1 → L2 → L3 → L4 — Ringkasan Orientasi

**Sumber tunggal:** [00-vision-and-business-architecture.md § Long-Term SaaS Vision](../00-vision-and-business-architecture.md#long-term-saas-vision-l1--l4-evolution-model) — definisi lengkap L1 (single-tenant internal, kondisi hari ini), L2 (multi-company dalam grup usaha), L3 (commercial SaaS eksternal), L4 (regional enterprise).

**Peta ke Program:** L1→L2 = Program D (bagian 2, `company_id`). L2→L3 = Program F (bagian 1, Phase 8). L3→L4 = Program F (bagian 2, Phase 9, horizon 5-10 tahun, sengaja tidak dirinci).

## 2. Multi-Company Readiness Checklist (L1 → L2) — Kontribusi Baru

Sebelum Program D2 (`company_id` migration) dianggap **selesai** (bukan hanya "migration file sudah jalan"):

- [ ] `company_id` ada di **seluruh** tabel transaksional (bukan sebagian) — audit lengkap terhadap 67 tabel
- [ ] Dual-axis RLS aktif: setiap policy memeriksa **role DAN company** — bukan hanya salah satu, sesuai [01-application-and-data-architecture.md § Entity Strategy](../01-application-and-data-architecture.md#entity-strategy)
- [ ] Data 2 company berbeda dalam satu instance terverifikasi terisolasi **secara manual** (bukan hanya lolos test otomatis) — konsisten [07-quality-and-validation-gates.md § 1](07-quality-and-validation-gates.md#1-testing-strategy-mapping)
- [ ] User dengan akses ke Company A **tidak bisa** melihat data Company B lewat jalur manapun (API langsung, export, search global) — audit menyeluruh, bukan sampling satu endpoint
- [ ] Menu Registry ([04-roadmap-governance-and-delivery.md § Foundational Engines item #10](../04-roadmap-governance-and-delivery.md#foundational-engines-prioritization)) mendukung menu berbeda per company jika kebutuhan berbeda muncul
- [ ] Minimal 2 kontributor terlibat review migrasi ini ([03-team-topology-and-resourcing.md § 5](03-team-topology-and-resourcing.md#5-resourcing-per-program--estimasi-kualitatif): migrasi ini tidak solo-safe)

**Definisi "L2 tercapai":** seluruh checklist di atas ✅ **DAN** Milestone M6 ([04-delivery-orchestration.md § 2](04-delivery-orchestration.md#2-milestone-definition--kontribusi-baru)) sudah didemokan dengan skenario nyata (bukan data uji sintetis).

## 3. Multi-Tenant SaaS Readiness Checklist (L2 → L3) — Kontribusi Baru

**Gate masuk paling ketat di seluruh roadmap** ([04-roadmap-governance-and-delivery.md § Phase 8](../04-roadmap-governance-and-delivery.md#phase-8--multi-tenant-saas-platform)): checklist di bawah **MUST NOT** mulai dikerjakan sebelum kondisi pertama terpenuhi.

- [ ] **Pelanggan eksternal committed** (di luar grup usaha Puraloka) — kondisi mutlak, bukan negotiable, sesuai [00-vision-and-business-architecture.md § Non-Goals](../00-vision-and-business-architecture.md#non-goals)
- [ ] L2 (Bagian 2 checklist) sudah tercapai penuh dan stabil di production selama periode wajar (bukan baru selesai kemarin)
- [ ] Tenant Lifecycle module ([00-vision-and-business-architecture.md § Domain SaaS Operations Platform](../00-vision-and-business-architecture.md#domain-saas-operations-platform-domain-baru--hilang-sepenuhnya-spesifik-untuk-l3)) — provisioning, offboarding, data export — didesain sebelum tenant pertama di-onboard
- [ ] Billing & Metering module — plan/entitlement management terhubung ke Module Catalog tiering (menentukan modul apa aktif per tenant)
- [ ] Observability Platform (produk, bukan internal) — pelanggan eksternal butuh visibility berbeda dari observability internal ([08-platform-rollout-orchestration.md § 1](08-platform-rollout-orchestration.md#1-observability-rollout))
- [ ] SLA per tenant terdefinisi dan bisa dipantau — blue-green/canary deployment ([06-engineering-delivery-mechanics.md](06-engineering-delivery-mechanics.md)) aktif sebelum tenant kedua bergantung pada uptime yang sama
- [ ] Tim sudah di Skala 4 ([03-team-topology-and-resourcing.md § 4](03-team-topology-and-resourcing.md#4-topology-per-skala--evolusi-bertahap)) — fungsi non-engineering (customer support minimal) tersedia

**Anti-pattern eksplisit yang dicegah checklist ini:** membangun *satu pun* item di atas sebelum kondisi pertama (pelanggan committed) terpenuhi adalah *enterprise theater* — istilah yang dipakai eksplisit [00-vision-and-business-architecture.md § Non-Goals](../00-vision-and-business-architecture.md#non-goals) untuk investasi infrastruktur SaaS tanpa validasi pasar nyata.

## 4. L3 → L4 (Regional Enterprise) — Sengaja Tidak Dirinci

Konsisten [04-roadmap-governance-and-delivery.md § Phase 9](../04-roadmap-governance-and-delivery.md#phase-9--enterprise-scale-platform): "detail konkret fase ini sengaja tidak didesain mendalam sekarang." Checklist readiness L3→L4 **tidak** ditulis di Blueprint ini — akan ditulis saat Phase 9 benar-benar mendekat, berdasarkan realita bisnis saat itu (multi-region data residency, compliance formal SOC2/ISO jika pelanggan enterprise mensyaratkan — [04 § Phase 9](../04-roadmap-governance-and-delivery.md#phase-9--enterprise-scale-platform)), bukan spekulasi hari ini.

## 5. Prinsip Governance Bagian Ini

1. Checklist Bagian 2 dan 3 **MUST** menjadi bagian Exit Criteria Program D dan Program F ([04-delivery-orchestration.md § 4](04-delivery-orchestration.md#4-exit-criteria--operasionalisasi-per-program)) — **MUST NOT** dianggap dokumen terpisah yang independen dari definisi "Program selesai."
2. Checklist Bagian 3 item pertama (pelanggan eksternal committed) **MUST** diverifikasi ulang sebelum **setiap** item lain dikerjakan — jika komitmen pelanggan batal di tengah jalan, seluruh pekerjaan Bagian 3 **MUST** dihentikan, bukan dilanjutkan dengan asumsi "sudah terlanjur mulai."

## 6. References

- [00-vision-and-business-architecture.md § Long-Term SaaS Vision](../00-vision-and-business-architecture.md#long-term-saas-vision-l1--l4-evolution-model)
- [00-vision-and-business-architecture.md § Non-Goals](../00-vision-and-business-architecture.md#non-goals)
- [04-roadmap-governance-and-delivery.md § Phase 8, Phase 9](../04-roadmap-governance-and-delivery.md#phase-8--multi-tenant-saas-platform)
- [01-application-and-data-architecture.md § Entity Strategy](../01-application-and-data-architecture.md#entity-strategy)
- [04-delivery-orchestration.md](04-delivery-orchestration.md)

---

*Batch G selesai. File selanjutnya: [10-kpi-and-fitness-functions.md](10-kpi-and-fitness-functions.md)*
