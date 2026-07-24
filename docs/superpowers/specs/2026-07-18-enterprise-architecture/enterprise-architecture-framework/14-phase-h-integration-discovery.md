# CECEP — Phase H: Integration Architecture Discovery

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Discovery murni — TIDAK mendesain apa pun. Objective satu-satunya: menemukan apa itu Integration SECARA ONTOLOGIS di dalam CECEP, sebelum satu kata pun disebut tentang teknologi (REST/Kafka/Webhook/dst). Ditulis ulang dari nol setelah draf pertama ([`14`](14-phase-h-integration-discovery.md) versi lama, dihapus — bukan disupersede, dihapus) terbukti melanggar No Solution Mode: draf itu langsung bertanya "API atau database atau manual?" — pertanyaan MEKANISME — sebelum ontologi Integration itu sendiri ditemukan. Kesalahan itu dicatat di § 6 sebagai bagian dari Discovery, bukan disembunyikan.

**Metodologi yang mengikat dokumen ini:** Pre-Discovery Framing (§ 0) diserang dengan "Tapi..." pada setiap jawaban. Setiap definisi diserang dengan **Five Whys** (mengapa berulang sampai mentok) SEBELUM diuji Universality Test (ganti-ganti contoh implementasi). Tidak ada kalimat "kita akan/harus" — kalau ditemukan dorongan menulis itu, berhenti, kembali ke pertanyaan "apakah ontologinya sudah ditemukan?"

---

## 0. Pre-Discovery Framing

### 0.A Invariant Apa yang Harus Bertahan Sepanjang Phase H?

**Jawaban awal:** Determinism Boundary — titik di mana jaminan Layer 5 CECEP berhenti berlaku begitu kendali diserahkan ke luar.

**Tapi... apakah ini masih benar kalau SETIAP contoh implementasi diganti?** Diuji: kalau "luar" itu berbentuk API (REST/GraphQL) — benar, ada titik serah terima yang jelas (pemanggilan API). Kalau "luar" itu berbentuk manusia yang membaca dokumen dan menginput manual — apakah masih ada "Determinism Boundary" yang bisa ditunjuk? **Ya, tapi bentuknya berbeda** — batasnya bukan lagi "panggilan fungsi", tapi "titik di mana CECEP berhenti menjamin apa pun terjadi setelah artefak diserahkan ke manusia". Kalau "luar" itu berbentuk file CSV yang diambil sistem lain secara berkala (polling, bukan push) — batasnya adalah "titik di mana CECEP menulis file dan tidak lagi tahu KAPAN atau APAKAH file itu dibaca". **Invariant bertahan di ketiga kasus** — polanya sama: SELALU ada satu titik di mana CECEP berhenti bisa menjamin apa pun terjadi setelahnya, terlepas dari bentuk mekanismenya. Diterima sebagai invariant kerja, TAPI nama "Determinism Boundary" sendiri akan diuji ulang lewat Five Whys di § 1 (jangan diterima sebagai definisi final di titik ini — ini pengujian invariant KERJA untuk membingkai Discovery, bukan definisi Integration final).

### 0.B Anti-Pattern Apa yang Paling Mungkin Muncul?

**Jawaban awal:** Menganggap ketahanan yang terbukti di Rule System internal (`08k`) otomatis berlaku untuk domain eksternal.

**Tapi... apakah ada anti-pattern yang LEBIH DALAM di bawah itu?** Diperiksa: anti-pattern "menyamakan internal dengan eksternal" itu sendiri adalah GEJALA, bukan akar. Ditanya lebih dalam: KENAPA seseorang akan menyamakan keduanya? Karena secara STRUKTURAL, cara CECEP MEMANGGIL sesuatu di luar (lewat Rule → action → Capability, `08a` § I) terlihat IDENTIK dengan cara ia memanggil Capability internal — sintaksnya sama, hanya target-nya beda. **Anti-pattern yang lebih dalam: "Interface Camouflage"** — Integration Gateway (CAP-013) didesain SEBAGAI capability (mengikuti pola Capability Catalog, `05`) supaya Rule bisa memanggilnya dengan cara yang sama seperti memanggil CAP-008/CAP-001/dst. — TAPI kesamaan BENTUK pemanggilan ini menyamarkan perbedaan FUNDAMENTAL sifat jaminannya (internal = frozen+deterministik, eksternal = tidak). Anti-pattern sebenarnya bukan "lupa bahwa luar itu beda" — itu terlalu naif untuk tim yang baru lulus `08k`. Anti-pattern sebenarnya adalah **desain yang SENGAJA menyamarkan perbedaan itu demi konsistensi API internal**, sehingga kelak sulit dibedakan mana pemanggilan yang boleh diasumsikan aman dan mana yang tidak, HANYA dengan membaca kode/Rule tanpa dokumentasi eksplisit.

### 0.C Bias Kognitif Apa yang Paling Mungkin Menyesatkan Fase Ini?

**Instruksi eksplisit: jangan asumsikan bias yang sama berulang.** Momentum Bias (Phase G) adalah "vigilance menurun saat streak lancar". Bias untuk Phase H HARUS diuji baru, bukan dicap ulang dengan nama lama.

**Diperiksa dari karakter Phase H yang berbeda dari G:** Phase G seluruhnya bisa diverifikasi lewat PENALARAN INTERNAL (semua premis ada di dalam CECEP, bisa dites logically). Phase H akan melibatkan KLAIM TENTANG DUNIA LUAR (bagaimana sistem lain berperilaku) yang TIDAK BISA diverifikasi murni lewat penalaran — perlu FAKTA EMPIRIS (apakah sistem X benar-benar API atau tidak, dsb.). **Bias yang muncul dari perbedaan ini: "Fabricated Certainty"** — kecenderungan MENGISI ketidaktahuan tentang dunia luar dengan ASUMSI YANG TERDENGAR MASUK AKAL dan menulisnya SEOLAH itu fakta yang sudah diverifikasi (persis apa yang terjadi di draf `14` lama: "kemungkinan besar API internal Puraloka Suite" ditulis dengan nada meyakinkan, padahal itu TEBAKAN berdasar baca CLAUDE.md, bukan verifikasi). Beda dari Momentum Bias (lupa mempertanyakan KEPUTUSAN sendiri), Fabricated Certainty adalah lupa mempertanyakan APAKAH SEBUAH FAKTA benar-benar sudah diverifikasi atau baru diasumsikan.

**Tapi... bukankah setiap Discovery pasti mengandung asumsi yang belum terverifikasi (lihat § Assumptions tiap dokumen)?** Diperiksa: BEDA — Assumptions section yang sudah jadi kebiasaan CECEP adalah PENANDAAN eksplisit "ini belum pasti". Fabricated Certainty adalah KEGAGALAN menandai itu — menulis dugaan sebagai kesimpulan. Bias ini diterima sebagai bias utama, dan otomatis berarti: dokumen ini WAJIB memisahkan tegas antara (a) yang bisa disimpulkan murni dari penalaran ontologis (sah dianggap Discovery valid) dan (b) yang butuh fakta dunia nyata Puraloka Suite (WAJIB ditandai Open Question, TIDAK BOLEH ditulis sebagai temuan).

### 0.D Asumsi Tersembunyi Apa yang Sedang Dipakai?

**Ditanya berulang sampai tidak ada lagi lapisan:**

- Asumsi permukaan: "CECEP akan terhubung ke sistem lain." → **Kenapa asumsi ini dipegang?** Karena Orchestration Gap-1/Gap-2 (`07c`) sudah menyebut Material Requirement dan Cashflow sebagai target.
- Lebih dalam: "Target itu berupa SISTEM (punya bentuk konsisten yang bisa didesain sekali)." → **Kenapa diasumsikan begitu?** Karena kata "Integration Gateway" (CAP-013) sendiri sudah menyiratkan SATU pintu gerbang seragam — pola Capability Catalog memang begitu (satu Engine, satu tanggung jawab konsisten).
- Lebih dalam lagi: **Apakah "satu pintu gerbang seragam" benar-benar sifat yang WAJIB dimiliki Integration, atau itu asumsi yang dipinjam dari pola Capability lain yang belum tentu cocok?** Ini asumsi PALING DALAM yang ditemukan — CAP-001 s.d. CAP-012 semuanya mengelola SATU jenis domain data internal yang homogen (Estimate, Price, dst.) sehingga "satu Engine konsisten" masuk akal. Integration, secara ontologis, berurusan dengan dunia yang HETEROGEN by definition (setiap sistem luar punya sifat sendiri) — belum tentu pola "satu Engine seragam" yang sama masih berlaku.

**Ini asumsi tersembunyi yang paling signifikan ditemukan di Pre-Discovery Framing:** Bahwa CAP-013 harus/bisa didesain sebagai SATU capability homogen seperti CAP-001-012. Ini TIDAK diputuskan di sini (itu akan jadi Design, melanggar § 5 No Solution Mode) — dicatat sebagai pertanyaan ontologis yang harus diuji di § 2.

---

## 1. Ontologi Integration — Five Whys

**Prinsip: tidak dimulai dari definisi target (Integration = X), dimulai dari MENGAPA Integration perlu ada sama sekali, ditanya berulang sampai mentok.**

**Q1: Mengapa CECEP butuh Integration?**
A1: Karena ada informasi/proses yang relevan dengan Cost Engineering (Procurement, Cashflow) yang SUDAH ada bentuknya di luar CECEP (sistem Puraloka Suite existing, atau proses manual perusahaan) — CECEP tidak memulai dari nol.

**Tapi... kenapa CECEP tidak cukup MEMILIKI proses itu sendiri (menginternalisasi Procurement/Cashflow sepenuhnya ke dalam Capability Catalog)?**

**Q2: Mengapa proses itu tidak cukup diinternalisasi sepenuhnya ke CECEP?**
A2: Karena Foundational Principle Keempat (`04` § 1, "Everything is Derived, Nothing is Re-entered") — kalau Procurement/Cashflow SUDAH punya sumber kebenaran di sistem lain, menduplikasinya ke dalam CECEP sebagai Capability baru akan MELANGGAR prinsip itu sendiri (menciptakan DUA sumber kebenaran untuk hal yang sama).

**Tapi... bukankah CAP-013 sendiri, kalau ia MENYIMPAN salinan data dari sistem lain, juga berisiko melanggar prinsip yang sama?**

**Q3: Mengapa Integration tidak otomatis melanggar "Everything is Derived" hanya karena ia membaca/menulis sistem lain?**
A3: Karena Integration, secara fungsi, TIDAK mengklaim menjadi sumber kebenaran BARU — ia adalah JEMBATAN yang meneruskan/menerjemahkan, bukan yang MEMILIKI. Kalau CAP-013 mulai menyimpan salinan dan menganggapnya otoritatif (bukan cache/pointer), barulah ia melanggar prinsip — dan ini PERSIS kenapa `08g`/`08h` sudah mengklasifikasikan hasil integrasi sebagai **Computed Data** (snapshot satu eksekusi, bukan sumber kebenaran independen).

**Tapi... kalau begitu, apa BEDA fungsi Integration dari fungsi Orchestration (yang JUGA "hanya menjembatani, tidak memiliki", `08a` § D)?**

**Q4: Mengapa Integration dan Orchestration, yang sama-sama "menjembatani tanpa memiliki", adalah dua hal berbeda?**
A4: Karena OBJEK yang dijembatani berbeda sifatnya. Orchestration menjembatani ANTAR Capability yang SEMUANYA sudah tunduk pada Five Truth Layers CECEP yang sama (frozen, deterministik, dikontrol penuh — Layer 2-4). Integration menjembatani ANTARA CECEP dan sesuatu yang TIDAK tunduk pada Five Truth Layers CECEP sama sekali — sesuatu yang punya truth-nya SENDIRI, di luar kendali dan di luar jaminan CECEP.

**Tapi... mengapa "tunduk pada truth yang sama" itu penting? Kenapa tidak cukup bilang Integration = Orchestration yang kebetulan targetnya di luar?**

**Q5: Mengapa perbedaan "tunduk pada truth yang sama vs tidak" ini secara fundamental penting, bukan sekadar detail teknis?**
A5: Karena SELURUH jaminan yang CECEP bangun sejak Phase D (Determinism, Replay, Explainability, Audit) BERGANTUNG pada asumsi bahwa semua pihak yang terlibat dalam satu keputusan tunduk pada aturan permainan yang SAMA (versioning yang sama, immutability yang sama, single-source-of-truth yang sama). Begitu SATU pihak dalam interaksi itu TIDAK tunduk pada aturan yang sama — jaminan itu TIDAK BISA lagi diberikan dalam bentuk aslinya untuk BAGIAN interaksi itu. Integration BUKAN soal "memanggil sesuatu di luar" — Integration adalah **titik di mana CECEP harus secara SADAR dan EKSPLISIT menghadapi kenyataan bahwa jaminannya sendiri (yang dibangun susah payah sejak Phase B) TIDAK otomatis menular ke pihak lain.**

**Q6 (mentok — tidak ada "mengapa" lagi yang lebih dalam dari ini): Mengapa CECEP harus secara SADAR menghadapi itu, bukan diam-diam mengasumsikan jaminannya tetap berlaku?**
A6: Karena kalau tidak disadari secara eksplisit, TEPAT DI SINILAH seluruh nilai Phase A-G runtuh tanpa terlihat — sebuah Rule yang secara sintaks terlihat sama determinstiknya dengan Rule internal (`08a` § I), tapi diam-diam bergantung hasil yang tidak dijamin sama, akan MENIPU seluruh sistem Explainability/Audit/Replay yang sudah dibangun (persis anti-pattern "Interface Camouflage" di § 0.B) — kepercayaan terhadap SELURUH arsitektur runtuh bukan karena satu bagian salah, tapi karena satu bagian BERPURA-PURA sama seperti bagian lain padahal tidak.

**Ini titik mentok Five Whys.** Tidak ada "mengapa" lebih dalam dari "supaya jaminan arsitektur tidak diam-diam ditipu oleh bagian yang tidak berhak mengklaimnya".

---

## 2. Definisi Kerja Integration (Hasil Five Whys, Sebelum Diuji Universality)

**Ditarik dari Q5-Q6:**

> **Integration adalah titik arsitektural di mana CECEP secara sadar dan eksplisit mengakui bahwa jaminan yang dibangun untuk dirinya sendiri (Determinism, Single Source of Truth, Versioning, Replay) TIDAK berlaku secara otomatis untuk sesuatu di luar batas kendalinya — dan mendefinisikan secara eksplisit APA yang masih bisa dijamin, APA yang tidak, dan DI MANA PERSIS batas itu berada.**

---

## 3. Universality Test — Diserang dengan Enam Skenario

**Setiap skenario menguji apakah definisi § 2 runtuh kalau mekanisme implementasi diganti:**

**Tapi... bagaimana kalau tidak ada REST API (mis. GraphQL, gRPC)?** Definisi tidak menyebut REST sama sekali — ia bicara "batas jaminan", bukan protokol. **Bertahan.**

**Tapi... bagaimana kalau komunikasinya lewat polling (CECEP secara berkala mengecek), bukan push/webhook?** Batas jaminan tetap ada — sekarang bentuknya "CECEP tidak bisa menjamin KAPAN perubahan di sistem lain akan terlihat", tapi PRINSIP-nya sama (ada titik di mana kendali CECEP berhenti). **Bertahan.**

**Tapi... bagaimana kalau hanya pertukaran CSV manual (export-import)?** Batas jaminan masih ada — "titik di mana CECEP berhenti menjamin apa pun tentang file setelah ditulis ke disk/dibaca dari disk". Justru CONTOH PALING JELAS dari definisi ini, karena tidak ada mekanisme otomatis yang menyamarkan batasnya. **Bertahan, bahkan lebih jernih.**

**Tapi... bagaimana kalau hanya shared database (CECEP dan sistem lain baca-tulis tabel yang sama)?** Ini kasus PALING SULIT — apakah "batas jaminan" masih ada kalau secara TEKNIS mereka berbagi storage yang sama? **Diperiksa dalam:** Ya, tetap ada — meski storage-nya sama, KEPEMILIKAN LOGIS tabel itu (siapa yang berhak menulis, siapa yang menjamin konsistensi setelah commit) tetap terbagi ke dua sistem dengan aturan yang mungkin berbeda (mis. sistem lain tidak menghormati constraint yang CECEP asumsikan). Batasnya bergeser dari "batas jaringan/protokol" ke "batas kepemilikan skema/constraint" — tapi TETAP ADA. **Bertahan, dengan catatan bentuknya paling implisit dari semua skenario — kandidat risiko tertinggi untuk anti-pattern § 0.B (Interface Camouflage) justru muncul di sini.**

**Tapi... bagaimana kalau hanya email (seseorang mengirim ringkasan, tidak ada sistem sama sekali)?** Batas jaminan = "titik di mana CECEP berhenti menjamin isi email itu akurat/terkirim/dibaca". **Bertahan.**

**Tapi... bagaimana kalau hanya interaksi manusia manual (PM membaca dashboard CECEP lalu menelepon supplier)?** Ini skenario PALING EKSTREM — apakah "Integration" masih relevan kalau tidak ada sistem apa pun di sisi lain, murni manusia? **Diperiksa dalam:** Definisi § 2 TIDAK menyebut "sistem lain" — ia menyebut "sesuatu di luar batas kendalinya". Manusia yang bertindak berdasarkan informasi dari CECEP TETAP berada di luar kendali determinism CECEP (manusia bisa salah dengar, lupa, menunda). **Bertahan — bahkan definisi ini secara tidak sengaja mencakup kasus yang biasanya TIDAK dianggap "Integration" sama sekali dalam pengertian teknis konvensional (interaksi manusia murni), yang justru MEMPERKUAT bahwa definisi ini ontologis, bukan teknis.**

**Hasil: definisi § 2 bertahan pada keenam skenario tanpa perlu direvisi kata per kata.** Satu insight tambahan muncul dari pengujian: definisi ini secara alami mencakup spektrum yang LEBIH LUAS dari "integrasi sistem-ke-sistem" konvensional — termasuk interaksi manusia. Ini BUKAN over-generalisasi yang harus dipersempit (setiap skenario tetap logically valid) — dicatat sebagai temuan yang perlu diuji lebih lanjut di Discovery berikutnya (§ 5).

---

## 4. Uji Silang — Apakah Definisi Ini Konsisten dengan Batas yang Sudah Dikunci?

**Terhadap Orchestration Separation Principle (`04` § 10):** Definisi § 2 TIDAK mengklaim Integration "memiliki" apa pun — ia murni tentang MENGAKUI batas, konsisten prinsip "memiliki capability tidak berarti memiliki orchestration/integration-nya".

**Terhadap Five Truth Layers (`04` § 8):** Definisi § 2 menempatkan Integration sebagai FUNGSI YANG BEROPERASI DI BATAS Layer 5 (Execution Truth) — ia tidak menciptakan Layer baru, ia adalah TEMPAT di mana Layer 5 secara eksplisit mengakui limitnya. **Tapi... apakah ini berarti Integration adalah BAGIAN dari Orchestration (Layer 5 yang sama), bukan konsep sejajar?** Diperiksa: TIDAK sepenuhnya — Orchestration (§ A `08a`) adalah tentang KAPAN/URUTAN memanggil sesuatu yang SUDAH pasti bisa dipanggil dengan jaminan penuh. Integration adalah tentang mengakui BAHWA sebagian panggilan itu TIDAK punya jaminan penuh. **Keduanya di Layer 5, tapi menjawab pertanyaan berbeda** — Orchestration menjawab "kapan/urutan", Integration menjawab "seberapa jauh saya bisa percaya hasil dari titik ini". Ini pertanyaan ontologis yang perlu diuji lebih dalam (§ 5), bukan diputuskan di sini.

**Terhadap CAP-013 (Integration Gateway, sudah bernama sejak `05`):** Definisi § 2 TIDAK mengasumsikan CAP-013 harus satu Capability homogen (menjawab kecurigaan § 0.D) — ia hanya mendefinisikan FUNGSI Integration, terlepas dari berapa banyak "gateway" yang dibutuhkan untuk mewujudkannya. Apakah CAP-013 tetap satu Capability atau perlu dipecah adalah pertanyaan DESIGN, eksplisit ditunda.

---

## 5. Kesalahan yang Ditemukan di Draf Pertama (Dicatat, Bukan Disembunyikan)

**Draf `14` versi pertama (dihapus) langsung bertanya:** "Apakah sistem existing itu API, database langsung, atau proses manual?" — SEBELUM ontologi Integration ditemukan. Ini pelanggaran § 6 (No Solution Mode) directive founder: pertanyaan itu adalah pertanyaan MEKANISME (persis kategori yang dilarang § 4 directive: bentuk konkret bukan ontologi), bukan pertanyaan ontologis. **Draf itu juga melanggar § 0.C yang baru ditemukan (Fabricated Certainty)** — menyimpulkan "kemungkinan besar API internal Puraloka Suite" berdasar tebakan dari CLAUDE.md, ditulis dengan nada meyakinkan padahal belum diverifikasi.

**Kenapa ini penting dicatat, bukan sekadar dihapus diam-diam:** Founder secara eksplisit menyatakan (directive § 7, Continuous Self-Review) — kalau argumen sendiri tidak bertahan, "rewrite before the founder needs to point it out." Draf pertama TIDAK bertahan terhadap directive yang datang setelahnya — dan koreksi ini dilakukan SEBELUM founder perlu menunjuknya secara spesifik (founder memberi directive umum, bukan menunjuk draf `14` secara spesifik) — inilah bentuk konkret "menemukan kesalahan sendiri lebih dulu" yang diminta.

---

## 6. Ontology Candidate Matrix — Posisi Integration Terhadap Orchestration

**Koreksi founder terhadap draf sebelumnya:** Menyerahkan pertanyaan "apakah Integration sejajar atau subtype Orchestration" ke founder adalah kegagalan Discovery, bukan kehati-hatian — itu membalik arah yang seharusnya (`Founder memilih → Claude membuktikan` alih-alih `Claude menguji semua kandidat → Claude menyimpulkan dengan bukti`). Lima kandidat diuji di bawah, masing-masing diserang sampai gugur atau bertahan — **Candidate Before Conclusion**: tidak ada kandidat favorit sebelum semuanya diserang.

### Kandidat 1 — Integration adalah Layer Baru (Layer 6), Terpisah dari Five Truth Layers

**Klaim:** Karena Integration berurusan dengan sesuatu yang truth-nya di luar kendali CECEP (§ 1 Q5), mungkin ia butuh Layer sendiri, bukan menumpang Layer 5.

**Diserang:** Five Truth Layers (`04` § 8) didefinisikan sebagai hierarki DARI MANA truth CECEP berasal (Business→Capability→Calculation→Information→Execution) — bukan hierarki tentang APA yang CECEP percaya dari luar. Menambah Layer 6 berarti mengklaim CECEP punya truth BARU yang lahir dari luar dirinya sendiri — ini KONTRADIKSI LANGSUNG dengan definisi § 2 (`14`, dokumen ini): Integration secara eksplisit BUKAN sumber truth baru, ia adalah PENGAKUAN batas truth yang sudah ada. **Diperkuat dengan preseden**: `08e` § B sudah menolak menjadikan Rule sebagai Ontology Object independen (yang akan menciptakan Layer ke-6) dengan alasan yang PERSIS sama — CECEP sudah punya arsitektur ontologis sendiri, bukan generik.

**Vonis: GUGUR.** Kontradiksi langsung dengan Five Truth Layers yang frozen, dan dengan definisi kerja Integration sendiri (§ 2) yang baru ditemukan di dokumen ini.

### Kandidat 2 — Integration ⊂ Orchestration (Integration adalah Subtype/Bagian dari Orchestration)

**Klaim:** Integration hanyalah Orchestration yang kebetulan targetnya di luar CECEP — sama seperti Rule-001/002/003 (`08c v2`) yang "action"-nya memanggil CAP-013, itu tetap Orchestration Rule biasa, hanya target panggilannya berbeda.

**Diserang:** Diuji terhadap definisi Orchestration yang sudah dikunci (`08a` § A): "keputusan tentang KAPAN dan URUTAN APA capability yang SUDAH MEMILIKI data/kemampuannya sendiri (Layer 1-4, SUDAH FROZEN) dipanggil." Kata kunci: **"sudah frozen".** Definisi Orchestration secara eksplisit mengasumsikan target panggilannya adalah sesuatu yang jaminannya SUDAH PASTI (Progressive Freeze Chain). Integration, menurut § 1 Q5-Q6 (dokumen ini), justru berurusan dengan target yang JAMINANNYA TIDAK BISA diasumsikan sama. **Kalau Integration dipaksa jadi subtype Orchestration, definisi Orchestration (`08a` § A) HARUS direvisi untuk menghapus kata "sudah frozen"** — itu berarti ACR terhadap Philosophy yang sudah di-freeze (`08a`), bukan penambahan yang aman.

**Diserang lebih dalam — apakah kontradiksi ini bisa dihindari dengan mengatakan "Orchestration Rule yang MEMANGGIL CAP-013 tetap Orchestration, tapi HASIL panggilannya bukan"?** Ini PERSIS pembeda yang `08k` § 8 (Replay Correctness) sudah buat — KEPUTUSAN Rule deterministik (Orchestration), HASIL eksekusi tidak (bukan Orchestration). Tapi ini justru MEMBUKTIKAN Integration bukan subtype — ia adalah fungsi yang mengurus BAGIAN YANG ORCHESTRATION SENGAJA TIDAK MENGURUS (hasil, bukan keputusan). Subtype seharusnya mewarisi SIFAT induknya; Integration justru mengurus sifat yang BERLAWANAN dengan sifat Orchestration (deterministik vs tidak).

**Vonis: GUGUR.** Memaksakan subtype ini butuh ACR terhadap `08a` § A yang sudah frozen, dan secara logis Integration mengurus persis bagian yang Orchestration definisinya kecualikan.

### Kandidat 3 — Orchestration ⊂ Integration (Orchestration adalah Subtype/Bagian dari Integration)

**Klaim:** Mungkin "Integration" sebenarnya konsep LEBIH BESAR (menghubungkan apa pun ke apa pun, termasuk Capability-ke-Capability internal), dan Orchestration hanyalah Integration versi "semua pihak dipercaya penuh".

**Diserang:** Ini akan berarti SEMUA yang dibangun Phase G (`08a`-`08k`, 14 lapisan, sudah frozen) sebenarnya adalah "kasus khusus" dari sesuatu yang belum pernah dinamai sampai sekarang — pola yang SANGAT mirip dengan kekeliruan yang Rule Meta Model Discovery (`08e`) HINDARI (menjadikan sesuatu yang sudah matang sebagai turunan dari kategori baru yang baru muncul). **Diuji terhadap Progressive Freeze Chain (`04` § 7):** Phase G sudah frozen SEBAGAI dirinya sendiri (Orchestration Architecture), bukan sebagai bagian dari sesuatu yang lebih besar yang belum didefinisikan. Kalau Kandidat 3 benar, itu berarti Phase G di-freeze SEBELUM ontologi induknya (Integration) ditemukan — pelanggaran urutan yang, kalau benar, adalah ACR besar terhadap SELURUH Phase G, bukan penambahan Phase H.

**Diuji juga secara langsung:** Apakah Rule-004 (Notifikasi, `08c v2` § B.4) — yang TIDAK menyentuh sistem luar sama sekali, murni memanggil sistem Notifikasi Puraloka Suite YANG SUDAH internal ke monorepo — terasa seperti "Integration"? **Tidak** — secara intuitif dan struktural, Rule-004 adalah Orchestration murni (memanggil Capability yang jaminannya penuh, sesuai `08a` § A). Kalau Orchestration adalah subtype Integration, Rule-004 seharusnya juga terasa seperti kasus Integration — ia tidak.

**Vonis: GUGUR.** Butuh ACR retroaktif terhadap seluruh Phase G yang sudah frozen (biaya sangat tinggi, tidak proporsional), dan gagal uji intuisi struktural terhadap Rule yang sudah ada.

### Kandidat 4 — Integration dan Orchestration adalah Sibling (Sejajar, Dua Fungsi Berbeda di Layer 5 yang Sama)

**Klaim (kesimpulan sementara § 4 sebelumnya di dokumen ini):** Keduanya beroperasi di Layer 5, tapi menjawab pertanyaan berbeda — Orchestration menjawab "kapan/urutan" untuk target yang frozen, Integration menjawab "seberapa jauh saya bisa percaya" untuk target yang tidak frozen.

**Diserang balik (jangan diloloskan hanya karena ini favorit sebelumnya):** Apakah "sibling" ini betulan dua KATEGORI berbeda, atau hanya SATU kategori (Orchestration) yang punya DUA MODE operasi (mode-frozen dan mode-tidak-frozen)? Diuji terhadap preseden `08e` § B (Rule dan Formula) — Rule dan Formula dinyatakan sibling BUKAN karena keduanya "terasa mirip", tapi karena keduanya LOLOS delapan kandidat ontologi berbeda dan sama-sama gagal sepenuhnya dijelaskan sebagai satu sama lain (Formula tidak bisa menjelaskan Rule Composition/Priority/Scope, Rule tidak bisa menjelaskan AST Formula). **Diuji hal yang sama untuk Integration vs Orchestration:** Bisakah SELURUH struktur Orchestration (`08a` § I-S: Lifecycle, Versioning, Composition, Priority, Scope, Explainability, Testability) diterapkan APA ADANYA ke Integration TANPA modifikasi?

- Lifecycle (Draft→Testing→Approved→Published→...) — bisa dipakai ulang untuk "Integration Contract" (sebuah kontrak integrasi juga punya siklus hidup serupa). **Cocok.**
- Composition (acyclic dependency graph) — TIDAK otomatis cocok: dependency ANTAR sistem eksternal (mis. sistem A harus sinkron dulu sebelum sistem B) adalah pertanyaan yang CECEP TIDAK BISA jamin/paksa (beda dari Rule Composition yang seluruhnya internal dan bisa dipaksa acyclic). **Butuh perlakuan berbeda.**
- Determinism (§ M `08a`) — SECARA EKSPLISIT tidak berlaku sama untuk Integration (ini akar dari seluruh Discovery § 1 dokumen ini — Integration ADA justru karena Determinism CECEP berhenti berlaku). **Kontradiksi langsung kalau dipaksa sama.**

**Vonis: BERTAHAN, tapi dengan syarat eksplisit.** Integration dan Orchestration BUKAN satu kategori dengan dua mode — Integration gagal mewarisi properti PALING INTI Orchestration (Determinism). Ini cukup untuk membuktikan mereka dua kategori BERBEDA, bukan satu kategori bermodus dua. Sibling relationship valid, TAPI harus dibuktikan lebih lanjut apa yang MENYATUKAN keduanya sebagai sibling (lihat Kandidat 5) — sibling tanpa induk bersama yang jelas hanya klaim setengah jalan.

### Kandidat 5 — Integration dan Orchestration adalah Proyeksi Berbeda dari Satu Konsep Lebih Fundamental

**Klaim:** Mungkin ada konsep induk yang BELUM dinamai — sesuatu seperti "Cross-Boundary Coordination" — di mana Orchestration adalah proyeksinya untuk internal (boundary = 0, semua dipercaya) dan Integration adalah proyeksinya untuk eksternal (boundary > 0, tidak semua dipercaya).

**Diserang:** Apakah "konsep induk" ini benar-benar diperlukan, atau ia hanya PENAMAAN ULANG dari "Layer 5 — Execution Truth" yang SUDAH ada (`04` § 8)? Diperiksa: Layer 5 SUDAH didefinisikan sebagai "mengonsumsi Layer 2-4, tidak pernah menciptakan truth baru" — ini SUDAH menjadi konsep induk yang menaungi APAPUN yang terjadi di titik eksekusi, termasuk baik Orchestration (memanggil yang frozen) MAUPUN Integration (mengakui yang tidak frozen). **Membuat nama BARU untuk "konsep induk" ini akan menduplikasi Layer 5 yang sudah ada** — melanggar prinsip yang sama dengan Kandidat 1 (jangan menciptakan struktur baru kalau yang sudah ada sudah menaunginya).

**Vonis: GUGUR sebagai konsep BARU, TAPI intinya BENAR dan sudah terpenuhi oleh yang sudah ada** — Layer 5 (`04` § 8) SUDAH menjadi "konsep induk" itu. Tidak perlu nama baru.

---

## 7. Kesimpulan Ontologis — Hasil Pengujian, Bukan Pilihan

**Dari lima kandidat: tiga gugur (1, 2, 3), satu gugur-sebagai-konsep-baru-tapi-sudah-terpenuhi (5), satu bertahan dengan syarat (4).**

**Posisi final:** Integration dan Orchestration adalah **dua fungsi sejajar (sibling) di dalam Layer 5 — Execution Truth** (Layer 5 sendiri sudah menjadi "induk bersama" yang dicari Kandidat 5, tidak perlu nama baru). Keduanya BUKAN satu kategori bermodus dua (dibuktikan gugur lewat uji Determinism, Kandidat 4) — Orchestration mengurus koordinasi ANTAR pihak yang SEMUA jaminannya frozen; Integration mengurus titik di mana SATU PIHAK ATAU LEBIH jaminannya TIDAK bisa diasumsikan frozen.

**Definisi kerja Integration (§ 2) DIKONFIRMASI konsisten dengan posisi ini** — tidak perlu direvisi. Definisi itu sudah menyebut "Layer 5" tanpa mengklaim layer baru, dan sudah menyebut "batas jaminan" tanpa mengklaim menjadi subtype Orchestration (yang justru mengasumsikan jaminan penuh).

**Satu konsekuensi struktural BARU yang lahir dari pengujian Kandidat 4 (bukan sekadar konfirmasi, temuan baru):** Karena Integration TERBUKTI gagal mewarisi Composition (acyclic dependency antar-Rule) dan Determinism dari Orchestration, artinya SELURUH mekanisme Phase G yang mengasumsikan Determinism penuh (`08a` § M, Rule Composition DFS di `08k` § 3-4) **TIDAK otomatis berlaku untuk hubungan antar-titik-integrasi** — Phase H HARUS menemukan padanannya sendiri (bukan mewarisi begitu saja), sama seperti Rule dulu harus menemukan padanan Composition/Priority/Scope-nya sendiri alih-alih menyalin murni dari Formula (`08a` § N-S).

---

## 8. Apakah "Mewarisi" Adalah Alat Uji yang Sah dalam Ontologi CECEP?

**Koreksi founder — sebelum melanjutkan apa pun dari § 7, dites dulu apakah "gagal mewarisi Determinism/Composition" (alasan Kandidat 4 bertahan) adalah alat uji yang SAH, atau diam-diam dipinjam dari OOP/UML tanpa pernah diverifikasi sebagai prinsip CECEP.**

**Diperiksa: dari mana istilah "mewarisi" masuk ke Discovery ini?** Ditelusuri balik — kata itu dipakai secara NARATIF di `08e` § B ("Constraint/Validation/Simulation... mewarisi pola lifecycle/version/testing/audit/explainability yang SUDAH terbukti dua kali") — TAPI `08e` sendiri TIDAK PERNAH menjadikan "mewarisi" sebagai KRITERIA UJI formal untuk menentukan hubungan Rule-Formula. Ditelusuri lebih jauh ke `08i` (Rule Ontology Validation) — di sana pembuktian Rule≠Formula dilakukan lewat cara BERBEDA: menguji apakah Rule dan Formula menempati LAYER YANG SAMA (`08i` § D Uji 2, hasilnya BERBEDA — Formula Layer 3+5, Rule Layer 5 murni) — bukan lewat "mewarisi properti". **Temuan: "inheritance sebagai alat uji" TIDAK PERNAH benar-benar didirikan sebagai prinsip CECEP di dokumen manapun — ia dipakai sekali secara naratif di `08e`, lalu saya (tanpa sadar) menganggapnya sebagai alat uji sah di § 6-7 dokumen ini. Founder benar — ini persis risiko yang disebut: membawa konsep OOP/UML ke Enterprise Ontology tanpa verifikasi.**

**Kenapa "inheritance/mewarisi properti" BERMASALAH sebagai alat uji ontologi CECEP secara prinsip (bukan hanya "belum pernah dibuktikan"):** Inheritance (OOP) mengasumsikan hierarki taksonomis (subclass mewarisi SEMUA properti superclass kecuali di-override) — TAPI CECEP secara eksplisit SUDAH MENOLAK pola hierarki semacam ini untuk hubungan ontologis-nya (Five Truth Layers bukan hierarki inheritance — Layer 5 tidak "mewarisi properti" dari Layer 3, ia MENGONSUMSI Layer 3, relasi consumption berbeda dari inheritance). Memakai "gagal mewarisi X" sebagai bukti "dua hal berbeda" diam-diam mengimpor asumsi bahwa hubungan antar konsep CECEP HARUS berbentuk hierarki inheritance — asumsi yang TIDAK PERNAH dinyatakan atau disahkan di mana pun dalam CECEP.

**Vonis: "Mewarisi/inheritance" DITOLAK sebagai alat uji ontologi CECEP.** Perlu alat uji yang lebih fundamental — dicari di § 9.

### 8.1 Mencari Alat Uji yang Sah — Apa yang SUDAH Terbukti Dipakai CECEP untuk Membedakan Dua Ontologi?

**Ditelusuri preseden nyata yang SUDAH berhasil membedakan dua konsep sepanjang CECEP (bukan diciptakan baru — dicari dari yang sudah terbukti bekerja):**

1. **Uji Layer (`08i` § D Uji 2):** Rule vs Formula dibedakan lewat "menempati Layer yang sama atau tidak" — Formula Layer 3+5, Rule Layer 5 murni. Ini alat uji STRUKTURAL (posisi dalam Five Truth Layers), bukan soal properti yang diwarisi.
2. **Uji Ownership/Boundary (`04` § 10, Orchestration Separation Principle):** Dua fungsi dibedakan lewat "siapa yang berwenang mengambil keputusan apa" — bukan soal properti yang dimiliki bersama.
3. **Uji Kontradiksi Definisi (dipakai berulang di § 6 dokumen ini sendiri, Kandidat 1-3):** Dua konsep dibedakan/disatukan lewat "apakah menyatukan/memisahkan mereka menciptakan KONTRADIKSI LOGIS terhadap definisi yang sudah dikunci" — ini alat uji yang PALING SERING benar-benar dipakai sepanjang CECEP (dipakai di `08g` § C untuk Computed vs Derived, dipakai di `08e` § A untuk menolak delapan kandidat ontologi Rule satu per satu).

**Pola yang ditemukan dari ketiganya:** CECEP TIDAK PERNAH membedakan dua konsep lewat "apa yang mereka wariskan satu sama lain" — CECEP SELALU membedakan lewat **(a) posisi struktural (Layer/Boundary) dan (b) ada-tidaknya kontradiksi logis kalau disatukan/dipisahkan.** Ini pola yang jauh lebih dekat ke **uji definisi formal (necessary & sufficient condition)** daripada ke inheritance OOP.

**Alat uji yang DISAHKAN untuk dipakai mulai sekarang (menggantikan "mewarisi"):** Dua konsep A dan B adalah entitas ontologis BERBEDA jika dan hanya jika ADA MINIMAL SATU properti P sedemikian sehingga **mengasumsikan A dan B memiliki nilai P yang SAMA menghasilkan kontradiksi logis terhadap definisi A atau B yang sudah dikunci** (bukan "B tidak memiliki fitur yang dipunyai A" — melainkan "MEMAKSA B memiliki nilai P yang sama dengan A akan merusak definisi B itu sendiri").

**Diuji ulang Kandidat 4 (§ 6) dengan alat uji yang BENAR ini, bukan "mewarisi":** Properti P = Determinism. Apakah MEMAKSA Integration memiliki Determinism yang SAMA dengan Orchestration menghasilkan kontradiksi? **Ya** — kalau Integration dipaksa deterministik, definisi kerja Integration (§ 2, "titik di mana jaminan CECEP TIDAK berlaku otomatis") menjadi SELF-CONTRADICTING (Integration yang deterministik berarti jaminannya TETAP berlaku, meniadakan alasan keberadaannya sendiri, lihat Q6 § 1). **Ini BUKAN "Integration gagal mewarisi Determinism"** (framing lama, ditolak) — **ini "memaksa Integration=Determinism MERUSAK DEFINISI Integration ITU SENDIRI"** (framing baru, sah). Kesimpulan praktisnya SAMA (Kandidat 4 tetap bertahan), tapi ALASANNYA sekarang berdiri di atas alat uji yang benar-benar sah untuk CECEP, bukan pinjaman OOP yang tidak terverifikasi.

---

## 9. Reverse Proof — Mencoba Menghancurkan Kandidat 4 (Sibling)

**Koreksi founder: satu kandidat tersisa BUKAN berarti benar — dicoba dihancurkan secara aktif, bukan diterima karena yang lain sudah gugur.**

**Asumsikan Kandidat 4 (sibling, Integration dan Orchestration dua fungsi berbeda sejajar di Layer 5) SALAH. Kalau salah, berarti sebenarnya mereka SATU fungsi yang sama (dengan variasi permukaan saja). Apa yang HARUS benar kalau itu terjadi, dan apakah itu menciptakan kontradiksi terhadap sesuatu yang sudah dikunci?**

**Konsekuensi kalau Integration = Orchestration (tanpa perbedaan hakiki):** Maka SATU struktur data Rule (`08a` § I: trigger/condition/action/failure_policy/timeout/version) HARUS cukup untuk merepresentasikan baik pemanggilan internal (CAP-008) maupun pemanggilan lintas-boundary (CAP-013) TANPA perbedaan perlakuan.

**Diuji terhadap Determinism (`08a` § M), yang berlaku UNTUK SEMUA Orchestration Rule tanpa kecuali (tidak ada klausa "kecuali kalau target eksternal" di § M):** Kalau Integration=Orchestration, maka Rule-001 (memanggil CAP-013) HARUS deterministik penuh sama seperti Rule-004 (memanggil sistem internal). **Tapi ini SUDAH TERBUKTI SALAH secara independen** — bukan oleh argumen di dokumen ini, tapi oleh `08k` § 8 (Replay Correctness, bagian dari Phase G yang SUDAH frozen SEBELUM Phase H dimulai): `08k` § 8 secara eksplisit membedakan "keputusan Rule deterministik" dari "hasil eksekusi CAP-013 tidak deterministik" — DAN ini LOLOS stress test tanpa perlu ACR. **Kalau Integration=Orchestration (Kandidat 4 salah), maka `08k` § 8 SEHARUSNYA sudah menemukan kontradiksi (Rule-001 melanggar § M) — tapi ia tidak, karena `08k` § 8 sendiri SUDAH secara implisit memperlakukan hasil CAP-013 berbeda dari hasil Capability internal.**

**Kesimpulan Reverse Proof:** Asumsi "Kandidat 4 salah" (Integration=Orchestration) berkontradiksi dengan bukti INDEPENDEN yang SUDAH ada sebelum Discovery ini ditulis (`08k` § 8, bagian dari Phase G yang frozen) — bukan hanya berkontradiksi dengan argumen yang saya susun sendiri di § 6-8 (yang bisa dicurigai bias konfirmasi). **Kandidat 4 BERTAHAN dari upaya penghancuran, dengan bukti yang datang dari LUAR proses penalaran dokumen ini sendiri** — ini jauh lebih kuat daripada sekadar "kandidat lain sudah gugur, jadi ini yang tersisa".

**Tapi... apakah `08k` § 8 sendiri bisa salah (dan kontradiksinya cuma terwariskan dari kesalahan lama)?** Diperiksa: `08k` § 8 sudah lolos Stress Test adversarial dan Freeze (`04` § 7, Progressive Freeze Chain) — mempertanyakannya sekarang butuh ACR formal terhadap Phase G yang frozen, bukan sekadar keraguan naratif. Tidak ada indikasi baru di Discovery ini yang memberi ALASAN KONKRET untuk ACR itu. Diterima sebagai baseline yang sah dipakai sebagai bukti eksternal.

---

## 10. Definisi Formal "Sibling" (Menggantikan Istilah Naratif)

**Koreksi founder: "sibling" masih bahasa manusia, bukan bahasa arsitektur — harus bisa dipakai lima tahun lagi tanpa bertanya balik ke sesi ini.**

**Dibangun dari alat uji yang SUDAH disahkan di § 8.1 (necessary & sufficient condition test terhadap kontradiksi, BUKAN inheritance):**

> **Dua konsep ontologis A dan B, yang SAMA-SAMA menempati posisi struktural yang sama dalam Five Truth Layers (`04` § 8), disebut SIBLING jika dan hanya jika: (1) TIDAK ADA relasi kepemilikan/ownership antara keduanya (A tidak memiliki B, B tidak memiliki A — diuji lewat Orchestration Separation Principle, `04` § 10), DAN (2) ADA MINIMAL SATU properti P yang bernilai berbeda dan TIDAK BISA disamakan tanpa merusak definisi salah satu dari mereka (diuji lewat alat uji kontradiksi § 8.1), DAN (3) KEDUANYA secara independen diperlukan untuk menjelaskan Layer yang sama secara utuh (menghapus salah satu meninggalkan celah yang tidak bisa diisi oleh yang lain).**

**Diuji formal terhadap Integration-Orchestration:**
1. **Ownership:** Orchestration tidak memiliki Integration (Orchestration Separation Principle, `04` § 10, sudah menegaskan "memiliki peran orkestrasi tidak pernah memberi hak kepemilikan domain manapun" — berlaku simetris). Integration juga tidak memiliki Orchestration (Integration tidak pernah didefinisikan mengatur KAPAN/URUTAN, itu tetap domain Orchestration). **LOLOS.**
2. **Properti berbeda tak-tersamakan:** Determinism — diuji tuntas § 8.1 dan § 9 (Reverse Proof), dikonfirmasi dengan bukti eksternal `08k` § 8. **LOLOS.**
3. **Sama-sama diperlukan untuk Layer 5 utuh:** Kalau HANYA Orchestration ada (tanpa Integration), Layer 5 tidak punya cara menjelaskan Rule-001/002/003 memanggil CAP-013 (targetnya bukan capability frozen — di luar cakupan definisi Orchestration § A `08a`). Kalau HANYA Integration ada (tanpa Orchestration), Layer 5 tidak punya cara menjelaskan KAPAN/URUTAN Rule-004 memanggil sistem Notifikasi internal (murni pertanyaan timing, bukan pertanyaan kepercayaan). **LOLOS — keduanya diperlukan, tidak ada yang bisa menyerap fungsi lainnya.**

**Status: Integration dan Orchestration LOLOS definisi formal Sibling di atas pada ketiga syarat.** Definisi ini sekarang bisa dipakai untuk menguji pasangan konsep LAIN di masa depan (AI vs Integration, Observability vs Orchestration, dst.) tanpa perlu bertanya balik ke sesi ini — cukup jalankan tiga syarat yang sama.

---

## 11. Ontology Relation Discovery — Mundur Satu Anak Tangga (Koreksi Founder)

**Koreksi founder: § 10 melompat langsung dari "Integration punya relasi dengan Orchestration" ke "relasinya adalah Sibling" — TANPA pernah bertanya lebih dulu "jenis relasi apa saja yang DIIZINKAN antar ontologi di CECEP?" Ditelusuri: Constitution (`04`) TIDAK PERNAH mendaftar kelas relasi secara sistematis — yang ada hanya penanganan kasus SPESIFIK (Decision Hierarchy `04` § 9 untuk konflik, Orchestration Separation `04` § 10 untuk ownership) — tidak ada satu pun Discovery yang bertanya "apa RUANG KEMUNGKINAN relasi ontologis di CECEP secara keseluruhan". Founder benar — ini lompatan nyata, bukan kehati-hatian berlebihan.**

**Metodologi: didaftar dulu kandidat relasi yang PERNAH benar-benar terjadi/dipakai di CECEP (bukan mengarang dari textbook), lalu diuji satu per satu apakah relasi itu SAH secara struktural terhadap Five Truth Layers.**

### 11.1 Inventarisasi Relasi yang SUDAH Ada di CECEP (Sebelum Menguji, Bukan Mengarang)

Ditelusuri MUNDUR ke seluruh dokumen frozen A-G untuk relasi antar konsep yang SUDAH benar-benar dipakai (bukan hipotetis):

| Relasi yang ditemukan | Contoh nyata di CECEP | Sumber |
|---|---|---|
| **Ownership** (A memiliki B) | CAP-008 memiliki Estimate Version (Aggregate Root) | `07` § D |
| **Consumption** (A mengonsumsi B, tanpa memiliki) | Layer 5 mengonsumsi Layer 2-4 | `04` § 8 |
| **Composition/Trigger** (A memicu B) | Rule A memicu Rule B (`08a` § O) | `08a` § O |
| **Derivation** (A diturunkan dari B) | Derived Data diturunkan dari sumber internal | `07` § A |
| **Override/Priority** (A menang atas B dalam konteks sama) | Scope Resolution, Rule paling spesifik menang | `08a` § Q |
| **Constraint** (A membatasi ruang gerak B tanpa memiliki B) | Constitution membatasi semua fase tanpa "memiliki" fase manapun | `04` (keseluruhan) |
| **Projection** (A adalah tampilan/proyeksi dari B, bukan entitas independen) | Rule Group adalah VIEW atas Rule-Rule yang ada, bukan Aggregate Root baru (`08e` § C) | `08e` § C |
| **Sibling/Co-tenancy** (A dan B menempati posisi struktural sama, tidak saling memiliki) | *diklaim* untuk Integration-Orchestration, § 10 — TAPI ini justru klaim yang SEDANG diuji, tidak boleh dipakai sebagai bukti dirinya sendiri |

**Diperiksa: apakah kedelapan ini SEMUA relasi yang mungkin, atau baru yang KEBETULAN sudah dipakai?** Diuji dengan daftar founder (Equivalent/Independent/Dependent/Symbiotic/Projection/Realization/Constraint/Observer/Producer/Consumer) satu per satu terhadap delapan yang sudah ditemukan:

- **Equivalent** — BELUM pernah dipakai CECEP secara eksplisit (tidak ada dua konsep yang pernah dinyatakan "identik/sama"). **Kandidat relasi baru, perlu diuji apakah SAH secara struktural.**
- **Independent** — BELUM eksplisit dinyatakan sebagai KATEGORI relasi (meski secara implisit banyak pasangan Capability independen satu sama lain, `05` Dependency Matrix). **Kandidat relasi baru.**
- **Dependent** — sudah tercakup oleh Composition/Trigger dan Consumption di atas — TIDAK perlu kategori terpisah.
- **Symbiotic** — diperiksa: apakah ada relasi di CECEP di mana DUA konsep saling BUTUH tapi tidak saling MEMILIKI, LEBIH KUAT dari sekadar Sibling co-tenancy? Diuji terhadap Rule-Formula (`08e` § B) — Rule memanggil Formula (lewat CAP-006, tidak langsung), Formula TIDAK memanggil balik Rule. **Ini bukan Symbiotic (yang mengasumsikan hubungan DUA ARAH saling butuh) — ini SATU ARAH (Rule butuh Formula, Formula tidak butuh Rule).** Symbiotic TIDAK ditemukan preseden nyatanya di CECEP — dicatat TIDAK ADA BUKTI, bukan didaftar sebagai relasi sah.
- **Projection** — SUDAH ditemukan (Rule Group, di atas).
- **Realization** — diperiksa: adakah konsep ABSTRAK yang "direalisasikan" konsep KONKRET di CECEP? Formula Definition (abstrak, versioned) "direalisasikan" oleh eksekusi Formula pada satu Estimate (konkret, satu kali jalan) — **preseden ditemukan, mirip pola Rule Definition vs Rule Execution Instance (`08k` § 9, idempotency_key)**. **Kandidat relasi baru, layak diuji.**
- **Constraint** — SUDAH ditemukan (Constitution terhadap semua fase, di atas).
- **Observer** — diperiksa: adakah A yang mengamati B tanpa memanggil/memiliki? Monitoring Rule (`08d` § A.10) — TAPI Monitoring Rule sudah DIKELUARKAN dari cakupan Orchestration (`08d` § C, `08e` § C: "kemungkinan besar bukan Orchestration Rule sama sekali, domain Observability"). **Preseden ADA tapi statusnya "di luar cakupan yang sudah dikunci"** — dicatat sebagai kandidat relasi yang exist tapi belum masuk domain manapun yang sudah frozen.
- **Producer/Consumer** — SUDAH eksplisit sebagai bagian Canonical Information Contract (`07` § C, dua dari 11 elemen: Producers, Consumers). **Preseden kuat, relasi SAH.**

### 11.2 Menguji Kandidat Baru (Equivalent, Independent, Realization) Terhadap Struktur CECEP

**Equivalent — diuji terhadap Five Truth Layers:** Bisakah dua konsep di Layer yang sama benar-benar EQUIVALENT (bukan sekadar sibling, tapi identik penuh — bisa saling menggantikan tanpa kehilangan apa pun)? Diuji lewat contoh potensial: apakah Orchestration dan Choreography (`08a` § B) equivalent? **Tidak** — CECEP sudah eksplisit menyatakan keduanya BEDA fungsi (Orchestration = konduktor eksplisit, Choreography = reaksi independen) meski SAMA-SAMA valid di Layer 5. **Equivalent SAH sebagai kategori relasi (secara struktural mungkin ada), TAPI belum ditemukan SATU PUN pasangan konsep di CECEP yang benar-benar mengisinya** — dicatat sebagai relasi yang MUNGKIN ada, belum ada instance-nya.

**Independent — diuji:** Bisakah dua konsep di Layer sama TIDAK punya relasi apa pun (benar-benar terpisah, tidak saling constraint/consume/derive)? Diuji: CAP-001 (Identity Engine) dan CAP-006 (Calculation Engine) — apakah keduanya Independent? **Tidak sepenuhnya** — Dependency Matrix (`05` § F) mencatat SEMUA Capability punya setidaknya SATU relasi tercatat dengan Capability lain (bahkan kalau hanya lewat Orchestration yang memanggil keduanya). **Independent murni (relasi NOL) BELUM ditemukan preseden nyatanya di CECEP** — mengonfirmasi bahwa Progressive Freeze Chain (`04` § 7) secara desain MEMANG tidak mengizinkan konsep yang benar-benar terisolasi (semua bagian arsitektur harus terhubung ke sesuatu, langsung atau tidak).

**Realization — diuji lebih dalam:** Apakah relasi ini BEDA dari Composition/Trigger yang sudah ada? **Ya — beda arah waktu.** Composition/Trigger adalah relasi ANTAR DEFINISI (Rule A memicu Rule B, keduanya definisi statis). Realization adalah relasi ANTARA definisi ABSTRAK dan SATU KEJADIAN KONKRET (Formula Definition vs satu eksekusi Formula). **Ini relasi SAH dan BERBEDA dari delapan yang sudah ada** — layak masuk daftar resmi.

### 11.3 Daftar Resmi Ontology Relation CECEP (Hasil Discovery, Bukan Daftar Tertutup Selamanya)

| # | Relasi | Definisi Singkat | Preseden |
|---|---|---|---|
| 1 | **Ownership** | A memiliki siklus hidup dan hak ubah eksklusif atas B | `07` § D (Capability↔Aggregate) |
| 2 | **Consumption** | A membaca/memakai B tanpa memiliki, B tidak berubah karena A | `04` § 8 (Layer 5 ↔ Layer 2-4) |
| 3 | **Composition/Trigger** | A memicu eksekusi B sebagai bagian rangkaian | `08a` § O |
| 4 | **Derivation** | A dihasilkan sepenuhnya dari B, tidak independen | `07` § A |
| 5 | **Override/Priority** | A dan B bersaing dalam konteks sama, satu menang berdasarkan aturan eksplisit | `08a` § Q |
| 6 | **Constraint** | A membatasi ruang gerak B tanpa memiliki/mengonsumsi B | `04` (Constitution ↔ semua fase) |
| 7 | **Projection** | A adalah tampilan/proyeksi dinamis atas B, bukan entitas independen | `08e` § C (Rule Group) |
| 8 | **Producer/Consumer** | A menghasilkan sesuatu yang dipakai B, arah aliran informasi eksplisit | `07` § C |
| 9 | **Realization** | A (abstrak, definisi) diwujudkan oleh B (konkret, satu kejadian/eksekusi) | Formula Definition ↔ eksekusi; Rule Definition ↔ Rule Execution Instance |
| 10 | **Sibling/Co-tenancy** | A dan B menempati posisi struktural sama (Layer sama), tidak ada relasi 1-9 di atas antara keduanya, tapi keduanya sama-sama diperlukan untuk kelengkapan Layer itu | *Dites ulang untuk Integration-Orchestration di § 11.4* |

**Equivalent dan Independent DICATAT sebagai relasi yang secara struktural MUNGKIN ada, tapi TIDAK PUNYA instance nyata di CECEP saat ini** — tidak dihapus dari kemungkinan, tapi tidak dimasukkan daftar resmi karena belum terbukti dipakai.

### 11.4 Menguji Ulang Integration-Orchestration Terhadap SELURUH Sepuluh Relasi (Bukan Langsung Sibling)

**Disiplin: sebelum menerima Sibling, dibuktikan dulu relasi 1-9 SEMUANYA tidak cocok — bukan diasumsikan gugur begitu saja.**

1. Ownership — sudah diuji tuntas § 10 lama (dan Orchestration Separation Principle `04` § 10 secara eksplisit): TIDAK ADA yang memiliki yang lain. **Tidak cocok.**
2. Consumption — apakah Integration mengonsumsi Orchestration atau sebaliknya? Diuji: Integration TIDAK membaca "isi" Orchestration sebagai sumber datanya, dan sebaliknya. **Tidak cocok.**
3. Composition/Trigger — apakah Orchestration Rule "memicu" Integration, atau sebaliknya? Diuji: Rule (Orchestration) MEMANGGIL CAP-013 (Integration) sebagai ACTION — ini TERLIHAT seperti Trigger. **Diperiksa dalam lebih tajam:** Trigger (relasi 3) didefinisikan sebagai "A memicu B SEBAGAI BAGIAN RANGKAIAN" — antara Rule dan Rule lain, keduanya OBJEK YANG SAMA JENISNYA (sama-sama Rule Definition, `08a` § O). Rule memanggil CAP-013 BUKAN memicu "Integration Rule" lain — ia memanggil FUNGSI Integration itu sendiri. **Ini relasi Producer/Consumer (Rule adalah Consumer yang memakai fungsi Integration sebagai Producer batas-jaminan) BUKAN Trigger antar-Rule.** Dicatat sebagai temuan baru: Orchestration mengonsumsi Integration lewat pola Producer/Consumer (relasi 8), TAPI ini relasi tentang BAGAIMANA MEREKA BERINTERAKSI SAAT DIPANGGIL, bukan tentang APA HUBUNGAN ONTOLOGIS keduanya SEBAGAI KATEGORI (pertanyaan yang berbeda level — lihat klarifikasi § 11.5).
4. Derivation — apakah Integration diturunkan sepenuhnya dari Orchestration (atau sebaliknya)? Diuji: definisi kerja Integration (§ 2) TIDAK bisa diturunkan dari definisi Orchestration (`08a` § A) — sudah dibuktikan tuntas di Kandidat 2 (§ 6, gugur). **Tidak cocok.**
5. Override/Priority — apakah keduanya bersaing dalam konteks yang sama? Diuji: tidak ada konteks di mana Orchestration dan Integration "bersaing" untuk menang — mereka beroperasi di TITIK BERBEDA (internal vs batas). **Tidak cocok.**
6. Constraint — apakah salah satu membatasi ruang gerak yang lain? Diuji: Orchestration Separation Principle (`04` § 10) membatasi KEDUANYA secara simetris (tidak ada yang boleh mengklaim ownership atas domain lain) — TAPI ini Constitution yang membatasi KEDUANYA, bukan salah satu membatasi yang lain. **Tidak cocok sebagai relasi ANTARA keduanya** (constraint-nya datang dari LUAR, dari Constitution, bukan dari salah satu ke yang lain).
7. Projection — apakah salah satu adalah tampilan dinamis atas yang lain (seperti Rule Group atas Rule-Rule)? Diuji: Integration tidak "menampilkan" data dari Orchestration atau sebaliknya — keduanya adalah FUNGSI, bukan data yang bisa diproyeksikan. **Tidak cocok.**
8. Producer/Consumer — SUDAH ditemukan cocok di poin 3 di atas, TAPI untuk INTERAKSI SAAT DIPANGGIL, bukan untuk KATEGORI ONTOLOGIS keduanya (klarifikasi § 11.5 di bawah menjelaskan kenapa dua level ini berbeda).
9. Realization — apakah salah satu adalah versi konkret dari yang lain? Diuji: Integration bukan "eksekusi konkret" dari Orchestration (mereka bukan definisi-vs-kejadian, keduanya sama-sama KATEGORI). **Tidak cocok.**

**Hasil: relasi 1, 2, 4, 5, 6, 7, 9 semuanya TIDAK COCOK secara eksplisit diuji (bukan diasumsikan). Relasi 8 (Producer/Consumer) COCOK tapi pada LEVEL YANG BERBEDA dari pertanyaan "apa kategori ontologis mereka" — ini klarifikasi penting, bukan jawaban langsung.**

### 11.5 Klarifikasi Dua Level Pertanyaan (Ditemukan Selama Pengujian § 11.4)

**Temuan penting yang BELUM eksplisit sebelumnya:** Ada DUA pertanyaan berbeda yang sebelumnya tercampur:

- **Level Interaksi** ("bagaimana mereka berhubungan SAAT beroperasi") — di level ini, Orchestration-Integration punya relasi **Producer/Consumer** (Rule sebagai Consumer memanggil fungsi Integration sebagai Producer batas-jaminan). Ini SAH dan sudah terverifikasi.
- **Level Kategori** ("apa KEDUDUKAN ontologis mereka relatif satu sama lain sebagai KONSEP, terlepas dari kapan mereka saling memanggil") — di level INI, sembilan relasi 1-9 semuanya gugur (§ 11.4), menyisakan HANYA relasi ke-10 (Sibling/Co-tenancy) sebagai satu-satunya yang belum diuji gugur.

**Ini sekaligus MENJAWAB kekhawatiran founder secara langsung:** "Sibling" TIDAK diterima karena kebetulan satu-satunya yang terpikirkan — ia diterima karena SEMBILAN relasi lain yang SUDAH terbukti benar-benar dipakai di CECEP (bukan dikarang) SATU PER SATU diuji dan gugur secara eksplisit pada level kategori yang tepat, MESKI salah satu darinya (Producer/Consumer) tetap valid di level interaksi yang berbeda.

---

## 12. Ontology Test — Melengkapi dengan Test of Equivalence

**Koreksi founder kedua: alat uji § 8.1 (kontradiksi-jika-disamakan) hanya membuktikan ARAH "berbeda" — belum ada arah "sama". Sebuah A yang GAGAL dibuktikan berbeda dari B belum tentu berarti A=B (bisa jadi alat ujinya kurang tajam, bukan berarti mereka identik).**

**Dicari: apa yang MEMBUKTIKAN dua konsep SAMA di CECEP (bukan sekadar "gagal dibuktikan beda")?**

**Diuji lewat preseden nyata — kapan CECEP PERNAH menyatakan dua hal SAMA/EQUIVALENT?** Ditelusuri: Rule Template dan Rule Instance (`08f` § C) — SEBELUM diisi parameter, sebuah Instance "identik" dengan Template-nya (semua field sama KECUALI parameter). **Pola yang ditemukan:** CECEP menyatakan dua hal SAMA ketika **SETIAP properti yang didefinisikan salah satu, PUNYA PADANAN PERSIS di yang lain, DENGAN NILAI YANG SAMA — TANPA SISA** (tidak ada properti di A yang tidak ada padanannya di B, dan sebaliknya).

**Alat uji Test of Equivalence (melengkapi § 8.1, sisi yang hilang):**

> **Dua konsep A dan B dinyatakan EQUIVALENT jika dan hanya jika: untuk SETIAP properti P yang dimiliki A, ADA properti P' di B dengan nilai yang SECARA LOGIS SAMA (bukan mirip), DAN sebaliknya — TANPA ADA SATU PUN properti yang eksklusif milik salah satu (no residual property).**

**Diuji terhadap Integration-Orchestration dengan Test of Equivalence (bukan Test of Difference lagi):**

- Orchestration punya properti Determinism (§ M `08a`) sebagai jaminan MUTLAK. Apakah Integration punya padanan PERSIS (bukan mirip)? **Tidak** — Integration secara definisi (§ 2) TIDAK bisa menjamin determinism yang sama. **Ditemukan RESIDUAL PROPERTY** (properti Orchestration yang TIDAK punya padanan di Integration) → **GAGAL Test of Equivalence.**
- Integration punya properti "Determinism Boundary" (§ 0.A, batas eksplisit di mana jaminan berhenti) sebagai konsep INTI. Apakah Orchestration punya padanan? **Tidak** — Orchestration (§ A `08a`) tidak punya konsep "batas di mana jaminannya berhenti", karena menurut definisinya jaminannya SELALU berlaku penuh (targetnya selalu frozen). **Residual property KEDUA ditemukan, arah sebaliknya.**

**Hasil: Integration-Orchestration GAGAL Test of Equivalence pada KEDUA ARAH (masing-masing punya residual property yang tidak dimiliki yang lain) — dua kegagalan independen, bukan satu.** Ini BERBEDA secara metodologis dari kesimpulan § 8-10 (yang hanya membuktikan "gagal disamakan tanpa kontradiksi") — sekarang terbukti LEWAT JALUR TERPISAH (mencari padanan lengkap, bukan mencari kontradiksi) dengan hasil KONSISTEN: mereka bukan konsep yang sama.

**Kenapa dua alat uji yang menghasilkan kesimpulan sama ini penting (bukan redundan):** Test of Difference (§ 8.1) dan Test of Equivalence (§ 12) menguji dari ARAH BERLAWANAN — satu mencari kontradiksi kalau dipaksa sama, satu mencari padanan lengkap. Kalau HANYA satu yang dijalankan, ada risiko alat ujinya sendiri yang bias (mis. Test of Difference yang terlalu longgar bisa menyatakan "berbeda" pada pasangan yang sebenarnya sama, kalau kontradiksinya cuma imajiner). **Dua alat uji yang independen, sampai pada kesimpulan yang SAMA, adalah bukti jauh lebih kuat daripada satu alat uji yang dijalankan dua kali.**

---

## Assumptions

1. Definisi kerja § 2 diasumsikan CUKUP UNIVERSAL berdasarkan enam skenario Universality Test (§ 3) — bukan klaim ekshaustif.
2. Q1-Q6 (§ 1) diasumsikan sudah mencapai titik mentok yang genuine — penilaian subjektif, terbuka untuk lapisan lebih dalam kalau founder melihatnya.
3. Sepuluh relasi (§ 11.3) diasumsikan CUKUP untuk kebutuhan CECEP saat ini — Equivalent dan Independent dicatat sebagai relasi struktural MUNGKIN tapi belum punya instance; kalau kelak ditemukan instance nyata, mereka naik status jadi relasi resmi tanpa perlu ACR (murni penambahan katalog, bukan perubahan definisi yang sudah ada).
4. Test of Equivalence (§ 12) diasumsikan CUKUP sebagai sisi kedua dari Ontology Test — kalau ditemukan pasangan konsep yang lolos Equivalence tapi GAGAL Difference (atau sebaliknya, kontradiktif satu sama lain), itu sinyal salah satu alat uji perlu direvisi, bukan diabaikan.
5. Reverse Proof (§ 9) tetap mengandalkan `08k` § 8 sebagai bukti eksternal — sekarang DIPERKUAT independen oleh Test of Equivalence (§ 12) yang mencapai kesimpulan sama lewat jalur berbeda, mengurangi (tapi tidak menghilangkan) risiko rantai kalau `08k` § 8 kelak di-ACR untuk alasan lain.

## Open Questions

1. Temuan § 3 bahwa definisi Integration secara alami mencakup interaksi manusia murni — apakah WAJIB masuk cakupan Phase H atau sengaja dipersempit?
2. Verifikasi FAKTA (bukan ontologis): bentuk konkret sistem yang dimaksud Orchestration Gap-1/Gap-2 (`07c`) — murni pertanyaan empiris untuk founder.
3. Padanan Composition/Priority/Scope untuk Integration — sekarang punya kerangka BENAR untuk diuji (sepuluh relasi § 11.3 + dua alat uji § 8.1/§ 12), tapi belum DIJALANKAN satu per satu untuk setiap properti Orchestration lainnya (baru Determinism yang diuji tuntas). Dicatat sebagai pekerjaan lanjutan Discovery yang WAJIB sebelum Design H, bukan diasumsikan dari kesimpulan Determinism saja.
4. Apakah katalog sepuluh relasi (§ 11.3) perlu diusulkan sebagai bagian Constitution (mengingat sifatnya berlaku lintas-fase, bukan spesifik Phase H) — diuji dulu lewat tes "Batas Constitution" (`04`) dan "Constitution Freeze" (`04` § 17, tes "tanpa ini apakah CECEP bisa rusak?") sebelum diusulkan, BUKAN otomatis diusulkan hanya karena kedengarannya penting (disiplin yang baru saja dikunci).

## 13. Penutup Meta-Discovery — Fondasi Cukup, Lanjut ke Substansi Integration

**Koreksi founder: empat putaran meta-discovery (§ 0-12) sudah cukup — melanjutkan discovery TENTANG discovery (Ontology Relation, Test Equivalence) adalah Analysis Loop, bertentangan langsung dengan Discovery Completion Rule (`04` § 15) dan Discovery Granularity Rule (`04` § 16) yang dibangun sendiri untuk mencegah ini.**

**Dijalankan Discovery Completion Test terhadap sisa Open Question § 12 (bukan diabaikan, DIUJI eksplisit satu kali lagi sebelum ditutup):**

| Open Question tersisa | Five Truth Layers? | Ownership? | Replay? | Contract? | Version? | Structure? | Vonis |
|---|---|---|---|---|---|---|---|
| #1 cakupan interaksi manusia murni | Tidak | Tidak | Tidak | Tidak | Tidak | Tidak | Deferred Refinement |
| #3 padanan Composition/Priority untuk Integration | Tidak | Tidak | Tidak | Tidak | Tidak | Tidak | Deferred Refinement — dijawab LANGSUNG di dalam Discovery substansi § 14 di bawah, bukan sub-discovery terpisah |
| #4 katalog 10 relasi masuk Constitution? | Tidak | Tidak | Tidak | Tidak | Tidak | Tidak | Deferred Refinement — sudah lolos tes "tanpa ini apakah CECEP rusak? Tidak" (`04` § 17), TETAP di `14`, tidak diusulkan ke `04` |

**Semua Deferred. Meta-discovery Integration-Orchontology DITUTUP di sini.** Open Question #2 (bentuk faktual sistem Puraloka Suite) TETAP terbuka sebagai pertanyaan empiris — bukan meta-discovery, akan dijawab lewat verifikasi langsung saat dibutuhkan di § 14, bukan ditunda tanpa batas.

---

## 14. Discovery Substansi — Apa Itu Integration di Dalam CECEP (Bukan Lagi Relasinya dengan Orchestration)

**Titik mulai yang benar, sesuai koreksi founder: bukan lagi "apa hubungan Integration dengan Orchestration" (sudah tuntas § 6-12) — sekarang "apa itu Integration" sebagai fungsi berdiri sendiri, cukup dalam untuk menjawab delapan item `10` § 4.**

### 14.1 Bentuk-Bentuk Integration — Diuji dari Definisi Kerja (§ 2), Bukan dari Teknologi

**Definisi kerja (§ 2) sudah lolos Universality Test terhadap enam mekanisme (API/polling/CSV/shared-DB/email/manual). Sekarang ditanya: apa yang SAMA di keenamnya, yang bisa dijadikan STRUKTUR (bukan daftar mekanisme)?**

Pola yang muncul di keenamnya (ditelusuri ulang dari § 3): setiap bentuk Integration punya TIGA elemen yang selalu ada, terlepas mekanismenya —

1. **Titik Serah (Handoff Point)** — momen persis CECEP berhenti mengendalikan (menulis file, memanggil API, menyerahkan ke manusia).
2. **Jendela Ketidakpastian (Uncertainty Window)** — rentang antara Titik Serah dan momen CECEP tahu APA yang terjadi setelahnya (bisa nol/instan untuk API sinkron, bisa tak terhingga untuk email yang tak pernah dibalas).
3. **Mekanisme Rekonsiliasi (Reconciliation)** — cara CECEP AKHIRNYA tahu (atau memutuskan berhenti menunggu tahu) apa yang terjadi setelah Titik Serah — bisa berupa response langsung (API sinkron), callback/webhook, polling berkala, atau tidak pernah (manual, dianggap selesai begitu diserahkan).

**Diuji (Universality Test ulang, cepat) — apakah tiga elemen ini bertahan di skenario yang BELUM diuji sebelumnya, mis. Message Queue (async, broker di tengah)?** Titik Serah = saat pesan dipublish ke broker. Uncertainty Window = antara publish dan ack (atau tak terhingga kalau broker sendiri gagal). Reconciliation = ack dari broker, atau dead-letter kalau gagal. **Bertahan.**

**Kesimpulan: Integration, sebagai fungsi, SELALU terdiri dari (Titik Serah, Uncertainty Window, Reconciliation) — tiga elemen wajib, terlepas mekanisme konkretnya.** Ini adalah STRUKTUR ONTOLOGIS Integration (bukan bergantung teknologi), yang langsung bisa dipakai menjawab beberapa item `10` § 4:

### 14.2 Menjawab Langsung: Delivery Guarantee (Item 6, `10` § 4)

**Koreksi founder: klaim "Delivery Guarantee bergantung pada Reconciliation" ditulis sebagai kesimpulan tanpa diuji terhadap kandidat penyebab lain — diserang ulang di sini.**

**Kandidat penyebab yang diuji (bukan hanya Reconciliation):** Transport, Storage, Acknowledgement, Retry Policy, Idempotency, Ordering, Reconciliation.

**Diuji satu per satu — mana yang benar-benar MENENTUKAN kelas guarantee (exactly-once/at-least-once/at-most-once/none), dan mana yang hanya MEMPENGARUHI keberhasilan mencapainya:**

- **Transport** (bagaimana data secara fisik berpindah — jaringan, disk, dst.) — diperiksa: transport BISA gagal (paket hilang, disk corrupt), tapi kegagalan transport murni menghasilkan "at-most-once atau kurang" TERLEPAS dari mekanisme lain — ini FAKTOR RISIKO, bukan penentu kelas guarantee. Transport yang sempurna tidak OTOMATIS memberi exactly-once (masih butuh cara tahu itu terjadi).
- **Storage** (apakah data yang dikirim disimpan durable di titik penerima) — sama, faktor risiko (storage yang gagal berarti data hilang meski transport sukses), bukan penentu kelas.
- **Acknowledgement** (apakah ada sinyal balik "sudah diterima") — diperiksa lebih dalam: **Ack ADALAH bentuk KONKRET dari Reconciliation** (§ 14.1 elemen 3 sudah eksplisit menyebut "response langsung/callback/webhook/polling" sebagai variasi Reconciliation, dan Ack adalah salah satu variasi itu). **Bukan penyebab terpisah — sub-kategori dari Reconciliation.**
- **Retry Policy** (berapa kali/kapan mencoba ulang) — diperiksa: Retry MENGUBAH probabilitas keberhasilan (menaikkan peluang delivery akhirnya terjadi), TAPI Retry sendiri TIDAK BISA membedakan "berhasil pertama kali" dari "berhasil setelah retry, dan yang pertama sebenarnya juga berhasil tapi ack-nya hilang" (KECUALI ada cara mendeteksi duplikat — yang berarti kembali ke Idempotency/Reconciliation). **Retry Policy MEMPENGARUHI keberhasilan mencapai guarantee, TIDAK MENENTUKAN kelasnya.**
- **Idempotency** (apakah operasi yang sama dijalankan ulang aman) — diperiksa: Idempotency adalah SYARAT NECESSARY untuk mencapai exactly-once ketika Transport tidak sempurna (retry bisa terjadi) — TAPI Idempotency sendirian, TANPA cara mendeteksi "ini pengulangan", tidak berguna. Idempotency butuh KUNCI PEMBANDING (`08k` § 9, idempotency_key) yang HANYA bisa dicocokkan lewat mekanisme Reconciliation (harus ADA cara membandingkan eksekusi sekarang dengan yang sebelumnya — itu SENDIRI adalah bentuk Reconciliation). **Idempotency adalah PRASYARAT TEKNIS, bekerja BERSAMA Reconciliation, bukan penyebab independen.**
- **Ordering** (apakah urutan pengiriman dijamin sama dengan urutan penerimaan) — diperiksa: Ordering adalah DIMENSI TERPISAH dari Delivery Guarantee (bisa exactly-once TAPI out-of-order, atau at-least-once TAPI ordered) — ini BUKAN penyebab Delivery Guarantee, ia adalah SUMBU KUALITAS LAIN yang independen, salah kalau dicampur ke pertanyaan yang sama.
- **Reconciliation** (§ 14.1 elemen 3) — diperiksa ulang dengan kandidat lain sudah gugur/tersubordinasi: Reconciliation adalah SATU-SATUNYA elemen yang punya kuasa MENENTUKAN (bukan mempengaruhi probabilitas) apakah CECEP BISA MENGETAHUI status akhir sebuah Titik Serah — dan pengetahuan itulah yang membedakan "exactly-once yang bisa DIBUKTIKAN" dari "at-most-once yang cuma DIHARAPKAN".

**Kesimpulan setelah diuji ulang (BUKAN sekadar mengulang klaim lama):** Transport/Storage adalah faktor risiko dasar. Retry Policy meningkatkan probabilitas. Idempotency adalah prasyarat teknis yang BEKERJA SAMA dengan Reconciliation (bukan berdiri sendiri). Ordering adalah sumbu kualitas independen di luar pertanyaan ini. **Ack terbukti adalah SUB-KATEGORI Reconciliation, bukan kandidat tandingan.** Klaim awal ("Delivery Guarantee bergantung pada Reconciliation") **BERTAHAN setelah diuji terhadap enam kandidat pesaing** — tapi sekarang dengan kejelasan TAMBAHAN yang sebelumnya tidak eksplisit: Reconciliation adalah penyebab yang MENENTUKAN kelas guarantee, sementara Transport/Storage/Retry hanya mempengaruhi PROBABILITAS mencapainya, dan Idempotency adalah PRASYARAT yang menyatu dengan Reconciliation (bukan penyebab terpisah), Ordering di luar pertanyaan ini sama sekali.

### 14.3 Menjawab Langsung: Padanan Composition/Priority untuk Integration (Open Question #3 lama)

**Koreksi founder: "State Machine per Titik Serah" ditulis sebagai kesimpulan langsung — seharusnya kandidat yang diuji lebih dulu terhadap pesaing, bukan otomatis dipilih.**

**Delapan kandidat model representasi diuji (bukan hanya State Machine):** State Machine, Petri Net, Process Graph, Token Flow, Saga Graph, Transition System, Temporal Logic, Promise/Future, Event Automata.

**Kriteria uji (diturunkan dari kebutuhan NYATA yang sudah ditemukan § 14.1, bukan preferensi):** Model yang dipilih harus (a) merepresentasikan SATU Titik Serah dengan status yang berubah dari waktu ke waktu, (b) mengakomodasi Uncertainty Window yang bisa NOL sampai TIDAK TERHINGGA, (c) TIDAK mengasumsikan Reconciliation selalu ada (harus valid untuk kasus "tidak pernah ada Reconciliation", § 15.5 USB), (d) kompatibel dengan pola yang SUDAH dikunci di Layer Orchestration (Rule trigger pada `system_signal`, `08e` § D) tanpa memaksa ACR.

- **Token Flow / Petri Net** — diperiksa: dirancang untuk MERELASIKAN banyak proses konkuren dengan token berpindah antar tempat (place) — kekuatannya di SINKRONISASI ANTAR BANYAK proses. Tapi kebutuhan di sini adalah representasi SATU Titik Serah individual, bukan jaringan proses. **Overkill — solusi untuk masalah yang lebih besar dari yang dihadapi.**
- **Saga Graph** — diperiksa: SUDAH ditolak sebagai MODEL INTI sejak Philosophy G (`08a` § B — "Saga adalah salah satu TEKNIK yang dipakai, bukan model itu sendiri"). Memaksanya di sini akan bertentangan dengan preseden yang sudah dikunci. **Gugur — kontradiksi dengan keputusan frozen.**
- **Process Graph / BPMN-like** — diperiksa: SUDAH ditolak eksplisit sebagai model inti CECEP sejak Philosophy G (`08a` § B, alasan sama: "Orchestration Rule adalah KONFIGURASI DATA, bukan diagram proses"). Prinsip yang sama berlaku untuk Integration (turunan langsung First Principle 4, `04` § 4). **Gugur — kontradiksi dengan keputusan frozen.**
- **Temporal Logic** — diperiksa: kuat untuk MEMBUKTIKAN properti (mis. "akhirnya akan tercapai status X") tapi TIDAK didesain sebagai model DATA yang disimpan/dieksekusi (ia bahasa VERIFIKASI, bukan representasi runtime). CECEP butuh representasi yang bisa DISIMPAN sebagai Configuration Data (§ I `08a` pola) — Temporal Logic bukan bentuk itu. **Gugur — salah kategori (alat verifikasi, bukan model data).**
- **Promise/Future** — diperiksa: pola pemrograman untuk MENUNGGU satu hasil asinkron — TAPI secara eksplisit TIDAK punya konsep native untuk "tidak akan pernah tahu hasilnya" (kriteria c) — Promise/Future SELALU berujung resolve atau reject, tidak ada state "permanently unknown" yang natural (kasus USB/air-gap, § 15.5/15.7). **Gugur pada kriteria (c).**
- **Event Automata** — diperiksa: mirip State Machine tapi berfokus pada BAHASA event yang diterima (formal language theory) — cocok untuk memverifikasi URUTAN event yang sah, TAPI lebih rumit dari yang dibutuhkan untuk MEREPRESENTASIKAN status satu Titik Serah (kriteria a). **Lebih kompleks dari kebutuhan, tanpa manfaat tambahan yang jelas untuk kasus ini.**
- **Transition System** — diperiksa: ini sebenarnya KATEGORI MATEMATIS UMUM yang MENCAKUP State Machine sebagai kasus khususnya (State Machine = Transition System berhingga dengan syarat tambahan). **Bukan pesaing — State Machine ADALAH sebuah Transition System, bukan alternatif darinya.**
- **State Machine** — diuji terhadap keempat kriteria: (a) merepresentasikan satu entitas dengan status berubah — cocok persis. (b) Uncertainty Window nol-sampai-tak-terhingga — cocok, sebuah state (mis. "Awaiting Reconciliation") bisa bertahan berapa lama pun tanpa masalah struktural. (c) valid untuk "Reconciliation tidak pernah ada" — cocok, itu SENDIRI adalah sebuah state permanen yang sah (mis. "Sent — No Reconciliation Expected"), bukan error. (d) kompatibel dengan `system_signal` (`08e` § D) — cocok, transisi state ADALAH bentuk system_signal yang sudah sah triggernya.

**Kesimpulan: State Machine BERTAHAN, TAPI sekarang karena LOLOS empat kriteria eksplisit dan MENGALAHKAN tujuh pesaing lewat pengujian (dua gugur karena kontradiksi preseden frozen, satu karena salah kategori, satu karena gagal kriteria konkret, satu karena kompleksitas tanpa manfaat, satu karena ternyata bukan pesaing melainkan kategori induk) — bukan karena ditulis pertama kali sebagai satu-satunya opsi yang terpikirkan.**

**Padanan Composition/Priority Integration (kesimpulan tidak berubah, sekarang berdiri di atas kandidat yang teruji):** State Machine per Titik Serah (Sent → Awaiting Reconciliation → Reconciled/Timeout/Failed) — Rule lain yang "bergantung" pada Integration trigger pada STATE TRANSITION (`system_signal`), bukan pada Rule Integration secara langsung, dan BUKAN acyclic dependency graph statis seperti Rule Composition murni (`08a` § O) karena Uncertainty Window yang tidak terikat satu rangkaian eksekusi.

### 14.4 Menjawab Langsung: Contract Negotiation (Item 8, `10` § 4) dan Event Contract Versioning (Item 3)

**Diuji terhadap Titik Serah (§ 14.1 poin 1):** Kalau skema di sisi Titik Serah berubah tanpa pemberitahuan (Contract Negotiation, item 8), itu berarti asumsi CECEP tentang BENTUK Titik Serah menjadi salah — ini SECARA STRUKTURAL sama dengan kegagalan Reconciliation (CECEP tidak lagi bisa menafsirkan hasil dengan benar). **Konsekuensi:** Contract Negotiation dan Event Contract Versioning BUKAN dua masalah terpisah — keduanya adalah kasus khusus dari "Reconciliation gagal karena bentuk data tidak sesuai ekspektasi", yang berarti mereka WAJIB masuk failure_policy yang sama dengan Reconciliation Failure (§ L `08a`, warisan Layer Orchestration) — bukan mekanisme baru.

---

## Assumptions (Tambahan § 13-14)

6. Tiga elemen struktural Integration (§ 14.1: Titik Serah, Uncertainty Window, Reconciliation) diasumsikan LENGKAP berdasarkan pengujian ulang enam+satu skenario (lima dari § 3, ditambah Message Queue di § 14.1) — kalau Design H menemukan bentuk Integration yang tidak punya salah satu dari tiga elemen ini, struktur ini perlu diuji ulang.
7. Padanan State Machine per Titik Serah (§ 14.3) diasumsikan sebagai ARAH yang benar untuk menggantikan Composition Rule murni — ini BELUM didesain detail (state, transisi, siapa yang memicu), dicatat sebagai pekerjaan Design H, bukan diklaim selesai di sini.

## Open Questions (Diperbarui)

1. Cakupan interaksi manusia murni (§ 3) — Deferred Refinement, dijawab kapan saja tanpa memblokir Design.
2. **Bentuk faktual sistem Puraloka Suite (empiris, murni untuk founder)** — MASIH TERBUKA, dan sekarang punya kegunaan LANGSUNG: menentukan Reconciliation seperti apa (§ 14.1) yang berlaku untuk Orchestration Gap-1/Gap-2, yang menentukan Delivery Guarantee (§ 14.2) yang bisa dijanjikan.
3. ~~Padanan Composition/Priority~~ — TERJAWAB § 14.3 (State Machine per Titik Serah, arah ditemukan, detail milik Design H).
4. ~~Katalog relasi masuk Constitution~~ — TERJAWAB § 13 (tidak, tetap di `14`).

## Status

**Meta-discovery (§ 0-12) DITUTUP secara resmi di § 13, dikonfirmasi lewat Discovery Completion Test eksplisit — tidak ada Open Question tersisa yang mengubah Five Truth Layers/Ownership/Replay/Contract/Version/Structure.** Discovery SUBSTANSI Integration dimulai § 14: ditemukan struktur ontologis tiga-elemen (Titik Serah, Uncertainty Window, Reconciliation) yang bertahan di tujuh bentuk mekanisme berbeda — langsung dipakai menjawab TIGA dari delapan item wajib `10` § 4 (Delivery Guarantee, padanan Composition, Contract Negotiation/Versioning) tanpa membuka satu pun sub-discovery baru. Lima item `10` § 4 tersisa (Integration Contract konkret, Event Join Semantics, Payload Contract, Timeout, External Adapter pattern) BELUM dijawab — pekerjaan lanjutan langsung di § 14, bukan meta-discovery lagi. Satu Open Question empiris tersisa (#2) yang PERTAMA KALINYA punya kegunaan konkret jelas, bukan sekadar tertunda.

---

## 15. Serangan Substansi — Menguji Struktur Tiga-Elemen dengan Sepuluh Skenario Ekstrem

**Koreksi founder — pergeseran review dari metodologi ke substansi: apakah (Titik Serah, Uncertainty Window, Reconciliation) benar-benar invariant, atau runtuh pada kasus ekstrem? Diserang satu per satu, tidak diloloskan karena "kedengarannya sudah teruji tujuh kali" (§ 3, § 14.1).**

### 15.1 Shared Database

**Sudah diuji di § 3 (Universality Test awal)** — Titik Serah = commit ke tabel bersama, Uncertainty Window = celah antara commit dan sistem lain membaca, Reconciliation = TIDAK ADA mekanisme eksplisit (kedua sistem membaca tabel yang sama, tidak ada "konfirmasi" formal). **Diperiksa dalam lebih dalam sekarang:** kalau Reconciliation tidak ada, apakah struktur tiga-elemen runtuh (elemen ketiga kosong)? **Tidak runtuh** — "tidak ada Reconciliation eksplisit" itu SENDIRI adalah nilai yang sah untuk elemen ketiga (persis kategori yang sudah dipetakan § 14.2: "Reconciliation tidak ada → tidak ada guarantee yang bisa diklaim"). Elemen boleh bernilai NULL/tidak-ada, tapi STRUKTURnya (tiga pertanyaan yang harus dijawab) tetap berlaku. **Bertahan.**

### 15.2 Offline Synchronization

**Skenario:** Data disiapkan CECEP, disinkronkan ke perangkat/sistem yang TIDAK terhubung jaringan saat itu (mis. sync saat perangkat lapangan online berkala).

**Diperiksa:** Titik Serah = saat data ditulis ke buffer/staging sync. Uncertainty Window = dari staging sampai perangkat benar-benar online dan menarik data — bisa BERHARI-HARI, TIDAK PASTI kapan. Reconciliation = konfirmasi sync berhasil saat perangkat berikutnya online (atau checksum, atau versi counter). **Bertahan** — bahkan ini kasus PALING JELAS menunjukkan kenapa Uncertainty Window harus bisa bernilai "tidak terhingga/tidak diketahui", bukan diasumsikan pendek.

### 15.3 Human Approval

**Skenario:** CECEP menyerahkan keputusan ke manusia (PM/Direktur) untuk approve, tidak ada sistem di sisi lain.

**Sudah disinggung § 3** (interaksi manusia manual) — TAPI Human Approval SPESIFIK berbeda dari "manusia baca lalu telepon supplier" karena ADA mekanisme balik yang terstruktur (approve/reject via CAP-010 Workflow Engine, `05` § F.10, yang SUDAH ada di CECEP). **Diperiksa:** Titik Serah = notifikasi approval dikirim. Uncertainty Window = sampai manusia menekan tombol (bisa menit, bisa minggu — Timeout jadi sangat relevan di sini, `10` § 4 item 5). Reconciliation = event approve/reject yang tercatat CAP-010. **Bertahan — DAN ini mengungkap sesuatu penting: Human Approval BUKAN kasus Integration yang butuh CAP-013 sama sekali** — ia sudah punya jalur sendiri lewat CAP-010 yang FROZEN sejak Phase D. **Temuan: Human Approval adalah bukti bahwa TIDAK SEMUA "penyerahan ke luar kendali CECEP" otomatis berarti CAP-013/Integration Gateway — sebagian sudah tertangani Capability lain yang sudah ada.** Ini konsisten Orchestration Separation Principle (`04` § 10): domain approval tetap milik CAP-010, bukan diam-diam ditarik jadi Integration.

### 15.4 Edge Device / IoT / PLC

**Skenario:** CECEP mengirim perintah ke perangkat fisik (sensor, PLC di lokasi konstruksi) yang punya keterbatasan komputasi/konektivitas ekstrem.

**Diperiksa:** Titik Serah = perintah dikirim ke gateway/protokol perangkat (MQTT, Modbus, dst — mekanisme, tidak relevan untuk struktur). Uncertainty Window = SANGAT bervariasi (bisa milidetik untuk sensor lokal, bisa tidak terhingga kalau perangkat mati baterai). Reconciliation = ack dari perangkat, ATAU TIDAK ADA SAMA SEKALI untuk perangkat "fire-and-forget" (banyak sensor IoT tidak punya jalur balik). **Bertahan** — kasus fire-and-forget IoT adalah instance LAIN dari "Reconciliation = tidak ada", memperkuat (bukan mematahkan) temuan § 15.1.

**Tapi... apakah PLC/IoT ini benar-benar relevan untuk CECEP (Cost Engineering Platform), atau ini pengujian di luar domain yang tidak akan pernah terjadi?** Diperiksa: CLAUDE.md project menyebut IoT sebagai kandidat masa depan (disebutkan di percakapan sebelumnya sebagai contoh integrasi masa depan) — TAPI ini pertanyaan CAKUPAN (relevan atau tidak untuk CECEP HARI INI), bukan pertanyaan UNIVERSALITAS DEFINISI (apakah strukturnya tetap benar). Definisi tetap diuji terhadap SEMUA kemungkinan (termasuk yang belum tentu dipakai) justru supaya ia TIDAK diam-diam implementation-specific — ini sesuai § 3 directive founder sebelumnya. **Bertahan, dicatat relevansinya sebagai pertanyaan cakupan terpisah, bukan pertanyaan validitas.**

### 15.5 Filesystem / USB Copy

**Skenario:** Data dipindahkan lewat file yang disalin manual (USB, shared folder tanpa notifikasi).

**Diperiksa:** Titik Serah = file ditulis ke lokasi/media. Uncertainty Window = sampai TIDAK TERHINGGA secara struktural (tidak ada cara CECEP tahu kapan atau apakah USB itu pernah dicolokkan ke sistem lain). Reconciliation = TIDAK ADA, titik. **Bertahan** — kasus PALING EKSTREM dari "Reconciliation tidak ada", dan justru kasus ini yang PALING JERNIH membuktikan kenapa elemen ketiga harus bisa bernilai kosong tanpa merusak struktur: CECEP tetap bisa (dan harus) mendesain APA yang terjadi di Titik Serah dan mengakui Uncertainty Window-nya tidak terhingga — desain yang JUJUR tentang keterbatasannya, bukan desain yang pura-pura tahu.

### 15.6 Satellite Link

**Skenario:** Komunikasi lewat link satelit dengan latency tinggi dan kemungkinan putus sewaktu-waktu (relevan untuk proyek konstruksi di lokasi terpencil).

**Diperiksa:** Titik Serah = paket dikirim ke modem satelit. Uncertainty Window = latency tinggi TAPI TERUKUR (beda dari USB yang tidak terukur sama sekali) — beberapa detik sampai menit, dengan kemungkinan gagal total kalau link putus. Reconciliation = ack dari sisi penerima via link yang sama, dengan Timeout yang HARUS jauh lebih longgar dari koneksi normal. **Bertahan** — kasus ini justru menunjukkan Uncertainty Window punya SPEKTRUM (dari nol/instan sampai tidak terhingga), bukan biner ada/tidak ada, yang jadi INPUT LANGSUNG untuk keputusan Timeout (`10` § 4 item 5): Timeout HARUS dikonfigurasi PER TITIK SERAH berdasarkan estimasi realistis Uncertainty Window-nya, bukan satu nilai default untuk semua Integration.

### 15.7 Air-Gapped System

**Skenario:** Sistem yang SENGAJA tidak terhubung jaringan sama sekali (keamanan tinggi — bisa relevan untuk data klien/kontrak sensitif, atau sistem pemerintah).

**Diperiksa:** Ini kasus EKSTREM dari Uncertainty Window tidak terhingga (mirip USB, § 15.5) DENGAN tambahan constraint: Titik Serah-nya sendiri mungkin BUKAN elektronik (bisa berupa dokumen fisik, tanda tangan basah, yang discan/diinput manual ke air-gap system oleh manusia). **Diperiksa apakah ini meruntuhkan definisi:** Titik Serah tetap bisa didefinisikan (momen dokumen/data terakhir kali berada "di sisi CECEP" sebelum berpindah tangan) — HANYA mekanismenya non-digital. **Bertahan** — dan ini memperkuat temuan § 3 (definisi Integration mencakup interaksi manusia murni) dari sudut yang berbeda: air-gap adalah kasus di mana batas keamanan MEMAKSA Titik Serah menjadi non-digital, bukan pengecualian terhadap struktur.

### 15.8 Kombinasi — Delapan Skenario, Satu Kesimpulan

**Diperiksa pola yang muncul dari kedelapan pengujian (§ 15.1-15.7 plus enam dari § 3):** TIDAK SATU PUN skenario meruntuhkan struktur tiga-elemen. Yang bervariasi HANYA nilai/karakter masing-masing elemen:
- **Titik Serah**: bisa digital (API call, commit DB) atau non-digital (tanda tangan, USB, dokumen fisik).
- **Uncertainty Window**: bisa nol/instan (API sinkron), terukur-pendek (satelit), terukur-panjang (human approval), atau tidak terhingga/tidak diketahui (USB, air-gap, offline sync).
- **Reconciliation**: bisa eksplisit-otomatis (ack, webhook), eksplisit-manual (approval event via CAP-010), atau TIDAK ADA sama sekali (fire-and-forget IoT, USB, shared DB tanpa mekanisme).

**Kesimpulan diperkuat, bukan sekadar bertahan:** Struktur tiga-elemen sekarang TERUJI terhadap empat belas skenario total (enam § 3 + tujuh § 15.1-15.7 + Message Queue § 14.1) mencakup rentang dari yang paling terstruktur (REST API sinkron) sampai yang paling tidak terstruktur (USB copy, air-gap). **Tidak ditemukan satu skenario pun yang butuh elemen keempat, atau yang membuat salah satu dari tiga elemen menjadi tidak relevan.**

### 15.9 Satu Temuan Substansial Baru dari Serangan Ini (Bukan Sekadar Konfirmasi)

**Ditemukan lewat § 15.3 (Human Approval) dan dikuatkan § 15.6 (Satellite):** Timeout (`10` § 4 item 5) BUKAN satu nilai global atau satu nilai per-Criticality (asumsi lama `08c v2`/`08k`) — Timeout adalah **turunan LANGSUNG dari estimasi Uncertainty Window per Titik Serah**. Ini adalah keputusan Design konkret yang lahir dari serangan substansi ini, bukan dari meta-discovery: setiap Integration Point (nanti didesain di § 16+) WAJIB mendeklarasikan estimasi Uncertainty Window-nya sendiri (instan/detik/menit/jam/tidak-terhingga) sebagai bagian datanya, dan Timeout diturunkan dari situ — bukan angka arbitrer yang dipilih terpisah.

**Diuji apakah ini menyentuh baseline frozen (Discovery Completion Test, enam sumbu):** Five Truth Layers — tidak. Ownership — tidak. Replay — tidak. Contract — SEDIKIT bersinggungan (field baru di masa depan pada struktur Integration Point yang BELUM didesain, bukan mengubah Contract yang sudah dikunci). Version — tidak. Structure — tidak (Structure Rule `08a` § I tidak berubah, ini struktur BARU untuk Integration yang memang domain Phase H). **Tidak ada yang mengubah baseline — dicatat langsung sebagai keputusan Design, tidak perlu Discovery baru.**

---

## 16. Timeout Sebagai Fungsi Uncertainty Window — Decision Competition

**Melanjutkan temuan § 15.9 (Timeout = turunan Uncertainty Window, bukan Criticality). Sekarang didesain KONKRET: bagaimana persisnya Timeout dihitung/dideklarasikan per Integration Point — dijalankan sebagai Decision Competition penuh, bukan satu kandidat lalu dipertahankan.**

**Ruang kandidat (dibangun dulu, sebelum diuji):**

- **Kandidat A — Nilai tetap per Criticality** (pendekatan lama `08c v2`/`08k`, sudah ditolak § 15.9, diuji ulang di sini untuk kelengkapan Decision Competition, bukan diasumsikan gugur).
- **Kandidat B — Estimasi manual per Integration Point** (perancang Rule mendeklarasikan angka Timeout secara eksplisit saat mendesain Integration Point, mirip pola `timeout` di struktur Rule § I `08a`).
- **Kandidat C — Kelas Uncertainty Window terstandar** (bukan angka bebas, tapi PILIHAN dari kelas terbatas: Instant/Seconds/Minutes/Hours/Unbounded — masing-masing kelas punya rentang Timeout default yang BOLEH di-override).
- **Kandidat D — Adaptive/Statistical** (Timeout dihitung otomatis dari histori aktual Integration Point yang sama, mis. p99 waktu respons historis).
- **Kandidat E — Tidak ada Timeout eksplisit, murni Reconciliation-driven** (tidak pernah timeout, hanya berhenti menunggu kalau Reconciliation eksplisit bilang gagal/selesai).

**Kriteria uji (diturunkan dari kebutuhan struktural § 14.1 dan § 15, bukan preferensi):**
(i) Harus valid untuk Uncertainty Window nol SAMPAI tidak terhingga (§ 15.5-15.7).
(ii) Harus konsisten dengan Determinism Boundary (§ 0.1) — Timeout adalah bagian dari "batas eksplisit", bukan boleh implisit.
(iii) Harus bisa dideklarasikan SEBELUM Integration Point pernah dijalankan (tidak boleh butuh data historis yang belum ada untuk kasus pertama kali).
(iv) Harus proporsional — tidak memaksa perancang menebak angka presisi tanpa dasar (risiko Fabricated Certainty, § 0.C).

**Diuji satu per satu:**

- **Kandidat A (Criticality-based):** (i) GAGAL — sudah dibuktikan § 15.9, Criticality (bisnis) dan Uncertainty Window (teknis-mekanisme) adalah dua sumbu independen (Rule Criticality High bisa punya Uncertainty Window pendek [API sinkron] ATAU panjang [approval manusia] — Criticality tidak memprediksi keduanya). **Gugur pada kriteria paling dasar.**
- **Kandidat B (manual bebas):** (iii) LOLOS (bisa dideklarasikan di awal), TAPI (iv) GAGAL — angka bebas tanpa kelas rawan menjadi tebakan asal (Fabricated Certainty, `08c v2` § G poin 1 sendiri sudah mengalami ini: Timeout "belum ditentukan" selama BERGULIR beberapa dokumen tanpa kerangka). **Gugur pada kriteria (iv).**
- **Kandidat C (kelas terstandar):** (i) LOLOS — lima kelas eksplisit mencakup spektrum nol-sampai-tak-terhingga (Unbounded = kelas sah, bukan pengecualian, konsisten § 15.5/15.7). (ii) LOLOS — kelas yang dipilih ADALAH bagian dari deklarasi eksplisit batas (bukan implisit). (iii) LOLOS — perancang MEMILIH kelas berdasarkan PENGETAHUAN tentang mekanisme (API vs manual vs satelit), bukan butuh data historis. (iv) LOLOS — memilih dari lima kelas jauh lebih proporsional daripada menebak angka presisi. **LOLOS SEMUA EMPAT.**
- **Kandidat D (adaptive/statistical):** (iii) GAGAL — butuh histori yang belum ada untuk Integration Point BARU (masalah cold-start). Juga (ii) rawan — Timeout yang "dihitung otomatis" dari data BUKAN batas yang dideklarasikan eksplisit, lebih dekat ke implisit. **Gugur pada dua kriteria.**
- **Kandidat E (no timeout, Reconciliation-only):** (i) LOLOS secara sempit (valid untuk Unbounded), TAPI GAGAL untuk kasus lain — Integration Point dengan Uncertainty Window PENDEK (API sinkron) TETAP butuh batas eksplisit (tidak menunggu selamanya kalau API hang, itu justru anti-pattern § 0.B versi lama sebelum diperbaiki). **Gugur — hanya menjawab satu ujung spektrum, bukan keseluruhan.**

**Hasil Decision Competition: Kandidat C (Kelas Uncertainty Window terstandar) menang, lolos keempat kriteria secara eksplisit sementara empat kandidat lain masing-masing gugur pada kriteria spesifik yang bisa ditunjuk — bukan kandidat pertama yang ditulis lalu dipertahankan.**

**Struktur konkret (field baru pada Integration Point, BUKAN pada Rule Definition § I `08a` — konsisten pemisahan yang sudah dikunci `08k` § 9 antara Rule Definition dan Rule Execution Instance):**

```
Integration Point {
  uncertainty_class:  "instant" | "seconds" | "minutes" | "hours" | "unbounded"
  timeout_override:   [opsional — angka eksplisit kalau default kelas tidak cocok]
}
```

**Diuji Discovery Completion Test:** Five Truth Layers — tidak. Ownership — tidak. Replay — tidak (Timeout tidak mempengaruhi Replay-by-Recompute/Retrieve, `08h` § C.2, karena keduanya sudah independen dari berapa lama Uncertainty Window). Contract — struktur BARU untuk domain BARU (Integration Point belum pernah didefinisikan sebelumnya, jadi ini bukan "mengubah" Contract yang sudah dikunci). Version — tidak. Structure — tidak (Rule Definition § I `08a` tidak disentuh). **Tidak ada yang mengubah baseline — keputusan Design sah dicatat langsung.**

---

## 17. Integration Contract / CAP-013 — Decision Competition

**Menjawab item 1 `10` § 4 — bentuk konkret Integration Gateway. Dibangun di atas struktur Integration Point (§ 16) dan tiga-elemen (§ 14.1).**

**Ruang kandidat (bentuk CAP-013 sebagai capability):**

- **Kandidat A — Satu Capability Homogen** (pola sama seperti CAP-001 s.d. CAP-012: satu Engine, satu kontrak API seragam untuk semua target integrasi).
- **Kandidat B — Strategy Pattern per Target** (CAP-013 sebagai SATU capability, tapi dengan Integration Strategy yang dipilih per target — pola meniru Calculation Strategy, `06` § B).
- **Kandidat C — Banyak Capability Terpisah per Kategori Target** (mis. CAP-013a untuk Internal-Adjacent, CAP-013b untuk True-External, dst. — kategori dari temuan draf lama yang dihapus, sekarang diuji ulang apakah relevan).
- **Kandidat D — Bukan Capability Sama Sekali, Murni Infrastructure/Cross-Cutting** (Integration tidak dibungkus Capability, tapi jadi lapisan infrastruktur yang dipanggil langsung tanpa kontrak Capability formal).

**Kriteria uji:** (i) Konsisten Orchestration Separation Principle (`04` § 10) dan pola "Rule memanggil lewat kontrak Dependency Matrix" (`08a` § C poin 2). (ii) Bisa mengakomodasi keberagaman tiga-elemen (§ 14.1) TANPA memaksa satu bentuk Reconciliation untuk semua. (iii) Tidak menciptakan duplikasi force-fit (memaksa dua target integrasi yang sangat berbeda memakai kontrak yang identik). (iv) Konsisten dengan preseden CAP-006 (satu Capability, banyak Strategy internal, `06` § B) — pola yang SUDAH terbukti bekerja untuk masalah struktural serupa (satu fungsi, banyak variasi internal).

**Diuji:**

- **Kandidat A (homogen):** (ii) GAGAL — sudah terbukti § 15 (empat belas skenario) bahwa Reconciliation bisa sinkron/async/tidak-ada, Titik Serah bisa digital/non-digital — satu kontrak API seragam tidak bisa menangkap keduanya tanpa salah satu dipaksa menyesuaikan bentuk yang tidak natural. **Gugur.**
- **Kandidat B (Strategy Pattern per Target):** (i) LOLOS — Rule tetap memanggil SATU CAP-013 lewat kontrak yang konsisten (`action` menyebut CAP-013, bukan CAP-013a/b/c — Composition/Priority Rule § O `08a` tidak perlu tahu strategy internal). (ii) LOLOS — Strategy yang berbeda menangani bentuk Reconciliation berbeda, persis seperti Calculation Strategy menangani metode kalkulasi berbeda di balik SATU kontrak CAP-006 (`06` § B). (iii) LOLOS — tidak ada force-fit, setiap Strategy didesain sesuai target. (iv) LOLOS — preseden LANGSUNG dari CAP-006 yang sudah frozen dan terbukti (Konstitusi Calculation Strategy, `06` § pembuka poin 6). **LOLOS SEMUA EMPAT.**
- **Kandidat C (banyak Capability per kategori):** (i) LOLOS sebagian (masih via kontrak), TAPI (iv) LEMAH — preseden CAP-006 justru menunjukkan pola yang SUDAH terbukti adalah "satu Capability, banyak Strategy", BUKAN "banyak Capability". Memecah jadi banyak Capability juga berisiko mengulang draf lama yang SUDAH dikoreksi (asumsi API vs manual vs DB sebagai kategori PERMANEN, padahal § 15 justru membuktikan spektrum itu KONTINU, bukan kategori diskrit tetap) — force-fit BARU (kriteria iii) muncul dalam bentuk lain: memaksa setiap target masuk SATU dari sedikit Capability yang sudah ditentukan sebelumnya. **Gugur — lebih lemah dari B pada preseden dan berisiko force-fit versi lain.**
- **Kandidat D (bukan Capability sama sekali):** (i) GAGAL LANGSUNG — kontradiksi eksplisit dengan pola "Orchestrator memanggil Capability lewat kontrak" (`08a` § D, § I) yang sudah frozen sejak Phase G — CAP-013 SUDAH bernama sejak Phase D (`05`), menghapus statusnya sebagai Capability adalah ACR terhadap dua fase frozen sekaligus. **Gugur — kontradiksi baseline, ACR besar tanpa alasan cukup kuat.**

**Hasil Decision Competition: Kandidat B (Strategy Pattern per Target, meniru CAP-006) menang** — satu Capability CAP-013 dengan Integration Strategy yang dipilih per Integration Point, persis pola Calculation Strategy yang sudah terbukti bekerja untuk masalah berstruktur sama (satu fungsi, variasi internal tidak terbatas).

**Diuji Discovery Completion Test:** Five Truth Layers — tidak (CAP-013 tetap Layer 2, dipanggil dari Layer 5, tidak berubah). Ownership — tidak (CAP-013 tetap satu Capability, Rule tetap tidak memiliki apa pun). Replay — tidak langsung (perlu diuji lebih lanjut apakah Integration Strategy butuh versioning terpisah — DICATAT sebagai pekerjaan lanjutan, bukan diasumsikan otomatis sama seperti Calculation Strategy). Contract — CAP-013 SUDAH bernama sejak `05` tapi BELUM punya bentuk konkret (`08c v2` § G poin 2 eksplisit menyatakan ini ditunda ke Phase H) — mengisi bentuk yang memang belum diisi BUKAN mengubah yang sudah dikunci. Version — sama seperti Replay, dicatat sebagai pertanyaan lanjutan. Structure — tidak. **Tidak ada yang mengubah baseline pada lima dari enam sumbu; satu sumbu (Version) memerlukan verifikasi lanjutan, dicatat eksplisit di Open Questions, bukan diasumsikan aman.**

---

## Assumptions (Tambahan § 16-17)

8. Lima kelas Uncertainty Window (§ 16, Kandidat C: instant/seconds/minutes/hours/unbounded) diasumsikan cukup granular — kalau Design lanjutan menemukan kebutuhan kelas keenam, ini penambahan katalog, bukan perubahan struktural.
9. Integration Strategy (§ 17, Kandidat B) diasumsikan bisa meniru POLA Calculation Strategy (`06` § B) tanpa mewarisi SEMUA propertinya secara otomatis — perlu diuji eksplisit properti mana yang ikut (Versioning?) dan mana yang tidak (Determinism jelas TIDAK ikut, sudah dibuktikan tuntas § 8-10), dicatat sebagai Open Question, bukan diasumsikan menyalin penuh.

## Open Questions (Tambahan)

5. Apakah Integration Strategy (§ 17) butuh Versioning terpisah seperti Calculation Strategy (`06` § K), atau Versioning-nya cukup mengikuti Rule Definition yang memanggilnya (`08a` § K)? Ini BUKAN pertanyaan yang mengubah baseline (Discovery Completion Test lolos di § 17), tapi perlu dijawab sebelum Integration Strategy didesain detail — dicatat sebagai pekerjaan Design lanjutan.
6. Bentuk konkret Integration Strategy untuk Orchestration Gap-1/Gap-2 (Material Requirement, Cashflow) masih menunggu Open Question #2 (empiris, bentuk faktual sistem Puraloka Suite) — Strategy tidak bisa didesain detail tanpa tahu target nyatanya.

## 18. Event Join Semantics (ANY/ALL/QUORUM) — Decision Competition

**Menjawab item 2 `10` § 4 dan `08k` § 11/§ 13 — kapan satu Domain Event bisa dihasilkan lebih dari satu Rule/Producer, bagaimana Consumer Rule menggabungkan/menunggunya.**

**Ruang kandidat:**

- **Kandidat A — ANY (first-wins)**: Consumer trigger begitu SATU dari beberapa Producer menghasilkan event, mengabaikan sisanya.
- **Kandidat B — ALL (wait-for-all)**: Consumer menunggu SEMUA Producer yang terdaftar menghasilkan event sebelum trigger.
- **Kandidat C — QUORUM (N dari M)**: Consumer trigger begitu sejumlah N dari M Producer terpenuhi, dengan N dikonfigurasi.
- **Kandidat D — Tidak ada Join eksplisit, setiap kemunculan event = trigger terpisah** (Consumer trigger BERKALI-KALI, satu kali per Producer, tidak digabungkan sama sekali).
- **Kandidat E — Join Policy per Integration Point** (bukan satu jawaban global — setiap Integration Point mendeklarasikan Join Policy-nya sendiri dari kandidat A/B/C/D di atas).

**Kriteria uji:** (i) Harus konsisten dengan struktur Integration Point (§ 16-17) — bukan mekanisme paralel baru yang lepas dari State Machine yang sudah didesain. (ii) Harus bisa menjelaskan KENAPA satu event bisa berasal dari banyak Producer sejak awal (akar masalah, bukan cuma gejala). (iii) Harus konsisten dengan Determinism boundary (§ 0.1/§ 8-10) — Join Policy sendiri harus deterministik (policy yang sama, kondisi yang sama, hasil keputusan sama), meski HASIL tiap Producer individual mungkin tidak. (iv) Tidak boleh memaksa SATU jawaban untuk semua kasus kalau kebutuhan nyata berbeda-beda (dipelajari dari kegagalan Kandidat A di Timeout § 16).

**Diuji:**

- **Kandidat A (ANY):** (ii) diperiksa — KENAPA satu event logis bisa datang dari banyak Producer? Ditelusuri ke akar: karena CECEP mengizinkan lebih dari satu Rule/Producer menghasilkan event dengan NAMA sama untuk TUJUAN sama (mis. dua jalur berbeda yang keduanya berujung "Material Requirement siap", contoh asli `08k` § 11). ANY valid KETIKA yang penting hanyalah "apakah SUDAH terjadi" (boolean), tidak peduli SIAPA yang menghasilkannya. **Valid untuk subset kasus, gugur sebagai jawaban universal (iv).**
- **Kandidat B (ALL):** valid KETIKA Consumer benar-benar butuh SEMUA sumber untuk lengkap (mis. Cashflow Baseline butuh RAP DAN Material Requirement DUA-duanya siap). **Valid untuk subset kasus BERBEDA dari A, gugur sebagai jawaban universal (iv) — dan LANGSUNG membuktikan A dan B tidak bisa jadi satu jawaban tunggal karena kebutuhannya berlawanan.**
- **Kandidat C (QUORUM):** diperiksa — N-dari-M valid untuk kasus REDUNDANSI (mis. tiga sistem eksternal paralel, cukup dua yang konfirmasi). **Belum ada preseden NYATA di CECEP untuk kasus ini** (Orchestration Gap-1/Gap-2 tidak menyebut redundansi Producer) — dicatat SAH secara struktural tapi TANPA instance konkret saat ini, konsisten pola § 11.3 (Equivalent/Independent dicatat mungkin ada tanpa instance).
- **Kandidat D (setiap event = trigger terpisah, no join):** diperiksa — ini sebenarnya BUKAN "tanpa Join Policy", ia adalah KASUS KHUSUS di mana N=1 dan tidak ada agregasi sama sekali (Consumer memperlakukan tiap kemunculan sebagai independen). **Bukan kandidat kelima yang berdiri sendiri — ia adalah degenerate case dari kerangka yang sama** (mirip temuan § 11.1 soal Trigger, relasi yang terlihat baru ternyata sudah tercakup kategori yang ada).
- **Kandidat E (Join Policy per Integration Point, bukan satu jawaban global):** diuji terhadap (iv) — LOLOS langsung, karena A/B/C terbukti masing-masing valid untuk SUBSET kasus berbeda (bukti dari pengujian A dan B saling bertentangan kebutuhannya). (i) LOLOS — Join Policy adalah properti YANG DIDEKLARASIKAN di Integration Point, sama pola dengan `uncertainty_class` (§ 16). (iii) LOLOS — policy yang dideklarasikan eksplisit (ANY/ALL/QUORUM+N) dan dievaluasi terhadap event yang sudah terjadi adalah keputusan deterministik (sama input Producer yang sudah trigger → sama keputusan Consumer trigger atau tidak).

**Hasil Decision Competition: Kandidat E menang** — bukan satu jenis Join Semantics tunggal, tapi FIELD deklaratif per Integration Point yang NILAINYA bisa ANY/ALL/QUORUM(N). Ini konsisten dengan pola yang SUDAH terbukti berulang di Phase H (Timeout § 16 juga bukan satu nilai global, tapi deklarasi per Integration Point).

**Struktur konkret (field tambahan Integration Point):**

```
Integration Point {
  ...(uncertainty_class, timeout_override dari § 16)...
  join_policy:      "any" | "all" | "quorum"
  quorum_n:         [wajib diisi HANYA kalau join_policy = "quorum"]
  producers:        daftar Rule/sumber yang menghasilkan event ini (WAJIB jika join_policy ≠ default satu-producer)
}
```

**Diuji Discovery Completion Test:** Five Truth Layers — tidak. Ownership — tidak (Join Policy adalah aturan KONSUMSI, tidak memberi Consumer hak atas Producer manapun). Replay — DIUJI LEBIH DALAM: apakah Join Policy mempengaruhi Replay? Kalau ALL/QUORUM, Replay harus tahu BUKAN HANYA event mana yang terjadi, TAPI JUGA urutan/waktu kedatangannya relatif satu sama lain (untuk kasus QUORUM yang time-sensitive) — INI POTENSI SENTUHAN ke Replay yang perlu dicatat, bukan diabaikan. Contract — field baru pada struktur Integration Point yang memang belum ada sebelumnya (bukan mengubah yang dikunci). Version — tidak langsung. Structure — tidak (Rule Definition § I `08a` tidak berubah). **Lima dari enam sumbu aman, SATU (Replay) butuh catatan eksplisit — dicatat sebagai Open Question, bukan diam-diam diasumsikan tidak berpengaruh.**

---

## 19. Payload Contract — Decision Competition

**Menjawab item 4 `10` § 4 — bentuk data pertukaran untuk tiga event baru (`RapDraftGenerated`, `MaterialRequirementDraftGenerated`, `CashflowBaselineGenerated`) dan Event Contract Versioning (item 3, `08k` § 12).**

**Ruang kandidat (bentuk representasi Payload Contract):**

- **Kandidat A — Payload Contract = Canonical Information Contract langsung** (pakai ulang 11 elemen `07` § C apa adanya untuk payload event).
- **Kandidat B — Payload Contract sebagai objek independen baru** (struktur BARU, tidak menurunkan dari Canonical Information Contract).
- **Kandidat C — Payload Contract sebagai SUBSET Canonical Information Contract** (beberapa elemen dipakai, beberapa TIDAK relevan untuk konteks payload event, dipilih secara sadar).
- **Kandidat D — Payload Contract = skema serialisasi eksternal (JSON Schema/Protobuf/dst.) tanpa keterkaitan ke Canonical Information Contract sama sekali.**

**Kriteria uji:** (i) Konsisten dengan Konstitusi bahwa data mengalir lewat Canonical Information Contract, tidak membaca struktur Entity mentah (`08a` § H poin 4, Decision Checklist Orchestration). (ii) Payload event, secara ontologis (`08g`/`08h`), adalah kategori informasi APA — diperiksa dulu sebelum memutuskan strukturnya. (iii) Harus mengakomodasi Event Contract Versioning (coexist/migrasi) tanpa didesain ulang total nanti. (iv) Tidak boleh salah kategori (representasi permukaan/serialisasi vs model data — pelajaran dari § 14.3 kasus Temporal Logic yang gugur karena salah kategori).

**Diuji:**

- **Kandidat A (pakai ulang penuh):** (ii) diperiksa dulu — apa Classification (`08g`) payload event `RapDraftGenerated`? Payload ini MEMBAWA REFERENSI ke Computed Data (RAP Draft itu sendiri, `08c v2` § B), bukan Computed Data itu sendiri (event hanya bilang "sudah terjadi", tidak membawa seluruh isi RAP). Payload event lebih dekat ke **Event Data** (`08g` § A.16) — kategori yang PUNYA elemen Contract sendiri (immutable, append-only) TAPI TIDAK semua 11 elemen Canonical Information Contract relevan (mis. "Allowed Mutation" tidak relevan untuk Event Data yang memang tidak pernah dimutasi, "Derivation Rule" tidak relevan karena Event Data bukan Derived/Computed). **Kandidat A memaksa 11 elemen penuh padahal beberapa TIDAK RELEVAN — gugur pada (iv), salah kategori (kepenuhan berlebih, over-fit).**
- **Kandidat D (skema serialisasi murni, lepas dari Canonical Contract):** (i) GAGAL LANGSUNG — kontradiksi eksplisit dengan Decision Checklist Orchestration poin 4 yang sudah dikunci (`08a` § H). Memilih ini berarti Payload Contract lepas dari kerangka Information yang sudah frozen. **Gugur — kontradiksi baseline.**
- **Kandidat B (struktur independen baru):** (ii) diperiksa — kalau payload adalah Event Data (kategori YANG SUDAH ADA di `08g` § A.16), membuat struktur BARU yang tidak terhubung sama sekali mengabaikan klasifikasi yang sudah ditemukan. **Gugur — tidak konsisten dengan temuan (ii) sendiri.**
- **Kandidat C (subset sadar dari Canonical Information Contract, disesuaikan Event Data):** (i) LOLOS — tetap dalam kerangka Canonical Information Contract (bukan lepas total). (ii) LOLOS — secara eksplisit dipilih elemen yang relevan untuk Event Data: Identity, Meaning, Owner, Lifecycle, Version, Consumers, Producers, Audit (8 dari 11) — Allowed Mutation/Source of Truth/Derivation Rule DIKECUALIKAN dengan alasan eksplisit (Event Data immutable-append, bukan hasil derivasi). (iii) LOLOS — Version (salah satu dari 8 elemen yang dipakai) SECARA LANGSUNG menyediakan mekanisme Event Contract Versioning (payload versi v1/v2 coexist lewat elemen Version yang SUDAH bagian Contract). (iv) LOLOS — kategori sudah benar (Event Data), subset dipilih dengan alasan eksplisit bukan sembarang.

**Hasil Decision Competition: Kandidat C menang** — Payload Contract untuk tiga event baru memakai 8 dari 11 elemen Canonical Information Contract (mengecualikan Allowed Mutation/Source of Truth/Derivation Rule dengan alasan eksplisit terkait Classification Event Data), DAN elemen Version yang sudah termasuk di dalamnya otomatis menjawab Event Contract Versioning (item 3 `08k` § 12) — bukan mekanisme terpisah yang perlu didesain lagi.

**Diuji Discovery Completion Test:** Five Truth Layers — tidak. Ownership — tidak (Producer/Consumer sudah bagian Contract, tidak menciptakan ownership baru). Replay — Event Data SUDAH Replayable secara definisi (`08g` § A.16, Event Sourcing bergantung padanya) — konsisten, tidak berubah. Contract — INI JUSTRU MENGISI Contract yang belum ada (`08c v2` § G poin 3 eksplisit menunda ini), bukan mengubah yang sudah dikunci. Version — elemen Version pada Payload Contract adalah PENERAPAN prinsip Everything is Versioned (`04` § 1) ke domain baru, konsisten bukan kontradiksi. Structure — tidak. **Aman pada semua enam sumbu.**

---

## 20. External Adapter Pattern — Decision Competition

**Menjawab item 7 `10` § 4 — bagaimana CAP-013 (via Integration Strategy, § 17) menerjemahkan format CECEP ↔ sistem existing Puraloka Suite. Domain Anti-Corruption Layer yang `03b` sudah identifikasi perlu ada tapi belum didesain.**

**Ruang kandidat:**

- **Kandidat A — Direct Mapping** (Integration Strategy menerjemahkan field-per-field langsung, tanpa lapisan perantara — Canonical Contract field X dipetakan langsung ke field API eksternal Y).
- **Kandidat B — Anti-Corruption Layer dengan Model Perantara** (ACL punya MODEL SENDIRI di tengah — CECEP → Model ACL → format eksternal — dua kali translasi, bukan satu).
- **Kandidat C — Adapter per Integration Strategy, tanpa model perantara bersama** (setiap Integration Strategy punya adapter sendiri-sendiri yang menerjemahkan langsung, TAPI adapter itu sendiri adalah objek terpisah dari Strategy, bisa diuji/diganti independen).
- **Kandidat D — Schema Registry Terpusat** (satu registry yang menyimpan SEMUA mapping, Integration Strategy hanya query registry, tidak menyimpan mapping sendiri).

**Kriteria uji:** (i) Konsisten dengan Determinism Boundary (§ 0.1) — ACL adalah TEPAT titik di mana boundary itu berada, harus eksplisit menandainya, bukan menyamarkannya (hindari Interface Camouflage, § 0.B). (ii) Konsisten dengan preseden CAP-006/Kandidat B § 17 (Strategy Pattern) — apakah Adapter sebaiknya BAGIAN dari Strategy atau OBJEK TERPISAH. (iii) Harus bisa berubah/diuji independen dari Integration Strategy (karena skema eksternal bisa berubah, `10` § 4 item 8, TANPA logic Strategy ikut berubah). (iv) Tidak boleh over-engineer untuk kebutuhan yang belum terbukti (preseden § 17 Kandidat C gugur karena force-fit kategori permanen yang belum tentu perlu).

**Diuji:**

- **Kandidat A (Direct Mapping, tanpa lapisan):** (i) GAGAL — direct mapping field-ke-field TIDAK punya titik eksplisit di mana "translasi" terjadi sebagai objek yang bisa diaudit terpisah — mapping tersebar implisit di dalam logic Strategy, PERSIS anti-pattern Interface Camouflage (§ 0.B) yang sudah diidentifikasi di awal Discovery ini. **Gugur — mengulang anti-pattern yang sudah ditemukan sendiri.**
- **Kandidat B (ACL dengan Model Perantara penuh):** (iv) diperiksa — dua kali translasi (CECEP→Model Antara→Eksternal) adalah pola yang tepat untuk BANYAK sistem eksternal heterogen berbagi SATU model kanonik internal (klasik DDD Anti-Corruption Layer). Tapi diperiksa kebutuhan NYATA CECEP saat ini: Orchestration Gap-1/Gap-2 (dua target diketahui) BELUM terbukti butuh model perantara bersama — model perantara baru bernilai kalau BANYAK target eksternal berbagi bentuk serupa yang layak distandarkan. **Berpotensi over-engineering untuk kebutuhan yang belum terbukti (iv) — TAPI dicatat BUKAN gugur mutlak, hanya PREMATURE untuk keadaan saat ini.**
- **Kandidat D (Schema Registry Terpusat):** (ii) diperiksa — registry terpusat yang dipanggil semua Strategy menciptakan SATU titik ketergantungan bersama yang, kalau registry berubah, mempengaruhi SEMUA Integration Strategy sekaligus — ini bertentangan dengan (iii): perubahan skema SATU target eksternal seharusnya TIDAK mempengaruhi target lain. **Gugur pada (iii) — coupling yang tidak diinginkan.**
- **Kandidat C (Adapter per Strategy, objek terpisah, tanpa model bersama):** (i) LOLOS — Adapter adalah OBJEK EKSPLISIT (bukan logic tersembunyi) yang MENANDAI PERSIS di mana Determinism Boundary berada (Adapter = titik translasi = titik di mana jaminan CECEP berhenti dan mulai bergantung asumsi tentang format eksternal). (ii) LOLOS — Adapter adalah KOMPONEN DI DALAM Integration Strategy (§ 17 Kandidat B), bukan Strategy baru — konsisten "satu Capability CAP-013, banyak Strategy, tiap Strategy punya Adapter sendiri". (iii) LOLOS — Adapter milik SATU Strategy, berubah/diuji independen, tidak mempengaruhi Strategy/Adapter lain. (iv) LOLOS — tidak memaksa model bersama yang belum terbukti perlu, TAPI (dicatat eksplisit) TIDAK MENUTUP kemungkinan Kandidat B (model bersama) diperkenalkan NANTI kalau jumlah target eksternal bertambah dan pola sharing terbukti nyata — ini konsisten prinsip "jangan desain untuk hipotesis masa depan" yang sudah dipegang sejak awal sesi CECEP.

**Hasil Decision Competition: Kandidat C menang** — Adapter sebagai objek eksplisit di dalam tiap Integration Strategy, TANPA model perantara bersama untuk saat ini (Kandidat B dicatat sebagai evolusi SAH di masa depan, bukan ditolak permanen — beda dari Kandidat A/D yang gugur karena kontradiksi struktural).

**Struktur konkret:**

```
Integration Strategy {
  ...
  adapter: {
    maps_from:  Canonical Information Contract fields (sisi CECEP)
    maps_to:    format target eksternal (sisi lain Determinism Boundary)
    version:    [konsisten Everything is Versioned, `04` § 1 — adapter berubah = versi baru]
  }
}
```

**Diuji Discovery Completion Test:** Five Truth Layers — tidak. Ownership — tidak (Adapter tetap bagian CAP-013, tidak menciptakan ownership baru). Replay — Adapter version perlu tercatat untuk Replay Computed Data via Integration tetap bisa dijelaskan (`08h` § C.2, Replay-by-Retrieve — snapshot harus tahu adapter versi berapa yang menghasilkannya) — KONSISTEN dengan yang sudah ada, memperkaya bukan mengubah. Contract — mengisi domain yang belum didesain (`03b` ACL "diidentifikasi perlu, belum didesain"), bukan mengubah yang dikunci. Version — Adapter versioning adalah penerapan prinsip yang sudah ada. Structure — tidak. **Aman pada semua enam sumbu.**

---

## 21. Ringkasan — Delapan Item `10` § 4 Terjawab

| # | Item | Status | Hasil Decision Competition |
|---|---|---|---|
| 1 | Integration Contract (CAP-013) | ✅ Terjawab | § 17 — Strategy Pattern, meniru CAP-006 |
| 2 | Event Join Semantics | ✅ Terjawab | § 18 — Join Policy deklaratif per Integration Point (ANY/ALL/QUORUM) |
| 3 | Event Contract Versioning | ✅ Terjawab | § 19 — otomatis terjawab lewat elemen Version di Payload Contract |
| 4 | Payload Contract 3 event baru | ✅ Terjawab | § 19 — 8 dari 11 elemen Canonical Information Contract |
| 5 | Timeout konkret | ✅ Terjawab | § 16 — kelas Uncertainty Window, bukan Criticality |
| 6 | Delivery Guarantee | ✅ Terjawab | § 14.2 — fungsi dari Reconciliation, diuji ulang lewat 6 kandidat pesaing |
| 7 | External Adapter pattern | ✅ Terjawab | § 20 — Adapter per Strategy, model bersama ditunda sampai terbukti perlu |
| 8 | Contract Negotiation | ✅ Terjawab | § 14.4 — kasus khusus kegagalan Reconciliation, bukan mekanisme baru |

**Delapan dari delapan item wajib Transition Brief (`10` § 4) terjawab.** Setiap keputusan lahir dari Decision Competition (minimal 3, sampai 8 kandidat diuji per keputusan) — bukan kandidat pertama yang ditulis lalu dipertahankan. Satu Open Question baru muncul dari § 18 (Replay untuk QUORUM time-sensitive) dan dua dari § 17 (Versioning Integration Strategy) — dicatat eksplisit, bukan diasumsikan selesai.

---

## Assumptions (Tambahan § 18-20)

10. Join Policy tiga-nilai (ANY/ALL/QUORUM, § 18) diasumsikan cukup — kalau ditemukan kebutuhan kelima (mis. "ANY tapi dengan prioritas Producer tertentu"), itu perluasan field, bukan perubahan struktural.
11. Payload Contract 8-dari-11-elemen (§ 19) diasumsikan berlaku SAMA untuk SEMUA event baru masa depan (bukan hanya tiga yang sudah ada) — karena alasannya berbasis Classification (Event Data), bukan spesifik ke tiga event ini.
12. Adapter tanpa model perantara bersama (§ 20) diasumsikan cukup untuk DUA target yang diketahui (Gap-1/Gap-2) — kalau Phase H lanjutan menemukan target ketiga/keempat dengan pola serupa, Kandidat B (model bersama) perlu diuji ulang sebagai evolusi, bukan ditolak lagi dari nol.

## Open Questions (Tambahan)

7. **Replay untuk Join Policy QUORUM time-sensitive (§ 18)** — apakah Replay perlu mencatat urutan/waktu relatif kedatangan Producer, atau cukup mencatat SET Producer yang terpenuhi? Butuh diuji lebih lanjut sebelum QUORUM benar-benar dipakai (saat ini QUORUM masih "sah secara struktural, tanpa instance nyata" — konsisten § 11.1 pola Equivalent/Independent).
8. Versioning Integration Strategy (§ 17 Open Question #5, diulang di sini karena relevan langsung ke § 20 Adapter Versioning) — perlu diputuskan sebelum Integration Strategy pertama (untuk Gap-1/Gap-2) benar-benar diimplementasikan.

## 22. Integration Point sebagai Enterprise Asset — Asset Model (Koreksi Founder)

**Koreksi founder: § 16-20 mendesain FIELD-FIELD Integration Point (`uncertainty_class`, `join_policy`, `adapter`) tanpa pernah menjawab pertanyaan lebih dasar — Integration Point itu SENDIRI objek apa? Persis pola yang terjadi pada Rule (mendesain `08c` dulu, baru sadar butuh `08d`-`08h` untuk menjawab "Rule itu apa"). Dikerjakan di sini sebagai lanjutan Discovery/Philosophy — BUKAN discovery baru berdiri sendiri (Discovery Granularity Rule `04` § 16 tetap berlaku: ini pertanyaan tentang OBJEK YANG SUDAH SEDANG DIDESAIN, bukan ontologi baru yang tidak terkait).**

### 22.1 Meta Model — Apakah Integration Point Sama dengan Rule (Executable Knowledge Model)?

**Diuji dengan alat uji yang SUDAH disahkan (§ 8.1 — kontradiksi-jika-disamakan, bukan inheritance) dan Test of Equivalence (§ 12) — dua alat uji independen, konsisten disiplin yang sudah terbukti untuk Integration-vs-Orchestration.**

**Test of Difference (§ 8.1):** Properti P = Determinism (sama seperti diuji untuk Integration vs Orchestration, § 9). Apakah memaksa Integration Point py Determinism sama seperti Rule merusak definisinya? **Integration Point BUKAN Rule** — Integration Point BUKAN "keputusan orkestrasi" (trigger/condition/action), ia adalah **DEKLARASI TENTANG SATU TITIK SERAH KONKRET** (§ 14.1) dengan karakteristiknya sendiri (uncertainty_class, join_policy, adapter). Rule MEMANGGIL Integration Point (lewat action, § 17), tapi Integration Point BUKAN Rule yang dipanggil — ia lebih dekat ke **DATA KONFIGURASI YANG DIRUJUK Rule**, sama seperti Rule merujuk Formula tapi Rule bukan Formula.

**Test of Equivalence (§ 12):** Untuk SETIAP properti Rule (`08a` § I: trigger/condition/action/failure_policy/timeout/version + metadata), adakah padanan PERSIS di Integration Point? Diperiksa: Integration Point TIDAK punya `condition` (ia bukan sesuatu yang "dievaluasi TRUE/FALSE" — ia adalah TARGET yang dipanggil). Integration Point TIDAK punya `trigger` (ia tidak "terpicu oleh event" — ia DIPANGGIL oleh Rule yang triggernya event). **Residual property ditemukan di kedua arah — GAGAL Equivalence, dikonfirmasi BUKAN Rule.**

**Diuji apakah Integration Point adalah bentuk KETIGA dari Executable Knowledge Model (menyusul Formula, Rule):** Diperiksa terhadap definisi Executable Knowledge Model (`08e` § B: "representasi terstruktur non-kode, DIEKSEKUSI Engine generik"). **Apakah Integration Point "dieksekusi"?** Tidak dengan sendirinya — Integration Point adalah DATA yang DIBACA oleh Integration Strategy (§ 17) untuk menentukan CARA memanggil target eksternal. Ia lebih pasif dari Rule/Formula (yang keduanya AKTIF dieksekusi Engine). **Kesimpulan: Integration Point BUKAN bentuk ketiga Executable Knowledge Model** — ia kategori BERBEDA: **Configuration Data murni** (`08g` § A.11 — "aturan yang mengatur PERILAKU sistem, bukan isi bisnis, TANPA kekayaan perilaku tambahan Executable Knowledge Model") — TEPAT kategori yang `08e` § A.2 tolak untuk Rule (karena Rule py lifecycle/testing/replay/audit selengkap Formula), TAPI kategori itu SAH untuk sesuatu yang memang tidak butuh eksekusi aktif seperti Integration Point.

**Tapi... apakah Integration Point benar-benar TIDAK butuh Lifecycle/Testing/Audit selengkap Rule?** Diperiksa lebih dalam di § 22.2-22.4 sebelum kesimpulan "Configuration Data murni" diterima — jangan diasumsikan dari analogi permukaan.

### 22.2 Lifecycle Integration Point — Decision Competition

**Ruang kandidat:**
- **Kandidat A — Tidak perlu Lifecycle terpisah** (Integration Point hidup-mati mengikuti Lifecycle Rule yang memanggilnya, `08a` § J).
- **Kandidat B — Lifecycle identik Rule** (Draft→Testing→Approved→Published→Superseded→Deprecated→Archived, disalin utuh).
- **Kandidat C — Lifecycle lebih sederhana, disesuaikan sifat Integration Point** (mis. Draft→Active→Deprecated, tiga status seperti Configuration Data generik `08g` § A.11).

**Kriteria uji:** (i) Konsisten dengan temuan § 22.1 (Configuration Data, BUKAN Executable Knowledge Model). (ii) Integration Point BISA dipakai lebih dari satu Rule (banyak Rule memanggil target eksternal yang sama) — Lifecycle-nya harus independen dari Lifecycle SATU Rule tertentu. (iii) Perubahan skema eksternal (Contract Negotiation, § 14.4) butuh Integration Point BISA berubah TANPA mengubah Rule yang memanggilnya — butuh status transisi sendiri.

**Diuji:**
- **Kandidat A:** (ii) GAGAL LANGSUNG — kalau tiga Rule berbeda memanggil Integration Point yang sama (target eksternal sama), Integration Point tidak bisa "hidup-mati" mengikuti SALAH SATU dari tiga Rule itu — pertanyaan "ikut Rule yang mana" tidak terjawab. **Gugur.**
- **Kandidat B (identik Rule, 7 status):** (i) diperiksa — tujuh status Rule (termasuk Testing formal dengan Test Case wajib, `08a` § S) dirancang untuk objek yang DIEKSEKUSI dan perlu dibuktikan perilakunya lewat skenario Given-Event-Expected-Action. Integration Point, sebagai Configuration Data (§ 22.1), tidak "dieksekusi" — ia DIBACA. Testing formal ala Rule TIDAK sepenuhnya cocok (tidak ada "Expected Action" untuk sesuatu yang bukan aksi). **Berlebihan untuk sifat objeknya (over-fit) — gugur pada (i).**
- **Kandidat C (tiga status, Configuration Data generik):** (i) LOLOS — konsisten kategori yang ditemukan § 22.1. (ii) LOLOS — Draft/Active/Deprecated independen dari Rule manapun yang memanggilnya (banyak Rule bisa merujuk SATU Integration Point yang sama-sama melihat status Active). (iii) LOLOS — transisi Active→Deprecated (mis. karena skema eksternal berubah total) bisa terjadi tanpa menyentuh Rule yang memanggilnya (Rule tetap sama, hanya CAP-013 menolak execute kalau target Integration Point-nya Deprecated).

**Hasil: Kandidat C menang — TAPI diperiksa apakah tiga status CUKUP, atau perlu diperkaya (bukan otomatis diterima 3 status polos):** Diperiksa kebutuhan KONKRET dari § 14.4 (Contract Negotiation — skema eksternal berubah): butuh status TENGAH antara Active dan Deprecated yang menandai "skema berubah, TAPI belum tentu permanen, masih dicoba diperbaiki" — beda dari Deprecated yang final. **Ditambahkan status keempat: Active → Degraded (skema berubah, Adapter gagal validasi, TAPI belum diputuskan Deprecated) → kembali ke Active (kalau Adapter diperbaiki) ATAU lanjut ke Deprecated (kalau diputuskan berhenti).**

**Lifecycle final Integration Point: Draft → Active → Degraded ⇄ Active → Deprecated → Archived.**

### 22.3 Ownership Integration Point — Decision Competition

**Ruang kandidat (siapa/fungsi apa yang bertanggung jawab):**
- **Kandidat A — Business/Domain Owner** (sama seperti Rule owner, `08a` § I: "fungsi yang bertanggung jawab merancang & merawat", bukan pemilik data).
- **Kandidat B — Technical/Integration Owner** (tim yang paham detail teknis target eksternal — beda dari yang merancang KAPAN Rule dipanggil).
- **Kandidat C — Dual Ownership** (Business Owner untuk KEPUTUSAN memakai Integration Point ini, Technical Owner untuk PEMELIHARAAN Adapter/skema).
- **Kandidat D — Tidak perlu Owner terpisah** (ikut Owner CAP-013 sebagai Capability, satu Owner untuk semua Integration Point).

**Kriteria uji:** (i) Konsisten Orchestration Separation Principle (`04` § 10) — ownership TANGGUNG JAWAB PERANCANGAN, bukan ownership DATA. (ii) Realistis terhadap sifat pekerjaan nyata: siapa yang TAHU kalau skema Puraloka Suite API berubah vs siapa yang TAHU kapan bisnis butuh integrasi baru — dua keahlian berbeda. (iii) Tidak boleh menciptakan single point of failure organisasi (satu orang/tim untuk SEMUA Integration Point tanpa peduli target).

**Diuji:**
- **Kandidat D:** (ii) GAGAL — satu Owner untuk SEMUA Integration Point (Puraloka Suite API, WhatsApp, Bank, dst. — kandidat masa depan CLAUDE.md) mengasumsikan satu orang/tim paham SEMUA sistem eksternal sekaligus, tidak realistis. **Gugur.**
- **Kandidat A (Business Owner saja):** (ii) GAGAL SEBAGIAN — Business Owner (Tim Cost Engineering, pola sama Rule-001 dst.) TIDAK punya keahlian mendeteksi/reaksi terhadap skema eksternal berubah (§ 14.4). **Gugur — tidak cukup untuk tanggung jawab teknis Adapter.**
- **Kandidat B (Technical Owner saja):** (ii) GAGAL SEBAGIAN SEBALIKNYA — Technical Owner tidak punya otoritas memutuskan APAKAH integrasi ini masih relevan secara bisnis (kapan Deprecated, § 22.2). **Gugur.**
- **Kandidat C (Dual):** (i) LOLOS — dua tanggung jawab PERANCANGAN berbeda (bukan ownership data — keduanya tetap tidak "memiliki" data Puraloka Suite API). (ii) LOLOS — memisahkan keahlian bisnis (kapan/kenapa) dari keahlian teknis (bagaimana/Adapter). (iii) LOLOS — Technical Owner bisa berbeda PER Integration Point (Owner API Puraloka Suite ≠ Owner WhatsApp API nanti), mencegah single point of failure.

**Hasil: Kandidat C menang.** Struktur: `business_owner` (menentukan KAPAN/KENAPA dipakai, setara Rule owner) + `technical_owner` (bertanggung jawab Adapter/reaksi Contract Negotiation).

### 22.4 Governance — Mencegah Integration Point Loop (ERP↔CRM↔ERP)

**Diuji terhadap kekhawatiran founder konkret: apakah Integration Point A bisa memanggil Integration Point B yang memanggil balik A?**

**Diperiksa dari definisi: Integration Point (§ 22.1) BUKAN Executable — ia DIBACA Integration Strategy, TIDAK memanggil Integration Point lain secara langsung** (beda dari Rule yang BISA memicu Rule lain, `08a` § O). **Konsekuensi struktural: Integration Point TIDAK BISA membentuk cycle terhadap dirinya sendiri, KARENA ia tidak punya mekanisme "memanggil" — ia hanya DIPANGGIL (oleh Integration Strategy, yang dipanggil Rule).** Loop ERP↔CRM↔ERP yang dikhawatirkan founder, kalau terjadi, TERJADI DI LEVEL RULE (Rule-A memanggil Integration Point ke ERP, hasil balik memicu Domain Event yang memicu Rule-B yang memanggil Integration Point ke CRM, hasil balik memicu Rule-A lagi) — **INI ADALAH KASUS Infinite Cascade YANG SUDAH DIUJI DAN DIPERBAIKI di `08k` § 4** (verifikasi terhadap Event Dependency graph `08` § F, WAJIB dijalankan sebelum Rule dengan action Integration Point baru di-Approved).

**Diuji apakah mekanisme `08k` § 4 CUKUP untuk kasus lintas-sistem (bukan hanya lintas-Rule internal seperti dirancang awalnya):** Diperiksa — `08k` § 4 memverifikasi graph Domain Event YANG SUDAH ADA di Enterprise Event Catalog (`08` § F). Domain Event yang dipicu SETELAH Integration Point selesai (mis. `MaterialRequirementDraftGenerated`, § E `08c v2`) SUDAH masuk Catalog dan SUDAH tunduk verifikasi acyclic yang sama. **Mekanisme yang sudah ada CUKUP — TIDAK perlu governance BARU khusus Integration Point, karena loop yang dikhawatirkan sebenarnya adalah kasus Rule Composition/Event Dependency yang SUDAH punya pagar (`08a` § O + `08k` § 4).** Yang PERLU ditambahkan hanyalah SATU aturan eksplisit: **setiap Integration Point WAJIB dicatat sebagai node dalam graph yang sama (§ F `08` diperluas mencakup Integration Point sebagai jenis node, bukan hanya Domain Event)** — perluasan cakupan, bukan mekanisme baru (persis pola perluasan DFS ke graph gabungan yang sudah terjadi di `08k` § 3).

### 22.5 Reusability — Template Integration Point?

**Diperiksa cepat (bukan Decision Competition penuh — kriteria "bisakah saya bayangkan X yang genuinely kompetitif", `13` § 3, sudah punya preseden LANGSUNG):** Apakah Integration Point butuh Family/Template/Instance seperti Rule (`08f` § C)? **Diuji lewat pertanyaan yang sama seperti Rule-004 (`08f` § E):** Kalau nanti Company B juga butuh Integration Point ke "sistem Cashflow miliknya sendiri" (bukan Puraloka Suite) — apakah itu Instance baru dari Template yang sama, atau harus didesain dari nol? **Struktur SAMA (uncertainty_class/join_policy/adapter) berpotensi dipakai ulang, TAPI ISI Adapter PASTI berbeda total (setiap sistem eksternal punya skema sendiri) — nilai reuse-nya JAUH lebih rendah dari Rule Template (yang me-reuse LOGIC, bukan sekadar STRUKTUR field).** **Kesimpulan: Template OPSIONAL, sama seperti Rule (`08f` § D) — TIDAK dipaksa sekarang, dicatat sebagai pola yang SAH kalau kelak terbukti perlu (multi-company multi-sistem sejenis), konsisten disiplin "jangan desain untuk hipotesis masa depan".**

### 22.6 Struktur Final Integration Point (Konsolidasi § 16-20 + § 22)

```
Integration Point {
  # -- Identity & Metadata (konsisten pola Rule § I `08a`, TAPI Configuration Data bukan
  #    Executable Knowledge Model — lihat § 22.1) --
  id:                 identitas permanen
  display_name:       label manusiawi
  purpose:            tujuan bisnis titik integrasi ini
  business_owner:     fungsi yang menentukan KAPAN/KENAPA dipakai (§ 22.3)
  technical_owner:    fungsi yang bertanggung jawab Adapter/reaksi perubahan skema (§ 22.3)
  family:             opsional, untuk navigasi (§ 22.5, Template opsional)
  current_status:     Draft | Active | Degraded | Deprecated | Archived (§ 22.2)
  current_version:    konsisten Everything is Versioned (`04` § 1)

  # -- Three-Element Structure (§ 14.1) --
  handoff_description: deskripsi Titik Serah (bentuk konkret — digital/non-digital)
  uncertainty_class:   "instant" | "seconds" | "minutes" | "hours" | "unbounded" (§ 16)
  timeout_override:    opsional (§ 16)
  reconciliation_type: sinkron | async-ack | polling | none (§ 14.1, § 14.2)

  # -- Join & Payload (§ 18-19) --
  join_policy:         "any" | "all" | "quorum" (default: satu-producer)
  quorum_n:            wajib jika quorum
  payload_contract:     8-dari-11-elemen Canonical Information Contract (§ 19)

  # -- Adapter (§ 20) --
  adapter: {
    maps_from:  Canonical Information Contract fields
    maps_to:    format target eksternal
    version:    konsisten Everything is Versioned
  }
}
```

**Diuji Discovery Completion Test (untuk keseluruhan § 22):** Five Truth Layers — tidak (Integration Point tetap Layer 5, Configuration Data yang dikonsumsi Rule, tidak menciptakan layer baru). Ownership — TIDAK bertentangan, MEMPERJELAS (dual ownership konsisten Orchestration Separation, `04` § 10, tanggung jawab perancangan bukan data). Replay — Adapter version + Payload Contract version (sudah diuji § 19-20) tetap konsisten, Lifecycle Degraded status justru MEMPERKUAT Replay (snapshot lama tetap valid meski Integration Point sekarang Degraded, karena versi lama immutable). Contract — mengisi struktur yang belum ada, bukan mengubah yang dikunci. Version — konsisten. Structure — Rule Definition (`08a` § I) TIDAK berubah sama sekali (Integration Point adalah objek BARU yang dirujuk `action` Rule, bukan perubahan struktur Rule). **Aman pada semua enam sumbu — seluruh § 22 adalah PERKAYAAN, bukan perubahan baseline.**

---

## Assumptions (Tambahan § 22)

13. Kesimpulan "Integration Point = Configuration Data, BUKAN Executable Knowledge Model" (§ 22.1) diasumsikan stabil berdasarkan dua alat uji (Difference + Equivalence) — kalau Design lanjutan menemukan Integration Point butuh Testing formal ala Rule (§ S `08a`) setelah semua, itu sinyal kuat untuk menguji ulang kategori ini, bukan tanda kegagalan proses.
14. Status "Degraded" (§ 22.2, ditambahkan di luar tiga status Configuration Data generik) diasumsikan CUKUP sebagai satu status tambahan — kalau kebutuhan nyata (Design H.2/implementasi) menemukan butuh gradasi lebih halus (mis. "Degraded-Retrying" vs "Degraded-ManualReview"), itu perluasan status, bukan perubahan struktural.
15. Perluasan cakupan graph `08` § F untuk mencakup Integration Point sebagai node (§ 22.4) diasumsikan CUKUP mencegah loop lintas-sistem — kalau Stress Test H (analog `08k`) menemukan skenario loop yang lolos dari perluasan ini, itu temuan valid untuk diperbaiki di titik itu, bukan tanda § 22.4 salah arah.

## Open Questions (Tambahan)

9. Apakah dua Owner (Business + Technical, § 22.3) sudah cukup, atau proyek nyata butuh peran ketiga (mis. Security Owner untuk Integration Point yang menyentuh data sensitif — relevan kalau target masa depan termasuk Bank API, disebut CLAUDE.md)?
10. Perluasan graph `08` § F untuk mencakup Integration Point (§ 22.4) — implementasi konkretnya (bagaimana persis Integration Point "dicatat" sebagai node) BELUM didesain detail, dicatat sebagai pekerjaan Design H.2.

## Status Historis (Sebelum § 13)

**Discovery ontologis selesai empat putaran.** Putaran 1 (§ 0-5): Framing → Five Whys → Definisi Kerja → Universality Test. Putaran 2 (§ 6-7): lima kandidat posisi diuji, satu bertahan dengan alat uji yang KELAK terbukti belum sah. Putaran 3 (§ 8-10): alat uji "inheritance" ditolak, diganti alat uji kontradiksi; Reverse Proof dijalankan; Sibling didefinisikan formal — TAPI baru DUA koreksi baru (founder) mengungkap dua lubang lagi. Putaran 4 (§ 11-12, koreksi founder): (a) **Ontology Relation Discovery** dijalankan MUNDUR satu anak tangga dari yang seharusnya — sepuluh relasi diinventarisasi dari preseden nyata CECEP (bukan dikarang), Integration-Orchestration diuji terhadap SEMUA sepuluh (bukan langsung diasumsikan Sibling), sembilan gugur eksplisit, ditemukan klarifikasi penting bahwa relasi Producer/Consumer valid di LEVEL INTERAKSI sementara Sibling valid di LEVEL KATEGORI — dua pertanyaan berbeda yang sebelumnya tercampur; (b) **Test of Equivalence** dibangun sebagai sisi kedua alat uji (melengkapi Test of Difference § 8.1) — Integration-Orchestration diuji dan GAGAL Equivalence pada DUA arah independen, mengonfirmasi kesimpulan Sibling lewat jalur terpisah dari Reverse Proof. **Kesimpulan Sibling (§ 10) TIDAK BERUBAH, tapi sekarang berdiri di atas fondasi yang jauh lebih lengkap** — teruji terhadap sepuluh relasi (bukan diasumsikan satu-satunya), dan teruji dua arah (Difference + Equivalence). Philosophy H MASIH belum ditulis — empat Open Question tersisa, dua ontologis-empiris (untuk founder), dua metodologis (pekerjaan lanjutan Discovery/Design, dicatat eksplisit bukan diasumsikan selesai).
