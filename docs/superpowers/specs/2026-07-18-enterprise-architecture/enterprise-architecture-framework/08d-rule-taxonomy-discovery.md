# CECEP — Phase G-A: Rule Taxonomy Discovery

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Discovery, BUKAN Design — dijalankan SEBELUM Orchestration Rule Design dilanjutkan, mengoreksi Momentum Bias ([`08c`](08c-orchestration-rule-design.md), ditahan). Enterprise Orchestration Philosophy ([`08a`](08a-enterprise-orchestration-philosophy.md)) mendefinisikan SATU struktur Rule generik (§ I) dan mengasumsikan semua Rule punya karakteristik yang sama — dokumen ini MENGUJI asumsi itu: apakah benar semua jenis Rule (Business/Operational/Compliance/Approval/Notification/Integration/AI/Compensation/Recovery/Monitoring) punya karakteristik sama, atau ada perbedaan fundamental yang Philosophy belum tangkap?

**Kenapa ini discovery, bukan penambahan ke Philosophy langsung:** Kalau langsung ditambahkan sebagai revisi § I Philosophy tanpa discovery dulu, risikonya sama dengan pola lama (loncat ke solusi) — dokumen ini HARUS lebih dulu MEMETAKAN apakah perbedaan itu benar ada, seberapa dalam, sebelum memutuskan APAKAH perlu mengubah struktur Rule.

---

## A. Sepuluh Kandidat Jenis Rule — Diuji Satu per Satu

**Metodologi:** Untuk setiap jenis, diuji terhadap struktur Rule yang sudah ada ([`08a`](08a-enterprise-orchestration-philosophy.md) § I: trigger/condition/action/failure_policy/timeout/version + metadata) — apakah struktur itu CUKUP, atau jenis ini butuh field/perilaku tambahan yang struktur generik tidak tangkap.

### A.1 Business Rule

**Definisi kerja:** Rule yang merepresentasikan keputusan proses bisnis nyata — persis contoh `EstimateVersionApproved → Generate RAP`.

**Diuji terhadap struktur generik:** ✅ Cocok penuh — inilah jenis yang MENJADI DASAR struktur § I Philosophy ditulis (Rule-001 s.d. Rule-004 di `08c` semuanya jenis ini). Tidak ada field tambahan dibutuhkan.

### A.2 Operational Rule

**Definisi kerja:** Rule yang mengatur operasional sistem itu sendiri (bukan proses bisnis konstruksi) — mis. "kalau antrian Rule Execution menumpuk lebih dari X, eskalasi ke admin".

**Diuji:** 🟡 Trigger-nya BUKAN Domain Event bisnis (`08` § A Catalog) — trigger-nya adalah KONDISI SISTEM (mis. panjang antrian, waktu eksekusi). **Ini perbedaan struktural nyata**: `trigger` di § I Philosophy didefinisikan sebagai "Domain Event yang memicu" — Operational Rule butuh trigger jenis LAIN (System Metric/Threshold), bukan Domain Event.

### A.3 Compliance Rule

**Definisi kerja:** Rule yang memastikan proses memenuhi kewajiban regulasi/audit — mis. "setiap perubahan Price Book WAJIB tercatat Verified By sebelum Active" (sudah ada sebagai bagian Lifecycle Price Book, `07b` § 15.3, TAPI belum pernah diformalkan sebagai Rule Orchestration eksplisit).

**Diuji:** 🟡 Cocok STRUKTUR (trigger/condition/action sama), TAPI beda TUJUAN — Compliance Rule TIDAK BOLEH punya failure_policy "Ignore" (§ L Philosophy) APAPUN Criticality-nya, karena kegagalan compliance selalu berarti pelanggaran, bukan sekadar proses tertunda. **Constraint tambahan yang belum tertangkap Philosophy**: sebagian jenis Rule punya BATASAN pada opsi failure_policy yang boleh dipilih, bukan bebas dari enam opsi (`08a` § L).

### A.4 Approval Rule

**Definisi kerja:** Rule yang menentukan kapan sebuah proses butuh persetujuan manusia — mis. "Estimate dengan nilai di atas Rp 1 miliar butuh approval Direktur, bukan cuma PM".

**Diuji:** 🟡 Overlap SIGNIFIKAN dengan CAP-010 (Workflow Engine, Configurable Approval Workflow, [`02`](../CECEP/02-phase-b5-core-cost-engineering-architecture.md) § 10). **Pertanyaan kritis:** apakah "Approval Rule" adalah JENIS Orchestration Rule yang berdiri sendiri, atau sebenarnya CAP-010 SUDAH punya mekanismenya sendiri (7 dimensi konfigurasi) yang seharusnya TETAP jadi domain CAP-010, bukan diduplikasi sebagai Orchestration Rule? Dianalisis lebih dalam di § B di bawah — ini SINYAL kemungkinan overlap yang harus diselesaikan sebelum Rule Design lanjut.

### A.5 Notification Rule

**Definisi kerja:** Rule yang menentukan kapan/kepada siapa notifikasi dikirim — contoh Rule-004 di `08c` (ditahan).

**Diuji:** ✅ Cocok struktur generik — action-nya memanggil sistem Notifikasi existing, tidak ada field tambahan dibutuhkan. Sama pola dengan Business Rule, hanya beda Criticality (biasanya Low).

### A.6 Integration Rule

**Definisi kerja:** Rule yang menjembatani proses CECEP ke sistem existing Puraloka Suite — contoh Rule-001/002/003 di `08c` (ditahan), yang memanggil CAP-013.

**Diuji:** 🟡 Cocok struktur, TAPI action-nya punya SIFAT KHUSUS: hasil eksekusinya bergantung pada sistem DI LUAR CECEP yang tidak bisa dijamin Determinism penuh (§ M Philosophy) — sistem existing Puraloka Suite bisa berubah state independen dari CECEP. **Ini menyentuh celah yang sudah diketahui**: Anti-Corruption Layer (CAP-013) BELUM didesain konkret ([`03b`](../CECEP/03b-phase-c5-core-domain-discovery.md) § Anti-Corruption Layer — "statusnya baru diidentifikasi perlu ada, bukan sudah didesain").

### A.7 AI Rule

**Definisi kerja:** Rule yang trigger-nya adalah rekomendasi AI (mis. "kalau AI merekomendasikan Strategy baru dengan confidence > 90%, ajukan ke Approval Workflow").

**Diuji:** 🔴 **Konflik potensial dengan Konstitusi Calculation Strategy** ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § pembuka poin 6, § N — "AI tidak pernah menghitung sendiri"). Kalau "AI Rule" berarti Rule yang DIPICU oleh AI Event ([`08`](08-phase-g-enterprise-orchestration-architecture.md) § C, jenis AI Event yang sudah diklasifikasi tapi belum ada contoh nyata) — itu SAH, konsisten `08a` § D (Orchestrator boleh memanggil apa saja, termasuk merespons rekomendasi AI, selama tidak MENGHITUNG sendiri). TAPI kalau "AI Rule" berarti Rule yang LOGIKANYA dihasilkan/diubah AI secara otomatis tanpa approval — itu MELANGGAR prinsip terkunci. **Perbedaan ini WAJIB eksplisit sebelum jenis ini dipakai** — sinyal paling kritis dari seluruh sepuluh kandidat.

### A.8 Compensation Rule

**Definisi kerja:** Rule yang dieksekusi SAAT Rule lain gagal — implementasi konkret dari respons "Compensate" (§ L Philosophy).

**Diuji:** 🟡 Ini BUKAN jenis Rule independen — ia adalah BAGIAN dari `failure_policy` Rule lain (`08a` § L: "ISI kompensasi tetap milik capability yang mengeksekusinya"). **Pertanyaan struktural**: apakah Compensation Rule harus jadi Rule TERPISAH dengan `id` sendiri (supaya bisa di-Lifecycle/Version/Test sendiri, § J-M), atau cukup jadi field di dalam Rule yang dikompensasinya? Philosophy saat ini TIDAK eksplisit menjawab ini — `failure_policy` di § I hanya field string/enum, bukan referensi ke Rule lain.

### A.9 Recovery Rule

**Definisi kerja:** Rule yang dijalankan untuk memulihkan state SETELAH kegagalan besar (bukan Compensation per-langkah, tapi pemulihan level lebih tinggi — mis. "kalau seluruh rangkaian Rule pasca-`EstimateVersionApproved` gagal total, jalankan proses manual review").

**Diuji:** 🟡 Mirip Compensation Rule (A.8) tapi levelnya BEDA — Compensation = per-Rule, Recovery = per-RANGKAIAN Rule (Orchestration Rule System secara keseluruhan untuk satu event). Philosophy TIDAK punya konsep "rangkaian Rule" sebagai satu kesatuan yang bisa gagal total — hanya per-Rule individual (§ D, `08a`).

### A.10 Monitoring Rule

**Definisi kerja:** Rule yang mengamati kondisi sistem dan memicu aksi berdasarkan pengamatan (mis. "kalau Rule-001 gagal 3x berturut-turut untuk Company yang sama, nonaktifkan sementara").

**Diuji:** 🔴 **Trigger-nya BUKAN Domain Event maupun Timer** — trigger-nya adalah POLA dari EKSEKUSI RULE LAIN (meta-level, Rule yang mengamati Rule). Ini jenis PALING BERBEDA dari sepuluh kandidat — konsisten dengan gap Observability yang sudah diketahui sejak Grand Architecture Review ([`04`](../CECEP/04-architecture-constitution.md) § 11, § 14 Operational Perspective) — Monitoring Rule kemungkinan besar BUKAN Orchestration Rule biasa, tapi bagian dari Observability yang statusnya sudah DEFERRED ke Operational Perspective lintas-fase.

---

## B. Sintesis — Apakah Sepuluh Jenis Ini Semuanya Sama?

**Jawaban langsung: TIDAK.** Diuji satu per satu, ditemukan TIGA kelompok berbeda, bukan sepuluh jenis yang setara:

### Kelompok 1 — Cocok Penuh dengan Struktur Generik § I (Tidak Perlu Perubahan)
Business Rule, Notification Rule — dan Integration Rule DENGAN CATATAN (bergantung ACL yang belum didesain, tapi strukturnya sendiri cocok).

### Kelompok 2 — Cocok Struktur, Tapi Butuh CONSTRAINT Tambahan (Bukan Field Baru, Tapi Aturan Tambahan)
Compliance Rule (larangan failure_policy tertentu), Approval Rule (potensi overlap CAP-010, perlu diperjelas siapa pemilik sebenarnya).

### Kelompok 3 — TIDAK Cocok Struktur Generik, Butuh Perpanjangan Nyata
- **Operational Rule** — trigger bukan Domain Event, butuh jenis trigger baru (System Metric/Threshold).
- **AI Rule** — butuh pembeda tegas (memicu vs menghasilkan logika) sebelum dipakai, konflik potensial dengan Konstitusi Calculation Strategy.
- **Compensation Rule** — bukan Rule independen, kemungkinan besar SUB-STRUKTUR dari `failure_policy`, bukan entitas `id` terpisah.
- **Recovery Rule** — butuh konsep "rangkaian Rule" (kumpulan Rule untuk satu event) sebagai unit yang bisa gagal, belum ada di Philosophy.
- **Monitoring Rule** — trigger meta-level (mengamati Rule lain), kemungkinan besar BUKAN Orchestration Rule sama sekali, melainkan bagian Observability (Operational Perspective).

**Kesimpulan Taxonomy:** Philosophy ([`08a`](08a-enterprise-orchestration-philosophy.md)) SAH untuk Kelompok 1, BUTUH constraint tambahan untuk Kelompok 2, dan TIDAK CUKUP untuk Kelompok 3 — khususnya Monitoring Rule yang kemungkinan besar bukan bagian domain Orchestration sama sekali.

---

## C. Rekomendasi untuk Discovery Berikutnya (Bukan Keputusan di Sini)

**Konsisten disiplin "identifikasi, jangan desain solusi" yang sudah dipegang sejak Orchestration Readiness Assessment:**

1. **Rule Meta Model Discovery ([`08e`](08e-rule-meta-model-discovery.md))** harus menjawab: apakah Rule itu Domain Object/Configuration/Knowledge/Policy/Code — pertanyaan ontologis yang MENDASARI kenapa Kelompok 3 di atas terasa berbeda (kemungkinan karena mereka sebenarnya OBJEK ontologis berbeda, bukan sekadar "Rule dengan field tambahan").
2. **Compensation Rule dan Recovery Rule** kemungkinan besar bukan pertanyaan Taxonomy tapi pertanyaan Meta Model — apakah mereka Rule yang berdiri sendiri, atau STRUKTUR di dalam Rule lain — didalami di [`08e`](08e-rule-meta-model-discovery.md).
3. **Monitoring Rule** kemungkinan besar keluar dari cakupan Orchestration Rule System sepenuhnya — direkomendasikan dicek ulang saat Operational Perspective ([`04`](../CECEP/04-architecture-constitution.md) § 14) diaktifkan di Phase H (Integration)/Phase I (AI), BUKAN dipaksakan masuk Taxonomy Orchestration sekarang.
4. **Approval Rule vs CAP-010** — butuh klarifikasi ownership eksplisit sebelum Rule Design lanjut: apakah Approval Rule adalah Orchestration Rule yang MEMANGGIL CAP-010 (konsisten pola yang sudah ada, Rule-001 s.d. 004 semuanya "memanggil Capability"), atau CAP-010 sendiri yang punya mekanisme Rule internal terpisah. **Rekomendasi kuat: Approval Rule = Orchestration Rule yang action-nya memanggil CAP-010** — konsisten pola yang sudah terbukti (semua Rule memanggil Capability lewat kontraknya, tidak pernah "menjadi" Capability itu sendiri, `08a` § D) — TIDAK ada overlap kalau dipahami begini, tapi tetap perlu dikonfirmasi eksplisit di Meta Model.
5. **AI Rule** — pembeda "memicu vs menghasilkan logika" WAJIB masuk sebagai bagian eksplisit Rule Meta Model, bukan diasumsikan jelas dengan sendirinya.

---

## Assumptions

1. Klasifikasi tiga kelompok (§ B) adalah hasil analisis terhadap sepuluh nama yang diberikan founder — kalau discovery lanjutan (Meta Model) menemukan jenis lain yang tidak masuk sepuluh nama ini, taxonomy ini perlu diperluas, bukan dianggap final tertutup.
2. Rekomendasi "Monitoring Rule bukan bagian Orchestration" (§ C poin 3) adalah observasi awal berdasarkan sifat trigger-nya yang meta-level — belum dikonfirmasi eksplisit oleh founder, dicatat sebagai rekomendasi kuat bukan keputusan.

## Open Questions

1. Apakah sepuluh jenis yang diberikan founder sudah mewakili SEMUA jenis Rule yang dibayangkan untuk CECEP, atau ada jenis lain yang perlu ditambahkan ke Taxonomy sebelum lanjut ke Meta Model Discovery?
2. Untuk AI Rule (A.7) — apakah founder bisa mengonfirmasi definisi yang dimaksud: Rule yang DIPICU rekomendasi AI (sah), atau Rule yang LOGIKANYA dihasilkan AI (berpotensi melanggar Konstitusi Calculation Strategy)?

## Status

**Discovery selesai — TIGA kelompok jenis Rule teridentifikasi, bukan sepuluh jenis yang setara.** Satu temuan paling kritis: AI Rule berpotensi konflik dengan Konstitusi Calculation Strategy tergantung definisi persisnya — WAJIB diklarifikasi sebelum dipakai. Monitoring Rule kemungkinan besar keluar dari cakupan Orchestration sepenuhnya. Lanjut ke [`08e`](08e-rule-meta-model-discovery.md) — Rule Meta Model Discovery, untuk menjawab pertanyaan ontologis yang mendasari perbedaan Kelompok 3.
