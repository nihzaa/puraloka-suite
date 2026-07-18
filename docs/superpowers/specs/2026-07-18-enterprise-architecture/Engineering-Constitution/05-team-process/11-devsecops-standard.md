# 11 — DevSecOps Standard

> **Maturity:** 🔵 Designed — nol pipeline CI/CD hari ini ([Phase1/01-gap-analysis.md Gap 6](../../Phase1/01-gap-analysis.md#gap-6--cicd-nol-pipeline)), seluruh verifikasi (`tsc --noEmit`, test, lint) dijalankan manual oleh developer sebelum push. Kontrak masa depan, berlaku penuh begitu pipeline pertama dibuat di Sub-Fase 1A.

**Kedudukan:** Batch 5 — Proses Tim. Mengoperasionalkan gate otomatis yang dirujuk banyak file lain (mis. [01-foundations/01-coding-standards.md Mandatory Rule #7](../01-foundations/01-coding-standards.md#4-mandatory-rules) "gate otomatis, bukan tanggung jawab reviewer manusia"). Melengkapi [20-checklist-before-merge.md](20-checklist-before-merge.md) — file ini mengotomatisasi sebagian item checklist tersebut.

---

## 1. Purpose

Memindahkan verifikasi yang saat ini bergantung pada disiplin manual developer (menjalankan `tsc --noEmit`, test, lint sebelum push) menjadi gate otomatis yang tidak bisa dilewati tanpa sadar — mengurangi beban kognitif reviewer manusia untuk hal yang seharusnya diverifikasi mesin.

## 2. Background

[Phase1/00-current-state-audit.md](../../Phase1/00-current-state-audit.md) mengonfirmasi nol infrastruktur test dan nol pipeline CI/CD — bukan berarti kualitas kode buruk (TypeScript `strict: true` sudah menangkap banyak kelas bug sejak awal), tapi berarti verifikasi bergantung penuh pada disiplin manual yang tidak terskalakan seiring tim bertambah. [Phase1/02-target-architecture.md § 1A.5 CI/CD Foundation](../../Phase1/02-target-architecture.md#1a5-cicd-foundation) mendesain pipeline dasar sebagai bagian penutup Sub-Fase 1A, setelah test suite (1A.4) tersedia untuk dijalankan pipeline.

## 3. Principles

1. **Gate otomatis dulu, gate manual belakangan.** Pipeline CI **MUST** memverifikasi hal yang bisa diverifikasi mesin (compile, lint, test, security scan dasar) sebelum reviewer manusia menghabiskan waktu untuk hal yang sama.
2. **Pipeline yang gagal MUST memblokir merge, bukan sekadar peringatan.** Status check merah yang bisa di-override tanpa justifikasi eksplisit kehilangan seluruh manfaatnya sebagai gate.
3. **Pipeline dibangun bertahap sesuai apa yang sudah ada untuk diverifikasi.** Tidak ada gunanya menambahkan test coverage gate sebelum ada test sama sekali — urutan penambahan gate mengikuti urutan kesiapan infrastruktur (`tsc` dulu karena sudah `strict: true`, lint setelah ESLint terpasang di `apps/api`, test setelah Vitest terpasang).

## 4. Mandatory Rules

1. Pipeline CI **MUST** menjalankan `tsc --noEmit` untuk `apps/api` dan `apps/web` pada setiap PR — **MUST** memblokir merge jika ada error tipe, konsisten [01-coding-standards.md Mandatory Rule #7](../01-foundations/01-coding-standards.md#4-mandatory-rules).
2. Begitu ESLint aktif di `apps/api` ([01-coding-standards.md Mandatory Rule #6](../01-foundations/01-coding-standards.md#4-mandatory-rules) tertutup), pipeline **MUST** menjalankan lint di kedua app pada setiap PR — **MUST** memblokir merge untuk error (bukan warning) lint.
3. Begitu Vitest terpasang dan ada test, pipeline **MUST** menjalankan seluruh test suite pada setiap PR — **MUST** memblokir merge jika ada test yang gagal.
4. Secret scanning (mendeteksi kredensial yang tidak sengaja ter-commit) **MUST** aktif di pipeline sebelum akhir Sub-Fase 1A — **MUST** memblokir merge jika terdeteksi pola kredensial di diff.
5. Dependency vulnerability scanning (`pnpm audit` atau setara) **MUST** aktif di pipeline sebelum akhir Sub-Fase 1A, dijalankan pada setiap PR yang mengubah `package.json`/`pnpm-lock.yaml` — **MUST** memblokir merge jika ditemukan kerentanan Critical/High tanpa mitigasi terdokumentasi ([06-governance/23-dependency-management.md Mandatory Rule #2](../06-governance/23-dependency-management.md#4-mandatory-rules) mendefinisikan severity response ini; file ini adalah tempat aturan itu **secara resmi menjadi Mandatory**, menutup referensi melingkar yang sebelumnya ada di kedua file). Ini terpisah dari review manual per-package saat penambahan dependency baru ([03-core-implementation/07-security-engineering-standard.md Recommended Rule #2](../03-core-implementation/07-security-engineering-standard.md#5-recommended-rules)) — item ini adalah gate otomatis berkelanjutan, bukan pengganti review manual satu kali saat dependency ditambahkan.
6. Pipeline **MUST NOT** memiliki kemampuan bypass diam-diam (mis. label PR yang melewati semua check tanpa jejak) — override status check yang gagal **MUST** memerlukan justifikasi eksplisit tercatat (komentar PR minimal), konsisten prinsip audit trail.

## 5. Recommended Rules

1. Pipeline **SHOULD** dijalankan paralel per-app (`apps/api`, `apps/web` sebagai job terpisah) untuk mengurangi waktu tunggu total, bukan sekuensial.
2. Coverage report **SHOULD** ditampilkan sebagai komentar PR otomatis begitu target coverage [08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md) mulai diukur — memudahkan reviewer melihat tanpa membuka dashboard terpisah.

## 6. Anti-Pattern

**Verifikasi Manual yang Diasumsikan Selalu Dijalankan** — mengandalkan setiap developer mengingat menjalankan `tsc --noEmit` sendiri sebelum push, tanpa gate otomatis. Realistisnya, di bawah tekanan deadline, langkah manual ini yang pertama dilewati — persis alasan kenapa Mandatory Rule #1 mewajibkan ini jadi pipeline, bukan checklist yang dipercaya akan selalu diikuti.

**Bypass Diam-Diam Tanpa Jejak** — kemampuan admin merge PR meski status check merah tanpa komentar/justifikasi apa pun tercatat. Ini menghilangkan seluruh nilai gate — pipeline yang bisa dilewati tanpa jejak sama saja dengan tidak ada pipeline.

## 7. Example Good

```yaml
# .github/workflows/ci.yml (target, kontrak Designed — bukan file existing)
name: CI
on: [pull_request]
jobs:
  typecheck-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd apps/api && pnpm install && pnpm tsc --noEmit
  typecheck-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd apps/web && pnpm install && pnpm tsc --noEmit
```
Gate paralel per-app, memblokir merge jika gagal — konsisten Mandatory Rule #1 dan Recommended Rule #1.

## 8. Example Bad

*(Hipotetis — dicantumkan sebagai pencegahan)*: pipeline yang ada tapi statusnya "informational only" (tidak diset sebagai required status check di branch protection) — developer bisa melihat pipeline merah tapi tetap merge tanpa halangan apa pun. Secara teknis "ada CI," tapi nol nilai sebagai gate — bertentangan Principle #2.

## 9. Migration Strategy

**Seluruh Mandatory Rules di file ini** — 🔵 Designed murni, N/A untuk migrasi mundur karena tidak ada pipeline existing. Urutan implementasi mengikuti [Phase1/02 § 1A.5](../../Phase1/02-target-architecture.md#1a5-cicd-foundation): (1) `tsc --noEmit` gate — bisa langsung diaktifkan karena `strict: true` sudah aktif, (2) lint gate — menunggu ESLint `apps/api` tertutup, (3) test gate — menunggu Vitest + test pertama tertulis, (4) secret scanning — independen, bisa ditambahkan kapan saja, target sebelum akhir Sub-Fase 1A, (5) dependency vulnerability scanning — independen dari (1)-(4), bisa ditambahkan kapan saja karena `pnpm audit` tidak butuh infrastruktur lain, target sebelum akhir Sub-Fase 1A.

## 10. Checklist

- [ ] `tsc --noEmit` jadi required status check di kedua app
- [ ] Lint jadi required status check (setelah ESLint `apps/api` aktif)
- [ ] Test suite jadi required status check (setelah Vitest aktif)
- [ ] Secret scanning aktif di pipeline
- [ ] Dependency vulnerability scanning aktif di pipeline, memblokir merge untuk kerentanan Critical/High tanpa mitigasi terdokumentasi
- [ ] Tidak ada jalur bypass status check tanpa jejak

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| PR yang di-merge dengan status check gagal tanpa justifikasi | 0 | Audit riwayat PR |
| Error `tsc --noEmit` lolos ke `main` | 0 | CI gate aktif |
| Waktu pipeline CI end-to-end | Dijaga wajar (belum ada angka baseline) | Dashboard CI, ditinjau ulang setelah data terkumpul |
| Kerentanan Critical/High lolos ke `main` tanpa mitigasi terdokumentasi | 0 | `pnpm audit` gate aktif di CI |

## 12. References

- [Phase1/01-gap-analysis.md § Gap 6](../../Phase1/01-gap-analysis.md#gap-6--cicd-nol-pipeline)
- [Phase1/02-target-architecture.md § 1A.5](../../Phase1/02-target-architecture.md#1a5-cicd-foundation)
- [01-foundations/01-coding-standards.md](../01-foundations/01-coding-standards.md)
- [04-quality-and-observability/08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md)
- [20-checklist-before-merge.md](20-checklist-before-merge.md)
- [06-governance/23-dependency-management.md](../06-governance/23-dependency-management.md)

---

*File selanjutnya: [14-git-workflow-standard.md](14-git-workflow-standard.md)*
