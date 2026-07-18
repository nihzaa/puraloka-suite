# 37 — Engineering Metrics

> **Maturity:** 🔵 Designed — belum ada dashboard metrics engineering hari ini (bergantung Metrics pillar di [04-quality-and-observability/10-observability-standard.md](../04-quality-and-observability/10-observability-standard.md) yang juga masih kontrak). Success Metrics per file sudah didefinisikan individual di 36 file sebelumnya — file ini mengagregasinya jadi satu dashboard konseptual.

**Kedudukan:** Batch 8 — Metrics & Penutup. Mengumpulkan Bagian 11 "Success Metrics" dari seluruh file Engineering Constitution menjadi satu pandangan menyeluruh kesehatan implementasi — bukan menciptakan metric baru independen.

---

## 1. Purpose

Memberikan satu titik untuk menjawab "seberapa sehat implementasi Engineering Constitution ini secara keseluruhan?" — tanpa harus membuka 39 file lain satu-satu untuk melihat Success Metrics masing-masing.

## 2. Background

Setiap file Engineering Constitution (Bagian 11, sesuai [ADR-002](../adr/ADR-002-enforcement-levels-and-template.md)) sudah punya Success Metrics spesifik domainnya — dari "RLS policy yang merujuk RBAC v2 helper" ([03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md)) sampai "Golden Path finansial-kritis tanpa integration test" ([04-quality-and-observability/08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md)). File ini tidak mendefinisikan metric baru — ia mengelompokkan metric existing menjadi kategori yang bisa dilaporkan berkala.

## 3. Principles

1. **Metric agregat ini adalah indeks, bukan pengganti detail per-domain.** Nilai turun di satu kategori (mis. "Security") **MUST** ditelusuri balik ke file sumber spesifiknya untuk memahami metric mana yang bermasalah.
2. **Metric dilaporkan jujur, termasuk saat hasilnya buruk.** Tujuan metric adalah memberi sinyal awal masalah, bukan menghasilkan laporan yang terlihat baik — Maturity Badge yang jujur ([README.md § Maturity Badge](../README.md#maturity-badge--cara-membaca-status-setiap-file)) adalah preseden semangat yang sama diterapkan di sini.
3. **Metric ditinjau berkala (per Sub-Fase selesai), bukan hanya dibuat sekali dan dilupakan.**

## 4. Mandatory Rules

1. Laporan status Sub-Fase Phase 1 (1A-1D) **MUST** menyertakan ringkasan metric dari kategori yang relevan (Security, Testing, Governance) berdasarkan Success Metrics file terkait — **MUST NOT** melaporkan "selesai" tanpa merujuk metric konkret yang mendukung klaim tersebut.
2. Metric yang menunjukkan regresi (mis. jumlah inline role check bertambah, bukan berkurang) **MUST** diselidiki sebelum sub-fase berikutnya dimulai — **MUST NOT** diabaikan sebagai "akan diperbaiki nanti" tanpa rencana konkret.

## 5. Recommended Rules

1. Dashboard metrics otomatis (bukan agregasi manual) **SHOULD** dipertimbangkan begitu infrastruktur Metrics ([04-quality-and-observability/10-observability-standard.md](../04-quality-and-observability/10-observability-standard.md)) tersedia — sampai saat itu, agregasi manual periodik cukup.

## 6. Kategori Metrik Agregat

**Security & Access Control** (sumber: [03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md), [06-api-engineering-standard.md](../03-core-implementation/06-api-engineering-standard.md), [07-security-engineering-standard.md](../03-core-implementation/07-security-engineering-standard.md)):
- RLS policy merujuk RBAC v2 helper (target 100% akhir Migrasi 1A.2)
- Inline `.role === 'x'` call site tersisa (baseline 57, target menurun)
- Fungsi otorisasi fail-open ditemukan (target 0)

**Testing & Quality** (sumber: [04-quality-and-observability/08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md), [09-performance-budget.md](../04-quality-and-observability/09-performance-budget.md)):
- Coverage fungsi murni enam file finansial-kritis (target 90% akhir Sub-Fase 1A)
- Golden Path finansial-kritis tanpa integration test (target 0)
- Endpoint p95 response time (target <500ms baca, setelah Sub-Fase 1D)

**Governance & Process** (sumber: [06-governance/18-never-build-list.md](../06-governance/18-never-build-list.md), [30-technical-debt-policy.md](../06-governance/30-technical-debt-policy.md)):
- Implementasi item Never Build List tanpa ADR (target 0)
- Debt finansial-kritis tanpa dokumentasi (target 0)

**Observability** (sumber: [04-quality-and-observability/10-observability-standard.md](../04-quality-and-observability/10-observability-standard.md), [29-logging-standard.md](../04-quality-and-observability/29-logging-standard.md)):
- Log level production (target minimal `info`)
- Log finansial-kritis tanpa `correlation_id` (target 0)

**Delivery Performance — DORA Four Keys** (v1.1, target masa depan — belum terukur hari ini karena nol pipeline CI/CD, [05-team-process/11-devsecops-standard.md](../05-team-process/11-devsecops-standard.md)):
- Deployment frequency — target diukur begitu pipeline CI/CD aktif, belum ada baseline
- Lead time for changes (commit → production) — target diukur begitu pipeline aktif
- Mean time to recovery (MTTR) — target diukur begitu incident tracking ada ([05-team-process/21-checklist-before-release.md](../05-team-process/21-checklist-before-release.md) rollback discipline sebagai prasyarat)
- Change failure rate — target diukur begitu dependency scanning ([11-devsecops-standard.md Mandatory Rule #5](../05-team-process/11-devsecops-standard.md#4-mandatory-rules)) dan test gate aktif, saling melengkapi sebagai sumber data

## 7. Anti-Pattern

**Metric Vanity Tanpa Tindak Lanjut** — melaporkan "coverage 90% tercapai!" tanpa memeriksa apakah assertion di test tersebut benar-benar bermakna (lihat [08-testing-standard.md Anti-Pattern](../04-quality-and-observability/08-testing-standard.md#6-anti-pattern) "Coverage Number Tanpa Assertion Bermakna") — angka agregat yang terlihat baik tapi menyembunyikan kualitas rendah di baliknya.

## 8. Example Good / 9. Migration Strategy

Tidak berlaku dalam bentuk kode — file ini murni agregasi metric. 🔵 Designed, N/A untuk migrasi mundur, berlaku begitu Sub-Fase pertama selesai dan ada data untuk dilaporkan.

## 10. Checklist

- [ ] Laporan Sub-Fase menyertakan ringkasan metric per kategori
- [ ] Regresi metric diselidiki sebelum sub-fase berikutnya dimulai

## 11. Success Metrics

*(Meta — lihat Bagian 6 di atas sebagai agregasi Success Metrics dari 36 file lain.)*

## 12. References

- Seluruh 36 file `01-foundations/` sampai `07-domain-specific/` (sumber Success Metrics individual)
- [38-security-checklist.md](38-security-checklist.md)
- [adr/ADR-002-enforcement-levels-and-template.md](../adr/ADR-002-enforcement-levels-and-template.md)
- [05-team-process/11-devsecops-standard.md](../05-team-process/11-devsecops-standard.md)
- [05-team-process/21-checklist-before-release.md](../05-team-process/21-checklist-before-release.md)

---

*File selanjutnya: [38-security-checklist.md](38-security-checklist.md)*
