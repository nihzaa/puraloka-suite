# CECEP — Phase 6: Derive Domain Model

**Mode:** Architecture Derivation Mode (`40`/`41`). `03b` adalah Discovery Complete — EVIDENCE, bukan hasil akhir yang disalin. Setiap Aggregate Root di bawah diturunkan eksplisit lewat urutan wajib: **Capability → Interaction → Business Responsibility → Aggregate Root → Entity → Value Object** (`40` § Perbaikan Urutan Fase 6), bukan disalin langsung dari tabel `03b`.
**Evidence dipakai:** `03b` (Discovery Complete, 13 Confirmed Domain), `35` (Capability, Frozen), `37` (Interaction Map, Frozen), `42` (Calculation Strategy, sudah Freeze — dipakai sebagai evidence Level 5/6 untuk domain yang bersinggungan).

## Derivation Summary

```
This document introduces:
- 0 new business concepts
- 13 domains re-derived with explicit Business Responsibility (evidence: 03b)
- 2 open items resolved (RAP Risk Register form, Fallback UX mechanism)

Every concept below is derived from previously frozen artifacts.
No new discovery is performed in this phase.
```

---

## Business Uncertainty — Before

Sebelum dokumen ini: 13 domain di `03b` punya jawaban DDD lengkap (Aggregate Root/Entity/Lifecycle), tapi TIDAK ADA satu pun yang secara eksplisit menyebut **kenapa** ia menjadi Aggregate Root — alasan itu tersirat, tersebar, dan (untuk sebagian domain) hanya disimpulkan dari pola, bukan dinyatakan sebagai satu kalimat tanggung jawab bisnis. Direktur konstruksi yang bertanya "kenapa Estimate Version bukan Estimate Item yang jadi root?" akan mendapat jawaban implisit dari struktur tabel, bukan argumen langsung.

---

## Tiga Belas Domain — Diturunkan Eksplisit

Format per domain: **Business Responsibility** (kalimat tunggal, alasan kelompok data ini harus konsisten dijaga bersama) → **Aggregate Root** → **Trace Status**.

### 1. Cost Code

**Business Responsibility:** *"Satu pekerjaan generik harus punya SATU identitas yang dikenali sama persis oleh 17 domain berbeda — kalau identitas itu boleh berbeda-beda per domain, angka RAB tidak akan pernah bisa ditemukan lagi di Procurement/Progress/EVM."*
**Aggregate Root:** Cost Code Registry (`03b` § A.3 — SATU per perusahaan).
```
Level 1-3 ✓ (01 §Kesimpulan §7 traceability jadi tujuan eksplisit)
Level 4 Capability ✓ (35: Shared Kernel lintas hampir semua capability)
Level 5 Interaction ✓ (37: "Cost Code" disebut sebagai titik temu WBS+CBS)
Level 6 Business Responsibility ✓ (di atas — konsekuensi tak terhindarkan dari
  requirement traceability lintas 17 domain, 02 §6)
Trace Status: ✓ Fully Derived
```

### 2. RBS (Resource Identity)

**Business Responsibility:** *"Tukang Besi yang dirujuk Assembly harus jadi entitas yang SAMA PERSIS dengan Tukang Besi yang dirujuk Payroll — kalau tidak, No Data Duplication (Constraint #4) tidak mungkin ditegakkan."*
**Aggregate Root:** RBS Registry (`03b` § A.5).
```
Level 4 Capability ✓ (35 #5 Resource Identity, cakupan dipersempit pasca-ACR-004)
Level 5 Interaction ✓ (37 §5: node pusat kedua context map)
Level 6 ✓ — necessity langsung dari No Data Duplication (02 Constraint #4)
Trace Status: ✓ Fully Derived
```

### 3. CBS (Cost Breakdown Structure)

**Business Responsibility:** *"Biaya harus bisa dikelompokkan untuk analisis TANPA mengasumsikan struktur pekerjaan (Building punya lantai, Civil tidak) — kalau CBS dipaksa jadi Aggregate Root untuk Estimate Item, restrukturisasi kategori akan merusak Estimate Item yang sudah ada."*
**Aggregate Root:** Company CBS Template (Standard CBS = bootstrap eksternal, Project CBS = snapshot, bukan root baru).
```
Level 4 ✓ (35: bagian Assembly Library/RAB Builder Interaction)
Level 5 ✓ (37: CBS Node → referensi → Cost Code)
Level 6 ✓ — `03b` § A.2 sudah eksplisit: "CBS BUKAN Aggregate Root untuk Estimate
  Item — kalau dipaksakan, Estimate Item tidak bisa hidup independen dari
  restrukturisasi CBS" — argumen necessity, bukan sekadar pilihan desain
Trace Status: ✓ Fully Derived
```

### 4. Assembly/AHSP (Capability #2, pasca-ACR-004)

**Business Responsibility:** *"Sequence kerja, resource requirement, dan waste factor satu metode kerja harus berubah BERSAMA sebagai satu paket — kalau resource-nya diedit terpisah dari sequence-nya, paket itu bisa jadi tidak konsisten (mis. resource berubah tapi durasi tidak ikut disesuaikan)."*
**Aggregate Root:** Assembly (empat sumber AHSP sebagai instance, bukan root terpisah — dikonfirmasi ulang di `42` § Empat Sumber AHSP).
```
Level 4 ✓ (35 #2, Frozen pasca-ACR-004: AHSP+Assembly satu capability)
Level 5 ✓ (37 §2: Input Reference Library/RBS/Formula, Output Assembly siap pakai)
Level 6 ✓ (03b §A.4: "AHSP nasional/company adalah SATU jenis Assembly" —
  necessity dari Prinsip Final #6, Calculation Strategy plug-in)
Trace Status: ✓ Fully Derived
```

### 5. Versioned Price Book

**Business Responsibility:** *"Harga adalah knowledge, bukan angka (02 §4) — satu baris harga di satu lokasi pada satu waktu harus immutable begitu terpakai, supaya Estimate Item lama tidak berubah retroaktif saat harga baru masuk."*
**Aggregate Root:** Price Book Entry — per-entry root, BUKAN Price Book sebagai satu entity besar.
```
Level 6 ✓ — `03b` § A.6 eksplisit: "bukan Price Book sebagai satu entity besar;
  konsekuensi LANGSUNG Foundational Principle Ketiga" — kata "konsekuensi
  langsung" di sumber sendiri adalah pengakuan derivasi logis, bukan tekstual
Trace Status: ✓ Fully Derived
```

### 6. Productivity Library

**Business Responsibility:** *"Produktivitas melekat pada KOMBINASI resource+jenis pekerjaan (bukan resource sendirian) — kalau satu Resource hanya punya satu angka produktivitas tunggal, perbedaan produktivitas Tukang Besi untuk pembesian vs untuk bekisting tidak akan pernah tertangkap."*
**Aggregate Root:** Productivity Record (RBS entry + Cost Code + versi).
```
Level 6 ✓ (03b §A.6b eksplisit menyebut kombinasi ini sebagai alasan Aggregate
  Root-nya, bukan Resource langsung)
Trace Status: ✓ Fully Derived
```

### 7. Formula Engine

**Business Responsibility:** *"Cara menghitung harus jadi data yang bisa diedit user tanpa deploy kode baru (Greenfield Adoption, 01) — kalau formula tertanam di Assembly, setiap standar AHSP baru butuh perubahan struktur Assembly, bukan sekadar entri baru."*
**Required Business Mechanism:** ⚠️ **KOREKSI** (semula ditulis "Aggregate Root: Formula Definition (Domain Service generik...)" — kontradiksi terminologi; sempat diperbaiki jadi "Derived Structure" lalu direvisi lagi ke istilah final "Required Business Mechanism", `40` § Rule 6 — kedua koreksi dibiarkan sebagai jejak). Mekanisme minimum yang genuinely dibutuhkan: **Formula Engine adalah Domain Service** (perilaku murni, dipanggil lintas domain, tanpa identitas/state sendiri); **Formula Definition** di dalamnya adalah Entity (punya identitas+versi) yang dikonsumsi Domain Service itu — bukan satu "Aggregate Root" tunggal, dan bukan hasil dari mencocokkan ke kategori DDD mana pun.
```
Level 6 ✓ — necessity langsung dari requirement "without requiring schema
  changes or source-code modifications" (01 §Greenfield Adoption, verbatim)
Trace Status: ✓ Fully Derived
```

### 8. Unit Conversion Engine

**Business Responsibility:** *"Konversi satuan fisik (kg→ton) adalah fakta matematis universal, bukan pengetahuan perusahaan yang berkembang — memaksanya versioned sama seperti Price Book akan melanggar prinsip 'pertimbangkan dulu, jangan default wajib' (Foundational Principle Ketiga)."*
**Required Business Mechanism:** ⚠️ **KOREKSI** (semula ditulis "Aggregate Root: Conversion Rule (Value Object, bukan Entity)" — kontradiksi terminologi langsung; sempat diperbaiki jadi "Derived Structure" lalu direvisi lagi ke istilah final "Required Business Mechanism", `40` § Rule 6 — kedua koreksi dibiarkan sebagai jejak). Mekanisme minimum yang genuinely dibutuhkan: **Conversion Rule adalah Value Object murni** — `(satuan_asal, satuan_tujuan, rasio)`, tidak butuh identitas atau riwayat sendiri. **Tidak ada Aggregate Root di domain ini** — Unit Conversion Engine (Domain Service) memanggil Conversion Rule langsung sebagai nilai, tanpa root yang menaunginya, dan tanpa perlu dicocokkan ke kategori DDD resmi mana pun.
```
Level 6 ✓ — `03b` §A.8 eksplisit menyebut ini "contoh konkret di mana
  'pertimbangkan versioning dulu' SAH menghasilkan jawaban tidak perlu" — satu
  dari sedikit tempat requirement generik (Everything is Versioned) punya
  pengecualian yang didukung argumen, bukan diabaikan diam-diam
Trace Status: ✓ Fully Derived
```

### 9-11. Estimate Item / Estimate Version / Scenario (Estimate Aggregate Chain)

**Business Responsibility (Scenario):** *"Satu Project bisa punya banyak jalur estimasi paralel yang harus dibandingkan apple-to-apple (Multi-Scenario, 02 §12) — kalau Scenario A dan B punya struktur CBS/Cost Code berbeda, perbandingannya tidak valid."*
**Business Responsibility (Estimate Version):** *"Perubahan pada satu Estimate Item harus lewat Estimate Version yang menaunginya, supaya total biaya dan status approval tetap konsisten — edit langsung ke satu baris akan merusak invariant itu."* (`03b` § Aggregate Root, kutipan hampir verbatim.)
**Business Responsibility (Estimate Item):** *"Satu angka biaya adalah hasil pertemuan Cost Code+Assembly+CBS+WBS — ia hanya bermakna DI DALAM konteks satu Estimate Version, tidak sah berdiri sendiri."*
**Aggregate Root:** Scenario (root) → Estimate Version (root, dimiliki Scenario) → Estimate Item (child entity, BUKAN root).
```
Level 4 ✓ (35 #1 Tender Estimation, #9/#10 RAB/RAP Builder — semua mengonsumsi
  hierarki ini)
Level 5 ✓ (37 §1/§3/§4: Estimate Version sbg Output eksplisit tiga capability)
Level 6 ✓ (kutipan langsung 03b + necessity dari Prinsip Final #3 Explainable/
  Traceable/Versioned/Reproducible)
Trace Status: ✓ Fully Derived — tiga domain ini, sesuai `41` Contoh 1, adalah
  contoh derivasi terkuat di seluruh dokumen.
```

### 12. Estimation Workflow & Configurable Approval Workflow

**Business Responsibility:** *"Jangan hardcode siapa yang menjadi validator — kalau validator ditulis sebagai role tetap di kode, Greenfield Adoption gagal (perusahaan kecil dan besar butuh approval chain berbeda tanpa migrasi skema)."* (`02` § 10, hampir verbatim.)
**Aggregate Root:** Approval Chain Definition (7 dimensi: Company/Branch/Project Type/Contract Value/Estimate Type/Cost Threshold/Risk Level).
```
Level 6 ✓ — kutipan langsung founder di 02 §10, salah satu derivasi paling
  tekstual di seluruh dokumen ini
Trace Status: ✓ Fully Derived
```

### 13. Lessons Learned / Variance / Root Cause (Historical Cost Intelligence)

**Business Responsibility:** *"Pengalaman proyek harus mengubah Company AHSP/Price Book/Productivity secara OTOMATIS begitu disetujui — kalau lessons learned cuma laporan yang disimpan terpisah, Company AHSP akan tetap nol selamanya (First Principle 3, 03: pembelajaran harus jadi input bukan output)."*
**Aggregate Root:** Lessons Learned Record (Variance = Value Object, Root Cause Analysis = child Entity).
```
Level 6 ✓ — First Principle 3 (03) secara eksplisit menyatakan tanpa mekanisme
  ini, "pola akan berulang" — necessity langsung dari root cause analysis
  Phase C
Trace Status: ✓ Fully Derived — capability paling matang, konsisten dengan
  penilaian `35`/`38` sebelumnya.
```

---

## Housekeeping — Dua Open Item Diselesaikan

### RAP Risk Register (`03b` § B.3, ditandai ⚠️ sejak `38`)

**Pertanyaan yang belum dijawab:** domain formal atau catatan di Estimate Item?

**Derivasi keputusan:** Business Responsibility RAP Builder (`42`, `35` #4/#10) menuntut Contingency/Risk Allowance jadi **komponen eksplisit yang bisa diaudit terpisah** dari anggaran kerja (`01` § 3.2: *"tanpa contingency eksplisit, setiap risiko yang terwujud langsung memakan profit tanpa peringatan dini"*). Kalau Risk Allowance hanya jadi CATATAN bebas di Estimate Item (bukan struktur tersendiri), ia tidak bisa "dipantau terpisah dari anggaran kerja" — persis yang diminta `01` § 3.2. Necessity ini mengarahkan ke **domain formal minimal**, bukan sekadar teks bebas.

**Keputusan (Derived, bukan Invented — necessity ditunjukkan eksplisit di atas):**
```
Risk Allowance Entry:
  - category        (harga material/cuaca/keterlambatan supplier/perubahan desain
                      — 01 §3.3, kategori risiko eksplisit disebut)
  - basis            (persentase atau nilai tetap terhadap komponen RAP tertentu)
  - estimate_item_ref (merujuk Estimate Item yang diberi allowance ini)
```
```
Level 6 ✓ Business Responsibility — necessity dari 01 §3.2 (pantau terpisah)
Trace Status: ✓ Fully Derived (dulu ⚠️ Requires ADR di 38, sekarang diselesaikan
  sebagai bagian housekeeping Fase 6 seperti direkomendasikan)
```
**Batas eksplisit:** Ini BUKAN Aggregate Root baru — child entity di dalam Estimate Item, sama pola dengan struktur lain di § 9-11. Tidak membuka kembali Capability Map (`35`) yang sudah Frozen Permanently.

### Fallback Rule UX (dari `42` § 5, ditandai ⚠️)

**Pertanyaan yang belum dijawab:** bentuk UX saat Company AHSP kosong untuk Cost Code yang dipilih.

**Catatan dari `43` (Derivation Audit):** klaim asli `42` ("sistem HARUS menyurutkan pilihan") ditemukan ❌ Invented — Explainability (`02` Constraint #1) bicara soal MENJELASKAN, bukan MENCEGAH. Derivasi ulang di sini, hati-hati tidak mengulang kesalahan yang sama:

**Derivasi yang benar (necessity, bukan preferensi UX):** Requirement yang PASTI terkunci: Explainability melarang strategi terpilih diam-diam berubah tanpa jejak (`02` Constraint #1). Requirement yang TIDAK terkunci evidence manapun: bentuk peringatan (block/warning/auto-suggest). Maka keputusan yang BISA diderivasi hanya sebatas: **kalau `strategy_source = Company` dipilih tapi Company Assembly untuk Cost Code itu belum ada, sistem WAJIB mencatat status ini sebagai bagian Estimate Item (`gap_flag: true`) — bentuk tampilannya (modal/badge/warning banner) BUKAN keputusan arsitektur, itu keputusan UI Fase 12.**
```
Level 6 ✓ (necessity: audit trail tidak boleh diam-diam kehilangan informasi
  "strategi ini sebenarnya fallback", 02 Constraint #1)
Trace Status: ✓ Fully Derived — dipersempit dari klaim asli `42` yang sudah
  terbukti Invented di `43`, sekarang hanya mencakup APA yang wajib dicatat
  (gap_flag), bukan BAGAIMANA ditampilkan (diserahkan ke Fase 12, bukan dipaksa
  diputuskan di sini)
```

---

## Business Uncertainty — After

Sesudah dokumen ini: setiap dari 13 domain punya SATU kalimat alasan bisnis yang bisa dikutip langsung kalau reviewer bertanya "kenapa X jadi Aggregate Root, bukan Y" — bukan lagi disimpulkan dari struktur tabel. Dua open item (Risk Register, Fallback UX) yang sebelumnya menggantung sejak `38`/`42` sekarang tertutup dengan keputusan MINIMAL yang justru diderivasi ketat (bukan melebar) — Risk Register jadi child entity sesempit mungkin, Fallback UX dipersempit dari klaim UX konkret menjadi hanya kewajiban pencatatan status.

---

## Simplicity Rule Check

Diperiksa: apakah ada domain di atas yang hanya menjelaskan domain lain? Tidak ditemukan — ketiga belas Business Responsibility masing-masing menjelaskan PERILAKU CECEP yang dialami pengguna (kenapa harga tidak berubah retroaktif, kenapa satu Cost Code dikenali di mana-mana, dst), bukan menjelaskan istilah arsitektur lain.

## Definition of Done Self-Check (`34`)

| Kriteria | Status | Bukti |
|---|---|---|
| 1. Memperkuat capability | ✓ | Semua 13 domain dipetakan balik ke Capability `35` yang relevan |
| 2. Mengurangi implementation uncertainty | ✓ | Business Responsibility eksplisit per domain + 2 open item ditutup |
| 3. Artefak konkret | ✓ | 13 Business Responsibility + 2 struktur housekeeping |
| 4. Tidak memperkenalkan Framework concept | ✓ | Nol istilah Article 8 terlarang |
| 5. Construction Removal Test | ✓ | Hapus "construction" → AHSP/RAB/RAP/Cost Code semua hilang |
| 6. Constitution 8 Artikel | ✓ | |
| 7. Implementation readiness | ✓ | Business Responsibility langsung dipakai Fase 7 (skema) |
| 8. Derivation Trace + Trace Status | ✓ | 13/13 domain ✓ Fully Derived, 2/2 open item diselesaikan ✓ Fully Derived, 0 ❌ Invented |

**Hasil:** 8/8 ✓.

## Derivation Trace

```
This document derives from:
✓ Mission (01/02)
✓ Principles (04)
✓ Confirmed Domain (03b — evidence, bukan authority)
✓ Frozen Capability (35)
✓ Capability Interaction (37)
No new business concepts introduced.
```

---

## 🔒 STATUS: SIAP DI-FREEZE — Derived & Frozen (menunggu review)

Fase 6 sekarang memenuhi standar `40` § Tiga Istilah Status: bukan lagi "Ready for Derivation" — 13 domain sudah diderivasi eksplisit dengan Business Responsibility + Trace Status, dua open item tertutup. Menunggu review founder sebelum status resmi naik ke **Derived & Frozen**.
