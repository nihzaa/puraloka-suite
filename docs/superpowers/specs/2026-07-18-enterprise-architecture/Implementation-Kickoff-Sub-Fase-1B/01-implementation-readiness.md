# 01 — Implementation Readiness (Sub-Fase 1B)

Skor per dimensi dengan **evidence file:line terverifikasi langsung** (grep 2026-07-23), bukan warisan dokumen desain. Kontrak Operasi #1 (AUTOPILOT §6): verify, jangan asumsi.

## Skor per Dimensi

| # | Dimensi | Skor | Evidence |
|---|---|---|---|
| 1 | Architecture | 9/10 | Desain 1B lengkap di [Phase1/02-target-architecture.md § SUB-FASE 1B](../Phase1/02-target-architecture.md) (skema `company_settings`, `menu_items` sudah ditulis) |
| 2 | Prasyarat Gate 1A | 10/10 | Gate 1A→1B approved; RBAC/RLS 100% permission-based; 119 test hijau, CI main hijau ([../Implementation-Kickoff/STATUS.md](../Implementation-Kickoff/STATUS.md)) |
| 3 | Repository | 8/10 | Migration terakhir `074_seed_cash_view.sql` (verified `ls db/migrations`) → 1B mulai 075. **−2:** drift tracking 073 belum sinkron (Day-1 item) |
| 4 | Config Engine (1B.1) | 8/10 | Tax hardcode terlokalisasi di `apps/api/src/lib/tax-calculation.ts:4-5` (`ppn:0.11, pph_final:0.02`), sudah pure function + 8 test — mudah dimigrasi. `settings.ts` sudah ada (extend, bukan dari nol) |
| 5 | Menu Registry (1B.2) | 6/10 | `apps/web/components/sidebar.tsx` = 530 baris, ~24 menu hardcoded JSX dengan `perms.has(...)` inline (baris 244-313). Refactor non-trivial: perlu caching + invalidation |
| 6 | Module/Feature (1B.3) | 7/10 | Tabel baru, pola CRUD standar; belum ada acuan implementasi di kode |
| 7 | 1B.4 enum→FK risk | 4/10 | `users.role` = enum `user_role` 4-nilai (verified `001_extensions_and_enums.sql:17`). Dibaca `plugins/auth.ts`, semua RLS via `auth_role()`, `get_role_permissions` RPC, 55+ inline. Blast radius auth terbesar — **sengaja rendah, di-gate ketat** |
| 8 | Testing infra | 9/10 | Vitest + RLS harness + 119 test dari 1A siap dipakai |
| 9 | CI/CD | 9/10 | Pipeline 1A aktif (lint→typecheck→test→build), TEST_SCHEMA per-run |

**Rata-rata: ~7.8/10.** Dua terendah (1B.4 risk, Menu Registry) adalah pekerjaan yang memang lebih berat/berisiko — dikelola lewat gate (1B.4 Red-Line) dan execution plan (1B.2), bukan diabaikan.

## Interpretasi — kenapa 7.8 bukan "belum siap"

Dimensi prasyarat mulai-coding semuanya ≥8: Architecture, Gate 1A, Config Engine, Testing, CI/CD. Yang <7 (Menu Registry 6, 1B.4 4) bukan blocker mulai — 1B.1 (skor 8) adalah Epic pertama, additive, aman. 1B.4 sengaja opsional & terakhir. Menu Registry punya execution plan sendiri.

## Critical Blockers: **NOL**

Tidak ada blocker teknis untuk mulai 1B.1. Satu item administratif (drift tracking 073) diselesaikan di Day-1 sebelum migration pertama — bukan blocker coding.

## Findings (dilaporkan, bukan disembunyikan)

- **F1B-1:** target-arch menyebut tax hardcode `termin-payment.ts:175` — **usang**, aktual `lib/tax-calculation.ts:4-5` (diekstrak Epic 1). Dampak: rendah, kickoff pakai lokasi nyata.
- **F1B-2:** drift tracking 073 (append-only trigger di DB tapi belum di `schema_migrations`). Dampak: sedang — `supabase db diff` tidak akurat sampai direkonsiliasi. Day-1 item.
