# CECEP — Phase C.5: Core Domain Discovery

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Sub-phase pendalaman dari Phase C, dengan pola yang sama seperti Phase B.5 adalah pendalaman dari Phase B — founder eksplisit menyebut ini analog langsung. Mega prompt utama (Phase A→L) TIDAK berubah; C.5 hanya disisipkan sebagai lapisan tambahan sebelum Phase D, persis seperti B.5 disisipkan sebelum Phase C.
**Status dokumen ini:** Planning only. **BUKAN Data Model, BUKAN ERD, BUKAN skema database.** Fase ini menjawab dua pertanyaan yang sebelumnya belum pernah dijawab eksplisit: (1) dari 12+ komponen yang sudah ditemukan keberadaannya di Phase B.5, siapa memiliki apa dan di mana batas antar domainnya, dan (2) apakah ada domain yang *seharusnya* ada tapi belum pernah disebut sama sekali — sehingga fase ini benar-benar berfungsi sebagai *discovery*, bukan sekadar dokumentasi ulang daftar yang sudah ada.
**Alasan fase ini ada (verbatim founder):** Kalau Phase D (Capability Architecture) dipaksa mulai sebelum domain ownership jelas, Capability Map berisiko berubah berkali-kali begitu ditemukan hal seperti "ternyata Formula bukan milik AHSP" atau "ternyata Resource punya Productivity sendiri" — risiko yang jauh lebih mahal diperbaiki setelah Phase D-F berjalan dibanding sebelum dimulai.
**Rujukan konstitusi:** Seluruh prinsip governing yang dipakai untuk menilai keputusan domain di dokumen ini merujuk ke [`04-architecture-constitution.md`](04-architecture-constitution.md) — dokumen ini tidak mengulang definisi prinsip, hanya menerapkannya.

---

## Kosakata DDD — Bahasa Baku, Dijelaskan Penuh untuk Pembaca Non-DDD

Dokumen ini memakai istilah Domain-Driven Design (DDD) standar — belum pernah dipakai di dokumen B/B.5/C manapun sejauh ini. Founder eksplisit meminta istilah baku dipakai apa adanya (bukan diterjemahkan/disamarkan) karena akan memudahkan evolusi arsitektur ke depan — tim masa depan yang familiar dengan DDD bisa langsung membaca dokumen ini tanpa penerjemahan ulang. Namun setiap istilah WAJIB: (1) definisi singkat dalam konteks CECEP, (2) alasan kenapa istilah ini dipakai bukan istilah lain, (3) contoh nyata dari domain cost engineering — supaya pembaca yang belum pernah belajar DDD tetap bisa mengikuti tanpa harus membuka referensi lain.

### Aggregate Root

**Definisi di CECEP:** Entity yang menjadi "pintu masuk wajib" untuk mengubah sekelompok data yang saling terkait (disebut satu *Aggregate*) — perubahan pada entity di dalam kelompok itu hanya sah kalau dilakukan lewat Aggregate Root-nya, tidak langsung ke entity anak.

**Kenapa istilah ini dipakai:** Tanpa konsep ini, pertanyaan "siapa boleh mengubah data apa" akan dijawab ad-hoc per kasus — Aggregate Root memberi aturan tunggal yang konsisten: kalau sebuah data hanya bermakna di dalam konteks entity induknya, ubah lewat induknya.

**Contoh nyata CECEP:** **Estimate Version** adalah Aggregate Root untuk kumpulan **Estimate Item** di dalamnya. Kalau seseorang ingin mengubah satu Estimate Item, perubahan itu harus lewat Estimate Version yang menaunginya (supaya total biaya, status approval, dan validasi konsistensi tetap terjaga) — bukan meng-edit satu baris Estimate Item secara terisolasi seolah ia berdiri sendiri.

### Entity

**Definisi di CECEP:** Objek domain yang punya identitas unik dan bisa berubah nilai dari waktu ke waktu, tapi identitasnya tetap sama (dua Entity dianggap "objek yang sama" kalau ID-nya sama, meski atributnya sudah berubah).

**Kenapa istilah ini dipakai:** Membedakan objek yang "punya riwayat hidup" (boleh berubah, tetap objek yang sama) dari objek yang "hanya deskripsi nilai" (Value Object, di bawah).

**Contoh nyata CECEP:** Satu **Resource** di RBS ("Tukang Besi") adalah Entity — harganya bisa berubah, produktivitasnya bisa berubah, tapi ia tetap "Tukang Besi yang sama" secara identitas, dirujuk oleh ID yang tidak pernah berubah sepanjang waktu.

### Value Object

**Definisi di CECEP:** Objek domain yang TIDAK punya identitas sendiri — ia didefinisikan sepenuhnya oleh nilai atributnya. Dua Value Object dengan atribut identik dianggap "sama" sepenuhnya, tidak perlu ID pembanding.

**Kenapa istilah ini dipakai:** Memaksa desain bertanya "apakah ini butuh riwayat/identitas sendiri, atau cukup sebagai nilai yang menempel pada Entity lain?" — mencegah over-engineering (membuat semua hal jadi Entity dengan ID sendiri padahal tidak perlu).

**Contoh nyata CECEP:** **Confidence Level** pada Price Book Entry ("High/Medium/Low", atau skor 0-100) adalah Value Object — ia tidak punya riwayat sendiri, tidak direferensikan entity lain secara independen, ia murni atribut deskriptif yang menempel pada Price Book Entry. Begitu juga **Conversion Rule** (1 sak = 50 kg) — didefinisikan penuh oleh pasangan satuan dan rasionya, tidak butuh identitas terpisah dari nilainya sendiri.

### Domain Service

**Definisi di CECEP:** Logika bisnis yang tidak secara alami "milik" satu Entity/Aggregate tertentu, karena ia beroperasi LINTAS beberapa Aggregate sekaligus.

**Kenapa istilah ini dipakai:** Mencegah kesalahan umum "memaksakan" logika lintas-domain ditempel ke salah satu Entity yang kebetulan terlibat — yang justru mengaburkan batas domain yang sudah susah payah dijaga di dokumen ini.

**Contoh nyata CECEP:** **Formula Engine** dan **Unit Conversion Engine** adalah Domain Service — keduanya tidak "milik" Assembly, tidak "milik" Estimate, tidak "milik" domain manapun secara eksklusif; mereka dipanggil oleh banyak Aggregate berbeda untuk melakukan satu jenis pekerjaan (menghitung/mengonversi) tanpa menyimpan state kepemilikan sendiri.

### Shared Kernel

**Definisi di CECEP:** Struktur data yang sengaja dipakai IDENTIK oleh lebih dari satu Bounded Context — karena tidak ada satu domain yang "memiliki"-nya sendirian, perubahan padanya butuh persetujuan semua domain yang bergantung kepadanya.

**Kenapa istilah ini dipakai:** CECEP secara eksplisit sudah punya kandidat kuat untuk pola ini (Cost Code, RBS) — istilah ini memberi nama formal pada pola yang sebenarnya sudah ditemukan founder secara intuitif di Phase B.5 ("Cost Code harus menjadi identitas universal yang dipakai lintas seluruh platform").

**Contoh nyata CECEP:** **Cost Code** adalah Shared Kernel utama — WBS, CBS, Estimate Item, Procurement, Progress, EVM semuanya merujuk struktur Cost Code yang SAMA PERSIS. Kalau format Cost Code berubah (mis. dari 6 digit jadi 8 digit), SEMUA domain pemakai harus menyepakati perubahan itu bersama — tidak ada satu domain yang bisa mengubahnya sepihak.

### Bounded Context

**Definisi di CECEP:** Batas eksplisit di mana satu domain berlaku dengan makna dan aturan konsisten — dua komponen di dalam boundary yang sama boleh saling mengasumsikan struktur internal satu sama lain; lintas boundary tidak boleh, harus lewat kontrak eksplisit (biasanya lewat Shared Kernel atau Anti-Corruption Layer).

**Kenapa istilah ini dipakai:** Kata "Domain Boundary" yang dipakai draf sebelumnya sebenarnya adalah versi informal dari istilah baku ini — dipakai istilah resminya supaya konsisten dengan literatur arsitektur yang lebih luas.

**Contoh nyata CECEP:** **Pricing** (Price Book, § 6) adalah satu Bounded Context; **Resource Identity** (RBS, § 5) adalah Bounded Context lain. Di dalam Pricing, istilah "Version" berarti versi harga; kalau istilah "Version" dipakai di Bounded Context Estimate, artinya versi estimasi — dua makna berbeda yang TIDAK BOLEH tertukar hanya karena kebetulan memakai kata yang sama.

### Domain Event

**Definisi di CECEP:** Fakta bahwa "sesuatu penting sudah terjadi" di satu domain, yang domain lain perlu tahu — direpresentasikan sebagai objek dengan nama lampau (past tense), bukan sebagai perintah.

**Kenapa istilah ini dipakai:** Company Intelligence Loop (Foundational Principle Pertama) pada dasarnya ADALAH rantai Domain Event — "Project Selesai" memicu "Variance Dihitung" memicu "Lessons Learned Disetujui" memicu "Company AHSP Diperbarui". Menamai pola ini secara eksplisit membuat rantai sebab-akibat itu terlihat sebagai keputusan arsitektur, bukan alur implisit.

**Contoh nyata CECEP:** `EstimateVersionApproved`, `PriceBookEntryVerified`, `VarianceCalculated`, `LessonsLearnedPropagated` — masing-masing adalah Domain Event yang, begitu terjadi, memicu reaksi di domain lain (lihat § Domain Event Utama di bagian Domain Relationship Map).

### Repository (pola akses data, BUKAN "gudang material")

**Definisi di CECEP:** Abstraksi konseptual untuk "cara Aggregate diambil dan disimpan kembali" — disebut di sini murni sebagai konsep domain (Aggregate diperlakukan seolah tersimpan di koleksi terpisah), BUKAN keputusan implementasi teknis (itu Phase F).

**Kenapa istilah ini dipakai:** Untuk mencegah kebingungan penting — istilah "Repository" di DDD SAMA SEKALI TIDAK BERHUBUNGAN dengan "Repository" sebagai istilah umum software engineering (folder kode/git repo) maupun dengan "gudang" material di Puraloka Suite existing. Disebutkan eksplisit di sini justru untuk menandai batasnya, bukan untuk dipakai aktif membangun model di Phase C.5.

**Contoh nyata CECEP:** Secara konseptual, "Cost Code Repository" berarti cara sistem mengambil satu Cost Code dari Cost Code Registry berdasarkan ID-nya — bukan folder kode, bukan gudang fisik.

### Factory

**Definisi di CECEP:** Pola konseptual untuk "cara sebuah Aggregate kompleks pertama kali dibuat dengan konsisten" — dipakai ketika penciptaan sebuah entity tidak sesederhana `INSERT satu baris`, karena butuh beberapa langkah/validasi yang harus terjadi bersamaan.

**Kenapa istilah ini dipakai:** Beberapa domain di CECEP secara eksplisit punya proses penciptaan yang tidak trivial — bootstrap Company AHSP dari AHSP Nasional bukan sekadar copy-paste, ia melibatkan beberapa keputusan sekaligus.

**Contoh nyata CECEP:** Proses "Bootstrap Company AHSP dari AHSP Nasional" (Greenfield Adoption, Phase B) secara konseptual adalah Factory — mengambil Standard AHSP, menyalin strukturnya, memberi identitas Company-level baru, dan menandainya sebagai draft v1.0 — beberapa langkah yang harus terjadi sebagai satu kesatuan, bukan operasi tunggal sederhana.

### Anti-Corruption Layer (ACL)

**Definisi di CECEP:** Lapisan penerjemah yang sengaja disisipkan di antara dua Bounded Context yang modelnya TIDAK sinkron — supaya konsep asing dari satu sisi tidak "mencemari" model domain di sisi lain.

**Kenapa istilah ini dipakai:** CECEP tidak dibangun di ruang kosong — ia harus terintegrasi dengan modul Puraloka Suite existing (Procurement, Finance) yang modelnya dibangun SEBELUM prinsip CECEP (Everything is Versioned, dst) ada. Tanpa ACL, konsep lama yang tidak versioned bisa "bocor" ke dalam model CECEP yang baru.

**Contoh nyata CECEP:** Lihat § Anti-Corruption Layer di bagian Domain Relationship Map — kebutuhan paling nyata ada di titik temu CECEP dengan `project_expenses`/`purchase_orders` existing, yang modelnya transaksional tanpa konsep Price Book versioned.

---

## Metodologi Discovery (Bukan Sekadar Dokumentasi)

Berbeda dari draf pertama dokumen ini, Phase C.5 TIDAK berhenti menganalisis 12 komponen yang sudah diketahui — untuk setiap komponen, dokumen ini juga secara aktif bertanya: *"Apakah ada domain yang seharusnya ada di sini, yang belum pernah disebut eksplisit di Phase B/B.5/C, tapi konsistensi arsitektur menuntutnya?"* Kandidat yang muncul dari pertanyaan ini diklasifikasikan ke tiga status:

- **✅ Confirmed Domain** — sudah eksplisit disebut di Phase B/B.5/C dengan cukup detail untuk dianalisis penuh di Phase C.5 ini.
- **🟡 Candidate Domain** — belum pernah disebut eksplisit, tapi muncul secara logis dari analisis konsistensi; BUKAN keputusan final, ditandai untuk divalidasi founder dan/atau diperdalam di Phase D.
- **⛔ Rejected Domain** — sempat dipertimbangkan sebagai domain terpisah, tapi setelah dianalisis ternyata lebih tepat digabung ke domain lain atau tidak perlu eksis sebagai domain sendiri — dicatat beserta alasan penolakan, supaya keputusan ini tidak "hilang" dan ditanya ulang di fase berikutnya.

---

## A. Confirmed Domains

### A.1 WBS (Work Breakdown Structure)

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Planning/Execution** — terpisah dari CBS (Cost) meski keduanya lensa terhadap Project yang sama ([`02`](02-phase-b5-core-cost-engineering-architecture.md) § 0) |
| **Aggregate Root?** | Bukan — WBS Node adalah child entity di dalam Aggregate **Project** |
| **Entity vs Value Object** | WBS Node adalah **Entity** (punya identitas, riwayat status planning→baseline→revised) |
| **Ownership** | Fungsi **Planning/Scheduling** (kapabilitas Gantt existing) — bukan Cost Engineering |
| **Lifecycle** | Draft → Baseline → Revised — independen dari lifecycle Estimate |
| **Shared Kernel** | Cost Code |
| **Domain Service terlibat** | Tidak ada Domain Service khusus WBS |
| **Domain Event utama** | `WbsNodeBaselined` |
| **Context Mapping** | WBS Node → (referensi) → Cost Code. WBS tidak bergantung ke CBS dan sebaliknya — paralel, bertemu di Cost Code |
| **Domain Responsibility** | *"Kapan dan di mana pekerjaan ini dilakukan?"* |

### A.2 CBS (Cost Breakdown Structure)

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Cost Classification** — terpisah dari WBS dan dari Estimate Item |
| **Aggregate Root?** | **Company CBS Template** — ya, aggregate root sendiri, independen dari Project manapun. **Project CBS** — snapshot, bukan root baru, dimiliki Project. **CBS Node (instance)** — bukan root, child dari Template/Project CBS |
| **Entity vs Value Object** | CBS Node adalah **Entity** dalam Company CBS Template (punya identitas + posisi hierarki yang bisa direvisi) |
| **Ownership** | Standard CBS: bootstrap eksternal. Company CBS: fungsi Cost Engineering perusahaan. Project CBS: dimiliki Project sebagai snapshot |
| **Lifecycle** | Standard: versioned append-only. Company: draft→active→superseded. Project: beku begitu snapshot diambil |
| **Shared Kernel** | Cost Code |
| **Domain Event utama** | `CompanyCbsTemplateRevised`, `ProjectCbsSnapshotted` |
| **Context Mapping** | Company CBS ← (bootstrap) ← Standard CBS. Project CBS ← (snapshot) ← Company CBS. CBS Node → (referensi) → Cost Code → Estimate Item |
| **Domain Responsibility** | *"Biaya ini masuk kategori apa untuk keperluan analisis?"* |

**Catatan domain kritis:** CBS BUKAN Aggregate Root untuk Estimate Item — hanya kategori yang dirujuk. Kalau dipaksakan jadi root, Estimate Item tidak bisa hidup independen dari restrukturisasi CBS di kemudian hari.

### A.3 Cost Code

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Universal Identity** — satu-satunya yang sengaja dirancang tanpa boundary tunggal karena fungsinya menjembatani 17 domain |
| **Aggregate Root?** | **Ya** — Cost Code Registry, SATU per perusahaan |
| **Entity vs Value Object** | Cost Code entry adalah **Entity** (identitas tetap meski deskripsi/kategori berubah seiring waktu) |
| **Ownership** | Fungsi Cost Engineering/Company Standard — domain hilir hanya mereferensikan, tidak pernah membuat sepihak |
| **Lifecycle** | Draft → Active → Deprecated (tidak dihapus, riwayat historis tetap merujuknya) |
| **Shared Kernel** | Cost Code ITU SENDIRI adalah shared kernel utama seluruh CECEP |
| **Domain Event utama** | `CostCodeActivated`, `CostCodeDeprecated` |
| **Context Mapping** | Pusat context map — hampir semua domain punya panah MENUJU Cost Code, hampir tidak ada yang Cost Code bergantung kepadanya |
| **Domain Responsibility** | *"Pekerjaan generik apa ini, terlepas dari proyek/kategori/jadwal mana pun ia muncul?"* |

**Konsekuensi Aggregate Root:** penambahan Cost Code baru harus lewat proses terkontrol (kemungkinan bagian dari Configurable Approval Workflow), bukan dibuat bebas oleh siapa pun yang sedang mengerjakan Estimate.

### A.4 Assembly / AHSP (termasuk Company AHSP)

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Method/Recipe Engineering** — cara pekerjaan diselesaikan |
| **Aggregate Root?** | **Ya** — Assembly memiliki penuh sequence, resource requirement, waste factor-nya sendiri. Resource/Productivity/Formula yang dirujuk adalah referensi ke domain lain, BUKAN bagian Aggregate |
| **Entity vs Value Object** | Assembly adalah **Entity**. Sequence step di dalamnya (Bekisting→Pembesian→dst) adalah **Value Object** — tidak punya identitas sendiri di luar urutan dalam Assembly induknya |
| **Ownership** | Standard AHSP: bootstrap eksternal. Company AHSP: fungsi Cost Engineering, lahir dari bootstrap lalu di-edit estimator (BUKAN database yang sudah ada, tapi digenerate pertama kali oleh sistem). Custom Assembly: dimiliki estimator/Project pembuatnya |
| **Lifecycle** | Bootstrap → Draft Company Version → Active → Revised (v1.1, v1.2, dst) → Superseded |
| **Shared Kernel** | Cost Code, RBS — Assembly TIDAK memiliki Resource, hanya mereferensikan |
| **Domain Service terlibat** | Formula Engine (dipanggil untuk breakdown resource) |
| **Domain Event utama** | `AssemblyActivated`, `CompanyAhspRevised` |
| **Context Mapping** | Standard AHSP → (bootstrap) → Company AHSP. Assembly → (referensi) → RBS, Cost Code. Assembly → (konsumsi parameter) → Productivity Library. Estimate Item → (referensi) → Assembly |
| **Domain Responsibility** | *"Bagaimana cara mengerjakan ini, dan resource apa saja yang dibutuhkan?"* |

**Jawaban eksplisit "Apakah Formula milik Company AHSP?":** TIDAK. Assembly *memakai* Formula Engine (Domain Service) untuk menghitung sebagian komponennya, tapi Formula adalah domain terpisah yang dirujuk, bukan dimiliki.

### A.5 RBS (Resource Breakdown Structure)

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Resource Identity** — terpisah dari harga (Price Book) dan produktivitas (Productivity Library) |
| **Aggregate Root?** | **Ya** — RBS Registry (Company-level); satu resource adalah SATU entity yang dirujuk banyak domain |
| **Entity vs Value Object** | Resource entry adalah **Entity** (identitas tetap, atribut deskriptif bisa berubah) |
| **Ownership** | Fungsi Resource Management/Company Standard — domain hilir merujuk, tidak membuat definisi sendiri-sendiri |
| **Lifecycle** | Active → Inactive (riwayat tetap merujuknya) |
| **Shared Kernel** | RBS ITU SENDIRI — shared kernel kedua terpenting setelah Cost Code, dipakai 10 domain hilir |
| **Domain Event utama** | `ResourceDeactivated` |
| **Context Mapping** | Node pusat kedua di context map. Assembly/Price Book/Productivity Library/Procurement/Payroll → (referensi) → RBS |
| **Domain Responsibility** | *"Resource jenis apa ini, terlepas dari harga atau performanya saat ini?"* |

**Jawaban eksplisit "Apakah Resource punya Productivity sendiri?":** TIDAK dimiliki, DIRUJUK — Productivity melekat pada kombinasi Resource+jenis pekerjaan, domain terpisah (§ A.6b).

**Jawaban eksplisit "Apakah Price Book milik Resource?":** TIDAK — Price Book (§ A.6) mereferensikan RBS entry sebagai subjek harga, bukan memilikinya. "Harga adalah knowledge, bukan angka" (verbatim founder).

### A.6 Versioned Price Book (4 jenis)

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Pricing Knowledge** — terpisah tegas dari RBS (identitas) dan Productivity (performa) |
| **Aggregate Root?** | **Ya, per entry** (satu baris harga, satu versi, satu lokasi) — bukan Price Book sebagai satu entity besar; konsekuensi langsung Foundational Principle Ketiga |
| **Entity vs Value Object** | Price Book Entry adalah **Entity** (identitas + riwayat versi). `Confidence Level` di dalamnya adalah **Value Object** |
| **Ownership** | Material/Equipment: Procurement/Cost Control. Labor: HR/Payroll. Subcontract: Procurement/Legal — pemilik fungsional berbeda meski struktur seragam |
| **Lifecycle** | Draft → Verified (via `Verified By`) → Active (rentang Effective–Expired Date) → Expired |
| **Shared Kernel** | Struktur 8-atribut wajib (Version/Effective Date/Expired Date/Location/Currency/Supplier/Confidence Level/Verified By) — shared di antara keempat jenis Price Book |
| **Domain Event utama** | `PriceBookEntryVerified`, `PriceBookEntryExpired` |
| **Context Mapping** | Price Book Entry → (referensi) → RBS entry. Assembly/RAP/Estimate → (referensi, TIDAK menyalin) → Price Book Entry aktif — No Data Duplication |
| **Domain Responsibility** | *"Berapa harga resource ini, kapan berlaku, seberapa bisa dipercaya?"* |

### A.6b Productivity Library

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Performance Knowledge** — terpisah dari RBS dan Price Book meski sama-sama "menempel" ke RBS entry |
| **Aggregate Root?** | **Ya** — Productivity Record (kombinasi RBS entry + Cost Code + versi); bukan satu Resource punya satu angka tunggal |
| **Entity vs Value Object** | Productivity Record adalah **Entity** |
| **Ownership** | Struktur domain: fungsi Cost Engineering. Sumber data: AI Learning Loop pasca-proyek |
| **Lifecycle** | Bootstrap (AHSP Nasional, mis. 0.5 OH) → Company Baseline → Updated (dari Variance Analysis, mis. jadi 0.42 OH) |
| **Shared Kernel** | Bukan shared kernel — ia konsumen RBS+Cost Code, bukan yang direferensikan balik domain lain di luar Assembly/Formula |
| **Domain Event utama** | `ProductivityRecordUpdatedFromVariance` |
| **Context Mapping** | Productivity Record → (referensi) → RBS+Cost Code. Formula Engine → (konsumsi sebagai parameter) → Productivity Record. Lessons Learned → (memperbarui) → Productivity Record |
| **Domain Responsibility** | *"Seberapa cepat resource ini menyelesaikan jenis pekerjaan tertentu, berdasarkan data aktual?"* |

### A.7 Formula Engine

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Calculation Logic** — murni cara angka dihitung, tidak menyimpan data resource/harga/produktivitas sendiri |
| **Aggregate Root?** | **Ya** — Formula Definition (`Formula + Version + Variable + Parameter + Expression`) |
| **Klasifikasi DDD** | Formula Engine sendiri adalah **Domain Service** (dipanggil lintas domain); Formula Definition di dalamnya adalah **Entity** |
| **Ownership** | Fungsi Cost Engineering/System Configuration — dibuat/diedit user tanpa coding |
| **Lifecycle** | Draft → Tested (simulasi terhadap data nyata) → Active → Superseded |
| **Shared Kernel** | Formula Engine adalah mesin generik dipakai lintas domain (Assembly, Unit Conversion, berpotensi Risk/Contingency masa depan) |
| **Domain Event utama** | `FormulaActivated` |
| **Context Mapping** | Formula Definition tidak bergantung domain manapun (generik) — dipanggil Assembly, Unit Conversion |
| **Domain Responsibility** | *"Bagaimana cara menghitung angka ini dari variabel-variabel yang diberikan?"* |

**Jawaban eksplisit "Apakah Formula milik Company AHSP?":** TIDAK, dikonfirmasi ulang — Formula adalah Domain Service independen yang dipanggil, bukan bagian struktural Assembly manapun.

### A.8 Unit Conversion Engine

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Measurement Reference** untuk konversi satuan murni — BERBEDA dari konversi komposisi (itu output Formula Engine) |
| **Aggregate Root?** | **Ya** — Conversion Rule, kecil dan stabil |
| **Klasifikasi DDD** | Conversion Rule adalah **Value Object** (didefinisikan penuh oleh pasangan satuan + rasio, tidak butuh identitas terpisah). Unit Conversion Engine sendiri adalah **Domain Service** |
| **Ownership** | Fungsi System Reference Data — bersifat universal, tidak spesifik company/project |
| **Lifecycle** | Jarang butuh versioning aktif dalam praktik — contoh konkret di mana "pertimbangkan versioning dulu" (Foundational Principle Ketiga) sah menghasilkan jawaban "tidak perlu" |
| **Shared Kernel** | Dipakai lintas domain (Procurement, Inventory, RAP) tapi sifatnya reference data statis |
| **Domain Event utama** | Tidak signifikan — perubahan Conversion Rule sangat jarang terjadi |
| **Context Mapping** | Berdiri independen, direferensikan Procurement/Inventory/RAP |
| **Domain Responsibility** | *"Berapa nilai X dalam satuan Y?"* |

### A.9a Estimate Item

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Cost Calculation Result** — di dalam Bounded Context yang sama dengan Estimate Version |
| **Aggregate Root?** | **BUKAN** — child entity di dalam Aggregate Estimate Version; tidak sah eksis di luar konteks satu Estimate Version tertentu |
| **Entity vs Value Object** | **Entity** (punya identitas, meski selalu berada dalam siklus hidup Aggregate induknya) |
| **Ownership** | Dimiliki Estimate Version yang menaunginya — BUKAN dimiliki CBS (hanya kategori dirujuk) dan BUKAN Assembly (hanya method dirujuk) |
| **Lifecycle** | Mengikuti lifecycle Estimate Version induknya |
| **Shared Kernel** | Cost Code, Assembly, CBS Node, WBS Node bertemu di sini untuk menghasilkan satu angka biaya |
| **Domain Event utama** | Tidak memicu Domain Event sendiri — perubahan direpresentasikan lewat event di level Estimate Version induknya |
| **Context Mapping** | Estimate Item → (referensi) → Cost Code, Assembly, CBS Node, WBS Node. Estimate Item ← (dimiliki) ← Estimate Version |
| **Domain Responsibility** | *"Berapa biaya pekerjaan spesifik ini, dalam konteks Estimate Version ini?"* |

**Jawaban eksplisit "Apakah Estimate Item Aggregate Root?":** TIDAK. Konsekuensi: validasi konsistensi (mis. total Item ≤ Budget) harus terjadi di level Estimate Version, bukan tersebar di validasi per-Item.

### A.9b Estimate Version

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Estimate Lifecycle Management** |
| **Aggregate Root?** | **Ya** — divalidasi Configurable Approval Workflow ("Yang Divalidasi: Estimate Version, Bukan Orang") |
| **Entity vs Value Object** | **Entity**, dengan sejumlah Value Object di dalamnya (mis. metadata approval seperti timestamp+approver di titik waktu tertentu) |
| **Ownership** | Dimiliki Scenario yang menaunginya |
| **Lifecycle** | Draft → Under Review → Approved → Baseline/Frozen → Superseded |
| **Shared Kernel** | Tidak jadi shared kernel — arah ketergantungan satu arah (bergantung ke CBS/RBS/Assembly/Price Book) |
| **Domain Event utama** | `EstimateVersionApproved`, `EstimateVersionFrozen`, `EstimateVersionSuperseded` |
| **Context Mapping** | Estimate Version ← (dimiliki) ← Scenario. Estimate Version → (memicu saat Approved) → RAB/RAP/Budget/Cashflow/EVM Baseline |
| **Domain Responsibility** | *"Apakah kumpulan Estimate Item ini sudah final dan disetujui pada titik waktu ini?"* |

**Jawaban eksplisit "Apakah Estimate Revision Event Sourcing?":** Domain-level yang dikunci: setiap revisi menghasilkan Estimate Version BARU yang immutable setelah Approved, bukan mutasi diam-diam. Pola implementasi (event sourcing vs snapshot) adalah keputusan Phase F, di luar cakupan di sini.

### A.9c Scenario

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Parallel Comparison Management** |
| **Aggregate Root?** | **Ya** — level di atas Estimate Version, dimiliki langsung Project |
| **Entity vs Value Object** | **Entity** |
| **Ownership** | Dimiliki Project |
| **Lifecycle** | Active → Branched → Archived — berbeda dari Draft/Approved Estimate Version, karena Scenario adalah wadah |
| **Shared Kernel** | CBS, WBS, Cost Code — antar-Scenario berbagi struktur sama supaya bisa dibandingkan apple-to-apple |
| **Domain Event utama** | `ScenarioBranched`, `ScenarioArchived` |
| **Context Mapping** | Project → (memiliki banyak) → Scenario → (memiliki banyak, seiring revisi) → Estimate Version → (memiliki banyak) → Estimate Item |
| **Domain Responsibility** | *"Ini jalur estimasi yang mana, dan bagaimana ia dibandingkan dengan jalur lain?"* |

**Jawaban eksplisit "Apakah Scenario punya Estimate sendiri?":** YA — hierarki penuh **Project → Scenario → Estimate Version → Estimate Item**, empat lapis berbeda. Temuan paling signifikan Phase C.5: "Estimate" sebelumnya dipakai sebagai satu istilah tunggal di Phase B.5, padahal menyembunyikan tiga lapis domain berbeda.

### A.10 Company AHSP — Klarifikasi Silang

Sudah tercakup di § A.4. **Jawaban eksplisit "Apakah Company AHSP Aggregate?":** TIDAK — bukan domain terpisah, ia adalah *state* tertentu dari Assembly yang sudah melalui bootstrap dari Standard AHSP.

### A.11 Estimation Workflow & Configurable Approval Workflow

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Process Governance** — mengatur kapan/oleh siapa perubahan sah, terpisah dari domain yang datanya diatur |
| **Aggregate Root?** | **Ya** — Approval Chain Definition (7 dimensi: Company/Branch/Project Type/Contract Value/Estimate Type/Cost Threshold/Risk Level) |
| **Klasifikasi DDD** | Approval Chain Definition adalah **Entity**; Workflow Engine sendiri adalah **Domain Service** generik |
| **Ownership** | Fungsi System Configuration/RBAC — bukan Cost Engineering, karena governance ini berpotensi dipakai domain Puraloka Suite lain |
| **Lifecycle** | Versioned; perubahan tidak retroaktif mengubah approval masa lalu |
| **Shared Kernel** | Workflow Engine dipakai Estimate Version, Price Book Entry (`Verified By`), Lessons Learned — TIGA domain berbeda, SATU mesin approval |
| **Domain Event utama** | `ApprovalRequested`, `ApprovalGranted`, `ApprovalRejected` |
| **Context Mapping** | Approval Chain Definition → (divalidasi terhadap) → Estimate Version/Price Book Entry/Lessons Learned. RBAC existing → (basis identitas approver untuk) → Approval Chain |
| **Domain Responsibility** | *"Apakah perubahan ini sudah melalui persetujuan yang sesuai konteksnya?"* |

### A.12 Lessons Learned, Variance, Root Cause

| Pertanyaan | Jawaban |
|---|---|
| **Bounded Context** | **Company Intelligence Capture** — domain BARU, belum ada padanan praktik formal di Phase A |
| **Aggregate Root?** | **Ya** — Lessons Learned Record (per Project, per Scenario dievaluasi); Variance dan Root Cause Analysis adalah child entity di dalamnya |
| **Entity vs Value Object** | Lessons Learned Record: **Entity**. Root Cause Analysis: **Entity** (bisa direvisi/didiskusikan). Variance (angka delta): **Value Object** |
| **Ownership** | Proses Project Closeout — bukan dimiliki Estimate manapun langsung |
| **Lifecycle** | Draft → Under Review (via Approval Workflow) → Approved → **Propagated** (unik: menandai hasil sudah mengalir jadi update ke domain lain) |
| **Shared Kernel** | Tidak jadi shared kernel — arah satu arah: mengkonsumsi Estimate Version+Actual Cost, memproduksi update ke Assembly/Price Book/Productivity Library |
| **Domain Event utama** | `VarianceCalculated`, `RootCauseIdentified`, `LessonsLearnedApproved`, `LessonsLearnedPropagated` |
| **Context Mapping** | Estimate Version+Actual Cost → (dibandingkan) → Variance → (dianalisis) → Root Cause → (divalidasi via) → Approval Workflow → (approved, memicu) → update Company AHSP/Price Book/Productivity Library — ini Company Intelligence Loop digambar sebagai Context Map |
| **Domain Responsibility** | *"Apa yang harus berubah di knowledge perusahaan akibat proyek ini?"* |

**Konsekuensi arsitektur terbesar di seluruh peta:** ownership "Propagated" menyentuh TIGA Aggregate Root lain sekaligus — satu-satunya domain dengan *write access* lintas-boundary terkontrol. Phase D harus memastikan kapabilitas ini TIDAK BOLEH menulis langsung tanpa melalui Approval Workflow ("AI tidak boleh langsung belajar. Harus ada approval." — verbatim founder).

---

## B. Candidate Domains (Baru Ditemukan — Belum Pernah Disebut Eksplisit di B/B.5/C)

Domain-domain berikut muncul dari pertanyaan "apakah ada yang harus ada di sini agar arsitektur tetap konsisten?" selama analisis § A di atas — bukan brainstorm bebas, melainkan konsekuensi logis dari gap yang terlihat saat menjawab kedelapan pertanyaan domain untuk tiap Confirmed Domain.

### B.1 🟡 Regional Cost Index

**Kenapa muncul:** Price Book Entry (§ A.6) punya atribut `Location` sebagai bagian struktur wajibnya, tapi tidak ada mekanisme eksplisit untuk *menormalisasi* harga antar lokasi (mis. "harga Bandung vs Jakarta vs Surabaya untuk material yang sama, disesuaikan indeks biaya hidup/upah regional"). Tanpa domain ini, setiap Price Book Entry per lokasi berdiri sendiri tanpa cara membandingkan atau mengekstrapolasi ke lokasi baru yang belum punya data historis.

**Bounded Context sementara:** Regional Reference Data — sejenis dengan Unit Conversion (§ A.8): reference data yang relatif stabil, bukan knowledge yang berkembang cepat seperti Price Book.

**Kenapa penting untuk Puraloka Persada spesifik:** Perusahaan general contractor lintas gedung dan sipil ([`01`](01-phase-b-cost-engineering-discovery.md) § 0) yang berpotensi ekspansi lokasi proyek — begitu proyek pertama di luar Bandung terjadi tanpa data Price Book lokal, Regional Cost Index adalah satu-satunya cara memberi estimasi awal yang masuk akal (bukan menyalin harga Bandung mentah-mentah).

**Status:** Candidate — perlu divalidasi apakah kebutuhan ini nyata untuk Puraloka Persada dalam waktu dekat, atau kompleksitas tambahan yang bisa ditunda ke Phase J (Future Vision).

### B.2 🟡 Knowledge Asset Index (Lapisan di Atas Lessons Learned)

**Kenapa muncul:** § A.12 menunjukkan Lessons Learned Record hanya terikat ke SATU Project/Scenario. Tapi Foundational Principle Kedua menyebut knowledge harus "reusable" — pertanyaannya: bagaimana estimator MENCARI lessons learned yang relevan dari proyek-proyek lampau saat mengerjakan estimasi baru? Tanpa lapisan pencarian/indexing eksplisit, Lessons Learned berisiko bernasib sama dengan masalah yang justru ingin dipecahkan Phase C § "Learning Must Be Input Not Just Output" — tersimpan tapi tidak pernah ditemukan kembali.

**Bounded Context sementara:** Knowledge Retrieval — domain yang secara khusus menjawab "lessons learned/pola mana yang relevan untuk situasi saat ini", kemungkinan besar inilah yang jadi fondasi AI Learning Loop (§ A.12) bekerja, bukan sekadar konsumen pasif.

**Status:** Candidate — kemungkinan besar ini BUKAN domain terpisah, melainkan Domain Service/kapabilitas pencarian di atas Lessons Learned Record yang sudah ada — perlu diperjelas di Phase D apakah berdiri sendiri atau melebur jadi kapabilitas AI Learning Loop.

### B.3 🟡 Contingency & Risk Register

**Kenapa muncul:** Phase B menyebut "Contingency" sebagai salah satu dari 4 praktik yang harus segera dibangun (RAP/Contingency/Company AHSP/Lessons Learned — semua sama urgennya), dan Constraint § "Scenario Comparison" (`04` § 3.3) eksplisit menyebut dimensi "Risk" sebagai salah satu dari 7 dimensi perbandingan Scenario. Tapi sejauh Phase B.5, tidak ada domain eksplisit yang memformalkan Risk sebagai entity — ia hanya disebut sebagai "dimensi" abstrak.

**Bounded Context sementara:** Risk Knowledge — sejenis Productivity Library (§ A.6b): angka yang idealnya berkembang dari data aktual (Variance yang polanya berulang → Risk Allowance yang lebih akurat), tapi lebih subjektif sifatnya dibanding Productivity (yang murni terukur objektif).

**Relasi dugaan:** Risk Register kemungkinan besar direferensikan Estimate Version (sebagai allowance tambahan di luar Assembly biasa) dan diperbarui lewat Lessons Learned Loop yang sama seperti Productivity Library.

**Status:** Candidate — perlu keputusan eksplisit founder apakah Risk Register jadi domain formal di Phase C.5/D ini, atau tetap sebagai catatan di Estimate Version tanpa domain sendiri (ditunda ke fase lebih matang).

### B.4 🟡 Reference Library (Payung untuk Standard AHSP + Standard CBS + Conversion Rule)

**Kenapa muncul:** Analisis § A.2 (CBS), § A.4 (Assembly), dan § A.8 (Unit Conversion) tiga-tiganya secara independen menemukan pola yang identik: ada "lapisan bootstrap eksternal" (Standard CBS, Standard AHSP, Conversion Rule universal) yang sifatnya read-mostly, bukan milik perusahaan, tapi jadi titik awal semua turunan company-level. Pola yang berulang tiga kali secara independen adalah sinyal kuat ini sebenarnya SATU domain payung, bukan tiga hal kebetulan mirip.

**Bounded Context sementara:** External Reference Data — domain yang mengelola seluruh data rujukan yang datang dari LUAR perusahaan (AHSP Nasional, standar CBS nasional, rasio konversi fisika/matematika universal) sebagai satu kelompok, terpisah dari data yang perusahaan hasilkan sendiri.

**Kenapa ini penting secara arsitektur:** Kalau tidak diformalkan sebagai satu domain, ada risiko tiga tim/fase berbeda (yang mengerjakan CBS, Assembly, Unit Conversion) membangun tiga mekanisme "import data referensi eksternal" yang berbeda-beda — padahal seharusnya satu pola yang sama dipakai ulang (konsisten dengan Engine over Module, `04` § 5 Invariant 7).

**Status:** Candidate kuat — rekomendasi eksplisit untuk diperdalam di Phase D sebagai kandidat Engine tersendiri (kemungkinan salah satu dari "working name #11/#12" yang belum diberi nama di Phase B.5).

### B.5 🟡 CBS Revision History (Sebagai Entity Eksplisit, Bukan Hanya Konsep Versioning Implisit)

**Kenapa muncul:** § A.2 menyebut Company CBS Template "draft→active→superseded", tapi berbeda dari Price Book Entry (§ A.6) yang eksplisit distrukturkan sebagai "satu entry = satu versi", Company CBS Template belum jelas apakah setiap revisinya adalah entity baru (mengikuti pola Price Book) atau field `version_number` yang di-mutate di tempat. Pertanyaan founder sendiri ("Cost Breakdown Structure Revision") secara eksplisit menunjuk gap ini.

**Bounded Context sementara:** Bagian dari CBS (§ A.2), bukan domain berdiri sendiri — tapi butuh keputusan eksplisit yang belum diambil: apakah pola versioning CBS mengikuti pola Price Book Entry (immutable, entity baru per versi) atau pola lain.

**Status:** Candidate — lebih tepat disebut *keputusan domain yang tertunda* dibanding domain baru murni; ditandai di sini supaya tidak terlewat saat Phase D/F menentukan pola versioning konkret.

---

## C. Rejected Domains (Dipertimbangkan, Ditolak Berdiri Sendiri)

### C.1 ⛔ "Budget" sebagai Domain Terpisah dari Estimate Version

**Kenapa dipertimbangkan:** Phase A menemukan `projects.contract_value` sebagai representasi budget yang sudah eksis, dan dokumen arsitektur lama sempat mencatat "Budget vs Actual Cost Control" sebagai gap terpisah dari EVM.

**Kenapa ditolak sebagai domain sendiri:** Foundational Principle Keempat (Everything is Derived) sudah eksplisit menyatakan Budget adalah salah satu OUTPUT dari Estimate ("Estimate → Budget"). Menjadikan Budget domain terpisah dengan Aggregate Root sendiri akan menciptakan sumber kebenaran ganda dengan Estimate Version — melanggar No Data Duplication. Budget tetap relevan sebagai *proyeksi/tampilan* dari Estimate Version yang sudah Approved, bukan sebagai entity yang diinput manual terpisah.

### C.2 ⛔ "RAB" sebagai Domain Terpisah dari Estimate

**Kenapa dipertimbangkan:** RAB adalah istilah yang paling sering dipakai sehari-hari di Puraloka Suite existing, terasa layak jadi entity sendiri.

**Kenapa ditolak sebagai domain sendiri:** Sudah dijawab eksplisit di § A.9a — RAB adalah *output tampilan* dari kumpulan Estimate Item pada Scenario Baseline tertentu, bukan entity domain sendiri. Kalau RAB dijadikan domain terpisah, ia akan jadi salinan data dari Estimate Item — pelanggaran langsung No Data Duplication.

### C.3 ⛔ "Vendor/Supplier Master Data" sebagai Domain Baru CECEP

**Kenapa dipertimbangkan:** Price Book Entry (§ A.6) punya atribut `Supplier` yang terlihat butuh domain identitas supplier sendiri, mirip pola RBS untuk resource.

**Kenapa ditolak sebagai domain baru:** Phase A sudah menemukan `suppliers` sebagai entity matang di Procurement (migration 039-041) — CECEP tidak perlu membangun ulang domain Supplier, cukup mereferensikan entity existing lewat Cost Code/RBS sebagai jembatan (pola yang sama seperti integrasi Procurement lain). Membangun domain Supplier baru khusus CECEP akan menciptakan duplikasi identitas supplier antara CECEP dan Procurement — pelanggaran langsung Single Source of Truth.

### C.4 ⛔ "Currency Exchange Rate" sebagai Domain Terpisah — **DIBALIK oleh [ACR-003](04a-adr-traceability-log.md#acr-003-fx-rate-versioning-contradiction)**

**Kenapa dipertimbangkan:** Price Book Entry punya atribut `Currency` eksplisit (untuk Future Vision multi-currency, Phase J) — terasa butuh domain kurs sendiri.

**Kenapa ditolak berdiri sendiri di Phase C.5 ini (keputusan ASLI, dipertahankan di sini sebagai jejak historis):** Currency Exchange Rate secara konseptual sama persis polanya dengan Unit Conversion (§ A.8) — rasio matematis antar dua "satuan" (dalam hal ini mata uang) yang stabil dan universal. Tidak perlu domain baru; ini adalah kasus khusus dari Unit Conversion Engine yang sudah ada, bukan domain terpisah.

**⚠️ Keputusan ini DIBALIK oleh ACR-003** (ditemukan Enterprise Architecture Audit, Dimensi 8): FX rate BERSIFAT temporal/volatile (beda dari rasio fisik yang konstan selamanya), sementara Unit Conversion eksplisit "tidak perlu versioning" (`07` § I) — kontradiksi dengan kebutuhan Replay (`06b` § 7) yang mensyaratkan rate historis immutable-per-waktu. Currency Exchange Rate sekarang naik status jadi Knowledge Data ter-versi tersendiri, pola sama dengan Price Book Entry — TIDAK lagi digabung ke Unit Conversion Rule fisik. Fungsi pemanggilan `CONVERT()` di Formula Language tidak berubah. Lihat [ACR-003](04a-adr-traceability-log.md#acr-003-fx-rate-versioning-contradiction) untuk detail penuh.

---

## Domain Relationship Map — Diagram Konseptual

**Tujuan:** Menjembatani Problem Discovery (Phase C/C.5) dengan Capability Architecture (Phase D). Diagram ini konseptual — BUKAN ERD, BUKAN skema database, BUKAN diagram kelas. Ia menunjukkan Ownership, Dependency, Upstream/Downstream, Shared Kernel, Anti-Corruption Layer, Aggregate Boundary, Domain Event utama, dan aliran informasi.

### Legenda

```
[Nama Domain]         = Bounded Context
◆                      = Aggregate Root di dalam Bounded Context tsb
───▶                   = Dependency searah (hilir bergantung ke hulu)
◀──▶                   = Shared Kernel (dua Bounded Context berbagi struktur sama)
╌╌╌▶                   = Aliran Domain Event (reaksi, bukan pemanggilan langsung)
▓▓▓                    = Anti-Corruption Layer (penerjemah wajib di titik ini)
```

### Peta Utama

```
┌───────────────────────────── UPSTREAM (Reference & Identity) ─────────────────────────────┐
│                                                                                              │
│  [Reference Library]🟡          [Cost Code]✅                    [RBS]✅                    │
│  ◆ Standard AHSP/CBS/          ◆ Cost Code Registry             ◆ RBS Registry              │
│    Conversion Rule                    ▲    ▲                          ▲   ▲                 │
│         │ bootstrap                   │    │                          │   │                 │
│         ▼                    ◀──shared kernel──▶              ◀──shared kernel──▶            │
│                                        │    │                          │   │                 │
└────────────────────────────────────────┼────┼──────────────────────────┼───┼─────────────────┘
                                          │    │                          │   │
         ┌────────────────────────────────┘    └──────────┐    ┌──────────┘   └─────────┐
         ▼                                                  ▼    ▼                        ▼
┌─────────────────┐  ┌─────────────────┐        ┌──────────────────┐         ┌──────────────────┐
│ [WBS]✅          │  │ [CBS]✅          │        │ [Assembly/AHSP]✅  │         │ [Price Book]✅ /  │
│ ◆ WBS Node       │  │ ◆ Company CBS    │───────▶│ ◆ Assembly         │────────▶│ [Productivity]✅   │
│ (child: Project) │  │   Template       │        │ (referensi RBS,    │         │ ◆ per-entry root   │
└────────┬─────────┘  └────────┬─────────┘        │  Cost Code)        │         └─────────┬─────────┘
         │                     │                   └──────────┬─────────┘                    │
         │                     │                              │ calls (Domain Service)        │
         │                     │                              ▼                               │
         │                     │                   ┌─────────────────────┐                    │
         │                     │                   │ [Formula Engine]✅    │                    │
         │                     │                   │ [Unit Conversion]✅   │◀───(kasus khusus)──┤
         │                     │                   │ (Domain Service,     │    [Currency FX]⛔   │
         │                     │                   │  generik, dipanggil) │    (digabung ke UC)  │
         │                     │                   └─────────────────────┘                    │
         └──────────┬──────────┘                                                               │
                     ▼                                                                          │
         ┌───────────────────────┐                                                              │
         │   [Cost Code] (lagi — titik temu WBS+CBS)                                             │
         └───────────┬───────────┘                                                              │
                      ▼                                                                          │
┌──────────────────── CORE (Estimate Aggregate Chain) ──────────────────────────────────────────┤
│                                                                                                 │
│  [Project]                                                                                     │
│    │ owns                                                                                      │
│    ▼                                                                                            │
│  [Scenario]✅ ◆                                                                                  │
│    │ owns (banyak, revisi)                                                                      │
│    ▼                                                                                             │
│  [Estimate Version]✅ ◆  ◀────────────────── referensi (bukan menyalin) ───────────────────────┘
│    │ owns                          Cost Code, Assembly, Price Book, Productivity, Formula
│    ▼
│  [Estimate Item] (child entity, BUKAN root)
│
└──────────────┬──────────────────────────────────────────────────────────────────────────────┘
               │ Domain Event: EstimateVersionApproved
               ▼
┌──────────────── DOWNSTREAM (Derived Output — Foundational Principle Keempat) ─────────────────┐
│                                                                                                  │
│   RAB (tampilan)   RAP (tampilan)   Budget (tampilan)   Cashflow Baseline   EVM Baseline        │
│   ⛔ bukan domain    ⛔ bukan domain   ⛔ bukan domain      (existing Puraloka)   (existing)         │
│   terpisah — semua derived read-model dari Estimate Version, bukan entity tersimpan sendiri      │
│                                                                                                  │
└──────────────┬───────────────────────────────────────────────────────────────────────────────┘
               │
               ▼ (eksekusi berjalan, waktu berlalu)
┌──────────────── COMPANY INTELLIGENCE LOOP (Feedback, bukan forward flow) ─────────────────────┐
│                                                                                                  │
│  ▓▓▓ ANTI-CORRUPTION LAYER ▓▓▓                                                                  │
│  (wajib di titik ini — lihat § Anti-Corruption Layer di bawah)                                  │
│         ▲                                                                                        │
│         │ menerjemahkan                                                                          │
│  [Actual Cost / Progress] (existing Puraloka Suite: project_expenses, kasbons,                  │
│                             daily_wage_logs, progress_payments, borongan_settlements)            │
│         │                                                                                        │
│         ▼                                                                                        │
│  [Lessons Learned / Variance / Root Cause]✅ ◆                                                    │
│         │                                                                                        │
│         │ ╌╌╌▶ Domain Event: VarianceCalculated                                                  │
│         │ ╌╌╌▶ Domain Event: RootCauseIdentified                                                 │
│         ▼                                                                                        │
│  [Approval Workflow]✅ ◆ (Domain Service generik — TITIK WAJIB, tidak bisa dilewati)                │
│         │                                                                                        │
│         │ ╌╌╌▶ Domain Event: LessonsLearnedApproved                                              │
│         ▼                                                                                        │
│  [Lessons Learned]  ── ╌╌╌▶ Domain Event: LessonsLearnedPropagated ──▶  ┌─────────────────────┐  │
│                                                                          │ WRITE ke 3 Aggregate:│  │
│                                                                          │ • Company AHSP       │  │
│                                                                          │   (via Assembly)     │  │
│                                                                          │ • Price Book Entry   │  │
│                                                                          │ • Productivity Record│  │
│                                                                          └──────────┬───────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┼─────────────┘
                                                                                        │
                                                                    (siklus kembali ke) │
                                                                                        ▼
                                                                          Next Project Estimate
                                                                          (lebih akurat)
```

### Ringkasan Ownership (Upstream → Downstream)

| Lapis | Domain | Sifat |
|---|---|---|
| **Upstream (Reference/Identity)** | Reference Library🟡, Cost Code, RBS | Stabil, jarang berubah struktur, jadi fondasi semua lapis di bawahnya |
| **Mid-stream (Knowledge)** | CBS, Assembly/AHSP, Price Book, Productivity, Formula Engine, Unit Conversion, Regional Cost Index🟡, Risk Register🟡 | Berkembang seiring waktu via Company Intelligence Loop |
| **Core (Transactional Aggregate)** | Scenario, Estimate Version, Estimate Item, WBS | Dibuat per Project, siklus hidup mengikuti proyek |
| **Downstream (Derived Read-Model)** | RAB, RAP, Budget, Cashflow Baseline, EVM Baseline | TIDAK PERNAH domain tersendiri — murni proyeksi dari Estimate Version |
| **Feedback (Governance)** | Approval Workflow | Melintasi SEMUA lapis di atas — bukan lapis tersendiri, melainkan Domain Service yang dipanggil dari Mid-stream dan Feedback Loop |
| **Feedback (Learning)** | Lessons Learned/Variance/Root Cause | Satu-satunya domain dengan aliran informasi BALIK dari Downstream/existing Puraloka Suite ke Mid-stream — inilah yang menutup loop |

### Anti-Corruption Layer — Di Mana Dibutuhkan dan Kenapa

**Titik kebutuhan utama: antara `[Actual Cost/Progress]` (existing Puraloka Suite) dan `[Lessons Learned/Variance]` (CECEP baru).**

**Kenapa dibutuhkan di sini secara spesifik:** Modul existing (`project_expenses`, `kasbons`, `daily_wage_logs`, `progress_payments`, `borongan_settlements` — Phase A) dibangun SEBELUM prinsip CECEP ada — datanya transaksional, tidak versioned, tidak eksplisit terhubung ke Cost Code per baris. Kalau Variance Calculation di CECEP membaca data ini LANGSUNG tanpa lapisan penerjemah, dua risiko konkret muncul:
1. Konsep "status approved" di `kasbons`/`project_expenses` (boolean sederhana) bisa disalahartikan setara dengan konsep "Verified" di Price Book Entry (yang punya makna lebih kaya: siapa, kapan, tingkat kepercayaan) — mencemari model Pricing Knowledge yang justru dijaga ketat di § A.6.
2. Data existing tidak selalu punya Cost Code per baris (Phase A menemukan gap ini eksplisit) — ACL adalah tempat yang tepat untuk menangani "resolusi Cost Code" dari data lama yang mungkin hanya py structured by `project_id`/`category`, bukan langsung memaksa Variance Calculation menangani ambiguitas ini sendiri.

**Kebutuhan kedua (lebih ringan): antara `[Reference Library]` (Standard AHSP/CBS eksternal) dan `[Assembly]`/`[CBS]` company-level.** AHSP Nasional/standar CBS berasal dari format dokumen resmi pemerintah (PDF/Excel) yang strukturnya tidak dirancang untuk sistem — proses bootstrap (§ Factory, Kosakata DDD) secara alami membutuhkan lapisan penerjemah format-ke-domain-model, meski risikonya lebih rendah dibanding titik pertama karena arahnya satu kali (bootstrap), bukan sinkronisasi berkelanjutan.

### Domain Event Utama — Daftar Konsolidasi

| Domain Event | Dipicu Oleh | Didengarkan Oleh |
|---|---|---|
| `CostCodeActivated` / `CostCodeDeprecated` | Cost Code | Semua 17 domain hilir (referensi ulang) |
| `CompanyAhspRevised` | Assembly | Estimate Version yang sedang Draft (opsional re-kalkulasi) |
| `PriceBookEntryVerified` | Price Book | Assembly, Estimate Version (harga baru tersedia) |
| `ProductivityRecordUpdatedFromVariance` | Productivity Library | Formula Engine (parameter baru) |
| `EstimateVersionApproved` | Estimate Version | Downstream read-model generator (RAB/RAP/Budget/Cashflow/EVM) |
| `VarianceCalculated` | Lessons Learned domain | Root Cause Analysis (memicu langkah berikutnya) |
| `RootCauseIdentified` | Lessons Learned domain | Approval Workflow (memicu validasi) |
| `LessonsLearnedApproved` | Approval Workflow | Lessons Learned domain (status lanjut ke Propagated) |
| `LessonsLearnedPropagated` | Lessons Learned domain | Assembly, Price Book, Productivity Library (tiga Aggregate ditulis) |

---

## Pemeriksaan Terhadap Architectural Invariants

Setiap domain (Confirmed dan Candidate) diperiksa singkat terhadap [`04-architecture-constitution.md`](04-architecture-constitution.md) § 5:

- **Single Source of Truth:** Terjaga di Confirmed Domains — setiap Shared Kernel (Cost Code, RBS) punya SATU registry company-level. Rejected Domain C.3 (Vendor Master Data) secara eksplisit ditolak justru untuk menjaga invariant ini.
- **Derived Data:** Terjaga — RAB/RAP/Budget/Cashflow eksplisit derived read-model (Rejected Domain C.1, C.2), bukan entity tersimpan sendiri.
- **Strategy over Formula / Engine over Module:** Terjaga — Formula Engine dan Unit Conversion Engine adalah Domain Service generik. Candidate Domain B.4 (Reference Library) muncul justru DARI pengamatan bahwa pola ini perlu diformalkan lebih jauh, bukan pelanggaran.
- **Traceability:** Terjaga struktural via Domain Relationship Map — setiap Estimate Item bisa ditelusuri mundur lewat Cost Code → Assembly → RBS/Price Book/Productivity.
- **Risiko yang ditemukan (butuh perhatian eksplisit Phase D):**
  1. Lessons Learned punya *write access* ke tiga Aggregate Root lain — satu-satunya domain dengan kapabilitas menulis lintas-boundary; harus dipagari Approval Workflow secara eksplisit di desain kapabilitas Phase D.
  2. Anti-Corruption Layer antara data existing Puraloka Suite dan CECEP BELUM didesain konkret — statusnya baru "diidentifikasi perlu ada", bukan "sudah didesain" — Phase D/F harus menjadikan ini kapabilitas eksplisit, bukan asumsi implisit bahwa integrasi "akan beres sendiri".

---

## Assumptions

1. Pola "Estimate Item bukan Aggregate Root, Estimate Version yang jadi root" mengikuti prinsip DDD standar — belum divalidasi lewat contoh kasus konkret Puraloka Persada di luar penalaran struktural.
2. Kelima Candidate Domain (§ B) adalah hasil analisis konsistensi terhadap apa yang SUDAH dikonfirmasi — bukan daftar lengkap segala kemungkinan domain masa depan; domain baru lain berpotensi muncul lagi begitu Phase D mulai mendesain kapabilitas konkret.
3. Anti-Corruption Layer kedua (Reference Library ↔ Assembly/CBS) dinilai risikonya lebih rendah dari yang pertama secara kualitatif (arah satu kali vs sinkronisasi berkelanjutan) — belum diukur dengan bukti konkret dari proses bootstrap yang sebenarnya (karena bootstrap belum pernah dijalankan, Phase B mengonfirmasi kondisi hari ini nol praktik formal).

---

## Discovery Validation & Freeze

**Kedudukan:** Gerbang singkat, BUKAN phase baru (tidak ada "Phase C.7/C.8/C.9") — founder eksplisit menolak pola discovery-tanpa-akhir. Tujuannya murni memeriksa konsistensi Phase A→C.5 sebelum di-freeze sebagai baseline resmi Phase D. Tidak ada domain baru dicari di sini, tidak ada hasil Phase A-C.5 yang diubah — hanya diperiksa dan dikunci.

### 1. Apakah ada kontradiksi antar Phase A–C.5?

**Diperiksa:** Menelusuri ulang klaim-klaim kunci lintas dokumen (definisi CBS/WBS/Cost Code, posisi Formula vs AHSP, posisi Price Book vs Resource, status Company AHSP) untuk mencari pernyataan yang saling bertentangan.

**Hasil: Tidak ditemukan kontradiksi.** Setiap kali Phase C.5 menjawab pertanyaan ownership (mis. "Formula bukan milik AHSP", "Company AHSP bukan Aggregate terpisah"), jawabannya adalah **penegasan ulang** dari apa yang sudah tersirat di Phase B.5 (§ Relasi dengan AHSP di § A.4 Assembly, § Relasi dengan Komponen Lain di § A.6b Productivity), bukan koreksi terhadap klaim Phase B.5 sebelumnya. Satu-satunya pergeseran istilah adalah "Estimate" yang di Phase B.5 dipakai longgar sebagai satu kata, sementara Phase C.5 memecahnya jadi Scenario/Estimate Version/Estimate Item — ini bukan kontradiksi, karena Phase B.5 tidak pernah eksplisit mengklaim "Estimate adalah satu entity tunggal"; ia hanya belum memecahnya. Dicatat di § 2 di bawah sebagai promosi Candidate→Confirmed yang sebenarnya sudah terjadi implisit sejak draf awal C.5.

### 2. Apakah ada Candidate Domain yang sebenarnya sudah cukup bukti untuk menjadi Confirmed Domain?

Diperiksa satu per satu kelima Candidate Domain (§ B) terhadap standar bukti yang sama dipakai Confirmed Domain: apakah ada pernyataan verbatim/eksplisit dari founder di Phase A-C yang mendefinisikannya sebagai domain, bukan sekadar atribut atau konsep tersirat.

| Candidate | Naik jadi Confirmed? | Alasan |
|---|---|---|
| B.1 Regional Cost Index | **Tetap Candidate** | Tidak ada pernyataan eksplisit founder yang mendefinisikan ini sebagai domain — murni inferensi dari atribut `Location` di Price Book. Bukti belum cukup untuk Confirmed. |
| B.2 Knowledge Asset Index | **Tetap Candidate** | Sama — inferensi dari kesenjangan antara "reusable" (Foundational Principle Kedua) dan mekanisme pencarian yang belum pernah disebut eksplisit. |
| B.3 Contingency & Risk Register | **Tetap Candidate, tapi bukti lebih kuat dari B.1/B.2** | Phase B eksplisit menyebut Contingency sebagai satu dari 4 praktik yang harus dibangun ("sama urgennya" dengan RAP/Company AHSP/Lessons Learned) — ini lebih dari sekadar inferensi. Namun karena BENTUK domainnya (entity apa, aggregate root yang mana) belum pernah dianalisis eksplisit di Phase B/B.5 manapun, ia tetap Candidate — bukti kuat untuk *urgensi*, belum cukup untuk *bentuk domain*. Direkomendasikan jadi prioritas pertama yang diperjelas begitu Phase D mulai. |
| B.4 Reference Library | **Tetap Candidate, tapi status "kuat" dipertahankan** | Munculnya dari pola berulang 3× independen (§ B.4 asli) adalah bukti struktural yang kuat, tapi tetap merupakan **inferensi Phase C.5 sendiri**, bukan pernyataan eksplisit founder — standar pembeda Confirmed vs Candidate di dokumen ini secara konsisten adalah "eksplisit disebut founder" vs "muncul dari analisis". Mempertahankan status Candidate di sini justru konsisten menjaga standar itu, bukan meremehkan kekuatan buktinya. |
| B.5 CBS Revision History | **Ditutup sebagai keputusan tertunda, bukan Candidate Domain berdiri sendiri** | Setelah diperiksa ulang, ini bukan kandidat domain baru — ia adalah *keputusan pola versioning* untuk domain yang sudah Confirmed (CBS, § A.2). Diklasifikasi ulang di § 3 di bawah. |

**Kesimpulan pemeriksaan ini:** Tidak ada Candidate yang naik status ke Confirmed — standar bukti (pernyataan eksplisit founder) belum terpenuhi untuk satu pun. Ini hasil yang sehat: freeze tidak mengubah substansi, hanya mengonfirmasi klasifikasi yang sudah ada sudah tepat.

### 3. Apakah ada Confirmed Domain yang ternyata seharusnya hanya menjadi Supporting Capability?

**Diperiksa:** Untuk tiap 13 Confirmed Domain (§ A), ditanya apakah ia benar-benar punya Domain Responsibility sendiri yang berdiri (jawaban satu pertanyaan bisnis yang jelas), atau sebenarnya hanya "membantu" domain lain tanpa tanggung jawab sendiri.

**Hasil — satu temuan:** **CBS Revision History (bekas B.5)** diklasifikasi ulang di sini, BUKAN sebagai Candidate Domain berdiri sendiri, melainkan sebagai **Supporting Capability dari CBS (§ A.2)** — ia tidak menjawab pertanyaan bisnis sendiri ("bagaimana revisi dicatat" bukan pertanyaan yang berdiri, ia adalah bagian dari *bagaimana CBS mempertahankan Foundational Principle Ketiga*). Dicatat sebagai keputusan desain tertunda yang harus dijawab Phase D/F saat mendesain kapabilitas CBS, bukan domain terpisah.

Ketiga belas Confirmed Domain lain lolos pemeriksaan ini — masing-masing punya Domain Responsibility yang jelas berdiri sendiri (lihat baris "Domain Responsibility" di tabel § A masing-masing), tidak ada yang sekadar bayangan dari domain lain.

### 4. Apakah ada prinsip arsitektur yang saling bertentangan?

**Diperiksa:** Seluruh isi [`04-architecture-constitution.md`](04-architecture-constitution.md) (4 Foundational Principles, 10 Prinsip Final, 6 Architectural Constraints, 4 First Principles, 10 Architectural Invariants) diperiksa silang untuk kontradiksi.

**Hasil: Tidak ditemukan pertentangan.** Prinsip-prinsip ini secara konsisten saling memperkuat, bukan bersaing — mis. "Everything is Versioned" dan "Everything is Derived" awalnya terlihat berpotensi tumpang tindih, tapi [`02`](02-phase-b5-core-cost-engineering-architecture.md) § Foundational Principle Keempat sudah secara eksplisit membedakan fokusnya (Versioned = riwayat data; Derived = larangan input ulang) sebelum Phase C.5 dimulai — pemisahan ini sudah diperiksa dan dikonfirmasi konsisten saat diterapkan di seluruh analisis § A tanpa satu pun kasus yang membutuhkan keduanya "bersaing" untuk menjelaskan hal yang sama.

### 5. Apakah ada capability yang sudah diasumsikan di discovery tetapi belum memiliki domain pendukung?

**Diperiksa:** Menelusuri semua kapabilitas yang disebut sebagai "sudah pasti dibutuhkan" di Phase B.5/C (working name Engine #11 dan #12, AI Learning Loop, Configurable Approval Workflow) dan mengecek apakah domain yang mendasarinya sudah dianalisis di § A/B.

**Hasil — dua temuan, keduanya sudah tertangani, bukan gap baru:**
- **Working name Engine #11** ("Menutup Company Intelligence Loop dengan validasi manusia wajib", [`02`](02-phase-b5-core-cost-engineering-architecture.md) § Kapabilitas per Engine) — domain pendukungnya SUDAH dianalisis penuh sebagai § A.12 (Lessons Learned/Variance/Root Cause) + § A.11 (Approval Workflow). Tidak ada gap.
- **Working name Engine #12** ("Mengelola banyak Estimate Version paralel") — domain pendukungnya SUDAH dianalisis penuh sebagai § A.9c (Scenario). Tidak ada gap.

**Satu gap nyata ditemukan:** AI Learning Loop ([`02`](02-phase-b5-core-cost-engineering-architecture.md) § 11) diasumsikan sebagai "konsumen akhir" yang otomatis mendapat data terstruktur, TAPI domain yang secara eksplisit menjawab "bagaimana AI *mencari/mengambil* data yang relevan" belum ada — ini persis Candidate Domain B.2 (Knowledge Asset Index) yang sudah ditemukan di § B. Tidak ada gap baru yang belum tercatat; pemeriksaan ini justru mengonfirmasi bahwa B.2 bukan kandidat spekulatif, melainkan kebutuhan nyata yang sudah diantisipasi Phase B.5 tanpa disadari sampai C.5 menemukannya eksplisit.

### Ringkasan Hasil Validasi

| Pemeriksaan | Hasil |
|---|---|
| Kontradiksi antar Phase A-C.5 | ✅ Tidak ditemukan |
| Candidate → Confirmed promotion | Tidak ada yang naik status (bukti belum cukup untuk semua) |
| Confirmed → Supporting Capability demotion | 1 ditemukan: CBS Revision History (bekas Candidate B.5) → Supporting Capability dari CBS |
| Pertentangan prinsip arsitektur | ✅ Tidak ditemukan |
| Capability tanpa domain pendukung | ✅ Tidak ada gap baru — 2 working name Engine terkonfirmasi punya domain (§A.12, §A.11, §A.9c), 1 gap (AI Learning Loop retrieval) sudah tercatat sebagai Candidate B.2 |

**Perubahan konkret akibat validasi ini:** Candidate Domain B.5 (CBS Revision History) direklasifikasi dari "Candidate Domain" menjadi "Supporting Capability tertunda milik CBS" — bukan penghapusan, hanya pelabelan ulang yang lebih akurat. Empat Candidate Domain lain (B.1, B.2, B.3, B.4) dan empat Rejected Domain (§ C) tetap pada statusnya masing-masing tanpa perubahan.

---

## 🔒 FREEZE — Baseline Resmi untuk Phase D

Per hasil Discovery Validation di atas, seluruh isi Phase A ([`00`](00-phase-a-repository-discovery.md)), Phase B ([`01`](01-phase-b-cost-engineering-discovery.md)), Phase B.5 ([`02`](02-phase-b5-core-cost-engineering-architecture.md)), Phase C v3 ([`03`](03-phase-c-problem-discovery.md)), Architecture Constitution ([`04`](04-architecture-constitution.md)), dan Phase C.5 (dokumen ini, dengan satu koreksi klasifikasi di atas) dinyatakan **FREEZE sebagai baseline resmi**.

**Artinya bagi Phase D dan seterusnya:**
- Phase D **tidak mencari domain baru** — ia menyusun 13 Confirmed Domain + 4 Candidate Domain (kini "tertunda dengan bukti bertingkat", lihat § 2) + 1 Supporting Capability tertunda (CBS Revision History) menjadi Capability Map/Layer/Engine/Service.
- Phase D **tidak mempertanyakan ulang** prinsip di [`04-architecture-constitution.md`](04-architecture-constitution.md) — prinsip itu adalah premis, bukan lagi bahan diskusi.
- Kalau Phase D menemukan kebutuhan yang benar-benar tidak tercakup baseline ini, itu ditangani sebagai **temuan terisolasi** (dicatat, dikonfirmasi founder secara eksplisit) — bukan alasan membuka kembali Discovery secara luas.
- Phase D dimulai dari domain, prinsip, dan capability yang sudah dikunci — bukan dari daftar fitur.

---

## 🚦 APPROVAL GATE — DITUTUP, SIAP LANJUT

Phase C.5 (Core Domain Discovery) beserta Discovery Validation & Freeze selesai. Founder telah mengonfirmasi kesiapan lanjut ke Phase D.

*Dokumen selanjutnya: Phase D — Capability Architecture.*
