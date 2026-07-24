# CECEP — Phase D.1: Capability Validation & Freeze

> ⚠️ **SUPERSEDED.** Capability Catalog CAP-001 s.d. CAP-013 yang di-Freeze di sini TIDAK LAGI OTORITATIF — digantikan total oleh [`35-phase3-capability-architecture.md`](35-phase3-capability-architecture.md) (16 capability, Frozen Permanently via [ACR-004](04a-adr-traceability-log.md#acr-004-capability-boundary-corrections--ahsp-management-merge-resource-management-rename)) pasca [`29-context-integrity-audit.md`](29-context-integrity-audit.md). JANGAN dipakai sebagai evidence Ownership. Dipertahankan sebagai jejak historis proses.

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Validation gate singkat setelah Phase D, sebelum Phase E — **BUKAN phase baru**, mengikuti pola yang sama seperti Discovery Validation & Freeze setelah Phase C.5 ([`03b`](03b-phase-c5-core-domain-discovery.md) § Discovery Validation & Freeze). Founder eksplisit mengidentifikasi pola berulang Discovery→Validation→Freeze di setiap fase discovery (A, B, C) dan meminta pola yang sama diterapkan untuk Phase D.
**Tujuan:** BUKAN mencari capability baru — memastikan Capability Architecture (Phase D) benar-benar stabil sebelum seluruh Calculation Strategy (Phase E) dibangun di atasnya. Kalau ada capability salah boundary/dependency yang baru ketahuan di tengah Phase E, efeknya merembet ke Formula, Domain Model, Automation, AI, Integration, sampai Migration — jauh lebih mahal diperbaiki nanti dibanding sekarang.
**Rujukan:** Seluruh capability yang divalidasi berasal dari [`05-phase-d-capability-architecture.md`](05-phase-d-capability-architecture.md) § A-F. Seluruh prinsip constitutional merujuk [`04-architecture-constitution.md`](04-architecture-constitution.md).

---

## 1. Capability Coverage Validation

**Tujuan:** Tidak boleh ada domain tanpa capability, tidak boleh ada capability tanpa owner domain.

### 1a. Domain → Capability (memastikan tidak ada domain yatim)

| Domain (Phase C.5) | Status Domain | Capability Pemilik | Tercakup? |
|---|---|---|---|
| WBS | Confirmed | Cost Classification | ✅ |
| CBS | Confirmed | Cost Classification | ✅ |
| CBS Revision History | Supporting Capability | Cost Classification | ✅ |
| Cost Code | Confirmed | Reference Data Management | ✅ |
| Assembly/AHSP (+ Company AHSP) | Confirmed | Method & Recipe Engineering | ✅ |
| RBS | Confirmed | Reference Data Management | ✅ |
| Versioned Price Book | Confirmed | Pricing Knowledge | ✅ |
| Productivity Library | Confirmed | Performance Knowledge | ✅ |
| Formula Engine (domain) | Confirmed | Calculation Execution | ✅ |
| Unit Conversion | Confirmed | Reference Data Management | ✅ |
| Estimate Item | Confirmed | Estimate Composition | ✅ |
| Estimate Version | Confirmed | Estimate Composition | ✅ |
| Scenario | Confirmed | Scenario Management | ✅ |
| Configurable Approval Workflow | Confirmed | Process Governance | ✅ |
| Lessons Learned/Variance/Root Cause | Confirmed | Company Intelligence Capture | ✅ |
| Regional Cost Index | Candidate 🟡 | Pricing Knowledge (optional responsibility) | ✅ (slot tersedia) |
| Knowledge Asset Index | Candidate 🟡 | Knowledge Retrieval | ✅ |
| Contingency & Risk Register | Candidate 🟡 | Risk & Contingency Knowledge | ✅ |
| Reference Library | Candidate 🟡 | Reference Data Management (optional responsibility) | ✅ (slot tersedia) |

**Hasil:** Seluruh 15 Confirmed/Supporting Domain + 4 Candidate Domain punya capability pemilik. **Tidak ada domain yatim.** Empat Candidate Domain sengaja ditampung sebagai *optional responsibility* atau *slot capability* (bukan capability berdiri sendiri) — konsisten dengan status mereka yang belum Confirmed (Discovery Validation, `03b` § 2).

### 1b. Capability → Domain (memastikan tidak ada capability tanpa owner)

| # | Capability | Owner Domain | Tercakup? |
|---|---|---|---|
| 1 | Reference Data Management | Cost Code, RBS, Unit Conversion, Reference Library🟡 | ✅ |
| 2 | Cost Classification | CBS, WBS, CBS Revision History | ✅ |
| 3 | Method & Recipe Engineering | Assembly/AHSP | ✅ |
| 4 | Pricing Knowledge | Versioned Price Book, Regional Cost Index🟡 | ✅ |
| 5 | Performance Knowledge | Productivity Library | ✅ |
| 6 | Calculation Execution | Formula Engine | ✅ |
| 7 | Risk & Contingency Knowledge | Contingency & Risk Register🟡 | ✅ |
| 8 | Estimate Composition | Estimate Item, Estimate Version | ✅ |
| 9 | Scenario Management | Scenario | ✅ |
| 10 | Process Governance | Configurable Approval Workflow | ✅ |
| 11 | Company Intelligence Capture | Lessons Learned/Variance/Root Cause | ✅ |
| 12 | Knowledge Retrieval | Knowledge Asset Index🟡 | ✅ |
| 13 | External Integration | *(bukan domain — pola ACL dari `03b`, lihat `05` § D)* | ✅ (dijelaskan eksplisit di Phase D kenapa sah tanpa domain data sendiri) |

**Hasil:** Seluruh 13 Capability punya Owner Domain, kecuali External Integration yang secara SENGAJA tidak punya domain data sendiri (perannya murni penerjemah/ACL, bukan penyimpan data) — ini bukan pelanggaran, karena sudah dijelaskan eksplisit statusnya berbeda di Phase D § D. Dicatat di sini supaya tidak disalahartikan sebagai "capability tanpa owner" saat validasi.

**Verdict Capability Coverage: ✅ LULUS.** Tidak ada domain yatim, tidak ada capability tanpa owner (dengan satu pengecualian yang sudah dijelaskan dan sah).

---

## 2. Capability Boundary Validation

**Tujuan:** Tidak ada responsibility yang overlap; tiap capability harus punya Core Responsibility, Non-Responsibility, Boundary, Ownership yang jelas (semua sudah ada di [`05`](05-phase-d-capability-architecture.md) § F).

### Pemeriksaan overlap — pasangan capability yang berpotensi tumpang tindih

| Pasangan | Potensi Overlap | Hasil Pemeriksaan |
|---|---|---|
| Method & Recipe Engineering ↔ Calculation Execution | Assembly memakai Formula — apakah Assembly "memiliki" logika kalkulasi? | **Tidak overlap.** Non-Responsibility Assembly Engine eksplisit: "TIDAK memiliki formula perhitungan (Calculation Execution, hanya memanggil)". Assembly hanya konsumen, Calculation Execution pemilik tunggal logika eksekusi formula. |
| Pricing Knowledge ↔ Performance Knowledge | Keduanya "menempel" ke RBS entry yang sama — apakah keduanya menjawab pertanyaan serupa? | **Tidak overlap** — sudah dijawab eksplisit di Phase C.5 ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.5): Pricing menjawab "berapa harganya", Performance menjawab "seberapa cepat/produktif" — dua pertanyaan bisnis berbeda meski subjeknya sama (Resource). |
| Estimate Composition ↔ Scenario Management | Kapan sesuatu jadi tanggung jawab Estimate Version vs tanggung jawab Scenario? | **Tidak overlap.** Boundary eksplisit: Estimate Composition = isi/logika SATU Estimate Version; Scenario Management = mengelola BANYAK Estimate Version paralel + perbandingan. Non-Responsibility saling menegaskan batas ini di kedua arah. |
| Process Governance ↔ Company Intelligence Capture | Keduanya terlibat validasi Lessons Learned — siapa pemilik keputusan approve? | **Tidak overlap.** Non-Responsibility Company Intelligence Capture eksplisit: "TIDAK memutuskan approve/reject sendiri (dipanggil dari Process Governance)". Process Governance memiliki KEPUTUSAN validasi; Company Intelligence Capture memiliki ISI yang divalidasi. Pemisah data vs keputusan atas data. |
| Knowledge Retrieval ↔ Company Intelligence Capture | Keduanya menyentuh Lessons Learned Record yang sama | **Tidak overlap.** Non-Responsibility Retrieval Engine eksplisit: "TIDAK menyimpan Lessons Learned itu sendiri". Retrieval = mencari/menyajikan; Capture = menyimpan/memvalidasi. Read-oriented vs write-oriented terhadap entity yang sama, pola yang lazim dan sah (CQRS-like separation di level capability, bukan cuma level implementasi). |
| External Integration ↔ Reference Data Management | Keduanya sama-sama menyentuh proses bootstrap Reference Library eksternal | **Tidak overlap, tapi butuh penegasan tambahan** — lihat catatan di bawah. |

**Catatan penegasan tambahan (External Integration ↔ Reference Data Management):** Phase D § F.13 mencantumkan "Optional Responsibility: Bootstrap format-ke-domain-model untuk Reference Library eksternal (bisa didelegasikan sebagian ke Identity Engine kalau kompleksitas rendah)" — frasa "bisa didelegasikan sebagian" ini berpotensi ambigu kalau dibaca sebagai dua capability sama-sama boleh mengerjakan hal yang sama. **Klarifikasi final:** Integration Gateway (External Integration) memiliki tanggung jawab PENERJEMAHAN FORMAT (dokumen resmi pemerintah → struktur data), Identity Engine memiliki tanggung jawab REGISTRASI HASIL (menyimpan Cost Code/Resource yang sudah diterjemahkan ke Registry). Tidak ada dua capability mengerjakan langkah yang sama — ini adalah pipeline dua langkah (translate → register), bukan overlap. Kalimat "didelegasikan sebagian" di Phase D diperjelas di sini maknanya: hanya berlaku pada kasus format sumber sudah cukup terstruktur sehingga langkah "translate" nyaris tidak diperlukan (mis. Reference Library yang sudah datang sebagai data terstruktur, bukan dokumen PDF/Excel mentah) — bukan tumpang tindih tanggung jawab, melainkan pipeline yang bisa memendek pada kasus tertentu.

### Verifikasi kelengkapan 4 elemen wajib per capability

| Capability | Core Responsibility | Non-Responsibility | Boundary | Ownership |
|---|---|---|---|---|
| Semua 13 Capability | ✅ Ada (`05` § F kolom "Core Responsibility") | ✅ Ada (`05` § F kolom "Non-Responsibility") | ✅ Ada (`05` § E kolom "Boundary (final)") | ✅ Ada (`05` § F kolom "Owner Domain") |

**Verdict Capability Boundary: ✅ LULUS.** Tidak ditemukan overlap responsibility yang tidak terjelaskan; satu titik yang berpotensi ambigu (External Integration ↔ Reference Data Management pada bootstrap) sudah diklarifikasi eksplisit di atas sebagai pipeline, bukan overlap.

---

## 3. Dependency Validation

**Tujuan:** Tidak ada circular dependency, dependency mengalir satu arah, dependency minimum, tidak ada hidden dependency.

### 3a. Circular dependency — re-verifikasi

Phase D § C sudah memverifikasi ini sekali. Divalidasi ulang di sini dengan menelusuri SETIAP baris "Depends On" di § F Phase D satu per satu untuk memastikan tidak ada rantai yang kembali ke titik awal:

```
Identity Engine → (tidak depends on siapa pun)
Classification Engine → Identity Engine
Assembly Engine → Identity Engine, Calculation Engine, Productivity Engine
Pricing Engine → Identity Engine, Process Governance
Productivity Engine → Identity Engine, Company Intelligence Capture
Calculation Engine → (tidak depends on siapa pun secara struktural)
Risk Engine → Company Intelligence Capture
Estimation Engine → Identity+Classification+Assembly+Pricing+Productivity+Calculation+Risk Engine, Process Governance
Scenario Engine → Estimation Engine
Workflow Engine → RBAC existing (eksternal, bukan capability CECEP)
Intelligence Engine → Estimation Engine, External Integration, Process Governance
Retrieval Engine → Company Intelligence Capture
Integration Gateway → (bergantung ke sistem eksternal, bukan capability CECEP lain)
```

**Ditelusuri rantai terpanjang untuk mendeteksi siklus:** Estimation Engine → Assembly Engine → Productivity Engine → Company Intelligence Capture → ... apakah Company Intelligence Capture depends back ke Estimation Engine? **Ya, secara eksplisit** ("Required Input: Estimate Version (baseline)... Upstream Capability: ...Estimation Engine"). Ini terlihat seperti siklus: Estimation Engine → Assembly Engine → Productivity Engine → **Company Intelligence Capture → Estimation Engine**.

**Analisis apakah ini circular dependency yang melanggar aturan:** TIDAK, dengan penjelasan yang perlu dipertegas (belum eksplisit di Phase D asli — ini temuan validasi yang perlu ditambal). Dua arah ketergantungan ini beroperasi pada **dua bidang waktu yang berbeda**:
- Estimation Engine → Assembly/Productivity Engine: terjadi SAAT estimasi disusun (real-time, dalam satu siklus Estimate Version yang sama).
- Company Intelligence Capture → Estimation Engine: terjadi SETELAH Estimate Version di-Approve dan proyek selesai (post-hoc, siklus yang sudah berbeda/baru) — ia membaca Estimate Version yang SUDAH FROZEN sebagai data historis, bukan memanggil Estimation Engine untuk memproses sesuatu yang sedang berjalan.

**Kesimpulan:** Ini bukan circular dependency runtime (A memanggil B memanggil A dalam satu eksekusi) — ini dua panah yang menunjuk arah berlawanan pada **waktu berbeda**: forward flow (menyusun estimasi) dan feedback flow (belajar dari estimasi yang sudah selesai). Perbedaan ini sudah tersirat di Phase D (pemisahan "Domain Event reaktif" vs "structural dependency" di § C), tapi belum dijelaskan setegas ini untuk pasangan Estimation Engine ↔ Company Intelligence Capture secara spesifik — **ditambal di sini sebagai klarifikasi resmi Phase D.1.**

### 3b. Dependency satu arah

Diperiksa ulang seluruh 13 baris Depends On di atas — tidak ada satu pun yang menunjuk balik ke pemanggilnya dalam bidang waktu yang sama. **Lolos**, dengan catatan klarifikasi § 3a di atas untuk pasangan yang butuh penjelasan tambahan.

### 3c. Dependency minimum (tidak berlebihan)

**Diperiksa:** Apakah ada capability yang mendeklarasikan dependency ke capability lain padahal sebenarnya tidak butuh?

**Titik yang diperiksa detail — Estimation Engine (7 upstream dependency, titik coupling tertinggi menurut Phase D § G.3):** Ditelusuri ulang apakah ketujuhnya benar-benar dibutuhkan atau ada yang bisa dihilangkan:
- Identity Engine — wajib (Cost Code adalah kunci setiap Estimate Item).
- Classification Engine — wajib (CBS/WBS Node dirujuk tiap Estimate Item).
- Assembly Engine — wajib (method pengerjaan adalah inti perhitungan volume/resource).
- Pricing Engine — wajib (harga adalah komponen langsung total biaya).
- Productivity Engine — **berpotensi tidak langsung** — Estimation Engine sebenarnya tidak memanggil Productivity Engine sendiri, ia menerima produktivitas SUDAH sebagai parameter di dalam hasil Assembly Engine (Assembly Engine yang memanggil Productivity Engine, per `05` § F.3). **Temuan:** baris "Upstream Capability" Estimation Engine di Phase D asli mencantumkan Productivity Engine secara langsung — ini **hidden/redundant dependency** yang seharusnya tidak langsung (transitif lewat Assembly Engine), bukan dependency langsung. **Dikoreksi di § 8 (Freeze Checklist) di bawah.**
- Calculation Engine — wajib (dipanggil langsung untuk kalkulasi ad-hoc di luar yang sudah dibungkus Assembly).
- Risk Engine — wajib (allowance risiko adalah komponen langsung Estimate Version).

**Hasil:** Satu dependency berlebihan ditemukan (Productivity Engine seharusnya transitif lewat Assembly Engine, bukan langsung) — actual direct dependency Estimation Engine adalah **6, bukan 7**. Ini PERBAIKAN terhadap Low Coupling yang sudah diidentifikasi Phase D § G.3 sebagai "sebagian" — dengan koreksi ini, coupling riil sedikit lebih rendah dari yang tercatat sebelumnya.

### 3d. Hidden dependency

**Diperiksa:** Apakah ada capability yang secara implisit bergantung pada capability lain tanpa dicatat di Depends On?

**Ditemukan satu:** Scenario Engine mencantumkan Depends On hanya "Estimation Engine" — tapi Boundary-nya menyebut "perbandingan 7 dimensi (Cost/Duration/Cashflow/Risk/...)". Dimensi **Cashflow** dan **EVM Impact** (dari 7 dimensi Scenario Comparison, [`02`](02-phase-b5-core-cost-engineering-architecture.md) § 12) sebenarnya adalah data yang berasal dari luar CECEP (Cashflow existing Puraloka Suite, EVM existing `kurva-s.ts`) — ini berarti Scenario Engine punya **hidden dependency implisit ke External Integration** (untuk membaca data Cashflow/EVM existing) yang tidak tercatat di Phase D § F.9.

**Dikoreksi di § 8 (Freeze Checklist) di bawah** — Scenario Engine Depends On ditambah: Integration Gateway (External Integration), khusus untuk dimensi Cashflow/EVM Impact pada perbandingan Scenario.

**Verdict Dependency Validation: 🟡 LULUS DENGAN 2 KOREKSI.** Tidak ada circular dependency (satu pasangan yang terlihat siklis diklarifikasi sebagai forward-flow vs feedback-flow pada bidang waktu berbeda — bukan pelanggaran). Ditemukan 1 dependency berlebihan (Estimation Engine → Productivity Engine seharusnya transitif) dan 1 hidden dependency (Scenario Engine → External Integration belum tercatat) — keduanya dikoreksi sebagai bagian Freeze, bukan menunda ke Phase E.

---

## 4. Engine Validation — Review Ulang Penamaan

**Tujuan:** Nama Engine harus timeless — bertahan 10-20 tahun ke depan, bukan cuma masuk akal hari ini.

| Engine | Kenapa Nama Ini Dipilih | Alternatif Dipertimbangkan | Kenapa Alternatif Ditolak | Timeless 10-20 Tahun? |
|---|---|---|---|---|
| **Identity Engine** | Menangkap esensi: menjaga SATU identitas lintas domain | "Reference Engine", "Registry Engine" | "Reference" terlalu pasif (menyiratkan sekadar rujukan statis, bukan penjaga konsistensi aktif); "Registry" terlalu teknis/implementasi-spesifik (menyiratkan struktur data tertentu) | ✅ Ya — konsep "identitas tunggal lintas sistem" tidak terikat teknologi/skala apa pun |
| **Classification Engine** | Menangkap esensi: mengelompokkan biaya & pekerjaan | "CBS Engine", "Structure Engine" | "CBS Engine" terlalu terikat singkatan Indonesia/standar saat ini — kalau standar klasifikasi berubah (mis. adopsi UniFormat penuh), nama jadi usang; "Structure" ambigu (bisa disalahartikan struktur organisasi/bangunan fisik) | ✅ Ya — "classification" adalah konsep universal, tidak terikat CBS versi tertentu |
| **Assembly Engine** | Selaras "jantung CECEP" (Phase B.5), menangkap paket kerja reusable | "AHSP Engine", "Method Engine", "Recipe Engine" | "AHSP Engine" ditolak SEJAK Phase B.5 (AHSP hanya satu jenis Assembly, bukan semuanya — akan menyesatkan begitu Custom Assembly dominan); "Method"/"Recipe" terlalu generik, berisiko tabrakan makna dengan domain lain di luar konstruksi kalau CECEP diperluas | ✅ Ya — "Assembly" sudah standar industri konstruksi/estimasi global (dipakai juga di RSMeans, dsb), bukan istilah lokal yang berisiko usang |
| **Pricing Engine** | Langsung, tidak ambigu — menyediakan harga | "Price Book Engine", "Cost Engine" | "Price Book Engine" terlalu terikat struktur data spesifik (4 Price Book bisa berubah bentuk); "Cost Engine" TERLALU LUAS — akan tabrakan makna dengan keseluruhan CECEP yang memang "Cost Engineering Platform" | ✅ Ya — "Pricing" adalah fungsi bisnis universal, independen dari cara harga disimpan |
| **Productivity Engine** | Langsung selaras Domain Responsibility | "Performance Engine" | "Performance" ambigu — bisa disalahartikan performa SISTEM (kecepatan aplikasi) bukan performa RESOURCE fisik, risiko kebingungan lintas tim engineering vs tim domain | ✅ Ya |
| **Calculation Engine** | Menangkap fungsi generik eksekusi formula | "Formula Engine" (nama domain asal) | Nama domain "Formula Engine" dipertahankan sebagai nama DOMAIN (Phase C.5 § A.7), tapi untuk CAPABILITY dipilih "Calculation" karena lebih luas dari sekadar "menyimpan formula" — capability-nya adalah EKSEKUSI, formula hanyalah salah satu bentuk definisi yang dieksekusi | ✅ Ya — "calculation" tetap relevan bahkan kalau representasi formula masa depan berubah total (mis. dari expression string ke visual node-graph) |
| **Risk Engine** | Ringkas, langsung | "Contingency Engine" | "Contingency" lebih sempit dari "Risk" — Contingency adalah SATU output dari Risk knowledge (cadangan biaya), sementara Risk mencakup lebih luas (Risk Level yang juga dipakai Process Governance sebagai salah satu dari 7 dimensi approval) | ✅ Ya |
| **Estimation Engine** | Nama paling langsung menangkap fungsi inti CECEP | "Estimate Engine" | Dipertimbangkan tapi "Estimation" (bentuk proses) dipilih atas "Estimate" (bentuk hasil/objek) — Engine ini mengelola PROSES penyusunan, bukan objek Estimate itu sendiri (yang justru domain, bukan Engine) — pembedaan tata bahasa ini konsisten dengan Engine lain yang semuanya nama proses/fungsi, bukan nama benda | ✅ Ya |
| **Scenario Engine** | Ringkas, sudah dianalisis Phase D | "Simulation Engine", "Estimate Scenario Engine" | (Sudah dianalisis di Phase D asli — "Simulation" menyiratkan kalkulasi numerik yang bukan tanggung jawabnya) | ✅ Ya |
| **Workflow Engine** | Selaras istilah industri baku (BPM/workflow engine adalah pola arsitektur mapan) | "Approval Engine" | "Approval" terlalu sempit — Workflow Engine berpotensi generik dipakai untuk lifecycle lain di luar approval murni (state machine estimasi, bukan cuma approve/reject) | ✅ Ya — "workflow engine" adalah istilah arsitektur enterprise yang sudah berumur puluhan tahun (BPM systems), terbukti tahan lama |
| **Intelligence Engine** | Selaras "Company Intelligence Loop" (Foundational Principle) | "Knowledge Engine", "Learning Engine" | (Sudah dianalisis detail di Phase D asli — Knowledge terlalu luas, Learning menyembunyikan constraint validasi manusia wajib) | 🟡 **Perlu dipertegas** — lihat catatan di bawah |
| **Retrieval Engine** | Menangkap fungsi pencarian/penyajian | "Search Engine", "Recommendation Engine" | "Search Engine" terlalu terikat konotasi teknologi pencarian generik (mesin pencari web); "Recommendation Engine" terlalu spesifik ke satu mode pemakaian (rekomendasi aktif), padahal capability ini juga mencakup pencarian pasif oleh estimator | ✅ Ya |
| **Integration Gateway** | Sengaja bukan "Engine" — filosofi berbeda (penerjemah pasif, bukan pemilik logika bisnis) | "Integration Engine", "ACL Engine" | Sudah dianalisis di Phase D asli — "Engine" untuk capability ini menyiratkan kepemilikan logika bisnis yang justru dilarang oleh Non-Responsibility-nya sendiri | ✅ Ya — "Gateway" adalah istilah arsitektur integrasi yang sudah mapan (API Gateway, dst), tahan lama secara konseptual |

**Catatan khusus — Intelligence Engine, satu-satunya nama yang perlu dipertegas:** Nama ini SANGAT relevan hari ini (menangkap "Company Intelligence Loop"), tapi ada risiko jangka panjang: kalau 10-20 tahun ke depan istilah "Intelligence" di industri software bergeser makna sepenuhnya menjadi sinonim "AI" (tren yang sudah mulai terlihat sekarang), nama "Intelligence Engine" berisiko disalahartikan sebagai "mesin AI generik" — padahal Non-Responsibility-nya eksplisit BUKAN itu (ia adalah mesin *penangkap pembelajaran terkurasi manusia*, AI hanyalah konsumen hilirnya lewat Retrieval Engine). **Rekomendasi:** nama dipertahankan (karena keterkaitan langsung ke Foundational Principle yang sudah terkunci jauh lebih kuat sebagai alasan dibanding risiko pergeseran makna eksternal), TAPI setiap dokumen yang merujuk Intelligence Engine ke depan (mulai Capability Catalog di § 9) WAJIB menyertakan satu kalimat pembeda eksplisit "bukan AI Engine" untuk mencegah kesalahpahaman — ditambahkan sebagai catatan permanen di Capability Catalog.

**Verdict Engine Validation: ✅ LULUS, dengan 1 catatan permanen (Intelligence Engine perlu pembeda eksplisit "bukan AI Engine" di setiap rujukan ke depan).**

---

## 5. Capability Evolution Validation

**Tujuan:** Memastikan tiap capability tidak mentok pada kebutuhan hari ini — ada jalur evolusi dari v1 dasar sampai AI-Native/Autonomous.

| Capability | v1 (Bootstrap) | v2 (Company-Matured) | v3 (Cross-Project Intelligence) | AI-Native | Autonomous |
|---|---|---|---|---|---|
| **Reference Data Management** | Cost Code manual per proyek, RBS dasar | Registry company-wide terkonsolidasi | Cross-company benchmark (kalau CECEP dipakai multi-entitas) | AI menyarankan Cost Code baru dari deskripsi pekerjaan bebas teks | Auto-resolve Cost Code dari BIM/drawing tanpa input manual |
| **Cost Classification** | CBS manual per proyek | Company CBS Template matang, multi-level | Standar CBS lintas tipe proyek (gedung+sipil+infra) | AI mengklasifikasi item RAB mentah ke CBS Node otomatis | Auto-generate WBS dari jadwal master tanpa input manual |
| **Method & Recipe Engineering** | Bootstrap AHSP Nasional apa adanya | Company AHSP hasil edit manual berulang | Assembly Library lengkap lintas tipe pekerjaan | AI mengusulkan Custom Assembly baru dari pola proyek serupa | Auto-adjust sequence/waste factor dari data lapangan real-time |
| **Pricing Knowledge** | Input manual per proyek | Price Book company ter-versi konsisten | Regional Cost Index aktif (kalau Candidate dikonfirmasi) | AI memprediksi harga masa depan dari tren + confidence level | Auto-fetch harga dari supplier API real-time |
| **Performance Knowledge** | Bootstrap AHSP Nasional (0.5 OH dst) | Company baseline dari beberapa proyek | Produktivitas per kombinasi resource+cuaca+lokasi | AI mendeteksi pola produktivitas dari foto/log lapangan | Auto-update tanpa gate approval untuk kasus confidence sangat tinggi (governance ketat) |
| **Calculation Execution** | Formula dasar manual (volume geometri) | Formula Library company terkurasi | Formula lintas disiplin (struktur+MEP+sipil) | AI mengusulkan formula baru dari pola input-output historis | Formula generation otomatis dari deskripsi natural language |
| **Risk & Contingency Knowledge** | Tidak ada praktik formal (kondisi hari ini, Phase B) | Contingency rate seragam per tipe proyek | Risk Register spesifik per kombinasi lokasi/tipe/musim | AI memprediksi risiko dari pola Variance historis | Auto-adjust contingency real-time dari sinyal risiko eksternal (cuaca, harga komoditas) |
| **Estimate Composition** | Manual per Estimate Item | Estimate Version dengan validasi otomatis | Multi-disiplin terintegrasi (struktur+MEP+finishing satu Estimate) | AI menyusun draft Estimate Item awal dari BOQ mentah | Auto-generate Estimate lengkap dari drawing/BIM tanpa intervensi awal |
| **Scenario Management** | Manual, sedikit Scenario per Project | Perbandingan 7 dimensi rutin | Portfolio-level Scenario comparison lintas Project | AI mengusulkan Scenario alternatif (VE) otomatis | Auto-optimize Scenario terbaik dari constraint yang diberikan |
| **Process Governance** | Approval chain sederhana (Direktur saja) | 7-dimensi konfigurasi matang | Approval chain adaptif berdasar pola historis kepatuhan | AI memprediksi kemungkinan approval ditolak sebelum diajukan | Auto-approve untuk kasus low-risk terverifikasi (dengan audit trail penuh) |
| **Company Intelligence Capture** | Tidak ada praktik formal (kondisi hari ini) | Variance/Root Cause manual terstruktur | Root Cause pattern-matching lintas proyek | AI mengusulkan Root Cause dari pola Variance serupa | Auto-propagate update knowledge untuk kasus confidence sangat tinggi (tetap via governance) |
| **Knowledge Retrieval** | Tidak ada (Candidate, belum Confirmed) | Pencarian keyword sederhana | Similarity search berbasis konteks proyek | Semantic search + ranking relevansi AI | Proaktif menyodorkan lessons learned tanpa diminta saat estimator bekerja |
| **External Integration** | Manual mapping data existing | Sinkronisasi terjadwal | Real-time event bridge dua arah | AI membantu resolusi Cost Code ambigu dari data lama | Auto-reconciliation penuh tanpa intervensi manual |

**Observasi lintas capability:** Pola evolusi konsisten dengan Maturity Model Greenfield Adoption yang sudah dikunci di Phase B (Level 0 Empty → Level 4 AI-Assisted) — tidak ada capability yang jalur evolusinya bertentangan dengan model itu. Satu pola berulang penting: **setiap loncatan ke Autonomous tetap melalui governance** (Process Governance/Configurable Approval Workflow) — konsisten dengan prinsip terkunci "AI tidak boleh langsung belajar, harus ada approval" ([`02`](02-phase-b5-core-cost-engineering-architecture.md) § 10) — evolusi ke arah otonom TIDAK berarti melonggarkan validasi manusia, hanya mempercepat/mempermudahnya.

**Verdict Capability Evolution: ✅ LULUS.** Semua 13 capability punya jalur evolusi jelas sampai AI-Native/Autonomous, tidak ada yang mentok di v1.

---

## 6. Enterprise Readiness Validation

**Tujuan:** Uji tiap capability terhadap 11 skenario enterprise: Multi Company, Multi Branch, Multi Country, Multi Currency, Multi Tax, Multi Language, Multi Engineering Standard, Offline, Cloud, On Premise, Hybrid.

| Capability | Multi Company | Multi Branch | Multi Country | Multi Currency | Multi Tax | Multi Language | Multi Eng. Standard | Offline | Cloud/On-Prem/Hybrid |
|---|---|---|---|---|---|---|---|---|---|
| Identity Engine | ✅ Registry company-scoped by design | ✅ Sama, branch = sub-scope company | 🟡 Perlu namespace tambahan per negara (belum eksplisit) | N/A (bukan domain harga) | N/A | 🟡 Label Cost Code perlu multi-bahasa (belum dirancang) | ✅ Sudah dirancang menampung Bina Marga+Cipta Karya sekaligus (`01` §0) | ✅ Reference data statis, cocok offline-first | ✅ Tidak terikat lokasi deployment |
| Classification Engine | ✅ Company CBS Template per company | ✅ | 🟡 Standar CBS bisa beda per negara — perlu strategi multi-standar (belum eksplisit) | N/A | N/A | 🟡 Sama seperti Identity Engine | ✅ Sudah dirancang menampung multi-referensi | ✅ | ✅ |
| Assembly Engine | ✅ Company AHSP per company | ✅ | 🟡 AHSP Nasional beda per negara — bootstrap perlu strategi per-negara (belum eksplisit) | N/A | N/A | 🟡 | ✅ Sudah dirancang inti (Assembly = superset AHSP manapun) | 🟡 Bootstrap butuh koneksi awal, operasional selanjutnya offline-capable | ✅ |
| Pricing Engine | ✅ Price Book per company | ✅ | ✅ Atribut `Currency` sudah eksplisit di struktur wajib (`02` § 4) — **paling siap dari semua capability** | ✅ Sudah eksplisit dirancang sejak Phase B.5 | N/A (pajak bukan bagian Price Book) | N/A | N/A | 🟡 Butuh cache harga terakhir utk offline | ✅ |
| Productivity Engine | ✅ | ✅ | 🟡 Produktivitas dipengaruhi budaya kerja/iklim per negara — belum ada mekanisme eksplisit menampung ini (kandidat perluasan Regional Cost Index-like) | N/A | N/A | N/A | N/A | ✅ | ✅ |
| Calculation Engine | ✅ Formula generik, tidak terikat company | ✅ | ✅ Formula matematis universal | ✅ (formula bisa memuat konversi currency via Unit Conversion) | 🟡 Formula pajak per negara BELUM eksplisit (lihat Rejected Domain Currency FX, `03b` §C.4 — pola serupa berlaku untuk pajak, belum dianalisis) | N/A | ✅ | ✅ Eksekusi lokal, tidak butuh koneksi | ✅ |
| Risk Engine | ✅ | ✅ | 🟡 Profil risiko beda per negara (regulasi, iklim, politik) — belum eksplisit | N/A | N/A | N/A | N/A | ✅ | ✅ |
| Estimation Engine | ✅ | ✅ | ✅ (mewarisi kesiapan upstream-nya) | ✅ (mewarisi Pricing Engine) | 🟡 Sama seperti Calculation Engine | 🟡 UI/label perlu i18n (di luar cakupan Capability Architecture, ini Phase F/UI) | ✅ | 🟡 Bergantung ketersediaan offline seluruh upstream | ✅ |
| Scenario Engine | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | ✅ | 🟡 | ✅ |
| Workflow Engine | ✅ 7-dimensi sudah termasuk "Company" & "Branch" eksplisit (`02` § 10) — **paling siap kedua** | ✅ | ✅ (dimensi Company/Branch sudah cukup fleksibel menampung struktur negara sbg sub-level) | N/A | N/A | 🟡 | N/A | 🟡 Approval butuh identitas approver terverifikasi, riskan offline murni | ✅ |
| Intelligence Engine | ✅ Lessons Learned company-scoped | ✅ | ✅ (mewarisi struktur Company/Branch) | N/A | N/A | 🟡 | N/A | 🟡 Butuh sinkronisasi Actual Cost, sulit murni offline | ✅ |
| Retrieval Engine | ✅ | ✅ | 🟡 Relevansi lintas negara perlu logika tambahan (jangan campur pola Indonesia dengan negara lain secara naif) | N/A | N/A | 🟡 | N/A | 🟡 | ✅ |
| Integration Gateway | ✅ Per company, mapping terpisah | ✅ | 🟡 Mapping ke sistem eksternal per negara belum dianalisis (baru relevan kalau ekspansi terjadi) | N/A | N/A | N/A | ✅ (salah satu fungsi utamanya) | N/A (murni gateway, tidak deploy offline) | ✅ |

**Ringkasan kesiapan (skala ✅ siap / 🟡 perlu perluasan / ⛔ tidak siap):**

| Skenario | Status Umum | Catatan |
|---|---|---|
| Multi Company | ✅ Siap penuh | Semua capability company-scoped by design sejak Phase B.5 |
| Multi Branch | ✅ Siap penuh | Sama seperti Company — Workflow Engine eksplisit mendukung ini |
| Multi Country | 🟡 Sebagian | Paling banyak tanda 🟡 — Identity/Classification/Assembly/Productivity/Risk/Retrieval/Integration semuanya perlu perluasan eksplisit untuk lintas negara. **Tidak ⛔ karena tidak ada yang secara struktural MELARANG ekspansi ini** — hanya belum dirancang detail, karena Puraloka Persada hari ini beroperasi domestik (Phase B) |
| Multi Currency | ✅ Siap penuh | Sudah dirancang eksplisit sejak Phase B.5 (atribut Currency di Price Book) — capability yang PALING siap |
| Multi Tax | 🟡 Perlu perluasan | Belum ada domain/capability eksplisit untuk pajak lintas negara — pola serupa Currency FX (`03b` § C.4) kemungkinan bisa direplikasi (pajak = kasus khusus Formula/Calculation Execution), tapi belum dianalisis eksplisit |
| Multi Language | 🟡 Perlu perluasan | Konsisten di banyak capability — TAPI ini secara sengaja diluar cakupan Capability Architecture (i18n adalah concern UI/Presentation Layer, bukan capability domain) |
| Multi Engineering Standard | ✅ Siap penuh | Sudah jadi requirement inti sejak Phase A (Puraloka Persada sudah pakai Bina Marga+Cipta Karya) — capability yang dirancang KHUSUS untuk ini sejak awal |
| Offline | 🟡 Sebagian | Reference/Knowledge Layer (Layer 1-3) umumnya offline-capable; Layer 4-5 (Estimation Orchestration, Governance) butuh identitas/approval yang riskan offline murni — perlu strategi sync eksplisit di Phase F |
| Cloud / On-Premise / Hybrid | ✅ Siap penuh | Tidak ada satu pun capability yang terikat model deployment tertentu — konsisten dengan Boundary yang murni behavioral (§ Architecture Quality Review Replaceability, `05` § G.8) |

**Verdict Enterprise Readiness: 🟡 LULUS DENGAN CATATAN.** Dua skenario (Multi Currency, Multi Engineering Standard) sudah SANGAT siap. Satu skenario (Multi Company/Branch) siap penuh by design. Tiga skenario (Multi Country, Multi Tax, Offline) butuh perluasan eksplisit — TAPI tidak ada satu pun yang TIDAK SIAP secara struktural (tidak ada ⛔) — semuanya adalah perluasan alami dari fondasi yang sudah ada, bukan perombakan. Multi Language sengaja di luar cakupan (concern layer UI, bukan Capability Architecture).

---

## 7. AI Readiness Validation

**Tujuan:** Untuk tiap capability, jelaskan data yang dihasilkan, data yang dikonsumsi AI, data yang dilatih AI, explainability, auditability.

| Capability | Data Dihasilkan | Dikonsumsi AI | Dilatih AI | Explainability | Auditability |
|---|---|---|---|---|---|
| Identity Engine | Cost Code/Resource aktif | Konteks identitas untuk semua prediksi AI hilir | Pola penamaan/kategori Cost Code baru | ✅ Setiap Cost Code punya riwayat siapa membuat | ✅ `CostCodeActivated`/`Deprecated` event |
| Classification Engine | CBS/WBS Node | Konteks kategori untuk klasifikasi otomatis | Pola pengelompokan pekerjaan→kategori | ✅ Riwayat revisi terlacak | ✅ `CompanyCbsTemplateRevised` event |
| Assembly Engine | Assembly siap pakai + resource breakdown | Pola resource/sequence untuk usulan Custom Assembly | Kombinasi resource+hasil aktual dari Variance | ✅ Assembly menjelaskan breakdown sampai resource individual | ✅ `AssemblyActivated`/`CompanyAhspRevised` event |
| Pricing Engine | Price Book Entry + confidence level | Tren harga historis | Pola harga vs waktu/lokasi/supplier | ✅ Setiap harga py jejak sumber (`Verified By`) | ✅ `PriceBookEntryVerified`/`Expired` event |
| Productivity Engine | Productivity Record + confidence | Pola produktivitas aktual vs baseline | Data durasi aktual÷volume dari proyek selesai | ✅ Formula perhitungan produktivitas transparan | ✅ `ProductivityRecordUpdatedFromVariance` event |
| Calculation Engine | Hasil kalkulasi formula | Pola input-variable→output untuk usulan formula baru | Riwayat eksekusi formula vs hasil aktual | ✅ Formula = expression eksplisit, bukan black box | ✅ `FormulaActivated` event |
| Risk Engine | Risk Allowance/Contingency Rate | Pola Variance untuk prediksi risiko | Data Variance historis per kombinasi risiko | ✅ Basis rekomendasi risiko bisa ditelusuri ke Variance asal | 🟡 Belum ada Domain Event eksplisit tercatat (karena domain masih Candidate) |
| Estimation Engine | Estimate Item, status Estimate Version | Draft Estimate Item awal dari BOQ mentah (v4 evolution) | Pola penyusunan Estimate dari estimator berpengalaman | ✅ Setiap Estimate Item bisa ditelusuri mundur penuh (Cost Code→Assembly→Price→Productivity) | ✅ `EstimateVersionApproved`/`Frozen`/`Superseded` event |
| Scenario Engine | Scenario ter-versi, hasil komparasi | Pola pemilihan Scenario terbaik (VE) | Data historis Scenario mana yang akhirnya dipakai/berhasil | ✅ Perbandingan 7 dimensi eksplisit angka, bukan skor tersembunyi | ✅ `ScenarioBranched`/`Archived` event |
| Workflow Engine | Status approval, audit trail | Prediksi kemungkinan approval ditolak | Pola historis approve/reject per konteks | ✅ 7 dimensi konfigurasi eksplisit, keputusan bisa ditelusuri kriterianya | ✅ `ApprovalRequested`/`Granted`/`Rejected` event — audit trail adalah Core Responsibility intinya |
| Intelligence Engine | Variance, Root Cause, Lessons Learned | **Sumber data latih utama untuk SEMUA AI di capability lain** — ini node paling penting untuk AI Readiness keseluruhan sistem | Root Cause pattern-matching lintas proyek | ✅ Root Cause WAJIB melalui validasi manusia sebelum jadi data (constraint terkunci) | ✅ `VarianceCalculated`/`RootCauseIdentified`/`LessonsLearnedApproved`/`Propagated` — rantai event terlengkap di seluruh sistem |
| Retrieval Engine | Hasil pencarian + ranking relevansi | **Ini SENDIRI adalah antarmuka konsumsi AI** — capability yang paling langsung "AI-facing" | Pola query→hasil relevan yang dipilih user (implicit feedback) | 🟡 Ranking relevansi AI berisiko jadi black box kalau tidak dirancang hati-hati — perlu constraint eksplisit di Phase E/F | 🟡 Belum ada Domain Event tercatat (domain masih Candidate) |
| Integration Gateway | Data ternormalisasi dari sumber eksternal | Data mentah historis (Actual Cost) sebelum masuk Intelligence Engine | Tidak dilatih AI langsung — murni penerjemah pasif | ✅ Non-Responsibility eksplisit "tanpa keputusan sendiri" — paling transparan karena memang tidak py logika tersembunyi | 🟡 Belum ada Domain Event eksplisit tercatat di Phase D |

**Temuan penting — rantai AI Readiness end-to-end:** Divisualisasikan sebagai satu alur: **Integration Gateway (data mentah) → Intelligence Engine (kurasi+validasi manusia) → Retrieval Engine (penyajian) → seluruh capability lain (konsumsi rekomendasi)**. Ini PERSIS mengikuti Company Intelligence Loop yang sudah terkunci sejak Phase B — AI Readiness bukan lapisan tambahan terpisah, ia adalah manifestasi natural dari arsitektur yang sudah dibangun sejak awal.

**Gap yang ditemukan:** Retrieval Engine — sebagai capability paling "AI-facing" — justru capability dengan risiko explainability PALING RENDAH (ranking relevansi AI berpotensi black box). Ini kontradiksi halus yang perlu ditandai: capability yang paling penting untuk AI adalah yang paling perlu constraint explainability EKSTRA, bukan lebih longgar.

**Verdict AI Readiness: 🟡 LULUS DENGAN CATATAN.** Sebelas dari 13 capability punya jejak data+explainability+auditability yang jelas. Dua (Risk Engine, Retrieval Engine) belum punya Domain Event tercatat karena domainnya masih Candidate — konsisten dengan gap yang sudah diketahui (Phase D § G.11). Satu rekomendasi baru: Retrieval Engine butuh constraint explainability eksplisit untuk ranking-nya sendiri, ditambahkan sebagai catatan Freeze Checklist.

---

## 8. Capability Constitution Compliance

**Tujuan:** Validasi seluruh capability terhadap [`04-architecture-constitution.md`](04-architecture-constitution.md) — 4 Foundational Principles, 10 Prinsip Final, 6 Architectural Constraints, 4 First Principles, 10 Architectural Invariants.

| Prinsip Constitution | Diperiksa Terhadap | Hasil |
|---|---|---|
| **Foundational Principle 1** (Company Intelligence Loop) | Intelligence Engine, Retrieval Engine, seluruh Domain Event chain | ✅ Patuh — rantai lengkap Estimate→Execution→Variance→Lessons Learned→Update Knowledge sepenuhnya terwakili di Capability Map |
| **Foundational Principle 2** (Company Knowledge System) | Seluruh Layer 3 (Assembly/Pricing/Productivity/Calculation/Risk Engine) | ✅ Patuh — kelima Engine dirancang sebagai knowledge asset ter-versi, bukan sekadar kalkulator |
| **Foundational Principle 3** (Everything is Versioned) | Semua Engine yang publish event revisi (`...Revised`, `...Verified`, dst) | ✅ Patuh — diverifikasi di Phase D § G.12 (Versionability), dikonfirmasi ulang di sini: tidak ada Engine yang menyimpan knowledge tanpa versioning |
| **Foundational Principle 4** (Everything is Derived) | Estimation Engine, Downstream Read-Model (RAB/RAP/Budget/dst) | ✅ Patuh — RAB/RAP/Budget eksplisit BUKAN capability tersendiri (Rejected Domain C.1/C.2, `03b`), murni derived dari Estimation Engine |
| **10 Prinsip Final #4** (Decision Engine bukan Calculator) | Calculation Engine | ✅ Patuh — Boundary eksplisit "eksekusi ekspresi", dipanggil sebagai bagian alur Validation→Simulation→Comparison→Recommendation yang lebih besar (Estimation Engine), bukan kalkulator berdiri sendiri |
| **10 Prinsip Final #5** (No duplicate source of truth) | Reference Data Management vs Rejected Domain (Vendor Master Data, `03b` §C.3) | ✅ Patuh — Identity Engine tidak menduplikasi Supplier data existing Procurement, hanya mereferensikan via Integration Gateway |
| **10 Prinsip Final #6** (Calculation Strategy plug-in) | Calculation Engine | ✅ Patuh secara struktural — Boundary memungkinkan formula diganti tanpa mengubah capability lain; **validasi PENUH baru bisa dilakukan di Phase E** (Calculation Strategy adalah subjek fase itu sendiri) — dicatat sebagai pending-Phase E, bukan gagal di sini |
| **10 Prinsip Final #10** (Engine over Module) | Seluruh 13 Engine | ✅ Patuh — seluruh proses derivasi § A-E Phase D secara eksplisit menerapkan prinsip ini sebagai kriteria utama |
| **6 Architectural Constraints #1** (Explainability) | Seluruh capability | ✅ Patuh — diverifikasi Phase D § G.10, dikonfirmasi ulang lewat § 7 AI Readiness Validation di atas |
| **6 Architectural Constraints #4/#5** (No Data Duplication) | Pricing Knowledge, Reference Data Management | ✅ Patuh — Non-Responsibility eksplisit menegaskan referensi bukan salinan di setiap Engine relevan |
| **First Principle 1** (Knowledge First-Class Citizen) | Intelligence Engine, Retrieval Engine | ✅ Patuh — keduanya dirancang khusus mewujudkan prinsip ini sebagai capability berdiri |
| **First Principle 2** (Per-Domain bukan Per-Module) | Seluruh proses derivasi § A Phase D | ✅ Patuh — Capability diturunkan dari Domain (bukan dari fitur/UI), metodologi ini sendiri adalah penerapan First Principle 2 |
| **First Principle 3** (Learning as Input) | Intelligence Engine → Layer 3 propagation | ✅ Patuh — `LessonsLearnedPropagated` event secara eksplisit menulis balik ke Assembly/Pricing/Productivity |
| **First Principle 4** (Behavior as Configured Data) | Calculation Engine, Workflow Engine | ✅ Patuh — keduanya eksplisit dirancang sebagai eksekutor definisi/konfigurasi, bukan pemilik logika hardcoded |
| **Architectural Invariant — Traceability** | Estimation Engine | ✅ Patuh — dikonfirmasi ulang lewat § 7 (setiap Estimate Item bisa ditelusuri mundur penuh) |
| **Architectural Invariant — Auditability** | Workflow Engine | ✅ Patuh — Core Responsibility intinya secara eksplisit adalah audit trail |

**Pelanggaran ditemukan:** **Tidak ada.** Satu prinsip (Calculation Strategy plug-in) baru bisa divalidasi PENUH di Phase E karena memang itu subjek fase tersebut — dicatat sebagai validasi tertunda yang terjadwal, bukan pelanggaran yang dibiarkan.

**Verdict Constitution Compliance: ✅ LULUS PENUH.** Tidak ada capability yang melanggar prinsip constitutional manapun.

---

## 9. Freeze Checklist

| Item | Status | Catatan |
|---|---|---|
| ✅ Capability Complete | **LULUS** | 13 Capability mencakup seluruh 15 Confirmed/Supporting Domain + 4 Candidate Domain (§ 1) |
| ✅ Ownership Complete | **LULUS** | Setiap Capability py Owner Domain jelas, 1 pengecualian sah dijelaskan (External Integration, § 1b) |
| 🟡 → ✅ Dependency Complete | **LULUS SETELAH 2 KOREKSI** | (a) Estimation Engine→Productivity Engine diubah dari direct ke transitif-via-Assembly-Engine; (b) Scenario Engine ditambah Depends On: Integration Gateway (untuk dimensi Cashflow/EVM). Kedua koreksi diterapkan sebagai bagian Freeze — lihat § 3 |
| ✅ Boundary Complete | **LULUS** | Tidak ada overlap responsibility tanpa penjelasan; 1 titik ambigu (External Integration↔Reference Data Management bootstrap) diklarifikasi sebagai pipeline dua-langkah, bukan overlap (§ 2) |
| ✅ Naming Locked | **LULUS** | 13 nama Engine dikonfirmasi ulang timeless untuk 10-20 tahun; 1 catatan permanen (Intelligence Engine butuh pembeda eksplisit "bukan AI Engine" di rujukan ke depan) — dicatat di Capability Catalog § 10 |
| 🟡 AI Ready | **LULUS DENGAN CATATAN** | 11/13 capability punya jejak AI Readiness penuh; Risk Engine & Retrieval Engine masih terbatas Domain Event (karena Candidate); Retrieval Engine butuh constraint explainability tambahan untuk ranking-nya sendiri — dicatat sebagai rekomendasi Phase E/F, tidak memblokir Freeze |
| ✅ Constitution Compliant | **LULUS PENUH** | Tidak ada pelanggaran; 1 prinsip (Calculation Strategy plug-in) validasi penuhnya terjadwal di Phase E sendiri |

**Item tambahan yang divalidasi (di luar 7 checklist asli, tapi relevan untuk kelengkapan freeze):**

| Item | Status | Catatan |
|---|---|---|
| Capability Coverage | ✅ LULUS | § 1 |
| Capability Evolution | ✅ LULUS | § 5 — semua capability punya jalur v1→Autonomous |
| Enterprise Readiness | 🟡 LULUS DENGAN CATATAN | § 6 — Multi Country/Tax/Offline butuh perluasan (bukan perombakan) saat relevan; Multi Language sengaja di luar cakupan |

---

## 🔒 CAPABILITY FREEZE

Berdasarkan seluruh validasi § 1-9 di atas, **Capability Architecture (Phase D) dinyatakan FREEZE** dengan tiga koreksi konkret diterapkan:

1. **Dependency Estimation Engine**: Productivity Engine dipindah dari direct dependency menjadi transitif (via Assembly Engine) — direct dependency Estimation Engine menjadi **6** (Identity, Classification, Assembly, Pricing, Calculation, Risk Engine), bukan 7.
2. **Dependency Scenario Engine**: ditambah **Integration Gateway** sebagai Depends On, khusus untuk dimensi Cashflow/EVM Impact pada Scenario Comparison.
3. **Boundary klarifikasi**: External Integration ↔ Reference Data Management pada bootstrap Reference Library dipertegas sebagai pipeline dua-langkah (translate → register), bukan overlap tanggung jawab.

Catatan tambahan yang TIDAK mengubah struktur (dicatat sebagai rekomendasi untuk fase mendatang, bukan blocker):
- Intelligence Engine butuh pembeda eksplisit "bukan AI Engine" di setiap rujukan ke depan.
- Retrieval Engine butuh constraint explainability tambahan untuk mekanisme ranking-nya sendiri (Phase E/F).
- Multi Country/Multi Tax/Offline readiness perlu perluasan eksplisit kalau/ketika relevan secara bisnis (tidak mendesak sekarang, Puraloka Persada masih domestik).

**Artinya bagi Phase E dan seterusnya:** Phase E (Calculation Strategy) fokus PENUH pada bagaimana sistem menghitung — Capability, Boundary, Dependency, Ownership, Naming sudah final. Phase E tidak perlu membuka kembali pertanyaan "siapa bertanggung jawab menghitung" karena itu sudah dijawab tuntas di sini.

---

## 10. Capability Catalog — Referensi Resmi Sepanjang Proyek

**Tujuan:** Mulai Phase E sampai Phase L, seluruh dokumen merujuk ID di bawah ini, bukan mengulang deskripsi lengkap tiap capability — menjaga konsistensi dan mengurangi risiko drift dokumentasi seiring proyek berkembang.

| ID | Nama Capability | Engine | Layer | Owner Domain | Status |
|---|---|---|---|---|---|
| **CAP-001** | Reference Data Management | Identity Engine | Layer 1 — Foundation & Identity | Cost Code, RBS, Unit Conversion, Reference Library🟡 | 🔒 Frozen |
| **CAP-002** | Cost Classification | Classification Engine | Layer 2 — Classification | CBS, WBS, CBS Revision History | 🔒 Frozen |
| **CAP-003** | Method & Recipe Engineering | Assembly Engine | Layer 3 — Cost Knowledge | Assembly/AHSP, Company AHSP | 🔒 Frozen |
| **CAP-004** | Pricing Knowledge | Pricing Engine | Layer 3 — Cost Knowledge | Versioned Price Book, Regional Cost Index🟡 | 🔒 Frozen |
| **CAP-005** | Performance Knowledge | Productivity Engine | Layer 3 — Cost Knowledge | Productivity Library | 🔒 Frozen |
| **CAP-006** | Calculation Execution | Calculation Engine | Layer 3 — Cost Knowledge | Formula Engine (domain) | 🔒 Frozen* (*Calculation Strategy compliance divalidasi penuh di Phase E) |
| **CAP-007** | Risk & Contingency Knowledge | Risk Engine | Layer 3 — Cost Knowledge | Contingency & Risk Register🟡 | 🔒 Frozen (kerangka; domain masih Candidate) |
| **CAP-008** | Estimate Composition | Estimation Engine | Layer 4 — Estimation Orchestration | Estimate Item, Estimate Version | 🔒 Frozen |
| **CAP-009** | Scenario Management | Scenario Engine | Layer 4 — Estimation Orchestration | Scenario | 🔒 Frozen |
| **CAP-010** | Process Governance | Workflow Engine | Layer 5 — Intelligence & Governance | Configurable Approval Workflow | 🔒 Frozen |
| **CAP-011** | Company Intelligence Capture | Intelligence Engine ⚠️*bukan AI Engine* | Layer 5 — Intelligence & Governance | Lessons Learned/Variance/Root Cause | 🔒 Frozen |
| **CAP-012** | Knowledge Retrieval | Retrieval Engine | Layer 5 — Intelligence & Governance | Knowledge Asset Index🟡 | 🔒 Frozen (kerangka; domain masih Candidate; butuh explainability tambahan) |
| **CAP-013** | External Integration | Integration Gateway | Layer 5 — Intelligence & Governance | *(pola ACL, bukan domain data)* | 🔒 Frozen |

**Format rujukan untuk dokumen Phase E-L:** `CAP-XXX (Nama Capability, Engine Name)` — mis. *"Kalkulasi ini dieksekusi oleh CAP-006 (Calculation Execution, Calculation Engine)"* — deskripsi lengkap (Purpose/Boundary/Dependency/dst) TIDAK diulang, cukup rujuk balik ke [`05`](05-phase-d-capability-architecture.md) § F dan dokumen ini.

**Field per entri Catalog (untuk ekspansi ke depan kalau ada CAP baru):** ID, Nama Capability, Engine, Layer, Owner Domain, Input (lihat `05` § F "Required Input"), Output (lihat `05` § F "Produced Output"), Dependency (lihat § 3 dokumen ini untuk versi terkoreksi), Status.

---

## Assumptions

1. Klarifikasi "dua bidang waktu berbeda" (§ 3a, forward-flow vs feedback-flow) adalah interpretasi yang dibangun untuk MENJELASKAN pola yang sudah ada di Phase D, bukan perubahan struktural — kalau founder menilai pembedaan ini tidak cukup kuat, pasangan Estimation Engine↔Company Intelligence Capture perlu didesain ulang sebagai dua Aggregate yang benar-benar terpisah temporal (mis. lewat snapshot eksplisit), bukan cukup dijelaskan naratif.
2. Capability Catalog (§ 10) memakai penomoran CAP-001 sampai CAP-013 berurutan sesuai Layer (1→5) — kalau ada capability baru dikonfirmasi di fase mendatang (mis. Risk Register/Knowledge Asset Index naik status jadi Confirmed penuh), ID tetap dipertahankan (CAP-007, CAP-012) bukan diberi nomor baru, supaya rujukan di dokumen Phase E dst tidak perlu direvisi.

## Open Questions

1. Untuk Estimation Engine (6 dependency setelah koreksi) — apakah founder ingin kontrak interface seragam untuk keenamnya dirancang SEKARANG sebagai bagian penutup Phase D.1, atau tetap ditunda ke Phase E/F seperti rekomendasi asli Phase D § G.3?
2. Untuk Multi Country/Multi Tax readiness (§ 6, status 🟡) — apakah ini perlu dijadwalkan sebagai pekerjaan eksplisit di salah satu fase mendatang (kemungkinan Phase J — Future Vision), atau cukup dicatat sebagai potensi tanpa jadwal pasti?

## Required Decisions (Approval Gate)

1. Apakah kesembilan validasi (§ 1-9) sudah cukup ketat sebagai validation gate, atau ada pemeriksaan yang terasa kurang dalam?
2. Apakah 3 koreksi konkret (§ 🔒 Freeze) sudah tepat, atau ada koreksi lain yang founder lihat perlu ditambahkan sebelum freeze?
3. Apakah Capability Catalog (§ 10) dengan 13 ID (CAP-001 s.d. CAP-013) sudah siap jadi referensi resmi Phase E-L?
4. Apakah Phase D.1 sekarang siap ditutup, Capability Architecture di-FREEZE, dan lanjut ke **Phase E (Calculation Strategy)**?

---

## 🚦 APPROVAL GATE

Phase D.1 (Capability Validation & Freeze) selesai — 9 validasi dijalankan, 3 koreksi konkret diterapkan, Capability Catalog dengan 13 ID resmi diterbitkan. **STOP** — menunggu approval eksplisit sebelum Capability Freeze final dan lanjut ke **Phase E (Calculation Strategy)**.

*Dokumen selanjutnya (setelah approval): Phase E — Calculation Strategy.*
