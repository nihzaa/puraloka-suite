# 33 — Package Approval Policy

> **Maturity:** 🔵 Designed — belum ada proses approval formal hari ini (solo developer menambah dependency tanpa persetujuan pihak lain). Kontrak masa depan, relevan begitu kontributor kedua bergabung.

**Kedudukan:** Batch 6 — Governance. Batch 6 selesai di file ini. Melengkapi [32-library-selection-policy.md](32-library-selection-policy.md) (kriteria *apa* yang dipilih) dengan proses *siapa yang menyetujui* penambahan dependency.

---

## 1. Purpose

Menetapkan siapa yang berwenang menyetujui penambahan dependency baru begitu tim bertambah dari satu orang — mencegah dependency ditambahkan sepihak oleh kontributor mana pun tanpa pertimbangan dampak lintas tim.

## 2. Background

Hari ini, karena pengembangan solo developer, "approval" secara efektif adalah keputusan Nizar sendiri (dengan bantuan evaluasi Claude Code lewat [32-library-selection-policy.md](32-library-selection-policy.md)). File ini menyiapkan proses formal begitu ada kontributor lain yang bisa menambah dependency secara independen.

## 3. Principles

1. **Dependency baru berdampak ke seluruh tim yang membangun/menjalankan aplikasi — approval mencerminkan dampak bersama ini.** Satu kontributor menambah dependency berat tanpa diketahui yang lain bisa memperlambat build/deploy untuk semua orang.
2. **Proses approval seringan mungkin yang tetap efektif.** Approval yang terlalu berat (rapat formal untuk setiap `pnpm add`) mendorong orang menghindarinya diam-diam — proses harus proporsional dengan dampak dependency.

## 4. Mandatory Rules

1. Dependency baru yang menambah kapabilitas arsitektural (bukan sekadar utility kecil) **MUST** disetujui minimal satu orang selain penulis PR begitu kontributor kedua tersedia — **MUST NOT** langsung di-merge tanpa review sama sekali untuk kategori ini.
2. Dependency dengan lisensi yang membatasi penggunaan komersial (GPL untuk kode proprietary, lisensi non-permisif lain) **MUST** diperiksa kompatibilitasnya dengan model bisnis Puraloka Suite (SaaS komersial di L3+, [GLOSSARY.md — L1/L2/L3/L4](../GLOSSARY.md)) sebelum ditambahkan — **MUST NOT** diabaikan dengan asumsi "kan cuma internal dulu" jika roadmap jangka panjang adalah SaaS komersial.
3. Dependency utility kecil dan umum (mis. library formatting tanggal yang sudah mapan dan ringan) **MUST NOT** memerlukan proses approval seberat dependency arsitektural — **MUST** tetap melalui [32-library-selection-policy.md](32-library-selection-policy.md) evaluasi minimal, tapi tidak perlu review approval terpisah untuk kategori ini.

## 5. Recommended Rules

1. Kategori "dependency arsitektural" vs "utility kecil" **SHOULD** didaftar contoh konkretnya (bukan hanya definisi abstrak) begitu tim bertambah dan pertanyaan ini muncul nyata — dihindari didefinisikan spekulatif sebelum ada kasus nyata (selaras YAGNI).

## 6. Anti-Pattern

**Approval Rubber-Stamp untuk Dependency Berat** — menyetujui penambahan library besar tanpa benar-benar membaca evaluasi di [32-library-selection-policy.md](32-library-selection-policy.md), hanya karena "kelihatannya oke" — approval yang tidak benar-benar mengevaluasi kehilangan seluruh nilainya.

## 7. Example Good / 8. Example Bad

Tidak berlaku dalam bentuk kode — file ini murni proses.

## 9. Migration Strategy

🔵 Designed — N/A untuk migrasi mundur, tidak ada proses approval formal existing (solo developer). Berlaku penuh begitu kontributor kedua bergabung. Sebelum itu, [32-library-selection-policy.md](32-library-selection-policy.md) evaluasi tetap **SHOULD** dijalankan sebagai self-check meski tanpa approval pihak kedua.

## 10. Checklist

- [ ] Dependency arsitektural disetujui pihak selain penulis (setelah kontributor kedua ada)
- [ ] Lisensi dependency baru diperiksa kompatibilitas dengan model bisnis SaaS jangka panjang
- [ ] Dependency utility kecil tetap melalui evaluasi minimal [32-library-selection-policy.md](32-library-selection-policy.md)

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Dependency arsitektural ditambahkan tanpa approval (setelah kontributor kedua ada) | 0 | Audit riwayat PR |
| Dependency dengan lisensi bermasalah untuk SaaS komersial ditemukan | 0 | Audit lisensi periodik |

## 12. References

- [32-library-selection-policy.md](32-library-selection-policy.md)
- [23-dependency-management.md](23-dependency-management.md)
- [GLOSSARY.md — L1/L2/L3/L4](../GLOSSARY.md)

---

*Batch 6 selesai. File selanjutnya (Batch 7 — Domain Spesifik): [07-domain-specific/12-ui-engineering-standard.md](../07-domain-specific/12-ui-engineering-standard.md)*
