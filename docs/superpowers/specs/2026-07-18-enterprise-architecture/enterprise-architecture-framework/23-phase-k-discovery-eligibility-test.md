# CECEP — Phase K: Discovery Eligibility Test

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** BUKAN Discovery, BUKAN Philosophy — gate yang dijalankan SEBELUM Five Whys Phase K dimulai, sesuai [`13`](13-working-methodology.md) § 9 (Phase Expectation Bias). Empat pertanyaan founder dijawab jujur, TANPA mengasumsikan Phase K harus menjadi Discovery Ontologis penuh hanya karena G-H-I-J semuanya begitu.

**Aturan menjalankan test ini:** Setiap jawaban WAJIB diuji terhadap konsep yang SUDAH ADA (Rule/Formula, Integration Point, AI Meta Model, Design Space) — kalau "Impact" bisa DIJELASKAN PENUH memakai konsep yang sudah ada, itu SINYAL KUAT ke arah Synthesis Phase, bukan Discovery baru.

---

## 1. Apakah "Impact" Ontologi Independen, atau Sifat/Relasi dari Konsep yang Sudah Ada?

**Diperiksa dari sumber tugas Phase K yang SUDAH dikunci** (`04` § 14, Operational Perspective): Phase K dipetakan untuk perspektif **"Deployment Impact"** — dampak operasional dari SETIAP keputusan arsitektur: backup strategy, storage growth, tenant migration (dicontohkan eksplisit sejak `04` ditulis, jauh sebelum Phase G-J ada).

**Diuji: apakah "Impact" punya STRUKTUR SENDIRI yang tidak bisa dijelaskan konsep lain?** Dicoba definisikan "Impact" tanpa merujuk konsep manapun yang sudah ada: *"Impact = konsekuensi yang terjadi PADA sesuatu (sistem/Layer/objek) AKIBAT sesuatu YANG LAIN berubah."* **Diperiksa dalam:** definisi ini SECARA STRUKTURAL adalah **RELASI** (A mempengaruhi B), BUKAN OBJEK BERDIRI SENDIRI seperti Rule ("keputusan orkestrasi") atau Integration Point ("titik serah data") atau Design Space ("ruang keputusan belum final") — ketiganya punya BENTUK KONKRET yang bisa DITUNJUK sebagai satu entitas. "Impact" TIDAK BISA ditunjuk sebagai satu entitas TERPISAH dari DUA hal yang direlasikannya (penyebab dan akibat).

**Diuji Reverse Proof:** Asumsikan Impact ADALAH ontologi independen (setara Rule/Integration Point/Design Space). Kontradiksi? **Diperiksa dalam:** Kalau Impact adalah OBJEK independen, ia HARUS py identitas sendiri yang TIDAK bergantung pada "apa yang berubah" dan "apa yang terpengaruh" — TAPI SETIAP contoh Impact yang bisa dipikirkan (perubahan Rule mempengaruhi Integration Point yang memanggilnya; perubahan AI Meta Model mempengaruhi Design Space Entry yang menunggunya; migrasi skema mempengaruhi Replay data lama) **SELALU dan HANYA bisa dijelaskan sebagai RELASI ANTARA dua Design Space Entry, dua Asset, atau Asset-dan-Entry yang SUDAH ADA namanya.** **Kontradiksi ditemukan — Impact TIDAK PUNYA identitas independen dari relasi yang dijelaskannya.**

**Jawaban: "Impact" BUKAN ontologi independen — ia adalah RELASI (sifat hubungan sebab-akibat) yang beroperasi PADA konsep yang sudah ada (Rule, Integration Point, AI Meta Model, Design Space Entry, dan objek-objek Layer 1-4 yang lebih tua).**

---

## 2. Jika Seluruh Phase G-J Sudah Ada, Apakah Phase K Masih Diperlukan Sebagai Discovery Terpisah?

**Diuji dengan mencoba MENJAWAB pertanyaan konkret Phase K (dari `04` § 14: backup strategy, storage growth, tenant migration) HANYA memakai vocabulary yang sudah ada:**

- **"Backup strategy"** — Diperiksa: apa yang di-backup? Historical Data, Versioned Data (`08g`/`08h`, sudah didefinisikan Phase F). Kenapa perlu backup? Karena Replay (`06` § J.3, `08h` § C.2 Replay-by-Recompute/Retrieve) HARUS tetap bisa dijalankan meski infrastruktur berubah. **Dijawab PENUH memakai konsep yang sudah ada (Historical Data + Replay), TANPA butuh konsep baru.**
- **"Storage growth"** — Diperiksa: pertumbuhan storage adalah KONSEKUENSI dari prinsip Everything is Versioned + Historical Data tidak pernah dihapus (`04` § 1, `08g` § A.7 — sudah dikunci sejak Phase B/F). **Dijawab PENUH memakai prinsip yang sudah ada.**
- **"Tenant migration"** — Diperiksa: migrasi antar tenant (Multi-Company Multi-Branch, `05b` § 6, sudah ada sejak Phase D) — persoalan MEMINDAHKAN Asset (Integration Point, AI Meta Model, Design Space Entry) dari satu konteks Scope (`08a` § Q) ke Scope lain. **Dijawab memakai Scope + Asset yang sudah ada.**

**Diuji Reverse Proof:** Asumsikan Phase K TIDAK diperlukan sebagai Discovery terpisah (semua pertanyaannya sudah terjawab dari G-J). Kontradiksi? **Diperiksa dalam:** TIDAK ditemukan kontradiksi — SETIAP contoh konkret Phase K yang sudah dipetakan `04` § 14 BERHASIL dijawab tanpa satu konsep ontologis baru pun. **Tidak ada kontradiksi kalau Phase K dianggap TIDAK butuh Discovery ontologis terpisah.**

**Jawaban: TIDAK — Phase K, sejauh yang bisa diperiksa dari cakupan yang SUDAH dipetakan (`04` § 14), tidak menunjukkan kebutuhan Discovery ontologis independen.**

---

## 3. Apa Kontradiksi yang Muncul Jika Phase K Dihapus (Digabung ke Fase Lain)?

**Diuji: bukan "apakah Phase K berguna" (jelas berguna — dampak arsitektural nyata dan penting), tapi "apakah Phase K SEBAGAI FASE DISCOVERY TERPISAH menciptakan sesuatu yang HILANG kalau dihapus".**

**Diperiksa dalam:** Kalau Phase K "dihapus" dalam pengertian TIDAK menjalankan Five Whys/Ontology Matrix sendiri, APA yang hilang? Diperiksa: TIDAK ADA konsep ontologis yang hilang (dibuktikan § 1-2) — TAPI ada SESUATU YANG LAIN yang hilang: **TITIK EKSPLISIT untuk MENGUMPULKAN dan MENGANALISIS SEMUA relasi sebab-akibat lintas Rule/Integration/AI/Design Space secara SISTEMATIS**, alih-alih tersebar implisit di masing-masing dokumen. **Ini PERSIS pola yang SUDAH ditemukan untuk Design Space sendiri** (`20` § 1, Q6: "Future dibutuhkan bukan untuk memprediksi, tapi untuk MENDOKUMENTASIKAN SECARA EKSPLISIT DAN KOHEREN arah yang sudah tersirat, supaya tidak tersebar dan tercecer").

**Kontradiksi ditemukan:** Kalau Phase K dihapus TOTAL (tidak ada fase/dokumen yang mengumpulkan analisis dampak lintas-Asset secara sistematis), CECEP KEHILANGAN kemampuan menjawab pertanyaan GABUNGAN seperti "kalau Rule versi X berubah, APA SAJA (Integration Point, AI Meta Model, Design Space Entry) yang terdampak, DAN seberapa jauh dampaknya menjalar" — jawaban ini TIDAK ADA DI SATU TEMPAT PUN di dokumen `04`-`22`, karena setiap dokumen fokus pada SATU Asset/domainnya sendiri.

---

## 4. Apakah "Impact" Menghasilkan Objek Baru, atau Hanya Relasi Antar Objek Lama?

**Dijawab langsung dari § 1-3:** **Relasi, BUKAN objek baru.** Diperiksa lebih tajam — apakah "Impact Analysis" (aktivitas MENGANALISIS relasi itu) menghasilkan ARTEFAK yang PANTAS disebut objek? **Diperiksa dalam:** hasil dari MENGANALISIS relasi (mis. "Rule X mempengaruhi Integration Point Y dengan tingkat Z") BISA dicatat sebagai DOKUMENTASI (mirip Ontology Relation katalog, `14` § 11.3 — yang JUGA bukan objek baru, ia KATALOG RELASI yang SUDAH ADA, ditemukan bukan diciptakan). **Impact Analysis, kalau menghasilkan sesuatu, menghasilkan KATALOG/PETA RELASI — persis pola yang SUDAH ADA (Ontology Relation `14` § 11.3, Dependency Matrix `05` § F) — BUKAN kategori ontologis baru.**

---

## 5. Hasil Discovery Eligibility Test

| # | Pertanyaan | Jawaban |
|---|---|---|
| 1 | Ontologi independen atau sifat/relasi? | **RELASI** — tidak punya identitas independen dari dua hal yang direlasikannya |
| 2 | Masih perlu Discovery terpisah kalau G-J sudah ada? | **TIDAK** — semua contoh konkret (backup/storage/tenant migration) terjawab penuh dari vocabulary yang sudah ada |
| 3 | Kontradiksi kalau dihapus? | **ADA, tapi BUKAN kontradiksi ontologis** — kontradiksi PRAKTIS/ORGANISASI (kehilangan titik pengumpulan sistematis, bukan kehilangan konsep) |
| 4 | Objek baru atau relasi antar objek lama? | **Relasi antar objek lama** — hasilnya (kalau ada) adalah katalog/peta, pola yang sudah ada (`14` § 11.3) |

**Vonis: GAGAL Discovery Eligibility Test pada tiga dari empat kriteria (hanya #3 memberi alasan Phase K tetap perlu ada — TAPI sebagai KEGIATAN SISTEMATIS, bukan Discovery ontologis).**

**Konsekuensi (sesuai `13` § 9): Phase K BUKAN Discovery Phase — Phase K adalah SYNTHESIS PHASE.**

---

## 6. Definisi Kerja — Synthesis Phase (Pertama Kali Dipakai, CECEP)

**Karena ini kategori metodologi yang BARU (belum pernah dibutuhkan sampai sekarang), didefinisikan dulu sebelum dipakai — bukan diasumsikan bentuknya, konsisten disiplin yang sama dengan setiap konsep baru CECEP.**

**Diuji lewat kontras dengan Discovery Phase (G-H-I-J):**

| | Discovery Phase (G-H-I-J) | Synthesis Phase (K, kandidat) |
|---|---|---|
| Tujuan | MENEMUKAN konsep ontologis baru | MENGUMPULKAN & MENGANALISIS relasi antar konsep yang SUDAH ada |
| Metodologi inti | Five Whys → Zero Candidate → Ontology Matrix → Reverse Proof → Universality Test | **BELUM DITENTUKAN — didesain di Philosophy K, BUKAN dipaksa memakai metodologi Discovery** |
| Output | Objek/kategori baru (Rule, Integration Point, AI Meta Model, Design Space) | Katalog/peta relasi (mirip Ontology Relation `14` § 11.3, tapi lintas-SEMUA fase bukan hanya dua konsep) |
| Freeze | Mengunci DEFINISI baru | Mengunci METODE ANALISIS (bagaimana dampak dihitung/dilacak), BUKAN definisi baru |
| Butuh Meta Model? | Ya (kalau Asset Ontology) | **Diperiksa di § 7 di bawah** |

**Definisi kerja:** **Synthesis Phase adalah fase yang TIDAK mencari ontologi baru — ia MENERAPKAN metodologi ANALISIS SISTEMATIS (belum ditentukan bentuknya) terhadap RELASI antar konsep yang sudah dikunci fase-fase sebelumnya, menghasilkan KATALOG/PETA (bukan objek), dan freeze-nya mengunci METODE bukan DEFINISI.**

---

## 7. Apakah Synthesis Phase Butuh Meta Model?

**Diuji cepat (bukan Decision Competition penuh, karena jawabannya sudah tersirat kuat dari § 4-6):** Meta Model (`08e`/`14` § 22.1/`17` § 12) menjawab "APA hakikat objek X" — kalau Phase K TIDAK menghasilkan objek baru (§ 4), pertanyaan Meta Model TIDAK PUNYA SUBJEK untuk diperiksa. **Tidak butuh Meta Model — konsisten Discovery Granularity Rule (`04` § 16): jangan menciptakan struktur untuk sesuatu yang tidak butuh.**

---

## 8. Philosophy of Synthesis — Dibangun dari Prinsip Pertama, Bukan Meniru Discovery

**Pagar yang mengikat seluruh section ini (instruksi eksplisit founder, `13` § 10 Method Symmetry Bias): alat Discovery (Five Whys/Zero Candidate/Ontology Matrix/Reverse Proof/Universality Test) DIANGGAP TIDAK BERLAKU untuk Synthesis Phase sampai TERBUKTI diperlukan. Lima pertanyaan dijawab dari nol, bukan dipetakan otomatis ke struktur yang sudah ada.**

### 8.1 Apa Tujuan Synthesis?

**Ditelusuri dari kegagalan § 1-4 (bukan diasumsikan):** Discovery Eligibility Test membuktikan Phase K TIDAK menemukan objek baru, TAPI § 3 membuktikan ADA kebutuhan nyata: "titik eksplisit untuk mengumpulkan dan menganalisis SEMUA relasi sebab-akibat lintas Rule/Integration/AI/Design Space secara sistematis". **Tujuan Synthesis: MEMBUAT RELASI YANG SUDAH ADA (tapi tersebar implisit di 22 dokumen) menjadi EKSPLISIT, TERHUBUNG, dan BISA DITELUSURI — bukan menciptakan relasi baru, bukan menciptakan konsep baru.**

**Diuji Reverse Proof:** Asumsikan tujuan Synthesis adalah MEMBUAT KEPUTUSAN baru (bukan sekadar memetakan). Kontradiksi? **Ya** — kalau Synthesis membuat keputusan baru, ia akan MELANGGAR Progressive Freeze Chain (`04` § 7) dengan cara yang sama seperti Orchestrator yang diam-diam mengeksekusi sendiri (`08a` § D) — Synthesis, seperti Orchestrator, MEMBACA dan MEROUTE, TIDAK MENCIPTAKAN. **Kontradiksi ditemukan — tujuan "membuat keputusan baru" gugur, tujuan "memetakan yang sudah ada" bertahan.**

### 8.2 Apa Output Synthesis?

**Dijawab langsung dari § 4 Eligibility Test (sudah dibuktikan, bukan diasumsikan ulang):** Katalog/peta relasi — TAPI diperiksa BENTUK KONKRETNYA, belum ditentukan sebelumnya. **Diuji terhadap preseden yang SUDAH ADA di CECEP untuk "memetakan relasi" (bukan Discovery Phase, tapi KEGIATAN serupa):**

- `05` § F — Dependency Matrix (Capability-ke-Capability)
- `14` § 11.3 — Katalog 10 Ontology Relation
- `04a` — ADR Traceability Log (relasi keputusan-ke-keputusan, diterima/ditolak)
- `11` — Architecture Roadmap Index (relasi fase-ke-fase)

**Diperiksa: apakah keempat preseden ini SUDAH cukup, atau Synthesis K butuh BENTUK BARU?** Diuji: keempatnya MASING-MASING memetakan SATU JENIS relasi SEMPIT (Capability-Capability, Ontology-Ontology, Decision-Decision, Fase-Fase) — TIDAK ADA yang memetakan **Asset-ke-Asset LINTAS FASE dengan JENIS DAMPAK yang berbeda-beda** (Rule berubah → Integration Point terdampak BAGAIMANA? AI Meta Model berubah → Design Space Entry terdampak BAGAIMANA?). **Output Synthesis K: PETA DAMPAK LINTAS-ASSET — bentuk BARU (bukan menyalin keempat preseden), TAPI ISINYA murni relasi yang SUDAH tersirat di dokumen G-J, bukan diciptakan.**

### 8.3 Apa yang Boleh dan Tidak Boleh Dilakukan Synthesis?

**Dibuktikan lewat batas yang sudah terbukti di § 8.1 (Reverse Proof):**

**BOLEH:**
- Membaca SEMUA Asset/konsep yang sudah frozen (Rule, Integration Point, AI Meta Model, Design Space Entry, Formula) untuk MENEMUKAN relasi yang SUDAH ADA tapi belum eksplisit.
- Mengklasifikasikan JENIS dampak (mis. "Rule berubah → Integration Point WAJIB divalidasi ulang" vs "Rule berubah → AI Meta Model TIDAK terpengaruh").
- Menandai KESENJANGAN (gap) — relasi yang SEHARUSNYA ada tapi TIDAK terdokumentasi di fase manapun.

**TIDAK BOLEH (Reverse Proof § 8.1):**
- Menciptakan Asset/konsep baru.
- Mengubah definisi Asset yang sudah frozen (itu domain ACR, bukan Synthesis).
- Membuat KEPUTUSAN tentang bagaimana dampak harus DITANGANI (itu domain Phase L/implementasi — Synthesis MENUNJUKKAN dampak, TIDAK MEMUTUSKAN respons terhadapnya, persis pola Orchestrator yang menunjukkan KAPAN tanpa menentukan ISI, `08a` § C poin 3).

### 8.4 Kapan Synthesis Selesai?

**Diuji terhadap Discovery Completion Rule (`04` § 15) — apakah kriteria yang SAMA berlaku, atau Synthesis butuh kriteria SENDIRI?**

**Diperiksa dalam:** DCR menjawab "kapan DISCOVERY selesai" (kriteria: Open Question tidak lagi mengubah 6 sumbu). Synthesis TIDAK PUNYA Open Question dalam pengertian yang sama (ia tidak MENCARI definisi) — Synthesis punya **CAKUPAN** (Asset mana saja yang sudah dipetakan relasinya). **Kriteria SELESAI Synthesis BUKAN "tidak ada lagi yang mengubah baseline" (itu kriteria Discovery) — kriteria Synthesis adalah "COVERAGE": semua Asset yang SUDAH frozen (dari G-J) sudah diperiksa relasinya, TANPA sisa Asset yang belum dipetakan.**

**Ini BUKAN kriteria yang sama dengan Discovery Completion Rule — Synthesis butuh kriteria SENDIRI (Coverage Completion), dibuktikan BEDA karena OBJEK yang diukur BEDA (Open Question yang tersisa vs Asset yang belum dipetakan).**

### 8.5 Apa Bedanya dengan Discovery?

**Dikonsolidasi dari 8.1-8.4 (tabel final, BUKAN mengulang tabel § 6 yang masih dugaan awal — sekarang dibuktikan):**

| Dimensi | Discovery Phase | Synthesis Phase |
|---|---|---|
| Tujuan | Menemukan konsep ontologis baru | Membuat relasi yang sudah ada jadi eksplisit |
| Alat inti | Five Whys, Ontology Candidate Matrix, Reverse Proof, Universality Test | Dependency Analysis, Cross-Phase Consistency, Coverage Analysis (didesain § 9, BUKAN dipinjam Discovery) |
| Objek yang diproses | Belum ada nama — dicari dari nol | Asset yang SUDAH frozen — dibaca, bukan dicari |
| Boleh mengubah baseline? | YA (itu tujuannya — menciptakan definisi baru yang akan dikunci) | TIDAK PERNAH — hanya membaca dan memetakan |
| Kriteria selesai | Discovery Completion Rule (Open Question tidak ubah 6 sumbu) | **Coverage Completion (baru, § 8.4)** — semua Asset frozen sudah dipetakan relasinya |
| Butuh Meta Model? | Ya, kalau Asset Ontology (diuji `08e`/`14`/`17` § 12) | Tidak (dibuktikan § 7 — tidak ada objek baru untuk diperiksa) |

---

## 9. Metodologi Analisis Synthesis — Lima Alat (Founder), Diuji Satu per Satu

**Dijawab Open Question #1 (`23` lama) — bukan dipilih sembarangan, diuji apakah kelimanya genuinely dibutuhkan atau sebagian tumpang tindih.**

**Diperiksa lima kandidat founder terhadap output yang sudah dibuktikan (§ 8.2, Peta Dampak Lintas-Asset):**

- **Dependency Analysis** — MENELUSURI rantai "A bergantung B" — SUDAH ADA sebagian (Dependency Matrix `05` § F, Ontology Relation `14` § 11.3) tapi TERBATAS per-domain. **Diperlukan: PERLUASAN cakupan lintas-fase, bukan alat baru dari nol.**
- **Cross-Phase Consistency** — MEMERIKSA apakah dua fase yang berbeda TIDAK saling bertentangan (mis. apakah batas AI § 11 `17` konsisten dengan batas Design Space § 18 `20`). **Diperlukan — belum ada mekanisme yang MEMERIKSA ANTAR-FASE secara eksplisit sejauh ini (setiap Audit Ketergantungan, `18` § 11, hanya periksa DUA fase yang berurutan, bukan SEMUA fase sekaligus).**
- **Impact Propagation** — MELACAK seberapa JAUH sebuah perubahan MENJALAR (Rule berubah → Integration Point → AI Meta Model yang memanggilnya → Design Space Entry yang menunggunya). **Diperlukan — INI YANG PALING DEKAT dengan tujuan inti § 8.1, bentuk konkret dari "Peta Dampak Lintas-Asset".**
- **Conflict Detection** — MENEMUKAN dua Asset/keputusan yang saling bertentangan. **Diperiksa: apakah ini BEDA dari Conflicting Entries (`21` § 3, sudah diselesaikan untuk Design Space secara spesifik)?** Ya — `21` § 3 HANYA untuk Design Space Entry; Conflict Detection di sini LEBIH LUAS (lintas SEMUA Asset, bukan hanya Design Space). **Diperlukan sebagai PERLUASAN, bukan duplikasi.**
- **Coverage Analysis** — MEMERIKSA apakah SEMUA Asset frozen sudah dipetakan (persis Coverage Completion, § 8.4). **Diperlukan — ini ADALAH kriteria selesai Synthesis, bukan aktivitas terpisah, TAPI perlu ALAT untuk MENGUKURNYA (mis. checklist Asset per fase).**

**Diuji apakah kelimanya independen atau tumpang tindih:** Diperiksa — Dependency Analysis dan Impact Propagation SALING TERKAIT (Impact Propagation MEMAKAI hasil Dependency Analysis sebagai peta dasar, lalu MENAMBAHKAN dimensi "seberapa jauh"). Conflict Detection dan Cross-Phase Consistency JUGA terkait (Consistency adalah PEMERIKSAAN, Conflict Detection adalah HASIL kalau pemeriksaan gagal). **Bukan lima alat independen — DUA PASANG yang berurutan, PLUS Coverage Analysis sebagai kriteria selesai:**

```
1. Dependency Analysis (bangun peta dasar: apa terhubung ke apa)
        ↓
2. Impact Propagation (perluas peta: seberapa jauh dampak menjalar)
        ↓
3. Cross-Phase Consistency (periksa: apakah peta ini konsisten dengan batas tiap fase)
        ↓
4. Conflict Detection (HASIL kalau langkah 3 gagal — dicatat sebagai temuan)
        ↓
5. Coverage Analysis (kriteria selesai: apakah semua Asset frozen sudah masuk langkah 1-4)
```

---

## 10. Serangan Terhadap Fondasi Synthesis — Empat Pertanyaan Founder

### 10.1 Apakah Synthesis Menghasilkan Relasi Baru, atau Menemukan Relasi yang Sejak Awal Sudah Ada?

**Diserang lewat Zero Candidate Test dulu (dijawab TANPA melihat "Kemungkinan A/B" founder, murni dari definisi § 8.1 yang sudah dibuktikan):** Kalau Rule-001 (`08c v2`) memanggil CAP-013 (Integration), APAKAH relasi "Rule-001 bergantung CAP-013" ADA sejak Rule-001 DITULIS (Phase G), atau BARU ADA saat Synthesis MEMERIKSANYA (Phase K)? Diperiksa: Rule-001 § B `08c v2` SUDAH secara eksplisit menulis `action: Panggil CAP-013` SEJAK ditulis — relasi itu SUDAH ADA di dalam teks Rule-001 sendiri, JAUH SEBELUM Phase K. **Zero Candidate Test menghasilkan jawaban yang SAMA dengan Kemungkinan B founder — dicapai independen, bukan diarahkan.**

**Diuji Difference Test (dua kandidat: "Synthesis mencipta relasi" vs "Synthesis menemukan relasi"):**

| | Synthesis Mencipta Relasi (Kandidat A) | Synthesis Menemukan Relasi (Kandidat B) |
|---|---|---|
| Kalau Synthesis dihapus, apakah relasi Rule-001→CAP-013 masih ada? | TIDAK (kalau A benar, relasi itu ciptaan Synthesis) | YA (relasi itu MELEKAT di teks Rule-001, tidak bergantung Synthesis) |
| Diperiksa faktanya | — | **Rule-001 SUDAH menulis `action: Panggil CAP-013` sejak `08c v2`, JAUH sebelum Phase K ada** |

**Diuji Reverse Proof:** Asumsikan Kandidat A benar (Synthesis MENCIPTA relasi). Kontradiksi? **Ya, LANGSUNG dan KERAS** — kalau Synthesis MENCIPTA relasi Rule-001→CAP-013, maka SEBELUM Phase K berjalan, Rule-001 TIDAK "benar-benar" memanggil CAP-013 (relasi itu belum "ada") — TAPI Rule-001 SUDAH DIEKSEKUSI secara Design sejak `08c v2` DAN DIUJI di Reality Stress Validation (`15`) yang MENGASUMSIKAN relasi itu SUDAH ADA (mis. `15` § 1.1 menguji ACK dari CAP-013 terhadap Rule-001 — pengujian itu TIDAK MUNGKIN valid kalau relasinya belum "diciptakan"). **Kontradiksi ditemukan — Kandidat A GUGUR. Kandidat B (Synthesis MENEMUKAN relasi yang sudah ada) BERTAHAN.**

**Jawaban: Synthesis TIDAK menghasilkan relasi baru — ia MENEMUKAN relasi yang SUDAH ADA sejak Asset-nya ditulis, tapi BELUM DIDOKUMENTASIKAN secara terpusat/eksplisit.** Konsekuensi langsung terhadap § 8.2 (`23`): **output Synthesis BUKAN "Relation" (implikasi penciptaan) — harus direvisi jadi istilah yang menyiratkan PENEMUAN/PENDOKUMENTASIAN, konsisten koreksi founder.**

### 10.2 Apa Kata Kerja Ontologis Synthesis yang Benar?

**Diuji lima kandidat founder (analyze/derive/infer/reconcile/correlate) terhadap batas yang SUDAH dibuktikan (§ 8.1, § 8.3, § 10.1): Synthesis MENEMUKAN yang sudah ada, TIDAK MENCIPTAKAN, TIDAK MEMUTUSKAN.**

- **Analyze** — Diperiksa: "menganalisis" TERLALU LUAS (Discovery JUGA "menganalisis" candidate ontologi, `17` § 5-6). **Tidak cukup spesifik — gagal membedakan Synthesis dari Discovery.**
- **Derive** — Diperiksa: "derive" (menurunkan) SUDAH DIPAKAI dengan makna SPESIFIK di CECEP (`08g` § A.4, Derived Data — nilai DIHITUNG ULANG dari sumber, MENGHASILKAN nilai BARU tiap kali). **Konflik istilah — memakai "derive" untuk Synthesis akan bentrok dengan Derived Data yang SUDAH punya makna terkunci sejak Phase F. GUGUR karena tabrakan vocabulary.**
- **Infer** — Diperiksa: "infer" (menyimpulkan) menyiratkan PROSES LOGIS yang menghasilkan KESIMPULAN BARU dari premis — TAPI § 10.1 SUDAH membuktikan Synthesis TIDAK menciptakan apa pun, relasi SUDAH ADA. **Diperiksa dalam:** "Infer" COCOK untuk LANGKAH Conflict Detection (§ 9 `23` — menyimpulkan ADA kontradiksi dari dua fakta yang dibandingkan) TAPI TIDAK cocok untuk LANGKAH Dependency Analysis (murni membaca `action: Panggil CAP-013` yang SUDAH TERTULIS EKSPLISIT, tidak perlu "menyimpulkan" apa pun). **Cocok SEBAGIAN (satu dari lima langkah), tidak cocok sebagai kata kerja PAYUNG.**
- **Reconcile** — Diperiksa: "reconcile" (mendamaikan/menyelaraskan) menyiratkan ADA KONFLIK yang perlu diselesaikan — TAPI Dependency Analysis (langkah pertama) TIDAK selalu berhadapan dengan konflik (Rule-001→CAP-013 TIDAK bertentangan dengan apa pun, murni relasi netral). **Terlalu sempit — hanya cocok untuk Conflict Detection.**
- **Correlate** — Diperiksa: "correlate" (mengorelasikan) menyiratkan MENEMUKAN HUBUNGAN STATISTIK/KEBETULAN antara dua hal yang TIDAK JELAS hubungan langsungnya — TAPI relasi Rule-001→CAP-013 BUKAN korelasi (ia hubungan LANGSUNG dan EKSPLISIT, tertulis di `action`). **GUGUR — salah kategori (korelasi untuk hubungan implisit/statistik, relasi CECEP eksplisit).**

**Kelima kandidat founder GUGUR sebagai kata kerja PAYUNG (masing-masing cocok SEBAGIAN, untuk SATU langkah tertentu, bukan keseluruhan Synthesis).**

**Dicari kandidat baru (Zero Candidate Test, dari definisi § 8.1 yang sudah dibuktikan, bukan dari daftar founder):** Kata kerja yang tepat harus menangkap "menemukan sesuatu yang SUDAH ADA tapi TERSEMBUNYI/TERSEBAR, membuatnya EKSPLISIT". Diuji: **"Surface"** (dalam pengertian "memunculkan ke permukaan", bukan "permukaan" sebagai kata benda) — MENANGKAP PERSIS: relasi SUDAH ADA (di bawah permukaan, tersebar di 22 dokumen), Synthesis MEMUNCULKANNYA (tidak menciptakan, tidak mengubah, murni membuat TERLIHAT). **Diuji Reverse Proof:** Asumsikan "Surface" SALAH sebagai kata kerja payung. Kontradiksi? Diperiksa: kelima LANGKAH (§ 9) SEMUANYA bisa dideskripsikan sebagai VARIASI "memunculkan ke permukaan" — Dependency Analysis (memunculkan relasi eksplisit yang tertulis), Impact Propagation (memunculkan RANTAI relasi yang belum pernah ditelusuri sekaligus), Cross-Phase Consistency (memunculkan APAKAH dua fase konsisten — fakta yang SUDAH ada tapi belum diperiksa berdampingan), Conflict Detection (memunculkan kontradiksi yang SUDAH ada tapi tersembunyi), Coverage Analysis (memunculkan Asset mana yang BELUM diperiksa). **Tidak ditemukan kontradiksi — "Surface" bertahan sebagai kata kerja payung yang konsisten kelima langkah.**

**Kata kerja ontologis Synthesis: SURFACE (memunculkan ke permukaan) — bukan "membaca" (terlalu pasif, tidak menangkap proses aktif Conflict Detection/Cross-Phase Consistency yang membandingkan-menyimpulkan) dan bukan lima kandidat founder (masing-masing hanya cocok satu langkah).**

### 10.3 Artefak Apa yang Benar-Benar Dihasilkan Synthesis?

**Dijawab dari § 10.1-10.2 (bukan lima kandidat founder secara langsung — diuji dulu apakah salah satu cocok, konsisten disiplin Decision Competition):**

**Diuji terhadap definisi yang sudah diperbaiki:** Kalau Synthesis MENEMUKAN (bukan mencipta) dan SURFACE (bukan membaca pasif), maka artefaknya BUKAN "Relation" (implikasi penciptaan objek baru, sudah gugur § 10.1) — artefaknya adalah **CATATAN TENTANG relasi yang ditemukan**, sejenis Knowledge (dalam pengertian "pengetahuan tentang", BUKAN Knowledge Data `08g` § A.6 yang sudah py makna terkunci — perlu istilah lain untuk hindari tabrakan, sama pola dengan "Derive" yang gugur § 10.2).

**Diuji lima kandidat founder (Dependency Matrix/Impact Graph/Cross-Reference Catalog/Coverage Map/Conflict Report):**

- **Dependency Matrix** — SUDAH JADI NAMA yang dipakai `05` § F (Capability-ke-Capability) — memakainya untuk Synthesis K akan TABRAKAN ISTILAH (sama pola "Derive" § 10.2). **Perlu dibedakan — Synthesis K LEBIH LUAS dari `05` § F (lintas SEMUA Asset, bukan hanya Capability).**
- **Impact Graph** — Diperiksa: "Graph" adalah BENTUK STRUKTUR DATA (node+edge) — SESUAI dengan sifat relasi yang DITEMUKAN (Rule→Integration→AI→Design Space, rantai bercabang, PERSIS graph). **Cocok secara BENTUK.**
- **Cross-Reference Catalog** — Diperiksa: "Catalog" adalah DAFTAR (list), BUKAN graph — TIDAK menangkap sifat RANTAI/PROPAGASI (Impact Propagation, § 9) yang BUKAN daftar datar. **Kurang tepat untuk keseluruhan, TAPI cocok untuk SATU bagian (daftar Asset yang sudah diperiksa, dekat dengan Coverage).**
- **Coverage Map** — Diperiksa: ini adalah REPRESENTASI dari KRITERIA SELESAI (§ 8.4), BUKAN artefak UTAMA — ia LEBIH DEKAT ke METRIK/STATUS daripada KONTEN. **Bagian dari proses, bukan artefak utama.**
- **Conflict Report** — Diperiksa: ini HASIL dari SATU LANGKAH SPESIFIK (Conflict Detection, § 9) — SUB-BAGIAN dari keseluruhan, bukan artefak UTAMA Synthesis. **Valid sebagai KOMPONEN, bukan keseluruhan.**

**Hasil: "Impact Graph" (atau nama yang setara — belum final, Name Bias tetap berlaku) adalah artefak UTAMA (bentuk graph, konsisten sifat propagasi) — Cross-Reference Catalog/Coverage Map/Conflict Report adalah KOMPONEN/BAGIAN di dalamnya, bukan pesaing yang saling meniadakan.** Konsisten pola yang SUDAH terbukti berulang di CECEP (satu artefak utama, beberapa sub-komponen — mis. Integration Point struktur final `15` menggabungkan banyak field dari berbagai sub-analisis).

**Artefak Synthesis K: SATU GRAPH UTAMA (node = Asset dari G-J, edge = relasi yang di-Surface) dengan METADATA per edge (jenis relasi dari katalog `14` § 11.3, status konsisten/konflik dari Cross-Phase Consistency, tercakup/belum dari Coverage Analysis) — BUKAN "Relation" sebagai objek independen (sudah gugur § 10.1), BUKAN Coverage semata (itu kriteria selesai § 8.4, bukan konten).**

### 10.4 Apa yang Sebenarnya Dibekukan Saat Synthesis Di-Freeze?

**Diuji terhadap Progressive Freeze Chain (`04` § 7) — apa yang BIASANYA dibekukan Discovery Phase (definisi baru) TIDAK BERLAKU di sini (§ 8.1, Synthesis tidak menciptakan definisi).**

**Diperiksa dalam:** Kalau Synthesis SURFACE relasi yang SUDAH ADA, maka MEMBEKUKAN GRAPH ITU SENDIRI (§ 10.3) tidak masuk akal SECARA PENUH — graph itu adalah SNAPSHOT dari relasi Asset G-J PADA SATU TITIK WAKTU (Rule/Integration Point/AI Meta Model/Design Space Entry BISA terus berubah lewat proses normal mereka masing-masing, mis. Design Space Entry naik status § 17 `20`). **Kalau graph di-Freeze PERMANEN seperti definisi Rule, ia akan BASI begitu SATU Asset berubah — kontradiksi dengan sifat Design Space yang TIDAK PERNAH habis (§ 18.4 `20`).**

**Diperiksa apa yang SEBENARNYA stabil dan LAYAK dibekukan:** BUKAN ISI graph (yang berubah seiring Asset berubah) — yang dibekukan adalah **METODOLOGI § 9 itu sendiri** (lima langkah, urutan, definisi "Surface", kriteria Coverage Completion) — **PERSIS seperti yang founder duga di ronde sebelumnya ("freeze-nya mengunci METODE bukan DEFINISI", § 6 `23`), sekarang DIBUKTIKAN lebih presisi: yang dibekukan adalah METODE + STRUKTUR ARTEFAK (bentuk graph, jenis metadata per edge), BUKAN ISI KONKRET graph pada satu waktu.**

**Analogi TEPAT (diuji, bukan diasumsikan):** Ini SAMA POLA dengan Integration Strategy (`14` § 17) — yang di-Freeze adalah BENTUK Strategy Pattern (satu Capability, banyak Strategy), BUKAN isi setiap Strategy Instance (yang bisa terus bertambah). **Yang dibekukan Synthesis K: METODOLOGI Surface (5 langkah + definisi Coverage Completion) — Impact Graph ITU SENDIRI TIDAK PERNAH "Frozen" secara permanen, ia HIDUP dan DIPERBARUI setiap kali Asset baru muncul (persis Design Space yang tidak bisa habis) — GRAPH-nya sendiri lebih dekat sifat Design Space (terus berkembang) daripada sifat Rule Definition (dibekukan permanen).**

---

## 11. Serangan Lapis Kedua — Empat Pertanyaan Founder Terhadap Fondasi § 10

### 11.1 Apakah Surface dan Infer Dua Operasi Ontologis yang Berbeda?

**Diuji Difference Test langsung, sesuai instruksi founder: "Apakah Impact Propagation menemukan hubungan yang sudah eksplisit, atau menghasilkan hubungan turunan?"**

**Diperiksa dua contoh konkret berdampingan:**

| | Dependency Analysis (Rule A → CAP B) | Impact Propagation (Rule A → Rule B → Rule C, disimpulkan A mempengaruhi C) |
|---|---|---|
| Relasi TERTULIS eksplisit di sumber? | YA — `action: Panggil CAP B` tertulis LANGSUNG di Rule A | TIDAK — "A mempengaruhi C" TIDAK PERNAH tertulis di mana pun; yang tertulis hanya A→B (di Rule A) dan B→C (di Rule B), TERPISAH |
| Butuh langkah TAMBAHAN untuk sampai ke kesimpulan? | TIDAK — satu kali baca, selesai | YA — WAJIB menggabungkan DUA fakta terpisah (A→B, B→C) lewat aturan TRANSITIVITAS (kalau A→B dan B→C, maka A mempengaruhi C) — aturan ini SENDIRI adalah TAMBAHAN, bukan bagian dari fakta yang dibaca |

**Diuji Reverse Proof:** Asumsikan Surface dan Infer adalah SATU operasi yang sama. Kontradiksi? **Ya, ditemukan langsung** — kalau keduanya sama, maka MENAMBAHKAN aturan transitivitas (dibutuhkan Impact Propagation) TIDAK BOLEH mengubah apa pun secara epistemik — TAPI FAKTANYA, aturan transitivitas BISA SALAH (A→B dan B→C TIDAK SELALU berarti A mempengaruhi C secara BERMAKNA — mis. kalau B→C adalah relasi Consumption `14` § 11.3 dan A→B adalah relasi Ownership, MENGGABUNGKAN keduanya jadi "A mempengaruhi C" perlu ATURAN EKSPLISIT tentang JENIS relasi apa yang BOLEH ditransitifkan, sesuatu yang TIDAK dibutuhkan Dependency Analysis sama sekali). **Kontradiksi ditemukan — Surface (baca eksplisit) dan Infer (turunkan dari kombinasi) BUKAN operasi yang sama, dibuktikan lewat kebutuhan ATURAN TAMBAHAN yang HANYA dimiliki salah satunya.**

**Diperiksa ulang lima langkah § 9 dengan pembeda Surface/Infer yang sekarang terbukti:**

| Langkah | Surface atau Infer? | Alasan |
|---|---|---|
| Dependency Analysis | **Surface** | Membaca relasi yang TERTULIS LANGSUNG (mis. `action` Rule) |
| Impact Propagation | **Infer** | Menggabungkan RANTAI relasi lewat aturan transitivitas — TIDAK tertulis langsung |
| Cross-Phase Consistency | **Infer** | Membandingkan DUA fakta dari fase berbeda dan MENYIMPULKAN apakah konsisten — perbandingan adalah langkah tambahan, bukan pembacaan langsung |
| Conflict Detection | **Infer** | Sama seperti Cross-Phase Consistency — HASIL dari perbandingan, bukan fakta tertulis |
| Coverage Analysis | **Surface** | Membandingkan DAFTAR Asset yang ADA (tertulis di dokumen G-J) dengan daftar yang SUDAH diperiksa — murni pencocokan, bukan penurunan makna baru |

**Hasil: Surface dan Infer adalah DUA operasi ontologis berbeda — TIGA dari lima langkah (Impact Propagation, Cross-Phase Consistency, Conflict Detection) sebenarnya INFER, bukan Surface. Klaim "Surface" sebagai kata kerja PAYUNG tunggal (§ 10.2) TERLALU LUAS — pola yang SAMA PERSIS dengan kesalahan lima kandidat founder ronde sebelumnya (satu kata dipakai untuk semua langkah).**

**Revisi § 10.2/§ 8.5:** Synthesis punya DUA kelas operasi, bukan satu:
- **Surface** — memunculkan relasi yang SUDAH tertulis eksplisit (Dependency Analysis, Coverage Analysis).
- **Infer** — menurunkan relasi BARU dari KOMBINASI relasi yang sudah di-Surface, TUNDUK ATURAN EKSPLISIT tentang jenis relasi apa yang boleh digabung (Impact Propagation, Cross-Phase Consistency, Conflict Detection).

**Konsekuensi penting (diperiksa, bukan diabaikan):** Kalau Infer menghasilkan sesuatu yang TIDAK tertulis langsung di mana pun, APAKAH hasil Infer melanggar batas § 8.3 ("Synthesis TIDAK BOLEH menciptakan Asset/konsep baru")? **Diperiksa dalam:** TIDAK melanggar — hasil Infer ("A mempengaruhi C") BUKAN Asset/konsep BARU (ia tidak menciptakan Rule/Integration Point/dst. baru), ia adalah **KESIMPULAN TENTANG relasi ANTAR Asset yang SUDAH ADA** — beda kategori dari menciptakan Asset. **Batas § 8.3 tetap utuh, TIDAK perlu direvisi** — hanya kata kerja yang dipisah.

### 11.2 Apakah Impact Graph Artefak Ontologis atau Representasi Implementasi?

**Diuji Reverse Proof sesuai instruksi founder: Asumsikan TIDAK ADA Impact Graph. Masih bisakah Coverage Analysis dilakukan?**

**Diperiksa dalam:** Coverage Analysis (§ 9) didefinisikan sebagai "memeriksa apakah SEMUA Asset frozen sudah dipetakan relasinya". **Diuji: bisakah ini dilakukan dengan TABEL, bukan graph?** Diperiksa konkret: Tabel dua kolom (Asset | Sudah Diperiksa?) SECARA TEKNIS CUKUP untuk menjawab Coverage — TIDAK BUTUH struktur graph (node+edge) sama sekali untuk PERTANYAAN INI SPESIFIK. **Kontradiksi TIDAK ditemukan terhadap "Coverage butuh graph"** — Coverage BISA dilakukan tanpa graph, memakai tabel sederhana.

**Tapi... apakah Dependency Analysis dan Impact Propagation (dua langkah LAIN) BISA dilakukan tanpa struktur graph?** Diperiksa: Dependency Analysis MENGHASILKAN relasi A→B — BISA dicatat sebagai TABEL (kolom: Sumber, Target, Jenis Relasi) TANPA memvisualisasikannya sebagai graph. **TAPI Impact Propagation (rantai A→B→C, MENURUNKAN A mempengaruhi C) SECARA STRUKTURAL BUTUH kemampuan MENELUSURI RANTAI — ini ADALAH operasi graph secara matematis (graph traversal), TERLEPAS APAKAH ditampilkan visual sebagai graph atau disimpan sebagai tabel relasi.**

**Diperiksa lebih dalam — apakah "struktur graph" (matematis: node+edge+traversal) BEDA dari "Impact Graph sebagai NAMA artefak"?** **Ya, BEDA** — STRUKTUR MATEMATIS graph (untuk traversal, dibutuhkan Impact Propagation) adalah KEBUTUHAN ONTOLOGIS (tanpa kemampuan traversal, Infer untuk Impact Propagation TIDAK BISA dijalankan sama sekali — kontradiksi kalau ditolak). **TAPI "Impact Graph" SEBAGAI SATU ARTEFAK TUNGGAL bernama (bukan struktur matematisnya) adalah REPRESENTASI — bisa disimpan sebagai adjacency table, sebagai file JSON, sebagai visual diagram — bentuk PENYIMPANAN adalah keputusan Persistence Truth (Phase K/L, konsisten pola berulang `08a` § I: "representasi permukaan, bukan keputusan Philosophy").**

**Jawaban: Struktur GRAPH (matematis: node-edge-traversal) adalah KEBUTUHAN ONTOLOGIS Synthesis (WAJIB untuk menjalankan Infer/Impact Propagation) — TAPI "Impact Graph" sebagai NAMA/BENTUK artefak SATU-KESATUAN adalah REPRESENTASI IMPLEMENTASI, BUKAN keputusan Philosophy.** Ini paralel LANGSUNG dengan pola Rule (`08a` § I: struktur data WAJIB, sintaks/representasi permukaan bebas).

### 11.3 Apa Sebenarnya Node dalam Graph? Asset, atau Objek yang Lebih Spesifik?

**Diuji Difference Test: apakah SEMUA node setara (Rule = Capability = Integration Point = AI Meta Model), atau ada hierarki?**

**Diperiksa terhadap kategori ontologis yang SUDAH dibuktikan beda-beda sepanjang CECEP:** Rule/Formula = Executable Knowledge Model (`08e` § B). Integration Point = Configuration Data (`14` § 22.1). AI Meta Model = kategori tersendiri (`17` § 13). Design Space Entry = Knowledge Ontology (`20` § 14). **KEEMPATNYA adalah KATEGORI ONTOLOGIS BERBEDA** (dibuktikan tuntas masing-masing lewat Difference Test/Equivalence Test terpisah) — TAPI SEMUANYA punya SATU KESAMAAN: masing-masing adalah **SESUATU YANG SUDAH DIKUNCI/FROZEN oleh fase yang menciptakannya** (atau, untuk Design Space Entry, sesuatu yang EKSPLISIT tercatat meski belum Frozen).

**Diuji Reverse Proof:** Asumsikan node graph BUKAN "Asset" secara umum, tapi HARUS dipilah per-kategori (Rule Node, Integration Point Node, dst., masing-masing STRUKTUR BERBEDA). Kontradiksi? **Diperiksa dalam:** Kalau dipilah per-kategori, maka Dependency Analysis (§ 9) TIDAK BISA menjalankan traversal LINTAS KATEGORI dengan cara yang SERAGAM (mis. Rule→Integration Point→AI Meta Model→Design Space Entry, EMPAT kategori berbeda dalam SATU rantai, § 11.1 contoh Impact Propagation) — traversal BUTUH node yang bisa DIPERLAKUKAN SERAGAM secara STRUKTURAL (punya `id` yang bisa dirujuk, TERLEPAS isi internalnya beda). **Kontradiksi ditemukan — kalau node TIDAK diseragamkan minimal secara STRUKTURAL (id + rujukan), traversal lintas-kategori MUSTAHIL, padahal itu PERSIS kebutuhan Impact Propagation yang sudah dibuktikan wajib (§ 11.2).**

**Jawaban (koreksi presisi founder — kalimat awal "Node bukan Asset" berisiko disalahtafsirkan sebagai "Node = entitas baru", padahal yang benar sebaliknya):** **Node BUKAN representasi fisik/isi lengkap Asset (Rule TETAP Executable Knowledge Model, Integration Point TETAP Configuration Data, isinya TIDAK DIDUPLIKASI atau DILEBUR ke dalam Node) — Node adalah REPRESENTASI GRAPH dari IDENTITAS ONTOLOGIS Asset yang SUDAH FROZEN (atau EKSPLISIT tercatat untuk Design Space Entry), dengan STRUKTUR MINIMAL (id, kategori asal, link balik ke definisi lengkapnya).** Yang berubah HANYA cara Asset itu DIREPRESENTASIKAN di dalam graph (supaya traversal lintas-kategori bisa berjalan seragam, § 11.2) — BUKAN penciptaan objek ontologis baru. Node tetap TUNDUK PENUH pada definisi Asset aslinya (konsisten batas § 8.3, Synthesis tidak menciptakan/mengubah Asset) — Node murni LAPISAN REPRESENTASI, bukan LAPISAN ENTITAS.

### 11.4 Apakah "Impact" Satu Jenis Relasi di Dalam Graph, atau Graph Itu Sendiri?

**Dijawab langsung dari § 11.2-11.3:** Diperiksa — "Impact" (dampak) adalah SATU JENIS HASIL dari Infer (Impact Propagation, § 11.1) — TAPI graph itu sendiri (kumpulan Node+Edge) memuat LEBIH BANYAK JENIS edge dari sekadar "impact": edge dari Dependency Analysis adalah relasi LANGSUNG (Ownership/Consumption/dll., katalog `14` § 11.3 yang SUDAH ADA), edge dari Impact Propagation adalah relasi TURUNAN ("mempengaruhi"), edge dari Conflict Detection adalah relasi KONTRADIKSI ("bertentangan dengan").

**Diuji Reverse Proof:** Asumsikan "Impact" adalah NAMA YANG TEPAT untuk keseluruhan graph (bukan hanya satu jenis edge). Kontradiksi? **Ya** — kalau SELURUH graph disebut "Impact Graph", maka edge HASIL Dependency Analysis (relasi LANGSUNG, sudah eksplisit, BUKAN "dampak" dalam pengertian turunan) DIPAKSA masuk kategori "Impact" yang SEBENARNYA hanya cocok untuk SEBAGIAN edge (hasil Impact Propagation) — **SALAH KATEGORI, PERSIS pola kesalahan "Surface sebagai payung tunggal" (§ 11.1) yang baru saja diperbaiki.** **Kontradiksi ditemukan — "Impact" BUKAN nama yang tepat untuk keseluruhan graph, ia HANYA nama untuk SATU JENIS edge (hasil Infer-Impact Propagation).**

**Nama graph yang benar (Zero Candidate Test, dari struktur yang sudah dibuktikan § 11.2-11.3, bukan dari "Impact Graph" yang sudah terbukti salah kategori):** Diperiksa: graph ini berisi Node = REFERENSI ke Asset lintas-kategori, Edge = BERBAGAI jenis relasi (Ownership/Consumption/Trigger/dll dari katalog `14` § 11.3, PLUS relasi turunan seperti "mempengaruhi" dan "bertentangan dengan" hasil Infer). **Nama yang netral dan akurat: "Asset Relationship Graph"** (persis dugaan founder) — **"Impact" tetap dipertahankan sebagai SATU JENIS EDGE di dalamnya (edge_type: "impact"), bersanding dengan jenis edge lain (edge_type: dari katalog 10 relasi `14` § 11.3, PLUS "conflict" dari Conflict Detection).**

---

## 12. Revisi Konsolidasi Setelah Serangan Lapis Kedua

**Struktur final (menggantikan § 10.3-10.4, TIDAK mengubah § 8.1/8.3/8.4 yang tetap bertahan kedua serangan):**

```
Asset Relationship Graph (representasi implementasi, TIDAK di-Freeze permanen — § 11.2, § 10.4) {
  nodes: [{
    id, source_category: "rule" | "integration_point" | "ai_meta_model" |
                          "design_space_entry" | "capability" | "formula" | ...
    source_reference: link ke definisi lengkap Asset (TIDAK menduplikasi isi)
  }]
  edges: [{
    from, to
    edge_type: "ownership" | "consumption" | "trigger" | ... (10 relasi `14` § 11.3)
               | "impact" (hasil Infer-Propagation) | "conflict" (hasil Infer-Detection)
    operation: "surface" | "infer"  ← BARU, § 11.1, mencatat BAGAIMANA edge ditemukan
    derivation_path: [edge IDs lain]  ← WAJIB kalau operation="infer" (jejak transitivitas,
                      supaya Infer bisa DITELUSURI BALIK ke Surface asalnya — Explainability)
  }]
}
```

**Metodologi yang di-Freeze (tetap § 8.4, sekarang lebih presisi):** Definisi Surface vs Infer (§ 11.1), aturan transitivitas yang SAH untuk Infer (belum didesain detail — Design K), struktur Node sebagai referensi seragam (§ 11.3), kriteria Coverage Completion (§ 8.4, TIDAK berubah).

---

## 13. Decision Boundary — Philosophy vs Design untuk Inferensi (Penutup Philosophy K)

**Diminta founder — pagar eksplisit sebelum Design K dimulai, mencegah godaan kembali membahas Philosophy setiap kali Design menemukan pertanyaan baru (pola yang sudah berkali-kali dikoreksi Phase H-J).**

**Tes yang dipakai (diuji dulu terhadap § 8-12, bukan diasumsikan langsung benar):** *"Kalau pertanyaan ini TIDAK dijawab sekarang, apakah Synthesis (tujuan/output/pembeda-dari-Discovery/Surface-vs-Infer/Coverage Completion) masih bisa DIJELASKAN UTUH?"*

**Diuji terhadap lima pilar Philosophy K yang sudah dibangun:** tujuan (§ 8.1), output (§ 8.2/11.4), pembeda dari Discovery (§ 8.5), operasi Surface vs Infer (§ 11.1), Coverage Completion (§ 8.4) — SEMUANYA bisa dijelaskan TANPA menjawab aturan transitivitas/relation algebra/traversal konkret. **Kelima pilar Philosophy TIDAK BERGANTUNG pada jawaban pertanyaan Design.**

**Diuji arah sebaliknya:** *"Kalau Asset Relationship Graph mulai dibangun TANPA aturan transitivitas eksplisit, apakah risikonya nyata (bukan hipotetis)?"* **Ya** — dibuktikan § 11.1: menggabungkan edge tanpa aturan bisa menghasilkan Infer yang SALAH (mis. menggabungkan edge Ownership dengan edge Consumption sembarangan). **Ini prasyarat IMPLEMENTASI (mencegah kesalahan konkret), bukan prasyarat DEFINISI (Philosophy tetap utuh tanpanya).**

**Prinsip Decision Boundary (dikunci sebagai pagar Design K):**

> **Pertanyaan yang menjawab "APA ITU inferensi/relasi/edge" → Philosophy (SUDAH SELESAI, § 8-12).**
> **Pertanyaan yang menjawab "BAGAIMANA inferensi/traversal DIJALANKAN" → Design (BELUM dimulai, domain Design K berikutnya).**

**Katalog cepat untuk pertanyaan yang AKAN muncul di Design K (diklasifikasikan DI MUKA, supaya tidak perlu diperdebatkan ulang saat muncul):**

| Pertanyaan Design K yang diprediksi | Kelas |
|---|---|
| BFS atau DFS untuk traversal? | Design |
| Neo4j atau PostgreSQL (recursive CTE) untuk penyimpanan? | Design |
| Edge cache — perlu atau tidak? | Design |
| Incremental traversal (update parsial) vs full rebuild? | Design |
| Fixed-point propagation (kapan Infer berhenti menggabungkan)? | Design |
| SCC (Strongly Connected Component) detection untuk siklus? | Design |
| Aturan transitivitas per `edge_type` (Ownership boleh digabung Consumption?) | Design |
| Apa itu Surface vs Infer, kenapa dua operasi berbeda | **Philosophy (sudah dijawab § 11.1)** |
| Apa itu Coverage Completion | **Philosophy (sudah dijawab § 8.4)** |

**Konsekuensi mengikat:** Design K TIDAK BOLEH membuka kembali definisi Surface/Infer, definisi Asset Relationship Graph, atau Coverage Completion — ketiganya FROZEN sebagai hasil Philosophy K. Design K HANYA merancang MEKANISME menjalankan ketiganya secara konkret.

---

## Assumptions

1. Empat jawaban § 1-4 diasumsikan benar berdasarkan pemeriksaan terhadap cakupan Phase K yang SUDAH dipetakan sejak `04` § 14 (backup/storage/tenant migration) — kalau Philosophy K menemukan cakupan Phase K SEBENARNYA lebih luas dari tiga contoh itu (Deployment Impact bisa saja mencakup hal yang belum terpikirkan), Eligibility Test ini perlu diuji ulang, bukan dianggap final selamanya.
2. Definisi kerja Synthesis Phase (§ 6) diasumsikan CUKUP sebagai titik awal — metodologi analisisnya SENGAJA belum ditentukan (didesain di Philosophy K berikutnya), konsisten pagar "Philosophy adalah konsekuensi, bukan desain" yang sudah dipegang teguh sejak Phase I.

## Open Questions

3. Validation untuk artefak Synthesis (Asset Relationship Graph, § 12) — dugaan kuat: berporos Coverage dan Consistency — belum didesain detail.
4. Aturan transitivitas yang SAH untuk operasi Infer (§ 11.1, § 12 — kapan dua edge Surface boleh digabung jadi satu edge Infer, kapan tidak) — BELUM didesain, eksplisit didaftar sebagai pekerjaan Design K di § 12.
5. Nama final artefak ("Asset Relationship Graph" masih kandidat kerja, § 11.4) — Name Bias tetap berlaku.
6. Mekanisme konkret pembaruan graph saat Asset baru muncul — pekerjaan Design K.

## Status

**Discovery Eligibility Test selesai — Phase K GAGAL tiga dari empat kriteria menjadi Discovery Phase. Phase K DIRESMIKAN sebagai Synthesis Phase.**

**Philosophy of Synthesis dibangun (§ 8-9), diserang dua lapis (§ 10-11), dan dikonsolidasikan (§ 12).** Lapis pertama (§ 10): Synthesis MENEMUKAN relasi yang sudah ada (bukan mencipta), kata kerja "membaca" ditarik jadi "Surface". Lapis kedua (§ 11), empat serangan lebih tajam menghasilkan koreksi STRUKTURAL nyata: (11.1) **"Surface" sebagai kata kerja payung tunggal TERBUKTI SALAH** — Difference Test membuktikan Impact Propagation/Cross-Phase Consistency/Conflict Detection adalah **Infer** (menurunkan relasi dari kombinasi, tunduk aturan transitivitas eksplisit), berbeda ontologis dari Dependency Analysis/Coverage Analysis yang tetap **Surface** (membaca eksplisit) — TIGA dari lima langkah sebenarnya Infer, bukan Surface, pola kesalahan "satu kata terlalu luas" yang SAMA PERSIS ditemukan lagi satu lapis lebih dalam. (11.2) Struktur graph (node-edge-traversal) adalah kebutuhan ONTOLOGIS (wajib untuk Infer/Impact Propagation, dibuktikan Reverse Proof — Coverage saja bisa pakai tabel, tapi Impact Propagation tidak bisa), sementara "Impact Graph" SEBAGAI SATU ARTEFAK BERNAMA adalah representasi IMPLEMENTASI, bukan Philosophy. (11.3) Node BUKAN Asset spesifik (Rule/Integration Point tetap terpisah kategorinya) — Node adalah LAPISAN REFERENSI SERAGAM di atas Asset yang sudah frozen, dibuktikan wajib lewat Reverse Proof (traversal lintas-kategori mustahil tanpa keseragaman struktural). (11.4) **"Impact" BUKAN nama yang tepat untuk keseluruhan graph** — ia hanya SATU jenis edge (hasil Infer-Propagation); nama graph yang benar adalah **Asset Relationship Graph** (dugaan founder terbukti benar), dengan `edge_type` mencakup 10 relasi katalog `14` § 11.3 PLUS "impact" dan "conflict" dari hasil Infer. **§ 12 mengonsolidasikan:** struktur Node/Edge final mencatat `operation: surface|infer` dan `derivation_path` (jejak Explainability untuk edge hasil Infer) — kriteria Coverage Completion (§ 8.4) dan kelima langkah (§ 9, sekarang dipetakan eksplisit Surface/Infer) TETAP VALID, hanya kata kerja dan penamaan yang direvisi bertingkat. Siap lanjut ke Design K (menerapkan metodologi Surface+Infer terhadap Asset G-J yang frozen, mendesain aturan transitivitas Infer yang masih terbuka), TIDAK PERNAH menjalankan Five Whys/Ontology Candidate Matrix untuk Phase K.
