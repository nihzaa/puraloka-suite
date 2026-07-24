# CECEP — Phase D: Capability Architecture

> ⚠️ **SUPERSEDED.** Capability Catalog (CAP-001 s.d. CAP-013) di dokumen ini TIDAK LAGI OTORITATIF — digantikan total oleh [`35-phase3-capability-architecture.md`](35-phase3-capability-architecture.md) (16 capability, Frozen Permanently via [ACR-004](04a-adr-traceability-log.md#acr-004-capability-boundary-corrections--ahsp-management-merge-resource-management-rename)) pasca [`29-context-integrity-audit.md`](29-context-integrity-audit.md). Ditemukan saat penyusunan [`45-phase7-data-architecture.md`](45-phase7-data-architecture.md): dokumen ini dan seluruh turunannya (`05b`, `06`, `06b`, `07`, `07b`, `07c`) terikat erat ke katalog CAP-XXX yang sudah usang — JANGAN dipakai sebagai evidence Ownership/Aggregate Root. Dipertahankan sebagai jejak historis proses, bukan otoritas.

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Fase sintesis pertama di seluruh rangkaian CECEP planning. Discovery (Phase A→C.5) bertanya *"apa yang ada?"*; Phase D bertanya *"bagaimana semua capability bekerja bersama?"* — pertanyaan yang berbeda secara kategoris, bukan kelanjutan discovery.
**Status dokumen ini:** Planning only. **BUKAN pencarian domain baru** — baseline Phase A-C.5 sudah di-freeze ([`03b`](03b-phase-c5-core-domain-discovery.md) § 🔒 FREEZE) dan diperlakukan sebagai premis, bukan bahan diskusi ulang. **BUKAN desain data model/API/UI** — itu Phase F ke atas.
**Aturan governing untuk fase ini (instruksi eksplisit founder):**
1. Layer TIDAK ditentukan dari template contoh manapun — layer muncul dari hasil discovery A-C.5 itu sendiri.
2. Setiap capability hanya berada di **satu** layer (single ownership).
3. Dependency hanya boleh mengalir **ke atas** — tidak ada circular dependency.
4. Capability tidak boleh mengetahui detail implementasi capability di layer di atasnya.
5. Setiap layer punya tanggung jawab jelas dan bisa berkembang independen.
6. **Capability ≠ Engine.** Urutan wajib: Capability Name → Capability Responsibility → Capability Boundary → baru Engine sebagai implementasi utamanya. Satu Engine punya relasi **one-to-one** dengan satu capability utama — tidak menangani banyak capability yang tidak berkaitan.
**Rujukan konstitusi:** Seluruh prinsip yang dipakai menilai keputusan di dokumen ini merujuk [`04-architecture-constitution.md`](04-architecture-constitution.md). Seluruh domain yang dipakai sebagai bahan baku merujuk [`03b-phase-c5-core-domain-discovery.md`](03b-phase-c5-core-domain-discovery.md).

---

## Metodologi — Dari Domain ke Capability

**Definisi kerja:** *Domain* (Phase C.5) menjawab "siapa memiliki data apa". *Capability* (Phase D) menjawab "apa yang bisa dilakukan sistem, sebagai satu kesatuan fungsi bisnis yang bermakna bagi pengguna" — satu Capability sering mengorkestrasi lebih dari satu Domain. Contoh: Capability "Menyusun Estimasi Biaya" bukan cuma domain Assembly, ia mengorkestrasi Assembly + RBS + Price Book + Productivity + Formula Engine sekaligus untuk menghasilkan satu hasil yang bermakna bagi estimator.

**Langkah derivasi yang dilakukan:**
1. Kelompokkan 13 Confirmed Domain + 4 Candidate Domain + 1 Supporting Capability (CBS Revision) dari Phase C.5 berdasarkan *pertanyaan bisnis yang sama-sama dijawab*, bukan berdasarkan kemiripan nama.
2. Untuk tiap kelompok, rumuskan satu Capability dengan namanya sendiri (belum tentu sama dengan nama Domain/Engine).
3. Amati pola dependency alami antar Capability (siapa butuh output siapa) — dari situ baru layer terbentuk, bukan dipaksakan ke 5 layer generik.
4. Setelah Capability + Layer stabil, baru turunkan ke Engine sebagai implementasi.

---

## A. Derivasi Capability dari Domain

| Capability | Domain yang Diorkestrasi (Phase C.5) | Pertanyaan Bisnis yang Dijawab |
|---|---|---|
| **Reference Data Management** | Reference Library🟡 (Candidate), Cost Code (Confirmed), RBS (Confirmed), Unit Conversion (Confirmed) | "Apa identitas baku yang dipakai bersama seluruh sistem?" |
| **Cost Classification** | CBS (Confirmed), WBS (Confirmed), CBS Revision (Supporting Capability) | "Bagaimana biaya dan pekerjaan dikelompokkan untuk analisis dan jadwal?" |
| **Method & Recipe Engineering** | Assembly/AHSP (Confirmed) | "Bagaimana cara mengerjakan sesuatu, dan resource apa yang dibutuhkan?" |
| **Pricing Knowledge** | Versioned Price Book (Confirmed), Regional Cost Index🟡 (Candidate) | "Berapa harga resource ini, kapan berlaku, seberapa bisa dipercaya, di lokasi mana?" |
| **Performance Knowledge** | Productivity Library (Confirmed) | "Seberapa cepat resource menyelesaikan jenis pekerjaan tertentu berdasar data aktual?" |
| **Calculation Execution** | Formula Engine (Confirmed) | "Bagaimana angka dihitung dari variabel-variabel yang diberikan, tanpa kode baru?" |
| **Risk & Contingency Knowledge** | Contingency & Risk Register🟡 (Candidate) | "Seberapa besar cadangan biaya/waktu yang perlu dialokasikan untuk ketidakpastian?" |
| **Estimate Composition** | Estimate Item (Confirmed), Estimate Version (Confirmed) | "Berapa total biaya pekerjaan ini, dan apakah sudah final/disetujui?" |
| **Scenario Management** | Scenario (Confirmed) | "Jalur estimasi mana ini, dan bagaimana dibandingkan dengan jalur lain?" |
| **Process Governance** | Configurable Approval Workflow (Confirmed) | "Apakah perubahan ini sudah melalui persetujuan yang sesuai konteksnya?" |
| **Company Intelligence Capture** | Lessons Learned/Variance/Root Cause (Confirmed) | "Apa yang harus berubah di knowledge perusahaan akibat proyek ini?" |
| **Knowledge Retrieval** | Knowledge Asset Index🟡 (Candidate) | "Lessons learned/pola mana yang relevan untuk situasi estimasi saat ini?" |
| **External Integration** | *(baru muncul di Phase D — lihat § D di bawah)* | "Bagaimana CECEP terhubung dengan data existing Puraloka Suite tanpa mencemari model domainnya?" |

**Catatan derivasi penting:** Tiga belas domain menghasilkan **13 Capability**, bukan 1:1 sederhana — beberapa Capability mengorkestrasi lebih dari satu Domain (Reference Data Management mengorkestrasi 4 Domain sekaligus), dan satu Capability baru (External Integration) muncul di Phase D ini sendiri karena Phase C.5 mengidentifikasi *kebutuhan* Anti-Corruption Layer tapi belum memformalkannya sebagai capability berdiri (lihat § D).

---

## B. Layer — Diturunkan dari Pola Dependency, Bukan dari Template

**Proses penurunan:** Dengan 13 Capability di atas, diperiksa: siapa butuh output siapa? Hasilnya menunjukkan **lima kelompok alami** dengan arah dependency yang konsisten — bukan dipaksakan ke jumlah tertentu, jumlah lima ini murni hasil dari pola yang ditemukan. Setiap Capability diverifikasi hanya masuk **satu** layer.

```
Layer 5 — INTELLIGENCE & GOVERNANCE LAYER
   (bergantung ke Layer 1-4, TIDAK ada Layer lain yang bergantung ke sini)
        ▲
Layer 4 — ESTIMATION ORCHESTRATION LAYER
   (bergantung ke Layer 1-3)
        ▲
Layer 3 — COST KNOWLEDGE LAYER
   (bergantung ke Layer 1-2)
        ▲
Layer 2 — CLASSIFICATION LAYER
   (bergantung ke Layer 1)
        ▲
Layer 1 — FOUNDATION & IDENTITY LAYER
   (tidak bergantung ke layer manapun di atasnya — akar)
```

### Layer 1 — Foundation & Identity Layer

**Tanggung jawab:** Menyediakan identitas dan reference data yang stabil, jarang berubah struktur, dipakai SEMUA layer di atasnya. Tidak pernah mengetahui/bergantung pada layer manapun di atasnya.

| Capability |
|---|
| Reference Data Management |

**Kenapa berdiri sendiri sebagai layer (bukan digabung Layer 2):** Reference Data Management adalah SATU-SATUNYA capability yang secara struktural tidak berubah oleh keputusan bisnis apa pun (Cost Code, RBS, Unit Conversion bersifat identitas/reference murni) — berbeda dari CBS (Layer 2) yang meski juga "struktural", tetap merupakan hasil keputusan pengelompokan bisnis yang bisa direvisi.

### Layer 2 — Classification Layer

**Tanggung jawab:** Mengelompokkan pekerjaan dan biaya untuk kebutuhan analisis dan jadwal, memakai identitas dari Layer 1.

| Capability |
|---|
| Cost Classification |

### Layer 3 — Cost Knowledge Layer

**Tanggung jawab:** Menyimpan dan mengembangkan pengetahuan biaya perusahaan (cara mengerjakan, harga, performa, risiko) — inilah lapisan yang paling langsung mewujudkan Foundational Principle Kedua (CECEP adalah Company Knowledge System). Seluruh capability di layer ini punya sifat sama: berkembang seiring waktu lewat Company Intelligence Loop, bukan statis.

| Capability |
|---|
| Method & Recipe Engineering |
| Pricing Knowledge |
| Performance Knowledge |
| Calculation Execution |
| Risk & Contingency Knowledge |

**Kenapa kelimanya satu layer, bukan dipisah:** Kelimanya punya pola dependency yang identik satu sama lain — semua bergantung ke Layer 1-2, tidak ada satu pun yang bergantung ke capability lain *di dalam* Layer 3 secara searah tetap (Method & Recipe *memanggil* Calculation Execution sebagai Domain Service, tapi tidak "memiliki" hasil kalkulasinya — pola pemanggilan Domain Service, bukan dependency antar-layer). Memisahkan mereka jadi layer sendiri-sendiri akan memecah sesuatu yang secara alami satu kesatuan fungsi ("pengetahuan biaya").

### Layer 4 — Estimation Orchestration Layer

**Tanggung jawab:** Mengorkestrasi Layer 1-3 menjadi hasil estimasi yang bermakna bagi pengguna — estimator berinteraksi paling sering dengan layer ini.

| Capability |
|---|
| Estimate Composition |
| Scenario Management |

### Layer 5 — Intelligence & Governance Layer

**Tanggung jawab:** Mengatur validitas perubahan (governance) dan menutup siklus pembelajaran organisasi (intelligence) — lapisan yang secara eksplisit boleh menulis balik ke Layer 3 (satu-satunya arah "mundur" yang sah dalam sistem, sudah dianalisis di Phase C.5 sebagai risiko yang harus dipagari).

| Capability |
|---|
| Process Governance |
| Company Intelligence Capture |
| Knowledge Retrieval |
| External Integration |

**Kenapa Process Governance masuk Layer 5, bukan layer tersendiri yang "melintasi semua":** Godaan awal adalah menempatkan Process Governance sebagai "lintas layer" karena ia memang dipanggil dari Layer 3 (Verified By Price Book) dan Layer 4 (Estimate Version approval). Tapi aturan single ownership (instruksi founder poin 2) melarang ini — Process Governance harus py SATU rumah. Diletakkan di Layer 5 karena Domain Responsibility intinya ("apakah perubahan ini sudah disetujui sesuai konteks") paling dekat maknanya dengan Company Intelligence Capture (keduanya sama-sama tentang *validitas keputusan*, bukan tentang menghasilkan angka biaya) — Layer 3/4 *memanggilnya* sebagai Domain Service dari luar layer mereka, sama seperti Layer 3 memanggil Calculation Execution tanpa memilikinya.

---

## C. Prinsip Pemeriksaan Layer (Verifikasi Instruksi Founder)

| Aturan | Diperiksa | Hasil |
|---|---|---|
| Single ownership per capability | Ditelusuri ke-13 Capability, dicek tidak ada yang muncul di dua layer | ✅ Lolos — setiap Capability satu baris di satu tabel layer saja |
| Dependency hanya ke atas, no circular | Diperiksa arah panah tiap Capability terhadap Capability lain | ✅ Lolos — Layer 5 memanggil ke bawah (1-4), tidak ada satu pun Capability di Layer 1-4 yang memanggil balik ke Layer 5 secara struktural. Satu-satunya aliran "mundur" (Lessons Learned menulis ke Assembly/Price Book/Productivity) BUKAN dependency struktural — itu **Domain Event** (`LessonsLearnedPropagated`) yang ditangkap Layer 3, bukan Layer 3 memanggil Layer 5. Perbedaan ini penting: dependency searah (compile-time/structural), event-driven update (runtime/reactive) — keduanya beda kategori, jadi tidak melanggar aturan "no circular dependency" |
| Capability tidak tahu implementasi layer atasnya | Diperiksa tiap Capability Layer 1-4 apakah menyebut nama Capability/Engine spesifik dari layer di atasnya | ✅ Lolos — tidak ada Capability di Layer 1-4 yang perlu tahu Process Governance/Lessons Learned itu SEPERTI APA cara kerjanya; mereka hanya "menerima update" lewat Domain Event, tanpa tahu siapa pengirimnya |
| Layer punya tanggung jawab jelas, bisa berkembang independen | Diperiksa satu kalimat Domain Responsibility per layer | ✅ Lolos — lihat kalimat "Tanggung jawab" di tiap layer § B, tidak ada dua layer dengan kalimat tanggung jawab yang tumpang tindih |

---

## D. Capability Baru yang Muncul di Phase D — External Integration

**Kenapa ini bukan pelanggaran "tidak mencari domain baru":** Phase C.5 sudah mengidentifikasi KEBUTUHAN dua Anti-Corruption Layer (§ Anti-Corruption Layer, `03b`) sebagai *pola integrasi yang perlu ada*, tapi belum memformalkannya sebagai capability berdiri — itu memang di luar cakupan Discovery (yang bertanya "apa yang ada", bukan "bagaimana capability terwujud"). External Integration adalah **capability sintesis**, bukan domain discovery baru — ia tidak menambah entity/data baru, hanya memformalkan *cara* dua Anti-Corruption Layer yang sudah teridentifikasi diimplementasikan sebagai satu capability yang konsisten, bukan dua solusi ad-hoc berbeda.

**Cakupan:** Menerjemahkan data existing Puraloka Suite (`project_expenses`, `kasbons`, dll — Actual Cost/Progress) menjadi bentuk yang aman dikonsumsi Company Intelligence Capture, DAN menerjemahkan format Reference Library eksternal (AHSP Nasional/CBS Nasional) menjadi bentuk yang aman dikonsumsi Method & Recipe Engineering/Cost Classification saat bootstrap.

---

## E. Dari Capability ke Engine — Finalisasi Bertahap

**Urutan wajib (instruksi founder):** (1) Finalisasi Capability Name → (2) Finalisasi Capability Responsibility → (3) Finalisasi Capability Boundary → (4) baru tentukan Engine sebagai implementasi utama. Nama Engine dikunci DI SINI (bukan working name lagi) — syarat Phase B.5 ("penguncian nama menunggu Domain Model selesai") sudah terpenuhi karena Phase C.5 sudah menyelesaikan domain model. Setiap Engine punya relasi **one-to-one** dengan satu Capability utama.

### Layer 1 — Foundation & Identity Layer

| 1. Capability Name | 2. Responsibility (final) | 3. Boundary (final) | 4. Engine (nama dikunci) |
|---|---|---|---|
| **Reference Data Management** | Menyediakan dan menjaga identitas universal (Cost Code, Resource, satuan) yang dipakai konsisten oleh seluruh layer di atasnya, termasuk menjembatani data referensi eksternal (AHSP Nasional, standar CBS) ke bentuk yang bisa dipakai company-level | Mencakup: Cost Code Registry, RBS Registry, Conversion Rule, bootstrap Reference Library eksternal. TIDAK mencakup: harga (Layer 3), kategori biaya (Layer 2), keputusan bisnis apa pun | **Identity Engine** |

**Kenapa "Identity Engine", bukan "Reference Engine" atau "Registry Engine":** Nama harus menangkap ESENSI capability (menjaga identitas tunggal lintas domain), bukan cuma "berisi data referensi" — kata "Identity" secara langsung merujuk balik ke fungsi Cost Code dan RBS sebagai shared kernel identitas ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.3, § A.5), bukan sekadar gudang data statis.

### Layer 2 — Classification Layer

| Capability Name | Responsibility (final) | Boundary (final) | Engine (nama dikunci) |
|---|---|---|---|
| **Cost Classification** | Mengelola struktur pengelompokan biaya (CBS) dan pekerjaan terjadwal (WBS) di level Standard/Company/Project, termasuk riwayat revisi struktur | Mencakup: CBS Template (semua tingkat), WBS Node, CBS Revision History. TIDAK mencakup: harga/method pekerjaan (Layer 3), hasil kalkulasi biaya aktual (Layer 4) | **Classification Engine** |

### Layer 3 — Cost Knowledge Layer

| Capability Name | Responsibility (final) | Boundary (final) | Engine (nama dikunci) |
|---|---|---|---|
| **Method & Recipe Engineering** | Menyimpan dan mengembangkan cara mengerjakan pekerjaan (resource, sequence, waste) sebagai paket reusable, dari bootstrap AHSP Nasional sampai Company AHSP matang | Mencakup: Assembly, Company AHSP, Custom Assembly. TIDAK mencakup: harga resource (dipakai, tidak dimiliki), formula perhitungan (dipanggil, tidak dimiliki) | **Assembly Engine** |
| **Pricing Knowledge** | Menyediakan harga resource ter-versi dari sumber yang tepat, termasuk penyesuaian regional | Mencakup: 4 Price Book, Regional Cost Index. TIDAK mencakup: identitas resource itu sendiri (Layer 1), keputusan pemakaian harga di estimasi (Layer 4) | **Pricing Engine** |
| **Performance Knowledge** | Menyediakan angka produktivitas ter-versi per kombinasi resource+pekerjaan, dari bootstrap sampai data aktual perusahaan | Mencakup: Productivity Record. TIDAK mencakup: identitas resource (Layer 1), penerapannya ke formula (Calculation Execution) | **Productivity Engine** |
| **Calculation Execution** | Mengeksekusi formula versioned tanpa perlu deploy kode baru, dipanggil layer manapun yang butuh hasil kalkulasi | Mencakup: Formula Definition, eksekusi ekspresi. TIDAK mencakup: nilai variabel yang dimasukkan (disuplai pemanggil), keputusan formula mana dipakai (pemanggil yang memutuskan) | **Calculation Engine** |
| **Risk & Contingency Knowledge** | Menyediakan cadangan alokasi biaya/waktu untuk ketidakpastian, berkembang dari pola Variance historis | Mencakup: Risk Register, Contingency Rule. TIDAK mencakup: keputusan berapa besar risiko diterapkan ke satu Estimate Version tertentu (itu keputusan Layer 4, capability ini hanya menyediakan basis datanya) | **Risk Engine** |

**Konsistensi one-to-one:** Kelima capability Layer 3 masing-masing punya SATU Engine, tidak ada satu Engine yang menangani dua capability sekaligus (mis. Pricing Engine tidak juga menangani Productivity meski keduanya sama-sama "menempel" ke RBS entry — konsisten dengan temuan Phase C.5 bahwa keduanya domain terpisah).

### Layer 4 — Estimation Orchestration Layer

| Capability Name | Responsibility (final) | Boundary (final) | Engine (nama dikunci) |
|---|---|---|---|
| **Estimate Composition** | Menyusun dan mengelola siklus hidup satu Estimate Version — mengorkestrasi panggilan ke Assembly/Pricing/Productivity/Calculation/Risk Engine untuk menghasilkan Estimate Item, memvalidasi konsistensi total | Mencakup: Estimate Version, Estimate Item. TIDAK mencakup: perbandingan lintas Scenario (Scenario Management), validasi approval (Process Governance — dipanggil, tidak dimiliki) | **Estimation Engine** |
| **Scenario Management** | Mengelola banyak Estimate Version paralel per Project agar bisa dibandingkan pada 7 dimensi (Cost/Duration/Cashflow/Risk/Margin/Resource/Profit/EVM) | Mencakup: Scenario, hasil komparasi lintas Scenario. TIDAK mencakup: isi/logika kalkulasi tiap Estimate Version (Estimate Composition) | **Scenario Engine** |

**Catatan finalisasi nama working name #12:** Phase B.5 sempat mempertimbangkan "Simulation Engine" atau "Estimate Scenario Engine" sebagai alternatif. **Scenario Engine** dipilih karena paling ringkas menangkap Domain Responsibility inti ("mengelola banyak jalur paralel yang bisa dibandingkan") tanpa menyiratkan simulasi numerik yang sebenarnya bukan tanggung jawabnya (simulasi angka adalah tugas Calculation Engine, dipanggil dari sini).

### Layer 5 — Intelligence & Governance Layer

| Capability Name | Responsibility (final) | Boundary (final) | Engine (nama dikunci) |
|---|---|---|---|
| **Process Governance** | Memvalidasi perubahan (Estimate Version, Price Book Entry, Lessons Learned) lewat approval chain yang configurable 7-dimensi, tanpa role hardcoded | Mencakup: Approval Chain Definition, status approval. TIDAK mencakup: isi data yang divalidasi (dimiliki capability pemanggil), keputusan bisnis di balik approve/reject (dimiliki manusia approver) | **Workflow Engine** |
| **Company Intelligence Capture** | Menangkap Variance dan Root Cause pasca-proyek, mengalirkan hasil approved ke pembaruan Company AHSP/Price Book/Productivity Record | Mencakup: Lessons Learned Record, Variance, Root Cause Analysis. TIDAK mencakup: keputusan approve/reject-nya sendiri (dipanggil dari Process Governance), isi Price Book/Productivity yang diperbarui (dimiliki Layer 3, hanya ditulis lewat event) | **Intelligence Engine** |
| **Knowledge Retrieval** | Mencari dan menyajikan Lessons Learned/pola historis yang relevan untuk konteks estimasi yang sedang dikerjakan | Mencakup: pencarian/indexing atas Lessons Learned Record. TIDAK mencakup: menyimpan Lessons Learned itu sendiri (Company Intelligence Capture) | **Retrieval Engine** |
| **External Integration** | Menerjemahkan data existing Puraloka Suite dan Reference Library eksternal ke bentuk yang aman dikonsumsi domain CECEP, menjaga model domain CECEP tidak tercemar konsep asing | Mencakup: kedua Anti-Corruption Layer yang teridentifikasi Phase C.5. TIDAK mencakup: logika bisnis di sisi manapun yang dijembatani (murni penerjemah, tanpa keputusan sendiri) | **Integration Gateway** |

**Kenapa "Integration Gateway", bukan "Integration Engine":** Sengaja dibedakan dari pola penamaan "...Engine" lainnya — capability ini secara filosofis berbeda: ia tidak menghasilkan/mengembangkan knowledge (seperti Engine lain di Layer 3/5), ia murni **penerjemah pasif** di titik ACL. Memberinya nama "Engine" berisiko menyiratkan ia py logika bisnis sendiri, padahal Boundary eksplisit menyatakan sebaliknya — nama "Gateway" lebih jujur terhadap batasnya sendiri.

**Kenapa "Intelligence Engine" dipilih untuk working name #11 (bukan "Knowledge Engine" atau "Learning Engine"):** Phase B.5 sudah mencatat tiga alternatif ini sebagai kemungkinan. "Knowledge Engine" ditolak karena terlalu luas — bisa disalahartikan mencakup SEMUA knowledge di Layer 3 (Pricing, Productivity, dst), padahal capability ini spesifik untuk siklus *penangkapan* pengetahuan baru dari proyek selesai, bukan penyimpanan knowledge secara umum. "Learning Engine" ditolak karena menyiratkan pembelajaran otomatis/ML, padahal Domain Responsibility-nya eksplisit membutuhkan validasi manusia wajib sebelum data dipakai (Configurable Approval Workflow) — "Learning" berisiko menyembunyikan constraint penting ini. "Intelligence Engine" dipilih karena selaras langsung dengan istilah "Company Intelligence Loop" (Foundational Principle Pertama) yang sudah jadi nama resmi proses yang capability ini implementasikan.

---

## F. Capability Dependency Matrix

Kontrak eksplisit per Capability — tujuannya supaya setiap Capability punya batas yang jelas SEBELUM masuk desain data/implementasi, dan supaya *Non-Responsibility* mencegah capability creep di fase-fase berikutnya.

### 1. Identity Engine (Reference Data Management)

| Field | Isi |
|---|---|
| **Purpose** | Menjaga SATU identitas Cost Code, Resource, dan satuan yang dipakai konsisten lintas seluruh CECEP dan Puraloka Suite |
| **Owner Domain** | Cost Code, RBS, Unit Conversion, Reference Library🟡 |
| **Upstream Capability** | Tidak ada (akar) |
| **Downstream Capability** | Cost Classification, Method & Recipe Engineering, Pricing Knowledge, Performance Knowledge, Estimate Composition (semua Layer 2-4 bergantung padanya) |
| **Required Input** | Permintaan registrasi Cost Code/Resource baru (via Process Governance), data mentah Reference Library eksternal (via External Integration) |
| **Produced Output** | Cost Code aktif/deprecated, Resource entry aktif/inactive, hasil konversi satuan |
| **Consumed By** | Seluruh 17 domain yang merujuk Cost Code ([`02`](02-phase-b5-core-cost-engineering-architecture.md) § 6), seluruh capability Layer 2-4 |
| **Depends On** | Tidak ada capability lain |
| **Core Responsibility** | Registry Cost Code + RBS + Conversion Rule; publish `CostCodeActivated`/`CostCodeDeprecated`/`ResourceDeactivated` |
| **Optional Responsibility** | Bootstrap awal Reference Library eksternal (bisa didelegasikan penuh ke External Integration kalau kompleksitas format tinggi) |
| **Non-Responsibility** | TIDAK menyimpan harga (Pricing Knowledge), TIDAK menyimpan kategori biaya (Cost Classification), TIDAK memutuskan siapa boleh membuat Cost Code baru (Process Governance yang memutuskan, Identity Engine hanya eksekusi) |

### 2. Classification Engine (Cost Classification)

| Field | Isi |
|---|---|
| **Purpose** | Mengelola struktur CBS dan WBS di semua tingkat (Standard/Company/Project), termasuk riwayat revisinya |
| **Owner Domain** | CBS, WBS, CBS Revision History (Supporting Capability) |
| **Upstream Capability** | Identity Engine |
| **Downstream Capability** | Estimate Composition (CBS Node/WBS Node dirujuk Estimate Item) |
| **Required Input** | Cost Code (dari Identity Engine) untuk direferensikan tiap Node, permintaan revisi struktur |
| **Produced Output** | CBS Node/WBS Node siap dirujuk, snapshot Project CBS |
| **Consumed By** | Estimate Composition, tampilan Gantt existing (WBS) |
| **Depends On** | Identity Engine |
| **Core Responsibility** | Standard→Company→Project CBS lifecycle; WBS Node lifecycle; publish `CompanyCbsTemplateRevised`/`ProjectCbsSnapshotted`/`WbsNodeBaselined` |
| **Optional Responsibility** | Menyediakan pola template revisi terstruktur (hasil Discovery Validation § 3, `03b`) |
| **Non-Responsibility** | TIDAK menghitung biaya (Estimate Composition), TIDAK menyimpan Cost Code itu sendiri (Identity Engine), TIDAK menjadi Aggregate Root untuk Estimate Item ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.2 catatan kritis) |

### 3. Assembly Engine (Method & Recipe Engineering)

| Field | Isi |
|---|---|
| **Purpose** | Menyimpan cara mengerjakan pekerjaan (resource+sequence+waste) sebagai paket reusable |
| **Owner Domain** | Assembly/AHSP, Company AHSP (state dari Assembly) |
| **Upstream Capability** | Identity Engine, Classification Engine |
| **Downstream Capability** | Estimate Composition |
| **Required Input** | Cost Code, RBS Resource (dari Identity Engine), hasil Calculation Execution, parameter Performance Knowledge |
| **Produced Output** | Assembly siap pakai, publish `AssemblyActivated`/`CompanyAhspRevised` |
| **Consumed By** | Estimate Composition |
| **Depends On** | Identity Engine, Calculation Engine (dipanggil sebagai Domain Service), Productivity Engine (dipanggil sebagai parameter) |
| **Core Responsibility** | Bootstrap AHSP Nasional→Company AHSP; sequence & resource requirement per Assembly |
| **Optional Responsibility** | Custom Assembly di luar jalur AHSP Nasional |
| **Non-Responsibility** | TIDAK memiliki harga resource (Pricing Knowledge), TIDAK memiliki formula perhitungan (Calculation Execution, hanya memanggil), TIDAK memiliki produktivitas (Performance Knowledge, hanya memanggil) — ketiga batas ini menjawab langsung pertanyaan founder di Phase C.5 |

### 4. Pricing Engine (Pricing Knowledge)

| Field | Isi |
|---|---|
| **Purpose** | Menyediakan harga resource ter-versi, dari sumber dan lokasi yang tepat |
| **Owner Domain** | Versioned Price Book (4 jenis), Regional Cost Index🟡 |
| **Upstream Capability** | Identity Engine |
| **Downstream Capability** | Estimate Composition, Assembly Engine (harga dirujuk saat menyusun estimasi biaya Assembly) |
| **Required Input** | RBS Resource (dari Identity Engine), konteks lokasi/waktu proyek, hasil approval `Verified By` (dari Process Governance) |
| **Produced Output** | Price Book Entry aktif + jejak sumber, publish `PriceBookEntryVerified`/`PriceBookEntryExpired` |
| **Consumed By** | Assembly Engine, Estimation Engine |
| **Depends On** | Identity Engine, Process Governance (untuk validasi entry) |
| **Core Responsibility** | 4 Price Book lifecycle (Material/Labor/Equipment/Subcontract) |
| **Optional Responsibility** | Regional normalization (kalau Candidate Regional Cost Index dikonfirmasi) |
| **Non-Responsibility** | TIDAK memiliki identitas Resource (Identity Engine), TIDAK memutuskan harga mana dipakai di satu Estimate tertentu (Estimation Engine yang memutuskan, Pricing Engine hanya menyediakan opsi ter-versi) |

### 5. Productivity Engine (Performance Knowledge)

| Field | Isi |
|---|---|
| **Purpose** | Menyediakan angka produktivitas ter-versi per kombinasi resource+pekerjaan |
| **Owner Domain** | Productivity Library |
| **Upstream Capability** | Identity Engine, Classification Engine (Cost Code sebagai bagian kunci kombinasi) |
| **Downstream Capability** | Assembly Engine |
| **Required Input** | RBS Resource + Cost Code (kombinasi kunci), data Variance dari Company Intelligence Capture |
| **Produced Output** | Productivity Record + confidence, publish `ProductivityRecordUpdatedFromVariance` |
| **Consumed By** | Assembly Engine (sebagai parameter Formula) |
| **Depends On** | Identity Engine, Company Intelligence Capture (sumber update) |
| **Core Responsibility** | Bootstrap AHSP Nasional→Company Baseline→Updated dari data aktual |
| **Optional Responsibility** | — |
| **Non-Responsibility** | TIDAK menjadi bagian struktural RBS entry ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.5 — dijawab eksplisit "TIDAK dimiliki, DIRUJUK"), TIDAK menghitung formula sendiri (Calculation Engine) |

### 6. Calculation Engine (Calculation Execution)

| Field | Isi |
|---|---|
| **Purpose** | Mengeksekusi formula versioned tanpa perlu deploy kode baru |
| **Owner Domain** | Formula Engine (domain) |
| **Upstream Capability** | Tidak ada (Domain Service generik, setara akar fungsional meski secara layer di Layer 3) |
| **Downstream Capability** | Assembly Engine, Estimation Engine, Identity Engine (Unit Conversion memakai pola serupa tapi domain terpisah) |
| **Required Input** | Formula Definition (versioned), variable/parameter dari pemanggil |
| **Produced Output** | Hasil kalkulasi (quantity/resource breakdown), publish `FormulaActivated` |
| **Consumed By** | Assembly Engine, Estimation Engine, berpotensi Risk Engine |
| **Depends On** | Tidak ada capability lain secara struktural — murni menerima input dari pemanggil |
| **Core Responsibility** | Eksekusi ekspresi formula, versioning Formula Definition |
| **Optional Responsibility** | — |
| **Non-Responsibility** | TIDAK menyimpan nilai variabel/parameter secara permanen (disuplai ulang tiap pemanggilan oleh pemanggil), TIDAK memutuskan formula mana dipakai untuk kasus tertentu (keputusan pemanggil) |

### 7. Risk Engine (Risk & Contingency Knowledge)

| Field | Isi |
|---|---|
| **Purpose** | Menyediakan cadangan alokasi biaya/waktu untuk ketidakpastian |
| **Owner Domain** | Contingency & Risk Register🟡 (Candidate — lihat catatan status) |
| **Upstream Capability** | Identity Engine, Classification Engine |
| **Downstream Capability** | Estimation Engine |
| **Required Input** | Pola Variance historis (dari Company Intelligence Capture) |
| **Produced Output** | Risk Allowance/Contingency Rate yang direkomendasikan |
| **Consumed By** | Estimation Engine (sebagai allowance tambahan di luar Assembly biasa) |
| **Depends On** | Company Intelligence Capture (sumber pola) |
| **Core Responsibility** | Menyimpan dan mengembangkan Risk Register dari data Variance |
| **Optional Responsibility** | — |
| **Non-Responsibility** | TIDAK memutuskan berapa besar risiko diterapkan ke satu Estimate Version tertentu (keputusan Estimation Engine/manusia, Risk Engine hanya menyediakan basis) |
| **⚠️ Catatan status** | Domain pendukungnya masih Candidate (belum Confirmed) per Discovery Validation ([`03b`](03b-phase-c5-core-domain-discovery.md) § 2) — Engine ini didesain di sini sebagai KERANGKA, implementasinya menunggu konfirmasi eksplisit founder tentang bentuk domain Risk Register |

### 8. Estimation Engine (Estimate Composition)

| Field | Isi |
|---|---|
| **Purpose** | Menyusun dan mengelola siklus hidup satu Estimate Version, mengorkestrasi seluruh Layer 3 |
| **Owner Domain** | Estimate Version (Aggregate Root), Estimate Item (child entity) |
| **Upstream Capability** | Identity Engine, Classification Engine, Assembly Engine, Pricing Engine, Productivity Engine, Calculation Engine, Risk Engine |
| **Downstream Capability** | Scenario Management (Estimate Version dimiliki Scenario) |
| **Required Input** | Cost Code/CBS/WBS Node, Assembly, Price Book Entry, Productivity Record, hasil Calculation Engine, Risk Allowance |
| **Produced Output** | Estimate Item, status Estimate Version, publish `EstimateVersionApproved`/`EstimateVersionFrozen`/`EstimateVersionSuperseded` |
| **Consumed By** | Scenario Management, downstream read-model (RAB/RAP/Budget/Cashflow/EVM) |
| **Depends On** | Semua capability Layer 1-3, Process Governance (validasi approval) |
| **Core Responsibility** | Menjaga konsistensi total Estimate Item terhadap Estimate Version induknya; lifecycle Draft→Approved→Baseline |
| **Optional Responsibility** | — |
| **Non-Responsibility** | TIDAK mengelola banyak Estimate Version paralel/perbandingan (Scenario Management), TIDAK memvalidasi approval sendiri (Process Governance), TIDAK menghasilkan RAB/RAP/Budget sebagai entity tersimpan (itu derived read-model, bukan tanggung jawab menyimpan) |

### 9. Scenario Engine (Scenario Management)

| Field | Isi |
|---|---|
| **Purpose** | Mengelola banyak Estimate Version paralel per Project agar bisa dibandingkan pada 7 dimensi |
| **Owner Domain** | Scenario (Aggregate Root) |
| **Upstream Capability** | Estimation Engine |
| **Downstream Capability** | Tidak ada (titik interaksi utama estimator/PM di Layer 4) |
| **Required Input** | Estimate Version (banyak, dari Estimation Engine), definisi 7 dimensi perbandingan |
| **Produced Output** | Scenario ter-versi, hasil komparasi lintas Scenario, publish `ScenarioBranched`/`ScenarioArchived` |
| **Consumed By** | Pengguna langsung (estimator/PM/direktur saat membandingkan Tender vs VE vs RAP) |
| **Depends On** | Estimation Engine |
| **Core Responsibility** | Branching Scenario, perbandingan 7-dimensi (Cost/Duration/Cashflow/Risk/Margin/Resource/Profit/EVM) |
| **Optional Responsibility** | — |
| **Non-Responsibility** | TIDAK menghitung isi/logika kalkulasi tiap Estimate Version (Estimation Engine), TIDAK memvalidasi approval Estimate Version individual (Process Governance) |

### 10. Workflow Engine (Process Governance)

| Field | Isi |
|---|---|
| **Purpose** | Memvalidasi perubahan lewat approval chain configurable 7-dimensi, tanpa role hardcoded |
| **Owner Domain** | Approval Chain Definition |
| **Upstream Capability** | Tidak ada (Domain Service generik dipanggil banyak Layer) |
| **Downstream Capability** | — (dipanggil, bukan memanggil ke bawah) |
| **Required Input** | Entity yang divalidasi (Estimate Version/Price Book Entry/Lessons Learned), konteks 7 dimensi (Company/Branch/Project Type/Contract Value/Estimate Type/Cost Threshold/Risk Level), identitas approver dari RBAC existing |
| **Produced Output** | Status approval, audit trail, publish `ApprovalRequested`/`ApprovalGranted`/`ApprovalRejected` |
| **Consumed By** | Pricing Engine, Estimation Engine, Company Intelligence Capture |
| **Depends On** | RBAC existing Puraloka Suite (basis identitas approver, bukan dimiliki Workflow Engine) |
| **Core Responsibility** | Evaluasi 7-dimensi konfigurasi approval chain terhadap entity yang divalidasi |
| **Optional Responsibility** | — |
| **Non-Responsibility** | TIDAK memutuskan isi data yang divalidasi (dimiliki capability pemanggil), TIDAK menghardcode role approver tertentu ("Yang Divalidasi: Estimate Version, Bukan Orang" — prinsip terkunci Phase B.5) |

### 11. Intelligence Engine (Company Intelligence Capture)

| Field | Isi |
|---|---|
| **Purpose** | Menangkap Variance dan Root Cause pasca-proyek, mengalirkan hasil approved ke pembaruan knowledge Layer 3 |
| **Owner Domain** | Lessons Learned Record (Aggregate Root), Variance, Root Cause Analysis |
| **Upstream Capability** | External Integration (sumber Actual Cost via ACL), Estimation Engine (sumber Estimate Version untuk dibandingkan) |
| **Downstream Capability** | Tidak ada yang bergantung PADAnya secara struktural — hanya menerima event, Layer 3 (Assembly/Pricing/Productivity) *bereaksi* terhadap event yang dipancarkannya |
| **Required Input** | Estimate Version (baseline), Actual Cost (via External Integration/ACL), hasil approval dari Process Governance |
| **Produced Output** | Variance, Root Cause, publish `VarianceCalculated`/`RootCauseIdentified`/`LessonsLearnedApproved`/`LessonsLearnedPropagated` |
| **Consumed By** | Assembly Engine, Pricing Engine, Productivity Engine (semua bereaksi terhadap `LessonsLearnedPropagated`), Retrieval Engine |
| **Depends On** | Estimation Engine, External Integration, Process Governance (TITIK WAJIB — tidak bisa dilewati, per Phase C.5) |
| **Core Responsibility** | Kalkulasi Variance, Root Cause Analysis, propagasi terkontrol ke 3 Engine Layer 3 |
| **Optional Responsibility** | — |
| **Non-Responsibility** | TIDAK memutuskan approve/reject sendiri (dipanggil dari Process Governance — "AI tidak boleh langsung belajar. Harus ada approval." verbatim founder), TIDAK menulis LANGSUNG ke Assembly/Price Book/Productivity tanpa melalui Domain Event terpublikasi (mencegah write access tak terkontrol yang sudah diidentifikasi sebagai risiko di Phase C.5) |

### 12. Retrieval Engine (Knowledge Retrieval)

| Field | Isi |
|---|---|
| **Purpose** | Mencari dan menyajikan Lessons Learned/pola historis yang relevan untuk konteks estimasi yang sedang dikerjakan |
| **Owner Domain** | Knowledge Asset Index🟡 (Candidate) |
| **Upstream Capability** | Company Intelligence Capture |
| **Downstream Capability** | Estimation Engine (estimator menerima rekomendasi saat menyusun Estimate) |
| **Required Input** | Lessons Learned Record (dari Company Intelligence Capture), konteks Estimate yang sedang dikerjakan (Cost Code/Assembly yang dipakai) |
| **Produced Output** | Daftar Lessons Learned/pola relevan, ranking relevansi |
| **Consumed By** | Estimation Engine (sebagai rekomendasi, bukan pemaksaan) |
| **Depends On** | Company Intelligence Capture |
| **Core Responsibility** | Pencarian/indexing Lessons Learned Record berdasar relevansi konteks |
| **Optional Responsibility** | Basis untuk AI Estimation Vision (Phase B § 11) — retrieval layer ini adalah prasyarat struktural sebelum AI recommendation bisa dibangun |
| **Non-Responsibility** | TIDAK menyimpan Lessons Learned itu sendiri (Company Intelligence Capture), TIDAK membuat keputusan estimasi (hanya menyajikan, keputusan tetap di estimator) |
| **⚠️ Catatan status** | Domain pendukungnya masih Candidate — Engine ini didesain sebagai KERANGKA, menunggu konfirmasi eksplisit apakah berdiri sendiri atau melebur ke Company Intelligence Capture (pertanyaan terbuka dari Phase C.5) |

### 13. Integration Gateway (External Integration)

| Field | Isi |
|---|---|
| **Purpose** | Menerjemahkan data existing Puraloka Suite dan Reference Library eksternal ke bentuk aman dikonsumsi domain CECEP |
| **Owner Domain** | Kedua Anti-Corruption Layer teridentifikasi Phase C.5 (bukan domain baru, murni pola integrasi) |
| **Upstream Capability** | Tidak ada (titik masuk data dari luar batas CECEP) |
| **Downstream Capability** | Company Intelligence Capture (ACL #1), Identity Engine + Classification Engine + Assembly Engine (ACL #2, saat bootstrap) |
| **Required Input** | Data existing Puraloka Suite (`project_expenses`/`kasbons`/`daily_wage_logs`/`progress_payments`/`borongan_settlements`), dokumen Reference Library eksternal (AHSP Nasional/CBS Nasional) |
| **Produced Output** | Data terjemahan dalam bentuk domain CECEP (Actual Cost ternormalisasi dengan Cost Code resolved, Reference Library terstruktur) |
| **Consumed By** | Company Intelligence Capture, Identity Engine, Classification Engine, Assembly Engine |
| **Depends On** | Tidak ada capability CECEP lain — bergantung ke sistem EKSTERNAL (Puraloka Suite existing, dokumen resmi pemerintah) |
| **Core Responsibility** | Resolusi Cost Code dari data lama tanpa Cost Code eksplisit; penerjemahan konsep "approved" (boolean) ≠ "Verified" (Price Book, lebih kaya) |
| **Optional Responsibility** | Bootstrap format-ke-domain-model untuk Reference Library eksternal (bisa didelegasikan sebagian ke Identity Engine kalau kompleksitas rendah) |
| **Non-Responsibility** | TIDAK memiliki logika bisnis di sisi manapun yang dijembatani — murni penerjemah pasif, TIDAK mengubah data sumber (Puraloka Suite existing tetap sumber kebenarannya sendiri untuk transaksi asalnya) |

---

## G. Architecture Quality Review — Gate Sebelum Phase E

**Kedudukan:** Dilakukan sebelum Approval Gate Phase D ditutup, per instruksi founder — quality gate yang memeriksa 12 prinsip terhadap Capability Map di atas. Kalau ada prinsip belum terpenuhi, direkomendasikan perbaikan SEBELUM lanjut Phase E — bukan dicatat sebagai utang teknis yang ditunda tanpa batas.

### 1. Single Responsibility

**Terpenuhi?** ✅ Ya. Setiap 13 Capability punya SATU kalimat Domain Responsibility yang tidak tumpang tindih dengan capability lain (lihat kolom "Purpose" § F) — diverifikasi eksplisit lewat kolom Non-Responsibility yang secara sengaja menegaskan batas negatif tiap capability.

**Alasan:** Metodologi § A-E secara konsisten memaksa pemisahan sebelum penamaan Engine (instruksi founder poin "Capability ≠ Engine") — proses ini secara struktural mencegah satu capability menumpuk banyak tanggung jawab tak berkaitan.

### 2. High Cohesion

**Terpenuhi?** ✅ Ya, dengan satu catatan. Layer 3 (Cost Knowledge) mengelompokkan 5 capability berbeda dalam satu layer — pada pandangan pertama terlihat berisiko rendah kohesi. Tapi diperiksa ulang: kelimanya kohesif dalam DIMENSI YANG SAMA (semua "pengetahuan biaya yang berkembang lewat Company Intelligence Loop", § B Layer 3), bukan kohesif secara implementasi. Kohesi di sini dinilai pada level *tujuan bisnis*, bukan level kode — sesuai cakupan Phase D yang eksplisit bukan desain implementasi.

**Alasan:** Setiap capability di Layer 3 independen secara Engine (5 Engine terpisah, § E), tapi seluruhnya melayani SATU tujuan Layer yang sama (`04-architecture-constitution.md` § 1 Foundational Principle Kedua) — ini pola kohesi yang benar untuk level Capability Architecture.

### 3. Low Coupling

**Terpenuhi?** 🟡 Sebagian, satu risiko diidentifikasi. Sebagian besar dependency Layer 3→4 bersifat longgar (dipanggil sebagai Domain Service, hasil dikonsumsi tanpa tahu detail internal). TAPI Estimation Engine (§ F.8) memiliki **7 Upstream Capability sekaligus** (Identity/Classification/Assembly/Pricing/Productivity/Calculation/Risk Engine) — ini titik coupling tertinggi di seluruh Capability Map.

**Alasan:** Coupling tinggi di Estimation Engine bukan cacat desain — ia SECARA INHEREN adalah titik orkestrasi (namanya sendiri "Orchestration Layer"), jadi coupling tinggi di sini diharapkan, bukan gejala kesalahan pemisahan domain.

**Rekomendasi:** Sebelum Phase E, pastikan Estimation Engine berkomunikasi dengan ketujuh upstream-nya lewat kontrak/interface yang seragam (bukan tujuh cara pemanggilan berbeda) — dicatat sebagai perhatian eksplisit untuk Phase E/F, bukan blocker Phase D karena desain interface konkret di luar cakupan Capability Architecture.

### 4. Separation of Concerns

**Terpenuhi?** ✅ Ya. Klasifikasi Layer 1 (identitas) → Layer 2 (klasifikasi) → Layer 3 (pengetahuan) → Layer 4 (orkestrasi) → Layer 5 (governance+intelligence) adalah pemisahan concern yang eksplisit dan diverifikasi tidak tumpang tindih (§ C).

**Alasan:** Concern "menyimpan identitas" (Layer 1) tidak pernah bercampur dengan concern "menghitung biaya" (Layer 3) atau "memvalidasi perubahan" (Layer 5) — dikonfirmasi lewat kolom Non-Responsibility di setiap entri § F.

### 5. Dependency Direction

**Terpenuhi?** ✅ Ya, sudah diverifikasi formal di § C. Tidak ada circular dependency; satu-satunya aliran "mundur" (Lessons Learned menulis balik ke Layer 3) berjalan lewat Domain Event, bukan dependency struktural — perbedaan kategori yang sudah dijelaskan eksplisit di § C.

**Alasan:** Event-driven update BUKAN structural dependency — Layer 3 tidak "membutuhkan" Layer 5 untuk berfungsi (Assembly Engine tetap bisa dipakai tanpa Intelligence Engine pernah berjalan), ia hanya bereaksi KALAU event terjadi. Ini pola arsitektur yang sah dan justru direkomendasikan untuk memutus circular dependency yang seharusnya ada secara logis (knowledge harus diperbarui dari hasil proyek, tapi tidak boleh jadi hard dependency).

### 6. Reusability

**Terpenuhi?** ✅ Ya. Prinsip "Engine over Module" ([`04`](04-architecture-constitution.md) § 5 Invariant 7) secara eksplisit sudah jadi kriteria derivasi Engine sejak Phase B.5 — Calculation Engine dan Identity Engine secara khusus didesain dipanggil ulang lintas Puraloka Suite (bukan cuma internal CECEP), sesuai penegasan Round 5 Phase B.5.

**Alasan:** Setiap Engine di § E didesain sebagai Domain Service/Aggregate yang bisa dipanggil dari konteks manapun yang relevan, bukan terikat UI/workflow spesifik satu tempat.

### 7. Extensibility

**Terpenuhi?** ✅ Ya. Candidate Domain yang belum Confirmed (Risk Register, Knowledge Asset Index, Regional Cost Index) sudah punya SLOT capability yang jelas (Risk Engine § F.7, Retrieval Engine § F.12, opsional di Pricing Engine § F.4) tanpa perlu merombak layer manapun kalau/ketika dikonfirmasi penuh di masa depan.

**Alasan:** Extensibility diuji langsung lewat cara Capability Map ini MENAMPUNG ketidakpastian status Candidate tanpa memaksa keputusan prematur — desain yang kaku akan memaksa keputusan "termasuk atau tidak" sekarang, desain ini membiarkan slot terbuka dengan kontrak (Purpose/Boundary) sudah siap.

### 8. Replaceability

**Terpenuhi?** ✅ Ya. Setiap Engine punya Boundary eksplisit yang tidak menyebut cara kerja internal Engine lain — mis. Estimation Engine tidak perlu tahu APAKAH Pricing Engine mengambil harga dari database relasional atau dari layanan eksternal, ia hanya butuh kontrak "harga resource ter-versi" terpenuhi.

**Alasan:** Ini adalah konsekuensi langsung dari aturan founder "Capability tidak boleh mengetahui implementasi capability di layer atasnya" — yang diverifikasi di § C — plus penerapan simetrisnya secara implisit ke SEMUA arah (bukan cuma ke atas): tiap kontrak di § F murni behavioral (input/output), tidak menyebut implementasi.

### 9. Testability

**Terpenuhi?** ✅ Ya, secara struktural. Non-Responsibility yang eksplisit di tiap capability (§ F) berarti setiap Engine punya permukaan kontrak yang sempit dan bisa diuji terisolasi (mock Upstream Capability, verifikasi Produced Output) — tanpa harus menjalankan seluruh sistem.

**Alasan:** Capability dengan boundary kabur (yang justru dicegah lewat proses § E "Boundary sebelum Engine") akan sulit diuji terisolasi karena tidak jelas apa yang sebenarnya sedang diverifikasi — Testability di level Capability Architecture berarti "bisa dinilai lolos/gagal berdasar kontraknya", dan itu sudah terpenuhi di sini.

### 10. Explainability

**Terpenuhi?** ✅ Ya, ditegaskan ulang dari Architectural Invariant ([`04`](04-architecture-constitution.md) § 5 Invariant 2). Setiap Domain Event di § F (`PriceBookEntryVerified`, `LessonsLearnedPropagated`, dst) memberi jejak eksplisit siapa memicu apa — rantai penjelasan "kenapa angka ini begini" bisa ditelusuri lewat Estimation Engine → Pricing/Assembly/Productivity Engine → Identity Engine, persis contoh founder di Phase B.5 (`04` § 3.1).

**Alasan:** Explainability bukan fitur tambahan yang perlu "dipasang" nanti — ia sudah jadi konsekuensi struktural dari cara Capability Map ini disusun (setiap Engine punya Required Input eksplisit yang bisa ditelusuri mundur).

### 11. AI Readiness

**Terpenuhi?** 🟡 Sebagian, satu gap terbuka (sudah diketahui, bukan temuan baru). Retrieval Engine (§ F.12) dan Intelligence Engine (§ F.11) sudah menyediakan fondasi struktural untuk AI (data terstruktur, retrieval layer, validasi manusia wajib sebelum data dipakai) — TAPI Retrieval Engine masih berstatus Candidate (domain pendukungnya belum Confirmed), berarti fondasi AI Readiness secara resmi belum solid 100%.

**Alasan:** Ini bukan cacat desain baru — ini adalah gap yang SUDAH diidentifikasi eksplisit di Discovery Validation ([`03b`](03b-phase-c5-core-domain-discovery.md) § 5, "AI Learning Loop diasumsikan konsumen akhir yang otomatis dapat data terstruktur, TAPI domain retrieval belum ada") dan sudah ditampung sebagai slot Extensibility (§ G.7 di atas).

**Rekomendasi:** Sebelum AI Estimation Vision (Phase B § 11) benar-benar diimplementasikan (jauh di Phase G/H — AI Architecture), Retrieval Engine harus naik status dari Candidate ke Confirmed lebih dulu — dicatat sebagai prasyarat eksplisit, bukan blocker Phase D/E sekarang karena AI Architecture memang belum jadi fase aktif.

### 12. Versionability

**Terpenuhi?** ✅ Ya. Setiap Engine yang menyimpan knowledge (Assembly/Pricing/Productivity/Risk/Classification) diturunkan dari domain yang SUDAH lolos pertimbangan versioning eksplisit di Phase C.5 (Foundational Principle Ketiga — "pertimbangkan dulu, baru putuskan"); satu-satunya domain yang sah TIDAK versioned (Unit Conversion, bagian Identity Engine) sudah didokumentasikan alasannya eksplisit, bukan diam-diam terlewat.

**Alasan:** Versionability sudah jadi kriteria wajib sejak Phase B.5 — Capability Architecture ini tidak memperkenalkan Engine manapun yang menyimpan knowledge tanpa mekanisme versi (dikonfirmasi lewat kolom "Produced Output" § F yang konsisten memakai kata "ter-versi"/publish event revisi).

### Ringkasan Quality Review

| Prinsip | Status | Tindakan |
|---|---|---|
| Single Responsibility | ✅ Terpenuhi | — |
| High Cohesion | ✅ Terpenuhi | — |
| Low Coupling | 🟡 Sebagian | Rekomendasi: kontrak seragam untuk 7 upstream Estimation Engine, dikerjakan Phase E/F |
| Separation of Concerns | ✅ Terpenuhi | — |
| Dependency Direction | ✅ Terpenuhi | — |
| Reusability | ✅ Terpenuhi | — |
| Extensibility | ✅ Terpenuhi | — |
| Replaceability | ✅ Terpenuhi | — |
| Testability | ✅ Terpenuhi | — |
| Explainability | ✅ Terpenuhi | — |
| AI Readiness | 🟡 Sebagian | Rekomendasi: Retrieval Engine naik status Candidate→Confirmed sebelum AI Architecture (Phase G/H) diaktifkan |
| Versionability | ✅ Terpenuhi | — |

**Kesimpulan gate:** 10 dari 12 prinsip terpenuhi penuh, 2 prinsip terpenuhi sebagian dengan rekomendasi yang sudah jelas targetnya (Phase E/F untuk Low Coupling, Phase G/H untuk AI Readiness) — tidak ada prinsip yang GAGAL total. Kedua rekomendasi tidak memblokir Phase E, karena keduanya sudah punya rumah fase yang tepat untuk diselesaikan, bukan risiko yang dibiarkan tanpa rencana.

---

## Assumptions

1. Pembagian 5 Layer diturunkan dari pola dependency yang ditemukan saat menganalisis 13 Capability — kalau Phase E/F menemukan capability baru (di luar 4 Candidate yang sudah diantisipasi), pola layer ini mungkin perlu diperiksa ulang, meski struktur intinya (Foundation→Classification→Knowledge→Orchestration→Governance) diperkirakan tetap stabil karena mengikuti urutan dependency alami yang logis, bukan detail domain spesifik yang mudah berubah.
2. Penguncian nama Engine (§ E) diputuskan sepenuhnya oleh saya berdasarkan penilaian arsitektur (user menjawab "no preference" saat ditanya) — nama-nama ini SIAP dipertanyakan ulang founder kalau ada keberatan spesifik, berbeda dari prinsip di § A-D yang lebih terikat langsung ke instruksi eksplisit.

## Open Questions

1. Untuk Risk Engine dan Retrieval Engine (§ F.7, F.12) — keduanya didesain sebagai kerangka penuh meski domain pendukungnya masih Candidate. Apakah founder ingin kedua Candidate ini dikonfirmasi eksplisit SEKARANG (sebelum Phase E), atau tetap berstatus kerangka terbuka sampai kebutuhan konkretnya muncul?
2. Untuk rekomendasi Low Coupling (§ G.3) — apakah kontrak seragam 7-upstream Estimation Engine sebaiknya mulai dirancang di Phase E (Calculation Strategy) atau ditunda ke Phase F (Enterprise Data Model)?

## Required Decisions (Approval Gate)

1. Apakah kelima Layer (Foundation & Identity, Classification, Cost Knowledge, Estimation Orchestration, Intelligence & Governance) sudah menangkap struktur yang benar, atau ada Capability yang terasa salah tempat?
2. Apakah 13 nama Engine yang dikunci di § E sudah tepat, atau ada nama yang perlu direvisi (khususnya Intelligence Engine, Scenario Engine, Integration Gateway — tiga nama yang paling banyak pertimbangan alternatif)?
3. Apakah Capability Dependency Matrix (§ F) — khususnya kolom Non-Responsibility — sudah cukup ketat mencegah capability creep di fase berikutnya?
4. Apakah hasil Architecture Quality Review (§ G) — termasuk 2 prinsip yang baru terpenuhi sebagian — sudah bisa diterima sebagai kondisi masuk Phase E, atau perlu diperbaiki dulu sebelum lanjut?
5. Apakah Phase D sekarang siap ditutup dan lanjut ke **Phase E (Calculation Strategy)**?

---

## 🚦 APPROVAL GATE

Phase D (Capability Architecture) selesai — 13 Capability diturunkan dari baseline Phase A-C.5 yang di-freeze, dikelompokkan 5 Layer, diturunkan jadi 13 Engine dengan nama terkunci, dikontrak lewat Capability Dependency Matrix, dan diperiksa lewat Architecture Quality Review 12 prinsip. **STOP** — menunggu approval eksplisit sebelum lanjut ke **Phase E (Calculation Strategy)**.

**Catatan struktural (ditambahkan setelah Phase D selesai):** Sebelum lanjut ke Phase E, founder meminta validation gate tambahan — **Phase D.1 — Capability Validation & Freeze** (analog dengan Discovery Validation & Freeze setelah Phase C.5), lihat [`05b-phase-d1-capability-validation-freeze.md`](05b-phase-d1-capability-validation-freeze.md). Phase E menunggu Phase D.1 selesai, bukan menunggu Phase D saja. Phase D.1 menghasilkan 3 koreksi konkret pada Capability Dependency Matrix di § F dokumen ini (lihat `05b` § 🔒 CAPABILITY FREEZE untuk detail) dan menerbitkan Capability Catalog dengan ID resmi (CAP-001 s.d. CAP-013) sebagai referensi Phase E-L.

*Dokumen selanjutnya: Phase D.1 — Capability Validation & Freeze, lalu Phase E — Calculation Strategy.*
