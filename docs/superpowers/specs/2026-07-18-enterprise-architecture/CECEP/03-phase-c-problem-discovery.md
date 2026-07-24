# CECEP — Phase C: Problem Discovery (First Principles Analysis) — v3

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Fase ketiga dalam urutan Discovery. v3 MENGGANTIKAN v2 — v2 sudah menetapkan 4 First Principle Violation, v3 menambahkan uji kedalaman (Universality Test + Counterfactual Test) terhadap keempatnya, plus penutup "Architectural Invariants". Founder eksplisit: ini adalah penambahan TERAKHIR sebelum Phase C ditutup — tidak ada lagi ekspansi horizontal maupun vertikal setelah v3.
**Status dokumen ini:** Planning only — **masih murni Problem Discovery**, bukan mendesain solusi dan bukan fase baru. Kedalaman analisis diperluas sampai *first principles*, tapi cakupannya tetap: mengapa masalah ini terjadi, bukan bagaimana menyelesaikannya.
**Standar kualitas yang mengikat:** Setiap masalah ditelusuri lewat *five-whys* sampai *First Principle Violation* — bukan berhenti di "root cause" permukaan. Setiap First Principle lalu diuji lagi lewat Universality Test dan Counterfactual Test agar bukan sekadar observasi kontekstual yang kebetulan benar hari ini. Target: begitu Phase D dimulai, kapabilitas yang dibutuhkan terasa sebagai **konsekuensi logis** yang sudah dibuktikan di sini, bukan "kayaknya kita perlu Engine ini".
**Rujukan konstitusi:** Seluruh prinsip lintas fase (Foundational Principles, Architectural Constraints, First Principles, Architectural Invariants) sekarang dikonsolidasikan di [`04-architecture-constitution.md`](04-architecture-constitution.md) sebagai single source of truth untuk Phase D dan seterusnya.

---

## Kerangka Analisis (6 Lapis)

Setiap dari sembilan pertanyaan di § 1-9 ditelusuri lewat enam lapis:

```
Observed Problem → Symptom → Immediate Cause → Root Cause →
First Principle Violation → Architectural Implication
```

**Contoh cara membaca (dari founder, dipertahankan sebagai referensi):**
```
RAP copy dari RAB
  → Tidak ada waktu (Immediate Cause)
    → Tidak ada productivity database (Root Cause)
      → Knowledge tidak pernah dikumpulkan (kenapa Root Cause itu muncul)
        → Knowledge bukan first-class citizen (First Principle Violation)
          → System harus mempunyai Company Knowledge Engine (Architectural Implication)
```

Kerangka perbandingan 4 lapis dari v1 (Traditional → Digital → Best Practice Global → CECEP Vision) **dipertahankan** sebagai pelengkap setelah analisis 6-lapis di setiap pertanyaan — bukan diganti, tapi disusul.

---

## 1. Mengapa Estimasi Selalu Meleset?

**Observed Problem:** RAB tender berbeda jauh dari biaya aktual pelaksanaan.

| Lapis | Analisis |
|---|---|
| **Symptom** | Margin yang direncanakan menipis atau hilang saat proyek selesai |
| **Immediate Cause** | Harga/asumsi yang dipakai saat estimasi berbeda dari kondisi riil eksekusi |
| **Root Cause** | Estimasi dibangun di atas satu titik data tunggal per item (satu harga, satu koefisien, satu asumsi produktivitas), tanpa rentang ketidakpastian |
| **Kenapa Root Cause itu muncul?** | Tidak ada mekanisme yang memaksa pertanyaan "seberapa yakin kita dengan angka ini?" — sistem hanya menerima angka, tidak pernah meminta tingkat keyakinan atasnya |
| **First Principle Violation** | **Ketidakpastian tidak pernah dimodelkan sebagai data.** Sistem memperlakukan setiap angka seolah pasti benar, padahal secara alami estimasi adalah probabilistik |
| **Architectural Implication** | Sistem harus punya *Confidence/Uncertainty sebagai atribut wajib* di setiap knowledge object (Price Book, Productivity, Formula result) — bukan fitur tambahan, tapi bagian dari definisi data itu sendiri |

### Perbandingan 4 Lapis

| Lapis | Kondisi | Kenapa Tetap Gagal |
|---|---|---|
| Traditional | Estimator menghitung manual, satu angka per item, tanpa rentang ketidakpastian | Tidak ada mekanisme mempertanyakan keyakinan atas angka |
| Digital | RAB dipindah ke sistem, kalkulasi otomatis, **struktur data sama** — satu `unit_price` per item | Mengotomasi *cara menghitung*, bukan mengubah *apa yang dihitung* |
| Best Practice Global | AACE Cost Estimate Classification — contingency berbasis level akurasi (Class 5: -50%/+100%) | Butuh tooling native yang mendukung — jarang tersedia di software konstruksi Indonesia |
| CECEP Vision | Confidence Level sebagai atribut wajib Price Book (Phase B.5 § 4), Risk/Contingency sebagai komponen RBS eksplisit | Ketidakpastian dicatat sebagai data, bukan diasumsikan nol |

---

## 2. Mengapa Estimator Berbeda Menghasilkan Angka Berbeda?

**Observed Problem:** Dua estimator, RAB sama, hasil beda 15-20% untuk pekerjaan identik.

| Lapis | Analisis |
|---|---|
| **Symptom** | Variasi angka besar antar estimator untuk pekerjaan yang sama |
| **Immediate Cause** | Setiap estimator memakai sumber harga/koefisien yang berbeda |
| **Root Cause** | Tidak ada Company AHSP/Price Book bersama (Phase B: nol total di Puraloka Persada) yang dipaksakan sebagai rujukan |
| **Kenapa Root Cause itu muncul?** | Karena Calculation Strategy — cara menghitung, bukan hanya angkanya — **berada di kepala manusia**, bukan menjadi bagian dari sistem |
| **First Principle Violation** | **Calculation Strategy diperlakukan sebagai pengetahuan individu, bukan sebagai aset sistem yang bisa dipanggil ulang.** Sistem tidak punya konsep "strategi kalkulasi" sebagai entitas — ia hanya punya "kolom input" |
| **Architectural Implication** | Sistem harus punya *Calculation Strategy sebagai objek pertama-kelas* (bukan logic tersembunyi di kepala orang) — dipilih, bukan diasumsikan; disimpan, bukan dihafal |

### Perbandingan 4 Lapis

| Lapis | Kondisi | Kenapa Tetap Gagal |
|---|---|---|
| Traditional | Setiap estimator punya "buku catatan" pribadi | Nol standardisasi lintas orang |
| Digital | Field untuk isi harga tersedia, tapi tanpa sumber yang direkomendasikan sistem | Memindahkan buku catatan pribadi ke layar, variasi tetap ada |
| Best Practice Global | Cost database terpusat (mis. RSMeans) sebagai baseline lintas perusahaan | Baseline eksternal tetap butuh penyesuaian konteks lokal perusahaan |
| CECEP Vision | Company AHSP sebagai satu sumber wajib, tumbuh dari bootstrap (Phase B.5 § 0) | Efektivitas bergantung disiplin organisasi mengisi & memvalidasi secara konsisten |

---

## 3. Mengapa Knowledge Perusahaan Hilang Saat Pegawai Resign?

**Observed Problem:** Estimator senior keluar, kemampuan perusahaan mengestimasi akurat ikut menurun.

| Lapis | Analisis |
|---|---|
| **Symptom** | Akurasi estimasi menurun signifikan setelah turnover staf kunci |
| **Immediate Cause** | Pengalaman (harga supplier terpercaya, produktivitas riil lapangan) tidak pernah tertulis di sistem |
| **Root Cause** | Tidak ada mekanisme kodifikasi — pengalaman tidak pernah "keluar" dari kepala jadi artefak yang bisa diwariskan (diperkuat: Lessons Learned nol total, bahkan informal, Phase B § 12) |
| **Kenapa Root Cause itu muncul?** | Perusahaan konstruksi beroperasi sebagai kumpulan proyek independen — setiap proyek "lahir, hidup, mati" tanpa jejak formal yang mengalir ke proyek berikutnya |
| **First Principle Violation** | **Knowledge tidak pernah dimodelkan sebagai aset perusahaan** — ia diperlakukan sebagai properti individu yang kebetulan bekerja di perusahaan itu, bukan sebagai milik organisasi |
| **Architectural Implication** | Sistem harus punya *Company Knowledge sebagai entitas yang secara eksplisit dipisahkan dari individu* — knowledge object (AHSP, Productivity, Lessons Learned) harus survive terlepas siapa yang menciptakannya, dengan jejak siapa/kapan/kenapa tetap tercatat (audit trail) tapi kepemilikannya adalah perusahaan |

### Perbandingan 4 Lapis

| Lapis | Kondisi | Kenapa Tetap Gagal |
|---|---|---|
| Traditional | Pengetahuan = orang. Turnover = kehilangan kapabilitas permanen | Tidak ada niat sistemik memisahkan pengetahuan dari individu |
| Digital | RAB tersimpan, tapi hanya angka final — tanpa jejak *mengapa* | Menyimpan hasil ≠ menyimpan pemahaman |
| Best Practice Global | Post-project review formal (PMBOK lessons learned register) | Sering jadi formalitas administratif, tidak terhubung balik ke sistem produksi |
| CECEP Vision | Company Intelligence Loop — otomatis memperbarui Company AHSP/Price Book/Productivity | Loop wajib (gate closeout) dan otomatis, bukan laporan statis yang dilupakan |

---

## 4. Mengapa Company AHSP Hampir Tidak Pernah Berkembang?

**Observed Problem:** Perusahaan konstruksi puluhan tahun tetap tidak punya database AHSP internal matang.

| Lapis | Analisis |
|---|---|
| **Symptom** | Company AHSP (kalau ada) statis, tidak pernah direvisi berdasarkan hasil aktual |
| **Immediate Cause** | Membuat/memperbarui AHSP butuh usaha aktif yang selalu kalah prioritas dari tekanan proyek berjalan |
| **Root Cause** | AHSP diperlakukan sebagai input statis (diisi sekali, dipakai berulang) — bukan sebagai objek yang tumbuh dari hasil eksekusi |
| **Kenapa Root Cause itu muncul?** | Tidak ada mekanisme yang menghubungkan hasil eksekusi proyek **kembali** ke AHSP yang dipakai mengestimasinya — loop-nya secara struktural tidak ada, bukan sekadar tidak dipakai |
| **First Principle Violation** | **Sistem dibangun berorientasi transaksi (input sekali, pakai berkali), bukan berorientasi pembelajaran (setiap pemakaian adalah kesempatan memperbarui sumbernya).** Ini pelanggaran paling mendasar — arsitektur data yang statis di intinya tidak akan pernah menghasilkan perilaku dinamis, berapa pun fitur "update" ditambahkan di atasnya |
| **Architectural Implication** | Sistem harus punya *feedback loop sebagai bagian dari arsitektur inti*, bukan fitur terpisah — setiap hasil proyek yang selesai harus **otomatis diarahkan** untuk mempertanyakan AHSP yang dipakainya, bukan menunggu seseorang berinisiatif membuka dan mengedit tabel AHSP |

### Perbandingan 4 Lapis

| Lapis | Kondisi | Kenapa Tetap Gagal |
|---|---|---|
| Traditional | AHSP (kalau ada) dokumen statis, dibuat sekali, jarang dibuka lagi | Update adalah "proyek sampingan" yang tidak pernah cukup prioritas |
| Digital | Software menyediakan tabel AHSP yang bisa diisi, tapi update tetap manual, terpisah dari alur eksekusi | Tempat untuk data ≠ alasan untuk mengisinya |
| Best Practice Global | Cost engineering department khusus (kontraktor EPC internasional) | Butuh investasi SDM khusus, tidak realistis untuk kontraktor menengah |
| CECEP Vision | Bootstrap Company AHSP, update via AI Learning Loop dipicu otomatis setiap proyek selesai | Pembaruan jadi hasil alami menyelesaikan proyek, bukan tugas tambahan |

---

## 5. Mengapa RAP Sering Hanya Copy dari RAB?

**Observed Problem:** RAP (kalau dibuat) sekadar `RAB × (1 - margin%)`.

*(Contoh five-whys ini diberikan langsung oleh founder — dipertahankan verbatim sebagai referensi metodologis.)*

| Lapis | Analisis |
|---|---|
| **Symptom** | RAP tidak pernah dihitung ulang dari resource dasar |
| **Immediate Cause** | Tidak ada waktu untuk menghitung RAP secara independen |
| **Root Cause** | Tidak ada productivity database — estimator tidak punya bahan baku untuk menyusun RAP dari nol |
| **Kenapa Root Cause itu muncul?** | Knowledge (produktivitas riil, harga aktual, metode pelaksanaan) tidak pernah dikumpulkan secara sistematis dari proyek-proyek sebelumnya |
| **First Principle Violation** | **Knowledge bukan first-class citizen di dalam sistem** — ia adalah data sisa yang kebetulan bisa dicatat, bukan objek yang sengaja dikumpulkan sebagai tujuan utama arsitektur |
| **Architectural Implication** | Sistem harus mempunyai **Company Knowledge Engine** — bukan tabel "history" pasif, tapi mekanisme aktif yang mengumpulkan, memvalidasi, dan menyediakan kembali produktivitas/harga/metode sebagai bahan baku estimasi berikutnya |

### Perbandingan 4 Lapis

| Lapis | Kondisi | Kenapa Tetap Gagal |
|---|---|---|
| Traditional | RAP = RAB dipotong margin standar (kalau dihitung sama sekali) | Tidak ada waktu/alat menghitung ulang dari resource dasar |
| Digital | Kolom "RAP" terpisah dari "RAB", tapi UI mendorong workflow "salin dulu, edit nanti" | Struktur data menempatkan RAP sebagai *child* RAB, memperkuat pola copy-paste secara arsitektural |
| Best Practice Global | Bottom-up estimating untuk RAP vs top-down untuk tender — dua alur berbeda | Butuh dua alur kerja terpisah yang didukung tooling, jarang tersedia di software menengah |
| CECEP Vision | RAB dan RAP sama-sama keluaran Estimate Engine dengan Calculation Strategy berbeda (Phase B.5 § 12) | Satu-satunya lapis yang menyediakan *bahan baku* (RBS/Price Book/Productivity) untuk RAP independen, bukan hanya "mengizinkan"-nya |

---

## 6. Mengapa Budget Control Terlambat Mengetahui Pembengkakan Biaya?

**Observed Problem:** Cost overrun baru terdeteksi saat sudah signifikan.

| Lapis | Analisis |
|---|---|
| **Symptom** | CPI/SPI (EVM) menunjukkan penyimpangan hanya setelah margin sudah tergerus banyak |
| **Immediate Cause** | Baseline yang dipakai EVM adalah RAB (mengandung margin), bukan RAP (target biaya murni) |
| **Root Cause** | RAP belum ada sebagai entitas independen (§ 5) — sehingga "bantalan margin" secara tidak sengaja menyembunyikan pembengkakan kecil |
| **Kenapa Root Cause itu muncul?** | Karena Cost Code (identitas universal yang menyambungkan Actual Cost ke item RAB/RAP secara otomatis) belum ada — rekonsiliasi biaya masih manual/periodik |
| **First Principle Violation** | **Sistem tidak punya identitas bersama yang menyambungkan rencana dan aktual secara real-time** — Estimate, Procurement, dan Actual Cost hidup sebagai pulau data terpisah yang direkonsiliasi manusia, bukan disambungkan otomatis oleh sistem |
| **Architectural Implication** | Sistem harus punya **Cost Code sebagai universal identifier** (sudah dikunci Phase B.5 § 6) yang membuat setiap transaksi otomatis "menemukan kembali" rencana yang sesuai — deteksi deviasi jadi konsekuensi struktural, bukan hasil kerja rekonsiliasi manual |

### Perbandingan 4 Lapis

| Lapis | Kondisi | Kenapa Tetap Gagal |
|---|---|---|
| Traditional | Rekonsiliasi manual bulanan dari nota/kuitansi | Latensi besar by design |
| Digital | EVM real-time (Puraloka Suite matang), tapi baseline-nya RAB, bukan RAP | Alarm dini tidak berbunyi sampai margin habis |
| Best Practice Global | CPI dihitung terhadap Control Budget (setara RAP), bukan Contract Value | Butuh RAP independen — tanpa itu, praktik terbaik tidak bisa direplikasi meski tools tersedia |
| CECEP Vision | EVM terhadap Cost Baseline dari RAP, Cost Code menyambungkan Actual Cost otomatis | Membutuhkan RAP dan Cost Code benar-benar terwujud — dua prasyarat yang sudah dikunci sejak Phase B.5 |

---

## 7. Mengapa Procurement Sering Tidak Sinkron dengan Estimate?

**Observed Problem:** Material yang dibeli beda spesifikasi/qty dari yang direncanakan di RAB.

| Lapis | Analisis |
|---|---|
| **Symptom** | Procurement berjalan sebagai proses terpisah dari estimasi |
| **Immediate Cause** | Material Requirement dibuat manual, independen dari struktur RAB |
| **Root Cause** | Tidak ada mekanisme yang menurunkan kebutuhan material otomatis dari Assembly/RBS yang sama dipakai menyusun RAB |
| **Kenapa Root Cause itu muncul?** | Sistem dibangun **per modul** (modul RAB, modul Procurement, terpisah), bukan **per domain** (satu domain "kebutuhan resource" yang dikonsumsi banyak proses) |
| **First Principle Violation** | **Sistem dibangun berdasarkan batas UI/fitur, bukan batas domain data.** RAB dan Procurement "terlihat" sebagai dua modul di layar, padahal secara domain mereka berbagi objek yang sama: kebutuhan resource |
| **Architectural Implication** | Sistem harus dirancang **per domain, bukan per modul** — Resource Requirement adalah satu domain yang *dikonsumsi* oleh Estimate, Procurement, Inventory, sekaligus (Everything is Derived, Phase B.5), bukan tiga modul yang masing-masing punya salinan datanya sendiri |

### Perbandingan 4 Lapis

| Lapis | Kondisi | Kenapa Tetap Gagal |
|---|---|---|
| Traditional | Procurement baca RAB cetak, hitung ulang kebutuhan manual | Interpretasi manual rawan salah baca |
| Digital | MR via form terpisah, tidak terhubung struktural ke `rab_items` | Mempercepat *input*, tidak menghilangkan *interpretasi ulang* |
| Best Practice Global | BIM-based quantity takeoff otomatis dari model 3D | Butuh maturity BIM tinggi — horizon jangka panjang |
| CECEP Vision | Material Requirement diturunkan otomatis dari Assembly/RBS yang sama | Tidak butuh BIM penuh — cukup Assembly Engine dan RBS matang |

---

## 8. Mengapa Lessons Learned Tidak Pernah Kembali Menjadi Knowledge?

**Observed Problem:** Evaluasi pasca-proyek (kalaupun ada) tidak pernah mempengaruhi estimasi berikutnya.

| Lapis | Analisis |
|---|---|
| **Symptom** | Laporan lessons learned tersimpan sebagai dokumen naratif yang jarang dibuka ulang |
| **Immediate Cause** | Estimator berikutnya tidak membaca arsip lama saat bekerja di bawah tekanan tenggat |
| **Root Cause** | Lessons Learned dan Company AHSP/Price Book hidup sebagai dua sistem terpisah — satu naratif, satu terstruktur |
| **Kenapa Root Cause itu muncul?** | Karena "evaluasi proyek" dianggap aktivitas administratif/kepatuhan, bukan bagian dari alur produksi pengetahuan yang dipakai sistem |
| **First Principle Violation** | **Pembelajaran diperlakukan sebagai output (laporan yang dihasilkan), bukan sebagai input (data yang mengubah sistem).** Selama lessons learned adalah "sesuatu yang dibuat", bukan "sesuatu yang mengubah", ia tidak akan pernah benar-benar dipakai |
| **Architectural Implication** | Sistem harus memperlakukan Lessons Learned sebagai **mutation event** terhadap knowledge asset (Company AHSP/Price Book/Productivity berubah versi sebagai konsekuensi langsung), bukan sebagai dokumen yang diarsipkan terpisah — ini sudah tertangkap di Company Intelligence Loop, tapi perlu ditegaskan: loop ini harus jadi *satu-satunya* cara knowledge asset diperbarui, bukan salah satu cara di antara banyak |

### Perbandingan 4 Lapis

| Lapis | Kondisi | Kenapa Tetap Gagal |
|---|---|---|
| Traditional | Evaluasi = obrolan informal, tidak terdokumentasi | Pengetahuan tacit hilang begitu rapat selesai |
| Digital | Fitur "catatan proyek" tersedia, tapi berdiri sendiri dari AHSP/Price Book | Menyimpan sebagai teks ≠ mengubahnya jadi data yang mempengaruhi kalkulasi |
| Best Practice Global | Post-Implementation Review terstruktur (checklist kuantitatif) | Struktur lebih baik, tapi masalah integrasi ke sistem produksi tetap ada |
| CECEP Vision | Company Intelligence Loop — otomatis update knowledge asset, gate closeout wajib | Lessons learned *secara struktural adalah* proses update, bukan aktivitas terpisah |

---

## 9. Mengapa Software Konstruksi Saat Ini Tetap Membuat Orang Bergantung pada Excel?

**Observed Problem:** Meski sudah ada ERP/software konstruksi, tim tetap kembali ke Excel.

| Lapis | Analisis |
|---|---|
| **Symptom** | Estimasi awal/RAP/analisis disusun di Excel, baru dipindah ke sistem belakangan (atau tidak pernah) |
| **Immediate Cause** | Struktur software tidak cocok dengan kebutuhan nyata yang bervariasi (mis. proyek sipil vs gedung, Phase B § 0) |
| **Root Cause** | Software didesain dengan struktur kaku (field tetap, kategori RAB yang sudah ditentukan developer) |
| **Kenapa Root Cause itu muncul?** | Fleksibilitas dan struktur diperlakukan sebagai *trade-off* — developer berasumsi semakin terstruktur, harus semakin kaku, karena fleksibilitas dianggap butuh kode baru untuk setiap variasi |
| **First Principle Violation** | **Perilaku sistem (formula, struktur, kategori) ditanam sebagai kode, bukan sebagai data yang bisa dikonfigurasi pengguna.** Ini pelanggaran terhadap prinsip yang sudah dikunci di Phase B.5 (Formula Engine, Greenfield Adoption) — tapi di sinilah *alasan* prinsip itu penting terbukti: setiap kali perilaku "dihardcode", pengguna kembali ke satu-satunya tool yang tidak pernah menghardcode apa pun — Excel |
| **Architectural Implication** | Sistem harus memisahkan **struktur/definisi** (data yang bisa dikonfigurasi: CBS custom, Formula, Calculation Strategy) dari **mesin yang mengeksekusinya** (Engine yang generik, tidak berubah meski konfigurasinya berubah) — ini persis alasan Engine-Based Thinking (Phase B.5, Constraint #6) dikunci, dan sekarang terbukti dari analisis akar masalah, bukan diasumsikan sebagai praktik baik semata |

### Perbandingan 4 Lapis

| Lapis | Kondisi | Kenapa Tetap Gagal |
|---|---|---|
| Traditional | Excel murni — fleksibel total, nol standardisasi/integrasi/audit trail | Fleksibilitas mengorbankan semua manfaat sistem terstruktur |
| Digital | Struktur database tetap, fleksibilitas terbatas ke antisipasi developer | Begitu kebutuhan melebihi antisipasi, pengguna balik ke Excel |
| Best Practice Global | Configuration layer luas (SAP/Oracle) | Fleksibel tapi kompleks, butuh konsultan implementasi |
| CECEP Vision | Formula Engine + Greenfield Adoption — fleksibilitas via data yang dikonfigurasi user | Satu-satunya lapis yang menargetkan fleksibilitas setara Excel tanpa mengorbankan struktur |

---

## Bab Baru 1 — Mengapa ERP Konstruksi yang Sudah Ada Tetap Gagal (Pola, Bukan Daftar Fitur)

**Prinsip analisis:** Bukan "software A tidak punya fitur X" — setiap kategori software punya **satu titik kuat yang konsisten** dan **satu titik lemah yang konsisten**, dan pola kelemahan itu berulang di seluruh industri, bukan kebetulan satu produk tertentu kurang lengkap.

| Kategori Software | Kuat Di | Lemah Di | Kenapa Pola Ini Berulang |
|---|---|---|---|
| **ERP** (SAP, Oracle, dan sejenisnya, termasuk Puraloka Suite existing) | **Transaksi** — mencatat apa yang terjadi (invoice, PO, payment) secara akurat dan auditable | **Engineering** — tidak tahu *bagaimana* seharusnya biaya dihitung, hanya mencatat hasilnya | ERP lahir dari akuntansi/transaksi bisnis generik, bukan dari disiplin cost engineering — DNA arsitekturnya adalah "catat yang terjadi", bukan "hitung yang seharusnya terjadi" |
| **Estimation Software** (dedicated, mis. software AHSP/RAB berdiri sendiri) | **Estimasi** — kalkulasi cepat dan terstruktur untuk menghasilkan RAB | **Operasional** — begitu proyek berjalan, software ini terputus dari eksekusi nyata (procurement, progress, aktual kas) | Dirancang untuk *menghasilkan dokumen* (RAB sebagai output final), bukan untuk *menjadi bagian dari* siklus hidup proyek yang berkelanjutan |
| **BIM** | **Desain** — representasi geometris/spasial proyek yang presisi | **Cost Intelligence** — quantity takeoff bisa otomatis, tapi *harga* dan *strategi kalkulasi biaya* tetap butuh sistem lain | BIM lahir dari disiplin desain/engineering fisik, bukan dari disiplin cost engineering — sangat kuat menjawab "berapa banyak", lemah menjawab "berapa harga dan kenapa" |
| **Spreadsheet (Excel)** | **Fleksibilitas** — bisa dibentuk sesuai kebutuhan apa pun tanpa menunggu developer | **Company Knowledge** — pengetahuan tidak pernah jadi aset perusahaan, ia terkunci di file yang dimiliki satu orang, mudah hilang/rusak/tidak konsisten antar file | Excel dirancang sebagai alat kerja individual, bukan sebagai sistem organisasi — kekuatannya (bebas dari struktur) secara struktural bertentangan dengan kebutuhan berbagi pengetahuan lintas orang |
| **AI (generatif, generik)** | **Kecepatan menghasilkan estimasi** dari input minim | **Explainability** — tidak bisa menjelaskan alasan di balik angka yang dihasilkan | AI generatif dilatih untuk *memprediksi output yang masuk akal*, bukan untuk *menjejaki alasan* — kekuatan statistiknya justru sumber kelemahan penjelasannya |

### Kesimpulan Pola

Kelima kategori ini **tidak bersaing di dimensi yang sama** — masing-masing kuat di satu sumbu (transaksi, estimasi, desain, fleksibilitas, kecepatan) dan lemah di sumbu lain (engineering, operasional, cost intelligence, knowledge, explainability). Tidak ada satu pun yang gagal karena "kurang usaha" atau "kurang fitur" — mereka gagal karena **arsitekturnya optimal untuk satu tujuan, yang secara struktural mengorbankan tujuan lain**.

**CECEP tidak bersaing di salah satu sumbu ini — CECEP dirancang di persimpangan kelimanya:** transaksi (terhubung modul existing Puraloka Suite), engineering (Calculation Strategy eksplisit), operasional (Estimate Engine sebagai sumber semua output hilir), cost intelligence (Cost Code + Pricing Engine), fleksibilitas (Formula Engine, Greenfield Adoption), knowledge sebagai aset (Company Intelligence Loop), dan explainability (Foundational Principle Kedua & Ketiga). Ini bukan klaim "lebih lengkap" — ini klaim struktural: CECEP adalah satu-satunya kategori yang secara sengaja menolak trade-off yang dianggap tak terelakkan oleh kelima kategori lain.

---

## Bab Baru 2 — Burning Platform: Jika CECEP Tidak Pernah Dibuat, Apa yang Terjadi dalam 10 Tahun?

**Prinsip analisis:** Biaya *tidak* membangun CECEP jarang dihitung eksplisit — organisasi cenderung menganggap "kondisi sekarang" sebagai netral (tidak untung tidak rugi), padahal bertahan di pola yang sudah terbukti gagal (§ 1-9) punya biaya nyata yang bertambah dari waktu ke waktu.

### Proyeksi Tanpa CECEP (Ekstrapolasi Linear dari 9 Root Cause yang Sudah Dibuktikan)

| Tahun | Apa yang Terjadi | Akar Masalah yang Terus Aktif |
|---|---|---|
| **Tahun 1-2** | Bisnis berjalan seperti biasa — estimasi tetap bervariasi antar estimator, RAP tetap copy RAB, tidak terasa krisis | Fragmentasi Pengetahuan, Duplikasi Data (belum terlihat dampaknya) |
| **Tahun 3-5** | Estimator senior yang sudah bekerja lama mulai pensiun/pindah — setiap kepergian membawa pengetahuan yang tidak pernah dikodifikasi. Company AHSP tetap tidak pernah lahir karena tidak ada mekanisme yang memaksanya terbentuk | Knowledge Bukan First-Class Citizen mulai terasa dampaknya secara langsung |
| **Tahun 5-7** | Kompetitor yang sudah mengadopsi cost engineering terstruktur (atau platform sejenis CECEP) mulai unggul di akurasi tender — bisa menawar lebih presisi (margin lebih tipis tapi aman) karena mereka tahu batas bawah biaya riil, sementara Puraloka Persada masih menawar dengan asumsi kasar | Sistem Dibangun Per Modul (Bukan Per Domain) — kompetitor yang domain-nya tersambung bisa bergerak lebih cepat dan lebih murah secara operasional |
| **Tahun 7-10** | AI di industri konstruksi semakin matang di kompetitor lain — tapi AI butuh data historis terstruktur untuk dilatih. Perusahaan yang tidak pernah mengumpulkan Company Knowledge **tidak punya dataset** untuk melatih AI apa pun — mereka tertinggal bukan karena tidak mau adopsi AI, tapi karena tidak punya bahan bakar untuk itu | Pembelajaran Diperlakukan sebagai Output Bukan Input — 10 tahun proyek berjalan tanpa menghasilkan aset data yang bisa dipakai |
| **Kondisi Akhir (Tahun 10)** | Margin perusahaan **stagnan** — bukan menurun drastis (yang akan memicu tindakan darurat), tapi stagnan (yang jauh lebih berbahaya karena tidak pernah terasa cukup mendesak untuk ditindaklanjuti). RAP tetap copy RAB. Procurement tetap reaktif. Cost control tetap terlambat mendeteksi masalah. Setiap proyek baru dimulai dari titik pengetahuan yang **sama** dengan 10 tahun lalu — bukan lebih baik | Semua 4 Akar Masalah tetap aktif penuh, tidak ada yang membaik secara struktural |

### Kenapa Ini "Burning Platform", Bukan Sekadar Risiko Biasa

Karakteristik burning platform yang berlaku di sini: **kerusakan tidak terlihat dalam satu momen dramatis, tapi terakumulasi diam-diam sampai titik di mana perbaikannya jauh lebih mahal daripada mencegahnya sejak awal.** Margin yang stagnan selama 10 tahun tidak pernah memicu "alarm darurat" seperti kebakaran atau kebangkrutan mendadak — justru karena itu, risikonya lebih besar: tidak ada momentum organisasi yang cukup kuat untuk memaksa perubahan sampai kompetitor yang sudah lebih dulu berubah benar-benar terasa mengungguli secara nyata di lapangan tender.

**Implikasi untuk urgensi CECEP:** Membangun CECEP bukan investasi untuk "menjadi lebih baik" semata — ia adalah **investasi untuk berhenti mewariskan masalah yang sama ke setiap proyek berikutnya**, sebelum akumulasi 10 tahun itu membuat gap dengan kompetitor yang sudah lebih dulu berubah menjadi tidak terjangkau untuk dikejar.

---

## Sintesis — Empat First Principle Violation yang Mendasari Seluruh Sembilan Masalah

Setelah menelusuri kesembilan pertanyaan sampai lapis *First Principle Violation*, pola yang muncul bukan sembilan pelanggaran berbeda — melainkan **empat pelanggaran prinsip yang sama**, muncul dalam wujud berbeda di permukaan:

### First Principle 1 — Knowledge Harus Menjadi First-Class Citizen
*(Dilanggar di § 2, § 3, § 4, § 5)* — Ketidakpastian, strategi kalkulasi, pengalaman, dan produktivitas semuanya diperlakukan sebagai residu proses, bukan sebagai objek yang sengaja dikumpulkan sistem sebagai tujuan utamanya.

### First Principle 2 — Sistem Harus Dibangun per Domain, Bukan per Modul
*(Dilanggar di § 6, § 7)* — Batas antar bagian sistem mengikuti batas UI/fitur (RAB "modul" terpisah dari Procurement "modul"), bukan batas domain data alami (Resource Requirement sebagai satu domain yang dikonsumsi banyak proses).

### First Principle 3 — Pembelajaran Harus Menjadi Input, Bukan Sekadar Output
*(Dilanggar di § 4, § 8)* — Evaluasi/lessons learned diperlakukan sebagai dokumen yang *dihasilkan* di akhir proses, bukan sebagai data yang *mengubah* sistem untuk proses berikutnya.

### First Principle 4 — Perilaku Sistem Harus Berupa Data yang Dikonfigurasi, Bukan Kode yang Ditanam
*(Dilanggar di § 1, § 9)* — Formula, struktur kategori, dan asumsi ketidakpastian tertanam sebagai logika tetap di kode, memaksa pengguna kembali ke Excel setiap kali kebutuhan nyata melebihi antisipasi developer.

**Catatan penting:** Keempat First Principle ini adalah **level lebih dalam** dari 4 Akar Masalah versi v1 (Fragmentasi Pengetahuan, Duplikasi Data, Keputusan Tidak Explainable, Tidak Ada Pembelajaran Organisasi) — bukan menggantikannya, tapi menjawab pertanyaan "kenapa keempat akar masalah itu bisa muncul". Relasinya:

| Akar Masalah (v1, level permukaan) | First Principle Violation (v2, level lebih dalam) |
|---|---|
| Fragmentasi Pengetahuan | Knowledge Bukan First-Class Citizen |
| Duplikasi Data | Sistem Dibangun per Modul, Bukan per Domain |
| Tidak Ada Pembelajaran Organisasi | Pembelajaran Diperlakukan sebagai Output, Bukan Input |
| Keputusan Tidak Explainable | *(Muncul dari kombinasi ketiga First Principle di atas — ketidakjelasan adalah gejala gabungan, bukan pelanggaran prinsip tersendiri; ditambah First Principle 4: perilaku sistem yang ditanam sebagai kode tidak pernah bisa dijelaskan penggunanya sendiri, karena logikanya tersembunyi dari mereka)* |

---

## Kenapa CECEP Memang Perlu Ada (Kesimpulan Final)

Software konstruksi yang sudah ada tidak gagal karena kurang fitur (Bab Baru 1) — mereka gagal karena masing-masing dioptimalkan untuk satu sumbu (transaksi/estimasi/desain/fleksibilitas/kecepatan) dengan mengorbankan sumbu lain secara struktural. Di balik kegagalan berulang ini ada **empat pelanggaran first principle yang sama** (Sintesis di atas) — bukan sembilan masalah acak, tapi satu pola arsitektural yang terus terulang.

Tanpa CECEP, pola ini tidak "stabil" — ia **memburuk secara diam-diam** selama satu dekade (Bab Baru 2) sampai gap dengan kompetitor yang sudah bertransformasi menjadi sulit dikejar.

CECEP, sebagaimana sudah dikunci di Phase B dan B.5, secara eksplisit dirancang untuk menegakkan keempat First Principle yang selama ini dilanggar — bukan menambah fitur di atas fondasi yang sama dengan software lain, melainkan mengganti fondasinya.

---

## Uji Kedalaman — Apakah Keempat First Principle Benar-Benar Fundamental?

**Standar yang diminta founder:** Kalau target adalah membangun sesuatu setara SAP, Oracle Primavera, Procore, Autodesk Construction Cloud, atau Candy CCS — atau melampauinya — First Principle tidak cukup "terdengar benar". Setiap prinsip harus lolos dua uji sebelum dianggap benar-benar fundamental, bukan sekadar observasi kontekstual yang kebetulan benar hari ini.

**Uji 1 — Universality Test:** *"Apakah prinsip ini masih benar 20 tahun lagi?"* — harus tetap benar meskipun ukuran perusahaan berubah, negara berubah, standar AHSP berubah, teknologi berubah, bahkan AI berkembang jauh melampaui kondisi hari ini. Kalau jawabannya tidak untuk satu dimensi saja, prinsip itu masih level *implementasi*, belum level *prinsip*.

**Uji 2 — Counterfactual Test:** Untuk setiap prinsip, tanyakan kebalikannya secara eksplisit — apa konsekuensi arsitekturnya jika pelanggaran itu **tidak terjadi**? Apa yang otomatis berubah? Apa yang otomatis menjadi tidak diperlukan?

### First Principle 1 — Knowledge Harus Menjadi First-Class Citizen

**Universality Test:**
| Dimensi yang Berubah | Masih Berlaku? | Kenapa |
|---|---|---|
| Ukuran perusahaan | ✅ Ya | Perusahaan kecil kehilangan pengetahuan sama cepatnya saat satu-satunya estimator resign; perusahaan besar kehilangan lebih lambat tapi tetap kehilangan tanpa mekanisme kodifikasi |
| Negara | ✅ Ya | Fenomena "senior expert membawa pengetahuan pergi saat pensiun" bersifat universal di seluruh industri konstruksi global, bukan spesifik Indonesia |
| Standar AHSP | ✅ Ya | Standar apa pun yang dipakai (Bina Marga, Cipta Karya, MasterFormat, atau standar masa depan yang belum ada) tetap butuh *tempat* pengetahuan disimpan sebagai aset — prinsip ini tentang *keberadaan tempat itu*, bukan isi standarnya |
| Teknologi | ✅ Ya | Baik dicatat di kertas, Excel, database relasional, atau graph database — masalahnya bukan teknologi penyimpanan, tapi *apakah pengetahuan pernah dipisahkan dari individu sama sekali* |
| AI berkembang jauh | ✅ Ya, justru makin krusial | AI sehebat apa pun butuh data untuk belajar — kalau pengetahuan tidak pernah jadi aset terstruktur, AI masa depan tetap tidak punya apa pun untuk dipelajari, terlepas seberapa canggih modelnya |

**Verdict:** Lolos Universality Test — ini genuinely first principle, bukan observasi kontekstual.

**Counterfactual Test:** *Bagaimana jika knowledge memang diperlakukan sebagai first-class citizen?*
- **Konsekuensi arsitektur:** Setiap knowledge object (harga, produktivitas, formula, keputusan) punya identitas, versi, dan pemilik (perusahaan, bukan individu) sejak didesain — bukan ditambahkan belakangan sebagai fitur "riwayat".
- **Apa yang otomatis berubah:** Setiap transaksi (estimasi, eksekusi, evaluasi) menjadi *peristiwa yang menghasilkan pengetahuan*, bukan sekadar transaksi yang tercatat lalu dilupakan sistem setelah selesai.
- **Apa yang otomatis menjadi tidak diperlukan:** Proses "wawancara exit" untuk menangkap pengetahuan karyawan yang keluar, program "mentoring paksa" untuk transfer pengalaman manual, dan seluruh kategori risiko "single point of knowledge failure" yang biasanya diatasi dengan solusi organisasi (bukan sistem) — karena pengetahuannya sudah ada di sistem, bukan di kepala orang tertentu.

### First Principle 2 — Sistem Harus Dibangun per Domain, Bukan per Modul

**Universality Test:**
| Dimensi yang Berubah | Masih Berlaku? | Kenapa |
|---|---|---|
| Ukuran perusahaan | ✅ Ya | Perusahaan kecil dengan sedikit modul tetap mengalami duplikasi data kalau batasnya mengikuti UI, bukan domain — skalanya lebih kecil, polanya sama |
| Negara | ✅ Ya | Ini prinsip rekayasa perangkat lunak universal (domain-driven design), tidak terikat konteks regulasi/budaya negara mana pun |
| Standar AHSP | ✅ Ya | Perubahan standar AHSP mengubah *isi* Cost Code/Assembly, tidak mengubah kebutuhan bahwa Resource Requirement tetap harus jadi satu domain yang dikonsumsi banyak proses |
| Teknologi | ✅ Ya | Baik arsitektur monolith, microservices, atau paradigma masa depan yang belum ada — batas domain yang benar tetap relevan, hanya *cara mengimplementasikan* batas itu yang berubah |
| AI berkembang jauh | ✅ Ya | AI yang mengonsumsi data lintas modul yang terfragmentasi akan menghasilkan rekomendasi yang sama tidak konsistennya dengan manusia yang bekerja dengan data terfragmentasi — domain yang bersih adalah prasyarat AI yang baik, bukan sesuatu yang bisa dilewati karena "AI akan mengatasinya" |

**Verdict:** Lolos Universality Test.

**Counterfactual Test:** *Bagaimana jika sistem memang dibangun per domain?*
- **Konsekuensi arsitektur:** Resource Requirement, Cost Code, dan Price Book eksis sebagai *layanan domain* yang dipanggil oleh Estimate, Procurement, dan Inventory — bukan tiga tabel terpisah yang kebetulan menyimpan data serupa.
- **Apa yang otomatis berubah:** Perubahan pada satu domain (mis. harga material naik) otomatis terlihat konsisten di semua tempat yang memakainya, tanpa perlu "sinkronisasi manual" antar modul.
- **Apa yang otomatis menjadi tidak diperlukan:** Proses rekonsiliasi berkala ("apakah data RAB dan data Procurement masih sinkron?"), tim/peran yang tugasnya khusus menjaga konsistensi data lintas modul, dan seluruh kelas bug "data tidak sinkron" yang lazim di software modular tradisional.

### First Principle 3 — Pembelajaran Harus Menjadi Input, Bukan Sekadar Output

**Universality Test:**
| Dimensi yang Berubah | Masih Berlaku? | Kenapa |
|---|---|---|
| Ukuran perusahaan | ✅ Ya | Baik kontraktor kecil maupun EPC raksasa sama-sama rugi kalau evaluasi proyek berhenti jadi laporan yang tidak pernah dibaca ulang |
| Negara | ✅ Ya | Bukan masalah budaya kerja spesifik — ini masalah arsitektur sistem: apakah lessons learned *terhubung* secara struktural ke sumber yang dipakai estimasi berikutnya |
| Standar AHSP | ✅ Ya | Standar apa pun yang dipakai, hasil evaluasi proyek tetap perlu jalur balik ke basis pengetahuan yang mempengaruhi estimasi berikutnya |
| Teknologi | ✅ Ya | Baik lessons learned disimpan sebagai dokumen PDF atau graph pengetahuan berbasis AI — masalahnya bukan format penyimpanan, tapi apakah ada *mekanisme paksa* yang menghubungkannya balik ke proses produksi |
| AI berkembang jauh | ✅ Ya, justru makin krusial | Ini prinsip yang paling relevan untuk AI — AI yang tidak pernah menerima feedback loop dari hasil rekomendasinya (Manager Validation, Phase B.5 § 10) akan mengulang kesalahan yang sama selamanya, sehebat apa pun modelnya |

**Verdict:** Lolos Universality Test.

**Counterfactual Test:** *Bagaimana jika pembelajaran memang diperlakukan sebagai input?*
- **Konsekuensi arsitektur:** Setiap proyek yang selesai memicu *mutation event* terhadap knowledge asset (Company AHSP naik versi, Productivity Library diperbarui) sebagai bagian dari alur kerja normal, bukan langkah opsional yang bisa dilewati.
- **Apa yang otomatis berubah:** Akurasi estimasi menjadi fungsi dari *jumlah proyek yang sudah selesai*, bukan konstan sepanjang waktu — perusahaan yang lebih lama beroperasi otomatis mengestimasi lebih baik, bukan sekadar lebih berpengalaman secara anekdotal.
- **Apa yang otomatis menjadi tidak diperlukan:** Rapat evaluasi proyek yang hasilnya "disimpan di folder dan tidak pernah dibuka lagi", dan peran khusus yang tugasnya "membaca laporan lama untuk mencari pelajaran" sebelum mengestimasi proyek baru — karena sistem sudah melakukan itu secara otomatis.

### First Principle 4 — Perilaku Sistem Harus Berupa Data yang Dikonfigurasi, Bukan Kode yang Ditanam

**Universality Test:**
| Dimensi yang Berubah | Masih Berlaku? | Kenapa |
|---|---|---|
| Ukuran perusahaan | ✅ Ya | Perusahaan kecil butuh formula sederhana, perusahaan besar butuh formula kompleks — keduanya sama-sama gagal kalau formula ditanam sebagai kode yang butuh developer untuk diubah |
| Negara | ✅ Ya | Setiap negara/wilayah punya variasi formula/regulasi yang berbeda — prinsip "jangan hardcode" berlaku di mana pun variasi itu terjadi |
| Standar AHSP | ✅ Ya | Ini prinsip yang secara langsung *dirancang* untuk menyerap perubahan standar — kalau standar AHSP berubah, hanya data yang berubah, bukan struktur sistem |
| Teknologi | ✅ Ya | Baik "formula sebagai data" diimplementasikan lewat expression engine, low-code platform, atau teknologi masa depan yang belum ada — prinsipnya (perilaku = data, bukan kode) tetap sama |
| AI berkembang jauh | ✅ Ya, dengan penguatan | AI generatif yang bisa *mengusulkan* formula baru tetap butuh tempat menyimpan usulan itu sebagai data yang bisa divalidasi manusia (Configurable Approval Workflow) — kalau formula tetap hardcoded, AI tidak akan pernah bisa berkontribusi tanpa deploy kode baru setiap kali |

**Verdict:** Lolos Universality Test.

**Counterfactual Test:** *Bagaimana jika perilaku sistem memang berupa data yang dikonfigurasi?*
- **Konsekuensi arsitektur:** Formula, struktur CBS, dan Calculation Strategy disimpan sebagai *definisi versioned* yang dieksekusi oleh Engine generik — Engine tidak pernah tahu "isi" formula, ia hanya tahu cara mengeksekusi definisi apa pun yang diberikan.
- **Apa yang otomatis berubah:** Setiap kebutuhan baru (standar AHSP baru, jenis pekerjaan baru, negara baru) menjadi *pekerjaan konfigurasi* yang bisa dilakukan estimator/admin, bukan *pekerjaan development* yang butuh siklus rilis software.
- **Apa yang otomatis menjadi tidak diperlukan:** Backlog developer untuk "tambah field ini", "ubah formula itu" yang lazim di software dengan struktur tertanam — karena perubahan yang sifatnya konten, bukan struktur, tidak pernah butuh sentuhan kode.

---

## Architectural Invariants — Konstitusi yang Tidak Boleh Dilanggar

**Kedudukan:** Berbeda dari First Principle (yang merupakan *temuan* dari analisis kegagalan di atas), Invariant adalah *komitmen* — daftar yang harus tetap benar terlepas dari bagaimana implementasi, teknologi, atau kapabilitas AI berkembang di masa depan. Ini adalah lapisan paling tinggi dari seluruh hierarki prinsip yang sudah dibangun sepanjang Phase B, B.5, dan C.

**⚠️ Catatan struktural penting:** Daftar Invariant ini, bersama seluruh Foundational Principle (Phase B/B.5) dan First Principle (Phase C) di atas, **dikonsolidasikan secara resmi** di dokumen terpisah — lihat [`04-architecture-constitution.md`](04-architecture-constitution.md) — sebagai rujukan lintas fase (Phase D sampai L), bukan terkubur di dalam satu dokumen Phase C saja. Ringkasan sepuluh Invariant di bawah ini dipertahankan di sini sebagai penutup natural Phase C, dengan detail penuh (termasuk hasil Universality Test dan Counterfactual Test di atas) hidup secara resmi di dokumen konstitusi.

1. **Single Source of Truth** — setiap fakta punya satu tempat asal, di mana pun ia dirujuk.
2. **Explainability** — setiap keputusan/angka bisa ditelusuri sampai ke alasan dasarnya.
3. **Versioning** — setiap knowledge object yang mempengaruhi estimasi punya riwayat, bukan hanya nilai terkini.
4. **Derived Data** — data yang bisa diturunkan tidak pernah diinput ulang secara manual.
5. **Knowledge as Company Asset** — pengetahuan adalah milik organisasi, bukan properti individu yang kebetulan menciptakannya.
6. **Strategy over Formula** — cara menghitung adalah pilihan yang bisa diganti, bukan logika tunggal yang tertanam.
7. **Engine over Module** — kapabilitas dirancang untuk dipakai ulang lintas domain, bukan fitur yang berdiri sendiri.
8. **Configuration over Hardcode** — perubahan perilaku adalah pekerjaan konfigurasi, bukan pekerjaan development.
9. **Traceability** — setiap entitas bisa dilacak asal-usulnya lintas domain.
10. **Auditability** — setiap perubahan tercatat siapa, kapan, dan mengapa.

---

## Assumptions

1. Bab "Why Existing Construction ERP Still Fail" berdasarkan pola umum kategori software (pengetahuan industri, bukan audit langsung terhadap produk kompetitor spesifik) — diberi label eksplisit sebagai analisis pola, bukan klaim terverifikasi terhadap satu produk tertentu.
2. Proyeksi "Burning Platform" 10 tahun adalah ekstrapolasi logis dari 9 root cause yang sudah dibuktikan (Phase A/B evidence-based) — bukan prediksi statistik/kuantitatif, melainkan skenario kualitatif yang konsisten dengan pola yang sudah diamati.

## Open Questions

1. Apakah keempat First Principle Violation (Knowledge, Per-Domain, Pembelajaran sebagai Input, Data-bukan-Kode) sudah menangkap seluruh kedalaman yang founder maksud, atau ada level lebih dalam lagi yang perlu digali?
2. Untuk Burning Platform § — apakah founder punya data/pengalaman konkret (mis. proyek kompetitor yang diketahui sudah lebih efisien) yang bisa memperkuat proyeksi ini dengan bukti, bukan cuma logika struktural?

## Required Decisions (Approval Gate)

1. Apakah kerangka 6-lapis (Observed Problem→...→Architectural Implication) sudah diterapkan dengan kedalaman yang memadai di kesembilan pertanyaan?
2. Apakah Bab "Why Existing Construction ERP Still Fail" sudah menangkap pola yang dimaksud (bukan daftar fitur)?
3. Apakah Bab "Burning Platform" sudah cukup menekankan urgensi tanpa terkesan berlebihan/tidak berdasar?
4. Apakah 4 First Principle Violation dan relasinya ke 4 Akar Masalah v1 sudah menangkap esensi seluruh temuan Phase C?
5. Apakah Phase C sekarang siap ditutup dan lanjut ke Phase D (Capability Architecture)?

---

## 🚦 APPROVAL GATE

Phase C v3 (Problem Discovery — First Principles Analysis, dengan Universality Test + Counterfactual Test + Architectural Invariants) selesai. Ini adalah penambahan terakhir untuk Phase C — tidak ada ekspansi horizontal maupun vertikal lebih lanjut yang direncanakan. **STOP** — menunggu approval eksplisit sebelum lanjut ke **Phase D (Capability Architecture)**.

Seluruh prinsip yang dihasilkan Phase B, B.5, dan C kini juga tersedia terkonsolidasi di [`04-architecture-constitution.md`](04-architecture-constitution.md).

**Catatan struktural (ditambahkan setelah Phase C v3 selesai):** Sebelum lanjut ke Phase D, founder mengidentifikasi satu lapisan lagi yang perlu diselesaikan — domain ownership dari seluruh komponen yang sudah ditemukan di sini dan di Phase B.5 belum pernah dipetakan eksplisit. Lapisan ini dikerjakan sebagai **Phase C.5 — Core Domain Discovery** (analog langsung dengan Phase B.5 sebagai pendalaman Phase B), lihat [`03b-phase-c5-core-domain-discovery.md`](03b-phase-c5-core-domain-discovery.md). Phase D menunggu Phase C.5 selesai, bukan menunggu Phase C v3 saja.
