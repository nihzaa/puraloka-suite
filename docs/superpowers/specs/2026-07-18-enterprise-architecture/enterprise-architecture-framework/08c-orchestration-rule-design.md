# CECEP — Orchestration Rule Design

**⚠️ STATUS: SUPERSEDED oleh [`08c v2`](08c-orchestration-rule-design-v2.md).** Dokumen ini ditulis SEBELUM rantai discovery fundamental yang seharusnya mendahuluinya — Rule Taxonomy ([`08d`](08d-rule-taxonomy-discovery.md)), Rule Meta Model ([`08e`](08e-rule-meta-model-discovery.md)), Rule Storage Philosophy ([`08f`](08f-rule-storage-philosophy.md)), Information Classification/Characteristic ([`08g`](08g-information-classification-discovery.md)/[`08h`](08h-information-characteristic-discovery.md)), dan Rule Ontology Validation ([`08i`](08i-rule-ontology-validation.md)). Empat Rule konkret (§ B) dan kesimpulan Hybrid (§ D) di bawah digantikan versi yang diperkaya di `08c v2` — logic bisnisnya TIDAK berubah, hanya metadata dan alasan strukturalnya. Dipertahankan di sini sebagai jejak historis (Historical Data, [`07`](../CECEP/07-phase-f-enterprise-data-model.md) § A) — BUKAN dihapus, karena tetap berguna untuk melihat proses yang mendorong founder menemukan gap ini.

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Melanjutkan Phase G — Design di atas Enterprise Orchestration Philosophy yang sudah 🔒 FREEZE dan tervalidasi ([`08a`](08a-enterprise-orchestration-philosophy.md), [`08b`](08b-phase-g0-orchestration-philosophy-validation.md)). **Bukan approval gate berdiri sendiri** — dokumen kerja yang mengikuti pola Design di fase-fase sebelumnya (Phase D § E-F, Phase E § A-O), akan divalidasi kolektif nanti di Phase G.1.

## Reframing yang Mengikat Dokumen Ini (koreksi founder)

**Fokus BUKAN "menjawab satu keputusan"** — fokusnya adalah **merancang Orchestration Rule System**: mesin yang mampu mengeksekusi banyak keputusan (berpotensi ratusan Rule) dengan prinsip yang sama. Istilah "Titik Keputusan Tunggal" ([`08`](08-phase-g-enterprise-orchestration-architecture.md) § H) tidak dipakai lagi mulai dokumen ini. `EstimateVersionApproved` tetap dipakai sebagai **kasus utama** untuk menguji sistem yang dirancang (karena ia event paling sentral, [`08`](08-phase-g-enterprise-orchestration-architecture.md) § F.3) — tapi hasil dokumen ini harus generatif: pola yang sama harus bisa dipakai untuk merancang Rule bagi event LAIN tanpa desain ulang.

**Aturan governing yang tetap mengikat (diwarisi utuh dari Philosophy, tidak diulang detailnya di sini):**
- Setiap Rule WAJIB lolos Architecture Decision Checklist ([`04`](../CECEP/04-architecture-constitution.md) § 12) DAN Decision Checklist khusus Orchestration ([`08a`](08a-enterprise-orchestration-philosophy.md) § H).
- Setiap Rule WAJIB mengikuti struktur data § I, Lifecycle § J, Versioning § K, Failure Philosophy § L, Determinism § M — semua dari [`08a`](08a-enterprise-orchestration-philosophy.md).
- Kalau Design menemukan kebutuhan mengubah Philosophy/Domain/Capability/Calculation/Information yang frozen: berhenti, ajukan ACR, jangan lanjut sebelum approval.

---

## A. Kerangka Umum — Bagaimana Sistem Rule Bekerja untuk Event Apapun

**Sebelum merancang Rule konkret untuk `EstimateVersionApproved`, pola generik dikunci dulu — supaya Rule berikutnya (untuk event lain) tinggal mengisi pola ini, bukan mendesain ulang dari nol:**

```
1. Event terjadi (Producer capability memancarkan, `08` § A)
        ↓
2. Rule Engine mencari SEMUA Rule dengan trigger = event ini,
   status Published (`08a` § J), dan Scope yang cocok dengan konteks
   event (`08a` § Q — resolusi paling spesifik menang)
        ↓
3. Untuk Rule yang ditemukan: evaluasi condition (`08a` § I) —
   HANYA Rule yang condition-nya TRUE yang lanjut ke langkah 4
        ↓
4. Urutan eksekusi ditentukan Dependency (`08a` § O) — Rule dengan
   depends_on dieksekusi setelah Rule yang menjadi prasyaratnya;
   Rule independen berjalan PARALEL (default, `08a` § P)
        ↓
5. Setiap Rule memanggil Capability lewat action (`08a` § D — Orchestrator
   TIDAK PERNAH mengeksekusi sendiri, murni memanggil kontrak yang sudah ada)
        ↓
6. Kegagalan ditangani sesuai failure_policy, diturunkan dari Criticality
   event (`08` § E, `08a` § L) — TIDAK PERNAH Rollback level-data
        ↓
7. Rule Explanation dibangun otomatis dari eksekusi (`08a` § R)
        ↓
8. Hasil (sukses/gagal per Rule) tercatat sebagai Audit + memicu
   Domain Event turunan jika relevan (mis. `MaterialRequirementGenerated`,
   kandidat event baru — lihat § E di bawah)
```

**Ini BUKAN desain baru dari nol** — pola delapan-langkah ini adalah PERWUJUDAN LANGSUNG dari sembilan belas section Philosophy yang sudah dikunci, dirangkai jadi satu alur eksekusi. Setiap langkah merujuk balik ke section Philosophy yang menjadi dasarnya.

---

## B. Rule Konkret — Kasus Uji `EstimateVersionApproved`

**Metodologi:** Founder sebelumnya memberi contoh nyata variasi kebijakan antar perusahaan (Generate RAP dulu vs Material Requirement dulu vs Purchase Requisition dulu vs Budget Revision dulu vs kombinasi sekaligus). Karena TIDAK ADA satu urutan yang secara arsitektural benar untuk semua perusahaan ([`08a`](08a-enterprise-orchestration-philosophy.md) § D, dikonfirmasi ulang [`08b`](08b-phase-g0-orchestration-philosophy-validation.md) § 8), Rule Design di sini menghasilkan **Rule Template default untuk Puraloka Persada** (Company Rule, Scope § Q) — bukan mengklaim satu jawaban universal.

### B.1 Rule-001 — Generate RAP Draft

```
Rule-001 {
  id:              RULE-001
  display_name:    "Generate RAP Draft setelah Estimate Approved"
  purpose:         "Menyediakan draft RAP otomatis begitu Estimate Version disetujui,
                     supaya PM tidak mulai dari nol saat menyusun rencana pelaksanaan"
  owner:           Tim Cost Engineering (perancang Rule, BUKAN pemilik data CAP-008)
  category:        "Estimate Approval Flow"
  created_by:      [diisi saat implementasi]
  created_at:      [diisi saat implementasi]
  current_status:  Draft (§ J — harus lolos Testing dulu sebelum Published)
  current_version: v1

  trigger:         EstimateVersionApproved
  condition:       true (tidak ada syarat tambahan — SELALU jalan begitu Estimate Approved)
  action:          Panggil CAP-008 untuk membaca Estimate Item yang Approved →
                    panggil CAP-013 (Integration Gateway) untuk menerjemahkan ke
                    format RAP draft (BELUM ada — lihat Open Question § F)
  failure_policy:  Criticality High (§ D Phase G — RAP draft penting tapi bisa dikoreksi
                    dalam waktu wajar, bukan Critical) → Retry otomatis, Compensation
                    kalau retry habis (§ L Philosophy)
  timeout:         [belum ditentukan nilai default — lihat Open Question § F]
  depends_on:      [] (tidak bergantung Rule lain — independen, jalan paralel dengan
                    Rule-002/003 di bawah)
  priority:        [tidak perlu — default paralel, § P]
}
```

### B.2 Rule-002 — Generate Material Requirement Draft

```
Rule-002 {
  id:              RULE-002
  display_name:    "Generate Material Requirement Draft setelah Estimate Approved"
  purpose:         "Menyiapkan draft kebutuhan material dari Estimate Item yang Approved,
                     mempercepat proses procurement"
  owner:           Tim Cost Engineering
  category:        "Estimate Approval Flow"
  current_status:  Draft
  current_version: v1

  trigger:         EstimateVersionApproved
  condition:       Estimate Item memuat Resource kategori Material (RBS, CAP-001) —
                    Rule TIDAK jalan kalau Estimate murni jasa/labor tanpa material
  action:          Panggil CAP-008 (baca Estimate Item) → panggil CAP-013 (terjemahkan
                    ke Material Requirement existing Puraloka Suite — Orchestration
                    Gap-1, [`07c`](../CECEP/07c-orchestration-readiness-assessment.md) § E)
  failure_policy:  Criticality High → Retry + Compensation
  timeout:         [belum ditentukan — Open Question § F]
  depends_on:      [] (independen dari Rule-001, boleh paralel)
  priority:        [default paralel]
}
```

### B.3 Rule-003 — Generate Cashflow Baseline

```
Rule-003 {
  id:              RULE-003
  display_name:    "Generate Cashflow Baseline setelah Estimate Approved"
  purpose:         "Membentuk proyeksi Cashflow awal dari Estimate Version yang Approved,
                     untuk kebutuhan keputusan operasional PM/Direktur"
  owner:           Tim Cost Engineering
  category:        "Estimate Approval Flow"
  current_status:  Draft
  current_version: v1

  trigger:         EstimateVersionApproved
  condition:       true
  action:          Panggil CAP-008 (baca Estimate Item + termin) → panggil CAP-013
                    (terjemahkan ke Cashflow Baseline existing Puraloka Suite —
                    Orchestration Gap-2, [`07c`](../CECEP/07c-orchestration-readiness-assessment.md) § E)
  failure_policy:  Criticality Medium (§ D Phase G — Cashflow proyeksi, bukan komitmen
                    finansial final, boleh diperbaiki lebih longgar) → Retry otomatis
  timeout:         [belum ditentukan — Open Question § F]
  depends_on:      [] (independen — TAPI lihat catatan Cache Strategy § D di bawah)
  priority:        [default paralel]
}
```

### B.4 Rule-004 — Notifikasi Approval (Contoh Rule Sederhana, Bukan Bagian Orchestration Gap)

```
Rule-004 {
  id:              RULE-004
  display_name:    "Notifikasi Estimate Approved ke PM"
  purpose:         "Memberitahu PM bahwa Estimate Version sudah disetujui"
  owner:           Tim Product/UX
  category:        "Notification Flow"
  current_status:  Draft
  current_version: v1

  trigger:         EstimateVersionApproved
  condition:       true
  action:          Panggil sistem Notifikasi existing Puraloka Suite (bukan Orchestration
                    Gap — notifikasi SUDAH ada, [`00`](../CECEP/00-phase-a-repository-discovery.md) § Notification System)
  failure_policy:  Criticality Low (§ D Phase G — kegagalan notifikasi tidak fatal,
                    "bisa retry besok" contoh founder) → Retry longgar
  timeout:         [belum ditentukan]
  depends_on:      []
  priority:        [default paralel]
}
```

**Kenapa Rule-004 disertakan (di luar tiga Rule "berat" B.1-B.3):** Membuktikan pola generik (§ A) berlaku untuk Rule RINGAN sekaligus BERAT — Rule-004 tidak menyentuh Orchestration Gap sama sekali (notifikasi sudah ada), murni contoh event yang sama memicu Rule dengan Criticality jauh lebih rendah. Ini menegaskan Rule System bekerja untuk SPEKTRUM kepentingan, bukan hanya kasus rumit.

---

## C. Menjawab Pertanyaan Founder — Urutan Proses Pasca-`EstimateVersionApproved`

**Bukan satu jawaban tunggal (konsisten reframing § pembuka) — jawabannya adalah STRUKTUR yang dihasilkan Rule Design di atas:**

Keempat Rule (B.1-B.4) trigger PADA event yang SAMA (`EstimateVersionApproved`) dan **TIDAK PUNYA dependency satu sama lain** — artinya defaultnya **PARALEL** (`08a` § P): RAP Draft, Material Requirement Draft, Cashflow Baseline, dan Notifikasi SEMUA mulai diproses BERSAMAAN begitu event terjadi, bukan berurutan.

**Kenapa ini jawaban yang tepat (bukan sekadar default teknis):** Founder sendiri memberi contoh "ada perusahaan yang Generate RAP dulu, ada yang Material Requirement dulu" — INI JUSTRU BUKTI bahwa TIDAK ADA urutan yang benar secara universal, artinya default paralel (tanpa urutan buatan) adalah pilihan yang PALING NETRAL terhadap perbedaan kebijakan antar perusahaan. Kalau Puraloka Persada SUATU SAAT butuh urutan tertentu (mis. Cashflow Baseline harus menunggu RAP selesai dulu karena datanya dipakai), itu ditambahkan sebagai `depends_on` eksplisit di Rule terkait — bukan asumsi default.

---

## D. Menjawab Pertanyaan Founder — Lazy/Eager/Hybrid untuk Derived Read-Model

**Diputuskan berdasarkan Rule Design di atas, bukan diasumsikan di muka:**

| Read-Model | Rule Terkait | Keputusan | Alasan |
|---|---|---|---|
| RAP Draft | Rule-001 | **Eager** (dibangkitkan proaktif saat event terjadi) | PM butuh draft SEGERA setelah Approved untuk mulai kerja — menunggu lazy (baru dibangkitkan saat dibuka) akan menunda kerja lapangan |
| Material Requirement Draft | Rule-002 | **Eager** | Sama alasan — procurement butuh mulai proses secepat mungkin, keterlambatan berarti keterlambatan pengadaan material nyata |
| Cashflow Baseline | Rule-003 | **Eager, TAPI dengan Cache Strategy yang lebih longgar** | Cashflow dibutuhkan untuk keputusan operasional (bukan real-time), Criticality Medium (bukan High seperti RAP/MR) — dibangkitkan eager tapi BOLEH memakai Cache Strategy versioned yang sudah ada (`06` § C.5) untuk menghindari re-generate berlebihan kalau Estimate Version tidak berubah |
| RAB (untuk perbandingan) | — (tidak ada Rule eksplisit) | **Lazy** (tetap, tidak berubah) | RAB TIDAK dianalisis butuh proaktif — ia proyeksi murni yang dihitung ulang kapan saja (`07` § A, Derived Data) tanpa proses orkestrasi apa pun yang "membangkitkannya" — konsisten dengan desain awal yang sudah benar sejak Phase F |
| EVM Baseline | — | **Lazy** (tetap, tidak berubah) | Sama alasan dengan RAB |

**Kesimpulan: HYBRID** — bukan satu jawaban seragam untuk semua Derived Read-Model. Perbedaan ditentukan oleh SEBERAPA SEGERA read-model itu dibutuhkan untuk keputusan operasional nyata (RAP/MR/Cashflow = segera dibutuhkan, dibangkitkan eager lewat Rule eksplisit) vs read-model yang murni analitik/perbandingan (RAB/EVM = dihitung sesuai permintaan, tetap lazy).

---

## E. Domain Event Baru yang Muncul dari Rule Design

**Konsisten dengan langkah 8 pola generik (§ A) — setiap Rule yang berhasil memicu Domain Event turunan, dicatat sebagai perluasan Enterprise Event Catalog ([`08`](08-phase-g-enterprise-orchestration-architecture.md) § A):**

| Event Baru | Dipicu Oleh Rule | Jenis (§ C Phase G) | Consumer |
|---|---|---|---|
| `MaterialRequirementDraftGenerated` | Rule-002 | Integration Event (jenis yang SEBELUMNYA kosong di Catalog, § C Phase G — sekarang terisi) | Tim Procurement (via sistem existing) |
| `CashflowBaselineGenerated` | Rule-003 | Integration Event | Tim Finance (via sistem existing) |
| `RapDraftGenerated` | Rule-001 | Integration Event | PM |

**Temuan penting:** Ketiga event baru ini SEMUANYA jatuh ke kategori **Integration Event** — jenis yang di Phase G Discovery ([`08`](08-phase-g-enterprise-orchestration-architecture.md) § C) tercatat "belum ada satu pun event nyata di katalog" sebagai konfirmasi Orchestration Gap. **Rule Design ini adalah titik pertama yang benar-benar MENGISI kekosongan itu** — bukan lagi observasi gap, tapi mulai jadi definisi konkret.

---

## F. Open Questions yang TIDAK Diselesaikan di Sini (Butuh Keputusan Lebih Lanjut)

**Konsisten disiplin yang sudah dipegang sejak Orchestration Readiness Assessment — beberapa hal SENGAJA tidak dijawab di sini, dicatat eksplisit sebagai pending:**

1. **Nilai Timeout konkret** untuk Rule-001/002/003/004 — Philosophy mengunci KEWAJIBAN timeout eksplisit ([`08a`](08a-enterprise-orchestration-philosophy.md) § G), tapi nilai numeriknya (5 menit? 1 jam? 1 hari?) butuh masukan operasional yang belum tersedia di level perencanaan arsitektur.
2. **Bentuk konkret Integration Gateway (CAP-013) untuk Rule-001/002/003** — Rule ini MEMANGGIL CAP-013 untuk menerjemahkan ke Procurement/Cashflow existing, tapi BAGAIMANA CAP-013 melakukan itu (format data, protokol) adalah pekerjaan Phase H (Integration, hasil relabel — lihat [`09`](09-cecep-architecture-readiness-review-v2.md)), bukan Rule Design ini. Rule Design hanya menetapkan BAHWA CAP-013 dipanggil di titik ini, KAPAN, dan dengan Criticality/Failure Policy apa.
3. **Skema pasti tiga event baru** (§ E) — nama sudah diusulkan, Payload Contract-nya (rujukan Canonical Information Contract yang relevan) belum didesain penuh, menunggu Phase H (Integration) mendefinisikan bentuk data yang dipertukarkan dengan sistem existing.

**Ketiganya BUKAN kandidat ACR** — semuanya keputusan implementasi/Integration yang secara sah menunggu fase yang tepat, bukan pertanyaan yang seharusnya sudah terjawab di Rule Design tingkat arsitektur.

---

## G. Verifikasi Checklist — Empat Rule Contoh Diuji Terhadap Philosophy

**Sampel verifikasi (Rule-001) terhadap Decision Checklist khusus Orchestration ([`08a`](08a-enterprise-orchestration-philosophy.md) § H, sebelas pertanyaan) — bukti bahwa pola Rule Design ini benar-benar dipandu Philosophy, bukan ditulis bebas:**

| # | Pertanyaan § H | Rule-001 |
|---|---|---|
| 1 | Menjawab KAPAN, bukan APA hasilnya? | ✅ Ya — Rule menjawab "kapan RAP draft dibangkitkan", tidak menghitung isi RAP sendiri |
| 2 | Memanggil lewat Dependency Matrix? | ✅ Ya — memanggil CAP-008 lewat kontrak yang sudah ada |
| 3 | Angka dirutekan lewat CAP-006? | N/A — Rule ini tidak melibatkan kalkulasi baru, murni transformasi data yang sudah dihitung |
| 4 | Data memakai Canonical Information Contract? | ✅ Ya — Estimate Item Contract ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § C.2) |
| 5 | Menyimpan state sendiri? | ✅ Tidak — status hanya merujuk balik ke Estimate Version yang sudah ada |
| 6 | Failure policy konsisten Criticality? | ✅ Ya — High, sesuai § D Phase G |
| 7 | Idempotent? | ✅ Ya — menjalankan ulang Rule-001 untuk Estimate Version yang sama menghasilkan RAP Draft yang SAMA (Determinism, § M) |
| 8 | Urutan konsisten Dependency Graph? | ✅ Ya — tidak ada dependency, jalan independen |
| 9 | Di-versioned sebagai Configuration Data? | ✅ Ya — `version: v1` |
| 10 | Timeout eksplisit? | 🟡 BELUM — dicatat Open Question § F |
| 11 | Tidak diam-diam memberi CAP-010 tanggung jawab di luar Boundary? | ✅ Ya — CAP-010 tidak terlibat di Rule ini sama sekali |

**Hasil: 10 dari 11 lolos, satu (Timeout) eksplisit ditandai belum lengkap — konsisten § F, bukan disembunyikan.** Rule-001 TIDAK BOLEH naik status ke Approved (§ J Philosophy) sampai Timeout ditentukan — aturan ini sendiri adalah bukti checklist benar-benar dipakai sebagai gerbang, bukan formalitas.

---

## Assumptions

1. Owner/Criticality/Scope pada keempat Rule contoh (§ B) adalah PENEMPATAN AWAL berdasarkan penalaran arsitektural (mis. Notifikasi = Low Criticality mengikuti pola sudah ada) — belum divalidasi eksplisit oleh founder per-Rule, hanya konsisten pola yang sudah dikunci.
2. Keputusan Hybrid lazy/eager (§ D) mengasumsikan RAP/Material Requirement/Cashflow BUTUH kesegeraan operasional — kalau founder menilai salah satu dari ketiganya sebenarnya cukup lazy, keputusan itu bisa direvisi tanpa mengubah Philosophy (murni keputusan Rule Design, bukan prinsip).

## Open Questions

(Sudah didaftar lengkap di § F — Timeout, bentuk konkret CAP-013, skema Payload Contract event baru — semuanya SENGAJA ditunda ke fase yang tepat, bukan diselesaikan di sini.)

## Status

**Empat Rule contoh dirancang** (Rule-001 s.d. Rule-004) sebagai bukti Orchestration Rule System bekerja — mencakup kasus BERAT (Orchestration Gap-1/Gap-2) dan RINGAN (notifikasi), semuanya lolos checklist Philosophy dengan satu gap eksplisit (Timeout) yang dicatat jujur. Pertanyaan Urutan Proses (§ C) dan Lazy/Eager/Hybrid (§ D) TERJAWAB lewat STRUKTUR Rule, bukan jawaban tunggal terpisah. Tiga Domain Event baru diusulkan (§ E), mengisi kekosongan Integration Event yang sebelumnya kosong di Catalog.

**Bukan gate — dokumen kerja.** Lanjut ke Phase G.1 (Rule Design Validation & Freeze) kapan pun founder siap, tanpa menunggu approval eksplisit terhadap dokumen ini sendiri (konsisten prinsip "gate hanya untuk keputusan yang mengubah baseline", [`09`](09-cecep-architecture-readiness-review-v2.md)).
