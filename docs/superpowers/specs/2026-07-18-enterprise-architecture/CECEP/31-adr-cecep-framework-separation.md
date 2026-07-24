# ADR — Separation of CECEP Domain and Enterprise Architecture Framework

**Status:** Accepted
**Kedudukan:** Architectural Change Record level tertinggi — dicatat di sini secara penuh, bukan hanya sebagai entri `04a-adr-traceability-log.md`, karena dampaknya mengubah kepemilikan 20 dokumen sekaligus (bukan satu keputusan lokal). Entri ringkas ditambahkan ke `04a` yang menunjuk balik ke sini.
**Dasar keputusan:** [`29-context-integrity-audit.md`](29-context-integrity-audit.md) (bukti empiris drift) diuji terhadap [`30-cecep-constitution.md`](30-cecep-constitution.md) (kriteria keanggotaan domain, khususnya Article 2/3/6/8).

---

## Context

Context Integrity Audit (`29`) menemukan bahwa Phase G-L secara konsisten kehilangan referensi ke objek domain CECEP (Formula, Price Book, RAB, RAP, Cost Code, AHSP) sebagai *subjek yang didesain*, dan menggantinya dengan objek generik (Rule, Asset, Design Space, Relation) yang divalidasi secara sengaja lintas domain yang bukan konstruksi (mis. J's "6 extreme domains", I's Anthropomorphism Bias yang eksplisit menghindari contoh AI Estimation CECEP sampai langkah terakhir).

Pertanyaan yang harus dijawab: apakah ini kegagalan (dihapus) atau evolusi yang sah menuju aset berbeda (dipindah)?

## Decision

**G-K (dan sebagian L) BUKAN bagian dari roadmap CECEP. Mereka adalah embrio dari aset arsitektur terpisah: Enterprise Architecture Framework (nama kerja sementara — final naming ditunda, sama seperti working name Engine di `02` ditunda sampai domain model matang).**

Dokumen tidak dihapus. Dipindahkan kepemilikannya. CECEP melanjutkan dari `03b` (Freeze C.5) langsung ke roadmap 12-fase baru ([`32-cecep-roadmap-v2.md`](32-cecep-roadmap-v2.md)), memakai hasil G-K hanya sebagai REFERENSI TEKNIS TERSARING saat dibutuhkan — bukan sebagai fase yang harus dilalui ulang.

## Metodologi Pemisahan — Uji per Dokumen

Setiap dokumen diuji terhadap Constitution Article 2 (bisa dipetakan ke capability list?), Article 3 (capability apa yang diperkuat?), Article 6 (bisa jawab "bagaimana ini membantu Tender/AHSP/dst" secara konkret, bukan analogi?), dan Article 8 (judul/section utama pakai vocabulary domain atau vocabulary metodologis?).

| Dokumen | Judul | Art. 2 (petakan ke capability) | Art. 8 (vocabulary) | Putusan |
|---|---|---|---|---|
| `00` Phase A | Repository Discovery | ✅ Langsung: audit codebase existing | Domain (tabel, kolom, endpoint) | **CECEP** |
| `01` Phase B | Cost Engineering Discovery | ✅ Langsung: AHSP/RAB/RAP/dst | Domain penuh | **CECEP** |
| `02` Phase B.5 | Core Cost Engineering Architecture | ✅ Langsung: 12 komponen domain | Domain penuh | **CECEP** |
| `03` Phase C | Problem Discovery | ✅ Langsung: 9 masalah bisnis nyata | Domain (dengan "First Principle" sbg alat, bukan subjek) | **CECEP** |
| `03b` Phase C.5 | Core Domain Discovery | ✅ Langsung: 13 domain = capability map | Domain + DDD sbg alat, bukan subjek | **CECEP** |
| `04` | Architecture Constitution | ✅ Konsolidasi prinsip yang semuanya lahir dari `01`-`03` | Domain | **CECEP** (rujukan teknis, tetap berlaku) |
| `04a` | ADR Traceability Log | ✅ Mencatat keputusan yang mempengaruhi capability CECEP | Domain | **CECEP** |
| `05`-`07c` Phase D-F | Capability/Calculation/Data Architecture | ⚠️ Nama fase memetakan langsung ke capability, TAPI belum diverifikasi ulang isi lengkapnya pasca-audit | Perlu verifikasi | **CECEP (provisional)** — lihat Follow-up Action di bawah |
| `08`-`08k` Phase G | Orchestration/Rule Meta Model, Rule Ontology Validation | ❌ Rule diuji sebagai konsep generik; Formula Engine (CECEP) hanya *contoh*, bukan subjek | Ontology, Meta Model — vocabulary metodologis mendominasi | **FRAMEWORK** |
| `09`-`10` | Readiness Review, Transition G→H | ❌ Meta-dokumen proses, bukan capability | Metodologis | **FRAMEWORK** |
| `13` | Working Methodology (bias catalog, Decision Competition, dst) | ❌ Alat proses, bukan capability CECEP | Metodologis murni by design | **FRAMEWORK** |
| `14`-`16` Phase H | Integration Discovery, Reality Stress Validation | ❌ Titik Serah/Sibling/Uncertainty Window generik untuk integrasi APAPUN, bukan spesifik CECEP↔Puraloka | Ontology, Reasoning | **FRAMEWORK** |
| `17`-`19` Phase I | AI Discovery | ❌ Definisi "apa itu AI" generik, sengaja divalidasi tanpa referensi AI Estimation CECEP | Epistemology, Reasoning | **FRAMEWORK** |
| `20`-`22` Phase J | Future Vision / Design Space | ❌ Diuji lintas 6 domain non-konstruksi | Design Space, Epistemology | **FRAMEWORK** |
| `23`-`27` Phase K | Synthesis / Relation Algebra | ❌ Inference Rule beroperasi pada "Asset" abstrak, nol referensi Cost Code/AHSP sbg tipe node | Synthesis, Reasoning, Ontology | **FRAMEWORK** |
| `28` Phase L (draft) | Projection Discovery Eligibility | ⚠️ Campuran: "Projection sbg kelas metodologi" generik, TAPI kebutuhan aslinya (Explainability, `02` Constraint #1) memang milik CECEP | Normative Meaning (Framework) vs Explainability (CECEP) | **DIPECAH** — lihat di bawah |
| `29` | Context Integrity Audit | ✅ Mengaudit CECEP terhadap misinya sendiri | Domain (dipakai untuk menilai) | **CECEP** |
| `30` | CECEP Constitution | ✅ Mengatur batas domain CECEP | Domain | **CECEP** |
| `31` (dokumen ini) | ADR Separation | ✅ Melaksanakan pemisahan | Domain | **CECEP** |

### Penanganan Khusus Phase L (`28`)

`28` tidak dipindah utuh ke Framework maupun dipertahankan utuh di CECEP. Dipecah:

- **Ikut Framework:** Konsep "Projection sebagai kelas metodologi ketiga" (berbeda dari Discovery/Synthesis), Invariant Test/Behavior Preservation Test sebagai alat generik, Projection Boundary Test vs Serialization/Compilation/dst.
- **Kembali jadi kebutuhan CECEP, dijawab ulang dari nol di roadmap baru:** "Bagaimana CECEP menjelaskan Rp 1.230.000 ke non-teknis" (Explainability, `02` Constraint #1) — pertanyaan ini nyata dan milik CECEP, tapi TIDAK BOLEH dijawab dengan mewarisi jawaban "Normative Meaning" dari draft `28` yang sudah dibangun generik. Dijawab ulang di Phase 12 (Documentation Package) roadmap baru, langsung dari kebutuhan CECEP, bukan diturunkan dari Framework.

## Consequences

**Positif:**
- CECEP kembali punya roadmap yang 100% business-traceable (Article 2 Constitution terpenuhi di setiap dokumen tersisa).
- Kerja G-K tidak hilang — 20 dokumen, ratusan jam penalaran, tetap tersimpan sebagai aset dengan nilai reusable TINGGI untuk modul Puraloka Suite lain di masa depan (Procurement, HR, CRM juga akan butuh Rule Engine, Integration pattern, AI definition, dst).
- Batas jelas mencegah pola drift yang sama terulang: kalau nanti muncul kebutuhan "bagaimana CECEP menangani Rule" lagi, jawabannya adalah "pakai Framework sebagai referensi", bukan "buka Discovery baru".

**Negatif/Risiko yang diterima secara sadar:**
- Framework belum resmi didirikan sebagai proyek sendiri (nama kerja sementara, tidak ada Phase A-nya sendiri) — ada risiko ia jadi "yatim" kalau tidak eksplisit diberi rumah. **Mitigasi:** dicatat sebagai Follow-up Action di bawah, bukan diabaikan.
- Beberapa istilah CECEP yang sudah terlanjur dipakai di dokumen G-K (mis. "Formula" disebut sebagai contoh Rule di `08d`) sekarang hidup di dua tempat — perlu disiplin membaca: definisi OPERASIONAL Formula tetap otoritas `02`/roadmap baru CECEP, bukan `08d`.

## Follow-up Actions

1. **✅ SELESAI** — Framework dipindahkan fisik ke `docs/superpowers/specs/2026-07-18-enterprise-architecture/enterprise-architecture-framework/` (29 file: `08`-`08k`, `09`, `10`, `13`, `14`-`28`). Lihat README di direktori tersebut. Dieksekusi setelah tertunda cukup lama sebagai Follow-up Action — dicatat di sini sebagai jejak bahwa keputusan `31` sempat hanya "dinyatakan" tanpa benar-benar dilaksanakan sampai founder menanyakan langsung. Seluruh link markdown relatif (kedua arah — dari Framework ke CECEP, dan dari CECEP ke Framework) diperbaiki dan diverifikasi tidak ada yang pecah pasca-pemindahan (`grep` menyeluruh, nol sisa).
2. **✅ SELESAI** — Phase D/E/F (`05`-`07c`) sudah diverifikasi ulang di [`CECEP/45-phase7-data-architecture.md`](45-phase7-data-architecture.md) § Temuan Kritis: ditemukan terikat Capability Catalog usang, ditandai ⚠️ SUPERSEDED di file masing-masing, digantikan `42`/`44`/`45`.
