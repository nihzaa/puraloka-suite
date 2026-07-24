# CECEP — Phase 7: Data Architecture

**Mode:** Architecture Derivation Mode (`40`/`41`). `07`/`07b`/`07c` (Discovery Complete lama) adalah evidence BERSYARAT — lihat § Temuan Kritis di bawah sebelum dipakai.

## Derivation Summary

```
This document introduces:
- 0 new business concepts
- 1 structural correction (Capability Catalog lama CAP-001..013 di 07/07b/07c
  dinyatakan usang, digantikan 35's 16 capability — lihat Temuan Kritis)
- 13 domains carried forward from Phase 6 (44), re-mapped to valid ownership
- 16 Canonical Information Contracts derived (metodologi 07 dipakai sebagai
  alat, isi diturunkan ulang dari evidence yang masih berlaku)

Every concept below is derived from previously frozen artifacts.
No new discovery is performed in this phase.
```

---

## Temuan Kritis — Kenapa `07`/`07b`/`07c` TIDAK Bisa Dipakai Apa Adanya

**Article 8 check (`30`) terhadap judul `07c` "Orchestration Readiness Assessment":** kata "Orchestration" memang dekat wilayah Phase G lama, TAPI itu bukan masalah utama — `07c` sudah dipindah konsepnya ke Framework via `31` (H/G lama), jadi kalau isinya murni soal orkestrasi generik, ia otomatis tidak relevan lagi, bukan berbahaya.

**Masalah yang JAUH lebih signifikan, ditemukan saat membaca isi penuh:** `07`, `07b`, `07c` seluruhnya dibangun di atas **Capability Catalog CAP-001 s.d. CAP-013** dari `05b` (Phase D versi lama, ditulis SEBELUM Context Integrity Audit `29`). Katalog itu:
- Memakai penomoran CAP-XXX yang **tidak ada padanannya** di `35` (16 capability Frozen Permanently, tidak pernah pakai kode CAP-XXX).
- Memuat entitas yang sudah DITOLAK eksplisit di validasi boundary `36` (mis. `07` § B mendaftar CAP-007 "Risk Engine" sebagai pemilik "Risk Register, Contingency Rule" — padahal `44` sudah menyelesaikan Risk Register sebagai CHILD ENTITY di dalam Estimate Item, BUKAN capability/Aggregate Root berdiri sendiri).
- Memuat pemisahan capability yang sudah digabung ulang oleh ACR-004 (mis. `07` § D.2 memisahkan "Formula Definition" dan "Calculation Strategy" jadi dua Aggregate Root berbeda di bawah "CAP-006" — sementara `42` [Fase 5, Frozen] sudah mendefinisikan Calculation Strategy sebagai satu Contract yang MEREFERENSIKAN Formula, konsisten tapi dengan struktur ownership berbeda karena capability dasarnya sudah berubah total).

**Kesimpulan:** `07`/`07b`/`07c` bukan Discovery Complete yang netral — isinya SUDAH TERIKAT ke baseline Capability yang sudah terbukti drift dan sudah digantikan (`29`, `31`, ACR-004). Memakainya sebagai evidence otoritatif akan mewariskan struktur yang sudah dibuang. **Yang MASIH bisa dipakai dari `07`:** metodologi 10-tahapnya (Classification→Ownership→Contract→Aggregate→Entity→Value Object→Relationship→Lifecycle→Version, berhenti sebelum Persistence) — kerangka kerja ini valid dan tidak terikat capability tertentu. **Yang TIDAK bisa dipakai:** seluruh ISI (tabel Ownership, Aggregate Root list, kode CAP-XXX).

**Trace Status atas temuan ini:**
```
Level 4 Capability — evidence 07/07b/07c GAGAL (merujuk CAP-XXX yang sudah
  tidak Frozen; `35` adalah Capability Frozen yang SAH sekarang)
Keputusan: 07/07b/07c DIDEGRADASI dari "evidence Discovery Complete" menjadi
  "referensi metodologi saja" — bukan ADR (tidak mengubah Capability apa pun,
  hanya mengoreksi dokumen MANA yang dipakai sebagai evidence Fase 7)
```

---

## Business Uncertainty — Before

Sebelum dokumen ini: tidak jelas dokumen `07`/`07b`/`07c` lama itu masih berlaku sebagai basis skema atau tidak — kalau tim build langsung memakainya, mereka akan mendesain tabel mengikuti CAP-007 "Risk Engine" yang sudah tidak eksis, menciptakan mismatch besar dengan Capability Map (`35`) dan Domain Model (`44`) yang sudah Frozen.

---

## Metodologi (Dipakai sebagai Alat, Isi Diturunkan Ulang)

```
Business Meaning → Information Classification → Ownership (35, bukan CAP-XXX lama)
→ Canonical Information Contract → Aggregate (44) → Entity → Value Object
→ Relationship → Lifecycle → Version
[Persistence — di luar cakupan, sama seperti 07 asli menyatakan]
```

## A. Information Classification (Kelas Data, Diwarisi Sebagai Alat dari `07` § A — Kelas Ini Sendiri Tidak Terikat Capability, Lolos)

Enam belas kelas `07` § A diperiksa: tidak satu pun definisi kelasnya (Reference/Master/Transactional/Derived/Computed/Configuration/Knowledge/Historical/Versioned/Audit/External/Temporary/Snapshot/AI Generated/Cache/Event Data) menyebut CAP-XXX secara langsung — ini murni taksonomi SIFAT data, independen dari siapa pemiliknya. **Dipakai apa adanya sebagai alat**, tidak diturunkan ulang.

## B. Ownership — Diturunkan Ulang dari `35` (Bukan `05b`)

| Kelompok Informasi | Kelas (§ A) | Dimiliki Capability (`35`, BUKAN CAP-XXX lama) |
|---|---|---|
| Cost Code, Resource | Master Data | Resource Identity (#5) |
| CBS Node, WBS Node | Master Data + Historical | (bagian Assembly Library #2 — CBS/WBS tidak lagi capability sendiri pasca-simplifikasi `35`) |
| Assembly, Company AHSP (4 sumber) | Knowledge Data | **Assembly Library (#2)** — bukan CAP-003, mencakup AHSP pasca-ACR-004 |
| Price Book Entry | Knowledge Data | Price Book (#6) |
| Productivity Record | Knowledge Data | Productivity Library (#7) |
| Formula Definition, Calculation Strategy Contract | Versioned + Computed | **Calculation Strategy (#8)** — SATU capability, bukan dipecah CAP-006 vs terpisah; `42` sudah Freeze strukturnya |
| **Risk Allowance Entry** | Knowledge Data | **BUKAN capability terpisah** — child entity RAP Builder (#4), sesuai `44` housekeeping. Ini KOREKSI eksplisit terhadap `07` § B yang menaruhnya di bawah "CAP-007 Risk Engine" yang sudah tidak eksis |
| Estimate Version, Estimate Item | Transactional + Versioned | RAP Builder (#4) / Tender Estimation (#1) / RAB Builder (#3) — tiga capability berbeda mengonsumsi struktur yang sama, bukan satu "Estimation Engine" tunggal |
| Scenario | Transactional | (bagian dari Tender/RAP Builder — `35` tidak memberi Scenario capability terpisah, berbeda dari CAP-009 lama) |
| Approval Chain Definition | Configuration + Audit | (Workflow generik — dikonsumsi `35` #9-#13, tidak dimiliki satu capability tunggal, konsisten `03b` § A.11 "Domain Service, bukan dimiliki satu fungsi bisnis") |
| Lessons Learned, Variance, Root Cause | Knowledge Data | Historical Cost Intelligence (#13) |
| Data terjemahan sistem eksternal | External Data | (ACL — Fase 8 Integration Architecture, di luar cakupan Fase 7) |

**Perbedaan struktural dari `07` asli:** `35` TIDAK memberi setiap Aggregate Root satu "Engine" tunggal dengan kode CAP-XXX — beberapa capability di `35` (Calculation Strategy, Assembly Library) eksplisit ditandai **cross-cutting**, dikonsumsi banyak capability lain, bukan dimiliki satu "Engine". Ini konsisten dengan filosofi `35` yang lebih ramping (16 capability vs 13 CAP + entitas tersebar) hasil validasi Boundary (`36`).

## C. Canonical Information Contract — Sebelas Elemen (Kerangka `07` § C.1 Dipakai, Isi Diturunkan Ulang)

Kesebelas elemen `07` § C.1 (Identity/Meaning/Owner/Lifecycle/Version/Allowed Mutation/Consumers/Producers/Source of Truth/Derivation Rule/Audit) diuji: apakah kerangka ini sendiri terikat CAP-XXX? **Tidak** — ia struktur pertanyaan generik yang bisa diisi Owner apa pun. **Dipakai sebagai alat.** Dua contoh diisi ulang dengan Owner yang benar:

### Price Book Entry
```
Identity: price_entry_id (+ company_id)
Meaning: "Harga resmi ter-versi untuk satu Resource, pada satu titik waktu,
  di satu lokasi, dari satu sumber" (02 §4, tidak berubah dari 07)
Owner: Price Book (35 #6) — BUKAN "CAP-004"
Lifecycle: Draft → Verified → Active → Expired (44 §5, konsisten 03b §A.6)
Version: Immutable per entry
Allowed Mutation: Hanya via Draft→Verified; tidak pernah Reference baru ke
  entry Expired
Consumers: Assembly Library (#2), RAP Builder (#4), Cost Control (#11)
Producers: HANYA Price Book (#6)
Source of Truth: Price Book Entry itu sendiri
Derivation Rule: Tidak berlaku (Knowledge Data, bukan Derived)
Audit: PriceBookEntryVerified, PriceBookEntryExpired (03b §A.6)
```
```
Trace Status: ✓ Fully Derived — semua elemen berasal dari 44/35/03b yang
  masih Frozen, hanya Owner code yang diganti dari CAP-004 ke nama capability
  35 yang sah
```

### Risk Allowance Entry (BARU, hasil housekeeping `44`)
```
Identity: risk_allowance_id, terikat estimate_item_ref
Meaning: "Buffer risiko eksplisit (harga material/cuaca/keterlambatan/desain)
  yang dipantau terpisah dari anggaran kerja" (01 §3.2)
Owner: RAP Builder (35 #4) — child entity, BUKAN capability sendiri
Lifecycle: mengikuti lifecycle Estimate Item induknya (44 §Housekeeping)
Version: immutable setelah Estimate Item induk Approved
Allowed Mutation: hanya sebelum Estimate Version Approved
Consumers: Cost Control (#11, sebagai bagian RAP Baseline)
Producers: HANYA RAP Builder
Source of Truth: Risk Allowance Entry itu sendiri, di dalam Estimate Item
Derivation Rule: basis persentase/nilai tetap terhadap komponen RAP (01 §3.3)
Audit: mengikuti Domain Event Estimate Item/Version induknya (tidak perlu
  event terpisah — 44 sudah menyimpulkan ini bukan Aggregate Root sendiri)
```
```
Trace Status: ✓ Fully Derived — necessity dari 01 §3.2 (dipantau terpisah),
  struktur diwarisi langsung dari keputusan Fase 6 (44)
```

## D. Aggregate Discovery — Diwarisi Langsung dari Fase 6 (`44`), TIDAK Diulang

13 domain + Risk Allowance Entry sudah didaftarkan lengkap dengan Required Business Mechanism-nya masing-masing di `44` (dikoreksi pasca-Rule 6, `40` — dua di antaranya BUKAN Aggregate Root: Formula Engine adalah Domain Service, Conversion Rule adalah Value Object). Fase 7 TIDAK mengulang penemuan ini.

**⚠️ Koreksi kedua terhadap § D (jejak berlapis, bukan dihapus — lihat riwayat lengkap di `40` § Rule 6):** Draf pertama menyatakan "setiap Aggregate Root harus punya Contract". Draf kedua (revisi sebelumnya di sini) melonggarkannya jadi "diisi sejauh relevan, boleh N/A untuk elemen yang tidak berlaku" — **ini KOREKSI YANG MASIH SETENGAH JALAN.** "Boleh N/A" tetap mengasumsikan formulir sebelas-kolom itu HARUS muncul untuk setiap domain, hanya isinya boleh kosong. Itu genre kesalahan yang sama dengan template Aggregate Root — hanya dipindah dari "isi kolom" ke "isi kolom atau tulis N/A", bukan dihilangkan.

**Jawaban yang benar:** Pertanyaannya bukan "elemen Contract mana yang relevan untuk domain ini", tapi **"apakah domain ini punya masalah yang Contract itu sendiri diciptakan untuk selesaikan?"** Contract 11-elemen (`45` § C.1) lahir untuk masalah konkret: *informasi lintas Bounded Context perlu dikonsumsi capability lain tanpa menebak struktur internal* (`45` § C pembuka: "sistem lain tidak boleh membaca struktur internal langsung, mereka membaca Contract-nya"). Itu masalah nyata untuk Price Book Entry (dikonsumsi Assembly, RAP Builder, Cost Control — lintas capability, butuh kontrak eksplisit) dan Risk Allowance Entry (dikonsumsi Cost Control dari dalam Estimate Item). **Conversion Rule TIDAK PUNYA masalah itu** — ia dipanggil sebagai fungsi murni oleh SATU Domain Service (Unit Conversion Engine), tidak pernah dikonsumsi lintas Bounded Context secara independen. Untuk Conversion Rule, jawabannya bukan "Contract dengan tiga baris N/A" — jawabannya **Conversion Rule tidak punya dokumen Contract sama sekali**, karena masalah yang Contract selesaikan tidak pernah terjadi di sana. Bahkan bentuknya sebagai Value Object masih perlu diuji ulang: kalau `convert(mm, cm)` sebagai fungsi murni sudah cukup, Value Object pun berlebih dari yang dibutuhkan.

**Prinsip yang dipegang mulai sekarang (`40` § Rule 6, revisi final):** *Absence is a valid architectural outcome.* Tidak ada Aggregate, tidak ada Service, tidak ada Contract, tidak ada Event — itu bukan kekosongan yang perlu ditandai "N/A", itu HASIL YANG SAH kalau problem yang mendasari struktur itu memang tidak ada di domain tersebut. Urutan pertanyaan yang benar: **Problem → Need → Mechanism** (bukan langsung "Mechanism apa yang cocok" seperti draf-draf sebelumnya) — dan jawaban "tidak ada Need" mengakhiri rantai di situ, tidak berlanjut ke "maka isi Mechanism dengan kosong."

## E-F. Entity & Value Object — Diwarisi dari `03b`/`44`, Satu Koreksi Diwarisi dari `07` § F

`07` § F menemukan satu koreksi valid yang TIDAK terikat CAP-XXX: **Sequence Step di dalam Assembly adalah Value Object**, bukan Entity — dikonfirmasi `03b` § A.4 sendiri. Koreksi ini independen dari masalah Capability Catalog, jadi tetap sah dipakai.

**Value Object list yang independen dari Capability Catalog (dipakai dari `07` § F apa adanya, karena tidak menyebut CAP-XXX):** Money `(amount, currency)`, Quantity `(numeric_value, unit)`, Unit, Percentage, Duration, Confidence Level — semua didefinisikan penuh oleh nilai, tidak terikat siapa pemiliknya.

## G. Relationship Discovery — Satu Relationship Kritis Diwarisi Tanpa Perubahan

**Relationship terpenting dari `07` § G tetap berlaku PENUH** (tidak terikat CAP-XXX, murni aturan struktural): *"Lessons Learned → Assembly/Price Book/Productivity adalah SATU-SATUNYA relationship di seluruh Data Architecture yang melibatkan WRITE lintas-Aggregate-Root, dan itu HANYA lewat Domain Event (`LessonsLearnedPropagated`), tidak pernah foreign key langsung."* Ini konsisten `44` § 13 (Historical Cost Intelligence) dan `03b` § A.12 — evidence yang sama di tiga dokumen berbeda, tanda derivasi kuat.
```
Trace Status: ✓ Fully Derived — dikonfirmasi ulang dari 03b/44, independen
  dari masalah Capability Catalog di 07
```

## H-I. Lifecycle & Version Discovery — Diwarisi dari `44` (Sudah Lengkap per Domain)

Setiap Aggregate Root sudah punya Lifecycle di `44` (mis. Price Book Entry: Draft→Verified→Active→Expired). Klasifikasi Version (Immutable/Mutable/Append-only/Snapshot) mengikuti pola yang sama seperti `07` § I tapi TANPA perlu tabel CAP-XXX — setiap baris langsung merujuk domain `44`.

## J. Persistence — Tetap Di Luar Cakupan

Sama seperti `07` asli menyatakan eksplisit: keputusan fisik (tabel/index/partition) BUKAN bagian Fase 7 — itu Fase 11 (Implementation Roadmap)/Fase 12.

---

## Business Uncertainty — After

Sesudah dokumen ini: tim build tahu PERSIS dokumen mana yang jadi basis skema (`44` untuk Aggregate Root, § C dokumen ini untuk Contract lengkap) dan dokumen mana yang HANYA dipakai sebagai alat metodologi tapi isinya tidak diwarisi (`07`/`07b`/`07c` — Capability Catalog CAP-XXX di dalamnya sudah usang). Risiko besar (membangun skema mengikuti "CAP-007 Risk Engine" yang tidak pernah eksis di Capability Map yang sah) sudah dicegah eksplisit sebelum Fase 11 dimulai.

---

## Simplicity Rule Check

Diperiksa: apakah kerangka 10-tahap ini sendiri jadi abstraksi yang hanya menjelaskan abstraksi lain? Tidak — setiap elemen Canonical Information Contract langsung menjelaskan perilaku data CECEP nyata (kapan harga immutable, siapa boleh menulis Lessons Learned). Kerangka dipertahankan karena LULUS uji ini, bukan karena sudah ada di `07`.

## Definition of Done Self-Check (`34`)

| Kriteria | Status | Bukti |
|---|---|---|
| 1. Memperkuat capability | ✓ | Setiap Contract dipetakan ke capability `35` yang sah |
| 2. Mengurangi implementation uncertainty | ✓ | Kejelasan dokumen mana dipakai vs tidak (Temuan Kritis) |
| 3. Artefak konkret | ✓ | Tabel Ownership baru + 2 Contract lengkap |
| 4. Tidak memperkenalkan Framework concept | ✓ | |
| 5. Construction Removal Test | ✓ | Hapus "construction" → Price Book/AHSP/RAP semua hilang |
| 6. Constitution 8 Artikel | ✓ | |
| 7. Implementation readiness | ✓ | Tim build tahu persis dokumen otoritatif |
| 8. Derivation Trace + Trace Status | ✓ | Seluruh isi ✓ Fully Derived dari `35`/`44`/`03b`, 0 ❌ Invented, 1 koreksi struktural eksplisit (bukan ADR — pemilihan evidence, bukan perubahan Capability) |

**Hasil:** 8/8 ✓.

## Derivation Trace

```
This document derives from:
✓ Mission (01/02)
✓ Principles (04)
✓ Confirmed Domain (03b — evidence)
✓ Frozen Capability (35)
✓ Frozen Domain Model (44)
Metodologi diwarisi dari 07 (10-tahap Classification→...→Version), ISI
dari 07/07b/07c TIDAK diwarisi karena terikat Capability Catalog usang.
No new business concepts introduced.
```

---

## 🔒 STATUS: SIAP DI-FREEZE — Derived & Frozen (menunggu review)

**Rekomendasi tambahan:** `07`/`07b`/`07c` sebaiknya ditandai eksplisit "SUPERSEDED — Capability Catalog usang, lihat `45`" di metadata masing-masing, supaya pembaca masa depan tidak salah mengira ketiganya masih otoritatif. Tidak dieksekusi di dokumen ini (di luar scope Fase 7 murni) — dicatat sebagai saran housekeeping untuk keputusan founder.
