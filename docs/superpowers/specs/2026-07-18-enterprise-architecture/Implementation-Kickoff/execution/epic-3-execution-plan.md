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

> Migration 060 juga mengisi `role_permissions` (bootstrap data — lihat Bagian 5). Tidak dibahas di sini: itu seed tanpa makna arsitektural, bukan keputusan desain.

**Acceptance criteria per titik migrasi:**
- [ ] `permissions` (dan default `role_permissions` seed) di-deploy lebih dulu (bagian migration 060) sebelum kode route diubah.
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
| `db/migrations/060_permission_scopes_and_audit_tax_keys.sql` | Baru — `permission_scopes` table + `permissions` (`audit:view`, `finance:tax:submit`) + default `role_permissions` seed (dapat diubah admin kapan saja via UI) |
| `supabase/migrations/060_permission_scopes_and_audit_tax_keys.sql` | Baru — identik dengan di atas |
| `apps/api/src/routes/v1/audit.ts` | Baris 10, 59: `requireRole('admin')` → `requirePermission('audit:view')`; import diperbarui |
| `apps/api/src/routes/v1/reports.ts` | Baris 967: `requireRole('admin')` → `requirePermission('finance:tax:view')` (key existing); Baris 1038: → `requirePermission('finance:tax:submit')` (key baru); import diperbarui |
| `apps/api/src/plugins/auth.ts` | Baris 60-72: fungsi `requireRole` dihapus (setelah T3.3 prasyarat lengkap) |

**Tidak disentuh:** UI (`apps/web`), mobile app, RLS policies (`049_rls_policies.sql`), tabel selain yang disebut di atas.

---

## 5. Migration Plan

1. Tulis `060_permission_scopes_and_audit_tax_keys.sql` (kembar 2 folder) — buat `permission_scopes` + `INSERT INTO permissions` (`audit:view`, `finance:tax:submit`) + `INSERT INTO role_permissions` (baris default, sama pola `by name lookup` seperti migration 050, dengan komentar SQL `-- Default seed instalasi awal, dapat diubah admin kapan saja via /pengaturan/roles — bukan business rule`).
2. Jalankan migration di Supabase dev.
3. Verifikasi teknis: `SELECT * FROM get_role_permissions('admin')` mengandung kedua key baru (memastikan seed jalan, bukan memvalidasi "siapa seharusnya boleh" — itu bukan pertanyaan migration).
4. Baru setelah verifikasi ini lulus, lanjut ke perubahan kode route (T3.2).

**Rollback plan:**
- Migration 060 bersifat additive murni (CREATE TABLE, INSERT) — rollback = `DROP TABLE permission_scopes CASCADE;` + `DELETE FROM permissions WHERE key IN ('audit:view', 'finance:tax:submit');` (cascade otomatis membersihkan `role_permissions` terkait via FK `ON DELETE CASCADE`).
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

*Menunggu review/approval sebelum implementasi dimulai — sesuai permintaan eksplisit: dokumen ini tidak dieksekusi sampai disetujui.*
