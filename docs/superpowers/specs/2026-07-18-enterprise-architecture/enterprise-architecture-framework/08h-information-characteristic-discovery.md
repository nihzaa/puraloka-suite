# CECEP — Information Characteristic Discovery

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Discovery lanjutan dari [`08g`](08g-information-classification-discovery.md), dipicu oleh temuan founder: kasus `Price` menunjukkan satu objek informasi bisa SEKALIGUS Master (klasifikasi) DAN Versioned, Historical, Auditable, Replayable, sebagian Immutable (karakteristik) — mengindikasikan **Classification** dan **Characteristic** adalah DUA SUMBU BERBEDA, bukan satu daftar 16 kelas yang sejajar.

**Kutipan pemicu (verbatim founder):** *"Price itu Master. Benar. Tetapi dia juga Versioned. Benar. Tetapi dia juga Historical. Benar. Lalu. Apakah dia juga Auditable? Iya. Replayable? Iya. Immutable? Sebagian. Artinya sekarang muncul sesuatu yang menurut saya lebih menarik. Mungkin sebenarnya ada dua sumbu. Bukan satu."*

**Kenapa ini bukan penambahan kelas ke-17:** [`08g`](08g-information-classification-discovery.md) § D sudah menemukan gejala ini secara sempit (Historical/Versioned sebagai "dimensi silang") tapi berhenti di situ, mencatatnya sebagai temuan sampingan kecil. Founder menunjukkan gejala itu sebenarnya BUKAN kasus khusus dua kelas — ia pola UMUM yang berlaku pada SEMUA kelas Classification. Discovery ini menuntaskan pola itu secara penuh, bukan tambal di dua kelas saja.

---

## A. Menguji Hipotesis Dua Sumbu

**Klaim yang diuji:** Setiap objek informasi di CECEP punya (1) TEPAT SATU Classification (jenis informasi apa dia — jawaban atas "apa SUMBER KEBENARAN dan CARA REPRODUKSI-nya") dan (2) NOL ATAU LEBIH Characteristic (sifat tambahan yang independen dari jenisnya — jawaban atas "bagaimana dia DIKELOLA dari waktu ke waktu").

**Uji dengan kasus Price (dari founder):**

| Pertanyaan | Jawaban | Sumbu |
|---|---|---|
| Apa sumber kebenaran Price, dan bagaimana ia direproduksi? | Master Data — identitas inti perusahaan, direferensikan bukan disalin | **Classification** |
| Apakah Price punya rangkaian versi tercatat? | Ya | Characteristic: **Versioned** |
| Apakah versi lama Price tetap tersimpan meski tidak aktif? | Ya | Characteristic: **Historical** |
| Apakah perubahan Price tercatat siapa/kapan/mengapa? | Ya | Characteristic: **Auditable** |
| Apakah Price bisa "dibaca ulang" pada titik waktu tertentu di masa lalu? | Ya | Characteristic: **Replayable** |
| Apakah Price, setelah dicatat, tidak pernah berubah nilainya? | SEBAGIAN — versi yang SUDAH aktif immutable, tapi field mana yang "aktif" bisa berpindah | Characteristic: **Immutable (partial/versioned-immutable)** |

**Hasil uji:** Hipotesis founder BENAR. Price = **Master Data (1 Classification) + {Versioned, Historical, Auditable, Replayable, Immutable-partial} (5 Characteristic)**. Tidak ada satu pun dari lima Characteristic itu yang mengubah jawaban "Price adalah Master Data" — mereka menjawab pertanyaan yang SAMA SEKALI berbeda.

**Uji silang kedua, dengan Computed Data (temuan `08g` § A.5, kasus paling kompleks):**

| Pertanyaan | Jawaban | Sumbu |
|---|---|---|
| Apa sumber kebenaran Explanation Tree, bagaimana direproduksi? | Computed Data — snapshot satu eksekusi, tidak bisa direproduksi identik | **Classification** |
| Apakah punya rangkaian versi? | Tidak dalam pengertian "versi yang saling menggantikan" — tiap eksekusi adalah entitas BARU, bukan versi baru dari entitas yang sama | Characteristic: **BUKAN Versioned** (lihat § C.2 untuk pembeda tajam) |
| Apakah tetap tersimpan meski tidak aktif? | Ya, permanen | Characteristic: **Historical** |
| Apakah tercatat siapa/kapan/mengapa? | Ya (Rule mana yang memicu, versi Rule berapa) | Characteristic: **Auditable** |
| Apakah bisa dibaca ulang di titik waktu tertentu? | Ya, dengan CATATAN — yang dibaca ulang adalah SNAPSHOT-nya sendiri, bukan "hasil hitung ulang" | Characteristic: **Replayable (snapshot-mode)** |
| Apakah setelah dicatat tidak pernah berubah? | Ya, sepenuhnya | Characteristic: **Immutable (full)** |

**Temuan tajam:** Computed Data TIDAK punya Characteristic **Versioned** — berbeda dari Price (Master Data) yang PUNYA Versioned. Ini konsisten: Versioned berarti "banyak versi dari SATU entitas logis yang sama saling menggantikan seiring waktu" — Computed Data secara definisi TIDAK PERNAH digantikan versi barunya (§ A.5 `08g`: "eksekusi baru menghasilkan Computed Data BARU, bukan versi baru dari yang lama"). **Ini membuktikan Characteristic bukan otomatis melekat pada semua Classification — ia benar-benar independen dan harus diuji per kasus, bukan diasumsikan.**

---

## B. Daftar Formal Characteristic — Definisi Ketat

Enam Characteristic yang diuji (lima dari founder + satu tambahan yang muncul selama pengujian):

### B.1 Versioned

**Definisi:** Objek informasi memiliki RANGKAIAN versi yang merepresentasikan ENTITAS LOGIS YANG SAMA pada titik waktu berbeda, di mana versi baru menggantikan (secara operasional, bukan destruktif) versi sebelumnya sebagai "versi aktif".
**Uji:** "Kalau saya update objek ini, apakah versi lama tetap ada TAPI tidak lagi jadi rujukan default?"
**Berlaku pada:** Master Data (Price, Cost Code), Knowledge Data, Configuration Data — TIDAK berlaku pada Computed Data, Transactional Data, Event Data (semua immutable-append, tidak ada konsep "versi aktif").

### B.2 Historical

**Definisi:** Objek informasi, setelah tidak lagi aktif/berlaku, TETAP TERSIMPAN dan bisa dirujuk — tidak pernah dihapus secara fisik.
**Uji:** "Kalau objek ini expired/superseded, apakah dia masih bisa dibaca?"
**Berlaku pada:** HAMPIR SEMUA Classification di CECEP (Master, Knowledge, Configuration, Computed, Transactional, Event) — CECEP secara konstitusional tidak menghapus data (`04` § 11, Auditability). **Pengecualian: Temporary Data (`08g` § A.13) secara definisi TIDAK Historical — ia didesain untuk dibuang.**

### B.3 Auditable

**Definisi:** Setiap perubahan pada objek informasi menghasilkan catatan siapa/kapan/mengapa yang terpisah dan independen dari objek itu sendiri (Audit Data, `08g` § A.9).
**Uji:** "Kalau objek ini berubah, apakah ADA catatan terpisah yang menjelaskan perubahan itu?"
**Berlaku pada:** Semua Classification yang bisa berubah state (Master, Knowledge, Configuration, Transactional-status) — TIDAK relevan untuk Classification yang secara definisi TIDAK PERNAH berubah setelah lahir (Event Data, Audit Data itu sendiri — mengaudit audit adalah regress tak berguna).

### B.4 Replayable

**Definisi:** Objek informasi bisa "dibaca ulang" sebagaimana ia tampak pada TITIK WAKTU TERTENTU di masa lalu — tapi MEKANISMENYA berbeda tergantung Classification-nya (lihat § C.2, pembeda krusial dengan Determinism).
**Uji:** "Bisakah saya menjawab 'seperti apa objek ini pada tanggal X bulan lalu'?"
**Berlaku pada:** SEMUA 16 Classification `08g` kecuali Temporary Data — tapi CARA menjawabnya berbeda dua kelompok (lihat § C.2).

### B.5 Immutable

**Definisi:** Objek informasi, SETELAH dicatat/difinalisasi, nilainya tidak pernah berubah lagi.
**Uji:** "Begitu tersimpan, apakah nilai ini bisa berubah dengan CARA APAPUN (termasuk lewat mekanisme versi)?"
**Tiga level ditemukan selama pengujian (BUKAN satu boolean sederhana seperti diasumsikan awal):**
- **Full Immutable** — tidak pernah berubah sama sekali (Event Data, Audit Data, Computed Data, Transactional fact)
- **Versioned-Immutable** — setiap VERSI individual immutable, tapi "versi mana yang aktif" bisa berpindah (Master Data, Knowledge Data, Configuration Data) — INI kasus Price yang founder tandai "sebagian"
- **Mutable** — nilai bisa berubah tanpa membentuk versi baru eksplisit (Temporary Data, dan status field pada Transactional Data seperti `kasbons.status`)

### B.6 Temporal Scope *(Characteristic ke-6, ditemukan selama pengujian — tidak ada di daftar awal founder tapi muncul sebagai kebutuhan nyata saat menguji § A.4/B.1 Projected Data dari `08g`)*

**Definisi:** Objek informasi merujuk ke titik waktu APA — Past (fakta yang sudah terjadi), Present (state saat ini), atau Future (proyeksi/rencana).
**Uji:** "Apakah objek ini menjelaskan apa yang SUDAH terjadi, apa yang SEDANG berlaku, atau apa yang DIPERKIRAKAN/DIRENCANAKAN terjadi?"
**Kenapa ditambahkan:** Ini yang secara formal membedakan Projected Data (`08g` § B.1, "EAC mengandung asumsi masa depan") dari Derived Data biasa TANPA perlu membuatnya kelas terpisah — Projected Data = Derived Data (Classification) + Future (Temporal Scope Characteristic). Pola yang identik dengan cara Historical Data diselesaikan di § D `08g`.

---

## C. Relasi Antar Sumbu

### C.1 Classification × Characteristic — Bukan Matriks Bebas, Ada Aturan Kompatibilitas

Tidak semua kombinasi Classification × Characteristic valid. Tabel kompatibilitas (✓ = umum berlaku, △ = kadang berlaku tergantung instance, ✗ = tidak pernah berlaku secara definisi):

| Classification | Versioned | Historical | Auditable | Replayable | Immutable-level | Temporal |
|---|---|---|---|---|---|---|
| Master | ✓ | ✓ | ✓ | ✓ | Versioned-Immutable | Present |
| Reference | ✓ | ✓ | △ | ✓ | Versioned-Immutable | Present |
| Transactional | ✗ | ✓ | ✓ (status) | ✓ | Full (fact) / Mutable (status) | Past |
| Derived | ✗ | ✗ (tidak perlu, selalu bisa dihitung ulang) | ✗ | ✓ (via hitung ulang) | N/A (tidak disimpan) | Present |
| Computed | ✗ | ✓ | ✓ | ✓ (snapshot-mode) | Full | Past |
| Knowledge | ✓ | ✓ | ✓ | ✓ | Versioned-Immutable | Present |
| Configuration | ✓ | ✓ | ✓ | ✓ | Versioned-Immutable | Present |
| External | ✗ | △ (tergantung sistem eksternal) | △ | △ | Mutable (di luar kendali) | Present |
| Snapshot | ✗ | ✓ | ✓ | ✓ (trivial) | Full | Past |
| Temporary | ✗ | ✗ | ✗ | ✗ | Mutable | Present |
| AI Generated | ✗ (sampai divalidasi, lalu berubah Classification) | ✓ | ✓ | ✓ | Full setelah lahir | Present |
| Cache | ✗ | ✗ | ✗ | ✓ (via hitung ulang) | N/A (menempel Derived) | Present |
| Event | ✗ | ✓ | ✗ (dirinya sendiri adalah audit trail) | ✓ (trivial) | Full | Past |
| Audit | ✗ | ✓ | ✗ (regress) | ✓ (trivial) | Full | Past |

**Temuan dari menyusun tabel ini:** Pola kompatibilitas TIDAK acak — ada dua klaster jelas:
- **Klaster "Versioned-Immutable"**: Master, Reference, Knowledge, Configuration — semuanya punya Versioned+Historical+Auditable+Replayable+Versioned-Immutable+Present. Ini EMPAT Classification yang secara PERILAKU (bukan secara isi) identik dari sudut Characteristic.
- **Klaster "Full Immutable Past"**: Transactional(fact)/Computed/Snapshot/Event/Audit — semuanya Historical+Auditable(atau dirinya sendiri audit)+Replayable+Full Immutable+Past.

**Ini BUKAN kebetulan** — ia mengonfirmasi bahwa Classification (§ jenis SUMBER KEBENARAN) dan Characteristic (§ jenis PENGELOLAAN) memang dua sumbu independen, tapi TIDAK sepenuhnya ortogonal — Classification tertentu secara ALAMI menarik gugus Characteristic tertentu, karena keduanya sama-sama berakar pada satu pertanyaan lebih dalam: **"apakah entitas ini punya konsep 'versi aktif yang bisa berganti' atau tidak"** (itulah yang memisah dua klaster di atas).

### C.2 Pembeda Krusial — Replayable vs. Determinism (koreksi presisi atas `08g`)

Pengujian § A/B di atas mengungkap satu isu presisi yang BELUM eksplisit di `08g`: kata "Replayable" dipakai untuk DUA MEKANISME berbeda yang sebelumnya tercampur:

- **Replay-by-Recompute** (Derived Data, Cache Data): Replay = hitung ulang dari sumber, hasilnya WAJIB deterministik identik.
- **Replay-by-Retrieve** (Computed Data, Snapshot Data, Event Data): Replay = baca kembali snapshot yang SUDAH tersimpan, TIDAK melibatkan hitung ulang sama sekali — "determinisme" tidak relevan di sini karena tidak ada proses baru yang dijalankan.

`08g` § A.5 sudah menyentuh ini secara implisit ("Replay Computed Data BUKAN hitung ulang, tapi baca snapshot") tapi belum menamainya sebagai dua MEKANISME Replayable yang formal. **Klarifikasi ini penting untuk Rule Ontology Validation berikutnya** karena Rule/Formula (Executable Knowledge Model) perlu jelas: eksekusinya Replay-by-Recompute (Formula, karena murni fungsi dari input) atau berpotensi Replay-by-Retrieve (Rule yang menghasilkan Computed Data via CAP-013) — keduanya BISA terjadi tergantung jenis Rule (`08d` taxonomy), bukan properti tunggal "Rule".

---

## D. Dampak ke `08g` — Klarifikasi, Bukan ACR

**§ D `08g` (Historical/Versioned sebagai "dimensi silang") sekarang TERSELESAIKAN PENUH:** yang sebelumnya disebut "dimensi silang" secara sempit (hanya untuk 2 dari 16 kelas) sekarang terbukti adalah **SUMBU KEDUA formal (Characteristic) yang berlaku sistematis di SEMUA 16 Classification**, bukan pengecualian kecil di dua baris tabel.

**Apakah ini ACR terhadap Phase F?** **TIDAK** — sama seperti kesimpulan `08g` § C, ini adalah PENAJAMAN MODEL (menambahkan sumbu penjelas yang sebelumnya implisit), bukan PERUBAHAN pada 16 Classification yang sudah dikunci. Tidak satu pun dari 16 Classification berubah nama, berubah definisi inti, atau berubah Data Ownership (`07` § B). Yang berubah murni cara MENJELASKAN mengapa Price terasa "Master tapi juga Versioned juga Historical" — sekarang ada kerangka formal untuk itu, bukan kebingungan implisit.

**Rekomendasi konkret untuk Phase F (non-blocking, dicatat untuk revisi dokumentasi di masa depan):** Tabel 16-baris di `07` § A sebaiknya, KELAK, dipecah visual menjadi dua kolom terpisah (Classification | Applicable Characteristics) alih-alih satu daftar datar — tapi ini murni presentasi, bukan perubahan keputusan arsitektur, sehingga tidak memicu ACR maupun perlu dieksekusi sekarang.

---

## Assumptions

1. Enam Characteristic (§ B) diasumsikan LENGKAP untuk kebutuhan CECEP saat ini — diuji terhadap semua 16 Classification dan ditemukan cukup untuk menjelaskan setiap kasus termasuk kasus kompleks (Computed Data, Price). Karakteristik lain (mis. "Encrypted", "Tenant-Scoped") mungkin relevan di Phase K/L (Operational Perspective, `04` § 14) tapi itu ranah keamanan/multi-tenancy, bukan Information Characteristic murni — di luar cakupan discovery ini.
2. Temporal Scope (§ B.6) ditambahkan sebagai Characteristic ke-6 meski tidak diminta eksplisit oleh founder — dianggap perlu karena tanpanya, Projected Data (`08g` § B.1) tidak punya cara formal dibedakan dari Derived Data biasa selain narasi. Kalau founder menilai ini berlebihan, Temporal Scope bisa dilebur kembali jadi catatan naratif seperti semula di `08g`.

## Open Questions

1. Apakah enam Characteristic (§ B) sudah cukup, atau founder melihat characteristic lain yang hilang dari pengalaman domain konstruksi (mis. sesuatu yang spesifik ke RAB/Kontrak yang belum terpikirkan di sini)?
2. Apakah dua klaster yang ditemukan di § C.1 ("Versioned-Immutable" vs "Full Immutable Past") cukup penting untuk didokumentasikan sebagai pola formal di `04-architecture-constitution.md`, atau cukup tinggal di sini sebagai referensi model informasi?
3. Apakah pembeda Replay-by-Recompute vs Replay-by-Retrieve (§ C.2) perlu langsung dipakai sebagai salah satu sudut pandang di Rule Ontology Validation berikutnya (karena menyentuh langsung pertanyaan "bagaimana Rule di-Replay")?

## Status

**Discovery selesai.** Hipotesis founder (dua sumbu: Classification vs Characteristic) TERBUKTI BENAR lewat pengujian dua kasus tajam (Price, Computed Data/Explanation Tree). Enam Characteristic terdefinisi formal (Versioned, Historical, Auditable, Replayable, Immutable dengan 3 level, dan Temporal Scope sebagai temuan tambahan). Matriks kompatibilitas Classification × Characteristic (§ C.1) menunjukkan dua klaster perilaku alami, mengonfirmasi kedua sumbu berkorelasi tapi tetap independen secara konseptual. Satu klarifikasi presisi penting ditemukan (§ C.2, Replay-by-Recompute vs Replay-by-Retrieve) yang akan relevan langsung untuk Rule Ontology Validation. **Tidak ada ACR terhadap Phase F** — ini penajaman model (menjadikan eksplisit apa yang sebelumnya implisit), bukan perubahan keputusan yang sudah dikunci. `08g` § D sekarang dianggap terselesaikan penuh oleh discovery ini.
