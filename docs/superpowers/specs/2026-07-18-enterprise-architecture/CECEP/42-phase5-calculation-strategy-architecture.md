# CECEP — Phase 5: Calculation Strategy Architecture

**Mode:** Architecture Derivation Mode ([`40`](40-architecture-derivation-constitution.md)/[`41`](41-evidence-hierarchy.md)). Tidak ada Discovery di dokumen ini. Setiap pernyataan diuji: *"Which previously frozen artifact requires this to exist?"* — kalau tidak bisa dijawab dengan evidence eksplisit, tidak ditulis.
**Evidence yang dipakai (bukan otoritas independen):** `01` § 1 (empat sumber AHSP, Discovery Complete), `02` § Prinsip Final #6 dan § 8 Formula Engine (Discovery Complete), `35` Capability #2 Assembly Library dan #8 Calculation Strategy (Derived & Frozen), `37` § 2/§ 8 Interaction Map (Derived & Frozen).

## Derivation Summary

```
This document introduces:
- 0 new business concepts
- 6 derived concepts (Calculation Strategy Contract, Strategy Selection Rule,
  Strategy Precedence, Strategy Versioning, Fallback Rule, Strategy Audit Trail)
- 4 confirmed concepts (empat sumber AHSP dari 01 §1, dipakai sebagai instance
  konkret dari Strategy Contract — bukan didefinisikan ulang)

Every concept below is derived from previously frozen artifacts.
No new discovery is performed in this phase.
```

---

## Business Uncertainty — Before

Sebelum dokumen ini: **tidak jelas** bagaimana CECEP menentukan strategi kalkulasi mana yang dipakai untuk satu Work Item tertentu, siapa yang memutuskan, apa yang terjadi kalau strategi berubah di tengah proyek, dan bagaimana keputusan itu bisa diaudit. `01` § 1 menyebutkan EMPAT sumber (Nasional/Company/Project/Custom) ADA dan hidup berdampingan, tapi tidak menjelaskan MEKANISME pemilihannya. `02` § Prinsip Final #6 menyatakan strategi harus "plug-in dan dapat diganti" tapi tidak menjelaskan BAGAIMANA pertukaran itu terjadi secara konkret.

---

## Mandatory Derivation Chain

```
Mission (01/02) → Construction Process (01 §8) → Capability (35 #2, #8)
→ Capability Interaction (37 §2, §8) → Business Responsibility → Calculation Strategy
```

### Level 1-3 — Mission, Construction Process (evidence, tidak diulang penuh)

`01` § 6 (Cost Engineering Philosophy, dikonsolidasikan di `02`): *"The system must never assume there is only one correct way to estimate construction costs. Every calculation must be strategy-driven, versioned, explainable, and replaceable."* Ini bukan preferensi desain — ini requirement mengikat sejak Phase B, diperkuat bukti operasional nyata: Puraloka Persada SUDAH memakai AHSP Bina Marga untuk sipil/tanah dan Cipta Karya untuk bangunan gedung, **dipilih per jenis pekerjaan, bukan per proyek** (`01` § 1.1).

### Level 4 — Capability (Frozen, `35`)

Dua capability Frozen relevan langsung:
- **Capability #2 — Assembly Library** (`35`, pasca-ACR-004 mencakup AHSP): "Assembly = satu sistem tunggal, empat sumber (Nasional/Company/Project/Custom) di dalamnya."
- **Capability #8 — Calculation Strategy** (`35`): eksplisit ditandai **cross-cutting**, "dikonsumsi hampir semua capability lain, bukan capability yang berdiri sejajar dalam alur kerja linear." Business Responsibility yang sudah dicatat di `35`: "Bagaimana strategi kalkulasi berbeda dipilih PER WORK ITEM (Bina Marga vs Cipta Karya vs Custom) tanpa cabang kode."

### Level 5 — Capability Interaction (Frozen, `37`)

`37` § 8 (Calculation Strategy): *"Input: Assembly (definisi formula), Productivity Library (parameter), pilihan strategi per Work Item... Output: Hasil kalkulasi terpakai LANGSUNG oleh capability manapun yang membutuhkan (bukan output tersimpan sendiri)."* `37` § 2 (Assembly Library) menyebut AHSP Nasional/Company/Project/Custom sebagai "empat sumber di dalamnya" — bukan empat capability, bukan empat strategi berdiri sendiri.

**Yang belum dijawab `37`:** `37` menjelaskan APA yang mengalir (Input→Output), tapi tidak menjelaskan MEKANISME pemilihan — persis gap yang menjadi Business Uncertainty di atas, dan persis alasan Fase 5 ada.

### Level 6 — Business Responsibility (diturunkan sekarang, bukan disalin)

Tanggung jawab bisnis yang membuat "Calculation Strategy" harus dijaga sebagai satu kesatuan konsisten: **"Setiap Work Item, pada titik waktu tertentu, harus punya TEPAT SATU strategi kalkulasi aktif yang diketahui asalnya, dan pergantian strategi tidak boleh mengubah angka historis yang sudah dihitung dengan strategi lama."** Ini diturunkan langsung dari kombinasi: (a) fakta operasional `01` § 1 (satu Work Item = satu strategi, dipilih eksplisit, bukan default tersembunyi), (b) Foundational Principle Ketiga `02` (Everything is Versioned — perubahan strategi adalah perubahan yang mempengaruhi estimasi, wajib dipertimbangkan versioning), (c) Constraint Explainability `02` § 1 (setiap angka harus bisa ditelusuri ke Formula Version yang dipakai).

---

## Calculation Strategy — Derivasi Struktur

### 1. Strategy Contract (menjawab: "apa itu satu Calculation Strategy, secara struktur?")

**Derivasi:** `01` § 1 menyebut empat KANDIDAT strategi (Nasional/Company/Project/Custom), tapi tidak pernah mendefinisikan struktur UMUM yang keempatnya harus penuhi. `02` § 8 Formula Engine mendefinisikan struktur formula individual (`Formula + Version + Variable + Parameter + Expression`) — tapi itu struktur SATU formula, bukan struktur satu STRATEGI (yang berisi banyak formula/assembly sekaligus untuk satu Work Item).

**Business Responsibility mengharuskan (Level 6 di atas):** kontrak minimal yang membuat "tepat satu strategi aktif, asal diketahui" bisa ditegakkan:

```
Calculation Strategy Contract:
  - strategy_source     (satu dari: National / Company / Project / Custom — 01 §1)
  - reference_standard  (mis. "Bina Marga" / "Cipta Karya" — hanya relevan kalau
                          strategy_source = National, 01 §1.1)
  - applies_to          (Work Item — bukan Project; 01 §1 eksplisit: "dipilih di
                          level Work Item/Work Package, bukan di level Project")
  - formula_reference    (menunjuk ke Formula Engine, 02 §8 — Strategy TIDAK
                          menyimpan formula sendiri, hanya merujuk)
  - effective_version    (Foundational Principle Ketiga, 02 — wajib dipertimbangkan)
```

**Trace Status:**
```
Level 1 Mission                 ✓
Level 2 Business Vision          ✓  (01 §0: General Contractor, multi-AHSP nyata)
Level 3 Construction Process     ✓  (01 §1: empat sumber AHSP hidup berdampingan)
Level 4 Capability               ✓  (35 #2/#8)
Level 5 Capability Interaction   ✓  (37 §2/§8: formula_reference eksplisit disebut)
Level 6 Business Responsibility  ✓  (diturunkan di atas)
Level 7 Derived Domain           → Calculation Strategy Contract (struktur, bukan
                                    Aggregate Root baru — lihat § Batas di bawah)
Trace Status: ✓ FULLY DERIVED
```

### 2. Strategy Selection Rule (menjawab: "siapa/apa yang memilih strategi mana dipakai?")

**Derivasi:** `01` § 1 menyatakan pemilihan terjadi "di level Work Item/Work Package" — tapi tidak menyebut MEKANISME (otomatis? manual? berdasarkan aturan?). `02` § 10 (Configurable Approval Workflow) sudah mengunci prinsip terkait yang PALING dekat secara struktural: *"Jangan hardcode siapa yang menjadi validator... configurable melalui Workflow Engine dan RBAC."* Prinsip yang sama — jangan hardcode — berlaku untuk strategi kalkulasi: `02` Prinsip Final #6 eksplisit "plug-in dan dapat diganti".

**Derivasi konkret:** Strategy Selection BUKAN otomatis (tidak ada evidence sistem AI/rule engine yang memutuskan sendiri — `01` § 11 eksplisit AI Estimation masih vision level, ditunda Fase 10). Selection adalah **keputusan manual estimator, dicatat sebagai bagian Estimate Item** (`03b` § A.9a: Estimate Item merujuk Cost Code, Assembly, CBS Node, WBS Node — Calculation Strategy adalah rujukan tambahan sejenis, bukan struktur baru).

```
Level 1-5: sama seperti Strategy Contract di atas ✓
Level 6 Business Responsibility  ✓  ("estimator memilih strategi per Work Item saat
                                      menyusun Estimate Item, keputusan itu sendiri
                                      bagian dari Estimate Item — bukan proses terpisah")
Level 7 Derived Domain → Strategy Selection = atribut pada Estimate Item (03b §A.9a),
                          BUKAN Aggregate Root/proses baru
Trace Status: ✓ FULLY DERIVED
```

### 3. Strategy Precedence (menjawab: "kalau Work Item punya lebih dari satu kandidat strategi yang valid, mana yang menang?")

**Uji Zero-Invention dulu — apakah ini genuinely dibutuhkan atau saya sedang menambah kompleksitas?** Evidence: `01` § 1 "Bagaimana Keempatnya Hidup Berdampingan" — *"Empat pilihan Calculation Strategy yang setara kedudukannya — dipilih per Work Item, tidak ada hierarki wajib 'harus mulai dari Nasional'. Sebuah Work Item boleh langsung pakai Custom Assembly tanpa pernah menyentuh AHSP Nasional sama sekali."*

**Temuan penting:** `01` § 1 secara eksplisit MENOLAK hierarki precedence untuk Calculation Strategy — berbeda dari Price Book yang MEMANG punya hierarki 6-tingkat (`01` § 2). Ini bukan kelalaian Fase 5 untuk "melengkapi" precedence yang hilang — precedence memang TIDAK ADA by design untuk Calculation Strategy. Menambahkan precedence rule di sini akan menjadi **pelanggaran Zero-Invention Rule** (`40`): mengasumsikan struktur yang justru ditolak evidence-nya sendiri.

```
Trace Status: N/A — bukan diderivasi sebagai "tidak ada", tapi eksplisit DITOLAK
sebagai konsep oleh evidence Level 3 (01 §1). Dicatat di sini supaya Fase 6/7
tidak menciptakannya kembali dari asumsi "pasti butuh precedence seperti Price Book".
```

### 4. Strategy Versioning (menjawab: "kalau Company Assembly direvisi setelah Estimate Item memakainya, apa yang terjadi ke Estimate Item lama?")

**Derivasi:** Foundational Principle Ketiga `02` (Everything is Versioned) + No Data Duplication `02` Constraint #4 (Assembly/Estimate hanya MEREFERENSIKAN Price Book, tidak menyalin) — pola yang SAMA berlaku untuk Calculation Strategy karena `37` § 8 eksplisit: Strategy adalah Domain Service yang dikonsumsi, bukan disalin.

```
Level 6 Business Responsibility ✓ ("Estimate Item yang sudah dihitung dengan
  Assembly versi 1.2 harus TETAP menunjuk versi 1.2 itu selamanya (immutable
  reference), meski Assembly naik ke versi 1.3 — sama pola dengan Price Book
  Entry, 03b §A.6")
Level 7 Derived Domain → effective_version pada Strategy Contract mengikuti
  pola Domain Event AssemblyActivated/CompanyAhspRevised (03b §A.4) yang SUDAH
  ada — Fase 5 TIDAK menciptakan mekanisme versioning baru, hanya mengonfirmasi
  Calculation Strategy tunduk pada mekanisme yang sama dengan Assembly.
Trace Status: ✓ FULLY DERIVED
```

### 5. Fallback Rule (menjawab: "kalau strategi yang dipilih ternyata tidak punya data lengkap, apa yang terjadi?")

**Uji Zero-Invention:** Apakah evidence menyebut fallback secara eksplisit? Cek `01` § 1.2 (Company AHSP): *"Kondisi hari ini: BELUM ADA SAMA SEKALI... Setiap estimasi mulai dari nol atau merujuk langsung ke AHSP nasional."* Ini SATU kalimat evidence konkret: kalau Company AHSP kosong, fallback ke AHSP Nasional terjadi SECARA FAKTUAL hari ini (bukan by design sistem, tapi karena tidak ada pilihan lain).

**Derivasi hati-hati:** Ini BUKAN alasan untuk membangun fallback CHAIN otomatis multi-tingkat (itu akan meniru struktur Price Book 6-tingkat yang sudah eksplisit DITOLAK untuk Calculation Strategy di § 3 di atas). Yang bisa diderivasi HANYA: **kalau `strategy_source = Company` dipilih tapi Company Assembly untuk Cost Code itu belum ada (Greenfield, `01` § Maturity Model Level 0-1), sistem HARUS menyurutkan pilihan yang valid ke estimator — bukan diam-diam pakai Nasional tanpa sepengetahuan siapa pun** (melanggar Explainability, `02` Constraint #1).

```
Level 6 Business Responsibility ⚠️ SEBAGIAN — evidence mengonfirmasi KEBUTUHAN
  (Greenfield Adoption, 01, mengharuskan sistem tetap berfungsi saat Company AHSP
  kosong) tapi TIDAK mengonfirmasI bentuk UX-nya (auto-suggest? hard block? warning?)
Trace Status: ⚠️ REQUIRES ADR (level 6, sebagian) — prinsip "jangan diam-diam
  fallback tanpa sepengetahuan estimator" FULLY DERIVED dan mengikat, tapi
  mekanisme UI/UX presisi belum diputuskan, konsisten pola RAP Risk Register
  (03b §B.3) — didokumentasikan sebagai open item, bukan dipaksa selesai di sini.
```

### 6. Strategy Audit Trail (menjawab: "bagaimana keputusan strategi bisa diaudit?")

**Derivasi:** `02` Constraint #1 (Explainability, "tidak boleh ada black box") + contoh eksplisit founder di `02`: *"Harga Beton = Rp 1.230.000 ... ditelusuri ke Material Price Book v3.2, Productivity v1.8, Concrete Formula v2.0..."* — Calculation Strategy adalah SATU mata rantai lagi (yang mana Strategy dipakai) di jejak yang sudah dituntut ada.

```
Level 6 Business Responsibility ✓ (Explainability sudah mengunci "setiap angka
  harus bisa ditelusuri sampai ke akar" — Strategy yang dipakai adalah bagian
  akar itu, tidak butuh domain/event baru, hanya konfirmasi Strategy Contract
  (§1) TERCATAT sebagai bagian jejak Estimate Item yang sudah ada)
Level 7 Derived Domain → tidak ada Aggregate Root baru; Strategy Selection
  (§2) yang sudah tercatat di Estimate Item SECARA OTOMATIS menjadi bagian
  audit trail begitu Estimate Item sendiri diaudit (03b §A.12 Lessons
  Learned/Variance sudah membaca Estimate Version sebagai sumber)
Trace Status: ✓ FULLY DERIVED
```

---

## Empat Sumber AHSP — Confirmed Concepts (Bukan Didefinisikan Ulang)

Sesuai Derivation Summary, empat sumber ini BUKAN konsep baru Fase 5 — hanya dikonfirmasi sebagai INSTANCE konkret dari Strategy Contract (§ 1):

| strategy_source | reference_standard contoh | Owner keputusan (diturunkan dari `35` Ownership table) |
|---|---|---|
| National | Bina Marga, Cipta Karya (`01` § 1.1) | Estimator memilih, mengikuti jenis pekerjaan |
| Company | (tumbuh dari bootstrap National, `01` § 1.2) | Cost Engineering (`35` § Ownership — Assembly Library) |
| Project | (override khusus satu proyek, `01` § 1.3) | Estimator, per proyek |
| Custom | (Custom Assembly, `01` § 1.4) | Estimator/Project pembuatnya (`03b` § A.4) |

Tidak ada baris di tabel ini yang ditemukan baru — seluruhnya kutipan langsung `01` § 1, disusun ulang jadi tabel supaya konsisten format Strategy Contract § 1.

---

## Simplicity Rule Check

**Pertanyaan wajib (`40`/instruksi founder):** apakah ada abstraksi di atas yang hanya menjelaskan abstraksi lain, bukan menjelaskan CECEP?

Diperiksa satu per satu: Strategy Contract (menjelaskan struktur nyata yang dipakai estimator), Strategy Selection Rule (menjelaskan siapa yang klik apa), Strategy Versioning (menjelaskan kenapa angka lama tidak berubah), Fallback Rule (menjelaskan apa yang estimator lihat saat Company AHSP kosong), Strategy Audit Trail (menjelaskan bagaimana atasan mengecek angka). **Tidak ada satu pun yang hanya menjelaskan konsep lain** — kelimanya langsung menjelaskan perilaku CECEP yang dialami pengguna. Strategy Precedence SENGAJA ditolak (§ 3) justru karena itu akan jadi abstraksi tanpa evidence pendukung.

---

## Business-First Validation

Pertanyaan yang harus dijawab dokumen ini (per instruksi founder), dijawab langsung:

- **Bagaimana CECEP memilih strategi kalkulasi?** → Estimator memilih per Work Item saat menyusun Estimate Item (§ 2), dari 4 sumber yang setara kedudukan tanpa hierarki wajib (§ 3).
- **Kenapa strategi itu dipilih?** → Karena jenis pekerjaan (sipil pakai Bina Marga, gedung pakai Cipta Karya, `01` § 1.1) atau karena Company AHSP sudah matang untuk Cost Code itu, atau kebutuhan Project/Custom spesifik.
- **Siapa pemilik keputusan?** → Estimator untuk pemilihan per Work Item; Cost Engineering untuk isi/revisi Company AHSP (tabel di atas).
- **Kapan berubah?** → Kapan pun estimator merevisi Estimate Item (selama status belum Approved/Frozen, `03b` § A.9b) — perubahan setelah Approved butuh Estimate Version baru, bukan mutasi diam-diam.
- **Bagaimana versioning-nya?** → Immutable reference ke versi Assembly spesifik (§ 4) — sama pola dengan Price Book Entry.
- **Bagaimana fallback-nya?** → Prinsip terkunci (jangan diam-diam), mekanisme UX masih ⚠️ Requires ADR (§ 5).
- **Bagaimana diaudit?** → Otomatis lewat jejak Estimate Item yang sudah ada, tidak butuh mekanisme terpisah (§ 6).

**Enam dari tujuh pertanyaan terjawab Fully Derived. Satu (mekanisme fallback UX) explicit ⚠️ — bukan disembunyikan.**

---

## Business Uncertainty — After

Sesudah dokumen ini: seorang direktur konstruksi yang membaca ini tahu bahwa CECEP tidak punya "AHSP default tersembunyi" — setiap Work Item punya strategi eksplisit yang dipilih estimator, angka lama tidak pernah berubah retroaktif saat Company AHSP direvisi, dan satu-satunya area yang masih terbuka adalah TAMPILAN peringatan saat Company AHSP kosong (bukan APAKAH sistem harus memperingatkan — itu sudah pasti YA). **Uncertainty bisnis turun dari "tidak tahu mekanismenya sama sekali" menjadi "mekanisme jelas, satu detail UX menunggu keputusan kecil".**

---

## Definition of Done Self-Check (`34`, termasuk Trace Status)

| Kriteria | Status | Bukti |
|---|---|---|
| 1. Memperkuat capability CECEP | ✓ | Capability #2/#8 (`35`) langsung diperdalam |
| 2. Mengurangi implementation uncertainty | ✓ | 6/7 pertanyaan Business-First Fully Derived |
| 3. Artefak konkret | ✓ | Strategy Contract struktur + tabel 4 sumber |
| 4. Tidak memperkenalkan Framework concept | ✓ | Nol istilah Article 8 terlarang |
| 5. Construction Removal Test | ✓ | Hapus "construction" → Bina Marga/Cipta Karya/AHSP semua hilang, dokumen kosong |
| 6. Constitution 8 Artikel | ✓ | |
| 7. Implementation readiness | ✓ | Strategy Contract langsung dipakai Fase 7 (skema) |
| 8. Derivation Trace + Trace Status | ✓ | 5/6 konsep ✓ Fully Derived, 1/6 (Fallback) ⚠️ Requires ADR eksplisit, 0 ❌ Invented |

**Hasil:** 8/8 ✓ (dengan satu ADR terbuka yang dicatat jujur, bukan disembunyikan).

## Derivation Trace

```
This document derives from:
✓ Mission (01/02)
✓ Principles (04)
✓ Confirmed Domain (03b — Estimate Item sebagai lokasi atribut Strategy Selection)
✓ Frozen Capability (35 #2, #8)
✓ Capability Interaction (37 §2, §8)
No new business concepts introduced.
```

---

## 🔒 STATUS: SIAP DI-FREEZE, DENGAN SATU OPEN ADR

**Open ADR:** Mekanisme UX Fallback Rule (§ 5) — prinsip terkunci, bentuk tampilan belum diputuskan. Direkomendasikan diselesaikan bersamaan dengan RAP Risk Register (`03b` § B.3) sebagai housekeeping Fase 6, karena keduanya sama-sama "prinsip pasti, bentuk UI/domain belum final" — bukan blocker Freeze Fase 5.

Menunggu review founder: apakah CECEP lebih jelas setelah dokumen ini dibaca, sesuai Final Validation Question.
