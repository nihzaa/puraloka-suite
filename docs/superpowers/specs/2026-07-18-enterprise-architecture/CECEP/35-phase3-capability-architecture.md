# CECEP — Phase 3: Capability Architecture

**Kedudukan:** Fase pertama Roadmap V2 ([`32`](32-cecep-roadmap-v2.md)) yang dikerjakan sebagai pekerjaan baru pasca-governance-freeze. Mengikuti [`34-roadmap-definition-of-done.md`](34-roadmap-definition-of-done.md) sebagai kriteria selesai. Dependency: Fase 1 ([`01`](01-phase-b-cost-engineering-discovery.md)/[`02`](02-phase-b5-core-cost-engineering-architecture.md)) dan Fase 2 ([`01`](01-phase-b-cost-engineering-discovery.md) § 8). **Fase 3 MENDAHULUI Fase 6 (Domain Model)** — koreksi dependency yang sudah dikunci di `32`/`33`.
**Article 6 check (wajib dijawab sebelum isi ditulis, per Constitution `30`):** Bagaimana fase ini membantu Tender/Estimating/AHSP/BOQ/RAB/RAP/Procurement/Cashflow/Forecast/Knowledge/AI secara konkret? Jawab: fase ini MENDEFINISIKAN kesebelas hal itu sebagai unit tanggung jawab (capability) dengan batas jelas — tanpa ini, Fase 5-12 tidak tahu "siapa memiliki apa" di level yang lebih tinggi dari domain/entity.
**Uji filter yang dipakai untuk SETIAP capability di bawah (instruksi founder):**
1. Capability CECEP apa yang diperkuat?
2. Ketidakpastian implementasi apa yang dihilangkan?
3. Implementasi konkret apa yang jadi lebih mudah karena keputusan ini?

Capability yang tidak lolos ketiganya secara konkret — digabung ke capability lain atau ditandai eksplisit sebagai belum layak berdiri sendiri (pola sama dengan Candidate Domain `03b` § B, bukan dipaksa masuk).

---

## Metodologi Penyusunan

Bahan baku: 12 Estimate Output (`01` § 8), 12 komponen + Engine working-name (`02`), 13 Confirmed Domain (`03b` § A). Capability BUKAN salinan 1:1 dari domain (Domain Model menjawab "objek apa"; Capability menjawab "kemampuan apa yang dimiliki platform, dilihat dari sudut pandang pengguna/bisnis") — satu capability sering dilayani beberapa domain sekaligus, dan sebaliknya.

---

## Daftar Capability — Diuji Satu per Satu

### 1. Tender Estimation

- **Capability diperkuat:** Tender.
- **Uncertainty dihilangkan:** Bagaimana estimasi awal (Tender/Engineer/Owner Estimate, `01` § 8 output #1-3) dibedakan dari Estimate lain secara struktural, bukan sekadar label.
- **Implementasi lebih mudah:** Tim tahu Tender Estimate = satu jenis Scenario (`03b` § A.9c) dengan tujuan spesifik "penawaran ke klien" — tidak perlu desain entity terpisah.
- **Domain pendukung:** Scenario, Estimate Version, Estimate Item, Assembly, Price Book.
- **Lolos filter:** ✅

### 2. BOQ Management

- **Capability diperkuat:** BOQ.
- **Uncertainty dihilangkan:** `01` § 8 menandai BOQ sebagai "sinonim RAB saat ini, belum entitas independen" — ini gap terbuka yang perlu keputusan eksplisit sekarang, bukan ditunda lagi.
- **Implementasi lebih mudah:** Keputusan: BOQ BUKAN capability independen dari RAB — ia adalah **tampilan (view) khusus dari Estimate Item pada satu Estimate Version**, difokuskan ke quantity+unit+deskripsi tanpa breakdown harga (dipakai untuk dokumen tender ke kontraktor/supplier). Sama persis pola RAB (`03b` § C.2, derived read-model, bukan domain terpisah).
- **Domain pendukung:** Estimate Item (sama seperti RAB).
- **Lolos filter:** ✅, dengan syarat digabung sebagai **Capability turunan dari RAB Builder**, bukan capability berdiri sendiri sejajar — dicatat di § Relasi Capability di bawah.

### 3. ~~AHSP Management~~ — DIHAPUS, dilebur ke #8 Assembly Library

**Revisi pasca-[`36-phase3-capability-boundary-validation.md`](36-phase3-capability-boundary-validation.md) § A.1:** Alasan awal ("sudut pandang pengguna berbeda") gagal No-Menu Test — itu alasan UI/menu, bukan business capability. `02` § 4 eksplisit: AHSP nasional/company adalah SATU JENIS Assembly. AHSP Nasional/Company/Project/Custom sekarang hidup sebagai empat SUMBER di dalam capability #8 Assembly Library, bukan node terpisah. Nomor #3 dipertahankan kosong (tidak dipakai ulang) supaya jejak perubahan tetap terlihat di riwayat dokumen.

### 4. Calculation Strategy

- **Capability diperkuat:** Seluruh kalkulasi biaya (lintas AHSP/RAB/RAP).
- **Uncertainty dihilangkan:** Bagaimana strategi kalkulasi berbeda dipilih PER WORK ITEM (Bina Marga vs Cipta Karya vs Custom) tanpa cabang kode.
- **Implementasi lebih mudah:** Ini yang akan didalami penuh di Fase 5 — di sini cukup dikunci sebagai capability terpisah dari AHSP Management, karena Strategy adalah MEKANISME PEMILIHAN, AHSP adalah SALAH SATU SUMBERNYA.
- **Domain pendukung:** Formula Engine (`03b` § A.7).
- **Lolos filter:** ✅ — tapi ditandai **cross-cutting**, dikonsumsi hampir semua capability lain, bukan capability yang berdiri sejajar dalam alur kerja linear.

### 5. Resource Identity *(diganti nama dari "Resource Management")*

**Revisi pasca-`36` § A.2:** No-Menu Test membuktikan "Resource Management" adalah NAMESPACE, bukan capability tunggal — dampak bisnisnya berbeda per kategori (Material→Procurement, Labor→Payroll/HR, Equipment→Asset Management existing). Dipersempit eksplisit jadi HANYA soal identitas lintas domain (bukan operasional/planning — itu tanggung jawab RAP Builder dan Procurement Planning).

- **Capability diperkuat:** RBS (Labor/Equipment/Material/Subcontract, `01` § 4) — sebagai identitas, bukan perencanaan pemakaian.
- **Uncertainty dihilangkan:** Identitas resource yang SAMA dipakai lintas Assembly/Procurement/Payroll — tanpa capability ini eksplisit, tiap modul akan bikin daftar resource sendiri (pelanggaran duplikasi yang sudah ditemukan Phase C).
- **Implementasi lebih mudah:** Tim tahu ini satu Registry company-level untuk IDENTITAS saja, bukan field bebas per form, dan bukan tempat logika perencanaan/procurement hidup.
- **Domain pendukung:** RBS (`03b` § A.5).
- **Lolos filter:** ✅ (nama direvisi, cakupan dipersempit — lihat `36` § A.2 untuk Removal Test lengkap)

### 6. Price Book

- **Capability diperkuat:** Price Book 4 jenis (`01` § 2, `02` § 4).
- **Uncertainty dihilangkan:** Hierarki preseden 6-tingkat (Manual Override→...→National) — tanpa ini, "harga mana yang menang" jadi ambigu.
- **Implementasi lebih mudah:** Resolusi harga jadi fungsi deterministik (given resource+lokasi+waktu → satu harga+jejak sumber), bukan lookup manual.
- **Domain pendukung:** Price Book (`03b` § A.6).
- **Lolos filter:** ✅

### 7. Productivity Library

- **Capability diperkuat:** Produktivitas riil (`01` § 1.2 klarifikasi, `02` § 5).
- **Uncertainty dihilangkan:** Bagaimana angka produktivitas company (0.42 OH) menggantikan angka nasional (0.5 OH) secara terukur, per kombinasi resource+jenis pekerjaan (bukan per resource sendirian).
- **Implementasi lebih mudah:** Formula Engine tahu persis parameter mana yang diambil dari sini.
- **Domain pendukung:** Productivity Library (`03b` § A.6b).
- **Lolos filter:** ✅

### 8. Assembly Library *(sekarang mencakup AHSP — lihat revisi #3)*

- **Capability diperkuat:** "Jantung CECEP" (`02` § 3) — AHSP nasional/company adalah satu JENIS Assembly.
- **Uncertainty dihilangkan:** Bagaimana resource+proses+durasi digabung jadi satu paket reusable, dua keluarga (Building vs Civil/Sitework, `01` § 0), dengan AHSP Nasional/Company/Project/Custom sebagai empat sumber di dalamnya.
- **Implementasi lebih mudah:** Tim tahu Assembly = satu sistem tunggal, empat sumber (Nasional/Company/Project/Custom), bukan AHSP dan Assembly sebagai dua sistem paralel yang kebetulan berbagi tabel.
- **Domain pendukung:** Assembly/AHSP (`03b` § A.4) — satu Aggregate Root, satu capability.
- **Lolos filter:** ✅ — revisi `36` § A.1 menghapus ambiguitas boundary yang sebelumnya ada di sini.

### 9. RAB Builder

- **Capability diperkuat:** RAB (`01` § 7, output paling matang existing).
- **Uncertainty dihilangkan:** RAB = tampilan dari Estimate Item pada Scenario Baseline (`03b` § C.2) — bukan tabel tersendiri, mencegah duplikasi data yang sudah ada di codebase existing (`rab_items`).
- **Implementasi lebih mudah:** Migrasi dari `rab_items` existing jadi lebih jelas arahnya: `rab_items` lama jadi salah satu READ-MODEL dari Estimate Item baru.
- **Domain pendukung:** Estimate Item, Estimate Version (`03b` § A.9a/A.9b).
- **Lolos filter:** ✅

### 10. RAP Builder

- **Capability diperkuat:** RAP (`01` § 3, gap finansial paling berbahaya).
- **Uncertainty dihilangkan:** RAP dihitung dari RBS+Productivity+Price Book independen dari RAB (bukan `RAB × (1-margin%)`), termasuk Contingency/Risk Allowance/Overhead/Profit sebagai komponen eksplisit.
- **Implementasi lebih mudah:** Tim tahu RAP butuh Scenario terpisah ("RAP" sebagai salah satu jenis Scenario, sama pola dengan Tender Estimation #1) dengan Calculation Strategy yang bisa berbeda dari Scenario Tender.
- **Domain pendukung:** Scenario, Estimate Version, Estimate Item + Candidate Domain Contingency/Risk Register (`03b` § B.3, masih tertunda bentuknya).
- **Lolos filter:** ✅, dengan flag: sub-bagian Contingency/Risk Allowance BELUM final bentuk domainnya — diwariskan sebagai open item ke Fase 6, bukan diselesaikan di sini (konsisten `03b`).

### 11. Budget Baseline *(thin capability)*

- **Capability diperkuat:** Budget Baseline (`01` § 8 output #12).
- **Uncertainty dihilangkan:** `03b` § C.1 sudah eksplisit menolak Budget sebagai domain terpisah (derived dari Estimate Version Approved).
- **Implementasi lebih mudah:** Tim tahu tidak perlu tabel Budget sendiri — cukup flag "Estimate Version mana yang jadi Baseline aktif per Project".
- **Domain pendukung:** Estimate Version (`03b` § A.9b, event `EstimateVersionFrozen`).
- **Lolos filter:** ✅ — tapi ditandai eksplisit `36` § B sebagai **thin capability**: lolos Removal Test (hapus → tidak ada titik acuan tunggal untuk EVM/Cost Control) tapi secara teknis murni flag pada Estimate Version, bukan capability setebal RAB/RAP. Fase 6 tidak boleh memberinya bobot desain (Aggregate Root sendiri, dst) setara capability lain.

### 12. Procurement Planning

- **Capability diperkuat:** Procurement Plan (`01` § 8 output #8), Material Requirement (output #7, sudah matang di execution side).
- **Uncertainty dihilangkan:** Bagaimana Material Requirement DITURUNKAN otomatis dari Assembly/RBS (First Principle 2, `03` — sistem per-domain bukan per-modul), bukan diinput manual terpisah dari RAB seperti sekarang.
- **Implementasi lebih mudah:** ACL point yang jelas ke Procurement existing (`suppliers`, `purchase_orders`) — lihat capability #19 Integration.
- **Domain pendukung:** RBS, Assembly + ACL ke Procurement existing.
- **Lolos filter:** ✅

### 13. Material / Equipment / Labor Planning

- **Uji gabungan** (founder mendaftar tiga terpisah — diuji apakah tiga capability atau satu).
- **Capability diperkuat:** Ketiganya sama-sama turunan RBS (`01` § 4, `02` § 2) dikelompokkan per kategori resource.
- **Uncertainty dihilangkan:** Apakah masing-masing butuh capability sendiri atau cukup satu "Resource Planning" dengan filter kategori?
- **Keputusan:** **Digabung jadi SATU capability turunan dari Resource Identity (#5)**, bukan tiga capability berdiri sendiri — RBS (`03b` § A.5) sudah eksplisit satu Registry dengan kategori sebagai atribut, bukan tiga domain terpisah. Memecahnya jadi tiga capability capability berbeda akan mendorong tiga implementasi terpisah untuk hal yang secara domain SATU (persis anti-pola yang First Principle 2 tolak).
- **Catatan pasca-`36`:** "Resource Planning" (perencanaan pemakaian) TIDAK SAMA dengan "Resource Identity" (#5, identitas). Resource Planning hidup sebagai bagian dari RAP Builder dan Procurement Planning yang MENGONSUMSI Resource Identity — bukan capability sendiri, dan bukan bagian dari #5. Digabung ke dalam alur RAP Builder → Procurement Planning, bukan jadi node ketiga.
- **Lolos filter:** ✅ sebagai kebutuhan yang terpenuhi lewat RAP Builder + Procurement Planning mengonsumsi Resource Identity, **❌ ditolak sebagai capability berdiri sendiri (baik satu maupun tiga)** — pemangkasan eksplisit terhadap daftar awal founder, dengan alasan domain, bukan preferensi.

### 14. Cost Control

- **Capability diperkuat:** Cost Control / EVM (`01` § 8 output #11, `03` § 6 root cause).
- **Uncertainty dihilangkan:** Baseline EVM harus dari RAP (bukan RAB) — Cost Code sebagai penyambung real-time Actual Cost ke rencana.
- **Implementasi lebih mudah:** Tim tahu Cost Control BUKAN modul terpisah — ia konsumen Cost Code + RAP Baseline + Actual Cost (via ACL).
- **Domain pendukung:** Cost Code (`03b` § A.3) + ACL ke execution existing.
- **Lolos filter:** ✅

### 15. Forecast

- **Capability diperkuat:** Cashflow Forecast (`01` § 8 output #9).
- **Uncertainty dihilangkan:** Forecast = proyeksi ke depan berbasis Estimate (belum ada saat ini, existing hanya cashflow AKTUAL).
- **Implementasi lebih mudah:** Tim tahu ini derived dari Estimate Version + Schedule (WBS), bukan input manual.
- **Domain pendukung:** Estimate Version, WBS (`03b` § A.1).
- **Lolos filter:** ✅ — **digabung dengan Cashflow Planning (#16, daftar founder)** karena keduanya sama persis: proyeksi kas berbasis Estimate. Dipertahankan sebagai SATU capability "Cashflow Forecast", bukan dua.

### 16. Cashflow Planning

- **Lihat #15** — digabung. **❌ ditolak sebagai capability terpisah** dari Forecast; alasan: `01` § 8 sendiri mendaftar "Cashflow Forecast" sebagai SATU output, tidak pernah membedakan "planning" vs "forecast" sebagai dua hal.

### 17. Historical Cost Intelligence

- **Capability diperkuat:** Company Intelligence Loop (`01` Foundational Principle Pertama) — SELURUH alasan CECEP ada.
- **Uncertainty dihilangkan:** Bagaimana Variance→Root Cause→Lessons Learned benar-benar MENULIS BALIK ke Company AHSP/Price Book/Productivity (bukan laporan statis).
- **Implementasi lebih mudah:** Tim tahu ini punya WRITE ACCESS lintas 3 Aggregate Root lain (`03b` § A.12), dipagari Approval Workflow — kompleksitas write-access ini harus eksplisit di desain, bukan ditemukan belakangan.
- **Domain pendukung:** Lessons Learned/Variance/Root Cause (`03b` § A.12) + Candidate Domain Knowledge Asset Index (`03b` § B.2, retrieval mechanism).
- **Lolos filter:** ✅ — capability PALING kritis, matching penilaian `03b` sendiri ("domain paling matang").

### 18. AI Estimation

- **Capability diperkuat:** AI Estimation (`01` § 11).
- **Uncertainty dihilangkan:** Jalur input mana yang realistis duluan (Excel, karena parser existing `rab.ts`).
- **Implementasi lebih mudah:** Sesuai batas Fase 10 (`32`) — TIDAK mendesain ontologi AI di sini, hanya mengunci bahwa capability ini ADA dan levelnya tetap vision, didalami penuh nanti di Fase 10.
- **Domain pendukung:** (ditunda ke Fase 10 secara sengaja).
- **Lolos filter:** ✅ sebagai ENTRI capability (harus ada di peta), isi detailnya sengaja kosong sampai Fase 10 — konsisten Article 6 STOP boundary di `32`.

### 19. AI Recommendation

- **Uji terhadap #18** — apakah dua capability berbeda?
- **Capability diperkuat:** `02` § 11 AI Learning Loop — "konsumen akhir" Company Intelligence Loop, BUKAN sama dengan AI Estimation (yang konsumsi input dokumen untuk BUAT estimasi baru).
- **Keputusan:** **Dipertahankan sebagai capability terpisah dari AI Estimation** — AI Estimation menjawab "bantu saya membuat estimasi dari dokumen", AI Recommendation menjawab "berdasar histori, angka mana yang perlu dicurigai/direvisi". Beda arah data: AI Estimation input eksternal→Estimate baru; AI Recommendation input historical data internal→saran ke Estimate yang sedang dikerjakan.
- **Domain pendukung:** Historical Cost Intelligence (#17) sebagai sumber data, ditunda desain penuh ke Fase 10.
- **Lolos filter:** ✅, entri capability, isi ditunda ke Fase 10.

### 20. Executive Cost Analytics

- **Capability diperkuat:** Tidak ada satu pun kapabilitas eksplisit di `01`/`02`/`03` yang mendaftar ini dengan nama itu.
- **Uncertainty dihilangkan:** **Tidak ada yang konkret ditemukan** — "Executive Dashboard" hanya disebut SEKALI di `01` § Maturity Model sebagai implikasi ("relevan untuk Executive Dashboard di Phase D"), bukan capability berdiri sendiri dengan domain sendiri.
- **Implementasi lebih mudah:** Tidak ada implementasi baru yang jadi lebih mudah — ini adalah TAMPILAN AGREGAT dari capability lain (EVM dari #14, Cashflow dari #15, Knowledge dari #17), bukan capability yang punya domain/data sendiri.
- **Keputusan:** **❌ Ditolak sebagai capability berdiri sendiri.** Diklasifikasi ulang sebagai **Cross-Cutting Presentation Layer** — dashboard yang mengagregasi capability #14/#15/#17, sama pola dengan RAB/BOQ yang derived read-model. Dicatat di sini supaya tidak hilang (analog `03b` § C Rejected Domain), tapi tidak masuk Capability Map utama sebagai node sejajar.

---

## Capability Map — Final (Setelah Filter)

```
Construction Estimation & Cost Engineering Platform
│
├── CORE ESTIMATION
│   ├── Tender Estimation
│   ├── Assembly Library           (mencakup AHSP Nasional/Company/Project/Custom — lihat revisi #3/#8)
│   ├── RAB Builder
│   │     └── BOQ (tampilan turunan RAB Builder, bukan capability sejajar)
│   └── RAP Builder                (Contingency/Risk: bentuk domain tertunda, `03b` §B.3)
│
├── KNOWLEDGE FOUNDATION (dipakai lintas Core Estimation)
│   ├── Resource Identity          (identitas lintas domain SAJA — bukan perencanaan pemakaian)
│   ├── Price Book
│   └── Productivity Library
│
├── CROSS-CUTTING (dikonsumsi hampir semua capability lain, bukan langkah linear)
│   └── Calculation Strategy
│
├── PLANNING & CONTROL (downstream dari Core Estimation)
│   ├── Budget Baseline             (thin capability — derived dari RAP Builder Approved)
│   ├── Procurement Planning
│   ├── Cost Control
│   └── Cashflow Forecast           (menggabung "Cashflow Planning" — 1 capability, bukan 2)
│
├── INTELLIGENCE LOOP (feedback, menutup siklus — lihat `36` §C untuk diagram 9-tahap penuh)
│   ├── Historical Cost Intelligence
│   ├── AI Estimation               (isi ditunda ke Fase 10)
│   └── AI Recommendation           (isi ditunda ke Fase 10)
│
└── (Executive Cost Analytics — DITOLAK sebagai capability, dicatat sebagai
     Presentation Layer lintas Cost Control + Cashflow Forecast + Historical
     Cost Intelligence, bukan node Capability Map)
```

**Ringkasan hasil filter (setelah `35` awal + revisi `36`):** 20 kandidat awal (daftar founder) → **16 capability** masuk Capability Map (termasuk BOQ sebagai turunan eksplisit RAB, bukan node sejajar) setelah penggabungan/penolakan berikut:
- AHSP Management → dilebur total ke Assembly Library (revisi `36` § A.1 — gagal No-Menu Test).
- Resource Management → diganti nama "Resource Identity", cakupan dipersempit ke identitas saja (revisi `36` § A.2 — gagal No-UI/No-Menu Test sebagai capability operasional tunggal).
- Material/Equipment/Labor Planning (3 kandidat) → tidak jadi capability berdiri sendiri, terserap sebagai konsumsi Resource Identity oleh RAP Builder/Procurement Planning.
- Cashflow Planning → digabung ke Forecast (sudah 1 output di `01` § 8).
- Executive Cost Analytics → ditolak sebagai capability berdiri sendiri, direklasifikasi jadi Presentation Layer.

---

## Ownership, Dependency, Batas Tanggung Jawab

| Capability | Owner (fungsi organisasi) | Bergantung Pada | Domain Pendukung (Fase 6) |
|---|---|---|---|
| Tender Estimation | Estimator | Calculation Strategy, Price Book | Scenario, Estimate Version, Estimate Item |
| Assembly Library | Cost Engineering | RBS, Formula Engine, Reference Library (bootstrap nasional) | Assembly/AHSP |
| RAB Builder | Estimator | Tender Estimation (Scenario Approved) | Estimate Item, Estimate Version |
| RAP Builder | Cost Control | Resource Identity, Price Book, Productivity | Scenario, Estimate Item + Risk Register (tertunda) |
| Resource Identity | Resource Mgmt/Company Standard | — (upstream, tidak bergantung capability lain) | RBS |
| Price Book | Procurement/HR/Cost Control (beda per jenis, `03b` §A.6) | Resource Identity | Price Book Entry |
| Productivity Library | Cost Engineering | Resource Identity, Historical Cost Intelligence | Productivity Record |
| Calculation Strategy | Cost Engineering/System Config | (cross-cutting, dikonsumsi bukan bergantung) | Formula Engine |
| Budget Baseline | Cost Control | RAP Builder (Approved) | Estimate Version |
| Procurement Planning | Procurement | Resource Identity, RAB Builder | RBS + ACL Procurement existing |
| Cost Control | Cost Control | Cost Code, Budget Baseline | Cost Code + ACL execution existing |
| Cashflow Forecast | Cost Control/Finance | Estimate Version, WBS | Estimate Version, WBS |
| Historical Cost Intelligence | Project Closeout/Cost Engineering | Cost Control (Actual Cost via ACL) | Lessons Learned/Variance/Root Cause |
| AI Estimation | (ditunda Fase 10) | Historical Cost Intelligence (jangka panjang) | (ditunda) |
| AI Recommendation | (ditunda Fase 10) | Historical Cost Intelligence | (ditunda) |

**Batas tanggung jawab kunci (mencegah tumpang tindih saat Fase 6-7 mendesain domain):**
- Assembly Library sekarang mencakup AHSP (Nasional/Company/Project/Custom) sebagai empat sumber di dalam SATU capability — bukan dua tabel/dua capability (revisi `36` § A.1).
- Resource Identity HANYA soal identitas — perencanaan pemakaian (planning) adalah tanggung jawab RAP Builder/Procurement Planning yang MENGONSUMSI Resource Identity, bukan bagian dari capability ini (revisi `36` § A.2).
- RAB Builder vs Budget Baseline vs BOQ: KETIGANYA derived read-model dari Estimate Version/Item — TIDAK BOLEH dapat tabel/entity sendiri (mengulang keputusan `03b` § C.1/C.2, sekarang eksplisit ditegaskan di level capability juga).
- Calculation Strategy TIDAK punya baris "Owner" tunggal karena sifatnya cross-cutting Domain Service (`03b` § A.7) — dipakai, tidak dimiliki satu fungsi bisnis.

---

## Definition of Done Self-Check (per `34`)

| Kriteria | Status | Bukti |
|---|---|---|
| 1. Memperkuat ≥1 capability CECEP | ✓ | Setiap dari 17 capability final ditelusuri ke output/prinsip eksplisit `01`/`02`/`03b` |
| 2. Mengurangi implementation uncertainty | ✓ | BOQ, Budget, Executive Analytics — tiga ambiguitas lama (entity sendiri atau tidak?) dijawab eksplisit |
| 3. Menghasilkan artefak konkret | ✓ | Capability Map + tabel Ownership/Dependency — bukan narasi |
| 4. Tidak memperkenalkan Framework concept sebagai fokus | ✓ | Nol istilah dari Article 8 vocabulary terlarang (`30`) dipakai sebagai judul/subjek section manapun di sini |
| 5. Lolos Construction Removal Test | ✓ | Hapus kata "construction" — dokumen ini KOSONG tanpa AHSP/RAB/RAP/Tender/BOQ, tidak ada struktur generik tersisa |
| 6. Memenuhi Constitution 8 Artikel | ✓ | Article 2 (traceability tiap capability), Article 5 (Depth Limit dipakai eksplisit menolak Executive Analytics & split Material/Equipment/Labor) |
| 7. Meningkatkan implementation readiness | ✓ | Tabel Ownership/Dependency langsung dipakai sebagai input Fase 5 (Calculation Strategy perlu tahu ia cross-cutting) dan Fase 6 (Domain Model tahu batas AHSP↔Assembly) |

**Hasil:** 7/7 ✓. Fase 3 selesai per `34`.

---

## 🔒 STATUS: FROZEN PERMANENTLY

Phase 3 di-Freeze permanen bersama [`36`](36-phase3-capability-boundary-validation.md), [`37`](37-phase3-capability-interaction-map.md), [`38`](38-phase3-domain-readiness-assessment.md). Perubahan hanya lewat ADR resmi. Lanjut ke Fase 4 (Domain Model, `32`).
