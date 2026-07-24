# CECEP — Phase B: Construction Cost Engineering Discovery (v2 — Lengkap)

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Phase B diperluas dari "Business Discovery" standar menjadi **Construction Cost Engineering Discovery** penuh, dua putaran Q&A, atas arahan eksplisit founder.
**Status dokumen ini:** Planning only. Versi ini MENGGANTIKAN draft v1 — v1 dianggap "arah benar tapi belum lengkap" oleh founder, bukan didekati sebagai revisi tambal-sulam.
**Prinsip governing (arahan eksplisit founder, mengikat seluruh dokumen ini dan phase berikutnya):**

> Business → Construction Process → Cost Engineering → Calculation Philosophy → Data Philosophy → Domain Model → Entity → Database → API → UI → Implementation

Dokumen ini TIDAK membahas database, entity, atau implementasi apa pun.

---

## CECEP FOUNDATIONAL PRINCIPLE (Level Tertinggi — Dirujuk di Setiap Phase Berikutnya)

**Verbatim dari founder — ini prinsip filosofis paling tinggi di seluruh CECEP, bukan requirement satu modul:**

> CECEP does not replace business knowledge.
> CECEP captures, standardizes, validates, improves, and compounds business knowledge over time.
> Every completed project must make the next estimate more accurate.
> Knowledge is considered a company asset.
> No project is allowed to end without contributing new organizational knowledge.

**Alasan (verbatim founder):** Kebanyakan software estimasi berhenti di "buat RAB → selesai". Kontraktor besar bekerja siklikal — proyek tidak pernah benar-benar selesai, ia berubah jadi aset pengetahuan perusahaan:
```
Tender → RAB → RAP → Execution → Actual Cost → Variance Analysis → Lessons Learned →
Update Company Cost Database → Project berikutnya menjadi lebih akurat
```

**Company Intelligence Loop** (konsep level lebih tinggi dari sekadar "Lessons Learned" § 12):
```
Project → Estimate → Execution → Actual Cost → Variance → Root Cause → Lessons Learned →
Company AHSP → Price Book → Assembly Library → Calculation Strategy Improvement →
AI Training Dataset → Next Project
```
Setiap proyek OTOMATIS memperbaiki: Company AHSP, Price Book, Produktivitas tukang/alat, Estimasi durasi, Risk allowance, Contingency, Cashflow prediction, Procurement planning, AI recommendation, Akurasi tender berikutnya.

**Reposisi CECEP:** Bukan sekadar Construction Estimation Platform — ia adalah **Construction Intelligence Platform**: sistem yang terus belajar dari setiap proyek sehingga kemampuan estimasi perusahaan meningkat dari waktu ke waktu. Pembeda dari software konstruksi lain yang hanya alat pencatatan tanpa mekanisme pembelajaran organisasi.

**Implikasi struktural:**
1. Root Cause Analysis adalah elemen eksplisit dalam loop — bukan cuma "catat variance", tapi "cari akar masalah" sebelum masuk Lessons Learned.
2. AI Training Dataset adalah node eksplisit — AI Estimation (§ 11) bukan fitur terpisah, melainkan **konsumen utama** Company Intelligence Loop. Desain data model (Phase F) harus cukup granular/terstruktur untuk dipakai ML, bukan cuma dibaca manusia.
3. Project Closeout (§ 1) TIDAK BOLEH jadi langkah administratif kosong — harus punya *gate* yang memaksa Lessons Learned/Variance/Root Cause terisi sebelum status proyek benar-benar bisa ditutup.

---

## PRINSIP BESAR CECEP

**Verbatim dari founder — definisi mengikat cakupan platform:**

> CECEP bukan aplikasi pembuat RAB. CECEP adalah Construction Cost Engineering Platform yang mengelola seluruh siklus biaya proyek, mulai dari estimasi awal, perencanaan biaya, pengendalian biaya selama pelaksanaan, hingga pembelajaran setelah proyek selesai. Seluruh modul seperti AHSP, Estimate Engine, RAB, RAP, Price Book, Procurement, Cost Control, Forecast, dan AI Estimation merupakan bagian dari satu ekosistem dengan satu sumber kebenaran (single source of truth).

**Konsekuensi langsung untuk Phase C nanti:** Problem Discovery TIDAK BOLEH dibingkai sebagai "apa yang kurang dari modul RAB" — harus dibingkai sebagai "seberapa jauh kondisi Puraloka Persada hari ini dari platform pengelola siklus biaya penuh."

---

## GREENFIELD ADOPTION & MATURITY MODEL (Requirement Paling Penting Menurut Founder)

**⚠️ Catatan metodologis penting sebelum membaca bagian ini:** Kondisi Puraloka Persada hari ini **tetap jujur nol/belum ada praktik formal** untuk RAP, Contingency, Company AHSP, dan Lessons Learned — ini FAKTA, tidak berubah oleh bagian ini. Yang berubah adalah **tuntutan terhadap desain sistem CECEP**: bukan "Puraloka Persada harus segera mempraktikkan ini secara manual" (Puraloka Suite baru dipakai setelah 100% selesai — praktik manual paralel di luar sistem tidak relevan), melainkan **"CECEP harus mampu membangun fondasi ini dari nol begitu platform siap dipakai."**

**Kalimat resmi (verbatim, mengikat Phase D-F):**

> Saat ini Puraloka Persada belum memiliki praktik formal maupun data historis yang terstandarisasi untuk seluruh aspek tersebut (RAP formal, Contingency/Risk Allowance, Company AHSP, Lessons Learned). CECEP harus dirancang agar mampu membangun seluruh fondasi tersebut dari nol (greenfield), lengkap dengan data awal (bootstrap) berupa Company AHSP, Price Book, Assembly Library, dan template yang dapat diedit sepenuhnya. Semua data awal hanyalah baseline perusahaan, bukan hardcoded. Seluruh master data harus versioned, editable, dapat diaktifkan/nonaktifkan, dan terus berkembang berdasarkan pengalaman proyek berikutnya.

**Konteks kesegeraan (jawaban final founder):** Seluruh praktik tersebut dirancang sebagai bagian inti CECEP dan akan mulai digunakan ketika platform siap dipakai secara penuh. Saat ini belum ada implementasi manual yang berjalan. Karena itu CECEP harus mampu melakukan bootstrap seluruh proses dan master data dari nol, tanpa mengasumsikan perusahaan sudah memiliki SOP atau knowledge base sebelumnya. Ini adalah **prioritas desain tertinggi di dalam CECEP itu sendiri** — keempat kapabilitas berikut wajib masuk scope Phase D (Capability Architecture) sebagai kapabilitas inti, bukan Tier 2/Later:

1. **RAP formal** (target biaya internal, § 3)
2. **Contingency/Risk Allowance** (§ 3.2–3.3)
3. **Company AHSP** (§ 1.2 — lihat klarifikasi krusial di bawah)
4. **Lessons Learned / evaluasi pasca-proyek** (§ 12)

### Klarifikasi Krusial — Company AHSP: "Menghasilkan", Bukan "Membaca"

CECEP **tidak membaca** Company AHSP yang sudah dimiliki perusahaan (karena memang belum ada) — CECEP **menghasilkan** Company AHSP untuk pertama kalinya:

```
AHSP Nasional 2026 → Bootstrap Company AHSP → Estimator mulai edit →
Versi 1.1 → Versi 1.2 → Versi 2.0 → Knowledge perusahaan
```

Company AHSP bukan tabel referensi statis yang di-seed sekali lalu dianggap selesai — ia adalah **objek yang lahir dan tumbuh di dalam sistem**, mulai dari bootstrap (turunan AHSP Nasional), lalu berevolusi lewat edit manual estimator dan pengalaman proyek nyata, dengan version history penuh.

### Greenfield Adoption Requirement (Verbatim, Status: Prinsip Paling Penting Menurut Founder)

> CECEP must support Greenfield Adoption. The platform must assume that a construction company may start with zero standardized master data, zero Company AHSP, zero Price Book, zero Assembly Library, zero historical productivity, and zero lessons learned. The system must provide intelligent bootstrap data, guided setup, editable templates, versioning, and gradual maturity. Every master dataset must be replaceable, extensible, and continuously improved without requiring schema changes or source-code modifications.

### Maturity Model (5 Level — Kerangka Evaluasi Wajib di Phase D ke Atas)

| Level | Nama | Deskripsi |
|---|---|---|
| 0 | Empty Company | Fresh installation, benar-benar kosong |
| 1 | Bootstrap | Memakai national standards + default templates |
| 2 | Customized Company Standards | Company AHSP mulai di-edit dari bootstrap |
| 3 | Company Knowledge Accumulated | Dari completed projects — Lessons Learned loop mulai hasilkan data riil |
| 4 | AI-Assisted Continuous Optimization | — |

**Alasan (verbatim founder):** Mayoritas software enterprise mengasumsikan perusahaan sudah punya data saat sistem mulai dipakai. Target CECEP berbeda: perusahaan bisa mulai dari benar-benar nol (Level 0), tapi desainnya harus tetap relevan bertahun-tahun ke depan ketika perusahaan sudah matang (Level 4) — **tanpa perubahan skema atau source code** untuk mengakomodasi pertumbuhan itu. Satu arsitektur untuk seluruh rentang maturity, bukan redesign di tengah jalan.

**Implikasi desain (mengikat Phase D-F):**
1. Setiap master dataset (Company AHSP, Price Book, Assembly Library, Template, Productivity data) harus **replaceable, extensible**, dan terus membaik **tanpa migrasi skema/source code** — perubahan konten (data), bukan perubahan struktur (kode).
2. Setiap master data WAJIB: versioned (riwayat perubahan, bukan overwrite), editable penuh (termasuk data bawaan sistem — tidak ada yang read-only permanen), punya status aktif/nonaktif (bisa dimatikan tanpa dihapus), dan mencatat asal data (bootstrap vs hasil pengalaman proyek riil).
3. **Guided Setup** — CECEP perlu onboarding flow yang membawa perusahaan dari Level 0 ke Level 1 secara terpandu, bukan meninggalkan user dengan sistem kosong.
4. Maturity Level bisa jadi **dimensi terukur** — CECEP berpotensi menampilkan "maturity score" per domain (mis. Company AHSP sudah Level 2, tapi Lessons Learned masih Level 1) — relevan untuk Executive Dashboard di Phase D.

---

## Executive Summary

Dua putaran Q&A dengan founder menghasilkan **satu temuan yang mengubah bobot seluruh desain**: **Puraloka Persada adalah general contractor sejati** — mengerjakan pekerjaan sipil/tanah (pengurugan lahan, pemagaran, landscape) DAN bangunan gedung (pabrik, gudang, rumah, ruko, perumahan cluster) sekaligus, bukan spesialis satu kategori. Konsekuensinya, perusahaan **sudah** memakai lebih dari satu rujukan AHSP nasional tergantung jenis pekerjaan (Bina Marga untuk sipil/tanah, Cipta Karya untuk bangunan gedung) — dikonfirmasi eksplisit, bukan asumsi.

Ini berarti CECEP **tidak boleh** didesain dengan asumsi "satu proyek = satu jenis AHSP". Calculation Strategy harus bisa berbeda **per work item/work package di dalam proyek yang sama** — pengurugan lahan pakai rujukan Bina Marga, bangunan pabriknya pakai Cipta Karya, dalam satu RAB.

Temuan lain yang memperkuat urgensi CECEP: **Company AHSP genuinely nol** (bukan cuma tidak formal — benar-benar tidak ada akumulasi), **contingency/risk allowance tidak pernah dipraktikkan formal** (buffer risiko "dimakan" oleh margin yang menipis), dan **lessons learned nol total** (bahkan evaluasi informal pun tidak ada). Ketiga gap ini bersama-sama menjelaskan mengapa profitabilitas proyek sulit diprediksi dan sulit direplikasi — ini akan jadi materi inti Phase C.

---

## 0. Profil Perusahaan — Temuan Paling Menentukan (Ditemukan di Round 2 Q&A)

**Status: General Contractor, cakupan pekerjaan sangat heterogen.**

Dikonfirmasi eksplisit oleh founder: *"Ya, general contractor — terima semua jenis pekerjaan."* Cakupan proyek riil yang disebutkan:
- Pabrik dan Gudang
- Pengurugan Lahan
- Pemagaran Kawasan Pabrik/Gudang
- Landscape Kawasan
- Perumahan Cluster/Komplek
- Rumah tinggal
- Ruko/komersial kecil
- Gedung/bangunan skala menengah-besar
- *"Pokoknya semua proyek kami kerjakan"*

**Implikasi arsitektur (mengikat Phase D-F):**

1. **CECEP tidak boleh didesain seolah "platform estimasi bangunan gedung"** dengan pekerjaan sipil sebagai tambahan belakangan. Kedua kategori (Civil Works dan Building Works) harus jadi warga kelas satu di Cost Breakdown Structure dan Template Library sejak desain awal.
2. **Multi-AHSP-reference-standard bukan fitur "nice to have" — ini kebutuhan operasional yang sudah berjalan hari ini** (lihat § 1 di bawah).
3. **Template Library (§ 8) harus mencakup dua keluarga template yang secara struktural berbeda**: template bangunan (Rumah/Ruko/Pabrik/Gudang — punya CBS spasial: lantai, zona) dan template pekerjaan sipil (Pengurugan/Pemagaran/Landscape — punya struktur lebih linear: area/segmen, bukan lantai/zona).

---

## 1. AHSP Strategy — Diperluas (Round 2)

**Empat sumber AHSP yang diarahkan founder untuk dianalisis, dan bagaimana keempatnya hidup berdampingan dalam satu Calculation Strategy:**

### 1.1 AHSP Nasional (Permen PUPR terbaru)

**Kondisi hari ini:** Dipakai *sebagian*, dan **lebih dari satu rujukan sekaligus** — dikonfirmasi eksplisit: AHSP Bina Marga untuk pekerjaan jalan/tanah/sipil, AHSP Cipta Karya untuk bangunan gedung, dipilih **per jenis pekerjaan**, bukan per proyek. Ini bukan wacana masa depan — ini praktik yang sudah berjalan secara manual/informal hari ini.

**Implikasi desain:** "AHSP Nasional" sebagai satu Calculation Strategy tunggal adalah penyederhanaan yang salah. Yang benar: AHSP Nasional adalah **kategori strategi** yang di dalamnya ada sub-varian (Bina Marga, Cipta Karya, dan kemungkinan standar sektoral lain — mis. untuk mekanikal-elektrikal) — dipilih di level Work Item/Work Package, bukan di level Project.

### 1.2 Company AHSP

**Kondisi hari ini: BELUM ADA SAMA SEKALI** — dikonfirmasi eksplisit founder (bukan "belum formal", genuinely nol akumulasi pengetahuan). Setiap estimasi mulai dari nol atau merujuk langsung ke AHSP nasional.

**Implikasi:** CECEP bukan tempat "mendigitalkan Company AHSP yang sudah ada" — ia adalah tempat Company AHSP **lahir pertama kali**. Ini mengubah prioritas: sebelum "Company AHSP Engine" bisa berguna, harus ada mekanisme mengkodifikasi hasil estimasi/eksekusi proyek riil menjadi entri Company AHSP baru (lihat § 10 Lessons Learned — keduanya saling terhubung).

### 1.3 Project AHSP

**Kondisi hari ini:** Tidak ada sebagai konsep terpisah — tapi implisit terjadi setiap kali estimator menyesuaikan angka AHSP nasional untuk kondisi proyek spesifik (harga lokal, akses lokasi, dsb), penyesuaian ini tidak pernah dicatat sebagai entitas tersendiri, hilang begitu proyek selesai.

**Implikasi:** Project AHSP adalah "override" terhadap Company/National AHSP yang **berlaku hanya untuk satu proyek**, tapi tetap harus tercatat sebagai data terstruktur — bukan sekadar angka final di RAB — supaya bisa jadi kandidat naik level ke Company AHSP kalau terbukti akurat berulang.

### 1.4 Custom Assembly

**Kondisi hari ini:** Tidak ada (lihat § 9 Assembly Library — nol referensi reusable).

**Implikasi:** Custom Assembly adalah level granularitas paling fleksibel — dipakai ketika baik AHSP nasional maupun Company AHSP tidak punya entri yang cocok (mis. metode kerja unik untuk kondisi lapangan tertentu).

### Bagaimana Keempatnya Hidup Berdampingan

Prinsip yang diusulkan founder di sesi sebelumnya berlaku persis di sini:
```
Estimate Template → Calculation Strategy → Resource Formula → Price Source → Output
```
Empat sumber AHSP di atas (Nasional/Bina-Marga-atau-Cipta-Karya, Company, Project, Custom Assembly) adalah **empat pilihan Calculation Strategy** yang setara kedudukannya — dipilih per Work Item, tidak ada hierarki wajib "harus mulai dari Nasional". Sebuah Work Item boleh langsung pakai Custom Assembly tanpa pernah menyentuh AHSP Nasional sama sekali, jika itu yang paling akurat untuk pekerjaan tersebut.

---

## 2. Price Book Strategy — Hierarki dan Prioritas Penggunaan

**Enam tingkat yang diarahkan founder:**

```
National Price Book → Regional Price Book → Company Price Book →
Supplier Quotation → Project Price Book → Manual Override
```

### Kondisi Hari Ini

**Tidak ada Price Book dalam bentuk apa pun.** `materials.unit_price` adalah satu kolom tunggal tanpa versi/histori/sumber/regional variant. Sumber harga riil hari ini **tidak terkonfirmasi tunggal** — pertanyaan spesifik soal ini sempat diajukan dua kali, dan founder secara konsisten menjawab dengan *desain target* (Price Book bertingkat), bukan konfirmasi *praktik hari ini*. **Ini tetap Open Question yang belum tuntas** (lihat bagian akhir dokumen) — kemungkinan besar karena praktik hari ini genuinely tidak terstruktur/tidak ada pola dominan yang mudah diartikulasikan (konsisten dengan temuan § 1.2: Company AHSP nol, jadi Company Price Book pun kemungkinan besar nol).

### Prioritas Penggunaan yang Diusulkan (Requirement untuk Phase E)

Urutan preseden dari paling spesifik ke paling umum (yang lebih spesifik menang jika ada konflik):

1. **Manual Override** — preseden tertinggi, tapi WAJIB disertai alasan terdokumentasi (bukan override bebas tanpa jejak).
2. **Project Price Book** — harga yang sudah dikunci khusus untuk satu proyek (mis. hasil negosiasi kontrak).
3. **Supplier Quotation** — quote riil dan masih berlaku (perlu masa berlaku eksplisit, quote lama tidak otomatis valid selamanya).
4. **Company Price Book** — harga standar internal, diperbarui berkala.
5. **Regional Price Book** — harga rata-rata per wilayah (relevan mengingat cakupan proyek Puraloka Persada tersebar, § 0).
6. **National Price Book** — AHSP nasional sebagai fallback terakhir jika tidak ada sumber lain.

**Catatan penting:** Karena Company Price Book hari ini nol (§ 1.2), praktik awal CECEP akan sangat bergantung pada Regional/National sebagai fallback dominan, sampai Company Price Book terisi secara organik dari histori proyek (lihat § 10).

---

## 3. RAP Philosophy — Diperluas (Round 2)

**Lima elemen yang diarahkan founder untuk dianalisis, bukan cuma "RAP ≠ RAB":**

### 3.1 Bagaimana Estimator Menentukan Target Cost

**Kondisi hari ini:** Tidak ada proses formal — dikonfirmasi eksplisit ("Belum ada praktik formal — ini desain dari nol", § RAP di v1, ditegaskan ulang di Round 2). Target cost implisit adalah `contract_value` dikurangi ekspektasi margin yang tidak pernah dihitung secara terpisah/eksplisit.

### 3.2 Bagaimana Contingency Dihitung

**Kondisi hari ini: TIDAK ADA praktik contingency formal** — dikonfirmasi eksplisit founder. Kutipan kunci dari opsi yang dipilih: kalau ada kenaikan harga/masalah lapangan, *"ditanggung sebagai bagian dari margin yang menipis"* — bukan buffer yang disengaja sejak awal.

**Implikasi:** Ini gap paling berbahaya secara finansial dari seluruh temuan Phase B — tanpa contingency eksplisit, setiap risiko yang terwujud (harga naik, cuaca buruk, keterlambatan) langsung memakan profit tanpa peringatan dini, karena tidak ada "anggaran risiko" yang bisa dipantau terpisah dari "anggaran kerja".

### 3.3 Bagaimana Risk Allowance

**Kondisi hari ini:** Sama seperti § 3.2 — tidak ada alokasi risiko terstruktur. Tidak ada kategorisasi risiko (harga material, cuaca, keterlambatan supplier, perubahan desain) yang masing-masing punya allowance sendiri.

### 3.4 Bagaimana Overhead

**Kondisi hari ini:** Ada representasi sangat kasar di `rab_items.other_pct` (migration 052) — satu angka persentase generik, tidak breakdown menjadi kategori overhead (overhead kantor pusat vs overhead site, misalnya).

### 3.5 Bagaimana Profit

**Kondisi hari ini:** Tidak pernah eksplisit sebagai baris/komponen tersendiri di estimasi — implisit adalah selisih `contract_value` dikurangi total cost aktual, yang **baru diketahui setelah proyek berjalan/selesai**, bukan ditargetkan sejak awal.

### 3.6 Bagaimana RAP Berubah Ketika Kondisi Proyek Berubah

**Kondisi hari ini:** Tidak relevan untuk dijawab — karena RAP sendiri belum ada, "perubahan RAP" juga belum pernah terjadi sebagai proses formal. Perubahan kondisi proyek hari ini hanya tertangkap lewat Change Order (`change_orders` table, sudah matang secara teknis di Epic-Epic sebelumnya) yang mengubah `contract_value` — tidak ada mekanisme paralel yang mengubah target biaya internal.

**Implikasi untuk Phase D/E:** RAP bukan angka statis sekali hitung di awal proyek — ia perlu versioning yang sama seperti RAB (RAP v1 saat kontrak ditandatangani, RAP v2 setelah ada perubahan kondisi lapangan, dst.), dengan histori yang bisa dibandingkan untuk analisis "kenapa target berubah."

---

## 4. Resource Engineering — RBS Diperluas (Round 2, +3 komponen baru)

**16 komponen (13 dari v1 + 3 tambahan eksplisit Round 2: Temporary Work, Site Facilities):**

| Komponen RBS | Status Hari Ini | Evidence/Catatan |
|---|---|---|
| Material | ✅ Matang | `materials`, `project_stocks` |
| Labor | ✅ Matang (pencatatan aktual, bukan estimasi) | `workers`, `weekly_wage_reports` |
| Equipment | 🟠 Schema-only, nol endpoint | `assets` (045) |
| Subcontract | 🟡 Sebagian, hanya untuk mandor borongan | `work_scopes.payment_system='borongan'` |
| Tools | ❌ Tidak dipisahkan dari Equipment/Material | — |
| Consumable | ❌ Tidak ada kategori terpisah | — |
| Transportation | ❌ Tidak ada — **relevan mengingat proyek tersebar lintas wilayah (§ 0)** | — |
| Waste | ❌ Tidak ada faktor waste eksplisit | — |
| **Temporary Work** *(baru Round 2)* | ❌ Tidak ada — pekerjaan sementara (bekisting, perancah, direksi kit) tidak dipisahkan dari pekerjaan permanen | — |
| **Site Facilities** *(baru Round 2)* | ❌ Tidak ada — fasilitas sementara site (barak pekerja, gudang sementara, listrik/air kerja) tidak terpisah dari overhead | — |
| Overhead | 🟡 Sangat generik | `rab_items.other_pct` |
| Indirect Cost | ❌ Tidak dipisahkan dari Overhead | — |
| Risk | ❌ Tidak ada (lihat § 3.3) | — |
| Profit | ❌ Tidak ada sebagai komponen eksplisit | — |
| Tax | ✅ Ada di level invoice, bukan komponen biaya per item | `tax_scheme` |

**Observasi:** Penambahan Temporary Work dan Site Facilities relevan langsung dengan temuan § 0 — proyek sipil (pengurugan, pemagaran) dan proyek gedung punya kebutuhan Temporary Work/Site Facilities yang sangat berbeda karakternya, memperkuat kebutuhan RBS yang generik dan tidak diasumsikan satu pola "proyek gedung standar".

---

## 5. Cost Breakdown Structure (CBS) — dengan Alasan Pemilihan Struktur

**Struktur yang diarahkan founder:**
```
Project → Building → Zone → Floor → Discipline → Work Package → Work Item → Assembly → Resource
```
*(Catatan: urutan Zone-Floor di draft Round 2 founder sedikit berbeda dari v1 yang Floor-Zone — dicatat sebagai open detail untuk diklarifikasi di Phase D, bukan diasumsikan salah satu yang benar.)*

### Kenapa Struktur Ini, Bukan yang Lain — Analisis

**Masalah dengan struktur ini untuk Puraloka Persada, mengingat temuan § 0:** Struktur `Building → Zone → Floor` mengasumsikan proyek selalu punya bangunan bertingkat. Ini **tidak berlaku** untuk pekerjaan sipil (pengurugan lahan tidak punya "Floor"; pemagaran kawasan tidak punya "Building" dalam pengertian struktur bertingkat).

**Rekomendasi struktur CBS yang lebih generik (untuk didiskusikan di Phase D, bukan keputusan final di sini):**
```
Project → Work Area (bangunan ATAU segmen sipil, generik)
  → Sub-Area (lantai untuk bangunan, ATAU seksi/STA untuk pekerjaan linear seperti pagar/jalan)
    → Discipline (Struktur/Arsitektur/MEP/Tanah/Sipil)
      → Work Package → Work Item → Assembly → Resource
```

Alasan: `Work Area`/`Sub-Area` sebagai istilah netral bisa merepresentasikan baik konsep spasial bangunan (Building/Floor/Zone) maupun konsep linear/areal pekerjaan sipil (Segmen A Pengurugan, STA 0+000 – 0+500 untuk pemagaran), tanpa memaksa kedua jenis pekerjaan itu masuk kotak yang sama.

**Ini rekomendasi awal, BUKAN keputusan Phase B** — keputusan struktur final ada di Phase D (Capability Architecture)/Phase F (Data Model). Dicatat di sini karena Phase B eksplisit diminta menjelaskan "alasan mengapa struktur dipilih", dan alasan itu tidak bisa lengkap tanpa mempertimbangkan temuan § 0.

### Kondisi Hari Ini

Sama seperti v1: `rab_items` hanya 3 level generik (category/subcategory/item), tidak ada representasi spasial/disiplin formal.

---

## 6. Cost Engineering Philosophy

*(Tidak berubah signifikan dari v1 — dipertahankan karena sudah solid, ditambah penguatan Round 2.)*

**Prinsip governing:**
```
Calculation Engine → Strategy → Version → Formula → Input → Validation → Explanation → Output
```

**Calculation Philosophy requirement (verbatim, REQUIREMENT MENGIKAT):**
> "The system must never assume there is only one correct way to estimate construction costs. Every calculation must be strategy-driven, versioned, explainable, and replaceable."

**Penguatan Round 2 — bukti nyata kenapa prinsip ini krusial, bukan filosofis semata:** Temuan § 1 (AHSP ganda, dipilih per work item) adalah **bukti konkret** bahwa "satu cara benar" memang tidak berlaku bahkan dalam satu proyek yang sama — ini bukan hipotesis desain, ini fakta operasional Puraloka Persada hari ini.

---

## 7. RAB Traceability

*(Tidak berubah dari v1 — contoh drill-down founder tetap berlaku penuh, diperkuat dengan konteks Price Book § 2.)*

**Gap konkret:** `rab_items` menyimpan angka final tanpa breakdown internal atau jejak sumber harga. Dengan Price Book Strategy (§ 2) yang punya 6 tingkat preseden, traceability menjadi lebih kompleks tapi juga lebih bernilai — setiap angka RAB idealnya bisa menjawab "dari tingkat Price Book mana angka ini berasal, dan kenapa tingkat itu yang menang."

---

## 8. Estimate Outputs — Daftar Lengkap (Dikonfirmasi Seluruhnya Relevan)

Dikonfirmasi eksplisit oleh founder: seluruh 12 output berikut **relevan**, meski belum semua dipakai hari ini:

| # | Output | Status Hari Ini |
|---|---|---|
| 1 | Tender Estimate | ❌ Tidak ada (tidak ada modul tender) |
| 2 | Engineer Estimate | ❌ Tidak ada |
| 3 | Owner Estimate | ❌ Tidak ada |
| 4 | Internal RAP | ❌ Tidak ada (§ 3) |
| 5 | RAB | ✅ Matang |
| 6 | BOQ | 🟡 Sinonim RAB saat ini, belum entitas independen |
| 7 | Material Requirement | ✅ Matang (`material_requests`) tapi manual, bukan hasil generate dari Estimate Engine |
| 8 | Procurement Plan | 🟡 Ada eksekusi PO/GR matang, tapi tidak ada "plan" yang di-generate dari estimasi |
| 9 | Cashflow Forecast | 🟡 Ada cashflow aktual (`cash_accounts`), forecast proyeksi ke depan berbasis estimasi belum ada |
| 10 | Cost Baseline | ❌ Tidak ada (berbeda dari EVM's BAC yang berbasis RAB, § Phase A) |
| 11 | EVM Baseline | ✅ Matang (`kurva-s.ts`, `lib/evm-calculation.ts`) |
| 12 | Budget Baseline | ❌ Tidak ada sebagai konsep terpisah dari `contract_value` |

**Observasi:** Dari 12 output, hanya 2 yang benar-benar matang (RAB, EVM Baseline), 3 matang secara eksekusi tapi terputus dari estimasi (Material Requirement, Procurement Plan, Cashflow), sisanya total nol. Ini mengonfirmasi ulang temuan v1: separuh akhir siklus (eksekusi) matang, separuh awal (estimasi/planning) kosong — dan CECEP-lah yang akan menyatukan keduanya lewat satu Estimate Engine.

---

## 9. Template Library — dengan Konteks Profil Perusahaan (§ 0)

**Dua keluarga template, bukan satu daftar datar** (revisi dari v1 setelah temuan § 0):

### Keluarga A — Building Template (struktur spasial: lantai/zona relevan)
Rumah tinggal, Ruko/komersial kecil, Gedung/Pabrik/Gudang, Perumahan Cluster (kombinasi banyak unit rumah sejenis — kandidat kuat untuk "template + replikasi massal" karena satu tipe rumah dipakai berulang di satu cluster).

### Keluarga B — Civil/Sitework Template (struktur linear/areal: segmen/area relevan, bukan lantai)
Pengurugan Lahan, Pemagaran Kawasan, Landscape Kawasan.

**Bagaimana template diwariskan dan dikustomisasi (jawaban atas pertanyaan eksplisit founder):**
1. Template menyimpan struktur CBS + daftar Work Item + Assembly rujukan (bukan harga final — harga tetap datang dari Price Book saat template dipakai, supaya template tidak "basi" seiring waktu).
2. Saat dipakai di proyek baru, template di-*instantiate*: struktur disalin, tapi setiap Work Item tetap terhubung ke Calculation Strategy dan Price Source yang dipilih saat itu (mis. Price Source berubah ke "Regional — Surabaya" untuk proyek baru, formula/struktur tidak berubah — persis prinsip yang diusulkan founder sebelumnya).
3. Kustomisasi di level instance tidak mengubah template asal — perubahan hanya "naik" ke template kalau eksplisit disimpan sebagai revisi template (mencegah template rusak karena satu proyek yang punya kebutuhan unik).

**Belum terjawab (Open Question):** Apakah Perumahan Cluster butuh mekanisme "template dalam template" (satu tipe rumah diulang N kali dalam satu proyek cluster) — ini kompleksitas tambahan yang layak digali lebih jauh di Phase D.

---

## 10. Assembly Library — dengan Contoh Diperluas

**Contoh dari founder:**
```
Beton → bekisting → pembesian → cor → curing → output: AHSP, resource, durasi, produktivitas
```

**Kondisi hari ini:** Nol — dikonfirmasi ulang, tidak berubah dari v1.

**Perluasan untuk general contractor (§ 0):** Assembly tidak hanya untuk pekerjaan bangunan (beton, bata, dst) — pekerjaan sipil juga punya assembly khas sendiri, contoh: *Pengurugan* → pengukuran/stake-out → pengangkutan tanah → penghamparan → pemadatan per layer → uji kepadatan, dengan resource (alat berat, dump truck, operator) dan produktivitas yang sangat berbeda karakternya dari assembly pekerjaan beton.

---

## 11. AI Estimation Vision — Business Discovery, Bukan Desain

**Prinsip eksplisit founder: belum mendesain AI, hanya menggali input apa yang mungkin didukung.**

Input yang diarahkan untuk dipertimbangkan: PDF, DWG, IFC, BIM, Foto Lapangan, Excel, Spesifikasi Teknis.

**Relevansi tiap jenis input terhadap profil Puraloka Persada (§ 0), sebagai catatan bisnis murni, bukan desain teknis:**
- **Excel** — sudah jadi jalur input utama hari ini (`rab.ts` parser) — jalur AI paling realistis untuk horizon dekat karena tinggal memperkuat yang sudah ada.
- **PDF/Spesifikasi Teknis** — relevan untuk membaca dokumen tender/RKS (Rencana Kerja dan Syarat) yang biasanya jadi dasar penawaran.
- **DWG/BIM/IFC** — lebih relevan untuk proyek Building (Keluarga A, § 9) yang punya gambar kerja detail; kurang relevan untuk pekerjaan sipil sederhana seperti pengurugan yang mungkin hanya punya gambar situasi/topografi.
- **Foto Lapangan** — relevan untuk kedua keluarga, terutama untuk opname/verifikasi kondisi eksisting sebelum estimasi (mis. kondisi lahan sebelum pengurugan).

**Status:** Ini murni observasi bisnis untuk menginformasikan prioritas Phase H (AI Architecture) nanti — tidak ada keputusan desain di sini.

---

## 12. Lessons Learned / Knowledge Capture

**Kondisi hari ini: TIDAK ADA PRAKTIK FORMAL APA PUN** — dikonfirmasi eksplisit founder, bahkan evaluasi informal (rapat/diskusi tim pasca-proyek) pun tidak disebutkan ada.

**Alur yang diarahkan founder:**
```
Actual Cost → Variance → Knowledge → Template Improvement →
Company AHSP Improvement → Company Price Book Improvement → Estimate Engine Improvement
```

**Kenapa ini kritis, dihubungkan dengan temuan lain di Phase B:**
- Company AHSP nol (§ 1.2) — salah satu penyebabnya adalah tidak ada mekanisme lessons learned yang mengalirkan pengalaman proyek jadi Company AHSP baru.
- Contingency tidak pernah dihitung (§ 3.2) — tanpa lessons learned, tidak ada data historis untuk mengetahui berapa contingency yang realistis per jenis pekerjaan.
- Ini adalah **risiko Knowledge Dependency** paling akut yang ditemukan di seluruh Phase B — setiap pengalaman proyek (untung atau rugi) hilang begitu proyek selesai kecuali tersimpan di ingatan individu yang terlibat.

**Implikasi:** Lessons Learned bukan fitur pelengkap di akhir roadmap — ia adalah **loop penutup** yang membuat Company AHSP (§ 1.2), Company Price Book (§ 2), dan Template Library (§ 9) bisa membaik dari waktu ke waktu. Tanpa loop ini, ketiganya akan tetap statis/kosong selamanya meski CECEP sudah dibangun.

---

## Ringkasan Gap — Business Discovery v2 vs Visi CECEP

| Topik | Kondisi Hari Ini | Gap | Catatan Baru Round 2 |
|---|---|---|---|
| Profil Perusahaan | General contractor, cakupan sangat luas | — | **Temuan baru, mengubah bobot seluruh desain** |
| AHSP Strategy | Nasional ganda (Bina Marga + Cipta Karya) dipakai manual; Company AHSP nol | Sangat Besar | Multi-standard per work item, bukan per proyek |
| Price Book | Satu kolom harga tunggal | Sangat Besar | Prioritas 6 tingkat diusulkan |
| RAP Philosophy | Nol total — target cost, contingency, risk, overhead, profit semua tidak eksplisit | Total | Contingency: gap finansial paling berbahaya |
| RBS | 2/16 komponen matang (+3 komponen baru Round 2) | Sangat Besar | Temporary Work & Site Facilities relevan untuk kedua keluarga proyek |
| CBS | 3 level generik, bukan spasial/disiplin | Besar | Perlu struktur netral (Work Area, bukan wajib "Building") |
| Estimate Outputs | 2/12 matang, 3/12 matang-tapi-terputus | Besar | — |
| Template Library | Nol | Total | Dua keluarga: Building vs Civil/Sitework |
| Assembly Library | Nol | Total | Assembly sipil ≠ assembly bangunan |
| AI Estimation | Nol (hanya parser Excel) | Total, horizon panjang | Excel = jalur AI paling realistis jangka pendek |
| Lessons Learned | **Nol total, bahkan informal** | Total | Loop penutup untuk Company AHSP/Price Book/Template |

---

## Open Questions — Status Setelah Round 2

| # | Pertanyaan | Status |
|---|---|---|
| 1 | Sumber harga hari ini (pola dominan atau benar-benar campuran) | **Masih terbuka** — dijawab dengan visi target dua kali berturut-turut |
| 2 | Rujukan AHSP Nasional spesifik | **Sebagian terjawab** — dikonfirmasi minimal Bina Marga + Cipta Karya dipakai; versi/tahun spesifik belum dikonfirmasi |
| 3 | Tipe proyek dominan | **Terjawab** — general contractor, tidak ada dominasi tunggal (§ 0) |
| 4 | Proses tender formal di luar sistem | **Masih terbuka** — belum ditanyakan ulang di Round 2 |
| 5 | Siapa "Company AHSP owner" di organisasi | **Masih terbuka** |
| 6 *(baru)* | Urutan CBS: Zone→Floor atau Floor→Zone, dan apakah struktur "Work Area" netral (§ 5) sesuai realita, atau founder punya preferensi lain | **Baru, terbuka** |
| 7 *(baru)* | Perumahan Cluster — apakah butuh "template dalam template" untuk unit rumah berulang (§ 9) | **Baru, terbuka** |

## Required Decisions (Approval Gate)

1. Apakah temuan § 0 (general contractor, AHSP ganda per work item) sudah menangkap realita dengan akurat?
2. Apakah struktur CBS alternatif yang diusulkan di § 5 (Work Area/Sub-Area netral, bukan Building/Floor wajib) sesuai arah yang diinginkan, atau founder tetap ingin struktur Building/Floor/Zone sebagai standar dan pekerjaan sipil diperlakukan sebagai kasus khusus?
3. Apakah 7 Open Questions boleh berjalan paralel dengan Phase C, atau ada yang wajib dijawab dulu (khususnya #5 Company AHSP owner, yang berkaitan dengan Permission Model)?
4. Apakah Phase B v2 ini sudah dianggap lengkap untuk lanjut ke Phase C, atau masih ada topik yang perlu diperdalam lagi?

---

## 🚦 APPROVAL GATE

Phase B v2 (Construction Cost Engineering Discovery, lengkap) selesai. **STOP** — menunggu approval eksplisit sebelum lanjut ke **Phase C (Problem Discovery)**.
