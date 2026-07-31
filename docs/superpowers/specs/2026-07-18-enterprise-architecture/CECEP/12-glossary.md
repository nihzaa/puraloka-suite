# CECEP — Glossary

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** BUKAN dokumen fase, BUKAN sumber kebenaran baru — murni **kamus rujukan cepat**. Setiap entri adalah RINGKASAN dari definisi yang sudah dikunci di dokumen aslinya (dirujuk di kolom Sumber); kalau ringkasan di sini terasa berbeda dari dokumen aslinya, dokumen asli yang benar. Pelengkap [`11-architecture-roadmap-index.md`](11-architecture-roadmap-index.md) (yang memetakan FASE) — dokumen ini memetakan ISTILAH, lintas fase, disusun alfabetis di dalam kelompok tematik supaya bisa dicari cepat tanpa harus tahu istilah itu lahir di fase mana.

**Cara pakai:** Cari istilah, baca definisi satu-dua kalimat, ikuti link Sumber kalau butuh konteks penuh (kenapa istilah itu didefinisikan seperti itu, apa alternatif yang ditolak).

---

## A. Prinsip & Lapisan Dasar

**Architectural Invariant** — Komitmen konstitusi yang tidak berubah oleh implementasi/teknologi/AI (10 invariant, Phase C). *Sumber: [`03`](03-phase-c-problem-discovery.md).*

**Architecture Decision Checklist** — 11 pertanyaan wajib dijawab sebelum SETIAP freeze; prosedur sistematis yang menjalankan Threshold ACR. *Sumber: [`04`](04-architecture-constitution.md) § 12.*

**Architecture Metadata Model** — Nama resmi (BUKAN "Knowledge Graph", ditolak karena konotasi Neo4j/graph database) untuk kewajiban traceability progresif lintas fase — bukan artefak/graph database yang dibangun sekali. *Sumber: [`04`](04-architecture-constitution.md) § 13.*

**Architecture Quality Attributes** — 11 lensa evaluasi wajib (Scalability, Reliability, Availability, Maintainability, Evolvability, Auditability, Explainability, Traceability, Observability, Recoverability, Security & Compliance). Scalability didefinisikan sebagai PRINSIP ("harus scale tanpa redesign"), bukan angka spesifik. *Sumber: [`04`](04-architecture-constitution.md) § 11.*

**Decision Hierarchy** — Hakim terakhir kalau dua layer frozen ternyata bertentangan: Business > Capability > Calculation > Information > Persistence. Dipakai SETELAH konflik terjadi, bukan mencegahnya. *Sumber: [`04`](04-architecture-constitution.md) § 9.*

**Discovery Completion Rule** — Discovery dianggap selesai ketika seluruh Open Question tersisa TIDAK berpotensi mengubah struktur arsitektur (Five Truth Layers/Ownership/Replay/Contract/Version/Structure) — hanya terminologi/metadata/dokumentasi. Prinsip lintas-fase, lahir dari [`08j`](../enterprise-architecture-framework/08j-discovery-completion-assessment.md). *Sumber: [`04`](04-architecture-constitution.md) § 15.*

**Five Truth Layers** — Filosofi inti penyusunan seluruh blueprint dari atas ke bawah: Business → Capability → Calculation → Information → Execution. Layer 5 (Execution) TIDAK PERNAH menciptakan truth baru, hanya mengonsumsi Layer 2-4. *Sumber: [`04`](04-architecture-constitution.md) § 8.*

**Foundational Principles** — Empat filosofi tertinggi CECEP: (1) Company Intelligence Loop, (2) CECEP adalah Company Knowledge System, (3) Everything is Versioned, (4) Everything is Derived, Nothing is Re-entered. *Sumber: [`04`](04-architecture-constitution.md) § 1.*

**Momentum Bias** — Pola risiko: kewaspadaan menurun justru SAAT streak persetujuan lancar, bukan saat kesulitan. Ditemukan founder saat Rule Design (`08c`) ditulis sebelum discovery yang seharusnya mendahuluinya. *Sumber: [`08d`](../enterprise-architecture-framework/08d-rule-taxonomy-discovery.md) pembuka.*

**Operational Perspective** — Concern lintas-fase (backup/DR/observability/retention/rollback), diaktifkan progresif di Phase H(Operational Integration)/J(Operational Evolution)/K(Deployment Impact)/L(Operational Blueprint) — BUKAN fase berdiri sendiri. *Sumber: [`04`](04-architecture-constitution.md) § 14.*

**Orchestration Separation Principle** — Memiliki capability TIDAK BERARTI memiliki orchestration atasnya. Mencegah "God Capability" mislabeling dan mencegah Freeze Chain dibuka kembali keliru. *Sumber: [`04`](04-architecture-constitution.md) § 10.*

**Progressive Freeze Chain** — Governing rule lintas fase D-L: tiap lapisan dibekukan berurutan sebelum fase berikutnya membangun di atasnya; perubahan pada layer frozen butuh ACR. *Sumber: [`04`](04-architecture-constitution.md) § 7.*

---

## B. Governance & Traceability

**ACR (Architecture Change Request)** — Mekanisme formal mengubah keputusan yang sudah frozen. Threshold: perubahan struktur kontrak/cross-layer attribute leak/cross-time guarantee = ACR; klarifikasi notasi murni/aturan validasi tambahan = bukan ACR. *Sumber: [`04`](04-architecture-constitution.md) § 7.1, [`04a`](04a-adr-traceability-log.md).*

**ADR Traceability Log** — Catatan permanen SEMUA ACR, diterima maupun ditolak — bukan hanya mekanisme penolakan. *Sumber: [`04a`](04a-adr-traceability-log.md).*

**Deferred Refinement** — Status untuk Open Question yang TIDAK mengubah struktur fundamental (lolos kriteria Discovery Completion Rule) — dicatat sebagai backlog dokumentasi ringan, tidak memblokir Design. *Sumber: [`08j`](../enterprise-architecture-framework/08j-discovery-completion-assessment.md).*

**Deferred to Phase [X]** — Berbeda dari Deferred Refinement biasa: temuan nyata yang SUDAH diuji cukup dalam untuk memastikan desain saat ini aman, tapi bentuk penyelesaian permanennya sengaja ditinggalkan untuk fase lain yang menjadi domainnya (mis. Event Join Semantics → Deferred to Phase H karena menyentuh Integration Contract). *Sumber: [`08k`](../enterprise-architecture-framework/08k-phase-g1-rule-design-validation-freeze.md) § 13.*

**Discovery Completion Assessment** — Prosedur formal: kumpulkan SEMUA Open Question sepanjang satu rantai discovery, uji satu per satu terhadap Discovery Completion Rule, sebelum Design boleh dimulai. *Sumber: [`08j`](../enterprise-architecture-framework/08j-discovery-completion-assessment.md).*

**Phase Transition Brief** — Dokumen handover formal antar fase (bukan discovery/architecture/design): apa yang selesai, input wajib, apa yang tidak boleh diubah, apa yang harus dijawab fase berikutnya, Acceptance Criteria. Pola berulang untuk setiap transisi fase. *Sumber: [`10`](../enterprise-architecture-framework/10-phase-transition-g-to-h.md).*

**Stress Test (Validation & Freeze)** — Gerbang freeze yang menyerang desain dengan skenario adversarial (collision, circular, cascade, dst.) — BUKAN pemeriksaan grammar/consistency. *Sumber: [`08k`](../enterprise-architecture-framework/08k-phase-g1-rule-design-validation-freeze.md).*

---

## C. Capability & Calculation (Phase D-E)

**Capability Catalog** — CAP-001 s.d. CAP-013, tiap Capability adalah "Engine" bernama (Identity/Classification/Assembly/Pricing/Productivity/Calculation/Risk/Estimation/Scenario/Workflow/Intelligence/Retrieval Engine, Integration Gateway). *Sumber: [`05`](05-phase-d-capability-architecture.md).*

**Determinism (Calculation)** — Angka yang sama dari input yang sama, setiap kali. *Sumber: [`06b`](06b-phase-e1-calculation-validation-freeze.md) § 14.*

**Determinism (Orchestration)** — Same Input + Same Rule Version + Same Event → Must Produce Same Orchestration Decision. Menjamin KEPUTUSAN sama, BUKAN hasil eksekusi Capability eksternal yang dipanggil. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § M.*

**Dependency Graph (Formula)** — Graph antar-Formula dengan Circular Detection (algoritma DFS three-color) — dipakai ulang untuk Rule Composition (§ O `08a`). *Sumber: [`06`](06-phase-e-calculation-strategy.md) § D.*

**Explanation Tree** — Struktur otomatis yang menjelaskan "kenapa angka ini sebesar ini" — dibangun dari eksekusi, bukan laporan manual. Padanan untuk Rule: Rule Explanation (§ R `08a`). *Sumber: [`06`](06-phase-e-calculation-strategy.md) § I.*

**Formula Definition** — Aggregate Root milik CAP-006, immutable setelah Active, satu dari dua bentuk Executable Knowledge Model. *Sumber: [`06`](06-phase-e-calculation-strategy.md), [`07`](07-phase-f-enterprise-data-model.md) § D.2.*

**Konstitusi Calculation Strategy** — "AI tidak pernah menghitung sendiri, CAP-006 satu-satunya pemilik logika eksekusi kalkulasi." *Sumber: [`06`](06-phase-e-calculation-strategy.md) § pembuka poin 6, § N.*

**Override Hierarchy** — Resolusi banyak-level-satu-menang: Rule/Formula paling spesifik yang cocok konteks eksekusi MENANG. Dipakai ulang untuk Rule Scope (§ Q `08a`). *Sumber: [`06`](06-phase-e-calculation-strategy.md) § E.*

---

## D. Informasi (Phase F, `08g`-`08h`)

**Audit Data** — Catatan siapa/kapan/mengapa suatu perubahan terjadi; append-only, kelas SEJATI (bukan dimensi silang). *Sumber: [`08g`](../enterprise-architecture-framework/08g-information-classification-discovery.md) § A.9.*

**Canonical Information Contract** — 11 elemen wajib tiap Information Class: Identity/Meaning/Owner/Lifecycle/Version/Allowed Mutation/Consumers/Producers/Source of Truth/Derivation Rule/**Audit** (elemen ke-11, ditambah via ACR-002). *Sumber: [`07`](07-phase-f-enterprise-data-model.md) § C.*

**Characteristic (Information)** — Sumbu KEDUA (terpisah dari Classification): Versioned/Historical/Auditable/Replayable/Immutable(3 level)/Temporal Scope — cara sebuah objek DIKELOLA dari waktu ke waktu, independen dari jenis sumber kebenarannya. *Sumber: [`08h`](../enterprise-architecture-framework/08h-information-characteristic-discovery.md) § B.*

**Classification (Information)** — Sumbu PERTAMA: 16 kelas jenis sumber kebenaran & cara reproduksi data (Master/Reference/Transactional/Derived/Computed/Knowledge/Configuration/dst). *Sumber: [`07`](07-phase-f-enterprise-data-model.md) § A, diperiksa ulang [`08g`](../enterprise-architecture-framework/08g-information-classification-discovery.md).*

**Computed Data** — Snapshot hasil SATU eksekusi tertentu yang melibatkan faktor tidak sepenuhnya internal (state eksternal/waktu eksekusi); menghapusnya BERARTI kehilangan informasi yang tidak bisa direproduksi identik. Kategori SEJAJAR dengan Derived Data, bukan subtype-nya. *Sumber: [`08g`](../enterprise-architecture-framework/08g-information-classification-discovery.md) § A.5, § C.*

**Derived Data (True Derived)** — Nilai yang bisa dihitung ulang KAPAN SAJA dari sumber internal, TIDAK ADA informasi hilang kalau dihapus dan dihitung ulang. *Sumber: [`07`](07-phase-f-enterprise-data-model.md) § A, dipertajam [`08g`](../enterprise-architecture-framework/08g-information-classification-discovery.md) § A.4.*

**Historical (dimensi)** — BUKAN kelas sejajar — dimensi silang (Characteristic) yang melekat pada kelas lain begitu tidak aktif lagi, tapi tetap tersimpan/bisa dirujuk. *Sumber: [`08g`](../enterprise-architecture-framework/08g-information-classification-discovery.md) § A.7, diformalkan [`08h`](../enterprise-architecture-framework/08h-information-characteristic-discovery.md) § B.2.*

**Immutable (3 level)** — Full Immutable (Event/Audit/Computed Data), Versioned-Immutable (Master/Knowledge/Configuration — satu versi immutable, versi aktif bisa berpindah), Mutable (Temporary Data, status field). *Sumber: [`08h`](../enterprise-architecture-framework/08h-information-characteristic-discovery.md) § B.5.*

**Replay-by-Recompute** — Mekanisme Replay dengan menjalankan ulang proses dari sumber, WAJIB deterministik identik (True Derived Data, Formula). *Sumber: [`08h`](../enterprise-architecture-framework/08h-information-characteristic-discovery.md) § C.2.*

**Replay-by-Retrieve** — Mekanisme Replay dengan membaca kembali snapshot yang SUDAH tersimpan, tanpa hitung ulang (Computed Data, Snapshot Data). *Sumber: [`08h`](../enterprise-architecture-framework/08h-information-characteristic-discovery.md) § C.2.*

**Versioned (dimensi)** — Dimensi silang (Characteristic): objek punya rangkaian versi yang mewakili entitas logis SAMA, versi baru menggantikan "versi aktif" tanpa menghapus versi lama. *Sumber: [`08g`](../enterprise-architecture-framework/08g-information-classification-discovery.md) § A.8, diformalkan [`08h`](../enterprise-architecture-framework/08h-information-characteristic-discovery.md) § B.1.*

---

## E. Orchestration & Rule (Phase G)

**Authored_by** — Field Rule: `human` | `ai_proposed`. AI boleh mengusulkan Rule Draft, TIDAK BOLEH Published tanpa Approval manusia. *Sumber: [`08e`](../enterprise-architecture-framework/08e-rule-meta-model-discovery.md) § D.*

**Choreography** — Pola tanpa konduktor pusat, setiap service bereaksi independen. CECEP Hybrid: Choreography untuk reaksi deterministic, Orchestration eksplisit untuk titik bercabang kebijakan. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § B.*

**Executable Knowledge Model** — Kategori payung BARU yang menaungi Rule dan Formula: representasi terstruktur non-kode, dieksekusi Engine generik, Enterprise Asset penuh (lifecycle/version/testing/audit/explainability). Rule murni Layer 5; Formula berjejak Layer 3 (definisi) + Layer 5 (eksekusi). *Sumber: [`08e`](../enterprise-architecture-framework/08e-rule-meta-model-discovery.md) § B, dipertajam [`08i`](../enterprise-architecture-framework/08i-rule-ontology-validation.md) § D.*

**Idempotency Key** — Field pada Rule Execution Instance (bukan Rule Definition): `hash(rule_id + rule_version + trigger_event_id)`, dipakai CAP-013 mendeteksi panggilan duplikat. *Sumber: [`08k`](../enterprise-architecture-framework/08k-phase-g1-rule-design-validation-freeze.md) § 9.*

**Orchestration** — Keputusan tentang KAPAN dan URUTAN APA capability yang sudah punya data/kemampuan sendiri (Layer 1-4, frozen) dipanggil bekerja sama — TANPA pernah mengubah apa yang mereka miliki. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § A.*

**Rule Composition** — Rule A boleh memicu Rule B, DIIZINKAN, tunduk algoritma acyclic yang sama dengan Dependency Graph Formula. Circular ditolak mutlak. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § O.*

**Rule Explanation** — Struktur otomatis menjawab "kenapa Rule ini trigger, dengan Scope apa, memanggil apa" — padanan Explanation Tree untuk domain proses (bukan angka). *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § R.*

**Rule Family / Template / Instance** — Tiga lapis reuse: Family (pengelompokan tujuan bisnis lintas-company), Template (definisi dengan parameter, opsional), Instance (Template terisi parameter untuk Company/Project tertentu — punya `id` unik, yang benar-benar dieksekusi). *Sumber: [`08f`](../enterprise-architecture-framework/08f-rule-storage-philosophy.md) § C.*

**Rule Group** — Kumpulan Rule ber-trigger sama, dianggap satu kesatuan untuk keperluan Recovery — VIEW/query dinamis, BUKAN Aggregate Root baru. *Sumber: [`08e`](../enterprise-architecture-framework/08e-rule-meta-model-discovery.md) § C, diterapkan [`08c v2`](../enterprise-architecture-framework/08c-orchestration-rule-design-v2.md) § F.*

**Rule Lifecycle** — Draft → Testing → Approved → Published → **Superseded** (revisi normal, sering) → **Deprecated** (penghentian total, jarang) → Archived. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § J.*

**Rule Priority** — BUKAN nomor urut bebas — ditentukan Dependency eksplisit dulu, lalu default PARALEL untuk Rule independen; priority number hanya tie-breaker KONDISIONAL untuk resource terbatas yang belum tentu ada. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § P.*

**Rule Scope** — Empat level: Template Rule (Reference/National) → Company Rule → Project Rule → Scenario/Estimate Rule, resolusi paling spesifik menang. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § Q.*

**Rule Testability** — Given Event → Expected Rule → Expected Action → Expected Outcome, wajib minimal satu Test Case lolos sebelum Approved. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § S.*

**Saga** — Pola distributed-transaction dengan Compensation eksplisit — salah satu TEKNIK yang dipakai orkestrasi CECEP, bukan sinonim Orchestration itu sendiri. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § B.*

**Trigger_type** — Field Rule: `domain_event` (dari Event Catalog bisnis) | `system_signal` (kondisi internal Layer 5, mis. Rule Group gagal total). *Sumber: [`08e`](../enterprise-architecture-framework/08e-rule-meta-model-discovery.md) § D.*

---

## F. Failure & Execution Semantics

**Compensation** — Tindakan pemulihan eksplisit; ISI kompensasi tetap milik capability yang mengeksekusinya, Orchestrator hanya menentukan BAHWA itu harus terjadi. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § L.*

**Failure Philosophy** — Enam respons kegagalan: Ignore/Retry/Rollback(**dilarang** level-data)/Compensate/Manual/Stop. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § L.*

**Recovery Rule** — Rule dengan `trigger_type: system_signal` yang trigger-nya kegagalan total satu Rule Group; DILARANG memanggil Capability yang sama dengan anggota Rule Group yang gagal (mencegah infinite recovery loop). *Sumber: [`08e`](../enterprise-architecture-framework/08e-rule-meta-model-discovery.md) § C, diperkuat [`08k`](../enterprise-architecture-framework/08k-phase-g1-rule-design-validation-freeze.md) § 7.*

**Rollback (level-data)** — DILARANG MUTLAK — Estimate Version immutable setelah Approved; "pembatalan" hanya sah sebagai Stop (berhenti maju) atau Compensate (perbaiki maju), tidak pernah menghapus jejak. *Sumber: [`08a`](../enterprise-architecture-framework/08a-enterprise-orchestration-philosophy.md) § L.*

---

## H. Integration (Phase H)

**Adapter** — Objek eksplisit di dalam Integration Strategy yang memetakan Canonical Information Contract ↔ format target eksternal — MENANDAI PERSIS lokasi Determinism Boundary, bukan logic tersembunyi. *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 20.*

**Determinism Boundary** — Invariant Phase H: titik di mana CECEP secara eksplisit mengakui jaminannya (Determinism, Replay, dst.) berhenti berlaku otomatis. Nama teknis untuk "Trust Boundary". *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 0.1.*

**Integration (definisi)** — Titik arsitektural di mana CECEP secara sadar mengakui jaminannya tidak berlaku otomatis untuk sesuatu di luar kendalinya, dan mendefinisikan eksplisit apa yang masih bisa dijamin. Sibling terhadap Orchestration (bukan subtype), dua-duanya di Layer 5. *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 2, § 7.*

**Integration Point** — Enterprise Asset (Configuration Data, BUKAN Executable Knowledge Model) yang mendeklarasikan satu titik integrasi: Titik Serah, Uncertainty Window, Reconciliation, Join Policy, Adapter, Lifecycle, Dual Ownership. *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 22.6, diperkaya [`15`](../enterprise-architecture-framework/15-phase-h1-reality-stress-validation.md).*

**Ontology Relation (katalog 10)** — Ownership/Consumption/Composition-Trigger/Derivation/Override-Priority/Constraint/Projection/Producer-Consumer/Realization/Sibling — daftar resmi jenis relasi antar konsep ontologis CECEP, ditemukan dari preseden nyata (bukan dikarang). *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 11.3.*

**Reconciliation** — Elemen ketiga struktur Integration (bagaimana CECEP akhirnya tahu, atau memutuskan tidak pernah tahu, apa yang terjadi setelah Titik Serah) — bisa sinkron/async-ack/polling/none. *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 14.1.*

**Sibling (definisi formal)** — Dua konsep di Layer sama, TANPA relasi ownership, DENGAN properti yang kontradiksi-jika-disamakan, SALING DIPERLUKAN untuk kelengkapan Layer — tiga syarat terukur, dipakai ulang untuk pasangan konsep manapun. *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 10.*

**Test of Difference / Test of Equivalence** — Dua alat uji ontologi CECEP yang sah (menggantikan "inheritance" yang DITOLAK, lihat § G) — Difference: kontradiksi-jika-disamakan; Equivalence: padanan-lengkap-tanpa-residual. *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 8.1, § 12.*

**Titik Serah (Handoff Point)** — Elemen pertama struktur Integration: momen persis CECEP berhenti mengendalikan. *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 14.1.*

**Uncertainty Window** — Elemen kedua struktur Integration: rentang dari Titik Serah sampai CECEP tahu hasilnya — spektrum nol/instan sampai tidak terhingga, termasuk kelas `"none"` (tidak ada yang direncanakan ditunggu sama sekali). *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 14.1, [`15`](../enterprise-architecture-framework/15-phase-h1-reality-stress-validation.md) § 10.1.*

---

## I. AI (Phase I)

**AI (definisi)** — Sumber jawaban/rekomendasi yang aturan pembentuknya diperoleh lewat EKSTRAKSI dari data/contoh, BUKAN spesifikasi eksplisit manusia sebelum eksekusi. Bertahan setelah dua definisi sebelumnya ("open-ended question", "non-traceable reasoning") ditarik karena gagal serangan langsung. *Sumber: [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § 7.*

**AI Meta Model** — Kategori ontologis TERSENDIRI untuk AI — bukan Capability (tidak punya domain), bukan Strategy murni (lintas-Capability), bukan Configuration Data (proses aktif bukan nilai statis), bukan anggota penuh Executable Knowledge Model (gagal Equivalence pada Explainability). *Sumber: [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § 12-13.*

**Anthropomorphism Bias** — Alarm preventif: jangan definisikan AI lewat nama produk populer (LLM/ChatGPT/Claude/Agent/MCP) sebelum ontologi ditemukan — versi domain-AI dari kesalahan yang sama dengan draf Integration pertama (mekanisme sebelum ontologi). *Sumber: [`13`](../enterprise-architecture-framework/13-working-methodology.md) § 3.*

**Authority Camouflage / Fluency as Authority** — Anti-pattern AI: output yang secara linguistik meyakinkan dipersepsikan sebagai kebenaran, padahal fasih ≠ benar — tidak punya padanan di Integration (Integration Point tidak pernah "berpura-pura yakin"). *Sumber: [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § 0.B.*

**Candidate Anchoring Bias** — Risiko: daftar kandidat awal (meski berguna) diam-diam membatasi ruang pencarian — dilawan dengan Zero Candidate Test. *Sumber: [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § 4.1.*

**Decision Competition** — Kebiasaan wajib: bangun ruang kandidat penuh SEBELUM menyimpulkan, uji semua dengan kriteria eksplisit yang sama — melawan First Satisfactory Candidate Bias. *Sumber: [`13`](../enterprise-architecture-framework/13-working-methodology.md) § 4.*

**Infinite Discovery Bias** — Keyakinan keliru bahwa discovery lebih panjang = lebih benar — alasan Discovery Completion Rule diterapkan tegas, bukan mencari kandidat ke-10/11/12 demi "kelengkapan". *Sumber: [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § Status (putaran akhir Discovery).*

**Tiga Kategori Dependency** — Ontologis (domain baru runtuh tanpa ini)/Implementasi (bisa berdiri sendiri, hanya lebih lambat)/Reuse Murni (pola dari fase lebih tua) — kerangka wajib sebelum menerima klaim "domain X mewarisi Y". *Sumber: [`18`](../enterprise-architecture-framework/18-phase-i1-ai-reality-stress-validation.md) § 11.*

**Zero Candidate Test** — Sebelum memakai kandidat yang sudah ditulis, paksa jawab dulu murni dari Five Whys tanpa melihat kandidat lama — mendeteksi Candidate Anchoring Bias. *Sumber: [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § 4.1.*

---

## J. Istilah yang Ditolak (Penting untuk Konteks Historis)

**"God Capability"** — Label yang DITOLAK untuk CAP-008 (Estimation) — banyak dependency BUKAN otomatis pelanggaran; tes yang benar adalah hidden ownership, bukan jumlah dependency. *Sumber: [`04`](04-architecture-constitution.md) § 11.*

**"Knowledge Graph"** — Nama DITOLAK, diganti "Architecture Metadata Model" — menghindari konotasi Neo4j/graph database untuk sesuatu yang sebenarnya kewajiban metadata progresif. *Sumber: [`04`](04-architecture-constitution.md) § 13.*

**"Rule = Configuration Data"** — Kesimpulan AWAL yang DITOLAK (terlalu cepat, ronde pertama `08e`) — direvisi jadi Rule = bentuk Executable Knowledge Model, Configuration Data hanya salah satu dimensi parsialnya. *Sumber: [`08e`](../enterprise-architecture-framework/08e-rule-meta-model-discovery.md) § A.2, § B.*

**"Titik Keputusan Tunggal"** — Istilah LAMA yang ditinggalkan setelah Philosophy membuktikan Rule adalah first-class citizen dengan Composition/Priority/Scope — mindset bergeser dari "jawab satu keputusan" ke "desain Orchestration Rule System". *Sumber: [`08`](../enterprise-architecture-framework/08-phase-g-enterprise-orchestration-architecture.md) § H, reframing [`08c v2`](../enterprise-architecture-framework/08c-orchestration-rule-design-v2.md) pembuka.*

**"Inheritance/mewarisi properti" sebagai alat uji ontologi** — DITOLAK sebagai alat uji CECEP (dipakai sekali secara naratif di `08e`, ternyata tidak pernah disahkan formal) — digantikan Test of Difference/Equivalence. CECEP tidak punya konsep pewarisan ala OOP untuk relasi ontologisnya. *Sumber: [`14`](../enterprise-architecture-framework/14-phase-h-integration-discovery.md) § 8.*

**"AI = Non-Traceable Reasoning Source"** — Definisi kerja PUTARAN KEDUA yang DITARIK setelah gagal Reverse Proof (skenario "AI dengan traceability sempurna lima tahun lagi" tetap AI — membuktikan traceability konsekuensi teknologi, bukan sifat ontologis). *Sumber: [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § 7.*

**"AI = Open-ended Question Answerer"** — Definisi kerja PUTARAN PERTAMA yang DITARIK setelah gagal dua serangan langsung (2+2 punya satu jawaban tapi tetap AI; desain logo open-ended tapi dijawab manusia tanpa AI). *Sumber: [`17`](../enterprise-architecture-framework/17-phase-i-ai-discovery.md) § 4.*

---

## Assumptions

1. Glossary ini mencakup istilah yang MUNCUL BERULANG atau BERPOTENSI ambigu bagi pembaca baru — bukan seluruh kosakata CECEP secara ekshaustif (mis. nama Capability individual CAP-001 s.d. CAP-013 tidak diberi entri terpisah, cukup dirujuk lewat "Capability Catalog"). Kalau ditemukan istilah penting yang hilang, ditambahkan sesuai kebutuhan, bukan tanda dokumen ini gagal.

## Open Questions

(Tidak ada — dokumen ini murni konsolidasi definisi yang sudah dikunci.)

## Status

**Glossary selesai — sepuluh kelompok tematik (Prinsip Dasar, Governance, Capability/Calculation, Informasi, Orchestration/Rule, Failure/Execution, Integration, AI) plus satu kelompok Istilah yang Ditolak (konteks historis: kenapa nama/alat uji tertentu TIDAK dipakai, termasuk dua definisi AI yang ditarik sebelum bertahan).** Living document — diperbarui setiap kali fase baru memperkenalkan istilah baru yang berpotensi ambigu.
