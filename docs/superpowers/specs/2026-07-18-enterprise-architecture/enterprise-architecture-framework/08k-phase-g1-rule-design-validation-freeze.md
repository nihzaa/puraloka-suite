# CECEP — Phase G.1: Orchestration Rule Design Validation & Freeze

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Gerbang freeze terakhir Phase G — memvalidasi [`08c v2`](08c-orchestration-rule-design-v2.md) (Rule Design) di atas [`08a`](08a-enterprise-orchestration-philosophy.md) (Philosophy, frozen) dan seluruh rantai discovery `08d`-`08j`. **Bukan pemeriksaan grammar/consistency** (itu sudah dilakukan implisit sepanjang penulisan) — permintaan eksplisit founder: G.1 harus **stress test adversarial** terhadap Rule System sebagai MESIN yang akan menjalankan ratusan/ribuan Rule, bukan terhadap dokumen sebagai teks.

**Sepuluh skenario uji (verbatim founder), diperiksa satu per satu terhadap `08a`+`08c v2` yang sudah ada — bukan didesain ulang di sini. Kalau skenario menemukan celah nyata, diperbaiki LANGSUNG di dokumen ini (kalau tidak menyentuh baseline) atau ditandai untuk ACR (kalau menyentuh).**

---

## 1. Rule Collision — Apakah Dua Rule Bisa Jalan Bersamaan Secara Tidak Aman?

**Diuji:** Rule-001/002/003/004 semuanya trigger pada `EstimateVersionApproved`, semuanya paralel by default (`08a` § P). Apakah eksekusi paralel bisa menabrak satu sama lain?

**Diperiksa dalam:** "Collision" hanya berbahaya kalau dua Rule MENULIS ke resource yang sama secara konkuren. Diperiksa action masing-masing: Rule-001 menulis RAP Draft (via CAP-013), Rule-002 menulis Material Requirement Draft (via CAP-013, TAPI target entitas berbeda dari Rule-001), Rule-003 menulis Cashflow Baseline (via CAP-013, entitas berbeda lagi), Rule-004 memanggil sistem Notifikasi (tidak menulis data domain sama sekali). **Keempatnya menulis ke EMPAT target berbeda — TIDAK ADA overlap write.** Sumber baca mereka SAMA (Estimate Item via CAP-008) tapi itu READ, bukan WRITE — CAP-008 sebagai Aggregate Root yang immutable-setelah-Approved (`06` § K) menjamin baca konkuren aman tanpa race condition (tidak ada yang menulis balik ke Estimate Item).

**Celah yang DITEMUKAN (bukan di keempat Rule contoh, tapi di POLA umum):** `08a` maupun `08c v2` TIDAK PUNYA aturan eksplisit yang MELARANG dua Rule menulis ke target yang SAMA secara paralel — kebetulan empat Rule contoh tidak bertabrakan, tapi itu KEBETULAN desain, bukan JAMINAN struktural. Kalau nanti Rule-006 dan Rule-007 (hipotetis) sama-sama menulis ke Cashflow Baseline dengan Scope yang sama, tidak ada mekanisme yang mencegahnya.

**Perbaikan (non-ACR — memperjelas Decision Checklist § H `08a` yang sudah ada, poin 5, bukan menambah aturan baru):** Checklist § H poin 5 sudah bertanya "apakah Rule menyimpan state sendiri di luar Aggregate" — ini DIPERLUAS interpretasinya di sini secara eksplisit: **Dua Rule Instance dengan trigger yang sama TIDAK BOLEH memiliki target write (Capability + Entity yang sama) yang sama, KECUALI salah satunya punya `depends_on` eksplisit terhadap yang lain.** Ini bukan field baru — ini ATURAN VALIDASI yang dijalankan saat Rule Testing (§ S `08a`), memakai field yang sudah ada (`action`, `depends_on`).

**Verifikasi ulang Rule-001 s.d. 005:** Diperiksa pasangan demi pasangan — tidak ada dua Rule dengan target write sama. **LOLOS.**

---

## 2. Dead Rule — Apakah Ada Rule yang Tidak Mungkin Pernah Terpicu?

**Diuji:** Untuk tiap Rule Instance, apakah kombinasi `trigger` + `condition` + `Scope` (§ Q `08a`) punya kemungkinan MATEMATIS untuk TRUE?

**Diperiksa:**
- Rule-001: `condition: true` — selalu bisa true. **Hidup.**
- Rule-002: `condition: Estimate Item memuat Resource kategori Material` — bergantung data nyata, TAPI secara struktural mungkin true (banyak Estimate memang punya Resource Material). **Hidup.**
- Rule-003: `condition: true`. **Hidup.**
- Rule-004: `condition: true`. **Hidup.**
- Rule-005 (Recovery): `trigger: system_signal "Rule Group EstimateApprovalFlow — all members failed"` — TERGANTUNG Rule-001/002/003/004 SEMUANYA gagal bersamaan. Diperiksa: apakah trigger ini MATEMATIS mungkin terjadi? Ya (failure_policy masing-masing punya Retry dengan batas, kalau semua batas retry habis bersamaan, trigger ini valid). **Hidup, tapi JARANG** (bukan Dead, murni Low Probability — beda kategori).

**Celah struktural yang DITEMUKAN:** Kombinasi `condition` YANG SELALU FALSE tidak mungkin dideteksi otomatis dari empat Rule contoh (semuanya lolos) — TAPI `08a`/`08c v2` tidak punya MEKANISME PENCEGAHAN untuk kasus umum: Rule dengan Scope yang tidak pernah cocok konteks manapun (mis. `Scope: Project Rule` untuk Project yang sudah di-soft-delete, `04` CLAUDE.md pattern `is_deleted`), atau `condition` yang secara logis kontradiktif (mis. "Budget > 500jt AND Budget < 100jt").

**Perbaikan (non-ACR — tambahan syarat Testability § S `08a`):** Rule Test Case (§ S) sudah mewajibkan `given_event → expected_rule`. **Ditambahkan syarat eksplisit di sini:** Sebelum status Testing→Approved, WAJIB ada MINIMAL SATU Rule Test Case yang membuktikan `condition` Rule bisa bernilai TRUE secara nyata (bukan hanya diuji kasus gagal) — kalau tidak ada satu pun test case yang berhasil membuat condition TRUE, Rule ditandai **Suspected Dead Rule** dan tidak boleh Approved sampai diperiksa manual. Ini memperkuat § S yang sudah ada, bukan field/status baru.

**Verifikasi ulang:** Rule-001 s.d. 005 semuanya punya jalur logis menuju TRUE. **LOLOS, dengan satu penguatan checklist ditambahkan untuk Rule masa depan.**

---

## 3. Circular Rule — Rule A → Rule B → Rule C → Rule A

**Diuji:** Sudah ADA mekanisme eksplisit — Rule Composition (§ O `08a`) MEWARISI algoritma DFS three-color dari Dependency Graph Formula (`06` § D.2), secara eksplisit MELARANG circular composition.

**Diperiksa terhadap Rule-001 s.d. 005 secara konkret:** Graph dependency dari `depends_on` — Rule-001/002/003/004 semuanya `depends_on: []` (tidak saling bergantung). Rule-005 trigger-nya `system_signal` dari kegagalan Rule Group, BUKAN dari Rule Instance manapun sebagai `depends_on` — artinya Rule-005 TIDAK membentuk edge balik ke Rule-001/002/003/004 dalam graph `depends_on`. **Graph saat ini: lima node, TANPA edge sama sekali (semua `depends_on: []`) — trivially acyclic.**

**Diuji lebih dalam — apakah trigger Rule-005 (system_signal) BISA dianggap sebagai "edge tersembunyi" yang lolos dari algoritma DFS karena bukan `depends_on` eksplisit?** **Ini TEMUAN PENTING.** Algoritma DFS three-color (`06` § D.2, diwarisi § O `08a`) dirancang untuk graph yang dibentuk dari field `depends_on` — TAPI trigger `system_signal` dari Rule-005 SECARA SEMANTIK adalah bentuk dependency juga ("Rule-005 bergantung pada kegagalan Rule Group") yang TIDAK tercatat sebagai edge dalam graph yang sama. Kalau di masa depan Rule-005 (via action-nya) memicu ulang event yang sama dengan trigger Rule-001 (mis. Recovery yang salah desain memicu ulang `EstimateVersionApproved`), sirkuit akan terbentuk MELALUI event, bukan melalui `depends_on` — LOLOS dari deteksi DFS yang hanya memeriksa satu graph.

**Perbaikan (non-ACR — memperluas cakupan algoritma yang sudah dikunci, bukan mengubah algoritmanya):** Deteksi Circular (§ O `08a` poin 1) harus dijalankan pada GRAPH GABUNGAN: edge dari `depends_on` DAN edge dari `trigger_type: system_signal` yang merujuk balik ke Rule Group manapun yang memuat Rule pemicu awalnya. Algoritma DFS-nya TIDAK berubah — cakupan graph yang diperiksa yang diperluas. Ini konsisten dengan § O poin 5 yang sudah mengakui graph Rule "berbagi struktur matematis" dengan Formula — di sini ditegaskan graph-nya harus SATU graph gabungan, bukan dua graph terpisah yang masing-masing tampak acyclic tapi gabungannya tidak.

**Verifikasi ulang Rule-001 s.d. 005 dengan graph gabungan:** Rule-005 memicu aksi "Eskalasi ke manusia" (Manual, § L `08a`) — BUKAN memicu Domain Event baru yang masuk kembali ke `EstimateVersionApproved` manapun. **Graph gabungan tetap acyclic. LOLOS**, dengan satu perluasan cakupan algoritma dicatat untuk Rule masa depan.

---

## 4. Infinite Cascade — Estimate Approved → Rule A → Event B → Rule B → Event C → Rule C → Event A → Ulang

**Diuji:** Ini adalah kasus SIKLUS LINTAS EVENT (bukan lintas Rule langsung seperti poin 3) — Rule A menghasilkan Event B (via § E `08c v2`, Domain Event turunan), Event B memicu Rule B yang menghasilkan Event C, dst., sampai akhirnya kembali ke Event A.

**Diperiksa terhadap tiga event baru (§ E `08c v2`):** `RapDraftGenerated`, `MaterialRequirementDraftGenerated`, `CashflowBaselineGenerated` — apakah salah satu dari ketiganya, di Enterprise Event Catalog (`08` § A), terdaftar sebagai TRIGGER bagi Rule manapun yang pada akhirnya menghasilkan `EstimateVersionApproved` lagi? **Diperiksa: TIDAK ADA Rule yang trigger-nya salah satu dari tiga event baru ini di seluruh `08c v2`.** Ketiganya adalah DAUN (leaf) dalam graph event saat ini — mereka dihasilkan tapi tidak dikonsumsi Rule manapun yang sudah didesain.

**Celah struktural (real, meski tidak termanifestasi di Rule contoh saat ini):** `08a`/`08c v2` TIDAK PUNYA mekanisme PENCEGAHAN untuk siklus lintas-event secara umum — beda dari Circular Rule Composition (poin 3, yang sudah dijamin algoritma eksplisit) DAN beda dari perluasan graph gabungan (poin 3 revisi, yang menangkap system_signal). Siklus lintas Domain Event MURNI (Rule A hasilkan Event B, Rule B konsumsi Event B hasilkan Event C, ... akhirnya hasilkan Event A) TIDAK tertangkap DFS manapun yang sudah ada, karena Domain Event bukan bagian graph `depends_on`/`trigger_type` yang sama — ia melewati BATAS Rule sepenuhnya (event dipancarkan ke Catalog, siapa saja termasuk Rule masa depan bisa mengonsumsinya).

**Ini SATU-SATUNYA temuan di seluruh G.1 yang berpotensi menyentuh baseline (`08` Enterprise Event Catalog, frozen sejak Phase G Discovery):** Diperiksa apakah ini cukup serius untuk ACR. **Diuji dulu: apakah Event Catalog SUDAH punya mekanisme yang relevan?** Ya — `08` § F (Event Dependency & Ordering) SUDAH mendokumentasikan graph dependency ANTAR EVENT (bukan antar Rule) dan SUDAH mensyaratkan itu acyclic sebagai bagian desain Catalog. **Kesimpulan: mekanismenya SUDAH ADA di layer Event (Phase G Discovery), TAPI belum eksplisit disambungkan ke layer Rule (Phase G Design) sebagai SATU pemeriksaan gabungan.** Ini BUKAN celah baru di Event Catalog itu sendiri (yang sudah benar), tapi celah PENYAMBUNGAN antara dua layer yang masing-masing sudah benar sendiri-sendiri.

**Perbaikan (non-ACR — Event Catalog TIDAK berubah, murni ditambahkan syarat penyambungan):** Sebelum sebuah Rule dengan `action` yang memancarkan Domain Event baru (§ E `08c v2`) di-Approved, WAJIB diverifikasi bahwa event baru itu, ditambahkan ke graph dependency Event Catalog (`08` § F) yang SUDAH ada, tetap acyclic. Ini prosedur VERIFIKASI tambahan yang dijalankan di titik Rule Testing (§ S `08a`), memakai graph yang SUDAH dikunci di `08` § F — tidak mengubah satu pun struktur Event Catalog itu sendiri.

**Verifikasi ulang tiga event baru terhadap graph `08` § F:** Ketiganya leaf node, ditambahkan ke graph tetap acyclic (tidak ada Rule yang mengonsumsinya untuk menghasilkan `EstimateVersionApproved` kembali). **LOLOS**, dengan satu prosedur penyambungan dicatat wajib untuk Rule masa depan.

---

## 5. Event Storm — Satu Event Menghasilkan 50 Rule → 500 Event → 5000 Rule

**Diuji:** Apakah ada BATASAN struktural terhadap FAN-OUT (satu event memicu banyak Rule yang masing-masing memicu banyak event lagi)?

**Diperiksa:** `08a` maupun `08c v2` TIDAK PUNYA batas numerik eksplisit (dan MEMANG SEHARUSNYA TIDAK — mengikat prinsip Scalability yang sudah dikunci, `04` § 11: "arsitektur harus scale tanpa redesign," bukan angka spesifik, koreksi founder terhadap Grand Architecture Review sebelumnya). **Diperiksa dalam: apakah TIDAK ADA batas berarti TIDAK ADA PERLINDUNGAN dari storm, atau ada mekanisme LAIN yang secara tidak langsung membatasi?**

**Ditemukan mekanisme yang SUDAH melindungi, meski tidak didesain eksplisit untuk tujuan ini:**
1. **Criticality → failure_policy (`08` § E, `08a` § L)** — Rule dengan Criticality rendah (mis. Rule-004 Notifikasi) punya failure_policy longgar, artinya KEGAGALAN di ujung cascade tidak memicu Retry agresif yang memperbesar storm.
2. **Rule Group + Recovery (§ F `08c v2`, poin 4 dokumen ini)** — kalau storm menyebabkan SEMUA Rule dalam satu Rule Group gagal (mis. karena beban berlebih), Recovery Rule (Manual, bukan otomatis lebih lanjut) memutus rantai — Recovery TIDAK memicu Rule baru (dikonfirmasi § 7 di bawah), jadi ia adalah TITIK HENTI alami, bukan penambah storm.
3. **Timeout (§ G `08a`, gap yang masih terbuka di § F `08c v2` poin 1)** — INI adalah mekanisme yang PALING RELEVAN untuk storm tapi BELUM punya nilai konkret.

**Celah nyata:** Timeout yang belum diisi nilai (Open Question lama, `08c v2` § G poin 1) sekarang terbukti BUKAN sekadar detail operasional tertunda — ia adalah SALAH SATU dari sedikit mekanisme yang bisa membatasi storm secara langsung (Rule yang timeout gagal cepat, tidak menggantung menunggu upstream yang juga sedang storm). **Ini menaikkan PRIORITAS pengisian Timeout, TAPI TIDAK mengubah statusnya sebagai Open Question yang sah ditunda ke implementasi** (nilai numerik tetap keputusan operasional, bukan arsitektural) — dicatat sebagai catatan prioritas, bukan perubahan struktural.

**Kesimpulan: LOLOS secara struktural** (Criticality + Rule Group + Recovery = penahan storm alami) **dengan catatan operasional** (Timeout harus diisi SEBELUM implementasi produksi, bukan sekadar "kapan-kapan").

---

## 6. Priority Inversion — Rule Prioritas Rendah Menghambat Rule Prioritas Tinggi

**Diuji:** § P `08a` (Rule Priority) SUDAH secara eksplisit MENOLAK priority number sebagai mekanisme UTAMA — priority hanya tie-breaker KONDISIONAL untuk kasus resource terbatas yang belum tentu ada.

**Diperiksa dalam: apakah desain "paralel by default, tanpa priority" justru SECARA STRUKTURAL menghindari Priority Inversion sepenuhnya, bukan sekadar menunda masalahnya?** **Ya** — Priority Inversion (istilah klasik dari real-time scheduling) HANYA mungkin terjadi kalau ada RESOURCE BERSAMA yang diperebutkan dengan urutan prioritas eksplisit. Karena CECEP default paralel murni (tidak ada shared lock/resource yang diasumsikan, § P `08a` poin 3 eksplisit menyatakan priority TIDAK ADA sampai kondisi resource-terbatas benar-benar muncul), Priority Inversion klasik SECARA STRUKTURAL tidak bisa terjadi pada desain saat ini — bukan karena "belum diuji", tapi karena PRASYARAT terjadinya (resource bersama + priority eksplisit) belum ada.

**Diperiksa apakah ini akan berubah begitu CAP-006 rate limit (skenario hipotetis § P poin 3) benar-benar terwujud:** Kalau itu terjadi, `priority` jadi field aktif — DAN pada titik itu, `08a` § P TIDAK memberikan aturan eksplisit "priority tinggi harus didahulukan tanpa syarat" (yang justru RENTAN Priority Inversion kalau diterapkan naif — Rule prioritas rendah yang SUDAH terlanjur pegang resource tidak otomatis dilepas). **Celah kecil, kondisional, TIDAK aktif sekarang:** Kalau/ketika rate limit CAP-006 terwujud, `08a` § P perlu klausul tambahan (bukan sekarang) tentang preemption atau non-preemption — dicatat sebagai catatan untuk direvisi PADA SAAT kondisinya benar-benar muncul, konsisten prinsip § P sendiri ("Philosophy ini TIDAK menciptakan atau mengasumsikan rate limit itu ada sekarang").

**Kesimpulan: LOLOS untuk desain saat ini** (prasyarat Priority Inversion tidak terpenuhi) **— celah hanya aktif dalam skenario hipotetis yang sudah eksplisit ditandai kondisional sejak `08b` § 9, tidak perlu tindakan sekarang.**

---

## 7. Recovery Correctness — Apakah Recovery Rule Bisa Memicu Rule Baru (Loop Recovery)?

**Diuji langsung terhadap Rule-005 (§ F `08c v2`):** `action: Eskalasi ke manusia (Manual)`. Diperiksa: apakah "Manual" sebagai failure_policy/action BISA, secara tidak sengaja, menghasilkan Domain Event baru yang kembali memicu Rule lain?

**Diperiksa dalam:** Manual (§ L `08a`) didefinisikan sebagai "eskalasi ke manusia" — SECARA DEFINISI, aksi ini berhenti di titik notifikasi/permintaan intervensi manusia, TIDAK memancarkan Domain Event otomatis lanjutan (beda dari Retry/Compensate yang bisa memicu aksi otomatis lanjutan). **Rule-005 sendiri, sebagaimana didesain, TIDAK memicu Rule baru — LOLOS untuk kasus ini.**

**Diperiksa POLA UMUM (bukan cuma Rule-005): apakah `08a`/`08c v2` punya ATURAN yang MELARANG Recovery Rule secara umum memicu Rule Group yang sama yang baru saja gagal?** **Celah ditemukan:** Tidak ada larangan EKSPLISIT — secara teoretis, seorang perancang Rule di masa depan BISA menulis Recovery Rule dengan `action` yang (secara keliru) memanggil ulang Capability yang sama dengan Rule Group yang gagal, menciptakan LOOP RECOVERY (Recovery gagal → Recovery lagi → gagal lagi).

**Perbaikan (non-ACR — aturan tambahan pada Failure Philosophy § L `08a`, konsisten prinsip yang sudah ada bahwa Rollback level-data dilarang):** Ditambahkan aturan eksplisit: **Recovery Rule (Rule dengan `trigger_type: system_signal` yang triggernya adalah kegagalan Rule Group) TIDAK BOLEH memiliki `action` yang memanggil Capability yang SAMA dengan anggota Rule Group yang gagal.** Recovery Rule HANYA boleh: (a) eskalasi manusia (Manual), (b) mencatat Audit, atau (c) memanggil Capability BERBEDA yang secara eksplisit dirancang untuk pemulihan (bukan pengulangan aksi yang gagal). Ini mencegah loop by construction, konsisten semangat "Rollback dilarang, Compensate/Stop yang sah" (§ L `08a`).

**Verifikasi ulang Rule-005:** `action` memanggil sistem eskalasi manusia (bukan CAP-013 yang dipakai Rule-001/002/003 yang gagal). **LOLOS**, dengan satu aturan pencegahan ditambahkan untuk Rule masa depan.

---

## 8. Replay Correctness — Replay Tidak Boleh Menghasilkan Keputusan Rule Berbeda

**Diuji:** Determinism (§ M `08a`): *"Same Input + Same Rule Version + Same Event → Must Produce Same Orchestration Decision."* Diperiksa terhadap Rule-001 s.d. 004: apakah keempatnya benar-benar deterministik dalam pengertian ini?

**Diperiksa dalam — titik paling rawan:** `action_result_class` Rule-001/002/003 adalah **Computed Data via Integration** (`08g`/`08h`, dikonfirmasi `08c v2` § B) — artinya HASIL eksekusinya (RAP Draft, dst.) TIDAK deterministik (bisa beda tiap eksekusi karena state CAP-013/sistem eksternal). **Apakah ini MELANGGAR Determinism § M?**

**Jawaban kunci (memakai hasil `08i` § D Uji 3 langsung):** **TIDAK melanggar** — Determinism § M menjamin **KEPUTUSAN ORKESTRASI** yang sama (Rule mana yang trigger, dengan Scope apa, memanggil Capability apa), BUKAN menjamin HASIL EKSEKUSI Capability yang dipanggil identik. Rule-001 SELALU membuat keputusan yang sama (memanggil CAP-013 untuk generate RAP) untuk Estimate Version + Rule Version yang sama — KEPUTUSAN-nya deterministik. Bahwa RAP Draft yang DIHASILKAN CAP-013 bisa berbeda tiap eksekusi adalah tanggung jawab CAP-013 (Layer 2, Capability Truth), bukan tanggung jawab Rule (Layer 5 murni, dikonfirmasi `08i` § D Uji 2). **Ini PERSIS pembeda Replay-by-Recompute vs Replay-by-Retrieve (`08h` § C.2)** — yang di-Replay untuk Rule-001 adalah KEPUTUSANNYA (deterministik, Recompute), sedangkan yang di-Replay untuk HASIL-nya (RAP Draft) adalah SNAPSHOT-nya (Retrieve, bukan hitung ulang).

**Diperiksa apakah ini butuh diperjelas di struktur Rule:** Diperiksa — Rule Explanation (§ R `08a`) sudah mencatat `action_taken` dan hasilnya (sukses/gagal), TAPI tidak eksplisit membedakan "Rule memutuskan memanggil CAP-013" (deterministik) dari "CAP-013 menghasilkan X" (tidak deterministik). **Perbaikan (non-ACR — memperkaya struktur Rule Explanation yang sudah ada dengan SATU klarifikasi label, bukan field baru):** Rule Explanation WAJIB mencantumkan bahwa `action_taken` adalah KEPUTUSAN (selalu direplay identik), terpisah dari OUTCOME pemanggilan itu (di-Replay via Retrieve kalau `action_result_class = Computed Data`, via Recompute kalau `True Derived Data`) — ini murni penambahan LABEL pada field yang sudah ada (`action_taken`, `08a` § R), bukan struktur baru.

**Kesimpulan: LOLOS** — Determinism tetap terjaga tepat pada lapisan yang dijanjikan (keputusan orkestrasi), tidak overclaim ke lapisan yang bukan tanggung jawabnya (hasil eksekusi Capability eksternal). Satu klarifikasi label ditambahkan ke Rule Explanation.

---

## 9. Idempotency — Rule Dipanggil Dua Kali, Apakah Hasilnya Tetap Satu?

**Diuji:** Checklist § H `08a` poin 7 SUDAH mewajibkan Idempotency per-Rule. Diperiksa Rule-001 s.d. 004 secara konkret: apakah action-nya AMAN dipanggil dua kali untuk event yang sama (mis. karena Retry setelah timeout, padahal eksekusi pertama sebenarnya berhasil tapi responsnya hilang)?

**Diperiksa dalam — kasus paling rawan, Rule-001 (Computed Data via Integration):** Kalau Rule-001 dipanggil dua kali untuk `EstimateVersionApproved` yang SAMA, apakah menghasilkan DUA RAP Draft (duplikat, salah) atau SATU RAP Draft (benar)? **Ini TIDAK bisa dijawab dari `08c v2` sendiri** — jawabannya bergantung BAGAIMANA CAP-013 (Integration Gateway) mengimplementasikan penerimaan panggilan, yang secara eksplisit DITUNDA ke Phase H (`08c v2` § G poin 2). **Celah nyata, TAPI sudah tercatat sebagai Open Question yang sah ditunda** — bukan celah yang terlewat, tapi konsekuensi dari batas layer yang sudah benar (Rule Design menentukan BAHWA CAP-013 dipanggil, bukan BAGAIMANA CAP-013 menjamin idempotency internalnya).

**Yang BISA dan HARUS dijawab di level Rule Design (bagian yang benar-benar milik Layer 5):** Apakah Rule ITU SENDIRI (bukan CAP-013) menyediakan INFORMASI yang cukup bagi CAP-013 untuk mengimplementasikan idempotency? Diperiksa struktur `action` (§ I `08a`) — TIDAK ADA field yang membawa "Idempotency Key" eksplisit (mis. kombinasi `rule_id` + `rule_version` + `trigger_event_id`) yang bisa dipakai CAP-013 untuk mendeteksi "panggilan ini sudah pernah diproses".

**Perbaikan (non-ACR — field tambahan opsional pada Execution Semantics, memperkaya bukan mengubah § I `08a`):**

```
Rule Execution Instance (bukan Rule Definition — ini record RUNTIME per eksekusi) {
  idempotency_key:  hash(rule_id + rule_version + trigger_event_id)   ← BARU
}
```

**Kenapa ini bukan field baru di struktur Rule (§ I), melainkan struktur BARU terpisah ("Rule Execution Instance"):** `idempotency_key` bukan properti Rule Definition (yang statis, di-versioned) — ia properti SATU EKSEKUSI (event tertentu memicu Rule tertentu pada waktu tertentu). Menaruhnya di Rule Definition akan salah kaprah (Rule Definition tidak berubah per event, tapi idempotency_key HARUS berubah per event). Ini KONSISTEN dengan pembedaan yang sudah ada di § I `08a` sendiri antara `version` (Rule Definition) dan hal-hal yang terjadi saat eksekusi (Rule Explanation, § R — juga record per-eksekusi, bukan per-definisi). `idempotency_key` adalah field baru pada Rule Explanation (§ R), bukan pada Rule Definition (§ I) — TIDAK menyentuh struktur Rule yang sudah dikunci.

**Verifikasi ulang:** Rule-001 s.d. 005 semuanya BISA menghasilkan `idempotency_key` dari kombinasi yang sudah ada (`id`+`current_version`+event instance) — tidak butuh data baru yang belum ada. **LOLOS setelah penambahan.**

---

## 10. Explainability — "Kenapa Procurement Dibuat?" Sampai ke Akar

**Diuji:** Rule Explanation (§ R `08a`) sudah punya struktur untuk ini. Diperiksa APAKAH benar-benar bisa dijawab "sampai ke akar" untuk kasus Rule-002 (Material Requirement Draft, paling dekat dengan "Procurement" yang founder maksud sebagai contoh).

**Ditelusuri manual, langkah demi langkah, memakai SEMUA struktur yang sudah dikunci sepanjang G:**

```
Pertanyaan: "Kenapa Material Requirement Draft dibuat untuk Estimate X?"

1. Rule Explanation (§ R, 08a):
   rule_id: RULE-002, rule_version: v1
   trigger_event: EstimateVersionApproved (event_id: EVT-12345)
   condition_evaluated: "Estimate Item memuat Resource kategori Material" = TRUE
     (Resource aktual: Semen 50 sak, Besi 2 ton — dari CAP-001 RBS)
   scope_resolved: [Company/Project Rule mana yang menang, § Q]
   action_taken: Panggil CAP-013 → generate Material Requirement Draft
   idempotency_key: hash(RULE-002+v1+EVT-12345)   ← BARU dari poin 9

2. Kenapa RULE-002 yang trigger (bukan Rule lain)?
   → Rule Composition graph (§ O): RULE-002 depends_on = [] (independen)
   → Rule Group "EstimateApprovalFlow" (§ F, 08c v2): RULE-002 anggota
     grup yang trigger pada EVT-12345 bersama RULE-001/003/004

3. Kenapa CONDITION-nya TRUE?
   → Ditelusuri balik ke CAP-001 (RBS Estimate X) via Canonical Information
     Contract (07 § C) — Resource kategori Material tercatat eksplisit,
     traceable ke Estimate Item individual

4. Kenapa HASIL EKSEKUSI (isi Material Requirement Draft) seperti ini?
   → INI transisi dari Layer 5 (keputusan Rule, Recompute-deterministik)
     ke Layer 2 (hasil CAP-013, Retrieve-snapshot, 08h § C.2) — dijawab
     lewat Audit Data CAP-013 sendiri (07 § A.9), BUKAN lewat Rule
     Explanation lagi (batas tanggung jawab yang benar, 08i § D Uji 2)

5. Apakah versi Rule ini yang SAMA masih berlaku sekarang (untuk keperluan
   audit di masa depan)?
   → Rule Versioning (§ K, 08a): rule_version v1 immutable, kalau sudah
     Superseded ke v2, versi v1 tetap tersimpan untuk menjelaskan
     keputusan HISTORIS ini secara utuh (Historical Data, 08g/08h)
```

**Kesimpulan: BISA dijawab sampai ke akar** — rantai penjelasan lengkap dari trigger event → condition evaluated dengan nilai aktual → scope resolution → action → (batas eksplisit ke Layer 2 untuk hasil eksekusi CAP-013) → versioning untuk audit historis. **Tidak ada titik putus dalam rantai eksplikasi** — setiap langkah merujuk struktur yang SUDAH dikunci (Rule Explanation, Rule Composition, Canonical Information Contract, Rule Versioning), tidak butuh mekanisme baru selain `idempotency_key` yang sudah ditambahkan di poin 9.

**LOLOS sepenuhnya.**

---

## Ringkasan Hasil Sepuluh Skenario

| # | Skenario | Hasil | Perbaikan Diterapkan? |
|---|---|---|---|
| 1 | Rule Collision | LOLOS | Ya — aturan target-write eksklusif ditambahkan ke Checklist § H |
| 2 | Dead Rule | LOLOS | Ya — syarat test case pembuktian condition TRUE ditambahkan ke § S |
| 3 | Circular Rule | LOLOS | Ya — cakupan DFS diperluas ke graph gabungan (depends_on + system_signal) |
| 4 | Infinite Cascade | LOLOS | Ya — prosedur verifikasi penyambungan ke Event Catalog § F ditambahkan |
| 5 | Event Storm | LOLOS | Tidak — mekanisme sudah cukup (Criticality+Rule Group+Recovery), Timeout dinaikkan prioritas operasionalnya saja |
| 6 | Priority Inversion | LOLOS | Tidak — prasyarat terjadinya belum ada, dicatat kondisional |
| 7 | Recovery Correctness | LOLOS | Ya — larangan Recovery Rule memanggil Capability yang sama dengan Rule Group yang gagal |
| 8 | Replay Correctness | LOLOS | Ya — klarifikasi label pada Rule Explanation (keputusan vs outcome) |
| 9 | Idempotency | LOLOS | Ya — `idempotency_key` ditambahkan ke Rule Explanation (bukan Rule Definition) |
| 10 | Explainability | LOLOS | Tidak — rantai penjelasan sudah lengkap tanpa titik putus |

**Sepuluh dari sepuluh skenario LOLOS.** Enam menghasilkan perbaikan konkret (semuanya non-ACR — memperkaya/memperluas cakupan mekanisme yang sudah dikunci, tidak mengubah Five Truth Layers/Ownership/Structure/Contract/Version yang sudah frozen). Empat lolos tanpa perlu perbaikan (Event Storm, Priority Inversion, Explainability lolos murni; Idempotency lolos SETELAH satu penambahan).

**Catatan kejujuran metodologis (konsisten prinsip founder sejak G.0 — "kalau hasilnya 9/9 lulus tanpa menemukan apa pun, saya justru curiga"):** Sepuluh dari sepuluh LOLOS bukan berarti tidak ditemukan apa-apa — ENAM celah nyata ditemukan dan diperbaiki di tempat. "Lolos" di sini berarti *setelah diperbaiki*, bukan *sudah sempurna sejak awal*. Temuan paling signifikan adalah § 3-4 (Circular Rule dan Infinite Cascade) — keduanya mengungkap bahwa algoritma deteksi siklus yang sudah dikunci (`06` § D.2) perlu cakupan graph yang LEBIH LUAS dari yang sebelumnya diasumsikan (system_signal dan lintas-event), meski algoritmanya sendiri tidak berubah.

**Dua skenario tambahan (§ 11-12, diangkat founder di luar sepuluh skenario asli) diperiksa setelahnya — Rule Ordering/Event Join Semantics dan Event Contract Versioning — keduanya dikonfirmasi TIDAK membahayakan Rule-001 s.d. 005 yang sudah didesain, tapi bentuk penyelesaian permanennya sengaja DEFERRED ke Phase H (§ 13) karena menyentuh Event/Integration Contract yang belum dibangun.**

---

## Verifikasi Ulang Terhadap Decision Checklist Umum (`04` § 12) dan Khusus Orchestration (`08a` § H)

**Dijalankan ulang untuk Rule-001 s.d. 005 setelah SEMUA perbaikan § 1-10 diterapkan** — bukan diulang detail (sudah dilakukan di `08c` § G dan `08c v2` § H), dikonfirmasi: tidak satu pun perbaikan di atas mengubah jawaban checklist yang sudah LOLOS sebelumnya — semua perbaikan bersifat ADITIF (field/aturan baru) yang otomatis dipenuhi Rule-001 s.d. 005 tanpa desain ulang.

---

## 11. Rule Ordering — Event Join Semantics (Ditemukan Founder, Bukan Bagian Sepuluh Skenario Asli)

**Diuji:** Skenario tambahan di luar sepuluh yang sudah diperiksa: Rule A menghasilkan Event X, Rule B JUGA menghasilkan Event X (dua Rule berbeda, output event yang sama — bukan mustahil, mis. dua jalur berbeda yang keduanya berujung pada kesimpulan "Material Requirement siap"). Rule C trigger pada Event X. **Pertanyaan: Rule C jalan setelah A saja, B saja, atau keduanya?**

**Diperiksa terhadap seluruh struktur yang sudah dikunci (`08a`, `08c v2`, dan perbaikan § 1-10 di atas):** Tidak ditemukan SATU field maupun aturan pun yang menjawab ini. § F Event Dependency & Ordering (`08` Phase G Discovery) mendefinisikan urutan ANTAR event, § O Rule Composition (`08a`) mendefinisikan dependency ANTAR Rule via `depends_on` — TIDAK ADA keduanya yang menjawab **semantik penggabungan (join)** ketika SATU event bisa berasal dari BEBERAPA Rule/Producer berbeda. Ini pertanyaan yang genuinely BELUM diajukan sepanjang Phase G manapun (Discovery, Philosophy, maupun Design) — bukan celah implementasi, celah KONSEPTUAL yang baru terlihat lewat skenario ini.

**Diuji apakah ini menyentuh baseline (Decision Checklist § 12 `04`, enam sumbu):** Diperiksa satu per satu — Five Truth Layers (tidak tersentuh, ini murni Layer 5), Ownership (tidak tersentuh), Replay (berpotensi tersentuh SECARA TIDAK LANGSUNG — kalau join semantics tidak jelas, Replay bisa ambigu soal "Rule C jalan atau tidak" untuk histori lama), Contract (INI yang tersentuh — join semantics adalah bagian dari kontrak BAGAIMANA Rule C menerima event, sangat dekat dengan Event Contract itu sendiri), Version (tidak langsung), Structure (berpotensi — `trigger` Rule C mungkin perlu field tambahan seperti `join_policy: ANY | ALL | QUORUM`).

**Kesimpulan: Ini BUKAN pertanyaan yang bisa dijawab tuntas di Phase G** — karena jawabannya bergantung pada BAGAIMANA Event Catalog/Contract merepresentasikan "event yang sama dari producer berbeda" (satu event logis vs beberapa instance event fisik yang kebetulan sama nama), yang merupakan keputusan **Event Contract** — irisan langsung dengan Phase H (Integration Architecture), yang akan mendefinisikan bentuk konkret Payload Contract (`08c v2` § G poin 3, sudah tercatat sebagai Open Question tertunda). Memaksa jawaban sekarang berisiko mendesain Contract sebelum Phase H membangun fondasinya — pelanggaran urutan fase yang sudah berkali-kali dihindari sepanjang CECEP.

**Status: DEFERRED ke Phase H** (bukan Deferred Refinement biasa seperti § `08j` — ini defer LINTAS FASE, dicatat eksplisit di penutup dokumen ini, § 13 di bawah).

---

## 12. Event Contract Versioning (Ditemukan Founder, Bukan Bagian Sepuluh Skenario Asli)

**Diuji:** Rule sudah versioned (§ K `08a`), Formula sudah versioned (`06` § K), Information Contract sudah versioned (`07` § C). **Event Contract itu sendiri — apakah `EstimateVersionApproved` v1 dan v2 (kalau strukturnya berubah di masa depan) sudah punya aturan koeksistensi?**

**Diperiksa terhadap struktur yang sudah dikunci:** Enterprise Event Catalog (`08` § A) mencatat NAMA event dan Criticality/Consistency-nya, TAPI tidak eksplisit mencatat VERSI struktur payload event tersebut. Diperiksa apakah ini celah yang sama dengan § 11 di atas (irisan dengan Contract) — **Ya, sama sifatnya**: menjawab ini butuh mendefinisikan Event Payload Contract secara konkret, yang SUDAH tercatat sebagai Open Question tertunda ke Phase H (`08c v2` § G poin 3) SEBELUM founder mengangkat pertanyaan ini — pertanyaan founder MEMPERTAJAM cakupan Open Question yang sudah ada, bukan menemukan Open Question yang benar-benar baru.

**Diuji dampaknya ke Rule yang sudah didesain (Rule-001 s.d. 005):** Apakah keempat Rule contoh TERGANTUNG pada asumsi Event Contract tidak akan pernah berubah? Diperiksa `trigger: EstimateVersionApproved` di semua Rule — tidak ada asumsi versi payload spesifik tertulis di `condition`/`action` manapun (mis. tidak ada `payload.field_x` yang diasumsikan ada tanpa pengecekan). **Rule-001 s.d. 005 TIDAK rentan terhadap perubahan Event Contract yang belum terjadi** — desainnya cukup generik (baca ulang dari CAP-008 via Capability call, bukan membaca payload event mentah secara langsung, konsisten § I `08a` poin 4 Decision Checklist "data memakai Canonical Information Contract, tidak membaca struktur Entity mentah").

**Status: DEFERRED ke Phase H**, dicatat sebagai kalimat eksplisit persis seperti diminta founder (§ 13 di bawah) — supaya tidak lupa, tanpa memaksa jawaban sekarang.

---

## 13. Deferred to Phase H

**Dua catatan berikut BUKAN Open Question yang belum terjawab karena kelalaian — keduanya sudah diuji (§ 11-12) dan disimpulkan sengaja tidak dijawab di Phase G karena jawabannya bergantung pada keputusan Event/Integration Contract yang menjadi domain Phase H. Dicatat di sini secara eksplisit supaya tidak hilang saat transisi fase:**

1. **Event Join Semantics** (ANY / ALL / QUORUM) — ketika satu Domain Event bisa dihasilkan lebih dari satu Rule/Producer, Rule Design belum mendefinisikan bagaimana Consumer Rule menggabungkan/menunggu kemunculan event tersebut. Phase H WAJIB menjawab ini sebagai bagian mendefinisikan Event Contract konkret.
2. **Event Contract Versioning** — bagaimana Rule yang sudah Published menangani perubahan struktur payload Domain Event dari waktu ke waktu (coexist v1/v2, migrasi otomatis, atau deprecation) belum didefinisikan. Phase H WAJIB menjawab ini sebagai bagian mendefinisikan Integration Gateway (CAP-013) dan Payload Contract.

**Prinsip governing untuk keduanya (konsisten Discovery Completion Rule, `04` § 15):** Jangan menyelesaikan masalah Phase H di Phase G — keduanya diuji cukup dalam untuk memastikan Rule-001 s.d. 005 TIDAK rentan terhadap ketidakjelasan ini (§ 11-12 mengonfirmasi Rule contoh saat ini aman), tapi bentuk penyelesaian permanennya sengaja ditinggalkan untuk fase yang tepat.

---

## Assumptions

1. Enam perbaikan (§ 1, 2, 3, 4, 7, 8, 9) diasumsikan CUKUP untuk menutup celah yang ditemukan masing-masing skenario — kalau implementasi nyata (Phase K/L) menemukan celah tambahan yang tidak tertangkap analisis level-arsitektur ini, itu wajar dan bukan tanda G.1 gagal (Decision Checklist tidak pernah mengklaim exhaustive terhadap SEMUA kemungkinan bug implementasi, hanya kelas masalah arsitektural).
2. Prioritas pengisian Timeout (§ 5) dinaikkan berdasarkan analisis di sini, tapi TETAP berstatus Open Question implementasi (bukan arsitektural) — tidak diubah jadi keputusan wajib freeze di sini.

## Open Questions

(Tidak ada Open Question baru yang menyentuh baseline — seluruh temuan § 1-10 sudah diselesaikan langsung sebagai perbaikan non-ACR. Open Question lama dari `08c v2` § G tetap berlaku, tidak berubah oleh G.1 ini.)

## Status

**Validasi selesai — SEPULUH DARI SEPULUH skenario stress test LOLOS setelah enam perbaikan konkret diterapkan, DITAMBAH dua skenario lanjutan (Rule Ordering/Event Join Semantics, Event Contract Versioning) diuji dan sengaja DEFERRED ke Phase H.** Tidak ada temuan yang menyentuh Five Truth Layers, Ownership, Replay, Version, atau Structure yang sudah dikunci — seluruh perbaikan bersifat ADITIF (memperkaya/memperluas cakupan mekanisme yang sudah ada: Decision Checklist, algoritma DFS, Rule Explanation). Dua defer ke Phase H menyentuh Contract, TAPI dikonfirmasi tidak membahayakan Rule Design saat ini (§ 11-12). Rule Design ([`08c v2`](08c-orchestration-rule-design-v2.md)) dan Enterprise Orchestration Philosophy ([`08a`](08a-enterprise-orchestration-philosophy.md)) dinyatakan **KONSISTEN dan TAHAN terhadap skenario ekstrem** (collision, dead rule, circular, cascade, storm, priority inversion, recovery loop, replay, idempotency, explainability, join semantics, contract versioning).

---

## 🔒 PHASE G FREEZE (Orchestration Architecture — Discovery + Philosophy + Design + Validation)

**Status: FROZEN.** Founder mengonfirmasi freeze dengan satu syarat — dua temuan lanjutan (§ 11-12, Rule Ordering/Event Join Semantics dan Event Contract Versioning) dicatat eksplisit sebagai Deferred to Phase H (§ 13) — dipenuhi. Cakupan yang di-freeze mencakup SELURUH Phase G: Enterprise Event Catalog + 7 artefak discovery ([`08`](08-phase-g-enterprise-orchestration-architecture.md)), Enterprise Orchestration Philosophy 19-section ([`08a`](08a-enterprise-orchestration-philosophy.md)), Philosophy Validation ([`08b`](08b-phase-g0-orchestration-philosophy-validation.md)), rantai Rule Discovery lengkap ([`08d`](08d-rule-taxonomy-discovery.md)-[`08j`](08j-discovery-completion-assessment.md)), Rule Design v2 ([`08c v2`](08c-orchestration-rule-design-v2.md)), dan stress test validation ini ([`08k`](08k-phase-g1-rule-design-validation-freeze.md)) termasuk § 11-13.

**Konsekuensi freeze (Progressive Freeze Chain, `04` § 7):** Mulai freeze, Phase G TIDAK BOLEH dibuka kembali tanpa ACR. Phase H (Integration Architecture) boleh dimulai di atas fondasi Orchestration yang sudah frozen penuh.

**Kewajiban eksplisit yang diwariskan ke Phase H (bukan opsional, § 13):**
1. Mendefinisikan Event Join Semantics (ANY/ALL/QUORUM) untuk kasus satu Domain Event dihasilkan lebih dari satu Rule/Producer.
2. Mendefinisikan Event Contract Versioning (coexist/migrasi/deprecation) sebagai bagian mendesain Integration Gateway (CAP-013) dan Payload Contract.
3. Tiga Open Question lama yang sudah tercatat sebelumnya (`08c v2` § G): nilai Timeout konkret, bentuk konkret CAP-013, skema Payload Contract tiga event baru (`RapDraftGenerated`, `MaterialRequirementDraftGenerated`, `CashflowBaselineGenerated`).

*Dokumen selanjutnya: Phase H — Integration Architecture.*
