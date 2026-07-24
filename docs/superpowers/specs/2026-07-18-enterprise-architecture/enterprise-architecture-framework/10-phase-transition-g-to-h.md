# CECEP — Phase Transition Brief: G → H

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** BUKAN discovery, BUKAN architecture, BUKAN design — dokumen **handover formal** antara dua fase yang sudah frozen dan fase yang akan dimulai. Diminta founder sebagai pola baru yang akan diulang di setiap transisi fase berikutnya (H→I, I→J, dst.) — mencegah risiko fase baru diam-diam membuka kembali keputusan fase sebelumnya yang sudah frozen, khususnya penting sekarang karena CECEP sudah cukup besar (17 lapisan Phase A-G.1) untuk batas tanggung jawab mulai kabur tanpa dokumen eksplisit.

**Prinsip governing dokumen ini:** Lima bagian di bawah (Selesai/Input Wajib/Tidak Boleh Diubah/Harus Dijawab/Acceptance Criteria) BUKAN isi baru — seluruhnya adalah RINGKASAN dan RUJUKAN BALIK ke keputusan yang sudah dikunci di `08` sampai `08k`. Kalau ditemukan sesuatu yang belum terjawab saat menyusun dokumen ini, itu HARUS sudah tercatat sebagai Deferred (§ 13 `08k`) — bukan ditambal di sini.

---

## 1. Apa yang Sudah Selesai di Phase G

| Lapisan | Dokumen | Isi Inti yang Frozen |
|---|---|---|
| Discovery | [`08`](08-phase-g-enterprise-orchestration-architecture.md) | Enterprise Event Catalog (19 event), 7 artefak discovery (Classification/Criticality/Policy/Dependency-Ordering/Consistency) |
| Readiness | [`07c`](../CECEP/07c-orchestration-readiness-assessment.md) | Orchestration Gap-1 (Material Requirement), Gap-2 (Cashflow) — dikonfirmasi Orchestration Gap, bukan Capability Gap |
| Philosophy | [`08a`](08a-enterprise-orchestration-philosophy.md) | Definisi Orchestration, batas tegas Orchestrator (§ D), Execution Semantics, Lifecycle, Versioning, Failure Philosophy, Determinism, Composition/Priority/Scope/Explainability/Testability (19 section) |
| Philosophy Validation | [`08b`](08b-phase-g0-orchestration-philosophy-validation.md) | Kontradiksi/Overlap/Hidden Ownership/Cross-Layer Leak diperiksa, 1 leak ditemukan+diperbaiki (§ P) |
| Rule Taxonomy | [`08d`](08d-rule-taxonomy-discovery.md) | 10 jenis Rule diuji, 3 kelompok ditemukan |
| Rule Meta Model | [`08e`](08e-rule-meta-model-discovery.md) | Rule + Formula = dua bentuk **Executable Knowledge Model**, tetap Layer 5 |
| Rule Storage | [`08f`](08f-rule-storage-philosophy.md) | Family→Template→Instance, Lazy/Eager berbasis kategori data |
| Information Classification | [`08g`](08g-information-classification-discovery.md) | Computed Data ≠ Derived Data (kategori sejajar, bukan ACR) |
| Information Characteristic | [`08h`](08h-information-characteristic-discovery.md) | Dua sumbu Classification × Characteristic, Replay-by-Recompute vs Retrieve |
| Rule Ontology Validation | [`08i`](08i-rule-ontology-validation.md) | Empat sudut pandang (Ontologi/Informasi/Lifecycle/Hubungan) diverifikasi konsisten |
| Discovery Completion | [`08j`](08j-discovery-completion-assessment.md) | 14 Open Question dinilai, Discovery Completion Rule pertama kali diterapkan |
| Design | [`08c v2`](08c-orchestration-rule-design-v2.md) | Rule-001 s.d. 005 konkret, Rule Group, Hybrid Lazy/Eager berdasar Classification |
| Stress Test & Freeze | [`08k`](08k-phase-g1-rule-design-validation-freeze.md) | 12 skenario adversarial, 6 perbaikan aditif, 2 defer eksplisit ke H |
| Governance | [`04`](../CECEP/04-architecture-constitution.md) § 15 | Discovery Completion Rule diangkat jadi prinsip lintas-fase |

**Ringkasan satu kalimat:** Phase G menghasilkan sebuah **Orchestration Rule System** yang terbukti (lewat 12 skenario stress test) tahan collision, dead rule, circular dependency (termasuk lintas system_signal), cascade, storm, priority inversion, recovery loop, replay ambiguity, dan idempotency — dibangun di atas ontologi yang solid (Executable Knowledge Model) dan klasifikasi informasi yang teruji dua sumbu.

---

## 2. Apa yang Menjadi Input Wajib untuk Phase H

**Phase H (Integration Architecture) TIDAK BOLEH mulai dari nol — lima artefak berikut WAJIB dipakai sebagai fondasi, bukan didesain ulang:**

1. **Rule Definition** (struktur § I `08a`, field lengkap termasuk `trigger_type`/`authored_by` dari `08e`, `action_result_class` dari `08c v2`) — Phase H akan menulis Rule BARU untuk kebutuhan Integration (mis. Rule yang memicu CAP-013), tapi Rule itu WAJIB mengikuti struktur yang sama, tidak boleh varian baru.
2. **Enterprise Event Catalog** (`08` § A, 19 event + 3 event baru dari `08c v2` § E: `RapDraftGenerated`/`MaterialRequirementDraftGenerated`/`CashflowBaselineGenerated`) — Phase H akan menambah event baru terkait sistem eksternal, WAJIB mengikuti pola Classification/Criticality/Policy yang sama.
3. **Rule Execution Model** (delapan-langkah § A `08c v2`, termasuk langkah 6a Rule Group/Recovery) — cara Rule dieksekusi sudah dikunci, Phase H tidak mendesain ulang MEKANISME eksekusi, hanya mengisi APA yang dipanggil (CAP-013 konkret).
4. **Rule Metadata & Ontology** (`08e`/`08i` — Rule = Configuration Data + Characteristic tertentu, Layer 5 murni) — dipakai sebagai kerangka kalau Phase H menemukan kebutuhan mengklasifikasikan objek Integration baru (mis. "Adapter Definition" — harus diuji dulu apakah ia juga Executable Knowledge Model atau kategori lain, memakai metodologi `08e`, bukan diasumsikan).
5. **Idempotency Key mechanism** (§ 9 `08k`, pada Rule Explanation) — CAP-013 WAJIB menerima dan memanfaatkan `idempotency_key` yang sudah didesain, bukan menciptakan mekanisme idempotency terpisah yang tidak terhubung ke Rule Explanation.

---

## 3. Apa yang Tidak Boleh Diubah Lagi (Tanpa ACR)

**Konsisten Progressive Freeze Chain (`04` § 7) — daftar ini bukan pengingat sopan-santun, ia adalah PAGAR. Phase H yang menyentuh salah satu dari ini WAJIB berhenti dan mengajukan ACR ([`04a`](../CECEP/04a-adr-traceability-log.md)), bukan langsung mengubah:**

| Dikunci Sejak | Tidak Boleh Diubah |
|---|---|
| `04` § 8 | Five Truth Layers — Rule/Formula tetap Layer 5 (Rule murni), Layer 3+5 (Formula) |
| `08e` § B | Rule Ontology — Executable Knowledge Model, BUKAN Ontology Object independen ala Palantir |
| `08f` § C | Rule Family → Template → Instance — hierarki reuse, Template opsional |
| `08a` § J | Rule Lifecycle — Draft→Testing→Approved→Published→Superseded→Deprecated→Archived |
| `08a` § K | Rule Versioning — immutable setelah Published |
| `08a` § R | Rule Explainability — dibangun otomatis dari eksekusi, bukan laporan manual |
| `08a` § M | Determinism — menjamin KEPUTUSAN orkestrasi sama, bukan HASIL eksekusi Capability eksternal (`08i` § D, dikonfirmasi ulang `08k` § 8) |
| `08a` § D | Batas tegas Orchestrator — tidak pernah mengubah data/memiliki Entity/menghitung Cost/mengganti Formula/memiliki Business Rule/mengambil Ownership |
| `04` § 10 | Orchestration Separation Principle — memiliki capability ≠ memiliki orchestration |
| `08k` § 1, 3, 7 | Aturan Rule Collision (target-write eksklusif), cakupan DFS graph gabungan, larangan Recovery Rule memanggil Capability yang sama dengan Rule Group yang gagal |

---

## 4. Apa yang Memang Harus Dijawab di Phase H

**Ini BUKAN kelalaian Phase G — ini domain yang SECARA SENGAJA ditinggalkan untuk Phase H karena baru bisa dijawab setelah Integration Architecture punya bentuk. Daftar ini mengonsolidasikan SEMUA Open Question dan Deferred item yang terkumpul sepanjang Phase G:**

| # | Item | Sumber | Kenapa Milik Phase H |
|---|---|---|---|
| 1 | **Integration Contract** (bentuk konkret CAP-013/Integration Gateway) | `08c v2` § G poin 2 | Phase G hanya menetapkan BAHWA CAP-013 dipanggil dan KAPAN — BAGAIMANA adalah Integration |
| 2 | **Event Join Semantics** (ANY/ALL/QUORUM) | `08k` § 11, § 13 | Butuh Event Contract konkret untuk menjawab bagaimana Consumer menggabungkan event dari Producer berbeda |
| 3 | **Event Contract Versioning** (coexist/migrasi/deprecation) | `08k` § 12, § 13 | Bagian mendesain Payload Contract itu sendiri |
| 4 | **Payload Contract** tiga event baru (RapDraft/MaterialRequirement/CashflowBaseline) | `08c v2` § G poin 3 | Bentuk data pertukaran dengan sistem existing |
| 5 | **Nilai Timeout konkret** per Rule/Criticality | `08c v2` § G poin 1, dinaikkan prioritas oleh `08k` § 5 | Keputusan operasional, butuh data nyata dari Integration |
| 6 | **Delivery Guarantee** (at-least-once/exactly-once) untuk event lintas-sistem | Baru diidentifikasi di sini (implikasi § 9 `08k`, Idempotency) | Idempotency Key sudah didesain di G, tapi jaminan delivery adalah keputusan Integration Pattern |
| 7 | **External Adapter pattern** (bagaimana CAP-013 menerjemahkan format CECEP ↔ Puraloka Suite existing) | `03b` Anti-Corruption Layer, "diidentifikasi perlu ada, belum didesain" | Domain Integration murni |
| 8 | **Contract Negotiation** (apa yang terjadi kalau sistem existing berubah skema tanpa pemberitahuan) | Baru diidentifikasi di sini, konsekuensi logis dari § 12 | Operational Integration (`04` § 14, sudah dipetakan ke Phase I dalam penomoran lama — **CATATAN: perlu verifikasi ulang saat Phase H dimulai, karena § 14 `04` ditulis SEBELUM relabel H/I — lihat § 6 di bawah**) |

---

## 5. Acceptance Criteria Phase H

**Phase H dianggap SELESAI (siap Validation & Freeze H.1) ketika:**

1. Integration Gateway (CAP-013) punya desain konkret — format data, protokol pemanggilan, error handling — yang MEMENUHI (bukan mengubah) batas yang sudah dikunci § D `08a` (Orchestrator tidak pernah mengeksekusi sendiri, hanya memanggil).
2. Kedelapan item § 4 di atas terjawab TUNTAS — bukan didefer lagi ke Phase I, kecuali diuji ulang lewat Discovery Completion Rule (`04` § 15) dan terbukti genuinely bukan milik Phase H.
3. Tiga event baru (§ 2 poin 2) punya Payload Contract lengkap, terverifikasi acyclic terhadap Event Dependency graph (`08` § F) — mengikuti prosedur yang sudah didesain `08k` § 4.
4. Rule-001/002/003 (yang action-nya memanggil CAP-013) DIUJI ULANG terhadap Integration Contract yang baru selesai — memverifikasi tidak ada asumsi implisit yang ternyata salah (verifikasi silang, bukan re-design).
5. Phase H menjalankan tujuh lapisan yang sama seperti G (Discovery → Philosophy → Validation → Discovery Completion Assessment → Design → Stress Test → Freeze) — pola governance yang sudah terbukti, BUKAN opsional untuk Phase H hanya karena "sudah paham caranya".
6. Stress test H (analog `08k`) WAJIB menguji minimal: kegagalan sistem eksternal (Puraloka Suite existing down), skema pihak eksternal berubah tanpa pemberitahuan, network partition/retry storm, dan replay data lintas-sistem — empat skenario yang MUNCUL secara langsung dari sifat Integration (beda dari sepuluh skenario `08k` yang murni internal CECEP).

---

## 6. Satu Perbaikan Kecil Ditemukan Saat Menyusun Brief Ini

**Ditemukan selama menyusun § 4 poin 8:** `04-architecture-constitution.md` § 14 (Operational Perspective) masih memetakan "Operational Integration" ke **"Phase I — Integration Architecture"** — penamaan LAMA, sebelum relabel H/I yang sudah dikunci (`04` § 7, Progressive Freeze Chain: Phase H = Integration, Phase I = AI). Ini murni SISA penomoran yang terlewat saat relabel dilakukan, bukan keputusan yang berubah — relabel-nya sendiri sudah benar diterapkan di § 7, hanya § 14 yang belum ikut disinkronkan.

**Diperiksa apakah ini ACR:** Tidak — ini kesalahan ketik/sinkronisasi penomoran (dampaknya nol terhadap keputusan arsitektur, Operational Integration TETAP dipetakan ke fase Integration, hanya labelnya yang salah tulis "I" padahal seharusnya "H"), diperbaiki langsung di bawah ini.

---

## Assumptions

1. Delapan item § 4 diasumsikan LENGKAP berdasarkan penelusuran seluruh dokumen `08` s.d. `08k` — kalau Phase H Discovery menemukan item kesembilan yang genuinely tertinggal, itu ditambahkan ke Phase H Discovery sendiri, bukan tanda Brief ini gagal (Brief adalah snapshot titik transisi, bukan janji kelengkapan mutlak selamanya).
2. Empat skenario stress test tambahan (§ 5 poin 6) adalah usulan awal berdasarkan sifat generik Integration Architecture — Phase H Discovery boleh menemukan skenario lain yang lebih spesifik untuk konteks Puraloka Suite existing.

## Open Questions

(Tidak ada — dokumen ini murni konsolidasi dari Open Question yang SUDAH tercatat di `08c v2` dan `08k`, didaftar lengkap di § 4.)

## Status

**Phase Transition Brief selesai.** Lima bagian (Selesai/Input Wajib/Tidak Boleh Diubah/Harus Dijawab/Acceptance Criteria) tersusun sebagai handover formal G→H. Satu perbaikan sinkronisasi kecil ditemukan dan diperbaiki (§ 6, penomoran § 14 `04`). **CECEP siap memulai Phase H — Integration Architecture**, mengikuti pola tujuh-lapisan yang sama (Discovery→Philosophy→Validation→Discovery Completion→Design→Stress Test→Freeze) yang terbukti bekerja di Phase G.

*Pola dokumen ini (Phase Transition Brief) akan diulang di setiap transisi fase berikutnya — H→I, I→J, J→K, K→L — sebagai bagian tetap metodologi CECEP.*
