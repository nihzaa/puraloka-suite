# CECEP — Enterprise Orchestration Philosophy

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** "Constitution" khusus Phase G — mengikuti pola persis yang sudah terbukti di fase sebelumnya: Phase D punya Capability Philosophy ([`05`](../CECEP/05-phase-d-capability-architecture.md), Engine-Based Thinking), Phase E punya Calculation Philosophy ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § pembuka, Konstitusi Calculation Strategy), Phase F punya Information Philosophy ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § C, Canonical Information Contract). Phase G BELUM punya padanannya — dokumen ini menutup celah itu SEBELUM Orchestration Rule Design dimulai, termasuk SEBELUM pertanyaan lazy/eager/hybrid boleh dibahas.

**Kenapa dokumen ini WAJIB ada sebelum Rule Design (koreksi founder):** Tanpa Philosophy, setiap Orchestration Rule yang dirancang nanti akan menjawab pertanyaan operasional ("kapan proses ini jalan") tanpa fondasi filosofis yang menjawab pertanyaan lebih dasar ("apa itu orkestrasi, dan apa yang secara PRINSIP tidak boleh ia lakukan"). Pola yang sudah berulang sejak Phase D-F: filosofi dulu (batasan konseptual), baru aturan konkret (Rule/Strategy/Contract individual) yang tunduk pada filosofi itu — Phase G tidak boleh jadi pengecualian.

---

## A. Definisi Orchestration di CECEP

**Definisi kerja:** Orchestration adalah **keputusan tentang KAPAN dan DALAM URUTAN APA capability yang sudah memiliki data/kemampuannya masing-masing (Layer 1-4, sudah frozen) dipanggil untuk bekerja sama** — TANPA pernah mengubah APA yang mereka miliki atau BAGAIMANA mereka bekerja secara internal.

**Analogi yang membantu (bukan bagian formal definisi, murni bantuan intuisi):** Orchestration adalah *konduktor orkestra* — ia menentukan kapan biola masuk, kapan cello berhenti, dalam tempo apa. Ia TIDAK PERNAH memainkan instrumen siapa pun, TIDAK PERNAH mengubah partitur (Formula/kalkulasi), dan TIDAK PERNAH mengklaim kepemilikan atas instrumen pemain manapun. Konduktor mengatur URUTAN dan WAKTU, bukan ISI.

---

## B. Orchestration vs Pola Serupa — Perbedaan Tegas

**Kenapa perbedaan ini penting dibakukan:** Banyak organisasi salah kaprah menyamakan Workflow=Orchestration — kesalahan ini berbahaya bagi CECEP karena "Workflow Engine" (CAP-010) SUDAH menjadi nama Engine yang terkunci ([`05`](../CECEP/05-phase-d-capability-architecture.md) § E) untuk fungsi yang SPESIFIK (Process Governance/Approval) — bukan orkestrasi lintas-capability secara umum. Kalau perbedaan ini tidak eksplisit, ada risiko nyata Orchestration Rule Design nanti secara diam-diam menumpuk tanggung jawab ke CAP-010 yang bukan miliknya.

| Istilah | Definisi | Beda dengan Orchestration di CECEP |
|---|---|---|
| **Workflow** | Rangkaian LANGKAH di dalam SATU proses bisnis, biasanya melibatkan approval/status transition manusia | CAP-010 (Workflow Engine) adalah SATU capability yang MELAYANI orkestrasi (dipanggil sebagai Domain Service), bukan orkestrasi itu sendiri — Workflow adalah salah satu ALAT orkestrasi, bukan sinonimnya |
| **Business Process (BPMN)** | Notasi/model formal untuk menggambarkan proses bisnis end-to-end, biasanya statis dan predefined | CECEP TIDAK mengadopsi BPMN sebagai model — Orchestration Rule di CECEP adalah KONFIGURASI DATA (konsisten First Principle 4, [`04`](../CECEP/04-architecture-constitution.md) § 4), bukan diagram proses yang di-deploy sebagai kode |
| **Saga** | Pola distributed-transaction: rangkaian langkah dengan Compensation eksplisit kalau satu langkah gagal, menjaga konsistensi tanpa transaksi ACID lintas-service | Saga adalah SALAH SATU TEKNIK yang dipakai orkestrasi CECEP (lihat Event Policy, [`08`](08-phase-g-enterprise-orchestration-architecture.md) § E — Compensation eksplisit per Criticality level) — bukan orkestrasi itu sendiri, ia adalah *implementasi* dari prinsip "orkestrasi harus resilient terhadap kegagalan parsial" (§ G di bawah) |
| **Event Choreography** | Pola di mana TIDAK ADA konduktor pusat — setiap service bereaksi terhadap event secara independen tanpa koordinasi terpusat | CECEP secara SADAR memilih Orchestration (konduktor eksplisit lewat Orchestration Rule) DI ATAS Choreography murni untuk keputusan bisnis kritis (mis. `EstimateVersionApproved`) — TAPI reaksi capability terhadap event yang sudah deterministic (mayoritas dari 19 event di Catalog, [`08`](08-phase-g-enterprise-orchestration-architecture.md) § B.1) SECARA STRUKTURAL berperilaku seperti Choreography (Consumer bereaksi sesuai Boundary-nya sendiri tanpa perlu instruksi eksternal). **CECEP adalah HYBRID**: Choreography untuk reaksi deterministic, Orchestration eksplisit untuk titik dengan cabang kebijakan (lihat § C) |
| **Orchestration (definisi CECEP, § A)** | Keputusan KAPAN/URUTAN APA, dikonfigurasi sebagai data, di atas capability yang sudah frozen | — |

---

## C. Tanggung Jawab Orchestrator

**Orchestrator (fungsi abstrak, BUKAN satu Capability tunggal — lihat § F untuk hubungannya dengan CAP-010) bertanggung jawab HANYA untuk:**

1. **Menentukan URUTAN** proses lintas-capability yang sudah punya pemilik jelas (`08` § F, Event Dependency & Ordering).
2. **Menentukan PEMICU** — event apa yang memulai rangkaian proses apa.
3. **Menentukan KEBIJAKAN KEGAGALAN** pada level rangkaian (Retry/Compensation/Escalation, `08` § E) — TANPA menentukan ISI kompensasi itu sendiri (isi tetap milik capability yang mengeksekusinya).
4. **Menentukan TIMING** — kapan sebuah proses lazy (on-demand) vs eager (proaktif) dijalankan, SEBATAS ini adalah keputusan "kapan", bukan keputusan "apa hasilnya" (lihat § H, batas dengan Calculation Truth).

---

## D. Yang SECARA EKSPLISIT BUKAN Tanggung Jawab Orchestrator

**Ini bagian paling penting dari Philosophy ini (instruksi eksplisit founder — "harus dibakukan dulu, karena nanti semua Rule akan bergantung ke sini"):**

| Orchestrator TIDAK BOLEH | Kenapa (Prinsip yang Dilanggar Kalau Melakukan Ini) |
|---|---|
| **Mengubah data** | Orkestrasi murni memanggil capability lain lewat kontraknya (Dependency Matrix, [`05`](../CECEP/05-phase-d-capability-architecture.md) § F) — kalau Orchestrator menulis data langsung, ia diam-diam menjadi Producer, melanggar Ownership yang sudah frozen |
| **Memiliki Entity** | Setiap Entity sudah punya Aggregate Root pemiliknya ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § D-E) — Orchestrator yang "memiliki" Entity berarti ia jadi Capability baru secara diam-diam, melanggar Progressive Freeze Chain |
| **Menghitung Cost** | Konstitusi Calculation Strategy ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § pembuka poin 6): CAP-006 adalah SATU-SATUNYA pemilik logika eksekusi kalkulasi. Orchestrator me-ROUTE ke CAP-006, tidak pernah menghitung sendiri — ini prinsip yang SAMA persis dengan larangan AI menghitung sendiri (`06` § N), diterapkan ke Orchestrator |
| **Mengganti Formula** | Formula Definition adalah Aggregate Root milik CAP-006 ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § D.2) — Orchestrator memanggil Formula yang SUDAH ada, tidak pernah menciptakan/mengubahnya |
| **Memiliki Business Rule** | Business Rule (mis. "apa yang membuat Estimate valid") adalah keputusan Capability yang memilikinya (mis. CAP-008 untuk validasi Estimate Version) — Orchestrator hanya memanggil validasi itu di titik yang tepat, tidak mendefinisikan ulang aturannya |
| **Mengambil Ownership** | Penerapan LANGSUNG Orchestration Separation Principle ([`04`](../CECEP/04-architecture-constitution.md) § 10): "Owning a capability does not imply owning the orchestration" — dan SEBALIKNYA, memiliki peran orkestrasi TIDAK PERNAH memberi hak kepemilikan atas domain manapun |

**Sinyal pelanggaran (bagaimana mendeteksi kalau sebuah Orchestration Rule diam-diam melanggar tabel di atas):** Kalau sebuah Rule menjawab pertanyaan **"APA hasilnya"** (bukan "KAPAN terjadi") — itu sinyal Rule tersebut sudah menyentuh wilayah Capability/Calculation/Information Truth, bukan Execution Truth murni, dan WAJIB diperiksa ulang lewat Architecture Decision Checklist ([`04`](../CECEP/04-architecture-constitution.md) § 12) sebelum di-freeze.

---

## E. Invariant yang Tidak Boleh Dilanggar Orchestration

**Diwarisi langsung dari Architectural Invariants ([`04`](../CECEP/04-architecture-constitution.md) § 5) dan Five Truth Layers (§ 8), diterjemahkan spesifik untuk konteks Orchestration:**

1. **Single Source of Truth** — Orchestrator tidak pernah menyimpan salinan data yang sudah dimiliki capability lain, meski untuk keperluan "state tracking" internal orkestrasi sendiri (state orkestrasi = MENUNJUK ke status Aggregate asli, bukan menyalinnya).
2. **Explainability** — Setiap keputusan orkestrasi (kenapa proses A dijalankan sebelum B) harus bisa ditelusuri ke Orchestration Rule yang eksplisit, bukan logika tersembunyi.
3. **Auditability** — Setiap eksekusi Orchestration Rule tercatat sebagai Domain Event (`08` § A), konsisten pola Event Catalog yang sudah ada.
4. **Versioning** — Orchestration Rule ITU SENDIRI adalah Configuration Data ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § A) yang harus dipertimbangkan versioning (Foundational Principle Ketiga) — perubahan Rule tidak boleh retroaktif mengubah proses yang sudah berjalan.
5. **Orchestration Separation** ([`04`](../CECEP/04-architecture-constitution.md) § 10) — sudah dibahas tuntas § D di atas, diulang di sini sebagai invariant formal karena signifikansinya.

---

## F. Hubungan Orchestration dengan Truth Layer Lain

**Posisi dalam Five Truth Layers ([`04`](../CECEP/04-architecture-constitution.md) § 8):** Orchestration adalah bagian dari **Layer 5 — Execution Truth**. Ia MENGONSUMSI Layer 2 (Capability Truth), Layer 3 (Calculation Truth), dan Layer 4 (Information Truth) — TIDAK PERNAH menciptakan truth baru di ketiganya.

```
Capability Truth (Layer 2)    → Orchestrator memanggil lewat Dependency Matrix, tidak
                                  pernah mendefinisikan ulang Boundary
Calculation Truth (Layer 3)   → Orchestrator me-ROUTE ke CAP-006, tidak pernah
                                  menghitung sendiri (§ D)
Information Truth (Layer 4)   → Orchestrator membaca/menulis lewat Canonical
                                  Information Contract ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § C),
                                  tidak pernah membaca struktur Entity mentah
Orchestration (Layer 5)       → HANYA mengatur KAPAN/URUTAN pemanggilan ketiganya
```

**Hubungan dengan CAP-010 (Workflow Engine):** Orchestrator BUKAN CAP-010 — CAP-010 adalah SATU Domain Service yang dipanggil Orchestrator (dan capability lain) untuk kebutuhan SPESIFIK (validasi approval, `05` § F.10). Orchestrator adalah fungsi LEBIH LUAS yang mengatur seluruh alur lintas-capability, di mana approval hanyalah SALAH SATU jenis langkah yang mungkin ada dalam sebuah alur.

**Hubungan dengan Integration (Phase I mendatang):** Orchestration mengatur alur DI DALAM CECEP; Integration (Phase I) akan mengatur bagaimana CECEP terhubung ke SISTEM LUAR (Procurement/Cashflow existing Puraloka Suite, lewat CAP-013). Orchestration Rule yang memicu proses ke luar CECEP (mis. Orchestration Gap-1/Gap-2, [`07c`](../CECEP/07c-orchestration-readiness-assessment.md) § E) adalah TITIK TEMU kedua fase — Phase G menentukan KAPAN pemicu itu terjadi, Phase I menentukan BAGAIMANA pemicu itu diterjemahkan ke sistem luar.

---

## G. Quality Attributes Khusus Orchestration

**Diwarisi dari Architecture Quality Attributes ([`04`](../CECEP/04-architecture-constitution.md) § 11), diperdalam untuk kebutuhan spesifik Orchestration — sebagian sudah punya representasi konkret di Event Catalog ([`08`](08-phase-g-enterprise-orchestration-architecture.md) § A-G), sebagian baru dinyatakan eksplisit di sini:**

| Quality Attribute | Definisi untuk Orchestration | Sudah Ada Representasinya? |
|---|---|---|
| **Reliability** | Orchestration Rule yang sama, dijalankan dengan input sama, menghasilkan urutan eksekusi yang sama | Sebagian — Event Consistency (`08` § G) sudah membahas Strong vs Eventually Consistent, belum eksplisit soal Rule reliability |
| **Idempotency** | Menjalankan ulang sebuah Orchestration Rule (mis. karena retry) tidak boleh menghasilkan efek ganda | ✅ Sudah — kolom Idempotent di Event Catalog (`08` § A), termasuk kasus khusus `ScenarioBranched` (`08` § E) |
| **Retry** | Kebijakan percobaan ulang saat satu langkah orkestrasi gagal | ✅ Sudah — Event Policy per Criticality (`08` § E) |
| **Timeout** | Batas waktu tunggu sebelum sebuah langkah orkestrasi dianggap gagal | 🔴 **Belum ada representasi** — Event Catalog mencatat Sync/Async tapi tidak mencatat batas waktu tunggu eksplisit. Dicatat sebagai gap untuk Orchestration Rule Design |
| **Compensation** | Tindakan pemulihan saat sebuah rangkaian gagal di tengah jalan | ✅ Sudah — Event Policy (`08` § E), plus konsep Saga (§ B tabel) |
| **Ordering** | Jaminan urutan eksekusi sesuai Dependency Graph | ✅ Sudah — Event Dependency & Ordering (`08` § F) |
| **Observability** | Kemampuan mengamati status sebuah rangkaian orkestrasi yang sedang berjalan | 🔴 **Belum ada representasi konkret** — konsisten dengan gap Observability yang sudah diidentifikasi Grand Architecture Review dan dicatat sebagai Architecture Quality Attribute (`04` § 11), implementasinya menyusul sebagai Operational Perspective (`04` § 14) mulai Phase I |

**Catatan status:** Dua atribut (Timeout, Observability) SENGAJA dicatat sebagai gap eksplisit di sini — bukan diselesaikan. Timeout akan menjadi bagian Orchestration Rule Design (dalam batas Philosophy ini). Observability tetap menunggu Phase I sesuai pemetaan Operational Perspective yang sudah dikunci.

---

## H. Decision Checklist Khusus — Sebelum Sebuah Orchestration Rule Boleh Dibekukan

**Pelengkap Architecture Decision Checklist umum ([`04`](../CECEP/04-architecture-constitution.md) § 12) — sebelas pertanyaan berikut WAJIB dijawab untuk SETIAP Orchestration Rule individual sebelum dianggap final, di luar sebelas pertanyaan umum yang tetap berlaku:**

1. Apakah Rule ini menjawab **"KAPAN"**, bukan **"APA hasilnya"** (sinyal pelanggaran, § D)?
2. Apakah Rule ini memanggil capability HANYA lewat kontrak Dependency Matrix-nya (`05` § F), tidak memaksa capability itu melakukan sesuatu di luar Core Responsibility-nya?
3. Kalau Rule melibatkan angka, apakah ia dirutekan lewat CAP-006, tidak menyisipkan kalkulasi sendiri?
4. Apakah data yang mengalir memakai Canonical Information Contract (`07` § C), tidak membaca struktur Entity mentah?
5. Apakah Rule ini menyimpan STATE-nya SENDIRI (di luar status Aggregate yang sudah ada) — kalau ya, itu pelanggaran Single Source of Truth (§ E)?
6. Apakah kebijakan kegagalan Rule ini (Retry/Compensation/Escalation) konsisten dengan Criticality event yang dipicunya (`08` § D-E)?
7. Apakah Rule ini punya Idempotency yang jelas — aman dijalankan ulang tanpa efek ganda?
8. Apakah urutan yang ditetapkan Rule ini konsisten dengan Dependency Graph yang sudah dipetakan (`08` § F)?
9. Apakah Rule ini di-versioned sebagai Configuration Data, bukan hardcode?
10. Apakah Timeout untuk Rule ini eksplisit ditentukan (§ G, gap yang harus ditutup Rule Design)?
11. Apakah Rule ini TIDAK PERNAH secara diam-diam memberi CAP-010 (atau capability manapun) tanggung jawab di luar Boundary-nya yang sudah frozen?

**Aturan:** Kalau SATU SAJA jawaban di atas menunjukkan pelanggaran — Rule TIDAK BOLEH di-freeze, harus direvisi sampai lolos seluruh sebelas pertanyaan. Checklist ini dipakai bersamaan dengan Architecture Decision Checklist umum (`04` § 12), tidak menggantikannya.

---

## I. Orchestration Rule — Execution Semantics

**Kenapa bagian ini perlu ada (koreksi founder, ronde kedua Philosophy):** § A-H menjawab "apa itu Orchestration", tapi belum menjawab "apa itu **satu Orchestration Rule**, secara konkret" — begitu Rule Design dimulai, pertanyaan pertama yang muncul adalah bentuk representasinya (if-then? DSL? YAML/JSON? Visual/BPMN?). Tanpa dijawab di level Philosophy, setiap Rule individual berisiko mengasumsikan bentuk berbeda-beda secara diam-diam.

**Definisi kerja — Orchestration Rule adalah data terstruktur, BUKAN kode:**

```
Orchestration Rule {
  # -- Identity & Metadata (Enterprise Asset — koreksi founder, ronde keempat) --
  id:              identitas permanen — WAJIB, karena Rule adalah Entity (§ N di bawah),
                    dan Entity tanpa identitas bukan Entity (konsisten [`03b`](../CECEP/03b-phase-c5-core-domain-discovery.md) § Kosakata DDD)
  display_name:    label manusiawi untuk Rule ini, dipakai Rule Explainability (§ R)
  purpose:         deskripsi TUJUAN bisnis Rule ini ada — kenapa, bukan cuma apa
  owner:            siapa/fungsi apa yang bertanggung jawab merancang & merawat Rule ini
                    (BUKAN Capability owner — konsisten Orchestration Separation Principle,
                    `04` § 10, ini kepemilikan TANGGUNG JAWAB PERANCANGAN, bukan kepemilikan DATA)
  category:        pengelompokan Rule (mis. "Estimate Approval Flow", "Lessons Learned Flow")
                    untuk navigasi/Visualization (lihat catatan Visualization, § O)
  created_by:       audit trail penciptaan (Audit, `07` § C.1 elemen ke-11)
  created_at:       audit trail penciptaan
  current_status:   status Lifecycle saat ini (§ J)
  current_version:  versi aktif saat ini (§ K)

  # -- Execution Semantics --
  trigger:         Domain Event yang memicu ([`08`](08-phase-g-enterprise-orchestration-architecture.md) § A Event Catalog)
  condition:       syarat opsional yang harus terpenuhi (mis. Criticality tertentu, Company tertentu)
  action:          daftar Capability yang dipanggil, dalam urutan yang ditentukan (KAPAN, bukan APA hasilnya — § D)
  failure_policy:  Retry/Compensation/Escalation yang berlaku (`08` § E)
  timeout:         batas waktu tunggu per langkah (§ G, gap yang ditutup)
  version:         wajib, konsisten Foundational Principle Ketiga (sama isinya dengan
                    `current_version` di atas — dicatat dua kali karena beda peran:
                    metadata display vs field versi yang dipakai Versioning § K)
}
```

**Kenapa metadata (baris pertama, id s.d. current_version) WAJIB, bukan opsional (koreksi founder, ronde keempat — "Rule sudah menjadi Enterprise Asset, Enterprise Asset harus punya metadata"):** Tanpa `purpose`+`owner`+`category`, sebuah organisasi dengan ratusan/ribuan Rule (skenario yang sama dengan Worst Case Simulation, Grand Architecture Review) tidak punya cara SISTEMATIS menjawab "Rule ini untuk apa, siapa yang bertanggung jawab kalau salah". Ini BUKAN penambahan filosofi baru — murni penerapan pola metadata yang SUDAH implisit ada di seluruh Aggregate lain (mis. Capability Catalog, `05b` § 10, punya kolom Nama/Owner Domain/Status) ke domain Rule, konsisten § N (kesetaraan dengan Formula).

**Kenapa BUKAN if-then/kode, BUKAN BPMN, BUKAN visual builder sebagai representasi INTI (implementasi konkret boleh berbeda, tapi model datanya HARUS ini):**
- **Bukan if-then/kode langsung** — melanggar First Principle 4 ([`04`](../CECEP/04-architecture-constitution.md) § 4, Configured Data bukan Hardcoded Code); pola yang SAMA dengan alasan Configurable Approval Workflow (CAP-010) tidak hardcode role approver.
- **Bukan BPMN sebagai model inti** — sudah ditolak eksplisit di § B ("CECEP TIDAK mengadopsi BPMN sebagai model... Orchestration Rule adalah KONFIGURASI DATA, bukan diagram proses yang di-deploy sebagai kode").
- **DSL/YAML/JSON/Visual Builder adalah pilihan REPRESENTASI PERMUKAAN (surface syntax), bukan keputusan Philosophy** — Rule di atas adalah MODEL data yang harus dipenuhi; apakah model itu diketik sebagai YAML, disunting lewat visual builder, atau disimpan sebagai JSON adalah keputusan **Persistence Truth** (Phase K/L), bukan keputusan Philosophy ini. Philosophy hanya mengunci STRUKTUR datanya, bukan sintaksnya.
- **Visualization (Graph tampilan, bukan struktur data) juga representasi permukaan** — lihat catatan di § O.

---

## J. Orchestration Rule Lifecycle

**Konsisten dengan pola Lifecycle yang sudah dikunci untuk SEMUA Aggregate lain ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § H) — Rule adalah aset, bukan pengecualian:**

```
Draft → Testing → Approved → Published → Superseded → Deprecated → Archived
```

| Status | Makna | Siapa yang Mengubah |
|---|---|---|
| **Draft** | Rule sedang disusun, belum dijalankan terhadap event nyata | Perancang Rule (manusia, lewat mekanisme CAP-010 sebagai gerbang, § F) |
| **Testing** | Rule diuji terhadap Sandbox/Simulation ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § L.2, pola yang sama dipakai ulang untuk Rule — bukan hanya Formula) | idem |
| **Approved** | Lolos Testing + Configurable Approval Workflow (CAP-010) | CAP-010 |
| **Published** | Aktif, memproses event nyata | Sistem (otomatis begitu Approved) |
| **Superseded** | Versi baru dari Rule yang SAMA sudah Published — Rule versi ini masih SAH untuk menjelaskan riwayat/Replay, tapi tidak lagi dipakai untuk event baru | Sistem (otomatis begitu Rule versi baru Published, § L) |
| **Deprecated** | Rule (seluruh garis versi) diputuskan tidak dipakai lagi sama sekali, bukan sekadar digantikan versi baru — riwayat eksekusi lama tetap tervalidasi (Historical Data, [`07`](../CECEP/07-phase-f-enterprise-data-model.md) § A), konsisten pola Formula Deprecation ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § M.2) | Perancang Rule + CAP-010 |
| **Archived** | Tidak pernah dihapus (Architectural Invariant Traceability) — tetap bisa dirujuk audit | Sistem |

**Kenapa Superseded dipisah dari Deprecated (koreksi founder — enterprise biasanya tidak langsung deprecated):** Dua situasi ini BERBEDA maknanya. **Superseded** = Rule ini digantikan REVISI dari Rule yang sama (mis. Rule-018 v1 → Rule-018 v2, isi/logikanya berkembang tapi TUJUANnya sama) — ini kejadian NORMAL dan SERING (setiap kali Rule direvisi, § K). **Deprecated** = Rule ini (seluruh garis versinya) TIDAK PERNAH dipakai lagi, tujuannya sendiri sudah tidak relevan (mis. kebijakan bisnis berubah total) — ini kejadian JARANG. Menyamakan keduanya akan membuat log Rule Versioning terlihat seolah setiap revisi kecil adalah "penghentian", padahal revisi normal (Superseded) jauh lebih sering terjadi daripada penghentian total (Deprecated).

**Kenapa Testing WAJIB, bukan opsional (konsisten pola Formula, [`06`](../CECEP/06-phase-e-calculation-strategy.md) § L.4):** Rule yang langsung Published tanpa Testing berisiko sama dengan Formula yang langsung Active tanpa lolos Benchmark — Testing adalah syarat transisi lifecycle, bukan langkah opsional.

---

## K. Orchestration Rule Versioning

**Prinsip:** Rule di-versioned dengan pola IDENTIK Formula Definition/Calculation Strategy ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § K) — **immutable setelah Published**. Revisi Rule = Rule versi baru, bukan edit di tempat.

**Kenapa ini WAJIB, bukan opsional (jawaban langsung atas pertanyaan founder "Calculation sudah punya version, Formula punya version, Information punya version, tapi Rule?"):** Kalau Rule TIDAK di-versioned, Replay ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § J.3) rusak di level orkestrasi — Estimate 2028 yang di-replay tahun 2033 butuh tahu BUKAN HANYA versi Formula/Price yang dipakai saat itu, tapi JUGA versi Orchestration Rule yang menentukan proses apa yang berjalan setelah `EstimateVersionApproved` saat itu. Tanpa Rule versioning, Replay hanya menjamin HASIL KALKULASI identik, tapi tidak menjamin PROSES yang terjadi setelahnya bisa direkonstruksi — sebuah lubang di jaminan Explainability yang HAMPIR terlewat.

**Konsekuensi:** Setiap Estimate Item WAJIB mencatat bukan hanya `formula_version`/`strategy_version` (sudah ada, [`06`](../CECEP/06-phase-e-calculation-strategy.md) § K) tapi JUGA `orchestration_rule_version` yang aktif saat `EstimateVersionApproved` terjadi — detail struktur field ini didesain saat Rule Design, bukan di Philosophy ini, tapi KEWAJIBANnya dikunci di sini.

---

## L. Failure Philosophy

**Kenapa ini "inti Orchestration" (verbatim founder):** § D-E, § G, § H sudah menyinggung Retry/Compensation/Escalation sebagai ATRIBUT — bagian ini menjawab FILOSOFI di baliknya: bagaimana CECEP secara PRINSIP memutuskan respons terhadap kegagalan, bukan hanya mendaftar opsi yang tersedia.

**Enam kemungkinan respons kegagalan (kerangka, bukan keputusan per-kasus — keputusan konkret per Rule ada di Rule Design):**

```
Lanjut (Ignore)  — kegagalan diabaikan, proses lanjut tanpa efek
Retry            — coba ulang, dengan batas jelas (§ G)
Rollback         — DILARANG pada level data (Estimate Version immutable
                    setelah Approved, [`06`](../CECEP/06-phase-e-calculation-strategy.md) § K) — rollback HANYA
                    sah pada level DELIVERY (kirim ulang event), tidak pernah pada Aggregate
Compensate       — tindakan pemulihan eksplisit, ISI kompensasi tetap milik
                    capability yang mengeksekusinya (§ D — Orchestrator tidak
                    boleh menentukan ISI, hanya bahwa Compensation harus terjadi)
Manual           — eskalasi ke manusia (Human Approval, konsisten `08` § E)
Stop             — proses dihentikan total, status Estimate Version kembali
                    ke state terakhir yang valid (BUKAN rollback data, murni
                    berhenti melangkah maju)
```

**Prinsip governing — respons kegagalan DITENTUKAN Criticality, bukan dipilih bebas per Rule:** Konsisten dengan `08` § E ("Policy ditentukan Criticality, bukan capability yang menghasilkannya") — Failure Philosophy ini MEWARISI tabel Criticality→Policy yang sudah ada, tidak menciptakan mekanisme paralel. Yang BARU di sini adalah penegasan bahwa **Rollback level-data secara PRINSIP dilarang** (baru eksplisit di sini, belum pernah dinyatakan setegas ini sebelumnya) — karena Estimate Version immutable-setelah-Approved berarti "membatalkan" sebuah proses yang sudah berjalan TIDAK PERNAH berarti menghapus jejaknya, hanya berhenti melangkah maju (Stop) atau memperbaiki maju (Compensate).

---

## M. Determinism

**Prinsip (verbatim arah founder, dikunci sebagai Invariant tambahan khusus Orchestration):**

> Same Input + Same Rule Version + Same Event → Must Produce Same Orchestration Decision.

**Kenapa ini penting sejajar dengan Deterministic Result di Calculation ([`06b`](../CECEP/06b-phase-e1-calculation-validation-freeze.md) § 14):** Determinism di Calculation menjamin ANGKA yang sama untuk input yang sama. Determinism di Orchestration menjamin URUTAN/KEPUTUSAN PROSES yang sama untuk kondisi yang sama — dua jaminan yang BERBEDA tapi SAMA PENTINGNYA untuk Replay ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § J.3) benar-benar lengkap (lihat § K di atas — tanpa Determinism Orchestration, Rule Versioning saja tidak cukup, karena Rule yang SAMA masih bisa menghasilkan keputusan BERBEDA kalau evaluasinya tidak deterministic).

**Implikasi konkret:** Orchestration Rule TIDAK BOLEH bergantung pada state eksternal yang tidak tercatat (mis. "jam berapa sekarang" tanpa itu menjadi bagian eksplisit `condition` Rule, § I) — setiap faktor yang mempengaruhi keputusan Rule WAJIB menjadi bagian struktur Rule yang di-versioned, bukan faktor tersembunyi yang hanya diketahui saat runtime.

---

## N. Rule sebagai First-Class Architectural Citizen — Ringkasan Kesetaraan dengan Formula

**Kenapa bagian ini perlu ada (koreksi founder, ronde ketiga Philosophy):** Formula Definition sudah punya identitas arsitektural lengkap — Lifecycle (`06` § L.4), Versioning (`06` § K), Testing (`06` § L.4), Replay (`06` § J.3), Explainability (`06` § I). § I-M baru membawa Rule ke ~70-80% kesetaraan itu. Lima section berikut (§ O-S) menutup sisanya — Rule Composition, Priority, Scope, Explainability, dan Testability — supaya begitu Rule Design (Phase G lanjutan) dimulai, TIDAK ADA alasan kembali membuka Philosophy ini.

| Karakteristik Formula (Phase E) | Padanan Rule (Philosophy Phase G) |
|---|---|
| Formula Definition sebagai Aggregate Root ber-ID ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § D.2) | Rule punya `id`+`name` (§ I, revisi) |
| Lifecycle Draft→Tested→Active→Superseded (`06` § L.4) | Rule Lifecycle Draft→Testing→Approved→Published→Superseded→Deprecated→Archived (§ J, revisi) |
| Immutable setelah Active (`06` § K) | Rule immutable setelah Published (§ K) |
| Dependency Graph antar Formula + Circular Detection (`06` § D) | **Rule Composition (§ O, baru)** |
| — (Formula tidak py analog langsung, tapi Strategy Selection § B.3 Phase E relevan) | **Rule Priority (§ P, baru)** |
| `applicable_context` per Strategy (`06` § B.2) | **Rule Scope (§ Q, baru)** |
| Explanation Tree otomatis (`06` § I.2) | **Rule Explainability (§ R, baru)** |
| Testing wajib via Sandbox/Benchmark (`06` § L.2-L.4) | **Rule Testability (§ S, baru)** |
| Formula Definition punya metadata implisit (via Capability Catalog, `05b` § 10) | **Rule Metadata: purpose/owner/category/created_by/created_at (§ I, revisi ronde keempat)** |
| Dependency Graph Formula punya kemampuan ditelusuri manual (9 event, `08` § A) | **Rule Dependency Visualization: kemampuan generik lintas-domain (§ O poin 5, baru)** |

**Status kesetaraan setelah ronde keempat:** Rule sekarang setara Formula pada SELURUH sepuluh dimensi (Lifecycle/Version/Testing/Explainability/Replay/Dependency/Composition/Scope/Audit/Determinism) plus dua dimensi tambahan yang baru diformalkan di ronde ini (Metadata, Visualization) — kedua tambahan ini murni memperkaya METADATA dan CARA REPRESENTASI, TIDAK mengubah Constitution, First Principle, Rule Semantics, Boundary, atau Ownership manapun yang sudah dikunci § A-M.

---

## O. Rule Composition

**Pertanyaan yang dijawab:** Bolehkah satu Rule memicu Rule lain (Rule A → Rule B → Rule C)? Bagaimana dependency-nya, cycle detection-nya, rekursinya?

**Prinsip:** Rule Composition **DIIZINKAN**, tapi tunduk pada mekanisme yang PERSIS SAMA dengan Dependency Graph Formula ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § D) — bukan mekanisme baru yang didesain dari nol. Alasan menggunakan ulang pola yang sama: masalahnya STRUKTURAL identik (graph of triggers yang harus acyclic), hanya domainnya beda (Rule memicu Rule, bukan Formula memicu Formula).

**Aturan konkret (diwariskan langsung dari `06` § D.2):**
1. **Circular Rule Composition (structural) — DITOLAK MUTLAK.** Rule A memicu Rule B memicu Rule A, dalam satu rangkaian eksekusi yang sama, TIDAK PERNAH sah. Dideteksi dengan algoritma yang SAMA (DFS three-color, `06` § D.2) diterapkan ke graph Rule, bukan graph Formula.
2. **Rekursi (Rule memicu dirinya sendiri, langsung atau tidak langsung) TERMASUK kategori Circular — ditolak sama.**
3. **Rule Composition BUKAN sirkularitas temporal-feedback yang sah** (pola yang dikonfirmasi valid di `06` § D.2 dan `05b` § 3a untuk Estimation↔Intelligence Engine) — KECUALI Rule B dipicu dari Domain Event yang SECARA DEFINISI terjadi pada titik waktu berbeda (mis. Rule A dipicu `EstimateVersionApproved`, Rule B dipicu `LessonsLearnedPropagated` yang baru muncul SETELAH proyek selesai — dua bidang waktu berbeda seperti pola yang sudah dikonfirmasi sebelumnya).
4. **Dependency Rule (Rule B butuh Rule A selesai lebih dulu) dicatat eksplisit** sebagai bagian struktur Rule (field tambahan `depends_on: Rule ID[]`, opsional, melengkapi § I) — dievaluasi dengan topological sort yang SAMA seperti Dependency Graph Formula (`06` § D.1), menjamin urutan eksekusi valid selama tidak ada siklus (konsekuensi matematis, bukan asumsi terpisah — pola pembuktian yang SAMA dengan `06b` § 4).
5. **Rule Dependency Visualization — WAJIB tersedia sebagai kemampuan, TIDAK didesain bentuknya di sini (koreksi founder, ronde keempat).** Alasan founder: "bagaimana saya memahami 2.000 Rule? Jawabannya bukan tabel, tetapi Graph." Karena graph Rule (poin 1-4 di atas) berbagi STRUKTUR MATEMATIS yang identik dengan Dependency Graph Formula ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § D — node dan edge, DAG, topological order), Visualization untuk keduanya SECARA PRINSIP adalah SATU kemampuan generik (`Generic Dependency Graph Renderer`) yang dipakai ulang untuk dua domain (Formula, Rule) — BUKAN dua implementasi terpisah. Bentuk visual konkretnya (library apa, layout apa) adalah keputusan **Persistence/Implementation Truth** (Phase K/L), sama seperti representasi permukaan Rule di § I — Philosophy ini hanya mengunci PRINSIPnya: kemampuan visualisasi WAJIB ada dan WAJIB generik lintas-domain, bukan dibangun ulang tiap kali domain baru (Rule sekarang, mungkin domain lain nanti) butuh graph-nya divisualisasikan.

---

## P. Rule Priority

**Pertanyaan yang dijawab:** Kalau Rule A dan Rule B sama-sama trigger pada `EstimateVersionApproved`, siapa jalan dulu? Priority? Weight? Dependency? Paralel?

**Prinsip:** Priority BUKAN nomor urut manual bebas (rawan konflik/tumpang tindih tak disengaja) — priority ditentukan lewat KOMBINASI dua mekanisme yang SUDAH ada, bukan mekanisme ketiga yang baru:

1. **Dependency eksplisit (§ O, `depends_on`)** menentukan urutan WAJIB kalau memang ada ketergantungan nyata — ini SELALU didahulukan.
2. **Untuk Rule yang SALING INDEPENDEN** (trigger sama, tidak saling bergantung) — defaultnya **PARALEL**, bukan sequential dengan priority number. Alasan: dua Rule independen yang dipaksa berurutan tanpa alasan struktural menciptakan Temporal Coupling semu (persis smell yang diidentifikasi Grand Architecture Review, dicatat sebagai risiko yang harus dihindari, bukan diulang) — kalau tidak ADA alasan mereka harus berurutan, jangan urutkan.
3. **Priority number HANYA relevan untuk SATU kasus sempit, dan bersifat KONDISIONAL (klarifikasi [`08b`](08b-phase-g0-orchestration-philosophy-validation.md) § 9 — bukan asumsi bahwa kondisi ini sudah ada sekarang):** KALAU suatu saat dua Rule independen sama-sama butuh resource yang terbatas dalam Execution Pipeline (mis. seandainya CAP-006 di masa depan menerapkan rate limit — Philosophy ini TIDAK menciptakan atau mengasumsikan rate limit itu ada sekarang, `06` § C.4 tidak menyebutkannya), MAKA `priority` adalah field TAMBAHAN opsional (bukan wajib), dipakai HANYA sebagai tie-breaker scheduling, BUKAN sebagai penentu urutan logika bisnis (yang tetap murni dari Dependency, poin 1).

**Kenapa desain ini (bukan priority number sebagai default):** Priority number sebagai mekanisme utama akan menciptakan ketergantungan implisit yang TIDAK tercatat sebagai `depends_on` eksplisit — melanggar Explainability (kenapa Rule ini jalan duluan? "Karena priority-nya 5" adalah jawaban yang tidak bisa ditelusuri ke alasan bisnis, beda dari "karena Rule ini butuh hasil Rule lain" yang eksplisit dan bisa dijelaskan).

---

## Q. Rule Scope

**Pertanyaan yang dijawab:** Rule berlaku di level mana — Company, Project, Estimate, Item? Apa beda Company Rule vs Project Rule vs Template Rule?

**Prinsip:** Scope Rule mengikuti pola YANG SUDAH ADA di `applicable_context` Calculation Strategy ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § B.2) — BUKAN konsep baru, murni penerapan pola yang sama ke domain Rule.

| Scope Level | Makna | Override Hierarchy Terkait |
|---|---|---|
| **Template Rule** (Reference/National level) | Rule bawaan/rujukan, seperti Standard AHSP untuk Formula — titik awal sebelum Company menyesuaikan | Level 1, Government/National Baseline (`06` § E.1) |
| **Company Rule** | Rule spesifik satu Company — hasil kustomisasi dari Template | Level 2, Company Override |
| **Project Rule** | Rule spesifik satu Project (mis. proyek dengan kompleksitas approval berbeda) | Level 3, Project Override |
| **Scenario/Estimate Rule** | Rule paling spesifik, hanya berlaku satu Scenario/Estimate Version tertentu | Level 4-5, Scenario/Manual Override |

**Resolusi Scope mengikuti algoritma resolusi Override Hierarchy yang SUDAH ada** (`06` § E.2) — Rule paling spesifik yang cocok dengan konteks eksekusi MENANG, sama seperti resolusi harga/formula. Ini BUKAN mekanisme ketiga baru — Rule Scope adalah PERLUASAN Override Hierarchy dari domain Calculation ke domain Orchestration, konsisten dengan cara CECEP sudah menyelesaikan masalah struktural yang sama (banyak level, satu yang menang) di tempat lain.

---

## R. Rule Explainability

**Pertanyaan yang dijawab:** Kenapa Procurement dibuat? Sistem harus bisa jawab persis seperti Calculation sudah bisa jawab "kenapa harga ini sebesar ini".

**Prinsip:** Rule Explainability mengikuti pola IDENTIK Explanation Tree Calculation ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § I) — dibangun OTOMATIS dari eksekusi, bukan laporan terpisah yang ditulis manual (alasan yang SAMA persis dengan § I.2 Phase E: kalau ditulis manual terpisah, akan selalu tertinggal/tidak sinkron).

**Struktur Rule Explanation (paralel Explanation Tree, tapi untuk keputusan proses bukan keputusan angka):**

```
Rule Explanation {
  rule_id:          Rule-018
  rule_version:     v2 (konsisten § K)
  trigger_event:    EstimateVersionApproved (event_id spesifik yang memicu)
  condition_evaluated: "Budget > 500jt" → TRUE (nilai aktual yang dibandingkan, bukan cuma kondisinya)
  action_taken:     Generate Procurement (Capability yang dipanggil, hasil pemanggilan)
  scope_resolved:   Project Rule "Proyek X" (level Scope yang menang, § Q, dengan jejak
                     kenapa level ini yang dipilih atas Company/Template Rule)
  timestamp:        kapan keputusan ini terjadi
}
```

**Contoh konkret (menjawab pertanyaan founder persis):**
```
Kenapa Procurement dibuat?
  → Rule-018 (v2), trigger EstimateVersionApproved
  → Condition "Budget > 500jt" = TRUE (Budget aktual: Rp 750jt)
  → Scope resolved: Project Rule "Proyek X" (bukan Company Rule default)
  → Action: Generate Procurement (dipanggil ke CAP-013, hasil: sukses)
```

**Relasi dengan Audit (Canonical Information Contract, `07` § C.1):** Rule Explanation adalah bentuk KONKRET dari elemen `Audit` yang sudah wajib ada di setiap Canonical Information — Rule Explanation MENGISI kewajiban Audit itu untuk domain Orchestration, bukan mekanisme terpisah.

---

## S. Rule Testability

**Pertanyaan yang dijawab:** Calculation sudah punya Testing (Sandbox/Benchmark, `06` § L). Rule juga harus, supaya CI/CD nanti bisa berjalan.

**Prinsip:** Rule Testing mengikuti pola IDENTIK Testing Formula ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § L.2-L.4) — Sandbox (salinan sesaat, bukan live reference) + syarat WAJIB sebelum status naik dari Draft ke Testing lalu Approved (§ J).

**Struktur uji (paralel Simulation/Benchmark Formula, diterapkan ke Rule):**

```
Rule Test Case {
  given_event:      Input Event tiruan (mis. EstimateVersionApproved dengan payload tertentu)
  given_context:    kondisi Sandbox (Company/Project/Scope yang relevan, § Q)
  expected_rule:    Rule mana yang SEHARUSNYA ter-trigger (termasuk resolusi Scope yang benar)
  expected_action:  Capability mana yang SEHARUSNYA dipanggil, dalam urutan apa
  expected_outcome: hasil yang diharapkan (sukses/gagal, Compensation ter-trigger atau tidak)
}
```

**Kenapa ini BUKAN mekanisme baru, murni penerapan ulang Sandbox/Benchmark Formula ke domain Rule:** Rule Test Case adalah `Given Event → Expected Rule → Expected Action → Expected Outcome`, terstruktur IDENTIK dengan `Given Input → Expected Output` yang sudah dipakai Testing Formula (`06` § L.4) — bedanya hanya domain yang diuji (proses, bukan angka).

**Syarat wajib sebelum Published (melengkapi § J):** Rule TIDAK BOLEH naik status dari Testing ke Approved tanpa MINIMAL satu Rule Test Case yang lolos — persis syarat yang sama dengan Formula tidak boleh naik dari Draft ke Tested tanpa lolos Benchmark (`06` § L.4).

---

## Assumptions

1. Definisi "Orchestrator" di dokumen ini sengaja diperlakukan sebagai FUNGSI abstrak (peran), bukan satu Capability konkret — konsisten dengan Orchestration Separation Principle yang menolak menjadikan orkestrasi milik satu Capability tunggal. Kalau implementasi nanti (Phase K/L) memerlukan satu titik teknis yang menjalankan Orchestration Rule (mis. sebuah Rule Engine), itu keputusan Persistence Truth, bukan keputusan Philosophy ini.
2. Klasifikasi CECEP sebagai "Hybrid" (Choreography untuk reaksi deterministic, Orchestration eksplisit untuk titik bercabang, § B) adalah OBSERVASI dari pola yang sudah ada di Event Catalog (`08` § A-B), bukan keputusan baru — dicatat eksplisit di sini untuk pertama kalinya sebagai bagian Philosophy formal.

## Open Questions

1. Apakah kelima jenis "yang secara eksplisit bukan tanggung jawab Orchestrator" (§ D) sudah lengkap, atau ada larangan lain yang perlu ditambahkan sebelum Rule Design dimulai?
2. Untuk Timeout (§ G, gap eksplisit) — apakah founder ingin nilai default timeout ditentukan di Philosophy ini (mis. per Criticality level, sama pola dengan Event Policy), atau ditentukan sepenuhnya saat Orchestration Rule Design per-Rule?
3. Untuk Orchestration Rule sebagai data terstruktur (§ I) — apakah delapan field (id/name/trigger/condition/action/failure_policy/timeout/version, plus `depends_on` opsional § O dan `priority` opsional § P) sudah cukup?
4. Untuk Failure Philosophy (§ L) — apakah keenam kemungkinan respons (Ignore/Retry/Rollback/Compensate/Manual/Stop) sudah lengkap, khususnya penegasan "Rollback level-data dilarang" — apakah ini sesuai model bisnis yang dibayangkan founder?
5. Untuk Rule Scope (§ Q) — apakah keempat level (Template/Company/Project/Scenario-Estimate) sudah cukup granular, atau ada level lain (mis. Branch, konsisten Multi-Company Multi-Branch, `05b` § 6) yang perlu ditambahkan?

## Required Decisions (Approval Gate)

1. Apakah definisi Orchestration (§ A) dan pembedaannya dari Workflow/BPMN/Saga/Choreography (§ B) sudah tepat menangkap posisi CECEP?
2. Apakah tabel "Yang Secara Eksplisit BUKAN Tanggung Jawab Orchestrator" (§ D) sudah lengkap dan cukup tegas sebagai pagar untuk Rule Design ke depan?
3. Apakah Quality Attributes Orchestration (§ G) — termasuk dua gap eksplisit (Timeout, Observability) — sudah diterima statusnya masing-masing?
4. Apakah Decision Checklist khusus Orchestration (§ H, sebelas pertanyaan) sudah cukup sebagai gerbang tambahan sebelum Rule individual di-freeze?
5. Apakah Execution Semantics (§ I), Rule Lifecycle (§ J, dengan status Superseded), Rule Versioning (§ K), Failure Philosophy (§ L), dan Determinism (§ M) sudah menjawab tuntas ronde kedua gap founder?
6. Apakah Rule Composition (§ O), Rule Priority (§ P), Rule Scope (§ Q), Rule Explainability (§ R), dan Rule Testability (§ S) sudah membawa Rule ke kesetaraan penuh dengan Formula sebagai first-class architectural citizen (§ N)?
7. Apakah Enterprise Orchestration Philosophy ini sekarang SUNGGUH siap di-freeze — tanpa perlu dibuka kembali saat Rule Design dimulai — dan Phase G boleh lanjut ke **Orchestration Rule Design** (termasuk akhirnya membahas Titik Keputusan Tunggal — lazy/eager/hybrid, urutan proses pasca-`EstimateVersionApproved`)?

---

## 🔒 ENTERPRISE ORCHESTRATION PHILOSOPHY FREEZE

**Status: APPROVED FOR FREEZE.** Founder eksplisit menyetujui freeze — dua gap terakhir (Rule Metadata, Rule Dependency Visualization) dinilai TIDAK mengubah filosofi (Constitution/First Principle/Rule Semantics/Boundary/Ownership tetap utuh), murni memperkaya metadata dan cara representasi, sehingga TIDAK BOLEH menahan proses freeze — sudah ditutup di § I dan § O sebelum status ini diberikan.

**Ringkasan cakupan yang di-freeze:** Definisi Orchestration (§ A), pembedaan dari Workflow/BPMN/Saga/Choreography (§ B), tanggung jawab dan batas tegas Orchestrator (§ C-D), Invariant (§ E), hubungan dengan Truth Layer lain (§ F), Quality Attributes khusus (§ G), Decision Checklist khusus (§ H), Execution Semantics + Metadata (§ I), Rule Lifecycle dengan Superseded (§ J), Rule Versioning (§ K), Failure Philosophy (§ L), Determinism (§ M), Ringkasan Kesetaraan dengan Formula (§ N), Rule Composition + Visualization (§ O), Rule Priority (§ P), Rule Scope (§ Q), Rule Explainability (§ R), Rule Testability (§ S) — sembilan belas section, empat ronde penyempurnaan, seluruhnya menutup Rule ke kesetaraan penuh dengan Formula sebagai first-class architectural citizen.

**Konsekuensi freeze (Progressive Freeze Chain, [`04`](../CECEP/04-architecture-constitution.md) § 7):** Mulai sekarang, Enterprise Orchestration Philosophy TIDAK BOLEH dibuka kembali tanpa ACR — Orchestration Rule Design (di bawah) WAJIB tunduk pada seluruh definisi, batas, dan checklist yang sudah dikunci di sini.

**Validasi independen (Phase G.0):** Sebelum Rule Design benar-benar dimulai, Philosophy ini divalidasi lewat gerbang terpisah — lihat [`08b-phase-g0-orchestration-philosophy-validation.md`](08b-phase-g0-orchestration-philosophy-validation.md) (Kontradiksi/Overlap/Hidden Ownership/Cross-Layer Leak/Constitution Violation, plus verifikasi ulang kesetaraan Rule-Formula). Satu klarifikasi kalimat diterapkan ke § P poin 3 (priority sebagai tie-breaker dipertegas KONDISIONAL, bukan asumsi CAP-006 sudah punya rate limit).

*Dokumen selanjutnya: Orchestration Rule Design (melanjutkan Phase G — termasuk akhirnya menjawab Titik Keputusan Tunggal, lazy/eager/hybrid dan urutan proses pasca-`EstimateVersionApproved`), lalu Phase G.1 — Orchestration Validation & Freeze.*
