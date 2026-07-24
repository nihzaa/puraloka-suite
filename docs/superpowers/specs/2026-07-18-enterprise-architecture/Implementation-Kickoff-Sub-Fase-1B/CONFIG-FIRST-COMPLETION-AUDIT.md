# Config-First Program — Completion Audit (AKTA 0–5 + CONTRACT + A7)

**Tanggal:** 2026-07-24 · **Sifat:** bukti objektif terverifikasi (bukan narasi). Setiap klaim punya referensi PR/migration/query yang bisa diperiksa ulang.

---

## 1. Bukti pengiriman — PR merged (#24–#36)

| PR | Deliverable | Bukti kunci |
|---|---|---|
| #24 | AKTA 0-2-4 docs: re-audit role-literal (F1-F10), HARDCODE-CENSUS, DOMAIN.md, AUTOPILOT §11/§12 | `role-literal-reaudit-2026-07-24.md`, `HARDCODE-CENSUS.md`, `DOMAIN.md` |
| #25 | Anti-self-lockout + derive-capability F1-F4 (register, CO approve/reject, MR delete) | `lib/role-guard.ts` CRITICAL_PERMISSIONS, migration 084 |
| #26 | Soft-filter F5-F8 → capability (scope-preserving, `finance:view:all` admin+pm) | migration 085 |
| #27 | Financial config engine **effective-dated** (tax) + UI /pengaturan/keuangan | migration 086 (`financial_config` + EXCLUDE anti-overlap), `lib/financial-config.ts` |
| #28 | Retensi default config (reuse engine) | migration 087 |
| #30 | Batas kasbon toggle (default OFF) + enforcement progress_pct | migration 088, `lib/kasbon-limit.ts` |
| #31 | Default proyek baru (DP% + masa pemeliharaan) | migration 089 |
| #32 | Master **satuan** terpusat (census A6) — hapus 2 daftar divergen | migration 090, `useUnits`, `/pengaturan/satuan` |
| #33 | 🔴 **Denda keterlambatan** (DANGER GATE, default OFF) — 6 syarat founder | migration 091, `lib/penalty.ts`, `utils/penalty.ts` |
| #34 | **CONTRACT** — pensiunkan dual-write shadow (source sole authority) | migration 092, hapus 7 modul + 6 call-site |
| #35 | Koreksi: restore workflow tables (revert drop prematur) + ADR-006 | migration 093, AUDIT OPEN-2, ADR-006 |
| #36 | Master **kategori pekerjaan** (census A7) | migration 094, `useWorkCategories`, `/pengaturan/kategori-pekerjaan` |

## 2. Bukti DB dev (query 2026-07-24)

- **Migration 084–094 tracked 11/11** di `supabase_migrations.schema_migrations` (090-094 sempat applied-tanpa-tracking karena di-apply via raw SQL untuk E2E → **direkonsiliasi**: tracking row disisipkan; migrasi idempoten jadi nol risiko re-run).
- `financial_config`: **8 key effective-dated** (tax.ppn_rate, tax.pph_final_rate, retention.default_pct, penalty.enabled/basis/rate_per_day/cap_pct/grace_days) · **anti-overlap constraint** `no_overlap_financial_config` aktif.
- `penalty.enabled` = **false** (DEFAULT OFF — nol perubahan perilaku).
- `units` = **18** baris · `work_categories` = **12** baris.
- **6 derived permission**: settings:finance:manage, change_order:approve, finance:view:all, finance:penalty:waive, units:manage, work_categories:manage (semua seed admin, **nol over-grant** terverifikasi).
- `projects` penalty override = **5 kolom** · `invoices` waiver = **4 kolom**.
- `workflow_*` = **5 tabel** (dipulihkan pasca koreksi 093, YATIM, menunggu keputusan drop founder).

## 3. Bukti kualitas (CI-gated, apps/api)

- **lint 0 error · tsc 0 · 225 test · build 0** (state main pasca #36).
- **Live E2E terhadap DB dev NYATA** (bukan mock) per slice keuangan: financial engine (date-aware C1, anti-overlap, close-then-insert), kasbon-limit, DP/maintenance, **units 14/14**, **denda 11/11** (OFF→nol persist · override→otoritatif Rp2jt sesuai contoh founder · cap Rp5jt · idempotent · waiver skip · estimasi labeled non-persist · C1 batas tanggal), **A7 11/11**.
- Anti-self-lockout: test membuktikan pencabutan permission kritis dari pemegang terakhir DITOLAK.

## 4. Invarian [C] tetap di kode (bukan config) — terjaga

RLS on/off · double-entry/anti-overlap constraint · immutability audit_logs · fail-closed default permission · **struktur** formula finansial · anti-self-lockout CRITICAL_PERMISSIONS. Yang jadi config hanya **nilai/daftar/toggle** ([A]), bukan struktur/invarian.

## 5. Koreksi tercatat jujur (bukan disembunyikan)

- **F5/F7 over-grant** tertangkap SEBELUM commit: `finance:view` akan bocor ke mandor → diganti derive `finance:view:all` (admin+pm) — scope lama terjaga.
- **Migration 092 over-reach**: men-drop tabel workflow melebihi persetujuan founder ("pensiunkan shadow" ≠ drop tabel engine). **Dikoreksi #35** (093 restore); keputusan drop dikembalikan ke founder (AUDIT OPEN-2).
- **1A audit "0 role-literal" tidak akurat**: dikoreksi via AKTA 0 (F1-F10 didokumentasikan).

## 6. Census A-item — status

| Item | Status |
|---|---|
| A1 tax rate | ✅ effective-dated (086) |
| A2 retensi | ✅ config (087) |
| A3 kasbon limit 80% | ✅ config toggle default OFF (088) — kolom "yatim" dihidupkan sbg config |
| A6 satuan divergen | ✅ master units (090) |
| A7 kategori pekerjaan | ✅ master work_categories (094) |
| Denda (baru) | ✅ mesin config-first default OFF (091) |
| A4/A5/A8 dst | 🔵 terbuka — lihat HARDCODE-CENSUS.md |

## 7. Temuan terbuka (menunggu keputusan)

- **OPEN-1** `kasbons.status='settled'` tanpa code path — kemungkinan fitur belum dibangun (keputusan produk). *AUDIT_REPORT.*
- **OPEN-2** tabel `workflow_*` yatim pasca CONTRACT — rekomendasi drop lewat migration terpisah **setelah keputusan founder**. *AUDIT_REPORT + ADR-006.*

---

*Metode: fakta di-query langsung dari DB dev + CI + git log. Reproducible: jalankan test suite (`pnpm test`), cek `schema_migrations`, cek `financial_config`/`units`/`work_categories`.*
