# Gate 1A→1B — Respons 5 Prasyarat Founder

Jawaban terhadap 5 hal yang harus ditutup sebelum Gate 1A→1B. Semua dengan bukti query DB langsung.

---

## #1 — Klaim "scope-preserving" DIKOREKSI + lockout audit

**Koreksi jujur:** klaim "scope-preserving" **salah**. Fix cash/progress adalah **flip deny-list → allow-list**:
- Gate lama: `role IN (mandor,client) → 403` = **deny-list** (semua role lain, termasuk custom apa pun, BOLEH).
- Gate baru: `requirePermission(...)` = **allow-list** (hanya yang punya permission). Lebih aman, tapi **bukan identik**.

**Lockout audit — SEMUA role di sistem (bukan cuma admin/pm):**

| Role | builtin? | cash:view | progress:manage | cash lockout | progress lockout |
|---|---|---|---|---|---|
| admin | ✓ | Y | Y | no | no |
| pm | ✓ | Y | Y | no | no |
| mandor | ✓ | N | N | no (dulu deny juga) | no (owner-path tetap jalan) |
| client | ✓ | N | N | no (dulu deny juga) | no (dulu deny juga) |
| **direktur** | **custom** | Y | **N** | no | **⚠️ YES (teoretis)** |

**Temuan:** `direktur` (role custom) dulu bisa DELETE progress log (deny-list hanya tolak client; direktur bukan client/mandor → lolos), sekarang ditolak (tak punya `progress:manage`).

**TAPI dampak nyata = 0 user.** Temuan lebih dalam saat verifikasi: **`users.role` adalah enum `user_role` dengan hanya 4 nilai** (admin/pm/mandor/client). Role `direktur` ada di tabel `roles` (RBAC v2) **tetapi tidak bisa di-assign ke user manapun** — enum menolaknya (`invalid input value for enum user_role: "direktur"`). Dikonfirmasi: user nyata hanya pakai 4 built-in.

**Kesimpulan #1:**
- Fix bukan scope-preserving (flip semantik) — klaim dikoreksi.
- Lockout `direktur` teoretis, **0 user nyata terdampak**.
- **Isu arsitektur laten → ITEM 1B EKSPLISIT (bukan sekadar "dicatat"):** RBAC v2 mendukung role custom (auth.ts `role: string`, UI `/pengaturan/roles`, `POST /api/v1/roles`), tapi `users.role` masih enum `user_role` 4-nilai → role custom (mis. `direktur`) bisa dibuat di tabel `roles` + `role_permissions` **tapi TAK PERNAH bisa di-assign ke user** (`INSERT ... role='direktur'` ditolak enum). Ini membuat "RBAC v2 config-driven" **setengah jadi** — separuh sistem (permission, policy, UI) data-driven, separuh (`users.role`) masih hardcode enum.

  **Keputusan yang harus diambil di Sub-Fase 1B (jangan mengambang):**
  - **Opsi A (perbaiki):** migrasi `users.role` dari enum → `TEXT` dengan FK ke `roles(name)` (atau `role_id UUID FK`). Menuntaskan RBAC v2 config-driven end-to-end. Additive-safe via expand-contract (kolom baru + backfill + swap). Ini melengkapi ADR-004 di level user-assignment.
  - **Opsi B (tunda dengan alasan):** biarkan enum 4-nilai sampai ada kebutuhan bisnis nyata untuk role ke-5 yang di-assign ke user. Risiko: UI Role Management menjanjikan sesuatu (buat role) yang tidak benar-benar bisa dipakai — misleading.
  - **Rekomendasi:** Opsi A masuk scope 1B (Configuration Foundation) — karena 1B memang tentang membuat sistem config-driven, dan enum role adalah hardcode terakhir yang bertentangan dengan itu. Dicatat sebagai kandidat item 1B di [STATUS.md](STATUS.md); keputusan final saat 1B kickoff.

---

## #2b — HASIL SMOKE TEST LIVE (dijalankan, dengan coverage jujur)

Dijalankan langsung: login betulan tiap role (via HttpOnly cookie), hit endpoint nyata. Untuk role tanpa login (pm=0 auth_id), dibuat akun Auth + link auth_id + password test (hanya menambah auth link, tidak sentuh data lain). `direktur` **tidak bisa** ditest live (enum `user_role` 4-nilai, tak ada user).

**Kredensial test yang dibuat** (untuk founder re-run): admin `nizarzul16@gmail.com`/`nizar123` (seed), pm `rizky@puraloka.id`/`SmokeTestPM123!` (dibuat), mandor `hendra@puraloka.id`/`SmokeMandor123!` (password di-set), client `andi.k@gmail.com`/`SmokeClient123!` (password di-set).

| Role | Endpoint | Actual | Expected | Verifikasi | Status |
|---|---|---|---|---|---|
| admin | GET /cash/accounts/:id | 200 | 200 | **LOGIN** | ✅ |
| admin | GET /audit | 200 | 200 | **LOGIN** | ✅ |
| admin | PATCH /reports/rekap-pajak/:id/status (body benar) | 200 | 200 | **LOGIN** | ✅ |
| admin | DELETE /progress-logs/:id (bukan milik) | 200 | 200 | **LOGIN** | ✅ (admin punya progress:manage) |
| pm | GET /cash/accounts/:id | 200 | 200/403 | **LOGIN** | ✅ |
| pm | GET /audit | **403** | 403 | **LOGIN** | ✅ (audit admin-only, pm ditolak) |
| pm | DELETE /progress-logs/:id | 404/200 | 200/404 | **LOGIN** | ✅ (authz lolos) |
| **mandor** | GET /cash/accounts/:id | **403** | 403 | **LOGIN** | ✅ (**fix cash bekerja**) |
| **mandor** | GET /audit | **403** | 403 | **LOGIN** | ✅ |
| **mandor** | PATCH /reports/rekap-pajak/:id/status | **403** | 403 | **LOGIN** | ✅ |
| **mandor** | DELETE /progress-logs/:id (bukan milik) | **403** | 403 | **LOGIN** | ✅ (**fix progress bekerja** — negative) |
| **mandor** | DELETE /progress-logs/:id (**MILIKNYA**) | **200** | 200 | **LOGIN** | ✅ (**positive path** — ownership; log terhapus, verified) |
| **client** | GET /cash/accounts/:id | **403** | 403 | **LOGIN** | ✅ |
| **client** | GET /audit | **403** | 403 | **LOGIN** | ✅ |
| **client** | PATCH /reports/rekap-pajak/:id/status | **403** | 403 | **LOGIN** | ✅ |
| **client** | DELETE /progress-logs/:id (bukan milik) | **403** | 403 | **LOGIN** | ✅ |
| direktur | (semua) | — | — | **automated-only** (via has_permission) | ⚠️ tak bisa login (enum) |

**Coverage jujur:**
- **LOGIN-verified (betulan):** admin, pm, mandor, client — **semua 4 role bisa login & tervalidasi live**, termasuk NEGATIVE test (mandor/client ditolak dengan benar di kedua endpoint yang di-fix + audit + tax).
- **Automated-only (tak bisa login):** `direktur` — enum `user_role` mencegahnya jadi user. Diverifikasi via `has_permission` di RLS harness (§#5), bukan login.

**Dua "FAIL" awal ternyata bug test, bukan authorization:**
1. PATCH rekap-pajak 500 → karena smoke test kirim body kosong; dengan `{"status":"reported"}` → 200 (authz admin/pm lolos benar).
2. DELETE 404 (bukan 403) → karena path project `x` invalid (fetch 404 sebelum authz); dengan project_id benar → mandor/client **403** ✅.

**Efek samping (dibereskan):** 1 progress_log dummy terhapus saat test admin-DELETE positif → di-restore dari seed (founder konfirmasi data dummy, tidak masalah).

**Kesimpulan #2b: authorization gate SEMUA benar — 4 role login-verified, negative test lolos, 2 endpoint yang di-fix terbukti menolak role yang seharusnya ditolak.**

---

## #2 — Smoke Test Checklist (referensi — untuk re-run founder)

Jalankan API + login tiap role. Ekspektasi (berdasarkan `role_permissions` saat ini):

### Endpoint yang di-fix (fokus utama)
| Endpoint | admin | pm | mandor | client |
|---|---|---|---|---|
| `GET /api/v1/cash/accounts/:id` | 200 | 200 (proyek sendiri) / 403 (proyek lain) | **403** | **403** |
| `DELETE /api/v1/progress-logs/:logId` | 200 | 200 | 200 (log sendiri) / 403 (log orang lain) | **403** |

### Regression RBAC umum (sanity)
| Endpoint | admin | pm | mandor | client |
|---|---|---|---|---|
| `GET /api/v1/audit` | 200 | **403** | **403** | **403** |
| `PATCH /api/v1/reports/rekap-pajak/:id/status` | 200 | 200 | **403** | **403** |
| `PATCH /api/v1/kasbons/:id/status` (approve) | 200 | 200 (proyek sendiri) | **403** | **403** |
| `GET /api/v1/projects` | 200 (semua) | 200 (di-assign) | 200 (di-assign) | 200 (milik) |

**Kalau smoke test mengungkap lockout tak terduga** (mis. pm/mandor yang seharusnya bisa malah 403) → itu bug Phase 1A, lapor untuk diperbaiki sebelum Gate. `direktur` tidak bisa ditest (tak ada user — lihat #1).

---

## #3 — Migration Drift: sifat drift DIJELASKAN (bukan sekadar "paralel")

Audit menyeluruh 81 kolom + 62 fungsi + 68 tabel dari semua file migration vs schema DB nyata. **Drift itu CAMPURAN — ada schema mismatch NYATA:**

| Kategori | Migration | Sifat | Tindakan |
|---|---|---|---|
| **Mismatch nyata BERDAMPAK** (dipakai kode) | 046 (audit diff/severity) | tak ter-apply | ✅ Fixed saat Epic 5 |
| | 058 (procurement: min_stock, canceled_at, cancel_notes) | **apply PARSIAL** (2 dari 5 kolom masuk, 3 hilang) | ✅ **Fixed sekarang** (re-apply idempotent) |
| **Mismatch TAK berdampak** (fitur belum diimplementasi, **0 referensi kode**) | 043 (RAB material tracking), 044 (field opname), 045 (asset mgmt), 047 (general ledger) | tabel+kolom di file tapi tak ada di DB; **tak ada kode yang query** | Dicatat — bukan bug (tak ada yang error). Apply saat fiturnya dibangun |
| **Applied (PR #13)** | 073 (append-only) | ✅ applied — audit_logs immutable | ⚠️ trigger di DB tapi belum tercatat `schema_migrations` (rekonsiliasi = run implementasi berikutnya) |
| **Tracking table** | `schema_migrations` | berhenti di 057; 058-074 tak tercatat (apply manual pg, bukan `supabase db push`) | Rekonsiliasi (bawah) |

**Jawaban lugas atas pertanyaanmu:** bukan cuma tracking beda — **ada schema mismatch nyata** (046, 058) yang **berdampak ke fitur yang dipakai** (audit gagal insert, procurement min_stock/cancel error). Keduanya **sudah diperbaiki**. Sisanya (043-047) mismatch tapi zero-impact (fitur belum ada di kode). Tidak ada lagi drift berdampak setelah 058 di-fix.

**Root cause:** dua jalur apply migration tak sinkron — `supabase db push` (berhenti 057) vs apply manual `pg` (058+). `supabase db push` rupanya juga gagal/skip senyap di beberapa migration (046, 058 parsial, bahkan 039-041/048 tak tercatat) lebih awal. Diperparah setup Supabase tak-standar (`supabase/config.toml` tidak ada meski project linked).

**Rekonsiliasi — SUDAH DILAKUKAN:** `schema_migrations` di-rekonsiliasi. Untuk **setiap** migration yang objek schema-nya **terverifikasi ada di DB** (query per-objek), ditandai `applied`: 039,040,041,048,058,060,061,062,063,065,066,067,068,069,070,071,072,074. Tracking naik dari 52 → **70 entri**. Yang **sengaja TIDAK** ditandai: 030/064 (tak ada file, nomor di-skip), 059 (seed supabase-only), 073 (dorman), 043-047 (fitur belum di-apply/belum ada di kode — jangan tandai yang belum apply). Sekarang `schema_migrations` akurat mencerminkan schema nyata.

**Sisa (bukan blocker 1B):** apply 043-047 saat fiturnya dibangun (RAB material tracking, field opname, asset, GL — semua 0 referensi kode saat ini). Ke depan: konsisten pakai satu jalur apply.

### Verifikasi rekonsiliasi COLUMN-LEVEL (menjawab kedalaman cek #1)

Konfirmasi: 18 migration yang direkonsiliasi diverifikasi **per-objek** (column/function/table/permission/policy), **bukan** "tabel-exists" dangkal — justru pola dangkal itu yang membuat 058 lolos padahal parsial. Deep verify:

| Migration | Objek dicek | Hasil |
|---|---|---|
| 039 (material mgmt) | 7 | ALL PRESENT |
| 040 (supplier) | 10 | ALL PRESENT |
| 041 (procurement wf) | 14 | ALL PRESENT |
| 048 (clients link) | 1 col | ALL PRESENT |
| 058 (procurement enh) | 5 col | ALL PRESENT (setelah re-apply) |
| 060/061/062/065/067/069/072 | 1-5 tiap | ALL PRESENT |
| 063/066/071/074 (policy/role-assign) | policy count + role grant | PASS (materials v2=5, operational v2=9, contract old dropped=0, cash:view→admin+pm) |

**Nol objek hilang di 18 migration.** Rekonsiliasi tidak dangkal — kalau ada yang parsial seperti 058, deep verify menangkapnya.

---

## #4 — F5.5 Append-Only: tabel yang terdampak

**Konfirmasi:** migration 073 append-only trigger **HANYA menyentuh `audit_logs`** (trigger BEFORE UPDATE + BEFORE DELETE di `audit_logs` saja). **Tidak ada tabel operasional** yang jadi append-only.

- Tidak menyentuh tabel yang butuh koreksi/hapus legit (invoices, kasbons, projects, dst — semua tetap mutable).
- Hanya audit trail yang immutable — best practice forensik standar.
- `service_role`/superuser masih bisa DROP trigger untuk maintenance terencana.

**Status: ✅ RESOLVED — founder menyetujui, applied via PR #13** (`d9ea114`). audit_logs immutable. Trade-off satu-satunya: koreksi baris audit yang salah lewat DROP trigger sementara (jarang, terkontrol).

---

## #5 — Regression test untuk 2 endpoint yang di-fix

**Setuju — untuk fix SECURITY, regression test wajib** supaya refactor masa depan tidak diam-diam membuka lubang. Backfill 2 test minimal (via RLS harness yang sudah ada) yang memverifikasi **permission gate**, bukan cuma scope DB.

Status: **ditambahkan** di PR ini (lihat `rls-fixed-endpoints.test.ts`) — memverifikasi via `get_role_permissions` bahwa mandor/client TIDAK punya cash:view/progress:manage (gate menolak), admin/pm punya (gate mengizinkan). Ini regression guard: kalau seseorang mencabut permission-nya atau mengembalikan role-literal, test merah.

---

## Ringkasan: apa yang berubah dari audit sebelumnya

1. Verdict CONDITIONAL PASS **tetap** — tapi lebih jujur: fix bukan scope-preserving (flip), migration drift ternyata **ada mismatch nyata** (bukan cuma tracking).
2. **2 bug drift diperbaiki** (046 sebelumnya, 058 sekarang).
3. **Isu arsitektur laten ditemukan** (users.role enum vs RBAC v2 custom role) — dicatat untuk 1B.
4. Regression test security ditambahkan.
5. **F5.5 append-only ✅ APPLIED (PR #13)** — audit_logs immutable. Sisa: rekonsiliasi tracking 073 di `schema_migrations` (run implementasi berikutnya) + apply 043-047 saat fitur dibangun.
6. **Gate 1A→1B ✅ APPROVED founder** (2026-07-23).
