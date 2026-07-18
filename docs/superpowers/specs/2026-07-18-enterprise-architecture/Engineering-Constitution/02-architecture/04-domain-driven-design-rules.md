# 04 — Domain-Driven Design Rules

> **Maturity:** 🟡 Partial — Bounded Context sudah *implisit* konsisten (satu file route per domain bisnis, lihat [02-folder-architecture.md](../01-foundations/02-folder-architecture.md)), tapi tidak ada dokumen yang secara eksplisit memetakan batasnya sampai [00-vision-and-business-architecture.md](../../00-vision-and-business-architecture.md) ditulis. Ubiquitous Language (istilah domain konsisten kode ↔ bisnis) sudah 100% konsisten di kode existing (diverifikasi), tapi verifikasinya masih manual — v1.1 menambah mekanisme verifikasi konkret (Recommended Rule #3) karena AI coding assistant kini menulis kode di repo ini, menaikkan risiko istilah asing menyelinap masuk dibanding saat murni ditulis manusia yang familiar konteks bisnis.

**Kedudukan:** Batch 2 — Prinsip Arsitektur. Melengkapi [03-clean-architecture-rules.md](03-clean-architecture-rules.md) — Clean Architecture memisahkan *layer teknis*, file ini memisahkan *batas domain*. Istilah DDD dasar (Aggregate Root, Bounded Context) didefinisikan di [GLOSSARY.md](../GLOSSARY.md).

---

## 1. Purpose

Menjaga agar kode Puraloka Suite tetap dipahami lewat kosakata bisnis yang sama dengan yang dipakai Nizar dan tim lapangan (proyek, RAB, mandor, kasbon, termin) — bukan kosakata teknis generik (`Entity`, `Manager`, `Handler`) yang membutuhkan penerjemahan mental setiap kali kode dan percakapan bisnis dibandingkan.

## 2. Background

Puraloka Suite hari ini secara *tidak sengaja* sudah mengikuti sebagian prinsip DDD: nama tabel (`kasbons`, `mandor_assignments`, `progress_logs`) dan nama route file (`kasbons.ts`, `mandor.ts`) memakai istilah domain konstruksi Indonesia langsung, bukan istilah teknis diterjemahkan. [00-vision-and-business-architecture.md § Domain Map & Bounded Contexts](../../00-vision-and-business-architecture.md#domain-map--bounded-contexts) memformalkan pembagian ini menjadi Core Domains (Project Delivery), Supporting Domains (Finance, Supply Chain, People), dan Generic Domains (Platform Services) — file ini menerjemahkan pembagian tersebut menjadi aturan penulisan kode konkret.

## 3. Principles

1. **Ubiquitous Language bukan istilah opsional — kode MUST memakai istilah yang sama dengan yang dipakai owner/PM/mandor saat bicara.** `kasbon` tetap `kasbon` di kode (bukan diterjemahkan jadi `advance` atau `cash_advance`), karena istilah ini sudah baku di industri konstruksi Indonesia dan dipakai langsung oleh pengguna sistem.
2. **Aggregate Root menjaga invariant, bukan sekadar "tabel utama."** `projects` sebagai aggregate root ([GLOSSARY.md — Aggregate Root](../GLOSSARY.md)) berarti perubahan yang melanggar invariant proyek (mis. `progress_pct` di luar 0-100, atau `contract_value` negatif) **MUST** dicegah di titik masuk yang berhubungan dengan `projects`, bukan diasumsikan divalidasi di lapisan lain.
3. **Bounded Context boleh punya arti berbeda untuk istilah yang sama — ini bukan bug.** "Progress" di konteks RAB (`progress_pct` per item, serapan anggaran) berbeda makna dari "progress" di konteks lapangan (`progress_logs` mode daily, catatan umum) — [Progress Logic (memory)] sudah mengonfirmasi ini sebagai dua sumber data independen by design, bukan duplikasi yang perlu disatukan.

## 4. Mandatory Rules

1. Nama variabel, fungsi, dan kolom database untuk konsep domain **MUST** memakai istilah Indonesia/konstruksi yang sudah baku di CLAUDE.md dan digunakan pengguna (`kasbon`, `termin`, `mandor`, `borongan`, `RAB`) — **MUST NOT** diterjemahkan ke istilah Inggris generik (`advance`, `installment`, `contractor`, `lump-sum`) yang memutus hubungan kode dengan percakapan bisnis nyata.
2. Setiap Bounded Context baru (domain yang belum ada di [Module Catalog](../../00-vision-and-business-architecture.md#module-catalog--tiering)) **MUST** dipetakan ke Core/Supporting/Generic Domain yang sesuai sebelum diimplementasikan — **MUST NOT** ditambahkan sebagai route file baru tanpa keputusan pemetaan ini didokumentasikan (minimal update ke Module Catalog).
3. Perubahan pada data yang melanggar invariant Aggregate Root (mis. `progress_pct` di luar rentang valid, `pct_completion` tanpa `rab_item_id` di mode detail) **MUST** ditolak di titik masuk (API layer atau constraint database), **MUST NOT** diasumsikan "tidak akan pernah terjadi karena UI sudah validasi" — UI validation bukan pengganti server-side invariant enforcement.
4. Istilah yang punya makna berbeda di Bounded Context berbeda (mis. "progress" RAB vs "progress" lapangan) **MUST** diberi nama yang membedakan konteksnya secara eksplisit di kode (`pct_completion` untuk progress RAB-level, `pct_overall` untuk progress lapangan-level — pola yang sudah ada) — **MUST NOT** dibiarkan sama-sama bernama `progress` tanpa disambiguasi.

## 5. Recommended Rules

1. Saat menulis dokumentasi atau komentar kode untuk domain finansial, istilah **SHOULD** dicek dulu terhadap [GLOSSARY.md](../GLOSSARY.md) dan CLAUDE.md — jika istilah baru muncul dan berpotensi dipakai berulang, **SHOULD** ditambahkan ke GLOSSARY.md pada PR yang sama.
2. Relasi antar Bounded Context (mis. `work_scopes.rab_category_id` menghubungkan konteks Mandor ke konteks RAB) **SHOULD** didokumentasikan sebagai koneksi eksplisit opsional, bukan foreign key yang wajib — pola yang sudah diterapkan konsisten di Mandor ↔ RAB Link (CLAUDE.md, internal) (nullable FK, bukan constraint wajib) karena kedua konteks tetap valid berdiri sendiri.
3. Code review ([05-team-process/15-code-review-checklist.md](../05-team-process/15-code-review-checklist.md)) **SHOULD** eksplisit memeriksa daftar istilah terlarang di Mandatory Rule #1 (`advance`, `installment`, `contractor`, `lump-sum`, dan padanan Inggris generik lain untuk istilah domain baku) sebagai item checklist tersendiri, bukan diasumsikan reviewer otomatis menyadarinya — mekanisme verifikasi konkret yang sebelumnya tidak ada, relevan terutama untuk PR yang dihasilkan AI coding assistant ([07-domain-specific/36-ai-coding-guideline.md](../07-domain-specific/36-ai-coding-guideline.md)) yang tidak punya konteks bisnis bawaan sekuat manusia yang bekerja langsung dengan Nizar/PM/mandor.

## 6. Anti-Pattern

**Terjemahan Paksa ke Istilah Generik** — mengganti `kasbon` menjadi `CashAdvance`, `mandor` menjadi `Contractor`, dengan alasan "lebih profesional" atau "lebih internasional." Ini merusak Ubiquitous Language: percakapan dengan Nizar/PM/mandor akan selalu memakai istilah asli, dan setiap developer baru harus menerjemahkan mental bolak-balik — sumber bug klasik saat terjemahan tidak konsisten di sebagian kode.

**Anemic Domain Model dengan Invariant di UI Saja** — validasi `progress_pct` antara 0-100 hanya ada di `<input>` frontend, tidak ada constraint di database atau validasi di API layer. Risiko: API dipanggil langsung (Postman, script, bug di frontend lain) melewati validasi UI sepenuhnya, merusak invariant aggregate root tanpa terdeteksi (bertentangan langsung Mandatory Rule #3).

## 7. Example Good

```sql
-- rab_items_pct_sum constraint (migration 052, pola nyata)
CONSTRAINT rab_items_pct_sum CHECK (
  (material_pct + upah_pct + alat_pct + other_pct) = 0
  OR (material_pct + upah_pct + alat_pct + other_pct) BETWEEN 99.9 AND 100.1
)
```
Invariant Aggregate Root (`rab_items` sebagai bagian dari agregat `projects`) ditegakkan di level database, bukan hanya diasumsikan benar dari input form — konsisten Mandatory Rule #3.

```ts
// progress_logs: pct_completion (RAB-level) vs pct_overall (lapangan-level)
// dua kolom terpisah untuk dua Bounded Context berbeda, bukan satu kolom "progress" ambigu
```
Konsisten Mandatory Rule #4 — disambiguasi eksplisit sudah menjadi pola nyata di skema.

## 8. Example Bad

*(Hipotetis — dicantumkan sebagai pencegahan sesuai [ADR-002](../adr/ADR-002-enforcement-levels-and-template.md))*: menambahkan kolom baru bernama `status` di tiga tabel berbeda (`projects.status`, `kasbons.status`, `invoices.status`) yang masing-masing punya set nilai enum berbeda tanpa dokumentasi — pembaca kode tidak bisa tahu tanpa membuka migration file bahwa `status` proyek (`draft/active/completed/cancelled`) sama sekali berbeda universe nilai dari `status` kasbon (`pending/approved/rejected`). Bukan pelanggaran teknis, tapi pelanggaran semangat Ubiquitous Language: nama kolom yang sama untuk konsep domain yang berbeda menyulitkan navigasi lintas Bounded Context.

## 9. Migration Strategy

**Untuk Mandatory Rule #1 (istilah domain)** — N/A, sudah 100% konsisten di skema database dan route file existing (diverifikasi: `kasbons`, `mandor_assignments`, `termin_schedules`, `borongan_settlements` semua memakai istilah Indonesia baku). Berlaku penuh sejak commit pertama untuk kode baru.

**Untuk Mandatory Rule #2 (pemetaan Bounded Context baru)** — berlaku mulai domain baru pertama yang diusulkan setelah Engineering Constitution ini disahkan; domain existing (27+ tabel, semua sudah termasuk Module Catalog) tidak perlu dipetakan ulang secara retroaktif.

**Untuk Mandatory Rule #3 (invariant enforcement)** — 🟡 Partial: sebagian invariant finansial-kritis sudah punya database constraint (`rab_items_pct_sum`), sebagian besar lain (mis. validasi `progress_pct` 0-100 di `progress_logs`) masih hanya diasumsikan valid dari flow API tanpa CHECK constraint eksplisit. **MUST** diaudit per domain finansial-kritis (enam file yang sama dengan [03-clean-architecture-rules.md § Migration Strategy](03-clean-architecture-rules.md#9-migration-strategy)) dan ditambah constraint yang hilang sebagai bagian dari Sub-Fase 1A, bukan ditunda tanpa batas.

## 10. Checklist

- [ ] Istilah domain baru memakai kosakata Indonesia/konstruksi baku, bukan terjemahan generik
- [ ] Bounded Context baru sudah dipetakan ke Module Catalog sebelum implementasi
- [ ] Invariant finansial-kritis punya enforcement server-side (constraint atau validasi API), bukan hanya di UI
- [ ] Istilah ambigu lintas konteks (mis. "progress") diberi nama yang membedakan konteksnya
- [ ] Code review memeriksa daftar istilah terlarang secara eksplisit, bukan diasumsikan otomatis tersadari

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Kolom/istilah domain finansial tanpa constraint server-side | Menurun dari baseline audit Sub-Fase 1A | Audit manual per domain finansial-kritis |
| Istilah domain baru yang tidak konsisten CLAUDE.md/GLOSSARY.md | 0 per PR | Code review checklist |
| Domain baru tanpa pemetaan Module Catalog sebelum implementasi | 0 | Review PR yang menambah route file domain baru |
| PR dari AI coding assistant dengan istilah terlarang lolos review | 0 | Audit sampling PR yang ditandai AI-generated |

## 12. References

- [00-vision-and-business-architecture.md § Domain Map & Bounded Contexts](../../00-vision-and-business-architecture.md#domain-map--bounded-contexts)
- [00-vision-and-business-architecture.md § Module Catalog & Tiering](../../00-vision-and-business-architecture.md#module-catalog--tiering)
- [03-clean-architecture-rules.md](03-clean-architecture-rules.md)
- [GLOSSARY.md — Aggregate Root, Bounded Context](../GLOSSARY.md)
- CLAUDE.md § Business Logic Kritis (internal — sumber istilah domain baku)
- [05-team-process/15-code-review-checklist.md](../05-team-process/15-code-review-checklist.md)
- [07-domain-specific/36-ai-coding-guideline.md](../07-domain-specific/36-ai-coding-guideline.md)

---

*Batch 2 selesai. File selanjutnya (Batch 3 — Implementasi Inti): [03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md)*
