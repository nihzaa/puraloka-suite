# CECEP — Working Methodology

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** SOP kerja — BUKAN Constitution. Perbedaan levelnya eksplisit (lihat [`04`](../CECEP/04-architecture-constitution.md) § "Batas Constitution"): Constitution mengikat APA yang sah menjadi keputusan arsitektur (stabil, jarang berubah, level UUD); dokumen ini mengatur BAGAIMANA proses berpikir dijalankan sehari-hari (boleh berkembang, boleh direvisi tanpa level persetujuan setara ACR). Kalau sebuah kebiasaan kerja ternyata terbukti perlu mengikat HASIL arsitektur (bukan sekadar proses), itu diusulkan naik ke Constitution lewat tes eksplisit di `04`, bukan ditulis langsung di sini sebagai jalan pintas.

**Kenapa dokumen ini ada:** Ditemukan langsung dari kritik founder terhadap diri sendiri — Constitution sempat menerima "Pre-Discovery Framing" sebagai § 17, lalu diuji ulang: pertanyaan itu genuinely berguna, TAPI levelnya SOP, bukan hukum dasar. Daripada dibuang, dipindah ke sini — living document yang boleh bertambah isinya tanpa mengotori kestabilan Constitution.

---

## 1. Pre-Discovery Framing — Sebelum Membuka Discovery Baru

**Sumber asal:** Permintaan founder pasca-Phase G, awalnya diusulkan masuk Constitution § 17, diturunkan ke sini setelah diuji terhadap "Batas Constitution" (`04`).

**Kebiasaan:** Sebelum menulis Discovery untuk sebuah fase (atau sub-topik dalam fase, yang sudah lolos tes Discovery Granularity Rule `04` § 16 sebagai layak dokumen terpisah), empat pertanyaan berikut dijawab dulu — tidak perlu jadi dokumen sendiri, cukup jadi bagian pembuka Discovery-nya sendiri atau murni proses berpikir internal:

1. **Apa invariant fase ini?** — Satu prinsip inti yang HARUS tetap benar apa pun yang terjadi di dalam fase itu. Analog: Phase F berporos pada **Truth**, Phase G berporos pada **Deterministic Rule**.
2. **Apa anti-pattern fase ini?** — Kesalahan KHAS yang paling mungkin terjadi justru karena sifat fase itu, bukan kesalahan generik.
3. **Apa bias yang paling mungkin terjadi?** — Bias SPESIFIK untuk sifat fase ini (bukan bias generik seperti Momentum Bias yang sudah dikenal lintas-fase).
4. **Apa asumsi tersembunyi yang sedang dipakai?** — Asumsi yang, kalau ternyata salah, meruntuhkan desain yang dibangun di atasnya.

**Kandidat jawaban untuk Phase H (diberikan founder sebagai ILUSTRASI, bukan keputusan final — WAJIB diverifikasi ulang saat Phase H Discovery benar-benar dimulai, bukan diterima begitu saja karena kedengarannya masuk akal sekarang):**

| Pertanyaan | Kandidat Jawaban Phase H |
|---|---|
| Invariant | **Trust Boundary** — setiap keputusan desain Integration harus tetap benar meski sistem eksternal tidak bisa dipercaya (lambat/salah/duplikat/hilang/berubah diam-diam) |
| Anti-pattern | Memperlakukan sistem eksternal seolah sama bisa dipercaya dan sama deterministiknya dengan Capability internal yang sudah frozen |
| Bias spesifik | *Optimism bias terhadap sistem eksternal* — mengasumsikan API pihak lain akan selalu tersedia/konsisten/cepat, padahal jaminan Progressive Freeze Chain hanya berlaku untuk internal CECEP |
| Asumsi tersembunyi | Sistem eksternal merespons dalam waktu wajar, tidak mengubah skema tanpa pemberitahuan, mengembalikan satu jawaban (bukan duplikat) per permintaan |

**Kenapa kebiasaan ini bernilai:** Pola A-G menunjukkan setiap fase besar selalu punya satu invariant yang jadi porosnya — tapi invariant itu selama ini ditemukan SETELAH fase selesai (lewat siklus tulis-koreksi berulang), bukan dinyatakan eksplisit sebelum Discovery dimulai. Menjawab empat pertanyaan ini di depan berpotensi menghemat siklus koreksi yang sudah berkali-kali terjadi (Momentum Bias, discovery yang harus dibongkar ulang).

---

## 2. Uji Universalitas — "Apakah Ini Tetap Benar Kalau Contoh Implementasinya Diganti?"

**Sumber:** Permintaan founder — pergeseran fokus review mulai Phase H, dari menyerang METODOLOGI (yang sudah dianggap cukup matang) ke menyerang UNIVERSALITAS DEFINISI substansi Phase H.

**Kebiasaan (untuk SETIAP definisi/prinsip yang diklaim sebagai bagian arsitektur, bukan implementasi):** Ganti contoh konkret yang dipakai untuk menjelaskan definisi itu dengan contoh LAIN yang secara sifat berbeda jauh — kalau definisinya runtuh, itu sinyal ia sebenarnya definisi IMPLEMENTASI yang menyamar sebagai definisi ARSITEKTUR.

**Contoh pola serangan (diberikan founder sebagai panduan, bukan daftar tertutup):**

| Kalau Claude menulis... | Uji dengan mengganti asumsi... |
|---|---|
| "Integration adalah [X]" | Bagaimana kalau TIDAK ADA API (mis. file-based exchange, manual upload)? |
| "Event adalah [X]" | Bagaimana kalau komunikasinya POLLING, bukan push? |
| "Contract adalah [X]" | Bagaimana kalau partner TIDAK PUNYA schema formal sama sekali? |
| "Delivery Guarantee adalah [X]" | Bagaimana kalau sistem eksternal BERBOHONG (melaporkan sukses padahal gagal)? |

**Prinsip di baliknya (verbatim arah founder):** *"Apakah keputusan ini tetap benar kalau contoh implementasinya diganti? Kalau jawabannya selalu 'ya', berarti CECEP sedang membangun arsitektur. Kalau jawabannya 'tidak', berarti tanpa sadar sudah masuk ke desain implementasi."*

**Kapan dipakai:** Setiap kali sebuah definisi inti diusulkan untuk di-freeze (Philosophy, bukan detail Design) — dijalankan sebagai bagian verifikasi diri SEBELUM diserahkan untuk direview, bukan menunggu ditemukan lewat koreksi founder.

---

## 3. Anthropomorphism Bias — Alarm Khusus Sebelum Domain Baru yang Sarat Istilah Populer

**Sumber:** Founder, di titik transisi H→I — bias yang diprediksi AKAN muncul di Phase I sebelum Phase I bahkan dimulai (beda dari bias lain di dokumen ini yang ditemukan SETELAH muncul).

**Bentuk bias:** Begitu domain baru punya nama yang SANGAT DEKAT dengan produk/teknologi populer (AI = ChatGPT/Claude/Gemini/LLM/Agent/MCP/RAG/Prompt), otak secara otomatis mendefinisikan ontologi domain itu LEWAT nama produk yang sedang populer, bukan lewat fungsi mendasarnya. **Pola identik dengan kesalahan yang SUDAH terjadi dan dikoreksi di Phase H**: draf pertama Integration langsung bertanya "API atau database atau manual?" (mekanisme) sebelum ontologi Integration ditemukan (`14` § 6 mencatat ini eksplisit sebagai kesalahan). Anthropomorphism Bias adalah versi domain AI dari kesalahan yang sama — HAMPIR PASTI lebih kuat tarikannya untuk AI dibanding Integration, karena istilah produk AI (ChatGPT, Claude) jauh lebih akrab secara budaya daripada istilah Integration (REST, Kafka).

**Kebiasaan wajib:** Discovery domain baru yang berpotensi kena bias ini (ditandai dari NAMANYA sendiri terlalu dekat dengan produk populer) WAJIB dimulai dari pertanyaan ontologis murni ("Apa sebenarnya [domain] di dalam ontologi CECEP?") dan dijalankan Five Whys sampai mentok — SEBELUM satu kata pun tentang mekanisme/produk/vendor disebut. Kalau di halaman pertama Discovery sudah muncul nama produk/protokol/vendor spesifik (untuk AI: Prompt/RAG/MCP/Tool Calling/Agent/Multi-Agent/OpenAI/Claude/Gemini — untuk Integration dulu: REST/Kafka/Webhook), itu SINYAL Discovery dimulai dari ujung yang salah, harus diulang dari pertanyaan ontologis.

**Kandidat ontologi AI yang HARUS diuji satu per satu (Ontology Candidate Matrix, pola `14` § 6), TIDAK BOLEH langsung dipilih salah satu (diberikan founder sebagai titik awal, belum tentu benar, semua WAJIB dihancurkan dulu sebelum satu bertahan):**
- AI adalah Knowledge Consumer
- AI adalah Decision Advisor
- AI adalah Execution Assistant
- AI adalah Uncertainty Resolver
- AI adalah Reasoning Engine
- AI adalah Probabilistic Computation

**Prinsip (verbatim arah founder):** *"Jangan mendefinisikan AI berdasarkan implementasi yang sedang populer. Selalu cari fungsi ontologisnya terlebih dahulu. Implementasi boleh berubah, ontologi tidak boleh bergantung pada vendor atau teknologi tertentu."*

**Kenapa ini dicatat SEBAGAI ALARM (bukan sekadar prinsip umum yang sudah tercakup § 2 Uji Universalitas):** § 2 menguji definisi SETELAH ditulis (reaktif). Anthropomorphism Bias adalah PERINGATAN SEBELUM Discovery dimulai (preventif) — khusus untuk domain yang NAMANYA sendiri sudah membawa asosiasi produk kuat, di mana bias itu kemungkinan besar mempengaruhi KALIMAT PERTAMA yang ditulis, bukan baru terlihat setelah beberapa paragraf.

---

## 4. Decision Competition — Wajib untuk Setiap Keputusan Desain

**Sumber:** Ditemukan founder di Phase H — bias BARU yang sebelumnya belum dinamai: **First Satisfactory Candidate Bias** (juga disebut First Plausible Solution Bias). Berbeda dari Momentum Bias (vigilance menurun saat streak lancar) dan Fabricated Certainty (mengisi ketidaktahuan dengan tebakan meyakinkan) — bias ini adalah kecenderungan BERHENTI MENCARI begitu kandidat PERTAMA yang terlihat masuk akal ditemukan, lalu (opsional) baru mencari pembanding SETELAH ditantang dari luar, alih-alih membangun ruang kandidat penuh SEBELUM memilih.

**Contoh nyata di mana bias ini muncul (Phase H, `14`):** Menulis "Solusinya adalah State Machine" atau "Delivery Guarantee bergantung pada Reconciliation" sebagai kesimpulan LANGSUNG, baru menambahkan pembanding SETELAH ditantang founder — pola `Kandidat pertama → tulis sebagai kesimpulan → (kalau ditantang) baru cari pembanding`, alih-alih `Bangun ruang kandidat penuh → uji semua → baru simpulkan`. Hasil akhirnya bisa BENAR (State Machine memang menang saat diuji ulang), tapi URUTAN kerjanya salah — argumen "menang" yang disusun MUNDUR (mencari alasan pembenaran) secara struktural lebih lemah dan lebih rawan bias konfirmasi dibanding argumen yang disusun MAJU (membandingkan dulu, baru menang).

**Kebiasaan wajib — Decision Competition:** Untuk SETIAP keputusan desain atau filosofi (bukan untuk detail implementasi sepele), sebelum menulis kesimpulan:

1. Bangun ruang kandidat yang WAJAR terlebih dahulu (bukan satu kandidat + baru dicari pembanding kalau ditantang) — minimal tiga-lima kandidat kalau domainnya punya alternatif yang genuinely masuk akal.
2. Tulis kriteria uji EKSPLISIT sebelum menguji (bukan kriteria yang diam-diam disesuaikan supaya kandidat favorit menang).
3. Uji SEMUA kandidat terhadap kriteria yang sama, termasuk yang akan dipilih pada akhirnya — tidak ada kandidat yang "diloloskan begitu saja" karena "sudah jelas benar".
4. Baru simpulkan, dengan alasan MENGAPA pesaing gugur (bukan hanya mengapa pemenang menang).

**Kapan TIDAK perlu Decision Competition penuh:** Detail yang genuinely tidak py alternatif masuk akal (mis. penamaan field yang mengikuti konvensi sudah dikunci) — bedanya diuji lewat pertanyaan sederhana: *"Kalau saya tanya 'kenapa bukan X', apakah saya bisa membayangkan X yang genuinely kompetitif?"* Kalau ya, itu butuh Decision Competition. Kalau tidak (tidak ada X yang masuk akal sama sekali), langsung tulis tanpa tabel kandidat kosong sebagai formalitas.

---

## 5. Observasi (Bukan Aturan) — Meta Model Sebelum Validation untuk Domain Abstrak

**Sumber:** Founder, di titik Phase I sebelum I.1. **Status eksplisit: OBSERVASI, BUKAN aturan** — TIDAK diusulkan ke Constitution, TIDAK dijadikan wajib untuk Phase J/K/L. Dicatat di sini murni sebagai pola yang TERLIHAT, untuk diverifikasi ulang kalau berulang.

**Pola yang diamati:**
```
Rule (Phase G)        → Rule Meta Model (08e)              → Validation (08k)
Integration (Phase H) → Integration Point Asset Model (14 § 22) → Validation (15)
AI (Phase I)           → AI Meta Model (17 § 12-13)          → Validation (I.1)
```

**Dugaan kerja (BELUM dikonfirmasi, BELUM jadi aturan):** Semakin abstrak/baru sebuah domain (semakin ia BUKAN turunan langsung dari Layer 1-4 yang sudah konkret), semakin ia butuh Meta Model eksplisit SEBELUM Validation — karena Validation butuh tahu OBJEK APA yang divalidasi sebelum bisa menyerangnya secara bermakna.

**Syarat naik jadi metodologi resmi (diuji lewat "Batas Constitution", `04`):** Kalau Phase J DAN Phase K juga menunjukkan pola yang sama (Meta Model sebelum Validation), BARU pola ini diuji apakah "berlaku SEMUA fase & proyek, mengikat HASIL arsitektur" — dua data point (Rule, Integration Point) TIDAK CUKUP untuk klaim pola universal, tiga+ data point mulai layak diuji. **Sampai saat itu, ini tetap observasi, bukan langkah wajib.**

---

## 6. Observasi (Bukan Aturan) — Porsi Validation Meningkat Mendekati Dunia Nyata

**Sumber:** Founder, di titik freeze Phase I. **Status eksplisit: OBSERVASI, BUKAN aturan** — sama seperti § 5, TIDAK diusulkan ke Constitution.

**Pola yang diamati:**
```
Phase G (Rule, internal murni)        → Discovery besar, Validation 12 skenario (08k)
Phase H (Integration, dunia luar)     → Discovery besar, Validation 38 skenario (15)
Phase I (AI, penalaran tak pasti)     → Discovery besar, Validation 32 skenario (18)
```

**Dugaan kerja (BELUM dikonfirmasi):** Semakin dekat domain ke dunia nyata/ketidakpastian yang tidak dikendalikan CECEP, semakin besar PORSI ENERGI yang dihabiskan Validation dibanding Discovery — karena Discovery menjawab "apa objeknya", sementara dunia nyata punya jumlah cara gagal yang jauh lebih besar dari jumlah cara sebuah ontologi bisa salah didefinisikan.

**Syarat naik jadi metodologi resmi:** Sama seperti § 5 — perlu Phase J DAN K menunjukkan pola serupa sebelum diuji lewat "Batas Constitution" (`04`). Sampai saat itu, tetap observasi.

**Temuan pendamping dari Audit Ketergantungan H→I (`18` § 11, bernilai dicatat di sini karena bersifat metodologi, bukan keputusan arsitektur AI itu sendiri):** Klaim "domain baru mewarisi mekanisme domain sebelumnya" perlu SELALU dipilah tiga kategori sebelum diterima: **(A) Dependency Ontologis** (domain baru runtuh tanpa konsep itu — biasanya kerangka PEMBUKTIAN, seperti Determinism Boundary), **(B) Dependency Implementasi** (domain baru bisa berdiri sendiri, hanya lebih lambat tanpa mekanisme yang dipinjam), **(C) Reuse Murni** (pola yang kebetulan sudah ada dari fase LEBIH TUA, tidak spesifik ke fase sebelumnya). Klaim reuse yang tidak dipilah tiga ini berisiko melebih-lebihkan ATAU meremehkan seberapa erat dua fase benar-benar terikat.

---

## 7. Technology Forecast Bias — Alarm Khusus Phase J (Future Vision) dan Seterusnya

**Sumber:** Founder, sebelum Phase J dimulai — bias yang diprediksi muncul KARENA tema fase itu sendiri (Future Vision), bukan ditemukan setelah kejadian (pola sama dengan Anthropomorphism Bias § 3, diprediksi sebelum Phase I dimulai).

**Bentuk bias:** *"Teknologi X sedang tren (AI Agent/MCP/Digital Twin) → maka CECEP harus punya X."* Kesimpulan itu bisa saja BENAR secara kebetulan, TAPI alasannya SALAH — keputusan lahir dari POPULARITAS teknologi, bukan dari KEBUTUHAN ONTOLOGIS CECEP.

**Checklist wajib sebelum sebuah konsep masa depan diterima sebagai bagian Future Vision:**
1. Apakah konsep ini lahir dari kebutuhan CECEP (bisa ditelusuri ke Foundational Principle/First Principle/Invariant yang sudah dikunci), atau lahir karena teknologi sedang populer?
2. **Kalau teknologi itu hilang besok, apakah arsitektur CECEP berubah?** Kalau jawabannya "tidak berubah" — itu IMPLEMENTASI, bukan Future Vision arsitektural.

**Disiplin pendamping — istilah industri BUKAN definisi:** Digital Twin/Copilot/Agent/Autonomous Enterprise/Hyperautomation/AGI/Digital Workforce, dan istilah industri sejenis di masa depan, WAJIB diperlakukan sebagai LABEL, bukan konsep ontologis. Tes: **"Kalau istilah ini tidak pernah ada di dunia, apakah konsep di baliknya tetap bisa dijelaskan?"** Kalau tidak bisa, definisi itu masih bergantung jargon — belum boleh diterima.

**Kenapa ini beda dari Anthropomorphism Bias (§ 3):** Anthropomorphism Bias adalah tentang MENDEFINISIKAN sebuah domain lewat produk populer (AI = ChatGPT). Technology Forecast Bias adalah tentang MEMUTUSKAN sebuah fitur/kapabilitas HARUS ADA karena sedang tren — satu soal DEFINISI, satu soal KEPUTUSAN ROADMAP. Keduanya sering muncul bersamaan (istilah tren dipakai untuk mendefinisikan SEKALIGUS membenarkan keputusan), tapi checklist yang menangkapnya berbeda.

---

## 8. Complexity Dependency — Jenis Dependency Keempat (Ditemukan Founder, Phase J.1)

**Sumber:** Founder, dari temuan `21` Kelompok 4/7 (Design Space skala besar butuh AI Meta Model untuk dikelola). Diangkat sebagai kategori TERPISAH dari Tiga Kategori Dependency yang sudah ada (`18` § 11: Ontologis/Implementasi/Reuse Murni) — bukan variasi dari salah satunya.

**Definisi:** Sebuah konsep A tidak membutuhkan konsep B secara ontologis (A tetap valid tanpa B) maupun implementasi (A bisa dibangun tanpa B), TAPI membutuhkan B ketika KOMPLEKSITAS/VOLUME A melewati kapasitas pengelolaan manual.

**Beda dari tiga kategori lama (`18` § 11):**
- Ontological Dependency — A RUNTUH tanpa B (contoh: AI Philosophy runtuh tanpa Determinism Boundary dari Integration).
- Implementation Dependency — A bisa berdiri tanpa B, hanya lebih lambat dibangun (contoh: mekanisme Timeout Integration bisa didesain ulang tanpa preseden).
- Reuse Dependency — A kebetulan memakai pola dari fase LEBIH TUA (contoh: Family/Template dari Phase G dipakai lagi Phase H/I).
- **Complexity Dependency (baru)** — A dan B TIDAK PUNYA relasi struktural sama sekali PADA SKALA KECIL — dependency baru MUNCUL semata karena VOLUME melewati ambang kapasitas manual. Syarat kemunculannya BUKAN hakikat konsep (beda dari Ontological) dan BUKAN soal kecepatan membangun (beda dari Implementation) — murni fungsi SKALA.

**Contoh yang sudah teridentifikasi:** Design Space mengelola ribuan entri butuh AI Meta Model (`21` Kelompok 4/7). **Pola yang sama diprediksi bisa muncul lagi:** Rule Catalog ribuan Rule butuh bantuan otomatis untuk deteksi konflik/duplikasi, Integration Point ribuan titik butuh bantuan otomatis untuk governance skala (`08k` § 5, `14` § 22.4 Scale Failure sudah menyinggung pola serupa tanpa menamainya).

**Status:** BELUM diusulkan ke Constitution — dicatat di sini sebagai kategori dependency keempat, dipakai bersama Tiga Kategori Dependency (`18` § 11) setiap kali sebuah fase mengklaim "domain X butuh Y" — pertama diperiksa apakah itu Ontologis/Implementasi/Reuse (tiga lama), BARU kalau tidak cocok ketiganya, diperiksa apakah itu Complexity Dependency (butuh hanya pada skala tertentu, bukan selalu).

---

## 9. Phase Expectation Bias — Alarm Khusus Sebelum Membuka Fase Baru

**Sumber:** Founder, sebelum Phase K dimulai. Bias yang diprediksi muncul KARENA pola berulang empat kali (G-H-I-J semuanya menemukan ontologi baru), bukan ditemukan setelah kejadian.

**Bentuk bias:** Karena setiap fase sebelumnya (Rule/Integration/AI/Design Space) menemukan konsep ontologis baru lewat Discovery penuh (Five Whys→Zero Candidate→Ontology Matrix→Reverse Proof→dst.), muncul EKSPEKTASI bahwa fase berikutnya JUGA HARUS menemukan ontologi baru — seolah itu SYARAT KEBERHASILAN sebuah fase. **Ini keliru.** Arsitektur matang harus SIAP menerima kemungkinan sebuah fase TIDAK menemukan ontologi baru — kalau memang tidak ada, itu BUKTI metodologi bekerja (mencegah penciptaan konsep buatan), bukan kegagalan.

**Kebiasaan wajib — Discovery Eligibility Test, dijalankan SEBELUM Five Whys, untuk SETIAP fase baru:**
1. Apakah objek fase ini ontologi independen, atau hanya sifat/relasi dari konsep yang sudah ada?
2. Jika seluruh fase sebelumnya sudah ada, apakah fase ini masih diperlukan SEBAGAI DISCOVERY TERPISAH?
3. Apa kontradiksi yang muncul jika fase ini "dihapus" (digabung ke fase lain)?
4. Apakah fase ini menghasilkan OBJEK baru, atau hanya RELASI antar objek lama?

**Hasil yang mungkin:**
- **Lolos keempatnya** → fase ini genuinely butuh Discovery Ontologis penuh (pola G-H-I-J).
- **Gagal** → fase ini adalah **Synthesis Phase** — TIDAK menjalankan Five Whys/Ontology Candidate Matrix untuk MENEMUKAN konsep baru, melainkan menjalankan metodologi BERBEDA: mengombinasikan/menerapkan konsep yang SUDAH ADA untuk tujuan baru (lihat definisi Synthesis Phase, dipakai pertama kali kalau/ketika ditemukan).

**Kenapa ini dicatat SEBAGAI ALARM (bukan sekadar prinsip umum yang sudah tercakup Discovery Granularity Rule `04` § 16):** Discovery Granularity Rule menguji APAKAH SUB-TOPIK di DALAM satu fase layak jadi dokumen terpisah (ontologi vs mekanisme). Discovery Eligibility Test menguji sesuatu SATU LEVEL LEBIH TINGGI: apakah FASE ITU SENDIRI (dalam roadmap A-L) layak menjalankan METODOLOGI DISCOVERY PENUH, atau metodologi yang genuinely berbeda (Synthesis). Keduanya saling melengkapi, beroperasi di level berbeda.

---

## 10. Method Symmetry Bias — Alarm Khusus Setelah Synthesis Phase Ditemukan

**Sumber:** Founder, tepat setelah Phase K diresmikan sebagai Synthesis Phase pertama CECEP (`23`). Bias yang diprediksi muncul KARENA sukses pola Discovery empat kali berturut-turut (G-H-I-J).

**Bentuk bias:** Karena Discovery Phase punya struktur yang TERBUKTI bekerja (Five Whys→Zero Candidate→Ontology Matrix→Reverse Proof→Universality Test), muncul DORONGAN untuk memaksakan struktur YANG SAMA ke Synthesis Phase — demi "simetri" atau "konsistensi metodologi" — PADAHAL Synthesis Phase, dibuktikan `23`, punya TUJUAN YANG BERBEDA (menyusun relasi antar konsep yang sudah ada, bukan menemukan konsep baru) dan KEMUNGKINAN BESAR butuh ALAT YANG BERBEDA (Dependency Analysis, Cross-Phase Consistency, Impact Propagation, Conflict Detection, Coverage Analysis — bukan Five Whys/Reverse Proof yang dirancang untuk MENEMUKAN definisi, bukan MEMETAKAN relasi).

**Kebiasaan wajib:** Setiap kali mendesain metodologi untuk kelas fase BARU (Synthesis Phase sekarang, kelas lain yang mungkin ditemukan nanti), alat Discovery yang sudah ada DIANGGAP TIDAK BERLAKU sampai TERBUKTI diperlukan — bukan diwariskan otomatis demi konsistensi tampilan. Metodologi baru dibangun dari PRINSIP PERTAMA (apa tujuan kelas fase ini, apa yang dilarang, apa outputnya) — BUKAN dari "supaya terlihat sama dengan Discovery".

**Kenapa ini penting dicatat sebagai bias TERPISAH dari Phase Expectation Bias (`13` § 9):** Phase Expectation Bias adalah tentang MENGHARAPKAN setiap FASE menemukan ontologi (level: apakah fase ini Discovery atau bukan). Method Symmetry Bias adalah tentang MEMAKSAKAN BENTUK setelah sudah diketahui fase itu BUKAN Discovery (level: bagaimana Synthesis Phase seharusnya bekerja, TIDAK otomatis meniru struktur Discovery). Dua bias di dua TITIK KEPUTUSAN berbeda, berurutan.

---

## 11a. Component Boundary Rule — Wajib Sebelum Mendesain Detail Komponen (Design Phase Manapun)

**Sumber:** Founder, di titik mulai Design K — pola yang diamati berulang sejak Phase H-I: langsung mendesain SATU komponen (Integration Point, AI Meta Model) selalu memunculkan komponen PENDUKUNG yang sebenarnya bagian dari sistem lebih besar (Timeout/Reconciliation/Join Policy/Adapter untuk H; Approval/Validity Window/Confidence untuk I) — ditemukan SETELAH desain pertama dibuat, bukan sebelum.

**Prinsip:** Sebelum mendesain algoritma/field/lifecycle/state machine/API dari SATU komponen, WAJIB dipastikan dulu BATAS TANGGUNG JAWAB komponen itu SUDAH DIUJI terhadap komponen lain di sistem yang sama — bukan diasumsikan komponen itu berdiri sendiri.

**Beda dari Decision Competition (`13` § 4):** Decision Competition memilih SOLUSI TERBAIK untuk satu masalah yang sudah jelas batasnya. Component Boundary Rule memastikan masalah yang sedang diselesaikan MEMANG MILIK komponen yang sedang didesain — dijalankan SEBELUM Decision Competition, bukan pengganti.

**Kebiasaan wajib:** Sebelum Design komponen dimulai, jalankan **Architecture Decomposition** — pemetaan SEMUA subsistem yang diperlukan agar sistem besar bekerja (diperlakukan sebagai KANDIDAT yang diuji, bukan daftar final) — BARU setelah peta subsistem stabil, Design Competition per-komponen dijalankan pada batas yang sudah jelas.

---

## 12. Evolusi Metodologi CECEP (Ringkasan Historis)

**Generasi 1** (Phase awal): `Discovery → Design` — reaktif, koreksi ditemukan setelah Design selesai.

**Generasi 2**: `Discovery → Validation → Freeze` — mulai ada gerbang, tapi belum ada Philosophy terpisah.

**Generasi 3**: `Discovery → Philosophy → Validation → Design → Freeze` — filosofi eksplisit mendahului Design, pola matang pertama.

**Generasi 4 (Phase G, saat ini)**: `Discovery → Philosophy → Validation → Discovery Completion → Design → Stress Test → Freeze → Transition Brief` — tujuh lapisan lengkap, ditambah handover formal antar-fase.

**Prinsip evolusi (jangan diseragamkan retroaktif):** Fase awal (A-F.1) TIDAK di-ACR untuk "disamakan" dengan pola Generasi 4 — isinya sudah benar dan frozen, yang berubah hanya ketatnya prosedur seiring waktu, bukan validitas hasilnya. Lihat [`11`](../CECEP/11-architecture-roadmap-index.md) § 4 untuk detail.

---

## Assumptions

1. Dokumen ini diasumsikan akan BERTAMBAH isinya seiring fase baru menemukan kebiasaan kerja bernilai lain — berbeda dari Constitution yang diasumsikan STABIL, dokumen ini secara sengaja dirancang cair.
2. Tabel kandidat jawaban Phase H (§ 1) eksplisit ditandai sebagai ilustrasi, bukan keputusan — kalau Phase H Discovery menghasilkan invariant yang berbeda dari "Trust Boundary", itu bukan kontradiksi terhadap dokumen ini (dokumen ini tidak mengklaim jawaban final).

## Open Questions

(Tidak ada — dokumen ini murni SOP kerja, bukan keputusan arsitektur yang butuh divalidasi.)

## Status

**Living document — dimulai dengan dua kebiasaan kerja (Pre-Discovery Framing, Uji Universalitas), akan bertambah seiring kebutuhan.** Diturunkan dari Constitution § 17 (Pre-Discovery Framing) setelah diuji dan dinyatakan levelnya SOP, bukan hukum dasar — lihat [`04`](../CECEP/04-architecture-constitution.md) § "Batas Constitution" untuk kriteria pemisahannya.
