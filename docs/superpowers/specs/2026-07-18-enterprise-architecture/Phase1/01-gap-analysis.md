# Phase 1 — 01. Gap Analysis

**Upstream:** Berdasarkan temuan [00 — Current State Audit](00-current-state-audit.md).
**Status:** Planning only.

---

## Cara Membaca Dokumen Ini

Setiap gap diklasifikasi dua sumbu:
- **Kategori:** `Refactor` (kode/data sudah ada, perlu dirapikan/dikonsolidasi) vs `Build` (fitur belum ada sama sekali, perlu dibangun dari nol)
- **Blast Radius jika Dibiarkan:** 🔴 Tinggi (risiko keamanan/finansial aktif) / 🟡 Sedang (utang teknis bertambah) / 🟢 Rendah (kualitas hidup)

Distingsi Refactor vs Build ini penting karena **effort estimation-nya beda kategori** — refactor punya baseline kode yang bisa diverifikasi, build murni butuh desain dari nol dengan risiko scope creep lebih tinggi.

---

## Gap 1 — Permission Engine: Tiga Mekanisme Paralel

**Kategori:** Refactor
**Blast Radius:** 🔴 Tinggi

**Deskripsi:** `requireRole` (4 lokasi), `requirePermission` (103 lokasi, sudah data-driven), dan inline `.role === 'x'` (57 lokasi, ~21 di antaranya authorization gate) hidup berdampingan tanpa sumber kebenaran tunggal.

**Kenapa ini gap, bukan sekadar "kurang rapi":** Role kustom yang dibuat lewat `/api/v1/roles` (fitur yang sudah berfungsi) akan mendapat behavior **tidak konsisten** — permission check via `requirePermission` bekerja benar, tapi 4 titik `requireRole` dan ~21 titik inline authorization-gate tidak mengenalinya sama sekali (hardcoded ke `'admin'`/`'pm'`/`'mandor'`/`'client'`).

**Definisi Selesai:**
- [ ] 4 pemanggilan `requireRole` dihapus, diganti `requirePermission` dengan key yang sesuai
- [ ] 21 baris authorization-gate inline yang teridentifikasi ([00 — bagian 1.5](00-current-state-audit.md#15-call-site-inventory--inline-role--x-57-kejadian-11-file)) dimigrasikan ke `requirePermission`
- [ ] 36 baris data-scoping inline **didokumentasikan eksplisit** (komentar kode) sebagai *data scoping, bukan authorization gate* — supaya tidak tertukar di refactor masa depan
- [ ] Fungsi `requireRole` dihapus total dari `auth.ts` setelah call site terakhir bermigrasi (mencegah regresi — kalau fungsinya masih ada, ada risiko dipakai lagi)

## Gap 2 — RLS Tidak Sinkron dengan RBAC v2

**Kategori:** Refactor (tapi berisiko tinggi karena menyentuh 50 `CREATE POLICY` sekaligus)
**Blast Radius:** 🔴 Tinggi — **ini gap tertinggi prioritas di seluruh Phase 1**

**Deskripsi:** Seluruh ~110 `CREATE POLICY` statement di `049_rls_policies.sql` memakai `auth_role() = '<literal>'`, nol yang membaca `role_permissions`. Dikonfirmasi via grep eksplisit — bukan estimasi.

**Definisi Selesai:**
- [ ] Desain skema baru: view atau function SQL yang menerjemahkan `(auth_user_id(), permission_key)` → boolean, membaca `role_permissions` (bukan literal role name)
- [ ] Setiap `CREATE POLICY` di 45 tabel migration 049 diaudit dan dipetakan ke permission key yang setara
- [ ] Migration baru (bukan edit migration 049 yang sudah di-apply — lihat [03-migration-strategy.md](03-migration-strategy.md)) yang menggantikan policy lama dengan versi permission-aware
- [ ] ~17 tabel tanpa RLS (dari [00 — bagian 7](00-current-state-audit.md#7-skala-database--sanity-check)) dienumerasi eksplisit dan diputuskan sadar: butuh RLS atau memang sengaja terbuka (mis. tabel referensi read-all)
- [ ] Test yang memverifikasi: role kustom baru otomatis mendapat RLS coverage yang benar tanpa perlu edit SQL manual

## Gap 3 — Audit Trail: Write-Path Tidak Terinstrumentasi

**Kategori:** Build (helper function) + Refactor (integrasi ke route existing)
**Blast Radius:** 🔴 Tinggi untuk compliance/forensik, 🟡 Sedang untuk operasional harian

**Deskripsi:** Skema audit trail matang (migration 009 + 046), tapi `apps/api/src/utils/audit.ts` yang dirujuk migration 046 **tidak ada**, dan hanya **1 dari 7** event "wajib" yang benar-benar tercatat (change order approval — itu pun tanpa `severity`/`ip_address`/`user_agent`).

**Definisi Selesai:**
- [ ] Bangun `apps/api/src/utils/audit.ts` — helper terpusat `logAuditEvent(entry)` dengan tanda tangan yang mencakup kolom existing (`table_name, record_id, action, old_values, new_values, diff, severity`) PLUS field baru (lihat Gap 4)
- [ ] Instrumentasi 6 event wajib yang belum tercatat: `invoice.amount`, `payment.deleted`, `kasbon.status`, `user.role`, `project.status`, `rab_materials.override`
- [ ] Update 1 titik existing (`change-orders.ts:576`) untuk memakai helper baru, isi `severity: 'critical'` sesuai spesifikasi migration 046
- [ ] `ip_address`/`user_agent` diambil otomatis dari Fastify request context di dalam helper (bukan manual per call site) — mencegah lupa isi di masa depan

## Gap 4 — Audit Trail: Kolom yang Diminta Brief Belum Ada di Skema

**Kategori:** Build
**Blast Radius:** 🟡 Sedang (nilai forensik jangka panjang, bukan risiko aktif)

**Deskripsi:** Brief meminta `correlation_id`, `workflow_id`, `reason` — ketiganya tidak ada di skema `audit_logs` hari ini.

**Definisi Selesai:**
- [ ] Migration baru: `ALTER TABLE audit_logs ADD COLUMN correlation_id UUID, ADD COLUMN workflow_id UUID NULL, ADD COLUMN reason TEXT NULL`
- [ ] `correlation_id` di-generate per-request (lihat [08-observability-plan.md](08-observability-plan.md) — berbagi mekanisme dengan request tracing, bukan sistem terpisah)
- [ ] `workflow_id` nullable — kolom ini **hanya terisi mulai Phase 1C** (Workflow Registry belum ada di Phase 1A/1B), tapi kolomnya disiapkan sekarang supaya tidak perlu migration lagi nanti
- [ ] `reason` opsional di level API — endpoint approval/reject yang sudah menerima catatan (kasbon, CO) meneruskannya ke audit log

## Gap 5 — Financial Test Suite: Nol Infrastruktur

**Kategori:** Build
**Blast Radius:** 🔴 Tinggi — ini adalah prasyarat keras untuk mengerjakan Gap 1, 2, dan 3 dengan aman

**Deskripsi:** Tidak ada test framework, tidak ada test file, tidak ada CI yang menjalankannya.

**Definisi Selesai:** Lihat detail lengkap di [06-test-strategy.md](06-test-strategy.md) — ringkasnya: setup Vitest, test untuk 6 file finansial-kritis ([00 — bagian 4.1](00-current-state-audit.md#41-enam-file-finansial-kritis-prioritas-test-coverage)), coverage minimum 90% untuk logic finansial murni (bukan seluruh codebase — lihat pembahasan realisme target di 06).

## Gap 6 — CI/CD: Nol Pipeline

**Kategori:** Build
**Blast Radius:** 🟡 Sedang — memperbesar risiko Gap 1/2/3 kalau dikerjakan tanpa jaring pengaman otomatis

**Deskripsi:** Tidak ada `.github/workflows`. Setiap perubahan (termasuk refactor RLS/permission yang berisiko tinggi) di-deploy tanpa gate otomatis.

**Definisi Selesai:**
- [ ] `.github/workflows/ci.yml` — jalankan lint + typecheck + test pada setiap PR
- [ ] Branch protection rule di GitHub — PR tidak bisa merge kalau CI merah (butuh akses repo settings, keputusan founder)

## Gap 7 — Observability: Logger Dev-Config di Production

**Kategori:** Refactor (config) + Build (structured logging, correlation ID)
**Blast Radius:** 🟡 Sedang hari ini, 🔴 Tinggi begitu ada trafik produksi nyata

**Deskripsi:** `pino-pretty` transport (colorized, human-readable) berjalan sama persis di semua environment. Tidak ada correlation ID, tidak ada structured JSON sink.

**Definisi Selesai:** Lihat [08-observability-plan.md](08-observability-plan.md) — mencakup environment-aware logger config, correlation ID middleware (dipakai bersama Gap 4), dan health check dependency di `/health`.

## Gap 8 — Menu Registry: Struktur Hardcoded

**Kategori:** Refactor (visibility sudah ada) + Build (struktur jadi data)
**Blast Radius:** 🟢 Rendah untuk L1, naik jadi 🟡 Sedang begitu L2 (multi-company) butuh menu berbeda per company

**Deskripsi:** `sidebar.tsx` (530 baris) — visibility item sudah permission-driven (poin terang), tapi struktur/urutan/ikon fixed di JSX.

**Definisi Selesai:** Sesuai [01 — Dynamic Menu & Dashboard Registry](../01-application-and-data-architecture.md#dynamic-menu--dashboard-registry) — tabel `menu_items`, refactor `sidebar.tsx` jadi renderer. **Catatan skala:** brief memasukkan ini ke "Phase 1B" — architecture repo utama menandainya `Later` (bukan blocker Phase 1A). Lihat [05-rollout-plan.md](05-rollout-plan.md) untuk keputusan urutan final.

## Gap 9 — Configuration Engine: Sebagian Besar adalah Gap Fitur, Bukan Hardcode

**Kategori:** Build (mayoritas) + Refactor (1 item: tax rate)
**Blast Radius:** 🟢 Rendah — belum ada insiden operasional yang disebabkan ini

**Deskripsi — koreksi penting terhadap asumsi brief:** Brief mencontohkan "approval limit, payment terms, quotation validity" sebagai business rule yang harus dipindah dari hardcode ke config. **Audit menemukan hal ini tidak hardcoded — fiturnya belum ada sama sekali** ([00 — bagian 6.1](00-current-state-audit.md#61-business-constants-hardcoded--hasil-grep-eksplisit)). Satu-satunya konstanta numerik nyata yang hardcoded adalah tax rate PPN/PPh-final di `termin-payment.ts:175`.

**Definisi Selesai:**
- [ ] Tax rate: pindahkan `0.11`/`0.02` ke tabel `company_settings` (atau perluasan `company_profile` existing) — ini refactor murni, effort rendah
- [ ] Approval limit berbasis nominal: **desain fitur baru** (belum ada), termasuk skema tabel `approval_limits` — effort lebih besar, dependency ke Gap 10 (Workflow Registry) karena approval limit paling bermakna sebagai bagian dari workflow engine, bukan berdiri sendiri
- [ ] Quotation validity: **fitur baru**, dependency ke modul Tender/Sales yang sendiri `Later` di [Module Catalog](../00-vision-and-business-architecture.md#module-catalog--tiering) — **direkomendasikan TIDAK masuk Phase 1** (lihat [05-rollout-plan.md](05-rollout-plan.md))
- [ ] Payment terms: fitur baru, prioritas rendah — tidak ada sinyal kebutuhan operasional saat ini

## Gap 10 — Workflow Registry: Nol Engine Generik

**Kategori:** Build
**Blast Radius:** 🟡 Sedang — tiga modul (kasbon, CO, procurement) terus menduplikasi logic transisi status secara independen, makin mahal dipelihara seiring modul bertambah

**Deskripsi:** Tidak berubah dari [01 — Dynamic Workflow & Approval Engine](../01-application-and-data-architecture.md#dynamic-workflow--approval-engine) — masih gap penuh.

**Definisi Selesai:** Detail skema (`workflow_definitions`/`states`/`transitions`) sudah didesain di architecture repo utama. Untuk Phase 1C: tambahkan **Approval Engine, SLA Engine, Escalation Engine, Delegation Engine** sebagai lapisan di atas skema dasar itu — detail di [02-target-architecture.md](02-target-architecture.md).

---

## Ringkasan Prioritas (Diurutkan Berdasar Blast Radius × Ketergantungan)

| # | Gap | Kategori | Blast Radius | Prasyarat untuk Gap Lain? |
|---|---|---|---|---|
| 5 | Financial Test Suite | Build | 🔴 | **Ya — prasyarat Gap 1, 2, 3** |
| 1 | Permission Engine konsolidasi | Refactor | 🔴 | Prasyarat Gap 2 |
| 2 | RLS sinkron RBAC v2 | Refactor | 🔴 | Bergantung Gap 1 selesai dulu |
| 3 | Audit write-path | Build+Refactor | 🔴 | Independen, bisa paralel |
| 4 | Audit kolom baru | Build | 🟡 | Bagian dari Gap 3 |
| 6 | CI/CD | Build | 🟡 | Memperkuat keamanan Gap 1/2 |
| 7 | Observability | Refactor+Build | 🟡→🔴 | Independen |
| 9 | Configuration Engine (tax rate) | Refactor | 🟢 | Independen, effort rendah |
| 8 | Menu Registry | Refactor+Build | 🟢→🟡 | Independen, tidak urgent |
| 10 | Workflow Registry | Build | 🟡 | Besar, sebaiknya sub-fase terpisah (1C) |

---

*Dokumen selanjutnya: [02 — Target Architecture](02-target-architecture.md) — desain teknis untuk menutup setiap gap di atas.*
