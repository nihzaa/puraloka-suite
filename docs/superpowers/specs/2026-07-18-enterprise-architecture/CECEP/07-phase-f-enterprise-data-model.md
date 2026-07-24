# CECEP — Phase F: Enterprise Information Architecture (Canonical Enterprise Data Model)

> ⚠️ **SUPERSEDED.** Seluruh Ownership/Aggregate Root di dokumen ini terikat Capability Catalog CAP-001 s.d. CAP-013 yang sudah digantikan total oleh [`35-phase3-capability-architecture.md`](35-phase3-capability-architecture.md) (16 capability, Frozen Permanently via [ACR-004](04a-adr-traceability-log.md#acr-004-capability-boundary-corrections--ahsp-management-merge-resource-management-rename)). Diderivasi ulang di [`45-phase7-data-architecture.md`](45-phase7-data-architecture.md) — Fase 7 Roadmap V2, Frozen. Metodologi 10-tahap dokumen ini (Classification→Ownership→Contract→Aggregate→...→Version) tetap valid dan dipakai `45`, tapi ISI (tabel Ownership, kode CAP-XXX) JANGAN dipakai sebagai evidence. Dipertahankan sebagai jejak historis proses.

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Fase ketiga sintesis. Phase D menjawab *"capability apa dan siapa pemiliknya"*; Phase E menjawab *"bagaimana menghitung"*; Phase F menjawab *"bagaimana informasi bisnis direpresentasikan secara permanen"* — **BUKAN "Database Design"**, melainkan Enterprise Information Architecture. Database/tabel adalah IMPLEMENTASI (Phase K/L); yang dibekukan di sini adalah **informasi bisnis**, bukan skema fisik.

## Aturan Governing (Mengikat, Tidak Bisa Dilanggar Tanpa ACR)

1. **Domain Model is frozen** ([`03b`](03b-phase-c5-core-domain-discovery.md) § 🔒 FREEZE). **Capability Architecture is frozen** ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 🔒 CAPABILITY FREEZE). **Calculation Strategy is frozen** ([`06b`](06b-phase-e1-calculation-validation-freeze.md) § 🔒 CALCULATION FREEZE). Phase F TIDAK mendesain ulang domain, capability, atau strategi kalkulasi mana pun.
2. **Phase F hanya boleh menjawab**: *"Bagaimana domain/capability/calculation yang sudah frozen direpresentasikan sebagai informasi permanen?"* — bukan *"apa capability-nya"* (selesai Phase D) atau *"bagaimana menghitung"* (selesai Phase E).
3. **Urutan berpikir wajib (instruksi eksplisit founder, TIDAK BOLEH dilompati; disempurnakan dengan satu layer sisipan — Canonical Information Contract — setelah Ownership dan sebelum Aggregate):**

```
Business Meaning
       ↓
Information Model (Klasifikasi Data)
       ↓
Ownership
       ↓
Canonical Information Contract   ← layer sisipan: setiap informasi WAJIB punya kontrak lengkap
       ↓                            (Identity/Meaning/Owner/Lifecycle/Version/Allowed Mutation/
       ↓                             Consumers/Producers/Source of Truth/Derivation Rule)
       ↓                             SEBELUM boleh distrukturkan jadi Aggregate/Entity
Aggregate
       ↓
Entity
       ↓
Value Object
       ↓
Relationship
       ↓
Lifecycle
       ↓
Version
       ↓
Persistence   ← PALING TERAKHIR, di luar cakupan Phase F ini
```

**Larangan eksplisit:** TIDAK membuat Entity sebelum Information Classification (§ A), Data Ownership (§ B), DAN Canonical Information Contract (§ C) selesai. TIDAK membahas tabel/index/foreign key/partition/storage/performance di dokumen ini — itu Phase K/L.
4. **Kalau ditemukan kebutuhan yang memaksa perubahan Domain/Capability/Calculation Architecture:** hentikan analisis, dokumentasikan sebagai **Architecture Change Request (ACR)**, tunggu approval eksplisit sebelum mengubah baseline. Lihat § J untuk log ACR.
5. **Rujukan wajib:** Capability memakai ID Catalog ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 10, format `CAP-XXX`). Domain memakai istilah dari Phase C.5 ([`03b`](03b-phase-c5-core-domain-discovery.md)). Prinsip constitutional dari [`04-architecture-constitution.md`](04-architecture-constitution.md).

---

## A. Information Classification — Sebelum Satu Entity Pun Dibuat

**Prinsip:** Setiap data WAJIB diklasifikasikan ke salah satu (atau lebih) dari enam belas kelas berikut SEBELUM ditentukan menjadi Entity/Value Object apa pun. Klasifikasi ini menjawab pertanyaan berbeda dari Aggregate/Entity — ia menjawab *"apa SIFAT informasi ini"*, bukan *"bagaimana ia distrukturkan"*.

| Kelas | Definisi | Contoh dari CECEP | Konsekuensi Desain |
|---|---|---|---|
| **Reference Data** | Data rujukan eksternal, jarang berubah, bukan milik perusahaan | AHSP Nasional, Standar CBS Nasional, Conversion Rule fisik | Bootstrap sekali, append-only, tidak pernah dihapus |
| **Master Data** | Identitas inti perusahaan yang dipakai berulang lintas transaksi | Cost Code, Resource (RBS), Company CBS Template | Shared kernel — SATU sumber, direferensikan banyak tempat |
| **Transactional Data** | Catatan satu peristiwa bisnis yang terjadi pada satu titik waktu | Estimate Item, Kasbon, Progress Log | Immutable setelah dicatat sesuai konteksnya; append lebih baru bukan mutasi |
| **Derived Data** | Dihitung dari data lain, TIDAK PERNAH diinput manual | RAB, RAP, Budget, Cashflow Baseline, EVM Baseline | TIDAK PERNAH disimpan sebagai sumber kebenaran sendiri — selalu proyeksi read-time atau materialized view yang bisa dihitung ulang |
| **Computed Data** | Hasil eksekusi kalkulasi CAP-006 pada satu titik waktu | Explanation Tree, hasil evaluasi Formula | Immutable snapshot hasil satu eksekusi — beda dari Derived (yang bisa dihitung ulang kapan saja), Computed adalah CATATAN historis hasil tertentu |
| **Configuration Data** | Aturan yang mengatur PERILAKU sistem, bukan isi bisnis | Approval Chain Definition (7 dimensi), Precision Rule | Diedit lewat governance (CAP-010), bukan hardcode |
| **Knowledge Data** | Pengetahuan perusahaan yang berkembang lewat Company Intelligence Loop | Company AHSP, Price Book Entry, Productivity Record, Lessons Learned | Versioned wajib (Foundational Principle Ketiga), sumber utama AI Readiness |
| **Historical Data** | Catatan masa lalu yang tidak lagi aktif tapi tidak boleh hilang | Formula Definition Superseded, Price Book Entry Expired | Tidak dihapus, ditandai status, tetap bisa dirujuk Replay |
| **Versioned Data** | Data yang eksplisit punya rangkaian versi tercatat | Formula Definition, Calculation Strategy, Estimate Version | Setiap versi adalah objek immutable terpisah, bukan field yang di-overwrite |
| **Audit Data** | Catatan siapa/kapan/mengapa suatu perubahan terjadi | Approval event, `audit_logs` existing | Append-only, tidak pernah diedit/dihapus, bahkan oleh admin |
| **External Data** | Data yang sumber kebenarannya berada di LUAR CECEP | Data dari `project_expenses`/`kasbons` existing Puraloka Suite | Diakses lewat Integration Gateway (CAP-013), TIDAK diduplikasi ke domain CECEP |
| **Temporary Data** | Data hidup sesaat, hilang setelah tujuannya selesai | State Simulation/Sandbox (§ L Phase E) sebelum commit | Tidak pernah dipersist permanen, atau dipersist dengan TTL eksplisit |
| **Snapshot Data** | Salinan beku kondisi pada satu titik waktu, untuk perbandingan/audit | Project CBS Snapshot, Sandbox copy Price Book | Immutable, terikat ke satu titik waktu, tidak menerima update dari sumber asal setelah snapshot diambil |
| **AI Generated Data** | Konten yang diusulkan AI, BELUM divalidasi manusia | AI Recommendation (CAP-012), usulan AST dari AI (§ B.3 Phase E.1) | WAJIB berstatus "unvalidated" sampai lolos Approval Workflow — TIDAK PERNAH otomatis jadi Knowledge Data |
| **Cache Data** | Salinan sementara untuk performa, bisa dihitung ulang | Cache Strategy hasil kalkulasi (§ C.5 Phase E) | Invalidasi dipicu Domain Event, tidak pernah jadi sumber kebenaran |
| **Event Data** | Catatan bahwa sesuatu telah terjadi, dipakai memicu reaksi domain lain | Domain Event (`EstimateVersionApproved`, dst — [`05`](05-phase-d-capability-architecture.md) § F) | Immutable, append-only, urutan waktu penting (ordered log) |

**Kenapa klasifikasi ini WAJIB sebelum Entity:** Kalau langsung lompat ke "Estimate Item adalah Entity", desainer belum menjawab APAKAH Estimate Item itu Transactional (dicatat sekali, immutable) atau punya komponen Derived (total yang bisa dihitung ulang) — dua sifat itu butuh perlakuan sangat berbeda meski sama-sama "Entity" secara DDD. Klasifikasi § A menjadi INPUT wajib untuk keputusan Lifecycle (§ G) dan Version (§ H) nanti.

---

## B. Data Ownership — Siapa Memiliki Apa

**Prinsip:** Setiap kelompok informasi (bukan per-field, per-KELOMPOK bisnis bermakna) WAJIB punya SATU Capability pemilik sebelum boleh distrukturkan sebagai Aggregate. "Ownership" di sini = otoritas MENCIPTAKAN/MENGUBAH, bukan sekadar "siapa yang membaca".

| Kelompok Informasi | Kelas (§ A) | Dimiliki Capability | Rujukan |
|---|---|---|---|
| Cost Code, Resource, Unit Conversion Rule | Master Data | **CAP-001** (Identity Engine) | [`05b`](05b-phase-d1-capability-validation-freeze.md) § 10 |
| CBS Node, WBS Node, CBS Revision | Master Data + Historical | **CAP-002** (Classification Engine) | idem |
| Assembly, Company AHSP | Knowledge Data | **CAP-003** (Assembly Engine) | idem |
| Price Book Entry (4 jenis), Regional Cost Index | Knowledge Data | **CAP-004** (Pricing Engine) | idem |
| Productivity Record | Knowledge Data | **CAP-005** (Productivity Engine) | idem |
| Formula Definition, Calculation Strategy, Explanation Tree | Versioned + Computed Data | **CAP-006** (Calculation Engine) | idem |
| Risk Register, Contingency Rule | Knowledge Data | **CAP-007** (Risk Engine) | idem |
| Estimate Version, Estimate Item | Transactional + Versioned | **CAP-008** (Estimation Engine) | idem |
| Scenario | Transactional | **CAP-009** (Scenario Engine) | idem |
| Approval Chain Definition, status approval | Configuration + Audit | **CAP-010** (Workflow Engine) | idem |
| Lessons Learned, Variance, Root Cause | Knowledge Data | **CAP-011** (Intelligence Engine) | idem |
| Knowledge Asset Index (hasil pencarian) | AI Generated / Computed | **CAP-012** (Retrieval Engine) | idem |
| Data terjemahan dari sistem eksternal | External Data | **CAP-013** (Integration Gateway) | idem |

**Uji ownership sebelum lanjut (contoh konkret founder, diverifikasi satu per satu):**

| Pertanyaan Founder | Jawaban |
|---|---|
| Price dimiliki siapa? | **CAP-004 (Pricing Capability)** — bukan CAP-006, meski CAP-006 yang MENGEKSEKUSI kalkulasi yang memakainya (Konstitusi Calculation Strategy, [`06`](06-phase-e-calculation-strategy.md) § pembuka poin 6: CAP-006 mengeksekusi, capability lain memiliki knowledge) |
| Formula dimiliki siapa? | **CAP-006 (Calculation Capability)** — satu-satunya capability yang boleh memiliki logika eksekusi kalkulasi |
| Scenario dimiliki siapa? | **CAP-009 (Scenario Capability)** |
| Estimate dimiliki siapa? | **CAP-008 (Estimation Capability)** — TAPI lihat § D, "Estimate" bukan satu Aggregate tunggal, ownership ini berlaku untuk Estimate Version DAN Estimate Item sekaligus (keduanya satu Aggregate) |

**Aturan keras:** Kalau satu kelompok informasi TIDAK bisa dijawab "dimiliki siapa" dengan jawaban tunggal dari tabel [`05b`](05b-phase-d1-capability-validation-freeze.md) § 10, itu SINYAL bahwa kelompok informasi tersebut perlu dipecah lebih kecil dulu sebelum dilanjutkan ke § C — tidak ada pengecualian "kepemilikan bersama" tanpa penjelasan eksplisit (konsisten dengan Boundary Validation, [`05b`](05b-phase-d1-capability-validation-freeze.md) § 2).

---

## C. Canonical Information Contract — Layer Sisipan Sebelum Entity

**Kedudukan:** Layer BARU yang disisipkan di antara Ownership (§ B) dan Aggregate Discovery (§ D) — bukan pengganti keduanya, melainkan JEMBATAN eksplisit yang belum ada. Setiap Canonical Information (kelompok informasi bermakna bisnis, hasil § A+B) WAJIB punya kontrak lengkap SEBELUM ia boleh distrukturkan sebagai Aggregate/Entity.

**Kenapa layer ini perlu ada (alasan arsitektural, bukan sekadar dokumentasi tambahan):** Entity/Aggregate (§ D) adalah representasi INTERNAL — bagaimana CAP-XXX yang memiliki informasi itu menyimpannya. Tapi begitu Phase I (Integration Architecture) tiba, sistem LAIN (Procurement, Finance existing, bahkan Puraloka Suite modul lain) tidak boleh membaca struktur internal itu langsung — mereka membaca **Contract**-nya. Tanpa Contract eksplisit sekarang, Phase I nanti akan terpaksa "menebak" kontrak dari struktur Entity yang sebenarnya dirancang untuk keperluan internal CAP-006/CAP-004/dst, bukan untuk dikonsumsi luar — cikal bakal coupling tersembunyi yang justru dihindari sejak Phase D (Low Coupling, [`05`](05-phase-d-capability-architecture.md) § G.3).

### C.1 Sebelas Elemen Wajib per Canonical Information

**Catatan revisi (Phase F.1):** Semula sepuluh elemen — **Audit** ditambahkan sebagai elemen kesebelas setelah Information Contract Validation ([`07b`](07b-phase-f1-information-validation-freeze.md) § 15) menemukan gap: empat contoh awal (§ C.2) konsisten tidak menyebutkan mekanisme audit eksplisit, meski prinsip Auditability sudah terkunci sejak Phase B.5 ([`04`](04-architecture-constitution.md) § 5 Invariant 10) — perbedaan antara "prinsip berlaku umum" dan "kontrak informasi ini spesifik menyebut MEKANISME audit-nya" adalah gap nyata yang ditutup di sini.

| Elemen | Menjawab Pertanyaan |
|---|---|
| **Identity** | Apa pengenal permanen informasi ini? Untuk Canonical Information yang Owner-nya Aggregate ber-level **Company** (bukan Standard/National atau Project), `company_id` WAJIB menjadi bagian Identity secara eksplisit — tidak diasumsikan implisit tunggal ([`07b`](07b-phase-f1-information-validation-freeze.md) § 13) |
| **Meaning** | Apa arti bisnisnya, dalam bahasa yang sama dipakai estimator/PM (Ubiquitous Language, [`03b`](03b-phase-c5-core-domain-discovery.md) § Kosakata DDD)? |
| **Owner** | Capability mana (CAP-XXX) yang berhak menciptakan/mengubahnya (§ B)? |
| **Lifecycle** | Status apa saja yang dilaluinya (§ H, dipindah dari urutan asli mengikuti sisipan ini)? |
| **Version** | Bagaimana ia di-versioned — immutable/append-only/dst (§ I)? |
| **Allowed Mutation** | Operasi APA yang sah mengubahnya, dan lewat jalur apa (langsung? hanya via Domain Event? hanya via Approval Workflow?). Reference BARU ke Aggregate berstatus non-Active (Deprecated/Superseded/Expired) TIDAK PERNAH sah — hanya Reference LAMA yang sudah eksis sebelum status berubah yang tetap valid ([`07b`](07b-phase-f1-information-validation-freeze.md) § 5) |
| **Consumers** | Capability/sistem mana yang MEMBACA informasi ini? (setara "Read Rule") |
| **Producers** | Capability/sistem mana yang MENULIS/MEMPRODUKSI informasi ini — idealnya SATU (Owner), tapi dicatat eksplisit kalau ada producer sekunder terkontrol (mis. Lessons Learned menulis ke Price Book lewat Domain Event, § G) |
| **Source of Truth** | Di mana nilai KANONIK informasi ini berada — relevan terutama untuk Derived/Computed Data (§ A) yang bisa punya banyak representasi tapi hanya satu sumber asli |
| **Derivation Rule** | Kalau informasi ini adalah Derived/Computed Data (§ A), formula/aturan APA yang menghasilkannya, dan dari sumber mana |
| **Audit** | Domain Event/mekanisme KONKRET apa yang mencatat setiap perubahan pada informasi ini — siapa, kapan, kenapa (bukan cuma "prinsip auditability berlaku", tapi event spesifik yang mewujudkannya, mis. `PriceBookEntryVerified`) |

### C.2 Contoh Konkret — Price (Sesuai Permintaan Founder)

| Elemen | Isi untuk "Price" (Price Book Entry) |
|---|---|
| Identity | `price_entry_id` (+ `company_id` — Price Book adalah Aggregate level Company) |
| Meaning | "Harga resmi ter-versi untuk satu Resource, pada satu titik waktu, di satu lokasi, dari satu sumber" |
| Owner | **CAP-004** (Pricing Engine) |
| Lifecycle | Draft → Verified → Active → Expired ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.6) |
| Version | Immutable per entry — harga baru = entry baru, bukan edit (§ I) |
| Allowed Mutation | Hanya via alur Draft→Verified (CAP-010 Approval Workflow) — tidak pernah diedit langsung setelah Verified; tidak pernah dibuat Reference baru ke entry yang sudah Expired |
| Consumers | CAP-003 (Assembly Engine), CAP-006 (Calculation Engine via `LOOKUP`, [`06`](06-phase-e-calculation-strategy.md) § A.3) |
| Producers | **HANYA CAP-004** — tidak ada producer sekunder (berbeda dari Lessons Learned yang punya producer sekunder terkontrol) |
| Source of Truth | Price Book Entry itu sendiri — TIDAK PERNAH disalin ke Assembly/Estimate Item ([`04`](04-architecture-constitution.md) § 3.4 No Data Duplication) |
| Derivation Rule | Tidak berlaku langsung (Price adalah Knowledge Data, bukan Derived) — TAPI Regional-adjusted Price (kalau Regional Cost Index dikonfirmasi) akan punya Derivation Rule: `AdjustedPrice = BasePrice × RegionalIndex(Location)` ([`06`](06-phase-e-calculation-strategy.md) § H) |
| **Audit** | `PriceBookEntryVerified` (saat Verified) + `PriceBookEntryActivated` (dipicu otomatis saat Effective Date tercapai) + `PriceBookEntryExpired` |

**Verifikasi silang tiga pertanyaan founder lain (Formula, Scenario, Estimate) — dikonfirmasi kontraknya SUDAH tersirat lengkap di dokumen-dokumen sebelumnya, tinggal dirangkai eksplisit:**

- **Formula** (Formula Definition, CAP-006): Identity=`formula_id`; Owner=CAP-006; Lifecycle=Draft→Tested→Active→Superseded ([`06`](06-phase-e-calculation-strategy.md) § L.4); Version=immutable setelah Active; Allowed Mutation=hanya via revisi bernomor versi baru, tidak pernah edit di tempat; Consumers=SEMUA capability Layer 3-4 yang butuh kalkulasi (§ H Phase E); Producers=CAP-006 saja; Source of Truth=Formula Definition itu sendiri; Derivation Rule=tidak berlaku (Formula ADALAH aturan derivasi untuk hal lain, bukan turunan sesuatu); **Audit**=`FormulaActivated`.
- **Scenario** (CAP-009): Identity=`scenario_id` (+`company_id`, via Project); Owner=CAP-009; Lifecycle=**Active → Archived** (dua status sebenarnya — "Branching" BUKAN status yang diduduki Scenario yang sama, melainkan Domain Event `ScenarioBranched` yang MENCIPTAKAN instance Scenario baru; Scenario asal tetap Active setelah di-branch, [`07b`](07b-phase-f1-information-validation-freeze.md) § 7); Version=mutable sampai Archived; Allowed Mutation=branching (mencipta instance baru) + status transition; Consumers=pengguna langsung (estimator/PM); Producers=CAP-009 saja; Source of Truth=Scenario itu sendiri; Derivation Rule=tidak berlaku langsung (hasil komparasi 7-dimensi DERIVED dari Estimate Version yang dimilikinya, tapi Scenario sendiri bukan derivasi); **Audit**=`ScenarioBranched`/`ScenarioArchived`.
- **Estimate** (Estimate Version, CAP-008): Identity=`estimate_version_id`; Owner=CAP-008; Lifecycle=Draft→Under Review→Approved→Baseline/Frozen→Superseded; Version=immutable setelah Baseline; Allowed Mutation=hanya sebelum Approved, lewat CAP-010; Consumers=CAP-009 (Scenario), downstream read-model (RAB/RAP/dst); Producers=CAP-008 saja; Source of Truth=Estimate Version itu sendiri; Derivation Rule=tidak berlaku langsung untuk Estimate Version sendiri, TAPI Estimate Item di dalamnya punya Derivation Rule eksplisit (hasil Formula/Strategy yang dipilih); **Audit**=`EstimateVersionApproved`/`Frozen`/`Superseded`.

### C.3 Aturan Wajib untuk Seluruh Canonical Information

**Kalau satu Canonical Information TIDAK bisa mengisi kesepuluh elemen § C.1 secara lengkap, ia BELUM canonical** — tidak boleh lanjut ke § D (Aggregate Discovery) sampai kesepuluh elemen terisi. Ini bukan formalitas tambahan; ini adalah gerbang kualitas yang secara langsung akan diuji ulang di Phase F.1 (§ 15 Information Contract Validation, ditambahkan sesuai instruksi founder).

---

## D. Aggregate Discovery

**Definisi kerja (mewarisi Kosakata DDD, [`03b`](03b-phase-c5-core-domain-discovery.md) § Kosakata DDD):** Aggregate Root adalah entity yang jadi pintu masuk WAJIB untuk mengubah sekelompok data terkait. Phase C.5 sudah menjawab SEBAGIAN pertanyaan ini di level domain — § D di sini MENGKONFIRMASI ULANG dan MELENGKAPI untuk seluruh cakupan Phase D-E yang belum eksis saat Phase C.5 ditulis (Formula Definition, Calculation Strategy, dll baru muncul detail di Phase E). **Setiap Aggregate Root di bawah ini diasumsikan sudah lolos Canonical Information Contract (§ C)** — kesepuluh elemen tersirat di tabel Sumber masing-masing, tidak diulang penuh di sini untuk menghindari duplikasi dengan § C.2.

### D.1 Aggregate Root Terkonfirmasi (dari Phase C.5, TIDAK diubah)

| Aggregate Root | Owner Capability | Sumber |
|---|---|---|
| Cost Code Registry | CAP-001 | [`03b`](03b-phase-c5-core-domain-discovery.md) § A.3 |
| RBS Registry | CAP-001 | § A.5 |
| Company CBS Template | CAP-002 | § A.2 |
| Assembly (termasuk Company AHSP) | CAP-003 | § A.4 |
| Price Book Entry (per entry, bukan per Price Book) | CAP-004 | § A.6 |
| Productivity Record (per kombinasi Resource+Cost Code) | CAP-005 | § A.6b |
| Estimate Version | CAP-008 | § A.9b |
| Scenario | CAP-009 | § A.9c |
| Approval Chain Definition | CAP-010 | § A.11 |
| Lessons Learned Record | CAP-011 | § A.12 |

### D.2 Aggregate Root Baru — Muncul dari Detail Phase E (Belum Eksis di Phase C.5)

| Aggregate Root | Owner Capability | Alasan Baru Muncul di Sini |
|---|---|---|
| **Formula Definition** | CAP-006 | Phase C.5 hanya menyebut "Formula Engine (domain)" secara umum ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.7) — Phase E (§ B.2, § K) memberi struktur detail (`id`, `version`, `applicable_context`, `formula: AST`) yang BARU sekarang cukup matang untuk dikonfirmasi sebagai Aggregate Root sendiri |
| **Calculation Strategy** | CAP-006 | Konsep BARU yang lahir di Phase E § B — tidak ada padanan langsung di Phase C.5 karena Strategy Pattern belum dianalisis saat itu. Terpisah dari Formula Definition: satu Strategy MERUJUK satu Formula Definition + `applicable_context`, tapi keduanya immutable secara independen (§ K Phase E) |
| **Explanation Tree** | CAP-006 | Snapshot hasil satu eksekusi (§ I Phase E) — SELALU immutable, tidak pernah "versi baru" (beda dari dua di atas yang evolve lewat versioning) |

**Verifikasi tidak ada duplikasi dengan D.1:** Ketiganya BARU (tidak menggantikan Aggregate manapun dari D.1) — Formula Engine di Phase C.5 sekarang dipecah jadi TIGA Aggregate berbeda (Formula Definition, Calculation Strategy, Explanation Tree) karena Phase E menunjukkan ketiganya punya lifecycle dan sifat versioning berbeda (§ K Phase E: Formula Definition & Strategy immutable-setelah-Active, Explanation Tree immutable-selalu).

### D.3 Bukan Aggregate Root — Konfirmasi Ulang

| Entity | Owner Aggregate | Sumber |
|---|---|---|
| Estimate Item (child dari Estimate Version) | Estimate Version | [`03b`](03b-phase-c5-core-domain-discovery.md) § A.9a |
| CBS Node/WBS Node (child dari Template) | Company CBS Template | § A.2, § A.1 |

---

## E. Entity Model

**Metodologi:** Untuk setiap Aggregate Root (§ D), didaftarkan Entity di dalamnya (termasuk root itu sendiri, yang juga Entity). Entity = punya identitas tetap yang bertahan meski atributnya berubah ([`03b`](03b-phase-c5-core-domain-discovery.md) § Kosakata DDD — Entity).

| Aggregate Root | Entity di Dalamnya | Identitas Tetap |
|---|---|---|
| Cost Code Registry | Cost Code | `cost_code_id` |
| RBS Registry | Resource | `resource_id` |
| Company CBS Template | CBS Node, WBS Node | `cbs_node_id`, `wbs_node_id` |
| Assembly | Assembly, Sequence Step (lihat § E — sebenarnya Value Object, dikoreksi di sana) | `assembly_id` |
| Price Book Entry | (root itu sendiri adalah satu-satunya Entity di Aggregate ini) | `price_entry_id` |
| Productivity Record | (root itu sendiri) | `productivity_record_id` |
| Formula Definition | (root itu sendiri) | `formula_id` |
| Calculation Strategy | (root itu sendiri) | `strategy_id` |
| Explanation Tree | Explanation Node (satu per node AST yang dieval) | `explanation_node_id` |
| Estimate Version | Estimate Item | `estimate_version_id`, `estimate_item_id` |
| Scenario | (root itu sendiri) | `scenario_id` |
| Approval Chain Definition | (root itu sendiri) | `approval_chain_id` |
| Lessons Learned Record | Root Cause Analysis | `lessons_learned_id`, `root_cause_id` |

**Catatan Root Cause Analysis:** Dikonfirmasi ulang dari [`03b`](03b-phase-c5-core-domain-discovery.md) § A.12 sebagai Entity (bisa direvisi/didiskusikan), BUKAN Value Object — konsisten dengan analisis Phase C.5 yang sudah membedakannya dari Variance (Value Object).

---

## F. Value Object Discovery

**Prinsip:** Value Object TIDAK punya identitas sendiri — didefinisikan penuh oleh nilai atributnya ([`03b`](03b-phase-c5-core-domain-discovery.md) § Kosakata DDD). Kesalahan paling umum: menjadikan semua hal Entity padahal banyak yang cukup Value Object.

| Value Object | Dipakai di Aggregate | Kenapa BUKAN Entity |
|---|---|---|
| **Money** | Price Book Entry, Estimate Item, semua nilai finansial | Didefinisikan penuh oleh `(amount, currency)` — dua Money dengan nilai sama dianggap identik, tidak butuh ID pembanding |
| **Quantity** | Estimate Item, Assembly resource requirement | `(numeric_value, unit)` — sama seperti Money |
| **Unit** | Bagian dari Quantity, Resource | Identitas berasal dari kode satuan itu sendiri (`m3`, `kg`), bukan ID terpisah |
| **Percentage** | Waste Factor, Progress %, Retention % | `(numeric_value 0-100)` — murni nilai |
| **Formula Expression (AST)** | Formula Definition | Konten AST didefinisikan penuh oleh strukturnya — dua Formula dengan AST identik SECARA SEMANTIK boleh dianggap ekuivalen (meski `formula_id` berbeda kalau didaftarkan dua kali — ini nuansa yang perlu diperhatikan Phase F.1) |
| **Coordinate** | Regional Cost Index (kalau dikonfirmasi), lokasi Project | `(latitude, longitude)` atau referensi wilayah administratif |
| **Dimension** | Precision Rule (§ F Phase E) | `(precision_digits, rounding_mode)` |
| **Currency** | Money | Kode ISO + `precision_digits` sendiri (§ G Phase E) |
| **Tax Rate** | (belum Confirmed sebagai domain, tapi strukturnya sudah bisa diantisipasi) | `(rate_percentage, applicable_context)` — bukan Entity karena tidak punya lifecycle sendiri terpisah dari Formula yang memakainya |
| **Duration** | Assembly (sequence timing), WBS Node (planned_start/end sudah ada) | `(value, unit_of_time)` |
| **Override Resolution Record** | Bagian dari Explanation Node | `(override_level_applied, source_version)` — hasil satu resolusi § E.2 Phase E, tidak punya identitas independen dari Explanation Node induknya |
| **Confidence Level** | Price Book Entry, Productivity Record | Sudah eksplisit disebut Value Object di Phase C.5 ([`03b`](03b-phase-c5-core-domain-discovery.md) § Kosakata DDD contoh) — dikonfirmasi ulang di sini |

**Koreksi terhadap § E:** Sequence Step di dalam Assembly (disebut sebagai "Entity di dalamnya" secara tentatif di § E) **DIKOREKSI menjadi Value Object** — konsisten dengan Phase C.5 ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.4: "Sequence step... adalah Value Object — tidak punya identitas sendiri di luar urutan dalam Assembly induknya"). Ini kesalahan kecil yang tertangkap justru KARENA metodologi § E→§ F berurutan (Entity dulu, lalu diuji ulang di tahap Value Object) — bukti bahwa urutan sembilan-tahap founder bekerja sebagai jaring pengaman silang.

---

## G. Relationship Discovery

| Relationship | Antara | Jenis | Catatan |
|---|---|---|---|
| Estimate Version → Estimate Item | CAP-008 internal | **Composition** | Estimate Item tidak bisa hidup di luar Estimate Version (§ D.3) |
| Scenario → Estimate Version | CAP-009 → CAP-008 | **Aggregation** (bukan Composition) | Estimate Version tetap py identitas sendiri kalau Scenario dihapus secara konseptual (meski dalam praktik jarang terjadi) — beda dari Estimate Item yang benar-benar tak bermakna tanpa induknya |
| Estimate Item → Cost Code | CAP-008 → CAP-001 | **Reference** | Banyak-ke-satu, tidak menyalin data Cost Code |
| Estimate Item → Assembly | CAP-008 → CAP-003 | **Reference** | idem |
| Assembly → Resource (RBS) | CAP-003 → CAP-001 | **Reference**, Many-to-Many | Satu Assembly banyak Resource, satu Resource dipakai banyak Assembly |
| Formula Definition → Formula Definition lain | CAP-006 internal | **Reference** (via `variable_ref` dependency) | Membentuk Dependency Graph ([`06`](06-phase-e-calculation-strategy.md) § D) — Many-to-Many, DAG |
| Calculation Strategy → Formula Definition | CAP-006 internal | **Reference**, One-to-One per Strategy | Satu Strategy merujuk satu Formula Definition versi tertentu |
| Explanation Tree → AST | CAP-006 internal | **Snapshot** | Explanation Tree adalah salinan beku struktur AST PADA SAAT eksekusi, bukan referensi hidup — kalau Formula direvisi setelahnya, Explanation Tree lama TIDAK ikut berubah |
| Company CBS Template → Standard CBS | CAP-002 internal | **Composition dengan asal (bootstrap)** | Bukan Inheritance klasik — Company CBS "lahir dari" Standard CBS tapi lalu independen, konsisten dengan koreksi framing "Company AHSP bukan database yang sudah ada, tapi digenerate" ([`01`](01-phase-b-cost-engineering-discovery.md)) |
| Project CBS → Company CBS Template | CAP-002 internal | **Snapshot** | [`03b`](03b-phase-c5-core-domain-discovery.md) § A.2 sudah eksplisit menyebut ini snapshot |
| Lessons Learned → Estimate Version + Actual Cost | CAP-011 → CAP-008 + External | **Reference** (baca, bukan tulis) | CAP-011 membaca, tidak pernah memutasi Estimate Version yang sudah Frozen |
| Lessons Learned → Assembly/Price Book/Productivity | CAP-011 → CAP-003/004/005 | **Ownership terbatas (write via Domain Event)** | SATU-SATUNYA relationship di seluruh Enterprise Data Model yang melibatkan WRITE lintas-Aggregate-Root — dan itu HANYA lewat Domain Event terpublikasi (`LessonsLearnedPropagated`), bukan foreign key langsung — penegasan arsitektural penting yang harus diwariskan ke Phase F.1 sebagai constraint keras, DAN ini persis Producer sekunder terkontrol yang dicatat di kontrak Canonical Information (§ C.1) untuk Price Book/Productivity/Assembly |
| Approval Chain Definition → (Estimate Version \| Price Book Entry \| Lessons Learned) | CAP-010 → banyak | **Reference**, polimorfik | Satu Workflow Engine melayani banyak jenis Aggregate yang divalidasi — relationship-nya generik terhadap "apa pun yang perlu approval", bukan spesifik satu Aggregate |

**Tidak ditemukan relationship Many-to-Many yang tidak terjelaskan** — satu-satunya Many-to-Many nyata (Assembly↔Resource, Cost Code↔CBS Node) sudah dijelaskan tegas sejak Phase B.5/C.5 sebagai "sengaja bukan hierarki linear".

---

## H. Lifecycle Discovery

| Aggregate | Lifecycle States | Sumber |
|---|---|---|
| Cost Code | Draft → Active → Deprecated | [`03b`](03b-phase-c5-core-domain-discovery.md) § A.3 |
| Company CBS Template | Draft → Active → Superseded | § A.2 |
| Assembly / Company AHSP | Bootstrap → Draft Company Version → Active → Revised → Superseded | § A.4 |
| Price Book Entry | Draft → Verified → Active → Expired | § A.6 |
| Productivity Record | Bootstrap → Company Baseline → Updated | § A.6b |
| **Formula Definition** | Draft → **Tested** → Active → Superseded | [`06`](06-phase-e-calculation-strategy.md) § L.4 — Testing WAJIB sebagai syarat transisi, bukan opsional |
| **Calculation Strategy** | Draft → Active → Superseded | [`06`](06-phase-e-calculation-strategy.md) § K |
| **Explanation Tree** | (tidak punya lifecycle — lahir sudah final, immutable selalu) | idem |
| Estimate Version | Draft → Under Review → Approved → Baseline/Frozen → Superseded | [`03b`](03b-phase-c5-core-domain-discovery.md) § A.9b |
| Scenario | **Active → Archived** (dua status; "Branching" adalah Domain Event `ScenarioBranched` yang mencipta instance baru, BUKAN transisi status Scenario yang sama — koreksi [`07b`](07b-phase-f1-information-validation-freeze.md) § 7) | § A.9c |
| Lessons Learned | Draft → Under Review → Approved → **Propagated** | § A.12 |
| Approval Chain Definition | Versioned, tidak retroaktif | § A.11 |

**Pengaruh Lifecycle terhadap Entity (dikonfirmasi sesuai instruksi founder "lifecycle mempengaruhi entity"):** Setiap transisi status di atas berarti Entity tersebut TIDAK BOLEH mutable secara bebas — perubahan status adalah OPERASI BERBEDA dari edit atribut biasa, masing-masing berpotensi memicu Domain Event ([`05`](05-phase-d-capability-architecture.md) § F) dan tunduk Approval Workflow (CAP-010) tergantung Aggregate-nya. Ini BUKAN detail implementasi — ini keputusan Information Architecture: status bukan sekadar `field` biasa, ia adalah SUMBU yang menentukan operasi apa yang sah dilakukan pada Entity itu di titik waktu tertentu.

---

## I. Version Discovery

**Klasifikasi wajib per Aggregate — Immutable / Mutable / Append-Only / Snapshot / Temporal:**

| Aggregate | Klasifikasi | Alasan |
|---|---|---|
| Cost Code | **Append-only + Mutable status** | Identitas permanen, tapi status (Active/Deprecated) berubah |
| Company CBS Template | **Versioned, tiap versi immutable** | Foundational Principle Ketiga |
| Assembly / Company AHSP | **Versioned, tiap versi immutable** | idem, revisi = versi baru bukan edit |
| Price Book Entry | **Immutable per entry** | Satu entry = satu versi, harga baru = entry baru ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.6) |
| Productivity Record | **Immutable per record** | Sama pola dengan Price Book |
| **Formula Definition** | **Immutable setelah Active** | [`06`](06-phase-e-calculation-strategy.md) § K |
| **Calculation Strategy** | **Immutable setelah Active** | idem |
| **Explanation Tree** | **Immutable SELALU, tidak pernah versioned** (ia SENDIRI adalah satu snapshot) | idem — beda kategori dari "versioned", karena tidak pernah py versi kedua, ia lahir final |
| Estimate Version | **Immutable setelah Baseline/Frozen; Temporal** (terikat titik waktu proyek) | § A.9b |
| Scenario | **Mutable sampai Archived** (bisa branch) | § A.9c |
| Lessons Learned | **Immutable setelah Propagated** | § A.12 |
| **Unit Conversion Rule** | **TIDAK versioned** (pengecualian sah, sudah dikonfirmasi Phase C.5 § A.8) | Reference data matematis stabil |

**Konsekuensi klasifikasi "Temporal" untuk Estimate Version — dijawab eksplisit untuk Replay (§ 7 Phase E.1):** Karena Estimate Version terikat titik waktu proyek (2028, contoh founder Phase E.1), dan Formula/Price/Productivity yang dirujuknya immutable per versi, kombinasi ini SECARA STRUKTURAL adalah yang membuat Replay 2033 terhadap Estimate 2028 mungkin identik — Version Discovery di sini mengonfirmasi ULANG (bukan menemukan baru) bahwa desain Phase E sudah konsisten dengan klasifikasi data yang benar.

---

## J. Persistence — Sengaja TIDAK Dibahas di Sini

**Instruksi eksplisit founder:** Persistence (Table/Index/Foreign Key/Partition/Storage/Performance) adalah topik PALING TERAKHIR, dan secara eksplisit **DI LUAR cakupan Phase F** — Phase F berhenti di Version Discovery (§ I). Keputusan fisik (PostgreSQL table per Aggregate? Event sourcing untuk Domain Event? Partition per Company untuk Multi-Company?) adalah pekerjaan **Phase K (Repository Impact Analysis)** atau fase implementasi konkret, BUKAN bagian dari Enterprise Information Architecture yang dibekukan di sini.

**Kenapa pemisahan ini penting dijaga ketat:** Kalau Phase F ikut memutuskan detail fisik, Freeze di § K nanti akan mengunci keputusan implementasi bersamaan dengan keputusan informasi bisnis — padahal keduanya punya siklus perubahan yang SANGAT berbeda (skema fisik bisa berubah karena alasan performa tanpa mengubah makna bisnis informasinya sama sekali). Pemisahan ini SENDIRI adalah realisasi Replaceability ([`04`](04-architecture-constitution.md) § 5) diterapkan ke level penyimpanan.

---

## K. Log Architecture Change Request (ACR)

**Status:** Selama penyusunan Phase F ini, TIDAK ditemukan kebutuhan yang memaksa perubahan Domain/Capability/Calculation Architecture yang sudah frozen. Satu koreksi internal ditemukan (§ F — Sequence Step direklasifikasi dari Entity ke Value Object) TAPI ini BUKAN ACR karena tidak menyentuh baseline Phase C.5/D/E manapun — Phase C.5 SENDIRI sudah eksplisit menyatakan Sequence Step adalah Value Object ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.4); § E Phase F sempat salah kutip sesaat sebelum dikoreksi di § F pada dokumen yang SAMA, bukan perubahan terhadap dokumen frozen manapun.

**Format ACR (diwariskan dari Phase E, [`06`](06-phase-e-calculation-strategy.md) § O):**

```
ACR-XXX: [judul singkat]
Ditemukan saat: [aktivitas/section spesifik]
Masalah: [kenapa baseline frozen tidak cukup]
Opsi dipertimbangkan: [alternatif dalam batas frozen, kenapa gagal]
Rekomendasi: [perubahan spesifik diusulkan]
Dampak kalau disetujui: [domain/capability/calculation mana berubah]
Status: PENDING APPROVAL
```

**Tidak ada kandidat ACR ditemukan** selama penyusunan Phase F.

---

## Assumptions

1. Pemecahan "Formula Engine (domain)" dari Phase C.5 menjadi TIGA Aggregate Root terpisah (Formula Definition, Calculation Strategy, Explanation Tree) di § D.2 adalah interpretasi Phase F terhadap detail yang BARU matang di Phase E — ini bukan ACR (tidak mengubah domain frozen, hanya memperjelas struktur internal domain yang sebelumnya dianalisis di level lebih umum), tapi tetap diasumsikan valid sampai dikonfirmasi eksplisit founder.
2. Tax Rate sebagai Value Object (§ F) diasumsikan berbentuk sederhana `(rate_percentage, applicable_context)` — karena Multi Tax masih berstatus gap yang belum dielaborasi (dicatat sejak Phase D.1 § 6), struktur pastinya bisa berubah begitu domain pendukungnya diperjelas, tanpa mempengaruhi keputusan Information Architecture lain di dokumen ini.
3. Kesepuluh elemen Canonical Information Contract (§ C.1) diasumsikan CUKUP sebagai kontrak standar untuk seluruh Canonical Information — kalau Phase I (Integration Architecture) nanti menemukan kebutuhan elemen kontrak tambahan yang tidak tertangkap sepuluh ini, itu ditangani sebagai perluasan kontrak, bukan ACR (karena tidak mengubah domain/capability/calculation, hanya memperkaya cara mendeskripsikannya).

## Open Questions

1. Untuk § D.2 (tiga Aggregate Root baru dari Formula Engine) — apakah founder setuju pemecahan ini, atau lebih memilih Formula Definition dan Calculation Strategy digabung jadi satu Aggregate (dengan alasan keduanya selalu berubah bersamaan dalam praktik)?
2. Untuk Relationship "Lessons Learned → Assembly/Price Book/Productivity" (§ G, satu-satunya write lintas-Aggregate) — apakah founder ingin constraint ini (WAJIB lewat Domain Event, tidak pernah foreign key langsung) dijadikan Architectural Invariant tambahan resmi di [`04-architecture-constitution.md`](04-architecture-constitution.md), mengingat signifikansinya?
3. Untuk Canonical Information Contract (§ C) — apakah founder ingin kontrak lengkap (§ C.1, sepuluh elemen) diisi PENUH untuk SELURUH Aggregate Root di § D (bukan hanya empat contoh di § C.2) sebagai bagian dari Freeze Phase F.1, atau cukup pola/template-nya dikonfirmasi sekarang dan pengisian penuh ditunda ke saat Phase I benar-benar membutuhkannya?

## Required Decisions (Approval Gate)

1. Apakah urutan sepuluh-tahap (Business Meaning→Information Model→Ownership→**Canonical Information Contract**→Aggregate→Entity→Value Object→Relationship→Lifecycle→Version) sudah diterapkan dengan kedalaman yang memadai, termasuk layer Contract yang baru disisipkan?
2. Apakah enam belas kelas Information Classification (§ A) sudah lengkap menangkap seluruh sifat data yang relevan untuk CECEP?
3. Apakah pemecahan Formula Engine menjadi 3 Aggregate Root (§ D.2) dan reklasifikasi Sequence Step ke Value Object (§ F) sudah tepat?
4. Apakah kesepuluh elemen Canonical Information Contract (§ C.1) dan contoh Price/Formula/Scenario/Estimate (§ C.2) sudah menangkap maksud founder sebagai jembatan ke Phase I (Integration)?
5. Apakah Phase F sekarang siap ditutup dan lanjut ke validation gate — **Phase F.1 — Information Validation & Freeze** (mencakup 14 validasi yang sudah diberikan founder PLUS **Information Contract Validation** sebagai item ke-15) — sebelum Phase G (Enterprise Orchestration Architecture)?

---

## 🚦 APPROVAL GATE

Phase F (Enterprise Information Architecture) selesai — sepuluh tahap Business Meaning→Information Model→Ownership→Canonical Information Contract→Aggregate→Entity→Value Object→Relationship→Lifecycle→Version dijalankan berurutan tanpa melompat ke Persistence, di atas Domain/Capability/Calculation Architecture yang tetap frozen, TANPA satu pun ACR diajukan. **STOP** — menunggu approval eksplisit sebelum lanjut.

**Catatan struktural (ditambahkan setelah Phase F selesai):** Sebelum lanjut ke Phase G, validation gate — **Phase F.1 — Information Validation & Freeze** — sudah dijalankan, lihat [`07b-phase-f1-information-validation-freeze.md`](07b-phase-f1-information-validation-freeze.md). Tujuh koreksi/klarifikasi diterapkan (§ 16 dokumen tersebut), yang PALING signifikan: Canonical Information Contract (§ C.1 di dokumen ini) direvisi dari **sepuluh** menjadi **sebelas** elemen wajib, menambahkan **Audit** sebagai elemen tersendiri.

*Dokumen selanjutnya: Phase F.1 — Information Validation & Freeze, lalu Phase G — Enterprise Orchestration Architecture.*
