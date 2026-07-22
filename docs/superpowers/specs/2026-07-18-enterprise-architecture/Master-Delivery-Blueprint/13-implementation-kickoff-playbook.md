# 13 — Implementation Kickoff Playbook (Template Reusable, Bukan Kickoff Package)

**Kedudukan dokumen ini:** Orkestrasi Baru — ditambahkan setelah [Implementation-Kickoff/](../Implementation-Kickoff/00-executive-summary.md) (11 dokumen untuk Sub-Fase 1A) selesai, dan founder menanyakan apakah Phase 2-9 juga butuh paket serupa. **Jawaban:** ya struktur-nya, tapi TIDAK diisi sekarang — lihat § Prinsip Governing.

## Prinsip Governing (Kenapa Ini Template, Bukan 8× Kickoff Package)

`Implementation-Kickoff/` untuk Sub-Fase 1A **bukan dokumen desain** — isinya adalah *audit kondisi kode hari ini* (grep, nomor baris, nama file migration, angka test coverage riil). Contoh konkret dari isinya: *"draft awal mengklaim migration sinkron 58/58, reverifikasi menemukan 57/58"* — ini fakta yang HANYA bisa diverifikasi saat itu terjadi, bukan diprediksi jauh sebelumnya.

Menulis kickoff package detail untuk Phase 9 (horizon 5-10 tahun, `04-roadmap-governance-and-delivery.md` sendiri eksplisit menyatakan *"detail konkret fase ini sengaja tidak didesain mendalam sekarang"*) berarti menebak kondisi kode yang belum ada. Itu bukan kehati-hatian — itu investasi yang **akan basi sebelum dipakai**, pelanggaran langsung terhadap YAGNI yang sudah jadi prinsip mengikat di seluruh Blueprint ini ([00-executive-delivery-vision.md § 4](00-executive-delivery-vision.md#4-prinsip-governance-program-baru) poin 3: *"Program MUST NOT direncanakan detail lebih dari 1 Program ke depan dengan presisi tinggi"*).

**Aturan trigger (mengikat, bukan saran):**

> Kickoff package detail untuk Program N **HANYA** ditulis setelah Program N-1 mencapai Exit Criteria-nya ([04-delivery-orchestration.md § 4](04-delivery-orchestration.md#4-exit-criteria--operasionalisasi-per-program)). Tidak lebih awal — termasuk tidak boleh ditulis "supaya siap duluan," karena kesiapan itu palsu (based on asumsi, bukan audit kode nyata) dan akan menciptakan technical debt dokumentasi yang harus ditulis ulang begitu Program itu benar-benar dimulai.

## Struktur Playbook — 11 Bagian (Diekstrak dari Pola `Implementation-Kickoff/00`-`10`)

Setiap kali Program berikutnya mencapai gerbang mulai (Exit Criteria Program sebelumnya terpenuhi), kickoff package Program itu **MUST** mengikuti sebelas bagian berikut, dengan judul file yang sama persis (memudahkan navigasi lintas-Program begitu beberapa sudah ada):

| # | Nama File | Isi yang Diverifikasi Saat Itu (Bukan Sekarang) |
|---|---|---|
| 00 | `00-executive-summary.md` | Readiness score N dimensi + Critical Blockers, ditulis dari kondisi kode **saat Program dimulai** |
| 01 | `01-implementation-readiness.md` | Skor per dimensi dengan evidence file:line — WAJIB grep/baca langsung, bukan warisi dari dokumen desain |
| 02 | `02-phase-Na-sequence.md` | Pemecahan Sub-Fase pertama Program jadi unit eksekusi (Objective/Dependency/Input/Output/Deliverable/Rollback/DoD per unit) |
| 03 | `03-folder-and-module-order.md` | Urutan folder/file presisi — hanya bisa ditulis setelah tahu struktur repo terkini |
| 04 | `04-database-migration-plan.md` | Nomor migration terbaru **MUST** diverifikasi ulang (`db/migrations/` vs `supabase/migrations/` sinkron?) — jangan warisi angka dari dokumen lama |
| 05 | `05-feature-implementation-order.md` | Dependency graph Epic-level dalam Program tsb |
| 06 | `06-testing-execution-plan.md` | Kapan tiap jenis test dijalankan, diselaraskan kondisi CI/CD **saat itu** |
| 07 | `07-release-and-rollback-plan.md` | Strategi branch/merge/rollback — per Task/Epic, verifikasi ulang mekanisme rollback ada untuk SETIAP migration baru (bukan asumsi "sama seperti sebelumnya") |
| 08 | `08-day-one-checklist.md` | Checklist pre-coding + governance gate wajib pertama |
| 09 | `09-definition-of-ready.md` | Kondisi startable per-Task, kategori khusus untuk Task berisiko tinggi (finansial/security) |
| 10 | `10-go-no-go-checklist.md` | Checklist N-poin, keputusan GO/NO-GO tunggal, melalui **independent adversarial review** sebelum difinalkan (pola yang terbukti menemukan 6 finding nyata di Sub-Fase 1A — pertahankan disiplin ini, jangan lewati demi kecepatan) |

**Yang WAJIB dipertahankan dari pola Sub-Fase 1A, bukan opsional:**
1. **Adversarial review sebelum finalisasi** — Sub-Fase 1A menemukan 6 finding nyata (F3-F8) lewat 5 review independen paralel. Kickoff package Program berikutnya **MUST** melalui proses serupa, bukan diterima langsung draft pertama.
2. **Kejujuran status** — "PASS DENGAN KOREKSI" dan "PASS DENGAN CATATAN" adalah status yang SAH di checklist Go/No-Go (lihat `10-go-no-go-checklist.md` Sub-Fase 1A) — jangan dipaksa jadi PASS/FAIL biner kalau realitanya bernuansa.
3. **Reviewed-and-ruled-out dicatat, bukan disembunyikan** — kalau reviewer mengklaim gap yang setelah diverifikasi ternyata false alarm, itu dicatat eksplisit (pola Sub-Fase 1A: klaim `requirePermission`=103 diverifikasi ulang), bukan dihapus diam-diam dari record.

## Siklus Penuh — Dokumen PERENCANAAN vs Dokumen EKSEKUSI

Tabel 11-bagian di atas adalah dokumen **PERENCANAAN** — ditulis **sebelum** fase mulai, relatif statis. Tapi Sub-Fase 1A membuktikan ada lapis kedua: dokumen **EKSEKUSI** yang **lahir selama fase berjalan**. Playbook awal tidak menyebut ini — koreksi (siklus penuh):

| Dokumen Eksekusi | Kapan dibuat | Siapa update | WAJIB / KONDISIONAL |
|---|---|---|---|
| `STATUS.md` | Saat fase mulai (kerangka) | Diupdate tiap Epic ditutup — **living document** | **WAJIB** — single source of truth status |
| `execution/<epic>.md` | Saat Epic itu akan dikerjakan | Penulis Epic, sekali (bisa direvisi saat scope berubah) | **KONDISIONAL** — hanya Epic kompleks/berisiko. Epic sederhana (1-2 file, pola jelas) **skip** + tulis alasan di STATUS |
| Decision log (mis. `epic-N-decisions.md`) | Saat muncul keputusan founder menggantung | Diupdate saat keputusan diberikan (tandai RESOLVED) | **KONDISIONAL** — hanya jika ada trade-off governance/produk yang bukan keputusan engineering. Kalau tidak ada, tulis "tidak diperlukan" + alasan |
| `<PHASE>-COMPLETION-AUDIT.md` | Di gate akhir fase | Ditulis sekali saat audit gate | **WAJIB di gate** — bukti objektif, bukan klaim |
| Gate/precondition response | Saat founder ajukan syarat sebelum gate | Diupdate saat syarat dipenuhi (tandai RESOLVED) | **KONDISIONAL** — hanya jika founder menetapkan prasyarat gate eksplisit |

**Prinsip:** dokumen perencanaan menjawab "apa rencananya"; dokumen eksekusi menjawab "apa yang NYATA terjadi + statusnya sekarang". Keduanya diperlukan; playbook lama hanya mendokumentasikan yang pertama.

## Disiplin Anti Teks-Basi (Kontrak Operasi #3)

> Begitu satu rekomendasi selesai dikerjakan, **HAPUS atau tandai "resolved" + referensi baris kode**. Dokumen sumber kebenaran tidak boleh menyimpan rekomendasi yang sudah usang.

 Diterapkan konkret:
- Rekomendasi yang sudah dikerjakan → coret (`~~...~~`) atau ganti "✅ RESOLVED (ref `file.ts:line` / PR #N)". **Jangan** biarkan dua bagian dokumen kontradiktif (satu bilang "belum", satu bilang "sudah").
- Status "gated/dorman/pending" → diselaraskan **di semua dokumen sekaligus** begitu berubah, bukan satu-satu (Sub-Fase 1A: F5.5 sempat "dorman" di 6 dokumen setelah applied — harus disinkronkan serentak).
- Contoh nyata Sub-Fase 1A: teks "Remediation 3.6" (2 endpoint role-literal) sempat tertinggal sebagai rekomendasi di completion-audit padahal kodenya sudah diperbaiki (`progress.ts:260`) — di-resolve saat kickoff 1B.

## Definition of Ready — menerapkan pola ini ke fase baru

Sebelum menulis kickoff package fase N, pastikan:
- [ ] Exit Criteria fase N-1 terpenuhi (trigger di § Peta Trigger) — **verifikasi ke STATUS.md N-1, bukan asumsi**.
- [ ] Lingkup fase N diturunkan dari dokumen sumber ([Phase1/02-target-architecture.md](../Phase1/02-target-architecture.md) atau blueprint), **bukan dikarang dari nama fase**.
- [ ] Penomoran dikonfirmasi ke [NUMBERING-GLOSSARY.md](NUMBERING-GLOSSARY.md) — tulis "Sub-Fase NB" lengkap, bukan telanjang.
- [ ] Nomor migration terakhir diverifikasi ulang ke `db/migrations/` (jangan warisi dari dokumen lama — Sub-Fase 1A: 046 & 058 ternyata drift).
- [ ] Proporsionalitas dinilai: Epic mana butuh `execution/`, mana skip; apakah ada keputusan founder menggantung (decision log) atau tidak.

## Peta Trigger per Program

| Program | Kickoff Package | Status |
|---|---|---|
| A (Phase 1) | [Implementation-Kickoff/](../Implementation-Kickoff/00-executive-summary.md) | ✅ Sub-Fase 1A SELESAI (Gate 1A→1B approved 2026-07-23); Sub-Fase 1B kickoff → [Implementation-Kickoff-Sub-Fase-1B/](../Implementation-Kickoff-Sub-Fase-1B/README.md). Referensi pola untuk semua Program berikutnya |
| B (Phase 2) | *(belum ditulis)* | ⏳ Menunggu Program A Exit Criteria (M1+M2 tercapai, [04-delivery-orchestration.md § 4](04-delivery-orchestration.md#4-exit-criteria--operasionalisasi-per-program)) |
| C (Phase 3, termasuk CECEP) | *(belum ditulis)* | ⏳ Menunggu Program B Exit Criteria (untuk sub-item Approval Workflow — Epic non-Workflow/CECEP Milestone 1-2 bisa mulai lebih awal begitu Program A selesai, tapi kickoff package TETAP ditulis satu kali untuk seluruh Program C saat Program B selesai, bukan dipecah dua) |
| D (Phase 4, 7) | *(belum ditulis)* | ⏳ Menunggu Program A (bagian 1) / Program A+test suite (bagian 2) Exit Criteria |
| E (Phase 5, 6) | *(belum ditulis)* | ⏳ Menunggu Program A+B Exit Criteria (gate keras, [02-master-dependency-graph.md](02-master-dependency-graph.md)) |
| F (Phase 8, 9) | *(belum ditulis)* | ⏳ Menunggu Program D2 (`company_id`) Exit Criteria **DAN** pelanggan eksternal committed (M9) — gate ganda |

**Cara memakai tabel ini:** Begitu Exit Criteria satu Program terpenuhi, buat direktori `Implementation-Kickoff-{Program}/` (pola sama seperti `Implementation-Kickoff/` untuk Program A), isi 11 file sesuai struktur di atas, update baris di tabel ini dari ⏳ ke ✅ dengan link. **Jangan** membuat direktorinya lebih awal dari itu — direktori kosong yang "menunggu" tidak menambah nilai, hanya menambah entropi navigasi.

## References

- [Implementation-Kickoff/00-executive-summary.md](../Implementation-Kickoff/00-executive-summary.md) — contoh nyata satu-satunya kickoff package yang sudah ditulis, rujukan format
- [00-executive-delivery-vision.md § 4](00-executive-delivery-vision.md#4-prinsip-governance-program-baru) — prinsip YAGNI yang mendasari kenapa ini template bukan 8 dokumen penuh
- [04-delivery-orchestration.md § 4](04-delivery-orchestration.md#4-exit-criteria--operasionalisasi-per-program) — Exit Criteria per Program yang jadi trigger

---

*File ini adalah bagian ke-14 Blueprint (12 file asli + README + file ini) — ditambahkan pasca-pertanyaan founder soal kickoff package untuk fase lain.*
