# 07 — Testing Strategy Mapping, Security Validation Gates, Performance Validation Gates

**Kedudukan dokumen ini:** Campuran — isi lengkap ketiga topik sudah ada di dokumen lain. **Kontribusi baru bagian ini:** memetakan gate mana **wajib lolos sebelum Program mana**, sesuatu yang sumber tunggal (ditulis per-domain, bukan per-Program) tidak eksplisitkan.

---

## 1. Testing Strategy Mapping

**Sumber tunggal:** [Phase1/06-test-strategy.md](../Phase1/06-test-strategy.md) (Vitest, target 90% pure function, Golden Path integration test) dan [Engineering-Constitution/04-quality-and-observability/08-testing-standard.md](../Engineering-Constitution/04-quality-and-observability/08-testing-standard.md).

**Mapping ke Program:**

| Program | Testing Gate Wajib | Kenapa |
|---|---|---|
| Program A | Unit test 6 file finansial-kritis mencapai 90% coverage pure function ([Phase1/06 § Unit Test](../Phase1/06-test-strategy.md#unit-test--target-90-pure-function)) | Prasyarat langsung Program B (lihat [02-master-dependency-graph.md § 2, A→B](02-master-dependency-graph.md#2-kenapa-setiap-panah-ada-justifikasi-teknis-eksplisit)) |
| Program B | Integration test Golden Path untuk kasbon **sebelum** migrasi CO/procurement dimulai (verifikasi pola strangler-fig per-langkah) | [Engineering-Constitution/06-governance/31-refactoring-policy.md Mandatory Rule #2](../Engineering-Constitution/06-governance/31-refactoring-policy.md#4-mandatory-rules) — regression-safe refactor |
| Program D (bagian 2, `company_id`) | Test isolasi data 2-company (bukan hanya unit test skema) | Risiko #3 di [05-risk-and-debt-orchestration.md § 1](05-risk-and-debt-orchestration.md#1-risk-register--peta-ke-program) — migrasi paling invasif di roadmap |
| Program E (bagian 2, AI) | Test guardrail agent (no silent write, audit setiap panggilan) | [03-platform-and-intelligence-architecture.md § AI Architecture](../03-platform-and-intelligence-architecture.md#ai-architecture) |

## 2. Security Validation Gates

**Sumber tunggal:** [02-security-and-compliance-architecture.md § Security Checklist](../02-security-and-compliance-architecture.md#security-checklist-ringkas-actionable) dan [Engineering-Constitution/08-metrics-and-closing/38-security-checklist.md](../Engineering-Constitution/08-metrics-and-closing/38-security-checklist.md).

**Mapping ke Program:**

| Program | Security Gate Wajib | Kenapa |
|---|---|---|
| Program A | Checklist Otorisasi & Akses penuh ([Engineering-Constitution/08-metrics-and-closing/38-security-checklist.md § 6](../Engineering-Constitution/08-metrics-and-closing/38-security-checklist.md#6-checklist-keamanan-verifikasi-sebelum-rilis-besar)) | Ini **adalah** tujuan Program A |
| Program D (bagian 2) | Checklist Migrasi & Rollback penuh + verifikasi manual isolasi data | Perubahan RLS paling luas di roadmap ([04-roadmap-governance-and-delivery.md § Risk Register item #3](../04-roadmap-governance-and-delivery.md#risk-register)) |
| Program E (bagian 2, AI) | Checklist Data Finansial & Portal (kolom yang di-expose ke AI agent) + audit trail setiap panggilan agent | Guardrail AI bergantung penuh pada isolasi data yang benar |
| Program F | Seluruh Security Checklist + Compliance Readiness ([02-security-and-compliance-architecture.md § Compliance Readiness](../02-security-and-compliance-architecture.md#compliance-readiness)) | Pelanggan eksternal membawa ekspektasi keamanan berbeda dari pemakaian internal |

## 3. Performance Validation Gates

**Sumber tunggal:** [Engineering-Constitution/04-quality-and-observability/09-performance-budget.md](../Engineering-Constitution/04-quality-and-observability/09-performance-budget.md) (target p95 <500ms baca, <1000ms tulis).

**Mapping ke Program:** Performance budget **belum relevan diukur ketat** sampai Sub-Fase 1D (Observability) tersedia — [Engineering-Constitution/04-quality-and-observability/09-performance-budget.md § Migration Strategy](../Engineering-Constitution/04-quality-and-observability/09-performance-budget.md#9-migration-strategy) eksplisit: "N/A untuk migrasi mundur karena belum ada observability metrics untuk mengukur baseline." Gate performa pertama yang benar-benar bisa diukur adalah di **Program D (bagian 2, `company_id`)** — migrasi skema besar berisiko regresi performa (index tambahan, query lebih kompleks dengan `company_id` filter) yang **MUST** diverifikasi `EXPLAIN ANALYZE` sebelum dan sesudah, konsisten [Engineering-Constitution/04-quality-and-observability/09-performance-budget.md Mandatory Rule #3](../Engineering-Constitution/04-quality-and-observability/09-performance-budget.md#4-mandatory-rules).

## 4. Prinsip Gate Sequencing

1. Gate di Bagian 1-3 **MUST** dianggap bagian dari Exit Criteria Program terkait ([04-delivery-orchestration.md § 4](04-delivery-orchestration.md#4-exit-criteria--operasionalisasi-per-program)) — **MUST NOT** diperlakukan sebagai langkah opsional terpisah dari definisi "Program selesai."
2. Gate yang gagal **MUST** memblokir Milestone terkait ([04-delivery-orchestration.md § 2](04-delivery-orchestration.md#2-milestone-definition--kontribusi-baru)) didemokan — konsisten prinsip fail-closed yang mengikat seluruh Engineering Constitution.

## 5. References

- [Phase1/06-test-strategy.md](../Phase1/06-test-strategy.md)
- [02-security-and-compliance-architecture.md § Security Checklist](../02-security-and-compliance-architecture.md#security-checklist-ringkas-actionable)
- [Engineering-Constitution/08-metrics-and-closing/38-security-checklist.md](../Engineering-Constitution/08-metrics-and-closing/38-security-checklist.md)
- [Engineering-Constitution/04-quality-and-observability/09-performance-budget.md](../Engineering-Constitution/04-quality-and-observability/09-performance-budget.md)
- [04-delivery-orchestration.md](04-delivery-orchestration.md)

---

*Batch F selesai. File selanjutnya: [08-platform-rollout-orchestration.md](08-platform-rollout-orchestration.md)*
