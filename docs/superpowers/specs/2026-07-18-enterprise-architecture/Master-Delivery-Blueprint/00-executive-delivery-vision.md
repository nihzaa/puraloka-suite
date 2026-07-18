# 00 — Executive Delivery Vision, Delivery Principles, Program Structure

**Kedudukan dokumen ini:** Campuran — Vision produk sudah lengkap di [00-vision-and-business-architecture.md](../00-vision-and-business-architecture.md), Delivery Principles sudah lengkap di [Engineering-Constitution/00-principles/00-engineering-principles.md](../Engineering-Constitution/00-principles/00-engineering-principles.md). **Kontribusi baru bagian ini:** Program Structure — bagaimana Phase 0-9 dikelompokkan menjadi Program yang bisa dikelola sebagai unit delivery terpisah dengan owner dan gate jelas, sesuatu yang belum pernah didefinisikan eksplisit.

---

## 1. Executive Delivery Vision

**Sumber tunggal:** [00-vision-and-business-architecture.md § Product Vision](../00-vision-and-business-architecture.md#product-vision) dan [§ Long-Term SaaS Vision (L1 → L4)](../00-vision-and-business-architecture.md#long-term-saas-vision-l1--l4-evolution-model).

**Ringkasan untuk pembaca Blueprint:** Puraloka Suite berevolusi dari L1 (single-tenant internal, kondisi hari ini — 5 proyek, 12 user, satu badan usaha Puraloka Persada) menuju L4 (regional enterprise platform) lewat empat horizon: L1 → L2 (multi-company dalam satu grup usaha, Phase 7) → L3 (commercial SaaS multi-tenant, Phase 8, **hanya jika ada pelanggan eksternal committed**) → L4 (regional enterprise, Phase 9, horizon 5-10 tahun). Setiap horizon adalah **pencapaian teknis yang harus dibuktikan dengan working software**, bukan slide deck — prinsip yang mengikat seluruh Program Structure di bawah.

**Untuk detail lengkap** (capability map, business positioning, non-goals eksplisit): baca [00-vision-and-business-architecture.md](../00-vision-and-business-architecture.md) langsung — tidak diparafrase ulang di sini.

## 2. Delivery Principles

**Sumber tunggal:** [Engineering-Constitution/00-principles/00-engineering-principles.md](../Engineering-Constitution/00-principles/00-engineering-principles.md) (6 prinsip: correctness before speed, config-driven bukan hardcode, fail-closed, setiap perubahan berisiko punya rollback, strict YAGNI, kejujuran status implementasi).

**Ringkasan untuk pembaca Blueprint:** Enam prinsip ini mengikat **cara** setiap Program di bawah dieksekusi — bukan hanya kode yang ditulis, tapi juga bagaimana Program direncanakan. Konkretnya untuk delivery planning:
- **Correctness before speed** → tidak ada Program yang di-fast-track dengan mengorbankan test coverage pada domain finansial-kritis (lihat [07-quality-and-validation-gates.md](07-quality-and-validation-gates.md)).
- **Fail-closed** → setiap Decision Gate ([11-decision-gates-and-change-management.md](11-decision-gates-and-change-management.md)) defaultnya **menahan** progres ke Program berikutnya sampai kriteria terpenuhi, bukan default lanjut kecuali ada yang keberatan.
- **Strict YAGNI** → Program yang scope-nya spekulatif (Phase 8 tanpa pelanggan committed, Phase 9 detail mendalam) sengaja **tidak** direncanakan rinci di Blueprint ini — lihat [04-delivery-orchestration.md § Horizon Jauh](04-delivery-orchestration.md).

## 3. Program Structure — Kontribusi Baru

Belum ada dokumen manapun yang mengelompokkan Phase 0-9 doc 04 menjadi unit delivery yang punya owner, gate masuk/keluar terpisah, dan durasi realistis untuk tim solo→kecil. Program Structure berikut adalah pengelompokan operasional di atas Phase 0-9 — **tidak mengubah urutan atau isi fase** ([04-roadmap-governance-and-delivery.md § Phase 0-9](../04-roadmap-governance-and-delivery.md#phase-0-9-transformation-program) tetap otoritatif), hanya menambah lapisan manajemen program.

| Program | Fase Dicakup | Tujuan Program | Program Owner (hari ini) |
|---|---|---|---|
| **Program A — Foundation Hardening** | Phase 1 | Menutup gap keamanan aktif (Permission Engine, RLS-RBAC sync) + membangun jaring pengaman test/CI sebelum fase berat manapun dimulai | Nizar (solo, dibantu AI coding assistant) |
| **Program B — Dynamic Engine Platform** | Phase 2 | Mengganti tiga implementasi approval-chain terpisah (kasbon/CO/procurement) dengan satu Workflow Engine generik + Notification Routing Engine | Nizar (solo) |
| **Program C — Domain Depth** | Phase 3 | Memperdalam Core Domain (Project Delivery) dengan modul Tier 1/2 yang paling berdampak operasional nyata | Nizar (solo, kandidat hire kedua muncul di sini — lihat [03-team-topology-and-resourcing.md](03-team-topology-and-resourcing.md)) |
| **Program D — Enterprise Readiness** | Phase 4, Phase 7 | Modul Enterprise (Payroll/HR/GL dasar) dibangun *company-aware* di Phase 4, mendapat kesadaran multi-company penuh saat `company_id` migration (Phase 7) — dua fase yang **secara sengaja tidak berurutan linear** (lihat [02-master-dependency-graph.md](02-master-dependency-graph.md) untuk penjelasan dependency non-linear ini) | Belum ditentukan — bergantung tim saat Program C selesai |
| **Program E — Automation & Intelligence** | Phase 5, Phase 6 | Trigger/Event Engine (Phase 5) sebagai prasyarat keras AI Native Platform (Phase 6) — AI Agent Registry dimulai dari 1 pilot (AI Assistant), bukan 14 agent sekaligus | Belum ditentukan |
| **Program F — SaaS Transformation** | Phase 8, Phase 9 | Multi-tenant billing/onboarding (Phase 8, **gate masuk: pelanggan eksternal committed**) dan scale enterprise (Phase 9, horizon 5-10 tahun) | Belum ditentukan — keputusan struktural tim, bukan keputusan teknis semata |

**Kenapa pengelompokan ini, bukan 1 Program = 1 Fase:** Program D sengaja menggabungkan dua fase non-adjacent (Phase 4 dan Phase 7) karena keduanya **secara konseptual satu inisiatif bisnis** (kesiapan multi-company/enterprise) yang dieksekusi dalam dua momentum teknis berbeda — memisahkannya jadi dua Program independen akan menyembunyikan hubungan strategis ini dari siapa pun yang membaca roadmap level-tinggi (termasuk investor due diligence).

**Program Owner "Belum ditentukan"** bukan kelalaian — ini kejujuran yang sama dengan Maturity Badge di Engineering Constitution: solo developer hari ini tidak bisa realistis mengklaim owner untuk Program yang eksekusinya bertahun-tahun lagi. Lihat [03-team-topology-and-resourcing.md](03-team-topology-and-resourcing.md) untuk kapan dan bagaimana ini diisi.

## 4. Prinsip Governance Program (Baru)

1. Program **MUST** tidak dimulai sebelum Program sebelumnya di jalur dependency yang sama mencapai Definition of Done fase-nya ([Program A wajib selesai sebelum B](02-master-dependency-graph.md) — lihat dependency graph untuk pengecualian paralel yang valid).
2. Program Owner (begitu ditentukan) **MUST** menjadi satu titik akuntabilitas untuk 5 gate governance ([04-roadmap-governance-and-delivery.md § Architecture Governance & Phase Gates](../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates)) pada setiap fase dalam Program tersebut.
3. Program **MUST NOT** direncanakan detail lebih dari 1 Program ke depan dengan presisi tinggi — Program E dan F sengaja dibiarkan garis besar (selaras YAGNI, [04 § Phase 9](../04-roadmap-governance-and-delivery.md#phase-9--enterprise-scale-platform): "detail konkret fase ini sengaja tidak didesain mendalam sekarang").

## 5. References

- [00-vision-and-business-architecture.md](../00-vision-and-business-architecture.md)
- [Engineering-Constitution/00-principles/00-engineering-principles.md](../Engineering-Constitution/00-principles/00-engineering-principles.md)
- [04-roadmap-governance-and-delivery.md § Phase 0-9 Transformation Program](../04-roadmap-governance-and-delivery.md#phase-0-9-transformation-program)
- [02-master-dependency-graph.md](02-master-dependency-graph.md)

---

*File selanjutnya: [01-capability-to-task-mapping.md](01-capability-to-task-mapping.md)*
