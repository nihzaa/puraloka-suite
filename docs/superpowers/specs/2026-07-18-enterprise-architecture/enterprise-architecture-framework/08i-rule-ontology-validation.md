# CECEP — Phase G-D: Rule Ontology Validation

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Gate kecil-tapi-wajib SEBELUM `08c v2` ditulis — bukan discovery baru, melainkan **verifikasi silang** bahwa hasil empat discovery terpisah ([`08d`](08d-rule-taxonomy-discovery.md) Taxonomy, [`08e`](08e-rule-meta-model-discovery.md) Meta Model, [`08f`](08f-rule-storage-philosophy.md) Storage Philosophy, [`08g`](08g-information-classification-discovery.md)/[`08h`](08h-information-characteristic-discovery.md) Information Classification) benar-benar SATU cerita yang konsisten, bukan empat kesimpulan terpisah yang kebetulan tidak saling bertentangan.

**Permintaan founder (verbatim):** *"Lakukan verifikasi bahwa definisi Rule sekarang sudah konsisten dari empat sudut pandang: ontologi (apa itu Rule), informasi (diklasifikasikan sebagai apa), lifecycle (bagaimana Rule hidup dan berubah), serta hubungan dengan Formula dan Five Truth Layers. Jika masih ada kontradiksi atau istilah yang belum final, selesaikan terlebih dahulu. Jika seluruhnya konsisten, nyatakan fondasi Rule siap menjadi dasar `08c v2`."*

**Kenapa ini bernilai tinggi meski kecil:** `08c v2` akan menjadi fondasi seluruh Enterprise Orchestration — kalau ontologi Rule ternyata masih retak di suatu sudut, lebih murah menemukannya SEKARANG (sebelum ratusan Rule instance ditulis) daripada membongkarnya nanti. Ini murni pemeriksaan silang — kalau ditemukan kontradiksi, diperbaiki DI SINI (klarifikasi, bukan ACR baru kecuali kontradiksinya menyentuh baseline yang sudah dikunci), bukan dilempar jadi discovery kelima.

---

## A. Sudut Pandang 1 — Ontologi (Apa Itu Rule?)

**Sumber:** [`08e`](08e-rule-meta-model-discovery.md) § B.

**Kesimpulan yang diverifikasi:** Rule adalah salah satu dari DUA BENTUK **Executable Knowledge Model** — representasi terstruktur (bukan kode) dari pengetahuan operasional perusahaan, dieksekusi langsung oleh Engine generik, diperlakukan sebagai Enterprise Asset penuh (lifecycle/version/testing/audit/explainability). Bentuk satunya adalah Formula (Phase E). Rule tetap berada di Layer 5 (Execution Truth, `04` § 8) — TIDAK naik jadi layer ontologis baru, TIDAK jadi Ontology Object independen ala Palantir.

**Uji konsistensi terhadap dirinya sendiri:** Apakah kesimpulan ini menjawab SEMUA kandidat yang diuji tanpa sisa kontradiksi? Diperiksa ulang tabel `08e` § B — lima kandidat (Configuration/Policy/Executable Model/Decision Model/Enterprise Asset) semuanya dipetakan sebagai DIMENSI PARSIAL dari Executable Knowledge Model, bukan pesaing yang saling meniadakan. **Konsisten — tidak ada sisa kontradiksi internal.**

**Status: STABIL.**

---

## B. Sudut Pandang 2 — Informasi (Rule Diklasifikasikan Sebagai Apa?)

**Sumber:** [`08e`](08e-rule-meta-model-discovery.md) § A.2 (Configuration Data sebagai dimensi parsial) DISANDINGKAN dengan [`08g`](08g-information-classification-discovery.md) § A.11 dan [`08h`](08h-information-characteristic-discovery.md) (dua sumbu Classification × Characteristic, ditulis SETELAH `08e`).

**Ini adalah titik paling berisiko kontradiksi** — `08e` (ditulis sebelum `08g`/`08h` ada) menyimpulkan "Rule = Configuration Data + kekayaan perilaku yang melampauinya". `08g`/`08h` kemudian menemukan bahwa Classification (jenis kebenaran) dan Characteristic (cara dikelola) adalah DUA SUMBU TERPISAH. **Pertanyaan yang harus dijawab di sini: apakah "kekayaan perilaku yang melampaui Configuration" yang disebut `08e` itu sebenarnya cukup dijelaskan sebagai KUMPULAN CHARACTERISTIC (bukan kelas Classification baru)?**

**Diuji, memakai kerangka dua sumbu `08h`:**

| Pertanyaan (kerangka § A `08h`) | Jawaban untuk Rule |
|---|---|
| Apa Classification Rule (sumber kebenaran, cara reproduksi)? | **Configuration Data** ([`08g`](08g-information-classification-discovery.md) § A.11) — Rule adalah aturan yang mengatur PERILAKU sistem, sumber kebenarannya tunggal (versi Rule yang Published), direferensikan bukan disalin. Classification-nya TIDAK berubah dari kesimpulan `08e` § A.2. |
| Apakah Rule Versioned? | Ya | Characteristic: **Versioned** |
| Apakah Rule Historical? | Ya (Lifecycle § J `08a` — Superseded/Deprecated/Archived tetap tersimpan) | Characteristic: **Historical** |
| Apakah Rule Auditable? | Ya (metadata `created_by`/`owner`, `08a` § I) | Characteristic: **Auditable** |
| Apakah Rule Replayable? | Ya — DENGAN CATATAN, lihat § C.2 `08h` (Replay-by-Recompute vs Replay-by-Retrieve) | Characteristic: **Replayable (dua mode, tergantung jenis Rule — lihat § C di bawah)** |
| Apakah Rule Immutable? | Versioned-Immutable — satu versi Rule immutable, versi aktif bisa berpindah (Lifecycle § J) | Characteristic: **Immutable (Versioned-Immutable)** |
| Apakah Rule Testable/Explainable? | Ya (§ R-S Philosophy `08a`) — TAPI ini BUKAN salah satu dari enam Characteristic `08h` | **Lihat temuan di bawah** |

**Temuan kunci (menjawab pertanyaan risiko kontradiksi di atas):** Rule cocok PERSIS pola klaster "Versioned-Immutable" yang ditemukan di `08h` § C.1 (sama seperti Master Data, Knowledge Data, Reference Data) — Classification-nya Configuration Data, Characteristic-nya lima dari enam yang berlaku umum. **Ini MENGONFIRMASI kesimpulan `08e`, bukan membantahnya**: "kekayaan perilaku yang melampaui Configuration murni" yang disebut `08e` SEKARANG punya nama formal — itu adalah GABUNGAN lima Characteristic (`08h` § B) DITAMBAH dua properti yang TIDAK tercakup Characteristic manapun: **Testability** dan **Explainability** (§ R-S `08a`).

**Celah kecil ditemukan (bukan kontradiksi, tapi ketidaklengkapan `08h`):** Testability dan Explainability adalah properti nyata yang dimiliki Rule (dan Formula) tapi TIDAK masuk enam Characteristic `08h`. Diperiksa: apakah keduanya harus jadi Characteristic ke-7/ke-8? **TIDAK** — Testability/Explainability BUKAN karakteristik data secara umum (kelas seperti Master/Transactional tidak punya konsep "Explainability" secara native), keduanya adalah properti KHUSUS Executable Knowledge Model (karena ia dieksekusi, bukan sekadar dibaca). **Kesimpulan: Testability/Explainability adalah properti tambahan spesifik Executable Knowledge Model, di ATAS enam Characteristic umum — bukan celah di `08h` (yang cakupannya memang seluruh 16 Classification, bukan spesifik Rule/Formula), bukan juga kontradiksi.**

**Status: STABIL setelah verifikasi — dengan SATU klarifikasi baru (bukan kontradiksi): Rule = Configuration Data (Classification) + {Versioned, Historical, Auditable, Replayable, Immutable-Versioned} (Characteristic umum) + {Testability, Explainability} (properti tambahan khusus Executable Knowledge Model, bukan bagian taksonomi Characteristic umum).**

---

## C. Sudut Pandang 3 — Lifecycle (Bagaimana Rule Hidup dan Berubah?)

**Sumber:** [`08a`](08a-enterprise-orchestration-philosophy.md) § J (Draft→Testing→Approved→Published→Superseded→Deprecated→Archived) disandingkan dengan [`08e`](08e-rule-meta-model-discovery.md) § C (governance AI Rule) dan [`08f`](08f-rule-storage-philosophy.md) § C (Template/Instance).

**Uji 1 — Apakah Lifecycle tujuh-status konsisten dengan Classification Configuration Data (§ B di atas)?** `08g` § A.11 mendefinisikan Lifecycle Configuration Data sebagai "Draft→Active→Superseded" (tiga status generik). Rule punya TUJUH status yang LEBIH KAYA. **Diperiksa: apakah ini kontradiksi?** TIDAK — tiga status generik `08g` adalah MINIMUM yang berlaku semua Configuration Data; Rule (sebagai Executable Knowledge Model, bentuk KAYA dari Configuration Data) mengembangkan tiga status itu jadi tujuh untuk kebutuhan Testability/Approval yang tidak dimiliki Configuration Data sederhana lain (mis. Precision Rule cukup Draft→Active→Superseded, tidak perlu tahap "Testing" formal). **Konsisten — hierarki spesialisasi, bukan pertentangan.**

**Uji 2 — Apakah Lifecycle konsisten dengan Template/Instance (`08f` § C)?** Diperiksa: pada level MANA Lifecycle berjalan — Template atau Instance? **Jawaban yang harus eksplisit di sini (belum pernah dijawab langsung di `08f` maupun `08a`):** Lifecycle berjalan PADA KEDUANYA, secara independen — Rule Template punya Lifecycle sendiri (Draft→Testing→Approved→Published sebagai TEMPLATE, dipakai basis Instance baru), Rule Instance punya Lifecycle sendiri (Instance bisa Superseded/Deprecated tanpa mempengaruhi Template induknya, dan sebaliknya Template bisa Deprecated tanpa otomatis men-Deprecate semua Instance yang sudah berjalan — konsisten prinsip Versioned-Immutable, § B). **Ini bukan kontradiksi, tapi KLARIFIKASI YANG SEBELUMNYA IMPLISIT** — `08f` tidak eksplisit menyatakan Template dan Instance masing-masing py Lifecycle terpisah. Diperbaiki di sini.

**Uji 3 — Apakah Lifecycle konsisten dengan governance AI Rule (`08e` § C)?** `08e` menyatakan: "AI BOLEH mengusulkan isi Rule Draft, TIDAK BOLEH membuat Rule langsung Published tanpa Approval manusia." Diperiksa terhadap tujuh status § J `08a`: AI menghasilkan Rule pada status **Draft** (dengan `authored_by: ai_proposed`, `08e` § D), lalu WAJIB melalui Testing→Approved (gate manusia) sebelum Published. **Konsisten sempurna — tidak ada celah.**

**Status: STABIL — satu klarifikasi ditambahkan (Template dan Instance masing-masing punya Lifecycle independen), bukan kontradiksi.**

---

## D. Sudut Pandang 4 — Hubungan dengan Formula dan Five Truth Layers

**Sumber:** [`08e`](08e-rule-meta-model-discovery.md) § B (diagram payung) disandingkan dengan [`04`](../CECEP/04-architecture-constitution.md) § 8 (Five Truth Layers) dan Konstitusi Calculation Strategy ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § pembuka poin 6).

**Uji 1 — Apakah Rule dan Formula, sebagai "dua bentuk yang sama", tetap menghormati batas bahwa HANYA CAP-006 boleh menghitung?** Diperiksa: Rule TIDAK PERNAH menghitung nilai (action-nya "memanggil Capability", `08a` § D) — Formula-lah yang menghitung, dan Formula HANYA dieksekusi oleh CAP-006 (`06` § N). **Konsisten** — "dua bentuk dari kategori yang sama" berarti sama secara STRUKTUR EKSEKUSI (Executable Model, `08e` § A.6), BUKAN sama secara WEWENANG. Rule mengorkestrasi KAPAN Formula dipanggil; Formula-lah yang menghitung. Ini justru MENEGASKAN ulang Konstitusi, bukan mengancamnya.

**Uji 2 — Apakah Rule tetap di Layer 5 meski sekarang "setara" Formula yang berada... di layer mana sebenarnya?** Diperiksa: Formula bukan penghuni Layer 5 murni — Formula MENERAPKAN Calculation Truth (Layer 3, `04` § 8) tapi EKSEKUSINYA (runtime) juga bagian Layer 5 (Execution Truth mengonsumsi Layer 2-4, tidak pernah menciptakan truth baru). **Ini titik paling halus dalam verifikasi ini**: apakah Formula "berada" di Layer 3 (karena ISI-nya, definisi kalkulasi, adalah Calculation Truth) atau Layer 5 (karena EKSEKUSI-nya adalah Execution Truth)? **Jawaban yang harus eksplisit:** Formula DEFINITION (struktur AST-nya, `06` § A.4) adalah artefak Layer 3 (Calculation Truth — "bagaimana cara menghitung X" adalah keputusan Calculation Layer). Formula EXECUTION (saat Engine menjalankannya untuk satu Estimate Version tertentu) adalah peristiwa Layer 5. **Rule murni Layer 5 dari awal sampai akhir** — Rule TIDAK PERNAH mendefinisikan "bagaimana menghitung" (itu selalu didelegasikan ke Formula/Capability), Rule HANYA mendefinisikan "kapan dan apa yang dipanggil". **Ini perbedaan struktural nyata antara Rule dan Formula yang perlu eksplisit:** Formula punya jejak di DUA layer (definisi=Layer 3, eksekusi=Layer 5), Rule HANYA punya jejak di SATU layer (Layer 5 saja). **Payung Executable Knowledge Model (`08e` § B) tetap valid** — ia menyatukan CARA keduanya dieksekusi (Layer 5, Engine generik), BUKAN mengklaim keduanya menghuni layer yang sama sepenuhnya. Diagram `08e` § B perlu SATU catatan tambahan (bukan revisi struktural) untuk menjelaskan ini eksplisit — lihat § E.

**Uji 3 — Apakah pembeda Replay-by-Recompute vs Replay-by-Retrieve (`08h` § C.2) konsisten diterapkan ke Rule dan Formula?** Diperiksa:
- **Formula**: SELALU Replay-by-Recompute — menjalankan ulang Formula yang sama dengan input yang sama (Estimate Version immutable) WAJIB menghasilkan hasil identik (`06` Determinism).
- **Rule**: BERGANTUNG jenisnya (`08d` Taxonomy) — Rule yang action-nya memanggil Capability MURNI internal (mis. Rule Notifikasi) adalah Replay-by-Recompute. Rule yang action-nya memanggil CAP-013/Integration Gateway (Rule-001/002/003, Computed Data via Integration per `08f` § H) adalah Replay-by-Retrieve — HASIL eksekusinya (Computed Data) yang di-Replay, BUKAN proses Rule-nya yang dijalankan ulang.

**Ini KONSISTEN dan justru MENJELASKAN dengan presisi lebih tinggi kenapa `08f` § H benar membedakan Kategori 1 (Lazy/Recompute) dan Kategori 2 (Eager/Retrieve)** — pembeda `08h` § C.2 (ditemukan setelah `08f` ditulis) adalah PENJELASAN MEKANISTIK dari keputusan yang `08f` sudah ambil secara benar berdasarkan intuisi Information Classification. Dua dokumen yang ditulis terpisah, dengan alasan independen, tiba di kesimpulan yang SAMA — sinyal kuat bahwa keduanya benar, bukan kebetulan.

**Status: STABIL — satu klarifikasi struktural penting ditambahkan (Formula punya jejak di Layer 3 dan 5, Rule hanya Layer 5), bukan kontradiksi, memperkuat presisi model.**

---

## E. Konsolidasi — Satu Model Rule yang Utuh

```
Rule (Orchestration Rule)
│
├─ Ontologi:        Bentuk Executable Knowledge Model (bersama Formula)
│                    — representasi non-kode, dieksekusi Engine generik,
│                    Enterprise Asset penuh. TETAP Layer 5 murni (berbeda
│                    dari Formula yang punya jejak Layer 3 + Layer 5).
│
├─ Informasi:       Classification = Configuration Data
│                    Characteristic = {Versioned, Historical, Auditable,
│                    Replayable (mode tergantung jenis action — Recompute
│                    untuk action internal, Retrieve untuk action via
│                    CAP-013), Immutable (Versioned-Immutable)}
│                    + properti tambahan khusus Executable Knowledge Model:
│                    {Testability, Explainability} (di luar enam
│                    Characteristic umum, karena Rule dieksekusi bukan
│                    sekadar dibaca)
│
├─ Lifecycle:       Draft→Testing→Approved→Published→Superseded→
│                    Deprecated→Archived — berjalan INDEPENDEN di level
│                    Template maupun Instance (masing-masing py rangkaian
│                    status sendiri, `08f` § C)
│
└─ Hubungan:        - Dengan Formula: sama-sama Executable Knowledge Model,
                       TAPI Rule tidak pernah menghitung (hanya memanggil),
                       Formula-lah yang menghitung (via CAP-006 saja, `06` § N)
                     - Dengan Five Truth Layers: Rule murni Layer 5, tidak
                       pernah menciptakan truth baru, hanya mengonsumsi
                       Layer 2-4 (`04` § 8)
```

**Tidak ditemukan kontradiksi yang menyentuh baseline manapun yang sudah dikunci** (Five Truth Layers, Konstitusi Calculation Strategy, Progressive Freeze Chain semuanya tetap utuh). Tiga klarifikasi ditemukan dan diselesaikan LANGSUNG di dokumen ini (§ B, § C, § D) — semuanya bersifat MEMPERTAJAM istilah yang sebelumnya implisit, tidak satu pun mengubah keputusan yang sudah diambil di `08d`/`08e`/`08f`.

---

## Assumptions

1. Pemisahan Testability/Explainability sebagai "properti tambahan khusus Executable Knowledge Model" (§ B) di luar enam Characteristic `08h` adalah keputusan yang diambil DI SINI (bukan hasil `08h` sebelumnya) — kalau founder menilai keduanya sebenarnya layak jadi Characteristic ke-7/ke-8 yang berlaku umum (bukan khusus Rule/Formula), `08h` perlu direvisi ringan untuk menambahkannya.
2. Klarifikasi "Formula py jejak Layer 3 DAN Layer 5, Rule hanya Layer 5" (§ D) adalah interpretasi baru yang belum pernah dinyatakan eksplisit di `04` maupun `06` — konsisten dengan semua keputusan yang sudah dikunci, tapi ini PENAJAMAN, bukan sesuatu yang sudah pernah divalidasi eksplisit sebelumnya oleh founder.

## Open Questions

1. Apakah pemisahan Testability/Explainability sebagai properti khusus Executable Knowledge Model (bukan Characteristic umum) sudah sesuai maksud, atau founder ingin `08h` direvisi untuk memasukkannya sebagai Characteristic ke-7/ke-8?
2. Apakah klarifikasi Formula (Layer 3 + Layer 5) vs Rule (Layer 5 murni) (§ D Uji 2) cukup penting untuk ditambahkan sebagai catatan resmi di `04-architecture-constitution.md` § 8, mengingat ini pertama kalinya perbedaan itu dinyatakan eksplisit?

## Status

**Validasi selesai — FONDASI RULE DINYATAKAN SIAP menjadi dasar `08c v2`.** Keempat sudut pandang (Ontologi, Informasi, Lifecycle, Hubungan dengan Formula/Five Truth Layers) diperiksa silang dan ditemukan KONSISTEN — tiga klarifikasi ditemukan (properti Testability/Explainability di luar Characteristic umum; Template dan Instance masing-masing py Lifecycle independen; Formula berjejak di dua layer sementara Rule hanya satu) dan semuanya diselesaikan langsung di dokumen ini tanpa menyentuh baseline yang sudah dikunci — TIDAK ada kontradiksi yang memerlukan ACR atau discovery kelima. `08c` (ditahan) boleh mulai ditulis ulang sebagai `08c v2` di atas fondasi `08d` (Taxonomy) → `08e` (Meta Model) → `08f` (Storage Philosophy) → `08g`/`08h` (Information Classification/Characteristic) → `08i` (Ontology Validation, dokumen ini) — rantai discovery yang sekarang lengkap dan saling menguatkan.
