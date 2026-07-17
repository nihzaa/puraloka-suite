# Phase 1 — 00. Current State Audit

**Repository:** Puraloka Suite Architecture Repository — Phase 1 Planning Set
**Upstream:** Ini adalah pendalaman teknis dari [00 — Current State Assessment](../00-vision-and-business-architecture.md#current-state-assessment) dan [01 — Dynamic Permission Engine](../01-application-and-data-architecture.md#dynamic-permission-engine) di architecture repository utama. Dokumen ini **tidak mengulang** narasi yang sudah ada di sana — fokus pada detail teknis presisi (file:line) yang dibutuhkan untuk migration/rollout/test planning.
**Metodologi:** Seluruh temuan di bawah diverifikasi langsung dari source code (bukan asumsi/ingatan dari sesi sebelumnya), per 18 Juli 2026.
**Status:** Planning only — dokumen ini tidak mengubah kode apa pun.

---

## Cara Membaca Dokumen Ini

Setiap sub-sistem diberi status ringkas: 🟢 Matang / 🟡 Sebagian / 🔴 Tidak Ada / ⚠️ Ada tapi Berisiko. Detail lengkap ada di tabel masing-masing.

---

## 1. Permission Engine — Current State

**Status: ⚠️ Tiga mekanisme otorisasi paralel hidup berdampingan, tidak konsisten satu sama lain.**

### 1.1 Mekanisme yang Ada

| Mekanisme | Lokasi | Sifat |
|---|---|---|
| `requirePermission(key)` | `apps/api/src/plugins/auth.ts:76-100` | Data-driven — cek `request._permissionCache` (di-populate sekali per-request dari RPC `get_role_permissions`) |
| `requireRole(...roles)` | `apps/api/src/plugins/auth.ts:60-72` | Hardcoded — komentar di kode sendiri: *"legacy — dipertahankan untuk backward compat"* |
| Inline `.role === 'x'` | Tersebar di 11 route file | Campuran — sebagian authorization gate, sebagian data scoping (lihat 1.3) |

### 1.2 Skema RBAC v2 (Migration 050) — Sudah Ada dan Berfungsi

```
roles            (id, name UNIQUE, label, description, is_builtin, portal, color, sort_order)
permissions      (id, key UNIQUE, module, label, description, sort_order)
role_permissions (role_id, permission_id, granted_at, granted_by → users.id)
```

- Trigger `trg_protect_builtin_roles` memblokir penghapusan role `is_builtin=true`.
- RPC `get_role_permissions(role_name TEXT)` — `SECURITY DEFINER`, `STABLE`, join `permissions → role_permissions → roles`.
- **Seed data:** 4 role built-in (admin/pm/mandor/client), **45 permission** di **11 modul** (projects, finance, cash, mandor, procurement, reports, users, clients, settings, notifications, milestones, documents). Admin = 45 permission, PM = 35, mandor = 10, client = 3.
- RLS pada tabel RBAC sendiri: read untuk `authenticated`/`service_role`, write hanya `service_role`.

**Kesimpulan:** Fondasi data-driven **sudah dibangun dengan baik** — ini bukan kerja dari nol, ini kerja **konsolidasi dan penutupan celah**.

### 1.3 Call Site Inventory — `requireRole` (4 lokasi, harus dihapus)

| File:Line | Konteks |
|---|---|
| `apps/api/src/routes/v1/audit.ts:10` | Guard `GET /api/v1/audit` |
| `apps/api/src/routes/v1/audit.ts:59` | Guard `GET /api/v1/audit/meta` |
| `apps/api/src/routes/v1/reports.ts:967` | Guard endpoint report admin |
| `apps/api/src/routes/v1/reports.ts:1038` | Guard endpoint report admin |

### 1.4 Call Site Inventory — `requirePermission` (103 pemanggilan, 20 route file)

| File | Jumlah |
|---|---|
| `procurement.ts` | 25 |
| `mandor.ts` | 16 |
| `change-orders.ts` | 9 |
| `cash.ts` | 7 |
| `reports.ts`, `rab.ts`, `finance.ts` | 5 masing-masing |
| `roles.ts`, `rab-schedule.ts`, `projects.ts` | 4 masing-masing |
| `documents.ts`, `clients.ts`, `milestones.ts` | 3 masing-masing |
| `users.ts`, `settings.ts`, `notifications.ts` | 2 masing-masing |
| `termin-payment.ts`, `contracts.ts`, `kasbons.ts` | 1 masing-masing |

**Observasi penting:** `kasbons.ts` — salah satu route paling finansial-kritis — hanya punya **1** pemanggilan `requirePermission`, mengandalkan 4 inline role-check untuk sisa logic otorisasinya (lihat 1.5). Ini adalah pola berulang: *proteksi top-level ada, tapi granularitas di dalam handler masih inline.*

### 1.5 Call Site Inventory — Inline `.role === 'x'` (57 kejadian, 11 file)

Kategorisasi wajib sebelum migrasi (lihat [01 — Permission Aware UI](../05-design-system-and-ui-ux-architecture.md#49-permission-aware-ui) untuk prinsip pembeda authorization-gate vs data-scoping):

| File | Jumlah | Authorization Gate | Data Scoping |
|---|---|---|---|
| `mandor.ts` | 16 | 8 (baris 179, 699, 702, 747, 750, 775, 778, 1277) | 8 (baris 22, 115, 144, 219, 244, 275, 359, 593, 599, 772, 921, 1234, 1431, 1628, 1708, 1782 — beberapa baris overlap kategori) |
| `search.ts` | 7 | 2 (baris 21, 154) | 5 |
| `finance.ts` | 4 | 3 (baris 273, 1186, 1238) | 1 |
| `projects.ts` | 4 | 1 (baris 123) | 3 |
| `kasbons.ts` | 4 | 0 | 4 |
| `cash.ts` | 3 | 2 (baris 94, 473) | 1 |
| `reports.ts` | 3 | 1 (baris 82) | 2 |
| `progress.ts` | 2 | 2 (baris 288, 292) | 0 |
| `users.ts` | 1 | 1 (baris 12) | 0 |
| `clients.ts` | 1 | 1 (baris 25) | 0 |
| `procurement.ts` | 1 | 0 | 1 |
| **Total** | **57 (approx, beberapa baris masuk 2 kategori)** | **~21** | **~36** |

**Implikasi migrasi:** ~21 baris authorization-gate adalah kandidat migrasi **wajib** ke `requirePermission` (mereka menyamar sebagai business logic tapi sebenarnya kontrol akses). ~36 baris data-scoping **boleh tetap inline** — mereka adalah query filter (mis. "mandor hanya lihat kasbon miliknya"), bukan celah keamanan, **asalkan** authorization gate di depannya sudah benar.

**Contoh authorization-gate yang menyamar (kandidat migrasi wajib):**
```ts
// apps/api/src/routes/v1/cash.ts:473
const autoApprove = currentUser.role === 'admin' || currentUser.role === 'pm'
```
Ini adalah keputusan otorisasi ("siapa boleh approve otomatis") yang hardcoded ke 2 nama role literal — persis pola yang RBAC v2 dirancang untuk menggantikan, tapi belum tersentuh.

---

## 2. RLS (Row Level Security) — Current State

**Status: 🔴 Sepenuhnya independen dan tidak sadar terhadap RBAC v2 — ini adalah temuan paling kritis di seluruh audit ini.**

### 2.1 Skala

- **50 statement** `ENABLE ROW LEVEL SECURITY` di seluruh migration (45 di `049_rls_policies.sql`, sisanya di `050_rbac_foundation.sql` untuk tabel `roles`/`permissions`/`role_permissions`).
- **67 total tabel** di database → **~17 tabel tanpa RLS sama sekali** (perlu enumerasi eksplisit sebelum implementasi — lihat [01-gap-analysis.md](01-gap-analysis.md)).
- **~110 statement** `CREATE POLICY` di `049_rls_policies.sql` (960 baris).

### 2.2 Helper Function — Sumber Kebenaran RLS

```sql
-- db/migrations/049_rls_policies.sql:12-28
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM users WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_id() ... -- baca users.id
CREATE OR REPLACE FUNCTION auth_client_id() ... -- baca clients.user_id → users.id
```

**Ketiganya membaca `users.role` (kolom string flat) atau relasi langsung — TIDAK SATU PUN membaca tabel `roles`/`permissions`/`role_permissions`.**

### 2.3 Pola Policy — Verbatim

```sql
-- Pola tipikal: literal string role, bukan lookup tabel
CREATE POLICY "kasbons_admin_pm"
  ON kasbons USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "invoices_client_select"
  ON invoices FOR SELECT
  USING (
    auth_role() = 'client'
    AND project_id IN (SELECT id FROM projects WHERE client_id = auth_client_id())
  );
```

**Grep eksplisit untuk `role_permissions` atau `get_role_permissions` di dalam `049_rls_policies.sql`: NOL hasil.** Ini bukan estimasi — ini dikonfirmasi langsung dari isi file.

### 2.4 Konsekuensi Konkret (bukan hipotetis)

Jika admin membuat role kustom kelima (mis. "supervisor") lewat `POST /api/v1/roles` hari ini:
1. API layer (`requirePermission`) akan berfungsi benar untuk role itu — karena baca dari `role_permissions`.
2. **RLS akan menolak SEMUA akses** untuk role itu di hampir semua tabel — karena tidak ada `CREATE POLICY` yang menyebut `'supervisor'`.
3. Karena API memakai `service_role` (bypass RLS — lihat 2.5), pengguna dengan role "supervisor" **kemungkinan besar tidak akan menyadari RLS gagal** — API tetap merespons normal. RLS baru gagal kalau ada jalur akses langsung ke database (anon key di frontend, tool BI masa depan, akses Supabase Dashboard).

### 2.5 API Bypass RLS — Konfirmasi

Backend memakai Supabase `service_role` key (`apps/api/src/utils/supabase.ts`, dikonfirmasi di audit sesi sebelumnya) — RLS **bukan** pertahanan utama untuk trafik API, ia adalah defense-in-depth untuk akses langsung ke database. Ini bukan cacat desain (pola valid di ekosistem Supabase), tapi berarti **kualitas `requirePermission` di setiap endpoint adalah satu-satunya garis pertahanan nyata** untuk trafik aplikasi.

---

## 3. Audit Trail — Current State

**Status: 🟡 Skema matang, instrumentasi write-path sangat kurang (gap terbesar kedua di seluruh audit ini).**

### 3.1 Skema (Migration 009 + 046)

```sql
-- migration 009 (baseline)
audit_logs (id, user_id, action, table_name, record_id,
            old_values JSONB, new_values JSONB,
            ip_address INET, user_agent TEXT, created_at)
-- 5 index: user_id, table_name, record_id, created_at, action

-- migration 046 (enhancement)
ALTER TABLE audit_logs ADD diff JSONB, severity TEXT DEFAULT 'info'
  CHECK (severity IN ('info','warning','critical'))
-- + view critical_audit_events, + index severity
```

**Kolom yang ADA:** `user_id, action, table_name, record_id, old_values, new_values, diff, severity, ip_address, user_agent, created_at`.

**Kolom yang TIDAK ADA (gap vs kebutuhan brief):** `correlation_id`, `workflow_id`, `reason`/`comment`.

### 3.2 Temuan Paling Kritis: Helper Function yang Direferensikan Tidak Ada

Komentar migration 046 (baris 43-46) secara eksplisit merujuk `apps/api/src/utils/audit.ts` sebagai helper terpusat yang dimaksudkan — **file ini tidak ada di codebase**, dikonfirmasi via pengecekan langsung.

### 3.3 Insersi Nyata ke `audit_logs` — Hanya 1 Titik di Seluruh Codebase

```ts
// apps/api/src/routes/v1/change-orders.ts:576-587 — SATU-SATUNYA INSERT
await supabase.from('audit_logs').insert({
  table_name: 'change_orders',
  record_id: id,
  action: 'change_order_approved',
  user_id: user.id,
  new_values: { co_number, old_contract_value, new_contract_value, total_amount_delta },
})
```

Tidak mengisi `ip_address`, `user_agent`, `diff`, atau `severity` — **padahal migration 046 sendiri mendaftar perubahan `contract.value` sebagai event WAJIB `severity: 'critical'`.**

### 3.4 Event "WAJIB" per Migration 046 yang TIDAK Terinstrumentasi

Migration 046 mendaftar event berikut sebagai mandatory-log: `invoice.amount`, `contract.value` (✅ sebagian, lihat 3.3), `payment.deleted`, `kasbon.status`, `user.role`, `project.status`, `rab_materials.override`. **Enam dari tujuh event ini tidak punya satu pun baris insert ke `audit_logs` di seluruh codebase.**

**Kesimpulan:** Desain audit trail (skema + intent) jauh lebih matang dari implementasi write-path. `apps/api/src/routes/v1/audit.ts` (71 baris) hanya berisi endpoint **read** (`GET /audit`, `GET /audit/meta`) — nol logic write.

---

## 4. Financial Test Suite — Current State

**Status: 🔴 Nol infrastruktur testing. Konfirmasi ulang, bukan asumsi.**

- Tidak ada `*.test.ts`, `*.spec.ts`, direktori `__tests__`, `vitest.config.*`, `jest.config.*`, `playwright.config.*` di `apps/api` atau `apps/web` (di luar `node_modules`).
- `apps/api/package.json` — tidak ada script `test` sama sekali.
- `apps/web/package.json` — hanya `dev/build/start/lint`.
- Tidak ada `.github/workflows` — nol CI yang bisa menjalankan test bahkan jika ada.

### 4.1 Enam File Finansial-Kritis (Prioritas Test Coverage)

| File | Baris | Logic Inti |
|---|---|---|
| `kasbons.ts` | 341 | Alur request/approval kasbon mandor, visibilitas role-scoped, trigger notifikasi |
| `termin-payment.ts` | 301 | Pencatatan pembayaran termin, **hitung pajak hardcoded** (lihat 6.1), update `amount_due` |
| `kurva-s.ts` | 388 | Kalkulasi EVM/S-curve — merge bobot RAB rencana (distribusi CDF normal) vs serapan aktual (kasbon+payment approved) vs progress fisik |
| `rab.ts` | 952 | Parse Excel RAB, deteksi struktur hierarkis (romawi/huruf sub-kategori), CRUD tree kategori/item |
| `progress.ts` | 379 | CRUD progress log dual-mode, aturan visibilitas/edit role-based, feed ke kurva-s |
| `finance.ts` | — | Invoice, payment recording lintas proyek |

**Retention/Retensi — sudah dimodelkan di skema, BUKAN gap murni:**
- `projects.retention_pct`/`retention_amount` (migration 003, default 5%, trigger `calc_retention_amount` di migration 010).
- `invoices.retensi_pct`/`retensi_amount` (migration 033).
- `termin_schedules` trigger type `on_retention` (migration 013).
- **Gap sesungguhnya:** tidak ada route file dedicated (`retention.ts`) — logic tersebar inline di `termin-payment.ts` dan `finance.ts`, sulit ditest secara terisolasi.

---

## 5. CI/CD & Observability — Current State

**Status: 🔴 Nol observability production-grade.**

- Tidak ada `.github/workflows` — konfirmasi ulang.
- `apps/api/package.json`: hanya `pino-pretty` (formatter dev, bukan sink logging). Tidak ada `winston`, `@sentry/node`, `@opentelemetry/*`, `prom-client`.
- `apps/web/package.json`: nol dependency observability.

### 5.1 Konfigurasi Logger Saat Ini (Verbatim)

```ts
// apps/api/src/index.ts:39-50
const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' }
    }
  }
})
```

**Masalah konkret:** Ini konfigurasi dev-oriented (output berwarna, human-readable) yang **akan tetap berjalan sama persis di production** — tidak ada environment branching, tidak ada structured JSON sink, tidak ada shipping ke log aggregator, tidak ada level eksplisit (default `info`).

- Global error handler (`index.ts:87-94`) log 5xx via `app.log.error(err)` — **tanpa correlation/request ID**.
- `/health` endpoint (baris 96-109) hanya enumerasi route group terdaftar — **tidak ada health check dependency** (konektivitas DB, dst).

---

## 6. Menu, Configuration, Workflow — Current State

### 6.1 Business Constants Hardcoded — Hasil Grep Eksplisit

| Konsep | File:Line | Nilai | Status |
|---|---|---|---|
| Tax rate PPN/PPh-final | `termin-payment.ts:175` | `const taxRate = project.tax_scheme === 'ppn' ? 0.11 : 0.02` | **Satu-satunya hardcoded numeric constant nyata** — bukan config table |
| Retention % default | `003_projects_and_contracts.sql:20` | `DEFAULT 5.00` | Schema-level default per-proyek (bukan konstanta aplikasi tunggal) |
| Valid tax scheme enum | `projects.ts:193` | `['pph_final', 'ppn']` | Hardcoded array, bukan tabel |

**Dicari tapi TIDAK DITEMUKAN (gap fitur, bukan hardcode yang bisa dimigrasikan):**
- Masa berlaku quotation/penawaran — tidak ada field/constant sama sekali.
- Approval limit berbasis nominal — `cash.ts:473` adalah **role-based**, bukan **amount-based**. Tidak ada threshold nominal apa pun di alur approval kasbon/expense.
- Payment terms (net-30, dsb) — tidak ada constant hari pembayaran.

**Implikasi penting:** Brief meminta "approval limits, payment terms, quotation validity" sebagai contoh yang harus jadi configurable — tapi ini **belum ada sebagai fitur sama sekali** hari ini, bukan hardcode yang tinggal dipindah. Migrasinya adalah *membangun fitur baru config-driven dari awal*, bukan *merefactor konstanta existing*. Ini beda kategori pekerjaan (lihat [01-gap-analysis.md](01-gap-analysis.md)).

### 6.2 Sidebar/Menu

`apps/web/components/sidebar.tsx` (530 baris) — menu adalah **JSX hardcoded dengan visibility permission-gated**:
```tsx
{perms.has("xxx:view") && (...)}  // perms dari localStorage, diisi dari get_role_permissions RPC
```
- Struktur/urutan/ikon/grouping menu: **fixed di kode**, bukan tabel.
- Blok menu utama: baris ~241-327 (nav) + ~330-374 (Pengaturan).
- `roleLabel` (baris 28-33): masih dict hardcoded 4-entri — role kustom akan fallback ke raw string, bukan `label` dari tabel `roles`.

**Titik terang:** visibility item menu **sudah** permission-driven (bukan role-driven) — separuh pekerjaan Menu Registry sudah tidak perlu dikerjakan ulang, hanya strukturnya yang perlu dipindah ke config table.

### 6.3 Workflow

**Tidak ada mekanisme workflow generik sama sekali.** Setiap alur approval (kasbon, change order, procurement MR/PO/GR) punya implementasi status-transition terpisah, hardcoded per file — dikonfirmasi di audit arsitektur sebelumnya ([01 — Dynamic Workflow Engine](../01-application-and-data-architecture.md#dynamic-workflow--approval-engine)), tidak berubah sejak saat itu.

---

## 7. Skala Database — Sanity Check

| Metrik | Nilai |
|---|---|
| Migration file | 57 |
| `CREATE TABLE` | 67 |
| File dengan `ENABLE ROW LEVEL SECURITY` | 2 (`049`, `050`) |
| Total statement `ENABLE ROW LEVEL SECURITY` | 50 |
| Total `CREATE INDEX` | 207 |
| Tabel **tanpa** RLS (estimasi) | ~17 — **perlu enumerasi eksplisit sebelum implementasi** |

---

## Ringkasan Status per Sub-Sistem

| Sub-Sistem | Status | Temuan Kunci |
|---|---|---|
| Permission Engine | ⚠️ Berisiko | 3 mekanisme paralel; 21 authorization-gate inline menyamar sebagai business logic |
| RLS | 🔴 Kritis | Nol kesadaran terhadap RBAC v2; role kustom akan gagal senyap di akses langsung DB |
| Audit Trail | 🟡 Sebagian | Skema matang, helper function yang direferensikan tidak ada, hanya 1 titik insert di seluruh codebase |
| Financial Test Suite | 🔴 Nol | Tidak ada infrastruktur test sama sekali |
| CI/CD | 🔴 Nol | Tidak ada `.github/workflows` |
| Observability | 🔴 Nol | Logger dev-config jalan apa adanya di production, tanpa correlation ID |
| Menu Registry | 🟡 Sebagian | Visibility sudah permission-driven; struktur masih hardcoded |
| Configuration Engine | 🔴 Nol (untuk approval limit/quotation validity) | Hanya 1 konstanta numerik nyata untuk dimigrasikan (tax rate); sisanya gap fitur baru |
| Workflow Engine | 🔴 Nol | Setiap modul re-implementasi status transition sendiri |

---

*Dokumen selanjutnya: [01 — Gap Analysis](01-gap-analysis.md) — menerjemahkan temuan di atas menjadi daftar gap terstruktur dengan prioritas.*
