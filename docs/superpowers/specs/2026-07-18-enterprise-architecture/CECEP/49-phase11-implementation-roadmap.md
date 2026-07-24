# CECEP — Phase 11: Implementation Roadmap

**Mode:** Architecture Derivation Mode (`40`/`41`).

## Evidence Contamination Check

```
03b §Ringkasan Ownership (Upstream→Downstream) → 0 kemunculan CAP-XXX → BERSIH
44 (13 domain + housekeeping, Frozen)            → bersih
46-48 (Fase 8-10, Frozen)                        → bersih
```
Tidak ada kontaminasi — Domain Relationship Map (`03b`) ditulis sebelum Phase D lama, murni struktural.

## Derivation Summary

```
This document introduces:
- 0 new business concepts
- 1 build sequence (4 milestone, diturunkan dari lapisan Upstream->Downstream
  03b yang sudah Frozen)

Every concept below is derived from previously frozen artifacts.
No new discovery is performed in this phase.
```

## Business Uncertainty — Before

Sebelum dokumen ini: 13 domain (`44`) dan 16 capability (`35`) sudah lengkap, tapi tidak ada urutan BUILD — tim implementasi tidak tahu domain mana harus ada dulu sebelum domain lain bisa berfungsi.

## Derivasi Urutan — Langsung dari Lapisan `03b`

**Business Responsibility:** *"Domain yang di-reference banyak domain lain (Cost Code, RBS) harus ADA lebih dulu sebelum domain yang mereferensikannya (Assembly, Price Book) bisa diuji — kalau dibalik, setiap domain hilir akan gagal foreign-key ke sesuatu yang belum ada."*

```
Level 6 ✓ — necessity struktural langsung dari 03b §Ringkasan Ownership,
  yang eksplisit menyatakan Upstream "jadi fondasi semua lapis di bawahnya"
Trace Status: ✓ Fully Derived
```

### Milestone 1 — Upstream (Reference/Identity)
```
Cost Code Registry (44 §1) → Resource Identity/RBS (44 §2)
→ Reference Library bootstrap (AHSP Nasional, ACL kedua dari 46)
```
**Kriteria selesai:** Cost Code dan Resource bisa dibuat/diaktifkan/dideprecate independen dari domain lain manapun.

### Milestone 2 — Mid-stream (Knowledge)
```
CBS (44 §3) → Assembly/AHSP (44 §4, termasuk 4 sumber dari 42)
→ Price Book (44 §5) → Productivity Library (44 §6) → Formula Engine (44 §7)
```
**Dependency eksplisit dari `03b`:** Mid-stream BERGANTUNG Upstream (Cost Code, RBS) — tidak bisa dimulai sebelum Milestone 1 selesai. Risk Allowance Entry (`44` §Housekeeping, sudah naik status dari 🟡 Candidate `03b`§B.3 ke Confirmed di `44`) masuk milestone ini sebagai child struktur RAP Builder.

### Milestone 3 — Core (Transactional Aggregate)
```
Scenario (44 §9-11) → Estimate Version → Estimate Item → WBS
```
**Dependency:** Bergantung PENUH pada Milestone 1+2 (Estimate Item merujuk Cost Code, Assembly, CBS, WBS — `03b` §A.9a, dikonfirmasi `44`). Approval Workflow (`47`) mulai aktif di sini (Estimate Version butuh Draft→Under Review→Approved).

### Milestone 4 — Downstream + Feedback
```
RAB/RAP/Budget/Cashflow (read-model, derived — TIDAK butuh tabel baru,
  hanya query terhadap Milestone 3)
→ ACL Actual Cost (46, tabel translasi category_id↔cost_code_id)
→ Lessons Learned/Historical Cost Intelligence (44 §13)
→ AI Estimation/Recommendation (48, isi minimal — Excel parser dulu)
```
**Dependency:** Feedback Loop (Lessons Learned menulis balik ke Assembly/Price Book/Productivity) hanya bisa diuji SETELAH Milestone 3 menghasilkan minimal satu Estimate Version yang Approved — loop butuh data riil untuk dibandingkan (Variance Calculation).

## Business Uncertainty — After

Sesudah dokumen ini: tim build tahu urutan 4 milestone yang TIDAK BOLEH dibalik (Upstream→Mid-stream→Core→Downstream+Feedback), dengan kriteria selesai per milestone yang bisa diuji objektif (mis. "Cost Code bisa dibuat independen" sebelum lanjut ke Milestone 2).

## Definition of Done Self-Check (`34`)

| Kriteria | Status |
|---|---|
| 1-7 | ✓ |
| 8. Trace Status | ✓ Fully Derived, 0 ❌ Invented |

**Hasil:** 8/8 ✓.

## Derivation Trace

```
This document derives from:
✓ Mission (01/02) ✓ Principles (04) ✓ Confirmed Domain (03b/44)
✓ Frozen Capability (35) ✓ Capability Interaction (37)
No new business concepts introduced.
```

## 🔒 STATUS: SIAP DI-FREEZE — Derived & Frozen (menunggu review)
