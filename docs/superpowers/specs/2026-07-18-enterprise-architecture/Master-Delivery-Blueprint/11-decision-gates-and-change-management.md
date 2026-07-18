# 11 — Decision Gates, Change Management Process, Continuous Improvement Process

**Kedudukan dokumen ini:** Campuran — 5-gate governance sudah lengkap di [04-roadmap-governance-and-delivery.md § Architecture Governance & Phase Gates](../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates), Change Management (Amendment Process) sudah lengkap di [Engineering-Constitution/00-principles/00-engineering-principles.md § 9](../Engineering-Constitution/00-principles/00-engineering-principles.md#9-amendment-process). **Kontribusi baru bagian ini:** Decision Gates spesifik untuk keputusan **lintas-dokumen** (bukan per-Program teknis, tapi keputusan yang mempengaruhi Blueprint/Architecture Repository/Constitution sekaligus) dan Continuous Improvement Process untuk Blueprint itu sendiri (belum ada proses "bagaimana Blueprint ini diperbarui" sampai sekarang).

---

## 1. Decision Gates — Referensi + Perluasan

**Sumber tunggal (5 gate per-Program):** [04-roadmap-governance-and-delivery.md § Architecture Governance & Phase Gates](../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates) — Architecture Review, Risk Assessment, Security Review, Migration Strategy, Rollback Strategy. Operasionalisasi per-Program: [04-delivery-orchestration.md § 3-4](04-delivery-orchestration.md#3-entry-criteria--operasionalisasi-per-program).

**Decision Gate tambahan — Kontribusi Baru:** kategori keputusan yang **tidak** tercakup 5-gate karena sifatnya lintas-dokumen, bukan spesifik satu Program:

| Decision Gate | Kapan Dipicu | Proses |
|---|---|---|
| **Gate Konflik Antar-Dokumen** | Perubahan yang diusulkan bertentangan dengan Architecture Repository, Phase 1 Planning, **atau** Engineering Constitution | **MUST** ADR terlebih dahulu ([Engineering-Constitution/06-governance/19-architecture-decision-record-guide.md](../Engineering-Constitution/06-governance/19-architecture-decision-record-guide.md)) — preseden: [ADR-003](../adr/ADR-003-master-delivery-blueprint-as-orchestration-layer.md) sendiri, ditulis justru karena brief awal berpotensi menciptakan roadmap ganda |
| **Gate Perubahan Critical Path** | Urutan Program di [02-master-dependency-graph.md § 3](02-master-dependency-graph.md#3-critical-path-analysis) diusulkan berubah (mis. melompati Program B/C demi kecepatan L2) | **MUST** Architecture Review tambahan memverifikasi tidak ada dependency tersembunyi (lihat risiko S4, [05-risk-and-debt-orchestration.md § 2](05-risk-and-debt-orchestration.md#2-risiko-baru--muncul-dari-sequencingparalelisme-kontribusi-baru)) |
| **Gate Penambahan Capability Baru** | Modul/kapabilitas baru diusulkan yang **tidak ada** di [00-vision-and-business-architecture.md Module Catalog](../00-vision-and-business-architecture.md#module-catalog--tiering) | **MUST NOT** langsung ditambahkan ke [01-capability-to-task-mapping.md](01-capability-to-task-mapping.md) — **MUST** ditambahkan ke doc 00 dulu (single source of truth modul), baru diturunkan ke Capability Matrix, konsisten [01-capability-to-task-mapping.md § 5 Mandatory Rule #1](01-capability-to-task-mapping.md#5-prinsip-pemeliharaan-matrix-ini) |
| **Gate Percepatan Fase (Skip/Reorder)** | Tekanan bisnis mendesak fase dikerjakan di luar urutan doc 04 | **MUST** melalui keempat gate di atas sekaligus jika relevan — ini adalah keputusan paling berisiko yang bisa diambil terhadap roadmap, butuh justifikasi setara ADR meski tidak selalu bertentangan dokumen (bisa juga murni soal prioritas bisnis) |

## 2. Change Management Process

**Sumber tunggal:** [Engineering-Constitution/00-principles/00-engineering-principles.md § 9 Amendment Process](../Engineering-Constitution/00-principles/00-engineering-principles.md#9-amendment-process) — tabel diferensiasi proses berdasar tipe perubahan (MUST rules → ADR wajib, SHOULD/MAY → PR justifikasi, structural → ADR wajib, typo → PR langsung).

**Perluasan untuk Blueprint:** Prinsip yang sama berlaku untuk perubahan **konten Blueprint sendiri**, dengan satu tambahan spesifik ke sifat orkestrasi Blueprint:

| Tipe Perubahan Blueprint | Proses |
|---|---|
| Update ringkasan/link ke dokumen sumber (dokumen sumber berubah, Blueprint hanya menyesuaikan link/ringkasan) | PR langsung, tanpa ADR — ini bukan keputusan baru, hanya sinkronisasi |
| Perubahan pada bagian "Kontribusi Baru" (Capability Matrix, Dependency Graph, Team Topology, KPI, Fitness Functions) | PR dengan justifikasi tertulis — setara SHOULD/MAY di Constitution, karena ini murni orkestrasi, bukan keputusan arsitektur yang mengikat kode |
| Perubahan Critical Path atau Decision Gate | **MUST** ADR — setara structural change, karena ini mempengaruhi urutan eksekusi seluruh roadmap |
| Penambahan Program baru atau restrukturisasi 6 Program existing | **MUST** ADR |

## 3. Continuous Improvement Process — Kontribusi Baru

**Prinsip:** Blueprint adalah **living document** yang jadi basi lebih cepat dari dokumen manapun di corpus ini — ia mengorkestrasi Program yang statusnya berubah tiap minggu (berbeda dari Architecture Repository yang mendefinisikan *apa*, relatif stabil bertahun-tahun). Proses continuous improvement berikut mencegah Blueprint jadi "dokumentasi basi yang dipercaya buta" ([Engineering-Constitution/06-governance/24-documentation-standard.md § Anti-Pattern](../Engineering-Constitution/06-governance/24-documentation-standard.md#6-anti-pattern)).

**Trigger update wajib:**
1. **Setiap Milestone tercapai** ([04-delivery-orchestration.md § 2](04-delivery-orchestration.md#2-milestone-definition--kontribusi-baru)) — status "🔴 Belum dimulai" / "🟡 Sebagian" / "✅ Selesai" di [01-capability-to-task-mapping.md](01-capability-to-task-mapping.md) dan [04-delivery-orchestration.md § 1](04-delivery-orchestration.md#1-phase-by-phase-delivery-plan) **MUST** diupdate dalam PR yang sama dengan kode yang menyelesaikan Milestone tersebut — konsisten [Engineering-Constitution/06-governance/24-documentation-standard.md Mandatory Rule #1](../Engineering-Constitution/06-governance/24-documentation-standard.md#4-mandatory-rules).
2. **Setiap risiko baru ditemukan selama eksekusi** — ditambahkan ke [05-risk-and-debt-orchestration.md § 2](05-risk-and-debt-orchestration.md#2-risiko-baru--muncul-dari-sequencingparalelisme-kontribusi-baru) jika sifatnya lintas-Program, atau ke Risk Register sumber tunggal jika spesifik satu domain.
3. **Setiap kali Team Topology berpindah skala** ([03-team-topology-and-resourcing.md § 4](03-team-topology-and-resourcing.md#4-topology-per-skala--evolusi-bertahap)) — Program Owner di [00-executive-delivery-vision.md § 3](00-executive-delivery-vision.md#3-program-structure--kontribusi-baru) diupdate dari "Belum ditentukan" ke nama nyata.
4. **Retrospektif akhir tiap Program** — KPI Bagian 2/3 di [10-kpi-and-fitness-functions.md](10-kpi-and-fitness-functions.md) diukur ulang, dibandingkan target, hasil didokumentasikan (bukan hanya diukur lalu dilupakan).

**Retrospektif Format (ringkas, tidak formal berlebihan untuk tim kecil):** Setelah tiap Program mencapai Exit Criteria — tiga pertanyaan wajib dijawab tertulis (bisa di commit message Milestone terakhir atau catatan terpisah): (a) Apa yang berjalan sesuai rencana Blueprint? (b) Apa yang meleset dari dependency graph/estimasi effort? (c) Apakah Blueprint perlu diupdate berdasarkan pembelajaran ini?

## 4. Prinsip Governance yang Mengikat Bagian Ini

1. Decision Gate Bagian 1 **MUST** dicek sebelum keputusan lintas-dokumen apa pun dieksekusi — **MUST NOT** diasumsikan "kelihatannya tidak konflik" tanpa verifikasi eksplisit terhadap ketiga dokumen sumber.
2. Continuous Improvement trigger Bagian 3 **MUST** dijalankan, bukan opsional "kalau sempat" — Blueprint yang tidak pernah diupdate setelah ditulis persis risiko yang [Engineering-Constitution/06-governance/24-documentation-standard.md](../Engineering-Constitution/06-governance/24-documentation-standard.md) peringatkan.

## 5. References

- [04-roadmap-governance-and-delivery.md § Architecture Governance & Phase Gates](../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates)
- [Engineering-Constitution/00-principles/00-engineering-principles.md § 9 Amendment Process](../Engineering-Constitution/00-principles/00-engineering-principles.md#9-amendment-process)
- [Engineering-Constitution/06-governance/19-architecture-decision-record-guide.md](../Engineering-Constitution/06-governance/19-architecture-decision-record-guide.md)
- [Engineering-Constitution/06-governance/24-documentation-standard.md](../Engineering-Constitution/06-governance/24-documentation-standard.md)
- [adr/ADR-003-master-delivery-blueprint-as-orchestration-layer.md](../adr/ADR-003-master-delivery-blueprint-as-orchestration-layer.md)

---

*Batch H selesai. File selanjutnya (terakhir): [12-traceability-matrix.md](12-traceability-matrix.md)*
