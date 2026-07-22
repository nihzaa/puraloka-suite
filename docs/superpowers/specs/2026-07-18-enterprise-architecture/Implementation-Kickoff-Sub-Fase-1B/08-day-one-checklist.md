# 08 — Day One Checklist (Sub-Fase 1B)

Sebelum menulis kode 1B pertama.

## Bagian 1 — Prasyarat Gate

- [x] Gate 1A→1B approved founder (2026-07-23)
- [x] Sub-Fase 1A implementation complete (119 test, CI main hijau)
- [x] AUTOPILOT.md dibaca (charter operasi)

## Bagian 2 — Verifikasi repo (jangan asumsi)

- [ ] Migration terakhir dikonfirmasi ulang: `ls db/migrations/ | sort | tail -1` = `074_seed_cash_view.sql` → 1B mulai 075
- [ ] **Rekonsiliasi drift tracking 073** (bawaan 1A): trigger append-only ada di DB tapi belum di `schema_migrations`. Tandai applied (verifikasi trigger dulu via koneksi baru) — supaya `supabase db diff` akurat sebelum migration 1B pertama
- [ ] `db/migrations/` vs `supabase/migrations/` sinkron dicek (pola F3 1A)

## Bagian 3 — Baca target (per Epic)

- [ ] `apps/api/src/lib/tax-calculation.ts` + `tax-calculation.test.ts` (target 1B.1 — tax hardcode baris 4-5)
- [ ] `apps/api/src/routes/v1/settings.ts` (extend, bukan dari nol)
- [ ] `apps/web/components/sidebar.tsx` penuh 530 baris (target 1B.2)
- [ ] Skema 1B di `Phase1/02-target-architecture.md § SUB-FASE 1B`

## Bagian 4 — Baseline

- [ ] `npx vitest run` baseline hijau (119 test) sebelum sentuh apa pun
- [ ] Screenshot/catat menu per-role hari ini (baseline additive-first — verifikasi nol menu hilang setelah 1B.2)

## Bagian 5 — Konfirmasi keputusan founder

- [ ] **1B.4 Opsi A vs B** — apakah enum→FK dikerjakan atau ditunda? (jika tak dijawab, default: kerjakan 1B.1-1B.3, 1B.4 tunggu DANGER GATE)
- [ ] Strategi caching menu 1B.2 (revalidate-on-change vs TTL)
