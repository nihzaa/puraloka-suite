# CECEP — Phase Transition Brief: H → I

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** BUKAN discovery, BUKAN architecture, BUKAN design — dokumen **handover formal** antara Phase H (frozen) dan Phase I (AI Architecture) yang akan dimulai. Pola kedua dari mekanisme Phase Transition Brief (`10` yang pertama, G→H) — sekarang resmi jadi bagian tetap metodologi CECEP, akan diulang di setiap transisi fase berikutnya (I→J, J→K, K→L).

**Prinsip governing dokumen ini:** Empat bagian di bawah (Selesai/Input Wajib/Tidak Boleh Diubah/Acceptance Criteria) BUKAN isi baru — seluruhnya RINGKASAN dan RUJUKAN BALIK ke keputusan yang sudah dikunci di `14`-`15`. Beda dari `10` (yang punya bagian "Harus Dijawab" terpisah berisi delapan item eksplisit), Phase H TIDAK menyisakan item wajib sebesar itu — delapan item `10` § 4 sudah SEMUANYA terjawab tuntas di `14` § 21 sebelum freeze. Yang diwariskan ke Phase I bersifat lebih ringan: lima kewajiban sisa (`15`, penutup freeze) — dikonsolidasi di § 4 di bawah.

---

## 1. Apa yang Sudah Selesai di Phase H

| Lapisan | Dokumen | Isi Inti yang Frozen |
|---|---|---|
| Discovery (ontologi) | [`14`](14-phase-h-integration-discovery.md) § 0-12 | Definisi Integration (§ 2), Determinism Boundary, posisi Sibling terhadap Orchestration (dua alat uji: kontradiksi-definisi § 8.1, Test of Equivalence § 12), Ontology Relation Discovery (10 relasi katalog, § 11) |
| Discovery Completion (meta) | [`14`](14-phase-h-integration-discovery.md) § 13 | Meta-discovery ditutup resmi lewat Discovery Completion Test eksplisit — pergeseran dari "apa hubungan Integration-Orchestration" ke substansi murni |
| Discovery (substansi) | [`14`](14-phase-h-integration-discovery.md) § 14-15 | Struktur tiga-elemen (Titik Serah/Uncertainty Window/Reconciliation), diuji 14+ skenario mekanisme (API/polling/CSV/DB/email/manual/MQ/IoT/satelit/air-gap) |
| Philosophy/Design (Decision Competition) | [`14`](14-phase-h-integration-discovery.md) § 16-20 | Timeout=f(Uncertainty Window), CAP-013=Strategy Pattern (preseden CAP-006), Join Policy deklaratif, Payload Contract=8-dari-11 elemen Canonical Information Contract, Adapter tanpa model bersama |
| Asset Model | [`14`](14-phase-h-integration-discovery.md) § 22 | Integration Point = Configuration Data (BUKAN Executable Knowledge Model ketiga), Lifecycle 5-status (+Degraded), Dual Ownership, Governance via perluasan graph `08` § F |
| Reality Stress Validation & Freeze | [`15`](15-phase-h1-reality-stress-validation.md) | 38 skenario 10 kelompok, 13 perbaikan non-ACR, 1 perluasan struktural (`uncertainty_class: "none"`), 3 batas struktural diakui jujur |
| Governance (metodologi) | [`13`](13-working-methodology.md) § 3 | Decision Competition + First Satisfactory Candidate Bias — ditemukan DI Phase H, akan mengikat Phase I dan seterusnya |

**Ringkasan satu kalimat:** Phase H menghasilkan **Integration Point sebagai Enterprise Asset** — objek Configuration Data dengan struktur tiga-elemen sebagai intinya, terbukti (lewat 38 skenario reality stress test) tahan terhadap kegagalan trust/waktu/identitas/skema/delivery/manusia/evolusi/skala/ownership, dan JUJUR mengakui batasnya sendiri pada tiga kasus yang secara struktural memang di luar Determinism Boundary CECEP.

---

## 2. Apa yang Menjadi Input Wajib untuk Phase I

**Phase I (AI Architecture) TIDAK BOLEH mulai dari nol — enam artefak berikut WAJIB dipakai sebagai fondasi:**

1. **Integration Point struktur final** (`15`, hasil § 22.6 `14` + perbaikan `15`) — kalau AI perlu memanggil sistem eksternal (mis. LLM API pihak ketiga), itu MELEWATI Integration Point yang sama, TIDAK mendesain jalur pemanggilan eksternal baru yang terpisah.
2. **Determinism Boundary** (`14` § 0.1, dikonfirmasi tuntas `14` § 8-12) — AI, sebagai sumber ketidakpastian LAIN (non-deterministik secara internal, `08g` § A.14), WAJIB diperiksa: apakah AI sendiri adalah kasus Integration (batas kepercayaan) atau kategori berbeda — TIDAK diasumsikan otomatis salah satu, harus diuji ulang lewat metodologi yang sama (Ontology Candidate Matrix, Five Whys, Universality Test) yang dipakai `14` § 6-12.
3. **AI Generated Data governance yang sudah ada** (`08g` § A.14, `08e` § D `authored_by: "ai_proposed"`) — AI Rule (`08d` § A.7, sudah diidentifikasi butuh pembeda "memicu vs menghasilkan logika") dan Konstitusi Calculation Strategy (`06` § pembuka poin 6: "AI tidak pernah menghitung sendiri") — dua batasan yang SUDAH dikunci SEBELUM Phase H, WAJIB tetap dihormati, bukan didesain ulang di Phase I.
4. **Decision Competition** (`13` § 3) — WAJIB dijalankan sejak Discovery pertama Phase I, TIDAK menunggu ditemukan lewat koreksi seperti terjadi di Phase H.
5. **Discovery Completion Rule + Discovery Granularity Rule** (`04` § 15-16) — sama seperti sebelumnya, kriteria berhenti dan kriteria granularity berlaku identik.
6. **Reality Stress Test sebagai pola wajib untuk Validation** (`15`, bukan `08k`) — Phase I.1 (Validation) HARUS mengikuti pola "serang dunia nyata" seperti `15`, BUKAN kembali ke pola "serang logika internal" seperti `08k` — karena AI, seperti Integration, berhadapan dengan sesuatu yang tidak sepenuhnya CECEP kendalikan (model AI pihak ketiga, hasil non-deterministik). **Kesamaan sifat ini WAJIB diuji eksplisit di awal Phase I Discovery (§ 0 Pre-Discovery Framing), bukan diasumsikan tanpa verifikasi.**

---

## 3. Apa yang Tidak Boleh Diubah Lagi (Tanpa ACR)

**Konsisten Progressive Freeze Chain (`04` § 7) — daftar ini pagar, bukan pengingat sopan-santun:**

| Dikunci Sejak | Tidak Boleh Diubah |
|---|---|
| `14` § 2, § 7 | Definisi Integration ("titik di mana jaminan CECEP diakui berhenti berlaku") — Sibling terhadap Orchestration, BUKAN subtype/layer baru |
| `14` § 8.1, § 12 | Dua alat uji ontologi CECEP (kontradiksi-definisi, Test of Equivalence) — "inheritance/mewarisi properti" TETAP DITOLAK sebagai alat uji sah |
| `14` § 10 | Definisi formal Sibling (3 syarat: no-ownership, kontradiksi-jika-disamakan, saling-diperlukan) |
| `14` § 11.3 | Katalog 10 Ontology Relation CECEP |
| `14` § 14.1 | Struktur tiga-elemen (Titik Serah/Uncertainty Window/Reconciliation) sebagai invariant Integration |
| `14` § 22.1 | Integration Point = Configuration Data, BUKAN bentuk ketiga Executable Knowledge Model |
| `14` § 22.2-22.3 | Lifecycle 5-status (Draft→Active→Degraded⇄Active→Deprecated→Archived), Dual Ownership (business_owner + technical_owner) |
| `15` § 10.1 | `uncertainty_class` enam nilai (termasuk `"none"` — kelas terpisah, BUKAN variasi dari `"unbounded"`) |
| `15` (seluruh Kelompok 1-9 perbaikan) | 13 field/policy tambahan pada struktur Integration Point (`reconciliation_confidence`, `secondary_identifier`, `required` per field, dll — lihat `15` struktur final) |
| `13` § 3 | Decision Competition sebagai kebiasaan wajib untuk setiap keputusan desain |
| (diwarisi dari G) `08a`-`08k` | Seluruh baseline Rule/Orchestration — TIDAK berubah oleh Phase H apa pun |

---

## 4. Kewajiban yang Diwariskan ke Phase I (Bukan Kelalaian — Sengaja Ditunda)

**Dikonsolidasi dari penutup freeze `15`:**

| # | Item | Sumber | Kenapa Bukan Milik Phase H |
|---|---|---|---|
| 1 | Verifikasi FAKTA bentuk konkret sistem Puraloka Suite | `14` Open Question #2 | Empiris murni, untuk founder/tim implementasi — BUKAN pertanyaan arsitektural Phase I, tapi prasyarat sebelum Integration Strategy pertama (Gap-1/Gap-2) diimplementasikan konkret |
| 2 | Versioning Integration Strategy | `14` § 17 Open Question #5/#8 | Perlu diputuskan sebelum implementasi, bukan blocker arsitektural Phase I |
| 3 | Replay untuk Join Policy QUORUM time-sensitive | `14` § 18 Open Question #7 | QUORUM masih "sah struktural tanpa instance nyata" — diselesaikan kalau/ketika benar-benar dipakai |
| 4 | Peran Security Owner untuk Integration Point sensitif | `14` § 22.3 Open Question #9 | Relevan kalau target masa depan menyentuh data sensitif (Bank API) — BUKAN kebutuhan Phase I langsung, tapi relevan KALAU Phase I sendiri memakai Integration Point ke LLM API pihak ketiga yang menyentuh data sensitif |
| 5 | Implementasi konkret perluasan graph `08` § F untuk Integration Point sebagai node | `14` § 22.4 Open Question #10 | Pekerjaan Design/implementasi, bukan arsitektural |

**Catatan penting untuk item #4:** Ini SATU-SATUNYA item yang punya IRISAN LANGSUNG dengan Phase I — kalau AI Architecture memutuskan memanggil LLM API eksternal (kandidat kuat, mengingat sifat AI umumnya membutuhkan model pihak ketiga), Integration Point untuk itu SANGAT MUNGKIN butuh Security Owner sejak awal (data Estimate/Cost yang dikirim ke LLM eksternal adalah data sensitif perusahaan). **Phase I Discovery WAJIB memeriksa ini di awal, bukan menemukan di tengah jalan seperti pola lama yang sudah dikoreksi.**

---

## 5. Acceptance Criteria Phase I

**Phase I dianggap SELESAI (siap Validation & Freeze I.1) ketika:**

1. Pertanyaan di § 2 poin 2 terjawab TUNTAS di Discovery pertama: apakah AI (sebagai sumber ketidakpastian) adalah KASUS Integration (lewat Integration Point yang sudah ada), ONTOLOGI BERBEDA yang butuh Asset Model sendiri, atau KOMBINASI keduanya (mis. AI Model Call = Integration Point khusus, TAPI AI-generated Content = kategori terpisah yang sudah ada `08g` § A.14) — dibuktikan lewat Ontology Candidate Matrix, BUKAN diasumsikan.
2. Batasan yang sudah dikunci SEBELUM Phase H (Konstitusi Calculation Strategy `06` § pembuka poin 6, AI Rule governance `08e` § C, AI Generated Data `08g` § A.14) diverifikasi TETAP KONSISTEN dengan hasil Phase I Discovery — kalau ternyata bertentangan, itu ACR terhadap Phase E/G, bukan diam-diam diabaikan.
3. Phase I menjalankan pola delapan-lapisan yang sama seperti H (Pre-Discovery Framing → Discovery ontologi → Discovery Completion Test di tempat (bukan meta-discovery berlarut) → Discovery substansi dengan Decision Competition → Asset Model kalau diperlukan → Reality Stress Validation → Freeze → Transition Brief) — BUKAN opsional hanya karena "sudah dua kali dijalankan".
4. Reality Stress Validation Phase I (I.1) menguji MINIMAL kelompok kegagalan yang SPESIFIK untuk sifat AI (bukan menyalin sepuluh kelompok `15` mentah-mentah) — dicari lewat Pre-Discovery Framing § 2 poin 6 (kesamaan sifat dengan Integration harus diuji dulu, baru ditentukan kelompok kegagalan mana yang relevan/butuh kelompok baru).
5. Item #4 § 4 (Security Owner untuk Integration Point ke LLM eksternal) diperiksa SECARA EKSPLISIT di awal Discovery, bukan ditemukan di tengah jalan.

---

## Assumptions

1. Enam input wajib § 2 diasumsikan LENGKAP berdasarkan penelusuran `14`-`15` — kalau Phase I Discovery menemukan item ketujuh yang genuinely tertinggal, itu ditambahkan ke Phase I Discovery sendiri, bukan tanda Brief ini gagal.
2. Dugaan bahwa AI mungkin "menyerupai" Integration (sama-sama sumber ketidakpastian di luar kendali penuh CECEP, § 2 poin 6 dan Acceptance Criteria poin 1) adalah HIPOTESIS AWAL untuk memandu Pre-Discovery Framing Phase I — BUKAN kesimpulan, dan TIDAK BOLEH diterima begitu saja tanpa diuji ulang lewat metodologi Ontology Candidate Matrix yang sama seperti `14` § 6.

## Open Questions

(Tidak ada Open Question baru — dokumen ini murni konsolidasi dari Open Question yang SUDAH tercatat di `14`/`15`, didaftar lengkap di § 4. Satu HIPOTESIS untuk diuji dicatat eksplisit di Assumptions #2 dan Acceptance Criteria poin 1 — bukan dijawab di sini, sengaja diserahkan ke Phase I Discovery.)

## Status

**Phase Transition Brief selesai.** Empat bagian (Selesai/Input Wajib/Tidak Boleh Diubah/Kewajiban Diwariskan) plus Acceptance Criteria tersusun sebagai handover formal H→I. **CECEP siap memulai Phase I — AI Architecture**, dengan satu instruksi eksplisit yang membedakannya dari transisi G→H: Phase I HARUS menguji dulu (lewat metodologi Ontology Candidate Matrix yang sama seperti `14` § 6-12) apakah AI benar-benar ontologi baru atau ekstensi dari Integration yang sudah ada — TIDAK BOLEH diasumsikan salah satunya dari awal.

*Pola dokumen ini (Phase Transition Brief) akan diulang di setiap transisi fase berikutnya — I→J, J→K, K→L — sebagai bagian tetap metodologi CECEP.*
