# 25 — Versioning Standard

> **Maturity:** 🔵 Designed — belum ada versioning API formal hari ini meski path `/api/v1/` sudah dipakai konsisten (menyiratkan niat versioning, belum pernah benar-benar dipakai karena belum ada `v2`).

**Kedudukan:** Batch 6 — Governance. Melengkapi [03-core-implementation/06-api-engineering-standard.md](../03-core-implementation/06-api-engineering-standard.md) — file ini mengatur kapan dan bagaimana versi API baru dibuat, bukan struktur endpoint per versi.

---

## 1. Purpose

Menyiapkan strategi versioning API sebelum benar-benar dibutuhkan — supaya saat breaking change pertama pada kontrak API terjadi (mis. mengubah bentuk response `kurva-s` secara fundamental), ada jalur jelas untuk melakukannya tanpa mematahkan klien existing (web, mobile, portal) secara tiba-tiba.

## 2. Background

Seluruh 159 endpoint hari ini berada di bawah `/api/v1/` — prefix versi sudah ada sejak awal, tapi belum pernah benar-benar dipakai untuk membedakan dua versi berbeda karena belum ada breaking change yang memerlukannya. Tiga klien (web dashboard, mobile app Fase 1, portal client/mandor) semuanya mengonsumsi `v1` yang sama hari ini.

## 3. Principles

1. **Breaking change pada API MUST menghasilkan versi baru atau field baru yang backward-compatible, tidak pernah mengubah kontrak existing diam-diam.** Klien mobile khususnya (yang tidak selalu update serentak dengan backend) rentan patah oleh breaking change tanpa versioning.
2. **Menambah field baru ke response bukan breaking change — mengubah/menghapus field existing adalah breaking change.** Distinksi ini menentukan apakah perubahan butuh versi baru atau cukup PR biasa.
3. **Versioning adalah biaya maintenance ganda (v1 dan v2 berjalan bersamaan) — dipakai hanya saat benar-benar perlu, bukan preventif untuk setiap perubahan.**

## 4. Mandatory Rules

1. Perubahan yang menghapus field dari response JSON, mengubah tipe field existing, atau mengubah struktur endpoint secara fundamental **MUST** dianggap breaking change — **MUST NOT** langsung diterapkan ke `/api/v1/` tanpa mempertimbangkan dampak ke klien mobile/portal yang mungkin belum update.
2. Breaking change yang benar-benar dibutuhkan **MUST** melalui salah satu dari dua jalur: (a) versi endpoint baru (`/api/v2/<domain>`) jika perubahan luas, atau (b) field baru ditambahkan berdampingan dengan field lama untuk periode transisi (mirip Expand-Contract, [GLOSSARY.md](../GLOSSARY.md)), lalu field lama dihapus setelah seluruh klien terverifikasi migrasi — **MUST NOT** mengubah kontrak `v1` existing secara langsung tanpa periode transisi untuk perubahan yang berdampak ke klien mobile.
3. Penambahan field baru ke response (non-breaking) **MUST NOT** memerlukan versi API baru — **MUST** cukup PR biasa mengikuti [03-core-implementation/06-api-engineering-standard.md](../03-core-implementation/06-api-engineering-standard.md).

## 5. Recommended Rules

1. Perubahan API yang berdampak ke mobile app **SHOULD** dikoordinasikan dengan rilis app mobile terkait (app store review time berbeda dari deploy web) — belum ada proses formal karena mobile masih Fase 1.

## 6. Anti-Pattern

**Breaking Change Diam-Diam di `v1`** — mengubah bentuk response `GET /api/v1/kasbons` (mis. mengganti nama field `amount` menjadi `nominal`) tanpa periode transisi, langsung mematahkan mobile app yang belum sempat update — mobile app tidak selalu ter-update serentak dengan backend seperti web dashboard.

## 7. Example Good

```ts
// Non-breaking: field baru ditambahkan, field lama tetap ada
{ data: { id, amount, amount_display: formatCurrency(amount) } } // field baru amount_display
```

## 8. Example Bad

```ts
// Breaking: field lama dihapus/diganti nama tanpa transisi
{ data: { id, nominal } } // 'amount' hilang, klien lama (belum update) langsung error
```

## 9. Migration Strategy

🔵 Designed — N/A untuk migrasi mundur karena belum pernah ada breaking change yang memerlukan versioning sejak awal proyek. Berlaku penuh sejak breaking change pertama diusulkan — pada titik itu, Mandatory Rule #1-2 **MUST** diikuti, tidak ada masa transisi tambahan.

## 10. Checklist

- [ ] Perubahan pada response API diklasifikasi breaking/non-breaking dengan sadar
- [ ] Breaking change memakai versi baru atau periode transisi field berdampingan
- [ ] Dampak ke mobile app dipertimbangkan untuk breaking change

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Breaking change diterapkan langsung ke `v1` tanpa transisi | 0 | Code review checklist |

## 12. References

- [03-core-implementation/06-api-engineering-standard.md](../03-core-implementation/06-api-engineering-standard.md)
- [GLOSSARY.md — Expand-Contract Migration](../GLOSSARY.md)

---

*File selanjutnya: [30-technical-debt-policy.md](30-technical-debt-policy.md)*
