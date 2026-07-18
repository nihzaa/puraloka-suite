# 26 — Feature Flag Standard

> **Maturity:** 🔵 Designed — nol feature flag infrastruktur hari ini; fitur dirilis langsung ke semua pengguna sekaligus (all-or-nothing deploy). Kontrak masa depan sesuai [Phase1/02 § 1B.3 Module Registry & Feature Flags](../../Phase1/02-target-architecture.md#1b3-module-registry--feature-flags).

**Kedudukan:** Batch 7 — Domain Spesifik. Detail penggunaan dari skema `feature_flags` table yang didesain [Phase1/02-target-architecture.md § 1B.3](../../Phase1/02-target-architecture.md#1b3-module-registry--feature-flags).

---

## 1. Purpose

Memungkinkan fitur baru (terutama yang berisiko atau besar) dirilis bertahap ke subset pengguna, atau dinonaktifkan cepat tanpa rollback deploy penuh jika ada masalah ditemukan setelah rilis — kemampuan yang hari ini tidak ada karena semua fitur langsung aktif untuk semua pengguna begitu di-deploy.

## 2. Background

[Phase1/02-target-architecture.md § 1B.3](../../Phase1/02-target-architecture.md#1b3-module-registry--feature-flags) mendesain tabel `feature_flags` sebagai bagian Sub-Fase 1B (Configuration Foundation) — belum diimplementasikan hari ini. File ini mendefinisikan aturan pemakaiannya begitu tersedia, mencegah feature flag menjadi debt tersendiri (flag yang tidak pernah dibersihkan setelah fitur stabil).

## 3. Principles

1. **Feature flag adalah alat sementara untuk rollout terkendali, bukan mekanisme permanen untuk percabangan perilaku jangka panjang.** Flag yang hidup bertahun-tahun tanpa pernah dihapus adalah debt, bukan fleksibilitas.
2. **Flag untuk fitur finansial-kritis default OFF sampai diverifikasi benar, bukan default ON dengan opsi mematikan.** Fail-closed juga berlaku untuk rollout fitur baru ([03-core-implementation/07-security-engineering-standard.md Principle #1](../03-core-implementation/07-security-engineering-standard.md#3-principles)).
3. **Flag dibersihkan setelah fitur stabil (100% rollout, tidak ada rencana rollback).** Flag yang menumpuk tanpa dibersihkan membuat kode makin sulit dibaca (banyak `if (flag)` yang tidak lagi relevan).

## 4. Mandatory Rules

1. Fitur baru yang berdampak pada domain finansial-kritis **MUST** dirilis di belakang feature flag dengan default OFF, bukan langsung aktif untuk semua pengguna — **MUST NOT** langsung 100% rollout untuk perubahan besar pada domain ini tanpa periode verifikasi bertahap begitu infrastruktur flag tersedia.
2. Feature flag **MUST** dihapus dari kode (bersama percabangan `if (flag)` terkait) dalam waktu wajar setelah fitur mencapai 100% rollout stabil — **MUST NOT** dibiarkan menumpuk sebagai dead code permanen.
3. Kondisi flag **MUST** dievaluasi di layer yang jelas (bukan tersebar sebagai pengecekan ad-hoc di banyak tempat tidak terkait) — konsisten prinsip satu titik kebenaran ([02-architecture/04-domain-driven-design-rules.md](../02-architecture/04-domain-driven-design-rules.md)).

## 5. Recommended Rules

1. Flag **SHOULD** punya deskripsi jelas tentang tujuan dan tanggal target penghapusan saat dibuat — memudahkan audit flag mana yang sudah kadaluarsa.

## 6. Anti-Pattern

**Flag yang Tidak Pernah Dihapus** — fitur sudah 100% rollout stabil selama berbulan-bulan, tapi kode `if (featureFlags.newKasbonFlow)` masih ada di mana-mana — menambah kompleksitas kognitif tanpa manfaat, karena jalur "lama" (flag OFF) sudah tidak relevan tapi tetap harus dibaca setiap kali menyentuh kode tersebut.

## 7. Example Good / 8. Example Bad

Tidak berlaku dalam bentuk kode konkret — infrastruktur belum ada (🔵 Designed murni).

## 9. Migration Strategy

🔵 Designed murni — N/A untuk migrasi mundur. Berlaku penuh begitu `feature_flags` table dan mekanisme evaluasinya diimplementasikan di Sub-Fase 1B.

## 10. Checklist

- [ ] Fitur finansial-kritis besar dirilis di belakang flag default OFF
- [ ] Flag dihapus setelah fitur 100% rollout stabil
- [ ] Evaluasi flag di layer jelas, tidak tersebar ad-hoc

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Flag berumur >3 bulan setelah 100% rollout tanpa dihapus | 0 | Audit periodik `feature_flags` table |

## 12. References

- [Phase1/02-target-architecture.md § 1B.3](../../Phase1/02-target-architecture.md#1b3-module-registry--feature-flags)
- [27-configuration-standard.md](27-configuration-standard.md)
- [GLOSSARY.md — Feature Flag](../GLOSSARY.md)

---

*File selanjutnya: [27-configuration-standard.md](27-configuration-standard.md)*
