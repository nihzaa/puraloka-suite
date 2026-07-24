# CECEP — Phase G-B: Rule Meta Model Discovery

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Discovery, melanjutkan [`08d`](08d-rule-taxonomy-discovery.md). Pertanyaan yang dijawab di sini LEBIH DASAR dari Taxonomy: bukan "ada berapa jenis Rule", tapi **"apa hakikat sebuah Rule itu sendiri"** — Domain Object? Configuration? Knowledge? Policy? Code? Ini pertanyaan ontologis yang belum pernah dijawab eksplisit — Philosophy ([`08a`](08a-enterprise-orchestration-philosophy.md) § I) langsung mendefinisikan STRUKTUR Rule (field-field-nya) tanpa lebih dulu menjawab APA Rule itu secara ontologis, dan Taxonomy ([`08d`](08d-rule-taxonomy-discovery.md)) menemukan bahwa Kelompok 3 (Operational/AI/Compensation/Recovery/Monitoring Rule) terasa berbeda — kecurigaan discovery ini: perbedaan itu mungkin karena mereka sebenarnya objek ontologis BERBEDA, bukan sekadar variasi field.

---

## A. Delapan Kandidat Ontologi — Diuji Terhadap Rule yang Sudah Ada

**Koreksi metodologis (founder, ronde kedua Meta Model Discovery):** Draf pertama dokumen ini menguji lima kandidat lalu LANGSUNG memilih "Configuration" sebagai jawaban final — ini TERLALU CEPAT, pola yang sama persis dengan Momentum Bias yang baru dikoreksi di [`08c`](08c-orchestration-rule-design.md). Pertanyaan yang benar BUKAN "apakah Rule = Configuration?" (pertanyaan tertutup, sudah condong ke satu jawaban) — pertanyaan yang benar adalah **"Rule itu eksis sebagai apa?"** (pertanyaan terbuka). Founder menambahkan tiga kandidat yang sebelumnya tidak diuji: Executable Model, Decision Model, Enterprise Asset. Kedelapan kandidat diuji ulang di bawah, TANPA mengasumsikan salah satu sudah menang.

**Metodologi:** Rule-001 (`08c`, ditahan — Business Rule) dijadikan kasus uji, DAN **Formula Definition** (Phase E, `06` § K) dijadikan PEMBANDING EKSPLISIT — founder menunjukkan Formula punya sembilan karakteristik (lifecycle/version/explanation/dependency/testing/benchmark/replay/audit/approval) yang jauh melampaui "sekadar Configuration". Kalau Formula sudah lebih dari Configuration, Rule (yang sengaja dirancang setara Formula, `08a` § N) kemungkinan besar juga demikian.

### A.1 Apakah Rule = Domain Object (setara Aggregate Root seperti Estimate Version, Price Book Entry)?

**Diuji:** Domain Object di CECEP ([`03b`](../CECEP/03b-phase-c5-core-domain-discovery.md) § Kosakata DDD) punya identitas + siklus hidup + DIMILIKI oleh satu Capability tertentu (mis. Estimate Version dimiliki CAP-008). **Rule TIDAK dimiliki satu Capability** — Orchestration Separation Principle ([`04`](../CECEP/04-architecture-constitution.md) § 10) secara eksplisit menolak Rule menjadi milik satu Capability manapun. **Kesimpulan: Rule BUKAN Domain Object dalam pengertian yang sama dengan Aggregate Capability lain** — ini bukan penolakan status Entity-nya (Rule tetap py `id`, `08a` § I), tapi penolakan bahwa Rule "dimiliki" seperti Estimate Version dimiliki CAP-008. **Status: DITOLAK, kesimpulan ini tetap berlaku setelah ronde kedua.**

### A.2 Apakah Rule = Configuration (murni)?

**Diuji ulang, TIDAK diterima begitu saja:** Configuration Data ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § A) didefinisikan sebagai "aturan yang mengatur PERILAKU sistem, bukan isi bisnis". Rule COCOK SEBAGIAN definisi ini (First Principle 4, `04` § 4 — Rule = data terstruktur bukan kode). **TAPI diperiksa dalam terhadap perbandingan Formula:** Configuration Data MURNI (contoh lain di kelas ini, `07` § A: Precision Rule, Approval Chain Definition) TIDAK PUNYA Explanation Tree otomatis, TIDAK PUNYA Benchmark, TIDAK PUNYA Replay sebagai jaminan formal. Formula dan Rule PUNYA semua itu. **Kesimpulan: Rule LEBIH dari Configuration murni — "Configuration" menangkap SIFAT DATANYA (bukan kode) tapi TIDAK menangkap KEKAYAAN PERILAKUNYA (lifecycle/testing/replay/audit selengkap itu). Status: BENAR SEBAGIAN, tidak cukup sendirian.**

### A.3 Apakah Rule = Knowledge?

**Diuji:** Knowledge Data ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § A) adalah "pengetahuan perusahaan yang BERKEMBANG lewat Company Intelligence Loop" — Price Book, Productivity, Company AHSP semuanya berkembang dari data aktual proyek. **Apakah Rule berkembang dengan cara yang sama?** Diperiksa: Rule TIDAK diperbarui otomatis dari Lessons Learned Propagated (`08a` § D — Orchestrator tidak boleh mengubah Business Rule/Ownership) — Rule diubah MANUSIA lewat Lifecycle (§ J), bukan proses pembelajaran otomatis. **Kesimpulan: Rule BUKAN Knowledge Data dalam pengertian Company Intelligence Loop yang SEMPIT (pembaruan otomatis via Domain Event)** — meski Rule BISA jadi lebih baik dari waktu ke waktu (evolusi manual berdasar pengalaman). **Status: DITOLAK dalam pengertian sempit — TAPI lihat § A.8, kemungkinan Rule tetap "Enterprise Knowledge" dalam pengertian yang LEBIH LUAS dari Company Intelligence Loop otomatis.**

### A.4 Apakah Rule = Policy?

**Diuji:** "Policy" belum pernah didefinisikan formal di CECEP manapun — tapi secara intuitif, Policy = "aturan yang menentukan KEPUTUSAN apa yang diambil dalam situasi tertentu", BUKAN aturan yang menentukan BAGAIMANA sesuatu dihitung (itu Formula/Calculation Strategy). **Rule COCOK definisi Policy ini** — trigger+condition+action adalah persis struktur "dalam situasi X, keputusan yang diambil adalah Y". **Status: BENAR SEBAGIAN — menangkap FUNGSI Rule (apa yang dilakukannya), bukan HAKIKATnya (apa dia sebenarnya).**

### A.5 Apakah Rule = Code (dieksekusi langsung)?

**Diuji:** Sudah DITOLAK eksplisit sejak Philosophy (`08a` § I — "Rule adalah data terstruktur, BUKAN kode"), konsisten First Principle 4. **Status: DITOLAK, tidak berubah.**

### A.6 Apakah Rule = Executable Model? (kandidat baru, founder)

**Diuji:** "Executable Model" = representasi terstruktur yang bisa LANGSUNG dijalankan oleh sebuah Engine generik, tanpa kompilasi/deploy kode baru. **Diperiksa terhadap Rule:** Rule PERSIS ini — struktur § I Philosophy (trigger/condition/action) dieksekusi langsung oleh pola generik ([`08c`](08c-orchestration-rule-design.md) § A, delapan langkah) tanpa Rule pernah "dikompilasi" jadi kode. **Diperiksa terhadap Formula:** Formula JUGA persis ini — AST ([`06`](../CECEP/06-phase-e-calculation-strategy.md) § A.4) dieksekusi Calculation Engine tanpa dikompilasi. **Kesimpulan: BAIK Rule MAUPUN Formula adalah Executable Model — ini kandidat KUAT yang menyatukan keduanya di bawah satu payung yang sama, bukan istilah terpisah untuk masing-masing.**

### A.7 Apakah Rule = Decision Model? (kandidat baru, founder)

**Diuji:** "Decision Model" (istilah dari standar industri DMN — Decision Model and Notation) = representasi terstruktur dari SATU keputusan bisnis: input, logika keputusan, output. **Diperiksa terhadap Rule:** Rule COCOK KUAT — trigger+condition+action ADALAH persis struktur DMN (event=input, condition=logika, action=output keputusan). **Diperiksa terhadap Formula:** Formula TIDAK sepenuhnya cocok — Formula menghasilkan NILAI (angka), bukan KEPUTUSAN (pilihan tindakan). **Kesimpulan: "Decision Model" cocok UNTUK Rule TAPI TIDAK UNTUK Formula — ini istilah yang BENAR tapi TERLALU SEMPIT untuk jadi payung bersama Rule+Formula (beda dari Executable Model, § A.6, yang cocok keduanya).**

### A.8 Apakah Rule = Enterprise Asset? (kandidat baru, founder)

**Diuji:** "Enterprise Asset" = objek yang dianggap MILIK PERUSAHAAN (bukan milik individu/tim), bernilai jangka panjang, punya metadata kepemilikan formal. **Diperiksa terhadap Rule:** Rule PERSIS ini — metadata `owner`/`purpose`/`category`/`created_by` (`08a` § I, ronde keempat Philosophy) SECARA EKSPLISIT ditambahkan KARENA "Rule sudah menjadi Enterprise Asset" (alasan founder sendiri saat itu, `08a` § I). **Diperiksa terhadap Formula:** Formula JUGA Enterprise Asset — dimiliki perusahaan lewat Capability Catalog (`05b` § 10), bukan individu. **Kesimpulan: Enterprise Asset adalah LABEL YANG BENAR untuk KEDUANYA, TAPI ini deskripsi STATUS KEPEMILIKAN, bukan deskripsi HAKIKAT ontologis — semua Aggregate Root penting di CECEP (Estimate Version, Price Book Entry) JUGA Enterprise Asset dalam pengertian ini, jadi istilah ini benar tapi TIDAK CUKUP MEMBEDAKAN Rule/Formula dari Aggregate Root lain.**

---

## B. Sintesis — Rule dan Formula Sama-Sama "Executable Knowledge Model", BUKAN Dua Konsep Terpisah

**Koreksi kesimpulan ronde pertama (yang terlalu cepat memilih "Configuration"):** Setelah delapan kandidat diuji, TIDAK ADA satu istilah tunggal yang menangkap Rule sepenuhnya SENDIRIAN — setiap kandidat menangkap SATU DIMENSI:

```
Configuration (§ A.2)      → menangkap SIFAT DATANYA (bukan kode) — BENAR tapi tidak cukup kaya
Policy (§ A.4)              → menangkap FUNGSINYA (aturan keputusan) — BENAR tapi tidak cukup dalam
Executable Model (§ A.6)    → menangkap CARA DIEKSEKUSINYA — BENAR dan MENYATUKAN Rule+Formula
Decision Model (§ A.7)      → menangkap BENTUK SPESIFIK Rule (bukan Formula) — terlalu sempit jadi payung
Enterprise Asset (§ A.8)    → menangkap STATUS KEPEMILIKANNYA — BENAR tapi tidak spesifik ke Rule/Formula
```

**Temuan PALING PENTING dari ronde kedua ini (insight founder yang terbukti benar lewat pengujian):** Rule dan Formula BUKAN dua konsep kebetulan mirip — keduanya adalah **DUA BENTUK dari SATU KATEGORI YANG LEBIH BESAR**, yang sebelumnya belum pernah dinamai eksplisit di CECEP manapun. Kategori itu adalah **Executable Knowledge Model**: representasi terstruktur (bukan kode) dari pengetahuan operasional perusahaan (bukan sekadar setelan teknis), yang dieksekusi langsung oleh Engine generik, dan diperlakukan sebagai Enterprise Asset (lifecycle/version/testing/audit/explainability penuh).

```
Executable Knowledge Model (kategori payung, BARU ditemukan)
        │
   ┌────┴────┐
   ▼         ▼
Formula   Rule       ← dua BENTUK dari kategori yang sama, BUKAN dua konsep independen
(Phase E)  (Phase G)
   │         │
   ▼         ▼
"Bagaimana  "Kapan dan urutan apa
menghitung   capability dipanggil"
nilai X"     (Decision Model, § A.7)
(bukan Decision
 Model — hasilnya
 nilai, bukan
 keputusan tindakan)
```

**Implikasi untuk masa depan (menjawab pertanyaan besar founder — apakah nanti muncul Constraint, Validation, Simulation sebagai bentuk lain):** Kalau kategori "Executable Knowledge Model" ini benar, maka Constraint/Validation/Simulation yang founder sebutkan BUKAN konsep yang harus didesain dari nol masing-masing — mereka kemungkinan besar BENTUK KE-3, KE-4, KE-5 dari kategori payung yang SAMA, mewarisi pola lifecycle/version/testing/audit/explainability yang SUDAH terbukti dua kali (Formula, Rule). **Ini TIDAK diputuskan di sini** (di luar cakupan discovery Rule Meta Model) — dicatat sebagai Open Question besar untuk didalami TERPISAH kalau/ketika Constraint/Validation/Simulation benar-benar dibutuhkan.

**Perbandingan dengan pendekatan Palantir (dirujuk founder — "Rule dianggap Ontology Object, bukan sekadar konfigurasi"):**

Diperiksa dalam: Kenapa CECEP TIDAK mengikuti pola Palantir (Rule sebagai Ontology Object independen)? **Karena CECEP sudah punya arsitektur ontologis SENDIRI yang berbeda strukturnya** — bukan satu Ontology Layer generik seperti Palantir, tapi Five Truth Layers ([`04`](../CECEP/04-architecture-constitution.md) § 8) dengan Domain/Capability/Calculation/Information sebagai empat lapis TERPISAH yang masing-masing sudah punya "ontologi"-nya sendiri (Aggregate Root, Capability Boundary, dst). **Menjadikan Rule sebagai Ontology Object independen akan MENCIPTAKAN LAYER KE-6** yang bertentangan langsung dengan Five Truth Layers yang sudah dikunci — Rule TETAP di Layer 5 (Execution Truth), sekarang lebih tepat disebut **Executable Knowledge Model** yang mengonsumsi Layer 2-4, BUKAN naik jadi layer ontologis baru. **Ini BUKAN CECEP menolak pelajaran Palantir — CECEP mengambil INSIGHT-nya (pengetahuan operasional butuh identitas kuat setara Ontology Object) sambil tetap konsisten dengan arsitektur lima-lapis yang sudah dikunci, DAN ternyata insight itu SUDAH diterapkan dua kali (Formula, Rule) sebelum dinamai secara eksplisit.**

---

## C. Menjawab Kelompok 3 dari Rule Taxonomy Discovery — Kenapa Mereka Terasa Berbeda

**Diterapkan meta model di atas ke lima jenis Rule yang bermasalah di Taxonomy ([`08d`](08d-rule-taxonomy-discovery.md) § B Kelompok 3):**

| Jenis (dari Taxonomy) | Kenapa Terasa Berbeda (Sekarang Terjawab) |
|---|---|
| **Operational Rule** | Trigger-nya BUKAN Domain Event bisnis (Layer 2-4) — trigger-nya adalah SINYAL dari Layer 5 itu sendiri (kondisi eksekusi Rule lain). Ini SAH sebagai Executable Knowledge Model (masih Policy dalam FUNGSI, § A.4), tapi butuh perluasan definisi `trigger` di § I Philosophy dari "Domain Event" menjadi "Domain Event ATAU System Signal" — perluasan STRUKTUR, bukan objek ontologis baru |
| **AI Rule** | Kalau dipicu AI Event (`08` § C) — SAH, sama pola dengan Operational Rule (trigger diperluas). Kalau logikanya DIHASILKAN AI — ini BUKAN masalah ontologis Rule, ini masalah GOVERNANCE (siapa boleh menulis `action`/`condition` sebuah Rule) — dijawab tuntas: Rule tetap Executable Knowledge Model, TAPI *penulisnya* (manusia vs AI) tunduk pada Lifecycle § J (Draft→Testing→**Approved**→Published) — AI BOLEH mengusulkan isi Rule Draft, TIDAK BOLEH membuat Rule langsung Published tanpa Approval manusia (persis pola "AI Formula", `06b` § 2, yang sudah dikonfirmasi sah sebelumnya) |
| **Compensation Rule** | BUKAN Rule terpisah (dikonfirmasi ulang) — ia adalah Value Object ([`03b`](../CECEP/03b-phase-c5-core-domain-discovery.md) § Kosakata DDD, tidak punya identitas independen) di dalam `failure_policy` Rule yang dikompensasinya. TIDAK butuh `id` sendiri, TIDAK butuh Lifecycle sendiri — cukup field terstruktur di dalam Rule utama |
| **Recovery Rule** | Butuh konsep BARU: **Rule Group** — kumpulan Rule yang trigger PADA event yang sama dianggap satu KESATUAN untuk keperluan Recovery (kalau SEMUA Rule dalam grup gagal, baru Recovery dipicu). Rule Group BUKAN Aggregate Root baru (tidak menyimpan data sendiri) — ia VIEW/PROYEKSI atas Rule-Rule yang sudah ada, dikelompokkan berdasar `trigger` yang sama. Recovery Rule sendiri tetap Rule biasa (Executable Knowledge Model), triggernya adalah "Rule Group X gagal total" — perluasan jenis trigger yang SAMA dengan Operational Rule (System Signal) |
| **Monitoring Rule** | DIKONFIRMASI bukan Orchestration Rule sama sekali — trigger-nya (pola dari eksekusi Rule lain, meta-level observasi) adalah domain OBSERVABILITY (`04` § 11, § 14), bukan domain Orchestration. Direkomendasikan TETAP dikeluarkan dari Taxonomy Orchestration, konsisten rekomendasi [`08d`](08d-rule-taxonomy-discovery.md) § C poin 3 |

---

## D. Revisi Struktur Rule (§ I Philosophy) — Perluasan, Bukan Perombakan

**Konsekuensi meta model terhadap struktur yang sudah dikunci ([`08a`](08a-enterprise-orchestration-philosophy.md) § I):**

```
Orchestration Rule {
  ...semua field yang sudah ada (identity/metadata + execution semantics)...

  trigger_type:    "domain_event" | "system_signal"   ← BARU, membedakan Business/
                    Notification/Integration/AI-Rule-yang-dipicu-AI-Event (domain_event)
                    dari Operational/Recovery Rule (system_signal)

  authored_by:     "human" | "ai_proposed"             ← BARU, menjawab AI Rule governance
                    (§ C) — WAJIB "human" atau "ai_proposed" (bukan "ai_auto") sampai
                    lolos Approval (§ J Philosophy, Lifecycle tidak berubah)
}
```

**Kenapa ini PERLUASAN, bukan perombakan struktural besar:** Kedua field baru MELENGKAPI struktur yang sudah ada, tidak mengubah SATU PUN field yang sudah dikunci (`id`/`display_name`/`purpose`/`owner`/dst tetap utuh). Rule-001 s.d. Rule-004 di `08c` (ditahan) TETAP VALID setelah perluasan ini — mereka semua otomatis `trigger_type: "domain_event"` dan `authored_by: "human"`, tidak perlu didesain ulang, hanya diberi nilai default untuk dua field baru.

**Compensation Rule dihapus dari kandidat "Rule terpisah"** — dikonfirmasi jadi Value Object di dalam `failure_policy`, TIDAK menambah field di level Rule, hanya memperkaya struktur INTERNAL `failure_policy` yang sudah ada (`08a` § L).

**Rule Group (untuk Recovery Rule) dicatat sebagai KONSEP BARU** yang perlu dijawab lebih lanjut — apakah ini butuh entitas eksplisit atau cukup query dinamis (`SELECT Rules WHERE trigger = X`) — DITUNDA ke Rule Storage Philosophy ([`08f`](08f-rule-storage-philosophy.md)), karena ini pertanyaan PERSISTENCE/query pattern, bukan lagi pertanyaan Meta Model ontologis.

---

## Assumptions

1. Kesimpulan "Rule dan Formula sama-sama Executable Knowledge Model" (§ B) adalah keputusan arsitektural yang MEMPERTAHANKAN Five Truth Layers tanpa perubahan (Rule tetap Layer 5) — kalau founder menilai Rule justru PERLU jadi layer ontologis baru terpisah (mengikuti pola Palantir lebih literal), itu akan jadi ACR terhadap Five Truth Layers sendiri (`04` § 8), bukan sekadar revisi Rule Design.
2. Dua field baru (`trigger_type`, `authored_by`, § D) diasumsikan cukup untuk menutup Kelompok 3 dari Taxonomy — kalau Rule Storage Philosophy ([`08f`](08f-rule-storage-philosophy.md)) menemukan kebutuhan field tambahan lain, itu perluasan lanjutan yang sah, bukan tanda meta model ini salah.
3. Kategori "Executable Knowledge Model" sebagai payung Formula+Rule diasumsikan CUKUP untuk kebutuhan saat ini (dua bentuk) — apakah Constraint/Validation/Simulation (disebut founder sebagai kemungkinan bentuk masa depan) benar-benar bentuk ketiga/keempat/kelima dari kategori yang sama TIDAK diputuskan di sini, murni dicatat sebagai arah yang perlu didalami terpisah kalau kebutuhannya nyata.

## Open Questions

1. Apakah kesimpulan "Rule dan Formula = dua bentuk dari kategori payung Executable Knowledge Model, tetap di Layer 5, bukan layer ontologis baru" (§ B) sudah sesuai visi founder, atau founder tetap ingin Rule/Formula naik jadi konsep ontologis independen mengikuti pola Palantir lebih literal (yang akan berarti ACR terhadap Five Truth Layers)?
2. Untuk `authored_by: "ai_proposed"` — apakah ini cukup sebagai satu nilai, atau perlu granularitas lebih (mis. `ai_proposed_by: model/version tertentu`) untuk keperluan Audit yang lebih detail nantinya?
3. Apakah kategori "Executable Knowledge Model" perlu didokumentasikan secara resmi sebagai konsep lintas-fase di [`04-architecture-constitution.md`](../CECEP/04-architecture-constitution.md) (mengingat ia sekarang menaungi DUA konsep dari fase berbeda, Formula dari Phase E dan Rule dari Phase G) — atau cukup dicatat di dokumen ini sampai bentuk ketiga/keempat benar-benar muncul dan kebutuhan formalisasinya lebih jelas?

## Status

**Discovery selesai (ronde kedua) — kesimpulan direvisi dari ronde pertama yang terlalu cepat.** Rule dan Formula dikonfirmasi sebagai DUA BENTUK dari kategori payung yang sama — **Executable Knowledge Model** (representasi terstruktur non-kode dari pengetahuan operasional, dieksekusi Engine generik, diperlakukan sebagai Enterprise Asset penuh) — BUKAN Configuration murni (terlalu sempit) dan BUKAN Ontology Object independen ala Palantir (akan menciptakan Layer ke-6 yang bertentangan dengan Five Truth Layers). Delapan kandidat ontologi diuji (naik dari lima di ronde pertama), masing-masing kandidat lama yang sebelumnya "menang" (Configuration, Policy) sekarang dipahami sebagai menangkap SATU DIMENSI saja, bukan jawaban lengkap. Kelompok 3 dari Taxonomy ([`08d`](08d-rule-taxonomy-discovery.md)) tetap terjawab tuntas dengan kesimpulan teknis yang sama (dua field baru `trigger_type`/`authored_by`), hanya label ontologisnya diperbarui. Satu arah besar dicatat untuk masa depan (bukan diputuskan sekarang): Constraint/Validation/Simulation berpotensi jadi bentuk ke-3/4/5 dari Executable Knowledge Model yang sama. Lanjut ke [`08f`](08f-rule-storage-philosophy.md) — Rule Storage Philosophy & Reuse Strategy.
