# CECEP — Phase 10: AI Cost Engineering

**Mode:** Architecture Derivation Mode (`40`/`41`). Sempit by design (`32` Fase 10) — **DILARANG EKSPLISIT** membuka Discovery filosofis "apa itu AI secara umum". Fase paling berisiko drift di seluruh roadmap (Phase I lama adalah salah satu dari dua fase paling jauh menyimpang di audit `29`) — kehati-hatian ekstra diterapkan.

## Evidence Contamination Check

```
17-19 (Framework I lama, AI Discovery) → 10 kemunculan CAP-XXX, DAN sudah
  dipindah ke Framework via 31 karena alasan LAIN (filosofi AI generik,
  independen dari masalah CAP-XXX) → GANDA TERLARANG, TIDAK dipakai sama sekali
01 §11 (AI Estimation Vision)          → evidence asli, bersih, vision-level
35 #14-15 (AI Estimation/Recommendation, Frozen) → bersih
44 §Housekeeping (Fallback Rule)        → bersih, relevan (gap_flag mechanism)
rab.ts parser                          → DIVERIFIKASI ada di apps/api/src/routes/v1/
```

## Derivation Summary

```
This document introduces:
- 0 new business concepts
- 1 concrete prioritization (Excel-first, dari evidence 01 §11)
- 0 philosophical AI definition — EKSPLISIT TIDAK ditulis, sesuai larangan 32

Every concept below is derived from previously frozen artifacts.
No new discovery is performed in this phase.
```

## Business Uncertainty — Before

Sebelum dokumen ini: `35` #14-15 mengonfirmasi AI Estimation dan AI Recommendation sebagai capability ENTRI (harus ada di peta) dengan isi sengaja kosong. Tidak ada urutan prioritas konkret jalur input mana dikerjakan lebih dulu.

## Derivasi: Prioritas Jalur Input (Bukan Desain AI)

**Business Responsibility:** *"CECEP harus mulai dari jalur yang PALING REALISTIS secara operasional — bukan jalur paling canggih secara teknis (`01` §11 eksplisit: 'Excel = jalur AI paling realistis jangka pendek KARENA tinggal memperkuat yang sudah ada')."*

```
Level 1-3 ✓ (01 §11, vision level, bukan desain teknis — status ini sendiri
  adalah bagian evidence, bukan batasan yang boleh dilanggar Fase 10)
Level 4 Capability ✓ (35 #14 AI Estimation — isi sengaja ditunda ke sini)
Level 5 Interaction ✓ (37 §14: Input "Dokumen eksternal Excel/PDF/DWG/Foto")
Level 6 ✓ (di atas, necessity langsung dari kalimat 01 §11)
Trace Status: ✓ Fully Derived
```

**Prioritas (urutan langsung dari `01` §11, tidak diubah):**
1. **Excel** — parser sudah ada (`rab.ts`, diverifikasi), jalur paling realistis.
2. **PDF/Spesifikasi Teknis** — relevan untuk baca dokumen tender/RKS.
3. **DWG/BIM/IFC** — relevan untuk Building Assembly (`35` #2), kurang relevan Civil.
4. **Foto Lapangan** — relevan opname/verifikasi kondisi eksisting.

**Batas eksplisit (Zero-Invention, ditegaskan lagi):** TIDAK didesain arsitektur ML/model/pipeline pemrosesan dokumen — itu keputusan teknis di luar cakupan Architecture Derivation (`01` §11 sendiri: "murni observasi bisnis... tidak ada keputusan desain di sini"). TIDAK didefinisikan "apa itu AI" — larangan eksplisit `32`.

## AI Recommendation — Konsumen Historical Cost Intelligence

**Business Responsibility:** *"AI Recommendation harus konsumsi data yang SUDAH divalidasi manusia (`02` §10: 'AI tidak boleh langsung belajar. Harus ada approval'), bukan data mentah — sumbernya adalah Historical Cost Intelligence (`35` #13) SETELAH Lessons Learned Propagated, bukan sebelum."*

```
Level 6 ✓ — kutipan verbatim 02 §10, dikonfirmasi 44 §13 (Approval Workflow
  sebagai gerbang wajib sebelum Propagated)
Trace Status: ✓ Fully Derived
```

**Batas eksplisit:** Konsisten `44` § Housekeeping (Fallback Rule) — kalau AI Recommendation menyarankan sesuatu berdasarkan data dengan `gap_flag: true` (strategi fallback), saran itu WAJIB membawa catatan bahwa sumbernya fallback, bukan Company AHSP penuh (Explainability, `02` Constraint #1).

## AI Capabilities Tidak Memiliki Aggregate Root (Konfirmasi Ulang dari `38`)

Sesuai `38` § A.4 (readiness assessment sebelumnya) dan `40`: AI Estimation/Recommendation adalah consumer/enricher terhadap domain Estimate yang sudah ada (`44` §9-11) — bukan pemilik domain baru. Ini TIDAK berubah di Fase 10, bahkan setelah isi didalami sejauh batas yang diizinkan di atas.

## Business Uncertainty — After

Sesudah dokumen ini: tim build tahu urutan prioritas implementasi AI Estimation (Excel dulu) dan tahu AI Recommendation harus menunggu data lolos Approval Workflow, TANPA komitmen desain teknis AI apa pun — sesuai maksud `01` §11 yang memang sengaja vision-level.

## Simplicity Rule Check

Diperiksa: adakah godaan menulis "AI Engine"/"Recommendation Engine" sebagai abstraksi baru? Tidak — dokumen ini sengaja TIDAK memberi nama teknis apa pun untuk mekanisme AI, hanya urutan prioritas bisnis dan batas data governance (approval-gated). Ini konsisten larangan `32` Fase 10.

## Definition of Done Self-Check (`34`)

| Kriteria | Status |
|---|---|
| 1-7 | ✓ |
| 8. Trace Status | ✓ 2/2 derivasi Fully Derived, 0 ❌ Invented |

**Hasil:** 8/8 ✓.

## Derivation Trace

```
This document derives from:
✓ Mission (01/02) ✓ Principles (04) ✓ Confirmed Domain (44)
✓ Frozen Capability (35) ✓ Capability Interaction (37)
✓ rab.ts parser — diverifikasi ada di codebase
No new business concepts introduced. Framework I lama (17-19) TIDAK dirujuk —
larangan ganda (CAP-XXX usang DAN filosofi AI generik sudah dipindah ke
Framework via 31).
```

## 🔒 STATUS: SIAP DI-FREEZE — Derived & Frozen (menunggu review)
