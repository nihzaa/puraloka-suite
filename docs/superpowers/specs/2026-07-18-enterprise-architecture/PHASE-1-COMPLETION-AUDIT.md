# PHASE 1 — Completion Audit (Core Platform Foundation)

**Tanggal:** 2026-07-24 · **Sifat:** bukti objektif terverifikasi (query DB dev + CI + git), bukan narasi. **Termasuk hasil JUJUR soal RLS** (tidak dibungkus).

Scope: seluruh Phase 1 (= Program A) — Sub-Fase 1A, 1B, 1C, 1D + program Config-First (AKTA 0–5).

---

## 1. Status per sub-fase (bukti = audit yang sudah ada, ditaut)

| Sub-Fase | Verdict | Bukti |
|---|---|---|
| 1A Foundation Hardening | ✅ selesai | `Implementation-Kickoff/PHASE-1A-COMPLETION-AUDIT.md` (Epic 1-5 + Remediation 3.5 + ADR-005) |
| 1B Configuration Foundation | ✅ selesai | `PHASE-1B-COMPLETION-AUDIT.md` (18 kriteria, drift 080 = nol) + `SUB-FASE-1B-COMPLETION-AUDIT.md` |
| 1C Workflow Engine | ♻️ dibangun→diretire | `ADR-006` (rasional + nol divergensi) — BUKAN delivered |
| 1D Observability | ✅ selesai | `PHASE-1D-COMPLETION-AUDIT.md` (141 test saat itu, +11 baru 1D) |
| Config-First (AKTA 0-5) | ✅ selesai | `CONFIG-FIRST-COMPLETION-AUDIT.md` (#24-#38) |

## 2. Bukti DB dev (query 2026-07-24)

- **Migration 075–096 tracked 22/22** di `supabase_migrations.schema_migrations` (090-096 sempat applied-tanpa-tracking dari raw-SQL E2E → **direkonsiliasi**; migrasi idempoten).
- **Master data config** (dari UI): `units`=18, `work_categories`=12, `kasbon_purposes`=5.
- **`financial_config`** = 8 key effective-dated aktif (tax ppn/pph, retention, penalty enabled/basis/rate/cap/grace) + anti-overlap EXCLUDE constraint.
- **Tabel `workflow_*` = 0** (di-drop migration 095, engine diretire).
- **Permissions** = 58 total; **7 derived config-perm** (settings:finance:manage, change_order:approve, finance:view:all, finance:penalty:waive, units:manage, work_categories:manage, kasbon_purposes:manage) — semua seed admin, nol over-grant.

## 3. Bukti kualitas (CI-gated, apps/api)

- **lint 0 error · tsc 0 · 233 test · build 0** (main pasca #38).
- Live E2E terhadap DB dev NYATA (bukan mock) per slice finansial + master-data.

## 4. RLS — HASIL JUJUR (tidak ditutupi)

**Pertanyaan arsitektur (diverifikasi, bukan asumsi):**

| # | Temuan | Bukti |
|---|---|---|
| a | **API Fastify pakai service_role key** (`SUPABASE_SECRET_KEY`) dengan header `Authorization: Bearer <service key>` yang secara EKSPLISIT **bypass RLS**. | `apps/api/src/utils/supabase.ts` (komentar: "service role... to bypass RLS") |
| b | **Web TIDAK query tabel langsung.** Supabase client di web hanya untuk **auth** (login/OAuth) + **storage bucket** (foto kasbon). NOL `supabase.from(table).select()`/`.rpc()` di source. Semua data lewat Fastify API. | grep `apps/web`: hanya `supabase.auth.*` + `supabase.storage.*` |
| c | **Smoke test PR #12 = API-level** (403/200 per endpoint via handler Fastify), **BUKAN** RLS DB-level. Beda lapisan: itu menguji otorisasi handler, bukan filter baris RLS. | — |

**Kesimpulan lapisan otorisasi:** **Otorisasi NYATA hari ini = handler Fastify** (`requirePermission`/`hasPermission`/ownership check), karena API bypass RLS. RLS tabel **tidak berada di jalur data mana pun yang aktif**.

**Live RLS test DB-level (impersonasi tiap role: `SET ROLE authenticated` + JWT claim):** RLS **TERBUKTI memfilter baris** saat DIeksekusi —

| Role | projects | work_scopes | kasbons | projects:create | users:manage |
|---|---|---|---|---|---|
| admin | 15/15 | 20/20 | 56/56 | ✅ true | ✅ true |
| pm | **6/15** | 20/20 | 56/56 | true | ✅ false |
| mandor | **3/15** | **4/20** | **26/56** | ✅ false | false |
| client | **2/15** | 0/0 | 0/0 | false | ✅ false |

Isolasi positif (pm→pm_id, mandor→is_assigned_mandor, client→auth_client_id) + negatif (mandor tak bisa projects:create, client tak bisa users:manage) **semua lolos**. Catatan: **PM lihat semua work_scopes/kasbons** (policy capability-gated, tak project-scoped) — lebih longgar dari policy projects; isolasi PM untuk tabel ini ditegakkan di **API layer**, bukan RLS.

**Status jujur:** RLS = **defense-in-depth yang FUNGSIONAL tapi DORMANT** (nol dampak di operasi saat ini). BUKAN "RLS aktif sebagai penegak".

**Rekomendasi:** **Pertahankan** sebagai defense-in-depth — bernilai untuk (1) **mobile app** (belum dibangun) bila kelak query Supabase langsung dengan JWT user, (2) jaring pengaman bila service key bocor. **Prasyarat**: bila mobile/klien mana pun mulai akses Supabase langsung, RLS naik jadi jalur-hidup → wajib (a) test end-to-end per role di jalur itu, (b) rapatkan policy PM pada `work_scopes`/`kasbons` ke project-scope. Jangan pernah menulis "RLS aktif menegakkan akses" selama API service_role jadi satu-satunya jalur.

## 5. Koreksi tercatat jujur (over-reach tidak disembunyikan)

- **F5/F7 over-grant** tertangkap sebelum commit → derive `finance:view:all` (scope terjaga).
- **Migration 092 over-reach** (drop tabel workflow melebihi persetujuan) → dikoreksi #35 (093 restore) → drop resmi #37 (095) setelah keputusan founder.
- **1A audit "0 role-literal" tidak akurat** → dikoreksi AKTA 0 (F1-F10).
- **Migration tracking 090-096** applied-tanpa-tracking → direkonsiliasi.

## 6. Item terbuka / backlog (BUKAN penghalang Phase 1)

- 📌 **OPEN-1** `kasbons.status='settled'` tanpa code path → **backlog produk** (fitur settlement, fase berikutnya). Bukan bug.
- 🔵 **[A] ditunda** (alasan eksplisit di HARDCODE-CENSUS): A5 (templates sudah table-based), A8/A9/A10 (enum coupled code = [C]), A13 (autoApprove → Phase 2 workflow), A14 (contract template editor).

---

## 7. VERDICT

**Phase 1 (Core Platform Foundation) LAYAK DINYATAKAN TUNTAS** — dengan catatan jujur berikut yang sudah didokumentasikan, bukan disembunyikan:

1. ✅ 1A/1B/1D selesai & ter-audit; Config-First (AKTA 0-5) selesai & merged (#24-#38).
2. ♻️ 1C Workflow Engine **sengaja diretire** (keputusan founder + bukti nol divergensi + permission cukup) — didokumentasikan ADR-006. Ini penutupan yang benar, bukan pekerjaan menggantung.
3. ⚠️ **RLS = defense-in-depth fungsional tapi dormant** (bukan penegak di live path). Ini STATUS JUJUR, bukan cacat Phase 1 — otorisasi nyata (handler API) ada, ter-test, dan benar (403/200 per endpoint). RLS tetap dipertahankan sebagai lapis kedua.

## 8. Prasyarat masuk fase berikutnya

**Phase 2 = Dynamic Workflow Engine** (per roadmap 04). Gate masuk:

1. ✅ **Permission engine solid** (gate roadmap Phase 2) — terpenuhi (RBAC v2 + derive-capability + anti-self-lockout).
2. ✅ **Test coverage sebagai jaring pengaman** sebelum refactor finansial — terpenuhi (233 test, pure-logic finansial ber-test).
3. 📌 **A13 (autoApprove)** menunggu Phase 2 — engine ini rumah yang benar untuknya (bukan permission murni).
4. ⚠️ **Keputusan revival workflow**: Phase 2 = engine sebenarnya (bukan revival 1C otomatis). Bila Phase 2 membangun workflow, kutip kebutuhan approval multi-langkah nyata (mis. PO berjenjang) per ADR-006 — jangan hidupkan kembali tanpa bukti.
5. ⚠️ **Gate MOBILE (fase mana pun yang akses Supabase langsung):** naikkan RLS ke jalur-hidup + test per role + rapatkan policy PM scope/kasbon. Tidak menghalangi Phase 2 (server-side), tapi wajib sebelum klien direct-Supabase.

---
*Metode reproducible: `pnpm test` (apps/api), query `schema_migrations`/`financial_config`/`units`/`work_categories`/`kasbon_purposes`, RLS test via `SET ROLE authenticated` + `request.jwt.claims`. Semua angka di atas hasil query langsung DB dev 2026-07-24.*
