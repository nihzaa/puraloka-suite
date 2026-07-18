# 19 — Architecture Decision Record Guide

> **Maturity:** 🟢 Enforced — format ADR sudah dipakai konsisten 3 kali dalam pembentukan Engineering Constitution ini sendiri (ADR-000, ADR-001, ADR-002), format ini adalah generalisasi dari pola yang sudah terbukti dipakai, bukan spesifikasi teoretis baru.

**Kedudukan:** Batch 6 — Governance. Menjelaskan format ADR yang dirujuk seluruh Engineering Constitution (mis. [18-never-build-list.md](18-never-build-list.md), [00-principles/00-engineering-principles.md § Amendment Process](../00-principles/00-engineering-principles.md#9-amendment-process)) — file ini adalah panduan penulisan ADR baru, bukan ADR itu sendiri.

---

## 1. Purpose

Menjamin setiap keputusan arsitektur signifikan — yang berdampak luas dan mahal dibalik — punya jejak tertulis tentang alasan, alternatif yang dipertimbangkan, dan konsekuensinya, supaya developer masa depan (manusia atau AI) tidak perlu menebak-nebak "kenapa dulu diputuskan begini" atau mengulang diskusi yang sudah pernah diselesaikan.

## 2. Background

Tiga ADR pertama Engineering Constitution ini sendiri (`adr/ADR-000-batching-strategy.md`, `adr/ADR-001-structure-and-governance-model.md`, `adr/ADR-002-enforcement-levels-and-template.md`) sudah menetapkan pola nyata: setiap ADR menjelaskan masalah, opsi yang dipertimbangkan, keputusan, dan rasional — ditulis **sebelum** eksekusi besar dimulai, bukan didokumentasikan belakangan sebagai formalitas. File ini menggeneralisasi pola tersebut menjadi panduan untuk ADR domain lain di luar pembentukan constitution ini sendiri.

## 3. Principles

1. **ADR ditulis sebelum eksekusi, bukan sebagai laporan setelah selesai.** Nilai utama ADR adalah memaksa pertimbangan alternatif secara sadar sebelum komitmen dibuat — menulisnya belakangan kehilangan nilai ini sepenuhnya.
2. **ADR mendokumentasikan "kenapa," keputusan lain bisa dibaca dari kode.** Detail implementasi tidak perlu diulang di ADR — cukup keputusan, alternatif yang ditolak, dan konsekuensi.
3. **ADR tidak pernah diedit setelah diterima — perubahan pikiran adalah ADR baru yang mensupersede.** Preseden: ADR-000 tidak diedit saat sebagian isinya disupersede ADR-001, melainkan header ADR-000 ditambah catatan "disupersede," dan konten historisnya dipertahankan utuh.

## 4. Mandatory Rules

1. ADR baru **MUST** dibuat sebelum keputusan arsitektur signifikan dieksekusi — signifikan didefinisikan sebagai: mengubah struktur folder/file secara luas, memilih/mengganti library inti, mengubah pattern arsitektur (mis. menambah service terpisah), atau membalikkan item [18-never-build-list.md](18-never-build-list.md).
2. ADR **MUST** menyertakan minimal: (a) masalah/konteks yang mendorong keputusan, (b) opsi yang dipertimbangkan (minimal 2, termasuk "tidak melakukan apa-apa" jika relevan), (c) keputusan final, (d) konsekuensi/trade-off yang diterima sadar.
3. ADR yang sudah diterima **MUST NOT** diedit isinya — perubahan keputusan **MUST** berupa ADR baru yang secara eksplisit menyatakan mensupersede ADR sebelumnya, dengan ADR lama ditambah catatan header (bukan dihapus).
4. ADR **MUST** diberi nomor urut dan judul deskriptif (`ADR-NNN-nama-singkat-keputusan.md`) — **MUST NOT** memakai nomor yang sudah dipakai atau nama yang ambigu.

## 5. Recommended Rules

1. ADR **SHOULD** ditulis dalam waktu yang wajar (bukan proses berminggu-minggu untuk keputusan berukuran sedang) — ADR yang terlalu berat prosesnya justru mendorong orang menghindarinya sepenuhnya.

## 6. Anti-Pattern

**ADR sebagai Laporan Pasca-Fakta** — menulis ADR setelah kode sudah di-merge, sebagai formalitas dokumentasi belaka. Ini kehilangan seluruh nilai ADR sebagai alat mempertimbangkan alternatif sebelum komitmen — pada titik itu, "opsi yang dipertimbangkan" ditulis untuk membenarkan keputusan yang sudah diambil, bukan benar-benar membandingkan alternatif.

**Mengedit ADR Lama untuk "Memperbaiki"** — mengubah isi ADR-001 langsung saat keputusan berubah, alih-alih membuat ADR baru yang mensupersede. Ini merusak nilai historis ADR sebagai catatan *apa yang diputuskan dan kenapa pada waktu itu* — preseden pertama session ini (ADR-000 disupersede sebagian oleh ADR-001) sengaja mempertahankan kedua dokumen.

## 7. Example Good

Preseden nyata dari sesi ini: `ADR-001-structure-and-governance-model.md` dibuat sebagai ADR terpisah yang secara eksplisit menyatakan mensupersede sebagian `ADR-000-batching-strategy.md` — ADR-000 tidak dihapus atau diedit isinya, hanya ditambah catatan header "⚠️ Sebagian di-supersede oleh ADR-001."

## 8. Example Bad

*(Hipotetis)*: mengedit langsung `ADR-000-batching-strategy.md` untuk mengganti struktur folder yang diusulkan menjadi struktur baru ADR-001, tanpa membuat file ADR baru — riwayat keputusan asli (kenapa struktur pertama dipilih, lalu kenapa diubah) hilang sepenuhnya.

## 9. Migration Strategy

N/A — pola sudah 100% konsisten diterapkan sejak ADR pertama Engineering Constitution ini. Berlaku sebagai panduan mengikat untuk ADR domain lain (RLS, library selection, dst.) sejak file ini disahkan.

## 10. Checklist

- [ ] ADR ditulis sebelum eksekusi, bukan setelahnya
- [ ] Menyertakan masalah, minimal 2 opsi dipertimbangkan, keputusan, konsekuensi
- [ ] Tidak mengedit ADR lama — perubahan keputusan adalah ADR baru + catatan supersede
- [ ] Penomoran dan nama file konsisten pola `ADR-NNN-nama-singkat.md`

## 11. Success Metrics

| Metric | Target | Cara Ukur |
|---|---|---|
| Keputusan arsitektur signifikan tanpa ADR | 0 | Audit periodik struktur/library/pattern baru |
| ADR lama yang diedit (bukan disupersede ADR baru) | 0 | Audit `git log` per file ADR |

## 12. References

- `adr/ADR-000-batching-strategy.md`, `adr/ADR-001-structure-and-governance-model.md`, `adr/ADR-002-enforcement-levels-and-template.md` (internal — preseden format)
- [18-never-build-list.md](18-never-build-list.md)
- [00-principles/00-engineering-principles.md § Amendment Process](../00-principles/00-engineering-principles.md#9-amendment-process)

---

*File selanjutnya: [23-dependency-management.md](23-dependency-management.md)*
