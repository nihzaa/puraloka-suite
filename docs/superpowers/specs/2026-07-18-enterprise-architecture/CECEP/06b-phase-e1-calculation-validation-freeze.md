# CECEP — Phase E.1: Calculation Validation & Freeze

> ⚠️ **SUPERSEDED.** Memvalidasi `06` yang terikat Capability Catalog lama, sudah digantikan [`35`](35-phase3-capability-architecture.md)/[`42-phase5-calculation-strategy-architecture.md`](42-phase5-calculation-strategy-architecture.md). JANGAN dipakai sebagai evidence. Dipertahankan sebagai jejak historis proses.

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Validation gate setelah Phase E, sebelum Phase F — **BUKAN phase baru**, mengikuti pola yang sama seperti Discovery Validation & Freeze (C.5) dan Capability Validation & Freeze (D.1). Berbeda dari D.1 yang memvalidasi Capability Architecture (siapa bertanggung jawab), E.1 memvalidasi **Calculation Architecture** (bagaimana benar-benar menghitung) — jauh lebih dalam, karena menguji perilaku pipeline, bukan cuma kelengkapan kontrak.
**Tujuan:** Memastikan Enterprise Calculation Architecture ([`06`](06-phase-e-calculation-strategy.md)) benar-benar konsisten dan tahan uji SEBELUM Phase F memetakannya ke Entity/Aggregate Root/Value Object. Setiap pemeriksaan di bawah adalah PENGUJIAN NYATA terhadap desain § A-O Phase E — bukan re-statement checklist.
**Rujukan:** Seluruh isi yang divalidasi berasal dari [`06-phase-e-calculation-strategy.md`](06-phase-e-calculation-strategy.md) § A-O. Prinsip constitutional dari [`04-architecture-constitution.md`](04-architecture-constitution.md). Capability Catalog dari [`05b`](05b-phase-d1-capability-validation-freeze.md) § 10.

---

## 1. Formula Consistency Validation

**Diuji:** Apakah SEMUA formula (lintas 6 kelas, § A.1 Phase E) mengikuti filosofi yang sama — no hardcode, versioned, explainable, replayable, deterministic, auditable?

| Kriteria | Diuji Terhadap | Hasil |
|---|---|---|
| No hardcode | Setiap kelas formula (§ A.1) harus lolos parse-time validation (§ A.5) sebelum jadi Formula Definition — tidak ada jalur "formula darurat" yang menembus validasi | ✅ Lolos — § A.5 tidak punya jalur pintas; Override Hierarchy (§ E) mengganti NILAI, bukan menyisipkan ekspresi ad-hoc (§ E.3 eksplisit menegaskan ini) |
| Versioned | Formula Definition immutable setelah Active (§ K) | ✅ Lolos — dikonfirmasi ulang, tidak ada kelas formula (Geometric s.d. Temporal) yang dikecualikan dari versioning |
| Explainable | Explanation Tree dihasilkan otomatis dari pipeline (§ I.2) | ✅ Lolos, DENGAN SATU TEMUAN: kelas **Aggregative** (`SUM(EstimateItem[] WHERE ...)`, § A.1) berpotensi menghasilkan Explanation Tree yang sangat besar (satu node per item yang dijumlahkan) — Phase E tidak eksplisit membahas BATAS kedalaman/ringkasan Explanation Tree untuk agregasi skala besar. **Dicatat sebagai gap, bukan pelanggaran** — lihat § 13 Performance Validation untuk analisis lanjutan. |
| Replayable | Side-effect free (§ A.2) + cache versioned (§ C.5) | ✅ Lolos — diverifikasi silang: TIDAK ada kelas formula yang menulis data sebagai bagian evaluasinya (§ A.2 melarang ini universal untuk semua kelas) |
| Deterministic | Given input+versi yang sama, hasil harus identik | 🟡 **Satu risiko ditemukan**: fungsi built-in `LOOKUP` (§ A.3) yang memanggil CAP-004 Pricing — kalau dipanggil TANPA `EffectiveDate` eksplisit, ia bisa mengembalikan Price Book Entry AKTIF SAAT DIPANGGIL, yang berarti hasil BISA BERBEDA kalau dipanggil ulang di waktu lain meski `ResourceID` sama. **Ini bukan pelanggaran desain — Formula Language sudah menyediakan parameter `EffectiveDate`** (§ A.3, contoh `LOOKUP(PriceBook, ResourceID, EffectiveDate)`) — tapi Phase E tidak eksplisit MEWAJIBKAN `EffectiveDate` selalu diisi. **Dikoreksi di § 15 Freeze Checklist** sebagai aturan tambahan: `LOOKUP` terhadap knowledge ter-versi WAJIB menyertakan titik waktu eksplisit, tidak boleh implisit "sekarang". |
| Auditable | Setiap eksekusi APPROVAL tercatat (§ J.1) | ✅ Lolos |

**Verdict: 🟡 LULUS DENGAN 1 KOREKSI (LOOKUP wajib eksplisit EffectiveDate) + 1 GAP DICATAT (Explanation Tree untuk agregasi besar, ditindaklanjuti § 13).**

---

## 2. Strategy Validation — Uji Pluggability Nyata

**Diuji:** Apakah Strategy Pattern (§ B Phase E) BENAR-BENAR bisa menambah Government AHSP, Company AHSP, Vendor Formula, AI Formula, Historical Formula, Future Formula — **tanpa mengubah Calculation Engine**.

**Metodologi pengujian:** Untuk tiap jenis strategy, ditelusuri apakah ia bisa dipenuhi HANYA dengan mengisi kontrak § B.2 (`id`, `version`, `applicable_context`, `formula: AST`, `required_inputs`, `produces`, `confidence_source`) tanpa menyentuh kode Execution Pipeline (§ C).

| Jenis Strategy | Bisa Dipenuhi Kontrak § B.2 Tanpa Ubah Engine? | Analisis |
|---|---|---|
| Government AHSP | ✅ Ya | `applicable_context` = level nasional, `formula` = AST hasil bootstrap Reference Library (CAP-001) — sudah persis pola § E.1 level 1 |
| Company AHSP | ✅ Ya | Sama, `applicable_context` level company — pola § E.1 level 2 |
| Vendor Formula | ✅ Ya | Vendor Formula = Strategy dengan `confidence_source` merujuk Supplier (CAP-004) — tidak butuh kelas formula baru, cukup `applicable_context` baru |
| Historical Formula | ✅ Ya | Ini persis apa yang dihasilkan Benchmark (§ L.3) — Strategy yang `formula`-nya diturunkan dari Replay data lampau, tetap AST biasa |
| **AI Formula** | 🟡 **Perlu klarifikasi tegas** | Ditelusuri: kalau "AI Formula" berarti Formula Definition yang KONTENNYA diusulkan AI tapi tetap berupa AST yang divalidasi (§ A.5) dan di-Approve manusia (CAP-010) — ✅ SAH, tidak beda dari Strategy manapun. TAPI kalau "AI Formula" berarti model inference (black-box) yang dipanggil sebagai pengganti evaluasi AST — ❌ **MELANGGAR** Konstitusi Calculation Strategy ([`06`](06-phase-e-calculation-strategy.md) § pembuka poin 6) dan § N (AI tidak pernah menghitung sendiri). **Keputusan tegas:** "AI Formula" HANYA sah dalam pengertian pertama — AI mengusulkan KONTEN AST yang tetap dieksekusi CAP-006 secara normal, bukan strategy yang berarti "panggil model AI saat runtime". Ini bukan pelanggaran ditemukan, ini KLARIFIKASI istilah yang perlu eksplisit supaya tidak disalahpahami di Phase F/H. |
| Future Formula (kelas belum ada hari ini) | ✅ Ya, secara struktural | Grammar extensible (§ A.3 — fungsi baru didaftarkan tanpa ubah grammar inti) dan kontrak § B.2 tidak berasumsi domain konstruksi spesifik apa pun — pengujian lebih dalam untuk kelas SANGAT baru (Carbon Cost, dst) ada di § 12 Future-Proof Validation |

**Verdict Strategy Validation: ✅ LULUS, dengan 1 klarifikasi wajib ditambahkan ke Phase E (bukan koreksi struktural, murni penegasan istilah "AI Formula") — lihat § 15.**

---

## 3. Override Validation — Uji Skenario Konkret

**Diuji:** Apakah Override Hierarchy (§ E.1 Phase E) tidak ambigu, dengan skenario spesifik yang diminta.

**Catatan urutan:** Founder menuliskan urutan Government→Company→Project→Scenario→Manual→**AI Recommendation** (6 level, AI eksplisit disebut sebagai level terakhir dalam urutan). Phase E asli (§ E.1) mendefinisikan 5 level TANPA AI sebagai level ("AI Recommendation TIDAK masuk hierarki override ini sebagai level tersendiri", § E.1 catatan). **Ini perlu diklarifikasi sebagai kesamaan makna, bukan kontradiksi** — lihat analisis di bawah.

### Skenario 1: Government berubah — apa yang ikut berubah?

**Diuji terhadap § E.2 (algoritma resolusi):** Government/National Baseline adalah level TERENDAH (paling gampang di-override). Kalau nilai Government berubah (mis. AHSP Nasional edisi baru dirilis), maka:
- Estimate Item yang TIDAK punya Override di level manapun di atasnya → nilai baru otomatis berlaku pada evaluasi BERIKUTNYA (bukan retroaktif ke Estimate Version yang sudah Baseline/Frozen, karena § K menyatakan immutable setelah Active — Formula Migration, § J.2, tetap eksplisit/manual).
- Estimate Item yang PUNYA Company/Project/Scenario/Manual Override → **TIDAK terpengaruh sama sekali**, karena resolusi § E.2 berhenti di level pertama yang punya nilai eksplisit — level di atas Government tidak pernah "melihat" perubahan Government kecuali mereka secara eksplisit dihapus overridenya.

**Verdict:** ✅ Tidak ambigu — perilaku ini adalah konsekuensi LANGSUNG algoritma § E.2 yang sudah didesain, tidak perlu logika tambahan.

### Skenario 2: Company Override aktif — apa yang tetap memakai Government?

**Diuji:** Company Override (§ E.1 level 2 dalam penomoran Phase E, yaitu "Company AHSP/Price Book/Productivity") berlaku PER Resource/Cost Code, bukan blanket seluruh Company. Artinya: kalau Company hanya punya Override untuk Resource "Besi Beton" tapi belum untuk "Semen", maka Estimate Item yang merujuk "Semen" tetap memakai Government/National Baseline — resolusi § E.2 dilakukan PER `variable_ref`, bukan per Estimate Version secara keseluruhan.

**Verdict:** ✅ Tidak ambigu — TAPI ini fakta yang IMPLISIT di § E.2 (algoritma disebutkan berlaku "untuk setiap `variable_ref`") dan tidak pernah digarisbawahi dengan contoh eksplisit. **Direkomendasikan ditambahkan sebagai contoh konkret di Phase E § E.2** — bukan perubahan desain, murni kejelasan dokumentasi.

### Skenario 3: Scenario Override aktif — apakah Company ikut berubah?

**Diuji:** Scenario Override (§ E.1 level 4) HANYA berlaku di dalam SATU Scenario (CAP-009) tertentu — ia TIDAK PERNAH menulis balik ke Company Override (level 2). Ini dikonfirmasi silang dengan Phase C.5 ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.9c): "Scenario adalah lapisan hasil kalkulasi paralel, bukan struktur domain yang diduplikasi" — Scenario Override adalah OVERLAY sementara pada satu jalur perbandingan, bukan mutasi terhadap Company Override yang mendasarinya.

**Verdict:** ✅ Tidak ambigu — konsisten dengan definisi Scenario di Phase C.5.

### Klarifikasi posisi AI Recommendation dalam urutan founder

Founder menulis AI Recommendation sebagai "level" keenam SETELAH Manual — Phase E asli menyebut AI TIDAK masuk sebagai level. **Rekonsiliasi:** Kedua pernyataan sebenarnya KONSISTEN kalau dibaca tepat — founder tidak memaksudkan AI Recommendation MENANG atas Manual Override secara otomatis (itu akan melanggar § N: AI tidak pernah menghitung sendiri/menentukan hasil final). Posisi AI Recommendation "setelah Manual" dalam urutan founder lebih tepat dibaca sebagai: **AI Recommendation adalah SARAN untuk level Manual, dievaluasi TERAKHIR dalam alur kerja manusia** (estimator melihat AI Recommendation, lalu MEMUTUSKAN apakah mengisi Manual Override berdasarkan saran itu) — bukan level resolusi otomatis keenam. **Ini bukan kontradiksi yang perlu ACR** — murni perbedaan bagaimana "urutan" dimaknai (urutan ALUR KERJA vs urutan RESOLUSI OTOMATIS). Direkomendasikan Phase E § E.1 diberi satu kalimat tambahan penegasan ini.

**Verdict Override Validation: ✅ LULUS PENUH, dengan 2 rekomendasi kejelasan dokumentasi (bukan perubahan struktural) — lihat § 15.**

---

## 4. Dependency Graph Validation

**Diuji:** No circular dependency, dependency graph valid, topological sorting selalu berhasil, formula graph bisa dieksekusi.

**Diverifikasi ulang terhadap § D Phase E (yang sudah membedakan 2 jenis sirkularitas):**

| Uji | Metodologi | Hasil |
|---|---|---|
| No circular (structural) | DFS three-color (§ D.2) dijalankan di 2 titik wajib (§ D.3): saat `FormulaActivated` dan saat Estimate Version disusun | ✅ Terjamin oleh desain — deteksi TIDAK opsional, adalah gerbang wajib sebelum status Active/sebelum eksekusi |
| Topological sorting selalu berhasil | **Diuji secara matematis:** topological sort HANYA gagal kalau graph punya siklus. Karena structural circular SUDAH ditolak di titik masuk (§ D.3), graph yang mencapai tahap CALCULATION (§ C.1 tahap 3) dijamin acyclic (DAG) | ✅ Terjamin SECARA LOGIS — ini bukan asumsi, ini konsekuensi matematis dari desain yang sudah ada (kalau A maka B, bukan klaim terpisah) |
| Formula graph bisa dieksekusi | Evaluasi mengikuti urutan topological (§ C.3) | ✅ Lolos, DENGAN SATU GAP: Phase E tidak eksplisit membahas APA YANG TERJADI kalau satu node di tengah graph GAGAL dievaluasi (mis. `LOOKUP` tidak menemukan Price Book Entry yang valid untuk `EffectiveDate` tertentu) — apakah seluruh Estimate Item gagal, atau node itu ditandai error sementara node lain tetap dievaluasi? **Dicatat sebagai gap desain yang perlu diisi sebelum Phase F** — lihat § 15. |

**Verdict: 🟡 LULUS DENGAN 1 GAP (error handling mid-graph belum didesain eksplisit) — dicatat sebagai item Freeze Checklist, bukan blocker fatal karena tidak mengubah struktur, hanya menambah satu aturan.**

---

## 5. Unit Validation

**Diuji:** Pastikan tidak ada formula yang menjumlahkan `5 kg + 3 m²` — harus gagal.

**Diverifikasi terhadap § F (Precision Rules) dan § A.3 (fungsi `CONVERT`):** Phase E asli TIDAK eksplisit menyatakan bahwa operator aritmatika dasar (`+`, `-`, § A.3 grammar) memvalidasi KOMPATIBILITAS UNIT sebelum operasi dijalankan — ini GAP NYATA yang ditemukan, bukan sekadar klarifikasi.

**Analisis akar masalah:** § F (Precision Rules) membahas presisi ANGKA (jumlah desimal, pembulatan) — ini BEDA dari validasi DIMENSI/UNIT (kg vs m² adalah dimensi fisik berbeda, bukan cuma presisi berbeda). Phase E tidak punya section yang eksplisit menjawab pertanyaan "apakah grammar memvalidasi kompatibilitas dimensi sebelum operasi `+`/`-` dijalankan".

**Rekomendasi konkret (bukan ACR — bisa diselesaikan sebagai penambahan aturan validasi, tidak mengubah capability/domain):** Tambahkan **Unit Compatibility Check** sebagai bagian dari § A.5 (Validasi Parse-Time) Phase E — setiap `variable_ref` membawa metadata unit dari RBS entry (CAP-001, konsisten dengan § F yang sudah menyatakan Precision Rule "melekat ke RBS entry sebagai atribut identitas"). Operator `+`/`-` HANYA sah antara dua operand dengan unit identik ATAU salah satunya melalui `CONVERT()` eksplisit lebih dulu (§ A.3). `5 kg + 3 m²` harus gagal di PARSE-TIME (bukan runtime) — konsisten dengan filosofi § A.5 yang sudah menegaskan validasi tipe dicegah sedini mungkin.

**Verdict Unit Validation: ⚠️ GAP DITEMUKAN — bukan pelanggaran desain existing, tapi ketiadaan aturan eksplisit yang WAJIB ditambahkan sebelum Freeze (bukan ACR, karena diselesaikan murni sebagai penambahan validasi di § A.5, tidak menyentuh capability/domain apa pun).**

---

## 6. Explainability Validation

**Diuji dengan contoh konkret founder:** Rp 2.135.678.000 harus bisa dijelaskan turun sampai Material→Labor→Equipment→Subcontract→Risk→Regional Index→Company Adjustment→Scenario Adjustment→Final.

**Diverifikasi terhadap § I (Explanation Tree) + § E (Override Hierarchy):** Ditelusuri apakah struktur Explanation Tree (§ I.1: `input_values_used`, `strategy_selected`, `override_level_applied`, `source_version`) CUKUP untuk merekonstruksi rantai spesifik yang diminta founder.

| Elemen Rantai Founder | Tertangkap di Explanation Tree? |
|---|---|
| Material/Labor/Equipment/Subcontract breakdown | ✅ Ya — ini persis output Assembly Engine (CAP-003, Compositional formula class § A.1), setiap komponen adalah node AST terpisah dengan `input_values_used` sendiri |
| Risk | ✅ Ya — CAP-007 dipanggil sebagai Referential class (§ A.1), tercatat sebagai node dengan `source_version` merujuk Risk Register |
| Regional Index | ✅ Ya — persis contoh § H (`RegionalIndex(Location)`), tercatat `strategy_selected` + `source_version` |
| Company Adjustment | ✅ Ya — ini `override_level_applied` = "Company" (§ E.2 mencatat level yang dipakai) |
| Scenario Adjustment | ✅ Ya — `override_level_applied` = "Scenario" |
| Final (agregasi semua di atas) | ✅ Ya — node root Explanation Tree, hasil SUM (Aggregative class) dari seluruh node di bawahnya |

**Verdict: ✅ LULUS PENUH.** Struktur Explanation Tree yang sudah didesain § I.1 CUKUP menangkap seluruh rantai yang diminta founder tanpa perubahan — pengujian ini mengonfirmasi desain yang sudah ada, bukan menemukan gap.

---

## 7. Replay Validation

**Diuji dengan contoh konkret founder:** Estimate v1 tahun 2028, harus bisa dihitung ulang 5 tahun lagi (2033), hasil harus identik.

**Diverifikasi terhadap § J.3 (Replay) + § A.2 (side-effect free) + § C.5 (Cache Strategy versioned):**

**Rantai ketergantungan yang harus BENAR-BENAR immutable untuk Replay identik:**
```
Formula Definition v1 (§ K, immutable setelah Active) →
Price Book Entry versi yang dipakai saat itu (§ C.5, cache key memuat versi) →
Productivity Record versi yang dipakai saat itu →
Strategy yang dipilih saat itu (§ B.3, tercatat di Estimate Item) →
Override level yang aktif saat itu (§ E.2, tercatat)
```

**Diuji satu per satu:** Apakah kelima elemen ini DIJAMIN tidak berubah 5 tahun kemudian?
- Formula Definition v1 — ✅ immutable (§ K), TIDAK dihapus meski Superseded (§ M.2).
- Price Book Entry versi lama — ✅ Foundational Principle Ketiga menjamin riwayat tidak dihapus, hanya Expired (§ 6, Phase D Dependency Matrix CAP-004).
- Productivity Record versi lama — ✅ sama, § K.
- Strategy yang dipilih — ✅ tercatat di Estimate Item sebagai bagian dari Estimate Version yang frozen (CAP-008).
- Override level aktif — ✅ tercatat § E.2.

**Satu syarat implisit yang BELUM eksplisit di Phase E:** Replay 5 tahun kemudian mengasumsikan CALCULATION ENGINE ITU SENDIRI (implementasi eksekusi AST) berperilaku identik — Formula Language (§ A) sebagai SPESIFIKASI dijamin stabil (ia data, bukan kode, First Principle 4), tapi Phase E tidak eksplisit menyatakan bahwa Calculation Engine versi mendatang WAJIB tetap mampu mengeksekusi AST versi lama dengan hasil identik (backward-compatible interpreter). **Ini gap desain nyata** — tanpa jaminan ini, Replay bisa gagal bukan karena data berubah, tapi karena cara MENGEKSEKUSI AST berubah (mis. optimasi floating-point berbeda di versi Engine baru).

**Verdict Replay Validation: 🟡 LULUS DENGAN 1 GAP PENTING — Calculation Engine (implementasi, bukan spesifikasi Formula Language) harus dijamin backward-compatible untuk AST versi manapun yang pernah Active. Dicatat sebagai aturan tambahan wajib, bukan ACR (tidak mengubah capability, hanya menambah constraint implementasi untuk Phase F/implementasi nyata).**

---

## 8. Version Validation

**Diuji dengan contoh founder:** Formula berubah v1→v2→v3, Estimate lama TETAP memakai v1, tidak boleh otomatis berubah.

**Diverifikasi terhadap § J.2 (Formula Version & Migration):** Sudah eksplisit dinyatakan Phase E — "Estimate Item yang SUDAH dihitung dengan Formula versi lama TETAP merujuk versi lama itu (immutable historical record), TIDAK otomatis 'migrasi' ke versi baru. Formula Migration adalah operasi EKSPLISIT dan terpisah."

**Verdict: ✅ LULUS PENUH TANPA TEMUAN BARU.** Ini persis skenario yang sudah dijawab tuntas di § J.2 Phase E — pengujian mengonfirmasi, tidak menemukan gap.

---

## 9. Scenario Validation

**Diuji:** Scenario A/B/C harus benar-benar independen, bukan copy-paste.

**Diverifikasi terhadap Phase C.5 § A.9c + Phase E § H:** "Scenario adalah lapisan hasil kalkulasi paralel, bukan struktur domain yang diduplikasi" ([`03b`](03b-phase-c5-core-domain-discovery.md) § A.9c, dikonfirmasi ulang § 3 Skenario 3 di atas). Secara struktural: Scenario A/B/C berbagi Cost Code/CBS/WBS yang SAMA (Shared Kernel, [`03b`](03b-phase-c5-core-domain-discovery.md) § A.9c) tapi punya Estimate Version SENDIRI-SENDIRI — artinya Strategy/Override yang dipilih di Scenario A TIDAK PERNAH otomatis muncul di Scenario B kecuali dipilih ulang secara eksplisit di sana.

**Diuji lebih dalam — apakah ini "independen" secara TRUE, atau "independen" secara STRUKTUR TAPI SEBENARNYA COPY saat Scenario dibuat (`ScenarioBranched`, Domain Event dari Phase C.5)?** Ditelusuri: `ScenarioBranched` (dari Scenario existing) SECARA WAJAR mewarisi Estimate Item AWAL dari Scenario asal (supaya estimator tidak mulai dari nol saat membuat VE Scenario dari Tender Scenario) — TAPI begitu di-branch, keduanya menjadi Estimate Version TERPISAH yang masing-masing immutable secara independen (§ K). Perubahan pada Scenario B SETELAH branching TIDAK PERNAH menulis balik ke Scenario A.

**Verdict: ✅ LULUS — "copy saat branching" (pewarisan nilai awal) BUKAN "copy-paste" yang dikhawatirkan founder (dua Scenario yang secara struktural terikat/saling mempengaruhi) — begitu terbentuk, keduanya independen penuh. Direkomendasikan satu kalimat kejelasan ditambahkan ke Phase E § E.1 tentang perbedaan "pewarisan nilai awal saat branching" vs "independensi struktural setelahnya" — bukan perubahan desain.**

---

## 10. AI Boundary Validation

**Diuji:** AI boleh (rekomendasi/alternatif/optimasi), AI tidak boleh (hitung final/bypass formula/bypass audit/bypass replay).

**Diverifikasi terhadap § N (AI Tidak Pernah Menghitung Sendiri):**

| Boundary | Diuji Terhadap § N | Hasil |
|---|---|---|
| ✅ AI boleh memberi rekomendasi | "AI HANYA boleh beroperasi di TAHAP 1 (Input) dan TAHAP 6 (Recommendation)" | ✅ Eksplisit diizinkan |
| ✅ AI boleh memberi alternatif | Sama — Tahap 6 Recommendation mencakup penyajian alternatif Strategy (§ B.3) | ✅ Eksplisit diizinkan |
| ✅ AI boleh memberi optimasi | § L.3 Benchmark — AI (via CAP-012 Retrieval) bisa mengusulkan Strategy yang lebih akurat berdasar Benchmark historis | ✅ Eksplisit diizinkan, KONSISTEN dengan mekanisme Benchmark yang sudah ada |
| ❌ AI tidak boleh menghitung final | "AI TIDAK PERNAH boleh menyisipkan diri di TAHAP 3 (Calculation)" | ✅ Eksplisit dilarang |
| ❌ AI tidak boleh bypass formula | Alur DILARANG § N eksplisit: "AI langsung menghasilkan angka final ← TIDAK PERNAH SAH" | ✅ Eksplisit dilarang |
| ❌ AI tidak boleh bypass audit | Konsekuensi § N: kalau AI bypass CAP-006, "Audit Trail tidak punya tahap APPROVAL yang jelas" — dinyatakan sebagai ALASAN kenapa dilarang | ✅ Eksplisit dilarang, dengan alasan structural bukan cuma aturan sepihak |
| ❌ AI tidak boleh bypass replay | Konsekuensi § N: "Replay tidak mungkin dilakukan karena tidak ada pipeline deterministik" | ✅ Eksplisit dilarang, dengan alasan structural |

**Verdict: ✅ LULUS PENUH TANPA TEMUAN BARU.** Kedelapan sub-poin AI Boundary yang diminta founder SEMUANYA sudah eksplisit tercakup § N Phase E — pengujian ini konfirmasi murni.

---

## 11. Enterprise Readiness Validation (Calculation-Specific)

**Diuji:** Multi Currency/Tax/Company/AHSP/Standard/Country — apakah Calculation Strategy tetap bisa dipakai?

**Catatan penting:** Ini BERBEDA dari Enterprise Readiness Validation di Phase D.1 ([`05b`](05b-phase-d1-capability-validation-freeze.md) § 6) yang menguji CAPABILITY (siapa bertanggung jawab) — di sini yang diuji adalah apakah MEKANISME KALKULASI-nya (Formula Language, Strategy, Override) cukup generik menampung variasi ini.

| Skenario | Diuji Terhadap | Hasil |
|---|---|---|
| Multi Currency | § G (Currency Rules) — `CONVERT` built-in yang sama dengan Unit Conversion | ✅ Siap — sudah dirancang eksplisit sebagai kasus khusus § A.3, bukan mekanisme terpisah |
| Multi Tax | Tidak ada section eksplisit di Phase E untuk pajak | 🟡 Sama seperti gap yang sudah dicatat Phase D.1 (§6) — TAPI diuji lebih dalam di sini: SECARA STRUKTURAL, pajak bisa dimodelkan sebagai Formula Referential class (§ A.1) yang memanggil "Tax Rule" sebagai knowledge (mirip pola § H untuk Regional Index) — TIDAK butuh perubahan Formula Language. Gap-nya murni BELUM ada Tax Engine/knowledge source yang didefinisikan (itu domain/capability discovery, bukan calculation mechanism) — dicatat sebagai catatan silang ke Phase D.1 gap, bukan gap baru Phase E |
| Multi Company | Override Hierarchy § E.1 level 2 (Company) | ✅ Siap — sudah jadi bagian eksplisit hierarki |
| Multi AHSP (Government/Company/Vendor/dst) | § 2 di atas (Strategy Validation) | ✅ Siap — sudah diuji tuntas |
| Multi Standard (Bina Marga/Cipta Karya/dst) | Strategy `applicable_context` (§ B.2) bisa membawa "standard type" sebagai bagian konteks | ✅ Siap secara struktural — konsisten dengan requirement Puraloka Persada general contractor sejak Phase A |
| Multi Country | Formula Language sendiri (§ A) tidak berasumsi negara — tapi seperti Multi Tax, butuh knowledge source (Regional/National Reference Library) yang levelnya domain discovery | 🟡 Sama seperti Phase D.1 — mekanisme kalkulasi SIAP menampung, domain pendukungnya yang masih perlu diperluas (bukan blocker Phase E) |

**Verdict: ✅ LULUS DENGAN CATATAN SILANG (bukan gap baru) — mekanisme kalkulasi (Formula Language, Strategy, Override) SECARA STRUKTURAL sudah generik cukup menampung semua skenario; keterbatasan yang ada murni di level KETERSEDIAAN domain/knowledge source (sudah dicatat Phase D.1), bukan keterbatasan Calculation Architecture itu sendiri.**

---

## 12. Future-Proof Validation

**Diuji dengan contoh founder:** Tahun 2038 muncul Green Construction Index, Carbon Cost, Carbon Credit, ESG Cost, Digital Twin Cost, Robotic Productivity — apakah architecture masih bisa menerima?

**Diuji satu per satu terhadap mekanisme extensibility yang SUDAH ada (bukan spekulasi):**

| Konsep Masa Depan | Bisa Ditampung Tanpa Ubah Formula Language/Engine? | Mekanisme |
|---|---|---|
| Carbon Cost | ✅ Ya | Kelas formula BARU tidak dibutuhkan — Carbon Cost = Referential class (§ A.1) baru yang memanggil "Carbon Price Reference" sebagai knowledge, PERSIS pola Regional Index (§ H). Fungsi `CARBON_COST()` didaftarkan lewat mekanisme Extension Point (§ A.3) tanpa mengubah grammar inti |
| Carbon Credit | ✅ Ya | Sama — knowledge source baru + fungsi built-in baru, pola identik |
| ESG Cost | ✅ Ya | Sama pola — kemungkinan besar Compositional class (breakdown multi-komponen) mirip Assembly |
| Green Construction Index | ✅ Ya | Sama pola dengan Regional Cost Index (§ H) — index sebagai Referential class |
| Digital Twin Cost | ✅ Ya, DENGAN SATU CATATAN | Kalau Digital Twin berarti SUMBER DATA baru (BIM real-time) untuk `variable_ref` — sepenuhnya ditampung (Formula Language tidak peduli DARI MANA nilai variable berasal, § A.2 deklaratif). Kalau berarti PROSES kalkulasi baru yang fundamental berbeda (real-time streaming, bukan on-demand evaluate) — itu menyentuh asumsi Execution Pipeline (§ C) yang saat ini berbasis EIGHT-STAGE DISKRIT, bukan streaming kontinu. **Ini kandidat ACR paling nyata dari seluruh Future-Proof Validation** — dicatat eksplisit, TIDAK diajukan sekarang karena belum ada kebutuhan konkret, tapi ditandai sebagai risiko arsitektural jangka panjang paling signifikan. |
| Robotic Productivity | ✅ Ya | Ini persis Performance Knowledge (CAP-005) — robot sebagai jenis Resource baru di RBS (CAP-001), Productivity Record berlaku sama, tidak menyentuh Calculation Engine sama sekali |

**Verdict: ✅ LULUS untuk 5 dari 6 konsep — mekanisme Extension Point (§ A.3) + Referential class (§ A.1) + knowledge-as-data (First Principle 4) terbukti secara struktural menampung SEMUA konsep masa depan yang sifatnya "knowledge/reference baru". SATU catatan risiko jangka panjang dicatat (Digital Twin real-time streaming) sebagai potensi ACR MASA DEPAN, bukan sekarang — Execution Pipeline diskrit (§ C.1) diasumsikan cukup untuk horizon waktu yang bisa direncanakan hari ini.**

---

## 13. Performance Validation (Arsitektural, Bukan Benchmark Teknis)

**Diuji:** 120.000 Estimate Item, atau 50 Project bersamaan — apakah pipeline masih masuk akal secara arsitektural?

**Dianalisis terhadap desain yang sudah ada, TANPA mengklaim angka performa nyata (di luar cakupan Phase E, itu Phase F/implementasi):**

| Aspek | Analisis Arsitektural |
|---|---|
| Parallel Calculation (§ C.4) | Desain SUDAH mengantisipasi skala — evaluasi node independen dalam DAG (§ D) bisa diparalelkan; 120.000 Estimate Item yang MAYORITAS independen satu sama lain (beda CBS Node) secara struktural COCOK untuk paralelisasi masif |
| Cache Strategy (§ C.5) | Versioned cache key berarti Price Book/Productivity yang SAMA dipakai ribuan Estimate Item tidak perlu di-resolve ulang tiap kali — desain cache SUDAH `by design` mengurangi beban berulang, bukan ditambahkan belakangan sebagai optimasi |
| Explanation Tree untuk agregasi besar (temuan § 1 di atas) | INI TITIK RISIKO PALING NYATA — 120.000 Estimate Item yang masing-masing menghasilkan Explanation Tree penuh (§ I.1) berpotensi menghasilkan volume data penjelasan yang sangat besar. **Direkomendasikan (bukan ACR, murni penambahan aturan desain):** Explanation Tree untuk operasi Aggregative (SUM lintas item) menyimpan RINGKASAN (total per kategori + link ke Explanation Tree individual on-demand) bukan mengembangkan tree penuh semua 120.000 item sekaligus di setiap permintaan — pola "lazy expand" |
| 50 Project bersamaan | Karena Estimate Version terikat SATU Project/Scenario (CAP-008/009, boundary tegas Phase C.5), tidak ada shared mutable state ANTAR Project pada level Calculation Engine — 50 Project berjalan paralel secara struktural aman (tidak saling mengunci), CAP-001/CAP-004/CAP-005 (shared kernel/reference data) dibaca (read-only saat kalkulasi), bukan ditulis bersamaan |

**Verdict: ✅ LULUS SECARA ARSITEKTURAL, dengan 1 rekomendasi konkret (lazy-expand Explanation Tree untuk agregasi besar) — dicatat sebagai aturan desain tambahan di Freeze Checklist, bukan blocker.**

---

## 14. Calculation Constitution Validation

**Diuji:** SEMUA prinsip konstitusi dicek satu per satu terhadap Calculation Architecture.

| Prinsip | Diperiksa Terhadap | Hasil |
|---|---|---|
| Everything is Derived | § J.2 (Formula Migration eksplisit, tidak auto), Downstream Read-Model (RAB/RAP tetap derived, tidak disentuh Phase E) | ✅ Patuh |
| Everything is Versioned | § K (Formula Definition, Strategy, Explanation Tree) | ✅ Patuh |
| Explainability | § I, dikonfirmasi ulang § 6 di atas | ✅ Patuh |
| Single Source of Truth | § H (kontrak consumer, tidak ada capability lain yang punya logika kalkulasi sendiri) | ✅ Patuh, DIPERKUAT oleh Konstitusi Calculation Strategy sendiri |
| No Data Duplication | § C.5 (cache mereferensikan versi, tidak menyalin nilai Price Book/Productivity ke tempat lain) | ✅ Patuh |
| **AI Never Calculates** | § N, dikonfirmasi tuntas § 10 di atas | ✅ Patuh PENUH |
| **CAP-006 owns execution** | § pembuka poin 6 (Konstitusi Calculation Strategy) + § H (kontrak 8-elemen) | ✅ Patuh PENUH — ini konstitusi Phase E sendiri, secara definisi tidak mungkin gagal kecuali dokumen Phase E sendiri melanggarnya (tidak ditemukan pelanggaran internal) |
| Pluggable Strategy | § 2 di atas (Strategy Validation) | ✅ Patuh, dikonfirmasi tuntas |
| Deterministic Result | § 1 di atas (Formula Consistency) | 🟡 Patuh DENGAN KOREKSI (LOOKUP wajib EffectiveDate eksplisit — tanpa koreksi ini, determinism BISA dilanggar secara diam-diam) |
| Replayability | § 7 di atas | 🟡 Patuh DENGAN GAP (Calculation Engine implementasi harus backward-compatible — dicatat, bukan pelanggaran desain saat ini) |
| Auditability | § J.1, dikonfirmasi § 6 | ✅ Patuh |

**Pelanggaran ditemukan: TIDAK ADA.** Dua prinsip (Deterministic Result, Replayability) butuh SATU aturan tambahan masing-masing untuk benar-benar terjamin secara ketat — keduanya sudah didesain benar secara STRUKTURAL di Phase E, hanya perlu penegasan eksplisit tambahan (bukan redesign) untuk menutup celah implisit yang ditemukan pengujian ini.

**Verdict Calculation Constitution Validation: ✅ LULUS PENUH — tidak ada pelanggaran yang memicu ACR. Dua penegasan tambahan diperlukan (dicatat § 15), tidak satupun memenuhi ambang "capability/domain frozen tidak cukup" yang menjadi syarat ACR (§ Aturan Governing Phase E poin 4).**

---

## 15. Freeze Checklist — Konsolidasi Seluruh Temuan

| # | Temuan | Jenis | Tindakan |
|---|---|---|---|
| 1 | `LOOKUP` terhadap knowledge ter-versi (Price Book/Productivity) harus WAJIB menyertakan titik waktu eksplisit (`EffectiveDate`), tidak boleh implisit "sekarang" | Koreksi aturan | Ditambahkan ke § A.3 Phase E sebagai constraint eksplisit |
| 2 | Istilah "AI Formula" dalam Strategy Pattern HANYA sah bermakna "AST yang kontennya diusulkan AI, tetap dieksekusi normal CAP-006" — TIDAK BOLEH bermakna "strategy yang memanggil model AI saat runtime" | Klarifikasi istilah | Ditambahkan ke § B Phase E sebagai catatan definisi |
| 3 | Contoh konkret "Company Override berlaku per-Resource, bukan blanket" perlu digarisbawahi eksplisit di § E.2 | Kejelasan dokumentasi | Ditambahkan sebagai contoh di § E.2 |
| 4 | Posisi "AI Recommendation" dalam urutan override — perlu satu kalimat penegasan bahwa itu urutan ALUR KERJA (saran untuk Manual), bukan LEVEL RESOLUSI OTOMATIS keenam | Kejelasan dokumentasi | Ditambahkan ke § E.1 |
| 5 | Perilaku evaluasi graph saat satu node gagal (mis. `LOOKUP` tidak menemukan entry valid) belum didesain eksplisit | Gap desain | Ditambahkan sebagai § C.3 baru: node gagal ditandai error, TIDAK menggagalkan seluruh Estimate Item kecuali node itu ada di jalur dependency menuju root yang diminta — evaluasi node lain yang independen tetap lanjut |
| 6 | Unit Compatibility Check tidak eksplisit ada di grammar/parse-time validation — `5 kg + 3 m²` harus gagal di parse-time | Gap desain nyata | Ditambahkan sebagai baris baru di tabel § A.5 Phase E |
| 7 | Calculation Engine (implementasi eksekusi AST) harus dijamin backward-compatible untuk AST versi manapun yang pernah Active — prasyarat Replay jangka panjang | Gap desain penting | Ditambahkan sebagai constraint baru di § J.3 Phase E |
| 8 | "Copy saat branching" (pewarisan nilai awal Scenario) perlu dibedakan eksplisit dari "independensi struktural setelahnya" | Kejelasan dokumentasi | Ditambahkan ke § E.1 (dekat pembahasan Scenario Override) |
| 9 | Explanation Tree untuk operasi Aggregative skala besar (120.000+ item) perlu pola "lazy expand" (ringkasan + link on-demand), bukan tree penuh selalu dikembangkan | Rekomendasi performa arsitektural | Ditambahkan sebagai catatan di § I Phase E |
| 10 | Digital Twin Cost (real-time streaming) berpotensi menyentuh asumsi Execution Pipeline delapan-tahap diskrit — **kandidat ACR paling nyata**, TIDAK diajukan sekarang | Risiko jangka panjang, dicatat | TIDAK ada tindakan sekarang — dicatat sebagai watch-item untuk Phase J (Future Vision) |

**Sembilan dari sepuluh temuan diselesaikan sebagai penambahan aturan/klarifikasi pada Phase E (TIDAK membutuhkan ACR — semuanya diselesaikan dalam batas Calculation Architecture yang sudah frozen, tidak menyentuh Capability/Domain).** Satu temuan (Digital Twin, #10) dicatat sebagai risiko masa depan tanpa tindakan sekarang.

**TIDAK ADA ACR yang diajukan** — konsisten dengan hasil § O (Log ACR) Phase E asli yang sudah menyatakan tidak ada kebutuhan perubahan baseline.

---

## 🔒 CALCULATION FREEZE

Berdasarkan 14 validasi § 1-14 di atas, **Calculation Architecture (Phase E) dinyatakan FREEZE** dengan 9 penambahan aturan/klarifikasi diterapkan ke [`06-phase-e-calculation-strategy.md`](06-phase-e-calculation-strategy.md) (lihat § 15 untuk daftar lengkap) — seluruhnya penguatan dokumentasi/aturan implementasi, TIDAK ADA yang mengubah struktur Capability, Domain, atau Konstitusi Calculation Strategy yang sudah dikunci.

**Artinya bagi Phase F dan seterusnya:**

> **Phase F must not redesign the Calculation Strategy. The Calculation Strategy is frozen after Phase E.1. Phase F is only allowed to map the frozen calculation architecture into an enterprise data model. If a data-model limitation requires changing the calculation architecture, the process must stop, an Architecture Change Request (ACR) must be created, and explicit approval must be obtained before modifying the frozen baseline.**

Pola aturan governing tiga-lapis yang sekarang konsisten di seluruh roadmap:
- **Phase D tidak boleh mengubah Domain** (dikunci [`03b`](03b-phase-c5-core-domain-discovery.md) § 🔒 FREEZE, ditegaskan ulang § D.1).
- **Phase E tidak boleh mengubah Capability** (dikunci [`05b`](05b-phase-d1-capability-validation-freeze.md) § 🔒 CAPABILITY FREEZE, ditegaskan § Aturan Governing Phase E poin 1).
- **Phase F tidak boleh mengubah Calculation Strategy** (dikunci di sini, § 🔒 CALCULATION FREEZE).

Phase F sekarang murni menjawab: bagaimana seluruh domain (Phase C.5), capability (Phase D/D.1), dan calculation architecture (Phase E/E.1) yang sudah frozen dimodelkan menjadi **Entity, Aggregate Root, Value Object, Repository, Reference Data, Master Data, Transaction Data, Derived Data, Audit Data, Historical Data, Versioned Data** — bukan lagi pertanyaan "apa" atau "bagaimana menghitung", murni "bagaimana disimpan dan direpresentasikan".

---

## Assumptions

1. Sembilan penambahan aturan (§ 15) diasumsikan CUKUP diselesaikan sebagai revisi dokumentasi Phase E tanpa perlu approval terpisah per-item — karena semuanya murni memperjelas/memperketat desain yang sudah ada, bukan mengubah struktur. Kalau founder menilai satu di antaranya sebenarnya cukup signifikan untuk butuh persetujuan terpisah (khususnya #6 Unit Compatibility Check dan #7 Backward-compatible Engine), itu bisa diangkat eksplisit sebelum Freeze final.
2. Watch-item Digital Twin Cost (#10) diasumsikan tidak mendesak — kalau founder punya timeline konkret kapan CECEP perlu mendukung real-time streaming data (BIM live), ini perlu diangkat lebih awal dari Phase J.

## Open Questions

1. Untuk temuan #7 (Calculation Engine harus backward-compatible untuk Replay jangka panjang) — apakah founder ingin ini dijadikan requirement eksplisit untuk Phase F (Enterprise Data Model perlu menyimpan versi AST dengan cukup detail untuk interpreter lama tetap bisa jalan), atau cukup dicatat sebagai prinsip implementasi untuk fase jauh lebih hilir (Phase K/L)?
2. Untuk klarifikasi "AI Formula" (#2) — apakah pembatasan ini (AI hanya mengusulkan KONTEN AST, tidak pernah jadi strategy runtime-inference) sudah sesuai visi AI Estimation founder, atau ada skenario spesifik di mana model AI runtime (bukan AST) memang diinginkan di masa depan (yang berarti butuh ACR eksplisit nanti)?

## Required Decisions (Approval Gate)

1. Apakah 14 validasi (§ 1-14) sudah cukup dalam sebagai quality gate untuk Calculation Architecture, sesuai standar yang diminta founder?
2. Apakah 9 penambahan aturan (§ 15) sudah tepat, atau ada yang perlu direvisi/ditambah sebelum diterapkan ke Phase E?
3. Apakah watch-item Digital Twin Cost (temuan #10) cukup dicatat tanpa tindakan sekarang, atau perlu eskalasi lebih awal?
4. Apakah Phase E.1 sekarang siap ditutup, Calculation Architecture di-FREEZE, dan lanjut ke **Phase F (Enterprise Data Model)**?

---

## 🚦 APPROVAL GATE

Phase E.1 (Calculation Validation & Freeze) selesai — 14 validasi dijalankan dengan pengujian konkret (bukan checklist administratif), 9 penambahan aturan diidentifikasi untuk memperkuat Phase E, 1 watch-item jangka panjang dicatat, TIDAK ADA ACR diajukan. **STOP** — menunggu approval eksplisit sebelum Calculation Freeze final dan lanjut ke **Phase F (Enterprise Data Model)**.

*Dokumen selanjutnya (setelah approval): Phase F — Enterprise Data Model.*
