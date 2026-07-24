# CECEP — Phase A: Repository Discovery

**Platform:** Construction Estimation & Cost Engineering Platform (CECEP)
**Kedudukan:** Core Enterprise Platform baru, level setara domain besar di Architecture Repository (doc00-06) — bukan modul RAB, bukan fitur tambahan.
**Status dokumen ini:** Planning only — belum masuk Architecture Repository resmi, belum melalui ADR, belum di-freeze. Murni riset dan discovery.
**Metodologi:** Seluruh temuan di bawah diverifikasi langsung dari source code (migration file + route file), bukan asumsi. Setiap klaim disertai evidence file:line.

---

## Executive Summary

Repository Puraloka Suite sudah punya fondasi data konstruksi yang matang (RAB, Progress, Procurement, Finance, Cashflow, EVM, Worker/Wage) — tapi seluruhnya berjalan sebagai modul operasional/transaksional terpisah, bukan sebagai satu Cost Engineering Platform dengan satu sumber kebenaran. Temuan paling signifikan: **AHSP (Analisa Harga Satuan Pekerjaan) dan Estimating tidak ada sama sekali** di codebase — RAB hari ini adalah *hasil akhir* (angka jadi per item, umumnya dari upload Excel), bukan *proses* estimasi terstruktur.

## Temuan per Topik (21 topik, evidence-based)

| # | Topik | Status | Ringkasan |
|---|---|---|---|
| 1 | RAB | ✅ Matang | `rab_items` (migration 013, 052), `rab_schedule`+`rab_absorption_log` (057), hierarki 3 level, upload Excel, komponen biaya |
| 2 | Budget | 🟡 Embedded | `projects.contract_value`/`kasbon_limit_pct` — bukan modul terpisah. "Budget vs Actual Cost Control" sudah dicatat sebagai gap di `00-vision-and-business-architecture.md:353` |
| 3 | Cost/Expense | 🟡 Transactional | `project_expenses`, `expense_reports` — model kas, bukan cost accounting formal |
| 4 | Material | ✅ Matang | `materials`, `material_categories` (039), `material_requests` (041) |
| 5 | Inventory/Stock | 🟡 Sebagian | `project_stocks`, `stock_movements` (039) — single-warehouse, multi-warehouse belum ada |
| 6 | Procurement | ✅ Matang | MR→PO→GR penuh (041), trigger `sync_po_receipt_status` |
| 7 | Progress | ✅ Matang | `progress_logs` dual-mode (008, 052) |
| 8 | Project | ✅ Matang | `projects` — aggregate root utama sistem |
| 9 | Finance | ✅ Matang | `invoices`, `payments`, `tax_records` (006) |
| 10 | Accounting/GL | 🟠 Schema-only | `accounts`/`journal_entries` (047) — **nol endpoint**, class `AccountingEngine` disebut di komentar tapi tidak ditemukan implementasinya |
| 11 | Vendor | ℹ️ Terminologi | Entitas resmi adalah `suppliers` — "vendor" hanya label bebas di kolom expense + nama domain konseptual di dokumen arsitektur |
| 12 | Purchase (PO) | ✅ Matang | `purchase_orders` (041), auto-numbering, lifecycle draft→...→fully_received |
| 13 | Cashflow | ✅ Matang | `cash_accounts`, `cash_transfers` (016) |
| 14 | EVM | ✅ Matang | `kurva-s.ts`, `lib/evm-calculation.ts` — CPI/SPI/SV/CV/EAC/ETC/VAC/TCPI lengkap |
| 15 | Retention | 🟡 Field-level | `projects.retention_pct`/`retention_amount` + trigger — tracking formal belum ada, sudah dicatat gap |
| 16 | Tax | 🟡 Sebagian | `tax_records`, PPN/PPh dasar ada, SPT belum |
| 17 | Estimate | ❌ Tidak ada | Hanya label kolom Excel di parser RAB, bukan modul. Dicatat gap eksplisit di arsitektur |
| 18 | BOQ | 🟡 Sebagian | Sistem menerima sheet Excel berlabel "BoQ" sebagai sinonim "RAB" — tidak ada AHSP formal sebagai proses terpisah |
| 19 | Resource Planning | ❌ Tidak ada | Nol tabel/endpoint untuk resource allocation lintas proyek |
| 20 | Worker/Tukang | ✅ Matang | `workers`, `weekly_wage_reports`, `wage_items` (018) |
| 21 | Equipment/Alat | 🟠 Schema-only | `assets` dengan kategori `alat_berat` (045) — **nol endpoint API**, nol frontend |

*(Detail lengkap file:line per topik: lihat laporan riset penuh di riwayat kerja sesi ini — akan dilampirkan sebagai apendiks jika dibutuhkan verifikasi ulang.)*

## Struktur Migration (Ringkasan)

59 file migration (001–058, nomor 030 di-skip). Kelompok paling relevan untuk CECEP:
- **013, 052, 057** — RAB core + komponen biaya + schedule/absorption
- **039, 040, 041, 043, 058** — Material, Supplier, Procurement workflow lengkap
- **045** — Asset Management (schema-only)
- **047** — General Ledger (schema-only, sengaja ditunda sesuai catatan migration)
- **007, 018** — Mandor, Worker, Wage

## Temuan Dokumen Arsitektur Existing

`00-vision-and-business-architecture.md` **sudah mengantisipasi** platform ini lewat Module Catalog & Tiering (line 264-453):
- Domain **"Sales & Pre-Construction"** (line 317-328) — Estimating, BOQ/AHSP — dinyatakan **"belum ada sama sekali"**, dengan catatan strategis eksplisit menaikkan prioritas BOQ/AHSP ke `Next` karena "standar baku konstruksi Indonesia".
- **"Budget vs Actual Cost Control"** (line 353) sudah dicatat terpisah dari EVM, dengan alasan eksplisit *"EVM untuk progress, ini untuk cost governance"* — sinyal bahwa perancang sebelumnya sudah mengarah ke kebutuhan yang sama dengan CECEP.

## Potensi Duplikasi Kalkulasi (Teridentifikasi, Belum Didesain Solusinya)

7 titik kalkulasi finansial existing yang berpotensi tumpang tindih dengan CECEP nanti:
1. `trigger_calc_retention_amount()` (010) — retensi level project
2. `bubbleUpProgress()` (`lib/rab-aggregation.ts`) — agregasi bottom-up berbasis `weight_pct`
3. `calculateEVM()`/BAC dari `totalRABValue` — definisi "total nilai proyek" perlu diselaraskan
4. Trigger `sync_po_receipt_status()` (041) — kalkulasi stok di level trigger DB
5. Pola trigger-DB tersebar (`fn_recalc_wage_report`, `fn_update_balance_on_transfer`, dll) — tidak konsisten dengan pola `lib/` TypeScript yang dipakai EVM/RAB-aggregation
6. `rab_items.material_pct/upah_pct/alat_pct/other_pct` (052) — breakdown manual yang konseptual dekat dengan output AHSP formal
7. `project_rab_materials` (043) — komentar kode sendiri mengakui riwayat duplikasi skema material antar migration

## Risks
- GL/Accounting schema-only tanpa endpoint — integrasi journal entry dari CECEP (jika dibutuhkan) berpijak pada fondasi yang belum teruji.
- Pola trigger-DB vs application-layer yang tidak konsisten berisiko jadi silent trap kalau Cost Engine baru butuh recalculation logic yang harus sinkron dengan trigger existing.

## Dependencies
Phase B sepenuhnya bergantung pada pemahaman gap Phase A ini plus konteks bisnis riil Puraloka Persada yang tidak bisa digali dari kode.

---

## Status Approval

✅ **Phase A DISETUJUI** (diverifikasi lewat diskusi lanjutan, user melanjutkan ke reframing scope dan Phase B tanpa keberatan terhadap isi Phase A itu sendiri — hanya framing/level ambisinya yang dinaikkan).

*Dokumen selanjutnya: [01-phase-b-cost-engineering-discovery.md](01-phase-b-cost-engineering-discovery.md)*
