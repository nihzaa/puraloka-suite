# 31 — Refactoring Policy

> **Maturity:** 🔵 Designed — belum ada kebijakan refactoring formal hari ini; kondisi existing (fungsi besar seperti `rab.ts` 952 baris) belum pernah direfactor secara terencana, hanya bertambah organik.

**Kedudukan:** Batch 6 — Governance. Melengkapi [30-technical-debt-policy.md](30-technical-debt-policy.md) (mencatat debt) dengan aturan **kapan dan bagaimana** debt dilunasi lewat refactoring. Berhubungan erat dengan [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md) (ekstraksi service adalah bentuk refactoring paling sering dirujuk).

---

## 1. Purpose

Memastikan refactoring dilakukan **dipicu oleh kebutuhan nyata** (menyentuh file untuk pekerjaan lain, menulis test, gejala masalah nyata) — bukan dorongan "kode ini terlihat kurang rapi" yang menghasilkan PR besar berisiko tanpa manfaat fungsional langsung.

## 2. Background

Pola event-driven migration sudah dipakai konsisten di seluruh Engineering Constitution ini ([02-architecture/03-clean-architecture-rules.md § Migration Strategy](../02-architecture/03-clean-architecture-rules.md#9-migration-strategy), [03-core-implementation/06-api-engineering-standard.md § Migration Strategy](../03-core-implementation/06-api-engineering-standard.md#9-migration-strategy)): file finansial-kritis diekstrak/direfactor saat disentuh untuk pekerjaan lain, bukan lewat proyek retrofit big-bang terpisah. File ini menggeneralisasi prinsip tersebut menjadi kebijakan refactoring untuk seluruh codebase.

## 3. Principles

1. **Refactoring dipicu oleh sinyal konkret, bukan preferensi estetika.** Sinyal valid: file akan disentuh untuk fitur baru, file perlu ditest tapi strukturnya menyulitkan, bug berulang di area yang sama menunjukkan struktur bermasalah. "Terlihat kurang rapi" bukan sinyal valid sendirian.
2. **Refactoring dan perubahan fungsional MUST dipisahkan jika keduanya besar.** PR yang mencampur refactor besar dengan fitur baru menyulitkan review — kecuali refactor tersebut adalah prasyarat langsung minimal untuk fitur (mis. ekstraksi satu fungsi yang akan ditest).
3. **Refactoring pada domain finansial-kritis MUST disertai bukti tidak ada regresi perilaku** (test sebelum-dan-sesudah menghasilkan output sama) — kode finansial yang berubah perilaku diam-diam lewat "sekadar refactor" adalah risiko tinggi.

## 4. Mandatory Rules

1. Refactoring besar (>~200 baris berubah, atau menyentuh >5 file) **MUST** dipisahkan dari PR fitur baru — **MUST NOT** digabung dalam satu PR kecuali refactor tersebut adalah ekstraksi minimal langsung dibutuhkan fitur yang sedang dikerjakan (selaras [02-architecture/03-clean-architecture-rules.md Principle #3](../02-architecture/03-clean-architecture-rules.md#3-principles)).
2. Refactoring pada enam file finansial-kritis ([Phase1/00 § 4.1](../../Phase1/00-current-state-audit.md#41-enam-file-finansial-kritis-prioritas-test-coverage)) **MUST** disertai test yang memverifikasi perilaku sebelum dan sesudah refactor identik (regression-safe refactor) — **MUST NOT** dilakukan tanpa jaring pengaman ini begitu test tersedia untuk file tersebut.
3. Refactoring **MUST NOT** dilakukan murni sebagai PR kosmetik tanpa perubahan fungsional menyertai, untuk file yang tidak sedang disentuh untuk pekerjaan lain — konsisten [02-architecture/03-clean-architecture-rules.md Principle #3](../02-architecture/03-clean-architecture-rules.md#3-principles) dan [00-principles/00-engineering-principles.md Prinsip YAGNI](../00-principles/00-engineering-principles.md#3-principles).

## 5. Recommended Rules

1. Refactoring **SHOULD** dipicu saat file mendekati ambang kompleksitas yang disebutkan [01-foundations/02-folder-architecture.md Recommended Rule #1](../01-foundations/02-folder-architecture.md#5-recommended-rules) (~500 baris) dan disentuh untuk pekerjaan lain — bukan ambang yang memicu PR terpisah semata.

## 6. Anti-Pattern

**Refactor Kosmetik Tanpa Test Pengaman** — merapikan struktur `kasbons.ts` "supaya lebih bersih" tanpa test yang memverifikasi perilaku tetap sama, dengan risiko mengubah logic finansial secara tidak sengaja di tengah proses "hanya merapikan." Bertentangan Principle #3.

**Refactor Besar Digabung dengan Fitur Baru** — PR yang judulnya "tambah fitur laporan pajak" tapi 80% diff-nya adalah refactor `finance.ts` tidak terkait — menyulitkan reviewer memisahkan mana perubahan fungsional yang perlu diperiksa ketat (fitur baru) dari perubahan struktural (refactor).

## 7. Example Good

Preseden yang sudah didesain: [02-architecture/03-clean-architecture-rules.md § Migration Strategy](../02-architecture/03-clean-architecture-rules.md#9-migration-strategy) — ekstraksi fungsi service dipicu "begitu route file finansial-kritis disentuh untuk perubahan fungsional apa pun," bukan proyek refactor terpisah untuk seluruh 952 baris `rab.ts` sekaligus.

## 8. Example Bad

*(Hipotetis)*: PR terpisah "Refactor rab.ts jadi lebih rapi" yang mengubah struktur 952 baris tanpa perubahan fungsional apa pun dan tanpa test — risiko regresi tinggi untuk manfaat yang tidak segera terasa.

## 9. Migration Strategy

🔵 Designed — N/A untuk migrasi mundur karena belum ada kebijakan refactoring formal existing untuk dimigrasikan. Berlaku penuh sejak Engineering Constitution ini disahkan untuk refactoring baru manapun.

## 10. Checklist

- [ ] Refactoring besar dipisahkan dari PR fitur, kecuali prasyarat langsung
- [ ] Refactoring finansial-kritis disertai test sebelum-sesudah yang membuktikan tidak ada regresi
- [ ] Tidak ada refactor kosmetik murni tanpa perubahan fungsional pada file yang tidak sedang disentuh

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Refactor finansial-kritis tanpa test regression-safe | 0 | Code review checklist |
| PR yang mencampur refactor besar + fitur tidak terkait | 0 | Code review checklist |

## 12. References

- [30-technical-debt-policy.md](30-technical-debt-policy.md)
- [02-architecture/03-clean-architecture-rules.md](../02-architecture/03-clean-architecture-rules.md)
- [Phase1/00-current-state-audit.md § 4.1](../../Phase1/00-current-state-audit.md#41-enam-file-finansial-kritis-prioritas-test-coverage)

---

*File selanjutnya: [32-library-selection-policy.md](32-library-selection-policy.md)*
