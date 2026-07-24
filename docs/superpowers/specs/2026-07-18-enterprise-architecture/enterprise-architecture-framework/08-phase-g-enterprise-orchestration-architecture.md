# CECEP — Phase G: Enterprise Orchestration Architecture

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Layer 5 pertama — Execution Truth ([`04`](../CECEP/04-architecture-constitution.md) § 8). Phase D mengunci **WHO** (siapa memiliki capability), Phase E mengunci **HOW** (bagaimana kalkulasi dieksekusi), Phase F mengunci **WHAT DATA** (apa sumber kebenaran informasi). Phase G menjawab **WHEN** — kapan dan dalam urutan apa capability yang sudah frozen berinteraksi. Phase G TIDAK PERNAH menciptakan truth baru di Layer 1-4 — ia murni mengonsumsi ([`04`](../CECEP/04-architecture-constitution.md) § 8, § 10 Orchestration Separation Principle).

## Aturan Governing (Mengikat, Tidak Bisa Dilanggar Tanpa ACR)

1. **Domain (C.5), Capability (D/D.1), Calculation (E/E.1), Information (F/F.1) semua frozen.** Phase G TIDAK mendesain ulang salah satu pun.
2. **Orchestration Separation Principle** ([`04`](../CECEP/04-architecture-constitution.md) § 10): memiliki capability TIDAK BERARTI memiliki orkestrasi. Setiap kali Phase G menemukan pertanyaan "siapa MEMILIKI X" yang belum terjawab — itu bukan pekerjaan Phase G, itu sinyal ACR ke Phase D. Setiap kali menemukan pertanyaan "KAPAN/URUTAN APA X terjadi lintas capability yang sudah punya pemilik jelas" — itu memang pekerjaan Phase G.
3. **Urutan wajib (ditetapkan founder, disempurnakan dengan lima artefak discovery tambahan setelah founder menilai draf pertama masih terlalu cepat menyempit ke satu keputusan — Discovery Phase G BELUM lengkap hanya dengan Event Catalog + lima pertanyaan Orchestration Discovery):**

```
Enterprise Event Catalog       ← § A — dokumentasikan SEMUA Domain Event, atribut operasional
       ↓
Orchestration Discovery         ← § B — lima pertanyaan (owner/producer-consumer/derived
       ↓                           read-model/event-to-process/compliance)
Event Classification            ← § C — Business/System/Integration/User/External/AI/Timer
       ↓
Event Criticality &              ← § D — Critical/High/Medium/Low + Guaranteed Delivery per event
Delivery Requirement
       ↓
Event Policy                    ← § E — Retry/Compensation/Rollback/Escalation/Human Approval
       ↓
Event Dependency & Ordering     ← § F — dependency graph antar-event (BUKAN workflow)
       ↓
Event Consistency Requirement   ← § G — Strong Consistency vs Eventually Consistent
       ↓
Orchestration Readiness         ← § H — sintesis seluruh discovery, BARU di sini Titik
(Titik Keputusan Tunggal)          Keputusan Tunggal (termasuk lazy/eager/hybrid) diajukan
       ↓                           sebagai PERTANYAAN, bukan dijawab
Orchestration Rule Design       ← baru di sini boleh mendesain urutan/pemicu proses konkret
```

**Larangan eksplisit:** TIDAK mendesain satu pun Orchestration Rule/workflow, dan TIDAK menjawab pertanyaan desain (lazy/eager/hybrid, urutan proses pasca-event) sebelum SELURUH tujuh artefak discovery (§ A-G) selesai. Ini bukan penambahan sub-phase G.1 — semuanya tetap Discovery di dalam satu Phase G, mengikuti pola Discovery→Validation→Freeze→Design yang konsisten sejak Phase B.
4. **Kalau ditemukan kebutuhan mengubah Domain/Capability/Calculation/Information yang frozen:** hentikan, dokumentasikan ACR, tunggu approval. Lihat § F untuk log ACR.
5. **Rujukan wajib:** Capability memakai ID Catalog ([`05b`](../CECEP/05b-phase-d1-capability-validation-freeze.md) § 10). Prinsip constitutional dari [`04-architecture-constitution.md`](../CECEP/04-architecture-constitution.md), termasuk Orchestration Separation Principle (§ 10) yang lahir langsung dari [`07c-orchestration-readiness-assessment.md`](../CECEP/07c-orchestration-readiness-assessment.md).

---

## A. Enterprise Event Catalog

**Tujuan (instruksi eksplisit founder):** Dokumentasikan SEMUA Domain Event yang sudah ditemukan sejak Phase C.5/D/E/F SEBELUM satu workflow pun didesain — bukan workflow, bukan BPMN, bukan sequence diagram. Kalau Phase G event-driven, Event Catalog harus ada LEBIH DULU, supaya orkestrasi nanti menjadi `Event → Rule → Capability → Next Event`, bukan `Workflow → baru mikir event`.

**Enam atribut wajib per event** (format yang diberikan founder): Producer, Consumers, Sync/Async, Guaranteed Delivery, Idempotent — ditambah **Payload Contract** (rujukan ke Canonical Information Contract yang relevan, [`07`](../CECEP/07-phase-f-enterprise-data-model.md) § C, karena event yang membawa data harus merujuk kontrak yang sudah frozen, bukan struktur ad-hoc).

### A.1 Event dari Layer 1 — Foundation & Identity (CAP-001)

| Event | Producer | Consumers | Sync/Async | Guaranteed Delivery | Idempotent | Payload Contract |
|---|---|---|---|---|---|---|
| `CostCodeActivated` | CAP-001 | Semua 17 domain hilir ([`02`](../CECEP/02-phase-b5-core-cost-engineering-architecture.md) § 6) | Async | Yes | Yes (activation state stabil) | Cost Code Identity |
| `CostCodeDeprecated` | CAP-001 | Semua 17 domain hilir | Async | Yes | Yes | Cost Code Identity |
| `ResourceDeactivated` | CAP-001 | CAP-003, CAP-004, CAP-005 | Async | Yes | Yes | RBS Resource Identity |

### A.2 Event dari Layer 2 — Classification (CAP-002)

| Event | Producer | Consumers | Sync/Async | Guaranteed Delivery | Idempotent | Payload Contract |
|---|---|---|---|---|---|---|
| `CompanyCbsTemplateRevised` | CAP-002 | CAP-008 (Estimate Version Draft, opsional re-kalkulasi) | Async | Yes | Yes | CBS Node Contract |
| `ProjectCbsSnapshotted` | CAP-002 | CAP-008 | Sync (bagian alur pembuatan Project) | Yes | Yes (snapshot idempotent by definition) | CBS Node Contract |
| `WbsNodeBaselined` | CAP-002 | CAP-008 (Estimate Item merujuk WBS) | Async | Yes | Yes | — |

### A.3 Event dari Layer 3 — Cost Knowledge (CAP-003/004/005/006/007)

| Event | Producer | Consumers | Sync/Async | Guaranteed Delivery | Idempotent | Payload Contract |
|---|---|---|---|---|---|---|
| `AssemblyActivated` | CAP-003 | CAP-008 | Async | Yes | Yes | — |
| `CompanyAhspRevised` | CAP-003 | CAP-008 (Draft, opsional) | Async | Yes | Yes | — |
| `PriceBookEntryVerified` | CAP-004 | CAP-003, CAP-006 (via `LOOKUP`) | Async | Yes | Yes | **Price Contract** ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § C.2) |
| `PriceBookEntryActivated` | CAP-004 (dipicu otomatis saat Effective Date, [`07b`](../CECEP/07b-phase-f1-information-validation-freeze.md) § 11) | CAP-003, CAP-006, CAP-008 | Async | Yes | Yes | Price Contract |
| `PriceBookEntryExpired` | CAP-004 | CAP-003, CAP-006 | Async | Yes | Yes | Price Contract |
| `ProductivityRecordUpdatedFromVariance` | CAP-005 | CAP-006 (parameter Formula) | Async | Yes | Yes | — |
| `FormulaActivated` | CAP-006 | CAP-003, CAP-008, semua pemanggil Layer 3-4 ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § H) | Async | Yes | Yes | **Formula Contract** ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § C.2) |

**Catatan CAP-007 (Risk Engine):** Belum punya Domain Event terdaftar — konsisten dengan status Candidate domain pendukungnya ([`05b`](../CECEP/05b-phase-d1-capability-validation-freeze.md) § 10, dicatat sejak Phase D.1). TIDAK ditambahkan event spekulatif di sini — kekosongan ini SENGAJA dibiarkan kosong sebagai representasi jujur status domain, bukan diisi asumsi.

### A.4 Event dari Layer 4 — Estimation Orchestration (CAP-008/009)

| Event | Producer | Consumers | Sync/Async | Guaranteed Delivery | Idempotent | Payload Contract |
|---|---|---|---|---|---|---|
| `EstimateVersionApproved` | CAP-008 | **Belum lengkap — lihat § B (Orchestration Discovery)** | Async (WAJIB — approval adalah proses manusia, tidak sinkron) | Yes | Yes (Estimate Version immutable setelah Approved) | **Estimate Contract** ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § C.2) |
| `EstimateVersionFrozen` | CAP-008 | CAP-009 (Scenario Comparison) | Async | Yes | Yes | Estimate Contract |
| `EstimateVersionSuperseded` | CAP-008 | CAP-009 | Async | Yes | Yes | Estimate Contract |
| `ScenarioBranched` | CAP-009 | Pengguna langsung (estimator/PM) | Sync (pengguna menunggu hasil branching) | Yes | **No** — setiap panggilan menciptakan instance BARU, memanggil dua kali = dua Scenario ([`07b`](../CECEP/07b-phase-f1-information-validation-freeze.md) § 7) | Scenario Contract ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § C.2) |
| `ScenarioArchived` | CAP-009 | — | Async | Yes | Yes | Scenario Contract |

**Temuan penting saat menyusun tabel ini:** `EstimateVersionApproved` adalah **event PALING SENTRAL** di seluruh Enterprise Event Catalog — ia satu-satunya event dari sembilan yang sudah terdaftar sejak Phase D yang kolom Consumers-nya TIDAK BISA diisi tuntas dari dokumen frozen manapun. Ini KONFIRMASI LANGSUNG dari Orchestration Gap-1/Gap-2 ([`07c`](../CECEP/07c-orchestration-readiness-assessment.md) § E) — bukan temuan baru, tapi kemunculan yang sama dari sudut pandang katalog event, bukan sudut pandang jalur uji.

### A.5 Event dari Layer 5 — Intelligence & Governance (CAP-010/011)

| Event | Producer | Consumers | Sync/Async | Guaranteed Delivery | Idempotent | Payload Contract |
|---|---|---|---|---|---|---|
| `ApprovalRequested` | CAP-010 | Approver (manusia, via RBAC existing) | Sync (menunggu keputusan) | Yes | Yes | Approval Chain Contract |
| `ApprovalGranted` | CAP-010 | Capability pemanggil (CAP-004/008/011) | Async | Yes | Yes | — |
| `ApprovalRejected` | CAP-010 | Capability pemanggil | Async | Yes | Yes | — |
| `VarianceCalculated` | CAP-011 | Root Cause Analysis (internal CAP-011) | Async | Yes | Yes | — |
| `RootCauseIdentified` | CAP-011 | CAP-010 (memicu validasi) | Async | Yes | Yes | — |
| `LessonsLearnedApproved` | CAP-010 | CAP-011 (status lanjut ke Propagated) | Async | Yes | Yes | — |
| `LessonsLearnedPropagated` | CAP-011 | CAP-003, CAP-004, CAP-005 | Async | Yes | **Harus Yes secara ketat** — event ini menulis ke TIGA Aggregate Root lain ([`05b`](../CECEP/05b-phase-d1-capability-validation-freeze.md) risiko #1); kalau tidak idempotent, replay event bisa menduplikasi update knowledge | Lessons Learned Contract |

### A.6 Ringkasan Cakupan Event Catalog

**Sembilan belas event terdaftar** (dari sembilan yang disebut Phase D § F sebagai daftar ringkas, sekarang diperluas jadi sembilan belas begitu setiap sub-event dipecah eksplisit dengan atribut operasional). **Satu gap terkonfirmasi**: `EstimateVersionApproved` adalah event dengan Consumers paling tidak lengkap — bukan temuan baru, murni representasi Orchestration Gap-1/Gap-2 dalam bentuk katalog.

---

## B. Orchestration Discovery (Lima Pertanyaan, Verbatim Instruksi Founder)

**Dijalankan SETELAH Event Catalog (§ A) selesai — supaya pertanyaan di bawah punya basis konkret untuk dijawab, bukan dijawab dari ingatan/asumsi.**

### B.1 Siapa Orchestration Owner untuk Setiap Domain Event?

**Definisi kerja (dibedakan tegas dari "Capability Owner" mengikuti Orchestration Separation Principle, [`04`](../CECEP/04-architecture-constitution.md) § 10):** Orchestration Owner BUKAN yang memiliki DATA di balik event — itu sudah terjawab tuntas (kolom Producer, § A). Orchestration Owner adalah **peran/fungsi yang berhak MENDEFINISIKAN aturan apa yang terjadi setelah event ini terpicu** — mis. untuk `EstimateVersionApproved`, siapa yang berhak memutuskan "setelah ini, apakah Material Requirement dibuat otomatis atau manual?"

**Hasil discovery (bukan keputusan final, murni identifikasi):**

| Event | Orchestration Owner (Kandidat) | Alasan |
|---|---|---|
| Event Layer 1-3 (Identity/Classification/Cost Knowledge) | **Tidak butuh Orchestration Owner terpisah** — reaksinya sudah deterministic dan generik (mis. "semua domain yang merujuk Cost Code ini update referensinya") | Tidak ada pilihan kebijakan bisnis yang perlu diputuskan — ini murni propagasi data, bukan keputusan proses |
| `EstimateVersionApproved` | **BELUM ADA — ini yang harus diputuskan founder/Phase G** (lihat § C) | Pertanyaan "apa yang terjadi setelah Approved" adalah kebijakan bisnis yang bisa berbeda per perusahaan (contoh founder: RAP dulu vs Material Requirement dulu vs keduanya sekaligus) |
| `LessonsLearnedPropagated` | **CAP-010 (Workflow Engine) sebagai gerbang, TAPI reaksi capability penerima sudah deterministic** | Sudah dianalisis tuntas — bukan pilihan kebijakan, aturan "update knowledge setelah approved" sudah fixed sejak Phase B.5 |
| `ApprovalGranted`/`ApprovalRejected` | **CAP-010 itu sendiri** — reaksi generik "kembalikan status ke pemanggil" | Tidak butuh keputusan tambahan |

**Kesimpulan B.1:** Mayoritas event SUDAH punya reaksi deterministic yang tidak butuh "Orchestration Owner" terpisah — hanya SATU event (`EstimateVersionApproved`) yang benar-benar butuh keputusan kebijakan eksplisit, karena ia adalah titik dengan CABANG kemungkinan proses terbanyak (persis contoh founder: RAP/MR/PR/Budget Revision/kombinasi).

### B.2 Siapa Producer dan Consumer Setiap Event dalam Konteks Orkestrasi Lintas-Capability?

**Sudah terjawab tuntas untuk 18 dari 19 event lewat § A** (kolom Producer/Consumers). Satu-satunya yang belum lengkap: `EstimateVersionApproved` — Producer jelas (CAP-008), Consumers TIDAK BISA ditentukan dari baseline frozen karena bergantung kebijakan yang belum diputuskan (§ B.1).

### B.3 Bagaimana Derived Read-Model (RAB/RAP/Budget/Cashflow Baseline/EVM Baseline) Dibentuk?

**Prinsip yang harus dipegang (dari Foundational Principle Keempat + Rejected Domain C.1/C.2, [`03b`](../CECEP/03b-phase-c5-core-domain-discovery.md)):** Derived Data TIDAK PERNAH jadi Aggregate Root sendiri — read-model ini SELALU proyeksi dari Estimate Version, dihitung ulang kapan saja (beda dari Computed Data yang snapshot, [`07`](../CECEP/07-phase-f-enterprise-data-model.md) § A).

**Yang BELUM diputuskan (murni discovery, bukan solusi):** APAKAH pembentukan read-model ini:
- (a) **Lazy** — dihitung ON-DEMAND setiap kali diminta pengguna (RAB dibentuk hanya saat halaman RAB dibuka), TIDAK ADA proses orkestrasi yang "membangkitkan" apa pun saat `EstimateVersionApproved` terjadi; atau
- (b) **Eager/Materialized** — dibentuk PROAKTIF saat `EstimateVersionApproved` terjadi, disimpan sebagai Cache Data (§ A Phase F) untuk dibaca cepat nanti; atau
- (c) **Campuran** — sebagian read-model lazy (RAB, jarang berubah setelah Approved), sebagian eager (Cashflow, sering dibutuhkan real-time untuk keputusan operasional).

**Ini murni pertanyaan orkestrasi (WHEN/HOW OFTEN), bukan pertanyaan capability (WHO)** — ketiga opsi SAMA-SAMA valid secara arsitektur data yang sudah frozen, karena Cache Strategy (§ C.5 Phase E) sudah dirancang mendukung kedua pola sekaligus (versioned cache key bekerja untuk lazy maupun eager).

### B.4 Bagaimana Event Diterjemahkan Menjadi Proses Lintas Capability?

**Pola generik yang SUDAH konsisten teramati di seluruh Event Catalog (§ A), untuk event YANG SUDAH punya Consumers jelas:**

```
Event terjadi (Producer capability)
     ↓
Consumer capability menerima (subscribe, sesuai kolom Consumers § A)
     ↓
Consumer bereaksi sesuai Boundary-nya sendiri (Non-Responsibility, [`05`](../CECEP/05-phase-d-capability-architecture.md) § F —
     TIDAK PERNAH consumer "menebak" apa yang harus dilakukan, reaksinya sudah predetermined
     oleh Core Responsibility capability tsb)
```

**Untuk event yang BELUM punya Consumers jelas (`EstimateVersionApproved`):** Pola di atas tidak bisa diterapkan sampai § C menjawab siapa Consumer-nya — ini BUKAN pola baru yang perlu didesain, murni MENUNGGU keputusan § B.1/C sebelum pola generik yang sudah ada bisa dipakai.

### B.5 Bagaimana Menjaga Seluruh Orkestrasi Tetap Mematuhi Capability Boundary, Calculation Strategy, dan Information Contract yang Sudah Frozen?

**Tiga pemeriksaan wajib untuk SETIAP Orchestration Rule yang akan dirancang di § C/D:**

| Pemeriksaan | Pertanyaan | Rujukan |
|---|---|---|
| Capability Boundary | Apakah rule ini memanggil capability lewat kontrak Dependency Matrix-nya, TIDAK memaksa capability melakukan sesuatu di luar Core Responsibility-nya? | [`05`](../CECEP/05-phase-d-capability-architecture.md) § F |
| Calculation Strategy | Kalau rule melibatkan angka, apakah dirutekan lewat CAP-006, TIDAK menyisipkan kalkulasi ad-hoc di level orkestrasi? | [`06`](../CECEP/06-phase-e-calculation-strategy.md) § pembuka poin 6 |
| Information Contract | Apakah data yang mengalir antar-langkah orkestrasi memakai Canonical Information Contract (§ C Phase F), TIDAK membaca struktur Entity mentah? | [`07`](../CECEP/07-phase-f-enterprise-data-model.md) § C |

**Ini adalah CHECKLIST yang akan dipakai berulang setiap Orchestration Rule baru dirancang** — dicatat di sini sebagai standar, bukan diterapkan satu kali saja.

**Catatan revisi (founder menilai draf pertama terlalu cepat menyempit ke satu keputusan):** Discovery Phase G BELUM lengkap hanya dengan Event Catalog (§ A) + lima pertanyaan Orchestration Discovery (§ B) — keduanya baru menjawab "event apa saja yang ada dan siapa produser/konsumennya", belum menjawab KARAKTERISTIK operasional tiap event (jenis, kritikalitas, kebijakan kegagalan, urutan ketergantungan, tingkat konsistensi). Lima artefak discovery berikut (§ C-G) WAJIB selesai sebelum Titik Keputusan Tunggal disintesis (§ H) — bukan sub-phase baru, tetap Discovery di dalam Phase G yang sama.

---

## C. Event Classification

**Tujuan:** Setiap event diklasifikasi ke SATU dari tujuh jenis (kategori yang diberikan founder) — klasifikasi ini menentukan pola orkestrasi yang cocok untuknya (event Business beda penanganannya dari event Timer), sama seperti Information Classification (§ A Phase F) menentukan perlakuan sebelum Entity dirancang.

| Jenis | Definisi | Event dari Katalog (§ A) yang Termasuk |
|---|---|---|
| **Business Event** | Merepresentasikan keputusan/kejadian bisnis nyata, biasanya melibatkan manusia | `EstimateVersionApproved`, `EstimateVersionFrozen`, `EstimateVersionSuperseded`, `ScenarioBranched`, `ScenarioArchived`, `ApprovalGranted`, `ApprovalRejected`, `LessonsLearnedApproved` |
| **System Event** | Perubahan status internal murni, tidak melibatkan keputusan manusia langsung | `CostCodeActivated`, `CostCodeDeprecated`, `ResourceDeactivated`, `CompanyCbsTemplateRevised`, `ProjectCbsSnapshotted`, `WbsNodeBaselined`, `AssemblyActivated`, `CompanyAhspRevised`, `FormulaActivated` |
| **Integration Event** | Melibatkan penerjemahan data lintas batas CECEP↔Puraloka Suite existing | *(belum ada di katalog § A — konsisten dengan Orchestration Gap-1/Gap-2, [`07c`](../CECEP/07c-orchestration-readiness-assessment.md) § E; kandidat event masa depan: `MaterialRequirementRequested`, `CashflowBaselineRequested`, keduanya BELUM didesain di sini, murni diklasifikasi jenisnya di muka) |
| **User Event** | Dipicu langsung tindakan pengguna, biasanya Sync | `ScenarioBranched` (dipicu estimator, bukan sistem — tercatat ganda dengan Business Event karena punya dua sifat sekaligus) |
| **External Event** | Berasal dari luar CECEP maupun Puraloka Suite (pihak ketiga) | *(belum ada — konsisten dengan status Regional Cost Index/Reference Library masih Candidate, [`03b`](../CECEP/03b-phase-c5-core-domain-discovery.md) § B; kandidat masa depan: update Reference Library eksternal AHSP Nasional) |
| **AI Event** | Dihasilkan proses AI/Retrieval, SELALU berstatus rekomendasi belum tervalidasi ([`04`](../CECEP/04-architecture-constitution.md) § 10 catatan "AI Event" konsisten Konstitusi Calculation Strategy) | *(belum ada — konsisten dengan CAP-012 Retrieval Engine masih kerangka, domain Candidate, [`05b`](../CECEP/05b-phase-d1-capability-validation-freeze.md) § 10)* |
| **Timer Event** | Dipicu jadwal/waktu, bukan aksi/kejadian | `PriceBookEntryActivated` (dipicu otomatis saat Effective Date tercapai, [`07b`](../CECEP/07b-phase-f1-information-validation-freeze.md) § 11) — **satu-satunya Timer Event yang sudah eksis di katalog** |

**Sisanya** (`PriceBookEntryVerified`, `PriceBookEntryExpired`, `ProductivityRecordUpdatedFromVariance`, `ApprovalRequested`, `VarianceCalculated`, `RootCauseIdentified`, `LessonsLearnedPropagated`) diklasifikasi **System Event** — perubahan status internal yang dipicu proses (bukan langsung manusia atau jadwal).

**Temuan dari klasifikasi ini:** Tiga dari tujuh jenis founder (Integration/External/AI Event) **belum punya satu pun event nyata di katalog** — ini BUKAN kekosongan yang perlu ditambal sekarang, ini KONFIRMASI SILANG ketiga dari gap yang sama: kedua Orchestration Gap ([`07c`](../CECEP/07c-orchestration-readiness-assessment.md)) dan status Candidate tiga domain (Risk/Retrieval/Reference Library) semuanya bermuara ke jenis event yang sama-sama belum terwujud. Pola tiga kali kemunculan gap yang sama dari sudut pandang berbeda (jalur uji → katalog event → klasifikasi jenis) memperkuat bahwa ini memang satu celah nyata, bukan kebetulan.

---

## D. Event Criticality & Delivery Requirement

**Tujuan:** Klasifikasi dampak kegagalan per event — event yang gagal dan berdampak fatal (Critical) butuh perlakuan orkestrasi yang sama sekali berbeda dari event yang gagal dan bisa ditunda (Low).

| Criticality | Definisi | Event |
|---|---|---|
| **Critical** | Kegagalan mengancam integritas finansial/kontraktual — TIDAK BOLEH hilang, TIDAK BOLEH terlambat tanpa pemberitahuan | `EstimateVersionApproved`, `EstimateVersionFrozen`, `ApprovalGranted`, `ApprovalRejected`, `PriceBookEntryActivated` (harga salah aktif = kalkulasi salah masif) |
| **High** | Kegagalan berdampak signifikan tapi masih bisa dikoreksi dalam waktu wajar | `PriceBookEntryVerified`, `PriceBookEntryExpired`, `FormulaActivated`, `AssemblyActivated`, `CompanyAhspRevised`, `LessonsLearnedPropagated` (menulis ke 3 Aggregate Root, [`05b`](../CECEP/05b-phase-d1-capability-validation-freeze.md) risiko #1) |
| **Medium** | Kegagalan menunda proses tapi tidak merusak data | `CostCodeActivated`, `CostCodeDeprecated`, `ResourceDeactivated`, `CompanyCbsTemplateRevised`, `ProjectCbsSnapshotted`, `WbsNodeBaselined`, `ProductivityRecordUpdatedFromVariance`, `ScenarioBranched`, `ScenarioArchived`, `EstimateVersionSuperseded` |
| **Low** | Kegagalan bisa di-retry tanpa urgensi — contoh founder eksplisit ("Lessons Learned Indexed gagal, masih bisa retry besok") | `VarianceCalculated`, `RootCauseIdentified`, `LessonsLearnedApproved`, `ApprovalRequested` (notifikasi bisa terlambat tanpa merusak data) |

**Silang dengan kolom "Guaranteed Delivery" (§ A):** Diverifikasi — SEMUA event Critical/High di katalog § A SUDAH bernilai `Guaranteed Delivery: Yes`. Tidak ditemukan event Critical yang diam-diam bernilai `No`. Konsisten, tidak ada koreksi diperlukan di sini.

---

## E. Event Policy

**Tujuan:** Untuk setiap tingkat Criticality (§ D), tentukan kebijakan default kegagalan — Retry/Compensation/Rollback/Escalation/Human Approval (kategori founder).

| Criticality | Retry? | Compensation? | Rollback? | Escalation? | Human Approval? |
|---|---|---|---|---|---|
| **Critical** | Retry terbatas (mis. 3× dengan backoff), lalu **Escalation wajib** — TIDAK PERNAH silent-fail | Ya, WAJIB didesain (mis. `EstimateVersionApproved` gagal terkirim ke consumer → Compensation memicu re-publish, bukan re-approve manual) | **Tidak** — Estimate Version immutable setelah Approved (§ K Phase E), rollback pada level DATA dilarang; rollback yang sah hanya pada level DELIVERY event (kirim ulang), bukan pada Aggregate | **Ya, wajib** — notifikasi ke Approval Owner/Admin kalau retry habis | **Ya** — untuk kasus retry gagal total, keputusan lanjut butuh manusia, bukan auto-resolve |
| **High** | Retry otomatis (mis. 5× backoff eksponensial) | Ya, untuk kasus `LessonsLearnedPropagated` gagal sebagian (mis. berhasil update Price Book tapi gagal update Productivity) — Compensation WAJIB menjaga idempotency (§ A kolom Idempotent) | Tidak berlaku (event ini immutable per definisi § I Phase F) | Ya, setelah retry habis | Tidak wajib — bisa auto-resolve via retry |
| **Medium** | Retry otomatis, threshold lebih longgar | Opsional | Tidak berlaku | Opsional, hanya kalau retry gagal berkali-kali | Tidak |
| **Low** | Retry dengan interval lebih panjang (contoh founder: "retry besok") | Tidak perlu | Tidak berlaku | Tidak perlu | Tidak |

**Kasus khusus — `ScenarioBranched` (Non-Idempotent, § A):** Retry BERBAHAYA untuk event non-idempotent (retry naif akan menciptakan Scenario duplikat) — Policy KHUSUS: retry HANYA sah dengan idempotency key di level pemanggilan (bukan di level event), bukan retry event itu sendiri. Dicatat sebagai pengecualian eksplisit, bukan mengikuti pola tabel di atas secara mentah.

**Prinsip governing yang lahir dari analisis ini:** Policy DITENTUKAN oleh Criticality (§ D), bukan oleh jenis capability yang menghasilkannya — dua event yang sama-sama Critical (satu dari CAP-008, satu dari CAP-010) memakai Policy yang SAMA. Ini konsisten dengan Orchestration Separation Principle ([`04`](../CECEP/04-architecture-constitution.md) § 10): Policy adalah keputusan LAYER 5 (Execution), bukan atribut yang diwariskan dari Capability Layer manapun.

---

## F. Event Dependency & Ordering

**Tujuan (instruksi eksplisit founder — "ini belum workflow, ini dependency antar event"):** Petakan urutan/ketergantungan WAJIB antar event, tanpa mendesain proses/aksi konkret di setiap langkahnya.

### F.1 Rantai Dependency yang Sudah Eksplisit dari Katalog (§ A)

```
CostCodeActivated
     ↓ (prasyarat)
AssemblyActivated / PriceBookEntryVerified / WbsNodeBaselined
     (Cost Code harus aktif SEBELUM Assembly/Price/WBS boleh merujuknya — Reference
      Integrity, [`07b`](../CECEP/07b-phase-f1-information-validation-freeze.md) § 5)
     ↓
FormulaActivated (independen — tidak wajib menunggu Assembly, dipanggil kapan saja)
     ↓
PriceBookEntryVerified → PriceBookEntryActivated → PriceBookEntryExpired
     (rantai LINEAR wajib satu Price Book Entry, TIDAK BISA Activated sebelum Verified)
     ↓
EstimateVersionApproved
     (prasyarat: Assembly Active + Price Book Active + Formula Active + WBS/CBS Baseline
      — SEMUA harus terjadi dulu, event ini adalah TITIK KONVERGENSI dependency terbanyak)
     ↓
EstimateVersionFrozen  ATAU  EstimateVersionSuperseded
     (percabangan — mutually exclusive, satu Estimate Version hanya menuju SATU dari keduanya)
     ↓
[Proyek berjalan — jeda waktu tidak terbatas]
     ↓
VarianceCalculated → RootCauseIdentified → LessonsLearnedApproved → LessonsLearnedPropagated
     (rantai LINEAR wajib, tidak bisa Propagated sebelum Approved)
```

### F.2 Event Independen (Tidak Punya Dependency Wajib)

`ScenarioBranched`/`ScenarioArchived`, `CompanyCbsTemplateRevised`/`ProjectCbsSnapshotted`, `ResourceDeactivated`, `ApprovalRequested`/`Granted`/`Rejected` (generik, dipicu kapan saja capability manapun butuh validasi) — semua ini BOLEH terjadi kapan saja tanpa menunggu event lain dalam rantai § F.1.

### F.3 Diagram Ordering (Bukan Workflow — Murni Dependency)

```
        CostCodeActivated
              │
   ┌──────────┼──────────────┐
   ▼          ▼               ▼
Assembly   PriceBook       WbsNode
Activated  EntryVerified   Baselined
   │          │               │
   │          ▼               │
   │     PriceBookEntry       │
   │        Activated         │
   │          │               │
   └──────────┼───────────────┘
              ▼
     EstimateVersionApproved  ◄── titik konvergensi (paling banyak prasyarat)
              │
        ┌─────┴─────┐
        ▼           ▼
     Frozen     Superseded  (mutually exclusive)
        │
   [jeda waktu tak terbatas — proyek berjalan]
        │
        ▼
  VarianceCalculated → RootCauseIdentified → LessonsLearnedApproved → Propagated
```

**Temuan penting:** `EstimateVersionApproved` BUKAN cuma event dengan Consumers paling tidak lengkap (§ A.4) — ia JUGA titik dengan dependency prasyarat TERBANYAK di seluruh graph. Dua fakta ini (paling banyak prasyarat MASUK, paling tidak lengkap konsumen KELUAR) saling memperkuat: event ini secara struktural adalah **pusat gravitasi orkestrasi CECEP**, bukan kebetulan ia juga jadi sumber Orchestration Gap.

---

## G. Event Consistency Requirement

**Tujuan:** Tentukan Strong Consistency vs Eventually Consistent per event — TIDAK semua event harus synchronous (instruksi founder).

| Consistency | Definisi | Event |
|---|---|---|
| **Strong Consistency** | Consumer HARUS melihat state terbaru SEGERA, tidak boleh ada jeda | `ApprovalRequested` (approver harus lihat permintaan real-time), `ScenarioBranched` (estimator menunggu hasil langsung, Sync di § A), `ProjectCbsSnapshotted` (bagian alur sinkron pembuatan Project) |
| **Eventually Consistent** | Consumer boleh menerima update dengan jeda, selama akhirnya konsisten | Mayoritas — `CostCodeActivated`/`Deprecated`, `PriceBookEntryVerified`/`Activated`/`Expired`, `FormulaActivated`, `LessonsLearnedPropagated`, dll (semua yang sudah `Async` di § A) |

**Korelasi dengan kolom Sync/Async (§ A):** Diverifikasi — Strong Consistency SELALU berpasangan dengan `Sync` di katalog, Eventually Consistent SELALU berpasangan dengan `Async`. **Tidak ditemukan anomali** (event Sync yang Eventually Consistent, atau event Async yang dituntut Strong Consistency) — katalog § A ternyata SUDAH konsisten secara implisit dengan pertanyaan ini sejak awal, tanpa perlu koreksi.

**Satu nuansa ditemukan — `EstimateVersionApproved`:** Meski Producer→proses Approval sendiri Sync (manusia menunggu keputusan), PROPAGASI event ke Consumers (begitu Consumer-nya nanti ditentukan, § H) SEHARUSNYA Eventually Consistent — Procurement/Cashflow tidak perlu tahu SEGERA dalam milidetik, mereka boleh menerima dalam hitungan detik/menit. Dicatat sebagai PRINSIP untuk memandu § H, bukan keputusan final karena Consumer-nya sendiri belum ditentukan.

---

## H. Orchestration Readiness — Sintesis, Titik Keputusan Tunggal Diajukan (Bukan Dijawab)

**Kedudukan:** SETELAH ketujuh artefak discovery (§ A-G) selesai, di sinilah — dan HANYA di sini — Titik Keputusan Tunggal boleh disintesis sebagai PERTANYAAN matang, bukan dijawab. Ini adalah gerbang terakhir Discovery sebelum Orchestration Rule Design.

### H.1 Konfirmasi: Masih Satu Titik Keputusan, Sekarang dengan Konteks Lengkap

Ketujuh artefak discovery TIDAK menemukan Titik Keputusan BARU — mereka justru MEMPERKAYA pemahaman tentang SATU titik yang sudah teridentifikasi sejak Orchestration Readiness Assessment ([`07c`](../CECEP/07c-orchestration-readiness-assessment.md)), sekarang dengan konteks lengkap:

| Dimensi | Sebelum § C-G (draf pertama) | Setelah § C-G |
|---|---|---|
| Jenis event | Tidak diketahui | `EstimateVersionApproved` = **Business Event** (§ C) |
| Kritikalitas | Tidak diketahui | **Critical** (§ D) — kegagalan orkestrasi di titik ini berdampak fatal |
| Policy kegagalan | Tidak diketahui | Retry terbatas + Compensation wajib + Escalation wajib + Human Approval untuk kasus gagal total (§ E) |
| Posisi dalam dependency graph | Tidak diketahui | **Titik konvergensi** — prasyarat terbanyak MASUK (§ F.1, F.3) |
| Consistency requirement untuk Consumer masa depan | Tidak diketahui | Eventually Consistent (§ G) — TIDAK butuh Consumer bereaksi dalam milidetik |

**Kesimpulan H.1:** Titik Keputusan Tunggal ini sekarang jauh LEBIH SIAP didesain (kalau/ketika founder memutuskan) dibanding sebelum tujuh artefak discovery — bukan karena sudah dijawab, tapi karena SELURUH karakteristik operasionalnya sudah terpetakan, sehingga Orchestration Rule Design nanti tidak perlu menebak jenis/kritikalitas/policy/urutan/consistency-nya dari nol.

### H.2 Pertanyaan yang Diajukan (Bukan Dijawab) untuk Orchestration Rule Design

1. **Urutan/kombinasi proses pasca-`EstimateVersionApproved`** (Generate RAP? Material Requirement? Purchase Requisition? Budget Revision? Kombinasi mana, urutan apa) — sekarang diketahui ini Business Event Critical dengan Policy Retry+Compensation+Escalation wajib.
2. **Pembentukan Derived Read-Model** (lazy/eager/hybrid, § B.3) — sekarang diketahui propagasinya boleh Eventually Consistent, artinya TIDAK ada tekanan waktu-nyata yang memaksa pilihan eager.
3. **Bentuk mekanisme keputusan** — apakah mengikuti pola Configurable Approval Workflow (CAP-010, aturan sebagai data) seperti diobservasi draf pertama, sekarang diperkuat oleh temuan § E bahwa Policy Critical event MEMANG butuh Human Approval untuk kasus edge — pola CAP-010 semakin terlihat relevan, TAPI TETAP belum diputuskan di sini.

**Assessment ini TIDAK menjawab ketiganya** — konsisten dengan disiplin yang sudah dipegang sejak Orchestration Readiness Assessment dan ditegaskan ulang founder di Round ini.

---

## I. Verifikasi Disiplin — Apakah Ada Capability/Calculation/Information Baru Diperkenalkan di Sini?

| Bagian | Diperiksa | Hasil |
|---|---|---|
| § A (Event Catalog) | Apakah ada Domain Event BARU yang didesain? | ✅ Tidak — sembilan belas event semuanya sudah ada di Phase D/E/F |
| § B.1 (Orchestration Owner) | Apakah "Orchestration Owner" diam-diam jadi Capability baru? | ✅ Tidak — dibedakan tegas dari Capability Owner |
| § C (Event Classification) | Apakah tiga jenis event yang "belum ada" (Integration/External/AI) diam-diam didesain bentuknya? | ✅ Tidak — hanya diklasifikasi JENISnya kalau/ketika muncul, tidak didesain strukturnya |
| § D-G (Criticality/Policy/Dependency/Consistency) | Apakah ada Domain Event baru, Capability baru, atau perubahan Calculation/Information? | ✅ Tidak — seluruhnya analisis KARAKTERISTIK event yang SUDAH ada di katalog, tidak menambah entitas baru |
| § H (Sintesis) | Apakah Titik Keputusan Tunggal terjawab diam-diam? | ✅ Tidak — eksplisit § H.2 "pertanyaan diajukan, bukan dijawab" |

**Verdict: ✅ Disiplin terjaga di seluruh tujuh artefak discovery — murni observasi/klasifikasi/analisis karakteristik dari baseline frozen, tidak memperkenalkan Capability/Calculation Strategy/Information Contract baru, tidak menjawab pertanyaan desain.**

---

## Assumptions

1. Sembilan belas event di Event Catalog (§ A) diasumsikan LENGKAP berdasar apa yang sudah terdokumentasi di Phase D/E/F — kalau Phase G lanjutan menemukan event lain yang belum terdaftar, Catalog perlu diperbarui sebagai bagian rutin.
2. Klasifikasi Sync/Async dan Idempotent (§ A) adalah inferensi dari sifat masing-masing event — belum divalidasi eksplisit oleh founder per baris.
3. Klasifikasi Event Classification/Criticality/Policy (§ C-E) adalah PENILAIAN AWAL berdasar pola yang konsisten dengan prinsip sudah frozen (mis. Critical selalu berpasangan Guaranteed Delivery Yes) — belum divalidasi baris-per-baris oleh founder, hanya diverifikasi TIDAK ADA anomali internal.
4. Tiga jenis event yang belum eksis (Integration/External/AI Event, § C) diasumsikan akan muncul SEIRING domain Candidate terkait (Risk/Retrieval/Reference Library) naik status Confirmed — urutan kemunculannya belum tentu sama dengan urutan itu, murni observasi korelasi.

## Log Architecture Change Request (ACR)

**Status:** Tidak ada kandidat ACR ditemukan selama penyusunan ketujuh artefak discovery (§ A-G) maupun sintesis (§ H). Titik Keputusan Tunggal BUKAN kandidat ACR — murni keputusan kebijakan orkestrasi, tidak menyentuh Capability/Calculation/Information yang frozen.

---

## Open Questions

1. **Titik Keputusan Tunggal (§ H.2)** — bagaimana founder ingin proses pasca-`EstimateVersionApproved` dikonfigurasi, dan apakah Derived Read-Model lazy/eager/hybrid?
2. Untuk tiga jenis event yang belum eksis (Integration/External/AI Event, § C) — apakah founder ingin ini diantisipasi lebih eksplisit sekarang (mis. dicatat sebagai watch-item seperti Digital Twin Cost di Phase E.1), atau cukup dibiarkan kosong sampai domain pendukungnya Confirmed?
3. Apakah klasifikasi Criticality (§ D) dan Policy (§ E) per event sudah sesuai penilaian bisnis founder, khususnya pembagian Critical/High/Medium/Low?

## Required Decisions (Approval Gate)

1. Apakah ketujuh artefak discovery (§ A-G: Event Catalog, Orchestration Discovery, Event Classification, Criticality, Policy, Dependency & Ordering, Consistency) sudah cukup lengkap sebagai fondasi sebelum Orchestration Rule Design?
2. Apakah sintesis § H (Titik Keputusan Tunggal, diperkaya konteks tujuh discovery) sudah menangkap seluruh yang perlu diketahui sebelum desain?
3. Apakah founder siap menjawab Titik Keputusan Tunggal (§ H.2) sekarang, atau ingin ini jadi langkah Orchestration Rule Design terpisah?
4. Apakah Phase G Discovery dinyatakan selesai dan siap lanjut ke Orchestration Rule Design — dengan atau tanpa gerbang validasi (Phase G.1) mengikuti pola konsisten roadmap?

---

## 🚦 APPROVAL GATE

Phase G Discovery selesai — tujuh artefak (Enterprise Event Catalog, Orchestration Discovery, Event Classification, Event Criticality & Delivery Requirement, Event Policy, Event Dependency & Ordering, Event Consistency Requirement) dijalankan berurutan tanpa melompat ke desain, disintesis jadi satu Titik Keputusan Tunggal yang diajukan (bukan dijawab), TIDAK ADA Capability/Calculation/Information baru diperkenalkan, TIDAK ADA ACR diajukan. **STOP** — menunggu arahan founder tentang Titik Keputusan Tunggal sebelum Orchestration Rule Design dimulai.

**Catatan struktural (ditambahkan setelah Discovery selesai, sebelum Rule Design):** Founder mengoreksi urutan — sebelum Titik Keputusan Tunggal (termasuk lazy/eager/hybrid) boleh dibahas, Phase G WAJIB punya fondasi filosofis terlebih dahulu, mengikuti pola Capability Philosophy (Phase D), Calculation Philosophy (Phase E), Information Philosophy (Phase F). Lihat [`08a-enterprise-orchestration-philosophy.md`](08a-enterprise-orchestration-philosophy.md) — mendefinisikan Orchestration, membedakannya dari Workflow/BPMN/Saga/Choreography, menetapkan batas tegas apa yang BOLEH dan TIDAK BOLEH dilakukan Orchestrator, plus Decision Checklist khusus. Orchestration Rule Design (termasuk Titik Keputusan Tunggal) menunggu Philosophy ini di-freeze lebih dulu.

*Dokumen selanjutnya: Enterprise Orchestration Philosophy (di atas), lalu Orchestration Rule Design (melanjutkan Phase G, menjawab Titik Keputusan Tunggal), lalu kemungkinan Phase G.1 — Orchestration Validation & Freeze.*
