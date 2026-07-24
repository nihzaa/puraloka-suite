# CECEP — Phase 3 Capability Boundary Validation

**Kedudukan:** Putaran validasi TERAKHIR sebelum [`35-phase3-capability-architecture.md`](35-phase3-capability-architecture.md) di-Freeze. Tidak mendesain ulang arsitektur — murni menguji batas capability yang sudah ada memakai tiga tes founder, plus satu tes tambahan (Removal Test). Hasil validasi ini memicu revisi TERTARGET ke `35` (dicatat eksplisit di § Perubahan ke `35`), bukan tulis ulang.

**Tiga tes wajib per capability:**
1. **No-UI Test:** Kalau tidak ada layar/screen sama sekali, apakah capability ini tetap ada?
2. **No-Menu Test:** Apakah ini business capability sejati, atau sekadar pengelompokan modul di menu?
3. **Removal Test:** Kalau capability ini dihapus total, aktivitas Construction Cost Engineering apa yang jadi TIDAK MUNGKIN dilakukan? (Jawaban "UI kurang rapi" = gagal, bukan capability.)

---

## A. Perhatian Khusus — Empat Capability yang Ditandai Founder

### A.1 AHSP Management vs Assembly Library

| Tes | AHSP Management | Assembly Library |
|---|---|---|
| No-UI | Tanpa layar, "cara menghitung pekerjaan berdasar referensi standar" tetap harus ada sebagai fungsi — tapi fungsi itu SAMA PERSIS dengan "menyusun resep kerja reusable" | Sama — tanpa layar, "menyusun resource+proses+durasi jadi paket reusable" tetap harus ada |
| No-Menu | **GAGAL sebagai capability terpisah** — perbedaan "AHSP Manager" vs "Assembly Manager" HANYA ada di level menu/UI. Business capability yang mendasarinya SATU: "menyediakan cara terstruktur untuk menghitung pekerjaan dari resource" | (sama alasan — keduanya satu capability) |
| Removal | Kalau "AHSP Management" dihapus TAPI "Assembly Library" tetap ada: TIDAK ADA aktivitas bisnis yang jadi mustahil — AHSP nasional/company tinggal jadi salah satu SUMBER Assembly (persis seperti sudah dijawab `03b` § A.4: "AHSP nasional/company adalah SATU jenis Assembly") | Removal Assembly Library: mustahil menyusun cara kerja apa pun, termasuk yang berbasis AHSP — capability sejati |

**Verdict:** Founder benar. Alasan "sudut pandang pengguna berbeda" di `35` adalah alasan UI, bukan alasan business capability — gagal No-Menu Test secara eksplisit. **AHSP Management BUKAN capability terpisah.** Digabung total ke dalam **Assembly Library**, dengan AHSP Nasional/Company/Project/Custom sebagai EMPAT SUMBER di dalam satu capability yang sama (persis strukturnya sudah dijawab `03b`, hanya belum diterapkan konsisten ke level Capability Map).

**Tapi ini memunculkan pertanyaan susulan yang harus dijawab sekarang, bukan ditunda:** kalau AHSP Management hilang sebagai node sendiri, apakah Price Book dan Productivity Library (juga "sumber pengetahuan konstruksi") harus ikut prinsip yang sama — digabung ke satu payung yang lebih besar? Diuji di § A.4 di bawah, karena founder sendiri menyebut ini eksplisit ("Knowledge Library" berisi Assembly/AHSP/Formula/Price Book/Template/Productivity).

### A.2 Resource Management — Capability atau Namespace?

**Tes langsung founder: apakah ini capability atau hanya wadah penampung (namespace)?**

- **No-UI Test:** Tanpa layar, apakah "Resource Management" sebagai SATU fungsi tetap perlu ada? Jawaban jujur: **tidak sebagai satu fungsi tunggal.** Yang perlu ada tanpa UI adalah: identitas Material tetap konsisten dipakai lintas Assembly/Procurement, identitas Labor tetap konsisten dipakai lintas Assembly/Payroll, dst — masing-masing PER KATEGORI, bukan satu fungsi "Resource Management" yang menaungi semua.
- **No-Menu Test:** Ini **namespace**, bukan capability. "Resource Management" adalah nama yang enak dipakai sebagai judul menu (satu tempat CRUD semua resource), tapi business capability yang mendasarinya berbeda per kategori: kemampuan bisnis "mendata material" (dipakai Procurement) beda konsekuensi dari kemampuan bisnis "mendata tenaga kerja" (dipakai Payroll/HR) beda lagi dari "mendata alat" (dipakai Asset Management existing, `assets` table sudah ada di Phase A).
- **Removal Test:** Kalau "Resource Management" (sebagai satu capability) dihapus total — pertanyaannya jadi tidak valid, karena tidak ada SATU aktivitas yang gagal; yang gagal adalah tiga-empat aktivitas BERBEDA (tidak bisa estimasi material, tidak bisa estimasi tenaga kerja, dst) yang kebetulan sekarang digabung jadi satu nama.

**Verdict:** Founder benar dari arah BERLAWANAN dengan koreksi awal saya di `35` — bukan berarti Material/Labor/Equipment harus dipecah balik jadi tiga capability sejajar (itu tetap salah, karena RBS `03b` § A.5 memang SATU Registry secara domain), tapi **"Resource Management" sebagai NAMA CAPABILITY tunggal menyembunyikan bahwa domainnya satu (RBS Registry) sementara business capability-nya (dampak ke aktivitas bisnis) berbeda per kategori.**

**Resolusi:** Pisahkan level Capability dari level Domain secara eksplisit (ini justru kasus paling jernih untuk membedakan keduanya, persis kekhawatiran founder di § 1):
- **Domain (Fase 6, tidak berubah):** RBS Registry — SATU Aggregate Root, kategori sebagai atribut. Ini tetap benar secara data model.
- **Capability (Fase 3, direvisi):** **BUKAN satu "Resource Management"** — dipecah jadi capability yang mengikuti dampak bisnis nyata: **Resource Identity** (capability tunggal: "menjamin satu resource = satu identitas lintas seluruh CECEP", ini yang sejalan dengan alasan RBS ada) TETAP satu capability karena Removal Test-nya jelas (hapus ini → Material yang sama punya ID berbeda di Assembly vs Procurement, persis masalah duplikasi yang First Principle 2 tolak). Named jadi **"Resource Identity"**, bukan "Resource Management" — nama lama menyiratkan cakupan operasional (planning, procurement) yang sebenarnya BUKAN tanggung jawab capability ini; capability ini HANYA soal identitas, bukan soal perencanaan pemakaian resource (itu bagian dari RAP Builder dan Procurement Planning, capability lain yang sudah ada).

### A.3 Historical Cost Intelligence

- **No-UI Test:** Tanpa layar, apakah "menutup siklus proyek jadi pengetahuan" tetap perlu ada sebagai fungsi? **Ya** — ini justru fungsi yang PALING tidak bergantung UI, karena intinya adalah WRITE ACCESS otomatis ke Assembly/Price Book/Productivity (`03b` § A.12), bukan aktivitas yang dilakukan manusia lewat layar.
- **No-Menu Test:** Ini bukan pengelompokan menu — tidak ada "menu" natural untuk ini selain form evaluasi proyek, dan formnya BUKAN capability-nya (capability-nya adalah loop otomatis di baliknya).
- **Removal Test:** Kalau dihapus: perusahaan KEMBALI ke kondisi `01` § 3/§ 8 — Company AHSP tetap nol selamanya, setiap proyek mulai dari nol pengetahuan lagi. Ini PERSIS masalah inti yang jadi alasan CECEP dibangun (`01` Foundational Principle Pertama).

**Verdict:** Lolos ketiga tes dengan sangat kuat — capability paling valid di seluruh Capability Map. **Tapi founder benar bahwa representasinya di `35` kurang** — ditulis sebagai satu node datar ("Historical Cost Intelligence"), padahal isinya adalah SEBUAH SIKLUS dengan tahapan yang masing-masing berbeda tanggung jawab. Ini bukan masalah boundary (sudah benar sebagai satu capability), tapi masalah KEDALAMAN REPRESENTASI — ditangani di § C di bawah, terpisah dari revisi boundary.

### A.4 Susulan dari A.1 — Apakah Price Book dan Productivity Library Juga Harus Melebur?

Founder secara eksplisit menyebut "Knowledge Library" berisi Assembly, AHSP, Formula, Price Book, Template, Productivity — ini perlu diuji, bukan diasumsikan otomatis benar hanya karena disebut founder (kalau diasumsikan otomatis, itu sendiri melanggar disiplin evidence-based yang sudah dipegang sepanjang audit).

- **No-UI/No-Menu Test untuk Price Book vs Assembly Library:** Apakah "harga" dan "cara mengerjakan" adalah SATU business capability? **Tidak** — `02` § 4 eksplisit: *"AHSP = cara menghitung. Price Book = harga... Karena harga adalah knowledge. Bukan angka."* Dua kalimat ini SENGAJA memisahkan keduanya sebagai dua jenis pengetahuan berbeda, bukan kebetulan berdekatan. Removal Test: hapus Price Book, Assembly Library TETAP bisa menjawab "bagaimana cara mengerjakan" — hanya tidak tahu "berapa biayanya". Dua kegagalan yang BERBEDA jenisnya (satu soal metode, satu soal knowledge harga) → **tetap dua capability terpisah.**
- **Productivity Library vs Assembly Library:** Sama pola — Removal Test: hapus Productivity Library, Assembly masih bisa mendefinisikan URUTAN kerja, hanya tidak tahu durasi/crew size aktual. Beda kegagalan → **tetap terpisah.**
- **Formula Engine vs Assembly Library:** `03b` § A.7 sudah eksplisit menjawab ini ("Apakah Formula milik Company AHSP? TIDAK — Domain Service independen yang dipanggil"). Sudah benar di `35` sebagai Calculation Strategy (cross-cutting) — tidak berubah.

**Verdict A.4:** Founder benar bahwa AHSP+Assembly harus melebur (karena keduanya SAMA — beda nama untuk hal identik). Founder-nya sendiri TIDAK menyatakan Price Book/Productivity juga harus melebur (hanya menyebutnya dalam satu contoh ilustratif "Knowledge Library"); diuji terpisah di sini dan hasilnya: **Price Book dan Productivity Library TETAP capability terpisah** — karena Removal Test membuktikan kegagalannya berbeda jenis, bukan karena kebetulan sama-sama "pengetahuan". Ini contoh konkret kenapa tes harus dijalankan satu-satu, bukan digeneralisasi dari satu contoh.

---

## B. Sweep Tiga-Tes untuk 13 Capability Lain (Kelengkapan)

| Capability | No-UI | No-Menu | Removal | Verdict |
|---|---|---|---|---|
| Tender Estimation | Ya, tetap perlu (jenis Scenario dengan tujuan spesifik) | Business capability sejati — beda tujuan dari RAP (penawaran vs target internal), bukan beda menu | Hapus → tidak bisa membuat penawaran terstruktur ke klien | ✅ Tetap |
| RAB Builder | Ya (tampilan breakdown biaya tetap perlu ada sebagai KONSEP, walau derived) | Sejati — RAB punya audiens/tujuan berbeda dari Estimate Item mentah | Hapus → tidak ada dokumen breakdown biaya untuk klien/internal | ✅ Tetap |
| RAP Builder | Ya | Sejati — beda tujuan (target internal) dari RAB (penawaran) | Hapus → kembali ke `RAB × margin%`, gap finansial `01` §3 muncul lagi | ✅ Tetap |
| Price Book | Ya | Sejati (lihat A.4) | Hapus → tidak ada sumber harga terstruktur, kembali ke `unit_price` tunggal | ✅ Tetap |
| Productivity Library | Ya | Sejati (lihat A.4) | Hapus → Formula pakai angka nasional selamanya, tidak pernah company-specific | ✅ Tetap |
| Calculation Strategy | Ya (fungsi pemilihan strategi tetap perlu, lepas dari UI) | Sejati, cross-cutting Domain Service — bukan menu | Hapus → tidak bisa AHSP ganda per work item (`01` §1, kebutuhan operasional nyata) | ✅ Tetap |
| Budget Baseline | Ya (konsep "target biaya dikunci" tetap perlu) | **Marginal** — secara TEKNIS ini murni flag pada Estimate Version (`03b` §C.1), tapi Removal Test tetap kuat: hapus → tidak ada titik acuan tunggal untuk EVM/Cost Control | ✅ Tetap, sebagai capability TIPIS (thin capability) — dicatat eksplisit bukan capability tebal seperti RAB/RAP |
| Procurement Planning | Ya | Sejati — beda dari Procurement eksekusi (existing, matang di Phase A) | Hapus → Material Requirement tetap manual, tidak diturunkan dari Assembly (`03` §7 root cause) | ✅ Tetap |
| Cost Control | Ya | Sejati | Hapus → EVM baseline salah (pakai RAB bukan RAP, `03` §6 root cause) | ✅ Tetap |
| Cashflow Forecast | Ya | Sejati | Hapus → tidak ada proyeksi kas ke depan, hanya aktual | ✅ Tetap |
| AI Estimation | Ya (sebagai kebutuhan bisnis, isi ditunda Fase 10) | Sejati — beda arah data dari AI Recommendation (lihat `35` §19) | Hapus → estimasi dari dokumen tetap 100% manual | ✅ Tetap, isi tetap ditunda |
| AI Recommendation | Ya | Sejati | Hapus → tidak ada saran berbasis histori, AI Learning Loop putus | ✅ Tetap, isi tetap ditunda |
| BOQ (turunan RAB) | Ya (sebagai KONSEP tampilan) | Sudah benar diklasifikasi sebagai turunan, bukan node sejajar — tidak berubah | Hapus → tidak ada dokumen quantity-only untuk tender ke supplier | ✅ Tetap sebagai turunan (tidak berubah dari `35`) |

**Hasil sweep:** 13 dari 13 capability lain LULUS tanpa perubahan boundary — validasi ini mengonfirmasi bagian `35` yang sudah benar, bukan cuma mencari kesalahan. Satu catatan baru: **Budget Baseline ditandai eksplisit sebagai "thin capability"** (lolos tes tapi lebih tipis dari yang lain) — dicatat supaya Fase 6 tidak salah memberinya bobot desain setara RAB/RAP.

---

## C. Intelligence Loop — Representasi Siklus (Bukan Masalah Boundary)

Founder benar bahwa `35` menulis "Historical Cost Intelligence" sebagai satu node datar padahal ia SEBUAH SIKLUS. Ini ditangani terpisah dari revisi boundary karena sifatnya berbeda: bukan soal "apakah ini capability yang benar", tapi "apakah representasinya cukup dalam untuk dipakai Fase 6".

### Siklus Intelligence Loop (diverifikasi terhadap sumber, bukan ditulis bebas)

```
Estimate (Approved)
    ↓
Execution (existing Puraloka Suite — progress, actual cost)
    ↓
Actual Cost (via ACL, `03b` §Anti-Corruption Layer)
    ↓
Variance (Actual vs Estimate/RAP — `03b` §A.12, Domain Event: VarianceCalculated)
    ↓
Root Cause (`03b` §A.12, Domain Event: RootCauseIdentified — WAJIB, bukan opsional,
             First Principle 1 `03`: bukan sekadar catat variance)
    ↓
Lessons Learned (Draft → Under Review → Approved, via Configurable Approval Workflow
                  `02` §10 — "AI tidak boleh langsung belajar. Harus ada approval.")
    ↓
Knowledge Update — TIGA TARGET SERENTAK saat status jadi "Propagated"
(`03b` §A.12 Domain Event: LessonsLearnedPropagated):
    ├──→ Assembly/AHSP Update (Company AHSP naik versi)
    ├──→ Price Book Update (Company Price Book entry baru/direvisi)
    └──→ Productivity Library Update (Productivity Record diperbarui dari data aktual)
    ↓
AI Learning (AI Recommendation dan/atau AI Estimation mengonsumsi data yang sudah
             diperbarui — `02` §11, "konsumen akhir" loop; isi detail tetap ditunda Fase 10)
    ↓
Next Estimate (lebih akurat — menutup loop, `01` Foundational Principle Pertama)
```

**Perbedaan dengan draf founder:** Struktur intinya identik dengan yang founder tulis. Satu detail ditambahkan dari sumber yang sudah ada (bukan dikarang): titik "Knowledge Update" BUKAN satu langkah tunggal — ia MENULIS KE TIGA target berbeda secara serentak (Assembly, Price Book, Productivity), bukan satu "Knowledge Update" generik lalu "Price Book Update" dan "Formula Update" sebagai langkah terpisah sesudahnya. Ini penting untuk Fase 6: ketiga write itu terjadi dalam SATU Domain Event (`LessonsLearnedPropagated`), bukan tiga event berurutan — kalau digambar sebagai rantai linear (seperti draf awal founder), Fase 6 berisiko mendesainnya sebagai tiga langkah sekuensial padahal seharusnya satu transaksi/reaksi serentak.

**Catatan "Formula Update" di draf founder:** Formula Engine (`03b` §A.7) sendiri TIDAK termasuk dalam tiga target `LessonsLearnedPropagated` menurut `03b` — yang diperbarui adalah Productivity Record (parameter yang DIPAKAI Formula), bukan Formula itu sendiri (definisi formula matematis, mis. `Volume = P×L×T`, tidak berubah karena hasil proyek; yang berubah adalah ANGKA produktivitas yang jadi input formula). Dicatat sebagai koreksi kecil terhadap draf founder, bukan diam-diam diikuti — konsisten dengan disiplin "jangan asumsikan benar hanya karena founder yang menulis" yang sudah dipegang sejak `29`.

---

## Perubahan ke `35` (Tertarget, Bukan Tulis Ulang)

1. **Capability #3 (AHSP Management) DIHAPUS sebagai node terpisah** — dilebur total ke **Capability #8 (Assembly Library)**, dengan AHSP Nasional/Company/Project/Custom sebagai empat sumber di dalamnya. Capability Map berkurang dari 17 jadi 16.
2. **Capability #5 (Resource Management) DIGANTI NAMA jadi "Resource Identity"**, dengan cakupan dipersempit eksplisit ke soal identitas lintas domain (bukan operasional/planning) — mencegah kesan capability ini "menaungi semua hal soal resource" seperti kekhawatiran founder.
3. **Capability #11 (Budget Baseline) ditandai eksplisit sebagai "thin capability"** — lolos tes tapi dicatat berbeda bobot dari RAB/RAP untuk kepentingan Fase 6.
4. **Capability #17 (Historical Cost Intelligence) diperkaya dengan diagram siklus penuh** (§ C di atas) — boundary-nya tidak berubah (tetap satu capability, lolos tiga tes dengan kuat), tapi representasinya sekarang menunjukkan sembilan tahap dengan titik percabangan tiga-target yang eksplisit, bukan satu node datar.

Revisi INI akan diterapkan ke `35` sebagai update terstruktur (bukan file baru menggantikan `35`) segera setelah divalidasi — ditahan dulu di sini sesuai instruksi founder ("do not redesign, only validate before freeze") sampai ada konfirmasi.

## Definition of Done Self-Check untuk Validasi Ini

| Kriteria (`34`) | Status |
|---|---|
| Setiap keputusan boundary balik ke evidence sumber (`01`/`02`/`03b`), bukan preferensi | ✓ — setiap Removal Test mengutip pasal/section sumber |
| Tidak ada boundary diterima "karena founder bilang begitu" tanpa uji ulang | ✓ — § A.4 dan catatan Formula Update eksplisit menguji, bukan mengikuti buta |
| Tidak redesign arsitektur di luar scope validasi | ✓ — Domain Model (Fase 6) tidak disentuh, hanya Capability Map |

---

## 🔒 STATUS: FROZEN PERMANENTLY

Keempat perubahan di § "Perubahan ke `35`" sudah diterapkan ke [`35`](35-phase3-capability-architecture.md). Phase 3 di-Freeze permanen bersama `35`, [`37`](37-phase3-capability-interaction-map.md), [`38`](38-phase3-domain-readiness-assessment.md).
