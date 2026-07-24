# CECEP — Phase 8: Integration Architecture

**Mode:** Architecture Derivation Mode (`40`/`41`). Sempit by design (`32` Fase 8) — HANYA ACL CECEP↔Puraloka Suite existing, DILARANG membahas integrasi secara umum.

## Evidence Contamination Check (Wajib, Pelajaran dari Fase 7)

Sebelum memakai evidence apa pun, diperiksa `grep CAP-` pada setiap kandidat sumber:
```
03b (Discovery Complete, ACL section) → 0 kemunculan CAP-XXX → BERSIH
37  (Interaction Map, Frozen)          → 0 kemunculan CAP-XXX → BERSIH
14  (Framework H lama, "boleh dirujuk sebagai referensi teknis" per 32) → 36 kemunculan CAP-XXX → TERKONTAMINASI
```
**Keputusan:** `14`-`16` (Framework H lama) TIDAK dirujuk sama sekali di dokumen ini, meski `32` awalnya mengizinkan "referensi teknis tersaring" — karena struktur di baliknya (ontologi Titik Serah/Uncertainty Window) dibangun di atas Capability Catalog yang sama usangnya dengan `05`-`07c`. Evidence yang dipakai murni `03b` § Anti-Corruption Layer + `37` + skema database riil (`db/migrations/016_cash_management.sql` untuk `project_expenses`; `056_kasbon_scope_optional.sql` untuk `kasbons.project_id`/`work_scope_id` nullable — **koreksi:** kutipan sebelumnya salah merujuk migration `007` yang sudah usang, `kasbons.work_scope_id` di `007` masih `NOT NULL`; skema aktual mengikuti `056`, bukan `007`).

## Derivation Summary

```
This document introduces:
- 0 new business concepts
- 1 concrete ACL field mapping (project_expenses/kasbons → Cost Code)
- 0 items carried from Framework H lama (14-16) — dikecualikan, lihat di atas

Every concept below is derived from previously frozen artifacts.
No new discovery is performed in this phase.
```

## Business Uncertainty — Before

Sebelum dokumen ini: `03b` sudah mengidentifikasi ACL "perlu ada" antara Actual Cost (existing) dan Lessons Learned (CECEP), tapi eksplisit menandai *"statusnya baru diidentifikasi perlu ada, bukan sudah didesain"* (`03b` § Pemeriksaan Terhadap Architectural Invariants). Tidak ada field mapping konkret.

## Derivasi: Satu Titik ACL yang Wajib Ada

**Business Responsibility (Level 6):** *"Cost Control (`35` #11) harus bisa membandingkan Actual Cost riil terhadap RAP Baseline secara real-time via Cost Code (`44` §1) — tapi `project_expenses`/`kasbons` existing TIDAK PUNYA kolom Cost Code (diverifikasi langsung ke skema: `db/migrations/016_cash_management.sql` baris 106-126, kolom yang ada adalah `category_id`→`project_expense_categories`, bukan Cost Code). Tanpa ACL, Variance Calculation (`44` §13) tidak bisa jalan otomatis."*

```
Level 1-3 ✓ (03 §6 root cause: Cost Code sbg penyambung real-time yang belum ada)
Level 4 Capability ✓ (35 #11 Cost Control, #13 Historical Cost Intelligence)
Level 5 Interaction ✓ (37: Cost Control Input mencakup "Actual Cost ACL dari
  execution existing")
Level 6 Business Responsibility ✓ (di atas — dikonfirmasi LANGSUNG dari
  skema database riil, bukan asumsi)
Trace Status: ✓ Fully Derived
```

### Field Mapping Konkret

```
ACL: project_expenses/kasbons (existing) → Cost Code (CECEP)

project_expenses.category_id → project_expense_categories
  (existing, TIDAK ada Cost Code)
                    │
                    │ ACL translation (Fase 11 implementasi)
                    ▼
  Cost Code Registry (44 §1) — resolusi berdasar project_expense_categories
  → Cost Code mapping table (BARU, satu-satunya struktur baru ACL ini
    butuhkan: tabel translasi category_id lama ↔ cost_code_id baru)

kasbons.project_id (langsung, wajib sejak migration 056) ATAU
  kasbons.work_scope_id (nullable sejak 056) → resolusi via work_scopes →
  Assembly (`03b` §Anti-Corruption Layer sudah menyebut risiko ambiguitas ini:
  "data existing tidak selalu punya Cost Code per baris... ACL adalah tempat
  yang tepat untuk menangani resolusi Cost Code dari data lama")
```

**Batas eksplisit (Zero-Invention):** ACL ini TIDAK mengubah `project_expenses`/`kasbons` existing — Puraloka Suite tetap jalan seperti sekarang. Yang baru HANYA tabel translasi (category_id ↔ cost_code_id), dikonsumsi read-only oleh Cost Control (`35` #11) dan Historical Cost Intelligence (`35` #13).

## STOP Boundary (Eksplisit, per `32`)

Dokumen ini TIDAK membahas: pola integrasi umum, definisi ontologis "apa itu integrasi", protokol pertukaran data generik. Kalau ditemukan kebutuhan integrasi TITIK LAIN di luar Actual Cost↔Cost Code (mis. Procurement Planning↔`purchase_orders`, `35` #10), itu didokumentasikan sebagai entri ACL baru dengan pola yang SAMA (field mapping konkret), bukan alasan membuka teori integrasi umum.

**Second ACL point** (`03b` juga menyebut satu lagi, risiko lebih rendah): Reference Library↔Assembly/CBS (bootstrap AHSP Nasional). Dicatat sebagai entri kedua, TIDAK didesain detail di sini (`03b` sendiri menilai risikonya rendah — arah satu kali, bukan sinkronisasi berkelanjutan) — housekeeping untuk Fase 11.

## Business Uncertainty — After

Sesudah dokumen ini: tim build tahu PERSIS satu tabel baru yang dibutuhkan (translasi category_id↔cost_code_id), bukan cuma "perlu ACL" abstrak. `project_expenses`/`kasbons` existing dikonfirmasi tidak perlu diubah strukturnya.

## Definition of Done Self-Check (`34`)

| Kriteria | Status |
|---|---|
| 1-7 | ✓ (capability Cost Control/Historical Intelligence diperkuat, uncertainty field mapping hilang, artefak konkret, 0 Framework concept, lolos Construction Removal, Constitution terpenuhi, implementation readiness tinggi — field mapping bisa langsung jadi skema) |
| 8. Trace Status | ✓ Fully Derived, 0 ❌ Invented, evidence diverifikasi sampai ke baris kode skema riil (satu kutipan migration salah sempat lolos — ditemukan dan diperbaiki saat re-verifikasi sebelum Freeze, lihat § Evidence Contamination Check) |

**Hasil:** 8/8 ✓, dengan satu koreksi kutipan diterapkan sebelum Freeze final (bukan setelah).

## Derivation Trace

```
This document derives from:
✓ Mission (01/02) ✓ Principles (04) ✓ Confirmed Domain (03b)
✓ Frozen Capability (35) ✓ Capability Interaction (37)
✓ Skema database riil (db/migrations) — bukti tambahan di luar dokumen CECEP,
  dipakai untuk memverifikasi klaim "project_expenses tidak punya Cost Code"
No new business concepts introduced. Framework lama (14-16) sengaja TIDAK
dirujuk karena terkontaminasi Capability Catalog usang.
```

## 🔒 STATUS: SIAP DI-FREEZE — Derived & Frozen (menunggu review)
