# CECEP — ADR Traceability Log

**Kedudukan:** Indeks pusat SEMUA Architecture Change Request (ACR) lintas seluruh fase — bukan phase baru, bukan pengganti dokumen fase manapun. Dibuat sebagai koreksi governance setelah Enterprise Architecture Audit menemukan bahwa ACR selama ini diperlakukan seolah fungsinya hanya "menolak perubahan", padahal fungsi intinya adalah **Architecture Decision Traceability** — mencatat kenapa sebuah kontrak/boundary berbentuk begini, untuk siapa pun yang membaca bertahun-tahun kemudian. Lihat [`04-architecture-constitution.md`](04-architecture-constitution.md) § 7.1-7.2 untuk definisi threshold dan format ACR.

**Aturan pemeliharaan:** Setiap ACR — DITERIMA, DITOLAK, atau DITERIMA SEBAGIAN — dicatat di sini permanen. Tidak pernah dihapus, bahkan setelah diterima dan diimplementasikan di dokumen fase terkait. Urutan kronologis (ACR-001, 002, dst berdasarkan urutan ditemukan, bukan urutan fase).

---

## ACR-001: Precision Rule Ownership Leak (Calculation → Information)

```
Ditemukan saat: Enterprise Architecture Audit (Dimensi 3 — Architecture Layer Separation),
                 mengoreksi Phase E § F (Precision Rules)
Masalah: Phase E (06-phase-e-calculation-strategy.md § F) menetapkan `precision_digits` dan
         `rounding_mode` sebagai atribut identitas RBS entry — sebuah keputusan struktur
         Information Model — SEBELUM Phase F memiliki domain itu. Dicatat sebagai
         "Assumption 2" di Phase E, bukan diajukan sebagai ACR, meski secara substansi
         adalah cross-layer leak dari Calculation Truth ke Information Truth.
Opsi dipertimbangkan:
  (a) Biarkan sebagai Assumption — risiko: Phase F meratifikasi tebakan Phase E tanpa
      pertimbangan eksplisit apakah presisi seharusnya per-Resource (universal) atau
      per-Company (bervariasi).
  (b) Buka kembali sebagai keputusan Phase F murni, dengan Phase E hanya mengonsumsi
      hasilnya lewat referensi (dipilih).
Rekomendasi: Precision Rule ownership dipindahkan status keputusannya menjadi milik
             Phase F (Canonical Information Contract, 07 § C.1) — Phase E tetap
             mewarisi/mengonsumsi precision dari RBS entry (§ F Phase E tidak berubah
             secara teknis), tapi keputusan ARSITEKTURALnya (siapa yang berhak
             menetapkan skema presisi) sekarang eksplisit dicatat sebagai keputusan
             Information Truth, bukan Calculation Truth yang kebetulan menyentuhnya.
Dampak kalau disetujui: Tidak mengubah struktur data (precision_digits tetap di RBS
                         entry) — murni mengubah CATATAN kepemilikan keputusan, supaya
                         Phase F.1 lanjutan yang mempertimbangkan per-Company variation
                         (07b Assumption 2) melakukannya sebagai pemilik sah, bukan
                         sebagai ratifikasi pasif.
Keputusan Akhir: DITERIMA
Tanggal Diputuskan: 2026-07-18 (retroaktif, saat revisi governance ACR threshold)
Status: RESOLVED
```

**Catatan traceability:** Ini adalah contoh KONKRET kenapa threshold ACR lama (implisit: "kalau tidak sentuh Capability/Domain, bukan ACR") terlalu longgar — perubahan ini TIDAK menyentuh Capability atau Domain manapun, tapi tetap layak ACR karena menyentuh **kepemilikan keputusan lintas-layer** (§ 7.1 Constitution, kriteria kedua).

---

## ACR-002: Elemen Audit Hilang dari Canonical Information Contract

```
Ditemukan saat: Phase F.1 (07b-phase-f1-information-validation-freeze.md § 15,
                 Information Contract Validation)
Masalah: Canonical Information Contract (07 § C.1) didesain dengan SEPULUH elemen wajib
         (Identity/Meaning/Owner/Lifecycle/Version/Allowed Mutation/Consumers/Producers/
         Source of Truth/Derivation Rule). Validasi menemukan SEMUA EMPAT contoh yang
         sudah diisi (Price/Formula/Scenario/Estimate) konsisten TIDAK menyebutkan
         mekanisme audit eksplisit — meski prinsip Auditability sudah terkunci sejak
         Phase B.5 (04 § 5 Invariant 10). Ini bukan kelalaian satu contoh, tapi elemen
         yang absen dari STRUKTUR kontrak itu sendiri.
Opsi dipertimbangkan:
  (a) Anggap Auditability sudah "cukup" tercakup prinsip umum, tidak perlu elemen
      kontrak terpisah — ditolak, karena beda antara "prinsip berlaku umum" dan
      "kontrak informasi INI spesifik menyebut mekanisme audit-nya" adalah gap nyata.
  (b) Tambahkan Audit sebagai elemen kesebelas wajib (dipilih).
Rekomendasi: Canonical Information Contract direvisi dari SEPULUH menjadi SEBELAS elemen
             wajib — Audit ditambahkan, didefinisikan sebagai "Domain Event/mekanisme
             KONKRET yang mencatat setiap perubahan pada informasi ini".
Dampak kalau disetujui: Mengubah STRUKTUR kontrak yang sudah ditulis di Phase F (07 § C.1)
                         — bukan sekadar dokumentasi tambahan. Keempat contoh yang sudah
                         diisi (Price/Formula/Scenario/Estimate) diisi ulang retroaktif
                         dengan elemen Audit. Ini PERSIS jenis perubahan yang sekarang
                         didefinisikan wajib ACR (04 § 7.1 kriteria pertama — "perubahan
                         struktur sebuah kontrak yang sudah frozen").
Keputusan Akhir: DITERIMA
Tanggal Diputuskan: 2026-07-18 (retroaktif — implementasi sudah diterapkan penuh ke
                     07-phase-f-enterprise-data-model.md § C.1-C.2 saat Phase F.1 selesai)
Status: RESOLVED
```

**Catatan traceability:** Ini adalah TEMUAN PALING SIGNIFIKAN dari seluruh Phase F.1 — ditemukan karena validasi secara khusus membandingkan istilah founder kata-per-kata terhadap struktur yang sudah ditulis, bukan sekadar mengecek "apakah lengkap" secara umum (lihat `07b` § 15.2 Analisis Akar Masalah). Founder dan audit independen sepakat ini seharusnya sudah jadi ACR sejak awal, bukan "koreksi dalam batas frozen".

---

## ACR-003: FX Rate Versioning Contradiction

```
Ditemukan saat: Enterprise Architecture Audit (Dimensi 8 — Enterprise Readiness),
                 menguji ulang klaim "Multi-Currency paling siap" (05b § 6)
Masalah: Currency Exchange Rate diklasifikasikan sebagai "kasus khusus Unit Conversion"
         (03b § C.4, Rejected Domain — currency FX ditolak jadi domain terpisah, digabung
         ke Unit Conversion Engine). TAPI Unit Conversion secara eksplisit dinyatakan
         TIDAK di-versioned (07 § I — "reference data matematis stabil", pengecualian
         sah dari Foundational Principle Ketiga). Kontradiksi: FX rate BERSIFAT temporal
         dan volatile (beda dari rasio fisik kg→ton yang konstan selamanya) — Replay
         (06b § 7, contoh Estimate 2028 dihitung ulang 2033) MENSYARATKAN rate historis
         immutable-per-titik-waktu. Menggabungkan FX ke domain yang eksplisit
         "tidak perlu versioning" bertentangan langsung dengan kebutuhan Replay.
Opsi dipertimbangkan:
  (a) Versioning-kan seluruh Unit Conversion — ditolak, merusak rasionalnya sebagai
      "reference data stabil" untuk KONVERSI FISIK yang memang tidak pernah berubah
      (1 kg akan selalu 0.001 ton, tidak seperti Rupiah-ke-Dollar).
  (b) Pisahkan Currency Exchange Rate jadi Knowledge Data ter-versi tersendiri, terpisah
      dari Unit Conversion Rule fisik — REVERSAL terhadap keputusan Rejected Domain C.4
      di Phase C.5 (dipilih).
Rekomendasi: Currency Exchange Rate naik status dari "kasus khusus Unit Conversion"
             menjadi domain/Knowledge Data tersendiri yang WAJIB di-versioned — pola
             sama dengan Price Book Entry (immutable per rate, per titik waktu). Fungsi
             built-in `CONVERT()` (06 § A.3) tetap dipertahankan sebagai satu mekanisme
             pemanggilan untuk KEDUA jenis konversi (fisik dan currency) — perubahan ini
             HANYA mempengaruhi bagaimana NILAI currency disimpan/di-versioned, bukan
             cara ia dipanggil dari Formula Language.
Dampak kalau disetujui: Membalik satu keputusan Rejected Domain dari Phase C.5 (03b § C.4)
                         — konsekuensi terbesar dari ketiga ACR ini. Menyentuh klasifikasi
                         Information (07 § A, Currency dari Value Object jadi punya
                         komponen Knowledge Data ter-versi) TANPA mengubah Capability
                         manapun (tetap dikonsumsi CAP-001/CAP-004 seperti sebelumnya)
                         dan TANPA mengubah Formula Language/grammar (06 § A-G tetap utuh).
Keputusan Akhir: DITERIMA
Tanggal Diputuskan: 2026-07-18 (retroaktif, saat revisi governance ACR threshold)
Status: RESOLVED — implementasi detail (skema Currency Exchange Rate sebagai Knowledge
        Data) DITUNDA ke Phase F lanjutan/Phase K, karena Multi-Currency belum menjadi
        kebutuhan mendesak (Puraloka Persada masih domestik, 05b § 6) — dicatat sebagai
        keputusan ARSITEKTURAL sekarang, implementasi konkret menyusul sesuai kebutuhan.
```

**Catatan traceability:** Ini satu-satunya dari ketiga ACR yang membalik keputusan Rejected Domain sebelumnya (`03b` § C.4) — dicatat eksplisit sebagai preseden bahwa Rejected Domain BUKAN keputusan permanen tak tersentuh, ia tetap tunduk pada bukti baru yang muncul dari fase-fase berikutnya (dalam hal ini, kebutuhan Replay yang baru dianalisis mendalam di Phase E.1, dua fase setelah Rejected Domain C.4 ditulis).

---

## ACR-004: Capability Boundary Corrections — AHSP Management Merge, Resource Management Rename

```
Ditemukan saat: Phase 3 Capability Boundary Validation (36-phase3-capability-boundary-
                 validation.md), dipicu instruksi founder menguji setiap capability
                 dengan No-UI Test dan No-Menu Test sebelum Freeze.
Masalah: Capability Architecture draft awal (35, sebelum revisi) menetapkan "AHSP
         Management" sebagai capability terpisah dari "Assembly Library", dengan alasan
         "sudut pandang pengguna berbeda". Diuji ulang: alasan itu gagal No-Menu Test —
         perbedaannya murni UI/menu, bukan business capability. `02` § 4 sudah eksplisit
         sejak Phase B.5: AHSP nasional/company adalah SATU JENIS Assembly, bukan dua
         sistem. Terpisah, "Resource Management" diuji dan terbukti NAMESPACE bukan
         capability tunggal — dampak bisnisnya berbeda per kategori resource (Material→
         Procurement, Labor→Payroll, Equipment→Asset Management existing).
Opsi dipertimbangkan (AHSP/Assembly):
  (a) Pertahankan dua capability terpisah dengan alasan UI — ditolak, melanggar
      Constitution Article 8 (No-Menu Test) dan mengulang pola drift lama (Capability
      Map mengikuti struktur menu, bukan business capability).
  (b) Lebur AHSP Management total ke Assembly Library, empat sumber AHSP (Nasional/
      Company/Project/Custom) jadi bagian internal satu capability (dipilih).
Opsi dipertimbangkan (Resource Management):
  (a) Pertahankan sebagai satu capability payung — ditolak, Removal Test tidak
      menghasilkan SATU jawaban jelas (menghapusnya menggagalkan 3-4 aktivitas
      berbeda, bukan satu).
  (b) Pecah balik jadi Material/Labor/Equipment Planning tiga capability — ditolak,
      RBS (03b § A.5) tetap SATU Aggregate Root secara domain; memecah capability akan
      mendorong tiga implementasi terpisah untuk domain yang sama.
  (c) Ganti nama jadi "Resource Identity", persempit cakupan HANYA ke identitas lintas
      domain (bukan operasional/planning — itu tanggung jawab RAP Builder/Procurement
      Planning yang mengonsumsinya) (dipilih).
Rekomendasi: Capability Map turun dari 17 menjadi 16 node. AHSP Management dihapus
             sebagai entri terpisah. Resource Management diganti nama + dipersempit
             cakupannya. Material/Equipment/Labor Planning (3 kandidat awal) tidak
             pernah jadi capability berdiri sendiri — terserap sebagai konsumsi
             Resource Identity oleh capability lain.
Dampak kalau disetujui: Mengubah STRUKTUR Capability Map yang sudah ditulis di Phase 3
                         (35) — bukan sekadar catatan. Diterapkan retroaktif ke `35`
                         (daftar capability, diagram, tabel Ownership) dan tercermin
                         di `37` (Interaction Map) serta `38` (Readiness Assessment).
Keputusan Akhir: DITERIMA
Tanggal Diputuskan: 2026-07-22
Status: RESOLVED — diterapkan penuh ke 35/36/37/38, Phase 3 Frozen Permanently setelahnya.
```

**Catatan traceability:** Berbeda dari ACR-001/002/003 (semuanya level Information/Domain), ini ACR pertama yang terjadi di level **Capability** — mengonfirmasi bahwa lapisan Capability Architecture (baru diperkenalkan Roadmap V2, `32`) tunduk pada disiplin ACR yang sama seperti lapisan lain, bukan dianggap "terlalu dini untuk salah".

---

## Ringkasan Log

| ACR | Judul | Layer Tersentuh | Keputusan | Reversal Keputusan Lama? |
|---|---|---|---|---|
| ACR-001 | Precision Rule Ownership Leak | Calculation → Information | DITERIMA | Tidak (klarifikasi kepemilikan) |
| ACR-002 | Elemen Audit Hilang dari Contract | Information (struktur kontrak) | DITERIMA | Tidak (penambahan elemen) |
| ACR-003 | FX Rate Versioning Contradiction | Information (klasifikasi) | DITERIMA | **Ya** — membalik Rejected Domain C.4 (`03b`) |
| ACR-004 | Capability Boundary Corrections (AHSP merge, Resource rename) | Capability (`35`) | DITERIMA | Tidak (koreksi boundary pra-Freeze, bukan reversal pasca-Freeze) |

**Status log:** Empat ACR, ACR-001 sampai 003 retroaktif dicatat bersamaan saat revisi governance ACR threshold ([`04`](04-architecture-constitution.md) § 7.1-7.2) diterapkan; ACR-004 dicatat kontemporer saat Phase 3 (Roadmap V2) divalidasi. ACR berikutnya ditambahkan ke log ini secara kronologis, bukan tersebar di dokumen fase masing-masing.
