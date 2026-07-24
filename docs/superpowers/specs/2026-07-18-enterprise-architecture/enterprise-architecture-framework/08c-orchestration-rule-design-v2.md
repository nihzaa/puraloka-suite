# CECEP — Orchestration Rule Design v2

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Melanjutkan Phase G — Design di atas Enterprise Orchestration Philosophy yang 🔒 FREEZE ([`08a`](08a-enterprise-orchestration-philosophy.md), tervalidasi [`08b`](08b-phase-g0-orchestration-philosophy-validation.md)) DAN di atas rantai discovery lengkap [`08d`](08d-rule-taxonomy-discovery.md) (Taxonomy) → [`08e`](08e-rule-meta-model-discovery.md) (Meta Model) → [`08f`](08f-rule-storage-philosophy.md) (Storage Philosophy) → [`08g`](08g-information-classification-discovery.md)/[`08h`](08h-information-characteristic-discovery.md) (Information Classification/Characteristic) → [`08i`](08i-rule-ontology-validation.md) (Ontology Validation) → [`08j`](08j-discovery-completion-assessment.md) (Discovery Completion Assessment — dinyatakan tuntas). Menggantikan [`08c`](08c-orchestration-rule-design.md) v1 (ditahan, dipertahankan sebagai jejak historis).

**Bukan approval gate berdiri sendiri** — dokumen kerja, divalidasi kolektif di Phase G.1 bersama seluruh Design lain.

---

## A. Kerangka Umum — Bagaimana Sistem Rule Bekerja untuk Event Apapun

**Pola generik v1 (delapan langkah) tetap valid secara struktural — direvisi pada dua titik untuk mengakomodasi trigger yang diperluas (`08e` § D) dan Rule Group (`08e` § C):**

```
1. Event/Signal terjadi — Domain Event (Producer capability, `08` § A) ATAU
   System Signal (kondisi internal Layer 5, mis. antrian/kegagalan berulang —
   perluasan trigger_type dari `08e` § D)
        ↓
2. Rule Engine mencari SEMUA Rule Instance dengan trigger cocok, status
   Published (`08a` § J), dan Scope yang cocok konteks (`08a` § Q — resolusi
   paling spesifik menang, SETELAH resolusi Template→Instance, `08f` § C)
        ↓
3. Untuk Rule yang ditemukan: evaluasi condition (`08a` § I) — HANYA Rule
   yang condition-nya TRUE lanjut ke langkah 4
        ↓
4. Urutan eksekusi ditentukan Dependency (`08a` § O) — Rule dengan depends_on
   dieksekusi setelah prasyaratnya; Rule independen berjalan PARALEL (default,
   `08a` § P)
        ↓
5. Setiap Rule memanggil Capability lewat action (`08a` § D) — TIDAK PERNAH
   mengeksekusi sendiri
        ↓
6. Kegagalan ditangani sesuai failure_policy, diturunkan dari Criticality
   event (`08` § E, `08a` § L) — TIDAK PERNAH Rollback level-data
        ↓
6a. [BARU] Rule Group evaluation — kalau SEMUA Rule dalam satu Rule Group
    (kumpulan Rule ber-trigger sama, `08e` § C) gagal total, Recovery Rule
    (trigger: system_signal "Rule Group X gagal total") dipicu sebagai
    Rule terpisah, bukan bagian failure_policy Rule individual
        ↓
7. Rule Explanation dibangun otomatis (`08a` § R) — mode Retrieve/Recompute
   tergantung Classification hasil action (`08h` § C.2, lihat § D di bawah)
        ↓
8. Hasil tercatat sebagai Audit + memicu Domain Event turunan jika relevan
```

**Revisi dari v1:** Langkah 2 sekarang eksplisit menyebut resolusi Template→Instance sebelum Scope (`08f` § C — dua mekanisme berbeda, bukan satu). Langkah 6a baru menutup Recovery Rule yang di v1 belum punya tempat eksplisit dalam alur (`08e` § C mengidentifikasi kebutuhan Rule Group, di sini diberi posisi konkret). Langkah 7 sekarang eksplisit menyebut dua mode Explanation (`08h` § C.2) alih-alih diasumsikan seragam.

---

## B. Rule Konkret — Kasus Uji `EstimateVersionApproved`

**Empat Rule dari v1 dibawa maju sebagai Rule Instance, diperkaya field baru dari `08e`/`08f`. Tidak ada satu pun logic bisnis (trigger/condition/action/failure_policy) yang berubah — hanya klasifikasi dan metadata yang diperkaya, konsisten hasil verifikasi [`08f`](08f-rule-storage-philosophy.md) § E bahwa keempatnya tetap valid.**

### B.1 Rule-001 — Generate RAP Draft

```
Rule-001 {
  id:                   RULE-001
  display_name:         "Generate RAP Draft setelah Estimate Approved"
  purpose:              "Menyediakan draft RAP otomatis begitu Estimate Version
                          disetujui, supaya PM tidak mulai dari nol"
  owner:                Tim Cost Engineering
  category:             "Estimate Approval Flow"
  family:               null (belum terbukti perlu reuse lintas-company, `08f` § E)
  is_template:          false
  derived_from_template: null   ← Instance mandiri, konsisten `08f` § E
  created_by:           [diisi saat implementasi]
  created_at:           [diisi saat implementasi]
  current_status:       Draft
  current_version:      v1
  authored_by:          human   ← BARU, `08e` § D

  trigger:              EstimateVersionApproved
  trigger_type:         domain_event   ← BARU, `08e` § D
  condition:            true
  action:               Panggil CAP-008 (baca Estimate Item Approved) →
                         panggil CAP-013 (terjemahkan ke RAP draft existing)
  action_result_class:  Computed Data via Integration   ← BARU, `08f` § H,
                         dikonfirmasi bukan ACR oleh `08g` § C
  failure_policy:        Criticality High → Retry + Compensation
  timeout:               [belum ditentukan — Open Question § F]
  depends_on:            []
  priority:               [default paralel]
}
```

### B.2 Rule-002 — Generate Material Requirement Draft

```
Rule-002 {
  id:                   RULE-002
  display_name:         "Generate Material Requirement Draft setelah Estimate Approved"
  purpose:              "Menyiapkan draft kebutuhan material dari Estimate Item
                          yang Approved, mempercepat procurement"
  owner:                Tim Cost Engineering
  category:             "Estimate Approval Flow"
  family:               null
  is_template:          false
  derived_from_template: null
  current_status:       Draft
  current_version:      v1
  authored_by:          human

  trigger:              EstimateVersionApproved
  trigger_type:         domain_event
  condition:            Estimate Item memuat Resource kategori Material (RBS, CAP-001)
  action:               Panggil CAP-008 → panggil CAP-013 (Orchestration Gap-1,
                         [`07c`](../CECEP/07c-orchestration-readiness-assessment.md) § E)
  action_result_class:  Computed Data via Integration
  failure_policy:        Criticality High → Retry + Compensation
  timeout:               [belum ditentukan]
  depends_on:            []
  priority:               [default paralel]
}
```

### B.3 Rule-003 — Generate Cashflow Baseline

```
Rule-003 {
  id:                   RULE-003
  display_name:         "Generate Cashflow Baseline setelah Estimate Approved"
  purpose:              "Membentuk proyeksi Cashflow awal untuk keputusan
                          operasional PM/Direktur"
  owner:                Tim Cost Engineering
  category:             "Estimate Approval Flow"
  family:               null
  is_template:          false
  derived_from_template: null
  current_status:       Draft
  current_version:      v1
  authored_by:          human

  trigger:              EstimateVersionApproved
  trigger_type:         domain_event
  condition:            true
  action:               Panggil CAP-008 (baca Estimate Item + termin) →
                         panggil CAP-013 (Orchestration Gap-2, [`07c`](../CECEP/07c-orchestration-readiness-assessment.md) § E)
  action_result_class:  Computed Data via Integration
  failure_policy:        Criticality Medium → Retry otomatis
  timeout:               [belum ditentukan]
  depends_on:            []
  priority:               [default paralel]
}
```

### B.4 Rule-004 — Notifikasi Approval

```
Rule-004 {
  id:                   RULE-004
  display_name:         "Notifikasi Estimate Approved ke PM"
  purpose:              "Memberitahu PM bahwa Estimate Version sudah disetujui"
  owner:                Tim Product/UX
  category:             "Notification Flow"
  family:               "Notification-After-Event Family"   ← BARU, kandidat kuat
                         Template (`08f` § E — pola ini hampir pasti terpakai
                         ulang lintas banyak event, bukan hanya event ini)
  is_template:          false   ← masih Instance untuk sekarang, promosi ke
                         Template ditunda sampai event kedua nyata membutuhkannya
                         (menghindari over-engineering premature)
  derived_from_template: null
  current_status:       Draft
  current_version:      v1
  authored_by:          human

  trigger:              EstimateVersionApproved
  trigger_type:         domain_event
  condition:            true
  action:               Panggil sistem Notifikasi existing Puraloka Suite
  action_result_class:  True Derived Data (notifikasi dibaca dari sistem yang
                         sudah ada, bukan transformasi lintas-sistem baru —
                         BUKAN Computed Data via Integration seperti B.1-B.3)
  failure_policy:        Criticality Low → Retry longgar
  timeout:               [belum ditentukan]
  depends_on:            []
  priority:               [default paralel]
}
```

**Verifikasi ulang terhadap `08f` § E:** Rule-001/002/003 = Instance tanpa Template (spesifik Puraloka Persada). Rule-004 = kandidat Template kuat, TAPI tetap Instance untuk saat ini — mempromosikan sesuatu jadi Template SEBELUM ada bukti nyata reuse adalah pelanggaran ringan terhadap disiplin "jangan desain untuk hipotesis masa depan" yang sudah dipegang sejak awal sesi ini; `family` diisi sebagai PENANDA arah, `is_template` tetap false sampai event kedua benar-benar membutuhkan pola yang sama.

---

## C. Menjawab Pertanyaan Founder — Urutan Proses Pasca-`EstimateVersionApproved`

**Tidak berubah dari v1 — kesimpulan tetap PARALEL, sekarang dengan dasar tambahan dari Meta Model:**

Keempat Rule (B.1-B.4) trigger pada event yang sama, tidak punya `depends_on` satu sama lain → default PARALEL (`08a` § P). **Dasar tambahan dari `08e`/`08i`:** karena Rule bukan Domain Object yang "dimiliki" satu urutan proses tertentu (§ A.1 `08e`) dan Orchestration Separation Principle (`04` § 10) menolak satu Rule mengklaim otoritas atas urutan Rule lain tanpa dependency eksplisit, paralel-by-default bukan sekadar pilihan teknis netral — ia KONSEKUENSI LOGIS dari Rule tidak boleh diam-diam saling memberi urutan tanpa jejak (melanggar Explainability, `08a` § E poin 2, kalau urutan tersembunyi/implisit).

---

## D. Menjawab Pertanyaan Founder — Lazy/Eager/Hybrid untuk Derived Read-Model

**Direvisi dari v1 — kesimpulan Hybrid TETAP SAMA, tapi alasannya sekarang murni STRUKTURAL (Information Classification), bukan lagi "kesegeraan operasional" (alasan subjektif v1 yang sudah dikoreksi di `08f` § I, dan sekarang dikuatkan lagi lewat mekanisme Replay-by-Recompute/Retrieve dari `08h` § C.2):**

| Read-Model | Rule Terkait | Classification (`08g`) | Replay Mode (`08h` § C.2) | Keputusan |
|---|---|---|---|---|
| RAP Draft | Rule-001 | Computed Data via Integration | Replay-by-Retrieve | **Eager** — data ini TIDAK BISA ada tanpa satu eksekusi Rule eksplisit; "lazy" tidak bermakna untuk kategori ini karena tidak ada "hitung ulang" yang bisa dilakukan kapan saja |
| Material Requirement Draft | Rule-002 | Computed Data via Integration | Replay-by-Retrieve | **Eager** — alasan struktural sama |
| Cashflow Baseline | Rule-003 | Computed Data via Integration | Replay-by-Retrieve | **Eager** — alasan struktural sama (Criticality Medium hanya mempengaruhi failure_policy, TIDAK mempengaruhi keputusan Eager/Lazy — koreksi presisi dari v1 yang sempat mencampur dua hal ini) |
| Notifikasi | Rule-004 | True Derived Data (via sistem existing) | Replay-by-Recompute | Eager secara EKSEKUSI (Rule tetap jalan saat event terjadi — notifikasi ADALAH aksi, bukan read-model tersimpan), tapi TIDAK relevan dibandingkan lazy/eager read-model karena notifikasi bukan data yang "dibaca ulang" |
| RAB | — (tanpa Rule eksplisit) | True Derived Data | Replay-by-Recompute | **Lazy** (tetap) — bisa dihitung ulang kapan saja tanpa kehilangan informasi |
| EVM Baseline | — | True Derived Data | Replay-by-Recompute | **Lazy** (tetap) — alasan sama |

**Kesimpulan: HYBRID, sekarang dengan kriteria PENENTU yang bisa diuji ulang untuk read-model baru mana pun di masa depan:** *"Apakah read-model ini True Derived Data (Replay-by-Recompute → boleh Lazy) atau Computed Data via Integration (Replay-by-Retrieve → wajib Eager, karena tidak ada 'hitung ulang' yang mungkin)?"* — pertanyaan ini menggantikan pertanyaan v1 yang subjektif ("apakah segera dibutuhkan?") dengan pertanyaan struktural yang jawabannya stabil terlepas dari preferensi operasional yang berubah-ubah.

---

## E. Domain Event Baru yang Muncul dari Rule Design

**Tidak berubah dari v1 — tiga event baru tetap sah, diperkaya rujukan Rule Instance yang eksplisit:**

| Event Baru | Dipicu Oleh Rule Instance | Jenis (§ C Phase G) | Consumer |
|---|---|---|---|
| `RapDraftGenerated` | RULE-001 | Integration Event | PM |
| `MaterialRequirementDraftGenerated` | RULE-002 | Integration Event | Tim Procurement |
| `CashflowBaselineGenerated` | RULE-003 | Integration Event | Tim Finance |

---

## F. Recovery Rule dan Rule Group — Konsep Baru dari `08e`, Diterapkan Konkret

**Tidak ada di v1 — mengisi kebutuhan yang `08e` § C temukan (Recovery Rule butuh konsep "rangkaian Rule" sebagai unit yang bisa gagal total):**

```
Rule Group "EstimateApprovalFlow" {
  trigger:        EstimateVersionApproved   ← sama dengan trigger keempat Rule di atas
  members:        [RULE-001, RULE-002, RULE-003, RULE-004]   ← query dinamis
                   (SELECT Rules WHERE trigger = X), BUKAN entitas tersimpan
                   terpisah — konsisten `08e` § C ("Rule Group BUKAN Aggregate
                   Root baru, ia VIEW/PROYEKSI")
}

Rule-005 (Recovery Rule, BARU, contoh) {
  id:              RULE-005
  display_name:    "Recovery — Estimate Approval Flow gagal total"
  purpose:         "Eskalasi manual kalau SELURUH Rule Group EstimateApprovalFlow gagal"
  owner:           Tim Cost Engineering
  category:        "Recovery Flow"
  current_status:  Draft
  current_version: v1
  authored_by:     human

  trigger:         "Rule Group EstimateApprovalFlow — all members failed"
  trigger_type:    system_signal   ← BARU, `08e` § D — BUKAN Domain Event bisnis
  condition:       true
  action:          Eskalasi ke manusia (Manual, `08a` § L) — PM + admin diberi
                   notifikasi bahwa seluruh proses pasca-approval gagal, perlu
                   intervensi manual
  action_result_class: N/A (aksi eskalasi, bukan menghasilkan read-model)
  failure_policy:   Manual (tidak ada failure_policy lebih lanjut — ini SUDAH
                    jalur eskalasi terakhir)
  timeout:          [belum ditentukan]
  depends_on:       [] (trigger-nya sendiri SUDAH berarti "setelah semua gagal")
  priority:          [default paralel, meski praktiknya hanya jalan sendiri]
}
```

**Catatan:** Ini CONTOH struktural (membuktikan pola Rule Group + Recovery Rule bisa diekspresikan dengan field yang sudah dikunci) — BUKAN klaim bahwa Puraloka Persada sudah butuh Rule ini secara operasional sekarang. Dicatat sebagai bukti kelengkapan desain, bukan penambahan kelima Rule wajib.

---

## G. Open Questions yang TIDAK Diselesaikan di Sini

**Tidak berubah signifikan dari v1 — tiga hal ini tetap menunggu fase yang tepat, bukan pertanyaan yang seharusnya sudah terjawab di Rule Design tingkat arsitektur:**

1. **Nilai Timeout konkret** untuk semua Rule Instance — menunggu masukan operasional.
2. **Bentuk konkret Integration Gateway (CAP-013)** — menunggu Phase H (Integration).
3. **Skema pasti tiga event baru (Payload Contract)** — menunggu Phase H mendefinisikan bentuk data pertukaran dengan sistem existing.

**Ditambahkan satu (baru, muncul dari § F):** 4. **Apakah Rule Group perlu representasi query yang dioptimalkan** (mis. index by `trigger`) atau cukup query dinamis sederhana — keputusan Persistence Truth, ditunda ke Phase K/L, bukan keputusan arsitektur.

**Keempatnya BUKAN kandidat ACR.**

---

## H. Verifikasi Checklist

**Sama seperti v1 (Rule-001 sebagai sampel) — TIDAK diulang di sini karena hasilnya identik (logic Rule-001 tidak berubah dari v1, hanya metadata bertambah), lihat [`08c`](08c-orchestration-rule-design.md) § G untuk hasil lengkap sebelas pertanyaan. Satu tambahan verifikasi baru:**

| # | Pertanyaan tambahan (dari fondasi `08d`-`08i`) | Rule-001 |
|---|---|---|
| 12 | Apakah `trigger_type` dan `authored_by` terisi eksplisit? | ✅ Ya — `domain_event`, `human` |
| 13 | Apakah `action_result_class` konsisten Information Classification (`08g`)? | ✅ Ya — Computed Data via Integration, cocok dengan action yang memanggil CAP-013 |
| 14 | Apakah Rule ini bagian Rule Group yang jelas untuk keperluan Recovery? | ✅ Ya — Rule Group "EstimateApprovalFlow" (§ F) |

---

## Assumptions

1. Sama seperti v1 — Owner/Criticality/Scope pada Rule contoh adalah penempatan awal berdasar penalaran arsitektural, belum divalidasi eksplisit per-Rule oleh founder.
2. `action_result_class` sebagai field baru (§ B) diasumsikan cukup sebagai SATU nilai per Rule — kalau sebuah Rule punya action majemuk yang menghasilkan campuran Computed dan True Derived Data, field ini perlu jadi daftar, bukan nilai tunggal. Tidak ada kasus seperti itu di empat Rule contoh saat ini.

## Open Questions

(Didaftar lengkap di § G — Timeout, bentuk CAP-013, Payload Contract, representasi Rule Group — semuanya sengaja ditunda ke fase yang tepat.)

## Status

**Rule Design v2 selesai — dibangun di atas fondasi `08d`-`08j` yang lengkap.** Empat Rule Instance asli (Rule-001 s.d. 004) diverifikasi tetap valid dan diperkaya field baru tanpa mengubah satu pun logic bisnis. Satu Rule baru (Rule-005, Recovery) ditambahkan sebagai bukti struktural Rule Group bekerja. Kesimpulan Urutan Proses (Paralel) dan Lazy/Eager (Hybrid) TIDAK berubah dari v1, tapi sekarang berdiri di atas alasan struktural yang stabil, bukan penilaian subjektif. **Siap lanjut ke Phase G.1 — Orchestration Rule Design Validation & Freeze**, gerbang terakhir sebelum Phase G dinyatakan frozen secara penuh dan CECEP transisi ke Phase H (Integration).
