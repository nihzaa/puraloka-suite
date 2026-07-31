# CECEP — Architecture Constitution

**Kedudukan:** Dokumen ini BUKAN bagian dari urutan fase A→L. Ia adalah rujukan lintas fase (cross-phase reference) yang mengonsolidasikan seluruh prinsip governing yang sudah dikunci di Phase B, B.5, dan C ke dalam satu single source of truth. Phase D dan seterusnya WAJIB merujuk ke dokumen ini, bukan menyalin ulang atau menafsirkan ulang prinsip dari dokumen fase asalnya.

**Kenapa dokumen ini ada:** Sepanjang Phase B→C, prinsip-prinsip governing tersebar di tiga dokumen berbeda, tiap kali dikunci secara terpisah. Risikonya: begitu Phase D-L mulai merujuk prinsip, rujukan itu mudah drift (mengutip sebagian, menafsirkan ulang secara tidak sengaja, atau lupa satu prinsip karena tersembunyi di tengah dokumen discovery yang panjang). Dokumen ini menghilangkan risiko itu dengan menjadi SATU tempat yang memuat seluruh teks prinsip secara verbatim, plus tautan balik ke dokumen asal untuk konteks penuh.

**Aturan pemeliharaan:**
- Dokumen asal (`01-phase-b-cost-engineering-discovery.md`, `02-phase-b5-core-cost-engineering-architecture.md`, `03-phase-c-problem-discovery.md`) TIDAK dihapus isinya — prinsip tetap ada di sana sebagai bagian dari narasi discovery yang menjelaskan *bagaimana* prinsip itu ditemukan.
- Dokumen ini adalah representasi *hasil akhir* (apa yang berlaku), dokumen asal adalah representasi *proses* (kenapa itu berlaku).
- Kalau ada prinsip baru dikunci di Phase D ke atas, ditambahkan di sini DAN diberi tautan dari dokumen fase yang menguncinya — pola yang sama seperti B/B.5/C.
- Perubahan pada prinsip manapun di sini butuh level persetujuan yang sama seperti mengubah dokumen fase aslinya (bukan editorial ringan) — karena ini adalah lapisan konstitusi, bukan catatan kerja.

---

## Hierarki Prinsip (Cara Membaca Dokumen Ini)

```
Foundational Principles (4)      — filosofi tertinggi, lahir di Phase B & B.5
        │
Five Truth Layers (§ 8)          — filosofi inti bagaimana seluruh blueprint disusun dari atas
        │                            ke bawah: Business→Capability→Calculation→Information→Execution
        │
Decision Hierarchy (§ 9)         — hakim terakhir kalau dua layer frozen ternyata bertentangan;
        │                            dipakai SETELAH konflik terjadi, bukan mencegahnya
        │
Orchestration Separation (§ 10)  — memiliki capability ≠ memiliki orchestration; mencegah "God
        │                            Capability" dan mencegah Freeze Chain dibuka kembali secara keliru
        │
Progressive Freeze Chain (§ 7)   — governing rule lintas fase D-L, tiap lapisan dibekukan
        │                            berurutan sebelum fase berikutnya boleh membangun di atasnya;
        │                            § 7.1-7.2 mendefinisikan threshold ACR + ADR Traceability Log
        │                            (04a-adr-traceability-log.md) — SEMUA ACR dicatat permanen,
        │                            diterima maupun ditolak, bukan cuma mekanisme penolakan
Prinsip Final (10) + Architectural Constraints (6)  — konsolidasi mengikat, Phase B.5
        │
First Principles (4)             — hasil root-cause analysis, Phase C
        │
Architectural Invariants (10)    — komitmen konstitusi, tidak berubah oleh implementasi/teknologi/AI, Phase C
        │
Architecture Quality Attributes (§ 11) — 11 lensa evaluasi wajib (Scalability/Reliability/
        │                            .../Security), lahir pasca Grand Architecture Review
        │
Architecture Decision Checklist (§ 12) — 11 pertanyaan wajib sebelum SETIAP freeze, prosedur
        │                            sistematis yang menjalankan threshold ACR § 7.1
        │
Traceability sebagai Kewajiban (§ 13) — Architecture Metadata Model, dipenuhi progresif tiap
        │                            fase, BUKAN artefak/graph database terpisah
        │
Operational Perspective (§ 14)   — lintas fase I/J/K/L, BUKAN fase baru berdiri sendiri
        │
Discovery Completion Rule (§ 15) — kriteria berhenti discovery, berlaku SEMUA fase: Open
        │                            Question yang tidak mengubah Five Truth/Ownership/
        │                            Replay/Contract/Version/Structure = Deferred, lanjut Design
        │
Discovery Granularity Rule (§ 16) — kriteria KAPAN sub-topik layak jadi artefak/discovery
        │                            terpisah (ontologi baru, dibuktikan lewat tes negatif:
        │                            bukan subtype/mechanism/protocol/implementation/
        │                            specialization) vs cukup jadi bagian fase yang sedang
        │                            berjalan — mencegah fragmentasi meta-dokumen pasca-Phase G
        │
Batas Constitution                — tes "berlaku SEMUA fase & proyek, mengikat HASIL arsitektur?"
        │                            sebelum sesuatu boleh masuk sini; SOP kerja (Pre-Discovery
        │                            Framing, dst.) hidup di 13-working-methodology.md, BUKAN
        │                            di Constitution — mencegah "Constitution Bias"
        │
Constitution Freeze (§ 17)       — MULAI PHASE H: tertutup by default, tes tunggal "tanpa aturan
        │                            ini apakah CECEP bisa rusak?" — Retry/Circuit Breaker/Outbox
        │                            Pattern TIDAK PERNAH naik ke sini, tetap level Phase H
```

Setiap lapis lebih spesifik dari lapis di atasnya, tapi semuanya harus konsisten satu sama lain — kalau ditemukan pertentangan antar lapis di masa depan, itu sinyal salah satu perlu direvisi secara eksplisit (bukan diam-diam diabaikan).

---

## 1. Foundational Principles

### Foundational Principle Pertama — Company Intelligence Loop

*Sumber: [`01-phase-b-cost-engineering-discovery.md`](01-phase-b-cost-engineering-discovery.md) § CECEP Foundational Principle*

> CECEP does not replace business knowledge.
> CECEP captures, standardizes, validates, improves, and compounds business knowledge over time.
> Every completed project must make the next estimate more accurate.
> Knowledge is considered a company asset.
> No project is allowed to end without contributing new organizational knowledge.

**Company Intelligence Loop:**
```
Project → Estimate → Execution → Actual Cost → Variance → Root Cause → Lessons Learned →
Company AHSP → Price Book → Assembly Library → Calculation Strategy Improvement →
AI Training Dataset → Next Project
```

**Implikasi struktural:**
1. Root Cause Analysis adalah elemen eksplisit dalam loop — bukan cuma "catat variance", tapi "cari akar masalah" sebelum masuk Lessons Learned.
2. AI Training Dataset adalah node eksplisit — AI Estimation bukan fitur terpisah, melainkan konsumen utama Company Intelligence Loop.
3. Project Closeout TIDAK BOLEH jadi langkah administratif kosong — harus punya *gate* yang memaksa Lessons Learned/Variance/Root Cause terisi sebelum status proyek benar-benar bisa ditutup.

### Foundational Principle Kedua — CECEP adalah Company Knowledge System

*Sumber: [`02-phase-b5-core-cost-engineering-architecture.md`](02-phase-b5-core-cost-engineering-architecture.md) § Foundational Principle Kedua*

> CECEP is not a Cost Calculation System. It is a Company Knowledge System.
>
> Semua entity (Estimate, Cost Code, AHSP, Formula, Price Book, RAP, Lessons Learned, Company Standard, AI Recommendation) harus diperlakukan sebagai knowledge asset yang: versioned, traceable, explainable, reusable, continuously improved.
>
> Target akhirnya bukan menghasilkan RAB, tetapi membuat estimasi perusahaan semakin akurat setiap proyek melalui akumulasi pengetahuan.

**Dua lensa evaluasi wajib untuk setiap keputusan desain sejak Phase C:**
1. Apakah ini mendukung Company Intelligence Loop — proyek memperbaiki pengetahuan untuk proyek berikutnya?
2. Apakah entity yang didesain diperlakukan sebagai *knowledge asset* (versioned/traceable/explainable/reusable/continuously improved), bukan sekadar data transaksional?

### Foundational Principle Ketiga — Everything is Versioned

*Sumber: [`02-phase-b5-core-cost-engineering-architecture.md`](02-phase-b5-core-cost-engineering-architecture.md) § Foundational Principle Ketiga*

> Everything that affects estimation must be versioned.

Seluruh knowledge object yang mempengaruhi hasil estimasi wajib versioned: Company AHSP, Formula, Price Book, Assembly, Cost Code, Unit Conversion, Productivity Standard, Productivity Curve, Risk Library, Contingency Rule, Template, Estimate, RAP, Lessons Learned.

**Nuansa penting:** Ini adalah *default pertanyaan*, bukan *default jawaban* — "semua entity penting harus **dipertimbangkan** versioning terlebih dahulu **sebelum diputuskan** tidak perlu", bukan "semua entity wajib versioned tanpa kecuali". Yang tidak boleh terjadi adalah keputusan "tidak perlu versioning" diambil tanpa pernah dipertimbangkan sama sekali.

### Foundational Principle Keempat — Everything is Derived, Nothing is Re-entered

*Sumber: [`02-phase-b5-core-cost-engineering-architecture.md`](02-phase-b5-core-cost-engineering-architecture.md) § Foundational Principle Keempat*

> Everything is Derived, Nothing is Re-entered.

- Data hanya dimasukkan **satu kali** di sumbernya.
- Semua data lain **diturunkan** (derived) dari sumber itu.
- **Tidak boleh** ada input ulang hanya untuk memenuhi kebutuhan modul lain.

```
Estimate → RAB
Estimate → RAP
Estimate → Budget
Estimate → Material Requirement
Estimate → Procurement Plan
Estimate → Cashflow Baseline
Estimate → EVM Baseline
```

**Alasan (verbatim founder):** "Satu sumber pengetahuan, banyak keluaran, tanpa duplikasi data maupun logika bisnis."

**Relasi dengan prinsip lain:** Generalisasi dari "No Data Duplication" (§ 3 di bawah) — No Data Duplication fokus ke DATA, Everything is Derived fokus lebih luas ke PROSES/INPUT.

---

## 2. Sepuluh Prinsip Final

*Sumber: [`02-phase-b5-core-cost-engineering-architecture.md`](02-phase-b5-core-cost-engineering-architecture.md) § Sepuluh Prinsip Final — Status: FINAL, mengikat Phase C ke atas*

1. CECEP adalah **Core Cost Intelligence Platform** di dalam Puraloka Suite.
2. CECEP **bukan** sekadar Estimation Platform ataupun RAB Builder.
3. Semua keputusan biaya harus **explainable, traceable, versioned, dan reproducible**.
4. Cost Engine adalah **Decision Engine**, bukan Calculator.
5. **Tidak boleh ada duplicate source of truth.**
6. Semua Calculation Strategy harus **plug-in dan dapat diganti**.
7. Semua entity penting harus **dipertimbangkan** versioning terlebih dahulu sebelum diputuskan tidak perlu.
8. Semua output (RAB, RAP, Budget, Procurement, Cashflow, EVM, dsb.) berasal dari **Estimate Engine yang sama**.
9. Semua knowledge perusahaan harus kembali menjadi Company Knowledge melalui **Company Intelligence Loop**.
10. **Engine lebih penting daripada Module** — Module hanyalah UI/Workflow, sedangkan Engine adalah *business capability* yang reusable **lintas Puraloka Suite**, bukan cuma lintas komponen CECEP internal.

---

## 3. Enam Architectural Constraints

*Sumber: [`02-phase-b5-core-cost-engineering-architecture.md`](02-phase-b5-core-cost-engineering-architecture.md) § Enam Constraint Arsitektur Tambahan — dikunci sebelum Phase C, bukan desain teknis, melainkan batasan yang harus dijaga Phase C ke atas*

1. **Explainability — Tidak Boleh Ada Black Box.** Setiap angka output sistem, termasuk hasil AI, harus bisa dijelaskan sampai ke akar (mis. Harga Beton bisa ditelusuri ke Price Book version, Productivity version, Formula version, Waste Factor, Supplier, Wilayah, Inflasi). Lebih penting daripada AI itu sendiri — AI yang akurat tapi tidak bisa menjelaskan alasannya tetap tidak bisa dipercaya untuk keputusan finansial bernilai besar.
2. **Cost Engine sebagai Decision Engine, Bukan Calculator.** Alur wajib: `Input → Validation → Calculation → Simulation → Comparison → Recommendation → Approval → Baseline` — bukan sekadar `Input → Calculation → Output`.
3. **Scenario Comparison Lintas Dimensi.** Multi-scenario harus mendukung comparison, simulation, dan recommendation pada tujuh dimensi sekaligus (Cost, Duration, Cashflow, Risk, Margin, Resource, Profit, EVM Impact) — bukan sekadar menghasilkan beberapa versi estimate yang berdiri sendiri-sendiri.
4. **No Data Duplication — Struktural.** Harga material dkk. tidak boleh tersimpan berulang di banyak tabel (Price Book, Material, Supplier, AHSP, Assembly, Estimate). Struktur yang benar: satu sumber kebenaran (mis. Material Price Book), direferensikan — bukan disalin — oleh Assembly → Estimate → RAP.
5. **No Data Duplication — Alasan Bisnis.** Tanpa prinsip ini, setiap perubahan harga butuh update manual di 5-6 tempat berbeda, dengan risiko tinggi ada yang terlewat dan menyebabkan inkonsistensi data yang sulit dideteksi.
6. **Engine-Based Thinking, Bukan Module-Based Thinking.** Komponen CECEP dipikirkan sebagai *Engine* (business capability, reusable lintas domain) bukan *Module* (UI/workflow yang berdiri sendiri) — dianggap paling penting oleh founder di antara keenam constraint ini.

---

## 4. Empat First Principles

*Sumber: [`03-phase-c-problem-discovery.md`](03-phase-c-problem-discovery.md) § Sintesis — hasil root-cause analysis 6-lapis terhadap 9 pertanyaan Problem Discovery, masing-masing telah lolos Universality Test dan Counterfactual Test (lihat dokumen asal untuk detail penuh tiap uji).*

1. **Knowledge Must Be First-Class Citizen** — pengetahuan perusahaan (harga, produktivitas, formula, keputusan) harus punya identitas, versi, dan pemilik (organisasi, bukan individu) sejak didesain, bukan ditambahkan belakangan sebagai fitur "riwayat".
2. **System Must Be Built Per-Domain, Not Per-Module** — batas sistem harus mengikuti domain bisnis (Resource Requirement, Cost Code, Price Book sebagai layanan domain yang dipakai ulang), bukan mengikuti batas UI/modul yang menyebabkan duplikasi data.
3. **Learning Must Be Input, Not Just Output** — hasil evaluasi proyek (lessons learned, variance, root cause) harus terhubung secara struktural balik ke sumber yang dipakai estimasi berikutnya, bukan berhenti jadi laporan yang tidak pernah dibaca ulang.
4. **System Behavior Must Be Configured Data, Not Hardcoded Code** — formula, struktur CBS, dan Calculation Strategy harus berupa definisi versioned yang dieksekusi Engine generik, agar perubahan kebutuhan (standar AHSP baru, jenis pekerjaan baru) menjadi pekerjaan konfigurasi, bukan pekerjaan development.

Ringkasan hasil Universality Test: keempatnya terbukti tetap benar terlepas dari ukuran perusahaan, negara, standar AHSP, teknologi, maupun evolusi AI — dengan First Principle 1 dan 3 justru makin krusial seiring AI berkembang (AI butuh data terstruktur untuk belajar, dan butuh feedback loop agar tidak mengulang kesalahan yang sama).

---

## 5. Sepuluh Architectural Invariants

*Sumber: [`03-phase-c-problem-discovery.md`](03-phase-c-problem-discovery.md) § Architectural Invariants — komitmen konstitusi tertinggi, harus tetap benar terlepas dari bagaimana implementasi, teknologi, atau kapabilitas AI berkembang di masa depan.*

1. **Single Source of Truth** — setiap fakta punya satu tempat asal, di mana pun ia dirujuk.
2. **Explainability** — setiap keputusan/angka bisa ditelusuri sampai ke alasan dasarnya.
3. **Versioning** — setiap knowledge object yang mempengaruhi estimasi punya riwayat, bukan hanya nilai terkini.
4. **Derived Data** — data yang bisa diturunkan tidak pernah diinput ulang secara manual.
5. **Knowledge as Company Asset** — pengetahuan adalah milik organisasi, bukan properti individu yang kebetulan menciptakannya.
6. **Strategy over Formula** — cara menghitung adalah pilihan yang bisa diganti, bukan logika tunggal yang tertanam.
7. **Engine over Module** — kapabilitas dirancang untuk dipakai ulang lintas domain, bukan fitur yang berdiri sendiri.
8. **Configuration over Hardcode** — perubahan perilaku adalah pekerjaan konfigurasi, bukan pekerjaan development.
9. **Traceability** — setiap entitas bisa dilacak asal-usulnya lintas domain.
10. **Auditability** — setiap perubahan tercatat siapa, kapan, dan mengapa.

---

## 6. Status Penamaan Engine — Belum Dikunci (Catatan Penting)

*Sumber: [`02-phase-b5-core-cost-engineering-architecture.md`](02-phase-b5-core-cost-engineering-architecture.md) § Kapabilitas per Engine*

Berbeda dari seluruh prinsip di atas (yang FINAL/LOCKED), **nama Engine sengaja belum dikunci** — yang dikunci baru KAPABILITASnYA (single responsibility, input, output). Penguncian nama menunggu Phase D (Domain Model) selesai. Working names saat ini: Assembly Engine, Pricing Engine, Productivity Engine, Conversion Engine, Calculation Engine, Workflow Engine, plus dua working name belum bernama (#11 — menutup Company Intelligence Loop; #12 — mengelola Multi-Scenario Estimate). Lihat dokumen sumber untuk tabel kapabilitas lengkap.

---

## 7. Progressive Freeze Chain — Governing Rule Lintas Fase D sampai L

**Sumber:** Ditetapkan founder secara bertahap seiring setiap fase sintesis selesai — Phase D ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 🔒 CAPABILITY FREEZE), Phase E ([`06b`](06b-phase-e1-calculation-validation-freeze.md) § 🔒 CALCULATION FREEZE), dan rantai penuh D-L ditetapkan eksplisit saat menutup Phase F.

**Prinsip:** Setiap fase sintesis besar (D ke atas) menghasilkan satu lapisan arsitektur yang di-FREEZE lewat validation gate (X.1) sebelum fase berikutnya boleh mulai. Fase berikutnya HANYA boleh membangun DI ATAS lapisan yang sudah frozen — tidak pernah merombaknya. Kalau fase berikutnya menemukan kebutuhan yang memaksa perubahan pada lapisan frozen manapun, ia WAJIB berhenti, mendokumentasikan **Architecture Change Request (ACR)**, dan menunggu approval eksplisit sebelum mengubah baseline apa pun.

```
Phase D   → Capability Frozen                              (05b, 🔒 CAPABILITY FREEZE)
    ↓
Phase E   → Calculation Frozen                              (06b, 🔒 CALCULATION FREEZE)
    ↓
Phase F   → Information Frozen                               (07b, 🔒 INFORMATION FREEZE)
    ↓
Phase G   → Orchestration cannot redesign Information Model   (reframed dari "Automation" — lihat catatan)
    ↓
Phase H   → Integration cannot redesign Orchestration          (RELABEL — semula Phase I, lihat catatan urutan)
    ↓
Phase I   → AI cannot redesign Integration                     (RELABEL — semula Phase H, lihat catatan urutan)
    ↓
Phase J   → Vision cannot redesign AI/Integration
    ↓
Phase K   → Impact Analysis validates all frozen layers
    ↓
Phase L   → Documentation only documents approved architecture
```

**Catatan reframing Phase G:** Semula dibayangkan sebagai "Workflow Automation" — founder mengoreksi ini menjadi **Enterprise Orchestration Architecture**, karena begitu Capability (D), Calculation (E), dan Information (F) sudah frozen, alur bisnis lintas domain (mis. Estimate dibuat → Calculation otomatis → Material Requirement → Procurement → Cashflow → Risk → Approval → Lessons Learned) bukan lagi sekadar automation sederhana — ia adalah **orkestrasi** yang mengalir lewat Domain Event ([`05`](05-phase-d-capability-architecture.md) § F) di atas ketiga lapisan Truth yang sudah dibekukan (lihat § 8).

**Catatan relabel urutan Phase H/I (koreksi founder, permanen):** Semula Phase H = AI, Phase I = Integration (urutan mega prompt asli). Founder membalik urutan ini dengan alasan arsitektural tegas: **AI bukan pemilik sistem — AI hanya consumer**, dan yang dikonsumsi AI berasal dari Integration. Konsisten dengan rantai `Truth → Integration → Automation → AI`, BUKAN `Truth → AI → Integration` — AI secara logis berada DI ATAS Integration dalam rantai ketergantungan. **Relabel resmi: Phase H = Integration, Phase I = AI.** Detail lengkap di [`09-cecep-architecture-readiness-review-v2.md`](../enterprise-architecture-framework/09-cecep-architecture-readiness-review-v2.md) § Peta Lapisan.

**Kenapa rantai ini penting dijaga ketat (verbatim semangat founder):** Yang membedakan CECEP dari ERP konstruksi lain bukan banyaknya fitur, melainkan disiplin arsitekturnya — setiap fase menghasilkan satu lapisan yang dibekukan, fase berikutnya hanya membangun di atasnya tanpa mengubah fondasi. Pola ini membuat keseluruhan desain jauh lebih konsisten, mudah diaudit, dan tahan terhadap perubahan jangka panjang.

### 7.1 Revisi Threshold ACR (Koreksi Governance, Pasca Enterprise Architecture Audit)

**Temuan:** Audit independen (lihat rujukan Grand Architecture Review saat tersedia) menemukan bahwa sepanjang Phase D→F.1, **tidak satu pun dari sekitar dua puluh koreksi nyata** (2 dependency correction di D.1, 9 penambahan aturan di E.1, 7 koreksi termasuk elemen Audit yang hilang dari Contract di F.1) pernah diajukan sebagai ACR — semuanya diproses sebagai "Assumption" atau "klarifikasi". Founder mengoreksi ini eksplisit: **ambang ACR yang sudah berjalan terlalu tinggi**, sehingga fungsi ACR sebagai *Architecture Decision Traceability* (bukan sekadar mekanisme "tolak/tunda") tidak terpakai.

**Definisi ulang kapan sesuatu WAJIB menjadi ACR (menggantikan pemahaman implisit sebelumnya):**

| Kriteria | Contoh | Wajib ACR? |
|---|---|---|
| Perubahan **struktur** sebuah kontrak/skema yang sudah frozen (menambah/mengubah elemen wajib) | Elemen Audit ditambahkan ke Canonical Information Contract (10→11 elemen, [`07b`](07b-phase-f1-information-validation-freeze.md) § 15) | **Ya** — kontrak berubah, bukan typo |
| Keputusan yang **lahir di satu layer tapi menetapkan atribut milik layer lain** | Precision Rule (atribut RBS/Information) ditetapkan di Phase E (Calculation) sebelum Phase F memiliki domain itu ([`06`](06-phase-e-calculation-strategy.md) § F) | **Ya** — cross-layer leak, bukan sekadar "Assumption" |
| Keputusan yang **menyentuh jaminan lintas-waktu** (Replay/Audit/Versioning) | FX Rate digabung ke Unit Conversion yang eksplisit tidak di-versioned, padahal Replay butuh rate historis immutable ([`06b`](06b-phase-e1-calculation-validation-freeze.md) § 7 vs [`03b`](03b-phase-c5-core-domain-discovery.md) § C.4) | **Ya** — menyentuh Architectural Invariant Versioning |
| Koreksi murni **notasi/kejelasan dokumentasi** tanpa mengubah struktur/perilaku | Notasi lifecycle Scenario diperjelas ("Active→Archived", Branching = Domain Event bukan status, [`07b`](07b-phase-f1-information-validation-freeze.md) § 7) | Tidak — tetap dicatat di Freeze Checklist fase terkait, cukup |
| Penambahan aturan **implementasi/validasi tambahan** yang tidak mengubah kontrak/boundary yang sudah ada | Unit Compatibility Check ditambahkan ke parse-time validation ([`06b`](06b-phase-e1-calculation-validation-freeze.md) § 15 #6) | Tidak — perkuatan dalam batas yang sudah frozen |

**Prinsip pembeda:** Kalau perubahan mengubah **APA** yang dijamin kontrak/boundary (strukturnya, elemennya, jaminannya lintas waktu) — itu ACR. Kalau hanya memperjelas **BAGAIMANA** yang sudah dijamin itu dibaca/divalidasi — itu klarifikasi. Ambang lama (implisit: "kalau tidak mengubah Capability/Domain, bukan ACR") **terlalu longgar** karena tidak menangkap perubahan struktural di dalam satu layer yang sama (mis. Contract bertambah elemen tetap di layer Information, tapi tetap ACR).

### 7.2 ADR Traceability Log — Mekanisme Baru (Bukan Hanya untuk Penolakan)

**Koreksi filosofis (founder):** ACR SELAMA INI diperlakukan seolah fungsinya hanya "menolak/menunda perubahan". Padahal fungsi intinya di praktik enterprise adalah **Architecture Decision Traceability** — mencatat SETIAP keputusan arsitektur signifikan (diterima maupun ditolak), supaya developer bertahun-tahun kemudian bisa menelusuri KENAPA sebuah kontrak berbentuk begini, bukan cuma APA bentuknya.

**Mulai berlaku sejak revisi ini:** Setiap ACR yang diajukan — termasuk yang **disetujui** — dicatat permanen di **ADR Traceability Log** (bukan dihapus/dilupakan setelah diterima). Format ACR (§ format di bawah) ditambah satu field: `Keputusan Akhir` dan `Tanggal Diputuskan`.

**Format ACR standar (diperbarui):**

```
ACR-XXX: [judul singkat]
Ditemukan saat: [aktivitas/section spesifik]
Masalah: [kenapa baseline frozen tidak cukup]
Opsi dipertimbangkan: [alternatif dalam batas frozen, kenapa gagal]
Rekomendasi: [perubahan spesifik diusulkan]
Dampak kalau disetujui: [lapisan mana yang berubah, downstream apa yang terpengaruh]
Keputusan Akhir: [DITERIMA / DITOLAK / DITERIMA SEBAGIAN]
Tanggal Diputuskan: [tanggal]
Status: RESOLVED (dicatat permanen, tidak dihapus meski DITERIMA)
```

**ADR Traceability Log (indeks pusat, diisi retroaktif + berjalan ke depan):** Lihat [`04a-adr-traceability-log.md`](04a-adr-traceability-log.md) — dokumen terpisah yang mengindeks SEMUA ACR lintas seluruh fase (bukan tersebar per dokumen fase). Tiga ACR retroaktif pertama (Precision Rule leak, elemen Audit hilang, FX Rate versioning) dicatat di sana sebagai ACR-001, ACR-002, ACR-003 meski ketiganya sudah "diterima" secara substansi sebelum revisi governance ini — pencatatan retroaktif ini SENDIRI adalah bukti prinsip traceability dijalankan, bukan cuma dinyatakan.

**Status rantai saat ini:** Phase D, E, dan F sudah FREEZE ([`07b`](07b-phase-f1-information-validation-freeze.md) § 🔒 INFORMATION FREEZE). Phase G (Enterprise Orchestration Architecture) sedang berjalan — Discovery selesai, Enterprise Orchestration Philosophy sudah FREEZE dan tervalidasi lewat Phase G.0 ([`08b`](../enterprise-architecture-framework/08b-phase-g0-orchestration-philosophy-validation.md)), **Orchestration Rule Design sedang berjalan** ([`08c`](../enterprise-architecture-framework/08c-orchestration-rule-design.md)). Governing rule masing-masing (poin di diagram atas) berlaku otomatis begitu fase itu dimulai, tidak perlu ditetapkan ulang dari nol.

---

## 8. Five Truth Layers — Filosofi Inti Penyusunan Blueprint

**Sumber:** Diidentifikasi founder sebagai pola besar yang secara alami muncul dari urutan Phase B→C→D→E→F — bukan didesain dari awal, ditemukan SETELAH pola itu sendiri terlihat konsisten lewat lima fase pertama. Dikodifikasi di sini sebagai filosofi inti karena "menjelaskan bagaimana seluruh blueprint disusun dari atas ke bawah" (verbatim founder).

```
Layer 1 — Business Truth        (Phase B, B.5 — apa yang benar secara bisnis)
        ↓
Layer 2 — Capability Truth      (Phase D, D.1 — apa yang benar secara tanggung jawab sistem)
        ↓
Layer 3 — Calculation Truth     (Phase E, E.1 — apa yang benar secara cara menghitung)
        ↓
Layer 4 — Information Truth     (Phase F, F.1 — apa yang benar secara representasi data)
        ↓
Layer 5 — Execution Truth       (Phase G ke atas — apa yang benar secara bagaimana sistem
                                  benar-benar berjalan: orkestrasi, AI, integrasi)
```

**Prinsip governing:** Automation (Phase G), AI (Phase H), dan Integration (Phase I) TIDAK PERNAH menciptakan truth baru — mereka HANYA memakai (consume) kelima Truth Layer yang sudah dibekukan di Layer 1-4. Kalau Phase G/H/I menemukan dirinya perlu "memutuskan" sesuatu yang seharusnya sudah dijawab Layer 1-4 (mis. AI mendefinisikan capability baru, atau Orchestration menciptakan aturan kalkulasi baru), itu SINYAL pelanggaran — harus berhenti dan diajukan sebagai ACR ke layer yang relevan (§ 7), bukan diputuskan sendiri di Layer 5.

**Kenapa ini penting secara khusus untuk AI (Phase H):** Karena AI beroperasi di atas Layer 2+3+4 yang SUDAH explainable (Capability jelas, Calculation Explainability Chain sudah ada sejak Phase E § I, Information sudah canonical sejak Phase F § C) — AI tidak pernah melihat database mentah, ia melihat Capability + Calculation + Information yang sudah terstruktur dan bermakna. Ini adalah alasan STRUKTURAL (bukan sekadar niat baik) kenapa CECEP secara alami AI-explainable — bukan fitur yang perlu "ditambahkan" di Phase H, melainkan konsekuensi dari kelima Truth Layer yang dibangun sejak awal.

**Relasi dengan Progressive Freeze Chain (§ 7):** Freeze Chain adalah MEKANISME (bagaimana tiap layer dikunci berurutan lewat validation gate X.1); Five Truth Layers adalah FILOSOFI (kenapa urutan itu masuk akal — setiap layer menjawab jenis pertanyaan kebenaran yang berbeda, dan pertanyaan tipe Layer N+1 tidak bisa dijawab benar sebelum Layer N stabil).

---

## 9. Decision Hierarchy — Hakim Terakhir untuk Konflik Desain

**Sumber:** Diminta founder eksplisit sebagai pelengkap Five Truth Layers (§ 8) — Truth Layers menjelaskan URUTAN kebenaran dibangun, Decision Hierarchy menjelaskan SIAPA MENANG kalau dua lapisan yang sudah frozen ternyata bertentangan saat implementasi. Constitution sudah punya Foundational Principles, Constraints, Invariants, Freeze Chain, dan Truth Layers — tapi belum punya mekanisme resolusi konflik eksplisit sampai poin ini ditambahkan.

**Kedudukan:** Decision Hierarchy TIDAK dipakai untuk mencegah konflik (itu tugas Freeze Chain, § 7) — ia dipakai SETELAH konflik terjadi, sebagai jawaban cepat yang tidak butuh diskusi ulang panjang setiap kali insiden muncul, terutama krusial begitu banyak developer mulai mengerjakan implementasi bertahun-tahun ke depan tanpa konteks percakapan penuh yang membentuk keputusan ini.

### 9.1 Hierarki Lima Truth (Konflik Antar-Layer)

```
Business Truth        >  Capability Truth  >  Calculation Truth  >  Information Truth  >  Persistence Truth
(Phase B/B.5)             (Phase D/D.1)         (Phase E/E.1)          (Phase F/F.1)         (implementasi fisik)
```

**Cara membaca:** Layer di sebelah KIRI selalu menang atas layer di sebelah KANAN kalau keduanya bertentangan. Contoh konkret yang diberikan founder:

| Skenario Konflik | Siapa Menang | Kenapa |
|---|---|---|
| Calculation ingin berubah, tapi bertentangan dengan Capability yang sudah frozen | **Capability menang** | Capability Truth (Layer 2) lebih fundamental dari Calculation Truth (Layer 3) — kalau Calculation butuh perubahan Capability, itu WAJIB lewat ACR ke Phase D ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 🔒), bukan diam-diam dikerjakan di level Calculation |
| Persistence ingin lebih cepat (mis. denormalisasi), tapi melanggar Information Contract | **Information menang** | Information Truth (Layer 4) lebih fundamental dari Persistence Truth (Layer 5/implementasi) — optimasi performa TIDAK PERNAH sah sebagai alasan melanggar Canonical Information Contract ([`07`](07-phase-f-enterprise-data-model.md) § C); solusi performa harus dicari DI DALAM batas kontrak (cache, index, dsb — bukan mengubah makna informasinya) |
| AI (Phase H, Execution Truth) merekomendasikan sesuatu yang bertentangan dengan Calculation Truth (mis. AI ingin bypass Formula Language) | **Calculation menang** | Konsisten dengan Konstitusi Calculation Strategy ([`06`](06-phase-e-calculation-strategy.md) § pembuka poin 6) dan § N — ini contoh KONKRET Decision Hierarchy menjelaskan alasan struktural mengapa AI tidak boleh bypass CAP-006, bukan sekadar aturan berdiri sendiri |
| Business requirement baru (mis. model bisnis berubah) bertentangan dengan Capability yang sudah frozen | **Business menang** — TAPI lewat jalur resmi | Business Truth adalah Layer 1, tertinggi — tapi "menang" di sini berarti memicu ACR resmi ke Phase D (bukan override diam-diam), karena perubahan Business Truth yang sudah pernah dikunci di Phase B/B.5 juga signifikan dan perlu proses yang sama ketatnya |

### 9.2 Arsitektur Decision Priority (Tujuh Lapis, Cakupan Lebih Luas dari 9.1)

**Kedudukan:** Bab tambahan yang diusulkan founder untuk masa depan — dicatat sekarang sebagai referensi, TIDAK perlu difinalisasi sepenuhnya sampai Phase K/L (Implementation) benar-benar relevan. Berbeda dari § 9.1 (lima Truth Layer, murni tentang ARSITEKTUR), tujuh lapis ini memasukkan Constitution ITU SENDIRI dan Implementation sebagai entitas eksplisit dalam hierarki:

```
1. Business Truth
2. Architecture Constitution        ← dokumen ini sendiri, sebagai "UUD"
3. Capability
4. Calculation
5. Information
6. Persistence
7. Implementation                   ← kode, konfigurasi, deployment nyata
```

**Kenapa Architecture Constitution muncul sebagai lapis TERSENDIRI (bukan melebur ke Business Truth):** Constitution bisa mengandung prinsip yang levelnya LEBIH TINGGI dari satu keputusan bisnis spesifik manapun (mis. Architectural Invariant "Explainability", [`04`](04-architecture-constitution.md) § 5, berlaku LINTAS semua Business Truth yang pernah/akan dikunci) — memberinya lapis sendiri menegaskan bahwa mengubah Constitution butuh proses SETARA mengubah Business Truth, bukan sekadar "aturan teknis" yang bisa direvisi ringan.

**Status:** Belum menjadi mekanisme resolusi aktif — § 9.1 (Lima Truth) sudah cukup dan SIAP dipakai sekarang untuk konflik yang mungkin muncul mulai Phase F.1 dan seterusnya. § 9.2 dicatat sebagai perluasan yang akan diaktifkan penuh saat Phase K/L membutuhkan pembedaan eksplisit antara "keputusan arsitektur" dan "keputusan implementasi" — keduanya belum perlu dibedakan tajam selama masih di fase perencanaan (Phase D-J).

---

## 10. Orchestration Separation Principle

**Sumber:** Lahir dari temuan [`07c-orchestration-readiness-assessment.md`](07c-orchestration-readiness-assessment.md) — dua gap yang ditemukan assessment tersebut (menjembatani Estimate Version Approved ke Procurement existing, dan ke pembangkitan Derived Read-Model) sempat salah dibaca sebagai "kemungkinan Capability yang hilang". Founder mengoreksi pembacaan ini: kedua gap BUKAN pertanyaan kepemilikan data (itu sudah dijawab tuntas Phase D/D.1) — keduanya pertanyaan MURNI orkestrasi (siapa memutuskan urutan dan pemicu proses lintas capability), yang secara definisi adalah cakupan Phase G, belum pernah dan tidak perlu dijawab di Phase D.

**Prinsip (verbatim, level Architectural Constraint/Invariant baru):**

> A capability never owns orchestration simply because it owns the data.
>
> Owning a capability does not imply owning the orchestration. Orchestration is a separate architectural concern that coordinates already-frozen capabilities through events and contracts without changing their responsibilities.

**Konsekuensi langsung:**
1. **Menemukan "belum ada yang mengorkestrasi proses X" TIDAK PERNAH secara otomatis berarti "Capability Architecture kurang lengkap"** — itu hanya berarti Phase G (Orchestration) belum dikerjakan. Progressive Freeze Chain (§ 7) TIDAK dilanggar oleh gap semacam ini; membuka kembali Phase D untuk gap orkestrasi murni JUSTRU melanggar Freeze Chain.
2. **Tidak ada Capability yang boleh diperluas Boundary-nya untuk "sekalian" menangani orkestrasi** hanya karena kebetulan ia paling dekat secara topikal (godaan konkret: CAP-013/Integration Gateway diperluas untuk menangani arah integrasi baru) — ini justru menciptakan **"God Capability"** yang melanggar Single Responsibility yang sudah dijaga ketat sejak Phase D ([`05`](05-phase-d-capability-architecture.md) § G.1).
3. **Sinyal untuk membedakan "ini gap Capability" vs "ini gap Orchestration":** kalau jawabannya *"siapa MEMILIKI data/knowledge ini"* tidak terjawab dari Capability Catalog ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 10) — itu gap Capability, ACR ke Phase D. Kalau jawabannya *"kapan/dalam urutan apa/dipicu oleh apa proses ini berjalan lintas capability yang SUDAH punya pemilik jelas"* — itu gap Orchestration, agenda Phase G, TIDAK butuh ACR.

**Contoh penerapan (dari Orchestration Readiness Assessment):** "Siapa memiliki Estimate Version" → CAP-008, sudah terjawab tuntas. "Siapa memiliki Price Book" → CAP-004, sudah terjawab tuntas. Tapi "APAKAH `EstimateVersionApproved` otomatis memicu `Generate Procurement`, `Generate RAP`, `Generate Material Requirement`, atau kombinasi tertentu, dan DALAM URUTAN APA" — TIDAK PERNAH punya satu jawaban benar tunggal secara arsitektural (berbeda perusahaan, berbeda kebijakan, sama seperti Configurable Approval Workflow, CAP-010, sengaja tidak hardcode). Itu adalah **Orchestration Rule**, keputusan konfigurasi Phase G, bukan pertanyaan kepemilikan Capability.

**Relasi dengan Five Truth Layers (§ 8) dan Decision Hierarchy (§ 9):** Prinsip ini adalah PENERAPAN LANGSUNG dari batas Layer 2 (Capability Truth) vs Layer 5 (Execution Truth) — Orchestration Rule hidup di Layer 5, ia MENGONSUMSI Capability/Calculation/Information Truth (Layer 2-4) tanpa pernah menciptakan truth baru di layer manapun di bawahnya, persis prinsip governing § 8 yang sudah dikunci.

---

## 11. Architecture Quality Attributes

**Sumber:** Ditetapkan founder pasca-Grand Architecture Review — Constitution sebelumnya sudah punya Foundational Principles, Constraints, Invariants, Truth Layers, Decision Hierarchy, dan Orchestration Separation, tapi belum punya daftar **atribut kualitas eksplisit** yang WAJIB dipenuhi setiap fase berikutnya (Phase G Design ke atas). Sebelas atribut ini bukan prinsip baru — mereka adalah *lensa evaluasi* yang menerjemahkan prinsip-prinsip di atas jadi pertanyaan konkret yang bisa diuji per keputusan desain.

| Atribut | Definisi Kerja untuk CECEP | Prinsip yang Diwarisi |
|---|---|---|
| **Scalability** | Arsitektur harus tetap valid pada skala berapa pun TANPA REDESIGN — perubahan skala hanya boleh berarti perubahan *implementasi* (index, partisi, cache), tidak pernah perubahan *struktur* (Aggregate baru, Capability baru, kontrak berubah bentuk) | Five Truth Layers § 8 — Persistence Truth tunduk pada Information Truth |
| **Reliability** | Sistem menghasilkan hasil yang SAMA untuk input yang sama, kapan pun dieksekusi (Deterministic Result, [`06b`](06b-phase-e1-calculation-validation-freeze.md) § 14) | Calculation Constitution, [`06`](06-phase-e-calculation-strategy.md) § pembuka |
| **Availability** | Kegagalan satu Capability tidak boleh mengunci seluruh sistem — Non-Responsibility ([`05`](05-phase-d-capability-architecture.md) § F) menjaga blast radius kegagalan tetap sempit | Single Responsibility, Orchestration Separation § 10 |
| **Maintainability** | Perubahan pada satu Capability tidak memaksa perubahan pada Capability lain yang tidak terkait (No Shotgun Surgery) | Boundary + Non-Responsibility, [`05`](05-phase-d-capability-architecture.md) § F |
| **Evolvability** | Fitur/konsep baru (Carbon Cost, AI, Digital Twin, dst) harus tertampung lewat Extension Point/knowledge-as-data, TANPA mengubah struktur inti ([`06b`](06b-phase-e1-calculation-validation-freeze.md) § 12) | First Principle 4 — Configured Data, bukan Hardcoded Code |
| **Auditability** | Setiap perubahan tercatat siapa/kapan/mengapa — sudah Architectural Invariant sejak Phase C | [`04`](04-architecture-constitution.md) § 5 Invariant 10 |
| **Explainability** | Setiap angka/keputusan bisa ditelusuri sampai akar — sudah Architectural Invariant sejak Phase C, diperkuat Explanation Tree otomatis ([`06`](06-phase-e-calculation-strategy.md) § I) | § 5 Invariant 2 |
| **Traceability** | Setiap konsep bisnis (Estimate, Price, dst) bisa ditelusuri lintas SELURUH layer (Domain→Capability→Entity→Calculation→Event→Contract) — **atribut yang paling lemah saat ini**, lihat § 13 di bawah | § 5 Invariant 9, diperkuat sebagai atribut formal di sini |
| **Observability** | Sistem harus bisa DIAMATI kondisi/perilakunya saat berjalan — belum punya mekanisme konkret, dicatat sebagai kewajiban Operational Perspective (§ 14) mulai Phase I ke atas | Baru, lahir dari Grand Architecture Review |
| **Recoverability** | Sistem harus bisa dipulihkan ke state valid setelah kegagalan (data maupun proses) tanpa kehilangan jaminan Auditability/Replay — belum punya mekanisme konkret, dicatat sebagai kewajiban Operational Perspective (§ 14) | Baru, lahir dari Grand Architecture Review |
| **Security & Compliance** | Akses ke Canonical Information Contract harus terkontrol (siapa boleh baca/tulis apa), dan sistem harus bisa memenuhi kebutuhan audit regulator eksternal | Baru, lahir dari Grand Architecture Review |

**Cara pakai:** Sebelas atribut ini BUKAN checklist terpisah yang dijalankan sekali di akhir — mereka adalah PERTANYAAN yang harus bisa dijawab untuk setiap keputusan desain besar mulai Phase G Design ke atas, sama seperti Architecture Quality Review 12-prinsip sudah dilakukan untuk Phase D ([`05`](05-phase-d-capability-architecture.md) § G). Tiga atribut terakhir (Observability, Recoverability, Security & Compliance) SENGAJA belum punya mekanisme konkret — status mereka adalah **"prinsip terkunci, implementasi menyusul sebagai perspektif lintas-fase"** (lihat § 14), BUKAN "belum dikerjakan sama sekali".

**Klarifikasi penting — "banyak dependency" BUKAN otomatis pelanggaran Maintainability/Single Responsibility:** Grand Architecture Review sempat melabeli CAP-008 (Estimation Engine, 6-7 upstream dependency, [`05`](05-phase-d-capability-architecture.md) § G.3) sebagai "God Capability laten". Founder mengoreksi framing ini: **Estimation Engine memang Orchestrator** — sebuah Orchestrator SECARA WAJAR memiliki dependency terbanyak, itu bagian dari perannya, bukan gejala penyakit. **Uji yang benar bukan JUMLAH dependency, tapi APAKAH dependency itu diam-diam membuatnya memiliki OWNERSHIP atas domain yang bukan miliknya** (sinyal pembeda yang sama dengan Orchestration Separation Principle, § 10). Selama CAP-008 tetap hanya MENGONSUMSI kontrak Capability lain tanpa pernah menciptakan/mengubah data yang bukan Estimate Version/Item miliknya sendiri ([`05`](05-phase-d-capability-architecture.md) § F.8 Non-Responsibility), banyaknya dependency tetap AMAN — ini murni konsekuensi struktural dari perannya sebagai titik orkestrasi (Layer 4), bukan smell yang perlu diperbaiki.

---

## 12. Architecture Decision Checklist

**Sumber:** Pelengkap § 7.1 (Revisi Threshold ACR) — kalau § 7.1 mendefinisikan JENIS perubahan yang wajib ACR, checklist ini adalah PERTANYAAN OPERASIONAL yang dijalankan SEBELUM setiap freeze (Phase X.1 manapun) untuk mendeteksi jenis perubahan itu secara sistematis, bukan menunggu ditemukan tidak sengaja.

**Sebelas pertanyaan wajib, dijalankan terhadap SETIAP keputusan besar sebelum sebuah fase dinyatakan freeze:**

1. Apakah ini melanggar Single Source of Truth?
2. Apakah ini menambah Ownership baru (Capability/Domain) yang belum ada di Catalog?
3. Apakah ini menambah Truth Layer baru di luar Five Truth Layers (§ 8)?
4. Apakah ini menambah circular dependency (structural, bukan temporal-feedback yang sudah dikonfirmasi sah)?
5. Apakah ini mengubah jaminan Replay?
6. Apakah ini mengubah jaminan Version (immutable/mutable/append-only/snapshot/temporal)?
7. Apakah ini mengubah jaminan Audit?
8. Apakah ini mengubah jaminan Explainability?
9. Apakah ini mengubah Capability Boundary yang sudah frozen?
10. Apakah ini mengubah Canonical Information Contract yang sudah frozen?
11. Apakah ini mengubah Domain Ownership yang sudah frozen?

**Aturan:** Kalau jawaban SALAH SATU pertanyaan di atas "Ya" — perubahan itu WAJIB ACR ([`04a`](04a-adr-traceability-log.md)), TIDAK BOLEH diproses sebagai "Assumption" atau "klarifikasi". Kalau SEMUA jawaban "Tidak" — perubahan itu sah diproses sebagai penguatan/klarifikasi dalam batas frozen, konsisten pola yang sudah berjalan sejak Phase E.1/F.1.

**Kapan checklist ini dijalankan:** Sebagai bagian WAJIB dari setiap validation gate (X.1) SEBELUM status FREEZE diberikan — bukan retroaktif setelah freeze seperti tiga ACR pertama ([`04a`](04a-adr-traceability-log.md)). Mulai Phase G.1 (kalau/ketika dijalankan) dan seterusnya, checklist ini WAJIB muncul eksplisit sebagai section tersendiri di setiap dokumen X.1, sebelum bagian "🔒 FREEZE".

**Relasi dengan § 7.1:** § 7.1 memberi CONTOH konkret (tabel kriteria); checklist ini memberi PROSEDUR sistematis (sebelas pertanyaan berurutan) yang menjalankan kriteria itu tanpa bergantung pada apakah reviewer kebetulan menyadari pola yang cocok dengan salah satu contoh di § 7.1.

---

## 13. Traceability sebagai Kewajiban, Bukan Artefak Terpisah

**Sumber:** Koreksi founder terhadap rekomendasi awal Grand Architecture Review — audit sempat mengusulkan "Architecture Knowledge Graph" sebagai artefak baru berdiri sendiri. Founder mengoreksi DUA hal: (1) nama "Knowledge Graph" menyesatkan (menyiratkan graph database/Neo4j, padahal yang dibutuhkan adalah **metadata terstruktur**, bukan infrastruktur baru), (2) ini seharusnya jadi KEWAJIBAN kualitas (§ 11, Traceability) yang dipenuhi progresif setiap fase, bukan proyek terpisah yang dikerjakan sekali di akhir.

**Istilah resmi:** **Architecture Metadata Model** (bukan "Knowledge Graph") — satu baris metadata per konsep bisnis (mis. "Estimate", "Price"), berisi rujukan eksplisit ke representasinya di setiap layer: Owner Domain → Capability (CAP-XXX) → Engine → Aggregate/Entity → Calculation class → Event → Workflow (Phase G) → API (Phase I) → Permission → AI accessibility (Phase H) → Audit Event → Version rule.

**Kewajiban progresif (bukan artefak sekali-jadi):** Setiap kali sebuah fase mengunci representasi baru dari sebuah konsep (mis. Phase G mengunci Workflow untuk "Estimate", Phase I nanti mengunci API untuk "Estimate"), baris metadata konsep itu WAJIB diperbarui sebagai bagian dari validation gate fase tersebut — bukan ditunda sampai Phase K/L. Format dan lokasi persis dokumen ini ditentukan saat Phase G.1 (atau validation gate berikutnya) dikerjakan, BUKAN sekarang — § ini hanya mengunci KEWAJIBANnya, bukan mendesain strukturnya (konsisten dengan disiplin "jangan desain solusi sebelum discovery selesai" yang sudah dipegang sejak Phase G).

---

## 14. Operational Perspective — Lintas Fase, Bukan Fase Berdiri Sendiri

**Sumber:** Koreksi founder terhadap rekomendasi awal Grand Architecture Review — audit sempat mengusulkan "Phase Operational Architecture" sebagai fase baru berdiri sendiri. Founder mengoreksi: itu akan merusak keanggunan roadmap A-L yang sudah ada. Operational Architecture (backup/DR/observability/retention/legal-hold/schema evolution/rollback deployment/dst) seharusnya menjadi **perspektif yang WAJIB dijawab di dalam fase yang sudah ada**, bukan fase terpisah.

**Pemetaan wajib (mengikat mulai fase terkait dimulai):**

| Fase yang Sudah Ada | Perspektif Operational Wajib Ditambahkan |
|---|---|
| **Phase H — Integration Architecture** | **Operational Integration** — bagaimana integrasi (termasuk ACL/Integration Gateway, CAP-013) bertahan terhadap kegagalan jaringan, retry, dead-letter, schema evolution pihak eksternal |
| **Phase J — Future Vision** | **Operational Evolution** — bagaimana sistem berevolusi operasional (deployment baru, migrasi versi Engine) tanpa mengorbankan Replay/Audit yang sudah dijanjikan ke data lama |
| **Phase K — Impact Analysis** | **Deployment Impact** — dampak operasional dari setiap keputusan arsitektur: backup strategy, storage growth (append-only-never-delete, temuan Grand Review Worst Case), tenant migration |
| **Phase L — Documentation** | **Operational Blueprint** — dokumentasi operasional lengkap (runbook, DR plan, retention policy, legal hold procedure) sebagai BAGIAN dari dokumentasi final, bukan lampiran terpisah |

**Prinsip:** Operational Perspective TIDAK PERNAH punya "pemilik fase tunggal" — ia adalah pertanyaan yang WAJIB dijawab ulang di setiap fase yang relevan, karena sifat operasionalnya berbeda-beda tergantung apa yang sedang dibangun fase itu (integrasi punya kebutuhan operational berbeda dari deployment). Ini konsisten dengan Orchestration Separation Principle (§ 10) diterapkan ke domain berbeda: *memiliki fase tidak berarti memiliki seluruh perspektif yang relevan terhadapnya — Operational adalah concern lintas-fase, bukan concern satu fase.*

**Status saat ini:** Tiga atribut kualitas terkait (Observability, Recoverability, Security & Compliance, § 11) sudah TERKUNCI sebagai prinsip wajib — implementasinya menyusul progresif begitu Phase I/J/K/L masing-masing dimulai, sesuai pemetaan tabel di atas.

---

## 15. Discovery Completion Rule

**Sumber:** [`08j-discovery-completion-assessment.md`](../enterprise-architecture-framework/08j-discovery-completion-assessment.md) (Phase G, Rule Design). Founder eksplisit meminta prinsip ini diangkat ke Constitution — bukan hanya berlaku untuk rantai discovery `08d`-`08i`, tapi untuk SETIAP rantai discovery di fase mana pun (Phase H, I, J, K, L, dan discovery lanjutan apa pun di masa depan).

**Masalah yang dijawab:** Tanpa kriteria berhenti yang eksplisit, discovery bisa berlanjut tanpa batas — setiap dokumen discovery baru hampir selalu bisa menemukan SATU istilah lagi yang bisa dipertajam, SATU sudut pandang lagi yang belum diuji. Pola ini terbukti nyata di Phase G: rantai `08d`→`08e`→`08f` mengubah desain secara fundamental (Rule Design v1 harus ditulis ulang total), tapi `08g`→`08h`→`08i` hanya memperkaya presisi tanpa mengubah satu pun keputusan struktural — sinyal bahwa titik "cukup" sudah terlewati dan discovery lanjutan sudah masuk diminishing returns.

**Prinsip (verbatim founder):**

> Discovery dianggap selesai ketika seluruh Open Question yang tersisa **tidak lagi berpotensi mengubah struktur arsitektur**, melainkan hanya memengaruhi terminologi, metadata, dokumentasi, atau presisi konseptual.

**Kriteria uji per Open Question (dipakai bersama Architecture Decision Checklist, § 12):** *Kalau jawaban pertanyaan ini berubah, apakah desain yang sedang dibangun harus berubah SECARA FUNDAMENTAL pada salah satu dari enam sumbu berikut — Five Truth Layers, Ownership, Replay, Contract, Version, atau Structure?*

- **Ya** → Open Question ini WAJIB diselesaikan dulu sebelum lanjut ke Design (discovery belum selesai).
- **Tidak** → ditandai **Deferred Refinement**, dicatat sebagai backlog dokumentasi ringan, dan discovery LANJUT ke Design tanpa menunggu jawabannya.

**Prosedur formal — Discovery Completion Assessment:** Sebelum sebuah rantai discovery dianggap tuntas dan Design boleh dimulai, seluruh Open Question yang terkumpul sepanjang rantai itu (dari SEMUA dokumen discovery, bukan hanya dokumen terakhir) dikumpulkan dalam satu tabel dan diuji satu per satu terhadap kriteria di atas — pola yang dipakai pertama kali di [`08j`](../enterprise-architecture-framework/08j-discovery-completion-assessment.md).

**Kenapa ini BUKAN alasan untuk terburu-buru:** Prinsip ini tidak membalikkan disiplin "jangan menyimpulkan terlalu cepat" yang sudah berkali-kali terbukti bernilai sepanjang CECEP (Momentum Bias, dsb.) — Discovery Completion Rule hanya berlaku SETELAH sebuah discovery genuinely dijalankan dan Open Question-nya sudah eksplisit terdaftar, bukan sebagai izin melewati discovery yang belum dilakukan. Keduanya saling melengkapi: jangan berhenti sebelum discovery menemukan gap struktural yang nyata (disiplin lama), tapi juga jangan melanjutkan discovery yang tersisa hanya memoles presisi tanpa efek struktural (disiplin baru).

---

## 16. Discovery Granularity Rule

**Sumber:** Koreksi founder pasca-Phase G, di titik transisi ke Phase H. Setelah § 15 (Discovery Completion Rule) berhasil mencegah discovery berlarut-larut TANPA berhenti, founder mengidentifikasi risiko BERLAWANAN yang mulai muncul: dokumen meta (Transition Brief, Master Index, Glossary) yang baru lahir bernilai nyata, TAPI berpotensi menjadi kebiasaan baru — "setiap menemukan ide bagus, buat dokumen baru" — yang secara bertahap memecah satu domain (mis. Integration) menjadi puluhan dokumen kecil per-sub-topik (Retry Discovery, Retry Philosophy, Retry Validation, Timeout Discovery, dst.), sebuah bentuk fragmentasi BARU yang berbeda dari Momentum Bias tapi sama merugikannya.

**Masalah yang dijawab:** § 15 menjawab "kapan discovery BERHENTI". Prinsip ini menjawab pertanyaan yang lebih awal: "kapan sesuatu LAYAK jadi discovery/philosophy TERPISAH sejak awal, dan kapan ia cukup jadi SATU BAGIAN dari discovery yang lebih besar." Tanpa batas ini, kesuksesan pola tujuh-lapisan Phase G bisa disalahartikan sebagai "setiap sub-topik butuh tujuh lapisannya sendiri" — padahal itu akan menghasilkan puluhan artefak mikro yang justru mengurangi, bukan menambah, kejelasan.

**Prinsip (kriteria bahasa founder, dipertahankan):**

> Kalau sesuatu menjawab pertanyaan besar seperti **"Apa itu Integration?"** — itu layak jadi Philosophy tersendiri. Kalau ia hanya menjawab **"Bagaimana Retry bekerja?"** — itu BAGIAN dari Discovery/Design fase yang sedang berjalan (Phase H), bukan artefak baru berdiri sendiri.

**Uji praktis (dipakai bersama Discovery Completion Rule § 15, bukan pengganti):** Sebelum membuka dokumen discovery/philosophy BARU untuk sebuah sub-topik, tanyakan: *apakah sub-topik ini punya ONTOLOGI SENDIRI yang berbeda dari fase induknya* (persis alasan Rule pantas dapat Meta Model Discovery sendiri, `08e` — karena "apa itu Rule secara ontologis" adalah pertanyaan yang genuinely berbeda dari "apa itu Orchestration"), *atau ia murni MEKANISME/PARAMETER di dalam ontologi yang sudah ada* (Retry/Timeout/Backoff adalah PILIHAN KONFIGURASI dalam Failure Philosophy yang sudah dikunci § L `08a`, bukan konsep baru yang butuh didefinisikan dari nol).

- **Ontologi baru** (jarang) → layak Discovery/Philosophy terpisah.
- **Mekanisme/parameter di dalam ontologi yang sudah ada** (umum) → bagian dari Discovery/Design fase yang berjalan, cukup satu subbab atau satu section, BUKAN dokumen `XX-topik-discovery.md` baru.

**Tes negatif wajib (koreksi founder — "ontologi baru" saja belum cukup ketat sebagai kriteria):** Kriteria "ontologi baru → boleh terpisah" rawan disalahartikan, karena banyak topik TERLIHAT seperti ontologi baru padahal sebenarnya bukan (mis. `Webhook Discovery`, `gRPC Discovery`, `OAuth Discovery`, `Redis Discovery` — semuanya terdengar seperti konsep besar, padahal masing-masing hanya *Integration Mechanism*, *Integration Mechanism*, *Security Mechanism*, dan *Infrastructure Technology*). Karena itu, kriteria "ontologi baru" TIDAK BOLEH dinyatakan positif begitu saja — ia WAJIB dibuktikan lewat tes negatif terlebih dahulu:

> **Sebelum sebuah topik dianggap ontologi baru, harus dibuktikan terlebih dahulu bahwa ia BUKAN hanya subtype, mechanism, protocol, implementation, atau specialization dari ontologi yang sudah ada.**

Praktiknya: sebelum membuka dokumen discovery/philosophy baru, jawab dulu — *topik ini subtype dari apa? mechanism untuk mencapai apa? protocol untuk mewujudkan apa? implementation dari prinsip yang mana? specialization dari kategori apa?* — kalau SALAH SATU pertanyaan itu punya jawaban yang merujuk balik ke ontologi yang SUDAH dikunci (Integration, Security, Infrastructure, Orchestration, dst.), topik itu BUKAN ontologi baru, TIDAK PEDULI seberapa besar atau seberapa sering ia dibicarakan. Hanya kalau SEMUA pertanyaan itu gagal menemukan induk yang sudah ada — persis seperti Rule terbukti gagal sepenuhnya dijelaskan sebagai subtype Configuration Data murni (`08e` § A.2) — topik itu baru sah dianggap ontologi baru.

**Konsekuensi eksplisit untuk Phase H:** Retry, Timeout, Circuit Breaker, Dead Letter Queue, Backpressure — SEMUA ini adalah mekanisme di dalam SATU pertanyaan besar ("Apa itu Integration, dan bagaimana ia menjaga Trust terhadap sistem yang tidak dikontrol CECEP?") — bukan masing-masing pertanyaan ontologis terpisah. Phase H Discovery WAJIB menjawabnya sebagai bagian dari SATU discovery Integration, bukan dipecah jadi Retry Discovery/Timeout Discovery/CircuitBreaker Discovery yang masing-masing punya freeze sendiri.

**Kenapa ini bukan pembatasan kualitas, murni pembatasan GRANULARITAS:** Prinsip ini TIDAK melarang kedalaman analisis (Retry tetap harus dianalisis serius sebagai bagian Failure Philosophy Integration) — ia hanya melarang setiap analisis serius otomatis menjadi ARTEFAK BERDIRI SENDIRI dengan freeze-nya sendiri. Meta-dokumen (Transition Brief, Master Index, Glossary) tetap sah dan bernilai SELAMA memenuhi kebutuhan navigasi lintas-fase yang nyata (§ 15 dan § 16 sendiri adalah contoh: masing-masing menjawab pertanyaan besar yang genuinely berbeda) — bukan berarti setiap fase berikutnya otomatis butuh meta-dokumen baru lagi kecuali kebutuhannya benar-benar muncul lewat Discovery Completion Rule (§ 15), bukan lewat momentum semata.

**Jumlah dokumen mengikuti kebutuhan, bukan preseden:** Phase G menghasilkan 14 lapisan dokumen — ini BUKAN kuota yang harus dipenuhi ulang oleh Phase H/I/J/K/L. Kalau Phase I (AI) genuinely hanya butuh 9 dokumen untuk mencapai kedalaman yang sama, itu benar. Kalau Phase J (Future Vision) butuh 17, itu juga benar. Mengukur kematangan sebuah fase dari BANYAKNYA dokumen adalah kesalahan kategori yang sama dengan mengukur kualitas kode dari banyaknya baris — arsitektur yang baik dituntun oleh kebutuhan (Discovery Completion Rule § 15 + tes negatif di atas), bukan oleh jumlah artefak fase sebelumnya.

---

## Batas Constitution — Kenapa Tidak Semua Insight Masuk Sini

**Sumber:** Koreksi founder — "Constitution Bias": kecenderungan setiap insight bagus otomatis diangkat jadi pasal baru, padahal Constitution adalah UUD (harus sangat stabil), bukan buku panduan kerja. Ditambahkan SETELAH § 16 sebagai penjaga agar § 15-16 tidak diikuti derom insight lain yang levelnya berbeda.

**Tes wajib sebelum sesuatu diusulkan masuk Constitution:** *Apakah insight ini berlaku untuk SEMUA fase dan SEMUA proyek turunan CECEP — mengikat HASIL arsitektur, bukan sekadar cara kerja yang baik?*

- **Lolos** (§ 15 Discovery Completion Rule, § 16 Discovery Granularity Rule): kriterianya sama sekali tidak bergantung fase/domain tertentu, dan mengikat APA yang boleh menjadi keputusan arsitektur.
- **Tidak lolos, contoh nyata**: kebiasaan menjawab "apa invariant/anti-pattern/bias/asumsi tersembunyi fase ini" sebelum menulis Discovery — ini SOP kerja yang bernilai, tapi ia mengatur BAGAIMANA proses berpikir dijalankan, bukan APA yang sah jadi keputusan arsitektur. Kalau nanti muncul sepuluh kebiasaan serupa, Constitution akan perlahan berubah jadi manual kerja — bertentangan dengan sifatnya sebagai lapisan paling stabil (lihat Hierarki Prinsip di atas). **Dipindahkan ke [`13-working-methodology.md`](../enterprise-architecture-framework/13-working-methodology.md)** — dokumen SOP terpisah yang levelnya lebih rendah dari Constitution dan boleh berkembang lebih cair.

**Konsekuensi praktis:** Mulai sekarang, sebelum mengusulkan penambahan ke `04`, tes ini dijalankan lebih dulu. Kalau jawabannya "ini cara kerja yang baik" (bukan "ini batas yang mengikat hasil arsitektur"), tempatnya adalah dokumen metodologi/SOP, bukan Constitution.

---

## 17. Constitution Freeze — Frozen by Default Mulai Phase H

**Sumber:** Keputusan founder eksplisit di titik transisi ke Phase H, sebagai syarat sebelum Phase H dimulai. Konsekuensi LANGSUNG dari "Batas Constitution" di atas — kalau tes itu sudah ada, langkah berikutnya adalah membalik urutan default: bukan lagi "apakah ini layak masuk Constitution", tapi **Constitution TERTUTUP secara default, dan HANYA dibuka kalau tes berikut lolos.**

**Tes tunggal, menggantikan (memperketat) tes "Batas Constitution" untuk SEMUA penambahan mulai Phase H:**

> **Apakah tanpa aturan ini, seluruh CECEP bisa rusak?**

- **Tidak** → TIDAK masuk Constitution. Titik. Tidak peduli seberapa berguna, seberapa universal terdengarnya, atau seberapa sering akan dipakai — kalau CECEP tetap aman tanpa aturan itu dikodifikasi di level UUD, tempatnya adalah [`13-working-methodology.md`](../enterprise-architecture-framework/13-working-methodology.md) (SOP) atau dokumen Discovery/Philosophy fase yang bersangkutan (keputusan lokal fase itu).
- **Ya** → baru diuji lebih lanjut lewat tes "Batas Constitution" (berlaku semua fase & proyek, mengikat hasil, § di atas) — LOLOS keduanya baru sah diusulkan.

**Contoh penerapan eksplisit (diberikan founder, mengikat untuk Phase H dan seterusnya):** Retry Strategy, Circuit Breaker, Outbox Pattern — SEMUANYA tetap di level Phase H Discovery/Design, TIDAK PERNAH naik ke Constitution, karena CECEP tidak "rusak" tanpa salah satu dari mereka dikodifikasi sebagai hukum dasar — mereka adalah keputusan TEKNIK Integration (persis kelas yang sudah ditolak masuk Constitution lewat Discovery Granularity Rule § 16), bukan pagar yang mengikat seluruh arsitektur.

**Konsekuensi operasional:** Mulai Phase H, TIDAK ADA lagi § 18/§ 19/§ 20 dst. yang dibuka hanya karena sebuah insight "kedengarannya penting" — pertumbuhan Constitution berhenti secara default. Constitution hanya dibuka kembali untuk (a) ACR terhadap pasal yang sudah ada (§ 7.1), atau (b) penambahan pasal baru yang LOLOS tes rusak/tidak-rusak di atas — keduanya kejadian LANGKA, bukan rutin per fase.

**Kenapa ini bukan kontradiksi dengan semangat CECEP yang terus belajar:** Constitution Freeze TIDAK menghentikan pembelajaran — ia hanya memindahkan TEMPAT pembelajaran itu didokumentasikan. Fase H ke atas tetap boleh (dan akan) menemukan insight baru sebanyak Phase G — bedanya, rumah defaultnya sekarang adalah dokumen fase itu sendiri atau `13`, BUKAN otomatis `04`. Constitution yang terus tumbuh tanpa batas kehilangan sifat paling berharganya: stabil, jarang berubah, level UUD (lihat Hierarki Prinsip di paling atas dokumen ini).

---

## Cara Merujuk Dokumen Ini dari Phase D ke Atas

Setiap dokumen Phase D-L yang perlu menjustifikasi sebuah keputusan desain dengan prinsip governing harus mengutip dari dokumen ini dengan format `[nama prinsip] (lihat 04-architecture-constitution.md § [nomor bagian])` — bukan menyalin ulang teks prinsip secara manual ke dokumen baru. Ini menjaga agar hanya ada SATU tempat yang perlu diperbarui kalau suatu saat sebuah prinsip direvisi secara eksplisit.

---

## Status Approval

Dokumen ini adalah konsolidasi 1:1 dari prinsip yang SUDAH dikunci di Phase B ([`01`](01-phase-b-cost-engineering-discovery.md)), Phase B.5 ([`02`](02-phase-b5-core-cost-engineering-architecture.md) — LOCKED), dan Phase C v3 ([`03`](03-phase-c-problem-discovery.md)) — tidak ada prinsip baru yang diperkenalkan di sini. Approval dokumen ini secara substansi setara dengan approval Phase C v3 itu sendiri, karena isinya murni konsolidasi struktural.

**Catatan struktural:** Fase berikutnya dalam urutan adalah [`03b-phase-c5-core-domain-discovery.md`](03b-phase-c5-core-domain-discovery.md) — Phase C.5, yang menerapkan prinsip-prinsip di dokumen ini terhadap analisis domain ownership (Aggregate Root, Bounded Context, Shared Kernel, dsb.) sebelum Phase D dimulai.

*Dokumen selanjutnya: Phase C.5 — Core Domain Discovery, lalu Phase D — Capability Architecture.*
