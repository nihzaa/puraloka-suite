# CECEP — Phase 5 Derivation Audit

**Sifat dokumen:** Audit murni. Tidak mendesain ulang, tidak memperbaiki kata, tidak menambah penjelasan ke [`42`](42-phase5-calculation-strategy-architecture.md). Hanya melaporkan temuan.
**Metode:** Setiap kalimat klaim di `42` diperiksa kata-per-kata terhadap teks asli evidence (`01`, `02`, `35`, `37`, `03b`) — bukan terhadap ringkasan/parafrase yang sudah ditulis `42` sendiri.

---

## Tabel Derivasi Per Section

| Section (`42`) | Derived From | Evidence (kutipan persis) | Trace Status |
|---|---|---|---|
| § 1 Strategy Contract — field `strategy_source`, `reference_standard` | `01` § 1.1 | "AHSP Bina Marga untuk pekerjaan jalan/tanah/sipil, AHSP Cipta Karya untuk bangunan gedung, dipilih per jenis pekerjaan" | ✓ Fully Derived |
| § 1 Strategy Contract — field `applies_to: Work Item` | `01` § 1 penutup | "dipilih per Work Item, tidak ada hierarki wajib" | ✓ Fully Derived |
| § 1 Strategy Contract — field `formula_reference` | `02` § 8 | "Formula + Version + Variable + Parameter + Expression" (Strategy MERUJUK Formula, tidak menyalin) | ⚠️ Requires ADR — evidence menetapkan STRUKTUR Formula, tidak eksplisit menyatakan Strategy "merujuk, tidak menyimpan sendiri". Ini INFERENSI dari prinsip No Data Duplication (`02` Constraint #4), sah sebagai penerapan prinsip, tapi bukan kutipan langsung yang mengharuskan field ini persis berbentuk begini |
| § 1 Strategy Contract — field `effective_version` | `02` Foundational Principle Ketiga | "Everything that affects estimation must be versioned" | ✓ Fully Derived (prinsip generik, tapi eksplisit mencakup "everything that affects estimation" — Strategy termasuk) |
| § 2 Strategy Selection Rule — "keputusan manual estimator" | `01` § 11 (AI Estimation masih vision) + ketiadaan evidence otomasi | Inferensi NEGATIF ("tidak ada evidence sistem otomatis memutuskan") | ⚠️ Requires ADR — **argumen dari ketiadaan bukti bukan argumen dari bukti positif.** Tidak ada satu kalimat pun di `01`/`02`/`03b` yang menyatakan "estimator memilih strategi secara manual". Fase 5 MENYIMPULKAN ini dari absennya alternatif, bukan dari pernyataan eksplisit. Ini pola yang lebih lemah dari klaim lain di dokumen |
| § 2 — "dicatat sebagai bagian Estimate Item" | `03b` § A.9a Context Mapping | "Estimate Item → (referensi) → Cost Code, Assembly, CBS Node, WBS Node" | ❌ **INVENTED.** `03b` § A.9a MENDAFTAR SECARA EKSPLISIT empat rujukan Estimate Item: Cost Code, Assembly, CBS Node, WBS Node. **"Calculation Strategy" TIDAK ADA di daftar itu.** `42` menulis "Calculation Strategy adalah rujukan tambahan sejenis" — kata "tambahan sejenis" adalah SISIPAN, tidak ada di `03b` mana pun. Ini persis pola yang dikhawatirkan founder: kalimat kecil yang terdengar masuk akal tapi tidak punya evidence tekstual |
| § 3 Strategy Precedence — penolakan hierarki | `01` § 1 penutup | "tidak ada hierarki wajib 'harus mulai dari Nasional'... boleh langsung pakai Custom Assembly tanpa pernah menyentuh AHSP Nasional sama sekali" | ✓ Fully Derived — ini section TERKUAT di seluruh dokumen, kutipan hampir verbatim |
| § 4 Strategy Versioning — "immutable reference... sama pola dengan Price Book Entry" | `02` Constraint #4 (No Data Duplication) + `03b` § A.6 | Constraint #4: "Assembly, Estimate, dan RAP hanya menyimpan referensi ke Price Book" | ⚠️ Requires ADR — evidence berbicara tentang Price Book, bukan tentang Calculation Strategy. `42` MENGANALOGIKAN pola Price Book ke Strategy tanpa evidence eksplisit yang menyatakan Strategy harus tunduk pola yang sama. Analogi yang masuk akal, tapi analogi ≠ derivasi langsung |
| § 5 Fallback Rule — kutipan `01` § 1.2 | `01` § 1.2 | "Setiap estimasi mulai dari nol atau merujuk langsung ke AHSP nasional" | ✓ Fully Derived — kutipan akurat, dan `42` sendiri sudah menandai ⚠️ untuk bagian mekanisme UX (jujur, tidak disembunyikan) |
| § 5 — "sistem HARUS menyurutkan pilihan yang valid ke estimator" | `02` Constraint #1 (Explainability) | "Setiap angka output sistem... harus bisa dijelaskan sampai ke akar" | ❌ **INVENTED.** Explainability berbicara tentang MENJELASKAN angka yang SUDAH dihasilkan, bukan tentang MENCEGAH/MEMPERINGATKAN sebelum angka dihasilkan. Kata "menyurutkan pilihan" adalah desain UX konkret yang tidak diminta evidence mana pun. `42` sendiri sudah menandai bagian ini ⚠️ secara umum — tapi audit ini menunjukkan levelnya lebih parah dari ⚠️: kalimat SPESIFIK ini (bukan prinsipnya) adalah ❌, bukan ⚠️ |
| § 6 Strategy Audit Trail — "otomatis menjadi bagian audit trail begitu Estimate Item diaudit" | `03b` § A.12 | "Estimate Version+Actual Cost → (dibandingkan) → Variance" | ⚠️ Requires ADR — `03b` § A.12 menjelaskan Estimate Version dibandingkan ke Actual Cost, TIDAK secara eksplisit menyebut "Strategy yang dipakai" sebagai bagian pembanding itu. Kesimpulan `42` masuk akal (kalau Estimate Version diaudit, semua atributnya termasuk strategi ikut terbawa) tapi ini INFERENSI STRUKTURAL, bukan kutipan |
| Tabel "Empat Sumber AHSP" — kolom "Owner keputusan" | `35` § Ownership | "Assembly Library — Cost Engineering" | ✓ Fully Derived untuk baris Company; ⚠️ untuk baris National/Project/Custom — `35` hanya mencatat Owner untuk CAPABILITY Assembly Library secara keseluruhan (Cost Engineering), TIDAK memecah ownership per SUMBER (National/Project/Custom masing-masing punya owner berbeda menurut `42`, tapi `35` tidak pernah memecahnya sedetail itu) |

---

## Ringkasan Kuantitatif

| Trace Status | Jumlah klaim diperiksa | Persentase |
|---|---|---|
| ✓ Fully Derived | 6 | 50% |
| ⚠️ Requires ADR | 4 | 33% |
| ❌ Invented | 2 | 17% |

**Ini BUKAN 100% Fully Derived / 0% Invented seperti target awal founder.** Audit menemukan dua kalimat konkret yang harus diklasifikasi ❌, bukan ⚠️ seperti status yang tertulis di `42` sebelumnya.

---

## Jawaban Empat Pertanyaan Wajib

### 1. Section mana yang punya rantai derivasi paling lemah?

**§ 2 (Strategy Selection Rule).** Bukan karena kesimpulannya salah — kemungkinan besar estimator memang memilih manual — tapi karena metode derivasinya adalah **argumen dari ketiadaan bukti** ("tidak ada evidence sistem otomatis, jadi pasti manual"), bukan argumen dari pernyataan positif evidence. Ini pola penalaran yang berbeda kualitasnya dari section lain, dan seharusnya sudah ditandai ⚠️ sejak awal, bukan ✓.

### 2. Section mana yang bergantung pada interpretasi, bukan evidence?

**§ 4 (Strategy Versioning)** dan **§ 6 (Strategy Audit Trail)** — keduanya memakai pola "evidence X berbicara tentang konsep serupa (Price Book, Variance Calculation), maka Calculation Strategy PASTI tunduk pola yang sama." Ini analogi terstruktur, bukan kutipan langsung. Analogi ini mungkin BENAR, tapi caranya sampai ke kesimpulan itu adalah interpretasi konsistensi arsitektur, bukan derivasi tekstual murni sesuai standar Rule 1 (`40`): *"Which previously frozen artifact requires this to exist?"* — jawaban jujurnya untuk kedua section ini adalah "tidak ada artefak yang secara eksplisit MENGHARUSKAN, tapi konsistensi prinsip MENYARANKAN."

### 3. Kalimat mana yang akan HILANG kalau semua frozen artifact hilang?

Dua kalimat, sama dengan temuan ❌ di atas:
- **§ 2:** *"...dicatat sebagai bagian Estimate Item"* — kalau `03b` § A.9a hilang, tidak ada dasar apa pun untuk klaim ini; ia BUKAN turunan logis dari Mission/Capability semata, ia butuh `03b` secara spesifik, dan `03b` justru TIDAK mendukungnya (Estimate Item tidak merujuk Calculation Strategy dalam daftar eksplisitnya).
- **§ 5:** *"sistem HARUS menyurutkan pilihan yang valid ke estimator"* — kalau `02` Constraint #1 hilang, klaim ini kehilangan dasar SAMA SEKALI, tapi bahkan DENGAN Constraint #1 hadir, klaim spesifik ini (bentuk UX "menyurutkan pilihan") tidak benar-benar didukung — Constraint #1 bicara soal MENJELASKAN, bukan MENCEGAH.

### 4. Kalimat mana yang akan TETAP ADA meski CECEP diganti domain lain (mis. Hospital, Manufacturing)?

Diperiksa satu per satu terhadap keseluruhan `42`: **tidak ditemukan kalimat yang lolos uji ini** — berbeda dari kekhawatiran pola G-K (istilah generik seperti "Resolution Engine"/"Strategy Dispatcher"), `42` konsisten memakai istilah domain konkret (AHSP, Bina Marga, Cipta Karya, Assembly, Price Book) di hampir setiap kalimat. Bahkan dua kalimat ❌ di atas GAGAL karena masalah EVIDENCE (tidak didukung kutipan tekstual), bukan karena genericness/framework-drift. Ini perbedaan penting: kegagalan `42` adalah kegagalan RIGOR DERIVASI, bukan kegagalan SCOPE (`30` Article 8 tetap terpenuhi penuh).

---

## Catatan Penting untuk Founder

Kedua temuan ❌ punya karakter yang SAMA: keduanya adalah kesimpulan yang **kemungkinan besar benar secara bisnis**, tapi ditulis `42` seolah-olah sudah didukung evidence tekstual eksplisit padahal sebenarnya inferensi/asumsi desain. Ini bukan kegagalan scope (tidak ada framework generik menyusup), tapi kegagalan DISIPLIN KUTIPAN — persis risiko yang diperingatkan founder di instruksi audit ("Company itu bisa saja invention", "Fallback occurs automatically padahal evidence hanya bilang must be explainable").

**Tidak ada rekomendasi perbaikan di sini** — sesuai instruksi, audit ini hanya melaporkan, tidak menulis ulang `42`.
