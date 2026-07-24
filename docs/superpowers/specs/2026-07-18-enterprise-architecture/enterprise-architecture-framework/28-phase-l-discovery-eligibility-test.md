# CECEP — Phase L: Discovery Eligibility Test

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** BUKAN Discovery, BUKAN Philosophy, BUKAN penulisan dokumentasi — gate yang dijalankan SEBELUM satu halaman Phase L ditulis, mengikuti disiplin persis [`23`](23-phase-k-discovery-eligibility-test.md) (Phase K). Dijalankan KARENA founder eksplisit menolak asumsi "Documentation = menulis dokumen" — hakikat ontologis Phase L HARUS dibuktikan, bukan diterima dari nama fasenya.

**Aturan menjalankan test ini:** Sama seperti `23` — setiap jawaban WAJIB diuji terhadap konsep yang SUDAH ADA (termasuk sekarang Synthesis Phase, kategori metodologi BARU dari Phase K) sebelum diterima.

---

## 1. Apakah "Documentation" Ontologi Independen, atau Representasi dari Ontologi yang Sudah Ada?

**Diperiksa dari sumber tugas Phase L yang SUDAH dikunci** (`04` § 14, Operational Perspective): Phase L dipetakan untuk perspektif **"Operational Blueprint"** — dokumentasi operasional lengkap (runbook, DR plan, retention policy, legal hold procedure) sebagai BAGIAN dari dokumentasi final.

**Diuji: apakah "Documentation" punya STRUKTUR SENDIRI yang tidak bisa dijelaskan konsep lain?** Dicoba definisikan tanpa merujuk konsep manapun yang sudah ada: *"Documentation = representasi yang bisa dibaca manusia dari sesuatu yang SUDAH ADA dalam bentuk lain."* **Diperiksa dalam:** ini SECARA STRUKTURAL adalah **PROYEKSI/REPRESENTASI** (A ditampilkan sebagai B untuk audiens tertentu), BUKAN objek berdiri sendiri seperti Rule/Integration Point/Design Space (yang punya bentuk KONKRET yang bisa ditunjuk sebagai satu entitas independen dari APA yang mereka wakili) — TAPI juga BUKAN relasi murni seperti Impact (`23` § 1, yang HANYA bermakna sebagai hubungan A→B). **"Documentation" berbeda dari KEDUANYA — ia bukan objek independen (seperti Rule), bukan relasi murni (seperti Impact) — ia PROYEKSI/TAMPILAN dari sesuatu yang sudah ada, untuk PENERIMA tertentu.**

**Diuji Reverse Proof:** Asumsikan Documentation ADALAH ontologi independen. Kontradiksi? **Diperiksa dalam:** Kalau Documentation independen, ia HARUS py identitas yang TIDAK bergantung pada APA yang didokumentasikan — TAPI SETIAP dokumentasi (Rule Explanation `08a` § R, Rule Definition itu sendiri, Asset Relationship Graph `23` § 12) SELALU dan HANYA bermakna SEBAGAI REPRESENTASI dari sesuatu yang LAIN (Rule Explanation tidak "ada" tanpa Rule yang dijelaskannya). **Kontradiksi ditemukan — Documentation TIDAK PUNYA identitas independen dari yang didokumentasikannya, PERSIS pola yang membuat "Impact" gugur di `23` § 1 — TAPI BEDA JENIS kegagalan (relasi vs proyeksi, dibedakan lebih lanjut § 3).**

**Jawaban: "Documentation" BUKAN ontologi independen — ia PROYEKSI/REPRESENTASI dari Asset yang sudah ada (Rule, Integration Point, AI Meta Model, Design Space Entry, Asset Relationship Graph itu sendiri), UNTUK AUDIENS/TUJUAN tertentu.**

---

## 2. Apakah Phase L Butuh Discovery Penuh, Synthesis (Seperti K), atau Kategori Metodologi Baru?

**Diuji dengan mencoba MENJAWAB pertanyaan konkret Phase L (dari `04` § 14: runbook, DR plan, retention policy, legal hold) HANYA memakai vocabulary yang sudah ada — persis metodologi `23` § 2:**

- **"Runbook"** — Diperiksa: prosedur operasional harian. Apa isinya? Referensi ke Integration Point (`14` § 22.6, bagaimana menangani Degraded state), Rule Failure Policy (`08a` § L), AI Approval flow (`17` § 11.4). **Dijawab PENUH memakai konsep yang sudah ada — runbook adalah KOMPILASI PROSEDUR yang SUDAH terdefinisi di dokumen G-K, disusun untuk audiens operator.**
- **"DR Plan"** — Diperiksa: rencana pemulihan bencana. Bergantung pada Historical Data/Backup (`08g` § A.7, `23` § 1 poin backup strategy — SUDAH dijawab Synthesis K sebagai konsekuensi "Everything is Versioned"). **Dijawab PENUH memakai prinsip yang sudah ada.**
- **"Retention Policy"** — Diperiksa: SUDAH dijawab TUNTAS oleh `23` § 2 (Storage Growth = konsekuensi Historical Data tidak pernah dihapus) — retention policy adalah ATURAN OPERASIONAL tentang KAPAN/BAGAIMANA data historis di-archive (bukan dihapus, `04` § 1). **Dijawab penuh.**
- **"Legal Hold"** — Diperiksa: prosedur MENAHAN data dari retention normal karena kebutuhan hukum. Bergantung pada Audit Data (`07` § C.1) dan Immutability (`08g` § A.3 Transactional Data). **Dijawab penuh memakai konsep yang sudah ada.**

**Diuji Reverse Proof:** Asumsikan Phase L TIDAK butuh Discovery ontologis terpisah (semua pertanyaannya sudah terjawab dari G-K). Kontradiksi? **Diperiksa dalam:** TIDAK ditemukan kontradiksi — SETIAP contoh konkret Phase L BERHASIL dijawab tanpa satu konsep ontologis baru. **Sama hasil dengan Phase K (`23` § 2) — TIDAK butuh Discovery ontologis independen.**

**Tapi... apakah ini otomatis berarti Phase L = Synthesis Phase (SAMA seperti K)?** **Diperiksa TIDAK OTOMATIS — harus diuji TERPISAH, karena "bukan Discovery" ada BANYAK kemungkinan bentuk lain (dibuktikan di § 3-4), tidak hanya Synthesis.**

---

## 3. Apa Sebenarnya Output Phase L? (Lima Kandidat Diuji)

**Diuji lima kandidat founder terhadap definisi § 1 (Documentation = proyeksi/representasi untuk audiens):**

**Dokumentasi (murni)** — Diperiksa: terlalu GENERIK (tidak menjelaskan APA yang membedakan Phase L dari, misalnya, `24` yang JUGA dokumentasi/artefak tertulis). **Diuji Reverse Proof:** kalau "Dokumentasi" adalah jawaban, maka SETIAP dokumen CECEP dari `00` sampai `27` SUDAH "Phase L" (mereka semua dokumentasi) — **kontradiksi, karena itu meniadakan KEBUTUHAN Phase L sebagai fase TERPISAH.** **GUGUR — terlalu generik, tidak membedakan.**

**Representasi** — Diperiksa: sudah dipakai § 1 sebagai bagian DEFINISI DASAR (Documentation = proyeksi/representasi) — TAPI sebagai NAMA OUTPUT, "Representasi" SAMA generiknya dengan "Dokumentasi" (Asset Relationship Graph K JUGA representasi). **GUGUR — sama alasan.**

**Knowledge Package** — Diperiksa: "Knowledge" SUDAH py makna TERKUNCI (`08g` § A.6, Company Intelligence Loop — pengetahuan yang BERKEMBANG dari pengalaman proyek AKTUAL). **Diuji Reverse Proof:** apakah Phase L output BERKEMBANG lewat Company Intelligence Loop? **TIDAK** — Runbook/DR Plan/Retention Policy adalah PROSEDUR OPERASIONAL yang STABIL (berubah lewat REVISI SADAR, bukan pembelajaran otomatis dari data proyek). **GUGUR — konflik istilah, sama pola "Derive"/"Relation" yang gugur di `23`/`25`.**

**Operational Artifact** — Diperiksa: MENANGKAP sifat KONKRET (runbook/DR plan ADALAH artefak yang dipakai OPERASIONAL, bukan abstrak). **Diuji Reverse Proof:** Asumsikan ini SALAH. Kontradiksi? **Diperiksa dalam:** TIDAK ditemukan kontradiksi keras — TAPI diperiksa apakah CUKUP SPESIFIK dibanding kandidat lain yang BELUM diuji (§ kandidat baru di bawah, disiplin Decision Competition — jangan berhenti di kandidat kelima yang "lumayan cocok").

**"Sesuatu yang lain" (Zero Candidate Test, dari definisi § 1, TANPA melihat kandidat founder lebih dulu):** Documentation = proyeksi Asset UNTUK AUDIENS tertentu. **Diperiksa: apa yang MEMBEDAKAN proyeksi Phase L dari proyeksi lain yang SUDAH ADA** (Rule Explanation `08a` § R = proyeksi untuk AUDIT; Integration Point struktur = proyeksi untuk EKSEKUSI MESIN)? **Diperiksa dalam: Phase L proyeksi untuk AUDIENS MANUSIA YANG BUKAN ARSITEK/DEVELOPER** (operator, tim legal, tim ops) — BEDA dari SELURUH dokumen `00`-`27` yang audiensnya adalah TIM ARSITEKTUR/ENGINEERING. **Kandidat baru: "Operational Interface"** — proyeksi Asset/keputusan arsitektur KE BENTUK yang bisa DIKONSUMSI operator NON-ARSITEK, TANPA mengubah Asset aslinya.

**Diuji Decision Competition (Operational Artifact vs Operational Interface):** Diperiksa dalam: "Artifact" menekankan BENTUK (dokumen fisik) — "Interface" menekankan FUNGSI (titik kontak antara arsitektur dan operator). **Diuji Reverse Proof: apakah "Interface" lebih tepat karena `24`/`26` SUDAH memakai kata "Interface" untuk konsep SPESIFIK (kontrak akses Repository, `26` § 1.3)?** **Ya — TABRAKAN ISTILAH, sama pola berulang.** **"Operational Artifact" MENANG** (tidak tabrakan, cukup spesifik lewat kata "Operational" yang membedakan dari Artifact G-K yang arsitektural).

**Output Phase L: Operational Artifact — proyeksi Asset/keputusan arsitektur (G-K) ke bentuk yang dikonsumsi AUDIENS OPERASIONAL (bukan arsitek), TANPA mengubah Asset asli.**

---

## 4. Apa yang Dibekukan di Akhir Phase L?

**Diuji terhadap pola Freeze yang SUDAH established (Discovery Phase membekukan DEFINISI, Synthesis Phase K membekukan METODOLOGI bukan isi graph, `23` § 10.4):**

**Diperiksa: Operational Artifact (runbook, dll.) — apakah ISINYA dibekukan, atau METODOLOGI penyusunannya?** Diuji Reverse Proof: Asumsikan ISI runbook dibekukan permanen. Kontradiksi? **Ya** — runbook operasional WAJIB berubah mengikuti Asset yang didokumentasikannya (kalau Integration Point dapat field baru, `26`, runbook penanganannya HARUS diperbarui) — kalau ISI dibekukan permanen, runbook akan BASI SAMA seperti Asset Relationship Graph yang TIDAK BOLEH dibekukan isinya (`23` § 10.4). **Kontradiksi ditemukan — ISI Operational Artifact TIDAK dibekukan permanen, ia HIDUP mengikuti Asset G-K.**

**Yang dibekukan: METODOLOGI PROYEKSI** — ATURAN bagaimana Asset G-K DIUBAH jadi Operational Artifact (mis. "Integration Point Degraded state WAJIB muncul di runbook sebagai prosedur eskalasi X") — persis pola Synthesis K (`23` § 10.4, metodologi Surface/Infer dibekukan, bukan isi graph).

**Diperiksa: apakah ini berarti Phase L = Synthesis Phase (SAMA PERSIS K)?**

---

## 5. Decision Boundary — Apakah Phase L Synthesis, atau Kategori Ketiga?

**Diuji Difference Test LANGSUNG antara Phase K (Synthesis, sudah terbukti) dan Phase L (kandidat):**

| Dimensi | Phase K (Synthesis) | Phase L (diperiksa) |
|---|---|---|
| Tujuan | Memunculkan relasi yang SUDAH ADA (Surface) + menurunkan relasi BARU dari kombinasi (Infer) | Memproyeksikan Asset yang SUDAH ADA ke BENTUK BARU untuk audiens BARU |
| Audiens output | Sistem lain (Coverage Analyzer, Conflict Analyzer — MESIN, bukan manusia) | MANUSIA (operator, legal, ops — BUKAN mesin) |
| Boleh menciptakan hal baru? | TIDAK — hanya menemukan relasi (Surface) atau menurunkan (Infer, tapi TETAP dari yang sudah ada) | **Diperiksa dalam** — apakah proyeksi ke bentuk BARU (runbook TIDAK PERNAH ada sebelumnya sebagai teks) adalah "menciptakan"? |
| Operasi inti | Surface + Infer (dua operasi EPISTEMIK, `23` § 11.1) | **Diperiksa: PROJECT (operasi BARU?) — proyeksi bukan "menemukan" (Surface) atau "menurunkan makna baru" (Infer), ia MENERJEMAHKAN bentuk untuk audiens berbeda** |

**Diuji Reverse Proof — apakah "Project" (operasi Phase L) SAMA dengan Surface atau Infer?**

**Asumsikan Project = Surface.** Kontradiksi? **Ya** — Surface (`23` § 11.1) MEMUNCULKAN relasi yang SUDAH TERTULIS EKSPLISIT (baca langsung field Asset) — Project MENGUBAH BENTUK (dari struktur data Rule ke KALIMAT PROSEDUR manusia) — **Surface TIDAK PERNAH mengubah bentuk (hanya membaca), Project SELALU mengubah bentuk (menerjemahkan struktur→naratif).** **Kontradiksi ditemukan — Project ≠ Surface.**

**Asumsikan Project = Infer.** Kontradiksi? **Ya** — Infer (`23` § 11.1) MENGGABUNGKAN DUA relasi jadi relasi BARU (masih dalam BENTUK yang SAMA, edge→edge) — Project mengambil SATU Asset (atau kumpulan) dan menghasilkan BENTUK BERBEDA TOTAL (data terstruktur → prosa/prosedur) — **Infer tidak pernah mengubah BENTUK REPRESENTASI, hanya MENGGABUNGKAN dalam bentuk yang sama.** **Kontradiksi ditemukan — Project ≠ Infer.**

**Kesimpulan: Phase L BUKAN Synthesis Phase (Project adalah operasi BERBEDA dari Surface DAN Infer) — Phase L adalah KATEGORI METODOLOGI KETIGA, belum pernah ada di CECEP.**

---

## 6. Definisi Kerja Kategori Ketiga — "Projection Phase" (Belum Final, Name Bias Berlaku)

**Ditelusuri dari operasi Project yang baru ditemukan (§ 5) — didefinisikan formal sebelum diberi nama, konsisten disiplin CECEP:**

> **Projection Phase: fase yang MENERJEMAHKAN Asset/hasil dari fase-fase sebelumnya (Discovery ATAU Synthesis) ke BENTUK REPRESENTASI BARU untuk AUDIENS yang BERBEDA dari audiens arsitektur asli — TANPA mengubah Asset sumber, TANPA menciptakan Truth baru (Layer 5 murni, konsisten batas SEMUA fase G-K), METODOLOGI proyeksinya yang dibekukan (bukan isi hasil proyeksi).**

**Diuji Universality Test cepat (dua skenario):**

**Tapi... apakah "menerjemahkan struktur ke prosa" BENAR-BENAR beda dari Synthesis, atau hanya VARIASI PERMUKAAN Infer?** Diuji: Infer WAJIB punya `derivation_path` yang bisa ditelusuri balik LEWAT EDGE (`23` § 12) — Project, kalau menghasilkan PROSA, TIDAK PUNYA STRUKTUR EDGE untuk ditelusuri balik SECARA FORMAL SAMA — **ia butuh MEKANISME EXPLAINABILITY BERBEDA (mis. "kalimat prosedur X diterjemahkan dari field Y Asset Z", bukan derivation_path graph).** **Bertahan sebagai kategori BERBEDA.**

**Tapi... bagaimana kalau Phase L HANYA menyalin field mentah Asset ke tabel (tanpa "menerjemahkan" sama sekali) — apakah itu masih Project, atau kembali jadi Surface?** Diperiksa: KALAU murni menyalin TANPA mengubah bentuk konseptual (field tetap field, hanya dipindah lokasi), itu BUKAN Project — itu memang Surface (Documentation dalam bentuk PALING SEDERHANA, katalog field). **Project SPESIFIK untuk kasus BENTUK BERUBAH (struktur→prosedur, data→narasi)** — kalau bentuk TIDAK berubah, itu Surface biasa yang KEBETULAN hasilnya didokumentasikan.

**Konsekuensi: Phase L SEBAGIAN Surface (untuk referensi API/field mentah), SEBAGIAN Project (untuk runbook/DR plan/prosedur naratif) — DUA OPERASI BERBEDA di dalam SATU fase, mirip pola Phase K yang JUGA punya BEBERAPA operasi (Surface+Infer+Compare).**

---

## 7. Apakah Ada Klasifikasi Fase yang Lebih Fundamental? (Pertanyaan Meta Founder)

**Diuji eksplisit: apakah SELURUH roadmap A-L punya BEBERAPA "kelas fase" fundamental, bukan setiap fase unik?**

**Diperiksa SETIAP fase G-L terhadap OPERASI INTI yang sudah dibuktikan masing-masing:**

| Fase | Operasi Inti | Kelas |
|---|---|---|
| G (Rule) | Five Whys → menemukan definisi BARU (Executable Knowledge Model) | **Discovery** |
| H (Integration) | Five Whys → menemukan definisi BARU (Determinism Boundary) | **Discovery** |
| I (AI) | Five Whys → menemukan definisi BARU (Executable Knowledge Model bentuk lain) | **Discovery** |
| J (Design Space) | Five Whys → menemukan definisi BARU (Knowledge Ontology payung) | **Discovery** |
| K (Synthesis) | Surface (baca eksplisit) + Infer (turunkan dari kombinasi, BENTUK TETAP) | **Synthesis** |
| L (Documentation) | Surface (baca eksplisit) + Project (terjemahkan BENTUK, audiens beda) | **Projection** (kategori baru, § 6) |

**Diuji Reverse Proof — apakah TIGA kelas ini (Discovery/Synthesis/Projection) LENGKAP, atau ADA kelas keempat yang belum terlihat?** Diperiksa: Discovery MENCIPTAKAN Truth baru (Layer 2-4, definisi dikunci). Synthesis MENGKOMBINASIKAN Truth yang ada TANPA mengubah bentuk representasi (tetap graph/edge). Projection MENERJEMAHKAN Truth yang ada KE BENTUK BARU untuk audiens baru TANPA mengubah Truth. **Pola yang muncul: TIGA kelas ini berbeda pada SATU SUMBU yang SAMA — "apakah Truth baru diciptakan" (Discovery=ya, Synthesis/Projection=tidak) DAN "apakah bentuk representasi berubah" (Discovery=n/a-mendefinisikan bentuk pertama kali, Synthesis=tidak/tetap edge, Projection=ya/berubah total).**

**Matriks dua-sumbu (ditemukan dari pengujian, bukan diasumsikan):**

```
                    Truth Baru?     Bentuk Berubah?
Discovery (G-J)     YA              N/A (mendefinisikan bentuk pertama kali)
Synthesis (K)       TIDAK           TIDAK (tetap struktur graph/edge)
Projection (L)      TIDAK           YA (struktur → prosa/UI/dokumen)
```

**Diuji: apakah SEL KOSONG (Truth Baru=TIDAK, Bentuk Berubah=TIDAK — sudah terisi Synthesis; Truth Baru=YA, Bentuk Berubah=YA — BELUM terlihat instance-nya) menyiratkan kelas KEEMPAT yang belum ditemukan?** **Diperiksa: "Truth Baru=YA + Bentuk Berubah=YA" akan berarti MENCIPTAKAN definisi BARU SEKALIGUS DALAM BENTUK BARU (bukan definisi terstruktur seperti Rule/Formula) — TIDAK ADA instance ini di roadmap A-L manapun (bahkan Discovery G-J semuanya MENGHASILKAN definisi dalam bentuk TERSTRUKTUR yang SAMA, bukan bentuk baru).** **Sel ini KOSONG SECARA STRUKTURAL untuk CECEP (bukan berarti mustahil secara umum, tapi TIDAK DIBUTUHKAN oleh roadmap A-L) — dicatat sebagai TEMUAN, bukan dipaksa diisi.**

**Jawaban pertanyaan meta founder: YA, ADA klasifikasi fase yang lebih fundamental — TIGA KELAS (Discovery/Synthesis/Projection), dibedakan oleh MATRIKS DUA SUMBU (Truth Baru? / Bentuk Representasi Berubah?), BUKAN setiap fase unik. Roadmap A-L, meski py DUA BELAS nama fase berbeda (A sampai L), SECARA METODOLOGIS hanya py TIGA POLA DASAR.**

---

## 8. Kesimpulan Eligibility

| # | Pertanyaan | Jawaban |
|---|---|---|
| 1 | Ontologi independen atau representasi? | **REPRESENTASI/PROYEKSI** — bukan objek berdiri sendiri, bukan relasi murni |
| 2 | Discovery, Synthesis, atau kategori baru? | **KATEGORI BARU — Projection Phase** (dibuktikan Reverse Proof, Project ≠ Surface ≠ Infer) |
| 3 | Output Phase L? | **Operational Artifact** (proyeksi Asset untuk audiens operasional non-arsitek) |
| 4 | Apa yang dibekukan? | **Metodologi proyeksi** (aturan Asset→Artifact), bukan isi Artifact (hidup mengikuti Asset) |
| 5 | Implementasi atau makna ontologis? | **Makna ontologis TERSENDIRI** — Projection adalah operasi ketiga (bersama Discovery, Synthesis) yang belum pernah diformalkan |

**Vonis: Phase L GAGAL kriteria Discovery Ontologis (sama seperti K), TAPI JUGA BUKAN Synthesis Phase murni — Phase L adalah instance PERTAMA dari kelas ketiga: PROJECTION PHASE.**

---

## 9. Projection Boundary Test — Koreksi Founder: "Bentuk Berubah" Terlalu Longgar

**Diperiksa dulu: apakah kritik founder valid?** § 5-7 mendefinisikan Projection lewat SATU pembeda ("bentuk representasi berubah") — TAPI Serialization (Graph→JSON), Compilation (kode→binary), Rendering (data→diagram) SEMUANYA "mengubah bentuk representasi" TANPA pernah dianggap satu kelas metodologi arsitektural. **Kritik VALID — Representation Boundary Bias nyata: definisi § 6 terlalu longgar, akan menelan operasi yang SUDAH jelas beda kategori (implementasi murni) sebagai "Projection".**

### 9.1 Difference Test — Enam Kandidat Tetangga

**Kriteria uji per kandidat: apakah operasi ini mengubah bentuk representasi TAPI beda dari Project secara FUNDAMENTAL (bukan sekadar nama)?**

**Serialization** (Graph→JSON) — Diperiksa: tujuan Serialization adalah PERSISTENSI/TRANSMISI — bentuk JSON WAJIB bisa DIUBAH BALIK (deserialize) ke Graph ASLI TANPA KEHILANGAN INFORMASI (lossless, round-trip). **Diuji Reverse Proof:** Asumsikan Project = Serialization. Kontradiksi? **Ya** — Operational Artifact (runbook, § 3) TIDAK BISA di-"deserialize" balik jadi Integration Point struktur asli (prosa prosedural KEHILANGAN presisi struktural sengaja, demi keterbacaan manusia) — **Serialization WAJIB lossless, Project SECARA SENGAJA lossy (memilih apa yang relevan untuk audiens, membuang detail teknis).** **GUGUR sebagai SAMA — beda fundamental pada properti round-trip.**

**Compilation** (kode sumber→binary/bytecode) — Diperiksa: tujuan Compilation adalah EKSEKUSI MESIN (hasil compile DIJALANKAN, bukan DIBACA). **Diuji Reverse Proof:** Asumsikan Project = Compilation. Kontradiksi? **Ya** — Operational Artifact TIDAK PERNAH dieksekusi sistem (ia dibaca MANUSIA, sudah dikonfirmasi § 1 "audiens manusia bukan arsitek"). **GUGUR — audiens fundamental berbeda (mesin vs manusia).**

**Code Generation** (spesifikasi→kode sumber) — Diperiksa: MIRIP Compilation, hasilnya DIEKSEKUSI (atau setidaknya DIPROSES lebih lanjut oleh compiler/interpreter). **Diuji Reverse Proof: sama kontradiksi dengan Compilation** — hasil Code Generation BUKAN untuk dibaca manusia sebagai keputusan FINAL, ia INPUT untuk proses MESIN selanjutnya. **GUGUR — sama alasan (audiens mesin).**

**Reporting** — Diperiksa PALING DEKAT secara intuitif (laporan operasional JUGA untuk manusia). **Diuji Difference Test lebih dalam:** Report TRADISIONAL adalah SNAPSHOT SEKALI JADI (laporan bulanan, selesai dibuat = selesai, tidak "hidup" mengikuti sumber data). **Diuji Reverse Proof:** Asumsikan Project = Reporting. Kontradiksi? **Ya** — § 4 SUDAH membuktikan ISI Operational Artifact TIDAK dibekukan (hidup mengikuti Asset G-K berubah) — Report SECARA DEFINISI adalah POTRET WAKTU TERTENTU yang TIDAK diperbarui otomatis. **GUGUR — beda pada sifat "hidup vs snapshot beku".**

**Rendering** (data→visual: diagram, chart, UI) — Diperiksa: Rendering adalah TRANSFORMASI OTOMATIS DETERMINISTIK (data yang SAMA selalu menghasilkan visual yang SAMA, tanpa PILIHAN INTERPRETATIF). **Diuji Reverse Proof:** Asumsikan Project = Rendering. Kontradiksi? **Ya** — Project (menerjemahkan struktur Integration Point jadi PROSEDUR runbook) MEMBUTUHKAN PILIHAN INTERPRETATIF MANUSIA (bagaimana MENJELASKAN Degraded state sebagai LANGKAH operator — ini bukan transformasi OTOMATIS 1-ke-1 seperti Rendering grafik dari angka). **GUGUR — Rendering deterministik-otomatis, Project butuh judgment interpretatif.**

**Export** (data internal→format standar untuk dibawa keluar sistem, mis. CSV/PDF) — Diperiksa: Export MIRIP Serialization (fokus PORTABILITAS, bukan PENERJEMAHAN MAKNA). **Diuji Reverse Proof: sama alasan Serialization** — Export mempertahankan STRUKTUR DATA (kolom tetap kolom), tidak menerjemahkan jadi PROSA/PROSEDUR. **GUGUR — sama alasan Serialization (bukan lossy-interpretatif).**

**Hasil Difference Test: SEMUA ENAM kandidat GUGUR, dengan DUA POLA PEMBEDA yang konsisten muncul berulang:**
1. **Audiens** — lima dari enam (Serialization/Compilation/CodeGen/Export bertujuan MESIN atau ROUND-TRIP, bukan manusia-non-arsitek) — HANYA Reporting yang audiensnya manusia.
2. **Fidelity/Sifat Waktu** — Reporting (audiens benar) gugur karena SNAPSHOT BEKU (bukan hidup), dan Serialization/Export gugur karena WAJIB lossless (Project sengaja lossy).

### 9.2 Audience Test

**Diperiksa lima kandidat founder — apakah Human/Machine/Operator/Auditor/Developer adalah KATEGORI TERPISAH, atau bisa DIKELOMPOKKAN?**

**Diuji: Machine vs empat lainnya (Human/Operator/Auditor/Developer)** — Diperiksa dalam: Machine SEBAGAI AUDIENS berarti hasil DIPROSES OTOMATIS (parser, compiler) — SUDAH terbukti § 9.1 BUKAN Project (itu Serialization/Compilation/CodeGen). **Machine GUGUR sebagai sub-kategori Projection — Project SECARA DEFINISI audiensnya BUKAN mesin** (dikonfirmasi ulang, bukan temuan baru).

**Diuji EMPAT sisanya (Human/Operator/Auditor/Developer) — apakah keempatnya BUTUH Project TERPISAH, atau SATU Project bisa melayani semua?** Diperiksa: **Developer** — Diuji Reverse Proof: apakah dokumentasi UNTUK DEVELOPER (mis. API reference) adalah Project? Diperiksa dalam: dokumentasi API SERING murni KATALOG FIELD (bentuk TIDAK berubah secara konseptual, hanya DIPINDAH ke halaman referensi) — **INI SURFACE, bukan Project (dikonfirmasi ulang temuan § 6 "kalau bentuk tidak berubah secara konseptual, itu Surface, bukan Project").** **Developer sebagai audiens SERING dilayani Surface, BUKAN otomatis Project.**

**Operator/Auditor/Legal (dari `04` § 14 asli)** — Diperiksa: KETIGANYA butuh PENERJEMAHAN INTERPRETATIF (runbook = prosedur BUKAN field mentah; DR plan = narasi tindakan; legal hold = prosedur kepatuhan) — **SEMUA TIGA butuh Project SEJATI (bentuk berubah + interpretatif), BEDA dari Developer yang sering cukup Surface.**

**Hasil Audience Test: Projection SPESIFIK untuk audiens NON-TEKNIS yang butuh PENERJEMAHAN INTERPRETATIF (Operator/Auditor/Legal/Manajemen) — BUKAN untuk Machine (itu Serialization/CodeGen/Compilation) dan BUKAN OTOMATIS untuk Developer (yang sering cukup Surface/katalog).**

### 9.3 Invariant Test — Apa yang Dipertahankan Projection?

**Pertanyaan paling penting founder — dijawab dari POLA yang MUNCUL di § 9.1-9.2, bukan dipilih bebas dari enam kandidat founder (Meaning/Intent/Operational Semantics/Explainability/Fidelity/Auditability).**

**Diperiksa: APA yang SAMA antara Asset asli (Integration Point struktur) dan Operational Artifact (runbook prosedur) MESKI BENTUKNYA TOTAL BERBEDA?** Diuji lewat contoh KONKRET: Integration Point `edge_type: "conflict"` + `failure_policy: "escalate"` (`14`/`15`) DITERJEMAHKAN jadi kalimat runbook: *"Kalau sistem mendeteksi konflik data, SEGERA eskalasi ke [Nama Tim] via [Kanal]."* **Diperiksa: apakah FIELD-nya sama (Fidelity struktural)? TIDAK — kalimat prosa TIDAK py `edge_type` sebagai field literal.** **Diperiksa: apakah MAKNA TINDAKAN yang dimaksud tetap sama?** **YA — "eskalasi" dalam prosa dan `failure_policy: escalate` dalam struktur MERUJUK TINDAKAN YANG SAMA PERSIS, hanya beda BAHASA.**

**Diuji Reverse Proof pada enam kandidat founder:**

- **Meaning** — Diperiksa: TERLALU ABSTRAK/FILOSOFIS untuk jadi invariant TERUKUR (tidak bisa DIVERIFIKASI "makna" sama secara formal). **Diperiksa dalam: apa yang BISA diverifikasi formal dari "makna"?**
- **Intent** — Diperiksa: MIRIP Meaning, sulit diverifikasi formal (niat adalah konsep MANUSIA, bukan struktur data).
- **Operational Semantics** — Diperiksa dalam: istilah PALING PRESISI — "semantics" secara formal berarti PEMETAAN dari SIMBOL/STRUKTUR ke MAKNA OPERASIONAL (TEPAT contoh: `failure_policy: escalate` → "lakukan eskalasi", pemetaan FORMAL yang bisa diverifikasi: apakah TINDAKAN yang disebutkan prosa SAMA dengan TINDAKAN yang dikodekan struktur). **Kandidat KUAT.**
- **Explainability** — Diperiksa: SUDAH dipakai istilah SPESIFIK untuk mekanisme Synthesis (`derivation_path`, `23` § 12) — Explainability BERARTI "bisa DITELUSURI BALIK ke sumber", BUKAN "makna operasional tetap sama". **Diperiksa dalam: BEDA KONSEP — Explainability = BISA DILACAK, Operational Semantics = MAKNA TETAP SAMA. Project BUTUH KEDUANYA (dilacak KE sumber DAN maknanya tetap sama) — tapi INVARIANT UTAMA (yang PALING SPESIFIK membedakan Project) adalah Operational Semantics, Explainability adalah SYARAT TAMBAHAN (mirip derivation_path Infer, bukan invariant UTAMA Project).**
- **Fidelity** — Diperiksa: SUDAH DIBUKTIKAN § 9.1 Project SENGAJA LOSSY (BUKAN fidelity struktural penuh seperti Serialization). **GUGUR sebagai invariant UTAMA — Project SECARA SENGAJA MENGORBANKAN fidelity STRUKTURAL demi keterbacaan, TAPI mempertahankan fidelity OPERASIONAL (tindakan yang dimaksud).** **Fidelity sebagai kata TUNGGAL AMBIGU — perlu kualifikasi (fidelity APA).**
- **Auditability** — Diperiksa: SUDAH dipakai istilah SPESIFIK CECEP (Audit Data, `07` § C.1 — siapa/kapan/mengapa) — BEDA KONSEP dari "makna tindakan tetap sama". **GUGUR — konflik istilah, sama pola berulang (Derive/Relation/Knowledge Package yang gugur sebelumnya).**

**Invariant Projection (dikonfirmasi lewat Reverse Proof, bukan dipilih bebas):**

> **Operational Semantics — MAKNA TINDAKAN/KEPUTUSAN yang terkandung dalam Asset (mis. `failure_policy: escalate`) WAJIB TETAP SAMA setelah diterjemahkan ke Operational Artifact (mis. kalimat prosedur eskalasi), MESKI BENTUK STRUKTURAL (field, tipe data) SEPENUHNYA berbeda/hilang.**

**Ini MENJAWAB LANGSUNG kekhawatiran founder tentang Representation Boundary Bias:** Serialization mempertahankan **Fidelity Struktural** (round-trip lossless). Compilation/CodeGen mempertahankan **Executable Correctness** (hasil harus BERJALAN benar). Rendering mempertahankan **Deterministic Mapping** (data sama = visual sama). Reporting mempertahankan **Point-in-Time Accuracy** (potret waktu tertentu akurat). **Project mempertahankan Operational Semantics (makna tindakan tetap sama, TANPA syarat round-trip/eksekusi/determinisme/snapshot-beku) — LIMA INVARIANT BERBEDA untuk ENAM+SATU operasi yang SEMUANYA "mengubah representasi" tapi TIDAK PERNAH sama.**

---

## 10. Projection Phase — Dikonfirmasi Setelah Boundary Test (Bukan Sebelum)

**Diuji ulang Discovery Completion Test (enam sumbu) untuk memastikan Boundary Test tidak mengubah baseline:** Five Truth Layers — tidak tersentuh (Projection tetap Layer 5, tidak mengklaim Truth baru, konsisten § 7 matriks). Ownership/Contract/Version/Structure — tidak berubah. **Aman.**

**Definisi FINAL Projection Phase (menggantikan § 6, dengan invariant yang sudah teruji):**

> **Projection Phase: fase yang menerjemahkan Asset dari fase Discovery/Synthesis ke Operational Artifact untuk AUDIENS INTERPRETATIF NON-TEKNIS (Operator/Auditor/Legal/Manajemen — BUKAN mesin, BUKAN otomatis Developer), MEMPERTAHANKAN Operational Semantics (makna tindakan tetap sama) SEBAGAI INVARIANT UTAMA, SECARA SENGAJA mengorbankan Fidelity Struktural (lossy by design, BEDA dari Serialization/Export), TIDAK dieksekusi mesin (BEDA dari Compilation/CodeGen), TIDAK deterministik-otomatis (BEDA dari Rendering, butuh judgment interpretatif), dan HIDUP mengikuti Asset sumber (BEDA dari Reporting yang snapshot beku).**

**Projection Phase LOLOS Projection Boundary Test tiga-bagian (Difference Test enam kandidat, Audience Test, Invariant Test) — layak dibekukan sebagai kelas metodologi ketiga CECEP, BUKAN sekadar bentuk khusus Synthesis.**

---

## 11. Semantic Preservation Bias — Invariant Competition (Koreksi Founder: "Operational Semantics" Belum Diuji Cukup Dalam)

**Diperiksa dulu: apakah kritik founder valid?** Kasus "Hubungi Andi" — Andi resign, runbook berubah jadi "Hubungi Budi". **Apakah "Operational Semantics" BERUBAH, atau HANYA implementasinya?** Diperiksa dalam: kalau jawabannya "hanya implementasi", maka "Operational Semantics" (§ 9.3) TERLALU KASAR sebagai invariant — ia TIDAK MEMBEDAKAN antara perubahan yang MENGUBAH MAKNA (eskalasi jadi TIDAK eskalasi) dan perubahan yang TIDAK mengubah makna (siapa yang dihubungi berubah, tapi "hubungi seseorang untuk eskalasi" tetap sama). **Kritik VALID — "Operational Semantics" sebagai SATU ISTILAH menyembunyikan DUA LAPISAN berbeda yang belum dipisah.**

### 11.1 Zero Candidate Test — Dua Lapisan, Ditanya dari Kasus Konkret

**Diperiksa kasus "Hubungi Andi" → "Hubungi Budi" LEBIH DALAM:** Apa yang TETAP dan apa yang BERUBAH?

- **TETAP:** "Kalau konflik terdeteksi, ESKALASI ke manusia yang berwenang" — INI adalah STRUKTUR KEPUTUSAN (kapan eskalasi terjadi, KENAPA, dan JENIS tindakan apa — eskalasi, bukan diam/retry/dll).
- **BERUBAH:** "Andi" → "Budi" — INI adalah DETAIL PELAKSANAAN (siapa PERSISNYA yang dihubungi).

**Diperiksa kasus KEDUA (dual approval → Director+Finance):** Apa yang TETAP dan BERUBAH?

- **TETAP:** "keputusan besar butuh DUA PIHAK INDEPENDEN menyetujui" (struktur KEPUTUSAN: dual-approval, bukan single-approval).
- **BERUBAH:** "Manager" → "Director" (SIAPA PERSISNYA salah satu pihak itu).

**Pola yang MUNCUL dari KEDUA kasus (independen, sebelum melihat lima kandidat founder):** ADA DUA LAPISAN yang SELAMA INI tercampur dalam "Operational Semantics":
1. **LAPISAN STRUKTURAL** — JENIS KEPUTUSAN/TINDAKAN yang diambil (eskalasi vs tidak; dual-approval vs single-approval) — INI YANG BERASAL LANGSUNG dari Asset (`failure_policy: escalate`, `approval: dual`) — TIDAK BOLEH berubah tanpa Asset-nya SENDIRI berubah (kalau `failure_policy` berubah jadi `retry`, BARU runbook BOLEH bilang "coba ulang", bukan "eskalasi").
2. **LAPISAN PELAKSANAAN** — SIAPA/BAGAIMANA PERSISNYA (nama orang, nama tim, kanal komunikasi) — INI BUKAN bagian Asset arsitektur SAMA SEKALI (Rule/Integration Point TIDAK PERNAH menyebut "Andi" — itu DATA OPERASIONAL EKSTERNAL, org chart, bukan Asset G-K).

### 11.2 Invariant Competition — Lima Kandidat Founder + Kandidat dari Zero Candidate Test

**Diuji terhadap DUA LAPISAN yang baru ditemukan (§ 11.1) — kandidat mana yang TEPAT menangkap LAPISAN STRUKTURAL (yang harus dijaga Projection), BUKAN lapisan pelaksanaan (yang BOLEH berbeda tanpa itu berarti Projection "rusak")?**

**Operational Semantics** (kandidat lama, § 9.3) — Diuji Reverse Proof: Asumsikan ini TETAP invariant yang benar. Kontradiksi? **Ya, DITEMUKAN SEKARANG (tidak terlihat sebelum kasus Andi diuji)** — "Operational Semantics" sebagai ISTILAH TIDAK MEMBEDAKAN lapisan struktural dari pelaksanaan (istilah itu BISA dibaca "makna operasional" mencakup KEDUANYA, termasuk "siapa yang dihubungi" sebagai bagian "operasional") — **terlalu KASAR, TIDAK CUKUP TAJAM untuk kasus § 11.1.** **DITURUNKAN status — bukan gugur total (arahnya BENAR), tapi PERLU DIPERTAJAM.**

**Decision Intent** — Diperiksa: "Intent" (niat) — MIRIP masalah yang SAMA dengan `23` § 4/§ 10.2 lama (terlalu ABSTRAK, sulit diverifikasi FORMAL apakah "niat" sama). **Diuji Reverse Proof: apakah "intent" BISA dibedakan dari implementasi SECARA FORMAL?** Diperiksa dalam: "Intent" TIDAK py STRUKTUR TERUKUR (beda dari `failure_policy: escalate` yang punya NILAI KONKRET yang bisa dibandingkan). **GUGUR — konsisten alasan "Meaning"/"Intent" gugur di § 9.3 sebelumnya, sekarang dikonfirmasi ULANG dengan kasus konkret.**

**Required Behavior** — Diperiksa: "Behavior" menyiratkan TINDAKAN YANG DIAMBIL — LEBIH KONKRET dari Intent. **Diuji terhadap kasus § 11.1:** "Required Behavior" untuk kasus Andi = "SISTEM/OPERATOR HARUS melakukan eskalasi" — INI COCOK dengan LAPISAN STRUKTURAL (eskalasi = tindakan, BUKAN siapa yang menerimanya). **Diuji Reverse Proof:** Asumsikan "Required Behavior" SALAH. Kontradiksi? **Diperiksa dalam:** TIDAK ditemukan kontradiksi — TAPI diperiksa apakah CUKUP LENGKAP (dual-approval BUKAN sekadar "behavior" tunggal, ia STRUKTUR RELASI antara dua approval — apakah "Behavior" cukup luas mencakup STRUKTUR RELASIONAL, bukan hanya AKSI TUNGGAL?). **Kandidat KUAT, tapi diperiksa lebih lanjut terhadap kandidat terakhir.**

**Normative Meaning** — Diperiksa: "Normative" (bersifat ATURAN/KEHARUSAN, istilah dari filsafat hukum/etika — BUKAN "apa yang TERJADI" tapi "apa yang HARUS terjadi") — **Diuji terhadap dual-approval:** "Normative Meaning" dari `approval: dual` = "AturanNYA adalah: butuh persetujuan dari DUA pihak independen — SIAPA pihaknya adalah detail, ATURAN dual-nya adalah normatif". **COCOK, dan LEBIH TEPAT dari "Required Behavior" untuk kasus RELASIONAL** (dual-approval bukan satu AKSI, ia SATU ATURAN yang MENGATUR bagaimana banyak aksi harus berelasi). **Diuji Reverse Proof:** Asumsikan "Normative Meaning" SALAH. Kontradiksi? **TIDAK ditemukan — dan ia MENCAKUP "Required Behavior" sebagai KASUS KHUSUS (behavior tunggal ADALAH normative meaning paling sederhana; dual-approval ADALAH normative meaning yang lebih kompleks/relasional).**

**Diperiksa Decision Competition FINAL — Required Behavior vs Normative Meaning:** Diuji SEKALI LAGI terhadap kasus asli § 9.3 (`failure_policy: escalate`): **"Normative Meaning" = "ATURANNYA adalah harus eskalasi ketika kondisi X terjadi"** — COCOK dan LEBIH GENERIK (mencakup kasus AKSI TUNGGAL maupun STRUKTUR RELASIONAL seperti dual-approval, TANPA perlu dua istilah terpisah). **"Normative Meaning" MENANG — lebih generik, mencakup "Required Behavior" sebagai instance sederhana, DAN tetap CUKUP KONKRET (beda dari Intent/Meaning yang gugur karena tidak terverifikasi formal — Normative Meaning BISA diverifikasi: apakah ATURAN yang tertulis di Asset [escalate/dual-approval/dst] MASIH bisa ditelusuri PERSIS di Operational Artifact, TERLEPAS detail pelaksanaan berubah).**

### 11.3 Invariant FINAL (Revisi § 9.3)

> **Normative Meaning — ATURAN/KEHARUSAN yang terkandung dalam Asset (JENIS tindakan/struktur keputusan: eskalasi vs retry, dual-approval vs single-approval, dst.) WAJIB TETAP SAMA setelah Projection — TERLEPAS dari DETAIL PELAKSANAAN (siapa/kanal/nama spesifik) yang BOLEH berubah TANPA itu berarti Projection rusak. Perubahan pada DETAIL PELAKSANAAN adalah UPDATE OPERASIONAL BIASA (tidak perlu Projection baru dari Asset). Perubahan pada NORMATIVE MEANING ITU SENDIRI (Asset G-K berubah — `failure_policy` beda, `approval` policy beda) WAJIB memicu Projection ULANG (drift, § 12).**

**Ini MENJAWAB LANGSUNG kasus Andi:** "Andi"→"Budi" TIDAK mengubah Normative Meaning (aturan "harus eskalasi" tetap) — Projection TETAP VALID, HANYA detail pelaksanaan yang perlu update TERPISAH (bukan re-Projection dari Asset, karena Asset-nya SENDIRI tidak berubah).

---

## 12. Projection Drift Test

**Diperiksa: kapan Projection basi, kapan sinkron otomatis, kapan wajib manual?**

**Diuji terhadap DUA LAPISAN (§ 11.1) — drift HANYA relevan untuk LAPISAN STRUKTURAL (Normative Meaning), TIDAK untuk detail pelaksanaan (yang punya siklus update SENDIRI, di luar Projection sama sekali):**

**Kasus 1 — Asset berubah, Normative Meaning IKUT berubah** (mis. `failure_policy: escalate` → `failure_policy: retry`). **Diperiksa: WAJIB Projection ulang** — Normative Meaning LAMA ("harus eskalasi") sudah TIDAK COCOK dengan Asset BARU. **Diuji: otomatis atau manual?** Diperiksa dalam: PERUBAHAN JENIS TINDAKAN (`escalate`→`retry`) adalah PERUBAHAN STRUKTURAL yang BUTUH JUDGMENT INTERPRETATIF BARU (§ 9.1, Rendering gugur KARENA Project butuh judgment — ini DIKONFIRMASI ULANG: perubahan Normative Meaning BUTUH MANUSIA menerjemahkan ulang, TIDAK BISA otomatis penuh). **WAJIB REVIEW MANUSIA.**

**Kasus 2 — Asset TIDAK berubah, tapi WAKTU berlalu (Asset sama, tidak ada perubahan apa pun).** **Diperiksa: Projection TETAP VALID SELAMANYA** — TIDAK ADA mekanisme "kadaluarsa karena waktu" (BEDA dari `recommendation_validity_window` AI, `18` § 10.3, yang MEMANG py batas waktu karena SIFAT rekomendasi AI berbeda — Projection dari Asset STRUKTURAL yang STABIL TIDAK py alasan basi karena waktu semata). **TIDAK PERLU aksi.**

**Kasus 3 — Detail pelaksanaan berubah (Andi→Budi), Asset TIDAK berubah.** **Diperiksa: BUKAN drift Projection SAMA SEKALI** — ini UPDATE OPERASIONAL biasa, di LUAR siklus Asset→Projection (§ 11.3, dikonfirmasi). **Ditangani PROSES TERPISAH (org chart update), TIDAK melibatkan Synthesis/Projection Engine sama sekali.**

**Kasus 4 — Asset BARU muncul (mis. Integration Point baru, belum pernah ada runbook-nya).** **Diperiksa: ini KASUS COVERAGE (`23` § 8.4), bukan drift** — Asset baru = GAP di Coverage, BUKAN Projection lama yang basi. **Ditangani mekanisme Coverage Analyzer yang SUDAH ADA (`26` § 2.5), bukan mekanisme baru.**

**Aturan Sinkronisasi (Projection Drift Rule):**

```
IF Asset.normative_meaning BERUBAH (field structural: failure_policy, approval
   policy, dst — BUKAN metadata pelaksanaan)
THEN Operational Artifact ditandai stale_projection_flag (analog stale_flag
     Synthesis, `26` Bagian 5 Kelompok 8) → WAJIB REVIEW MANUSIA sebelum
     dipakai lagi (TIDAK otomatis re-generate penuh, karena butuh judgment)

IF Asset TIDAK berubah (waktu berlalu saja)
THEN Operational Artifact TETAP VALID, tidak ada aksi

IF Detail pelaksanaan berubah (bukan Asset)
THEN DI LUAR siklus Projection sama sekali — proses operasional terpisah

IF Asset BARU (belum ada Artifact)
THEN Coverage Gap (mekanisme sudah ada), bukan drift
```

**Diperiksa: apakah "otomatis" PERNAH sah untuk Projection?** Diperiksa dalam: BAGIAN yang BISA otomatis adalah DETEKSI drift (`stale_projection_flag` dipicu OTOMATIS saat Asset structural berubah, konsisten `system_signal` `08e` § D) — TAPI PENULISAN ULANG Artifact SENDIRI (menerjemahkan Normative Meaning baru ke prosa baru) TIDAK PERNAH otomatis penuh (butuh judgment, § 9.1). **Otomatis untuk DETEKSI, manual untuk TERJEMAHAN — pembagian yang KONSISTEN dengan pola AI (`17` § 11.4: AI boleh MENGUSULKAN, tidak boleh MEMFINALKAN) — draft terjemahan BOLEH diusulkan otomatis/AI, TAPI WAJIB Approval manusia sebelum jadi Artifact resmi (REUSE LANGSUNG mekanisme Phase I, bukan didesain baru).**

---

## 13. Behavior Preservation Test

**Diminta founder: BUKAN round-trip (Projection→Asset), tapi APAKAH operator yang HANYA membaca Projection bisa bertindak BENAR tanpa melihat Asset.**

**Diuji terhadap kasus konkret (dual approval):** Operator (Finance staff) membaca SOP: "Manager dan Finance harus menyetujui." **Apakah staff ini bisa BERTINDAK BENAR (menolak transaksi yang HANYA disetujui SATU pihak) TANPA PERNAH melihat struktur `approval: dual` di Asset?** **Diperiksa: YA — SOP memuat CUKUP INFORMASI untuk BERTINDAK BENAR (tahu HARUS DUA pihak, tahu SIAPA dua pihak itu).** **Behavior Preservation LOLOS untuk kasus ini.**

**Diuji kasus YANG GAGAL (untuk membuktikan test ini genuinely bisa mendeteksi kegagalan, bukan selalu lolos otomatis):** Bayangkan SOP HANYA menulis "Ikuti prosedur approval standar" (TANPA menyebut dual, tanpa menyebut siapa) — **Operator TIDAK BISA bertindak benar tanpa membaca Asset asli (approval policy) untuk tahu APA "standar" itu.** **Behavior Preservation GAGAL untuk kasus ini — MEMBUKTIKAN test ini BUKAN otomatis lolos, ia GENUINELY bisa mendeteksi Projection yang GAGAL (terlalu abstrak/kehilangan Normative Meaning).**

**Diperiksa: apakah Behavior Preservation Test SAMA dengan Invariant Test (§ 11), atau BERBEDA?** Diperiksa dalam: Invariant Test (§ 11) adalah KRITERIA DESAIN (apa yang HARUS dipertahankan Projection SAAT DIBUAT). Behavior Preservation Test adalah **KRITERIA VERIFIKASI** (SETELAH Projection dibuat, APAKAH ia BERHASIL mempertahankan Normative Meaning CUKUP untuk dipakai). **BERBEDA — satu Design-time criterion, satu Validation-time criterion — KEDUANYA DIBUTUHKAN, bukan salah satu saja (Invariant tanpa Behavior Preservation Test = klaim tanpa verifikasi; Behavior Preservation Test tanpa Invariant = verifikasi tanpa tahu APA yang diverifikasi).**

**Behavior Preservation Test DIKONFIRMASI sebagai KRITERIA VALIDASI WAJIB (bukan sekadar saran) untuk SETIAP Operational Artifact — dijalankan sebagai bagian Reality Stress Validation Phase L (setara `26` Bagian 5), BUKAN diganti Invariant Test (§ 11), MELENGKAPINYA.**

---

## Assumptions (§ 11-13)

3. "Normative Meaning" (§ 11.3) diasumsikan LEBIH TAJAM dari "Operational Semantics" — TAPI belum diuji Universality Test PENUH terhadap kasus EKSTREM lain (di luar dua contoh Andi/dual-approval) — dicatat sebagai pekerjaan lanjutan sebelum Freeze.
4. Aturan Drift (§ 12) diasumsikan LENGKAP untuk empat kasus yang diidentifikasi — kalau ditemukan kasus KELIMA (mis. Asset DIHAPUS/Deprecated, bukan berubah), aturan ini perlu diperluas.
5. Behavior Preservation Test (§ 13) diasumsikan bisa dijalankan MANUAL (manusia mensimulasikan skenario operator) untuk SETIAP Operational Artifact — bentuk OTOMATIS (kalau mungkin) adalah pertanyaan Design/Implementation, bukan Philosophy.

## Open Questions (Tambahan § 11-13)

6. Apakah "Normative Meaning" perlu diuji Universality Test formal (skenario ekstrem lain, bukan hanya Andi/dual-approval) sebelum Freeze — dicatat WAJIB sebelum Philosophy of Projection final.
7. Detail mekanisme `stale_projection_flag` (§ 12) — reuse penuh dari `system_signal`/`stale_flag` Synthesis (`26`), TAPI perlu diverifikasi apakah field TAMBAHAN dibutuhkan khusus Projection (mis. distinction "structural field mana yang dianggap Normative Meaning vs bukan" per jenis Asset) — pekerjaan Design lanjutan.
8. Bentuk konkret pelaksanaan Behavior Preservation Test (skenario simulasi seperti apa, siapa yang menjalankan) — pekerjaan Design/Validation lanjutan, bukan Philosophy.

2. Matriks dua-sumbu (§ 7) diasumsikan LENGKAP untuk roadmap A-L SAAT INI — kalau Phase hipotetis di luar A-L (proyek turunan CECEP lain) menunjukkan kombinasi "Truth Baru=YA + Bentuk Berubah=YA", itu akan jadi kelas keempat yang BELUM pernah diuji CECEP, dicatat sebagai kemungkinan terbuka bukan tertutup.

## Open Questions (Konsolidasi Tiga Putaran)

1. Nama "Projection Phase" masih kandidat kerja (Name Bias tetap berlaku) — belum final.
2. Philosophy of Projection formal (setara `23` § 8-9) — dijawab di dokumen berikutnya, sekarang berdiri di atas invariant **Normative Meaning** (§ 11.3, revisi dari "Operational Semantics") yang sudah diuji lebih tajam, bukan diasumsikan.
3. Mekanisme Explainability untuk hasil Project — butuh KEDUANYA (dilacak ke sumber DAN Normative Meaning tetap sama) — bentuk konkret pelacakan (analog `derivation_path` tapi untuk prosa) belum didesain.
4. Meta Model L — dugaan Knowledge Ontology masih kandidat kuat, belum diuji formal Difference/Equivalence Test.
5. Apakah lima invariant (§ 9.1: Fidelity Struktural/Executable Correctness/Deterministic Mapping/Point-in-Time Accuracy/Normative Meaning) layak jadi katalog formal alat uji transformasi representasi — diuji lewat Batas Constitution sebelum diusulkan.
6. Apakah "Normative Meaning" (§ 11.3) perlu Universality Test formal terhadap skenario ekstrem lain (di luar Andi/dual-approval) sebelum Freeze — WAJIB sebelum Philosophy of Projection final.
7. Detail field `stale_projection_flag` (§ 12) — perlu distinction eksplisit "field mana yang Normative Meaning vs detail pelaksanaan" per jenis Asset — pekerjaan Design lanjutan.
8. Bentuk konkret pelaksanaan Behavior Preservation Test (§ 13) — skenario simulasi seperti apa, siapa yang menjalankan — pekerjaan Design/Validation lanjutan.

## Status

**Discovery Eligibility Test Phase L selesai TIGA PUTARAN.**

**Putaran pertama (§ 1-8):** Phase L gagal kriteria Discovery Ontologis, BUKAN Synthesis murni (Project ≠ Surface ≠ Infer, dibuktikan Reverse Proof) — diresmikan sebagai instance pertama kelas metodologi ketiga, **Projection Phase**, dengan matriks dua-sumbu (Truth Baru?/Bentuk Berubah?) sebagai penutup klasifikasi seluruh roadmap A-L.

**Putaran kedua (§ 9-10, koreksi founder — Representation Boundary Bias):** definisi "bentuk berubah" terbukti terlalu longgar, diperbaiki lewat Projection Boundary Test tiga-bagian. Difference Test menggugurkan enam kandidat tetangga (Serialization/Compilation/CodeGen/Reporting/Rendering/Export) dengan alasan spesifik masing-masing, mengungkap lima invariant berbeda. Audience Test mengonfirmasi Projection khusus audiens interpretatif non-teknis. Invariant Test memilih **Operational Semantics** sebagai pemenang awal.

**Putaran ketiga (§ 11-13, koreksi founder — Semantic Preservation Bias):** kasus "Hubungi Andi→Budi" dan "dual approval→Director+Finance" membuktikan "Operational Semantics" MASIH terlalu kasar — TIDAK membedakan LAPISAN STRUKTURAL (jenis keputusan: eskalasi vs retry, dual vs single-approval — berasal dari Asset) dari LAPISAN PELAKSANAAN (siapa/kanal spesifik — data eksternal, bukan Asset). Invariant Competition (§ 11.2) menggugurkan Decision Intent (tidak terverifikasi formal) dan menaikkan **Normative Meaning** (ATURAN/KEHARUSAN yang tertulis di Asset — mencakup Required Behavior sebagai kasus sederhana) menggantikan Operational Semantics. Projection Drift Test (§ 12) menghasilkan aturan sinkronisasi eksplisit: Normative Meaning berubah → wajib review manusia (tidak otomatis, butuh judgment); detail pelaksanaan berubah → di luar siklus Projection sama sekali; Asset baru → Coverage Gap, bukan drift. Behavior Preservation Test (§ 13) dikonfirmasi sebagai kriteria VALIDASI terpisah dari Invariant (kriteria DESAIN) — keduanya saling melengkapi, dibuktikan lewat kasus yang GAGAL (SOP terlalu abstrak) sehingga test ini genuinely bisa mendeteksi kegagalan, bukan otomatis lolos.

**Projection Phase sekarang berdiri di atas invariant yang tajam (Normative Meaning, bukan Operational Semantics kasar), aturan drift eksplisit, dan dua lapis kriteria (desain + validasi).** Philosophy of Projection formal (Open Question #2) adalah pekerjaan berikutnya — TIDAK diasumsikan otomatis sama dengan Synthesis K, tapi sekarang punya fondasi yang genuinely teruji tiga putaran serangan, setara kedalaman Phase G-K.
