# 24 — Documentation Standard

> **Maturity:** 🟢 Enforced — CLAUDE.md sudah dipertahankan sebagai dokumen hidup yang diupdate konsisten setiap fitur besar selesai (terverifikasi: mencakup 41+ item status fitur dengan detail migration number), pola yang sudah terbukti sebelum diformalkan di sini.

**Kedudukan:** Batch 6 — Governance. Menetapkan standar untuk dokumentasi internal (CLAUDE.md, Engineering Constitution sendiri, Architecture Repository) — bukan dokumentasi API publik yang belum relevan pada L1 (single-tenant internal).

---

## 1. Purpose

Menjaga dokumentasi tetap menjadi sumber kebenaran yang bisa dipercaya — CLAUDE.md yang basi (menyatakan sesuatu "belum selesai" padahal sudah, atau sebaliknya) lebih berbahaya daripada tidak ada dokumentasi sama sekali, karena mengarahkan keputusan berdasarkan informasi salah.

## 2. Background

CLAUDE.md project-level sudah menunjukkan disiplin yang baik: setiap fitur besar yang selesai diupdate dengan detail migration number, file yang terlibat, dan keputusan desain terkait — bukan sekadar checklist centang tanpa detail. Engineering Constitution ini sendiri mengikuti pola serupa lewat Maturity Badge ([ADR-002](../adr/ADR-002-enforcement-levels-and-template.md)) yang jujur tentang status implementasi per file.

## 3. Principles

1. **Dokumentasi diupdate di PR yang sama dengan kode, bukan PR terpisah "nanti."** CLAUDE.md yang diupdate berhari-hari setelah fitur selesai berisiko terlupakan sepenuhnya.
2. **Kejujuran status lebih penting daripada kelihatan lengkap.** Maturity Badge 🟡 Partial yang jujur lebih berguna daripada 🟢 Enforced yang salah — preseden yang sudah dipegang teguh sepanjang Engineering Constitution ini ditulis.
3. **Dokumentasi arsitektur (00-06, Engineering Constitution) dan dokumentasi operasional (CLAUDE.md) punya audiens dan cadence update berbeda.** CLAUDE.md diupdate tiap fitur; Architecture Repository diupdate saat keputusan arsitektur berubah (lebih jarang, tapi tidak statis).

## 4. Mandatory Rules

1. Fitur baru yang selesai dan berdampak pada status yang tercatat di CLAUDE.md **MUST** memperbarui bagian relevan (Status Dashboard, Fitur & Halaman — Status Lengkap) di PR yang sama — **MUST NOT** ditunda ke PR dokumentasi terpisah.
2. Keputusan arsitektur yang mengubah asumsi tertulis di Architecture Repository (00-06) atau Engineering Constitution **MUST** disertai ADR ([19-architecture-decision-record-guide.md](19-architecture-decision-record-guide.md)) dan update ke dokumen yang terdampak — **MUST NOT** dibiarkan dokumen lama menyatakan sesuatu yang sudah tidak berlaku tanpa penanda.
3. Klaim status implementasi di dokumentasi (✅ SELESAI, 🟡 Partial, dst.) **MUST** diverifikasi terhadap kode nyata sebelum ditulis — **MUST NOT** diasumsikan dari ingatan atau niat tanpa dicek.

## 5. Recommended Rules

1. Dokumen yang merujuk migration number **SHOULD** menyertakan nomor migration spesifik (preseden CLAUDE.md: "Migration 056", bukan hanya "migrasi kasbon terbaru") — memudahkan penelusuran balik ke SQL yang sebenarnya berubah.

## 6. Anti-Pattern

**Dokumentasi Basi yang Dipercaya Buta** — CLAUDE.md menyatakan fitur "belum selesai" padahal sudah di-deploy berbulan-bulan lalu, menyebabkan developer/AI agent mengira perlu diimplementasikan ulang atau ragu memakainya. Ini persis risiko yang dicegah Mandatory Rule #1.

**Status Diklaim Tanpa Verifikasi** — menulis "✅ SELESAI" untuk fitur yang sebenarnya baru sebagian diimplementasikan, karena "seharusnya sudah selesai" tanpa mengecek kode. Bertentangan Mandatory Rule #3 dan seluruh disiplin verifikasi-langsung yang dipegang di Phase1 audit dan Engineering Constitution ini.

## 7. Example Good

Pola CLAUDE.md existing: setiap baris di tabel "Fitur & Halaman — Status Lengkap" menyertakan nomor migration dan file spesifik (mis. "Migration 056: work_scope_id nullable, project_id langsung..."). Ini konsisten Recommended Rule #1 — bisa ditelusuri balik ke SQL nyata, bukan klaim tanpa jejak.

## 8. Example Bad

*(Hipotetis)*: entry CLAUDE.md "Fitur X: sudah selesai" tanpa detail file/migration apa pun — pembaca tidak bisa memverifikasi klaim ini tanpa membaca seluruh codebase dari awal.

## 9. Migration Strategy

N/A — pola sudah 100% konsisten diterapkan di CLAUDE.md project-level sepanjang riwayat proyek. Berlaku sebagai standar mengikat untuk update dokumentasi ke depan, termasuk Engineering Constitution ini sendiri dan Architecture Repository.

## 10. Checklist

- [ ] CLAUDE.md diupdate di PR yang sama dengan fitur yang selesai
- [ ] Keputusan arsitektur yang mengubah dokumen existing disertai ADR
- [ ] Status implementasi diverifikasi terhadap kode nyata sebelum ditulis

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Klaim status di CLAUDE.md yang terbukti salah saat diverifikasi | 0 | Audit periodik sampling |
| Fitur selesai tanpa update CLAUDE.md dalam PR yang sama | 0 | Code review checklist |

## 12. References

- [19-architecture-decision-record-guide.md](19-architecture-decision-record-guide.md)
- [adr/ADR-002-enforcement-levels-and-template.md](../adr/ADR-002-enforcement-levels-and-template.md)
- CLAUDE.md (internal, preseden pola)

---

*File selanjutnya: [25-versioning-standard.md](25-versioning-standard.md)*
