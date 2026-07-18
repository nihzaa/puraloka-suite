# ADR-000 — Strategi Batching Engineering Constitution

**Status:** ⚠️ **Sebagian di-supersede oleh [ADR-001](ADR-001-structure-and-governance-model.md)** — keputusan *pembagian 8 batch berdasarkan dependency* dan *penanganan duplikasi 07/38, 15-17/20-21, 32/33* di dokumen ini **tetap berlaku**. Keputusan *struktur direktori flat* (bagian "Struktur Repository yang Diusulkan" di bawah) **digantikan** oleh struktur hierarkis di ADR-001. Dokumen ini dipertahankan utuh sebagai riwayat keputusan (append-only, tidak diedit isinya), bukan dihapus — konsisten prinsip yang sama yang mengikat migration SQL di seluruh proyek ini.
**Konteks:** Engineering Constitution (40 file) diminta sebagai "undang-undang" mengikat implementasi Phase 1-9. Founder eksplisit meminta saya menganalisis dependency dan mengusulkan pembagian batch sendiri, bukan menentukan sendiri urutannya secara sepihak.
**Cakupan keputusan:** Struktur repository, jumlah batch, urutan batch, isi tiap batch, dan penanganan duplikasi antar topik yang diminta.

---

## Konteks Lengkap

40 file diminta, masing-masing dengan 12 bagian wajib (Purpose, Background, Principles, Mandatory Rules, Recommended Rules, Anti-Pattern, Example Good, Example Bad, Migration Strategy, Checklist, Success Metrics, References). Founder eksplisit memprioritaskan kualitas di atas kecepatan — tidak ada file yang boleh dangkal atau placeholder.

**Analisis yang saya lakukan sebelum ADR ini:**
1. Memetakan dependency antar 40 topik (topik mana merujuk topik mana).
2. Memetakan setiap topik terhadap kebutuhan nyata Sub-Fase 1A-1D ([Phase1/02-target-architecture.md](../../Phase1/02-target-architecture.md)) — apakah topik ini akan **benar-benar dipakai** sebagai aturan kerja begitu implementasi Phase 1 dimulai, atau relevan untuk horizon jauh (Phase 5-9).
3. Mengecek ketersediaan **bukti konkret di codebase** untuk dijadikan Example Good/Bad — file dengan bukti konkret bisa ditulis matang sekarang; file tanpa bukti konkret (topik untuk fase yang belum dibangun) berisiko jadi teori kosong kalau dipaksa detail penuh sekarang.
4. Mengecek tumpang tindih/duplikasi eksplisit antar topik yang diminta.

---

## Masalah yang Ditemukan pada Struktur 40-File Asli

Sebelum mengusulkan batch, saya perlu melaporkan temuan struktural yang mempengaruhi rekomendasi — sesuai instruksi founder untuk mengusulkan perbaikan jika ada.

### Temuan 1 — Duplikasi Nyata Antar File yang Diminta

| Pasangan File Diminta | Tumpang Tindih |
|---|---|
| **07-security-engineering-standard** vs **38-security-checklist** | Checklist keamanan yang bermakna **adalah** turunan dari standar keamanan — kalau ditulis sebagai dua file terpisah dan independen, salah satu akan basi duluan saat yang lain diupdate (aturan yang sama harus diubah di 2 tempat) |
| **15-code-review-checklist**, **16-definition-of-ready**, **17-definition-of-done**, **20-checklist-before-merge**, **21-checklist-before-release** | Lima file ini semua adalah **gate proses** pada titik berbeda dalam siklus hidup satu unit kerja (mulai → siap dikerjakan → selesai dikerjakan → sebelum merge → sebelum rilis) — kontennya secara alami saling mengutip berat. Menulis kelima sebagai file benar-benar independen (bukan satu keluarga yang saling merujuk eksplisit) berisiko inkonsistensi tinggi (mis. DoD menyebut kriteria yang tidak disebut Checklist Before Merge, padahal harusnya sama) |
| **32-library-selection-policy** vs **33-package-approval-policy** | "Memilih library" dan "menyetujui package baru" adalah proses yang sama dilihat dari dua sudut (evaluasi teknis vs approval administratif) — nyaris selalu satu keputusan tunggal di organisasi kecil |

**Bukan berarti file-file ini digabung jadi satu** (itu mengurangi granularitas yang founder minta) — tapi **wajib ditulis dalam urutan yang membuat satu jadi sumber-kebenaran dan yang lain eksplisit mewarisi/mereferensikan**, bukan ditulis independen lalu diverifikasi konsisten belakangan (rawan drift).

### Temuan 2 — Beberapa Topik Tidak Punya Bukti Konkret di Codebase Hari Ini

| Topik | Realita |
|---|---|
| **35-event-driven-guideline** | [06 — Event Bus & Event Store](../../06-agentic-ai-and-automation-architecture.md#event-bus--event-store) eksplisit: event bus adalah `Later`, prasyarat Phase 5. Menulis "Mandatory Rules" detail untuk sistem yang belum ada strukturnya adalah *fantasy architecture* — istilah yang dipakai berulang di seluruh architecture repo sebagai anti-pattern yang harus dihindari |
| **13/36 — AI Engineering (dua nomor untuk topik yang sama: "AI Engineering Standard" dan "AI Coding Guideline")** | [06 — Agentic AI Architecture](../../06-agentic-ai-and-automation-architecture.md) sudah **sangat lengkap** (9 section, Model Router, Prompt Management, guardrail) — tapi ini semua desain untuk Phase 6+, nol baris kode AI ada hari ini |
| **26-feature-flag-standard** | Skemanya **sudah didesain presisi** di [Phase1/02](../../Phase1/02-target-architecture.md#1b3-module-registry--feature-flags) untuk Sub-Fase 1B — tapi belum diimplementasi, jadi Example Good/Bad harus berupa skema yang didesain (bukan kode berjalan) |

**Implikasi:** Memaksa 12 bagian penuh dengan kedalaman sama untuk topik yang punya kode nyata (Database Standard) vs topik yang murni desain masa depan (Event-Driven) akan menghasilkan salah satu dari dua kegagalan — topik dengan bukti nyata jadi terlalu tipis (dipaksa sama panjang dengan yang tanpa bukti), atau topik tanpa bukti jadi mengarang contoh yang terkesan otoritatif padahal spekulatif. **Solusi:** kedalaman tetap tinggi di semua 12 bagian untuk semua file (tidak ada yang di-skip), tapi sumber contoh berbeda secara jujur — dijelaskan di bagian "Prinsip Kedalaman" di bawah.

### Temuan 3 — Dua Nomor untuk Satu Topik

Brief mencantumkan **13-ui-engineering-standard** (Frontend) — lalu terpisah menyebut kebutuhan **13-ai-engineering-standard** dalam daftar section "KHUSUS AI" tapi nomor 13 sudah dipakai UI. Dan **36-ai-coding-guideline** juga eksplisit diminta. Saya interpretasikan: nomor asli 13 tetap **UI Engineering Standard** (sesuai urutan file eksplisit founder), kebutuhan "AI Engineering Standard" dipenuhi lewat **36-ai-coding-guideline** — jadi tidak ada nomor yang perlu diubah, hanya klarifikasi bahwa "khusus AI" bukan file baru bernomor 13 kedua, itu **isi** dari file 36.

---

## Opsi yang Dipertimbangkan

### Opsi A — Batch Berdasarkan Nomor File Berurutan (00→39 dalam kelompok 5-8 file)

Pecah 40 file jadi 6-8 batch beruntun mengikuti nomor asli.

**Trade-off:** Sederhana untuk dilacak, tapi **mengabaikan dependency nyata** — file 05 (Database Standard) akan ditulis sebelum file 03 (Clean Architecture) selesai walau Database Standard mengasumsikan Repository Pattern yang didefinisikan Clean Architecture. Nomor asli founder **bukan** urutan dependency — itu urutan penyajian topik dalam prompt, dua hal berbeda.

### Opsi B — Batch Berdasarkan Lapisan Dependency (Rekomendasi)

Kelompokkan 40 file ke **7 lapisan dependency** (Fondasi → Arsitektur → Implementasi Inti → Kualitas/Delivery → Proses Tim → Governance/Keputusan → Domain Spesifik & Penutup), setiap lapisan adalah satu batch, dikerjakan berurutan karena lapisan N+1 merujuk lapisan N.

**Trade-off:** Lebih kompleks untuk dilacak (nomor file tidak berurutan sempurna dalam satu batch), tapi **setiap batch benar-benar independen-untuk-direview** dan tidak ada file yang menulis "mengacu ke standar X" padahal X belum ditulis — persis kriteria yang founder minta eksplisit ("dapat direview secara independen").

### Opsi C — Batch Berdasarkan Prioritas Kebutuhan Phase 1 (Semua yang Dipakai 1A-1D Dulu, Sisanya Belakangan)

Ini pilihan kedua yang saya tawarkan di pertanyaan sebelumnya — founder eksplisit **tidak memilih ini** ("saya tidak ingin ada file yang ditulis dangkal... untuk seluruh Puraloka Suite dari Phase 1 sampai Phase 9"), jadi opsi ini tidak dipertimbangkan lebih lanjut, dicatat di sini untuk kelengkapan riwayat keputusan.

## Keputusan: Opsi B — Batch Berdasarkan Lapisan Dependency

---

## Struktur Repository yang Diusulkan

```
Engineering-Constitution/
├── ADR-000-batching-strategy.md          ← dokumen ini
├── 00-engineering-principles.md           ← Batch 0 (berdiri sendiri, prasyarat filosofis semua)
├── 01-coding-standards.md                 ┐
├── 02-folder-architecture.md              ├─ Batch 1 — Fondasi
├── 22-project-conventions.md              ┘
├── 03-clean-architecture-rules.md         ┐
├── 04-domain-driven-design-rules.md       ┘─ Batch 2 — Prinsip Arsitektur
├── 05-database-engineering-standard.md    ┐
├── 06-api-engineering-standard.md         ├─ Batch 3 — Implementasi Inti
├── 07-security-engineering-standard.md    ┘   (PRIORITAS TERTINGGI — dipakai Sub-Fase 1A langsung)
├── 34-schema-migration-policy.md          ┘   (digabung batch ini — turunan langsung Database Standard + RLS expand-contract Phase1/03)
├── 08-testing-standard.md                 ┐
├── 28-error-handling-standard.md          ├─ Batch 4 — Kualitas & Observability
├── 29-logging-standard.md                 │   (dipakai Sub-Fase 1A/1D langsung)
├── 10-observability-standard.md           ┘
├── 09-performance-budget.md                   (batch 4, angka target dari doc 03)
├── 14-git-workflow-standard.md            ┐
├── 15-code-review-checklist.md            │
├── 16-definition-of-ready.md              ├─ Batch 5 — Proses Tim (satu keluarga saling rujuk)
├── 17-definition-of-done.md               │
├── 20-checklist-before-merge.md           │
├── 21-checklist-before-release.md         ┘
├── 11-devsecops-standard.md                   (batch 5, CI/CD gate — beririsan Git Workflow)
├── 19-architecture-decision-record-guide.md ┐
├── 18-never-build-list.md                  │
├── 30-technical-debt-policy.md             ├─ Batch 6 — Governance & Keputusan
├── 31-refactoring-policy.md                │
├── 23-dependency-management.md             │
├── 32-library-selection-policy.md          │
├── 33-package-approval-policy.md           ┘  (32+33 ditulis sebagai pasangan eksplisit saling rujuk)
├── 25-versioning-standard.md               │
├── 24-documentation-standard.md            ┘
├── 12-ui-engineering-standard.md          ┐
├── 26-feature-flag-standard.md            ├─ Batch 7 — Domain Spesifik
├── 27-configuration-standard.md           │   (dipakai Sub-Fase 1B langsung: 26, 27)
├── 35-event-driven-guideline.md           │   (horizon jauh — Phase 5+, ditulis sebagai kontrak masa depan yang jujur soal itu)
├── 36-ai-coding-guideline.md              ┘   (horizon jauh — Phase 6+, distilasi dari doc 06 yang sudah matang)
├── 37-engineering-metrics.md              ┐
├── 38-security-checklist.md               ├─ Batch 8 — Metrics & Penutup
└── 39-final-engineering-manifesto.md      ┘   (38 eksplisit format "checklist siap-pakai" dari isi 07, bukan standar baru)
```

**Catatan urutan file dalam direktori:** Prefix nomor **tetap sesuai yang diminta founder** (01-39) — pengelompokan batch adalah *urutan pengerjaan dan commit*, bukan penomoran ulang file. Ini penting supaya referensi nomor file founder di brief tetap valid tanpa perlu dipetakan ulang.

---

## Rincian 8 Batch

| Batch | Isi | Kenapa Satu Batch | Dependency Masuk |
|---|---|---|---|
| **0** | `00-engineering-principles.md` | Berdiri sendiri — filosofi generik ("prioritaskan correctness di atas speed", dst) yang **seluruh** 39 file lain mewarisi nilai-nilainya | Tidak ada (murni turunan dari [00 — Vision](../../00-vision-and-business-architecture.md) dan brief Phase 1) |
| **1 — Fondasi** | `01, 02, 22` | Penamaan/struktur/konvensi — dirujuk oleh hampir semua file lain | Batch 0 |
| **2 — Prinsip Arsitektur** | `03, 04` | Clean Architecture (layer) dan DDD (boundary domain) saling terkait erat — Repository Pattern dari 03 dan Aggregate Root dari 04 sering dibahas dalam kalimat yang sama | Batch 1 |
| **3 — Implementasi Inti** | `05, 06, 07, 34` | Database + API + Security + Schema Migration — dependency melingkar nyata (RLS didefinisikan di 05, dikontrol keamanannya di 07, migrasinya diatur 34). **Prioritas tertinggi** karena Sub-Fase 1A butuh ini SEBELUM kode disentuh | Batch 2 |
| **4 — Kualitas & Observability** | `08, 09, 10, 28, 29` | Testing butuh tahu representasi error (28) dan structured logging (29) untuk assertion yang benar; Observability (10) dan Performance Budget (09) berbagi metrik yang sama | Batch 3 |
| **5 — Proses Tim** | `11, 14, 15, 16, 17, 20, 21` | Satu keluarga gate siklus-hidup kerja + DevSecOps (CI/CD gate yang mengeksekusi checklist-checklist ini secara otomatis) | Batch 1 (independen dari 2-4 secara teknis, tapi butuh ada *sesuatu* untuk direview — logis setelah ada standar teknis dasar) |
| **6 — Governance & Keputusan** | `18, 19, 23, 24, 25, 30, 31, 32, 33` | "Aturan tentang membuat keputusan" — ADR Guide, Tech Debt, Refactoring, Dependency/Library/Package (3 topik yang saling terkait erat), Versioning, Documentation | Batch 3, 4 (butuh tahu apa yang sedang diputuskan) |
| **7 — Domain Spesifik** | `12, 26, 27, 35, 36` | UI (bukti konkret ada — Warm Clay), Feature Flag + Configuration (dipakai Sub-Fase 1B), Event-Driven + AI (horizon jauh, ditulis sebagai kontrak masa depan yang eksplisit jujur soal statusnya) | Batch 1, 3 |
| **8 — Metrics & Penutup** | `37, 38, 39` | Metrics dan Security Checklist merangkum standar yang sudah ditetapkan; Manifesto adalah sintesis akhir | **Seluruh batch 0-7** — harus di akhir karena isinya adalah rangkuman/pengukuran dari semuanya |

**Total: 9 unit kerja (Batch 0-8), masing-masing commit terpisah**, sesuai instruksi founder "setiap batch memiliki commit sendiri."

---

## Prinsip Kedalaman — Menjawab "Jangan Dangkal" Tanpa Mengarang

Untuk topik dengan bukti konkret di codebase (Database, API, Security, UI, Feature Flag, Configuration, Schema Migration) — **Example Good/Bad diambil dari kode nyata** (file:line, seperti gaya [Phase1/00-current-state-audit.md](../../Phase1/00-current-state-audit.md)).

Untuk topik horizon jauh (Event-Driven, AI Coding Guideline) — **12 bagian tetap lengkap dan matang**, tapi:
- **Background** menjelaskan jujur bahwa ini kontrak masa depan, merujuk fase spesifik di [04 — Roadmap](../../04-roadmap-governance-and-delivery.md#phase-0-9-transformation-program) yang mengaktifkannya.
- **Example Good/Bad** diambil dari **desain yang sudah ada** di architecture repo (mis. AI Coding Guideline mengutip pola guardrail konkret dari [03 — Prinsip Guardrail Lintas-Agent](../../03-platform-and-intelligence-architecture.md#prinsip-guardrail-lintas-agent)) — bukan kode aplikasi, tapi tetap **contoh konkret dan spesifik**, bukan generalisasi abstrak.
- **Mandatory Rules** difokuskan pada *prinsip yang harus dipegang siapa pun yang nanti mengimplementasikan* (mis. "tidak ada tool call AI yang mengeksekusi aksi finansial tanpa HITL") — ini **sudah** merupakan keputusan final dari doc 06, bukan spekulasi baru.

Dengan pendekatan ini, tidak ada file yang "dangkal karena belum ada kodenya" — kedalaman datang dari *kematangan keputusan yang sudah dibuat di architecture repo*, bukan dari kode yang belum ditulis.

---

## Proses Review per Batch

Sesuai instruksi founder, setiap batch mendapat:
1. **Self-review** — placeholder scan, kelengkapan 12 bagian per file.
2. **Consistency review** — apakah batch ini berkontradiksi dengan batch sebelumnya, atau dengan Architecture Repository / Phase 1 Planning Package.
3. **Cross-reference validation** — script verifikasi link (pola yang sudah dipakai di repository ini, lihat commit-commit sebelumnya).
4. **Commit terpisah per batch.**

**Gate antar batch:** Sesuai pola yang sudah ditetapkan di seluruh proyek ini ([04 — Architecture Governance](../../04-roadmap-governance-and-delivery.md#architecture-governance--phase-gates)), saya akan melaporkan ringkas setiap batch selesai, tapi **tidak berhenti menunggu approval eksplisit di setiap batch** kecuali founder memintanya — karena batch di sini adalah dekomposisi kerja dalam SATU permintaan yang sudah disetujui (bukan 9 keputusan cakupan terpisah). Founder tetap bisa menghentikan/mengoreksi arah di titik mana pun.

---

## Ringkasan Perubahan yang Diusulkan (Butuh Persetujuan)

1. **Struktur direktori**: `Engineering-Constitution/` sebagai direktori setingkat `Phase1/`, di dalam `2026-07-18-enterprise-architecture/`.
2. **Penomoran file dipertahankan 01-39 sesuai brief** — pengelompokan adalah urutan pengerjaan, bukan penomoran ulang.
3. **8 batch pengerjaan** (0-7) + commit final, urutan berdasarkan dependency, bukan urutan nomor asli.
4. **File 34 (Schema Migration)** ditulis dalam Batch 3 (bersama Database/API/Security), bukan Batch 6 (Governance) tempat "policy" lain berada — karena isinya secara teknis adalah bagian tak terpisahkan dari Database Standard dan harus konsisten presisi dengan [Phase1/03-migration-strategy.md](../../Phase1/03-migration-strategy.md) yang sudah ada.
5. **File 32+33 (Library Selection + Package Approval)** ditulis sebagai pasangan eksplisit saling rujuk untuk mencegah duplikasi kebijakan yang sama ditulis dua kali secara independen.
6. **File 38 (Security Checklist)** eksplisit diposisikan sebagai *distilasi checklist siap-pakai* dari file 07 (Security Engineering Standard) — bukan standar independen kedua.
7. **File 15-17, 20-21** (5 file proses/gate) ditulis sebagai satu keluarga di Batch 5 dengan cross-reference eksplisit antar sama lain, mencegah drift kriteria.

**Menunggu persetujuan founder sebelum Batch 0 dimulai.**
