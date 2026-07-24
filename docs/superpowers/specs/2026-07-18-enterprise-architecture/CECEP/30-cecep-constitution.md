# CECEP Constitution

**Kedudukan:** Hukum tertinggi untuk seluruh perencanaan CECEP dari titik ini ke depan — di atas Architecture Constitution (`04`), bukan penggantinya. `04` mengatur PRINSIP TEKNIS (Five Truth Layers, Freeze Chain, dst). Dokumen ini mengatur BATAS DOMAIN — apa yang boleh dan tidak boleh masuk roadmap CECEP sama sekali, terlepas seberapa valid atau rigor sebuah temuan arsitektur. `04` menjawab "apakah keputusan ini benar secara arsitektur?". Dokumen ini menjawab "apakah keputusan ini milik CECEP?" — pertanyaan pertama, sebelum `04` relevan.
**Kenapa dokumen ini lahir:** [`29-context-integrity-audit.md`](29-context-integrity-audit.md) menemukan bahwa Mega Prompt asli CECEP mengatakan "think like Enterprise Architect" tapi tidak pernah mengatakan kapan berhenti menjadi Enterprise Architect dan kembali menjadi Cost Engineer. Akibatnya level abstraksi naik terus tanpa batas alami (Phase G→L). Constitution ini mengisi celah itu secara permanen — bukan cuma untuk audit ini, tapi untuk setiap keputusan CECEP setelah ini.
**Status:** Berlaku efektif segera. Mengikat seluruh dokumen CECEP yang ditulis setelah tanggal freeze ini, dan menjadi kriteria filter retroaktif untuk memutuskan kepemilikan dokumen `08`-`28` (lihat [`31-adr-cecep-framework-separation.md`](31-adr-cecep-framework-separation.md)).

---

## Article 1 — Primary Mission

> CECEP exists to design the world's most extensible Construction Estimation & Cost Engineering Platform — the single source of truth for Tender, Estimation, AHSP, BOQ, RAB, RAP, Procurement Planning, Cost Control, Cashflow, Forecasting, Historical Cost Intelligence, and AI Cost Engineering.

Semua hal lain — termasuk metodologi, ontologi, atau kerangka desain yang dipakai untuk sampai ke sana — bersifat **sekunder dan instrumental**. Sebuah metodologi boleh sangat rigor dan tetap bukan bagian dari CECEP, kalau ia tidak secara langsung menghasilkan kapabilitas di atas.

## Article 2 — Business First Principle

Setiap keputusan arsitektur WAJIB bisa ditelusuri ke minimal satu kapabilitas bisnis berikut:

```
Tender, Estimating, AHSP, BOQ, RAB, RAP, Procurement, Cashflow,
Forecast, Cost Control, AI Estimation, Knowledge Base
```

Kalau tidak bisa dipetakan ke salah satu di atas — **keputusan itu bukan bagian dari CECEP**, terlepas seberapa valid ia secara arsitektur umum.

## Article 3 — Capability Traceability Rule

Setiap dokumen CECEP wajib bisa menjawab satu pertanyaan sebelum ditulis dan sesudah selesai:

> Capability apa yang diperkuat dokumen ini?

Jawaban "tidak ada" atau "memperkuat proses desain itu sendiri" berarti dokumen itu keluar dari scope CECEP — bukan berarti dokumen itu tidak bernilai (lihat Article 4).

## Article 4 — Abstraction Ceiling

CECEP bukan framework epistemologi. CECEP bukan framework ontologi universal. CECEP bukan proyek riset metodologi.

> CECEP adalah Enterprise Architecture untuk Construction Cost Engineering — bukan Enterprise Architecture Methodology itu sendiri.

Metodologi yang lahir dari proses mendesain CECEP (Discovery/Synthesis/Projection, Relation Algebra, Rule Ontology, dst) boleh punya nilai reusable tinggi — tapi rumahnya adalah **Enterprise Architecture Framework** terpisah (lihat [`31-adr-cecep-framework-separation.md`](31-adr-cecep-framework-separation.md)), bukan roadmap CECEP.

## Article 5 — Architecture Depth Limit

Sebuah konsep TIDAK BOLEH menjadi phase tersendiri di roadmap CECEP kecuali ia memenuhi minimal SATU dari tiga syarat:

1. Menghasilkan capability baru (yang sebelumnya tidak ada di Article 2).
2. Meningkatkan kualitas capability yang sudah ada.
3. Mengurangi risiko implementasi capability yang sudah ada.

Kedalaman ontologis (Difference Test, Reverse Proof, Universality Test, dst) tetap boleh dipakai SEBAGAI ALAT untuk memvalidasi keputusan capability — tapi hasilnya tidak boleh menjadi subjek dokumen itu sendiri. Alat, bukan tujuan.

## Article 6 — Mandatory Capability Question

Setiap phase, sebelum ditulis, wajib menjawab eksplisit — bukan implisit — pertanyaan:

> Bagaimana ini membantu: Tender? Estimating? AHSP? BOQ? RAB? RAP? Procurement? Cashflow? Forecast? Knowledge? AI?

Kalau tidak ada satu pun yang bisa dijawab dengan konkret (bukan analogi/pemetaan paksa), **phase dihentikan di situ** — tidak dilanjutkan dengan asumsi "nanti akan relevan".

## Article 7 — Implementation Readiness Test

Di akhir setiap phase, wajib dijawab:

> Does this phase reduce implementation uncertainty for someone about to write the database schema, API, or UI?

Kalau jawabannya tidak, phase dianggap over-abstract — terlepas seberapa koheren logikanya secara internal. Kesesuaian internal (internal consistency) TIDAK CUKUP; harus ada pengurangan ketidakpastian implementasi yang bisa ditunjuk konkret.

## Article 8 — Business Vocabulary Lock

Istilah yang boleh mendominasi (jadi judul section, jadi subjek analisis utama) dokumen CECEP:

```
Cost, Estimate, Resource, Price, Budget, BOQ, AHSP, Cashflow,
Forecast, Knowledge, Calculation, Version, Strategy, Project,
Vendor, Productivity, RAB, RAP, CBS, RBS, Cost Code
```

Istilah berikut TIDAK BOLEH jadi judul section atau subjek analisis utama sebuah dokumen CECEP — boleh dipakai sebagai alat bantu penjelasan di dalam paragraf, tidak lebih:

```
Ontology, Projection, Normative Meaning, Epistemology,
Reasoning, Inference Theory, Design Space, Synthesis Phase
```

**Uji cepat:** kalau judul dokumen atau judul section utama memuat istilah dari daftar kedua, dokumen itu otomatis dicurigai Framework Material, bukan CECEP Material — perlu diperiksa lewat Article 2-3 sebelum dilanjutkan.

---

## Cara Constitution Ini Dipakai

1. **Retroaktif:** Setiap dokumen `08`-`28` (Phase G-L) diperiksa terhadap Article 2, 3, 6, 8 — hasilnya di [`31-adr-cecep-framework-separation.md`](31-adr-cecep-framework-separation.md).
2. **Ke depan:** Setiap dokumen baru CECEP wajib membuka dengan menjawab Article 6 secara eksplisit sebelum isi dokumen ditulis — pola baru yang ditambahkan ke metodologi kerja mulai roadmap 12-fase berikutnya.
3. **Gerbang, bukan sekali cek:** Article 7 dijalankan di AKHIR setiap phase baru, bukan hanya di awal — mencegah phase yang mulai on-track tapi drift di tengah jalan (persis pola yang terjadi di G→L).
4. **Konflik dengan `04`:** Kalau suatu saat Constitution ini tampak bertentangan dengan Architecture Constitution (`04`), Constitution ini (domain boundary) menang untuk pertanyaan "apakah ini bagian dari CECEP", dan `04` menang untuk pertanyaan "apakah ini benar secara arsitektur" — keduanya beroperasi di layer berbeda, seharusnya jarang berbenturan langsung.

---

## 🔒 FREEZE

Constitution ini efektif segera. Perubahan terhadap salah satu dari 8 Artikel membutuhkan keputusan eksplisit founder — bukan editorial ringan, setara level mengubah `04`.
