# CECEP — Orchestration Readiness Assessment

> ⚠️ **SUPERSEDED — DUA ALASAN.** (1) Seluruh isi terikat Capability Catalog CAP-001 s.d. CAP-013 yang sudah digantikan [`35-phase3-capability-architecture.md`](35-phase3-capability-architecture.md). (2) Topik "Orchestration" itu sendiri sudah dipindah ke Enterprise Architecture Framework via [`31-adr-cecep-framework-separation.md`](31-adr-cecep-framework-separation.md) — bukan lagi bagian roadmap CECEP (lihat Fase 9 "Automation Architecture", `32`, sebagai penggantinya yang sempit-by-design). JANGAN dipakai sebagai evidence untuk apa pun. Dipertahankan sebagai jejak historis proses.

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Gerbang singkat SETELAH Phase F.1, SEBELUM Phase G — **BUKAN phase baru, BUKAN Phase G itu sendiri**. Berbeda karakter dari C.5/D.1/E.1/F.1 (yang masing-masing memvalidasi SATU lapisan secara internal) — assessment ini menguji **interoperabilitas** ketiga lapisan yang sudah frozen (Capability/D, Calculation/E, Information/F) SECARA BERSAMA, karena orkestrasi adalah aktivitas PERTAMA yang menghubungkan ketiganya sekaligus dalam satu alur.
**Tujuan (instruksi eksplisit founder, verbatim disiplinnya dipegang ketat):** *"Buktikan bahwa seluruh hasil freeze Phase D, E, dan F sudah cukup untuk membangun orchestration tanpa memperkenalkan capability, calculation strategy, atau information contract baru. Jika masih ada dependency yang belum dapat diorkestrasi, identifikasi sebagai gap terlebih dahulu, bukan langsung mendesain solusi."* — dokumen ini TIDAK mendesain satu pun elemen Phase G (tidak ada Workflow Engine config, tidak ada Domain Event baru, tidak ada urutan orkestrasi final). Setiap kali analisis tergoda mendesain solusi, ia dihentikan dan dicatat sebagai **Gap**, bukan diselesaikan di sini.
**Rujukan:** [`05b`](05b-phase-d1-capability-validation-freeze.md) § 10 (Capability Catalog, CAP-001 s.d. CAP-013), [`06b`](06b-phase-e1-calculation-validation-freeze.md) (Calculation Freeze), [`07b`](07b-phase-f1-information-validation-freeze.md) (Information Freeze, sebelas elemen Canonical Information Contract).

---

## Metodologi

Founder sendiri sudah memberi contoh konkret alur orkestrasi (Round 15): *"Estimate dibuat → Calculation otomatis → Material Requirement → Procurement → Cashflow → Risk → Approval → Lessons Learned."* Alur ini dipakai sebagai **jalur uji utama** — setiap langkah ditelusuri terhadap tiga pertanyaan:

1. **Capability Readiness** — apakah CAP-XXX yang terlibat di langkah ini sudah punya kontrak jelas (Dependency Matrix, [`05`](05-phase-d-capability-architecture.md) § F) untuk DIPANGGIL dari luar dirinya sendiri (bukan cuma dipanggil dari dalam pipeline internal capability lain yang sudah dianalisis Phase D)?
2. **Calculation Readiness** — kalau langkah ini melibatkan angka, apakah jalurnya ke CAP-006 sudah jelas (Konstitusi Calculation Strategy, [`06`](06-phase-e-calculation-strategy.md) § pembuka poin 6)?
3. **Information Readiness** — apakah data yang mengalir di langkah ini punya Canonical Information Contract (§ C Phase F, sebelas elemen) yang SUDAH cukup untuk dikonsumsi lintas-capability, atau orkestrasi akan terpaksa "menebak" struktur?

Kalau salah satu dari tiga pertanyaan ini TIDAK bisa dijawab tegas dari dokumen yang sudah frozen, itu dicatat sebagai **Gap** — bukan diperbaiki di sini.

---

## A. Penelusuran Jalur Uji Utama (Contoh Founder)

### A.1 Estimate Dibuat

| Pertanyaan | Jawaban |
|---|---|
| Capability Readiness | ✅ **CAP-008** (Estimation Engine) — Dependency Matrix lengkap ([`05`](05-phase-d-capability-architecture.md) § F.8), enam upstream terkoreksi Phase D.1 |
| Calculation Readiness | ✅ CAP-008 memanggil CAP-006 lewat kontrak delapan-elemen ([`06`](06-phase-e-calculation-strategy.md) § H) |
| Information Readiness | ✅ Estimate Version Contract sudah diisi penuh sebelas elemen ([`07`](07-phase-f-enterprise-data-model.md) § C.2) |
| **Trigger orkestrasi keluar** | `EstimateVersionApproved` ([`05`](05-phase-d-capability-architecture.md) § F) |

**Verdict langkah ini: SIAP.**

### A.2 Calculation Otomatis

| Pertanyaan | Jawaban |
|---|---|
| Capability Readiness | ✅ CAP-006, kontrak delapan-elemen sudah menjadi standar untuk SEMUA pemanggil ([`06`](06-phase-e-calculation-strategy.md) § H) |
| Calculation Readiness | ✅ Ini CAP-006 itu sendiri — Execution Pipeline delapan-tahap ([`06`](06-phase-e-calculation-strategy.md) § C.1) sudah lengkap |
| Information Readiness | ✅ Explanation Tree Contract (Computed Data) sudah diklasifikasi ([`07`](07-phase-f-enterprise-data-model.md) § A) |
| **Trigger orkestrasi keluar** | Bukan Domain Event tunggal — hasil kalkulasi MENJADI BAGIAN Estimate Item, dikonsumsi bersamaan dengan `EstimateVersionApproved` |

**Verdict langkah ini: SIAP.**

### A.3 Material Requirement

**Ini titik pertama yang menyentuh WILAYAH DI LUAR 13 CAP yang sudah dipetakan.** Material Requirement adalah entity EXISTING di Puraloka Suite (Procurement, Phase A: `material_requests`), BUKAN salah satu dari CAP-001 s.d. CAP-013.

| Pertanyaan | Jawaban |
|---|---|
| Capability Readiness | 🔴 **GAP-1**: Tidak ada CAP-XXX yang secara eksplisit memiliki tanggung jawab "menerjemahkan Estimate Item yang Approved menjadi Material Requirement". CAP-013 (Integration Gateway) adalah kandidat PALING dekat (perannya "menerjemahkan data existing Puraloka Suite ↔ domain CECEP", [`05b`](05b-phase-d1-capability-validation-freeze.md) § 10) — TAPI Boundary CAP-013 yang sudah frozen ([`05`](05-phase-d-capability-architecture.md) § F.13) secara eksplisit HANYA mencakup DUA Anti-Corruption Layer yang teridentifikasi Phase C.5 (Actual Cost↔Lessons Learned, Reference Library↔Assembly/CBS) — **arah "Estimate Item → Material Requirement" TIDAK ADA dalam kedua ACL yang sudah dianalisis.** |
| Calculation Readiness | N/A — langkah ini bukan kalkulasi, ia transformasi data |
| Information Readiness | 🔴 **GAP-1 (lanjutan)**: Karena tidak ada Owner Capability yang jelas, TIDAK ADA Canonical Information Contract untuk "Material Requirement dari Estimate" — Phase F § C tidak pernah menganalisis kelompok informasi ini (di luar cakupan, karena Material Requirement bukan bagian 13 Confirmed/Candidate Domain Phase C.5) |

**Verdict langkah ini: 🔴 GAP DITEMUKAN — dicatat sebagai GAP-1, TIDAK didesain solusinya di sini.**

### A.4 Procurement

| Pertanyaan | Jawaban |
|---|---|
| Capability Readiness | 🔴 **Sama seperti GAP-1** — Procurement adalah modul existing Puraloka Suite (`purchase_orders`, dst, Phase A), bukan salah satu 13 CAP. Tidak ada Owner Capability CECEP untuk orkestrasi KE Procurement |
| Calculation Readiness | N/A |
| Information Readiness | 🔴 Sama — belum ada Contract |

**Verdict langkah ini: Bagian dari GAP-1 yang sama (Material Requirement→Procurement adalah satu rantai integrasi, bukan dua gap terpisah).**

### A.5 Cashflow

| Pertanyaan | Jawaban |
|---|---|
| Capability Readiness | 🟡 **Sudah dianalisis SEBAGIAN** — Phase D.1 ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 3d) menemukan Scenario Engine (CAP-009) punya hidden dependency ke Integration Gateway (CAP-013) KHUSUS untuk dimensi Cashflow/EVM pada Scenario Comparison — koreksi ini SUDAH diterapkan sebagai bagian Capability Freeze. Tapi itu KONTEKS BERBEDA (Scenario COMPARISON membaca Cashflow existing sebagai INPUT), bukan konteks di sini (Estimate MEMICU update ke Cashflow sebagai OUTPUT orkestrasi) |
| Calculation Readiness | N/A — Cashflow existing (`cash_accounts`, `cash_transfers`, Phase A) punya kalkulasinya sendiri di luar CAP-006 |
| Information Readiness | 🔴 **GAP-2**: Arah "Estimate Approved → memicu update Cashflow Baseline" belum punya Contract sama sekali — berbeda dari GAP-1 (arah masuk sepenuhnya baru), di sini arahnya SEBALIKNYA dari yang sudah dianalisis (Cashflow→Scenario, bukan Estimate→Cashflow) |

**Verdict langkah ini: 🔴 GAP DITEMUKAN — dicatat sebagai GAP-2, arah berlawanan dari yang sudah dianalisis Phase D.1.**

### A.6 Risk

| Pertanyaan | Jawaban |
|---|---|
| Capability Readiness | ✅ **CAP-007** (Risk Engine) — SUDAH punya Dependency Matrix lengkap ([`05`](05-phase-d-capability-architecture.md) § F.7), meski domain pendukungnya masih Candidate ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 10) |
| Calculation Readiness | ✅ CAP-007 → CAP-006 lewat pola sama seperti capability lain (§ H Phase E) |
| Information Readiness | 🟡 **Sebagian** — Risk Register belum Confirmed sebagai domain penuh (status Candidate sejak Phase C.5), TAPI ini BUKAN gap baru — sudah diketahui dan didokumentasikan konsisten sejak Discovery Validation ([`03b`](03b-phase-c5-core-domain-discovery.md) § 2) |

**Verdict langkah ini: SIAP DENGAN CATATAN SUDAH DIKETAHUI — bukan gap baru, status Candidate Risk Register sudah tercatat di Phase C.5/D.1/E.1, konsisten dibawa sampai sini.**

### A.7 Approval

| Pertanyaan | Jawaban |
|---|---|
| Capability Readiness | ✅ **CAP-010** (Workflow Engine) — dirancang KHUSUS sebagai Domain Service generik dipanggil banyak capability ([`05`](05-phase-d-capability-architecture.md) § F.10) |
| Calculation Readiness | ✅ Tidak melakukan kalkulasi sendiri, hanya validasi — konsisten Boundary CAP-010 |
| Information Readiness | ✅ Approval Chain Definition Contract sudah dianalisis penuh sejak Phase D ([`05b`](05b-phase-d1-capability-validation-freeze.md) § Ownership Validation) |

**Verdict langkah ini: SIAP.**

### A.8 Lessons Learned

| Pertanyaan | Jawaban |
|---|---|
| Capability Readiness | ✅ **CAP-011** (Intelligence Engine) — kontrak `write access` terkontrol lewat Domain Event sudah dianalisis mendalam ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.12, [`05b`](05b-phase-d1-capability-validation-freeze.md) risiko #1) |
| Calculation Readiness | N/A langsung, tapi CAP-011 mengkonsumsi HASIL kalkulasi (Variance) yang sumbernya CAP-006 secara tidak langsung |
| Information Readiness | ✅ Lessons Learned Contract paling matang dari seluruh Phase F — sembilan Domain Event terdaftar ([`03b`](03b-phase-c5-core-domain-discovery.md) § Domain Event Utama) |

**Verdict langkah ini: SIAP.**

---

## B. Ringkasan Jalur Uji Utama

```
Estimate dibuat  ✅ SIAP
     ↓
Calculation otomatis  ✅ SIAP
     ↓
Material Requirement  🔴 GAP-1 (tidak ada Owner Capability, tidak ada Contract)
     ↓
Procurement  🔴 (bagian GAP-1)
     ↓
Cashflow  🔴 GAP-2 (arah Estimate→Cashflow belum dianalisis, beda dari Cashflow→Scenario yang sudah)
     ↓
Risk  🟡 SIAP dengan status Candidate yang sudah diketahui (bukan gap baru)
     ↓
Approval  ✅ SIAP
     ↓
Lessons Learned  ✅ SIAP
```

**Lima dari delapan langkah SIAP penuh. Dua langkah (Material Requirement/Procurement, Cashflow) menghasilkan gap NYATA — bukan sekadar "belum detail", tapi benar-benar TIDAK ADA Orchestration Rule yang bisa dirujuk.** Satu langkah (Risk) sudah py catatan status yang diketahui sejak Phase C.5, dikonfirmasi ulang bukan gap baru.

**⚠️ Koreksi framing penting (ditambahkan setelah review founder — lihat § E untuk penjelasan lengkap):** Kedua gap di bawah semula diberi label "GAP-1"/"GAP-2" dengan cara yang berisiko dibaca sebagai "Capability yang hilang". Ini KOREKSI TERHADAP DIRI SENDIRI: kedua gap BUKAN pertanyaan kepemilikan data (siapa MEMILIKI Estimate Version, Price Book, dst — semua sudah terjawab tuntas Phase D). Keduanya adalah **Orchestration Gap** — pertanyaan murni tentang siapa memutuskan urutan/pemicu proses lintas capability yang SUDAH punya pemilik jelas. Relabel: **Orchestration Gap-1** (Material Requirement/Procurement) dan **Orchestration Gap-2** (Cashflow) — dipertahankan penomorannya untuk kontinuitas rujukan, tapi namanya diperjelas.

---

## C. Analisis Akar Kedua Gap — Kenapa Ini Terjadi (Bukan Kesalahan Phase D/E/F)

**Diperiksa apakah GAP-1 dan GAP-2 adalah tanda Phase D/E/F kurang matang, atau sesuatu yang MEMANG di luar cakupannya secara sah:**

Ditelusuri kembali ke Phase A ([`00-phase-a-repository-discovery.md`](00-phase-a-repository-discovery.md)): Material Requirement/Procurement dan Cashflow adalah modul **EXISTING** Puraloka Suite yang SUDAH matang SEBELUM CECEP mulai dirancang (Phase A menyebut Procurement "✅ Matang", Cashflow "✅ Matang"). Phase C.5 sudah mengidentifikasi KEBUTUHAN Anti-Corruption Layer untuk integrasi CECEP↔Puraloka Suite existing ([`03b`](03b-phase-c5-core-domain-discovery.md) § Anti-Corruption Layer) — TAPI secara eksplisit HANYA menganalisis DUA arah spesifik (Actual Cost→Lessons Learned, Reference Library→Assembly/CBS), BUKAN seluruh kemungkinan arah integrasi yang bisa terjadi.

**Kesimpulan akar masalah:** GAP-1 dan GAP-2 BUKAN kelalaian Phase D/E/F — mereka adalah **AKIBAT LANGSUNG dari cakupan Anti-Corruption Layer yang sengaja dibatasi ke dua arah spesifik saat Phase C.5** (keputusan yang SAH pada saat itu, karena Phase C.5 hanya menganalisis kebutuhan yang SUDAH TERLIHAT dari root-cause analysis Phase C, dan arah Material Requirement/Cashflow belum masuk radar analisis saat itu). Ini BUKAN pelanggaran baseline manapun — ini murni CAKUPAN yang belum pernah dianalisis, ditemukan sekarang KARENA orkestrasi adalah aktivitas pertama yang mencoba menghubungkan CECEP ke SELURUH rantai bisnis, bukan cuma satu-dua titik integrasi.

---

## D. Pemeriksaan Kedua — Domain Event Coverage (Di Luar Jalur Uji Utama)

**Diperiksa lebih luas:** Selain jalur uji utama founder, apakah SEMUA sembilan Domain Event yang sudah terdaftar ([`05`](05-phase-d-capability-architecture.md) § F) punya listener yang jelas untuk orkestrasi lintas-capability (bukan cuma dalam satu capability)?

| Domain Event | Listener Terdaftar | Cukup untuk Orkestrasi? |
|---|---|---|
| `CostCodeActivated`/`Deprecated` | Semua 17 domain hilir | ✅ Cukup — sudah generik sejak Phase C.5 |
| `CompanyAhspRevised` | Estimate Version Draft (opsional re-kalkulasi) | ✅ Cukup, meski "opsional" (bukan otomatis) — ini KEPUTUSAN SAH, bukan gap, karena re-kalkulasi otomatis akan melanggar immutability Estimate Version yang sudah Approved |
| `PriceBookEntryVerified`/`Activated`/`Expired` | Assembly, Estimate Version | ✅ Cukup |
| `ProductivityRecordUpdatedFromVariance` | Formula Engine (parameter baru) | ✅ Cukup |
| `EstimateVersionApproved`/`Frozen`/`Superseded` | Downstream read-model generator | 🔴 **Sama dengan GAP-1/GAP-2** — "downstream read-model generator" (RAB/RAP/Budget/Cashflow/EVM) DISEBUT di Phase D ([`05`](05-phase-d-capability-architecture.md) § C tabel Ringkasan Ownership) TAPI TIDAK PERNAH diberi Owner Capability sendiri — ia secara eksplisit BUKAN capability terpisah (Rejected Domain C.1/C.2, [`03b`](03b-phase-c5-core-domain-discovery.md)), tapi itu berarti TIDAK ADA yang secara eksplisit bertanggung jawab MEMBANGKITKAN read-model ini saat event terjadi — konsisten dengan GAP-1/GAP-2 yang sudah ditemukan di jalur uji utama, BUKAN gap ketiga yang baru, melainkan KONFIRMASI bahwa gap yang sama juga terlihat dari sudut pandang Domain Event |
| `VarianceCalculated`/`RootCauseIdentified` | Root Cause Analysis, Approval Workflow | ✅ Cukup |
| `LessonsLearnedApproved`/`Propagated` | Assembly, Price Book, Productivity Library | ✅ Cukup, paling matang |
| `ApprovalRequested`/`Granted`/`Rejected` | Generik, dipanggil banyak capability | ✅ Cukup |
| `ScenarioBranched`/`Archived` | (baru dikoreksi Phase F.1) | ✅ Cukup |

**Temuan pemeriksaan kedua ini MENGKONFIRMASI ULANG (bukan menemukan gap baru):** GAP-1 dan GAP-2 dari jalur uji utama founder ternyata adalah manifestasi dari SATU akar masalah yang lebih besar — **"siapa yang bertanggung jawab menghasilkan/memperbarui Derived Read-Model (RAB/RAP/Budget/Cashflow Baseline/EVM Baseline) saat `EstimateVersionApproved` terjadi"** belum pernah dijawab eksplisit di Phase D/E/F manapun, karena ketiganya secara SAH menghindari menjadikan Derived Data sebagai Aggregate Root sendiri (Foundational Principle Keempat) — TAPI keputusan itu meninggalkan pertanyaan "siapa yang MENGHITUNG proyeksinya saat dibutuhkan" tanpa jawaban eksplisit.

---

## E. Konsolidasi — Dua Orchestration Gap, Bukan Tiga, dan BUKAN Capability Gap

**Koreksi arsitektural (founder, setelah draf pertama assessment ini):** Ditulis ulang sepenuhnya — bagian ini semula (dan § G) menyajikan kedua gap seolah punya opsi "mungkin butuh Capability baru" yang setara dengan opsi orkestrasi. Itu KELIRU. Berlaku sekarang: **Orchestration Separation Principle** ([`04`](04-architecture-constitution.md) § 10) — *"Owning a capability does not imply owning the orchestration. Orchestration is a separate architectural concern."* Pemeriksaan ulang terhadap kedua gap dengan sinyal pembeda dari prinsip ini:

**Sinyal pembeda:** Kalau pertanyaannya *"siapa MEMILIKI data/knowledge ini"* — itu gap Capability, butuh ACR ke Phase D. Kalau pertanyaannya *"kapan/dalam urutan apa/dipicu oleh apa proses ini berjalan lintas capability yang SUDAH punya pemilik jelas"* — itu gap Orchestration, agenda Phase G, TIDAK butuh ACR.

**Orchestration Gap-1 (Material Requirement/Procurement):** "Siapa MEMILIKI Estimate Version?" → CAP-008, sudah terjawab tuntas sejak Phase D. Yang BELUM ada bukan pemilik data — yang belum ada adalah **Orchestration Rule**: apakah `EstimateVersionApproved` memicu `Generate Material Requirement`, `Generate Purchase Requisition`, keduanya, atau tidak sama sekali (tergantung kebijakan perusahaan) — pertanyaan yang SECARA ARSITEKTURAL tidak punya satu jawaban benar tunggal, sama seperti Configurable Approval Workflow (CAP-010) sengaja tidak hardcode role approver. Ini murni belum dirancang karena **Phase G belum dimulai**, bukan karena Capability Architecture kurang lengkap.

**Orchestration Gap-2 (Cashflow):** Sama persis — "siapa MEMILIKI Price Book/Estimate Version" sudah terjawab tuntas. Yang belum ada adalah Orchestration Rule: bagaimana `EstimateVersionApproved` diterjemahkan jadi pembangkitan Cashflow Baseline, dan KAPAN itu terjadi (langsung? terjadwal? manual trigger?) — keputusan konfigurasi orkestrasi, bukan pertanyaan kepemilikan.

**Kesimpulan revisi:** Kedua gap ini BUKAN indikasi Phase D kurang lengkap. Keduanya adalah **BUKTI bahwa Phase D berhasil menjaga Single Responsibility-nya** — tidak ada Capability yang diam-diam merangkap jadi orkestrator hanya karena topiknya terasa dekat. Boundary CAP-013 (Integration Gateway) yang HANYA mencakup dua ACL spesifik dari Phase C.5, dan TIDAK melebar untuk "sekalian" menangani arah integrasi baru ini, adalah **tanda boundary bekerja sebagaimana dirancang** — bukan kekurangan yang perlu ditambal.

---

## F. Pemeriksaan Ketiga — Apakah Ada Capability/Calculation/Information Baru yang Diam-Diam Diperkenalkan di Sini?

**Verifikasi disiplin diri (instruksi founder eksplisit meminta ini dijaga):** Ditelusuri ulang seluruh dokumen ini — apakah ada satu pun titik yang, tanpa disadari, sudah mendesain solusi alih-alih mengidentifikasi gap?

| Bagian | Diperiksa | Hasil |
|---|---|---|
| § A.3-A.5 (Orchestration Gap-1, -2, penemuan awal) | Apakah ada usulan nama Capability baru? | ✅ Tidak — "CAP-013 kandidat PALING DEKAT" (draf awal) sudah DIKOREKSI § E: bukan sinyal untuk memperluas CAP-013, justru sinyal Boundary-nya bekerja benar dengan TIDAK melebar |
| § C (Analisis akar masalah) | Apakah ada usulan desain ACL baru? | ✅ Tidak — murni analisis KENAPA gap ini terjadi, tidak mengusulkan bentuk solusi |
| § D (Domain Event Coverage) | Apakah ada usulan Domain Event baru? | ✅ Tidak — hanya mengonfirmasi event yang SUDAH ada belum punya Orchestration Rule yang menjawab pertanyaan spesifik |
| § E (Konsolidasi, direvisi) | Apakah masih menyisakan opsi "mungkin Capability baru" sebagai pilihan setara? | ✅ Tidak lagi — draf awal SEMPAT melakukan ini, sudah dikoreksi tuntas mengikuti Orchestration Separation Principle ([`04`](04-architecture-constitution.md) § 10) |

**Verdict: ✅ Disiplin terjaga SETELAH koreksi — draf pertama dokumen ini sendiri sempat melanggar disiplinnya sendiri (menyiratkan ACR sebagai opsi setara), ditemukan dan diperbaiki lewat review founder, bukan lolos tanpa catatan.**

---

## G. Kesimpulan Assessment

**Jawaban langsung terhadap pertanyaan inti founder** ("apakah Phase D, E, F sudah cukup untuk membangun orchestration tanpa memperkenalkan capability/calculation/information baru?"):

**YA.** Lima dari delapan langkah jalur uji utama (Estimate dibuat, Calculation otomatis, Risk, Approval, Lessons Learned) sepenuhnya siap diorkestrasi dari baseline yang sudah frozen. Dua langkah (Material Requirement/Procurement, Cashflow) menghasilkan **Orchestration Gap-1 dan Orchestration Gap-2** — bukan Capability Gap. Keduanya adalah pertanyaan "bagaimana proses lintas capability yang SUDAH punya pemilik jelas ini dijalankan", yang secara definisi adalah **cakupan Phase G, belum pernah dan tidak perlu dijawab di Phase D**.

**Progressive Freeze Chain TIDAK dilanggar** — Capability (D), Calculation (E), Information (F) semua tetap frozen tanpa perubahan. Kedua Orchestration Gap diperlakukan sebagai **input pertama Phase G**, bukan alasan membuka kembali Phase D.

**Instruksi eksplisit untuk awal Phase G (founder):** Sebelum mendesain solusi konkret, Phase G WAJIB memulai dengan **Orchestration Discovery** yang menjawab:
1. Siapa **orchestration owner** untuk setiap Domain Event yang sudah terdaftar ([`05`](05-phase-d-capability-architecture.md) § F)?
2. Siapa **producer** dan **consumer** setiap event dalam konteks orkestrasi lintas-capability (beda dari Owner data yang sudah terjawab Phase D)?
3. Bagaimana **Derived Read-Model** (RAB/RAP/Budget/Cashflow Baseline/EVM Baseline) dibentuk — proses APA yang memicunya, KAPAN?
4. Bagaimana **event diterjemahkan menjadi proses lintas capability** (Orchestration Gap-1, Orchestration Gap-2, dan pola serupa lain yang mungkin ditemukan)?
5. Bagaimana menjaga SELURUH orkestrasi tetap mematuhi Capability Boundary (Phase D), Calculation Strategy (Phase E), dan Information Contract (Phase F) yang sudah frozen — konsisten Orchestration Separation Principle ([`04`](04-architecture-constitution.md) § 10)?

**Ini bukan lagi "rekomendasi dua opsi"** (koreksi dari draf sebelumnya) — ini adalah **arah tunggal yang sudah ditetapkan founder**: Orchestration Discovery sebagai pembuka Phase G, bukan ACR ke Phase D.

---

## Assumptions

1. Jalur uji utama yang dipakai (§ A) adalah CONTOH yang diberikan founder sendiri — assessment ini TIDAK mengklaim telah menelusuri SEMUA kemungkinan alur orkestrasi yang akan muncul di Phase G, hanya jalur yang paling representatif dan eksplisit disebut. Gap lain berpotensi ditemukan begitu Phase G mulai mendesain alur konkret lain.
2. "CAP-013 sebagai kandidat paling dekat" (§ A.3) adalah OBSERVASI, bukan rekomendasi tersembunyi — kalau founder membaca ini sebagai usulan memperluas CAP-013, itu perlu diklarifikasi eksplisit sebagai ACR, bukan diasumsikan otomatis benar dari assessment ini.

## Open Questions

1. Apakah ada jalur orkestrasi LAIN (di luar contoh founder) yang perlu ditelusuri lewat metodologi yang sama sebelum Phase G dianggap benar-benar siap — atau cukup jalur uji utama ini sebagai representasi yang memadai?
2. Untuk kelima pertanyaan Orchestration Discovery (§ G) — apakah kelimanya cukup sebagai titik awal Phase G, atau ada pertanyaan discovery tambahan yang founder anggap perlu sebelum desain konkret dimulai?

## Required Decisions (Approval Gate)

1. Apakah metodologi tiga-pertanyaan (Capability/Calculation/Information Readiness) per langkah sudah cukup ketat untuk membuktikan/menyangkal kesiapan orkestrasi?
2. Apakah Orchestration Gap-1 dan Orchestration Gap-2 (§ E, direvisi mengikuti Orchestration Separation Principle) sudah menangkap seluruh titik lemah yang relevan, dengan framing yang tepat (gap orkestrasi, bukan gap capability)?
3. Apakah Orchestration Separation Principle ([`04`](04-architecture-constitution.md) § 10) sudah dirumuskan dengan tepat sebagai prinsip constitutional?
4. Apakah assessment ini cukup sebagai gerbang, dan Phase G (Enterprise Orchestration Architecture) siap dimulai dengan Orchestration Discovery (§ G, lima pertanyaan) sebagai langkah pertama?

---

## 🚦 APPROVAL GATE

Orchestration Readiness Assessment selesai — jalur uji utama delapan-langkah ditelusuri terhadap tiga pertanyaan kesiapan, dua Orchestration Gap ditemukan dan dikonsolidasi (bukan Capability Gap — dikoreksi mengikuti Orchestration Separation Principle, [`04`](04-architecture-constitution.md) § 10 baru), TIDAK ADA solusi didesain, TIDAK ADA Capability/Calculation/Information baru diperkenalkan, Progressive Freeze Chain tetap utuh. **STOP** — menunggu approval eksplisit sebelum Phase G dimulai.

**Catatan struktural (ditambahkan setelah assessment selesai):** Phase G sudah dimulai, lihat [`08-phase-g-enterprise-orchestration-architecture.md`](../enterprise-architecture-framework/08-phase-g-enterprise-orchestration-architecture.md) — dibuka dengan Enterprise Event Catalog (artefak discovery tambahan yang diminta founder) SEBELUM Orchestration Discovery lima-pertanyaan di atas. Kedua Orchestration Gap dari dokumen ini terkonfirmasi ulang dari sudut pandang katalog event, mengerucut jadi satu **Titik Keputusan Tunggal**: kebijakan proses pasca-`EstimateVersionApproved`.

*Dokumen selanjutnya: Phase G — Enterprise Orchestration Architecture, dibuka dengan Enterprise Event Catalog lalu Orchestration Discovery (§ B, lima pertanyaan).*
