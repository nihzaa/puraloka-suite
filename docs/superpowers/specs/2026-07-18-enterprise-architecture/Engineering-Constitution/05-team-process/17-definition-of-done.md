# 17 — Definition of Done

> **Maturity:** 🔵 Designed — kontrak yang mengagregasi "selesai" dari perspektif payung Phase 1, diadaptasi dari [Phase1/09-definition-of-done.md](../../Phase1/09-definition-of-done.md) menjadi definisi generik per-task, bukan hanya per-Sub-Fase.

**Kedudukan:** Batch 5 — Proses Tim. Pasangan dari [16-definition-of-ready.md](16-definition-of-ready.md). Detail spesifik per Sub-Fase Phase 1 tetap di [Phase1/09-definition-of-done.md](../../Phase1/09-definition-of-done.md) — file ini menggeneralisasi pola tersebut untuk task/PR individual di luar konteks Sub-Fase.

---

## 1. Purpose

Menjawab pertanyaan "apakah task ini benar-benar selesai?" dengan kriteria konkret dan terverifikasi — bukan perasaan subjektif "sepertinya sudah beres" yang berbeda-beda tiap orang.

## 2. Background

[Phase1/09-definition-of-done.md](../../Phase1/09-definition-of-done.md) sudah mendefinisikan kriteria selesai per Sub-Fase 1A-1D secara rinci (Permission Engine, RLS, Audit Trail, dst.) — checklist tingkat-proyek. File ini menurunkan pola yang sama ke level task/PR individual, dipakai berulang jauh lebih sering daripada checklist Sub-Fase yang hanya dicek beberapa kali per Phase.

## 3. Principles

1. **"Selesai" berarti terverifikasi, bukan hanya ditulis.** Kode yang ditulis tapi belum di-test/di-review/di-deploy bukan "hampir selesai" — statusnya masih "belum selesai."
2. **Kriteria selesai konsisten dengan gate yang sudah didefinisikan file lain.** File ini tidak menciptakan kriteria baru independen — ia mengumpulkan kriteria yang sudah didefinisikan di [08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md), [11-devsecops-standard.md](11-devsecops-standard.md), [15-code-review-checklist.md](15-code-review-checklist.md).

## 4. Mandatory Rules

1. Task **MUST NOT** dianggap selesai jika `tsc --noEmit` gagal — konsisten [01-foundations/01-coding-standards.md](../01-foundations/01-coding-standards.md).
2. Task yang mengekstrak fungsi kalkulasi murni **MUST NOT** dianggap selesai tanpa unit test menyertai — konsisten [02-architecture/03-clean-architecture-rules.md Mandatory Rule #4](../02-architecture/03-clean-architecture-rules.md#4-mandatory-rules).
3. Task domain finansial-kritis **MUST NOT** dianggap selesai tanpa Golden Path integration test terverifikasi berjalan — konsisten [08-testing-standard.md Mandatory Rule #3](../04-quality-and-observability/08-testing-standard.md#4-mandatory-rules).
4. Task yang mengubah skema database **MUST NOT** dianggap selesai tanpa migration terverifikasi berjalan di environment development (bukan hanya ditulis, benar-benar dijalankan dan diperiksa hasilnya).
5. Task **MUST NOT** dianggap selesai jika meninggalkan placeholder (`TODO`, `FIXME`) pada logic inti yang seharusnya sudah diimplementasikan — placeholder untuk pekerjaan sub-fase berikutnya yang eksplisit di luar scope task saat ini boleh, asal didokumentasikan jelas kenapa ditunda.

## 5. Recommended Rules

1. Task **SHOULD** memverifikasi tidak ada regresi pada fitur terkait yang sudah berjalan (manual smoke test untuk perubahan UI, sesuai instruksi standar "test golden path di browser sebelum melaporkan selesai").

## 6. Anti-Pattern

**"Selesai" yang Berarti "Kompilasi Tanpa Error"** — melaporkan task selesai hanya karena kode berhasil di-compile tanpa memverifikasi perilaku benar. Ini adalah standar terendah yang bisa dicapai, jauh dari kriteria Mandatory Rule #1-4.

## 7. Example Good / 8. Example Bad

Tidak berlaku dalam bentuk kode untuk file jenis checklist proses — lihat Bagian 4 sebagai kriteria konkret.

## 9. Migration Strategy

🔵 Designed — N/A untuk migrasi mundur. Berlaku penuh untuk task baru sejak Engineering Constitution ini disahkan.

## 10. Checklist

- [ ] `tsc --noEmit` lolos
- [ ] Fungsi kalkulasi murni baru punya unit test
- [ ] Golden Path finansial-kritis punya integration test (jika relevan)
- [ ] Migration terverifikasi berjalan di development (jika relevan)
- [ ] Tidak ada placeholder tak terjustifikasi pada logic inti

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Task dilaporkan selesai tapi ditemukan bug dalam 1 minggu | Menurun dari baseline | Tracking manual |

## 12. References

- [Phase1/09-definition-of-done.md](../../Phase1/09-definition-of-done.md)
- [16-definition-of-ready.md](16-definition-of-ready.md)
- [04-quality-and-observability/08-testing-standard.md](../04-quality-and-observability/08-testing-standard.md)
- [20-checklist-before-merge.md](20-checklist-before-merge.md)

---

*File selanjutnya: [20-checklist-before-merge.md](20-checklist-before-merge.md)*
