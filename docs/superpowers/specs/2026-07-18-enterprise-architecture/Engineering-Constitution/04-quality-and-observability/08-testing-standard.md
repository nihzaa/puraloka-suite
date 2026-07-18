# 08 — Testing Standard

> **Maturity:** 🔵 Designed — nol infrastruktur test hari ini ([Phase1/01-gap-analysis.md Gap 5](../../Phase1/01-gap-analysis.md#gap-5--financial-test-suite-nol-infrastruktur)), belum ada satu pun file `.test.ts`. Kontrak masa depan, berlaku penuh begitu Vitest diinstal dan fungsi service pertama diekstrak sesuai [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md).

**Kedudukan:** Batch 4 — Kualitas & Observability. Bergantung pada [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md) (fungsi kalkulasi murni harus diekstrak dulu sebelum bisa ditest tanpa mock berat). Dirujuk oleh [05-team-process/17-definition-of-done.md](../05-team-process/17-definition-of-done.md) dan [05-team-process/20-checklist-before-merge.md](../05-team-process/20-checklist-before-merge.md).

---

## 1. Purpose

Menetapkan strategi test yang **realistis** untuk codebase yang hari ini nol test infrastruktur — bukan target coverage generik yang diadopsi tanpa mempertimbangkan bentuk kode aktual, tapi strategi yang secara eksplisit menargetkan risiko finansial tertinggi lebih dulu.

## 2. Background

[Phase1/06-test-strategy.md § Realisme Target Coverage 90%](../../Phase1/06-test-strategy.md#realisme-target-coverage-90--pembahasan-jujur) sudah mengoreksi eksplisit brief awal yang meminta "90% coverage" secara blanket — koreksi ini penting dipertahankan: target 90% **hanya** berlaku untuk fungsi kalkulasi murni (pure function) di layer `services/`, bukan seluruh codebase termasuk route handler HTTP dan komponen UI. Vitest dipilih sebagai framework ([Phase1/06 § Framework](../../Phase1/06-test-strategy.md#framework-vitest)) karena kompatibilitas TypeScript native dan kecepatan, bukan karena popularitas semata.

## 3. Principles

1. **Coverage adalah alat, bukan tujuan.** 90% coverage pada fungsi yang tidak pernah dipanggil dengan input edge-case nyata tidak memberikan jaminan apa pun — target ini **MUST** diarahkan ke fungsi yang benar-benar berisiko finansial, bukan dikejar sebagai angka semata di seluruh codebase.
2. **Golden Path dan kegagalan finansial paling mungkin diuji dulu, bukan kasus langka.** Integration test memprioritaskan skenario yang benar-benar terjadi berulang (approve kasbon, hitung EVM, submit laporan upah) di atas edge case teoretis yang jarang muncul ([GLOSSARY.md — Golden Path](../GLOSSARY.md)).
3. **Test yang butuh mock berat menandakan masalah arsitektur, bukan masalah test.** Jika sebuah fungsi butuh mock Supabase, mock Fastify request, dan mock 5 dependency lain untuk ditest, itu sinyal fungsi tersebut melanggar [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md), bukan alasan untuk menulis test yang rapuh.

## 4. Mandatory Rules

1. Fungsi kalkulasi murni baru yang diekstrak ke `services/` (sesuai [03-clean-architecture-rules.md Mandatory Rule #4](../02-architecture/03-clean-architecture-rules.md#4-mandatory-rules)) **MUST** disertai unit test pada PR yang sama — **MUST NOT** ada fungsi service baru tanpa test menyertainya.
2. Enam file finansial-kritis ([Phase1/00 § 4.1](../../Phase1/00-current-state-audit.md#41-enam-file-finansial-kritis-prioritas-test-coverage): `kasbons.ts`, `termin-payment.ts`, `kurva-s.ts`, `rab.ts`, `progress.ts`, `finance.ts`) **MUST** mencapai coverage 90% pada fungsi kalkulasi murninya sebelum akhir Sub-Fase 1A — **MUST NOT** ditunda tanpa target waktu eksplisit.
3. Golden Path per domain finansial-kritis (approve kasbon, hitung progress bubble-up, kalkulasi EVM, bayar termin) **MUST** punya minimal satu integration test yang memverifikasi flow end-to-end sebelum domain tersebut dianggap "stabil" di Sub-Fase 1A — **MUST NOT** hanya mengandalkan unit test kalkulasi tanpa memverifikasi integrasi dengan database.
4. Test **MUST NOT** memakai mock untuk RLS/database saat memverifikasi perilaku RLS itu sendiri ([Phase1/06 § Test untuk RLS](../../Phase1/06-test-strategy.md#test-untuk-rls-bukan-bagian-dari-financial-test-suite-secara-harfiah-tapi-prasyarat-migrasi-1a2)) — test RLS **MUST** memakai database nyata (test schema terisolasi), karena mocking RLS berarti tidak menguji apa pun yang bernilai.

## 5. Recommended Rules

1. Test **SHOULD** ditulis sebelum atau bersamaan dengan ekstraksi fungsi ke `services/` (TDD-ringan), bukan ditambahkan sebagai afterthought terpisah — mengurangi risiko fungsi diekstrak dengan interface yang sulit ditest.
2. Nama file test **SHOULD** mengikuti pola `<nama-file>.test.ts` bersanding langsung dengan file yang ditest, bukan folder `__tests__/` terpisah — memudahkan navigasi (selaras [01-foundations/02-folder-architecture.md Principle #1](../01-foundations/02-folder-architecture.md#3-principles)).

## 6. Anti-Pattern

**Coverage Number Tanpa Assertion Bermakna** — menulis test yang memanggil fungsi tanpa memverifikasi output benar (`expect(result).toBeDefined()` sebagai satu-satunya assertion) hanya untuk menaikkan angka coverage. Ini secara teknis menaikkan metric tapi memberikan nol jaminan korektnes — bertentangan langsung Principle #1.

**Test yang Mem-mock Seluruh Chain Supabase** — menulis unit test untuk kalkulasi EVM yang harus mem-mock 6 pemanggilan Supabase berbeda karena kalkulasi masih tercampur I/O di route handler (kondisi `kurva-s.ts` hari ini sebelum ekstraksi). Test seperti ini rapuh (berubah setiap query berubah, bukan setiap logic berubah) — solusinya adalah ekstraksi sesuai [03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md), bukan menulis mock yang makin kompleks.

## 7. Example Good

```ts
// apps/api/src/services/kurva-s.test.ts (target, kontrak Designed)
import { describe, it, expect } from 'vitest';
import { calculateEVM } from './kurva-s';

describe('calculateEVM', () => {
  it('menghitung CPI benar saat AC lebih rendah dari EV (proyek efisien)', () => {
    const result = calculateEVM({ bac: 1000, ac: 400, progressPct: 50, plannedPct: 40 });
    expect(result.ev).toBe(500);
    expect(result.cpi).toBe(1.25);
  });
  it('menghindari divide-by-zero saat AC = 0 (proyek belum mulai serapan)', () => {
    const result = calculateEVM({ bac: 1000, ac: 0, progressPct: 0, plannedPct: 0 });
    expect(result.cpi).toBe(0); // bukan Infinity/NaN
  });
});
```
Test fungsi murni tanpa mock apa pun, mencakup golden path dan edge case (divide-by-zero) — konsisten Mandatory Rule #1 dan Principle #1.

## 8. Example Bad

*(Hipotetis, dicantumkan sebagai pencegahan)*: unit test yang me-mock `supabase.from('kurva_s_data').select()` untuk menguji rumus `cpi = ev / ac` — mock tersebut menguji bahwa mock dipanggil dengan benar, bukan bahwa rumus matematikanya benar. Melanggar Anti-Pattern #2 di atas.

## 9. Migration Strategy

**Seluruh Mandatory Rules di file ini** — 🔵 Designed murni, N/A untuk migrasi mundur karena tidak ada test existing untuk dimigrasikan. Berlaku penuh sejak: (a) Vitest terinstal (bagian awal Sub-Fase 1A per [Phase1/02 § 1A.4](../../Phase1/02-target-architecture.md#1a4-financial-test-suite--arsitektur-test)), dan (b) fungsi service pertama diekstrak sesuai [03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md). Sebelum kedua prasyarat ini terpenuhi, Mandatory Rule #1-3 belum bisa dipatuhi secara teknis — dicatat sebagai gap terbuka, bukan pelanggaran.

## 10. Checklist

- [ ] Fungsi service baru punya unit test di PR yang sama
- [ ] Assertion test memverifikasi nilai benar, bukan hanya `toBeDefined()`
- [ ] Golden Path domain finansial-kritis punya integration test
- [ ] Test RLS memakai database nyata, bukan mock

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Coverage fungsi murni di enam file finansial-kritis | 90% | Vitest coverage report, akhir Sub-Fase 1A |
| Golden Path finansial-kritis tanpa integration test | 0 | Audit manual per domain |
| Test dengan assertion `toBeDefined()` sebagai satu-satunya check | 0 | Code review checklist |

## 12. References

- [Phase1/06-test-strategy.md](../../Phase1/06-test-strategy.md)
- [Phase1/00-current-state-audit.md § 4.1](../../Phase1/00-current-state-audit.md#41-enam-file-finansial-kritis-prioritas-test-coverage)
- [Phase1/01-gap-analysis.md § Gap 5](../../Phase1/01-gap-analysis.md#gap-5--financial-test-suite-nol-infrastruktur)
- [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md)
- [GLOSSARY.md — Golden Path](../GLOSSARY.md)

---

*File selanjutnya: [09-performance-budget.md](09-performance-budget.md)*
