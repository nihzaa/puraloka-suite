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

- **Migration 075–098 tracked 24/24** (nihil yang lolos) di `supabase_migrations.schema_migrations` (090-098 sempat applied-tanpa-tracking dari raw-SQL E2E → **direkonsiliasi**; migrasi idempoten).
- **Master data config** (dari UI): `units`=18, `work_categories`=12, `kasbon_purposes`=5.
- **`financial_config`** = 8 key effective-dated aktif (tax ppn/pph, retention, penalty enabled/basis/rate/cap/grace) + anti-overlap EXCLUDE constraint.
- **Tabel `workflow_*` = 0** (di-drop migration 095, engine diretire).
- **Permissions** = 58 total; **7 derived config-perm** (settings:finance:manage, change_order:approve, finance:view:all, finance:penalty:waive, units:manage, work_categories:manage, kasbon_purposes:manage) — semua seed admin, nol over-grant.

## 3. Bukti kualitas (CI-gated, apps/api)

- **lint 0 error · tsc 0 · 255 test · build 0** (main pasca #40).
- Live E2E terhadap DB dev NYATA (bukan mock) per slice finansial + master-data.

## 4. RLS — HASIL JUJUR (dipisah tegas: TABLE vs STORAGE)

**Koreksi penting (temuan founder):** versi awal audit ini menyapu "RLS dormant, nol live path" untuk SEMUA RLS. Itu SALAH — **STORAGE adalah live path**. Dipisahkan tegas di bawah.

**Pertanyaan arsitektur (diverifikasi):**

| # | Temuan | Bukti |
|---|---|---|
| a | **API Fastify pakai service_role key** dengan header `Authorization: Bearer <service key>` yang EKSPLISIT **bypass RLS**. Otorisasi nyata data-via-API = **handler Fastify**. | `apps/api/src/utils/supabase.ts` |
| b | **Web tak query TABEL langsung** (nol `supabase.from(table)`), TAPI **akses STORAGE LANGSUNG dgn anon key** (foto, dokumen, nota, bukti transfer). Storage = **LIVE PATH**. | grep `apps/web`: `supabase.storage.*` langsung |
| c | Smoke PR #12 = manual API-level, BUKAN RLS DB-level & BUKAN test otomatis. | — |

### 4A. TABLE RLS = defense-in-depth, DORMANT (bukan penegak live)

Live test DB-level (impersonasi per role: `SET ROLE authenticated` + JWT claim) — RLS **terbukti memfilter baris**:

| Role | projects | work_scopes | kasbons | projects:create | users:manage |
|---|---|---|---|---|---|
| admin | 15/15 | 20/20 | 56/56 | ✅ true | ✅ true |
| pm | **6/15** | 20/20 | 56/56 | true | ✅ false |
| mandor | **3/15** | **4/20** | **26/56** | ✅ false | false |
| client | **2/15** | 0/0 | 0/0 | false | ✅ false |

Isolasi positif + negatif lolos. **PM lihat semua work_scopes/kasbons** (capability-gated, tak project-scoped) → **OPEN-3** (dampak nol hari ini, kebocoran bila mobile direct-Supabase). **Status TABLE RLS: fungsional tapi DORMANT** (API service_role bypass; web tak query tabel). Pertahankan sbg lapis kedua; naikkan ke live-path + rapatkan PM scope SEBELUM klien direct-Supabase.

### 4B. STORAGE RLS = LIVE PATH — SEMPAT BOCOR → SUDAH DITUTUP (PR #39)

Browser akses `storage.objects` LANGSUNG dgn anon key → policy storage = **satu-satunya penjaga file, live**.

- **Temuan (live test):** policy bucket privat (`project-documents`, `expense-receipts`) hanya cek `bucket_id` dgn `roles={public}` — nol scoping. **ANON (belum login) & semua authenticated BISA baca semua file.** 🔴 kebocoran nyata di live path.
- **Fix (migration 097, PR #39):** bucket privat = akses hanya `service_role` + signed URL; `payment-proofs` dijadikan privat. **Live re-test: anon `project-documents` 0/1 (dulu 1/1)** → ditutup.
- **Status STORAGE RLS setelah fix: AMAN** untuk anon + akses langsung tak sah. Gate mobile sama seperti table (scoped-by-proyek bila mobile upload/baca langsung).

## 4C. Jaring pengaman OTORISASI — gap DITUTUP (PR #40)

Karena TABLE RLS dormant, **seluruh otorisasi data-via-API bertumpu pada handler Fastify TANPA cadangan DB**. Kondisi awal: **nol** test HTTP yang assert 403 → bila satu preHandler terhapus saat refactor, tak ada yang merah (persis CRITICAL-1 historis). **Ditutup sekarang, bukan ditunda ke pra-produksi** (justru paling murah dilakukan sebelum Phase 2 me-refactor).

- **+22 test integrasi** (`routes/v1/__tests__/authz-endpoints.test.ts`): **11 endpoint sensitif × (positif + negatif)** — buat invoice, bayar invoice, putihkan denda, approve kasbon, approve & reject CO, approve expense kas, PUT settings/finance, PUT roles permissions, register user, hapus proyek.
- **Yang nyata diuji:** route module **ASLI** didaftarkan → rantai preHandler asli (`authenticate` + `requirePermission`); tabel `users` + RPC `get_role_permissions` **ASLI** (DB dev). **Yang di-stub HANYA verifikasi token** (`supabaseAuth.auth.getUser`) — itu autentikasi, bukan otorisasi (login nyata butuh password = blocker kredensial).
- **Asersi:** role tak berhak → **HARUS 403**; role berhak → **BUKAN 403** (gate lolos; status lain wajar krn payload dummy).
- **MUTATION-TESTED (bukti jaring nyata, bukan vacuous):** `requirePermission('change_order:approve')` dihapus dari route CO approve → test NEGATIF **MERAH**. Dikembalikan setelah uji.
- **Sisa (kecil, tercatat):** ~34 test `rls-*` + 9 anti-lockout tetap menjaga LOGIKA `has_permission` per role. Cakupan 403 saat ini 11 endpoint paling sensitif (uang + permission); endpoint lain masih mengandalkan code review — perluasan bertahap direkomendasikan seiring Phase 2.

## 5. Koreksi tercatat jujur (over-reach tidak disembunyikan)

- **F5/F7 over-grant** tertangkap sebelum commit → derive `finance:view:all` (scope terjaga).
- **Migration 092 over-reach** (drop tabel workflow melebihi persetujuan) → dikoreksi #35 (093 restore) → drop resmi #37 (095) setelah keputusan founder.
- **1A audit "0 role-literal" tidak akurat** → dikoreksi AKTA 0 (F1-F10).
- **Migration tracking 090-096** applied-tanpa-tracking → direkonsiliasi.

## 6. Item terbuka / backlog (BUKAN penghalang Phase 1)

- ✅ **OPEN-4** (fitur foto) & **OPEN-5** (jaring 403) DITUTUP di #40.
- 📌 **OPEN-1** `kasbons.status='settled'` tanpa code path → **backlog produk** (fitur settlement, fase berikutnya). Bukan bug.
- 🔵 **[A] ditunda** (alasan eksplisit di HARDCODE-CENSUS): A5 (templates sudah table-based), A8/A9/A10 (enum coupled code = [C]), A13 (autoApprove → Phase 2 workflow), A14 (contract template editor).

---

## 7. 🔑 Service_role key = CROWN JEWEL — checklist pra-produksi

Key ini bypass RLS SEPENUHNYA → kebocorannya = akses penuh DB tanpa filter apa pun. WAJIB sebelum produksi:

- [ ] **Penyimpanan**: `SUPABASE_SECRET_KEY` di secret manager Railway (env var runtime), **BUKAN** di `.env` yang ter-commit / repo.
- [ ] **Nol kebocoran ke client bundle**: verifikasi tak ada `SUPABASE_SECRET_KEY`/`JWT_SECRET` di build web; **hanya** `NEXT_PUBLIC_*` (anon/publishable + VAPID public) yang boleh masuk bundle. Grep bundle produksi utk memastikan.
- [ ] **Nol ter-log**: pastikan key tak pernah masuk log (structured log, error handler, request dump). (Historis CRITICAL-7 sudah menandai ini — verifikasi ulang saat deploy.)
- [ ] **Rotasi**: prosedur rotasi key + pemisahan key dev vs prod (jangan pakai key dev di prod).
- [ ] **Prinsip**: service_role hanya di server (Fastify). Tak pernah dikirim ke browser/mobile.

## 8. VERDICT FINAL

**Phase 1 (Core Platform Foundation / Program A) DINYATAKAN TUNTAS** — semua blocker ditutup & diverifikasi:

1. ✅ 1A/1B/1D selesai & ter-audit; Config-First (AKTA 0-5) merged (#24-#38).
2. ♻️ 1C Workflow Engine **sengaja diretire** (ADR-006) — penutupan yang benar, bukan menggantung.
3. ✅ **BLOCKER-1 STORAGE RLS (live path) BOCOR → DITUTUP (#39)**. Anon bisa baca semua file bucket privat; kini `service_role`-only + signed URL, diverifikasi tertutup (anon 0/1).
4. ✅ **BLOCKER-2 FITUR FOTO tak pernah berfungsi → DIPERBAIKI (#40)**. Bucket tak pernah ada (36 baris `project_photos` ternyata seed Unsplash); kini bucket privat + policy ketat + upload lewat API + kegagalan tak senyap. CLAUDE.md dikoreksi.
5. ✅ **BLOCKER-3 Jaring otorisasi wiring nol → DITUTUP (#40)**. 22 test integrasi 403 (11 endpoint sensitif), **mutation-tested** (hapus preHandler → merah).
6. ⚠️ **TABLE RLS = defense-in-depth dormant** (bukan penegak live) — STATUS JUJUR yang tercatat, bukan cacat: otorisasi handler ADA, benar, dan kini **ber-jaring test**.

**Angka penutup:** 255 test · lint 0 error · tsc 0 · build 0 · migration 075-098 tracked.

## 9. Prasyarat masuk fase berikutnya

**Phase 2 = Dynamic Workflow Engine** (Program B, roadmap 04):

1. ✅ **Permission engine solid** — RBAC v2 + derive-capability + anti-self-lockout.
2. ✅ **Jaring pengaman sebelum refactor** — 255 test; **termasuk 22 test 403** yang akan menangkap preHandler hilang saat Phase 2 me-refactor (alasan utama dikerjakan sekarang).
3. 📌 **A13 (autoApprove)** menunggu Phase 2 (rumah yang benar).
4. ⚠️ **Phase 2 = engine sebenarnya, bukan revival 1C otomatis** — kutip kebutuhan approval multi-langkah (ADR-006).
5. ⚠️ **Gate MOBILE (klien direct-Supabase mana pun):** (a) rapatkan TABLE RLS PM scope (**OPEN-3**) + storage policy scoped-by-proyek; (b) test per role di jalur itu. Tak menghalangi Phase 2 (server-side).
6. 📋 **Pra-produksi (sebelum go-live):** (a) checklist crown-jewel key (§7); (b) perluas cakupan test 403 ke endpoint lain secara bertahap.

---
*Metode reproducible: `pnpm test` (apps/api), query `schema_migrations`/`financial_config`/`units`/`work_categories`/`kasbon_purposes`, RLS test via `SET ROLE authenticated` + `request.jwt.claims`. Semua angka di atas hasil query langsung DB dev 2026-07-24.*
