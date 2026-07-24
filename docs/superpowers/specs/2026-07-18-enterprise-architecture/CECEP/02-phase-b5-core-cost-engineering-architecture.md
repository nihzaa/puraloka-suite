# CECEP — Phase B.5: Core Cost Engineering Architecture (v4 — Final)

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Fase baru, disisipkan **di antara Phase B dan Phase C**, atas usulan eksplisit founder. Bukan implementasi — mendefinisikan "bahasa bersama" domain yang akan dipakai konsisten di seluruh CECEP.
**Status dokumen ini:** Planning only — level konsep (objek, relasi, prinsip), BUKAN skema database/kolom. Versi ini MENGGANTIKAN v1 — v1 dianggap arah benar tapi boundary antar domain (CBS/Cost Code/WBS, RBS) kurang tegas, berisiko tumpang tindih di Phase D-F.
**Metodologi khusus fase ini:** Beberapa prinsip **dikunci** oleh founder (Cost Code sebagai universal identifier, Workflow sebagai configurable lifecycle, Approval sebagai configurable bukan role hardcoded) — di luar itu, founder eksplisit mengizinkan riset dan rekomendasi orisinal.

---

## Identitas Resmi CECEP dan Posisinya di Puraloka Suite (Ditegaskan di Sini, Berlaku Seluruh Dokumen Selanjutnya)

**Kalimat identitas resmi (verbatim, WAJIB dipakai konsisten di seluruh dokumen CECEP ke depan):**

> CECEP (Construction Estimation & Cost Engineering Platform) is the Cost Intelligence Core of Puraloka Suite. Although its name contains the word "Estimation", CECEP is not merely an estimating tool or RAB builder. It is an end-to-end Cost Engineering Platform that manages the complete lifecycle of project cost knowledge — from conceptual estimating, AHSP, RAP, RAB, cost planning, procurement planning, budget baseline, cost control, EVM, lessons learned, and continuous company knowledge improvement.

**Klarifikasi eksplisit — nama TIDAK berubah, narasi yang diperkuat:** Akronim CECEP dipertahankan persis seperti disepakati sejak Phase A. Kata "Estimation" tetap relevan karena estimasi adalah **entry point** seluruh lifecycle (Tender→Estimate→Scenario→Calculation Strategy→RAB→RAP→Budget→Procurement→Cashflow→EVM→Lessons Learned — semua berawal dari Estimate) — bukan karena CECEP hanya berfungsi sebagai alat membuat RAB.

### Hierarki Visi (4 Lapis)

```
Lapis 1 — Nama produk:         CECEP (akronim resmi, tidak berubah)
Lapis 2 — Posisi bisnis:       Cost Intelligence Core (dari Puraloka Suite)
Lapis 3 — Filosofi arsitektur: Company Knowledge System (Foundational Principle Kedua)
Lapis 4 — Visi jangka panjang: Company Intelligence Platform / self-improving system
```

### Posisi CECEP di Dalam Puraloka Suite (Klarifikasi Struktural)

**CECEP bukan produk berdiri sendiri, dan bukan pengganti Puraloka Suite** — CECEP adalah **satu Core Platform di dalam Puraloka Suite**, sejajar dengan Procurement, Finance, HR, CRM, Document Management, Asset Management, dan modul besar lain yang sudah ada (Phase A):

```
Puraloka Suite (Enterprise Construction Platform)
  ├── Project Management
  ├── Procurement          ← sudah ada, matang (Phase A)
  ├── Finance               ← sudah ada, matang (Phase A)
  ├── HR / Payroll
  ├── CRM
  ├── Document Management
  ├── Asset Management
  ├── ...
  └── CECEP (Cost Intelligence Core)
        ├── Estimate Engine
        ├── Calculation Strategy
        ├── Assembly Engine (AHSP)
        ├── RAP Engine
        ├── RAB Builder
        ├── Cost Code System
        ├── CBS / WBS / RBS
        ├── Pricing Engine (Price Book)
        ├── Calculation Engine (Formula)
        ├── Conversion Engine (Unit)
        ├── AI Estimation
        ├── Lessons Learned
        └── Company Knowledge
```

**Implikasi arsitektur:** CECEP tetap terintegrasi erat dengan modul existing Puraloka Suite (Procurement, Finance, dst — via Cost Code sebagai universal identifier, § 6) tapi punya batas domain jelas sebagai Core Platform tersendiri — bukan modul yang menempel di RAB existing.

---

## FOUNDATIONAL PRINCIPLE KEDUA — CECEP adalah Company Knowledge System

**Verbatim founder, status: PRINSIP MENGIKAT, harus jadi benang merah Phase C-F (setara tingkatnya dengan Foundational Principle pertama di Phase B — Company Intelligence Loop):**

> CECEP is not a Cost Calculation System. It is a Company Knowledge System.
>
> Semua entity (Estimate, Cost Code, AHSP, Formula, Price Book, RAP, Lessons Learned, Company Standard, AI Recommendation) harus diperlakukan sebagai knowledge asset yang: versioned, traceable, explainable, reusable, continuously improved.
>
> Target akhirnya bukan menghasilkan RAB, tetapi membuat estimasi perusahaan semakin akurat setiap proyek melalui akumulasi pengetahuan.

**Instruksi eksplisit untuk Phase C-F:** Jangan hanya memikirkan "bagaimana menghitung biaya" — wajib juga memikirkan "bagaimana sistem menyimpan, menghubungkan, memvalidasi, dan mengembangkan pengetahuan cost engineering perusahaan."

**Dua lensa evaluasi wajib untuk setiap keputusan desain mulai Phase C:**
1. Apakah ini mendukung Company Intelligence Loop (Phase B) — proyek memperbaiki pengetahuan untuk proyek berikutnya?
2. Apakah entity yang didesain diperlakukan sebagai *knowledge asset* (versioned/traceable/explainable/reusable/continuously improved), bukan sekadar data transaksional?

**Reposisi bahasa CECEP:** Bukan sekadar "Construction Intelligence Platform" (Phase B) — deskriptor yang lebih tajam: **self-improving estimation platform**. Setiap proyek yang selesai adalah investasi pengetahuan, bukan transaksi yang berakhir begitu invoice terakhir lunas.

---

## Kenapa Fase Ini Ada (Alasan Founder)

> Phase C (Problem Discovery) akan jauh lebih tajam jika sudah mengetahui "objek inti" yang akan dipakai sistem. Tanpa fondasi ini, ada risiko Phase C hanya mendeskripsikan masalah bisnis tanpa menghubungkannya ke model domain yang nantinya harus diimplementasikan.

Dua belas komponen di bawah adalah objek domain yang akan dirujuk berulang di Phase C ke atas — **kosakata bersama**, bukan daftar fitur.

---

## Peta Relasi 12 Komponen (Revisi — WBS dan CBS sebagai Dua Lensa Paralel, Bukan Rantai Linear)

**Koreksi penting dari v1:** Diagram v1 menempatkan Cost Code sebagai node tunggal di puncak dengan panah satu arah ke bawah — ini menyiratkan hierarki strict yang **tidak akurat**, karena CBS↔Cost Code (dan WBS↔Cost Code) adalah relasi **many-to-many**, bukan parent-child satu arah. Revisi ini menggambarkan WBS dan CBS sebagai dua *lensa* paralel terhadap Project yang sama-sama terhubung ke Estimate Item lewat Cost Code sebagai titik temu:

```
                              Project
                         ┌───────┴───────┐
                         ▼               ▼
                    ┌────────┐      ┌────────┐
                    │  WBS   │      │  CBS   │   ← dua LENSA paralel,
                    │(ruang  │      │(biaya  │     bukan sekuensial
                    │lingkup/│      │dikelom-│
                    │jadwal) │      │pokkan) │
                    └───┬────┘      └───┬────┘
                        │               │
                        └───────┬───────┘
                                ▼
                        ┌───────────────┐
                        │ Estimate Item │
                        └───────┬───────┘
                                │  (many-to-many)
                                ▼
                        ┌───────────────┐
                        │   Cost Code    │  ← universal identifier,
                        │ (identitas)    │    dirujuk ulang oleh 17 domain
                        └───────┬───────┘    (Procurement/Inventory/Finance/dst)
                                │
                                ▼
                        ┌───────────────┐
                        │ Assembly/AHSP  │  ← "jantung CECEP"
                        └───────┬───────┘
                                │
                                ▼
                        ┌───────────────┐
                        │  Resources     │
                        │    (RBS)       │  ← resource taxonomy,
                        └───────┬───────┘    dipakai 10 domain hilir
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        ┌──────────────┐ ┌────────────┐ ┌────────────────┐
        │ Productivity  │ │  4 Price   │ │ Unit Conversion │
        │   Library     │ │   Books    │ │     Engine      │
        └──────────────┘ └────────────┘ └────────────────┘
                │               │
                └───────┬───────┘
                        ▼
                 ┌─────────────┐
                 │Formula Engine│
                 └──────┬──────┘
                        ▼
        (hasil kalkulasi → RAP/RAB/Budget/Cashflow — Phase D,
         dibungkus dalam Multi-Scenario Estimate + Estimation Workflow)
                        │
                        ▼
              ┌─────────────────────┐
              │   AI Learning Loop   │
              │ (Configurable        │
              │  Approval Workflow)  │
              └─────────────────────┘
```

---

## 0. WBS vs CBS vs Cost Code — Tiga Domain Berbeda (Penegasan Boundary, Paling Kritis di Revisi Ini)

**Ini bukan komponen baru berdiri sendiri — ini klarifikasi boundary yang WAJIB dipahami sebelum membaca § 1 dan § 6, supaya Phase D-F tidak tumpang tindih mendesain ketiganya sebagai hal yang sama.**

| Domain | Menjawab Pertanyaan | Sifat | Contoh |
|---|---|---|---|
| **WBS** (Work Breakdown Structure) | *Bagaimana proyek dipecah berdasarkan ruang lingkup pekerjaan* — domain planning/execution | Berorientasi waktu/lokasi eksekusi | "Minggu 3 — Pekerjaan Pondasi Zona A" |
| **CBS** (Cost Breakdown Structure) | *Bagaimana biaya dikelompokkan dan dianalisis* — domain finansial | Berorientasi kategori biaya | "Foundation" (kategori biaya, bukan waktu) |
| **Cost Code** | *Identitas universal apa yang menghubungkan semua domain* | Identifier lintas-platform | "CC-010101 — Manual Excavation" |

### Kenapa WBS Relevan (Terhubung ke Kapabilitas Existing Puraloka Suite)

WBS bukan konsep asing di codebase — ia selaras dengan kapabilitas yang **sudah matang** di Phase A: Gantt Chart (`gantt-section.tsx`), kolom `rab_items.planned_start`/`planned_end`/`gantt_dependencies`. WBS di CECEP adalah generalisasi dari kapabilitas jadwal yang sudah ada, diberi kedudukan formal sebagai domain terpisah dari CBS — bukan membangun dari nol.

### Relasi Many-to-Many (Contoh Konkret Founder)

**Satu Cost Code dipakai di banyak node CBS berbeda:**
```
Cost Code CC-010101 "Manual Excavation" dipakai di:
  - Pondasi        (CBS: Foundation)
  - Septictank      (CBS: External Works / Plumbing)
  - Drainase        (CBS: External Works)
  - Lift Pit        (CBS: Structure)
```

**Satu node CBS berisi banyak Cost Code:**
```
Foundation (CBS node)
  ├── Excavation      → Cost Code CC-010101
  ├── Lean Concrete   → Cost Code CC-0202xx
  ├── Rebar           → Cost Code CC-0303xx
  └── Formwork        → Cost Code CC-0404xx
```

**Prinsip:** Relasi ini TIDAK PERNAH 1:1 pada arah manapun. Cost Code adalah identitas *pekerjaan generik* yang bisa dipakai ulang di konteks CBS/WBS apa pun; CBS/WBS adalah *struktur kontekstual* yang mengelompokkan Cost Code sesuai kebutuhan analisis biaya (CBS) atau jadwal (WBS).

---

## 1. Cost Breakdown Structure (CBS) — Fondasi Analisis Biaya

**Kedudukan:** Menurut founder, "seluruh CECEP nantinya sebenarnya berputar di sini." **Klarifikasi v2:** CBS adalah satu dari dua *lensa* terhadap Project (lensa satunya adalah WBS, § 0) — CBS spesifik untuk analisis biaya, bukan satu-satunya struktur proyek.

### Struktur Konseptual

```
Project
  └── CBS (Cost Breakdown Structure)
        ├── Site Preparation
        ├── Earthwork
        ├── Foundation
        ├── Structure
        ├── Roof
        ├── Finishing
        ├── MEP
        └── External Works
```

Setiap node CBS adalah titik agregasi untuk rantai:
```
CBS → Estimate Item → Cost Code → Assembly → Resource → Price → RAP → RAB →
Budget → Cashflow → Progress → Actual Cost → Variance
```

### Tiga Lapis CBS

| Lapis | Fungsi | Sifat |
|---|---|---|
| **Standard CBS Indonesia** | Rujukan generik — bukan satu standar resmi tunggal (Puraloka Persada sudah pakai multi-referensi Bina Marga + Cipta Karya, Phase B § 0), melainkan struktur payung yang menaungi keduanya | Bootstrap, versioned, tidak diedit langsung |
| **Company CBS** | Turunan Standard CBS disesuaikan pola kerja Puraloka Persada (mis. node "Pengurugan Lahan"/"Pemagaran Kawasan") | Editable, versioned, tumbuh dari pengalaman |
| **Project CBS** | Instance konkret per proyek | Snapshot, tetap terhubung ke Company CBS asal |

### Kenapa CBS Harus Generik

CBS **tidak boleh mengasumsikan tipe pekerjaan** di level strukturnya — "Site Preparation", "Foundation" dst adalah **kategori pekerjaan** (cocok gedung maupun sipil), bukan kategori spasial. Dimensi spasial (lantai/zona/segmen) adalah **atribut tambahan** pada node CBS, bukan level hierarki wajib.

---

## 2. Resource Breakdown Structure (RBS) — Resource Taxonomy Perusahaan

**Kedudukan (diperkuat v2):** RBS **bukan hanya** daftar Material/Labor/Equipment/Subcontract — RBS adalah **taksonomi resource perusahaan** yang dipakai bersama oleh 10 domain hilir: AHSP/Assembly, RAP, RAB, Procurement, Inventory, Equipment, Payroll, Productivity, Cost Analysis, Lessons Learned.

### Struktur Konseptual (Diperluas)

```
RBS (Resource Breakdown Structure)
  ├── Labor
  │     ├── Tukang Batu
  │     ├── Tukang Besi
  │     └── Helper
  ├── Equipment
  │     ├── Excavator
  │     ├── Crane
  │     └── Concrete Pump
  ├── Material
  │     ├── Semen
  │     ├── Pasir
  │     └── Besi
  └── Subcontract
        ├── Waterproofing
        ├── ACP
        └── Lift
```

*(Kategori lain dari Phase B § 4 — Tools, Consumable, Transportation, Waste, Temporary Work, Site Facilities, Overhead, Indirect Cost, Risk, Profit, Tax — tetap bagian RBS, disederhanakan di diagram ini untuk fokus pada 4 kategori utama contoh founder.)*

### Prinsip Identitas Konsisten (Paralel dengan Cost Code)

RBS dan Cost Code (§ 0) sama-sama sistem identitas lintas domain, bedanya level: **Cost Code = identitas PEKERJAAN, RBS = identitas RESOURCE.** "Tukang Besi" yang direferensikan di Assembly (§ 3) harus jadi entitas yang **sama persis** dengan "Tukang Besi" yang dirujuk Payroll (pembayaran aktual) dan Productivity Library (§ 5, produktivitas aktual per resource itu) — bukan tiga catatan terpisah yang kebetulan bernama sama.

### Kenapa RBS Fondasional

RAP tinggal menjumlahkan resource dengan harga aktual (§ 4), Cashflow tinggal memproyeksikan timing kebutuhan resource, Procurement tinggal mengagregasi Material dari seluruh RBS proyek, Equipment planning tinggal melihat resource kategori Equipment lintas proyek.

---

## 3. Assembly Library — "Jantung CECEP"

**Kedudukan:** Lebih penting dari sekadar AHSP — Assembly adalah unit reusable yang menyatukan CBS, RBS, dan proses kerja jadi satu paket.

### Struktur Konseptual

```
Kolom Beton 30x30 (Assembly)
  └── Sequence: Bekisting → Pembesian → Pengecoran → Curing → Finishing
```

Atribut lengkap: `resource (dari RBS), quantity, productivity (dari § 5), waste, crew, equipment, duration, method`.

### Relasi dengan AHSP

Assembly adalah **superset** dari AHSP: AHSP nasional/company (Phase B § 1) adalah *satu jenis* Assembly — yang formula resource-nya bersumber dari referensi AHSP. Assembly juga bisa dari Custom Assembly (Phase B § 1.4). **Semua AHSP adalah Assembly, tapi tidak semua Assembly adalah AHSP.**

### Dua Keluarga Assembly (General Contractor, Phase B § 0)

**Building Assembly** (Kolom Beton, Pasangan Bata) dan **Civil/Sitework Assembly** (Pengurugan per layer, Pemadatan, Pemagaran) — keduanya warga kelas satu, bukan Civil sebagai kasus khusus.

---

## 4. Versioned Price Book — Empat Jenis, Bukan Satu

**Prinsip governing (diperkuat v2, verbatim founder):**

> AHSP = cara menghitung. Price Book = harga. ... Karena harga adalah knowledge. Bukan angka.

### Empat Price Book Terpisah (Bukan Satu "Company Price Book" Generik)

```
Material Price Book
Labor Price Book
Equipment Price Book
Subcontract Price Book
```

**Kenapa dipisah per jenis resource, bukan satu tabel harga generik:** Karakteristik masing-masing sangat berbeda — harga Material terikat lead time & lokasi supplier, harga Labor terikat wilayah & musim (mis. tarif tukang naik saat panen), harga Equipment terikat sewa harian/bulanan & availability, harga Subcontract terikat scope kerja yang sering unik per proyek. Memaksakan struktur tunggal untuk keempatnya akan kehilangan nuansa yang justru paling penting untuk akurasi.

### Atribut Wajib di SETIAP Price Book (Bukan Hanya Material)

```
Version | Effective Date | Expired Date | Location | Currency |
Supplier | Confidence Level | Verified By
```

**Tiga atribut baru yang diperkuat di v2 (belum eksplisit di v1):**
- **Currency** — relevan untuk Future Vision Phase J (multi-currency, proyek internasional).
- **Confidence Level** — skor keandalan harga, berbeda dari sekadar riwayat versi; harga dari Supplier Quote yang baru masuk minggu ini punya confidence lebih tinggi dari harga Company Price Book yang belum diperbarui 6 bulan.
- **Verified By** — siapa yang memvalidasi harga ini, **echo langsung dari Configurable Approval Workflow (§ 10)** — validasi bukan hanya terjadi di Lessons Learned, tapi juga di setiap entri Price Book.

### Relasi dengan Price Book Hierarchy (Phase B § 2)

Empat Price Book ini beroperasi **di setiap tingkat** hierarki 6-level Phase B (National → Regional → Company → Project → Supplier Quote → Manual Override) — bukan hierarki terpisah. Contoh: "Material Price Book" punya entri di tingkat National (AHSP referensi), Regional (rata-rata wilayah), Company (harga standar Puraloka Persada), dst.

---

## 5. Productivity Library

**Prinsip governing:** AHSP nasional bilang pengecoran = 0.5 OH, realita Puraloka Persada bisa 0.42 OH. Company Productivity harus berkembang dari data riil.

### Relasi dengan Komponen Lain

Productivity Library adalah **parameter yang dipakai Formula Engine (§ 8)** untuk menghitung durasi dan crew size dalam Assembly (§ 3) — terhubung ke resource Labor/Equipment di RBS (§ 2) secara spesifik (produktivitas melekat pada kombinasi resource + jenis pekerjaan, bukan resource sendirian).

### Kenapa Terhubung Langsung ke AI Learning Loop

Produktivitas adalah salah satu angka paling **objektif terukur** pasca-proyek (durasi aktual ÷ volume = produktivitas aktual) — kandidat data pertama paling realistis untuk AI belajar, dibanding angka lebih subjektif seperti Risk Allowance.

---

## 6. Cost Code System — Universal Identifier Lintas Platform

*(Lihat juga § 0 untuk boundary vs CBS/WBS — bagian ini fokus pada Cost Code sebagai sistem, bukan perbandingannya dengan domain lain.)*

**Prinsip governing (verbatim founder, status: PRINSIP TERKUNCI, format TIDAK dikunci):**

> Cost Code harus menjadi identitas universal yang dipakai lintas seluruh platform, bukan hanya modul estimasi.

### 17 Domain yang Wajib Bisa Mereferensikan Satu Cost Code yang Sama

CBS, WBS, BOQ, AHSP/Assembly, RAB, RAP, Budget, Procurement, Material Requirement, Inventory, Equipment, Payroll, Finance, Cashflow, Progress, EVM, Actual Cost, Lessons Learned, AI Knowledge Base.

### Kenapa Ini Level Prinsip

Cost Code adalah **kunci penyambung** yang membuat satu angka biaya di RAB bisa "ditemukan kembali" identik di Procurement, Progress, Actual Cost, EVM — tanpa itu, setiap domain akan punya cara sendiri merujuk "pekerjaan yang sama", mengulang 7 titik duplikasi kalkulasi yang sudah ditemukan di Phase A.

### Riset Pembanding (Referensi, Bukan Keputusan Final)

- **MasterFormat** (CSI) — 50 divisi, berbasis jenis pekerjaan/spesifikasi, umum di tender internasional.
- **UniFormat** — berbasis elemen bangunan fungsional (Foundation, Superstructure), cocok untuk estimasi awal/konseptual.
- **WBS generik** — dekomposisi tugas, tidak spesifik konstruksi.

**Observasi:** Karena Puraloka Persada lintas gedung dan sipil, Cost Code kemungkinan butuh kombinasi — mirip UniFormat untuk level atas, dengan ekstensi kategori sipil yang tidak eksplisit di UniFormat asli. Format detail final: Phase F.

---

## 7. Unit Conversion Engine

**Prinsip governing:** Terlihat kecil, dipakai di seluruh sistem — kalau tidak didesain dari awal, nanti kacau.

```
1 sak semen → 50 kg → 0.05 ton
1 m³ beton → 350 kg semen + 0.65 m³ pasir + 0.85 m³ split
```

### Dua Jenis Konversi

1. **Konversi satuan murni** (sak→kg→ton) — rasio matematis tetap, universal, *reference data* stabil.
2. **Konversi komposisi/formula** (1 m³ beton → breakdown resource) — ini **output Formula Engine (§ 8)**, bukan konversi satuan murni — hasil kalkulasi yang berbeda per Company AHSP/Assembly.

### Kenapa Fondasional

Procurement, Inventory, dan Cost Code (§ 6) yang menyambungkan RAB↔Procurement↔Inventory hanya berguna kalau satuan bisa saling diterjemahkan otomatis.

---

## 8. Formula Engine — Pembeda Utama CECEP

**Prinsip governing:** Bukan `qty × price` statis, tapi `Formula + Version + Variable + Parameter + Expression` yang bisa dibuat user tanpa coding.

```
Concrete Volume = length × width × height
Steel Weight     = Length × Unit Weight
Paint            = Area × Coating × Waste
```

### Kenapa "Tanpa Coding" adalah Requirement Arsitektural

Menghubungkan langsung ke Calculation Philosophy (Phase B § 6) dan Greenfield Adoption (Phase B): *"master dataset must be replaceable... without requiring schema changes or source-code modifications."* Formula Engine adalah mekanisme konkret yang mewujudkan janji itu.

---

## 9. Estimation Workflow — Configurable Lifecycle

**Prinsip terkunci:** Configurable lifecycle mendukung berbagai jenis proyek, scenario, versioning, approval, audit trail, branching, comparison, rollback, baseline — bukan urutan langkah kaku.

Delapan prinsip wajib: (1) setiap estimate punya lifecycle, (2) setiap perubahan punya approval, (3) setiap revisi punya version history, (4) setiap baseline bisa dibekukan, (5) seluruh keputusan bisa diaudit, (6) estimate bisa bercabang, (7) estimate bisa dibandingkan, (8) estimate bisa rollback.

### Rekomendasi Arah (Riset)

State machine generik dengan status yang bisa dikonfigurasi per tipe proyek — konsisten pola `change_orders` yang sudah terbukti di Puraloka Suite (`draft → submitted → approved/rejected`).

**Kategori status generik (kerangka untuk Phase D):** Draft → Under Review → Approved → Baseline/Frozen → Superseded. Setiap Scenario (§ 12) berjalan lewat status ini **independen**.

---

## 10. Configurable Approval Workflow — Bukan Hardcoded Role (Revisi Total dari "Manager Validation")

**Koreksi penting dari v1:** v1 sempat membiarkan pertanyaan "siapa Manager" terbuka dengan asumsi implisit jawabannya adalah satu role tertentu (PM/Admin). **Founder eksplisit menolak pendekatan ini.**

**Prinsip governing (verbatim founder):**

> Jangan hardcode siapa yang menjadi validator. Validation Workflow harus sepenuhnya configurable melalui Workflow Engine dan RBAC.

### Yang Divalidasi: Estimate Version, Bukan Orang

Ilustrasi skala berbeda (bukan aturan tetap — contoh kompleksitas):
- **Perusahaan kecil** → cukup Direktur
- **Perusahaan menengah** → Estimator → Cost Control → Project Manager
- **Perusahaan besar** → Estimator → Discipline Lead → Cost Engineer → Cost Manager → Director

### Tujuh Dimensi Konfigurasi Approval Chain

Setiap approval step configurable berdasarkan: **Company, Branch, Project Type, Contract Value, Estimate Type, Cost Threshold, Risk Level.**

### Kenapa Ini Penting secara Arsitektural

Approval chain adalah **data/konfigurasi**, bukan hardcoded logic — Permission Model (RBAC, sudah ada fondasinya di Puraloka Suite existing lewat `role_permissions`/migration 050) **tidak perlu diubah** ketika workflow approval perusahaan berubah. Ini jauh lebih enterprise daripada jawaban sederhana "validator = role X" — mendukung Greenfield Adoption (Phase B): perusahaan kecil mulai dengan approval chain sederhana (Level 1 Maturity), lalu memperumit chain-nya seiring tumbuh (Level 2-3), **tanpa perubahan skema/kode**.

### Relasi dengan AI Learning Loop

```
Project Finish → Variance → Root Cause → [Configurable Approval Workflow] →
Knowledge Approved → Company Database Updated → AI Retraining Dataset →
Next Estimate Improved
```

**Poin paling penting (verbatim founder):** *"AI tidak boleh langsung belajar. Harus ada approval."* — approval ini sekarang eksplisit configurable, bukan satu role tetap, dan berlaku bukan cuma di Lessons Learned tapi juga di setiap entri Price Book (§ 4, `Verified By`) dan setiap Estimate Version (§ 9).

---

## 11. AI Learning Loop

**Kedudukan:** Konsumen akhir dari seluruh rantai Phase B.5. Variance dibandingkan terhadap CBS+RBS+Assembly+Price Book+Productivity yang dipakai saat estimasi, dan begitu disetujui lewat Configurable Approval Workflow (§ 10), hasil validasi **mengalir kembali** memperbarui Company AHSP, Company Price Book (§ 4), dan Productivity Library (§ 5) — menutup Company Intelligence Loop (Foundational Principle, Phase B) dan menegaskan CECEP sebagai Company Knowledge System (Foundational Principle Kedua, di atas).

---

## 12. Multi-Scenario Estimate

**Prinsip governing:**

> One project may contain multiple estimate scenarios (Concept, Client Proposal, Internal RAP, VE Alternative, Revision, Final Baseline, etc.). Every scenario must be independently versioned, comparable, traceable, and auditable.

```
Project A
  Estimate
    ├── Scenario A — Tender
    ├── Scenario B — VE (Value Engineering)
    ├── Scenario C — Owner Revision
    ├── Scenario D — RAP
    └── Scenario E — Final Baseline
```

### Relasi dengan CBS/WBS/Cost Code

Setiap Scenario kemungkinan besar berbagi struktur CBS, WBS, dan Cost Code yang **sama** (supaya bisa dibandingkan apple-to-apple), tapi berbeda di hasil kalkulasi (Resource/Price/Formula result). **Scenario adalah lapisan hasil kalkulasi paralel, bukan struktur domain yang diduplikasi.**

### Relasi dengan Estimation Workflow (§ 9)

"Branch scenario" = Scenario baru dari Scenario existing (Scenario B "VE" adalah cabang dari Scenario A "Tender"); "comparison" = membandingkan angka antar Scenario langsung.

**Diperdalam (Round 4) — Scenario Comparison lintas dimensi, bukan cuma total harga:** CECEP harus bisa membandingkan Scenario pada **tujuh dimensi sekaligus**: Cost, Duration, Cashflow, Risk, Margin, Resource, Profit, EVM Impact. Contoh skenario nyata yang dibandingkan berdampingan: *Normal* vs *Supplier B* vs *Concrete fc25* vs *Precast* vs *Value Engineering* — kelima Scenario ini dievaluasi pada ketujuh dimensi yang sama, bukan sekadar dibandingkan total angka RAB-nya.

---

## FOUNDATIONAL PRINCIPLE KETIGA — Everything is Versioned

**Verbatim founder, status: PRINSIP MENGIKAT, level sejajar Foundational Principle pertama (Phase B) dan kedua (di atas):**

> Everything that affects estimation must be versioned.

Bukan hanya Estimate atau AHSP — **seluruh knowledge object** yang mempengaruhi hasil estimasi wajib versioned: Company AHSP, Formula, Price Book, Assembly, Cost Code, Unit Conversion, Productivity Standard, Productivity Curve, Risk Library, Contingency Rule, Template, Estimate, RAP, Lessons Learned.

**Instruksi eksplisit untuk Phase D-F:** Untuk setiap entity yang didesain, **selalu tanyakan**: *"Apakah entity ini perlu versioning?"* — sebelum memutuskan struktur datanya. Prinsip ini secara khusus dimaksudkan untuk menyelamatkan desain database dari revisi besar di kemudian hari (menambahkan versioning setelah skema sudah berjalan produksi jauh lebih mahal daripada mendesainnya sejak awal).

**Nuansa penting (diperjelas Round 5):** Prinsip ini adalah *default pertanyaan*, bukan *default jawaban* — "semua entity penting harus **dipertimbangkan** versioning terlebih dahulu **sebelum diputuskan** tidak perlu", bukan "semua entity wajib versioned tanpa kecuali". Ada entity yang setelah dipertimbangkan memang tidak butuh versioning (mis. data transaksional murni yang tidak pernah dirujuk ulang) — yang tidak boleh terjadi adalah keputusan "tidak perlu versioning" diambil tanpa pernah dipertimbangkan sama sekali.

---

## FOUNDATIONAL PRINCIPLE KEEMPAT — Everything is Derived, Nothing is Re-entered

**Verbatim founder, status: PRINSIP MENGIKAT, sejajar dengan Everything is Versioned — sama-sama mempengaruhi Domain Model, database, API, dan workflow di fase berikutnya:**

> Everything is Derived, Nothing is Re-entered.

**Definisi:**
- Data hanya dimasukkan **satu kali** di sumbernya.
- Semua data lain **diturunkan** (derived) dari sumber itu.
- **Tidak boleh** ada input ulang hanya untuk memenuhi kebutuhan modul lain.

**Contoh — satu Estimate menghasilkan semua ini, bukan di-input ulang manual per modul:**
```
Estimate → RAB
Estimate → RAP
Estimate → Budget
Estimate → Material Requirement
Estimate → Procurement Plan
Estimate → Cashflow Baseline
Estimate → EVM Baseline
```

**Alasan (verbatim founder):** "Satu sumber pengetahuan, banyak keluaran, tanpa duplikasi data maupun logika bisnis."

**Relasi dengan prinsip lain:**
- **Generalisasi dari "No Data Duplication"** (Constraint #4/#5 di bawah) — No Data Duplication fokus ke DATA (harga tidak disalin berulang di banyak tabel); Everything is Derived fokus lebih luas ke PROSES/INPUT (data tidak diinput ulang manual oleh user di modul yang berbeda).
- **Dua sisi mata uang dari prinsip "semua output berasal dari Estimate Engine yang sama"** (lihat 10 Prinsip Final di bawah, poin 8) — poin 8 menegaskan **satu mesin** yang menghasilkan; prinsip ini menegaskan **satu titik input** yang memicunya.

---

## Sepuluh Prinsip Final (Dikunci Sekarang — Rujukan Wajib untuk Seluruh Phase C ke Atas)

**Status: FINAL, ditetapkan eksplisit oleh founder sebagai daftar konsolidasi yang mengikat Phase C-F.** Berbeda dari nama Engine (§ di atas, sengaja belum dikunci), sepuluh prinsip di bawah **dikunci sekarang**, terlepas dari detail domain model yang belum final.

1. CECEP adalah **Core Cost Intelligence Platform** di dalam Puraloka Suite.
2. CECEP **bukan** sekadar Estimation Platform ataupun RAB Builder.
3. Semua keputusan biaya harus **explainable, traceable, versioned, dan reproducible**.
4. Cost Engine adalah **Decision Engine**, bukan Calculator.
5. **Tidak boleh ada duplicate source of truth.**
6. Semua Calculation Strategy harus **plug-in dan dapat diganti**.
7. Semua entity penting harus **dipertimbangkan** versioning terlebih dahulu sebelum diputuskan tidak perlu.
8. Semua output (RAB, RAP, Budget, Procurement, Cashflow, EVM, dsb.) berasal dari **Estimate Engine yang sama**.
9. Semua knowledge perusahaan harus kembali menjadi Company Knowledge melalui **Company Intelligence Loop**.
10. **Engine lebih penting daripada Module** — Module hanyalah UI/Workflow, sedangkan Engine adalah *business capability* yang reusable **lintas Puraloka Suite** (bukan cuma lintas komponen CECEP internal).

---

## Enam Constraint Arsitektur Tambahan (Dikunci Sebelum Phase C — Bukan Desain Teknis, Melainkan Batasan yang Harus Dijaga Phase C-F)

### 1. Explainability — Tidak Boleh Ada Black Box

Setiap angka output sistem — termasuk hasil AI — harus bisa dijelaskan sampai ke akar. Ini generalisasi dari RAB Traceability (Phase B § 7) yang sebelumnya spesifik untuk RAB, sekarang berlaku **lintas seluruh output sistem**.

**Contoh (founder):**
```
Output: "Harga Beton = Rp 1.230.000"

Penjelasan wajib bisa ditelusuri:
  ├── Material Price Book v3.2
  ├── Productivity v1.8
  ├── Concrete Formula v2.0
  ├── Waste Factor 5%
  ├── Supplier A
  ├── Wilayah Bandung
  └── Inflasi Juli 2026
```

Menurut founder, prinsip ini **lebih penting daripada AI itu sendiri** — AI yang akurat tapi tidak bisa menjelaskan alasannya tetap tidak bisa dipercaya untuk keputusan finansial bernilai besar.

### 2. Cost Engine sebagai Decision Engine, Bukan Calculator

**Alur lama (implisit sejauh ini di seluruh dokumen):** `Input → Calculation → Output`

**Alur yang WAJIB menggantikannya:**
```
Input → Validation → Calculation → Simulation → Comparison →
Recommendation → Approval → Baseline
```

Cost Engine bukan sekadar mesin hitung — ia adalah mesin **pengambilan keputusan**. Simulasi, perbandingan, dan rekomendasi bukan proses terpisah yang terjadi *setelah* kalkulasi selesai — mereka adalah bagian dari alur inti kalkulasi itu sendiri.

### 3. Scenario Comparison Lintas Dimensi

*(Lihat detail penuh di § 12 Multi-Scenario Estimate di atas — dicatat di sini sebagai constraint tingkat prinsip.)* Multi-scenario harus mendukung comparison, simulation, dan recommendation — bukan sekadar menghasilkan beberapa versi estimate yang berdiri sendiri-sendiri.

### 4. No Data Duplication — Single Source of Truth Ditegaskan Struktural

**Contoh pelanggaran yang harus dihindari:** Harga material tersimpan berulang di Price Book, Material, Supplier, AHSP, Assembly, DAN Estimate — lima/enam salinan angka yang sama.

**Struktur yang benar:**
```
Material Price Book (SATU sumber kebenaran)
  ↓ direferensikan (bukan disalin) oleh:
Assembly → Estimate → RAP
```

Assembly, Estimate, dan RAP **hanya menyimpan referensi** ke Price Book — tidak pernah menyalin angka harga ke tempatnya sendiri. Prinsip ini menghubungkan langsung ke Foundational Principle Ketiga (Everything is Versioned) — Single Source of Truth hanya bisa dijaga kalau setiap perubahan pada sumber (Price Book) otomatis "terlihat" oleh semua yang mereferensikannya, yang hanya mungkin kalau struktur datanya adalah referensi, bukan salinan.

### 5. No Data Duplication — Alasan Bisnis

Tanpa prinsip ini, "kalau tidak, nanti maintenance akan hancur" (verbatim founder) — setiap kali harga material berubah, tim harus mencari dan memperbarui 5-6 tempat berbeda secara manual, dengan risiko tinggi ada yang terlewat dan menyebabkan inkonsistensi data yang sulit dideteksi.

### 6. Engine-Based Thinking, Bukan Module-Based Thinking (PALING PENTING Menurut Founder)

**Reframing wajib — jangan sebut komponen Phase B.5 sebagai "Module":**

**Contoh reframing (working name, lihat catatan status di bawah):**

| JANGAN | PAKAI (working name) |
|---|---|
| AHSP Module | Assembly Engine |
| Formula Module | Calculation Engine |
| Price Module | Pricing Engine |
| Approval Module | Workflow Engine |
| Unit Conversion Module | Conversion Engine |

**Alasan (verbatim founder):** "Supaya nanti semuanya reusable." Module menyiratkan fitur yang berdiri sendiri dan dipakai di satu tempat; Engine menyiratkan kapabilitas generik yang **dipanggil ulang lintas domain — bahkan lintas Puraloka Suite, bukan cuma lintas komponen CECEP internal** (penegasan Round 5: Pricing Engine idealnya bisa dipanggil ulang oleh Procurement/Finance existing, bukan cuma dipakai di dalam CECEP).

### ⚠️ STATUS PENAMAAN: WORKING NAME — BELUM DIKUNCI (Keputusan Eksplisit Round 5)

**Koreksi metodologis penting dari founder:** Nama Engine di tabel manapun di dokumen ini adalah **working name**, BUKAN nama resmi final. Alasan: masih di Discovery Phase (A-C), belum masuk Domain Model (Phase D) — mengunci nama sebelum domain model matang berisiko memaksa Phase D bekerja mundur dari label, bukan dari kapabilitas. Contoh kemungkinan nama berubah (diberikan founder sendiri):
- "Intelligence Engine" (usulan Claude untuk § 11) → bisa jadi lebih tepat: *Knowledge Engine*, *Learning Engine*, atau *Cost Intelligence Engine*.
- "Scenario Engine" (usulan Claude untuk § 12) → bisa jadi lebih tepat: *Simulation Engine*, *Scenario Management Engine*, atau *Estimate Scenario Engine*.

**Yang WAJIB dikunci sekarang bukan nama, melainkan definisi kapabilitas setiap Engine** — tabel di bawah mengunci itu.

### Kapabilitas per Engine (Dikunci) — Nama Tetap Working Name (Belum Dikunci)

| Working Name | Single Responsibility | Input | Output |
|---|---|---|---|
| Assembly Engine | Menyusun resource+proses+durasi jadi paket kerja reusable | CBS/WBS node, RBS resource, Formula | Assembly siap pakai (§ 3) |
| Pricing Engine | Menyediakan harga resource ter-versi dari hierarki sumber yang tepat | RBS resource, konteks lokasi/waktu proyek | Harga resolved + jejak sumber (§ 4) |
| Productivity Engine | Menyediakan angka produktivitas ter-versi (bootstrap→company real) | RBS resource (Labor/Equipment), histori proyek | Rate produktivitas + confidence (§ 5) |
| Conversion Engine | Menerjemahkan satuan lintas modul | Nilai + satuan asal, satuan tujuan | Nilai terkonversi (§ 7) |
| Calculation Engine | Mengeksekusi formula tanpa perlu deploy kode baru | Formula (versioned), variable/parameter | Quantity/resource result (§ 8) |
| Workflow Engine | Mengatur lifecycle + approval configurable | Estimate Version, konfigurasi approval chain (7 dimensi) | Status transition + audit trail (§ 9, § 10) |
| *(working name #11)* | Menutup Company Intelligence Loop dengan validasi manusia wajib | Variance, Root Cause, hasil approval | Update ke Company AHSP/Price Book/Productivity (§ 11) |
| *(working name #12)* | Mengelola banyak Estimate Version paralel per Project, bisa dibandingkan | Scenario baru/existing, 7 dimensi perbandingan | Scenario ter-versi + hasil komparasi (§ 12) |

**Naming Review dijadwalkan setelah Phase D (Domain Model) selesai** — bukan diputuskan di Phase B.5 ini. Sampai saat itu, dokumen manapun yang merujuk komponen § 11/§ 12 secara sengaja TIDAK diberi nama Engine tetap, untuk menghindari kesan sudah final.

**Catatan tambahan:** CBS/WBS, RBS, dan Cost Code System sengaja **tidak** diberi nama Engine sama sekali (bukan cuma working name) — ketiganya adalah *struktur data dan sistem identitas* yang dikonsumsi Engine-Engine di atas, bukan mesin yang melakukan proses aktif.

---

## Ringkasan — 12 Komponen + 1 Klarifikasi Boundary

| # | Komponen | Peran Singkat |
|---|---|---|
| 0 | WBS vs CBS vs Cost Code | Klarifikasi boundary — tiga domain berbeda, bukan sinonim |
| 1 | CBS | Lensa analisis biaya |
| 2 | RBS | Resource taxonomy perusahaan, dipakai 10 domain |
| 3 | Assembly Library | Paket reusable — "jantung CECEP" |
| 4 | Versioned Price Book (4 jenis) | Harga sebagai knowledge asset, terpisah tegas dari cara menghitung |
| 5 | Productivity Library | Angka produktivitas riil |
| 6 | Cost Code System | Identitas universal, penyambung 17 domain |
| 7 | Unit Conversion Engine | Penerjemah satuan lintas modul |
| 8 | Formula Engine | Mesin kalkulasi tanpa coding |
| 9 | Estimation Workflow | Lifecycle configurable |
| 10 | Configurable Approval Workflow | Validasi berbasis konfigurasi, bukan role hardcoded |
| 11 | AI Learning Loop | Konsumen akhir, menutup Company Intelligence Loop |
| 12 | Multi-Scenario Estimate | Satu Project, banyak estimate paralel yang bisa dibandingkan |

**Observasi penutup:** WBS dan CBS adalah dua lensa paralel; Cost Code adalah benang penyambung; RBS adalah taksonomi resource; Assembly Engine (working name) adalah unit kerja; Calculation Engine (working name) adalah mesin di baliknya; Pricing Engine dan Productivity Engine (working name) adalah knowledge asset yang tumbuh; Workflow Engine (working name) memastikan validasi tidak terkunci ke satu role; komponen § 11-12 (nama belum dikunci) memungkinkan semuanya hidup dalam banyak versi yang bisa dibandingkan lintas dimensi dan menutup siklus — **seluruhnya adalah manifestasi konkret dari empat Foundational Principle: Company Intelligence Loop (Phase B), Company Knowledge System, Everything is Versioned, dan Everything is Derived Nothing is Re-entered.**

---

## Open Questions (Diperbarui)

1. **Urutan CBS spasial** (Zone→Floor vs Floor→Zone) — masih belum terjawab, relevan Phase F.
2. **Cakupan Standard CBS Indonesia** — preferensi mengikuti UniFormat-style atau pengelompokan RAB konvensional Indonesia?
3. ~~Siapa "Manager" di Manager Validation~~ — **TERJAWAB**: tidak ada role tunggal, sepenuhnya configurable (§ 10).
4. **Detail konfigurasi 7 dimensi approval** (§ 10) — apakah semua 7 dimensi relevan sejak fase awal implementasi, atau sebagian bisa menyusul (mis. "Branch" baru relevan kalau Puraloka Persada multi-cabang)?
5. ~~Nama final Engine § 11/§ 12~~ — **SENGAJA DITUNDA**: keputusan eksplisit, naming review dilakukan setelah Phase D (Domain Model) selesai, bukan sekarang.

## Required Decisions (Approval Gate)

1. Apakah boundary WBS/CBS/Cost Code (§ 0) dan revisi peta relasi sudah cukup tegas?
2. Apakah 4 Price Book terpisah (§ 4) dan Configurable Approval Workflow (§ 10) sudah sesuai arah?
3. Apakah keempat Foundational Principle dan 10 Prinsip Final sudah cukup eksplisit sebagai rujukan wajib untuk Phase C-F?
4. Apakah kapabilitas per Engine (single responsibility/input/output, tabel di § Engine-Based Thinking) sudah tepat, terlepas dari nama yang masih working name?
5. Apakah identitas resmi CECEP dan posisinya di dalam Puraloka Suite (Cost Intelligence Core, sejajar Procurement/Finance/dst) sudah menangkap maksud founder?
6. Apakah Phase B.5 v4 sudah cukup sebagai fondasi untuk lanjut ke Phase C?

---

## 🚦 APPROVAL GATE — ✅ LOCKED

**Phase B.5 disetujui founder dan resmi LOCKED.** Verbatim keputusan:

> Saya rasa Phase B.5 sudah cukup matang dan bisa dianggap LOCKED. Selama beberapa iterasi terakhir, kita sudah mengunci hal-hal yang memang seharusnya dikunci di level Discovery: Foundational Principles, Company Intelligence Loop, Greenfield Bootstrap Philosophy, Maturity Model, Cost Engineering Philosophy, Calculation Philosophy, WBS/CBS/RBS Boundary, Cost Code Philosophy, Engine-Based Thinking, Versioning Philosophy, Derived Data Philosophy, Company Knowledge Philosophy.

**Alasan berhenti di sini (bukan terus memperdalam):** batas antara Discovery dan Design mulai kabur — memperdalam lebih jauh berisiko masuk prematur ke Phase D (Domain Model) dan Phase F (Data Model) sebelum waktunya.

**Status final:** Dokumen ini (v4) adalah versi definitif Phase B.5 — tidak akan direvisi lagi kecuali ditemukan kontradiksi nyata saat Phase D-F dikerjakan. Lanjut ke **Phase C (Problem Discovery)**, dengan arahan strategis khusus — lihat [03-phase-c-problem-discovery.md](03-phase-c-problem-discovery.md).
