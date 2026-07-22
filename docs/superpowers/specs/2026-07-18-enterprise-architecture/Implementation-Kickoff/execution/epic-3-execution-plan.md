# Epic 3 — Permission Engine Konsolidasi — Execution Plan

**Status dokumen:** Execution plan, bukan desain baru. Semua keputusan arsitektur di sini mengikuti [Phase1/02-target-architecture.md § 1A.1](../../Phase1/02-target-architecture.md) dan [Master-Delivery-Blueprint/01-capability-to-task-mapping.md](../../Master-Delivery-Blueprint/01-capability-to-task-mapping.md). Tujuan dokumen ini hanya menutup jarak antara desain (yang sudah disepakati) dan kode nyata hari ini (yang sudah direverifikasi ulang, bukan diwarisi dari audit lama) — sesuai [09-definition-of-ready.md](../09-definition-of-ready.md) poin 4.

**Prasyarat DoR (dicek sebelum dokumen ini ditulis):**
- ✅ Epic 1 (Financial Test Suite) — `completed`, 53 test lulus.
- ✅ Epic 2 (CI/CD Foundation) — `completed`, CI hijau di `main` (run `29937879933`, 2m9s).
- ✅ Baris kode target sudah direverifikasi via grep langsung (Bagian 1 di bawah), bukan mengandalkan nomor baris dari dokumen manapun.

---

## 1. Temuan Reverifikasi — Scope Epic 3 Lebih Kecil dari Perkiraan Awal

Percakapan sebelumnya sempat mengutip "21 baris inline role-check" dari `Master-Delivery-Blueprint/01-capability-to-task-mapping.md:45`. Setelah membaca `Phase1/02-target-architecture.md:47-59` (dokumen v1.1, hasil koreksi Readiness Review) dan **live-grep terhadap kode hari ini**, angka itu sudah usang. Kondisi nyata:

```
$ grep -rn "requireRole(" apps/api/src/routes/ apps/api/src/plugins/
routes/v1/audit.ts:10:      preHandler: [authenticate, requireRole('admin')]
routes/v1/audit.ts:59:      preHandler: [authenticate, requireRole('admin')]
routes/v1/reports.ts:967:   preHandler: [authenticate, requireRole('admin')]
routes/v1/reports.ts:1038:  preHandler: [authenticate, requireRole('admin')]
plugins/auth.ts:60:  export function requireRole(...roles: string[]) {

$ grep -rn "requirePermission(" apps/api/src/routes/ apps/api/src/plugins/ | wc -l
103
```

**Kesimpulan:** RBAC v2 (`role_permissions` + `get_role_permissions()` RPC + `requirePermission()` middleware, migration `050_rbac_foundation.sql`) sudah jadi pola dominan — 103 call site sudah memakainya. **Hanya 4 call site `requireRole` tersisa**, seluruhnya `admin`-only, tersebar di 2 file. Epic 3 = menuntaskan 4 titik ini + menghapus fungsi legacy, bukan migrasi besar.

Ini **bukan** kabar bahwa Epic 3 "sudah dikerjakan orang lain" — 4 titik ini nyata belum bermigrasi, dan cara memigrasikannya (Bagian 3) mengungkap keputusan scope-akses yang harus disetujui sadar, bukan sekadar tempel `requirePermission()`.

---

## 1a. Prinsip Governing — Permission vs Role vs Seed

**Sumber prinsip:** [ADR-004 — Permission adalah Arsitektur, Role adalah Konfigurasi](../../Engineering-Constitution/adr/ADR-004-permission-is-architecture-role-is-configuration.md). Epic 3 adalah **penerapan pertama** ADR itu, bukan pemiliknya — prinsip ini mengikat seluruh Epic berikutnya, bukan hanya dokumen ini.

> **Permission adalah bagian dari arsitektur. Role adalah data konfigurasi.** Permission merepresentasikan business capability (`finance:tax:submit`, `cash:expense:approve`) — **tidak pernah** jabatan (`pm:approve`, `admin:delete`, `director:view` dilarang). Role hanyalah pengelompokan permission. Kode **hanya boleh** memeriksa permission (`requirePermission(key)`), **tidak pernah** nama role. Mapping permission↔role adalah isi tabel `role_permissions`, diubah admin lewat UI tanpa deploy/migration/kode. "Siapa boleh melakukan X" **bukan pertanyaan arsitektur** — permission key stabil selamanya, role bertambah bebas seiring organisasi berkembang, tanpa satu baris kode pun berubah.

Ini bukan aspirasi ke depan — **sudah terwujud secara arsitektur hari ini**, ditemukan lewat verifikasi langsung (bukan diasumsikan dari CLAUDE.md yang menyebutnya "viewer" — deskripsi itu ternyata usang):

```
GET    /api/v1/roles                       — list role (termasuk custom, bukan cuma 4 built-in)
POST   /api/v1/roles                       — buat role baru, dengan copy_from untuk clone permission
PATCH  /api/v1/roles/:id                   — edit role
DELETE /api/v1/roles/:id                   — hapus role (kecuali is_builtin)
GET    /api/v1/permissions                 — daftar semua permission
GET    /api/v1/roles/:id/permissions       — permission yang dimiliki satu role
PUT    /api/v1/roles/:id/permissions       — REPLACE mapping role↔permission — inilah "UI Role Management" yang dimaksud
```

UI-nya pun sudah interaktif, bukan read-only: `apps/web/app/(dashboard)/pengaturan/roles/page.tsx` punya `togglePerm()`, `toggleAllInModule()`, `savePermissions()` (memanggil `PUT .../permissions`), dan modal buat role baru.

**Implikasi konkret untuk Epic 3 — Epic ini tidak pernah membahas role:**
- Task ini **hanya** menjawab satu pertanyaan per endpoint: business capability apa yang direpresentasikan → permission key apa namanya. Titik.
- "Siapa memiliki permission ini" **bukan pertanyaan Epic 3** — itu selalu, dan akan selalu, jadi konfigurasi data (`role_permissions`) yang diubah admin lewat `/pengaturan/roles`, kapan pun, sebelum atau sesudah Epic 3, tanpa kode/migration/deploy.
- Migration 060 memang harus mengisi `role_permissions` dengan sesuatu (tabel tidak boleh kosong-permanen begitu permission dibuat), tapi ini detail teknis migration, bukan keputusan yang perlu dibahas atau disetujui sebagai desain — nilainya bisa diganti admin detik berikutnya lewat UI.
- **Role "Tax Officer"/"Finance Staff"/dst belum ada di sistem** (baru 4 built-in). Epic 3 **tidak** membuat role bisnis baru — itu keputusan organisasi milik founder, dilakukan kapan pun lewat `POST /api/v1/roles` + UI, sepenuhnya di luar scope migrasi mekanisme ini (lihat Bagian 8).

## 2. Tujuan Epic 3

Sesuai `05-feature-implementation-order.md` Epic 3 (1A.1):
1. **F3.1 — Schema**: tabel `permission_scopes` (PBAC sederhana: kombinasi role + resource ownership, pola yang **sudah ada** di kode — PM hanya approve kasbon proyek sendiri — bukan policy engine generik baru).
2. **F3.2 — Migrasi 4 call site `requireRole` → `requirePermission`**.
3. **F3.3 — Hapus `requireRole`** setelah seluruh F3.2 selesai + verifikasi grep nol hasil.
4. **F3.4 — Dokumentasi data-scoping**: komentar eksplisit di baris yang sudah melakukan filter scope inline (mis. `finance.ts:273` PM-ownership check) — **bukan** mengubah logic, hanya menandai eksplisit apa yang sudah ada.

**Non-tujuan (eksplisit, agar tidak melebar saat implementasi):**
- **Bukan** membangun Permission Engine dari nol — sudah ada dan sudah berjalan (103 call site).
- **Bukan** generalisasi PBAC/ABAC penuh — `permission_scopes` hanya menggeneralisasi pola PM-ownership yang sudah teramati, `scope_type = 'field'` disiapkan di enum tapi **tidak diimplementasikan**.
- **Bukan** menyentuh RLS — itu Epic 4, hard-blocked sampai Epic 3 `completed` (lihat Bagian 6).
- **Bukan** mengubah UI/mobile — kontrak `requirePermission(key: string)` tidak berubah tanda tangannya, klien tidak melihat perbedaan selama scope akses efektif sama (lihat Bagian 3 untuk pengecualian yang harus diputuskan).

---

## 3. Acceptance Criteria per Task

### T3.1.1 — Skema `permission_scopes` (Migration 060, additive)

Nomor migration: **`060`**, bukan `059` — `059_seed_dummy_data.sql` sudah terpakai di `supabase/migrations/` (seed data dummy, bukan schema migration, sengaja tidak dibackfill ke `db/migrations` — kondisi ini dicatat sebagai keputusan sadar, bukan diperbaiki diam-diam di Epic 3 ini). Ditulis kembar ke `db/migrations/060_...sql` dan `supabase/migrations/060_...sql` (identik), sesuai pola seluruh migration sebelumnya di repo.

**Catatan pemecahan (aktual saat implementasi):** migration dipecah jadi **dua** file untuk histori yang lebih bersih (sesuai arahan founder saat eksekusi) — `060_permission_scopes.sql` (tabel saja, task ini) dan `061_audit_tax_permissions.sql` (permission catalog + seed, task T3.2). Pemisahan ini memastikan perubahan desain `permission_scopes` di masa depan tidak menyeret commit permission catalog, dan sebaliknya.

```sql
CREATE TABLE permission_scopes (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  scope_type     TEXT NOT NULL CHECK (scope_type IN ('project', 'field')),
  scope_value    TEXT NOT NULL,  -- project_id (as text) untuk scope_type='project'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_permission_scopes_user ON permission_scopes(user_id, permission_key);
```
(persis sesuai `Phase1/02-target-architecture.md:76-84`)

**Acceptance criteria:**
- [ ] Migration additive murni — tidak ALTER/DROP tabel existing.
- [ ] Ditulis ke **kedua** folder (`db/migrations/060_...`, `supabase/migrations/060_...`), isi identik.
- [ ] RLS diaktifkan di `permission_scopes` dengan pola read/write sama seperti `role_permissions` (read: authenticated, write: service_role) — konsisten `050_rbac_foundation.sql:213-235`.
- [ ] **Tabel dibuat tapi TIDAK dipakai** di F3.2 — PM-ownership check di 4 titik migrasi tetap inline (lihat Bagian 3.2), karena F3.2 hanya menutup 4 titik `requireRole('admin')` yang tidak butuh scope (semuanya admin-only, bukan PM-ownership). `permission_scopes` disiapkan untuk kebutuhan PBAC berikutnya (di luar 4 titik ini), sesuai prinsip YAGNI — jangan pakai tabel baru untuk migrasi yang tidak membutuhkannya.
- [ ] Dijalankan di Supabase dev, diverifikasi `\d permission_scopes` menunjukkan skema benar.

### T3.2.1–T3.2.4 — Migrasi 4 Call Site (urutan risiko rendah → tinggi berdasarkan blast radius endpoint)

**Satu-satunya pertanyaan yang relevan di task ini: business capability apa yang direpresentasikan tiap endpoint.** Bukan siapa pemiliknya — itu baris `INSERT INTO role_permissions` yang boleh diubah admin lewat UI kapan saja, sebelum maupun sesudah Epic 3, tanpa kode/migration/deploy baru. Tabel di bawah sengaja tidak punya kolom "siapa boleh akses."

| # | File:baris | Endpoint | Method | Business capability | Permission key |
|---|---|---|---|---|---|
| 1 | `audit.ts:10` | `GET /api/v1/audit` | read | Melihat audit trail seluruh sistem | `audit:view` **(baru)** |
| 2 | `audit.ts:59` | `GET /api/v1/audit/meta` | read | Sama dengan #1 (metadata filter dropdown) | `audit:view` **(baru)**, sama dengan #1 |
| 3 | `reports.ts:967` | `GET /api/v1/reports/rekap-pajak` | read | Melihat rekap pajak (PPh/PPN) per proyek/bulan | `finance:tax:view` — **sudah ada** (migration 050), dipakai ulang |
| 4 | `reports.ts:1038` | `PATCH /api/v1/reports/rekap-pajak/:id/status` | write | Menyetor/menandai laporan pajak sudah dilaporkan ke DJP (`pending → reported`) | `finance:tax:submit` **(baru)** |

**Kenapa endpoint #3 pakai key existing, bukan key baru:** audit bisnis (Bagian 1) mengonfirmasi ini murni endpoint baca — persis capability yang sudah direpresentasikan `finance:tax:view`. Key baru untuk capability yang sudah punya representasi adalah duplikasi.

**Kenapa endpoint #4 butuh key baru, dan kenapa `submit` bukan `view`/`manage`:** "melihat rekap" dan "menyetor laporan ke DJP" adalah dua capability berbeda secara nyata — satu baca, satu aksi yang mengubah status kepatuhan pajak (`pending → reported`, komentar kode `reports.ts:1036`: "sudah dilaporkan ke DJP"). Nama `submit` mengikuti pola aksi spesifik yang sudah dipakai di seluruh catalog (`finance:invoice:pay`, `cash:expense:approve` — bukan `*:manage` generik).

> Migration 061 juga mengisi `role_permissions` (bootstrap data — lihat Bagian 5). Tidak dibahas di sini: itu seed tanpa makna arsitektural, bukan keputusan desain.

**Acceptance criteria per titik migrasi:**
- [ ] `permissions` (dan default `role_permissions` seed) di-deploy lebih dulu (migration 061) sebelum kode route diubah.
- [ ] Kode: 1 baris `requireRole('admin')` → `requirePermission(key)` sesuai tabel di atas — **kode tidak pernah menyebut nama role**, hanya permission key. **Tidak ada perubahan lain** di file yang sama pada task ini.
- [ ] Test manual sebelum & sesudah migrasi terhadap kombinasi role yang *hari ini* punya permission tersebut (ditentukan dari isi `role_permissions` saat itu, bukan diasumsikan dari nama role) — hasil harus identik, dicatat per commit (`06-testing-execution-plan.md:13`).
- [ ] Commit terpisah per file (4 commit untuk T3.2.1-T3.2.4), bukan 1 commit gabungan — konsisten `07-release-and-rollback-plan.md:15` ("branch per Task menjaga PR tetap kecil dan revertable").

### T3.3.1–T3.3.2 — Hapus `requireRole`

**Acceptance criteria:**
- [ ] Prasyarat: **seluruh** T3.2.1-T3.2.4 `completed` dan CI hijau — tidak boleh mulai sebagian.
- [ ] `grep -rn "requireRole(" apps/api/src/` menghasilkan **nol match** di `routes/`.
- [ ] Fungsi `requireRole` dihapus dari `plugins/auth.ts:60-72`.
- [ ] Import `requireRole` dihapus dari `audit.ts` dan `reports.ts` (sudah tidak dipakai setelah T3.2).
- [ ] `tsc --noEmit` bersih (memastikan tidak ada sisa referensi yang lolos grep karena alias import).

### T3.4.1 — Dokumentasi Data-Scoping (36 baris, per `Phase1/00-current-state-audit.md`)

**Acceptance criteria:**
- [ ] **Reverifikasi ulang** jumlah baris via grep — dokumen ini tidak mengasumsikan angka 36 masih akurat (sama seperti temuan Bagian 1, angka lama bisa usang). Grep pattern kandidat: pola inline `if (user.role === 'pm' && ...)` atau `.eq('pm_id', user.id)` di seluruh `routes/`.
- [ ] Untuk tiap baris yang teridentifikasi masih melakukan scoping implisit (PM hanya lihat data proyek sendiri, dst), tambahkan **komentar satu baris** yang menjelaskan constraint-nya — tidak mengubah logic.
- [ ] Dilakukan bersamaan saat file yang sama disentuh Task lain (tidak membuka PR terpisah khusus untuk ini) — sesuai `05-feature-implementation-order.md:45` ("Bersamaan dengan F3.2 per file").

---

## 4. Daftar File yang Akan Berubah

| File | Jenis perubahan |
|---|---|
| `db/migrations/060_permission_scopes.sql` (+ kembar `supabase/`) | Baru — `permission_scopes` table saja |
| `db/migrations/061_audit_tax_permissions.sql` (+ kembar `supabase/`) | Baru — `permissions` (`audit:view`, `finance:tax:submit`) + default `role_permissions` seed (dapat diubah admin kapan saja via UI) |
| `apps/api/src/routes/v1/audit.ts` | Baris 10, 59: `requireRole('admin')` → `requirePermission('audit:view')`; import diperbarui |
| `apps/api/src/routes/v1/reports.ts` | Baris 967: `requireRole('admin')` → `requirePermission('finance:tax:view')` (key existing); Baris 1038: → `requirePermission('finance:tax:submit')` (key baru); import diperbarui |
| `apps/api/src/plugins/auth.ts` | Baris 60-72: fungsi `requireRole` dihapus (setelah T3.3 prasyarat lengkap) |

**Tidak disentuh:** UI (`apps/web`), mobile app, RLS policies (`049_rls_policies.sql`), tabel selain yang disebut di atas.

---

## 5. Deployment Order — Review → Migration → Verification → Merge

**Prinsip (arahan founder):** migration mengikuti kode yang **sudah disetujui**, bukan sebaliknya. DB dev **tidak** diubah selama masih fase review — kalau reviewer minta perubahan migration setelah DB telanjur berubah, histori dev jadi kotor.

Urutan wajib:
1. Push branch `feature/epic-3-permission-consolidation` → buka PR.
2. **Code review** (PR). Migration `060`/`061` masih file di branch, **belum di-apply**.
3. Setelah PR **disetujui** → apply `060` lalu `061` ke Supabase dev.
4. **Smoke test** (checklist di bawah) + regression test (Epic 1 suite, 53/53).
5. Semua hijau → **baru merge** ke `main`.

**Smoke test checklist (setelah migration apply, sebelum merge):**
- [ ] Migration 060 sukses (`permission_scopes` ada — `\d permission_scopes`)
- [ ] Migration 061 sukses (`audit:view` + `finance:tax:submit` ada di `permissions`)
- [ ] `get_role_permissions('admin')` mengandung `audit:view` + `finance:tax:submit`
- [ ] Admin login → `GET /api/v1/audit` → 200
- [ ] Admin login → `PATCH /reports/rekap-pajak/:id/status` → berfungsi
- [ ] PM login → endpoint sesuai `role_permissions` saat itu (bukan diasumsikan)
- [ ] Permission cache (`_permissionCache`) terisi benar — tidak ada 500 "Gagal memuat permission"
- [ ] Regression: `pnpm test` 53/53, `pnpm lint` 0 error, CI hijau

**Rollback plan:**
- Migration 060 & 061 additive murni (CREATE TABLE, INSERT) — rollback = `DROP TABLE permission_scopes CASCADE;` (060) + `DELETE FROM permissions WHERE key IN ('audit:view', 'finance:tax:submit');` (061 — cascade otomatis membersihkan `role_permissions` terkait via FK `ON DELETE CASCADE`).
- Rollback kode route (T3.2): revert commit per-file individual (bukan revert gabungan) — karena tiap titik migrasi adalah commit terpisah, revert satu titik tidak memengaruhi 3 titik lain.
- Rollback T3.3 (hapus `requireRole`): karena hanya dieksekusi setelah seluruh T3.2 `completed` dan diverifikasi, rollback-nya adalah mengembalikan fungsi dari git history — **tidak ada** kondisi di mana T3.3 di-revert tanpa juga me-revert T3.2 (dependency searah).
- Tidak ada maintenance window khusus dibutuhkan — migration additive, tidak mengunci tabel besar, tidak ada downtime.

---

## 6. Dependency & Gate Keluar

- **Masuk:** Epic 1 + Epic 2 `completed`, CI hijau di `main` — ✅ terpenuhi (lihat Bagian 0 dokumen ini).
- **Keluar (membuka Epic 4 — RLS Sinkronisasi):** T3.1.1 s.d. T3.4.1 seluruhnya `completed`, grep `requireRole` nol hasil di `routes/`, CI hijau. Epic 4 **MUST NOT** mulai sebelum kondisi ini penuh (`05-feature-implementation-order.md` dependency graph: `E3 --> E4`).
- **Epic 5 (Audit Trail Helper)** tetap boleh berjalan paralel — tidak bergantung Epic 3 (`E1 -.paralel.-> E5`).

---

## 7. Verifikasi Akhir Epic 3 (sebelum menandai `completed`)

- [ ] `grep -rn "requireRole(" apps/api/src/` → nol hasil di `routes/`.
- [ ] `grep -rn "requirePermission(" apps/api/src/` → 107 (103 existing + 4 migrasi).
- [ ] `pnpm test` (Epic 1 suite) tetap 53/53 lulus — tidak ada regresi dari perubahan permission.
- [ ] `pnpm lint` 0 error (Epic 2 gate).
- [ ] Test manual 4 role (admin/pm/mandor/client) terhadap 4 endpoint yang dimigrasi — hasil dicatat, dibandingkan ke baseline.
- [ ] CI hijau di `main` setelah merge seluruh task.

---

## 8. Eksplisit BUKAN Scope Epic 3/4 — Business Role Catalog (dicatat, ditunda sadar)

Sempat diajukan di percakapan: membuat ~30-40 role bisnis konstruksi (Project Director, Site Engineer, QS/Estimator, Procurement Officer, HSE Officer, Finance Staff/Manager/CFO, Tax Officer, dst — dikelompokkan Finance/Project/Corporate/External) sebagai migration sekarang.

**Ditolak sadar, alasannya bukan waktu tapi urutan ketergantungan teknis:**
1. Role kustom yang dibuat hari ini (lewat `POST /api/v1/roles`, sudah berfungsi) akan lolos permission check di API (`requirePermission` baca `role_permissions`), **tapi RLS (migration 049) belum baca tabel `roles`/`permissions` sama sekali** — masih hardcode `auth_role() IN ('admin','pm')` dkk secara literal. Role baru akan punya cakupan RLS nol/tidak terduga sampai Epic 4 (`has_permission()` function, F4.1) selesai. Ini dikonfirmasi eksplisit sudah tertulis sebagai gap di `00-vision-and-business-architecture.md:487`.
2. Lebih fundamental: 30-40 role konkret hari ini **adalah spekulasi** — belum ada evidence dari operasional Puraloka Persada nyata tentang siapa sebenarnya approve invoice, submit pajak, edit CO, dst. Membuatnya sekarang melanggar YAGNI yang mengikat seluruh repository ini, dan kemungkinan besar 80% mapping permission-nya akan diubah lagi begitu kebutuhan nyata muncul.
3. **Permission adalah unit yang stabil, role adalah data yang berubah** — prinsip ini sudah berdiri sebagai Bagian 1a. Fondasi RBAC (Epic 3+4) selesai kalau *seluruh* layer (route, RLS) hanya mengenal permission key, bukan role apa pun — termasuk role baru yang belum diverifikasi cakupan RLS-nya.

**Kapan dikerjakan:** setelah Epic 4 `completed` (RLS baca `has_permission()`, bukan literal role). Saat itu, katalog role bisnis adalah **murni data** (`INSERT INTO roles` + `PUT .../permissions` via UI atau seed), bukan lagi pekerjaan yang menyentuh kode/RLS — konsisten godaan yang berhasil dihindari di sini.

---

## 9. Architecture Compliance Audit — Gate Wajib Sebelum Epic 4

Bukan testing fungsional — audit kepatuhan terhadap ADR-004. **MUST** lulus seluruhnya sebelum Epic 4 dimulai (bukan hanya "test hijau"). Ini penutup Epic 3 yang sebenarnya.

- [ ] `grep -rn "requireRole(" apps/api/src/` → **0 hasil** (termasuk plugins, bukan hanya routes).
- [ ] `grep -rn "user\.role\s*===\|user\.role\s*==" apps/api/src/routes apps/api/src/plugins` → setiap hasil (jika ada) diverifikasi **bukan** authorization gate dan sudah diberi komentar eksplisit.
- [ ] `grep -rn "\.role\b" apps/api/src` untuk `switch`/`includes` → tidak ada yang dipakai sebagai authorization.
- [ ] Tidak ada literal nama role sebagai authorization di service/business logic (kasbons.ts, change-orders.ts — titik yang [00-vision:486](../../00-vision-and-business-architecture.md) tandai sebagai inline role check; catatan: sebagian ini adalah *data-scoping* PM-ownership yang sah, bukan authorization gate — bedakan eksplisit).
- [ ] Seluruh authorization gate memakai `requirePermission(...)`.
- [ ] Fungsi `requireRole` sudah tidak ada di `plugins/auth.ts`.
- [ ] `pnpm test` 53/53 lulus, `pnpm lint` 0 error, CI hijau.

Temuan audit ini menjadi input untuk scope Epic 4 (RLS): daftar literal role yang tersisa di RLS policy adalah persis yang Epic 4 migrasikan ke `has_permission()`.

### Hasil Audit (dijalankan setelah commit 5) — TEMUAN PENTING

- ✅ `requireRole`: **0** di seluruh `src/` (helper dihapus). Ini scope Epic 3 sebagaimana didefinisikan — **selesai penuh**.
- ✅ `requirePermission`: **107** call site (103 + 4 migrasi).
- ⚠️ **Namun audit prinsip menemukan lapisan lebih dalam yang belum tercakup Epic 3:** ~57 pemakaian `user.role === '...'` + 3 `['admin','pm'].includes(user.role)` tersebar di 12 file route. Ini **melebihi** 4 `requireRole` yang jadi scope Epic 3 — konsisten dengan gap yang [00-vision:486](../../00-vision-and-business-architecture.md) sudah tandai ("pengecekan inline `user.role === ...` tersebar di logic bisnis, terpisah dari guard permission").

**Audit presisi per titik (bukan angka kasar) — dilakukan atas arahan founder sebelum keputusan scope:**

| File:baris | Kode | Kategori | Langgar ADR-004? | Permission tepat |
|---|---|---|---|---|
| `notifications.ts:154` | `if(!['admin','pm'].includes(role)) return 403` (approve/reject kasbon) | **Authorization** murni | ✅ Ya | `mandor:kasbon:approve` (sudah ada) |
| `notifications.ts:229` | idem (approve/reject wage report) | **Authorization** murni | ✅ Ya | `mandor:wage:approve` (sudah ada) |
| `progress.ts:313` | `if(!['admin','pm'].includes(role)) return 403` (edit kategori foto) | **Authorization** murni | ✅ Ya | `documents:manage` (sudah ada) |
| `cash.ts:473` | `autoApprove = role==='admin'\|\|'pm'` | **Business rule** (workflow: hasil submit auto-approved vs submitted, bukan gate akses) | ⚠️ Tidak murni | Jangan dipaksa jadi permission tanpa desain — bisa salah model |
| `kasbons.ts:126` | `isAdminOrPm → autoApprove` | **Business rule** (sama: auto-approve kasbon sendiri) | ⚠️ Tidak murni | Sama seperti cash.ts:473 |
| `reports.ts:82` | `canViewFinance` → memfilter kolom finansial yang di-fetch (endpoint sudah punya guard) | **Data-scoping** (field-level filtering dalam 1 endpoint) | 🟡 Borderline | Cukup komentar; migrasi opsional ke `finance:view` |
| `users.ts:12` | `isAdmin` → `showAll` (admin lihat user nonaktif) | **Data-scoping** (bukan deny; endpoint sudah `authenticate`) | 🟡 Borderline | Cukup komentar |

**Hasil audit — angka sebenarnya bukan 7:**
- **3 titik authorization murni** (`notifications.ts:154,229`, `progress.ts:313`) — allow/deny nyata (`return 403`), jelas melanggar ADR-004. **Ketiganya bisa migrasi dengan key yang SUDAH ADA** — tidak perlu permission baru.
- **2 titik business rule** (`cash.ts:473`, `kasbons.ts:126`) — ini `autoApprove` (menentukan *hasil* submit, bukan *boleh submit atau tidak*). Memaksanya jadi permission bisa salah model — **tidak** dimigrasi tanpa keputusan desain workflow terpisah.
- **2 titik data-scoping** (`reports.ts:82`, `users.ts:12`) — sah per ADR-004 Rule #1, cukup diberi komentar "bukan authorization gate".

**Keputusan founder:** Epic 3 ditutup sesuai definisi sempitnya (4 `requireRole` — selesai). 3 titik authorization murni **tidak** dimasukkan ke Epic 3 (menjaga integritas kontrak scope), melainkan dijadikan **Architecture Remediation 3.5** terpisah — lihat [architecture-remediation-3.5-inline-authorization.md](architecture-remediation-3.5-inline-authorization.md). 2 business rule (`autoApprove`) dan 2 data-scoping dicatat di situ juga, dengan klasifikasi + rekomendasi masing-masing (business rule: tidak disentuh tanpa desain workflow; data-scoping: cukup komentar).

---

*Status implementasi: branch `feature/epic-3-permission-consolidation`. Commit 1 (`permission_scopes`, migration 060) dan commit 2 (`audit:view`+`finance:tax:submit`, migration 061) sudah dibuat — migration BELUM di-apply ke dev (menunggu review). Selanjutnya: migrasi 4 route + hapus `requireRole` + compliance audit Bagian 9.*
