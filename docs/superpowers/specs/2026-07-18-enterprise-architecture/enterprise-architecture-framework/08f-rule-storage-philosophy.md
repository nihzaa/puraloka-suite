# CECEP — Phase G-C: Rule Storage Philosophy & Reuse Strategy

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Discovery ketiga dan terakhir sebelum Rule Design dilanjutkan, melengkapi [`08d`](08d-rule-taxonomy-discovery.md) (Taxonomy) dan [`08e`](08e-rule-meta-model-discovery.md) (Meta Model). Menjawab dua pertanyaan tersisa dari koreksi Momentum Bias: **(1)** apakah CECEP punya `Rule → Rule → Rule` (daftar datar) atau `Rule Family → Rule Template → Rule Instance` (hierarki reuse) — supaya tidak terjadi ledakan duplikasi begitu ratusan perusahaan/proyek butuh Rule serupa dengan parameter berbeda; **(2)** apakah keputusan Hybrid lazy/eager ([`08c`](08c-orchestration-rule-design.md) § D, ditahan) sah, dengan lebih dulu menjawab **apa itu Derived Read Model** secara tepat — bukan langsung memilih lazy/eager tanpa definisi itu jelas.

---

## Bagian Satu — Rule Family, Template, Instance (Reuse Strategy)

### A. Pertanyaan Inti

**Skenario uji dari founder:** "Generate Procurement" di Perusahaan A dan "Generate Procurement" di Perusahaan B — apakah itu DUA Rule terpisah, atau SATU Template dengan parameter berbeda?

### B. Diuji Terhadap Rule Scope yang Sudah Dikunci

**Rule Scope ([`08a`](08a-enterprise-orchestration-philosophy.md) § Q) SUDAH punya empat level: Template Rule (Reference/National) → Company Rule → Project Rule → Scenario/Estimate Rule.** Nama level PALING ATAS SUDAH "Template Rule" — ini SINYAL bahwa jawaban pertanyaan founder SEBAGIAN sudah tersirat di Philosophy, tapi BELUM eksplisit dijelaskan MEKANISME reuse-nya (Scope Philosophy menjawab "di level mana Rule berlaku", bukan "bagaimana Rule di level bawah MEWARISI Rule di level atas").

**Diperiksa dalam:** Apakah Scope Resolution yang sudah ada (`08a` § Q, "Rule paling spesifik yang cocok dengan konteks eksekusi MENANG") CUKUP menjawab pertanyaan founder, atau butuh mekanisme TAMBAHAN?

**Jawaban: BUTUH tambahan.** Scope Resolution (§ Q) menjawab "Rule MANA yang menang kalau ada konflik antar level" — pertanyaan SELEKSI. Founder bertanya soal STRUKTUR PENCIPTAAN — "apakah Company B HARUS menulis ulang seluruh Rule dari nol, atau MEWARISI dari Template lalu hanya mengubah parameter". Dua pertanyaan berbeda, keduanya perlu dijawab.

### C. Keputusan — Rule Family, Rule Template, Rule Instance sebagai Tiga Konsep Berlapis

```
Rule Family {
  Kumpulan Rule yang menjawab TUJUAN BISNIS yang sama, lintas perusahaan/proyek.
  Contoh: "Estimate Approval → Procurement Generation Family"
  BUKAN Aggregate Root baru — murni pengelompokan konseptual (mirip `category`
  yang sudah ada di § I Philosophy, tapi levelnya LEBIH TINGGI — category
  mengelompokkan Rule individual, Family mengelompokkan Template LINTAS Scope)
}

Rule Template {
  SATU definisi Rule LENGKAP (trigger/condition/action/failure_policy) di level
  Template Rule Scope (`08a` § Q) — dengan bagian tertentu dari `condition`/`action`
  ditandai sebagai PARAMETER (bukan nilai tetap).
  Contoh: Template "Generate Procurement" punya parameter {budget_threshold,
  target_system} — nilai defaultnya dari AHSP Nasional/praktik umum.
}

Rule Instance {
  Rule Template YANG SUDAH DIISI parameternya untuk Company/Project/Scenario
  tertentu (Scope Resolution, `08a` § Q) — INI yang punya `id` unik dan
  benar-benar Published/dieksekusi (`08a` § I-J).
  Contoh: "Generate Procurement" versi Company A (budget_threshold=500jt)
  dan versi Company B (budget_threshold=1M) adalah DUA Instance dari SATU
  Template yang sama.
}
```

**Menjawab pertanyaan founder secara langsung:** "Generate Procurement" di Perusahaan A dan B adalah **DUA Rule Instance dari SATU Rule Template yang sama** — BUKAN dua Rule independen yang kebetulan mirip, BUKAN satu Rule dengan logic if-else internal untuk membedakan perusahaan (itu akan melanggar § D Philosophy — Rule tidak boleh menghardcode perbedaan kebijakan sebagai kondisi internal, harus lewat Scope). Prinsip **Everything is Derived** ([`04`](../CECEP/04-architecture-constitution.md) § 1) diterapkan ke Rule: Instance DITURUNKAN dari Template, tidak ditulis ulang dari nol.

### D. Dampak ke Struktur Rule (§ I Philosophy + Perluasan § D Meta Model)

```
Rule Template menambahkan field:
  is_template:      boolean — true kalau ini Template (bukan Instance siap eksekusi)
  parameters:        daftar nama parameter yang boleh diisi Instance turunannya
  family:            Rule Family yang menaunginya (opsional, untuk navigasi/Visualization,
                      pola sama dengan `category`, `08a` § I)

Rule Instance menambahkan field:
  derived_from_template: Rule Template ID — WAJIB kalau Instance ini bukan Rule
                          mandiri (Business Rule sederhana boleh TIDAK punya Template,
                          langsung jadi Instance berdiri sendiri — Template OPSIONAL,
                          bukan wajib untuk SEMUA Rule)
  parameter_values:      nilai konkret untuk parameter Template
```

**Kenapa Template OPSIONAL, bukan wajib untuk semua Rule:** Rule sederhana yang HANYA dipakai satu Company/Project (mis. kebijakan sangat spesifik yang tidak akan pernah dipakai ulang) TIDAK PERLU dipaksa punya Template — memaksa Template untuk semua Rule akan menciptakan birokrasi berlebihan untuk kasus yang tidak butuh reuse. Template dipakai KETIKA reuse benar-benar terjadi/diantisipasi, bukan default wajib.

### E. Verifikasi Terhadap Rule-001 s.d. Rule-004 (`08c`, Ditahan)

**Diperiksa ulang:** Apakah keempat Rule yang sudah ditulis di `08c` valid dalam kerangka Family/Template/Instance ini?

| Rule | Klasifikasi |
|---|---|
| Rule-001 (RAP Draft) | Instance TANPA Template (`derived_from_template: null`) — spesifik Puraloka Persada, belum tentu dipakai perusahaan lain dengan bentuk sama, TIDAK perlu dipaksa Template sekarang |
| Rule-002 (Material Requirement Draft) | Sama — Instance tanpa Template, boleh naik jadi Template nanti kalau CECEP dipakai multi-company dan pola ini terbukti terpakai ulang |
| Rule-003 (Cashflow Baseline) | Sama |
| Rule-004 (Notifikasi) | **Kandidat KUAT jadi Template** — pola "notifikasi setelah event X" hampir pasti terpakai ulang lintas banyak event, bukan cuma `EstimateVersionApproved` — DICATAT sebagai rekomendasi, bukan keputusan wajib sekarang |

**Kesimpulan:** Keempat Rule di `08c` TETAP VALID setelah kerangka ini — tidak perlu ditulis ulang, hanya diberi nilai `derived_from_template: null` (mereka adalah Instance mandiri, bukan cacat desain).

---

## Bagian Dua — Derived Read Model Philosophy (Sebelum Lazy/Eager/Hybrid)

### F. Pertanyaan Inti

**Koreksi founder:** Pertanyaan yang benar bukan "Lazy atau Eager?" — pertanyaan yang benar adalah **"Apa sebenarnya Derived Read Model itu?"** Kalau definisinya belum benar, Hybrid ([`08c`](08c-orchestration-rule-design.md) § D, ditahan) juga belum tentu benar.

### G. Definisi yang Sudah Ada (Diperiksa Ulang, Bukan Diterima Begitu Saja)

**Dari Phase F ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § A):** Derived Data = data yang BISA dihitung ulang kapan saja dari sumbernya, TIDAK PERNAH disimpan sebagai sumber kebenaran independen. Contoh yang sudah dikunci: RAB, RAP, Budget, Cashflow Baseline, EVM Baseline.

**Diperiksa dalam — apakah SEMUA lima contoh ini benar-benar SATU kategori yang sama?**

| Read-Model | Diperiksa: Benar-Benar "Bisa Dihitung Ulang Kapan Saja"? |
|---|---|
| RAB | ✅ Ya — murni agregasi Estimate Item, dihitung ulang instan kapan pun diminta, tidak bergantung sistem eksternal |
| RAP | 🟡 **Diperiksa dalam** — RAP "Draft" (dari Rule-001, `08c`) hasilnya BUKAN murni agregasi Estimate Item — ia HASIL TRANSFORMASI lewat CAP-013 (Integration Gateway) ke sistem existing. Apakah hasil transformasi lintas-sistem MASIH "bisa dihitung ulang kapan saja dengan hasil SAMA"? Bergantung Determinism CAP-013 (`08a` § M) — TAPI CAP-013 memanggil sistem EKSTERNAL yang state-nya bisa berubah independen. **Ini adalah CELAH DEFINISI yang baru ditemukan**: RAP Draft SEBENARNYA bukan Derived Data murni dalam pengertian Phase F — ia lebih dekat ke **Computed Data** ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § A — "snapshot hasil SATU eksekusi tertentu, TIDAK BISA dihitung ulang jadi hal yang sama tanpa mengulang PERSIS konteks") |
| Material Requirement Draft | 🟡 Sama seperti RAP — hasil transformasi lintas-sistem via CAP-013, lebih dekat Computed Data |
| Cashflow Baseline | 🟡 Sama |
| EVM Baseline | ✅ Ya — murni turunan dari Estimate Version + Actual Cost yang SEMUANYA sudah di dalam CECEP, tidak melibatkan transformasi lintas-sistem |

### H. Temuan — Dua Kategori Read-Model yang Berbeda, Bukan Satu

**Ini jawaban SEBENARNYA atas kritik founder — definisi yang salah menghasilkan keputusan Hybrid yang TIDAK BENAR-BENAR TEPAT sebelumnya:**

```
Kategori 1 — TRUE Derived Data (murni internal CECEP)
  RAB, EVM Baseline — dihitung ulang kapan saja, TIDAK PERNAH melibatkan sistem
  eksternal, hasilnya SELALU identik untuk Estimate Version yang sama.
  → LAZY adalah SATU-SATUNYA jawaban yang benar secara definisi — Eager
    untuk kategori ini akan melanggar prinsip "Derived Data tidak boleh
    disimpan sebagai sumber kebenaran independen" (Cache boleh, tapi
    Cache ≠ proses orkestrasi eksplisit yang "membangkitkan")

Kategori 2 — Computed Data via Integration (hasil transformasi lintas-sistem)
  RAP Draft, Material Requirement Draft, Cashflow Baseline — BUKAN Derived
  Data dalam pengertian Phase F, karena melibatkan CAP-013 yang menyentuh
  state EKSTERNAL. Ini SNAPSHOT hasil satu eksekusi Rule pada satu titik
  waktu (persis definisi Computed Data, `07` § A — sama kategori dengan
  Explanation Tree).
  → EAGER (via Rule Orchestration eksplisit) adalah jawaban yang BENAR
    secara definisi, KARENA computed data MEMANG harus "dibangkitkan"
    lewat satu eksekusi tertentu — bukan sekadar dipilih karena "butuh
    segera", tapi karena SIFAT DATANYA sendiri menuntut itu
```

### I. Revisi Kesimpulan `08c` § D

**Kesimpulan lama (`08c`, ditahan):** "Hybrid — dibedakan oleh KESEGERAAN kebutuhan operasional."

**Kesimpulan baru (setelah definisi diperbaiki):** **Hybrid TETAP jawaban yang benar — TAPI alasannya BUKAN kesegeraan operasional (subjektif, bisa keliru), melainkan KATEGORI DATA yang berbeda secara ontologis (objektif, konsisten Information Classification § A Phase F):**

- **RAB, EVM Baseline** → **Lazy**, KARENA mereka TRUE Derived Data (definisi Phase F, tidak melibatkan sistem eksternal).
- **RAP Draft, Material Requirement Draft, Cashflow Baseline** → **Eager**, KARENA mereka Computed Data via Integration (definisi Phase F, snapshot hasil eksekusi Rule, BUKAN Derived Data murni) — bukan karena "segera dibutuhkan" (alasan subjektif lama), tapi karena SIFAT DATANYA menuntut proses eksekusi eksplisit untuk ada sama sekali.

**Kenapa perbedaan alasan ini penting (bukan sekadar kosmetik):** Alasan lama ("kesegeraan operasional") adalah penilaian SUBJEKTIF yang bisa berubah tanpa mengubah sifat data itu sendiri (mis. kalau nanti RAP dianggap "tidak segera dibutuhkan", kesimpulan lama akan berubah jadi Lazy — padahal itu SALAH karena RAP Draft tetap Computed Data via Integration, sifatnya tidak berubah). Alasan baru (kategori data) adalah properti STRUKTURAL yang stabil — tidak berubah karena preferensi operasional berubah.

---

## Assumptions

1. Klasifikasi RAP Draft/Material Requirement Draft/Cashflow Baseline sebagai Computed Data (bukan Derived Data) bergantung pada asumsi bahwa CAP-013 (Integration Gateway) SELALU melibatkan state eksternal yang tidak dijamin deterministik penuh — kalau Phase H (Integration, hasil relabel) nanti membuktikan CAP-013 bisa dibuat deterministik penuh (mis. sistem existing di-snapshot sebelum ditransformasi), klasifikasi ini perlu ditinjau ulang.
2. Rule Family sebagai konsep murni pengelompokan (bukan Aggregate Root) diasumsikan cukup — kalau kebutuhan nyata muncul untuk Family py atribut sendiri (bukan cuma label), ini perlu direvisi jadi Aggregate Root baru (ACR terhadap kesimpulan § C).

## Open Questions

1. Apakah kerangka Family→Template→Instance (§ C) sudah cukup, atau founder membayangkan level tambahan (mis. "Industry Template" di atas "Template Rule" untuk lintas-industri, bukan hanya lintas-company)?
2. Apakah klasifikasi ulang RAP/MR/Cashflow sebagai Computed Data (bukan Derived Data, § H) mengharuskan koreksi balik ke Phase F (dokumen `07`, yang sebelumnya menyebut Cashflow Baseline sebagai contoh Derived Data) — apakah ini perlu jadi ACR formal terhadap Phase F, atau cukup dicatat sebagai klarifikasi di sini karena Phase F sendiri tidak eksplisit menyatakan SEMUA lima contoh itu murni internal (celah interpretasi, bukan pelanggaran)?

## Status

**Discovery selesai — dua pertanyaan founder terjawab tuntas, bukan dijawab prematur seperti sebelumnya.** Rule Family/Template/Instance dikunci sebagai kerangka reuse (Template opsional, bukan wajib). Derived Read Model direvisi: BUKAN satu kategori seragam — RAB/EVM adalah True Derived Data (Lazy, alasan definisional), RAP/MR/Cashflow adalah Computed Data via Integration (Eager, alasan definisional) — kesimpulan Hybrid TETAP BENAR tapi dengan alasan yang JAUH lebih kokoh dari sebelumnya. Rule-001 s.d. Rule-004 (`08c`, ditahan) diverifikasi TETAP VALID dalam kerangka baru ini. **Ketiga discovery (Taxonomy, Meta Model, Storage Philosophy) selesai — Rule Design ([`08c`](08c-orchestration-rule-design.md)) sekarang boleh ditulis ulang di atas fondasi yang lebih matang.**
