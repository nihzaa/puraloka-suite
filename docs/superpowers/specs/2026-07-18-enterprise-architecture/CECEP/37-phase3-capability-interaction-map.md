# CECEP — Phase 3: Capability Interaction Map

**Kedudukan:** Artefak PENUTUP Fase 3, dibangun di atas capability yang sudah tervalidasi ([`35`](35-phase3-capability-architecture.md) + revisi [`36`](36-phase3-capability-boundary-validation.md)) — 16 capability final. **Bukan workflow UI, bukan business process, bukan urutan implementasi.** Menjawab satu pertanyaan: bagaimana capability saling bertukar OUTPUT BISNIS, membentuk satu sistem yang mengalir, bukan modul-modul berdiri sendiri. Ini jembatan eksplisit antara Capability Architecture (Fase 3) dan Domain Model (Fase 6) — Aggregate Root di Fase 6 akan diturunkan langsung dari titik Output di peta ini.
**Tidak memperkenalkan capability baru.** Hanya menghubungkan 16 yang sudah divalidasi.

---

## Format Per Capability

Setiap capability dijawab sebagai: **Input → Transformation → Output → Consumer Capability**. Input yang datang dari LUAR CECEP (data existing Puraloka Suite via ACL) ditandai eksplisit. Output yang jadi Domain Event (`03b`) dicatat namanya supaya konsisten dengan Fase 6.

### 1. Tender Estimation

- **Input:** Project baru (dari Puraloka Suite existing), Assembly Library (cara hitung), Price Book (harga), Calculation Strategy (pilihan strategi per work item).
- **Transformation:** Menyusun Estimate Item per Work Item dalam satu Scenario bertujuan "penawaran".
- **Output:** Estimate Version berstatus Draft/Approved (jenis Scenario: Tender). Domain Event: `EstimateVersionApproved`.
- **Consumer:** RAB Builder (baca Estimate Version Approved), Budget Baseline (kalau Tender jadi acuan awal), Cashflow Forecast.

### 2. Assembly Library *(termasuk AHSP)*

- **Input:** Reference Library (AHSP Nasional Bina Marga/Cipta Karya, bootstrap eksternal), Resource Identity (RBS), Formula Engine (Calculation Strategy).
- **Transformation:** Menyusun resource+proses+durasi jadi paket kerja reusable; AHSP Company lahir dari edit manual atas bootstrap AHSP Nasional.
- **Output:** Assembly siap pakai (versioned). Domain Event: `AssemblyActivated`, `CompanyAhspRevised`.
- **Consumer:** Tender Estimation, RAB Builder, RAP Builder — semua Estimate Item merujuk Assembly untuk tahu "bagaimana cara mengerjakan + berapa resource dibutuhkan".

### 3. RAB Builder

- **Input:** Estimate Version (dari Tender Estimation, status Approved), Assembly Library, Price Book.
- **Transformation:** Merender Estimate Item jadi tampilan breakdown biaya per Work Item (read-model, bukan tabel baru).
- **Output:** RAB (dokumen/view), BOQ (turunan RAB, quantity-only tanpa harga — untuk dokumen tender ke supplier).
- **Consumer:** Klien (dokumen penawaran), Procurement Planning (BOQ jadi basis awal Material Requirement).

### 4. RAP Builder

- **Input:** Resource Identity, Price Book, Productivity Library, Assembly Library — **independen dari RAB Builder** (ini titik krusial, `01` § 3: RAP bukan `RAB × margin%`).
- **Transformation:** Menghitung target biaya internal dari resource dasar, ditambah Contingency/Risk Allowance/Overhead/Profit sebagai komponen eksplisit (bentuk domain Risk Register masih tertunda, `03b` § B.3).
- **Output:** Estimate Version (jenis Scenario: RAP), status Approved menjadi kandidat Budget Baseline.
- **Consumer:** Budget Baseline (RAP Approved → jadi baseline), Cost Control (baseline EVM harus dari RAP, bukan RAB — `03` § 6).

### 5. Resource Identity

- **Input:** (upstream — tidak menerima dari capability CECEP lain; sumber: input manual estimator/admin, atau ACL dari Asset Management existing untuk Equipment).
- **Transformation:** Menjaga SATU identitas per resource (Material/Labor/Equipment/Subcontract) lintas seluruh pemakai.
- **Output:** RBS Registry entry (Entity dengan ID stabil). Domain Event: `ResourceDeactivated`.
- **Consumer:** Assembly Library, Price Book, Productivity Library, Procurement Planning — SEMUA capability yang menyebut "resource apa" merujuk balik ke sini, tidak membuat daftar sendiri.

### 6. Price Book

- **Input:** Resource Identity (subjek harga), Supplier Quotation (ACL dari Procurement existing), Manual Override (dengan alasan wajib).
- **Transformation:** Resolusi harga lewat hierarki preseden 6-tingkat (Manual Override→Project→Supplier Quote→Company→Regional→National).
- **Output:** Price Book Entry aktif + jejak sumber. Domain Event: `PriceBookEntryVerified`.
- **Consumer:** Assembly Library (biaya per Assembly), RAB Builder, RAP Builder — direferensikan, TIDAK PERNAH disalin (No Data Duplication, `02`).

### 7. Productivity Library

- **Input:** Resource Identity + Cost Code (kombinasi resource+jenis pekerjaan), Historical Cost Intelligence (data aktual pasca-proyek).
- **Transformation:** Bootstrap dari angka AHSP Nasional (mis. 0.5 OH) → diperbarui jadi angka company real (0.42 OH) berdasar Variance.
- **Output:** Productivity Record. Domain Event: `ProductivityRecordUpdatedFromVariance`.
- **Consumer:** Assembly Library (parameter durasi/crew size), Calculation Strategy (Formula Engine memakainya sebagai variabel).

### 8. Calculation Strategy *(cross-cutting — dikonsumsi, bukan berurutan linear)*

- **Input:** Assembly (definisi formula), Productivity Library (parameter), pilihan strategi per Work Item (Bina Marga/Cipta Karya/Custom).
- **Transformation:** Mengeksekusi Formula tanpa perlu deploy kode baru, menghasilkan quantity/resource result.
- **Output:** Hasil kalkulasi terpakai LANGSUNG oleh capability manapun yang membutuhkan (bukan output tersimpan sendiri).
- **Consumer:** Tender Estimation, RAB Builder, RAP Builder, Assembly Library — semua titik yang "menghitung angka" memanggil ini, tidak mengimplementasikan kalkulasinya sendiri.

### 9. Budget Baseline *(thin capability)*

- **Input:** RAP Builder (Estimate Version status Approved, jenis Scenario RAP).
- **Transformation:** Menandai satu Estimate Version sebagai Baseline aktif per Project (flag, bukan salinan data).
- **Output:** Baseline aktif. Domain Event: `EstimateVersionFrozen`.
- **Consumer:** Cost Control (acuan EVM), Cashflow Forecast (acuan proyeksi).

### 10. Procurement Planning

- **Input:** BOQ (dari RAB Builder), Resource Identity, Assembly Library (breakdown resource per Work Item).
- **Transformation:** Menurunkan Material Requirement OTOMATIS dari Assembly/RBS (bukan input manual terpisah — memperbaiki root cause `03` § 7).
- **Output:** Procurement Plan, Material Requirement. Diteruskan lewat ACL ke Procurement existing (`suppliers`, `purchase_orders`).
- **Consumer:** (keluar CECEP) Procurement existing Puraloka Suite; balik masuk lewat Cost Control sebagai Actual Cost.

### 11. Cost Control

- **Input:** Budget Baseline (RAP), Cost Code (penyambung), Actual Cost (ACL dari `project_expenses`/`kasbons`/dll existing).
- **Transformation:** Membandingkan real-time rencana (RAP Baseline) vs aktual via Cost Code — bukan rekonsiliasi manual periodik.
- **Output:** EVM metrics (CPI/SPI/dst), sinyal deviasi dini.
- **Consumer:** Historical Cost Intelligence (input Variance Calculation), Cashflow Forecast (revisi proyeksi kalau ada deviasi besar).

### 12. Cashflow Forecast

- **Input:** Estimate Version (Approved), WBS (jadwal), Cost Control (deviasi aktual kalau ada).
- **Transformation:** Memproyeksikan kas ke depan berbasis Estimate + jadwal — bukan hanya mencatat kas aktual (yang sudah ada di existing).
- **Output:** Proyeksi kas per periode.
- **Consumer:** Manajemen/Finance (existing Puraloka Suite) — capability terakhir sebelum keluar dari alur Estimate langsung, TIDAK memicu capability CECEP lain.

### 13. Historical Cost Intelligence

- **Input:** Cost Control (Variance real-time), Actual Cost via ACL.
- **Transformation:** SIKLUS PENUH — lihat § Intelligence Loop di bawah, ini bukan transformasi satu langkah.
- **Output:** **TIGA target serentak** (Domain Event `LessonsLearnedPropagated`): update Assembly Library (Company AHSP), update Price Book (entry baru/direvisi), update Productivity Library (Productivity Record).
- **Consumer:** Assembly Library, Price Book, Productivity Library (loop balik — inilah yang membuat CECEP sebuah PLATFORM YANG BELAJAR, bukan sekadar linear pipeline), AI Recommendation.

### 14. AI Estimation *(isi ditunda Fase 10 — hanya entri koneksi di sini)*

- **Input:** Dokumen eksternal (Excel/PDF/DWG/Foto).
- **Transformation:** (ditunda).
- **Output:** Estimate Item draft (kandidat, butuh review manusia).
- **Consumer:** Tender Estimation / RAP Builder (sebagai draft awal yang dilengkapi estimator, bukan pengganti).

### 15. AI Recommendation *(isi ditunda Fase 10 — hanya entri koneksi di sini)*

- **Input:** Historical Cost Intelligence (data yang sudah diperbarui).
- **Transformation:** (ditunda).
- **Output:** Saran/flag ("angka ini menyimpang dari pola historis").
- **Consumer:** Tender Estimation, RAP Builder (saran saat estimator sedang bekerja, bukan otomatis mengubah angka — "AI tidak boleh langsung belajar. Harus ada approval", `02` § 10).

---

## Capability Interaction Map — Diagram Terhubung Penuh

```
                          ┌─────────────────────┐
                          │  Reference Library    │  (bootstrap eksternal: AHSP
                          │  (AHSP Nasional, dll)  │   Nasional Bina Marga/Cipta Karya)
                          └──────────┬───────────┘
                                     │ bootstrap
                                     ▼
    ┌────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
    │ Resource        │─────▶│ Assembly Library  │◀─────│ Calculation Strategy │
    │ Identity        │      │ (+ AHSP 4 sumber) │      │ (cross-cutting)      │
    └───────┬─────────┘      └─────────┬─────────┘      └──────────┬──────────┘
            │                          │                            │ dikonsumsi oleh
            │ dikonsumsi oleh          │ dikonsumsi oleh             │ semua capability
            ▼                          ▼                            │ perhitungan
    ┌────────────────┐      ┌──────────────────┐                    │
    │ Price Book      │      │ Productivity      │◀───────────────────┘
    │                 │      │ Library           │
    └───────┬─────────┘      └─────────┬─────────┘
            │                          │
            └──────────┬───────────────┘
                        ▼
              ┌───────────────────┐
              │ Tender Estimation  │   (Scenario: Tender)
              └─────────┬──────────┘
                        │ EstimateVersionApproved
                        ▼
              ┌───────────────────┐         ┌───────────────────┐
              │   RAB Builder      │────────▶│        BOQ         │ (turunan, bukan node sejajar)
              └─────────┬──────────┘         └─────────┬──────────┘
                        │                                │
                        │                                ▼
                        │                     ┌────────────────────┐
                        │                     │ Procurement Planning│──────▶ (ACL) Procurement existing
                        │                     └─────────┬───────────┘              │
                        │                                │                          │
                        ▼                                │                          │
              ┌───────────────────┐                       │                          │
              │   RAP Builder      │  (Scenario: RAP,      │                          │
              │  independen dari   │   independen dari RAB)│                          │
              │   RAB — `01` §3    │                       │                          │
              └─────────┬──────────┘                       │                          │
                        │ EstimateVersionFrozen             │                          │
                        ▼                                   │                          │
              ┌───────────────────┐                          │                          │
              │  Budget Baseline   │ (thin capability)        │                          │
              └─────────┬──────────┘                          │                          │
                        │                                      │                          │
                        ▼                                      ▼                          ▼
              ┌───────────────────┐                 ┌────────────────────────────────────────┐
              │   Cost Control     │◀────────────────│   Actual Cost (ACL dari execution        │
              │  (Cost Code sync)  │   real-time      │   existing: project_expenses, kasbons,   │
              └─────────┬──────────┘                  │   daily_wage_logs, dll)                   │
                        │                              └────────────────────────────────────────┘
                        ├──────────────────────┐
                        ▼                       ▼
              ┌───────────────────┐   ┌───────────────────┐
              │ Cashflow Forecast  │   │  Historical Cost   │
              │ (ke Finance,       │   │  Intelligence       │◀──── AI Recommendation
              │  TIDAK memicu      │   │  (siklus 9-tahap,   │      (saran berbasis histori)
              │  capability lain)  │   │  lihat `36` §C)      │
              └───────────────────┘   └─────────┬───────────┘
                                                  │ LessonsLearnedPropagated
                                                  │ (TIGA target SERENTAK)
                        ┌─────────────────────────┼─────────────────────────┐
                        ▼                          ▼                         ▼
              ┌─────────────────┐      ┌───────────────────┐      ┌────────────────────┐
              │ Assembly Library │      │    Price Book      │      │ Productivity Library│
              │ (Company AHSP    │      │ (entry baru/revisi)│      │ (Record diperbarui) │
              │  naik versi)     │      │                     │      │                      │
              └─────────────────┘      └───────────────────┘      └────────────────────┘
                        │                          │                         │
                        └──────────────────────────┴─────────────────────────┘
                                                     │
                                        LOOP KEMBALI KE ATAS
                                     (Next Estimate lebih akurat)
                                                     │
                                                     ▼
                                          Tender Estimation / RAP Builder
                                          (proyek berikutnya, angka sudah diperbarui)


AI Estimation (input Excel/PDF/DWG/Foto) ──▶ masuk sebagai draft ke Tender Estimation / RAP Builder
                                              (paralel, bukan bagian rantai linear utama — lihat §14)
```

**Yang paling penting terlihat dari diagram ini (bukan terlihat di `35` sebagai daftar):** CECEP bukan pipeline satu arah Tender→RAB→RAP→Budget→Procurement→Cost Control→Cashflow lalu SELESAI. Ada **loop balik eksplisit** dari Historical Cost Intelligence ke TIGA node hulu (Assembly Library, Price Book, Productivity Library) yang lalu dipakai LAGI oleh Tender Estimation berikutnya. Inilah representasi "sistem yang hidup" yang founder maksud — capability bukan berhenti di Cashflow Forecast, tapi memutar balik memperkaya fondasi untuk siklus berikutnya.

---

## Verifikasi Terhadap Intelligence Loop (`36` § C)

Diagram di atas HARUS konsisten dengan siklus 9-tahap yang sudah diverifikasi di `36`. Pengecekan silang:

| Tahap `36` § C | Node di Interaction Map | Konsisten? |
|---|---|---|
| Estimate (Approved) | Tender Estimation/RAP Builder → EstimateVersionApproved | ✅ |
| Execution | (di luar CECEP, existing Puraloka Suite) | ✅ — digambar sebagai ACL masuk ke Cost Control |
| Actual Cost | ACL box di tengah diagram | ✅ |
| Variance | Cost Control (real-time via Cost Code) | ✅ |
| Root Cause | Bagian dari Historical Cost Intelligence (`03b` §A.12, tidak dipisah jadi node sendiri di level Capability — sudah benar, ini detail Domain bukan Capability) | ✅ — konsisten karena Fase 3 bekerja di level capability, bukan sub-langkah domain |
| Lessons Learned | Historical Cost Intelligence | ✅ |
| Knowledge Update (3 target serentak) | Panah tiga-cabang ke Assembly/Price Book/Productivity | ✅ — diperbaiki dari draf awal founder, sesuai koreksi `36` §C |
| AI Learning | AI Recommendation mengonsumsi Historical Cost Intelligence | ✅ |
| Next Estimate | Loop kembali ke Tender Estimation/RAP Builder | ✅ |

**Tidak ditemukan kontradiksi.** Interaction Map ini adalah representasi LEBIH LUAS dari siklus `36` § C — `36` § C fokus ke loop pembelajaran saja, Interaction Map ini menempatkan loop itu di dalam konteks penuh 16 capability termasuk jalur estimasi awal (Tender→RAB) dan jalur kontrol (Budget→Cost Control→Cashflow) yang tidak dibahas `36` § C secara detail.

---

## Implikasi Eksplisit untuk Fase 6 (Domain Model)

Sesuai tujuan artefak ini sebagai jembatan, berikut Aggregate Root yang SUDAH TERLIHAT dari titik Output di peta ini — dicatat supaya Fase 6 tidak perlu menemukan ulang dari nol (meski Fase 6 tetap wajib memverifikasi, bukan menyalin buta):

- Dari **Tender Estimation/RAP Builder**: Estimate Version → Estimate Item → Assembly Reference → Resource Requirement → Cost Snapshot (persis pola yang founder contohkan).
- Dari **Historical Cost Intelligence**: Lessons Learned Record → Variance (Value Object) → Root Cause Analysis → tiga event keluar (Assembly Revision, Price Book Entry, Productivity Record) — BUKAN "Historical Record → Knowledge Revision → Price Revision → Confidence Score" linear seperti draf awal founder; strukturnya bercabang tiga di titik Propagate, bukan berurutan.
- **Budget Baseline** dikonfirmasi ULANG di sini sebagai thin capability: di Fase 6 kemungkinan besar bukan Aggregate Root baru sama sekali, hanya field/flag di Estimate Version.

---

## Definition of Done Self-Check (per `34`, dijalankan ulang sesuai instruksi founder)

| Kriteria | Status | Bukti |
|---|---|---|
| 1. Memperkuat ≥1 capability CECEP | ✓ | Setiap panah di diagram menghubungkan dua capability yang sudah tervalidasi `35`/`36` |
| 2. Mengurangi implementation uncertainty | ✓ | Fase 6 sekarang tahu PERSIS titik mana jadi Aggregate Root (§ Implikasi di atas), tidak perlu menebak dari daftar capability datar |
| 3. Menghasilkan artefak konkret | ✓ | Diagram terhubung penuh + tabel Input/Transformation/Output/Consumer per capability |
| 4. Tidak memperkenalkan Framework concept sebagai fokus | ✓ | Nol istilah Article 8 terlarang; "Interaction Map" sendiri bukan istilah metodologis CECEP-independen — isinya 100% nama capability domain |
| 5. Lolos Construction Removal Test | ✓ | Hapus "construction" → diagram runtuh total, setiap node adalah istilah domain (Assembly/AHSP/RAB/RAP/BOQ) |
| 6. Memenuhi Constitution 8 Artikel | ✓ | Article 5 (Depth Limit) dipakai eksplisit menjaga AI Estimation/Recommendation tetap "isi ditunda" — tidak tergoda mendesain lebih dalam meski sedang membangun peta koneksi |
| 7. Meningkatkan implementation readiness | ✓ | Ini SECARA LITERAL tujuan tunggal artefak ini — jembatan Fase 3→6 |

**Hasil:** 7/7 ✓.

---

## 🔒 STATUS: FROZEN PERMANENTLY

Phase 3 di-Freeze permanen bersama [`35`](35-phase3-capability-architecture.md), [`36`](36-phase3-capability-boundary-validation.md), [`38`](38-phase3-domain-readiness-assessment.md). Perubahan hanya lewat ADR resmi.
