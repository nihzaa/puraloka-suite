# CECEP — Evidence Hierarchy

**Kedudukan:** Lapisan governance TERAKHIR sebelum Fase 5 dimulai — melengkapi (bukan mengganti) [`40-architecture-derivation-constitution.md`](40-architecture-derivation-constitution.md). `40` menetapkan BAHWA setiap keputusan harus diderivasi lewat rantai `Mission → Capability → Interaction → Business Need`. Dokumen ini menjawab pertanyaan yang belum dijawab `40`: rantai itu punya berapa mata rantai persisnya, apa urutannya, dan bagaimana Trace Status (✓/⚠️/❌) DIHITUNG per mata rantai — bukan dinilai kasar sebagai satu blok.
**Kenapa perlu:** Tanpa level eksplisit, "Fully Derived" bisa berarti berbeda-beda tergantung siapa yang menilai. Dengan 10 level bernomor, penilaian jadi mekanis: hitung berapa level yang ✓, kalau ada yang ✗ di tengah rantai, keputusan itu TIDAK bisa lahir sampai level yang putus itu diperbaiki atau di-ADR-kan.

---

## Sepuluh Level

```
Level 1  — Mission                  (01/02: apa CECEP dan untuk siapa)
Level 2  — Business Vision           (01: profil Puraloka Persada, General Contractor)
Level 3  — Construction Process      (01 §8, 03: lifecycle Tender→...→Lessons Learned)
Level 4  — Capability                (35: 16 capability Frozen)
Level 5  — Capability Interaction    (37: Input→Transformation→Output→Consumer)
Level 6  — Business Responsibility   (40: "tanggung jawab apa yang harus dijaga konsisten")
Level 7  — Derived Domain            (Aggregate Root/Entity — hasil Fase 6, BUKAN 03b mentah)
Level 8  — Entity/Value Object       (turunan Level 7 — atribut, identitas vs nilai)
Level 9  — Database                  (Fase 7, skema konseptual)
Level 10 — Implementation            (Fase 11-12, kode/API/UI riil)
```

**Catatan posisi `03b` dalam hierarki ini:** `03b` (Discovery Complete) BUKAN satu level tersendiri — ia adalah EVIDENCE yang membantu mengisi Level 6/7 (Business Responsibility dan Derived Domain), sama seperti `01`/`02`/`03` adalah evidence untuk Level 1-3. Tidak ada level yang "adalah `03b`" — ini penegasan ulang koreksi sebelumnya (`32` Fase 6) dalam bentuk yang lebih presisi.

---

## Cara Kerja: Per-Mata-Rantai, Bukan Sekali Nilai

Untuk SETIAP keputusan desain (Aggregate Root, Entity, Value Object, field penting), setiap Level 1-6 (fondasi non-negotiable sebelum Level 7 boleh lahir) dicek satu per satu — bukan dinilai sebagai satu blok "sudah cukup jelas".

### Contoh 1 — Aggregate Root: Estimate Version

```
Level 1 Mission               ✓  (01 §PRINSIP BESAR: siklus penuh estimasi-ke-pembelajaran)
Level 2 Business Vision        ✓  (01 §0: General Contractor butuh multi-scenario estimasi)
Level 3 Construction Process   ✓  (01 §8: Tender/Engineer/Owner Estimate sbg output eksplisit)
Level 4 Capability             ✓  (35 #1 Tender Estimation, #9/#10 RAB/RAP Builder)
Level 5 Capability Interaction ✓  (37 §1/§3/§4: Estimate Version sbg Output eksplisit)
Level 6 Business Responsibility ✓ (03b §Aggregate Root: "total biaya, status approval, dan
                                    validasi konsistensi Estimate Item harus dijaga bersama")
Level 7 Derived Domain          ✓  → Aggregate Root: Estimate Version

Trace Status: ✓ FULLY DERIVED
```

### Contoh 2 — Value Object Hipotetis: Risk Register Entry (ilustrasi mata rantai putus)

```
Level 1 Mission                 ✓  (01 §3.2: contingency = gap finansial paling berbahaya)
Level 2 Business Vision         ✓  (01 §0: proyek General Contractor perlu buffer risiko)
Level 3 Construction Process    ✓  (01 §3.3: risk allowance disebut eksplisit)
Level 4 Capability              ✓  (35 #4 RAP Builder menyebutnya sebagai komponen)
Level 5 Capability Interaction  ✓  (37 §4: RAP Builder input mencakup "Risk Allowance")
Level 6 Business Responsibility ✗  (03b §B.3: BENTUK domain belum diputuskan — "domain
                                     formal atau catatan di Estimate Version?" masih terbuka)

Trace Status: ⚠️ REQUIRES ADR
```

**Yang terjadi begitu Level 6 gagal:** Level 7 (Derived Domain) TIDAK BOLEH ditulis sampai Level 6 diperbaiki lewat ADR. Ini persis kasus RAP Risk Register yang sudah ditandai `38` — sekarang mekanismenya eksplisit KENAPA ia berstatus ⚠️, bukan cuma "belum final".

### Contoh 3 — Konsep Terlarang: AI Knowledge Graph (ilustrasi Invented)

```
Level 1 Mission                 ✓  (01: AI Estimation disebut, tapi hanya vision level)
Level 2 Business Vision         ✓
Level 3 Construction Process    ✓  (01 §11: input Excel/PDF/DWG disebut)
Level 4 Capability              ✗  (35: TIDAK ADA capability bernama/setara "Knowledge Graph"
                                     — AI Estimation/AI Recommendation ada, tapi isinya
                                     sengaja ditunda ke Fase 10, bukan "Knowledge Graph")

Trace Status: ❌ INVENTED
```

**Yang terjadi:** Berhenti di Level 4. TIDAK lanjut ke Level 5-7 sama sekali. Konsep ini tidak masuk dokumen final dalam bentuk apa pun sampai ada ADR yang secara eksplisit menambahkannya ke Capability Map (`35`) — yang berarti membuka kembali Fase 3 yang sudah Frozen Permanently, sebuah keputusan besar yang jauh melebihi lingkup satu Entity.

---

## Aturan Perhitungan Trace Status (Formal)

- **✓ Fully Derived:** Level 1 sampai Level 6 SEMUA ✓, DAN Level 7 bisa ditunjuk eksplisit dari Level 6.
- **⚠️ Requires ADR:** Level 1 sampai level tertentu ✓, tapi ada SATU level (paling sering Level 6 — Business Responsibility, atau Level 4 — Capability kalau capability-nya sendiri belum final) yang belum bisa dijawab tegas. Dicatat dengan level persis mana yang gagal, bukan disamaratakan "belum jelas".
- **❌ Invented:** Ada level (paling sering Level 4 — Capability) yang GAGAL total — tidak ada evidence apa pun mendukungnya. Tidak lanjut ke level berikutnya sama sekali.

**Prinsip inti:** Mata rantai dicek BERURUTAN dari Level 1. Begitu satu level gagal, level-level setelahnya TIDAK DIPERIKSA (karena tidak relevan — kalau fondasinya sudah putus, memeriksa level di atasnya hanya membuang waktu). Ini mencegah pola lama di mana sebuah konsep "terasa didukung" karena satu-dua level di tengah terlihat kuat, padahal level yang lebih dasar sebenarnya kosong.

**Catatan interpretasi (bukan perubahan aturan di atas — cara membaca "✓" pada tiap level dengan benar):** Sebuah level dinyatakan ✓ apabila didukung evidence, baik evidence itu berupa kutipan langsung MAUPUN berupa konsekuensi yang tidak terhindarkan dari requirement Frozen (mis. Foundational Principle Ketiga "Everything is Versioned" tidak pernah menulis kata "Version Record", tapi tanpa mekanisme penyimpanan versi requirement itu mustahil dipenuhi — level tersebut tetap sah ✓). Ini bukan level status baru dan bukan pelonggaran aturan — ini penegasan bahwa "evidence" pada setiap Level 1-6 tidak disempitkan jadi "kutipan verbatim saja", konsisten dengan Rule 2 `40` yang sejak awal berbicara soal rantai *kebutuhan* (Mission→Capability→Interaction→Business Need), bukan rantai kata-per-kata. Kalau sebuah konsep TIDAK lolos uji ini (dihapus pun tidak membuat requirement Frozen manapun gagal terpenuhi, ia hanya "terasa masuk akal"), level itu tetap gagal dan mengarah ke ⚠️/❌ seperti biasa.

---

## Format Wajib di Setiap Dokumen Fase 5+

Melengkapi format Derivation Trace di [`34`](34-roadmap-definition-of-done.md), setiap keputusan desain sekarang WAJIB memuat rantai 10-level (atau sampai level gagal ditemukan), bukan hanya lima centang generik:

```
Aggregate Root: [Nama]
Level 1 Mission                 ✓/✗
Level 2 Business Vision          ✓/✗
Level 3 Construction Process     ✓/✗
Level 4 Capability               ✓/✗
Level 5 Capability Interaction   ✓/✗
Level 6 Business Responsibility  ✓/✗
Level 7 Derived Domain           [nama hasil, atau kosong kalau gagal]
Trace Status: ✓ Fully Derived / ⚠️ Requires ADR (level X) / ❌ Invented (level X)
```

---

## Hubungan dengan Dokumen Lain

- **Melengkapi `40`:** `40` menyatakan PRINSIP (harus diderivasi, jangan ditemukan). Dokumen ini menyediakan MEKANISME (10 level, cara hitung Trace Status per level).
- **Memperkuat `34`:** Kolom Trace Status di DoD sekarang punya definisi presisi — bukan penilaian subjektif "kelihatannya sudah cukup".
- **Tidak mengubah `32`:** Roadmap tetap 12 fase. Level 1-10 di sini adalah alat VERTIKAL (kedalaman evidence per keputusan), bukan pengganti struktur HORIZONTAL (urutan fase) yang sudah ada.

---

## 🔒 STATUS: EFEKTIF SEGERA

Berlaku mulai Fase 5. Wajib dipakai untuk setiap Aggregate Root/Entity/Value Object yang ditulis di Fase 5 ke atas, termasuk pekerjaan lanjutan Fase 6 (menuliskan ulang 13 domain `03b` sebagai Derived Domain, bukan salinan).

---

## GOVERNANCE LAYER CLOSED — Dokumen Ini Adalah yang TERAKHIR

**Keputusan founder, dicatat di sini secara permanen karena ini dokumen governance terakhir yang ditulis:** Lapisan governance CECEP (`29`→`30`→`31`→`32`→`33`→`34`→`39`→`40`→`41`) dinyatakan **LENGKAP dan DITUTUP**. Tidak ada dokumen governance baru (`42`, `43`, dst) ditulis, KECUALI ada kegagalan NYATA di lapangan yang tidak bisa diselesaikan oleh empat dokumen operasional berikut:

- **[`30`](30-cecep-constitution.md)** — batas SCOPE (apa yang boleh masuk CECEP)
- **[`34`](34-roadmap-definition-of-done.md)** — kriteria SELESAI
- **[`40`](40-architecture-derivation-constitution.md)** — cara PROSES (bagaimana keputusan lahir)
- **[`41`](41-evidence-hierarchy.md)** — mekanisme PENGUKURAN (10 level, dokumen ini)

Alasan eksplisit: menambah lapisan meta terus-menerus (Evidence Validation → Trace Governance → Evidence Review → Evidence Audit, dst) adalah PERSIS pola yang melahirkan drift Phase G-K (`29`) — bukan karena isinya salah, tapi karena meta-layer yang terus bertambah lambat laun menjadi produk itu sendiri, menggantikan CECEP sebagai fokus kerja.

### Aturan Baru — Business Uncertainty Test (Menggantikan Dorongan Membuat Governance Baru)

Mulai Fase 5, setiap dokumen dinilai dengan SATU pertanyaan, bukan kepatuhan metodologi semata:

> **Apakah setelah membaca dokumen ini, saya memahami CECEP lebih dalam daripada sebelumnya?**

Formal: **Business uncertainty before → Business uncertainty after.** Kalau ketidakpastian BISNIS (bagaimana AHSP dipilih, bagaimana RAP dihitung, bagaimana Cost Control bekerja) tidak turun, fase GAGAL — terlepas seberapa rapi metodologinya secara internal.

**Uji cepat, dicontohkan langsung dari founder:**
```
Sebelum baca Phase 5: "Bagaimana AHSP dipilih?" → tidak tahu
Sesudah baca, isi dokumen: "Government Strategy, Company Strategy,
  Historical Strategy, Vendor Strategy, AI Strategy" → SEKARANG TAHU
  → Business uncertainty turun → dokumen BERHASIL
```
```
Sesudah baca, isi dokumen: "Rule, Strategy, Policy, Constraint,
  Resolver, Dispatcher, Adapter, Selector" — tapi tetap tidak tahu
  bagaimana AHSP dipilih → Business uncertainty TIDAK turun
  → dokumen GAGAL, meskipun terminologinya rapi
```

**Cara pakai:** Setiap dokumen Fase 5 ke atas WAJIB menutup dengan pernyataan singkat Business Uncertainty Before/After — bukan bagian tambahan yang opsional, tapi ukuran keberhasilan utama, di ATAS DoD (`34`) delapan kriteria. DoD memastikan dokumennya benar secara struktur; Business Uncertainty Test memastikan dokumennya BERGUNA bagi CECEP sebagai platform nyata — dua ukuran yang berbeda, keduanya wajib.

**Yang TIDAK berubah:** `29`-`41` tetap berlaku penuh sebagai operating system arsitektur. Governance ditutup, bukan dibatalkan — sisa pekerjaan (Fase 5 ke atas) memakainya sebagai alat, bukan lagi menambahnya sebagai tujuan.
