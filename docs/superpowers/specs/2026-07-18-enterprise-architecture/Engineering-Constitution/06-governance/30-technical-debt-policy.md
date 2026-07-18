# 30 — Technical Debt Policy

> **Maturity:** 🟡 Partial — technical debt hari ini terdokumentasi jujur (CLAUDE.md § Known Issues & TODO, § Pending Besar), tapi belum ada mekanisme pelacakan terstruktur di luar dokumen prosa.

**Kedudukan:** Batch 6 — Governance. Melengkapi [31-refactoring-policy.md](31-refactoring-policy.md) — file ini mengatur bagaimana debt **dicatat dan diputuskan prioritasnya**, refactoring policy mengatur bagaimana debt **dilunasi**.

---

## 1. Purpose

Membedakan technical debt yang **sengaja diambil dengan alasan jelas** (trade-off sadar demi kecepatan, terdokumentasi, punya rencana pelunasan) dari debt yang menumpuk diam-diam tanpa disadari — kategori pertama sehat dan normal, kategori kedua adalah risiko yang membesar.

## 2. Background

CLAUDE.md sudah mendokumentasikan technical debt secara jujur: bagian "Known Issues & TODO" dan "Pending Besar (jangan kerjakan tanpa prompt khusus)" — contoh nyata debt yang diambil sadar (Worker System Redesign ditunda, kasbon limit 80% dihapus sengaja bukan lupa). Ini preseden baik yang diformalkan file ini, bukan pola baru.

## 3. Principles

1. **Debt yang diambil sadar dan terdokumentasi jauh lebih sehat daripada "tanpa debt sama sekali" yang dicapai lewat over-engineering prematur.** [00-principles/00-engineering-principles.md Prinsip Strict YAGNI](../00-principles/00-engineering-principles.md#3-principles) kadang secara sengaja memilih solusi lebih sederhana yang membawa debt kecil, daripada solusi general di awal yang belum tentu dibutuhkan.
2. **Debt finansial-kritis diprioritaskan lebih tinggi daripada debt kosmetik.** Gap di `services/`/`types/` kosong ([01-foundations/02-folder-architecture.md](../01-foundations/02-folder-architecture.md)) kurang mendesak dibanding gap RLS-RBAC desync ([03-core-implementation/05-database-engineering-standard.md](../03-core-implementation/05-database-engineering-standard.md)).
3. **Debt yang tidak terdokumentasi bukan debt yang "tidak ada" — ia debt yang tidak terlihat sampai menyebabkan masalah.**

## 4. Mandatory Rules

1. Keputusan sadar untuk mengambil jalan pintas (skip test, hardcode nilai sementara, menunda refactor yang idealnya dilakukan) pada domain finansial-kritis **MUST** didokumentasikan eksplisit (komentar kode dengan alasan, atau entry di CLAUDE.md/tracking debt) — **MUST NOT** dibiarkan tanpa jejak bahwa ini adalah trade-off sadar, bukan kelalaian.
2. Debt yang sudah terdokumentasi dan berdampak pada domain finansial-kritis (RLS-RBAC desync, tiga mekanisme otorisasi paralel) **MUST** masuk prioritas Sub-Fase 1A — **MUST NOT** ditunda tanpa batas hanya karena "belum ada insiden."
3. Menambah debt baru pada domain yang sudah bermasalah (mis. menambah inline role check baru di file yang sudah punya banyak inline role check) **MUST NOT** dilakukan — kontribusi baru pada domain finansial-kritis **MUST** mengikuti standar terbaru ([03-core-implementation/06-api-engineering-standard.md](../03-core-implementation/06-api-engineering-standard.md)), bukan mengikuti pola lama yang sedang dikonsolidasi.

## 5. Recommended Rules

1. Debt yang diambil **SHOULD** disertai estimasi kapan idealnya dilunasi (Sub-Fase spesifik, atau "saat file ini disentuh lagi") — bukan "someday" tanpa trigger jelas.

## 6. Anti-Pattern

**Debt Tersembunyi Tanpa Dokumentasi** — menulis kode yang secara sadar menyimpang dari standar (mis. skip validasi karena buru-buru) tanpa komentar atau catatan apa pun. Developer berikutnya (termasuk diri sendiri di masa depan) mengira ini adalah standar yang dimaksud, bukan kompromi sementara.

**Debt Baru di Domain yang Sedang Dikonsolidasi** — menambahkan inline `.role === 'admin'` baru di file yang sedang dalam proses migrasi ke `requirePermission()` — menambah pekerjaan konsolidasi alih-alih mengikuti standar baru sejak awal, bertentangan Mandatory Rule #3.

## 7. Example Good

Preseden CLAUDE.md § Pending Besar: "Worker System Redesign: global registry, field `tipe`... **BELUM diimplementasikan, masih pending**" — didokumentasikan eksplisit sebagai keputusan sadar ditunda, bukan disembunyikan atau diasumsikan sudah selesai.

## 8. Example Bad

*(Hipotetis)*: menulis fungsi kalkulasi kasbon dengan hardcode nilai pajak 2% tanpa komentar bahwa ini sementara dan harus diganti konfigurasi dinamis — developer berikutnya mengira 2% adalah nilai final yang sudah diputuskan permanen.

## 9. Migration Strategy

N/A — pola dokumentasi debt sudah berjalan (CLAUDE.md § Known Issues, § Pending Besar). Berlaku sebagai standar mengikat ke depan: debt baru **MUST** didokumentasikan sejak diambil, bukan retroaktif diaudit untuk debt lama yang sudah ada (debt lama sudah cukup terdokumentasi di CLAUDE.md, hanya perlu dipertahankan updated).

## 10. Checklist

- [ ] Jalan pintas pada domain finansial-kritis didokumentasikan dengan alasan
- [ ] Debt finansial-kritis masuk prioritas Sub-Fase yang sesuai
- [ ] Tidak ada debt baru ditambahkan ke domain yang sedang dikonsolidasi

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Jalan pintas finansial-kritis tanpa dokumentasi | 0 | Code review checklist |
| Debt baru ditambahkan ke domain sedang dikonsolidasi (mis. inline role check baru) | 0 | Grep periodik |

## 12. References

- [31-refactoring-policy.md](31-refactoring-policy.md)
- [00-principles/00-engineering-principles.md](../00-principles/00-engineering-principles.md)
- CLAUDE.md § Known Issues & TODO, § Pending Besar (internal)

---

*File selanjutnya: [31-refactoring-policy.md](31-refactoring-policy.md)*
