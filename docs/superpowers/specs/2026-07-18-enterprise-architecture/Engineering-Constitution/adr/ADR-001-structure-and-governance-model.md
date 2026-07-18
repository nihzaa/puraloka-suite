# ADR-001 — Struktur, Hierarki, dan Model Governance Engineering Constitution

**Status:** Menunggu persetujuan founder
**Menggantikan:** [ADR-000](ADR-000-batching-strategy.md) — ADR-000 tetap disimpan sebagai riwayat keputusan (bukan dihapus, sesuai prinsip append-only yang sudah dipegang di seluruh repository ini — lihat [04 — Migration Strategy](../../04-roadmap-governance-and-delivery.md#migration-strategy-prinsip-lintas-fase) prinsip "migrasi 049/050 yang sudah di-apply tidak di-edit"), tapi keputusan strukturalnya **digantikan** oleh ADR ini.
**Wewenang:** Founder eksplisit memberi wewenang merancang ulang struktur (jumlah file, folder, penggabungan/pemecahan) selama beralasan teknis kuat dan didokumentasikan sebagai ADR sebelum eksekusi.

---

## Kenapa ADR-000 Direvisi (Bukan Sekadar Dilanjutkan)

ADR-000 menjawab pertanyaan *"bagaimana urutan mengerjakan 40 file yang diminta"* — itu jawaban yang benar untuk pertanyaan itu, tapi permintaan founder yang baru mengangkat pertanyaan yang lebih mendasar: *"apakah 40 file flat bernomor adalah bentuk terbaik untuk sebuah engineering constitution yang harus bertahan 10 tahun?"* Setelah meninjau ulang dengan pertanyaan itu, saya menemukan ADR-000 mewarisi sebuah asumsi yang tidak pernah diuji: bahwa struktur "40 file sejajar" dari brief asli adalah struktur final, padahal brief asli sendiri hanya daftar *topik yang harus dicakup*, bukan keputusan arsitektur dokumen.

**Empat kesenjangan struktural yang ditemukan pada ADR-000:**

### Kesenjangan 1 — Tidak Ada Tingkat Kewajiban yang Seragam Lintas File

Brief meminta "Mandatory Rules" dan "Recommended Rules" **per file**, tapi tidak ada mekanisme yang membuat level kewajiban ini **terverifikasi otomatis** atau **konsisten secara leksikal** lintas 40 file. Tanpa kosakata baku, satu file mungkin menulis "harus" untuk sesuatu yang sebenarnya opsional, file lain menulis "disarankan" untuk sesuatu yang sebenarnya blocking — inkonsistensi yang justru menjadi bentuk *governance drift* yang brief minta dicegah.

**Solusi:** Adopsi kosakata **RFC 2119** (standar industri yang sudah dipakai OWASP ASVS dan spesifikasi teknis lintas industri) — MUST/MUST NOT (blocking, tidak ada pengecualian tanpa ADR), SHOULD/SHOULD NOT (default kuat, deviasi butuh justifikasi tertulis di PR), MAY (opsional eksplisit). Setiap "Mandatory Rules" di 40 file ditulis dengan **MUST**, setiap "Recommended Rules" dengan **SHOULD** — bukan padanan bahasa Indonesia yang berbeda-beda per penulis bagian.

### Kesenjangan 2 — Tidak Ada Titik Masuk Navigasi

40 file bernomor 00-39 tanpa index terpisah berarti engineer baru (skenario yang brief eksplisit sebutkan: *"engineer baru dapat langsung bekerja"*) harus menebak file mana yang harus dibaca duluan. Google/Stripe/Shopify Engineering Handbook yang dijadikan acuan **semuanya** punya landing page yang membedakan "onboarding path" (baca berurutan sekali) dari "reference path" (dirujuk sesuai kebutuhan, tidak pernah dibaca berurutan).

**Solusi:** Tambah `README.md` sebagai titik masuk — bukan konten baru, murni **navigasi**: peta 40 file dikelompokkan per kategori, jalur baca untuk 3 skenario berbeda (engineer baru onboarding, engineer senior mencari aturan spesifik, reviewer memverifikasi PR terhadap checklist).

### Kesenjangan 3 — Istilah Teknis Tidak Punya Definisi Otoritatif Tunggal

Istilah seperti *Aggregate Root*, *Bounded Context*, *RLS*, *idempotency*, *fail-closed* dipakai lintas puluhan file (baik di 7 dokumen architecture repo, 10 dokumen Phase 1, maupun akan dipakai di 40 file constitution) — tanpa satu sumber definisi, setiap file berisiko mendefinisikan ulang dengan nuansa berbeda, menciptakan *terminology drift* (bentuk drift yang tidak eksplisit disebut brief tapi setara pentingnya dengan yang disebut).

**Solusi:** Tambah `GLOSSARY.md` sebagai referensi bersama — bukan salah satu dari 40 file (istilahnya lintas-domain, tidak cocok masuk kategori manapun secara eksklusif), melainkan lapisan terpisah yang **seluruh** file lain boleh rujuk.

### Kesenjangan 4 — Tidak Ada Mekanisme Amandemen untuk "Constitution 10 Tahun"

Sebuah dokumen yang diberi nama "Constitution" dan diharapkan bertahan 10 tahun, melewati Phase 1-9, **butuh** mekanisme eksplisit tentang bagaimana ia sendiri boleh berubah — siapa berwenang mengubah aturan MUST, bagaimana proses amandemen berbeda dari proses membuat ADR arsitektur biasa. Tanpa ini, constitution berisiko jadi dokumen statis yang ditinggalkan begitu realita berubah (persis kegagalan yang membuat migration 046's `apps/api/src/utils/audit.ts` tidak pernah ada — desain bagus di kertas, tidak ada mekanisme yang memaksa implementasi mengikutinya).

**Solusi:** File `00-engineering-principles.md` (sudah direncanakan di ADR-000) diperluas cakupannya mencakup **Amendment Process** sebagai bagian eksplisit — bukan file terpisah baru (menghindari proliferasi file untuk sesuatu yang secara alami adalah bagian dari "prinsip dasar constitution itu sendiri").

---

## Keputusan Struktural

### 1. Struktur Direktori — Hierarki Kategori, Bukan 40 File Flat

```
Engineering-Constitution/
├── README.md                              ← BARU — index navigasi, 3 jalur baca
├── GLOSSARY.md                             ← BARU — definisi istilah otoritatif tunggal
├── amendments/                             ← BARU — log perubahan constitution (lihat § Amendment Process)
│   └── (kosong saat rilis awal, diisi seiring waktu)
├── adr/                                    ← ADR keputusan struktural (dokumen ini + turunannya)
│   ├── ADR-000-batching-strategy.md        (riwayat, superseded)
│   ├── ADR-001-structure-and-governance-model.md   (dokumen ini)
│   └── ADR-002-enforcement-levels-and-template.md
├── 00-principles/
│   └── 00-engineering-principles.md        (termasuk Amendment Process)
├── 01-foundations/
│   ├── 01-coding-standards.md
│   ├── 02-folder-architecture.md
│   └── 22-project-conventions.md
├── 02-architecture/
│   ├── 03-clean-architecture-rules.md
│   └── 04-domain-driven-design-rules.md
├── 03-core-implementation/
│   ├── 05-database-engineering-standard.md
│   ├── 06-api-engineering-standard.md
│   ├── 07-security-engineering-standard.md
│   └── 34-schema-migration-policy.md
├── 04-quality-and-observability/
│   ├── 08-testing-standard.md
│   ├── 09-performance-budget.md
│   ├── 10-observability-standard.md
│   ├── 28-error-handling-standard.md
│   └── 29-logging-standard.md
├── 05-team-process/
│   ├── 11-devsecops-standard.md
│   ├── 14-git-workflow-standard.md
│   ├── 15-code-review-checklist.md
│   ├── 16-definition-of-ready.md
│   ├── 17-definition-of-done.md
│   ├── 20-checklist-before-merge.md
│   └── 21-checklist-before-release.md
├── 06-governance/
│   ├── 18-never-build-list.md
│   ├── 19-architecture-decision-record-guide.md
│   ├── 23-dependency-management.md
│   ├── 24-documentation-standard.md
│   ├── 25-versioning-standard.md
│   ├── 30-technical-debt-policy.md
│   ├── 31-refactoring-policy.md
│   ├── 32-library-selection-policy.md
│   └── 33-package-approval-policy.md
├── 07-domain-specific/
│   ├── 12-ui-engineering-standard.md
│   ├── 26-feature-flag-standard.md
│   ├── 27-configuration-standard.md
│   ├── 35-event-driven-guideline.md
│   └── 36-ai-coding-guideline.md
└── 08-metrics-and-closing/
    ├── 37-engineering-metrics.md
    ├── 38-security-checklist.md
    └── 39-final-engineering-manifesto.md
```

**Rationale hierarki (bukan cuma "biar rapi"):** Setiap sub-folder **adalah** satu batch dari ADR-000 — jadi struktur folder secara harfiah merepresentasikan urutan dependency, bukan dekorasi. Seorang engineer baru yang membaca daftar folder dari atas ke bawah **secara otomatis** membaca dalam urutan dependency yang benar (fondasi → arsitektur → implementasi → kualitas → proses → governance → domain spesifik → metrics), tanpa perlu tahu ADR-000/001 ada. Ini adalah bentuk *self-documenting structure* — nilai yang tidak didapat dari 40 file flat.

**Nomor file 01-39 dipertahankan** (tidak diubah, sesuai ADR-000) — hierarki folder menambah struktur navigasi, tidak mengubah identitas file individual.

### 2. RFC 2119 sebagai Kosakata Kewajiban Baku

Setiap file di seluruh 39 file harus memakai kosakata berikut secara konsisten dalam bagian "Mandatory Rules" dan "Recommended Rules":

| Kata Kunci | Arti | Konsekuensi Pelanggaran |
|---|---|---|
| **MUST / MUST NOT** | Aturan blocking, tanpa pengecualian kecuali via ADR eksplisit | PR **tidak boleh** merge — ini masuk [Checklist Before Merge](../05-team-process/20-checklist-before-merge.md) sebagai item wajib |
| **SHOULD / SHOULD NOT** | Default kuat — deviasi diperbolehkan tapi **wajib** dijustifikasi tertulis di deskripsi PR | Reviewer boleh minta penjelasan, tidak otomatis blocking |
| **MAY** | Opsional eksplisit — pilihan valid, tidak ada ekspektasi default | Tidak ada konsekuensi proses |

**Kenapa RFC 2119, bukan bahasa bebas:** Ini adalah standar yang **sudah** dipakai [02 — Security Architecture](../../02-security-and-compliance-architecture.md) secara implisit (rujukan ke OWASP ASVS, yang memakai RFC 2119 secara eksplisit) — mengadopsinya secara sadar di seluruh constitution adalah konsistensi dengan standar yang sudah dirujuk, bukan mengimpor konsep asing.

### 3. Amendment Process — Constitution yang Bisa Berevolusi

Ditulis sebagai bagian dari `00-engineering-principles.md` (bukan file terpisah), mencakup minimal:
- **Siapa berwenang mengusulkan amandemen** — siapa pun (termasuk AI agent yang mengerjakan implementasi Phase 1-9 dan menemukan aturan tidak realistis di lapangan).
- **Siapa berwenang menyetujui** — founder, sampai ada CTO/tech lead terpisah (realita [00 — Assumptions](../../00-vision-and-business-architecture.md#assumptions): tim kecil).
- **Proses** — amandemen aturan MUST butuh ADR baru di `adr/`; amandemen aturan SHOULD/MAY cukup PR ke file terkait dengan justifikasi di deskripsi commit.
- **Log amandemen** — folder `amendments/` menyimpan ringkasan tiap perubahan signifikan (append-only, seperti audit trail — analogi yang eksplisit ditarik dari [02 — Audit Logging](../../02-security-and-compliance-architecture.md#audit-logging--tamper-proof-logging), pola yang sama diterapkan ke governance dokumen itu sendiri).

### 4. Template Standar 12-Bagian — Diperkaya, Bukan Diubah

12 bagian yang diminta brief (Purpose, Background, Principles, Mandatory Rules, Recommended Rules, Anti-Pattern, Example Good, Example Bad, Migration Strategy, Checklist, Success Metrics, References) **dipertahankan penuh** — tidak ada pengurangan. Detail template presisi (termasuk bagaimana RFC 2119 diterapkan di dalamnya) ada di **ADR-002** (dokumen terpisah, karena ini keputusan template — beda kategori dari keputusan struktur folder di ADR ini).

---

## Trade-off yang Dipertimbangkan

| Trade-off | Dipilih | Alasan |
|---|---|---|
| Hierarki folder vs flat 40 file | **Hierarki** | Self-documenting, mencerminkan dependency, memudahkan onboarding — biaya: 1 langkah navigasi ekstra (buka folder dulu), diterima karena manfaat jangka panjang untuk dokumen 10-tahun jauh lebih besar dari biaya 1 klik |
| RFC 2119 vs bahasa natural bebas | **RFC 2119** | Presisi dan dapat diverifikasi (brief eksplisit minta "dapat diaudit, dapat diverifikasi") — biaya: sedikit kaku dibanding prosa natural, diterima karena constitution BUKAN dokumen naratif, ia dokumen normatif |
| Glossary terpusat vs definisi per-file | **Terpusat** | Mencegah terminology drift — biaya: satu file tambahan untuk dipelihara, jauh lebih murah dari inkonsistensi 40 file |
| Amendment process eksplisit vs tidak ada | **Eksplisit, di dalam 00** | "Constitution 10 tahun" tanpa mekanisme ubah adalah kontradiksi diri — biaya: menambah cakupan file 00, diterima karena ini bagian inheren dari apa itu "constitution" |

---

## Dampak ke ADR-000

ADR-000 **tetap valid** untuk keputusan yang tidak diubah ADR ini: 8 batch pengelompokan dependency, urutan pengerjaan, penanganan duplikasi 07/38 dan 15-17/20-21 dan 32/33, prinsip kedalaman untuk topik horizon-jauh. **Yang berubah:** setiap batch di ADR-000 sekarang dipetakan ke satu folder bernomor (`0X-nama-folder/`), ditambah 3 artefak navigasi/governance baru (README, GLOSSARY, amendments/) yang tidak ada di ADR-000.

## Rollback

Jika founder menolak hierarki folder (mis. lebih suka flat sesuai brief harfiah): file-file yang sudah ditulis di sub-folder dipindah ke root `Engineering-Constitution/` tanpa perubahan isi — hierarki adalah lapisan organisasi murni di atas 40 file yang sama, bukan perubahan konten, sehingga rollback adalah operasi `mv` tanpa risiko kehilangan pekerjaan.

---

*ADR berikutnya: [ADR-002 — Enforcement Levels and Template](ADR-002-enforcement-levels-and-template.md) — detail presisi bagaimana 12 bagian template diterapkan dengan kosakata RFC 2119.*
