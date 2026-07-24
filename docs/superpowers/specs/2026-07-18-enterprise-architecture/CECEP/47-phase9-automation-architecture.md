# CECEP — Phase 9: Automation Architecture

**Mode:** Architecture Derivation Mode (`40`/`41`). Sempit by design (`32` Fase 9) — hanya Formula/Approval Workflow OPERASIONAL, dilarang membangun "Rule generik dengan Formula sebagai instance".

## Evidence Contamination Check

```
08 (Framework G lama, Rule/Orchestration) → 38 kemunculan CAP-XXX → TERKONTAMINASI, TIDAK dipakai
02 §9-10 (Estimation Workflow, Approval Workflow)         → evidence asli, bersih
42 (Fase 5, Formula/Strategy Contract, Frozen)             → 0 kemunculan CAP-XXX → BERSIH
44 (Fase 6, Domain Model, Frozen)                          → bersih (ditulis pasca-audit)
db/migrations/050_rbac_foundation.sql                      → diverifikasi ADA di codebase
```
**Keputusan:** `08`-`08k` (Framework G lama) TIDAK dirujuk sama sekali — sesuai `32` Fase 9 STOP boundary ("bukan Rule generik dengan Formula sebagai instance-nya"). Evidence murni `02` §9-10, `42`, `44`.

## Derivation Summary

```
This document introduces:
- 0 new business concepts
- 2 derived mechanics (Formula execution/versioning state, Approval Chain
  configuration binding ke 7 dimensi existing RBAC)

Every concept below is derived from previously frozen artifacts.
No new discovery is performed in this phase.
```

## Business Uncertainty — Before

Sebelum dokumen ini: `02` §9 mengunci DELAPAN prinsip Estimation Workflow (lifecycle, approval, version history, baseline, audit, branch, compare, rollback) dan `02` §10 mengunci TUJUH dimensi Approval Chain, tapi tidak ada mekanisme KONKRET bagaimana keduanya benar-benar dieksekusi — siapa memicu transisi status, bagaimana 7 dimensi itu benar-benar disimpan sebagai konfigurasi.

## 1. Formula Execution & Versioning

**Business Responsibility:** *"Formula harus bisa diedit user tanpa deploy kode baru (`02` §8, Greenfield Adoption) — tapi begitu satu Estimate Item memakai Formula versi X, angka hasilnya tidak boleh berubah kalau Formula direvisi jadi versi Y setelahnya (immutable reference, konsisten `44` §4 Assembly)."*

```
Level 1-3 ✓ (01 §Greenfield Adoption: "without schema/source-code modifications")
Level 4 Capability ✓ (35 #8 Calculation Strategy)
Level 5 Interaction ✓ (37 §8: formula_reference)
Level 6 ✓ (di atas, necessity dari 42 §4 Strategy Versioning yang sudah Frozen)
Trace Status: ✓ Fully Derived
```

**Mekanisme (diturunkan, bukan didesain bebas):** Formula Definition punya lifecycle Draft→Tested→Active→Superseded (evidence: `02` §8 "Formula + Version + Variable + Parameter + Expression", necessity dari Everything is Versioned). Estimate Item merujuk `formula_reference` versi SPESIFIK (bukan "versi terbaru") — sama pola immutable reference yang sudah dikonfirmasi `42` §4 untuk Calculation Strategy.

**Batas eksplisit (Zero-Invention):** TIDAK didesain mekanisme "testing" Formula secara detail (apa itu "Tested" secara teknis) — itu bukan requirement yang bisa diderivasi dari evidence manapun, hanya status lifecycle yang eksplisit disebut `02` §8. Kalau detail testing dibutuhkan nanti, itu ADR terpisah.

## 2. Estimation Workflow — State Machine

**Business Responsibility:** *"Setiap Estimate Version harus melalui status yang sama, independen per Scenario (`02` §9), supaya perbandingan antar Scenario tetap adil — kalau satu Scenario punya status custom, Scenario Comparison (`35` #1) tidak bisa jalan konsisten."*

```
Level 6 ✓ — kutipan hampir verbatim 02 §9: "Draft → Under Review → Approved →
  Baseline/Frozen → Superseded... Setiap Scenario berjalan lewat status ini
  independen" — dikonfirmasi ulang `44` §9-11 (Estimate Version lifecycle sama)
Trace Status: ✓ Fully Derived
```

State machine: `Draft → Under Review → Approved → Baseline/Frozen → Superseded` (evidence langsung `02` §9, dikonfirmasi `44`). Transisi Draft→Under Review dipicu estimator submit; Under Review→Approved dipicu Approval Workflow (§ 3 di bawah); Approved→Baseline/Frozen dipicu keputusan RAP Builder/Budget Baseline (`44` §Budget Baseline thin capability).

## 3. Configurable Approval Workflow

**Business Responsibility:** *"Jangan hardcode siapa validator (`02` §10, verbatim founder) — approval chain harus data/konfigurasi, supaya Permission Model (`role_permissions`, migration 050, DIVERIFIKASI ada di codebase) tidak perlu diubah skema saat workflow perusahaan berubah."*

```
Level 6 ✓ — kutipan verbatim 02 §10, DAN diverifikasi terhadap implementasi
  riil (db/migrations/050_rbac_foundation.sql ada) — bukan asumsi RBAC existing
Trace Status: ✓ Fully Derived
```

**Struktur (7 dimensi, langsung dari `02` §10, tidak diubah):**
```
Approval Chain Definition:
  - company, branch, project_type, contract_value,
    estimate_type, cost_threshold, risk_level
  - approval_steps: [ {role_or_rbac_ref, order} ]  ← merujuk role_permissions
    existing (migration 050), TIDAK menciptakan sistem role baru
```

**Titik ikat ke Company Intelligence Loop (evidence `02` §10, diagram verbatim):**
```
Project Finish → Variance → Root Cause → [Approval Workflow] →
Knowledge Approved → Company Database Updated → Next Estimate Improved
```
Ini konfirmasi ulang bahwa Approval Workflow BUKAN hanya untuk Estimate Version — juga untuk setiap Price Book Entry (`44` §5, `Verified By`) dan Lessons Learned Propagation (`44` §13) — TIGA titik pemakaian yang sama, bukan tiga mekanisme approval berbeda.

**Batas eksplisit (Zero-Invention):** TIDAK didesain UI approval chain builder — itu Fase 12. TIDAK menciptakan sistem role/permission baru — approval_steps WAJIB merujuk `role_permissions` existing, bukan tabel role terpisah untuk CECEP (konsisten No Data Duplication, `02` Constraint #4).

## Business Uncertainty — After

Sesudah dokumen ini: tim build tahu Formula dan Estimate Version memakai state machine yang SAMA (immutable-after-active/approved), dan Approval Workflow adalah SATU mekanisme (7 dimensi konfigurasi + rujuk RBAC existing) dipakai di TIGA titik (Estimate Version, Price Book, Lessons Learned) — bukan tiga sistem approval terpisah yang perlu dibangun tiga kali.

## Definition of Done Self-Check (`34`)

| Kriteria | Status |
|---|---|
| 1-7 | ✓ |
| 8. Trace Status | ✓ 3/3 mekanisme Fully Derived, 0 ❌ Invented |

**Hasil:** 8/8 ✓.

## Derivation Trace

```
This document derives from:
✓ Mission (01/02) ✓ Principles (04) ✓ Confirmed Domain (03b/44)
✓ Frozen Capability (35) ✓ Capability Interaction (37)
✓ RBAC existing (db/migrations/050_rbac_foundation.sql, diverifikasi ada)
No new business concepts introduced. Framework G lama (08-08k) TIDAK dirujuk
— terkontaminasi Capability Catalog usang.
```

## 🔒 STATUS: SIAP DI-FREEZE — Derived & Frozen (menunggu review)
