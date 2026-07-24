# CECEP — Phase K: Full Design (Repository, Engines, Interaction, Validation, Freeze)

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Kelanjutan langsung [`25`](25-phase-k6-relation-algebra-atom.md) (K.6, Relation Algebra frozen). Menuntaskan Design K sampai maturitas setara G/H/I/J: Repository, lima Engine, Interaction/Dependency Graph, Algorithm Boundary, Reality Stress Validation (10 kelompok), Dependency Audit, Freeze, Transition Brief K→L. Mengikuti seluruh disiplin metodologi yang sudah established — tidak ada metodologi baru diperkenalkan kecuali genuinely dibutuhkan.

---

# BAGIAN 1 — REPOSITORY DESIGN

## 1.1 Component Boundary Rule, Dijalankan Ulang untuk Repository

**Diperiksa: apakah Asset Registry dan Relationship Registry (K.2, `24`) masih SATU tanggung jawab masing-masing setelah K.6A-D memperkaya struktur Edge (edge_type kategori, derivation_path, operation)?**

**Asset Registry** — tanggung jawab: menyimpan Node (referensi ke Asset frozen G-J). **Diuji ulang (i) tanggung jawab tunggal:** YA, murni penyimpanan referensi. **(ii) tidak tumpang tindih:** dibandingkan Relationship Registry (Edge) — beda objek (Node vs Edge), tidak tumpang tindih. **Lolos, tidak berubah dari K.2.**

**Relationship Registry** — tanggung jawab: menyimpan Edge (hasil Surface + Infer, dengan `edge_type`, `operation`, `derivation_path`). **Diuji: apakah struktur Edge yang sekarang lebih kaya (K.6) mengubah tanggung jawab Registry?** Diperiksa dalam: TIDAK — Registry tetap murni PENYIMPANAN, kekayaan struktur Edge adalah SKEMA yang disimpan, bukan LOGIKA baru yang harus dijalankan Registry. **Lolos.**

## 1.2 Decision Competition — Storage Model

**Diuji Reverse Proof dulu: apakah Storage Model adalah pertanyaan Design (bagaimana) atau masih tersisa Specification (apa)?** Diperiksa terhadap Decision Boundary (`23` § 13): "PostgreSQL vs Neo4j" sudah dikatalogkan sebagai Design sejak `23` § 13. **Tapi ada pertanyaan STRUKTURAL yang MENDAHULUI pilihan teknologi: apakah Registry butuh menyimpan HISTORY (versi lama Node/Edge) atau hanya STATE TERKINI?**

**Diuji Reverse Proof:** Asumsikan Registry HANYA menyimpan state terkini (tanpa history). Kontradiksi? **Ya** — Asset Relationship Graph (`23` § 12) dikonfirmasi TIDAK PERNAH Frozen permanen, ia HIDUP mengikuti perubahan Asset (`23` § 10.4) — TAPI Explainability (Completion Criterion `24` #2, `derivation_path`) MENSYARATKAN edge hasil Infer bisa DITELUSURI BALIK — kalau Node/Edge sumber SUDAH BERUBAH (Asset di-update di fase asalnya) TANPA jejak versi lama, `derivation_path` yang merujuk ke state LAMA jadi TIDAK BISA diverifikasi lagi. **Kontradiksi ditemukan — Registry WAJIB append-only/versioned (bukan overwrite), konsisten Foundational Principle Ketiga (`04` § 1, Everything is Versioned) yang SUDAH berlaku universal di CECEP.**

**Keputusan Storage Model (Specification-level, bukan implementasi):** Registry APPEND-ONLY — Node/Edge baru TIDAK PERNAH menimpa yang lama, perubahan Asset menghasilkan ENTRI BARU dengan `observed_at` timestamp, entri lama tetap ada untuk Explainability historis. **Bentuk fisik (tabel SQL vs graph DB) tetap Design/Implementation, TIDAK dibahas di sini.**

## 1.3 Ownership, Lifecycle, Interface, Constraints

**Ownership (siapa berwenang menulis Registry):** Diuji Reverse Proof — Asumsikan Registry bisa ditulis SIAPA SAJA (Rule, Integration Point, dll. langsung). Kontradiksi? **Ya** — ini melanggar Forbidden Operations (`24` #2, "Synthesis tidak mengubah Asset") secara TERBALIK (Asset yang menulis balik ke Synthesis, bukan Synthesis yang menulis Asset — TAPI SAMA-SAMA melanggar batas Layer 5 murni yang sudah dikunci `23` § 8.3). **Keputusan: HANYA Engine (Surface/Infer/Conflict) yang boleh menulis Registry — konsisten Layer Inversion Test (`24` K.5): Engine→Repository valid satu arah, TIDAK ADA aktor lain yang boleh menulis langsung.**

**Lifecycle Registry (bukan Lifecycle isi):** Diperiksa — apakah Registry ITU SENDIRI (sebagai komponen) punya Lifecycle seperti Integration Point (Draft→Active→Deprecated)? Diuji Reverse Proof: Asumsikan YA. Kontradiksi? **Ya** — Registry adalah INFRASTRUKTUR PENYIMPANAN yang SELALU aktif selama Synthesis Engine berjalan (persis dikonfirmasi K.3 — Repository murni state, tidak punya proses sendiri yang bisa "Draft" atau "Deprecated"). **Registry TIDAK punya Lifecycle sendiri — konsisten temuan `23` § 10.4 (yang dibekukan metodologi, bukan instance data) diterapkan level lebih dalam: bahkan KOMPONEN PENYIMPANANNYA sendiri tidak py Lifecycle, hanya ISINYA (Node/Edge individual) yang punya `observed_at` versioning.**

**Interface (kontrak akses, level Specification):**
```
AssetRegistry {
  register(asset_id, source_category, source_reference) → Node
  lookup(asset_id) → Node | NOT_FOUND
  list_by_category(source_category) → [Node]
}
RelationshipRegistry {
  record(from_node, to_node, edge_type, operation, derivation_path?) → Edge
  query(from_node?, to_node?, edge_type?) → [Edge]
  history(node_id) → [Edge] (semua versi, append-only, § 1.2)
}
```

**Constraints:** (a) `register()` HANYA boleh dipanggil Surface Engine (Node berasal dari Asset yang di-Surface, bukan diciptakan bebas — konsisten Forbidden Operations). (b) `record()` HANYA boleh dipanggil Surface/Infer/Conflict Engine. (c) TIDAK ADA operasi `delete` — append-only (§ 1.2), konsisten "Historical Data tidak pernah dihapus" (`08g` § A.7).

---

# BAGIAN 2 — ENGINE DESIGN

**Untuk setiap Engine: Decision Competition (kalau ada pilihan struktural), Boundary Review, Reverse Proof, lalu Responsibility/Input/Output/Invariant/Forbidden/Explainability.**

## 2.1 Surface Engine

**Boundary Review:** tanggung jawab = menjalankan operasi Surface (`23` § 11.1) — membaca relasi EKSPLISIT dari Asset, menghasilkan Edge dengan `operation: "surface"`.

**Decision Competition — bagaimana relasi eksplisit "ditemukan" dari Asset?** Kandidat: (A) Parser terstruktur (membaca field `action`/`trigger` dari struktur Rule/Integration Point yang SUDAH terstruktur, `08a` § I, `14` § 22.6). (B) Manual Registration (manusia mendaftarkan relasi satu-satu). (C) Annotation (Asset ditandai manual dengan metadata relasi). (D) Hybrid.

**Diuji Reverse Proof masing-masing:** (B) Manual Registration — Asumsikan ini benar. Kontradiksi? **Ya** — SEMUA Asset (`08c v2`, `14` § 22.6, `18` struktur final) SUDAH punya field terstruktur yang EKSPLISIT menyatakan relasi (`action: Panggil CAP-013`, dll.) — memaksa manusia mendaftarkan ULANG secara manual adalah DUPLIKASI KERJA dan RENTAN human error, bertentangan dengan `04` § 1 Foundational Principle Keempat ("Everything is Derived, Nothing is Re-entered"). **GUGUR.** (C) Annotation — sama kontradiksi (data relasi SUDAH ada di struktur Asset, tidak perlu anotasi terpisah). **GUGUR.** (A) Parser — Diuji: SEMUA Asset (`08a` § I, `14` § 22.6, `17` § 13, `20` § 9) punya struktur field yang SUDAH terdefinisi FORMAL — Parser MEMBACA field itu langsung. **Tidak ada kontradiksi, konsisten "Everything is Derived".** **MENANG.**

**Struktur:**
```
SurfaceEngine {
  Input: Asset (Rule/Integration Point/AI Meta Model/Design Space Entry, terstruktur)
  Output: Edge[] dengan operation="surface", derivation_path=null (Surface tidak
          punya jejak turunan — ia ADALAH sumber)
  Invariant: SETIAP edge yang dihasilkan Surface WAJIB bisa ditelusuri balik ke
             SATU field KONKRET di SATU Asset (mis. Rule-001.action) — tanpa
             field itu, edge TIDAK BOLEH dibuat (mencegah "surface palsu")
  Forbidden: Menyimpulkan relasi dari KOMBINASI dua Asset (itu domain Infer Engine)
  Explainability: field `source_field` (BARU, ditambahkan di sini) mencatat field
                  ASET ASAL yang dibaca — pelengkap derivation_path yang null
}
```

## 2.2 Infer Engine

**Boundary Review:** tanggung jawab = menjalankan operasi Infer (IR-1: Execution-transitif, § K.6B) — MENGGABUNGKAN dua Edge Surface/Infer yang berbagi node jadi Edge baru.

**Decision Competition — bagaimana kombinasi edge diputuskan?** Kandidat: (A) Rule Engine (memakai struktur if-then generik). (B) Logic Engine (memakai logika formal/predicate calculus). (C) Pattern Engine (pencocokan pola graph). (D) Constraint Engine (memakai constraint solver).

**Diuji Reverse Proof:** (D) Constraint Engine — Constraint Solver (mis. SAT solver) MENCARI SOLUSI yang MEMENUHI SEMUA constraint SEKALIGUS (global optimization) — TAPI IR-1/IR-3/IR-5 (`25` § K.6B) adalah ATURAN LOKAL per-pasangan-edge, TIDAK butuh solusi global. **GUGUR — overkill, salah kategori masalah (sudah pola yang sama seperti SAT Solver gugur jadi definisi AI, `17` § 8).** (B) Logic Engine — predicate calculus penuh LEBIH GENERIK dari yang dibutuhkan (IR-1/IR-3/IR-5 adalah TIGA aturan SPESIFIK, bukan sistem logika terbuka). **GUGUR — overkill.** (C) Pattern Engine — pencocokan pola COCOK untuk MENEMUKAN pasangan edge yang relevan (traversal-adjacent), TAPI tidak menangkap STRUKTUR when-condition-then (`25` § 3) dengan tepat. **Diperiksa dalam: Pattern Engine LEBIH DEKAT ke Traversal Engine (§ 2.3) daripada Infer Engine.** **GUGUR sebagai Infer Engine, relevan untuk komponen lain.** (A) Rule Engine — struktur if-then GENERIK PERSIS cocok dengan Inference Rule (when-condition-then, `25` § 3) — **konsisten LANGSUNG dengan Rule Definition CECEP sendiri (`08a` § I) yang JUGA struktur if-then.** **MENANG — dan MENARIK: Infer Engine, secara STRUKTURAL, adalah INSTANCE dari pola Executable Knowledge Model (Rule) yang SUDAH ada — bukan konsep baru, REUSE pola Phase G (Reuse Dependency, `18` § 11).**

**Struktur:**
```
InferEngine {
  Input: Edge[] dari Relationship Registry (hasil Surface + Infer sebelumnya) +
         Relation Algebra (IR-1, IR-3, IR-5)
  Output: Edge[] baru dengan operation="infer", derivation_path=[edge IDs yang
          digabung]
  Invariant: SETIAP edge hasil Infer WAJIB py derivation_path TIDAK KOSONG,
             menelusuri balik SAMPAI KE edge Surface (Explainability tuntas,
             tidak boleh derivation_path berhenti di edge Infer lain tanpa
             akhir)
  Forbidden: Menjalankan IR-2 (Extension, belum terbukti perlu) KECUALI
             instance nyata ditemukan Coverage Analysis — mencegah over-eager
             inference
  Explainability: derivation_path WAJIB (Completion Criterion `24` #2)
}
```

## 2.3 Traversal Engine

**Boundary Review:** tanggung jawab = MEKANISME bergerak di graph (dipakai Infer Engine untuk menemukan pasangan edge yang berbagi node, dipakai Coverage Analyzer untuk menjangkau semua Node).

**Decision Competition — algoritma traversal (KATALOG Design, `23` § 13, TAPI keputusan STRUKTURAL "yang mana dipakai kapan" bukan sekadar detail bebas):** Kandidat: BFS, DFS, Bidirectional, Incremental, Priority.

**Diuji terhadap DUA kebutuhan berbeda (Infer Engine vs Coverage Analyzer) — apakah SATU algoritma cukup untuk keduanya?** Diperiksa: Infer Engine butuh MENEMUKAN PASANGAN edge yang BERBAGI NODE (operasi LOKAL, per-node, tidak perlu urutan tertentu) — BFS/DFS SAMA-SAMA valid, tidak ada pembeda struktural. Coverage Analyzer butuh MENJANGKAU SEMUA Node (operasi GLOBAL, lengkap) — BFS/DFS SAMA-SAMA valid untuk MENJANGKAU SEMUA, TAPI **Incremental** (hanya proses Node BARU sejak traversal terakhir) RELEVAN untuk Coverage karena Registry APPEND-ONLY (§ 1.2) — mengulang traversal PENUH setiap kali TIDAK EFISIEN. **Diuji Reverse Proof: apakah Incremental adalah keputusan STRUKTURAL atau DETAIL implementasi?** Diperiksa: Incremental BUKAN soal "BFS vs DFS" (murni urutan kunjungan, Design) — Incremental adalah soal APAKAH TRAVERSAL PERLU MENGINGAT STATE ANTAR-PEMANGGILAN (structural, karena Traversal Engine dikonfirmasi K.3 "tidak simpan state PERMANEN" — Incremental butuh state PERMANEN berupa "sudah sampai mana"). **Kontradiksi ditemukan: Incremental Traversal butuh state permanen (checkpoint) — TAPI Traversal Engine (K.3) TIDAK BOLEH simpan state permanen (itu tanggung jawab Repository).**

**Resolusi: checkpoint traversal (state permanen "terakhir diproses sampai mana") DISIMPAN di Repository (Asset Registry, field tambahan `last_traversed_at` per Node — persis pola `last_reviewed_at` Design Space Entry, `21`), BUKAN di Traversal Engine — Traversal Engine tetap STATELESS (K.3 dipertahankan), Incremental behavior DICAPAI lewat Traversal Engine MEMBACA checkpoint dari Repository sebelum mulai, BUKAN menyimpannya sendiri.**

**Struktur:**
```
TraversalEngine {
  Input: Relationship Registry (Edge graph) + starting node(s) + traversal mode
  Output: Node[] terjangkau (urutan tergantung BFS/DFS, Design) + edges terlewati
  Invariant: STATELESS antar pemanggilan (checkpoint dibaca dari Repository,
             tidak disimpan internal)
  Forbidden: Mengubah Registry (Traversal hanya MEMBACA)
  Explainability: mengembalikan JALUR yang ditempuh (dipakai derivation_path
                  oleh pemanggil — Infer/Coverage Engine)
}
```

## 2.4 Conflict Analyzer

**Boundary Review:** tanggung jawab = menjalankan IR-5 (§ K.6C) — membandingkan pasangan klaim, menghasilkan Edge `edge_type: "conflict"`.

**Decision Competition:** sudah diuji `24` K.4 (Validator gugur, Conflict Analyzer MEMAKAI Infer Engine sebagai mesin dasar) — DIPERIKSA ULANG apakah "memakai Infer Engine" masih tepat setelah IR-5 dikonfirmasi KELUARGA BERBEDA dari IR-1/IR-3 (§ K.6B, "Compare bukan Combine"). **Diuji Reverse Proof:** Asumsikan Conflict Analyzer TETAP memakai Infer Engine yang sama. Kontradiksi? **Ya** — Infer Engine (§ 2.2) dirancang untuk MENGGABUNGKAN edge (Rule Engine, if-then pada PASANGAN EDGE) — IR-5 beroperasi pada PASANGAN KLAIM, TIDAK MELALUI edge penghubung sama sekali (`25` § 7.2, dikonfirmasi eksplisit). **Kontradiksi ditemukan — Conflict Analyzer TIDAK bisa memakai Infer Engine yang sama, ia butuh MEKANISME SENDIRI (bukan subset Infer Engine seperti diasumsikan `24` K.2/K.4).**

**Revisi Boundary:** Conflict Analyzer adalah Engine INDEPENDEN (bukan "memakai Infer Engine"), dengan pola KERJA BERBEDA: membaca SEMUA klaim relevan (dari Registry, terutama Design Space Entry `20`/`21` yang SUDAH py mekanisme Conflicting Entries) dan Asset lain yang punya "klaim" (mis. dua Rule dengan Priority sama, `08a` § P), MEMBANDINGKAN PASANGAN (bukan traversal graph — cukup FILTER+COMPARE, bisa memakai Traversal Engine HANYA untuk mengumpulkan kandidat, bukan untuk logikanya).

**Struktur:**
```
ConflictAnalyzer {
  Input: Node[] dengan klaim (dari Repository, difilter kategori yang relevan)
  Output: Edge[] dengan edge_type="conflict", operation="infer" (tetap Infer
          secara EPISTEMIK — turunan dari perbandingan, bukan eksplisit tertulis
          — tapi MEKANISME internal beda dari Infer Engine § 2.2)
  Invariant: Konflik HANYA ditandai antara klaim dengan atribut+konteks SAMA
             (definisi IR-5, `25` § K.6C) — TIDAK boleh false-positive dari
             kemiripan permukaan
  Forbidden: Menyelesaikan konflik (hanya MENANDAI — resolusi domain manusia/
             Approval, konsisten batas Synthesis § 8.3 `23`)
  Explainability: derivation_path menunjuk KEDUA klaim yang dibandingkan +
                  atribut/konteks yang membuatnya dianggap konflik
}
```

**Ini TEMUAN PENTING dari Reverse Proof di atas** — dicatat untuk K.6/24 revisi (lihat § Konsolidasi di bawah): Conflict Analyzer BUKAN "memakai Infer Engine" seperti diasumsikan `24` K.2/K.4, ia Engine INDEPENDEN kelima yang setara level dengan Infer Engine, bukan turunannya.

## 2.5 Coverage Analyzer

**Boundary Review:** tanggung jawab = menghitung Coverage Completion (`23` § 8.4) — membandingkan daftar Asset ADA (dari fase G-J) vs yang SUDAH di-Surface.

**Decision Competition:** TIDAK banyak kandidat struktural (operasi murni SET COMPARISON) — diuji Reverse Proof singkat: Asumsikan Coverage butuh LOGIKA KOMPLEKS (bukan sekadar perbandingan set). Kontradiksi? **Ya** — sudah dikonfirmasi `23` § 7.4 (Coverage Analysis = Surface, murni pencocokan daftar, bukan Infer). **Tidak ada Decision Competition tambahan dibutuhkan — struktur sudah cukup sederhana dari Philosophy.**

**Struktur:**
```
CoverageAnalyzer {
  Input: Asset Registry (semua Node terdaftar) vs katalog Asset frozen G-J
         (sumber kebenaran independen — daftar Rule/Integration Point/dst
         yang ADA di dokumen, bukan yang SUDAH di-Registry)
  Output: CoverageStatus { total_asset, covered_asset, gap: [Asset yang
          belum di-Surface] }
  Invariant: Coverage 100% TIDAK PERNAH permanen (Asset baru terus muncul,
             `23` § 8.4) — status adalah SNAPSHOT, bukan janji permanen
  Forbidden: Menganggap Coverage 100% berarti graph FINAL (kontradiksi § K.6D
             — graph hidup terus)
  Explainability: `gap` list sendiri ADALAH bentuk explainability (menunjukkan
                  PERSIS Asset mana yang belum diproses)
}
```

---

# BAGIAN 3 — INTERACTION DESIGN & DEPENDENCY GRAPH

## 3.1 Dependency Graph Final (Delapan Komponen, Direvisi dari Temuan § 2.4)

```
Specification
  └── Relation Algebra (IR-1, IR-3, IR-5, vocabulary 6 kategori)

Repository
  ├── Asset Registry       (field tambahan: last_traversed_at, § 2.3)
  └── Relationship Registry (append-only, § 1.2)

Engine (SEMUA membaca Repository, SEMUA bergantung Specification kalau relevan)
  ├── Surface Engine      → menulis Registry, TIDAK bergantung Relation Algebra
  ├── Infer Engine        → menulis Registry, BERGANTUNG Relation Algebra (IR-1, IR-3)
  ├── Traversal Engine    → HANYA membaca Registry, dipakai Infer + Coverage + Conflict
  ├── Conflict Analyzer   → menulis Registry, BERGANTUNG Relation Algebra (IR-5),
  │                          INDEPENDEN dari Infer Engine (revisi § 2.4)
  └── Coverage Analyzer   → HANYA membaca Registry + katalog Asset eksternal
```

## 3.2 Validasi — No Cyclic Dependency

**Diuji lewat penelusuran manual (graph kecil, 8 node — bisa diverifikasi langsung tanpa algoritma):** Specification tidak bergantung apa pun. Repository tidak bergantung apa pun (murni pasif). Engine bergantung Repository dan/atau Specification, TIDAK ADA Engine yang bergantung Engine lain SECARA STRUKTURAL (Traversal Engine DIPAKAI oleh Infer/Coverage/Conflict, tapi ini pola PEMANGGILAN, bukan Traversal bergantung mereka — arah tetap satu: Infer/Coverage/Conflict → Traversal, bukan sebaliknya). **Tidak ditemukan siklus.**

## 3.3 Validasi — No Layer Inversion (Diuji Ulang dengan Komponen Lengkap, Bukan Hanya Tiga Kategori K.5)

**K.5 (`24`) menguji ANTAR KATEGORI. Sekarang diuji ANTAR KOMPONEN KONKRET dalam kategori Engine yang sama (Traversal vs Infer/Coverage/Conflict) — apakah ADA layer inversion DI DALAM kategori Engine sendiri?**

- Infer Engine → Traversal Engine: *"Infer Engine memanggil Traversal untuk menemukan pasangan node bertetangga."* **Bermakna.**
- Traversal Engine → Infer Engine: *"Traversal Engine memanggil Infer untuk memutuskan arah jalan."* **Diperiksa: TIDAK bermakna** — Traversal murni MEKANISME BERGERAK (BFS/DFS), TIDAK PERNAH butuh keputusan "boleh digabung atau tidak" untuk SEKADAR bergerak dari node ke node bertetangga. **Satu arah, valid.**

**Tidak ditemukan inversion baru di dalam kategori Engine.**

## 3.4 Validasi — No Responsibility Leakage

**Diperiksa SETIAP Engine terhadap Forbidden Operations masing-masing (§ Bagian 2) — apakah ADA overlap tanggung jawab yang TIDAK ketahuan sebelumnya?** Diperiksa ulang KHUSUS temuan § 2.4 (Conflict Analyzer independen): apakah sekarang ADA DUPLIKASI antara Infer Engine dan Conflict Analyzer (dua-duanya "menghasilkan Edge dari perbandingan")? **Diperiksa dalam:** TIDAK — Infer Engine beroperasi PADA EDGE (Combine dua edge existing), Conflict Analyzer beroperasi PADA KLAIM/NODE (Compare dua node/klaim TANPA edge penghubung) — INPUT BERBEDA JENIS, tidak ada overlap. **Tidak ditemukan leakage.**

---

# BAGIAN 4 — ALGORITHM BOUNDARY (Verifikasi Final)

**Diperiksa SETIAP keputusan di Bagian 1-3 — apakah ADA yang diam-diam menjadi keputusan algoritma/implementasi (BFS/DFS spesifik, skema tabel SQL, index konkret, caching, paralelisme)?**

| Keputusan di Bagian 1-3 | Level |
|---|---|
| Registry APPEND-ONLY (§ 1.2) | Specification (properti struktural, BUKAN pilihan DB) |
| Parser sebagai mekanisme Surface (§ 2.1) | Specification (KATEGORI mekanisme, BUKAN parser library spesifik) |
| Rule Engine sebagai mekanisme Infer (§ 2.2) | Specification (KATEGORI mekanisme, BUKAN engine library spesifik) |
| Checkpoint di Repository bukan Traversal Engine (§ 2.3) | Specification (STRUKTUR kepemilikan state, BUKAN skema tabel) |
| Conflict Analyzer independen (§ 2.4) | Specification (BOUNDARY tanggung jawab, BUKAN algoritma banding) |
| BFS vs DFS spesifik | **TIDAK DIPUTUSKAN — tetap Design/Implementation** |
| Neo4j vs PostgreSQL | **TIDAK DIPUTUSKAN — tetap Design/Implementation** |
| Index/Cache konkret | **TIDAK DIPUTUSKAN — tetap Design/Implementation** |
| Paralelisme | **TIDAK DIPUTUSKAN — tetap Design/Implementation** |

**Terverifikasi: seluruh Bagian 1-3 tetap di level Specification/Architecture, TIDAK ADA yang bocor ke Algorithm/Implementation.** Konsisten Decision Boundary (`23` § 13).

---

# BAGIAN 5 — REALITY STRESS VALIDATION (K.1, Sepuluh Kelompok)

**Musuh Phase K berbeda dari G/H/I/J — bukan logika internal (G), dunia luar (H), penalaran (I), atau epistemologi (J), tapi INTEGRITAS PEMETAAN (apakah graph yang dihasilkan Synthesis benar-benar merepresentasikan Asset G-J dengan akurat, lengkap, dan konsisten).**

## Kelompok 1 — Contradictory Graph

**1.1** Dua edge Surface (langsung dari Asset) yang SALING BERTENTANGAN (mis. Rule-001 py `action` yang menyiratkan Ownership atas Integration Point X, TAPI Integration Point X py `business_owner` yang berbeda). **Diperiksa:** Ini SEBENARNYA kasus IR-5 (Conflict) — TAPI sumbernya BUKAN dua klaim eksplisit yang sama-sama Design Space Entry, ia dua EDGE SURFACE yang tertulis eksplisit di Asset BERBEDA. **Diuji apakah IR-5 (§ K.6C) mencakup ini:** definisi IR-5 ("pasangan klaim, atribut sama, konteks sama, nilai berlawanan") TIDAK membatasi sumber klaim harus Design Space Entry — **cocok, IR-5 mencakup kasus ini.** **Model bertahan, tidak ditemukan celah baru.**

## Kelompok 2 — Cyclic Dependencies

**2.1** Rule A → Rule B → Rule C → Rule A (siklus, SUDAH dijamin TIDAK MUNGKIN terjadi di baseline `08k` § 3-4, DFS extended). **Diperiksa: apakah Synthesis (yang MEMBACA edge yang sudah ada) bisa MENCIPTAKAN siklus BARU lewat Infer (IR-1)?** Diuji: IR-1 menggabungkan A→B dan B→C jadi A→C (edge BARU, `edge_type: impact`) — **kalau kelak ADA edge C→A (Surface, eksplisit), maka A→C (Infer) + C→A (Surface) MEMBENTUK SIKLUS PADA LEVEL IMPACT, meski Rule aslinya (Composition/Trigger) TIDAK bersiklus (dijamin `08k`).** **CELAH DITEMUKAN — siklus BISA muncul di LEVEL EDGE HASIL INFER meski tidak ada di level Surface asli.**

**Perbaikan (non-ACR):** SCC Detection (sudah dikatalogkan Design, `23` § 13/`25` § 7.5) WAJIB dijalankan SETELAH setiap batch Infer selesai, BUKAN hanya sekali di akhir — kalau siklus ditemukan pada level `edge_type: impact`, itu TIDAK melanggar baseline Rule (`08k` tetap valid, siklusnya HANYA ada di layer INTERPRETASI Impact, bukan Composition asli) — TAPI WAJIB ditandai `derived_cycle_flag` supaya tidak disalahartikan sebagai siklus Rule asli.

## Kelompok 3 — Missing Registry

**3.1** Infer Engine mencoba menggabungkan edge, TAPI SATU edge sumbernya TERNYATA belum ter-Registry (Surface belum jalan untuk Asset itu). **Diperiksa:** Ini PERSIS kasus yang Coverage Analysis dirancang mendeteksi (`gap` list, § 2.5) — TAPI Coverage BERJALAN TERPISAH dari Infer (tidak sinkron real-time). **Perbaikan (non-ACR):** Infer Engine WAJIB memeriksa keberadaan KEDUA node sumber di Registry SEBELUM mencoba menggabungkan (precondition check) — kalau salah satu TIDAK ADA, Infer DITAHAN untuk pasangan itu (bukan error, `low_coverage_pending` flag), bukan diam-diam dilewati.

## Kelompok 4 — Inconsistent Relation

**4.1** Edge yang SAMA (Node A ke Node B) di-Surface DUA KALI dengan `edge_type` BERBEDA (mis. Rule Definition versi lama menyatakan "Ownership", versi baru "Consumption" — Asset berubah, Registry append-only mencatat KEDUANYA). **Diperiksa terhadap § 1.2 (append-only):** Ini BUKAN kontradiksi — Registry MEMANG dirancang menyimpan KEDUA versi (dengan `observed_at` berbeda). **Diuji: apakah QUERY terhadap Registry bisa SALAH mengambil versi LAMA sebagai "kebenaran saat ini"?** **Celah ditemukan** — interface `query()` (§ 1.3) TIDAK eksplisit menyatakan "ambil versi TERBARU saja". **Perbaikan (non-ACR):** `query()` WAJIB default ke versi TERBARU (`observed_at` maksimum) KECUALI eksplisit diminta `history()` — konsisten pola Integration Point (Active vs Deprecated, hanya versi Active yang dipakai default).

## Kelompok 5 — Incomplete Coverage

**5.1** Coverage mencapai 99%, TAPI 1% yang tersisa adalah Asset KATEGORI BARU yang Surface Engine BELUM PUNYA PARSER untuknya (mis. kategori Asset masa depan dari Phase L). **Diperiksa:** Ini KASUS YANG SAMA dengan Kelompok 9 (Unknown Future Asset Types) — didiskusikan bersama di sana untuk menghindari duplikasi.

## Kelompok 6 — Repository Corruption

**6.1** Relationship Registry menyimpan Edge yang MERUJUK Node yang TIDAK PERNAH ada di Asset Registry (data tidak konsisten — mis. akibat kegagalan sebagian saat Surface Engine menulis). **Diperiksa:** Ini PELANGGARAN INTEGRITAS REFERENSIAL. **Perbaikan (non-ACR, prinsip bukan mekanisme DB spesifik):** Constraint WAJIB (ditambahkan ke § 1.3): `record()` Relationship Registry HARUS memverifikasi KEDUA `from_node`/`to_node` SUDAH ADA di Asset Registry SEBELUM menyimpan Edge — kegagalan verifikasi = `record()` DITOLAK (bukan disimpan dengan Node hilang). Ini PRINSIP integritas, implementasinya (foreign key constraint SQL, dst.) tetap Design/Implementation.

## Kelompok 7 — Invalid Inference

**7.1** Infer Engine menjalankan IR-1 pada pasangan edge yang KATEGORINYA BUKAN "Execution" (mis. mencoba mentransitifkan Ownership+Ownership, yang SUDAH terbukti TIDAK transitif, `25` § 4 Langkah 2). **Diperiksa:** Ini SUDAH dicegah IR-3 (default-reject) — TAPI diuji APAKAH ada CELAH implementasi konseptual: apakah Infer Engine BISA "lupa" memeriksa IR-3 dan langsung mencoba IR-1 untuk SEMUA pasangan? **Perbaikan (non-ACR, invariant tambahan):** Infer Engine WAJIB mengevaluasi IR-3 SEBAGAI DEFAULT FIRST (cek reject dulu), IR-1/IR-5 sebagai PENGECUALIAN yang membolehkan — bukan sebaliknya (mencoba IR-1 dulu, IR-3 sebagai fallback) — urutan evaluasi ini DITAMBAHKAN sebagai Invariant Infer Engine (§ 2.2 diperbarui: "IR-3 dievaluasi lebih dulu, closed-world by default").

## Kelompok 8 — Stale Relationship

**8.1** Edge hasil Infer dibuat berdasarkan Asset LAMA, TAPI Asset itu sudah BERUBAH (Rule versi baru, `edge_type` aslinya sudah beda) — apakah edge Infer LAMA tetap valid? **Diperiksa terhadap § 1.2/Kelompok 4:** Registry append-only MENYIMPAN versi lama — TAPI Edge HASIL INFER yang dibangun dari versi lama TIDAK OTOMATIS diperbarui saat Asset sumber berubah. **Celah nyata** — konsisten temuan `21` § 2.1 (Dead Design Space) TAPI untuk Edge, bukan Design Space Entry. **Perbaikan (non-ACR, reuse pola yang SUDAH terbukti `21`):** Edge hasil Infer WAJIB py `stale_flag` — dipicu OTOMATIS (`system_signal`, konsisten `08e` § D) kalau SALAH SATU edge di `derivation_path`-nya mendapat versi Registry BARU (Asset sumber berubah) — Infer Engine PERLU MENJALANKAN ULANG untuk pasangan itu, edge lama TETAP ADA (append-only) tapi ditandai stale, bukan dihapus.

## Kelompok 9 — Scaling & Unknown Future Asset Types

**9.1 Scaling:** Diperiksa terhadap `08k` § 8 (Scale Failure preseden, algoritma O(V+E) tetap valid) — DIKONFIRMASI ULANG untuk Traversal Engine (§ 2.3): traversal tetap valid matematis pada skala berapa pun. **Diperiksa dimensi OPERASIONAL (bukan algoritma):** pada skala RIBUAN Asset, apakah Infer Engine (menjalankan IR-1 pada SEMUA pasangan edge yang mungkin) menjadi C(n,2) — TIDAK SKALABEL naif? **Celah ditemukan (Complexity Dependency, `13` § 8, DIKONFIRMASI TERJADI LAGI seperti diprediksi):** Infer Engine BUTUH BATASAN — hanya mencoba pasangan edge yang BERBAGI NODE (bukan SEMUA pasangan mungkin) — ini SUDAH implisit di Boundary § 2.2 ("Traversal Engine dipakai UNTUK MENEMUKAN pasangan BERTETANGGA") tapi BELUM eksplisit sebagai INVARIANT PERFORMA. **Perbaikan (non-ACR):** Invariant Infer Engine (§ 2.2) DITAMBAH: "Infer HANYA dievaluasi pada pasangan edge yang BERBAGI NODE (hasil Traversal lokal), TIDAK PERNAH pada seluruh Cartesian product Edge×Edge" — batasan STRUKTURAL yang mencegah blow-up, bukan sekadar optimasi implementasi.

**9.2 Unknown Future Asset Types (juga menjawab Kelompok 5):** Asset kategori BARU (Phase L atau masa depan) yang Surface Engine belum punya Parser. **Diperiksa terhadap K.6A (Vocabulary):** relasi BARU (edge_type) sudah diantisipasi (alias ke enam kategori) — TAPI Asset KATEGORI BARU (bukan relasi baru, tapi JENIS NODE baru) belum eksplisit ditangani. **Diuji Reverse Proof:** Asumsikan Asset kategori baru OTOMATIS gagal ter-Surface selamanya. Kontradiksi? **Ya** — bertentangan dengan Coverage Completion (`23` § 8.4, TIDAK BOLEH ada Asset yang PERMANEN tidak terjangkau). **Perbaikan (non-ACR, prinsip bukan implementasi):** Surface Engine Parser (§ 2.1) WAJIB EXTENSIBLE by design — setiap kategori Asset baru (Phase L dst.) WAJIB mendaftarkan Parser-nya SENDIRI saat kategori itu di-Freeze (bagian dari Transition Brief fase baru, konsisten pola `10`/`16`/`19`/`22` yang SUDAH mewajibkan "Input Wajib" didaftarkan eksplisit) — Coverage Analyzer akan MENANDAI GAP untuk kategori tanpa Parser, BUKAN diam-diam mengabaikannya.

## Kelompok 10 — Vocabulary Drift (Tambahan, Relevan Khusus K.6A)

**10.1** Nama relasi baru (mis. "Facilitates") muncul dari Asset baru, TAPI TIDAK JELAS alias kategori mana (Execution? Dependency?) — AMBIGU. **Diperiksa:** K.6A (§ 6.1) menjamin STRUKTUR (enam kategori), TAPI TIDAK menjamin PEMETAAN OTOMATIS nama baru ke kategori yang benar. **Perbaikan (non-ACR):** Surface Engine, saat menemukan `edge_type` BARU yang belum terpetakan, WAJIB menandainya `unmapped_relation_flag` (BUKAN menebak kategori) — pemetaan BARU WAJIB keputusan EKSPLISIT (manusia/governance, konsisten batas Synthesis tidak boleh menciptakan ontologi sendiri, `23` § 8.3) sebelum dipakai Infer Engine.

---

# BAGIAN 6 — DEPENDENCY AUDIT

**Diverifikasi arah Specification → Repository → Engine → Future Implementation TIDAK PERNAH terbalik, di SELURUH temuan Bagian 1-5 (termasuk perbaikan Reality Stress Validation):**

| Perbaikan dari Bagian 5 | Menyentuh Layer Mana | Arah Tetap Valid? |
|---|---|---|
| SCC Detection setelah batch Infer (2.1) | Engine (Traversal dipakai Infer) | YA — Engine memakai Engine lain via pola yang sudah diverifikasi § 3.2 |
| Precondition check Infer (3.1) | Engine membaca Repository | YA — arah Engine→Repository (baca) sudah valid |
| `query()` default versi terbaru (4.1) | Repository (interface) | YA — murni penyempurnaan interface Repository, tidak melibatkan Specification/Engine |
| Constraint integritas referensial (6.1) | Repository (interface) | YA — sama seperti di atas |
| Urutan evaluasi IR-3 dulu (7.1) | Engine memakai Specification | YA — Engine tetap MEMBACA Specification, urutan evaluasi internal Engine, tidak mengubah arah |
| `stale_flag` (8.1) | Repository (field) + Engine (pemicu) | YA — Engine menulis Repository (arah sudah valid), field baru bukan arah baru |
| Batasan Cartesian product (9.1) | Engine (invariant internal) | YA — tidak melibatkan Repository/Specification |
| Extensible Parser (9.2) | Engine (Surface) | YA — kebijakan internal Engine |
| `unmapped_relation_flag` (10.1) | Engine (Surface) + Specification (butuh keputusan eksternal untuk resolve) | YA — Engine MEMINTA keputusan, tidak MENCIPTAKAN sendiri (konsisten batas) |

**Tidak ditemukan satu pun perbaikan yang membalik arah Specification→Repository→Engine.** Dependency Audit LOLOS.

---

# BAGIAN 7 — FREEZE READINESS CHECK

**Pertanyaan wajib (instruksi eksplisit): "Apakah ADA pertanyaan arsitektural yang MASIH bisa mengubah Relation Algebra?"**

Diperiksa SETIAP temuan Bagian 1-6: SEMUA perbaikan bersifat non-ACR, TIDAK SATU PUN mengubah IR-1/IR-3/IR-5 atau enam kategori vocabulary (K.6 tetap seperti di-Freeze `25` § K.6D). Perbaikan yang muncul (Kelompok 1-10) adalah PENGUATAN STRUKTUR DI SEKITAR Relation Algebra (invariant tambahan, field tambahan, constraint tambahan) — bukan REVISI Relation Algebra itu sendiri.

**Satu revisi STRUKTURAL ditemukan** (dicatat jujur, bukan disembunyikan): § 2.4 (Conflict Analyzer independen, BUKAN "memakai Infer Engine") — ini KOREKSI terhadap `24` K.2/K.4 (dekomposisi awal), BUKAN terhadap Relation Algebra K.6. **Diperiksa apakah ini ACR terhadap `24`:** Diuji Discovery Completion Test — Five Truth Layers/Ownership/Replay/Contract/Version tidak tersentuh, Structure BERUBAH (Conflict Analyzer naik jadi Engine independen kelima, bukan turunan Infer Engine) — **TAPI ini PERBAIKAN internal Design (K.2-K.5 BUKAN Philosophy yang di-freeze permanen seperti Relation Algebra K.6D) — Design boleh direvisi dalam Phase K sendiri tanpa ACR LINTAS FASE, hanya perlu dicatat konsisten.** **BUKAN ACR — revisi Design internal, didokumentasikan di § Konsolidasi.**

**Jawaban Freeze Readiness: TIDAK ADA pertanyaan tersisa yang bisa mengubah Relation Algebra. Phase K SIAP FREEZE.**

---

# BAGIAN 8 — KONSOLIDASI & KOREKSI TERHADAP DOKUMEN SEBELUMNYA

**Revisi struktur (dari `24` K.2, dicatat eksplisit, bukan disembunyikan):**

```
SEBELUM (24 K.2):
  Conflict Analyzer → memakai Infer Engine sebagai mesin dasarnya

SESUDAH (26 § 2.4, terbukti lewat Reverse Proof):
  Conflict Analyzer → Engine INDEPENDEN, mekanisme Compare (bukan Combine),
                       setara level dengan Infer Engine (bukan turunannya)
```

**Dependency Graph final (delapan komponen tetap delapan, TAPI relasi Conflict Analyzer direvisi):**

```
Specification: Relation Algebra
Repository:    Asset Registry, Relationship Registry
Engine:        Surface, Infer, Traversal, Conflict Analyzer, Coverage
               (Conflict Analyzer sekarang SEJAJAR Infer, bukan bergantung padanya
               — TETAP bergantung Traversal untuk pengumpulan kandidat, dan
               bergantung Relation Algebra IR-5 untuk logika bandingnya)
```

---

## Assumptions

1. Storage Model append-only (§ 1.2) diasumsikan cukup sebagai prinsip Specification — bentuk fisik konkret (tabel/graph DB) tetap terbuka penuh untuk Design/Implementation.
2. Sembilan belas perbaikan Reality Stress Validation (Bagian 5) diasumsikan cukup — implementasi nyata mungkin menemukan detail tambahan, konsisten prinsip yang sama dengan seluruh Validation sebelumnya (`08k`/`15`/`18`/`21`).
3. Revisi Conflict Analyzer (§ 2.4, § 8) diasumsikan TIDAK memerlukan ACR lintas-fase — dianggap koreksi internal Design K yang sah, karena Design (beda dari Philosophy K.6) belum pernah di-Freeze permanen sebelum dokumen ini.

## Open Questions

1. Detail `condition` DSL untuk Inference Rule (`25` § Open Question #1) — masih terbuka, pekerjaan implementasi.
2. Versioning/Replay Relation Algebra itu sendiri (`25` § Open Question #3) — masih terbuka.
3. Nilai konkret ambang `unmapped_relation_flag`/governance approval untuk vocabulary baru (Bagian 5 Kelompok 10) — kebijakan organisasi, bukan arsitektur.
4. Bentuk fisik Storage (SQL/graph DB), algoritma traversal spesifik (BFS/DFS), caching, paralelisme — SEMUA sengaja tetap terbuka sebagai Implementation, konsisten Algorithm Boundary (Bagian 4).

## Status

**Phase K Design selesai tuntas — Repository (2 komponen), lima Engine, Interaction/Dependency Graph, Algorithm Boundary Check, Reality Stress Validation (10 kelompok, 19 perbaikan non-ACR + 1 revisi Design internal), Dependency Audit, dan Freeze Readiness Check semuanya lolos.** Satu temuan struktural signifikan: Conflict Analyzer BUKAN turunan Infer Engine seperti diasumsikan awal K.2 — ia Engine independen kelima, dibuktikan Reverse Proof (Compare vs Combine, input berbeda jenis). Siklus BARU ditemukan bisa muncul di level Edge hasil Infer (Kelompok 2) meski Rule asli dijamin bebas siklus — ditangani lewat SCC Detection berkala + flag, bukan mengubah baseline `08k`. Complexity Dependency (`13` § 8) terkonfirmasi terjadi LAGI (Kelompok 9, Infer Engine butuh batasan Cartesian product) — sesuai prediksi observasi metodologi. **Phase K SIAP FREEZE penuh** — tidak ada pertanyaan arsitektural tersisa yang bisa mengubah Relation Algebra atau struktur delapan komponen.

---

## 🔒 PHASE K FREEZE (Synthesis Architecture — Eligibility + Philosophy + Relation Algebra + Full Design + Validation)

**Status: FROZEN.** Freeze Readiness Check (Bagian 7) dijalankan dan lolos — tidak ada pertanyaan arsitektural tersisa yang bisa mengubah Relation Algebra atau struktur delapan komponen. Cakupan yang di-freeze:

- [`23`](23-phase-k-discovery-eligibility-test.md) — Discovery Eligibility Test (Phase K = Synthesis Phase, bukan Discovery Ontologis), Philosophy of Synthesis (§ 8-9), serangan lapis kedua (§ 10-11: Surface vs Infer, Asset Relationship Graph vs "Impact Graph"), Decision Boundary (§ 13).
- [`24`](24-phase-k-design-contract.md) — Design Contract, K.2 Architecture Decomposition, K.3 Architecture Boundary Test, K.4 Category Completeness Test, K.5 Layer Inversion Test.
- [`25`](25-phase-k6-relation-algebra-atom.md) — K.6A Relation Vocabulary (6 kategori abstrak), K.6B Inference Rule Completeness (basis 3 rule: IR-1/IR-3/IR-5 + 1 Extension IR-2), K.6C Conflict Rule, K.6D Relation Algebra Freeze.
- [`26`](26-phase-k-full-design.md) (dokumen ini) — Repository Design, 5 Engine Design (dengan revisi Conflict Analyzer jadi independen), Interaction/Dependency Graph, Algorithm Boundary, Reality Stress Validation (10 kelompok), Dependency Audit, Freeze Readiness.

**Konsekuensi freeze (Progressive Freeze Chain, `04` § 7):** Mulai freeze, Phase K TIDAK BOLEH dibuka kembali tanpa ACR. Phase L (Documentation) boleh dimulai di atas fondasi Synthesis yang sudah frozen penuh.

**Kewajiban eksplisit yang diwariskan (belum terjawab, sengaja ditunda ke implementasi/Phase lanjutan):**
1. Detail `condition` DSL untuk Inference Rule — implementasi.
2. Versioning/Replay Relation Algebra itu sendiri — Design lanjutan.
3. Governance/ambang `unmapped_relation_flag` untuk vocabulary baru — kebijakan organisasi.
4. Bentuk fisik Storage, algoritma traversal spesifik, caching, paralelisme — seluruhnya Implementation, sengaja dibiarkan terbuka (Algorithm Boundary, Bagian 4).
5. Extensible Parser registration untuk kategori Asset baru (Bagian 5, Kelompok 9.2) — WAJIB jadi bagian Transition Brief setiap fase baru mulai Phase L, mengikuti pola "Input Wajib" yang sudah established `10`/`16`/`19`/`22`.

*Dokumen selanjutnya: Phase Transition Brief K→L, lalu Phase L — Documentation.*
