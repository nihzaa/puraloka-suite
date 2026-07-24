# CECEP — Design Contract for Phase K (Synthesis Design)

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** BUKAN Discovery, BUKAN Philosophy — kontrak kerja singkat untuk Design K, sesuai Decision Boundary ([`23`](23-phase-k-discovery-eligibility-test.md) § 13). Merangkum HASIL Philosophy K (`23` § 8-13) menjadi bentuk operasional, TIDAK menambah keputusan baru. Setiap baris di bawah punya rujukan balik — dokumen ini tidak berdiri sendiri.

---

## Input

Design K membaca (TIDAK mengubah) Asset yang sudah frozen dari Phase G-J:

| Kategori Asset | Sumber | Kategori Ontologis |
|---|---|---|
| Rule Definition | `08a` § I, `08c v2` | Executable Knowledge Model |
| Formula Definition | `06` § A.4 | Executable Knowledge Model |
| Capability (CAP-001-013) | `05`, `05b` | Aggregate Root |
| Integration Point | `14` § 22.6, `15` struktur final | Configuration Data |
| AI Meta Model instance | `17` § 13, `18` struktur final | Kategori Meta Model tersendiri |
| Design Space Entry | `20` § 9-11, `21` struktur final | Knowledge Ontology |
| Ontology Relation (katalog) | `14` § 11.3 | 10 jenis relasi yang sudah dikunci |

---

## Output

**Satu artefak:** Asset Relationship Graph (`23` § 11.4, § 12) — struktur Node/Edge dengan `operation` (surface/infer) dan `derivation_path` per edge hasil Infer. **Nama masih kandidat kerja** (Name Bias, `13` — belum final).

**BUKAN di-Freeze sebagai isi** — yang di-Freeze adalah METODOLOGI (lima langkah `23` § 9, kriteria Coverage Completion `23` § 8.4), BUKAN graph itu sendiri (`23` § 10.4 — graph hidup, diperbarui mengikuti Asset yang berubah).

---

## Allowed Operations

1. **Surface** (`23` § 11.1) — memunculkan relasi yang SUDAH tertulis eksplisit di Asset (Dependency Analysis, Coverage Analysis).
2. **Infer** (`23` § 11.1) — menurunkan relasi baru dari KOMBINASI edge yang sudah di-Surface, TUNDUK aturan transitivitas eksplisit per `edge_type` (Impact Propagation, Cross-Phase Consistency, Conflict Detection). **Aturan transitivitas itu sendiri — domain Design K, belum didesain (Open Question `23` § Open Questions #4).**

---

## Forbidden Operations

Turunan langsung `23` § 8.3 (Reverse Proof) — TIDAK BOLEH:

1. Mendefinisikan ontologi/kategori Asset baru (itu Discovery, sudah ditutup untuk G-J, dan Phase K sendiri TERBUKTI tidak butuh, `23` § 1-4).
2. Mengubah definisi Asset yang sudah frozen — Synthesis MEMBACA, tidak pernah MENULIS balik ke Asset sumber.
3. Mengubah baseline Phase G-J (Progressive Freeze Chain, `04` § 7 — pelanggaran di sini = ACR, bukan Design biasa).
4. Menambahkan edge hasil Infer TANPA `derivation_path` yang bisa ditelusuri balik ke edge Surface asalnya (pelanggaran Explainability).
5. Memutuskan RESPONS terhadap dampak yang ditemukan (mis. "maka Rule X harus diubah") — Synthesis MENUNJUKKAN, tidak MEMUTUSKAN (`23` § 8.1, § 8.3 — itu domain Phase L/implementasi).

---

## Completion Criterion

Design K dianggap selesai ketika:

1. **Coverage Completion** (`23` § 8.4) tercapai — semua Asset frozen dari G-J sudah diperiksa relasinya (Surface), tidak ada yang lolos tanpa diperiksa.
2. **Semua Infer explainable** — setiap edge hasil Infer punya `derivation_path` yang bisa ditelusuri balik ke edge Surface pembentuknya, tanpa terputus.
3. **Aturan transitivitas terdefinisi** per `edge_type` yang boleh dipakai Infer (Design K wajib mendesain ini — belum ada saat kontrak ini ditulis).
4. **Cross-Phase Consistency dan Conflict Detection sudah dijalankan** minimal sekali terhadap seluruh graph, hasilnya (konsisten/konflik) tercatat sebagai bagian graph, bukan disimpulkan diam-diam.

---

## Batas yang Mengikat (Ringkasan Decision Boundary, `23` § 13)

Pertanyaan "APA ITU" (Surface, Infer, Coverage Completion, Asset Relationship Graph sebagai konsep) — **SUDAH DIJAWAB, TIDAK DIBUKA LAGI** kecuali ditemukan kontradiksi nyata terhadap baseline (bukan sekadar detail algoritma yang belum diputuskan).

Pertanyaan "BAGAIMANA DIJALANKAN" (BFS/DFS, penyimpanan, caching, incremental update, fixed-point propagation, SCC detection, bentuk konkret aturan transitivitas) — **DOMAIN DESIGN K, dikerjakan mulai sekarang.**

---

---

## K.2 Architecture Decomposition — Sebelum Edge Typing, Sebelum Relation Algebra

**Diminta founder, sesuai [`13`](13-working-methodology.md) § 11a (Component Boundary Rule) — dijalankan SEBELUM Design Competition per-komponen. Sepuluh kandidat subsistem founder diuji satu per satu terhadap Design Contract di atas (Input/Output/Allowed Operations/Forbidden Operations/Completion Criterion) — TIDAK diterima sebagai daftar final.**

**Kriteria uji per kandidat subsistem:** (i) Punya TANGGUNG JAWAB TUNGGAL yang bisa ditunjuk dari Design Contract (bukan gabungan dua tanggung jawab berbeda). (ii) TIDAK tumpang tindih dengan subsistem lain (kalau tumpang tindih, salah satu harus digabung/dipecah ulang). (iii) Punya INPUT dan OUTPUT yang bisa dirujuk balik ke bagian Design Contract yang sudah ada.

### Diuji Sepuluh Kandidat Founder

- **Asset Registry** — Diperiksa (i): tanggung jawab = menyimpan REFERENSI ke Asset frozen (Node, `23` § 11.3). **Diperiksa (ii):** apakah ini SAMA dengan "membaca Input" yang sudah didefinisikan Design Contract (tabel Input)? **Tumpang tindih parsial** — Design Contract SUDAH mendaftar Input sebagai KATEGORI, Asset Registry adalah MEKANISME untuk mengaksesnya secara konkret (bukan duplikasi, tapi IMPLEMENTASI dari Input yang sudah didefinisikan). **Lolos sebagai subsistem, dengan catatan: tanggung jawabnya SEMPIT (murni penyimpanan referensi, BUKAN analisis).**
- **Relationship Registry** — Diperiksa (i): tanggung jawab = menyimpan EDGE yang sudah ditemukan (baik Surface maupun Infer). **Diperiksa (ii):** BEDA dari Asset Registry (yang satu Node, yang ini Edge) — TIDAK tumpang tindih. **Lolos.**
- **Surface Engine** — Diperiksa (i): tanggung jawab = menjalankan operasi Surface (`23` § 11.1, sudah didefinisikan Philosophy). **Lolos langsung — operasi ini SUDAH punya definisi Philosophy yang jelas, subsistem ini adalah IMPLEMENTASI-nya.**
- **Infer Engine** — Sama seperti Surface Engine, untuk operasi Infer. **Lolos.**
- **Relation Algebra** — Diperiksa (i): tanggung jawab = MENDEFINISIKAN aturan transitivitas (edge_type mana boleh digabung). **Diperiksa (ii): apakah ini BAGIAN DARI Infer Engine, atau KOMPONEN TERPISAH?** Diperiksa dalam: Infer Engine MENJALANKAN penggabungan, Relation Algebra MENENTUKAN ATURAN yang boleh dijalankan — **BEDA tanggung jawab (eksekusi vs aturan), PERSIS pola yang sudah terbukti di CECEP: Rule (Executable Knowledge Model, MENJALANKAN) vs Rule Definition/Constraint (ATURAN yang dijalankan)**. **Lolos sebagai subsistem TERPISAH dari Infer Engine, BUKAN bagian di dalamnya — Infer Engine BERGANTUNG PADA Relation Algebra sebagai INPUT-nya.**
- **Traversal Engine** — Diperiksa (i): tanggung jawab = menelusuri graph (diperlukan Impact Propagation, `23` § 11.2, sudah dibuktikan WAJIB secara ontologis). **Diperiksa (ii): apakah ini BAGIAN Infer Engine, atau terpisah?** Diperiksa dalam: Traversal adalah MEKANISME BERGERAK di graph (BFS/DFS/dst — murni pertanyaan Design, sudah dikatalogkan `23` § 13), Infer Engine adalah LOGIKA MEMUTUSKAN apakah dua edge boleh digabung — **Traversal Engine adalah ALAT yang DIPAKAI Infer Engine, bukan Infer Engine itu sendiri.** **Lolos sebagai subsistem PENDUKUNG (dipakai Infer Engine dan Coverage Analyzer, tidak eksklusif milik satu).**
- **Coverage Analyzer** — Diperiksa (i): tanggung jawab = menghitung Coverage Completion (`23` § 8.4, definisi SUDAH ada). **Lolos.**
- **Conflict Analyzer** — Diperiksa (i): tanggung jawab = menjalankan Conflict Detection (`23` § 9, salah satu dari lima langkah asli, sudah diklasifikasi Infer § 11.1). **Diperiksa (ii): apakah ini bagian Infer Engine (karena operasinya Infer) atau terpisah?** Diperiksa dalam: Conflict Detection MEMBUTUHKAN Infer Engine (untuk membandingkan dua fakta) TAPI punya OUTPUT SPESIFIK (flag konflik, bukan edge biasa) dan ATURAN SENDIRI (kapan dua hal dianggap "bertentangan", beda dari aturan transitivitas Impact Propagation). **Lolos sebagai subsistem TERPISAH, MEMAKAI Infer Engine sebagai mesin dasarnya (pola sama dengan Relation Algebra vs Infer Engine).**
- **Explainability Engine** — Diperiksa (i): tanggung jawab = membangun `derivation_path` (`24` Completion Criterion #2, sudah wajib). **Diperiksa (ii): apakah ini TERPISAH, atau OTOMATIS bagian dari Infer Engine (karena `derivation_path` HANYA relevan untuk edge hasil Infer)?** Diperiksa dalam: `derivation_path` adalah CATATAN TAMBAHAN yang ditulis SETIAP KALI Infer Engine menghasilkan edge — **INI BUKAN subsistem terpisah, ia adalah KEWAJIBAN OUTPUT dari Infer Engine itu sendiri** (persis seperti Rule Explanation `08a` § R BUKAN subsistem terpisah dari Rule Engine, ia OUTPUT WAJIB Rule Engine). **GUGUR sebagai subsistem independen — DISERAP menjadi tanggung jawab wajib Infer Engine (dan Conflict Analyzer, yang juga menghasilkan edge butuh derivation_path).**
- **Visualization Layer** — Diperiksa (i): tanggung jawab = menampilkan graph secara visual. **Diperiksa terhadap batas Philosophy K yang sudah dikunci (`23` § 11.2):** "Impact Graph SEBAGAI SATU ARTEFAK BERNAMA adalah representasi implementasi" — Visualization adalah BENTUK PALING KONKRET dari representasi implementasi itu (bagaimana graph DITAMPILKAN ke manusia, bukan bagaimana graph BEKERJA secara struktural). **GUGUR sebagai subsistem INTI Synthesis Engine — Visualization adalah LAPISAN PRESENTASI opsional di ATAS hasil Synthesis, bukan bagian dari mesin analisisnya sendiri (persis pola representasi permukaan Rule, `08a` § I — sintaks/tampilan bukan Philosophy).**

### Hasil — Delapan Subsistem (Dua Kandidat Founder Diserap/Digugurkan)

```
Synthesis Engine
│
├── Asset Registry            (menyimpan referensi Node — implementasi Input)
├── Relationship Registry     (menyimpan Edge — implementasi Output)
│
├── Surface Engine            (menjalankan operasi Surface)
├── Infer Engine              (menjalankan operasi Infer, WAJIB emit derivation_path)
│         │
│         ├─ bergantung pada → Relation Algebra   (aturan transitivitas — ATURAN, bukan eksekusi)
│         └─ memakai         → Traversal Engine   (mekanisme bergerak di graph — ALAT, dipakai bersama)
│
├── Coverage Analyzer         (menghitung Coverage Completion, memakai Traversal Engine)
└── Conflict Analyzer         (menjalankan Conflict Detection, memakai Infer Engine, WAJIB emit derivation_path)

Explainability Engine → DISERAP (kewajiban output Infer Engine + Conflict Analyzer, bukan subsistem sendiri)
Visualization Layer   → DIKELUARKAN dari inti (lapisan presentasi opsional, bukan Philosophy K)
```

**Diperiksa Component Boundary (`13` § 11a) untuk kedelapan subsistem:** setiap subsistem punya SATU tanggung jawab yang bisa ditunjuk ke Design Contract, TIDAK ada dua subsistem dengan tanggung jawab yang sama, dan RELASI ANTAR SUBSISTEM sudah eksplisit (Infer Engine BERGANTUNG Relation Algebra, Coverage Analyzer dan Infer Engine SAMA-SAMA MEMAKAI Traversal Engine) — **batas sudah diuji SEBELUM Design Competition per-komponen dimulai, sesuai Component Boundary Rule.**

---

## K.3 Architecture Boundary Test — Level Abstraksi, Bukan Lagi "Apakah Satu Komponen"

**Diminta founder — checkpoint BARU, beda dari Component Boundary Rule (`13` § 11a, sudah dijalankan K.2). Component Boundary Rule menguji "apakah ini SATU komponen yang koheren". Architecture Boundary Test menguji "apakah SEMUA komponen yang lolos berada pada LEVEL ABSTRAKSI yang SAMA" — dua pertanyaan berbeda, dijalankan berurutan.**

**Kriteria uji per subsistem — tiga pertanyaan pembeda level (dicari dari sifat masing-masing, bukan diasumsikan dari nama):**
1. Apakah ia menyimpan STATE (data yang bertahan antar pemanggilan)?
2. Apakah ia mendefinisikan ATURAN (tanpa mengeksekusi apa pun sendiri)?
3. Apakah ia MENGEKSEKUSI proses (mengubah/menghasilkan sesuatu dari input)?

**Diuji delapan subsistem satu per satu:**

| Subsistem | Simpan State? | Definisikan Aturan? | Eksekusi Proses? | Level |
|---|---|---|---|---|
| Asset Registry | YA (referensi Node) | Tidak | Tidak (murni simpan/ambil) | **Repository** |
| Relationship Registry | YA (Edge) | Tidak | Tidak | **Repository** |
| Relation Algebra | Tidak (aturan statis, bukan data yang berubah per-pemanggilan) | YA (edge_type mana boleh digabung) | Tidak (tidak mengeksekusi, hanya DIRUJUK) | **Specification** |
| Surface Engine | Tidak (baca dari Asset, tulis ke Registry — tidak menyimpan state sendiri) | Tidak | YA (menghasilkan edge dari pembacaan) | **Engine** |
| Infer Engine | Tidak | Tidak | YA (menghasilkan edge dari kombinasi) | **Engine** |
| Traversal Engine | Tidak | Tidak | YA (menghasilkan jalur/urutan node) | **Engine** |
| Conflict Analyzer | Tidak | Tidak | YA (menghasilkan flag konflik) | **Engine** |
| Coverage Analyzer | Tidak | Tidak | YA (menghasilkan status coverage) | **Engine** |

**Hasil: dugaan founder TERBUKTI BENAR lewat pengujian eksplisit (bukan diterima karena terdengar rapi) — delapan subsistem SELAMA INI tercampur TIGA level abstraksi berbeda, persis diagnosis founder:**

```
Specification (mendefinisikan aturan, tidak dieksekusi sendiri, tidak simpan state)
  └─ Relation Algebra

Repository (menyimpan state, tidak mendefinisikan aturan, tidak eksekusi proses)
  ├─ Asset Registry
  └─ Relationship Registry

Engine (mengeksekusi proses, memakai Repository sebagai sumber/tujuan data,
        memakai Specification sebagai aturan kalau relevan)
  ├─ Surface Engine     (baca Asset → tulis Relationship Registry)
  ├─ Infer Engine       (baca Relationship Registry + Relation Algebra → tulis Relationship Registry)
  ├─ Traversal Engine   (baca Relationship Registry → hasilkan jalur, dipakai Infer/Coverage)
  ├─ Conflict Analyzer  (baca Relationship Registry, pakai Infer Engine → tulis flag konflik)
  └─ Coverage Analyzer  (baca Asset Registry + Relationship Registry, pakai Traversal → hasilkan status)
```

**Diuji Reverse Proof — apakah pembagian tiga-level ini BENAR-BENAR perlu, atau sekadar kosmetik?** Asumsikan tiga level TIDAK dipisah (tetap "delapan subsistem sejajar" seperti K.2 awal). Kontradiksi? **Diperiksa dalam:** Kalau Relation Algebra (Specification) diperlakukan SEJAJAR dengan Infer Engine (Engine yang MEMAKAINYA), Design Competition untuk KEDUANYA akan memakai KRITERIA YANG SAMA (padahal Specification diuji dari BENAR/SALAH ATURANNYA — soal konsistensi logis, sementara Engine diuji dari EFISIENSI/KORREKTNESS EKSEKUSI — soal algoritma). **Kontradiksi ditemukan: MENCAMPUR level akan membuat Design Competition Relation Algebra secara TIDAK SENGAJA mengarah ke pertanyaan implementasi (BFS/DFS) padahal seharusnya pertanyaan LOGIKA (edge_type X boleh ditransitifkan dengan edge_type Y atau tidak, dan MENGAPA).** **Pemisahan tiga-level BUKAN kosmetik — ia mencegah Design Competition berikutnya salah sasaran.**

**Konsekuensi langsung untuk urutan Design Competition (diperbarui dari K.2):** Design Competition WAJIB dimulai dari **Specification (Relation Algebra)** — bukan hanya karena Infer Engine bergantung padanya (alasan K.2), tapi karena Specification adalah level PALING DASAR (Repository menyimpan APA yang sudah ada, Engine mengeksekusi PROSES yang ATURANNYA berasal dari Specification — kalau Specification belum jelas, Engine TIDAK PUNYA DASAR untuk didesain dengan benar).

---

## K.4 Category Completeness Test — Apakah Tiga Kategori Sudah Lengkap?

**Diminta founder: risiko First Complete Taxonomy Bias — berhenti mencari kategori begitu tiga terasa rapi. Sepuluh kandidat kategori (Zero Candidate Test, ditanya SEBELUM melihat hasil K.3) digugurkan SATU PER SATU secara sadar, bukan diabaikan diam-diam.**

**Kandidat: Specification, Repository, Engine (sudah ada), PLUS Coordinator/Orchestrator, Adapter, Validator, Policy, Factory, Runtime Context, Cache — diuji terhadap tiga pertanyaan K.3 (state/aturan/eksekusi) DITAMBAH pertanyaan keempat: apakah kandidat ini punya SIFAT yang TIDAK tertangkap ketiganya?**

- **Coordinator/Orchestrator** — Diperiksa: apakah ADA subsistem yang tanggung jawabnya MENGATUR URUTAN pemanggilan subsistem LAIN (bukan mengeksekusi sendiri)? Diperiksa delapan subsistem: TIDAK ADA satu pun yang murni "mengatur urutan tanpa mengeksekusi" — urutan pemanggilan (Surface→Infer→Conflict→Coverage) SUDAH ditentukan oleh Design Contract sendiri (`24` Completion Criterion, § 9 lama `23`), bukan oleh subsistem terpisah. **Diuji pertanyaan founder langsung: "Mengapa Traversal bukan Coordinator?"** — Traversal MENGHASILKAN jalur (state baru dari input graph), Coordinator (kalau ada) akan MEMANGGIL subsistem lain TANPA menghasilkan apa pun sendiri. **Traversal Engine LOLOS sebagai Engine (menghasilkan sesuatu) — Coordinator GUGUR karena TIDAK ADA kebutuhan nyata: urutan Synthesis SUDAH linear dan tetap (bukan dinamis/kondisional yang butuh koordinator aktif).**
- **Adapter** — Diperiksa: Adapter (`14` § 20, SUDAH ADA maknanya di CECEP — menerjemahkan format CECEP↔eksternal). Diperiksa apakah Synthesis butuh MENERJEMAHKAN format ANTAR Asset yang berbeda kategori (Rule↔Integration Point)? **Diperiksa dalam:** TIDAK — Node (`23` § 11.3) SUDAH menyelesaikan ini lewat REFERENSI SERAGAM (id+kategori+link), bukan TERJEMAHAN isi. **GUGUR — kebutuhannya SUDAH terjawab oleh desain Node itu sendiri, bukan subsistem terpisah.**
- **Validator** — Diperiksa pertanyaan founder: "Mengapa Conflict Analyzer bukan Validator?" **Diperiksa dalam:** Validator (pola umum) MEMERIKSA APAKAH SESUATU MEMENUHI ATURAN, mengembalikan valid/tidak-valid TERHADAP SATU OBJEK. Conflict Analyzer MEMBANDINGKAN DUA EDGE/FAKTA satu sama lain (bukan satu objek terhadap aturan tunggal) — **beda struktur input (satu vs pasangan)**. **Diperiksa lebih dalam: apakah ADA kebutuhan Validator MURNI (memeriksa SATU edge terhadap SATU aturan, bukan perbandingan)?** Diperiksa: Relation Algebra (Specification) SENDIRI adalah ATURAN yang DIPAKAI Infer Engine untuk MEMUTUSKAN sah/tidak — **fungsi "validasi satu-objek-terhadap-aturan" SUDAH melekat di DALAM cara Infer Engine memakai Relation Algebra, bukan subsistem terpisah.** **GUGUR — fungsinya SUDAH terserap ke pasangan Specification-Engine yang ada.**
- **Policy** — Diperiksa pertanyaan founder: "Mengapa Infer bukan Policy Engine?" **Diperiksa dalam:** "Policy" (istilah CECEP sejak `08e` § A.4, diuji dan DITOLAK sebagai definisi UTAMA Rule — hanya "benar sebagian") — Policy MENANGKAP fungsi "aturan yang menentukan KEPUTUSAN dalam situasi tertentu". Relation Algebra ADALAH bentuk Policy dalam pengertian itu — **diperiksa apakah "Policy" LEBIH TEPAT dari "Specification" sebagai NAMA kategori?** Diperiksa: Specification (dari K.3) menekankan SIFAT STRUKTURAL (tidak simpan state, tidak eksekusi, definisikan aturan) — Policy menekankan FUNGSI BISNIS (keputusan situasional). **Untuk KATEGORI ARSITEKTURAL (bukan nama SATU subsistem), "Specification" LEBIH TEPAT** — konsisten pola yang SUDAH established CECEP membedakan level STRUKTURAL dari level FUNGSIONAL (persis kenapa `08e` § B memilih "Executable Knowledge Model", bukan "Policy", sebagai kategori payung Rule). **GUGUR sebagai KATEGORI terpisah — "Policy" tetap valid sebagai salah satu AI/Rule TYPE (`08d`), bukan level arsitektur Synthesis.**
- **Factory** — Diperiksa: Factory (pola umum) MENCIPTAKAN INSTANCE OBJEK BARU. Diperiksa: apakah SATU pun dari delapan subsistem "menciptakan" Node/Asset BARU? **TIDAK** — Node adalah REFERENSI ke Asset yang SUDAH ADA (`23` § 11.3, dikonfirmasi `23` § 8.3 forbidden "menciptakan Asset baru"). **GUGUR — bertentangan LANGSUNG dengan Forbidden Operations yang sudah dikunci (`24` Forbidden Operations #1). Factory TIDAK BOLEH ada di Synthesis Engine, bukan sekadar tidak dibutuhkan.**
- **Runtime Context** — Diperiksa: apakah ADA kebutuhan menyimpan STATE SEMENTARA selama SATU EKSEKUSI Synthesis berjalan (beda dari Repository yang PERMANEN)? **Diperiksa dalam:** Traversal Engine, SAAT menjalankan BFS/DFS, BUTUH state sementara (visited nodes, queue/stack) — **TAPI ini state LOKAL milik SATU Engine (Traversal), bukan dibagikan lintas-Engine.** **Diperiksa apakah state lokal ini butuh KATEGORI terpisah, atau CUKUP jadi DETAIL INTERNAL Traversal Engine?** Diperiksa: state ini TIDAK PERNAH diakses subsistem LAIN, TIDAK bertahan setelah traversal selesai — **murni detail IMPLEMENTASI di dalam SATU Engine, bukan subsistem/kategori sendiri.** **GUGUR sebagai kategori terpisah — state sementara adalah bagian INTERNAL Engine, konsisten definisi K.3 (Engine "tidak simpan state" berarti TIDAK simpan state PERMANEN LINTAS-PEMANGGILAN, bukan larangan variabel lokal selama satu eksekusi).**
- **Cache** — Diperiksa: pertanyaan founder "Mengapa Repository tidak perlu Index?" (terkait). Diperiksa: Cache adalah OPTIMASI PERFORMA (`08g` § A.15, SUDAH punya makna terkunci CECEP — "salinan sementara, boleh dibuang, TIDAK PERNAH sumber kebenaran"). **Diperiksa apakah Synthesis butuh Cache SEBAGAI KATEGORI ARSITEKTURAL, atau sebagai DETAIL OPTIMASI Repository?** Diperiksa: Cache (kalau dibutuhkan nanti untuk performa traversal skala besar, persis pola Complexity Dependency `13` § 8 — Design Space skala besar butuh bantuan) adalah OPTIMASI di ATAS Repository yang SUDAH ADA, BUKAN kategori baru — Cache TIDAK PERNAH jadi SUMBER KEBENARAN (definisi `08g` § A.15 sendiri menegaskan itu), jadi ia SELALU turunan dari Repository, tidak sejajar dengannya. **GUGUR sebagai kategori terpisah — Cache, kalau dibutuhkan, adalah detail implementasi Repository (persis Index — struktur PENDUKUNG akses cepat, bukan kategori arsitektural baru).**

**Hasil Category Completeness Test: TUJUH kandidat tambahan SEMUA gugur, dengan alasan SPESIFIK masing-masing (bukan "tidak perlu" generik):**

| Kandidat | Kenapa Gugur |
|---|---|
| Coordinator/Orchestrator | Urutan Synthesis linear-tetap, tidak butuh koordinasi dinamis |
| Adapter | Kebutuhannya sudah terjawab oleh desain Node (referensi seragam) |
| Validator | Fungsinya sudah melekat di pasangan Specification-Engine (Infer memakai Relation Algebra) |
| Policy | Nama fungsional, bukan kategori struktural — Specification lebih tepat untuk level arsitektur |
| Factory | Bertentangan LANGSUNG dengan Forbidden Operations (Synthesis tidak boleh cipta Asset baru) |
| Runtime Context | Detail internal SATU Engine, bukan kategori lintas-subsistem |
| Cache | Optimasi turunan Repository, bukan kategori sejajar (konsisten definisi Cache Data `08g` § A.15) |

**Category Completeness TERKONFIRMASI: Specification-Repository-Engine BUKAN "klasifikasi pertama yang terasa rapi" — ia BERTAHAN setelah tujuh kandidat tambahan diuji dan digugurkan dengan alasan berbeda-beda (bukan satu alasan generik diulang tujuh kali, yang akan jadi sinyal pengujian dangkal).**

---

## K.5 Layer Inversion Test — Arah Dependency Satu-Arah

**Diminta founder — diuji SETIAP pasangan kategori, dua arah, memakai contoh KONKRET dari delapan subsistem (bukan abstrak).**

**Specification ↔ Engine:**
- Specification → Engine: *"Relation Algebra mendefinisikan bahwa edge_type Ownership+Consumption TIDAK boleh ditransitifkan; Infer Engine MEMATUHI aturan itu saat mencoba menggabungkan edge."* **Bermakna — arah yang benar (Engine MEMBACA Specification sebagai input aturan).**
- Engine → Specification: *"Infer Engine mendefinisikan bahwa edge_type Ownership+Consumption tidak boleh ditransitifkan."* **Diperiksa: apakah ini bermakna?** TIDAK — kalau Engine yang "mendefinisikan" aturan, maka aturan itu TERKUBUR di dalam LOGIKA EKSEKUSI (kode), TIDAK BISA diperiksa/diubah TANPA membongkar Engine — **persis pelanggaran First Principle 4 (`04` § 4, Configured Data BUKAN Hardcoded Code) yang sudah dikunci sejak Phase C.** **Arah TERBALIK tidak bermakna — boundary Specification↔Engine BENAR (satu arah).**

**Repository ↔ Engine:**
- Repository → Engine: *"Asset Registry MENGATUR bagaimana Surface Engine boleh membaca Asset."* **Diperiksa: apakah ini bermakna?** TIDAK — Repository (murni simpan/ambil, K.3) TIDAK PUNYA LOGIKA untuk "mengatur" apa pun, ia PASIF. **Arah ini TIDAK bermakna — dikonfirmasi Repository→Engine TIDAK valid (persis dugaan founder).**
- Engine → Repository: *"Surface Engine MEMBACA dari Asset Registry, MENULIS ke Relationship Registry."* **Bermakna — arah yang benar (Engine AKTIF memanggil Repository sebagai penyimpanan pasif).**

**Specification ↔ Repository:**
- Specification → Repository: *"Relation Algebra menyatakan edge_type apa yang SAH — Repository (Relationship Registry) HANYA menyimpan edge yang jenisnya dikenal dalam katalog `14` § 11.3 + hasil Infer."* **Diperiksa: apakah ini bermakna sebagai DEPENDENCY (bukan sekadar dua fakta yang kebetulan terkait)?** Diperiksa dalam: Repository TIDAK MEMBACA Relation Algebra secara AKTIF (Repository tidak py logika VALIDASI) — Repository HANYA menyimpan APAPUN yang dikirim Engine. **Tidak ada dependency LANGSUNG Specification→Repository (Repository tidak "tahu" Relation Algebra ada) — hubungan mereka HANYA lewat PERANTARA Engine (Specification→Engine→Repository), BUKAN langsung.**
- Repository → Specification: *"Asset Registry menentukan aturan transitivitas."* **TIDAK bermakna sama sekali** (Repository murni data, tidak punya konsep "aturan"). **Kedua arah LANGSUNG tidak bermakna — dikonfirmasi Specification dan Repository TIDAK BERELASI LANGSUNG, keduanya hanya bertemu LEWAT Engine.**

**Hasil Layer Inversion Test — SEMUA pasangan diperiksa, tabel akhir:**

| Pasangan | Arah A→B Bermakna? | Arah B→A Bermakna? | Vonis |
|---|---|---|---|
| Specification → Engine | YA | TIDAK | ✅ Satu arah, benar |
| Repository → Engine | TIDAK | YA (Engine→Repository) | ✅ Satu arah, benar |
| Specification → Repository | TIDAK LANGSUNG (lewat Engine) | TIDAK | ✅ Tidak ada dependency langsung — VALID (tiga level TETAP terpisah bersih, tidak ada jalur pintas) |

**Diuji Reverse Proof — apakah ADA satu pasang yang AMBIGU (dua arah SAMA-SAMA bisa bermakna)?** Diperiksa ULANG ketiga pasangan di atas — TIDAK ditemukan pasangan yang dua arahnya SAMA-SAMA bermakna. **Layer Inversion Test LOLOS PENUH — layering Specification→Engine→Repository (dengan Specification dan Repository TIDAK berelasi langsung) adalah struktur yang STABIL, satu arah, tanpa kebocoran boundary.**

---

## Assumptions (K.2)

1. Delapan subsistem diasumsikan LENGKAP berdasarkan pengujian sepuluh kandidat founder — kalau Design Competition per-komponen (langkah berikutnya) menemukan kebutuhan subsistem kesembilan, itu ditambahkan DENGAN pengujian Component Boundary yang sama, bukan diasumsikan otomatis perlu.
2. Relasi "Infer Engine bergantung Relation Algebra" dan "Coverage Analyzer + Infer Engine sama-sama memakai Traversal Engine" diasumsikan benar berdasarkan analisis tanggung jawab — belum diuji Reverse Proof formal (kriteria K.2 lebih longgar dari Philosophy, sesuai sifat Design yang boleh direvisi tanpa level pembuktian Philosophy).

## Open Questions (K.2-K.5)

1. Design Competition per-komponen — BELUM dijalankan. Urutan: **Specification (Relation Algebra) dulu** — dikonfirmasi TIGA KALI dengan alasan berlapis (K.2: dependency Infer Engine; K.3: level paling dasar; K.5: satu-satunya yang punya arah dependency KELUAR ke Engine tanpa bergantung apa pun di atasnya).
2. Apakah kedua Repository (Asset Registry, Relationship Registry) butuh Design Competition terpisah atau satu putaran — dicatat untuk diperiksa saat gilirannya tiba.
3. Kalau kelak Cache/Index dibutuhkan untuk performa (K.4 — GUGUR sebagai kategori, tapi SAH sebagai detail implementasi Repository), desain konkretnya ditunda ke saat Repository benar-benar didesain, bukan diantisipasi sekarang.

## Status

**Design Contract, K.2 (Architecture Decomposition), K.3 (Architecture Boundary Test), K.4 (Category Completeness Test), dan K.5 (Layer Inversion Test) selesai — empat checkpoint berlapis sebelum Design Competition pertama.**

K.2: delapan subsistem dipetakan, dua kandidat (Explainability Engine, Visualization Layer) tidak lolos Component Boundary. K.3: delapan subsistem TERBUKTI mencampur tiga level abstraksi (Specification/Repository/Engine), dikonfirmasi lewat tiga pertanyaan pembeda dan Reverse Proof.

**K.4 (diminta founder, melawan First Complete Taxonomy Bias): tiga kategori DIUJI ULANG terhadap tujuh kandidat tambahan (Coordinator, Adapter, Validator, Policy, Factory, Runtime Context, Cache) — SEMUA gugur, masing-masing dengan alasan SPESIFIK berbeda** (Factory bahkan bertentangan LANGSUNG dengan Forbidden Operations yang sudah dikunci — bukan sekadar "tidak perlu"). Kategori Specification-Repository-Engine TERKONFIRMASI lengkap, bukan klasifikasi pertama yang kebetulan rapi.

**K.5 (Layer Inversion Test): SEMUA pasangan kategori diuji dua arah dengan contoh konkret — tidak ditemukan satu pasangan pun yang ambigu.** Specification→Engine valid, arah balik melanggar First Principle 4 (Configured Data bukan Hardcoded Code). Repository→Engine tidak valid (Repository pasif, tidak "mengatur"), Engine→Repository valid. Specification dan Repository TIDAK berelasi langsung sama sekali — hanya bertemu lewat Engine, memperkuat (bukan melemahkan) kebersihan layering.

**Fondasi arsitektur Phase K sekarang stabil pada empat lapis pengujian berbeda (komponen tunggal, level abstraksi, kelengkapan kategori, arah dependency).** Siap masuk Design Competition pertama: **Relation Algebra (Specification)**.
