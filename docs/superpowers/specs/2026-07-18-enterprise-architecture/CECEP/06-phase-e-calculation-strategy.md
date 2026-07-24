# CECEP — Phase E: Calculation Strategy (Enterprise Calculation Architecture)

> ⚠️ **SUPERSEDED.** Terikat CAP-006 dan Capability Catalog lama yang sudah digantikan [`35-phase3-capability-architecture.md`](35-phase3-capability-architecture.md). Calculation Strategy sudah diderivasi ulang penuh (evidence yang valid) di [`42-phase5-calculation-strategy-architecture.md`](42-phase5-calculation-strategy-architecture.md) — Fase 5 Roadmap V2, Frozen, TIDAK mewarisi dokumen ini. JANGAN dipakai sebagai evidence. Dipertahankan sebagai jejak historis proses.

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Fase kedua sintesis. Phase D menjawab *"capability apa yang ada dan siapa pemiliknya"*; Phase E menjawab *"bagaimana CAP-006 (Calculation Execution, Calculation Engine) benar-benar menghitung"* — satu pertanyaan yang jauh lebih dalam dari sekadar rumus, karena mencakup seluruh filosofi kalkulasi perusahaan sebagai satu **Calculation Operating System** yang utuh, bukan kumpulan fitur berdiri sendiri.

## Aturan Governing (Mengikat, Tidak Bisa Dilanggar Tanpa ACR)

1. **Capability Architecture is frozen** ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 🔒 CAPABILITY FREEZE). Phase E TIDAK mendesain ulang capability apa pun.
2. **Domain Model is frozen** ([`03b`](03b-phase-c5-core-domain-discovery.md) § 🔒 FREEZE). Phase E TIDAK membuat entity baru kecuali ditemukan kebutuhan yang benar-benar tidak dapat dipenuhi capability yang sudah ada.
3. **Phase E hanya boleh menjawab**: *"How does each capability calculate?"* — bagaimana CAP-006 mengeksekusi, tidak boleh menjawab *"Should this capability exist?"* — itu sudah selesai di Phase D/D.1.
4. **Kalau ditemukan kebutuhan perubahan capability selama Phase E:** hentikan analisis pada titik itu, dokumentasikan sebagai **Architecture Change Request (ACR)** — jelaskan alasan kenapa baseline yang sudah frozen tidak cukup — dan tunggu approval eksplisit founder sebelum mengubah baseline apa pun. Lihat § M untuk log ACR yang muncul selama penyusunan dokumen ini.
5. **CAP-006 (Calculation Execution, Calculation Engine) adalah pusat dokumen ini.** Capability lain (CAP-004 Pricing, CAP-005 Performance, CAP-009 Scenario Management, dst) yang memanggil kalkulasi diperlakukan sebagai **konsumen/pemanggil** — dibahas lewat kontrak pemanggilan mereka ke CAP-006, BUKAN dengan mendesain ulang tanggung jawab internal mereka sendiri.
6. **Konstitusi Calculation Strategy (verbatim, mengikat, level setingkat Architectural Invariant):**

> CAP-006 is the only capability allowed to own calculation execution logic.
> Other capabilities may own knowledge, configuration, parameters, reference data, assumptions, scenarios, or policies, but they must never execute business calculations independently.
> Every business calculation must be routed through CAP-006 to guarantee consistency, explainability, versioning, replayability, testing, and auditability across the entire platform.

**Konsekuensi langsung:** CAP-004 (Pricing), CAP-005 (Performance), CAP-007 (Risk), CAP-009 (Scenario) TIDAK BOLEH punya rumus/logika eksekusi kalkulasi sendiri-sendiri — mereka hanya boleh memiliki *knowledge* (harga, produktivitas, aturan risiko, definisi perbandingan). Begitu ada operasi yang benar-benar MENGHITUNG (bukan sekadar look up nilai tersimpan), operasi itu WAJIB dirutekan lewat CAP-006 — mencegah drift arsitektur ke "banyak Calculation Engine kecil tersembunyi di tiap capability" yang akan merusak filosofi ONE Calculation Engine, Many Consumers. Ini juga berlaku ke depan untuk AI (Phase H) — lihat § O.
7. **Requirement mengikat sejak awal sesi (verbatim, WAJIB dipakai apa adanya, bukan diparafrase)** — [`01-phase-b-cost-engineering-discovery.md`](01-phase-b-cost-engineering-discovery.md) § 305-306:

> "The system must never assume there is only one correct way to estimate construction costs. Every calculation must be strategy-driven, versioned, explainable, and replaceable."

Seluruh isi dokumen ini adalah realisasi konkret dari satu kalimat ini — bukan kebetulan bahwa Phase E berpusat pada Strategy Pattern (§ B), Versioning (§ K), Explainability (§ I), dan Replaceability (setiap sub-strategi bisa diganti tanpa mengubah pipeline, § C).

**Rujukan wajib:** Seluruh nama Capability memakai ID dari Capability Catalog ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 10) — format `CAP-XXX (Nama, Engine)` — deskripsi lengkap TIDAK diulang di sini, hanya dirujuk.

---

## Peta Satu Kesatuan — Kenapa Bukan Kumpulan Fitur Terpisah

Seluruh sub-topik di bawah adalah satu pipeline berurutan, bukan bab lepas yang kebetulan berdekatan tema:

```
Formula Language (§ A)
       ↓  ditulis dalam
Grammar & Parser (§ A.3)
       ↓  menghasilkan
AST — Abstract Syntax Tree (§ A.4)
       ↓  dianalisis jadi
Dependency Graph + Circular Detection (§ D)
       ↓  dieksekusi lewat
Execution Pipeline (§ C)
       ↓  di titik tertentu menerima
Override Hierarchy (§ E)
       ↓  hasil setiap langkah tercatat sebagai
Explainability Chain (§ I)
       ↓  disimpan permanen sebagai
Audit Trail (§ J)
       ↓  memungkinkan
Replay (§ J.3)
       ↓  yang menjadi dasar
Simulation & Benchmark (§ L)
```

Setiap § di bawah secara eksplisit merujuk balik ke § sebelumnya dalam rantai ini — desain yang mengubah satu titik (mis. Formula Language) diperiksa dampaknya ke seluruh titik setelahnya sebelum dianggap selesai, bukan didesain terisolasi lalu "disambungkan" belakangan.

---

## A. Formula Language — Fondasi Seluruh Pipeline

**Prinsip governing:** Consumed langsung dari Prinsip Final #6 ([`04`](04-architecture-constitution.md) § 2) — "Semua Calculation Strategy harus plug-in dan dapat diganti" — dan First Principle 4 ([`04`](04-architecture-constitution.md) § 4) — "System Behavior Must Be Configured Data, Not Hardcoded Code". Formula Language adalah mekanisme KONKRET yang mewujudkan kedua prinsip ini: kalau formula bukan data yang bisa di-parse, "strategy-driven" dan "configured data" hanya slogan tanpa implementasi.

### A.1 Kelas Formula yang Harus Didukung

| Kelas | Contoh | Karakteristik |
|---|---|---|
| **Geometric** | `Volume = Length × Width × Height` | Variabel murni numerik, operator aritmatika dasar |
| **Compositional** | `Concrete Mix = f(Cement, Sand, Split, Water, Waste%)` | Menghasilkan BREAKDOWN resource (bukan satu angka), dikonsumsi Assembly Engine (CAP-003) |
| **Conditional** | `Waste% = IF(Method == "Manual", 8%, 5%)` | Percabangan berbasis kondisi non-numerik |
| **Referential** | `Unit Price = LOOKUP(PriceBook, ResourceID, EffectiveDate)` | Memanggil CAP lain (CAP-004 Pricing), bukan kalkulasi murni internal |
| **Aggregative** | `Total = SUM(EstimateItem[] WHERE CBSNode = X)` | Beroperasi pada koleksi, bukan skalar |
| **Temporal** | `EscalatedPrice = BasePrice × (1 + InflationRate)^Years` | Melibatkan dimensi waktu eksplisit |

**Kenapa taksonomi ini penting sebelum Grammar didesain:** Formula Language yang hanya menangani kelas Geometric (paling umum dibayangkan orang saat mendengar "formula") akan gagal total begitu Assembly Engine butuh Compositional, atau Estimation Engine (CAP-008) butuh Referential untuk memanggil Pricing Engine. Keenam kelas ini WAJIB tercakup grammar sejak awal — menambah kelas baru setelah grammar dikunci adalah perubahan breaking, bukan ekstensi.

### A.2 Prinsip Desain Bahasa

- **Deklaratif, bukan imperatif** — formula menyatakan APA yang dihitung, bukan LANGKAH prosedural bagaimana mengeksekusinya (langkah eksekusi adalah tanggung jawab Execution Pipeline, § C, bukan bocor ke dalam sintaks formula).
- **Tanpa efek samping (side-effect free)** — formula murni fungsi dari input ke output, tidak pernah menulis data sebagai bagian evaluasinya sendiri (menulis hasil adalah tanggung jawab pemanggil, setelah formula selesai dievaluasi) — prasyarat mutlak untuk Replay (§ J.3) dan Simulation (§ L) bisa berjalan aman tanpa efek samping tak terduga.
- **Total terhadap tipe, bukan total terhadap nilai** — formula boleh menghasilkan error/undefined untuk nilai tertentu (mis. pembagian oleh nol), tapi TIDAK BOLEH menghasilkan error tipe yang hanya ketahuan saat runtime kalau bisa dicegah saat parsing (lihat § A.5 Validasi).

### A.3 Grammar & Parser

**Pendekatan:** Grammar formal (EBNF-style) yang mendefinisikan sintaks sah — bukan sekadar "ekspresi bebas mirip Excel" tanpa batas jelas, karena batas yang tidak jelas berarti Parser tidak bisa menjamin AST yang dihasilkan selalu valid untuk tahap berikutnya (Dependency Graph, § D).

```
expression     := term (('+' | '-') term)*
term           := factor (('*' | '/') factor)*
factor         := NUMBER | variable_ref | function_call | '(' expression ')'
variable_ref   := IDENTIFIER ('.' IDENTIFIER)*        // mis. Resource.UnitPrice
function_call  := IDENTIFIER '(' argument_list ')'    // mis. LOOKUP(...), SUM(...), IF(...)
argument_list  := expression (',' expression)*
```

**Fungsi built-in minimum yang wajib didukung sejak v1:** `LOOKUP`, `SUM`, `IF`, `ROUND`, `MIN`, `MAX`, `CONVERT` (memanggil CAP-001 Identity Engine untuk Unit Conversion, § A.1 Referential class). Daftar ini BUKAN final — Formula Language dirancang extensible (fungsi baru bisa didaftarkan tanpa mengubah grammar inti), tapi keenam ini adalah baseline yang menjawab langsung 6 kelas formula § A.1.

**Parser menghasilkan AST (Abstract Syntax Tree), bukan mengeksekusi langsung** — pemisahan ini disengaja: AST adalah representasi INTERMEDIATE yang bisa dianalisis (§ D Dependency Graph), divalidasi (§ A.5), divisualisasikan (§ I Explainability), dan disimpan versioned (§ K) SEBELUM pernah dieksekusi sekali pun.

### A.4 AST sebagai Kontrak Antar-Tahap

Setiap node AST menyimpan: `type` (kelas dari § A.1), `operator/function`, `children[]`, `source_position` (untuk error message yang bisa ditelusuri balik ke teks formula asli — prasyarat Explainability § I). AST inilah yang menjadi INPUT untuk Dependency Graph (§ D) — bukan teks formula mentah — karena analisis dependency pada teks mentah rapuh (rentan salah parse), sedangkan pada AST terstruktur dan pasti benar.

### A.5 Validasi Saat Parse-Time (Bukan Menunggu Runtime)

| Validasi | Kapan Dijalankan | Kenapa Parse-Time, Bukan Runtime |
|---|---|---|
| Sintaks sah sesuai grammar | Saat parsing | Formula yang salah tulis harus ditolak SEBELUM masuk Formula Definition (CAP-006 Aggregate Root, [`05`](05-phase-d-capability-architecture.md) § F.6), bukan gagal diam-diam saat estimator sedang bekerja |
| Semua variable_ref merujuk identitas yang valid | Saat parsing, memanggil CAP-001 | Mencegah formula merujuk Cost Code/Resource yang tidak ada — kesalahan yang sangat mahal kalau baru ketahuan saat Estimate Version sudah di-Approve |
| Tidak ada circular reference langsung dalam SATU formula | Saat parsing (deteksi lokal) | Deteksi PENUH circular (lintas banyak Formula Definition) adalah tanggung jawab § D, ini hanya jaring pengaman pertama yang murah dilakukan di level AST tunggal |
| Tipe argumen fungsi built-in sesuai | Saat parsing | `SUM()` yang menerima argumen non-koleksi harus ditolak sebelum dieksekusi |

---

## B. Strategy Pattern — Mewujudkan "Never Assume Only One Correct Way"

**Ini adalah jantung Phase E** — realisasi paling langsung dari requirement mengikat § pembuka.

### B.1 Definisi Calculation Strategy

Satu **Calculation Strategy** = satu cara SAH untuk menjawab pertanyaan kalkulasi yang sama, dipilih secara eksplisit (bukan default tersembunyi), tercatat sebagai bagian permanen dari hasil (bukan hilang setelah eksekusi selesai).

**Contoh konkret domain konstruksi:**

| Pertanyaan Kalkulasi | Strategy A | Strategy B | Strategy C |
|---|---|---|---|
| Volume Pengecoran | Geometric (Length×Width×Height) | BIM-derived (import langsung dari model 3D) | Historical-analogy (dari proyek serupa selesai) |
| Waste Factor | AHSP Nasional standar (5%) | Company historis (data Variance aktual) | Manual override estimator |
| Harga Material | Company Price Book aktif | Supplier Quote terbaru | Regional Cost Index-adjusted (kalau CAP-004 optional responsibility aktif) |
| Produktivitas | AHSP Nasional bootstrap | Company baseline | Musiman/cuaca-adjusted |

**Kenapa ini BUKAN sekadar "banyak formula untuk hal yang sama":** Beda mendasar — banyak formula tanpa Strategy Pattern berarti sistem harus MENEBAK mana yang dipakai (hardcoded logic tersembunyi, melanggar First Principle 4). Strategy Pattern berarti PEMILIHAN itu sendiri adalah data eksplisit yang tercatat, bisa diaudit, dan bisa diganti tanpa mengubah kode.

### B.2 Kontrak Strategy (Interface Konseptual)

Setiap Calculation Strategy, apa pun kelasnya (§ A.1) atau domain yang dilayaninya, WAJIB memenuhi kontrak yang sama:

```
Strategy {
  id: StrategyID                    // identitas tetap, tidak berubah lintas versi
  version: Version                  // Foundational Principle Ketiga — Everything is Versioned
  applicable_context: Context[]     // kapan strategy ini SAH dipakai (tipe proyek/CBS/dll)
  formula: AST                      // hasil § A
  required_inputs: VariableRef[]    // eksplisit, bukan tersirat
  produces: OutputType              // eksplisit, bukan tersirat
  confidence_source: ConfidenceLevel // diwarisi dari Pricing/Productivity Engine kalau relevan
}
```

**Konsekuensi kontrak seragam:** Karena SEMUA strategy — geometric sederhana sampai BIM-derived kompleks — memenuhi kontrak yang sama, Execution Pipeline (§ C) tidak perlu tahu APA jenis strategy yang sedang dijalankan, hanya perlu tahu kontraknya terpenuhi. Ini adalah penerapan langsung Replaceability ([`05`](05-phase-d-capability-architecture.md) § G.8) di level Phase E.

### B.3 Strategy Selection — Siapa Memilih, Kapan

**Bukan otomatis tersembunyi.** Pemilihan Strategy terjadi di titik yang eksplisit dalam Execution Pipeline (§ C.2), dicatat sebagai bagian dari Estimate Item (CAP-008), dan tunduk pada Configurable Approval Workflow (CAP-010) kalau perubahan strategy terjadi setelah Estimate Version berstatus Under Review — MENCEGAH pergantian strategy diam-diam yang bisa mengubah hasil tanpa jejak.

---

## C. Execution Pipeline

**Prinsip governing:** Consumed dari Architectural Constraint #2 ([`04`](04-architecture-constitution.md) § 3) — "Cost Engine sebagai Decision Engine, Bukan Calculator": alur wajib `Input → Validation → Calculation → Simulation → Comparison → Recommendation → Approval → Baseline`. Execution Pipeline Phase E adalah implementasi KONKRET dari alur delapan-langkah ini.

### C.1 Delapan Tahap (Diturunkan Langsung dari Constraint #2)

```
1. INPUT           — kumpulkan variable_ref yang dibutuhkan Strategy terpilih
2. VALIDATION       — cek kelengkapan input, cek Strategy applicable_context terpenuhi
3. CALCULATION      — evaluasi AST dengan input tervalidasi (lihat § C.3 detail evaluasi)
4. SIMULATION       — jalankan "what-if" tanpa commit (lihat § L)
5. COMPARISON       — bandingkan hasil dengan Strategy alternatif/Scenario lain (CAP-009)
6. RECOMMENDATION   — sajikan hasil + confidence + penjelasan (§ I) ke pemanggil
7. APPROVAL         — kalau melewati threshold (CAP-010), tunggu validasi manusia
8. BASELINE         — hasil final tercatat immutable, memicu Domain Event
```

### C.2 Titik Masuk Strategy Selection

Strategy dipilih di TAHAP 1 (Input), bukan tersebar di tahap manapun secara implisit — satu titik keputusan yang jelas, konsisten dengan § B.3.

### C.3 Detail Tahap Calculation — Evaluasi AST

**Evaluasi AST mengikuti Dependency Graph (§ D)**, BUKAN urutan penulisan formula — node yang tidak punya dependency dieval lebih dulu (topological order), memungkinkan Parallel Calculation (§ C.4) untuk cabang independen.

### C.4 Parallel Calculation

**Kapan aman dilakukan:** HANYA untuk node AST yang terbukti independen lewat Dependency Graph (§ D) — dua Estimate Item pada CBS Node berbeda yang tidak saling mereferensikan bisa dievaluasi paralel; dua node dalam SATU formula yang salah satu bergantung ke hasil yang lain TIDAK BOLEH diparalelkan.

**Kenapa dibahas di sini, bukan sebagai fitur performa terpisah:** Karena kesalahan paralelisasi (mengeksekusi node yang sebenarnya punya hidden dependency) menghasilkan bug non-deterministik yang SANGAT sulit dilacak — pembahasan ini WAJIB terikat langsung ke ketegasan Dependency Graph (§ D), tidak bisa didesain terpisah sebagai "optimasi nanti".

### C.5 Cache Strategy

**Prinsip:** Hasil kalkulasi boleh di-cache HANYA selama semua input-nya (termasuk versi Strategy, versi Price Book, versi Productivity Record yang dirujuk) tidak berubah — cache key WAJIB memasukkan versi setiap dependency, bukan cuma ID entity-nya. Ini konsekuensi langsung dari Foundational Principle Ketiga (Everything is Versioned): cache yang tidak memperhitungkan versi akan menyajikan hasil basi begitu Price Book Entry baru di-Verify (CAP-004) tanpa Estimate Item yang merujuknya ikut re-invalidated.

**Invalidasi cache dipicu oleh Domain Event** (`PriceBookEntryVerified`, `ProductivityRecordUpdatedFromVariance`, `FormulaActivated`, dst — daftar dari [`05`](05-phase-d-capability-architecture.md) § F) — bukan polling berkala, konsisten dengan pola event-driven yang sudah dipakai di seluruh Domain Relationship Map.

---

## D. Dependency Graph & Circular Dependency Detection

**Kenapa ini bab tersendiri, bukan sub-bagian Execution Pipeline:** Dependency Graph dikonsumsi oleh TIGA hal berbeda sekaligus (urutan evaluasi § C.3, keamanan paralelisasi § C.4, dan deteksi siklus di bawah) — cukup penting untuk dianalisis sebagai fondasi sendiri sebelum dipakai di tempat manapun.

### D.1 Konstruksi Graph

Setiap node = satu Formula Definition atau satu `variable_ref` yang menunjuk keluar (mis. ke Price Book Entry, Productivity Record). Setiap edge = "node A butuh nilai node B sebelum bisa dievaluasi". Graph dibangun dari AST (§ A.4), bukan dari teks formula — akurasi 100% karena AST sudah bebas ambiguitas sintaks.

### D.2 Circular Dependency — Dua Jenis Berbeda

**PENTING — dua jenis sirkularitas yang HARUS dibedakan tegas, karena satu adalah bug fatal dan satu adalah pola arsitektur sah:**

1. **Sirkularitas dalam SATU bidang waktu (structural circular)** — Formula A butuh hasil Formula B, Formula B butuh hasil Formula A, DALAM SATU evaluasi yang sama. Ini **HARUS ditolak mutlak** saat validasi (bisa terjadi di parse-time untuk kasus lokal § A.5, atau di construction-time graph untuk kasus lintas Formula Definition). Tidak ada strategy apa pun yang boleh mengizinkan ini — akan menyebabkan infinite loop atau hasil tidak terdefinisi.

2. **Sirkularitas lintas bidang waktu (temporal feedback, SAH)** — pola yang SUDAH diidentifikasi dan diklarifikasi resmi di Phase D.1 ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 3a): CAP-008 (Estimation Engine) menghasilkan Estimate Version, yang nanti (SETELAH proyek selesai, sebagai data historis frozen) dikonsumsi CAP-011 (Company Intelligence Capture) untuk menghasilkan update balik ke CAP-003/004/005. Ini BUKAN circular dependency yang harus ditolak — dependency graph Phase E HANYA memodelkan bidang waktu evaluasi tunggal (satu Estimate Version, satu titik waktu), tidak pernah menganggap update knowledge masa depan sebagai "dependency" dalam graph yang sama.

**Algoritma deteksi:** Depth-First Search dengan tiga warna (white/gray/black) standar — begitu traversal menemukan edge menuju node berwarna "gray" (sedang dalam proses eval di jalur yang sama), itu jenis 1 (structural, ditolak). Update lintas waktu (jenis 2) TIDAK PERNAH masuk graph yang sama karena secara desain dipisahkan lewat Domain Event (async, § C.5) — bukan dependency langsung yang dianalisis DFS.

### D.3 Kapan Deteksi Dijalankan

- **Saat Formula Definition baru di-Activate** (`FormulaActivated`) — deteksi lokal terhadap Formula lain yang sudah aktif.
- **Saat Estimate Version mulai disusun** (CAP-008 memanggil CAP-006) — deteksi graph penuh untuk kombinasi Formula yang benar-benar dipakai di Estimate Item tersebut (kombinasi yang bisa berbeda-beda per Estimate, meski Formula Definition individualnya sudah lolos cek lokal).

---

## E. Override Hierarchy

**Prinsip governing:** Menjawab pertanyaan "kalau ada banyak Strategy/nilai yang bisa dipakai, mana yang menang?" — TANPA hardcode urutan prioritas ke dalam kode (First Principle 4).

### E.1 Lima Level Override (Urutan Prioritas, Tinggi ke Rendah)

```
5. Manual Override        — estimator override langsung di satu Estimate Item, tercatat WAJIB dengan alasan
4. Scenario Override       — CAP-009 menerapkan asumsi berbeda untuk satu Scenario (mis. "Supplier B" di VE Scenario)
3. Project Override        — pengaturan khusus satu Project (mis. lokasi terpencil, akses sulit)
2. Company Override        — Company AHSP/Price Book/Productivity (CAP-003/004/005) menggantikan baseline nasional
1. Government/National Baseline — AHSP Nasional, standar CBS nasional (Reference Library, bagian CAP-001)
```

**AI Recommendation TIDAK masuk hierarki override ini sebagai level tersendiri** — ini keputusan desain eksplisit: AI Recommendation (dari CAP-012 Retrieval Engine) hanya boleh MENYARANKAN salah satu dari lima level di atas dipakai, ia tidak pernah jadi level override baru yang otomatis menang — konsisten dengan constraint terkunci "AI tidak boleh langsung belajar, harus ada approval" ([`02`](02-phase-b5-core-cost-engineering-architecture.md) § 10) diterapkan simetris ke sisi *pemakaian* rekomendasi AI, bukan cuma sisi *pembelajarannya*.

### E.2 Resolusi Override — Algoritma

Untuk setiap `variable_ref`, cari nilai dari level tertinggi ke terendah, berhenti di level pertama yang punya nilai eksplisit didefinisikan untuk konteks itu. **Setiap resolusi WAJIB mencatat level mana yang akhirnya dipakai** — ini bukan detail teknis tersembunyi, ini bagian dari Explainability Chain (§ I) yang harus terlihat di hasil akhir.

### E.3 Kenapa Override Bukan "Ubah Formula Langsung"

**Batas tegas yang mencegah Override Hierarchy jadi lubang untuk melanggar Formula Language (§ A):** Override mengganti NILAI variable atau memilih STRATEGY alternatif yang SAH (§ B) — override TIDAK PERNAH berarti menyisipkan ekspresi ad-hoc di luar Formula Language yang sudah diparse dan divalidasi. Manual Override level 5 tetap harus berupa nilai/strategy yang lolos § A.5 (Validasi Parse-Time), hanya levelnya paling tinggi dalam prioritas resolusi.

---

## F. Precision Rules

**Kenapa perlu dibahas eksplisit:** Konstruksi melibatkan satuan dengan presisi berbeda drastis (mis. volume beton dibulatkan ke 0.01 m³, tapi jumlah paku dibulatkan ke satuan utuh) — tanpa aturan presisi eksplisit per kelas resource, hasil kalkulasi berantai (Assembly → Estimate Item → Estimate Version total) bisa mengakumulasi kesalahan pembulatan yang signifikan pada proyek bernilai besar.

**Aturan:** Precision Rule adalah bagian dari definisi RBS entry (CAP-001, Identity Engine) — setiap Resource punya `precision_digits` dan `rounding_mode` (round-half-up/round-half-even/dst) sebagai atribut identitasnya. Formula Language (§ A) TIDAK menentukan presisi sendiri — ia selalu mewarisi presisi dari variable_ref yang dirujuknya, mencegah dua Formula berbeda membulatkan Resource yang sama dengan aturan berbeda.

**Precision pada tahap aggregasi (SUM):** pembulatan HANYA terjadi di titik akhir presentasi (Estimate Item level), bukan di setiap langkah antara — mencegah *rounding error accumulation* yang klasik terjadi kalau tiap sub-kalkulasi dibulatkan sebelum dijumlahkan.

---

## G. Currency Rules

**Konsisten dengan Rejected Domain C.4 ([`03b`](03b-phase-c5-core-domain-discovery.md) § C.4):** Currency Exchange Rate BUKAN domain terpisah — ia kasus khusus Unit Conversion (CAP-001). Di Phase E, ini berarti: konversi mata uang dalam formula memakai fungsi built-in `CONVERT` yang SAMA dengan konversi satuan fisik (§ A.3) — tidak ada grammar/fungsi terpisah untuk currency.

**Precision Rule khusus currency:** Setiap Currency punya `precision_digits` sendiri (Rupiah 0 desimal, USD 2 desimal) — mengikuti pola § F, bukan hardcoded di Formula Language.

---

## H. Capability Lain Sebagai Consumer — Kontrak Delapan-Elemen ke CAP-006

**Penegasan batas (langsung dari Konstitusi Calculation Strategy § pembuka poin 6):** Setiap capability lain yang butuh kalkulasi (CAP-003 Assembly, CAP-004 Pricing, CAP-005 Productivity, CAP-007 Risk, CAP-009 Scenario, dst) TIDAK BOLEH punya logika eksekusi kalkulasi sendiri — mereka menyediakan *knowledge* (harga, produktivitas, aturan risiko, definisi Scenario), lalu MEROUTE setiap kebutuhan hitung ke CAP-006 lewat kontrak yang seragam. Delapan elemen kontrak berikut WAJIB dipenuhi setiap kali capability lain memanggil CAP-006 — bukan didesain ulang per-capability, satu kontrak dipakai semua:

| Elemen Kontrak | Definisi | Sumber di Dokumen Ini |
|---|---|---|
| **Input Contract** | `required_inputs: VariableRef[]` yang harus disuplai pemanggil sebelum eksekusi dimulai | § B.2 Strategy |
| **Output Contract** | `produces: OutputType` — bentuk hasil yang dijamin CAP-006 kembalikan | § B.2 Strategy |
| **Extension Point** | Fungsi built-in baru (`RegionalIndex`, `SeasonalFactor`, dst) didaftarkan TANPA mengubah grammar inti | § A.3 |
| **Override Point** | Lima level resolusi (§ E.1) — pemanggil hanya menyuplai nilai di level yang relevan, tidak menentukan urutan prioritas sendiri | § E |
| **Validation Contract** | Parse-time validation (§ A.5) + `applicable_context` Strategy (§ B.2) — pemanggil tidak bisa memaksa eksekusi melewati validasi ini | § A.5, § B.2 |
| **Explainability Contract** | Setiap hasil WAJIB disertai Explanation Tree (§ I) — pemanggil tidak bisa meminta hasil "polos" tanpa jejak penjelasan | § I |
| **Versioning Contract** | Formula/Strategy yang dipanggil selalu terikat versi eksplisit (§ K) — pemanggil tidak bisa memanggil "versi terbaru" secara implisit tanpa mencatat versi mana yang dipakai | § K |
| **Audit Contract** | Setiap eksekusi yang melewati APPROVAL (§ C.1 tahap 7) otomatis tercatat (§ J.1) — pemanggil tidak perlu (dan tidak boleh) mengimplementasikan audit trail sendiri | § J.1 |

### Contoh Konkret — Regional Index & Productivity Adjustment (CAP-004/CAP-005)

```
Formula: AdjustedPrice = BasePrice × RegionalIndex(Location)
                                      └─ Referential class (§ A.1)
                                         CAP-004 menyediakan NILAI index (knowledge),
                                         CAP-006 yang MENGEKSEKUSI perkalian dan mencatat Explanation Tree

Formula: AdjustedProductivity = BaseProductivity × SeasonalFactor(Month, Location)
                                                     └─ Referential class,
                                                        CAP-005 menyediakan NILAI faktor (knowledge),
                                                        CAP-006 yang MENGEKSEKUSI dan mencatat jejaknya
```

**Batas yang dijaga:** CAP-004/CAP-005 TIDAK BOLEH mengeksekusi `BasePrice × RegionalIndex(Location)` sendiri di dalam boundary mereka masing-masing (itu akan jadi "Calculation Engine kecil tersembunyi" yang dilarang § pembuka poin 6) — mereka hanya menjawab "berapa nilai RegionalIndex/SeasonalFactor untuk konteks ini", CAP-006 yang menjalankan operasi matematisnya, memvalidasinya, dan mencatat jejaknya. Pola yang SAMA berlaku untuk CAP-003 (Assembly memanggil CAP-006 untuk breakdown resource), CAP-007 (Risk memanggil CAP-006 untuk menghitung allowance), dan CAP-009 (Scenario memanggil CAP-006 untuk setiap perbandingan 7-dimensi) — tidak ada pengecualian.

---

## I. Explainability Chain

**Prinsip governing:** Architectural Invariant #2 ([`04`](04-architecture-constitution.md) § 5) — "Explainability: setiap keputusan/angka bisa ditelusuri sampai ke alasan dasarnya" — dan contoh konkret founder di Phase B.5 (Harga Beton → Material Price Book v3.2 → Productivity v1.8 → dst).

### I.1 Struktur Explanation Tree

Setiap hasil kalkulasi CAP-006 menghasilkan, BUKAN cuma angka, tapi **Explanation Tree** yang mengikuti struktur AST (§ A.4) satu-ke-satu — tiap node AST yang dieval punya node Explanation sejajar berisi: `input_values_used`, `strategy_selected` (§ B), `override_level_applied` (§ E.2), `source_version` (Price Book/Productivity/Formula version yang dipakai).

### I.2 Kenapa Dibangun Otomatis dari Pipeline, Bukan Ditulis Manual

**Ini poin arsitektur paling penting di § I:** Explainability TIDAK diimplementasikan sebagai fitur "generate laporan penjelasan" terpisah setelah kalkulasi selesai — Explanation Tree adalah SIDE-PRODUCT otomatis dari Execution Pipeline (§ C) itu sendiri, karena setiap tahap pipeline (Input/Validation/Calculation/dst) SUDAH mencatat apa yang terjadi sebagai bagian dari kontrak tahap itu. Kalau Explainability perlu ditulis manual terpisah, ia akan selalu tertinggal/tidak sinkron dari kalkulasi aslinya — desain ini mencegah itu secara struktural.

---

## J. Audit Trail & Replay

### J.1 Audit Trail

**Prinsip governing:** Architectural Invariant #10 — "Auditability: setiap perubahan tercatat siapa, kapan, dan mengapa". Setiap transisi Execution Pipeline (§ C.1) yang melewati tahap APPROVAL memicu entry Audit Trail berisi: siapa memicu, timestamp, Strategy/Override yang dipakai (§ B, § E), dan hasil sebelum/sesudah kalau ini adalah revisi.

### J.2 Formula Version & Migration

Setiap Formula Definition (CAP-006 Aggregate Root) yang direvisi menghasilkan versi baru (Foundational Principle Ketiga) — Estimate Item yang SUDAH dihitung dengan Formula versi lama TETAP merujuk versi lama itu (immutable historical record), TIDAK otomatis "migrasi" ke versi baru. **Formula Migration** adalah operasi EKSPLISIT dan terpisah (bukan otomatis): estimator/PM secara sadar memilih me-recalculate Estimate Item tertentu dengan Formula versi baru, tindakan itu sendiri tercatat di Audit Trail sebagai event baru, bukan menimpa riwayat lama.

### J.3 Replay

**Definisi:** Kemampuan mengeksekusi ULANG persis satu kalkulasi historis, menghasilkan hasil identik — mungkin HANYA KARENA Formula Language dirancang side-effect free (§ A.2) dan Cache Strategy (§ C.5) mengunci versi setiap dependency di titik waktu itu.

**Kegunaan konkret:** (1) Verifikasi Audit — membuktikan hasil Estimate Version lama benar-benar dihasilkan dari input yang tercatat, bukan dimanipulasi setelahnya; (2) basis untuk Simulation (§ L) — "apa hasilnya kalau Formula X versi lama dipakai lagi dengan Price Book hari ini".

---

## K. Versioning Strategy — Spesifik untuk CAP-006

**Konsisten dengan Foundational Principle Ketiga** ([`04`](04-architecture-constitution.md) § 1), diterapkan spesifik ke tiga entity yang dimiliki CAP-006:

| Entity | Apa yang Di-versioned | Immutability |
|---|---|---|
| Formula Definition | Expression/AST, daftar parameter | Immutable setelah Active — revisi = versi baru, bukan edit di tempat |
| Calculation Strategy | Kontrak (§ B.2) + applicable_context | Immutable setelah Active, sama seperti Formula Definition |
| Explanation Tree (§ I) | Snapshot lengkap satu eksekusi | Immutable SELALU — Explanation Tree tidak pernah punya "versi baru", ia adalah catatan historis satu titik waktu |

---

## L. Simulation, Sandbox & Benchmark

### L.1 Simulation ("What-If" Tanpa Commit)

Tahap 4 dari Execution Pipeline (§ C.1) — menjalankan seluruh pipeline sampai tahap COMPARISON tanpa pernah mencapai BASELINE (tahap 8). Karena Formula Language side-effect free (§ A.2), Simulation aman dijalankan berkali-kali tanpa risiko korupsi data — ini BUKAN mode terpisah dengan kode berbeda, ia adalah pipeline yang SAMA yang sengaja dihentikan sebelum commit.

### L.2 Sandbox

**Definisi:** Lingkungan Simulation yang memakai SALINAN sesaat (bukan live reference) dari Price Book/Productivity/Formula versi tertentu — dipakai untuk menguji Formula/Strategy BARU yang belum di-Activate, tanpa risiko formula belum-teruji mempengaruhi Estimate Version yang sedang berjalan produksi.

### L.3 Benchmark

**Definisi:** Menjalankan SATU Formula/Strategy terhadap BANYAK dataset historis (lewat Replay, § J.3) untuk mengukur akurasi dibanding Actual Cost yang sudah tercatat — inilah mekanisme KONKRET yang memvalidasi "Company baseline lebih akurat dari AHSP Nasional" (klaim yang selama ini kualitatif di Phase B/B.5, sekarang punya cara diukur).

### L.4 Testing & Validation Sebelum Activate

Formula/Strategy baru WAJIB lolos Benchmark (§ L.3) di Sandbox (§ L.2) terhadap minimum satu dataset historis SEBELUM status naik dari Draft ke Tested ([`05`](05-phase-d-capability-architecture.md) § F.6 lifecycle: Draft → Tested → Active → Superseded) — Testing bukan langkah opsional, ia adalah SYARAT transisi lifecycle yang sudah dikunci Phase D, Phase E hanya mengisi APA yang diperiksa saat Testing.

---

## M. Formula Governance — Approval & Deprecation

### M.1 Formula Approval

Formula Definition baru/revisi tunduk CAP-010 (Process Governance, Workflow Engine) sebelum status Active — konsisten dengan Configurable Approval Workflow yang sudah dikunci Phase B.5, TIDAK didesain ulang di sini, hanya diterapkan: `applicable_context` Formula (§ B.2) menjadi salah satu dari 7 dimensi konfigurasi approval (mis. Formula dengan Cost Threshold tinggi butuh approval chain lebih panjang).

### M.2 Formula Deprecation

Formula Definition berstatus Superseded TIDAK dihapus (Architectural Invariant Traceability) — ditandai `deprecated_at` + `superseded_by` (Formula Definition pengganti), tetap bisa dipakai untuk Replay (§ J.3) terhadap Estimate Version historis yang masih merujuknya, TAPI tidak bisa dipilih sebagai Strategy baru (§ B.3) untuk Estimate Item baru.

---

## N. AI Tidak Pernah Menghitung Sendiri — Konsekuensi Konstitusi § Pembuka Poin 6 untuk Phase H Mendatang

**Kenapa dibahas di Phase E, bukan ditunda ke Phase H (AI Architecture):** Konstitusi Calculation Strategy ("CAP-006 is the only capability allowed to own calculation execution logic") berlaku UNIVERSAL — kalau tidak dinyatakan eksplisit sekarang bagaimana ia mengikat AI, ada risiko Phase G/H nanti diam-diam menganggap AI sebagai pengecualian ("AI kan pintar, biar dia hitung langsung"). Menutup celah itu sekarang, sebelum Phase H dimulai, jauh lebih murah daripada menemukan pelanggarannya setelah AI Architecture terlanjur didesain.

### Alur yang WAJIB (Konsisten dengan Konstitusi § Pembuka Poin 6)

```
AI Recommendation (CAP-012 Retrieval Engine, hasil pattern-matching dari CAP-011)
        ↓  menyarankan Strategy/nilai/parameter — TIDAK menyarankan hasil akhir
CAP-006 Calculation Engine (mengeksekusi, memvalidasi, mencatat Explanation Tree)
        ↓
Final Result (deterministic, explainable, auditable, replayable)
```

### Alur yang DILARANG

```
AI langsung menghasilkan angka final
        ↓
Final Result  ← TIDAK PERNAH SAH, terlepas seberapa akurat modelnya
```

**Kenapa dilarang mutlak, bukan sekadar "sebaiknya dihindari":** Kalau AI diizinkan menghasilkan angka final tanpa lewat CAP-006, EMPAT kontrak sekaligus rusak: (1) Explainability Chain (§ I) tidak punya AST untuk ditelusuri karena tidak ada eksekusi formula; (2) Versioning (§ K) tidak bisa mengikat hasil ke versi Formula/Strategy tertentu karena tidak ada Formula/Strategy yang dieksekusi; (3) Replay (§ J.3) tidak mungkin dilakukan karena tidak ada pipeline deterministik untuk dijalankan ulang; (4) Audit Trail (§ J.1) tidak punya tahap APPROVAL yang jelas karena "AI menghasilkan angka" bukan salah satu dari delapan tahap Execution Pipeline (§ C.1).

**Implikasi konkret untuk Phase H (dicatat di sini sebagai constraint yang sudah pasti, bukan ditunda untuk didiskusikan ulang):** Kapan pun AI Estimation Vision ([`01`](01-phase-b-cost-engineering-discovery.md) § 11) benar-benar diimplementasikan, AI HANYA boleh beroperasi di TAHAP 1 (Input — menyarankan `variable_ref` mana yang relevan) dan TAHAP 6 (Recommendation — menyarankan Strategy mana yang dipilih, lihat § B.3) dari Execution Pipeline (§ C.1). AI TIDAK PERNAH boleh menyisipkan diri di TAHAP 3 (Calculation) — tahap itu selamanya milik CAP-006 dan Formula Language (§ A) yang sudah diparse/divalidasi, bukan inferensi model yang tidak bisa di-Replay bit-per-bit.

---

## O. Log Architecture Change Request (ACR)

**Status:** Selama penyusunan Phase E ini, TIDAK ditemukan kebutuhan yang memaksa perubahan Capability Architecture atau Domain Model yang sudah frozen. Log ini disiapkan sebagai struktur siap-pakai kalau ACR muncul di masa depan (Phase E lanjutan, atau Phase F ke atas) — bukan diisi retroaktif dengan masalah yang dipaksakan supaya section ini "terisi".

**Format ACR (untuk dipakai kalau/ketika muncul):**

```
ACR-XXX: [judul singkat]
Ditemukan saat: [aktivitas/section spesifik]
Masalah: [kenapa capability/domain frozen tidak cukup]
Opsi dipertimbangkan: [alternatif yang sudah dicoba dalam batas frozen, kenapa gagal]
Rekomendasi: [perubahan spesifik yang diusulkan]
Dampak kalau disetujui: [capability/domain mana yang berubah, downstream apa yang terpengaruh]
Status: PENDING APPROVAL
```

**Kandidat paling dekat dengan ACR (BUKAN diajukan, dicatat sebagai observasi jaga-jaga):** § H (Regional Index & Productivity Adjustment) menyentuh CAP-004/005 yang statusnya masih sebagian Candidate ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 10, CAP-004 optional responsibility Regional Cost Index masih 🟡). Ini BUKAN kebutuhan mengubah baseline — kontrak pemanggilan `RegionalIndex()` tetap valid dipanggil dari Formula Language terlepas domain pendukungnya Confirmed atau belum; kalau di masa depan Regional Cost Index dikonfirmasi Confirmed dengan bentuk yang TIDAK sesuai kontrak `RegionalIndex(Location) → number` yang sudah diasumsikan di sini, BARU itu jadi ACR sungguhan.

---

## Assumptions

1. Enam fungsi built-in minimum (§ A.3: `LOOKUP`/`SUM`/`IF`/`ROUND`/`MIN`/`MAX`/`CONVERT`) adalah baseline yang menjawab 6 kelas formula § A.1 — daftar ini kemungkinan bertambah begitu implementasi konkret (Phase F ke atas) menemukan kebutuhan fungsi baru, tapi mekanisme "fungsi baru didaftarkan tanpa mengubah grammar inti" (§ A.3) dirancang eksplisit untuk menampung pertambahan itu tanpa breaking change.
2. ~~Precision Rules (§ F) diasumsikan melekat ke RBS entry (CAP-001) sebagai atribut identitas...~~ **[RESOLVED — lihat [ACR-001](04a-adr-traceability-log.md#acr-001-precision-rule-ownership-leak-calculation--information)]**: kepemilikan keputusan Precision Rule dipindahkan ke Phase F (Information Truth) — Phase E tetap mengonsumsi precision dari RBS entry seperti semula, tapi keputusan arsitekturalnya sekarang eksplisit milik Canonical Information Contract (`07` § C.1), bukan ratifikasi pasif dari Assumption Phase E.

## Open Questions

1. Untuk lima level Override Hierarchy (§ E.1) — apakah urutan prioritas ini (Manual > Scenario > Project > Company > National) sudah sesuai intuisi bisnis founder, atau ada kasus di mana urutan ini terasa terbalik (mis. Project Override yang seharusnya mengalahkan Scenario Override untuk kasus tertentu)?
2. Untuk Precision Rules (§ F) — apakah presisi memang sebaiknya melekat ke RBS entry (universal per Resource), atau perlu bervariasi per Company/Project (Assumption 2 di atas)?
3. Formula Governance (§ M) mengasumsikan `applicable_context` Formula otomatis jadi salah satu dari 7 dimensi approval CAP-010 — apakah ini pemetaan yang tepat, atau approval Formula sebaiknya punya dimensi konfigurasi sendiri di luar 7 dimensi yang sudah ada?

## Required Decisions (Approval Gate)

1. Apakah Formula Language (§ A) — enam kelas formula, grammar, validasi parse-time — sudah cukup lengkap sebagai fondasi, atau ada kelas formula konstruksi yang terlewat?
2. Apakah Strategy Pattern (§ B) sudah benar-benar mewujudkan requirement "never assume only one correct way" secara konkret, bukan sekadar naratif?
3. Apakah Override Hierarchy (§ E) — lima level, posisi AI Recommendation di luar hierarki — sudah sesuai model bisnis yang dibayangkan founder?
4. Apakah pemisahan dua jenis circular dependency (§ D.2 — structural ditolak vs temporal-feedback sah) sudah menjawab tuntas kekhawatiran soal sirkularitas, termasuk yang sudah diidentifikasi Phase D.1?
5. Apakah Phase E sekarang siap ditutup — dengan catatan TIDAK ADA ACR yang diajukan (§ O) — dan lanjut ke validation gate berikutnya (kemungkinan **Phase E.1 — Calculation Validation & Freeze**, mengikuti pola A→A.Validation, C→C.5, D→D.1) sebelum Phase F (Enterprise Data Model)?

---

## 🚦 APPROVAL GATE

Phase E (Calculation Strategy / Enterprise Calculation Architecture) selesai — Formula Language, Strategy Pattern, Execution Pipeline, Dependency Graph, Override Hierarchy, Precision/Currency Rules, Explainability Chain, Audit Trail, Replay, Versioning, Simulation/Sandbox/Benchmark, dan Formula Governance disusun sebagai satu Calculation Operating System yang utuh — seluruhnya di atas Capability Architecture yang tetap frozen, TANPA satu pun ACR diajukan. **STOP** — menunggu approval eksplisit sebelum lanjut.

**Catatan struktural (ditambahkan setelah Phase E selesai):** Sebelum lanjut ke Phase F, founder meminta validation gate tambahan — **Phase E.1 — Calculation Validation & Freeze** (analog dengan Discovery Validation setelah C.5 dan Capability Validation setelah D), lihat [`06b-phase-e1-calculation-validation-freeze.md`](06b-phase-e1-calculation-validation-freeze.md). Phase F menunggu Phase E.1 selesai. Phase E.1 menghasilkan 9 penambahan aturan/klarifikasi ke dokumen ini (lihat `06b` § 15 Freeze Checklist) dan 1 watch-item jangka panjang (Digital Twin Cost, dicatat untuk Phase J).

*Dokumen selanjutnya: Phase E.1 — Calculation Validation & Freeze, lalu Phase F — Enterprise Data Model.*
