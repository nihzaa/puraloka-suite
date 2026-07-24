# CECEP — K.6: Relation Algebra — Atom Discovery & Minimal Algebra Test

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Design Competition PERTAMA Phase K, untuk komponen **Specification (Relation Algebra)** — dijalankan setelah empat checkpoint K.2-K.5 ([`24`](24-phase-k-design-contract.md)) lolos. **Sebelum satu aturan pun didesain, atomnya dicari dulu** — sesuai instruksi founder, persis pola Rule Definition (`08a` § I) yang juga menemukan struktur ATOM (trigger/condition/action) sebelum Rule konkret ditulis.

**Aturan menjalankan dokumen ini:** Delapan kandidat atom diuji Zero Candidate Test → Difference Test → Reverse Proof → Decision Competition, BARU setelah pemenang ditemukan, dijalankan Minimal Algebra Test (basis generating set — bukan mendaftar aturan sebanyak mungkin).

---

## 1. Zero Candidate Test — Apa Atom Relation Algebra, Ditanya dari Nol

**Sebelum melihat delapan kandidat founder: apa yang HARUS ada di dalam Relation Algebra agar Infer Engine (`24` K.3) bisa menjalankan tugasnya (`23` § 11.1 — menggabungkan edge lewat aturan transitivitas)?**

**Ditelusuri dari kebutuhan KONKRET yang sudah dibuktikan:** Infer Engine, saat menjalankan Impact Propagation (Rule A→B, B→C, disimpulkan A "mempengaruhi" C, `23` § 11.1), butuh MENJAWAB PERTANYAAN: *"Kalau edge dengan `edge_type` X bertemu edge dengan `edge_type` Y (berbagi satu node di tengah), APAKAH boleh digabung, dan MENJADI `edge_type` apa hasilnya?"*

**Diperiksa: apa BENTUK MINIMAL yang bisa menjawab pertanyaan itu?** Jawaban HARUS berbentuk: **(edge_type₁, edge_type₂) → edge_type₃ (atau: TIDAK BOLEH digabung)** — sebuah PEMETAAN dari PASANGAN jenis relasi ke SATU jenis relasi hasil (atau penolakan). **Ini adalah bentuk dasar yang, tanpa melihat delapan kandidat founder, sudah tersirat dari kebutuhan Infer Engine sendiri.**

---

## 2. Delapan Kandidat Diuji — Difference Test + Reverse Proof

### 2.1 Edge Type

**Diperiksa:** Edge Type SUDAH ADA sebagai FIELD (`23` § 12, struktur Edge: `edge_type: "ownership" | "consumption" | ... | "impact" | "conflict"`) — ia adalah LABEL/NILAI, bukan ATURAN. **Diuji Reverse Proof:** Asumsikan Edge Type ADALAH atom Relation Algebra. Kontradiksi? **Ya** — Edge Type sendirian TIDAK BISA menjawab pertanyaan § 1 (pemetaan pasangan→hasil) — ia hanya SALAH SATU KOMPONEN dari pemetaan itu (bagian kiri ATAU kanan panah), bukan pemetaan itu sendiri. **GUGUR — Edge Type adalah BAHAN yang DIOPERASIKAN oleh atom, bukan atom itu sendiri.**

### 2.2 Relation

**Diperiksa:** "Relation" terlalu UMUM — sudah dipakai CECEP untuk MAKNA BERBEDA di level LEBIH TINGGI (`14` § 11.3, katalog 10 Ontology Relation — Ownership/Consumption/dll., YANG SAMA dengan Edge Type di § 2.1). **Diuji Reverse Proof:** Asumsikan "Relation" adalah atom. Kontradiksi? **Ya** — TABRAKAN ISTILAH langsung dengan Ontology Relation (`14` § 11.3) yang SUDAH terkunci sejak Phase H — memakai "Relation" lagi untuk KONSEP BERBEDA (atom algebra) akan MENGABURKAN keduanya. **GUGUR — konflik istilah, sama pola dengan "Derive" yang gugur di `23` § 10.2.**

### 2.3 Predicate

**Diperiksa:** Predicate (istilah logika formal) = FUNGSI yang mengembalikan TRUE/FALSE terhadap satu/lebih argumen. **Diuji: apakah pemetaan § 1 (pasangan→hasil) COCOK sebagai Predicate?** Diperiksa dalam: Predicate MURNI TRUE/FALSE ("boleh digabung: ya/tidak") — TAPI kebutuhan § 1 LEBIH DARI itu (kalau BOLEH digabung, HASILNYA apa `edge_type` baru). **Predicate MENANGKAP SEBAGIAN (syarat boleh/tidak) TAPI TIDAK MENANGKAP HASIL (edge_type keluaran).** **GUGUR sebagai atom TUNGGAL — predicate adalah SATU KOMPONEN (syarat) dari struktur yang lebih besar, bukan keseluruhan.**

### 2.4 Dependency Rule

**Diperiksa:** "Dependency" sudah punya makna SPESIFIK di CECEP (Dependency Analysis, `23` § 9 — SATU dari lima langkah Synthesis, operasi SURFACE bukan Infer). **Diuji Reverse Proof:** Asumsikan "Dependency Rule" adalah atom Relation Algebra. Kontradiksi? **Ya** — Relation Algebra dipakai BUKAN HANYA untuk Impact Propagation (yang MEMANG soal dependency) TAPI JUGA untuk Conflict Detection (`24` K.2, Conflict Analyzer MEMAKAI Infer Engine + Relation Algebra) — Conflict BUKAN soal "ketergantungan", ia soal "PERTENTANGAN". **Memakai "Dependency Rule" sebagai NAMA ATOM akan SALAH KATEGORI untuk aturan Conflict.** **GUGUR — terlalu sempit, hanya cocok SATU dari DUA kebutuhan (Propagation, bukan Conflict).**

### 2.5 Inference Rule

**Diperiksa:** "Inference Rule" LANGSUNG cocok dengan operasi "Infer" yang SUDAH dikunci (`23` § 11.1). **Diuji Difference Test terhadap § 1 (pemetaan pasangan→hasil):** Apakah "Inference Rule" MENANGKAP bentuk itu? **Ya, PALING DEKAT dari kandidat sejauh ini** — "Inference Rule" secara UMUM berarti "ATURAN yang dipakai PROSES INFERENSI", COCOK dengan Infer Engine yang MEMBUTUHKANNYA. **Diuji Reverse Proof:** Asumsikan "Inference Rule" SALAH sebagai nama atom. Kontradiksi? **Diperiksa dalam:** TIDAK ditemukan kontradiksi keras — TAPI diperiksa APAKAH ini CUKUP SPESIFIK (dibanding kandidat lain yang belum diuji, § 2.6-2.8) sebelum diterima sebagai PEMENANG (disiplin Decision Competition — jangan berhenti di kandidat kelima yang terasa cocok).

### 2.6 Graph Axiom

**Diperiksa:** "Axiom" (istilah matematika: pernyataan diterima BENAR tanpa pembuktian, dasar sistem formal) — DIUJI terhadap sifat Relation Algebra: apakah aturan transitivitas CECEP "diterima begitu saja tanpa pembuktian" (Axiom SEJATI), atau ADA ALASAN di baliknya (BUKAN axiom, tapi KEPUTUSAN yang bisa dijustifikasi)? **Diperiksa dalam:** SETIAP aturan CECEP SEJAK Phase G selalu punya ALASAN yang bisa dirujuk (Decision Competition, Reverse Proof) — TIDAK PERNAH "diterima begitu saja". **Memakai "Axiom" akan MENYESATKAN — menyiratkan aturan itu TIDAK BISA dipertanyakan, PADAHAL SELURUH budaya CECEP (Discovery Completion Rule, ACR) justru MEMBOLEHKAN aturan diperiksa ulang kalau ditemukan kontradiksi.** **GUGUR — bertentangan dengan sifat CECEP yang TIDAK PERNAH menetapkan sesuatu sebagai "tidak bisa dipertanyakan".**

### 2.7 Transition Rule

**Diperiksa:** "Transition" sudah punya makna TERKUNCI di CECEP (State Machine, `14` § 14.3 — perpindahan STATUS Integration Point/Design Space Entry, Draft→Active→dst.). **Diuji Reverse Proof:** Asumsikan "Transition Rule" adalah nama atom Relation Algebra. Kontradiksi? **Ya** — TABRAKAN ISTILAH dengan Lifecycle Transition yang SUDAH bermakna SPESIFIK (perubahan STATUS satu objek, BUKAN penggabungan DUA edge). **GUGUR — konflik istilah, sama pola § 2.2.**

### 2.8 Constraint

**Diperiksa:** "Constraint" (sudah dipakai CECEP, `14` § 11.3 katalog Ontology Relation — SALAH SATU dari 10 jenis relasi: "A membatasi ruang gerak B"). **Diuji Reverse Proof:** Asumsikan "Constraint" adalah nama atom Relation Algebra. Kontradiksi? **Ya** — Constraint (dalam katalog `14` § 11.3) adalah SATU JENIS EDGE (hasil), BUKAN aturan TENTANG bagaimana edge digabung. **Memakai "Constraint" sebagai nama ATOM akan mencampur LEVEL "hasil" (edge_type) dengan LEVEL "aturan yang menghasilkan" — PERSIS kesalahan yang SUDAH dikoreksi K.3 (mencampur Repository dengan Specification).** **GUGUR — salah level, sama pola K.3.**

---

## 3. Decision Competition — Hasil

**Enam dari delapan kandidat gugur, tersisa dua yang perlu dibandingkan langsung: "Predicate" (§ 2.3, gugur sebagai atom TUNGGAL tapi menangkap SEBAGIAN struktur — syarat) dan "Inference Rule" (§ 2.5, paling dekat tapi belum diuji tuntas terhadap struktur LENGKAP § 1).**

**Diuji struktur LENGKAP dari kebutuhan § 1 sekali lagi:** Pemetaan **(edge_type₁, edge_type₂, syarat_tambahan) → (edge_type₃ | ditolak)**. **Diperiksa: "syarat_tambahan" itu APA?** Diuji contoh dari `23` § 11.1: "Ownership+Consumption TIDAK boleh ditransitifkan" — TAPI mungkin ADA kasus di mana Ownership+Consumption BOLEH digabung DENGAN SYARAT TERTENTU (mis. hanya kalau kedua edge berasal dari fase yang sama) — **syarat ini ADALAH Predicate (§ 2.3) yang gugur sebagai atom TUNGGAL tapi TERNYATA adalah KOMPONEN WAJIB di dalam struktur atom yang lebih besar.**

**Kesimpulan Decision Competition: Atom Relation Algebra bukan SATU kandidat tunggal dari delapan yang diuji — ia adalah STRUKTUR yang MENGGABUNGKAN unsur dari § 2.3 (Predicate, sebagai syarat) dengan nama keseluruhan dari § 2.5 (Inference Rule, sebagai payung) — TAPI diuji dulu apakah ini pelanggaran "satu kata terlalu luas" (pola kesalahan Surface, `23` § 11.1) SEBELUM diterima.**

**Diuji Reverse Proof akhir:** Asumsikan "Inference Rule" (memuat Predicate sebagai bagian dalamnya) adalah struktur yang BENAR. Kontradiksi? **Diperiksa dalam:** TIDAK ditemukan kontradiksi — beda dari kasus "Surface" yang GAGAL karena mencampur DUA OPERASI EPISTEMIK BERBEDA (baca vs turunkan) dalam SATU kata, di sini "Inference Rule" adalah SATU KONSEP dengan STRUKTUR INTERNAL BERLAPIS (kondisi + hasil) — PERSIS pola Rule Definition (`08a` § I: SATU konsep "Rule" dengan struktur internal trigger/condition/action/failure_policy — tidak seorang pun menuduh itu "mencampur konsep", karena STRUKTUR INTERNAL BERLAPIS itu memang SIFAT ALAMI sebuah definisi formal).

**Atom Relation Algebra (pemenang Decision Competition):**

```
Inference Rule (atom Relation Algebra) {
  when: (edge_type₁, edge_type₂)   ← pasangan yang dicocokkan (dari Predicate § 2.3)
  condition: syarat tambahan opsional (mis. "hanya kalau same_source_phase")
  then: edge_type₃ | REJECT         ← hasil (dari Inference Rule § 2.5)
}
```

**Konsisten Component Boundary (`13` § 11a):** struktur ini TUNGGAL tanggung jawab (satu unit keputusan transformasi), TIDAK tumpang tindih dengan struktur Edge (`23` § 12, yang menyimpan HASIL, bukan ATURAN).

---

## 4. Minimal Algebra Test — Basis Generating Set

**Diminta founder: bukan mendaftar aturan sebanyak mungkin, tapi menemukan JUMLAH MINIMAL Inference Rule yang MEMBUAT SELURUH relasi lain BISA DITURUNKAN.**

**Metodologi (diadaptasi dari konsep aljabar "generating set" — himpunan minimal yang bisa membangun seluruh struktur lewat operasi yang sudah didefinisikan):**

**Langkah 1 — Daftar SEMUA pasangan `edge_type` yang MUNGKIN bertemu di Impact Propagation (dari 10 katalog `14` § 11.3, PLUS "impact"/"conflict" hasil Infer sendiri — total 12 jenis edge, C(12,2)+12 = 78 pasangan mungkin termasuk pasangan sama-jenis).**

**Langkah 2 — Diuji APAKAH 78 pasangan ini BENAR-BENAR butuh 78 Inference Rule terpisah, atau BISA dikelompokkan lewat SIFAT STRUKTURAL edge_type (bukan nama spesifiknya):**

**Diperiksa terhadap sifat MASING-MASING 10 relasi (`14` § 11.3) — dikelompokkan lewat pertanyaan: "apakah relasi ini TRANSITIF SECARA ALAMI (A→B, B→C berarti A "terhubung" C dalam pengertian YANG SAMA), atau TIDAK PERNAH transitif (berhenti di satu langkah)?"**

| Relasi (`14` § 11.3) | Transitif Alami? | Alasan |
|---|---|---|
| Ownership | TIDAK | A memiliki B, B memiliki C — TIDAK berarti A memiliki C (Ownership TIDAK bertingkat di CECEP, setiap Aggregate punya SATU pemilik langsung) |
| Consumption | TIDAK | A mengonsumsi B, B mengonsumsi C — TIDAK berarti A mengonsumsi C (masing-masing konsumsi independen) |
| Composition/Trigger | **YA** | A memicu B, B memicu C — SECARA ALAMI A ADA DI RANTAI yang berujung C (persis kasus Impact Propagation asli, `23` § 11.1) |
| Derivation | TIDAK | A diturunkan dari B tidak menular ke C |
| Override/Priority | TIDAK | Konteks-spesifik, tidak menular |
| Constraint | TIDAK | A membatasi B tidak berarti A membatasi apa yang B batasi |
| Projection | TIDAK | A adalah proyeksi B, tidak menular ke C |
| Producer/Consumer | **YA** (dengan syarat) | A menghasilkan untuk B, B menghasilkan untuk C — MENULAR HANYA kalau B benar-benar MEMAKAI hasil dari A sebagai input untuk menghasilkan sesuatu bagi C (syarat, bukan otomatis) |
| Realization | TIDAK | A direalisasikan B, tidak menular |
| Sibling | TIDAK (secara definisi `14` § 10 — no-ownership, tidak ada arah "naik") | Sibling adalah relasi SIMETRIS lokal, bukan rantai |

**Hasil Langkah 2: dari 10 relasi, HANYA DUA yang transitif (Composition/Trigger selalu, Producer/Consumer bersyarat) — DELAPAN LAINNYA TIDAK PERNAH transitif.**

**Langkah 3 — Diuji apakah ini bisa diringkas jadi ATURAN UMUM (bukan 78 Inference Rule individual):**

**Inference Rule Basis (kandidat minimal):**

```
IR-1: (Composition/Trigger, Composition/Trigger) → Composition/Trigger [TANPA syarat]
      "Rantai pemicu selalu menular"

IR-2: (Producer/Consumer, Producer/Consumer) → Producer/Consumer
      [SYARAT: output A benar-benar dipakai sebagai input pembentuk oleh B]
      "Rantai produksi menular HANYA kalau benar-benar dipakai, bukan kebetulan berdekatan"

IR-3: (X, Y) → REJECT untuk SEMUA X atau Y yang BUKAN Composition/Trigger atau
      Producer/Consumer (delapan relasi lain — default TIDAK bisa ditransitifkan)

IR-4: (Composition/Trigger, Producer/Consumer) atau sebaliknya → REJECT
      [beda JENIS transitivitas, tidak bisa digabung silang tanpa bukti tambahan
       yang tidak dimiliki Impact Propagation dasar]
```

**Diuji Minimal Algebra Test SECARA LITERAL (instruksi founder — "hapus satu, masih jalan?"):**

- **Hapus IR-1?** Impact Propagation (`23` § 11.1, CONTOH ASLI Rule A→B→C) TIDAK BISA dijalankan sama sekali — **IR-1 FUNDAMENTAL, tidak bisa dihapus.**
- **Hapus IR-2?** Kasus Producer/Consumer berantai (mis. CAP-013 menghasilkan data untuk Rule X, Rule X menghasilkan keputusan untuk Rule Y) TIDAK BISA disimpulkan — **diperiksa: apakah kasus ini PERNAH benar-benar dibutuhkan di CECEP sejauh ini?** Diperiksa: BELUM ada instance NYATA di dokumen G-J (beda dari IR-1 yang punya contoh KONKRET Rule Composition, `08a` § O). **IR-2 SAH secara struktural TAPI BELUM TERBUKTI BUTUH — kandidat untuk DIHAPUS dari basis MINIMAL, dicatat sebagai EXTENSION RULE (ditambahkan NANTI kalau instance nyata muncul), bukan bagian BASIS.**
- **Hapus IR-3?** Tanpa default REJECT eksplisit, Infer Engine TIDAK TAHU apa yang harus dilakukan untuk PASANGAN yang TIDAK ADA aturannya — **IR-3 FUNDAMENTAL (sebagai DEFAULT, bukan aturan positif) — tanpa ini, sistem tidak punya PERILAKU TERTUTUP (closed-world), melanggar Determinism (setiap pasangan HARUS py hasil pasti, bukan undefined).**
- **Hapus IR-4?** **Diperiksa: apakah IR-4 SEBENARNYA kasus KHUSUS dari IR-3 (default reject)?** Diperiksa dalam: YA — IR-4 (Composition bertemu Producer/Consumer) SUDAH TERCAKUP IR-3 ("SEMUA X atau Y yang BUKAN pasangan sama-jenis dari IR-1/IR-2 → REJECT") — **IR-4 REDUNDAN, GUGUR — bukan basis terpisah, subset dari IR-3.**

**Hasil Minimal Algebra Test: Basis MINIMAL Relation Algebra = DUA Inference Rule (IR-1 fundamental, IR-3 sebagai default-reject fundamental) — IR-2 diturunkan jadi Extension Rule (sah tapi tidak wajib di basis), IR-4 gugur sebagai redundan.**

**Konsisten instruksi founder: "kalau cukup 5 edge type, 4 inference rule, 2 constraint, tapi dari sana semua bisa diturunkan, itu lebih kuat dari 40 aturan eksplisit" — DIBUKTIKAN LEBIH TAJAM: cukup DUA Inference Rule dasar (bukan bahkan empat), SATU EXTENSION yang ditunda sampai terbukti perlu.**

---

## 5. Struktur Final K.6

```
Relation Algebra (Specification) {
  atom: Inference Rule {
    when: (edge_type₁, edge_type₂)
    condition: opsional
    then: edge_type₃ | REJECT
  }

  basis (WAJIB, tidak bisa dihapus tanpa merusak Impact Propagation/Determinism):
    IR-1 — Composition/Trigger menular tanpa syarat
    IR-3 — Default REJECT untuk semua pasangan di luar basis

  extension (SAH, ditambahkan HANYA kalau instance nyata muncul — bukan diantisipasi):
    IR-2 — Producer/Consumer menular BERSYARAT (belum ada instance nyata di G-J)
}
```

---

## 6. K.6A — Relation Vocabulary Competition (Koreksi Founder: IR-1/IR-3 Dipilih Sebelum Vocabulary Dibekukan)

**Diperiksa dulu: apakah kritik founder valid?** § 4 (Minimal Algebra Test) menguji transitivitas terhadap SEPULUH relasi `14` § 11.3 SEOLAH itu daftar final — TAPI `14` § 11.3 sendiri (ditulis Phase H) TIDAK PERNAH mengklaim TERTUTUP secara permanen terhadap relasi BARU (`14` § 11.1 malah eksplisit: "daftar ini hasil discovery, bukan daftar tertutup selamanya"). **Kritik VALID — IR-1 ("Composition/Trigger menular") diuji terhadap NAMA SPESIFIK, bukan terhadap SIFAT yang mungkin dimiliki BANYAK nama masa depan (Invoke/Call/Run/Execute, dicontohkan founder).**

### 6.1 Empat Kandidat Diuji

**Kriteria uji:** (i) Konsisten dengan katalog `14` § 11.3 yang SUDAH dikunci (tidak ACR tanpa alasan kuat). (ii) Menjawab pertanyaan founder: apakah IR-1/IR-3 STABIL kalau vocabulary bertambah. (iii) Tidak melanggar Forbidden Operations (`24` — Synthesis tidak boleh cipta ontologi baru).

**Kandidat A — Edge Bebas (user boleh membuat edge apa pun):**

**Diuji Reverse Proof:** Asumsikan Kandidat A benar. Kontradiksi? **Ya, LANGSUNG** — Edge bebas berarti SETIAP nama relasi baru (Invoke/Call/Run/dst.) otomatis jadi `edge_type` BARU tanpa verifikasi — ini PERSIS "menciptakan ontologi baru" yang DILARANG Forbidden Operations (`24` #1) DAN bertentangan dengan Discovery Granularity Rule (`04` § 16 — jangan biarkan nama baru muncul tanpa diuji subtype/mechanism/dst.). **GUGUR — melanggar batas yang sudah dikunci.**

**Kandidat B — Katalog Tetap (Inference Rule bekerja HANYA terhadap 10 relasi `14` § 11.3, titik):**

**Diuji Reverse Proof:** Asumsikan Kandidat B benar. Kontradiksi? **Ya** — kalau BENAR-BENAR tetap (tidak pernah bertambah), maka SETIAP kali Asset baru (Rule/Integration Point/AI Meta Model masa depan) memakai pola relasi yang BELUM ada di katalog (mis. AI Meta Model "Observes" Design Space Entry — pola BARU yang belum ada di 10 relasi), Synthesis TIDAK BISA memetakannya — **kontradiksi dengan tujuan Synthesis sendiri (`23` § 8.1 — memunculkan relasi yang SUDAH ADA, TERMASUK yang belum pernah dikatalogkan).** **GUGUR — terlalu kaku, gagal Coverage Completion untuk relasi yang genuinely baru.**

**Kandidat C — Tipe Abstrak + Alias Domain-Spesifik:**

**Diperiksa mendalam (kandidat yang founder tandai paling menjanjikan):** Enam KATEGORI ABSTRAK (Dependency, Ownership, Reference, Execution, Containment, Lifecycle) menaungi NAMA KONKRET (Trigger/Call/Use/Compose sebagai alias "Execution", misalnya). **Diuji terhadap katalog `14` § 11.3 — apakah SEPULUH relasi yang SUDAH ADA bisa dipetakan ke enam kategori abstrak TANPA sisa?**

| Relasi `14` § 11.3 | Kategori Abstrak |
|---|---|
| Ownership | Ownership |
| Consumption | Dependency (A butuh B untuk berfungsi) |
| Composition/Trigger | Execution (A menyebabkan B berjalan) |
| Derivation | Dependency (A bergantung sumber B) |
| Override/Priority | *(diperiksa dalam — tidak cocok satu pun dari enam)* |
| Constraint | *(diperiksa dalam — tidak cocok satu pun dari enam)* |
| Projection | Reference (A menunjuk/mewakili B) |
| Producer/Consumer | Dependency |
| Realization | Execution (instansiasi dari definisi abstrak) |
| Sibling | *(diperiksa dalam — tidak cocok, relasi SIMETRIS, enam kategori founder semuanya ASIMETRIS/terarah)* |

**Ditemukan TIGA relasi (Override/Priority, Constraint, Sibling) yang TIDAK cocok enam kategori abstrak founder — bukan berarti kandidat C gugur, tapi enam kategori itu SENDIRI belum lengkap.** **Diuji apakah bisa diperluas:** Override/Priority dan Constraint SAMA-SAMA soal "A MEMBATASI/MENGALAHKAN B dalam konteks tertentu" — kategori BARU: **Governance** (A mengatur/membatasi B). Sibling BERBEDA total (simetris, no-ownership, `14` § 10) — kategori BARU: **Peer** (hubungan setara, tanpa arah dominan). **Kandidat C, DIPERBAIKI, jadi DELAPAN kategori abstrak (bukan enam) — TAPI diuji dulu apakah delapan ini CUKUP sebelum diterima (lihat § 6.2, Minimal Vocabulary Test).**

**Kandidat D — Tidak Ada Edge, Murni Predicate:**

**Diuji Reverse Proof:** Asumsikan Kandidat D benar (semua relasi jadi Predicate tanpa nama/kategori). Kontradiksi? **Ya** — Predicate murni (TRUE/FALSE) TIDAK BISA menjawab pertanyaan `edge_type` HASIL (`23` § 12, struktur Edge WAJIB punya `edge_type` untuk Coverage Analyzer dan Conflict Analyzer bekerja) — **sudah dibuktikan gugur sebagai atom TUNGGAL di § 2.3, sekarang gugur LAGI di level vocabulary dengan alasan yang SAMA (Predicate cuma satu komponen, bukan keseluruhan struktur yang dibutuhkan).** **GUGUR, dikonfirmasi ulang.**

### 6.2 Minimal Vocabulary Test (Diadaptasi dari Minimal Algebra Test § 4, Diterapkan ke Level Kategori)

**Delapan kategori abstrak (Kandidat C diperbaiki) diuji "hapus satu, masih bisa memetakan SEMUA sepuluh relasi `14` § 11.3?":**

- **Ownership** — hapus → Ownership (relasi asli) tidak punya kategori. **WAJIB.**
- **Dependency** — hapus → Consumption/Derivation/Producer-Consumer kehilangan kategori. **WAJIB.**
- **Execution** — hapus → Composition/Trigger DAN Realization kehilangan kategori. **WAJIB.**
- **Reference** — hapus → Projection kehilangan kategori. **Diperiksa: apakah Projection bisa masuk kategori LAIN?** Diperiksa dalam: Projection ("tampilan dinamis atas B", `14` § 11.3) MIRIP Dependency (A butuh B untuk eksis) TAPI BEDA (Projection tidak "butuh" B secara fungsional, ia HANYA MEWAKILI). **WAJIB, tidak bisa digabung ke Dependency tanpa kehilangan makna.**
- **Containment** — Diperiksa: apakah ADA relasi dari sepuluh yang BUTUH kategori ini SECARA KHUSUS? **Diperiksa dalam: TIDAK ADA — dari sepuluh relasi `14` § 11.3, tidak satu pun murni "berisi" dalam pengertian containment fisik/struktural (beda dari Ownership yang soal KEPEMILIKAN, bukan "berada di dalam").** **GUGUR dari vocabulary SAAT INI — kandidat founder yang TIDAK TERBUKTI perlu, dicatat sebagai kategori CADANGAN kalau relasi masa depan butuh (mis. "Rule Group berisi Rule", `08e` § C — TAPI itu bukan Ontology Relation formal, ia VIEW/proyeksi, sudah diperiksa bukan Aggregate Root).**
- **Lifecycle** — Diperiksa: apakah ADA relasi dari sepuluh yang soal PERUBAHAN STATUS? **TIDAK — Lifecycle Transition (`14` § 14.3) adalah relasi SATU OBJEK dengan STATUSNYA SENDIRI dari waktu ke waktu, BUKAN relasi ANTARA DUA Asset berbeda (beda kategori sama sekali dari Ontology Relation `14` § 11.3, yang selalu ANTARA dua entitas berbeda).** **GUGUR — bukan relasi ANTAR-Asset sama sekali, salah kategori sejak awal (Lifecycle adalah PROPERTI satu Asset, bukan EDGE dalam Asset Relationship Graph).**
- **Governance** (Override/Priority + Constraint) — hapus → keduanya kehilangan kategori. **WAJIB.**
- **Peer** (Sibling) — hapus → Sibling kehilangan kategori (relasi simetris SATU-SATUNYA di antara sepuluh). **WAJIB.**

**Hasil: dari delapan kategori kandidat, ENAM WAJIB (Ownership, Dependency, Execution, Reference, Governance, Peer), DUA GUGUR (Containment, Lifecycle — tidak terbukti perlu untuk sepuluh relasi yang ada).**

**Relation Vocabulary Final (K.6A):**

```
Kategori Abstrak (STABIL — basis untuk Inference Rule) {
  Ownership    — A memiliki siklus hidup/hak ubah eksklusif atas B
  Dependency   — A butuh B untuk berfungsi/eksis (Consumption, Derivation, Producer/Consumer)
  Execution    — A menyebabkan B berjalan/terwujud (Composition/Trigger, Realization)
  Reference    — A menunjuk/mewakili B tanpa butuh B secara fungsional (Projection)
  Governance   — A mengatur/membatasi/mengalahkan B dalam konteks (Override/Priority, Constraint)
  Peer         — hubungan simetris, tanpa arah dominan (Sibling)
}

Nama Konkret (edge_type — ALIAS di dalam satu kategori, BOLEH bertambah tanpa
              mengubah Inference Rule, SELAMA dipetakan ke salah satu dari
              enam kategori di atas) {
  domain-specific: Trigger, Call, Invoke, Run, Execute → semua ALIAS "Execution"
  domain-specific: Consumes, Uses, Requires → semua ALIAS "Dependency"
  ...dst., dipetakan saat relasi baru ditemukan (Surface Engine), BUKAN
  memerlukan Inference Rule baru
}
```

**Ini MENJAWAB LANGSUNG kekhawatiran founder:** Invoke/Call/Run/Execute BUKAN empat `edge_type` yang butuh EMPAT Inference Rule berbeda — mereka SEMUA alias "Execution", DIPETAKAN ke SATU kategori yang SUDAH punya Inference Rule (IR-1). **Vocabulary STABIL pada LEVEL KATEGORI (enam, teruji Minimal Vocabulary Test) meski NAMA KONKRET terus bertambah — persis mekanisme yang sudah terbukti bekerja di CECEP lain (Rule Family/Template/Instance, `08f` § C — struktur STABIL, instance BOLEH bertambah).**

**Kandidat C (diperbaiki) MENANG Decision Competition** — lolos Reverse Proof (tidak melanggar batas), lolos Minimal Vocabulary Test (enam dari delapan kategori terbukti wajib), DAN langsung menjawab pertanyaan spesifik founder (Invoke/Call/Run/Execute = alias Execution, bukan edge_type baru yang butuh Inference Rule baru).

---

## 7. K.6B — Inference Rule Completeness Test (Revisi IR-1/IR-3 dengan Vocabulary Kategori, Bukan Nama Spesifik)

**Diminta founder: buktikan basis-dua-rule (§ 4) BENAR-BENAR lengkap, bukan sekadar belum ditemukan celahnya.**

**IR-1/IR-3 DITULIS ULANG memakai KATEGORI (§ 6.1), bukan nama spesifik (koreksi wajib — "Composition/Trigger" di § 4 sekarang dibaca sebagai KATEGORI "Execution", otomatis mencakup Invoke/Call/Run/Execute/dll tanpa Inference Rule baru):**

```
IR-1 (revisi): (Execution, Execution) → Execution [tanpa syarat]
IR-3 (revisi): (X, Y) → REJECT untuk X atau Y BUKAN Execution atau Dependency
```

**Diuji LIMA pertanyaan founder satu per satu:**

**7.1 Apakah setiap traversal selalu memakai IR-1?**
Diperiksa: Traversal Engine (`24` K.2) MENJALANKAN pergerakan graph — Traversal SENDIRI TIDAK "memakai" IR-1 (Traversal adalah MEKANISME bergerak dari node ke node, IR-1 adalah ATURAN yang dipakai Infer Engine SAAT MEMUTUSKAN apakah hasil traversal itu SAH digabung). **Traversal Engine memakai HASIL Relation Algebra, tidak "memakai IR-1" secara langsung — pembeda Specification-Engine (K.3) tetap bersih.** Tidak ditemukan celah.

**7.2 Apakah ada kasus inferensi yang BUKAN transitivitas?**
**Diperiksa dalam — INI PERTANYAAN PALING TAJAM.** Diuji: Conflict Detection (§ 6.2 lama, belum diuji tuntas Open Question #2 § dokumen ini) — apakah "A bertentangan dengan B" adalah bentuk TRANSITIVITAS (seperti Impact Propagation), atau POLA INFERENSI BERBEDA SAMA SEKALI? **Diperiksa: Conflict BUKAN "A→B→C maka A terhubung C" — Conflict adalah "A dan B SAMA-SAMA mengklaim sesuatu yang SALING BERTENTANGAN, TANPA perlu rantai apa pun di antaranya" (mis. dua Hypothesis Design Space yang bertentangan, `21` § 3, TIDAK PERNAH perlu "terhubung" lewat edge apa pun — mereka BISA langsung dibandingkan meski TIDAK ADA relasi Ownership/Dependency/dll di antara keduanya).** **KONTRADIKSI DITEMUKAN — Conflict Detection BUKAN INSTANCE dari IR-1/IR-3 (yang keduanya soal TRANSITIVITAS via edge existing) — ia BUTUH ATURAN KETIGA yang BEDA SIFAT: bukan "menggabungkan edge jadi edge baru", tapi "MEMBANDINGKAN DUA KLAIM langsung, TANPA edge penghubung".**

**Basis DUA Inference Rule (§ 4) TERBUKTI TIDAK LENGKAP — ditemukan lewat pengujian eksplisit yang diminta founder, bukan diasumsikan cukup.**

**7.3 Apakah Conflict Detection butuh rule baru?**
**Dijawab YA oleh § 7.2 — IR-5 (baru) dibutuhkan:**
```
IR-5: (klaim₁, klaim₂) → CONFLICT jika klaim₁ dan klaim₂ menyatakan hal yang
      SALING MENIADAKAN tentang OBJEK YANG SAMA — TIDAK BERGANTUNG edge_type
      apa pun di antaranya (beda struktur TOTAL dari IR-1/IR-3: input bukan
      PASANGAN EDGE, tapi PASANGAN KLAIM/FAKTA)
```
**IR-5 bukan Extension seperti IR-2 (masih bentuk sama, cuma belum terbukti perlu) — IR-5 adalah KELUARGA ATURAN BERBEDA (operasi Compare, bukan Combine).**

**7.4 Apakah Coverage butuh inferensi baru?**
Diperiksa: Coverage Analyzer (`24` K.2) menghitung status "sudah diperiksa/belum" per Asset — INI OPERASI SURFACE (murni MENCOCOKKAN daftar Asset vs daftar yang sudah di-Surface/Infer, `23` § 11.1: Coverage Analysis dikonfirmasi Surface, bukan Infer). **Tidak butuh Inference Rule sama sekali — Coverage TIDAK menggabungkan/membandingkan KLAIM, ia MENGHITUNG kelengkapan daftar. Tidak ditemukan celah.**

**7.5 Apakah SCC/cycle detection butuh hukum relasi tambahan, atau hanya algoritma?**
Diperiksa: SCC (Strongly Connected Component) detection adalah ALGORITMA GRAPH MURNI (bagian Traversal Engine, domain "bagaimana" yang sudah dikatalogkan Design, `23` § 13) — ia TIDAK butuh ATURAN BARU tentang APA ITU relasi, ia MEMAKAI edge yang SUDAH ADA (hasil IR-1/IR-3/IR-5) untuk MENDETEKSI SIKLUS. **Murni Design (algoritma), bukan Specification (hukum) — tidak menambah basis.**

### 7.6 Basis Final Relation Algebra (Setelah Completeness Test)

**Diuji ulang Minimal Algebra Test (§ 4) terhadap basis BARU (IR-1, IR-3, IR-5) — hapus satu, masih lengkap?**

- Hapus IR-1? Impact Propagation gagal (dibuktikan § 4). **WAJIB.**
- Hapus IR-3? Closed-world/Determinism gagal (dibuktikan § 4). **WAJIB.**
- Hapus IR-5? Conflict Detection (SATU dari LIMA langkah asli Synthesis, `23` § 9) TIDAK BISA dijalankan sama sekali. **WAJIB — dibuktikan § 7.2-7.3.**

**Basis Minimal Relation Algebra FINAL: TIGA Inference Rule (bukan dua) — IR-1 (Execution-transitif), IR-3 (default-reject), IR-5 (Conflict-by-comparison, keluarga OPERASI BERBEDA dari IR-1/IR-3).** IR-2 (Dependency-bersyarat) TETAP berstatus Extension (belum terbukti perlu, § 4) — TIDAK naik jadi basis hanya karena IR-5 ditemukan (diuji terpisah, tidak otomatis terikat).

---

## 8. K.6C — Conflict Rule (Detail IR-5)

**Diuji lebih dalam — IR-5 butuh definisi "SALING MENIADAKAN" yang presisi (bukan sekadar "kedengaran bertentangan").**

**Diperiksa dari preseden yang SUDAH ADA (`21` § 3, Conflicting Entries — SATU-SATUNYA tempat CECEP sudah pernah mendefinisikan konflik formal):** Dua Design Space Entry bertentangan kalau mereka Hypothesis TENTANG KLAIM YANG SAMA dengan NILAI KEBENARAN BERLAWANAN ("X benar" vs "X salah"). **Diperiksa apakah definisi ini bisa DIGENERALISASI ke SELURUH Asset (bukan hanya Design Space Entry)?** Diuji: Rule-001 dan Rule-002 (hipotetis) SAMA-SAMA mengklaim "harus jadi Rule pertama yang jalan setelah `EstimateVersionApproved`" — DUA KLAIM tentang PRIORITAS yang SALING MENIADAKAN. **Definisi TERGENERALISASI: IR-5 berlaku pada PASANGAN KLAIM (bukan cuma Design Space Entry) yang menyatakan NILAI BERBEDA untuk ATRIBUT YANG SAMA pada OBJEK/KONTEKS YANG SAMA.**

**Dicatat sebagai definisi K.6C — DETAIL LEBIH LANJUT (bagaimana "atribut yang sama" dan "konteks yang sama" diverifikasi secara konkret) adalah pekerjaan Design (Conflict Analyzer, `24` K.2), BUKAN Specification lebih lanjut — Decision Boundary (`23` § 13) tetap berlaku: IR-5 adalah "APA ITU konflik" (Specification, selesai di sini), MEKANISME PENCARIAN pasangan yang berkonflik adalah "BAGAIMANA" (Design, Conflict Analyzer).**

---

## K.6D — Relation Algebra Freeze

**Diuji Discovery Completion Test (enam sumbu) sebelum freeze:** Five Truth Layers — tidak tersentuh. Ownership — tidak (Relation Algebra tidak memiliki Asset apa pun). Replay — TIDAK LANGSUNG relevan (Relation Algebra adalah aturan STATIS, bukan data yang di-Replay — TAPI VERSI Relation Algebra, kalau berubah, perlu dicatat supaya Asset Relationship Graph LAMA tetap bisa dijelaskan — dicatat Open Question). Contract — mengisi struktur yang belum ada, bukan mengubah yang dikunci. Version — Relation Algebra sendiri BUTUH versioning (Everything is Versioned, `04` § 1) — dicatat Open Question. Structure — Rule/Formula/Integration Point/AI Meta Model semuanya TIDAK berubah. **Aman pada lima dari enam sumbu, satu (Version/Replay Relation Algebra sendiri) dicatat sebagai Open Question, bukan diabaikan.**

**FROZEN:**
- K.6A: Enam kategori abstrak (Ownership, Dependency, Execution, Reference, Governance, Peer) — vocabulary stabil, nama konkret boleh bertambah sebagai alias.
- K.6B: Basis tiga Inference Rule (IR-1, IR-3, IR-5) + satu Extension (IR-2).
- K.6C: Definisi formal Conflict (IR-5) — pasangan klaim, atribut sama, konteks sama, nilai berlawanan.

---

## Assumptions

1. Sepuluh relasi `14` § 11.3 diasumsikan LENGKAP untuk menguji transitivitas (§ 4 Langkah 2) — kalau Design lanjutan menemukan relasi baru (di luar katalog), transitivitasnya perlu diuji dengan metodologi YANG SAMA (bukan diasumsikan otomatis masuk basis atau ekstensi).
2. IR-2 (Producer/Consumer) diasumsikan SAH sebagai Extension meski belum ada instance nyata — kalau ternyata TIDAK PERNAH dibutuhkan sama sekali (setelah Coverage Analysis berjalan penuh terhadap Asset G-J), IR-2 bisa dihapus total tanpa mengubah Basis.

## Open Questions

1. Apakah `condition` (syarat tambahan opsional di struktur atom) butuh bahasa formal sendiri (mini-DSL) atau cukup pemeriksaan sederhana — pekerjaan Design lanjutan.
2. ~~Conflict Detection belum diuji~~ — **TERJAWAB § 7-8**: IR-5 ditemukan sebagai keluarga aturan terpisah (Compare, bukan Combine), definisi formal "saling meniadakan" dirumuskan (§ 8), mekanisme pencarian pasangan konflik didelegasikan ke Design (Conflict Analyzer).
3. Versioning dan Replay untuk Relation Algebra ITU SENDIRI (§ K.6D) — Relation Algebra adalah Configuration Data yang bisa berubah; kalau berubah, Asset Relationship Graph LAMA (dibangun dengan versi Algebra lama) perlu tetap bisa dijelaskan. Belum didesain, dicatat untuk K.7 atau Design lanjutan.
4. Detail konkret "atribut yang sama" dan "konteks yang sama" dalam definisi IR-5 (§ 8) — didelegasikan eksplisit ke Design (Conflict Analyzer), bukan diselesaikan di Specification.

## Status

**K.6 diperluas empat bagian setelah koreksi founder — urutan asli (atom → Minimal Algebra Test langsung) TERBUKTI PREMATUR, diperbaiki dengan menyisipkan Vocabulary Competition dan Completeness Test SEBELUM freeze.**

**K.6A (Relation Vocabulary Competition):** Empat kandidat diuji — Edge Bebas gugur (melanggar Forbidden Operations), Katalog Tetap gugur (gagal Coverage untuk relasi baru), Predicate Murni gugur (dikonfirmasi ulang, sama alasan § 2.3), **Tipe Abstrak + Alias MENANG** setelah diperbaiki jadi enam kategori (Ownership/Dependency/Execution/Reference/Governance/Peer) via Minimal Vocabulary Test (dua kandidat founder — Containment, Lifecycle — GUGUR karena tidak terbukti perlu). **Ini langsung menjawab kekhawatiran founder: Invoke/Call/Run/Execute adalah ALIAS "Execution", bukan edge_type yang masing-masing butuh Inference Rule baru — vocabulary stabil di level kategori, nama konkret bebas bertambah.**

**K.6B (Inference Rule Completeness Test):** IR-1/IR-3 ditulis ulang memakai kategori (bukan nama spesifik). Lima pertanyaan founder diuji — EMPAT tidak menemukan celah (traversal, Coverage, SCC semuanya aman), **SATU (Conflict Detection) MENEMUKAN KONTRADIKSI NYATA** — Conflict bukan transitivitas (Combine), ia perbandingan langsung dua klaim (Compare) TANPA perlu edge penghubung. **Basis dua-rule (§ 4 awal) TERBUKTI TIDAK LENGKAP — direvisi jadi TIGA Inference Rule (IR-1, IR-3, IR-5).**

**K.6C (Conflict Rule):** IR-5 didefinisikan formal dari preseden `21` § 3, digeneralisasi ke seluruh Asset (bukan hanya Design Space Entry): pasangan klaim dengan nilai berlawanan untuk atribut sama pada konteks sama.

**K.6D (Freeze):** Discovery Completion Test dijalankan — lima dari enam sumbu aman, satu (Version/Replay Relation Algebra sendiri) dicatat Open Question #3. **Relation Algebra FROZEN: enam kategori vocabulary, basis tiga Inference Rule + satu Extension, definisi formal Conflict.** Fondasi sekarang genuinely lengkap (diuji lewat serangan eksplisit, bukan diasumsikan) — siap lanjut ke Design Competition komponen berikutnya (Repository atau Traversal Engine).
