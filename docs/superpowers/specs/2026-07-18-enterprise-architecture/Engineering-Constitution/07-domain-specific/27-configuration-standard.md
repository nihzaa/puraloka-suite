# 27 — Configuration Standard

> **Maturity:** 🔵 Designed — sebagian besar nilai konfigurasi hari ini masih hardcode (contoh konkret: tarif pajak PPh final 2% hardcode di `termin-payment.ts:175`), Configuration Engine didesain tapi belum diimplementasikan.

**Kedudukan:** Batch 7 — Domain Spesifik. Detail penggunaan dari Configuration Engine yang didesain [Phase1/02-target-architecture.md § 1B.1](../../Phase1/02-target-architecture.md#1b1-configuration-engine). Melengkapi [26-feature-flag-standard.md](26-feature-flag-standard.md) — feature flag mengontrol *apakah* fitur aktif, configuration mengontrol *nilai parameter* fitur yang sudah aktif.

---

## 1. Purpose

Memisahkan nilai yang **seharusnya bisa diubah tanpa deploy kode baru** (tarif pajak, threshold approval, nilai default) dari logic aplikasi — supaya perubahan kebijakan bisnis (mis. tarif pajak berubah karena regulasi) tidak memerlukan siklus deploy penuh setiap kali.

## 2. Background

[Phase1/01-gap-analysis.md Gap 9](../../Phase1/01-gap-analysis.md#gap-9--configuration-engine-sebagian-besar-adalah-gap-fitur-bukan-hardcode) mengoreksi eksplisit: sebagian besar yang terlihat seperti "hardcode yang buruk" sebenarnya adalah gap fitur (konfigurasi belum pernah dibutuhkan berubah, bukan lupa dibuat dinamis) — kecuali kasus konkret seperti tarif pajak PPh final 2% yang hardcode di `termin-payment.ts:175` (CLAUDE.md § Tax Schemes, internal), yang secara riil adalah nilai regulasi yang bisa berubah dan seharusnya dinamis.

## 3. Principles

1. **Konfigurasi dinamis dibangun untuk nilai yang benar-benar berpotensi berubah tanpa deploy, bukan preventif untuk semua angka di kode.** Bedakan nilai yang murni implementasi detail (ukuran buffer internal) dari nilai kebijakan bisnis (tarif pajak, threshold approval) — hanya kategori kedua yang butuh Configuration Engine.
2. **Nilai konfigurasi finansial-kritis MUST punya default yang aman dan tervalidasi**, bukan bisa diset ke nilai sembarang yang merusak kalkulasi (mis. tarif pajak negatif).
3. **Perubahan konfigurasi finansial MUST tercatat di audit trail** — perubahan tarif pajak yang tidak terlacak siapa dan kapan mengubahnya adalah risiko kepatuhan.

## 4. Mandatory Rules

1. Nilai kebijakan bisnis yang bisa berubah karena regulasi atau keputusan bisnis (tarif pajak, threshold approval, batas nominal) **MUST** dipindahkan ke Configuration Engine begitu tersedia — **MUST NOT** tetap hardcode di kode setelah Sub-Fase 1B selesai untuk kategori nilai ini. Contoh konkret prioritas: tarif pajak PPh final 2% di `termin-payment.ts:175`.
2. Nilai implementasi detail (bukan kebijakan bisnis) **MUST NOT** dipaksa masuk Configuration Engine hanya karena "supaya konsisten" — menambah kompleksitas konfigurasi untuk nilai yang tidak pernah butuh berubah tanpa deploy adalah over-engineering (selaras YAGNI).
3. Perubahan nilai konfigurasi finansial-kritis lewat Configuration Engine **MUST** tercatat di `audit_logs` — **MUST NOT** menjadi perubahan yang tidak terlacak siapa/kapan mengubahnya.
4. Nilai konfigurasi baru **MUST** punya validasi rentang wajar (mis. tarif pajak antara 0-100%) sebelum disimpan — **MUST NOT** menerima nilai yang secara matematis tidak masuk akal untuk domain tersebut.

## 5. Recommended Rules

1. Konfigurasi yang jarang berubah (diubah <1x/tahun secara historis) **SHOULD** tetap dipertimbangkan cukup sebagai environment variable atau constant, bukan otomatis masuk Configuration Engine dinamis — proporsional dengan frekuensi perubahan nyata.

## 6. Anti-Pattern

**Hardcode Nilai Regulasi** — tarif pajak PPh final di kode langsung sebagai angka (`0.02`) alih-alih dibaca dari konfigurasi — begitu regulasi berubah, perubahan memerlukan deploy kode baru alih-alih update konfigurasi, dan berisiko terlewat di salah satu tempat jika nilai yang sama muncul di beberapa file.

**Over-Configuration** — membuat semua angka di kode (termasuk detail implementasi murni seperti ukuran halaman pagination internal) menjadi konfigurasi dinamis "supaya fleksibel," menambah kompleksitas operasional tanpa manfaat nyata — bertentangan Mandatory Rule #2.

## 7. Example Good / 8. Example Bad

Tidak berlaku dalam bentuk kode konkret — Configuration Engine belum diimplementasikan (🔵 Designed murni untuk mekanismenya), meski gap yang perlu ditutup (tarif pajak hardcode) sudah konkret hari ini.

## 9. Migration Strategy

**Untuk Mandatory Rule #1 (tarif pajak dan nilai kebijakan lain)** — 🔵 Designed, migrasi dijadwalkan Sub-Fase 1B setelah Configuration Engine tersedia ([Phase1/02 § 1B.1](../../Phase1/02-target-architecture.md#1b1-configuration-engine)). Sampai saat itu, nilai hardcode existing **bukan** pelanggaran (gap terdokumentasi, bukan kelalaian) — tapi **MUST** diprioritaskan sebagai item pertama yang dipindahkan begitu engine tersedia.

**Untuk Mandatory Rule #2-4** — berlaku penuh sejak Configuration Engine tersedia, sebagai panduan pemakaiannya.

## 10. Checklist

- [ ] Nilai kebijakan bisnis baru (tarif, threshold) memakai Configuration Engine (setelah tersedia), bukan hardcode
- [ ] Nilai implementasi detail tidak dipaksa jadi konfigurasi dinamis
- [ ] Perubahan konfigurasi finansial tercatat di audit trail
- [ ] Nilai konfigurasi baru punya validasi rentang wajar

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Nilai kebijakan bisnis finansial hardcode tersisa (setelah Sub-Fase 1B) | 0 | Audit `grep` nilai numerik di file finansial-kritis |
| Perubahan konfigurasi finansial tanpa audit log | 0 | Audit `audit_logs` vs `feature_flags`/config table |

## 12. References

- [Phase1/01-gap-analysis.md § Gap 9](../../Phase1/01-gap-analysis.md#gap-9--configuration-engine-sebagian-besar-adalah-gap-fitur-bukan-hardcode)
- [Phase1/02-target-architecture.md § 1B.1](../../Phase1/02-target-architecture.md#1b1-configuration-engine)
- [26-feature-flag-standard.md](26-feature-flag-standard.md)
- CLAUDE.md § Tax Schemes (internal — contoh konkret tarif pajak hardcode)

---

*File selanjutnya: [35-event-driven-guideline.md](35-event-driven-guideline.md)*
