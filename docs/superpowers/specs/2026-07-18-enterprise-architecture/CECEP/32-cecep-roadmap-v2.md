# CECEP Roadmap v2 — Restructured Post-Audit

**Kedudukan:** Menggantikan struktur fase A→L untuk seluruh pekerjaan CECEP SEJAK titik ini. Tidak menggantikan hasil `00`-`03b` (Foundation, tetap berlaku penuh sebagai baseline) — menggantikan bentuk *lanjutan* yang sebelumnya akan berupa Phase D-L versi lama.
**Dasar:** [`29-context-integrity-audit.md`](29-context-integrity-audit.md) (bukti drift), [`30-cecep-constitution.md`](30-cecep-constitution.md) (hukum batas domain), [`31-adr-cecep-framework-separation.md`](31-adr-cecep-framework-separation.md) (pemisahan resmi G-K ke Framework).
**Prinsip struktural:** Setiap fase di bawah WAJIB dibuka dengan menjawab Constitution Article 6 secara eksplisit sebelum isi ditulis, dan ditutup dengan Article 7 (Implementation Readiness Test) sebelum dianggap selesai. Ini bukan formalitas — ini pagar yang tidak ada di roadmap lama, dan absennya pagar itulah yang menyebabkan drift G→L.

---

## Peta 12 Fase

```
1. Mission & Business Vision           ← ✅ DERIVED & FROZEN (= 01, 02 lama, dirujuk bukan ditulis ulang)
2. Construction Cost Lifecycle         ← ✅ DERIVED & FROZEN (= 01 §Estimate Outputs, 03 lama)
3. Capability Architecture             ← ✅ DERIVED & FROZEN PERMANENTLY (35-38, menggantikan 05/05b — SUPERSEDED)
4. Cost Engineering Philosophy         ← ✅ DERIVED & FROZEN (= 02 lama, Foundational Principles)
5. Calculation Strategy Architecture   ← ✅ DERIVED & FROZEN (42-43, menggantikan 06/06b — SUPERSEDED)
6. Derive Domain Model                 ← ✅ DERIVED & FROZEN (44, 13 domain diturunkan eksplisit dari 03b evidence)
7. Data Architecture                   ← ✅ DERIVED & FROZEN (45, menggantikan 07/07b/07c — SUPERSEDED)
8. Integration Architecture            ← ✅ DERIVED & FROZEN (46, ACL category_id↔cost_code_id)
9. Automation Architecture             ← ✅ DERIVED & FROZEN (47, Formula/Approval Workflow)
10. AI Cost Engineering                ← ✅ DERIVED & FROZEN (48, Excel-first, approval-gated)
11. Implementation Roadmap             ← ✅ DERIVED & FROZEN (49, 4 milestone build order)
12. Documentation Package              ← ✅ DERIVED & FROZEN (50, 8 Reference dipetakan ke sumber)
```

**Seluruh 12 Fase Roadmap V2 sekarang Derived & Frozen — planning CECEP selesai.** Lihat § Ringkasan Akhir di bawah untuk rekap penuh.

**Catatan penting soal penomoran:** Fase 1/2/4 langsung dari `01`/`02`/`03` (lolos audit `29` tanpa revisi). Fase 3/5/7 MENGGANTIKAN TOTAL rencana verifikasi dokumen lama (`05`/`05b`, `06`/`06b`, `07`/`07b`/`07c`) — ketiga kelompok dokumen lama itu ditemukan terikat Capability Catalog CAP-XXX yang sudah usang (lihat header ⚠️ SUPERSEDED di masing-masing file) dan TIDAK dipakai sebagai evidence otoritatif. Fase 6 diturunkan eksplisit dari `03b` (Discovery Complete, evidence) lewat mode `40`, bukan disalin. Fase 8-12 sengaja sempit by design (`32` asli), menghindari Framework lama (`08`-`08k`, `14`-`19`, `28`) yang terkontaminasi CAP-XXX dan/atau sudah dipindah ke Framework via `31`. Istilah status baku: lihat [`40`](40-architecture-derivation-constitution.md) § Tiga Istilah Status.

---

## Fase 1 — Mission & Business Vision ✅ DERIVED & FROZEN

**Sumber:** [`01-phase-b-cost-engineering-discovery.md`](01-phase-b-cost-engineering-discovery.md), [`02-phase-b5-core-cost-engineering-architecture.md`](02-phase-b5-core-cost-engineering-architecture.md) § Identitas Resmi.
**Artefak:** Primary Mission, Company Intelligence Loop, Greenfield Adoption Requirement, Maturity Model 5-level.
**Article 6 check:** Menjawab langsung "apa CECEP dan untuk siapa" — prasyarat semua capability di bawah.

## Fase 2 — Construction Cost Lifecycle ✅ DERIVED & FROZEN

**Sumber:** `01` § 8 (12 Estimate Outputs), `01` § 0 (profil General Contractor, Civil+Building).
**Artefak:** Tender→Estimate→RAB→RAP→Execution→Actual Cost→Variance→Lessons Learned sebagai siklus penuh; 12 output estimasi terdaftar dengan status kematangan.
**Article 6 check:** Setiap tahap lifecycle langsung memetakan ke satu/lebih capability Article 2.

## Fase 3 — Capability Architecture ✅ FROZEN PERMANENTLY

**Sumber:** [`35-phase3-capability-architecture.md`](35-phase3-capability-architecture.md) (16 capability final, setelah filter dari 20 kandidat), [`36-phase3-capability-boundary-validation.md`](36-phase3-capability-boundary-validation.md) (No-UI/No-Menu/Removal Test per capability), [`37-phase3-capability-interaction-map.md`](37-phase3-capability-interaction-map.md) (Input→Transformation→Output→Consumer, loop Intelligence penuh), [`38-phase3-domain-readiness-assessment.md`](38-phase3-domain-readiness-assessment.md) (readiness terhadap Fase 6).
**Status:** Rencana awal fase ini adalah memverifikasi `05`/`05b` lama — DIGANTIKAN. Alih-alih memverifikasi dokumen lama, Fase 3 ditulis ulang penuh sebagai `35`-`38`, divalidasi tiga putaran (Capability→Boundary→Interaction→Readiness), dan di-Freeze permanen ([ACR-004](04a-adr-traceability-log.md#acr-004-capability-boundary-corrections--ahsp-management-merge-resource-management-rename)). `05`/`05b` lama TIDAK dipakai lagi sebagai sumber — digantikan total.
**Arah dependency (final, tidak berubah lagi setelah Freeze):** Capability Architecture menjawab "apa yang harus dimiliki platform". Domain Model (Fase 6) menjawab "objek apa yang mewujudkan capability itu". **Domain Model bergantung pada Capability Architecture — bukan sebaliknya.** Capability Architecture (Fase 3) mendefinisikan DAFTAR capability dari Mission+Lifecycle (Fase 1-2), lalu Domain Model (Fase 6) menderivasi objek konkret per capability lewat Interaction Map (`37`).
**Artefak final:** 16 capability (Tender Estimation, Assembly Library [+AHSP], RAB Builder, RAP Builder, Resource Identity, Price Book, Productivity Library, Calculation Strategy, Budget Baseline, Procurement Planning, Cost Control, Cashflow Forecast, Historical Cost Intelligence, AI Estimation, AI Recommendation, BOQ sebagai turunan RAB) + Capability Interaction Map penuh + Readiness Assessment terhadap Confirmed Aggregate Root.
**Aturan pasca-Freeze:** Tidak dibuka kembali kecuali lewat ADR resmi (lihat [`38`](38-phase3-domain-readiness-assessment.md) § STATUS).

## Fase 4 — Cost Engineering Philosophy ✅ DERIVED & FROZEN

**Sumber:** `02` § Foundational Principle Kedua-Keempat, § 10 Prinsip Final, § 6 Architectural Constraints.
**Artefak:** Explainability/Decision Engine/Scenario Comparison/No Data Duplication/Engine-over-Module — lima constraint mengikat.
**Article 6 check:** Setiap constraint eksplisit mengunci CARA capability dibangun (bukan capability baru sendiri) — semua lolos Article 5 (Depth Limit) karena masing-masing terbukti mengurangi risiko implementasi konkret (No Data Duplication → mencegah 5-6 titik update manual, dst).

## Fase 5 — Calculation Strategy Architecture ✅ DERIVED & FROZEN

**Status akhir:** Diselesaikan penuh di [`42-phase5-calculation-strategy-architecture.md`](42-phase5-calculation-strategy-architecture.md), diaudit di [`43-phase5-derivation-audit.md`](43-phase5-derivation-audit.md). **`06`/`06b` lama TIDAK dipakai sebagai evidence** — keduanya ditemukan terikat Capability Catalog CAP-XXX usang saat penyusunan Fase 7 (`45`), sekarang ditandai ⚠️ SUPERSEDED di file masing-masing. `42` diturunkan langsung dari `01`/`02`/`35`/`37`, independen dari `06`/`06b` sejak awal.
**Trace Status:** 5/6 konsep ✓ Fully Derived (audit `43` menemukan 2 klaim ❌ Invented di detail kalimat, dibiarkan sebagai catatan historis — tidak dibuka ulang, sesuai keputusan founder).

*(Konteks di bawah dipertahankan sebagai jejak historis proses.)*

## Fase 6 — Derive Domain Model ✅ DERIVED & FROZEN

**Status akhir:** Diselesaikan penuh di [`44-phase6-derive-domain-model.md`](44-phase6-derive-domain-model.md) — 13 domain diturunkan eksplisit dengan Business Responsibility + Trace Status (13/13 ✓ Fully Derived), dua open item (RAP Risk Register, Fallback UX) ditutup sebagai housekeeping. DoD 8/8 ✓. Status naik dari Ready for Derivation ke Derived & Frozen sesuai `40` § Tiga Istilah Status.

*(Konteks di bawah dipertahankan sebagai jejak historis proses — status sudah final di atas.)*

**Status (dikoreksi — kesalahan sebelumnya ditinggalkan sebagai jejak, bukan dihapus diam-diam):** Versi dokumen ini sebelumnya menulis "✅ SELESAI (fondasi dari `03b`)" — founder mengoreksi ini sebagai keliru secara filosofis, bukan sekadar gaya bahasa. `03b` adalah **Discovery Complete** (Discovery Material/EVIDENCE), BUKAN Derived Domain Model. Menyebut Fase 6 "selesai karena `03b` ada" menyiratkan `03b` adalah Authority yang tinggal dipakai, padahal mode kerja sejak `39`/`40` mengharuskan setiap Aggregate Root diturunkan ULANG secara eksplisit lewat rantai Capability→Interaction→Business Responsibility, dengan `03b` sebagai salah satu sumber evidence — bukan hasil akhir yang otomatis "sudah selesai". Status yang benar: **Ready for Derivation** (istilah baku, `40` § Tiga Istilah Status) — seluruh bahan tersedia (Capability Frozen `35`-`38` + Discovery Material `03b`), tapi pekerjaan derivasi eksplisit (Business Responsibility → Aggregate Root → Entity, dengan Trace Status per keputusan) BELUM dikerjakan/belum di-Freeze.
**Evidence tersedia (bukan "sumber" dalam arti otoritatif):** [`03b-phase-c5-core-domain-discovery.md`](03b-phase-c5-core-domain-discovery.md) (Discovery Complete — 13 domain terkonfirmasi sebagai evidence, LENGKAP tapi belum diderivasi ulang lewat mode `40`) + [`37-phase3-capability-interaction-map.md`](37-phase3-capability-interaction-map.md) (rujukan derivasi wajib, Authority) + [`38-phase3-domain-readiness-assessment.md`](38-phase3-domain-readiness-assessment.md) (konfirmasi 13 dari 16 capability punya evidence Aggregate Root yang layak diderivasi).
**Yang BELUM dikerjakan (perbedaan dari status lama):** Setiap Aggregate Root di `03b` (Estimate Version, Assembly, Price Book Entry, dst) BELUM punya Trace Status resmi (✓/⚠️/❌) yang ditulis eksplisit mengikuti format `40`. Pekerjaan Fase 6 sesungguhnya adalah menuliskan derivasi itu eksplisit — bukan menyalin `03b` apa adanya.
**Perubahan mode kerja (per [`39-phase-transition-notice-discovery-closed.md`](39-phase-transition-notice-discovery-closed.md) dan [`40-architecture-derivation-constitution.md`](40-architecture-derivation-constitution.md)):** Objective fase ini diganti dari "Design Domain Model" jadi **"Derive Domain Model"**. Kerja di fase ini (termasuk menyelesaikan RAP Risk Register, `03b` § B.3) TIDAK BOLEH memperkenalkan domain baru di luar 13 Confirmed Domain (evidence) + rujukan Interaction Map (authority) — setiap keputusan wajib membawa Derivation Trace dengan Trace Status (`39`/`40`).
**Urutan wajib per entri domain (`40` § Perbaikan Urutan Fase 6):**
```
Capability (35) → Interaction (37) → Business Responsibility → Aggregate Root → Entity → Value Object
```
Business Responsibility adalah langkah eksplisit yang WAJIB DITULIS sebelum menetapkan Aggregate Root — menjawab "tanggung jawab bisnis apa yang membuat kelompok data ini harus konsisten dijaga bersama", bukan langsung melompat dari Capability ke daftar Entity/tabel. `03b` dipakai sebagai EVIDENCE untuk mengisi langkah ini (mis. Estimate Version di `03b` § Aggregate Root sudah punya alasan business responsibility yang tepat — tinggal ditulis eksplisit mengikuti format `40`, bukan diciptakan ulang dari nol), bukan disalin sebagai hasil final.
**Status akan naik ke "Derived & Frozen" HANYA setelah:** seluruh 13 domain di `03b` ditulis ulang eksplisit dengan Business Responsibility + Trace Status per `40`, lolos DoD (`34`) kriteria 1-8 penuh.

## Fase 7 — Data Architecture ✅ DERIVED & FROZEN

**Status akhir:** Diselesaikan penuh di [`45-phase7-data-architecture.md`](45-phase7-data-architecture.md). **`07`/`07b`/`07c` lama TIDAK dipakai sebagai evidence Ownership** — ditemukan terikat Capability Catalog CAP-001..013 yang sudah usang (mis. Risk Register ditaruh di bawah "CAP-007 Risk Engine" yang tidak eksis di `35`). Ketiganya sekarang ditandai ⚠️ SUPERSEDED di file masing-masing. Metodologi 10-tahap `07` (Classification→Ownership→Contract→Aggregate→...→Version) tetap dipakai sebagai kerangka kerja valid — isinya diturunkan ulang dari `35`/`44`. Kekhawatiran awal soal judul `07c` ("Orchestration Readiness") terbukti BUKAN masalah utama — masalah sesungguhnya lebih dalam (seluruh Capability Catalog usang, bukan cuma satu judul).
**Trace Status:** Seluruh isi ✓ Fully Derived, 0 ❌ Invented, 1 koreksi struktural (pemilihan evidence, bukan ADR).

*(Konteks di bawah dipertahankan sebagai jejak historis proses.)*

## Fase 8 — Integration Architecture ✅ DERIVED & FROZEN

**Status akhir:** Diselesaikan di [`46-phase8-integration-architecture.md`](46-phase8-integration-architecture.md). Evidence contamination check dijalankan lebih dulu (pelajaran Fase 7) — Framework H lama (`14`-`16`) ditemukan TIDAK dipakai meski `32` awalnya mengizinkan "referensi teknis" karena sama-sama terikat CAP-XXX usang. Satu kutipan migration ditemukan salah (007 vs 056 untuk `kasbons`) dan diperbaiki sebelum Freeze final. ACL tunggal konkret: tabel translasi `category_id`↔`cost_code_id`, TIDAK mengubah `project_expenses`/`kasbons` existing.

*(Konteks di bawah dipertahankan sebagai jejak historis proses.)*

**Bukan** Phase H lama. Scope-nya jauh lebih sempit secara sengaja, sesuai Constitution Article 5.
**Article 6 check (wajib dijawab sebelum ditulis):** Bagaimana ini membantu Procurement/Cashflow/Cost Control secara konkret? Jawaban: CECEP harus baca data existing (`project_expenses`, `kasbons`, `daily_wage_logs`, `progress_payments`, `borongan_settlements`) untuk Variance Calculation (`03b` § A.12) tanpa merusak model — SATU kebutuhan konkret, sudah diidentifikasi tuntas sebagai ACL requirement di `03b`.
**Artefak yang diharapkan:** Desain ACL konkret (field mapping, resolusi Cost Code dari data lama yang belum granular) — BUKAN ontologi umum "apa itu integrasi". Boleh MERUJUK pola/prinsip dari Framework (`14`-`16` lama) sebagai referensi teknis, tapi tidak mewarisi strukturnya secara utuh.
**Batas eksplisit:** Kalau draft fase ini mulai membahas "integrasi secara umum, lepas dari titik CECEP↔Puraloka Suite spesifik" — itu sinyal drift kembali terjadi, hentikan dan kembalikan ke titik konkret.

## Fase 9 — Automation Architecture ✅ DERIVED & FROZEN

**Status akhir:** Diselesaikan di [`47-phase9-automation-architecture.md`](47-phase9-automation-architecture.md). Framework G lama (`08`-`08k`) dikonfirmasi terkontaminasi CAP-XXX (38 kemunculan) dan TIDAK dipakai — evidence murni `02` §9-10, `42`, `44`, plus verifikasi langsung `db/migrations/050_rbac_foundation.sql` ada di codebase. Formula/Estimate Version state machine dan Approval Workflow (7 dimensi, TIGA titik pemakaian: Estimate Version/Price Book/Lessons Learned) diturunkan tanpa menciptakan sistem role baru — merujuk RBAC existing.

*(Konteks di bawah dipertahankan sebagai jejak historis proses.)*

**Bukan** Phase G lama. Scope jauh lebih sempit.
**Article 6 check:** Bagaimana ini membantu AHSP/RAB/RAP/Procurement? Jawaban: Formula Engine (`02` § 8) butuh mekanisme eksekusi konkret (bagaimana Formula di-versioning, siapa approve perubahan formula, `02` § 10 Configurable Approval Workflow) — kebutuhan operasional nyata, sudah dikunci prinsipnya di `02`, tinggal didetailkan.
**Artefak yang diharapkan:** Formula Engine execution model, Approval Workflow konkret (7 dimensi konfigurasi dari `02` § 10 diterjemahkan jadi struktur data/state machine), Estimation Workflow lifecycle (Draft→Under Review→Approved→Baseline→Superseded, `02` § 9).
**Batas eksplisit:** BOLEH merujuk Rule Lifecycle/Rule Versioning pattern dari Framework (`08`-`08k` lama) sebagai REFERENSI TEKNIS TERSARING — tapi ditulis ulang dalam bahasa Formula/Approval Workflow CECEP, bukan diwariskan sebagai "Rule" generik dengan Formula sebagai instance-nya.

## Fase 10 — AI Cost Engineering ✅ DERIVED & FROZEN

**Status akhir:** Diselesaikan di [`48-phase10-ai-cost-engineering.md`](48-phase10-ai-cost-engineering.md). Framework I lama (`17`-`19`) dikonfirmasi terlarang GANDA (CAP-XXX usang DAN sudah dipindah ke Framework via `31` karena filosofi AI generik) — tidak dirujuk sama sekali. Isi murni prioritas jalur input (Excel-first, `rab.ts` diverifikasi ada) + batas AI Recommendation harus approval-gated. TIDAK ada definisi filosofis "apa itu AI" ditulis, sesuai larangan eksplisit.

*(Konteks di bawah dipertahankan sebagai jejak historis proses.)*

**Bukan** Phase I lama. Kembali ke kedalaman yang PAS sesuai `01` § 11 sendiri: *"observasi bisnis murni... belum mendesain AI"*.
**Article 6 check:** Bagaimana ini membantu Estimating? Jawaban: input apa (Excel/PDF/DWG/Foto) yang bisa mempercepat estimasi, dan urutan prioritas mana yang realistis (`01` § 11 sudah menjawab: Excel jalur paling realistis jangka pendek).
**Artefak yang diharapkan:** Rencana konkret jalur AI Estimation (mulai dari Excel parser yang sudah ada, `rab.ts`), BUKAN definisi filosofis "apa itu AI". Kalau butuh definisi batas AI vs non-AI untuk keperluan praktis (mis. menentukan fitur mana yang butuh ML vs rule-based), definisi itu di-scope SEMPIT untuk keputusan itu saja — tidak dibangun jadi ontologi umum.
**Batas eksplisit:** DILARANG membuka Discovery filosofis "apa itu AI" secara umum — kalau pertanyaan itu muncul lagi, jawabannya "rujuk Framework `17`-`19` lama", bukan buka ulang.

## Fase 11 — Implementation Roadmap ✅ DERIVED & FROZEN

**Status akhir:** Diselesaikan di [`49-phase11-implementation-roadmap.md`](49-phase11-implementation-roadmap.md). Empat milestone diturunkan langsung dari lapisan Upstream→Mid-stream→Core→Downstream+Feedback yang sudah ada di `03b` (bersih dari kontaminasi CAP-XXX). Risk Allowance Entry dikonfirmasi naik status dari Candidate ke Confirmed (housekeeping `44`) masuk Milestone 2.

*(Konteks di bawah dipertahankan sebagai jejak historis proses.)*

**Article 6 check:** Bagaimana ini membantu semua capability sekaligus? Jawaban: urutan build yang benar mencegah rework (mis. Cost Code harus ada sebelum Assembly, RBS sebelum Price Book).
**Artefak yang diharapkan:** Urutan implementasi 13 domain + dependency antar domain (dari `03b` Domain Relationship Map, upstream→downstream sudah dipetakan) menjadi milestone konkret dengan kriteria "selesai" per milestone.

## Fase 12 — Documentation Package ✅ DERIVED & FROZEN

**Status akhir:** Diselesaikan di [`50-phase12-documentation-package.md`](50-phase12-documentation-package.md). Explainability dijawab ulang dari nol (agregasi Audit trail per Aggregate dari `45` §C) — TIDAK mewarisi "Normative Meaning" draft Phase L lama (`28`), sesuai `31` § Penanganan Khusus Phase L. Delapan Reference Document dipetakan ke sumber Frozen masing-masing, bukan ditulis baru.

*(Konteks di bawah dipertahankan sebagai jejak historis proses.)*

**Article 6 check:** Bagaimana ini membantu tim build benar-benar mulai kerja? Jawaban: Reference docs adalah artefak yang dipakai harian oleh developer, bukan dibaca sekali.
**Artefak yang diharapkan:** Capability Reference, Domain Reference, Calculation Reference, Formula Reference, Integration Reference, AI Reference, Deployment Reference, User Documentation.
**Catatan khusus (lihat `31` § Penanganan Khusus Phase L):** Bagian Explainability (`02` Constraint #1 — "Rp 1.230.000 bisa ditelusuri ke Price Book v3.2, dst") dijawab ULANG di sini dari kebutuhan CECEP langsung, TIDAK mewarisi "Normative Meaning" dari draft Phase L lama.

---

## Status Ringkas

*(Istilah baku per [`40`](40-architecture-derivation-constitution.md) § Tiga Istilah Status — bukan lagi "Selesai/Perlu Verifikasi" longgar.)*

| Fase | Status |
|---|---|
| 1, 2, 4 | ✅ Derived & Frozen (Mission/Lifecycle/Philosophy — langsung dari `01`/`02`/`03`, tidak butuh derivasi lanjutan) |
| 3 | ✅ Derived & Frozen Permanently (`35`-`38`, tiga putaran validasi) |
| 5 | ✅ Derived & Frozen (`42`-`43`; `06`/`06b` lama SUPERSEDED, tidak dipakai) |
| 6 | ✅ Derived & Frozen (`44`; 13 domain diturunkan eksplisit dari `03b` evidence) |
| 7 | ✅ Derived & Frozen (`45`; `07`/`07b`/`07c` lama SUPERSEDED, tidak dipakai) |
| 8 | ✅ Derived & Frozen (`46`; ACL category_id↔cost_code_id) |
| 9 | ✅ Derived & Frozen (`47`; Formula/Approval Workflow) |
| 10 | ✅ Derived & Frozen (`48`; Excel-first, approval-gated, AI generic definition TIDAK ditulis) |
| 11 | ✅ Derived & Frozen (`49`; 4 milestone build order) |
| 12 | ✅ Derived & Frozen (`50`; 8 Reference, Explainability dijawab ulang dari nol) |

**Semua 12 fase Roadmap V2 Derived & Frozen. Planning CECEP selesai.**

**Temuan penting selama Fase 7 (dicatat permanen, berlaku sepanjang Fase 8-12):** `05`/`05b`/`06`/`06b`/`07`/`07b`/`07c` (Phase D/E/F lama), `08`-`08k` (Phase G lama), `14`-`16` (Phase H lama), `17`-`19` (Phase I lama) — seluruhnya terikat Capability Catalog CAP-001 s.d. CAP-013 yang sudah digantikan total oleh `35`, DAN/ATAU sudah dipindah ke Enterprise Architecture Framework via `31`. Semua ditandai ⚠️ SUPERSEDED langsung di file masing-masing (bukan dihapus — dipertahankan sebagai jejak historis proses) atau dikecualikan eksplisit tanpa perlu penandaan (karena sudah bagian Framework, di luar direktori kerja CECEP aktif). Fase 3/5/6/7/8/9/10/11/12 Roadmap V2 (`35`-`50`) TIDAK mewarisi isi dokumen-dokumen itu — hanya metodologi/kerangka kerja yang independen dari Capability Catalog yang dipertahankan, dan hanya setelah `grep CAP-` dijalankan lebih dulu pada setiap kandidat evidence.

## Aturan Jalan ke Depan

Seluruh 12 fase selesai — tidak ada "jalan ke depan" dalam roadmap ini lagi. Perubahan pada fase manapun (1-12) sekarang hanya lewat ADR resmi (pola `31`/ACR-004), bukan revisi informal. Pekerjaan lanjutan (implementasi kode, migrasi skema riil) berada DI LUAR cakupan planning ini — merujuk `49` (Implementation Roadmap) dan `50` (Documentation Package) sebagai titik masuk.

## Catatan Dependency (koreksi atas kesalahan audit `33`)

[`33-roadmap-integrity-audit.md`](33-roadmap-integrity-audit.md) sempat menyimpulkan "Fase 3 secara logis bergantung pada Fase 6" berdasarkan urutan PENULISAN historis (`03b`/C.5 selesai lebih dulu daripada `05`/Phase D dalam kronologi lama). Founder mengoreksi ini: itu keliru — Capability Architecture (Fase 3) menjawab "apa yang harus dimiliki platform", Domain Model (Fase 6) menjawab "objek apa yang mewujudkan capability itu" (contoh: capability "Historical Cost Intelligence" baru melahirkan objek Estimate Version/Estimate Snapshot/Price History/Productivity History, bukan sebaliknya). **Dependency yang benar: Fase 6 bergantung pada Fase 3, bukan sebaliknya.** Urutan penomoran 1-12 di dokumen ini SUDAH benar sesuai dependency asli — koreksi ini murni membatalkan catatan keliru di `33`, tidak mengubah urutan fase manapun di roadmap ini. Dependency Matrix di `33` perlu dibaca dengan arah panah Fase 3→6 (Capability menghasilkan kebutuhan yang dipenuhi Domain Model), bukan Fase 6→3.
