# CECEP — Enterprise Information Classification Discovery

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Discovery lintas-fase (BUKAN bagian Phase G — menyentuh Phase F yang sudah frozen), dipicu oleh temuan [`08f`](08f-rule-storage-philosophy.md) § G-H: RAP Draft/Material Requirement Draft/Cashflow Baseline diklasifikasi ulang sebagai "Computed Data" alih-alih "Derived Data" (yang mana ketiganya dicontohkan sebagai Derived Data di Phase F, `07` § A). **Koreksi metodologis founder:** jangan langsung mengajukan ACR terhadap Phase F hanya karena satu indikasi ketidakcocokan — discovery ini dulu yang menentukan APAKAH "Computed" benar-benar kategori terpisah dari "Derived", sebelum ACR dipertimbangkan sama sekali.

**Kenapa ini bukan pengulangan Momentum Bias yang baru dikoreksi:** Pola yang sama (temukan gap → langsung solusi) HAMPIR terulang di sini juga (dari "temukan Computed≠Derived" langsung ke "ajukan ACR") — founder menangkapnya SEBELUM saya menulis ACR, persis pola yang sudah terbukti berulang. Dokumen ini adalah discovery yang seharusnya dijalankan LEBIH DULU.

---

## A. Sebelas Kandidat Kelas Informasi — Diuji Definisi, Karakteristik, Lifecycle, Determinisme, Replayability

**Metodologi:** Enam belas kelas yang sudah dikunci Phase F ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § A) DIPERIKSA ULANG satu per satu terhadap lima dimensi yang founder minta (Definisi Formal/Karakteristik/Lifecycle/Determinisme/Replayability) — plus lima kelas baru yang founder sebutkan eksplisit (Projected, Simulated, Materialized View, dan konfirmasi ulang Snapshot/Analytical yang sudah ada) untuk memastikan tidak ada kelas yang terlewat.

### A.1 Master Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Identitas inti perusahaan, dipakai berulang lintas transaksi, SATU sumber (Shared Kernel) |
| Karakteristik | Stabil, jarang berubah struktur, direferensikan (tidak disalin) |
| Lifecycle | Draft→Active→Deprecated (pola Cost Code, `03b` § A.3) |
| Determinisme | Selalu — identitas tidak berubah tanpa tindakan eksplisit |
| Replayability | Trivial — Historical tetap tersimpan (§ A.7 di bawah) |

**Status: TIDAK berubah dari Phase F.**

### A.2 Reference Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Data rujukan eksternal, bukan milik perusahaan, jarang berubah |
| Karakteristik | Bootstrap sekali, append-only |
| Lifecycle | Tidak ada — begitu di-bootstrap, murni ditambah versi baru (append) |
| Determinisme | Selalu, kecuali sumber eksternal (AHSP Nasional) merilis revisi — dan revisi itu SENDIRI jadi versi baru, bukan mengubah versi lama |
| Replayability | Trivial |

**Status: TIDAK berubah.**

### A.3 Transactional Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Catatan SATU peristiwa bisnis pada satu titik waktu |
| Karakteristik | Immutable setelah dicatat, append lebih baru bukan mutasi |
| Lifecycle | Dicatat sekali, status bisa berubah (mis. Kasbon Draft→Approved) tapi FAKTA transaksinya tidak pernah berubah |
| Determinisme | Selalu — satu transaksi = satu fakta permanen |
| Replayability | Trivial — transaksi lama tetap bisa dibaca ulang persis |

**Status: TIDAK berubah.**

### A.4 Derived Data — DIPERIKSA ULANG SECARA KETAT

| Dimensi | Jawaban |
|---|---|
| Definisi formal (DIPERTAJAM dari Phase F) | Nilai yang dihitung ulang SETIAP KALI diminta, dari sumber yang SELURUHNYA berada di dalam CECEP, TIDAK PERNAH disimpan sebagai sumber kebenaran independen |
| Karakteristik | Read-time projection ATAU materialized view yang bisa dibuang dan dihitung ulang kapan saja TANPA kehilangan informasi apa pun |
| Lifecycle | Tidak ada — Derived Data tidak "lahir" dan "mati", ia SELALU bisa diproduksi ulang dari sumber yang masih ada |
| Determinisme | **WAJIB SEMPURNA** — dua kali menghitung Estimate Version yang sama harus menghasilkan Derived Data yang identik bit-per-bit, KARENA sumbernya seluruhnya internal dan immutable |
| Replayability | Trivial by definition — Replay Derived Data = hitung ulang, tidak ada "versi lama yang perlu disimpan" karena TIDAK ADA informasi yang hilang kalau dihapus dan dihitung ulang |

**Kata kunci pembeda yang BARU ditemukan lewat pemeriksaan ketat ini:** *"TIDAK ADA INFORMASI YANG HILANG KALAU DIHAPUS DAN DIHITUNG ULANG."* Ini adalah tes yang lebih tajam dari definisi Phase F asli.

### A.5 Computed Data — DIPERIKSA ULANG SECARA KETAT

| Dimensi | Jawaban |
|---|---|
| Definisi formal (DIPERTAJAM) | Nilai yang dihasilkan dari SATU EKSEKUSI tertentu, di mana eksekusi itu MELIBATKAN faktor yang TIDAK SEPENUHNYA berada di dalam CECEP (state eksternal, waktu eksekusi, atau proses yang tidak murni fungsional) |
| Karakteristik | Snapshot hasil satu eksekusi — MENGHAPUS Computed Data BERARTI KEHILANGAN INFORMASI yang tidak bisa direproduksi identik (kata kunci pembeda dari § A.4) |
| Lifecycle | Lahir pada satu titik eksekusi, TIDAK PERNAH "dihitung ulang" untuk MENGGANTIKAN versi lama — kalau perlu versi baru, itu EKSEKUSI BARU yang menghasilkan Computed Data BARU (Historical, § A.7, bukan overwrite) |
| Determinisme | **TIDAK DIJAMIN SEMPURNA** — bergantung state di luar kendali CECEP pada momen eksekusi (persis temuan [`08f`](08f-rule-storage-philosophy.md) § G soal CAP-013/Integration Gateway) |
| Replayability | **BERBEDA dari Derived** — Replay Computed Data BUKAN "hitung ulang dan dapat hasil sama", tapi "BACA SNAPSHOT yang sudah tersimpan" — Computed Data BUTUH disimpan permanen (tidak seperti Derived yang boleh dibuang), karena TIDAK BISA direproduksi identik |

**Uji pembeda tajam terhadap Explanation Tree (contoh asli Phase F untuk Computed Data):** Apakah Explanation Tree kehilangan informasi kalau dihapus dan "dihitung ulang"? **YA** — Explanation Tree mencatat state PERSIS pada satu eksekusi (versi Formula/Price/Productivity yang dipakai SAAT ITU); menjalankan ulang Formula yang SAMA di WAKTU BERBEDA (dengan Price Book yang mungkin sudah berubah) akan menghasilkan Explanation Tree BERBEDA — bukan karena Formula-nya salah, tapi karena KONTEKS eksekusi berbeda. **Ini mengonfirmasi Computed Data memang kategori BERBEDA dari Derived Data, bukan subtype** — keduanya lolos tes pembeda yang SAMA (kata kunci "hilang informasi kalau dihapus") dengan hasil BERLAWANAN.

**Status: DIPERTAJAM, TIDAK direklasifikasi jadi subtype Derived — dikonfirmasi kategori independen yang sejajar dengan Derived Data, bukan turunannya.**

### A.6 Knowledge Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Pengetahuan perusahaan yang BERKEMBANG lewat Company Intelligence Loop (mekanisme pembaruan eksplisit via Domain Event) |
| Karakteristik | Versioned wajib, sumber utama AI Readiness |
| Lifecycle | Bootstrap→Company Baseline→Updated (dari Variance/Lessons Learned) |
| Determinisme | Setiap versi deterministik (baca versi X selalu dapat nilai X), tapi versi AKTIF berubah dari waktu ke waktu (BUKAN pelanggaran determinisme — ini konsisten Versioned Data, § A.9) |
| Replayability | Trivial — versi lama tetap tersimpan (Historical, § A.7) |

**Status: TIDAK berubah — TAPI diperjelas satu hal:** Knowledge Data BERBEDA dari Computed Data (§ A.5) meski keduanya "berubah dari waktu ke waktu" — Knowledge Data berubah lewat MEKANISME PEMBARUAN EKSPLISIT yang tercatat (Company Intelligence Loop), Computed Data "berbeda setiap eksekusi" karena KETIDAKPASTIAN EKSTERNAL yang tidak terkontrol. Beda sumber variasinya.

### A.7 Historical Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Catatan masa lalu yang tidak lagi aktif tapi tidak boleh hilang |
| Karakteristik | Tidak dihapus, ditandai status, tetap bisa dirujuk Replay |
| Lifecycle | Ini BUKAN kelas informasi berdiri sendiri — ia adalah STATUS yang bisa melekat pada kelas manapun (Master/Knowledge/Computed Data yang sudah Superseded/Expired/Deprecated) |
| Determinisme | N/A — mewarisi dari kelas induknya |
| Replayability | Definisi INTI-nya adalah "tetap replayable meski tidak aktif" |

**Temuan dari pemeriksaan ulang ini:** Historical Data SEBENARNYA bukan kelas SEJAJAR dengan yang lain di daftar enam belas — ia adalah **DIMENSI SILANG** (cross-cutting status) yang berlaku pada Master/Knowledge/Computed Data begitu mereka tidak aktif lagi. **Ini gap kecil di Phase F yang baru terlihat lewat pemeriksaan ketat ini** — dicatat sebagai temuan, bukan diubah di sini (lihat § D).

### A.8 Versioned Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Data yang eksplisit punya rangkaian versi tercatat |
| Karakteristik | Setiap versi objek immutable terpisah |
| Lifecycle | N/A — sama seperti Historical Data (§ A.7), ini DIMENSI SILANG, bukan kelas independen |
| Determinisme | Per-versi deterministik |
| Replayability | Definisi intinya |

**Sama temuan seperti § A.7: Versioned Data adalah dimensi silang, bukan kelas sejajar.**

### A.9 Audit Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Catatan siapa/kapan/mengapa suatu perubahan terjadi |
| Karakteristik | Append-only, tidak pernah diedit/dihapus |
| Lifecycle | Lahir sekali per peristiwa, permanen |
| Determinisme | Selalu — catatan peristiwa yang sudah terjadi tidak berubah |
| Replayability | Trivial, ia SENDIRI adalah mekanisme Replay untuk kelas lain |

**Status: TIDAK berubah — kelas SEJATI (bukan dimensi silang), karena Audit Data punya STRUKTUR SENDIRI (siapa/kapan/mengapa) yang tidak dimiliki kelas lain.**

### A.10 External Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Sumber kebenarannya di LUAR CECEP |
| Karakteristik | Diakses lewat Integration Gateway, tidak diduplikasi |
| Lifecycle | Dikelola sistem eksternal, CECEP hanya membaca |
| Determinisme | **TIDAK DIJAMIN** — sama seperti Computed Data (§ A.5), TAPI beda sebab: External Data tidak deterministik karena SELALU dibaca live dari luar; Computed Data tidak deterministik karena SATU EKSEKUSI historisnya melibatkan faktor eksternal pada SAAT itu |
| Replayability | **TIDAK DIJAMIN** — Replay External Data bergantung sistem eksternal masih menyimpan state yang sama |

**Temuan penting:** External Data dan Computed Data SAMA-SAMA "tidak deterministik", tapi untuk ALASAN BERBEDA — External Data tidak deterministik karena SELALU live; Computed Data tidak deterministik HANYA pada SAAT eksekusi (setelah itu, snapshot-nya sendiri deterministik/immutable). **Ini justru MEMPERKUAT bahwa RAP Draft/MR Draft/Cashflow Baseline (hasil transformasi via CAP-013) adalah Computed Data, BUKAN External Data** — begitu Rule-001/002/003 (`08c`) selesai eksekusi, hasilnya TERSIMPAN sebagai snapshot immutable (Computed), BUKAN dibaca ulang live dari sistem eksternal setiap kali dibutuhkan (yang akan menjadikannya External Data).

### A.11 Configuration Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Aturan yang mengatur PERILAKU sistem, bukan isi bisnis |
| Karakteristik | Diedit lewat governance, bukan hardcode |
| Lifecycle | Draft→Active→Superseded (mirip Knowledge Data tapi TANPA Company Intelligence Loop otomatis) |
| Determinisme | Selalu — perilaku yang sama untuk konfigurasi yang sama |
| Replayability | Trivial |

**Status: TIDAK berubah — TAPI diperjelas relasinya dengan Executable Knowledge Model ([`08e`](08e-rule-meta-model-discovery.md) § B):** Rule dan Formula ADALAH Configuration Data (§ A.11) DITAMBAH kekayaan perilaku (lifecycle/testing/replay/audit) yang melampaui Configuration Data murni (mis. Precision Rule) — Configuration Data tetap kelas informasi yang SAH, Executable Knowledge Model adalah SUB-KATEGORI yang lebih kaya di dalamnya, bukan pengganti.

### A.12 Snapshot Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Salinan beku kondisi pada satu titik waktu |
| Karakteristik | Immutable, tidak menerima update dari sumber asal |
| Lifecycle | Lahir sekali, permanen |
| Determinisme | Snapshot itu sendiri deterministik (selalu sama begitu dibuat) — tapi PROSES pembuatannya bisa melibatkan faktor yang sama dengan Computed Data |
| Replayability | Trivial — snapshot ADALAH bentuk penyimpanan untuk Replay |

**Diperiksa relasinya dengan Computed Data (§ A.5) — apakah keduanya sama?** **TIDAK SAMA, meski MIRIP.** Snapshot Data adalah SALINAN dari sesuatu yang SUDAH ADA (mis. Project CBS Snapshot = salinan Company CBS Template pada titik waktu tertentu — sumbernya PERSIS diketahui dan bisa dibandingkan). Computed Data adalah HASIL EKSEKUSI yang MENCIPTAKAN nilai baru (mis. Explanation Tree bukan "salinan" dari sesuatu, ia hasil KOMPUTASI). **Snapshot Data = salin. Computed Data = hitung/eksekusi.** Perbedaan tajam yang BARU eksplisit lewat pemeriksaan ini.

### A.13 Temporary Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Data hidup sesaat, hilang setelah tujuannya selesai |
| Karakteristik | Tidak pernah dipersist permanen, atau TTL eksplisit |
| Lifecycle | Lahir-mati dalam satu sesi kerja |
| Determinisme | Tergantung konteks — Sandbox/Simulation (§ L Phase E) memang SENGAJA dirancang deterministik untuk keperluan uji |
| Replayability | TIDAK RELEVAN — didesain untuk DIBUANG, bukan direplay |

**Status: TIDAK berubah.**

### A.14 AI Generated Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Konten yang diusulkan AI, BELUM divalidasi manusia |
| Karakteristik | WAJIB status "unvalidated" sampai lolos Approval |
| Lifecycle | Unvalidated→(lolos Approval)→berubah jadi kelas lain (Knowledge Data kalau berupa pembaruan pengetahuan, Configuration Data kalau berupa usulan Rule/Formula — konsisten `authored_by: ai_proposed`, [`08e`](08e-rule-meta-model-discovery.md) § D) |
| Determinisme | AI bisa non-deterministik secara internal, TAPI konten yang SUDAH diusulkan (setelah AI selesai generate) adalah data statis yang deterministik dibaca ulang |
| Replayability | Trivial setelah tersimpan — pertanyaan replay yang relevan adalah "apakah model AI yang sama menghasilkan usulan yang sama", di LUAR cakupan Replay CECEP (itu Replay model AI, bukan Replay data CECEP) |

**Status: TIDAK berubah.**

### A.15 Cache Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Salinan sementara untuk performa, bisa dihitung ulang |
| Karakteristik | Invalidasi dipicu Domain Event |
| Lifecycle | Hidup selama valid, dibuang saat invalidasi |
| Determinisme | Selalu — cache HARUS identik dengan hasil hitung ulang, kalau tidak berarti bug |
| Replayability | Trivial — cache boleh dibuang kapan saja tanpa kehilangan informasi (PERSIS kata kunci pembeda Derived Data, § A.4) |

**Diperiksa relasinya dengan Derived Data (§ A.4):** Cache Data adalah IMPLEMENTASI OPTIMASI dari Derived Data (dan berpotensi dari kelas lain yang mahal dihitung ulang) — BUKAN kelas informasi terpisah secara ontologis, ia kelas TEKNIS (persistence-layer). **Status: dipertahankan sebagai kelas terpisah di Phase F karena alasan PRAKTIS (perbedaan penanganan invalidasi penting untuk didokumentasikan), meski secara ontologis ia "menempel" pada Derived Data.**

### A.16 Event Data

| Dimensi | Jawaban |
|---|---|
| Definisi formal | Catatan bahwa sesuatu telah terjadi |
| Karakteristik | Immutable, append-only, urutan waktu penting |
| Lifecycle | Lahir sekali, permanen (ordered log) |
| Determinisme | Selalu |
| Replayability | Definisi intinya — Event Sourcing bergantung pada ini |

**Status: TIDAK berubah.**

---

## B. Kandidat Kelas Baru yang Diusulkan Founder — Diperiksa Satu per Satu

### B.1 Projected Data

**Diuji:** Apakah "Projected" berbeda dari "Derived"? **Diperiksa dalam:** Proyeksi biasanya berarti "pandangan ke MASA DEPAN" (mis. forecast Cashflow untuk 6 bulan ke depan berdasar tren) — beda dari Derived yang murni "hitung dari data yang SUDAH ADA sekarang". **Kesimpulan: Projected Data adalah SUBTYPE Derived Data DENGAN SATU CIRI TAMBAHAN — melibatkan ekstrapolasi/asumsi tentang masa depan, bukan murni agregasi masa lalu/sekarang.** Contoh CECEP: EVM `EAC` (Estimate At Completion, [`06`](../CECEP/06-phase-e-calculation-strategy.md)/kurva-s existing) adalah Projected Data — Derived Data yang mengandung asumsi proyeksi. **Direkomendasikan TIDAK jadi kelas ke-17 terpisah — cukup dicatat sebagai sub-anotasi Derived Data yang "mengandung proyeksi", karena karakteristik intinya (determinisme, replayability) SAMA dengan Derived Data biasa.**

### B.2 Simulated Data

**Diuji:** Apakah beda dari Temporary Data (§ A.13, Sandbox/Simulation Phase E)? **Diperiksa:** SAMA PERSIS — Simulation (`06` § L.1) sudah dikategorikan sebagai kasus penggunaan Temporary Data sejak Phase E. **Kesimpulan: Simulated Data BUKAN kelas baru — ia adalah NAMA LAIN untuk Temporary Data dalam konteks Simulation spesifik. Tidak perlu kelas terpisah.**

### B.3 Materialized View

**Diuji:** Apakah beda dari Cache Data (§ A.15)? **Diperiksa:** Materialized View (istilah database) = hasil query yang DISIMPAN fisik untuk performa, mirip PERSIS Cache Data. **Kesimpulan: Materialized View adalah ISTILAH IMPLEMENTASI (Persistence Truth, `04` § 8) untuk konsep yang SUDAH ada sebagai Cache Data di level arsitektur. Tidak perlu kelas informasi terpisah — ini keputusan Phase K/L (bagaimana Cache Data diimplementasikan secara fisik), bukan keputusan Information Classification.**

### B.4 Analytical Data

**Diuji:** Apakah kelas baru? **Diperiksa:** "Analytical" biasanya berarti data yang dipakai untuk ANALISIS (BI/reporting) — bukan kelas ontologis baru, tapi PENGGUNAAN dari kelas yang sudah ada (Derived Data untuk RAB/EVM YANG DIPAKAI analisis, atau Historical Data yang dipakai analisis tren). **Kesimpulan: BUKAN kelas terpisah — "Analytical" adalah KEGUNAAN (usage pattern), bukan SIFAT data (classification axis).**

---

## C. Konfirmasi — Computed Data BUKAN Subtype Derived Data

**Jawaban langsung terhadap pertanyaan inti dokumen ini (yang memicu seluruh discovery):**

Setelah pemeriksaan ketat § A.4 vs § A.5 dengan tes pembeda tajam ("apakah informasi hilang kalau dihapus dan diproduksi ulang"):

- **Derived Data**: TIDAK ADA informasi yang hilang — bisa dihapus dan dihitung ulang kapan saja, hasilnya IDENTIK.
- **Computed Data**: ADA informasi yang hilang — kalau dihapus, TIDAK BISA direproduksi identik karena bergantung state pada SATU TITIK WAKTU eksekusi yang sudah lewat.

**Ini adalah PERBEDAAN ONTOLOGIS, bukan derajat/tingkatan yang sama** — Derived Data dan Computed Data BUKAN hubungan induk-anak (subtype), mereka adalah DUA KATEGORI SEJAJAR yang kebetulan sama-sama "dihasilkan dari proses", tapi berbeda fundamental soal REPRODUCIBILITY. Konsisten dengan definisi Phase F ASLI yang SUDAH membedakan keduanya secara terpisah (`07` § A, dua baris berbeda) — **discovery ini MENGONFIRMASI Phase F sudah benar mendefinisikan keduanya sebagai kelas terpisah, TIDAK ADA kontradiksi yang perlu ACR.**

**Yang SEBELUMNYA salah bukan definisi Phase F — yang salah adalah PENERAPAN AWAL di [`08c`](08c-orchestration-rule-design.md) (ditahan) yang mengklasifikasikan RAP/MR/Cashflow sebagai Derived Data (§ D versi lama, sebelum revisi `08f`).** Klasifikasi ULANG di `08f` § H (RAP/MR/Cashflow → Computed Data) adalah PENERAPAN YANG BENAR dari kelas yang SUDAH ADA di Phase F, bukan penemuan kelas baru yang butuh ACR.

---

## D. Temuan Sampingan — Historical/Versioned Data sebagai Dimensi Silang

**Ditemukan selama pemeriksaan § A.7 dan § A.8 (bukan tujuan awal discovery, tapi terlihat lewat pemeriksaan sistematis):** Historical Data dan Versioned Data BUKAN kelas SEJAJAR dengan empat belas kelas lain — mereka adalah STATUS/DIMENSI yang melekat PADA kelas lain (mis. "Knowledge Data yang sudah Historical", "Master Data yang Versioned"). Phase F ([`07`](../CECEP/07-phase-f-enterprise-data-model.md) § A) mendaftar keduanya SEJAJAR dengan empat belas kelas lain dalam SATU tabel enam belas baris — ini secara TEKNIS bisa dibaca membingungkan (menyiratkan mereka level yang sama), meski secara PRAKTIS tidak pernah menyebabkan kesalahan (karena Phase F sendiri konsisten dalam pemakaiannya).

**Ini BUKAN kandidat ACR** (tidak mengubah struktur/perilaku data apa pun yang sudah dikunci) — murni **klarifikasi dokumentasi**: Historical dan Versioned lebih tepat dijelaskan sebagai "dimensi silang" dibanding "kelas ke-7 dan ke-9 yang sejajar". Direkomendasikan sebagai catatan kecil untuk Phase F kalau/ketika dokumen itu direvisi untuk alasan lain — TIDAK cukup signifikan untuk memicu ACR berdiri sendiri.

---

## Assumptions

1. Tes pembeda "informasi hilang kalau dihapus dan diproduksi ulang" (§ C) adalah kriteria yang saya rumuskan sendiri untuk membedakan Derived vs Computed — belum pernah dinyatakan eksplisit di Phase F, meski konsisten dengan definisi yang sudah ada di sana. Kalau founder punya kriteria pembeda yang berbeda, kesimpulan § C perlu diuji ulang.
2. Projected/Simulated/Materialized View/Analytical (§ B) diasumsikan BUKAN kelas terpisah berdasarkan analisis bahwa mereka masing-masing adalah sub-anotasi, sinonim, istilah implementasi, atau usage-pattern dari kelas yang sudah ada — kalau founder membayangkan salah satunya sebagai kelas dengan karakteristik BENAR-BENAR unik (bukan variasi kelas existing), itu perlu dijelaskan lebih dalam.

## Open Questions

1. Apakah tes pembeda "kehilangan informasi kalau dihapus" (§ A.4, § A.5, § C) sudah menangkap esensi perbedaan Derived vs Computed sesuai yang founder maksud?
2. Apakah temuan sampingan Historical/Versioned sebagai dimensi silang (§ D) perlu diangkat jadi klarifikasi resmi ke Phase F sekarang, atau cukup dicatat di sini sampai ada alasan lain merevisi Phase F?
3. Apakah founder setuju TIDAK diperlukan ACR terhadap Phase F untuk kasus Computed vs Derived (§ C) — karena discovery ini menyimpulkan Phase F sudah benar sejak awal, hanya PENERAPAN awal di Rule Design yang keliru?

## Status

**Discovery selesai — enam belas kelas Phase F diperiksa ulang secara ketat, EMPAT kandidat kelas baru founder (Projected/Simulated/Materialized View/Analytical) semuanya diputuskan BUKAN kelas terpisah** (masing-masing sub-anotasi/sinonim/istilah implementasi/usage-pattern dari kelas yang sudah ada). **Temuan inti: Computed Data BUKAN subtype Derived Data — keduanya kategori sejajar yang SUDAH benar dipisah sejak Phase F, dikonfirmasi lewat tes pembeda tajam ("informasi hilang kalau dihapus dan diproduksi ulang").** **Kesimpulan paling penting: TIDAK DIPERLUKAN ACR terhadap Phase F** — reklasifikasi RAP/MR/Cashflow Baseline di [`08f`](08f-rule-storage-philosophy.md) adalah penerapan yang benar dari kelas yang sudah ada, bukan penemuan kelas baru yang mengubah baseline. Satu temuan sampingan (Historical/Versioned sebagai dimensi silang, bukan kelas sejajar) dicatat sebagai klarifikasi dokumentasi ringan, bukan ACR. Rule Storage Philosophy ([`08f`](08f-rule-storage-philosophy.md)) sekarang dikonfirmasi berdiri di atas fondasi klasifikasi yang solid — Rule Design ([`08c`](08c-orchestration-rule-design.md)) boleh ditulis ulang dengan keyakinan bahwa keputusan Computed vs Derived tidak akan berubah lagi.
