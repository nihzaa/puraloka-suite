# Admin SaaS — Fondasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun fondasi Admin SaaS — migrasi database lengkap (semua tabel §4 spec) di `puraloka-suite`, skeleton repo Next.js baru `admin-saas`, auth+RBAC internal, dan menu Tenants dasar (list, detail, provisioning dengan urutan gagal-aman) — cukup untuk staf vendor login dan men-provision tenant baru secara nyata.

**Architecture:** Migrasi Postgres ditulis & dinomori di `puraloka-suite/db/migrations/` (satu-satunya pemilik DDL, dimulai dari nomor 469). Repo `admin-saas` baru di `E:\Project\admin-saas` — Next.js 16 App Router full-stack, terhubung ke database Supabase YANG SAMA lewat `service_role` (bypass RLS total), auth Supabase project yang sama tapi digerbangi tabel `admin_saas_users` (terpisah total dari `company_members` tenant). Provisioning tenant memakai pola dua-transaksi dari spec §5.1a (transaksi Postgres tunggal untuk `companies`+`subscriptions`+`company_saas_meta`+role instantiation, lalu langkah idempoten terpisah untuk `auth.users`+`company_members`).

**Tech Stack:** PostgreSQL 17 (Supabase), Next.js 16.2.12 (App Router), React 19.2.4, TypeScript, `@supabase/supabase-js` ^2.107.0, Tailwind CSS v4, Vitest (integration test terhadap Postgres nyata — bukan mock, mengikuti konvensi `puraloka-suite`).

**Spec:** `docs/superpowers/specs/2026-08-22-admin-saas-platform-design.md`

## Global Constraints

- Semua nominal uang `NUMERIC`, semua waktu `TIMESTAMPTZ` — nol `float`, nol `timestamp without time zone` (spec §4, CLAUDE.md §5.4).
- Migrasi ADDITIVE murni, idempoten (`IF NOT EXISTS`/`ON CONFLICT`), dengan blok verifikasi `DO $$ ... RAISE EXCEPTION` di akhir — pola migrasi 468, bukan opsional.
- `admin-saas` TIDAK PERNAH menulis DDL — semua `ALTER TABLE`/`CREATE TABLE` lewat migrasi bernomor di `puraloka-suite/db/migrations/` (spec §3).
- Kode admin-saas HANYA membaca `admin_saas_users`+`admin_saas_role_permissions` untuk keputusan otorisasi — TIDAK PERNAH membaca `company_members`/`roles` tenant di jalur yang sama (spec §4.4, batas §1 poin 2).
- Setiap endpoint aksi berisiko (suspend, override kuota, ubah plan, provisioning) memvalidasi `company.code`/`name` yang dikirim balik client cocok dengan `company_id` target, dan memakai `UPDATE ... WHERE status_lama = ?` untuk mencegah race antar-staf (spec §5.1b).
- `saas_invoices.currency` dikunci `CHECK (currency = 'IDR')` — proyek ini IDR-only by design.
- Commit sering, per task selesai satu unit kerja yang bisa diuji sendiri.

---

## Bagian A — Migrasi Database (di `puraloka-suite`)

### Task A1: Migrasi 469 — `plans`, `plan_features`, `plan_feature_values`, `tenant_feature_overrides`

**Files:**
- Create: `db/migrations/469_admin_saas_plans_feature_flags.sql`
- Test: manual via `node scripts/db/introspect.mjs tables` (tidak ada Vitest untuk migrasi mentah — konvensi proyek ini memverifikasi lewat blok `DO $$` di migrasi itu sendiri, dan lewat `ledger-diff.mjs`)

**Interfaces:**
- Produces: tabel `plans(id, code, name, description, price_monthly, price_yearly, is_active, is_public, sort_order, created_at, updated_at)`, `plan_features(id, key, label, description, value_type)`, `plan_feature_values(id, plan_id, feature_id, value_boolean, value_integer, value_text)`, `tenant_feature_overrides(id, company_id, feature_id, value_boolean, value_integer, value_text, reason, created_by, created_at, expires_at)`. Trigger `chk_value_matches_type` pada kedua tabel value.

- [ ] **Step 1: Tulis migrasi dengan tabel + trigger validasi value_type**

```sql
-- ============================================================================
-- 469 — ADMIN SAAS: plans, plan_features, plan_feature_values, tenant_feature_overrides
-- ============================================================================
--
-- Spec: docs/superpowers/specs/2026-08-22-admin-saas-platform-design.md §4.1
--
-- Key-value (bukan kolom tetap di plans) supaya fitur baru (AI on/off, kuota,
-- dst) dikonfigurasi dari admin-saas tanpa ALTER TABLE — persis filosofi
-- ai_provider_config (250_ai_provider_dan_biaya.sql).
--
-- value_type ditegakkan lewat TRIGGER, bukan CHECK biasa (CHECK harus
-- immutable per-baris, tak bisa subquery ke plan_features).
-- ============================================================================

CREATE TABLE IF NOT EXISTS plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT,
  price_monthly  NUMERIC,
  price_yearly   NUMERIC,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  is_public      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT NOT NULL DEFAULT 100,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE plans IS
  'Paket langganan SaaS vendor→tenant. is_public=false: plan custom/enterprise, '
  'tak muncul di self-serve. Terpisah dari billing tenant sendiri (invoices).';

CREATE TABLE IF NOT EXISTS plan_features (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,
  description  TEXT,
  value_type   TEXT NOT NULL CHECK (value_type IN ('boolean','integer','text'))
);

COMMENT ON TABLE plan_features IS
  'Katalog kapabilitas yang bisa di-toggle per plan (mis. ai_enabled, '
  'ai_monthly_quota, max_users). value_type menentukan kolom mana yang '
  'otoritatif di plan_feature_values/tenant_feature_overrides.';

CREATE TABLE IF NOT EXISTS plan_feature_values (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_id     UUID NOT NULL REFERENCES plan_features(id) ON DELETE CASCADE,
  value_boolean  BOOLEAN,
  value_integer  INTEGER,
  value_text     TEXT,
  CONSTRAINT plan_feature_values_unique UNIQUE (plan_id, feature_id)
);

CREATE TABLE IF NOT EXISTS tenant_feature_overrides (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_id     UUID NOT NULL REFERENCES plan_features(id) ON DELETE CASCADE,
  value_boolean  BOOLEAN,
  value_integer  INTEGER,
  value_text     TEXT,
  reason         TEXT NOT NULL,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ,
  CONSTRAINT tenant_feature_overrides_unique UNIQUE (company_id, feature_id)
);

COMMENT ON COLUMN tenant_feature_overrides.reason IS
  'WAJIB diisi — override tanpa alasan tercatat adalah keputusan uang/akses '
  'tak terlacak (spec §4.1).';

-- ── Trigger validasi value_type — berlaku di KEDUA tabel value ─────────────
CREATE OR REPLACE FUNCTION fn_cek_value_matches_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT value_type INTO v_type FROM plan_features WHERE id = NEW.feature_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'fn_cek_value_matches_type: feature_id % tidak ditemukan di plan_features', NEW.feature_id;
  END IF;

  IF v_type = 'boolean' AND (NEW.value_integer IS NOT NULL OR NEW.value_text IS NOT NULL) THEN
    RAISE EXCEPTION 'fn_cek_value_matches_type: feature bertipe boolean tapi value_integer/value_text terisi';
  ELSIF v_type = 'integer' AND (NEW.value_boolean IS NOT NULL OR NEW.value_text IS NOT NULL) THEN
    RAISE EXCEPTION 'fn_cek_value_matches_type: feature bertipe integer tapi value_boolean/value_text terisi';
  ELSIF v_type = 'text' AND (NEW.value_boolean IS NOT NULL OR NEW.value_integer IS NOT NULL) THEN
    RAISE EXCEPTION 'fn_cek_value_matches_type: feature bertipe text tapi value_boolean/value_integer terisi';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cek_value_type_plan ON plan_feature_values;
CREATE TRIGGER trg_cek_value_type_plan
  BEFORE INSERT OR UPDATE ON plan_feature_values
  FOR EACH ROW EXECUTE FUNCTION fn_cek_value_matches_type();

DROP TRIGGER IF EXISTS trg_cek_value_type_override ON tenant_feature_overrides;
CREATE TRIGGER trg_cek_value_type_override
  BEFORE INSERT OR UPDATE ON tenant_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION fn_cek_value_matches_type();

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN
     ('plans','plan_features','plan_feature_values','tenant_feature_overrides');
  IF n <> 4 THEN
    RAISE EXCEPTION '469 gagal: hanya % dari 4 tabel yang tercipta', n;
  END IF;

  SELECT count(*) INTO n FROM pg_trigger WHERE tgname = 'trg_cek_value_type_plan';
  IF n <> 1 THEN
    RAISE EXCEPTION '469 gagal: trigger trg_cek_value_type_plan tidak terpasang';
  END IF;

  SELECT count(*) INTO n FROM pg_trigger WHERE tgname = 'trg_cek_value_type_override';
  IF n <> 1 THEN
    RAISE EXCEPTION '469 gagal: trigger trg_cek_value_type_override tidak terpasang';
  END IF;

  RAISE NOTICE '469 OK: 4 tabel + 2 trigger validasi value_type terpasang';
END $$;
```

- [ ] **Step 2: Jalankan migrasi terhadap database Supabase**

Run: `cd e:/Project/puraloka-suite && node scripts/db/introspect.mjs identity` (pastikan koneksi benar dulu), lalu terapkan migrasi lewat jalur yang sudah ada di proyek ini untuk menjalankan file SQL baru (lihat `scripts/db/` untuk runner migrasi, atau psql langsung ke `DIRECT_URL`).
Expected: `NOTICE: 469 OK: 4 tabel + 2 trigger validasi value_type terpasang` muncul di output, tanpa `EXCEPTION`.

- [ ] **Step 3: Buktikan trigger validasi benar-benar menolak mismatch (mutasi sengaja)**

Run manual via psql/Supabase SQL editor:
```sql
INSERT INTO plan_features (key, label, value_type) VALUES ('test_bool', 'Test', 'boolean');
INSERT INTO plans (code, name) VALUES ('test-plan', 'Test Plan');
INSERT INTO plan_feature_values (plan_id, feature_id, value_integer)
  SELECT p.id, f.id, 5 FROM plans p, plan_features f
   WHERE p.code = 'test-plan' AND f.key = 'test_bool';
```
Expected: GAGAL dengan pesan `feature bertipe boolean tapi value_integer/value_text terisi`. Kalau ini LULUS (tidak error), trigger-nya cacat — perbaiki sebelum lanjut. Setelah terbukti menolak, bersihkan data uji:
```sql
DELETE FROM plans WHERE code = 'test-plan';
DELETE FROM plan_features WHERE key = 'test_bool';
```

- [ ] **Step 4: Verifikasi via introspect.mjs**

Run: `node scripts/db/introspect.mjs tables | grep -E "plans|plan_features|plan_feature_values|tenant_feature_overrides"`
Expected: keempat tabel muncul.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/469_admin_saas_plans_feature_flags.sql
git commit -m "feat(db): tambah tabel plans/plan_features/plan_feature_values/tenant_feature_overrides untuk Admin SaaS"
```

---

### Task A2: Migrasi 470 — `subscriptions`, `tenant_usage_counters`

**Files:**
- Create: `db/migrations/470_admin_saas_subscriptions_usage.sql`

**Interfaces:**
- Consumes: `plans(id)`, `companies(id)`, `plan_features(key)` dari Task A1 dan skema existing.
- Produces: `subscriptions(id, company_id, plan_id, status, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, canceled_at, created_at, updated_at)`, `tenant_usage_counters(company_id, feature_key, period_start, period_end, used_count, updated_at)`.

- [ ] **Step 1: Tulis migrasi**

```sql
-- ============================================================================
-- 470 — ADMIN SAAS: subscriptions, tenant_usage_counters
-- ============================================================================
--
-- Spec §4.1. status HANYA soal billing (trialing/active/past_due/canceled) —
-- suspensi hidup di company_saas_meta.lifecycle_status (migrasi 471), BUKAN
-- di kolom ini. Dua kolom yang bisa menjawab "apakah tenant diblokir" adalah
-- anti-pattern yang eksplisit ditolak di spec (dua sumber kebenaran).
--
-- tenant_usage_counters.feature_key TEXT (bukan feature_id UUID) SENGAJA —
-- baris ini paling sering ditulis kode enforcement kuota (hot path), dan
-- konstanta string langsung lebih murah daripada join demi UUID di titik
-- yang paling sering dieksekusi. plan_features.key tetap UNIQUE, FK sah.
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan_id                UUID REFERENCES plans(id),
  status                 TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','canceled')),
  trial_ends_at          TIMESTAMPTZ,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT false,
  canceled_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN subscriptions.status IS
  'HANYA status billing. Suspensi akses hidup di company_saas_meta.lifecycle_status '
  '(migrasi 471) — jangan tambah nilai suspended di sini (spec §4.1).';

CREATE TABLE IF NOT EXISTS tenant_usage_counters (
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL REFERENCES plan_features(key),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  used_count    INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, feature_key, period_start)
);

COMMENT ON TABLE tenant_usage_counters IS
  'Kuota TERPAKAI, terpisah dari definisi kuota (plan_feature_values). '
  'period_start bagian primary key: periode baru = baris kosong otomatis, '
  'tak ada job reset yang bisa gagal senyap (spec §4.1).';

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('subscriptions','tenant_usage_counters');
  IF n <> 2 THEN
    RAISE EXCEPTION '470 gagal: hanya % dari 2 tabel yang tercipta', n;
  END IF;

  -- status TIDAK BOLEH memuat 'suspended' — pastikan CHECK constraint benar.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname LIKE '%subscriptions_status_check%'
       AND pg_get_constraintdef(oid) ILIKE '%suspended%'
  ) THEN
    RAISE EXCEPTION '470 gagal: subscriptions.status memuat suspended — itu milik company_saas_meta';
  END IF;

  RAISE NOTICE '470 OK: 2 tabel terpasang, status TANPA nilai suspended';
END $$;
```

- [ ] **Step 2: Jalankan migrasi**

Run: terapkan `470_admin_saas_subscriptions_usage.sql` lewat runner migrasi proyek.
Expected: `NOTICE: 470 OK...` tanpa exception.

- [ ] **Step 3: Verifikasi via introspect.mjs**

Run: `node scripts/db/introspect.mjs tables | grep -E "subscriptions|tenant_usage_counters"`
Expected: kedua tabel muncul.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/470_admin_saas_subscriptions_usage.sql
git commit -m "feat(db): tambah tabel subscriptions/tenant_usage_counters untuk Admin SaaS"
```

---

### Task A3: Migrasi 471 — `company_saas_meta`

**Files:**
- Create: `db/migrations/471_admin_saas_company_meta.sql`

**Interfaces:**
- Consumes: `companies(id)` existing.
- Produces: `company_saas_meta(company_id, lifecycle_status, access_mode, suspended_reason, suspended_at, suspended_by, scheduled_deletion_at, onboarding_completed_at, created_at, updated_at)`.

- [ ] **Step 1: Tulis migrasi**

```sql
-- ============================================================================
-- 471 — ADMIN SAAS: company_saas_meta (status vendor-side satelit companies)
-- ============================================================================
--
-- Spec §4.2. Satelit, BUKAN ALTER TABLE companies — companies.is_active sudah
-- berarti sesuatu bagi tenant admin sendiri, jangan tumpang tindih maknanya.
--
-- access_mode terpisah dari lifecycle_status: suspended+read_only (masa
-- tenggang, tenant TETAP bisa bayar sendiri) vs suspended+blocked (setelah
-- tenggang habis/pelanggaran ToS). read_only TIDAK PERNAH berarti blokir
-- halaman billing tenant sendiri — itu keputusan mengikat di spec §4.2.
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_saas_meta (
  company_id              UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  lifecycle_status        TEXT NOT NULL DEFAULT 'provisioning'
                           CHECK (lifecycle_status IN ('provisioning','active','suspended','canceled')),
  access_mode             TEXT NOT NULL DEFAULT 'full'
                           CHECK (access_mode IN ('full','read_only','blocked')),
  suspended_reason        TEXT,
  suspended_at            TIMESTAMPTZ,
  suspended_by            UUID,
  scheduled_deletion_at   TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN company_saas_meta.lifecycle_status IS
  'provisioning yang bertahan >beberapa menit = sinyal gagal-tengah-jalan '
  '(spec §5.1a), bukan status transisi normal.';
COMMENT ON COLUMN company_saas_meta.access_mode IS
  'read_only memblokir OPERASI BISNIS tenant (PO/approval/invoice baru), '
  'BUKAN halaman langganan/billing tenant sendiri — itu wajib tetap penuh '
  'kecuali access_mode=blocked (spec §4.2).';
COMMENT ON COLUMN company_saas_meta.scheduled_deletion_at IS
  'Diisi 90 hari setelah canceled (bukan 30 — data proyek/kontrak konstruksi '
  'punya relevansi legal jangka panjang). Job hard-delete TIDAK dibangun di '
  'sini — itu G-2/destructive, butuh spec+ratifikasi tersendiri.';

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'company_saas_meta';
  IF n <> 1 THEN
    RAISE EXCEPTION '471 gagal: tabel company_saas_meta tidak tercipta';
  END IF;

  RAISE NOTICE '471 OK: company_saas_meta terpasang';
END $$;
```

- [ ] **Step 2: Jalankan migrasi**

Expected: `NOTICE: 471 OK...`.

- [ ] **Step 3: Verifikasi**

Run: `node scripts/db/introspect.mjs tables | grep company_saas_meta`
Expected: muncul.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/471_admin_saas_company_meta.sql
git commit -m "feat(db): tambah tabel company_saas_meta untuk Admin SaaS"
```

---

### Task A4: Migrasi 472 — `saas_invoices`, `saas_invoice_line_items`

**Files:**
- Create: `db/migrations/472_admin_saas_invoices.sql`

**Interfaces:**
- Consumes: `companies(id)`, `subscriptions(id)` dari Task A2.
- Produces: `saas_invoices(id, company_id, subscription_id, invoice_number, period_start, period_end, amount, currency, status, due_date, paid_at, payment_reference, created_at, updated_at)`, `saas_invoice_line_items(id, invoice_id, description, amount)`.

- [ ] **Step 1: Tulis migrasi**

```sql
-- ============================================================================
-- 472 — ADMIN SAAS: saas_invoices, saas_invoice_line_items
-- ============================================================================
--
-- Spec §4.3. Tabel BARU, bukan reuse invoices/invoice_line_items existing —
-- itu AR tenant→klien konstruksi (project_id, termin_schedule_id). Mencampur
-- tagihan VENDOR→TENANT ke situ akan mengotori laporan finansial tenant
-- dengan baris yang bukan uang proyek mereka — kesalahan kategori.
--
-- ON DELETE SET NULL (bukan CASCADE) ke companies/subscriptions: riwayat
-- tagihan vendor adalah dokumen keuangan vendor sendiri (pembukuan/pajak),
-- tak boleh ikut lenyap saat job hard-delete tenant 90-hari jalan nanti.
--
-- currency dikunci CHECK ='IDR' — proyek ini IDR-only by design
-- (KEPUTUSAN-SCOPE-ERP-AI.md), bukan longgar untuk ekspansi yang belum
-- diputuskan.
-- ============================================================================

CREATE TABLE IF NOT EXISTS saas_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID REFERENCES companies(id) ON DELETE SET NULL,
  subscription_id    UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  invoice_number     TEXT NOT NULL UNIQUE,
  period_start       DATE,
  period_end         DATE,
  amount             NUMERIC NOT NULL CHECK (amount >= 0),
  currency           TEXT NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  status             TEXT NOT NULL CHECK (status IN ('draft','sent','paid','overdue','void')),
  due_date           DATE,
  paid_at            TIMESTAMPTZ,
  payment_reference  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_invoice_line_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES saas_invoices(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  amount       NUMERIC NOT NULL
);

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
  v_fk_delete_rule TEXT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('saas_invoices','saas_invoice_line_items');
  IF n <> 2 THEN
    RAISE EXCEPTION '472 gagal: hanya % dari 2 tabel yang tercipta', n;
  END IF;

  -- company_id FK WAJIB ON DELETE SET NULL, bukan CASCADE.
  SELECT confdeltype INTO v_fk_delete_rule
    FROM pg_constraint
   WHERE conrelid = 'saas_invoices'::regclass
     AND confrelid = 'companies'::regclass;
  IF v_fk_delete_rule <> 'n' THEN  -- 'n' = SET NULL, 'c' = CASCADE
    RAISE EXCEPTION '472 gagal: FK saas_invoices.company_id bukan ON DELETE SET NULL (rule=%)', v_fk_delete_rule;
  END IF;

  RAISE NOTICE '472 OK: 2 tabel terpasang, FK company_id = SET NULL (bukan CASCADE)';
END $$;
```

- [ ] **Step 2: Jalankan migrasi**

Expected: `NOTICE: 472 OK...`.

- [ ] **Step 3: Buktikan SET NULL bekerja (mutasi sengaja)**

```sql
INSERT INTO companies (code, name) VALUES ('test-472', 'Test 472') RETURNING id;
-- catat id di atas sebagai <test_company_id>
INSERT INTO saas_invoices (company_id, invoice_number, amount, status)
  VALUES ('<test_company_id>', 'TEST-472-001', 100000, 'paid');
-- companies punya trigger fn_company_no_casual_delete yang MENOLAK DELETE —
-- verifikasi FK rule sudah cukup dibuktikan lewat pg_constraint di Step 1,
-- tidak perlu DELETE sungguhan (companies memang sengaja tak bisa dihapus
-- kasual, migrasi 126). Bersihkan data uji:
DELETE FROM saas_invoices WHERE invoice_number = 'TEST-472-001';
UPDATE companies SET is_active = false WHERE code = 'test-472';
```
Expected: INSERT berhasil, pembersihan berhasil. (Verifikasi FK rule sesungguhnya sudah terbukti lewat `pg_constraint.confdeltype` di blok verifikasi migrasi — DELETE sungguhan terhadap `companies` tidak mungkin dilakukan karena trigger anti-hapus-kasual yang sudah ada, jadi pembuktian di sini cukup sampai memastikan baris bisa dibuat & FK-nya valid.)

- [ ] **Step 4: Commit**

```bash
git add db/migrations/472_admin_saas_invoices.sql
git commit -m "feat(db): tambah tabel saas_invoices/saas_invoice_line_items untuk Admin SaaS"
```

---

### Task A5: Migrasi 473 — `admin_saas_users`, `admin_saas_roles`, `admin_saas_permissions`, `admin_saas_role_permissions`, `admin_saas_audit_log` + seed lengkap

**Files:**
- Create: `db/migrations/473_admin_saas_auth_rbac.sql`

**Interfaces:**
- Produces: `admin_saas_users(id, auth_user_id, email, full_name, role_id, is_active, created_at, updated_at)`, `admin_saas_roles(id, name, label, is_builtin)`, `admin_saas_permissions(id, key, label)`, `admin_saas_role_permissions(role_id, permission_id)`, `admin_saas_audit_log(id, admin_user_id, action, target_type, target_id, old_values, new_values, reason, ip_address, created_at)`. Seed 4 role (`super_admin`, `billing_ops`, `support`, `sales`) + 13 permission dari matrix spec §5.8.

- [ ] **Step 1: Tulis migrasi dengan tabel + seed lengkap sesuai matrix §5.8**

```sql
-- ============================================================================
-- 473 — ADMIN SAAS: auth & RBAC internal (terpisah TOTAL dari roles/permissions tenant)
-- ============================================================================
--
-- Spec §4.4 + matrix permission §5.8. Staf admin-saas bukan anggota company
-- manapun — pertanyaannya "siapa di TIM VENDOR boleh apa lintas semua
-- tenant", beda dari roles/permissions tenant ("siapa boleh apa DI company X").
--
-- auth_user_id TANPA FK formal ke auth.users — lintas skema auth/public,
-- pola sama dengan users.id existing (Supabase auth.users di skema terpisah).
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_saas_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  is_builtin  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_saas_permissions (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key    TEXT NOT NULL UNIQUE,
  label  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_saas_role_permissions (
  role_id        UUID NOT NULL REFERENCES admin_saas_roles(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES admin_saas_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS admin_saas_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  role_id       UUID NOT NULL REFERENCES admin_saas_roles(id),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN admin_saas_users.auth_user_id IS
  'FK ke auth.users (Supabase project SAMA dgn puraloka-suite), TANPA FK '
  'formal lintas skema. Satu auth_user_id BISA punya baris company_members '
  '(tenant) DAN admin_saas_users (vendor) sekaligus — SAH, dua konteks '
  'otorisasi independen (spec §4.4).';

CREATE TABLE IF NOT EXISTS admin_saas_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID NOT NULL REFERENCES admin_saas_users(id),
  action          TEXT NOT NULL,
  target_type     TEXT NOT NULL,
  target_id       UUID,
  old_values      JSONB,
  new_values      JSONB,
  reason          TEXT,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE admin_saas_audit_log IS
  'TERPISAH dari audit_logs tenant (Ember [C] milik puraloka-suite). Aksi '
  'staf admin-saas (suspend, override kuota, impersonate) butuh jejak '
  'sendiri FK ke admin_saas_users, bukan menumpang tabel governance repo '
  'lain (spec §4.4).';

-- ── Seed: 4 role bawaan ─────────────────────────────────────────────────────
INSERT INTO admin_saas_roles (name, label, is_builtin) VALUES
  ('super_admin', 'Super Admin', true),
  ('billing_ops',  'Billing Ops', true),
  ('support',      'Support',     true),
  ('sales',        'Sales',       true)
ON CONFLICT (name) DO NOTHING;

-- ── Seed: 13 permission dari matrix spec §5.8 ──────────────────────────────
INSERT INTO admin_saas_permissions (key, label) VALUES
  ('tenants:view',              'Lihat Tenant'),
  ('tenants:manage',            'Kelola Tenant (edit, provisioning)'),
  ('tenants:suspend',           'Suspend/Reaktivasi Tenant'),
  ('billing:view',              'Lihat Billing'),
  ('billing:manage',            'Kelola Billing (ubah plan, kredit, invoice)'),
  ('plans:manage',              'Kelola Plan & Feature Flags'),
  ('feature_overrides:manage',  'Kelola Override Fitur per-Tenant'),
  ('usage:view',                'Lihat Pemakaian Kuota'),
  ('marketing_content:manage',  'Kelola Konten Marketing'),
  ('support:view',              'Lihat Tiket Support'),
  ('support:manage',            'Kelola Tiket Support'),
  ('audit:view',                'Lihat Audit Log'),
  ('team:manage',                'Kelola Tim Admin SaaS'),
  ('impersonate',               'Login As Tenant (Impersonation)')
ON CONFLICT (key) DO NOTHING;

-- ── Seed: matrix role x permission (spec §5.8, super_admin dapat SEMUA) ────
INSERT INTO admin_saas_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_saas_roles r CROSS JOIN admin_saas_permissions p
 WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO admin_saas_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_saas_roles r JOIN admin_saas_permissions p
  ON p.key IN ('tenants:view','billing:view','billing:manage','plans:manage',
               'feature_overrides:manage','usage:view','audit:view')
 WHERE r.name = 'billing_ops'
ON CONFLICT DO NOTHING;

INSERT INTO admin_saas_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_saas_roles r JOIN admin_saas_permissions p
  ON p.key IN ('tenants:view','billing:view','usage:view',
               'support:view','support:manage','audit:view')
 WHERE r.name = 'support'
ON CONFLICT DO NOTHING;

INSERT INTO admin_saas_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_saas_roles r JOIN admin_saas_permissions p
  ON p.key IN ('tenants:view','usage:view','marketing_content:manage')
 WHERE r.name = 'sales'
ON CONFLICT DO NOTHING;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN
     ('admin_saas_roles','admin_saas_permissions','admin_saas_role_permissions',
      'admin_saas_users','admin_saas_audit_log');
  IF n <> 5 THEN
    RAISE EXCEPTION '473 gagal: hanya % dari 5 tabel yang tercipta', n;
  END IF;

  SELECT count(*) INTO n FROM admin_saas_roles WHERE is_builtin;
  IF n <> 4 THEN
    RAISE EXCEPTION '473 gagal: role bawaan ada % baris, harus 4', n;
  END IF;

  SELECT count(*) INTO n FROM admin_saas_permissions;
  IF n <> 14 THEN
    RAISE EXCEPTION '473 gagal: permission ada % baris, harus 14', n;
  END IF;

  SELECT count(*) INTO n FROM admin_saas_role_permissions rp
    JOIN admin_saas_roles r ON r.id = rp.role_id WHERE r.name = 'super_admin';
  IF n <> 14 THEN
    RAISE EXCEPTION '473 gagal: super_admin punya % permission, harus 14 (semua)', n;
  END IF;

  RAISE NOTICE '473 OK: 5 tabel + 4 role + 14 permission + matrix role_permissions terpasang';
END $$;
```

- [ ] **Step 2: Jalankan migrasi**

Expected: `NOTICE: 473 OK...`.

- [ ] **Step 3: Verifikasi via introspect.mjs**

Run: `node scripts/db/introspect.mjs tables | grep admin_saas`
Expected: 5 tabel muncul.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/473_admin_saas_auth_rbac.sql
git commit -m "feat(db): tambah auth+RBAC internal Admin SaaS (5 tabel, 4 role, 14 permission)"
```

---

### Task A6: Migrasi 474 — Marketing content (`marketing_pages`, `marketing_sections`, `marketing_pricing_plans`, `marketing_testimonials`, `marketing_faqs`)

**Files:**
- Create: `db/migrations/474_admin_saas_marketing_content.sql`

**Interfaces:**
- Consumes: `plans(id)` dari Task A1.
- Produces: 5 tabel sesuai spec §4.5.

- [ ] **Step 1: Tulis migrasi**

```sql
-- ============================================================================
-- 474 — ADMIN SAAS: marketing content (backing untuk kontrak API publik)
-- ============================================================================
--
-- Spec §4.5. content JSONB polymorphic di marketing_sections — jumlah
-- section_type kecil (6 jenis), bentuknya murni tampilan, validasi bentuk
-- JSON per tipe dilakukan app-layer admin-saas, bukan DB.
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  meta_description  TEXT,
  is_published      BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       UUID NOT NULL REFERENCES marketing_pages(id) ON DELETE CASCADE,
  section_type  TEXT NOT NULL CHECK (section_type IN
                   ('hero','features','pricing_table','testimonials','faq','cta')),
  sort_order    INT NOT NULL DEFAULT 0,
  content       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_pricing_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        UUID REFERENCES plans(id) ON DELETE SET NULL,
  headline       TEXT,
  price_label    TEXT,
  features_list  JSONB NOT NULL DEFAULT '[]',
  is_featured    BOOLEAN NOT NULL DEFAULT false,
  sort_order     INT NOT NULL DEFAULT 0,
  is_published   BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_testimonials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name   TEXT NOT NULL,
  author_role   TEXT,
  company_name  TEXT,
  quote         TEXT NOT NULL,
  avatar_url    TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_faqs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  is_published  BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN
     ('marketing_pages','marketing_sections','marketing_pricing_plans',
      'marketing_testimonials','marketing_faqs');
  IF n <> 5 THEN
    RAISE EXCEPTION '474 gagal: hanya % dari 5 tabel yang tercipta', n;
  END IF;

  RAISE NOTICE '474 OK: 5 tabel marketing content terpasang';
END $$;
```

- [ ] **Step 2: Jalankan migrasi**

Expected: `NOTICE: 474 OK...`.

- [ ] **Step 3: Verifikasi**

Run: `node scripts/db/introspect.mjs tables | grep marketing_`
Expected: 5 tabel muncul.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/474_admin_saas_marketing_content.sql
git commit -m "feat(db): tambah tabel marketing content untuk Admin SaaS"
```

---

### Task A7: Migrasi 475 — Role instantiation function (dipakai provisioning §5.1a)

**Files:**
- Create: `db/migrations/475_admin_saas_fn_instantiate_roles.sql`

**Interfaces:**
- Consumes: `roles(company_id, name, label, description, is_builtin, is_template, portal, color, sort_order)`, `role_permissions(role_id, permission_id)` existing (migrasi 363/365).
- Produces: fungsi `fn_instantiate_tenant_roles(p_company_id UUID) RETURNS UUID` — menyalin role dari template ke tenant baru, mengembalikan `id` role admin hasil salinan (dipakai langsung oleh Task C langkah provisioning).

- [ ] **Step 1: Tulis migrasi — fungsi salin role, pola persis migrasi 365**

```sql
-- ============================================================================
-- 475 — ADMIN SAAS: fn_instantiate_tenant_roles — role default utk tenant baru
-- ============================================================================
--
-- Spec §5.1a: company_members.role_id NOT NULL, dan roles bersifat PER-TENANT
-- sejak migrasi 363 — tenant baru TIDAK otomatis punya baris roles apa pun.
-- Migrasi 365 eksplisit menyatakan: "tenant BARU mendapat rolenya lewat jalur
-- provisioning" — admin-saas ADALAH jalur itu. Fungsi ini membungkus pola
-- migrasi 365 (salin dari template) supaya provisioning admin-saas tinggal
-- memanggil satu fungsi di dalam transaksi yang sama.
--
-- Dipanggil DI DALAM transaksi Postgres pertama provisioning (bersama INSERT
-- companies/subscriptions/company_saas_meta) — bukan terpisah.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_instantiate_tenant_roles(p_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_admin_role_id UUID;
BEGIN
  -- Salin baris role dari template (company_id IS NULL, is_template=true).
  INSERT INTO roles (company_id, name, label, description, is_builtin, is_template, portal, color, sort_order)
  SELECT p_company_id, t.name, t.label, t.description, t.is_builtin, false, t.portal, t.color, t.sort_order
    FROM roles t
   WHERE t.company_id IS NULL AND t.is_template
  ON CONFLICT DO NOTHING;

  -- Salin hak aksesnya, dicocokkan lewat NAMA (bukan urutan insert).
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT rt.id, rp.permission_id
    FROM roles rt
    JOIN roles tmpl ON tmpl.company_id IS NULL AND tmpl.is_template AND tmpl.name = rt.name
    JOIN role_permissions rp ON rp.role_id = tmpl.id
   WHERE rt.company_id = p_company_id
  ON CONFLICT DO NOTHING;

  -- Ambil id role admin hasil salinan (dipakai company_members admin pertama).
  SELECT id INTO v_admin_role_id
    FROM roles WHERE company_id = p_company_id AND name = 'admin' LIMIT 1;

  IF v_admin_role_id IS NULL THEN
    RAISE EXCEPTION 'fn_instantiate_tenant_roles: role admin tidak ditemukan setelah penyalinan untuk company %', p_company_id;
  END IF;

  RETURN v_admin_role_id;
END $$;

COMMENT ON FUNCTION fn_instantiate_tenant_roles IS
  'Dipanggil admin-saas di dalam transaksi Postgres pertama provisioning '
  '(spec §5.1a langkah 1). Mengembalikan role_id admin utk INSERT '
  'company_members di langkah 2b. Idempoten via ON CONFLICT DO NOTHING.';

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_test_company_id UUID;
  v_role_id UUID;
  n INT;
BEGIN
  INSERT INTO companies (code, name) VALUES ('test-475-instantiate', 'Test 475')
    RETURNING id INTO v_test_company_id;

  v_role_id := fn_instantiate_tenant_roles(v_test_company_id);

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION '475 gagal: fn_instantiate_tenant_roles mengembalikan NULL';
  END IF;

  SELECT count(*) INTO n FROM roles WHERE company_id = v_test_company_id;
  IF n < 1 THEN
    RAISE EXCEPTION '475 gagal: nol role tersalin ke tenant uji';
  END IF;

  -- Panggil KEDUA KALINYA — harus idempoten, tidak duplikat/error.
  v_role_id := fn_instantiate_tenant_roles(v_test_company_id);
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION '475 gagal: pemanggilan kedua (idempotency) mengembalikan NULL';
  END IF;

  -- Bersihkan data uji.
  DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE company_id = v_test_company_id);
  DELETE FROM roles WHERE company_id = v_test_company_id;
  UPDATE companies SET is_active = false WHERE id = v_test_company_id;

  RAISE NOTICE '475 OK: fn_instantiate_tenant_roles terbukti bekerja & idempoten (% role tersalin)', n;
END $$;
```

- [ ] **Step 2: Jalankan migrasi**

Expected: `NOTICE: 475 OK: fn_instantiate_tenant_roles terbukti bekerja & idempoten (N role tersalin)`.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/475_admin_saas_fn_instantiate_roles.sql
git commit -m "feat(db): fungsi fn_instantiate_tenant_roles untuk provisioning tenant Admin SaaS"
```

---

## Bagian B — Skeleton Repo `admin-saas`

### Task B1: Inisialisasi repo Next.js baru

**Files:**
- Create: `E:\Project\admin-saas\package.json`
- Create: `E:\Project\admin-saas\tsconfig.json`
- Create: `E:\Project\admin-saas\next.config.ts`
- Create: `E:\Project\admin-saas\.env.example`
- Create: `E:\Project\admin-saas\.gitignore`
- Create: `E:\Project\admin-saas\app/layout.tsx`
- Create: `E:\Project\admin-saas\app/page.tsx`

**Interfaces:**
- Produces: repo Next.js 16 App Router yang bisa `pnpm dev` dan menampilkan halaman kosong di `localhost:3100` (port beda dari `puraloka-suite` web `:3000`/api `:3001`, supaya bisa jalan berdampingan saat dev).

- [ ] **Step 1: Buat direktori dan inisialisasi package.json**

Run:
```bash
mkdir -p /e/Project/admin-saas/app
cd /e/Project/admin-saas
git init
```

Create `package.json`:
```json
{
  "name": "admin-saas",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3100",
    "build": "next build",
    "start": "next start -p 3100",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.107.0",
    "next": "16.2.12",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "dotenv": "^16.4.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0"
  }
}
```

- [ ] **Step 2: Buat tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Buat next.config.ts, .gitignore, .env.example**

`next.config.ts`:
```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

`.gitignore`:
```
node_modules/
.next/
.env.local
*.log
```

`.env.example`:
```
# Salin ke .env.local (bukan .env). JANGAN commit .env.local.

# Supabase project SAMA dengan puraloka-suite — admin-saas akses lintas-tenant
# lewat service_role (bypass RLS total). Lihat spec §2.
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Kunci ANON — dipakai untuk verifikasi auth.getUser() token dari sesi login staf.
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 4: Buat app/layout.tsx dan app/page.tsx minimal**

`app/layout.tsx`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return <div>Admin SaaS — fondasi terpasang</div>
}
```

- [ ] **Step 5: Install dependencies dan jalankan dev server**

Run: `cd /e/Project/admin-saas && pnpm install`
Expected: instalasi selesai tanpa error.

Run: `pnpm dev` (background/short-lived check)
Expected: server jalan di `http://localhost:3100`, halaman menampilkan "Admin SaaS — fondasi terpasang".

- [ ] **Step 6: Commit**

```bash
cd /e/Project/admin-saas
git add package.json tsconfig.json next.config.ts .env.example .gitignore app/
git commit -m "feat: inisialisasi skeleton repo admin-saas (Next.js 16 App Router)"
```

---

### Task B2: Klien Supabase service-role + verifikasi koneksi

**Files:**
- Create: `E:\Project\admin-saas\lib/supabase.ts`
- Test: `E:\Project\admin-saas\lib/supabase.test.ts`

**Interfaces:**
- Produces: `supabaseAdmin` (client) — konstanta service-role client yang mengarah ke DB yang sama dengan `puraloka-suite`.
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` dari env.

- [ ] **Step 1: Tulis test koneksi (gagal dulu — belum ada implementasi)**

```typescript
// lib/supabase.test.ts
import { describe, it, expect } from 'vitest'
import { supabaseAdmin } from './supabase'

describe('supabaseAdmin', () => {
  it('bisa membaca tabel companies lintas-tenant (bypass RLS)', async () => {
    const { data, error } = await supabaseAdmin.from('companies').select('id').limit(1)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal (belum ada lib/supabase.ts)**

Run: `cd /e/Project/admin-saas && npx vitest run lib/supabase.test.ts`
Expected: FAIL dengan "Cannot find module './supabase'".

- [ ] **Step 3: Implementasi lib/supabase.ts**

Pola diadaptasi dari `puraloka-suite/apps/api/src/utils/supabase.ts` — service-role client dengan header Authorization eksplisit (bukan cuma opsi `auth`), supaya query data SELALU pakai service-role key.

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'lib/supabase.ts: NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.local'
  )
}

// Service-role client: bypass RLS TOTAL (spec §2). Header Authorization
// dipaksa eksplisit di tiap request supaya query data SELALU pakai
// service-role key, bahkan kalau ada state auth lain yang bocor ke memory
// bersama (pola sama dgn apps/api/src/utils/supabase.ts puraloka-suite).
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
  },
})
```

- [ ] **Step 4: Buat .env.local dari .env.example dan isi kredensial**

Salin nilai `NEXT_PUBLIC_SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` dari `puraloka-suite/apps/api/.env` (`SUPABASE_URL` dan `SUPABASE_SECRET_KEY` di sana — proyek sama, database sama, spec §2).

- [ ] **Step 5: Jalankan test lagi, pastikan lulus**

Run: `npx vitest run lib/supabase.test.ts`
Expected: PASS — berhasil membaca `companies` tanpa RLS memblokir (karena service-role bypass total).

- [ ] **Step 6: Commit**

```bash
git add lib/supabase.ts lib/supabase.test.ts
git commit -m "feat: klien Supabase service-role admin-saas + test koneksi lintas-tenant"
```

**Catatan keamanan**: `.env.local` TIDAK di-commit (sudah di `.gitignore` dari Task B1). Jangan commit kredensial ke git.

---

## Bagian C — Auth & Middleware Admin-SaaS

### Task C1: Fungsi `getCurrentAdminUser()` — resolusi sesi staf ke `admin_saas_users`

**Files:**
- Create: `E:\Project\admin-saas\lib/auth.ts`
- Test: `E:\Project\admin-saas\lib/auth.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` dari Task B2.
- Produces: `getCurrentAdminUser(authUserId: string): Promise<AdminUser | null>` — `AdminUser = { id: string; email: string; fullName: string | null; role: { name: string; permissions: string[] } }`. `null` kalau `auth_user_id` tidak terdaftar di `admin_saas_users` ATAU `is_active=false` (dua kasus sama-sama "bukan staf admin-saas yang sah").

- [ ] **Step 1: Tulis test untuk 3 skenario (ditemukan+aktif, ditemukan+nonaktif, tidak ditemukan)**

```typescript
// lib/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabaseAdmin } from './supabase'
import { getCurrentAdminUser } from './auth'

const TEST_AUTH_USER_ID_ACTIVE = '00000000-0000-0000-0000-000000000001'
const TEST_AUTH_USER_ID_INACTIVE = '00000000-0000-0000-0000-000000000002'
const TEST_AUTH_USER_ID_UNKNOWN = '00000000-0000-0000-0000-000000000099'

let roleId: string

beforeAll(async () => {
  const { data: role } = await supabaseAdmin
    .from('admin_saas_roles')
    .select('id')
    .eq('name', 'support')
    .single()
  roleId = role!.id

  await supabaseAdmin.from('admin_saas_users').insert([
    {
      auth_user_id: TEST_AUTH_USER_ID_ACTIVE,
      email: 'aktif@test.local',
      full_name: 'Staf Aktif',
      role_id: roleId,
      is_active: true,
    },
    {
      auth_user_id: TEST_AUTH_USER_ID_INACTIVE,
      email: 'nonaktif@test.local',
      full_name: 'Staf Nonaktif',
      role_id: roleId,
      is_active: false,
    },
  ])
})

afterAll(async () => {
  await supabaseAdmin
    .from('admin_saas_users')
    .delete()
    .in('auth_user_id', [TEST_AUTH_USER_ID_ACTIVE, TEST_AUTH_USER_ID_INACTIVE])
})

describe('getCurrentAdminUser', () => {
  it('mengembalikan AdminUser lengkap dgn permission untuk staf aktif', async () => {
    const user = await getCurrentAdminUser(TEST_AUTH_USER_ID_ACTIVE)
    expect(user).not.toBeNull()
    expect(user!.email).toBe('aktif@test.local')
    expect(user!.role.name).toBe('support')
    expect(user!.role.permissions).toContain('tenants:view')
    expect(user!.role.permissions).not.toContain('impersonate')
  })

  it('mengembalikan null untuk staf yang is_active=false', async () => {
    const user = await getCurrentAdminUser(TEST_AUTH_USER_ID_INACTIVE)
    expect(user).toBeNull()
  })

  it('mengembalikan null untuk auth_user_id yang tak terdaftar', async () => {
    const user = await getCurrentAdminUser(TEST_AUTH_USER_ID_UNKNOWN)
    expect(user).toBeNull()
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run lib/auth.test.ts`
Expected: FAIL — "Cannot find module './auth'".

- [ ] **Step 3: Implementasi lib/auth.ts**

```typescript
// lib/auth.ts
import { supabaseAdmin } from './supabase'

export interface AdminUser {
  id: string
  email: string
  fullName: string | null
  role: {
    name: string
    permissions: string[]
  }
}

/**
 * Resolusi auth_user_id (dari sesi Supabase Auth) ke identitas staf
 * admin-saas. null berarti "bukan staf admin-saas yang sah" — baik karena
 * tak terdaftar maupun karena is_active=false. Middleware HARUS memblokir
 * akses untuk kedua kasus itu sama.
 *
 * HANYA membaca admin_saas_users + admin_saas_role_permissions — TIDAK
 * PERNAH membaca company_members/roles tenant (spec §4.4, batas §1 poin 2).
 */
export async function getCurrentAdminUser(authUserId: string): Promise<AdminUser | null> {
  const { data: adminUser, error } = await supabaseAdmin
    .from('admin_saas_users')
    .select('id, email, full_name, is_active, role_id, admin_saas_roles(name)')
    .eq('auth_user_id', authUserId)
    .single()

  if (error || !adminUser || !adminUser.is_active) {
    return null
  }

  const { data: permRows } = await supabaseAdmin
    .from('admin_saas_role_permissions')
    .select('admin_saas_permissions(key)')
    .eq('role_id', adminUser.role_id)

  const permissions = (permRows ?? [])
    .map((r: any) => r.admin_saas_permissions?.key)
    .filter((k: unknown): k is string => typeof k === 'string')

  const roleName = (adminUser as any).admin_saas_roles?.name ?? 'unknown'

  return {
    id: adminUser.id,
    email: adminUser.email,
    fullName: adminUser.full_name,
    role: { name: roleName, permissions },
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run lib/auth.test.ts`
Expected: PASS — 3/3 test lulus.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/auth.test.ts
git commit -m "feat: getCurrentAdminUser — resolusi sesi staf ke admin_saas_users+permission"
```

---

### Task C2: `requireAdminPermission()` — guard permission untuk Server Actions/route handlers

**Files:**
- Create: `E:\Project\admin-saas\lib/require-permission.ts`
- Test: `E:\Project\admin-saas\lib/require-permission.test.ts`

**Interfaces:**
- Consumes: `AdminUser` type dari Task C1.
- Produces: `requireAdminPermission(user: AdminUser | null, permission: string): void` — melempar `Error` bertipe khusus `PermissionDeniedError` kalau `user` null atau tidak punya `permission` di `role.permissions`. Dipakai di awal tiap Server Action/route handler sebelum operasi tulis.

- [ ] **Step 1: Tulis test**

```typescript
// lib/require-permission.test.ts
import { describe, it, expect } from 'vitest'
import { requireAdminPermission, PermissionDeniedError } from './require-permission'
import type { AdminUser } from './auth'

const supportUser: AdminUser = {
  id: 'u1',
  email: 'support@test.local',
  fullName: 'Staf Support',
  role: { name: 'support', permissions: ['tenants:view', 'support:manage'] },
}

describe('requireAdminPermission', () => {
  it('tidak melempar error kalau user punya permission', () => {
    expect(() => requireAdminPermission(supportUser, 'tenants:view')).not.toThrow()
  })

  it('melempar PermissionDeniedError kalau user tak punya permission', () => {
    expect(() => requireAdminPermission(supportUser, 'tenants:suspend')).toThrow(
      PermissionDeniedError
    )
  })

  it('melempar PermissionDeniedError kalau user null (belum login/bukan staf)', () => {
    expect(() => requireAdminPermission(null, 'tenants:view')).toThrow(PermissionDeniedError)
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run lib/require-permission.test.ts`
Expected: FAIL — module tak ditemukan.

- [ ] **Step 3: Implementasi**

```typescript
// lib/require-permission.ts
import type { AdminUser } from './auth'

export class PermissionDeniedError extends Error {
  constructor(permission: string) {
    super(`Akses ditolak: butuh permission "${permission}"`)
    this.name = 'PermissionDeniedError'
  }
}

/**
 * Guard permission-based (ADR-004 philosophy, meski repo beda dari
 * puraloka-suite) — dipanggil di awal SETIAP Server Action/route handler
 * yang melakukan operasi tulis. user null (belum resolusi lewat
 * getCurrentAdminUser, atau bukan staf sah) selalu ditolak.
 */
export function requireAdminPermission(user: AdminUser | null, permission: string): void {
  if (!user) {
    throw new PermissionDeniedError(permission)
  }
  if (!user.role.permissions.includes(permission)) {
    throw new PermissionDeniedError(permission)
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run lib/require-permission.test.ts`
Expected: PASS — 3/3.

- [ ] **Step 5: Commit**

```bash
git add lib/require-permission.ts lib/require-permission.test.ts
git commit -m "feat: requireAdminPermission guard untuk Server Actions admin-saas"
```

---

## Bagian D — Menu Tenants (list, detail, provisioning)

### Task D1: `provisionTenant()` Server Action — transaksi 1 (companies+subscriptions+company_saas_meta+roles)

**Files:**
- Create: `E:\Project\admin-saas\lib/provisioning.ts`
- Test: `E:\Project\admin-saas\lib/provisioning.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` (Task B2), fungsi Postgres `fn_provision_tenant_step1` (dibuat di Step 3 task ini, migrasi 476 — yang di dalamnya memanggil `fn_instantiate_tenant_roles` dari Task A7), dipanggil dari TypeScript lewat `supabaseAdmin.rpc(...)`.
- Produces: `provisionTenantStep1(input: { name: string; code: string }): Promise<{ companyId: string; adminRoleId: string } | { error: string }>` — mengeksekusi spec §5.1a langkah 1 (transaksi Postgres tunggal: INSERT companies → subscriptions(trialing) → company_saas_meta(provisioning) → panggil `fn_instantiate_tenant_roles`). TIDAK membuat `auth.users`/`company_members` (itu Task D2, langkah 2a/2b terpisah — email admin baru relevan DI SANA, bukan di langkah 1 yang murni bikin kerangka tenant).

- [ ] **Step 1: Tulis test — sukses, dan gagal karena code bentrok**

```typescript
// lib/provisioning.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { supabaseAdmin } from './supabase'
import { provisionTenantStep1 } from './provisioning'

const createdCompanyIds: string[] = []

afterEach(async () => {
  for (const id of createdCompanyIds) {
    await supabaseAdmin.from('roles').delete().eq('company_id', id)
    await supabaseAdmin.from('company_saas_meta').delete().eq('company_id', id)
    await supabaseAdmin.from('subscriptions').delete().eq('company_id', id)
    await supabaseAdmin.from('companies').update({ is_active: false }).eq('id', id)
  }
  createdCompanyIds.length = 0
})

describe('provisionTenantStep1', () => {
  it('membuat companies+subscriptions(trialing)+company_saas_meta(provisioning)+roles', async () => {
    const result = await provisionTenantStep1({
      name: 'PT Uji Provisioning',
      code: 'uji-provisioning-d1',
    })

    expect('error' in result).toBe(false)
    if ('error' in result) return
    createdCompanyIds.push(result.companyId)

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('code')
      .eq('id', result.companyId)
      .single()
    expect(company?.code).toBe('uji-provisioning-d1')

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('company_id', result.companyId)
      .single()
    expect(sub?.status).toBe('trialing')

    const { data: meta } = await supabaseAdmin
      .from('company_saas_meta')
      .select('lifecycle_status')
      .eq('company_id', result.companyId)
      .single()
    expect(meta?.lifecycle_status).toBe('provisioning')

    expect(result.adminRoleId).toBeTruthy()
  })

  it('mengembalikan error eksplisit kalau code sudah dipakai tenant lain (bukan galat generik)', async () => {
    const first = await provisionTenantStep1({
      name: 'PT Uji Bentrok Pertama',
      code: 'uji-bentrok-d1',
    })
    expect('error' in first).toBe(false)
    if (!('error' in first)) createdCompanyIds.push(first.companyId)

    const second = await provisionTenantStep1({
      name: 'PT Uji Bentrok Kedua',
      code: 'uji-bentrok-d1',
    })
    expect('error' in second).toBe(true)
    if ('error' in second) {
      expect(second.error).toContain('sudah dipakai')
    }
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run lib/provisioning.test.ts`
Expected: FAIL — module tak ditemukan.

- [ ] **Step 3: Implementasi lib/provisioning.ts**

Catatan implementasi: `@supabase/supabase-js` PostgREST tidak mendukung transaksi multi-statement eksplisit dari client — jadi "transaksi Postgres SATU" dari spec §5.1a diwujudkan lewat **satu fungsi Postgres** (`fn_provision_tenant_step1`) yang membungkus keempat operasi dalam satu `plpgsql` block, dipanggil lewat RPC. ini konsisten dengan cara `fn_instantiate_tenant_roles` sudah dipanggil dari SQL, dan memberi rollback atomik yang sesungguhnya (bukan hanya "berurutan dari client" yang tidak atomik).

Tambahkan migrasi baru untuk fungsi pembungkus ini — **catatan untuk step berikutnya**: ini butuh migrasi tambahan di `puraloka-suite`, dieksekusi sebelum lib TypeScript-nya:

Create `db/migrations/476_admin_saas_fn_provision_step1.sql` (di repo `puraloka-suite`):
```sql
-- ============================================================================
-- 476 — ADMIN SAAS: fn_provision_tenant_step1 — transaksi 1 provisioning
-- ============================================================================
--
-- Spec §5.1a langkah 1, dibungkus SATU fungsi Postgres supaya benar-benar
-- atomik (plpgsql function body = satu transaksi implisit; RAISE EXCEPTION
-- di manapun di dalamnya me-rollback SEMUA operasi sebelumnya dalam fungsi
-- yang sama). PostgREST/supabase-js tak mendukung transaksi multi-statement
-- eksplisit dari client, jadi pembungkusan di DB adalah satu-satunya cara
-- menjamin atomicity sesungguhnya.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_provision_tenant_step1(
  p_name TEXT,
  p_code TEXT
) RETURNS TABLE(company_id UUID, admin_role_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
  v_company_id UUID;
  v_admin_role_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM companies WHERE code = p_code) THEN
    RAISE EXCEPTION 'Kode/slug "%" sudah dipakai tenant lain, coba nama lain', p_code
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO companies (code, name) VALUES (p_code, p_name)
    RETURNING id INTO v_company_id;

  INSERT INTO subscriptions (company_id, status, trial_ends_at, current_period_start, current_period_end)
    VALUES (v_company_id, 'trialing', now() + interval '14 days', now(), now() + interval '14 days');

  INSERT INTO company_saas_meta (company_id, lifecycle_status)
    VALUES (v_company_id, 'provisioning');

  v_admin_role_id := fn_instantiate_tenant_roles(v_company_id);

  RETURN QUERY SELECT v_company_id, v_admin_role_id;
END $$;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_result RECORD;
  n INT;
BEGIN
  SELECT * INTO v_result FROM fn_provision_tenant_step1('Test 476', 'test-476-provision');

  IF v_result.company_id IS NULL OR v_result.admin_role_id IS NULL THEN
    RAISE EXCEPTION '476 gagal: fn_provision_tenant_step1 mengembalikan NULL';
  END IF;

  SELECT count(*) INTO n FROM subscriptions WHERE company_id = v_result.company_id AND status = 'trialing';
  IF n <> 1 THEN
    RAISE EXCEPTION '476 gagal: subscriptions trialing tidak tercipta';
  END IF;

  SELECT count(*) INTO n FROM company_saas_meta WHERE company_id = v_result.company_id AND lifecycle_status = 'provisioning';
  IF n <> 1 THEN
    RAISE EXCEPTION '476 gagal: company_saas_meta provisioning tidak tercipta';
  END IF;

  -- Buktikan rollback atomik: code bentrok HARUS gagal TANPA menyisakan baris apa pun.
  BEGIN
    PERFORM fn_provision_tenant_step1('Test 476 Bentrok', 'test-476-provision');
    RAISE EXCEPTION '476 gagal: pemanggilan kedua dengan code sama seharusnya menolak';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- diharapkan
  END;

  -- Bersihkan.
  DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE company_id = v_result.company_id);
  DELETE FROM roles WHERE company_id = v_result.company_id;
  DELETE FROM company_saas_meta WHERE company_id = v_result.company_id;
  DELETE FROM subscriptions WHERE company_id = v_result.company_id;
  UPDATE companies SET is_active = false WHERE id = v_result.company_id;

  RAISE NOTICE '476 OK: fn_provision_tenant_step1 atomik & menolak code bentrok dgn benar';
END $$;
```

Jalankan migrasi ini dulu (`node scripts/db/introspect.mjs identity` untuk cek koneksi, lalu terapkan lewat runner migrasi `puraloka-suite`), baru lanjut ke implementasi TypeScript:

```typescript
// lib/provisioning.ts (di repo admin-saas)
import { supabaseAdmin } from './supabase'

export type ProvisionStep1Result =
  | { companyId: string; adminRoleId: string }
  | { error: string }

/**
 * Spec §5.1a langkah 1 — SATU transaksi Postgres (dibungkus fungsi
 * fn_provision_tenant_step1) yang membuat companies+subscriptions(trialing)+
 * company_saas_meta(provisioning)+roles tenant. TIDAK membuat auth.users/
 * company_members — itu langkah 2a/2b terpisah (Task D2), sengaja idempoten
 * sendiri karena Auth Admin API tidak transaksional dengan Postgres.
 */
export async function provisionTenantStep1(input: {
  name: string
  code: string
}): Promise<ProvisionStep1Result> {
  const { data, error } = await supabaseAdmin.rpc('fn_provision_tenant_step1', {
    p_name: input.name,
    p_code: input.code,
  })

  if (error) {
    if (error.code === '23505' || error.message.includes('sudah dipakai')) {
      return { error: `Kode/slug "${input.code}" sudah dipakai tenant lain, coba nama lain` }
    }
    return { error: `Provisioning gagal: ${error.message}` }
  }

  const row = Array.isArray(data) ? data[0] : data
  return { companyId: row.company_id, adminRoleId: row.admin_role_id }
}
```

- [ ] **Step 4: Jalankan test provisioning.test.ts, pastikan lulus**

Run: `npx vitest run lib/provisioning.test.ts`
Expected: PASS — 2/2 (sukses provisioning + error eksplisit saat code bentrok).

- [ ] **Step 5: Commit (kedua repo)**

```bash
# di puraloka-suite:
cd e:/Project/puraloka-suite
git add db/migrations/476_admin_saas_fn_provision_step1.sql
git commit -m "feat(db): fn_provision_tenant_step1 — transaksi atomik provisioning tenant Admin SaaS"

# di admin-saas:
cd /e/Project/admin-saas
git add lib/provisioning.ts lib/provisioning.test.ts
git commit -m "feat: provisionTenantStep1 — transaksi 1 provisioning tenant (spec §5.1a)"
```

---

### Task D2: `provisionTenantStep2()` — auth.users + company_members, idempoten (2a/2b)

**Files:**
- Modify: `E:\Project\admin-saas\lib/provisioning.ts`
- Modify: `E:\Project\admin-saas\lib/provisioning.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin.auth.admin` (Supabase Auth Admin API), `companyId`+`adminRoleId` dari `provisionTenantStep1`, tabel `public.users` (perantara wajib — lihat catatan "celah yang ketahuan saat eksekusi" di Step 3).
- Produces: `provisionTenantStep2(input: { companyId: string; adminRoleId: string; adminEmail: string; adminName: string }): Promise<{ authUserId: string } | { error: string }>` — implementasi spec §5.1a langkah 2a (cek-lalu-buat `auth.users`, idempoten) + 2a-bis (cek-lalu-buat `public.users`, idempoten — WAJIB, ditemukan saat eksekusi, bukan di draft awal) + 2b (upsert `company_members` dgn `user_id` = `public.users.id`, idempoten). `adminName` WAJIB (`users.name` bertipe `NOT NULL`).

- [ ] **Step 1: Tulis test — sukses, dan idempotency saat dipanggil dua kali**

```typescript
// tambahan di lib/provisioning.test.ts
import { provisionTenantStep2 } from './provisioning'

describe('provisionTenantStep2', () => {
  it('membuat auth.users + company_members, dan idempoten saat dipanggil ulang', async () => {
    const step1 = await provisionTenantStep1({
      name: 'PT Uji Step2',
      code: 'uji-step2-d2',
    })
    expect('error' in step1).toBe(false)
    if ('error' in step1) return
    createdCompanyIds.push(step1.companyId)

    const first = await provisionTenantStep2({
      companyId: step1.companyId,
      adminRoleId: step1.adminRoleId,
      adminEmail: 'admin@ujistep2.local',
    })
    expect('error' in first).toBe(false)
    if ('error' in first) return

    const { data: member } = await supabaseAdmin
      .from('company_members')
      .select('user_id, role_id')
      .eq('company_id', step1.companyId)
      .single()
    expect(member?.role_id).toBe(step1.adminRoleId)

    // Panggilan KEDUA (simulasi retry) — harus idempoten, bukan error "email sudah terdaftar".
    const second = await provisionTenantStep2({
      companyId: step1.companyId,
      adminRoleId: step1.adminRoleId,
      adminEmail: 'admin@ujistep2.local',
    })
    expect('error' in second).toBe(false)
    if (!('error' in second)) {
      expect(second.authUserId).toBe(first.authUserId)
    }

    // Bersihkan auth.users uji.
    await supabaseAdmin.auth.admin.deleteUser(first.authUserId)
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run lib/provisioning.test.ts`
Expected: FAIL — `provisionTenantStep2` tak terdefinisi.

- [ ] **Step 3: Implementasi — tambahkan ke lib/provisioning.ts**

```typescript
// tambahan di lib/provisioning.ts

export type ProvisionStep2Result = { authUserId: string } | { error: string }

/**
 * Spec §5.1a langkah 2a+2b, idempoten. 2a: cek dulu apakah auth.users dgn
 * email itu SUDAH ada tapi belum terhubung ke company_members company INI
 * (indikasi retry dari kegagalan sebelumnya di 2b) — treat sebagai sukses,
 * BUKAN error "email sudah terdaftar". 2b: upsert company_members (DO UPDATE,
 * bukan DO NOTHING — retry yang mengubah role_id tetap kepakai).
 */
export async function provisionTenantStep2(input: {
  companyId: string
  adminRoleId: string
  adminEmail: string
}): Promise<ProvisionStep2Result> {
  let authUserId: string

  // 2a — cek dulu apakah user dgn email ini sudah ada.
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
  const existing = existingUsers?.users.find((u) => u.email === input.adminEmail)

  if (existing) {
    const { data: existingMember } = await supabaseAdmin
      .from('company_members')
      .select('id')
      .eq('company_id', input.companyId)
      .eq('user_id', existing.id)
      .maybeSingle()

    if (existingMember) {
      // Sudah lengkap sepenuhnya dari percobaan sebelumnya — treat sebagai sukses.
      authUserId = existing.id
    } else {
      // auth.users ada, tapi company_members company INI belum — lanjut ke 2b
      // dengan user yang sudah ada (bukan error).
      authUserId = existing.id
    }
  } else {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: input.adminEmail,
      email_confirm: false,
    })
    if (createError || !created.user) {
      return { error: `Gagal membuat akun admin: ${createError?.message ?? 'unknown'}` }
    }
    authUserId = created.user.id
  }

  // 2a-bis — public.users adalah tabel PERANTARA, WAJIB, ditemukan saat
  // eksekusi (bukan diasumsikan dari desain awal): `company_members.user_id`
  // FK ke `users(id)` — TABEL `public.users` milik puraloka-suite, BUKAN
  // langsung ke `auth.users(id)`. `public.users` py PK sendiri + kolom
  // `auth_id` yang menaut ke `auth.users.id`, dan `role_id NOT NULL` (peran
  // GLOBAL lama, fallback TERAKHIR — bukan peran per-tenant, itu tetap di
  // `company_members.role_id`). Pola pembuatannya sudah ada persis di
  // `apps/api/src/routes/v1/auth.ts` (rute register): sesudah
  // `auth.admin.createUser()`, INSERT `users` dgn `auth_id` menaut ke user
  // Auth yang baru dibuat.
  //
  // Idempoten sama seperti 2a: cek dulu by `auth_id`, insert kalau belum ada.
  const { data: existingPublicUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('auth_id', authUserId)
    .maybeSingle()

  let publicUserId: string
  if (existingPublicUser) {
    publicUserId = existingPublicUser.id
  } else {
    const { data: createdPublicUser, error: publicUserError } = await supabaseAdmin
      .from('users')
      .insert({
        auth_id: authUserId,
        name: input.adminName,
        email: input.adminEmail,
        role_id: input.adminRoleId, // fallback global — peran sesungguhnya di company_members.role_id (2b)
      })
      .select('id')
      .single()
    if (publicUserError || !createdPublicUser) {
      return { error: `Gagal membuat baris users: ${publicUserError?.message ?? 'unknown'}` }
    }
    publicUserId = createdPublicUser.id
  }

  // 2b — upsert company_members (DO UPDATE semantics via delete+insert,
  // supaBase-js belum punya native upsert dgn composite unique yg presisi
  // untuk kasus ini — cek dulu, lalu insert/update eksplisit).
  // user_id DI SINI adalah publicUserId (users.id), BUKAN authUserId
  // (auth.users.id) — lihat catatan 2a-bis di atas.
  //
  // is_default TIDAK SELALU true — celah yang ketahuan saat eksekusi Task
  // D4 (bukan draft awal): idx_company_members_one_default adalah UNIQUE
  // INDEX partial "satu is_default=true per user_id" (126_multitenant_core.sql:100-101).
  // Kalau auth user yang di-provisioning KEBETULAN sudah jadi admin default
  // di tenant LAIN (skenario produksi yang sah — satu orang bisa di-invite
  // jadi admin >1 tenant), memaksa is_default:true di sini akan GAGAL
  // unique_violation. Wajib dicek dulu: hanya set true kalau user ITU belum
  // punya default company sama sekali; kalau sudah, keanggotaan baru dibuat
  // is_default:false (user tetap login ke company default lamanya, dan bisa
  // berpindah company lewat company-switcher yang sudah ada).
  const { data: existingDefault } = await supabaseAdmin
    .from('company_members')
    .select('id')
    .eq('user_id', publicUserId)
    .eq('is_default', true)
    .maybeSingle()
  const shouldBeDefault = !existingDefault

  const { data: existingMember } = await supabaseAdmin
    .from('company_members')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('user_id', publicUserId)
    .maybeSingle()

  if (existingMember) {
    const { error: updateError } = await supabaseAdmin
      .from('company_members')
      .update({ role_id: input.adminRoleId, is_active: true })
      .eq('id', existingMember.id)
    if (updateError) {
      return { error: `Gagal memperbarui keanggotaan: ${updateError.message}` }
    }
  } else {
    const { error: insertError } = await supabaseAdmin.from('company_members').insert({
      company_id: input.companyId,
      user_id: publicUserId,
      role_id: input.adminRoleId,
      is_default: shouldBeDefault,
      is_active: true,
    })
    if (insertError) {
      return { error: `Gagal membuat keanggotaan: ${insertError.message}` }
    }
  }

  return { authUserId }
}
```

**Celah yang ketahuan SAAT EKSEKUSI (bukan review dokumen)**: draft pertama
task ini mengasumsikan `company_members.user_id` FK langsung ke
`auth.users.id` — keliru, terbukti oleh implementer yang menjalankan test
sungguhan dan mendapat FK violation `company_members_user_id_fkey`.
Verifikasi silang: `db/migrations/126_multitenant_core.sql:86` —
`user_id UUID NOT NULL REFERENCES users(id)`, dan `public.users` adalah
tabel employee/staff puraloka-suite sendiri (py `auth_id`, `role_id NOT
NULL`, dst), bukan alias `auth.users`. Pola pembuatannya SUDAH ADA di
`apps/api/src/routes/v1/auth.ts` rute register — diikuti persis di atas,
bukan ditebak. `input.adminName` ditambahkan ke parameter fungsi (Interfaces
block di atas WAJIB diperbarui: `provisionTenantStep2(input: { companyId:
string; adminRoleId: string; adminEmail: string; adminName: string })`) —
`users.name` bertipe `NOT NULL`, jadi provisioning butuh nama admin, bukan
cuma email.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run lib/provisioning.test.ts`
Expected: PASS — semua test (Step1 + Step2 termasuk idempotency) lulus.

- [ ] **Step 5: Commit**

```bash
git add lib/provisioning.ts lib/provisioning.test.ts
git commit -m "feat: provisionTenantStep2 — auth.users+public.users+company_members idempoten (spec §5.1a 2a/2b)"
```

---

### Task D3: Endpoint aksi berisiko — validasi `company.code` echo-back (spec §5.1b)

**Files:**
- Create: `E:\Project\admin-saas\lib/validate-tenant-target.ts`
- Test: `E:\Project\admin-saas\lib/validate-tenant-target.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` dari Task B2.
- Produces: `validateTenantTarget(companyId: string, expectedCode: string): Promise<{ valid: true } | { valid: false; reason: string }>` — dipanggil di awal SETIAP Server Action aksi berisiko (suspend, dsb) sebelum eksekusi.

- [ ] **Step 1: Tulis test**

```typescript
// lib/validate-tenant-target.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabaseAdmin } from './supabase'
import { validateTenantTarget } from './validate-tenant-target'

// TEST_CODE tetap (bukan literal berulang di tiap assertion) supaya jelas
// satu-satunya nilai yang harus dibebaskan saat afterAll.
const TEST_CODE = 'uji-validate-target'
let companyId: string

beforeAll(async () => {
  const { data } = await supabaseAdmin
    .from('companies')
    .insert({ code: TEST_CODE, name: 'PT Uji Validate' })
    .select('id')
    .single()
  companyId = data!.id
})

afterAll(async () => {
  // companies.code UNIQUE + companies tak bisa hard-delete (trigger
  // anti-hapus-kasual) — is_active=false SAJA tak membebaskan TEST_CODE
  // untuk run berikutnya (bug kelas sama ditemukan & diperbaiki di
  // provisioning.test.ts, Task D1 fix round 1). Ganti code JUGA supaya
  // suite ini bisa dijalankan ulang tanpa unique_violation.
  await supabaseAdmin
    .from('companies')
    .update({ is_active: false, code: `retired-${companyId.slice(0, 8)}` })
    .eq('id', companyId)
})

describe('validateTenantTarget', () => {
  it('valid=true kalau code yang dikirim client cocok dgn company_id', async () => {
    const result = await validateTenantTarget(companyId, TEST_CODE)
    expect(result.valid).toBe(true)
  })

  it('valid=false kalau code tak cocok — mencegah salah-sasaran (spec §5.1b)', async () => {
    const result = await validateTenantTarget(companyId, 'kode-yang-salah')
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.reason).toContain('tak cocok')
    }
  })

  it('valid=false kalau company_id tak ditemukan', async () => {
    const result = await validateTenantTarget('00000000-0000-0000-0000-000000000000', 'apapun')
    expect(result.valid).toBe(false)
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run lib/validate-tenant-target.test.ts`
Expected: FAIL — module tak ditemukan.

- [ ] **Step 3: Implementasi**

```typescript
// lib/validate-tenant-target.ts
import { supabaseAdmin } from './supabase'

export type ValidateTenantTargetResult = { valid: true } | { valid: false; reason: string }

/**
 * Spec §5.1b requirement 1 — penjaga salah-sasaran tenant. Dipanggil di
 * AWAL setiap Server Action aksi berisiko (suspend, reaktivasi, override
 * kuota, ubah plan) dengan company.code yang di-render staf di layar,
 * dicocokkan server-side terhadap company_id target di request yang sama.
 * Tak cocok = tolak, jangan lanjutkan aksi.
 */
export async function validateTenantTarget(
  companyId: string,
  expectedCode: string
): Promise<ValidateTenantTargetResult> {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('code')
    .eq('id', companyId)
    .maybeSingle()

  if (error || !data) {
    return { valid: false, reason: 'Tenant tidak ditemukan' }
  }

  if (data.code !== expectedCode) {
    return {
      valid: false,
      reason: 'Tenant yang ditampilkan tak cocok dengan target aksi, muat ulang halaman',
    }
  }

  return { valid: true }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run lib/validate-tenant-target.test.ts`
Expected: PASS — 3/3.

- [ ] **Step 5: Commit**

```bash
git add lib/validate-tenant-target.ts lib/validate-tenant-target.test.ts
git commit -m "feat: validateTenantTarget — penjaga salah-sasaran tenant (spec §5.1b)"
```

---

### Task D4: `suspendTenant()` — race-safe via status-lama-di-WHERE (spec §5.1b)

**Files:**
- Create: `E:\Project\admin-saas\lib/suspend-tenant.ts`
- Test: `E:\Project\admin-saas\lib/suspend-tenant.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin`, `validateTenantTarget` (Task D3).
- Produces: `suspendTenant(input: { companyId: string; expectedCode: string; expectedCurrentStatus: string; reason: string; accessMode: 'read_only' | 'blocked'; suspendedBy: string }): Promise<{ ok: true } | { ok: false; reason: string }>`.

**Catatan tanggung jawab**: `suspendTenant()` adalah fungsi data-layer murni — validasi *permission* (`requireAdminPermission('tenants:suspend')`, Task C2) adalah tanggung jawab Server Action/route handler yang MEMANGGIL `suspendTenant()`, bukan fungsi ini sendiri. Plan fondasi ini tidak membangun Server Action pembungkusnya (itu bagian UI form suspend, plan berikutnya) — `getCurrentAdminUser`+`requireAdminPermission` dari Bagian C sudah teruji siap pakai untuk pembungkus itu saat dibangun.

- [ ] **Step 1: Tulis test — sukses, gagal krn code tak cocok, gagal krn race (status berubah)**

```typescript
// lib/suspend-tenant.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabaseAdmin } from './supabase'
import { suspendTenant } from './suspend-tenant'

// TEST_CODE tetap — lihat catatan afterAll soal kenapa harus dibebaskan.
const TEST_CODE = 'uji-suspend-d4'
let companyId: string
let adminUserId: string

beforeAll(async () => {
  const { data: company } = await supabaseAdmin
    .from('companies')
    .insert({ code: TEST_CODE, name: 'PT Uji Suspend' })
    .select('id')
    .single()
  companyId = company!.id

  await supabaseAdmin.from('company_saas_meta').insert({
    company_id: companyId,
    lifecycle_status: 'active',
    access_mode: 'full',
  })

  const { data: role } = await supabaseAdmin
    .from('admin_saas_roles')
    .select('id')
    .eq('name', 'super_admin')
    .single()
  const { data: adminUser } = await supabaseAdmin
    .from('admin_saas_users')
    .insert({
      auth_user_id: '00000000-0000-0000-0000-000000000010',
      email: 'suspender@test.local',
      role_id: role!.id,
    })
    .select('id')
    .single()
  adminUserId = adminUser!.id
})

afterAll(async () => {
  await supabaseAdmin.from('admin_saas_users').delete().eq('id', adminUserId)
  await supabaseAdmin.from('company_saas_meta').delete().eq('company_id', companyId)
  // is_active SAJA tak membebaskan TEST_CODE untuk run berikutnya —
  // companies.code UNIQUE + tak bisa hard-delete (bug kelas sama
  // ditemukan & diperbaiki di provisioning.test.ts, Task D1 fix round 1;
  // diulang lagi di validate-tenant-target.test.ts, Task D3 fix round 1).
  await supabaseAdmin
    .from('companies')
    .update({ is_active: false, code: `retired-${companyId.slice(0, 8)}` })
    .eq('id', companyId)
})

describe('suspendTenant', () => {
  it('mengubah lifecycle_status+access_mode kalau code cocok & status lama sesuai', async () => {
    const result = await suspendTenant({
      companyId,
      expectedCode: TEST_CODE,
      expectedCurrentStatus: 'active',
      reason: 'Uji suspend otomatis',
      accessMode: 'read_only',
      suspendedBy: adminUserId,
    })
    expect(result.ok).toBe(true)

    const { data: meta } = await supabaseAdmin
      .from('company_saas_meta')
      .select('lifecycle_status, access_mode, suspended_reason')
      .eq('company_id', companyId)
      .single()
    expect(meta?.lifecycle_status).toBe('suspended')
    expect(meta?.access_mode).toBe('read_only')
    expect(meta?.suspended_reason).toBe('Uji suspend otomatis')
  })

  it('menolak kalau company.code tak cocok (salah-sasaran)', async () => {
    const result = await suspendTenant({
      companyId,
      expectedCode: 'kode-salah',
      expectedCurrentStatus: 'suspended',
      reason: 'Percobaan salah sasaran',
      accessMode: 'blocked',
      suspendedBy: adminUserId,
    })
    expect(result.ok).toBe(false)
  })

  it('menolak kalau status lama tak sesuai — race dua staf (spec §5.1b requirement 2)', async () => {
    // Status sekarang 'suspended' (dari test pertama), tapi kita klaim 'active'.
    const result = await suspendTenant({
      companyId,
      expectedCode: TEST_CODE,
      expectedCurrentStatus: 'active', // SALAH — sudah suspended
      reason: 'Staf kedua yang telat sadar',
      accessMode: 'blocked',
      suspendedBy: adminUserId,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('berubah')
    }
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run lib/suspend-tenant.test.ts`
Expected: FAIL — module tak ditemukan.

- [ ] **Step 3: Implementasi**

```typescript
// lib/suspend-tenant.ts
import { supabaseAdmin } from './supabase'
import { validateTenantTarget } from './validate-tenant-target'

export type SuspendTenantResult = { ok: true } | { ok: false; reason: string }

/**
 * Spec §5.1b — dua penjaga sekaligus: (1) validateTenantTarget mencegah
 * salah-sasaran company_id, (2) UPDATE ... WHERE lifecycle_status=<lama>
 * mencegah race dua staf yang menulis bersamaan (pola sama dgn
 * audit-klaim-status-atomik.mjs di puraloka-suite: status lama WAJIB ikut
 * di WHERE). affected rows 0 = konflik, bukan overwrite senyap.
 */
export async function suspendTenant(input: {
  companyId: string
  expectedCode: string
  expectedCurrentStatus: string
  reason: string
  accessMode: 'read_only' | 'blocked'
  suspendedBy: string
}): Promise<SuspendTenantResult> {
  const targetCheck = await validateTenantTarget(input.companyId, input.expectedCode)
  if (!targetCheck.valid) {
    return { ok: false, reason: targetCheck.reason }
  }

  const { data, error } = await supabaseAdmin
    .from('company_saas_meta')
    .update({
      lifecycle_status: 'suspended',
      access_mode: input.accessMode,
      suspended_reason: input.reason,
      suspended_at: new Date().toISOString(),
      suspended_by: input.suspendedBy,
    })
    .eq('company_id', input.companyId)
    .eq('lifecycle_status', input.expectedCurrentStatus)
    .select('company_id')

  if (error) {
    return { ok: false, reason: `Gagal menyuspend: ${error.message}` }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      reason: 'Status tenant sudah berubah sejak halaman ini dimuat, muat ulang sebelum lanjut',
    }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run lib/suspend-tenant.test.ts`
Expected: PASS — 3/3 (sukses, salah-sasaran ditolak, race ditolak).

- [ ] **Step 5: Commit**

```bash
git add lib/suspend-tenant.ts lib/suspend-tenant.test.ts
git commit -m "feat: suspendTenant — race-safe via status-lama-di-WHERE (spec §5.1b)"
```

---

### Task D5: Halaman UI — List Tenants (`app/tenants/page.tsx`)

**Files:**
- Create: `E:\Project\admin-saas\app/tenants/page.tsx`
- Create: `E:\Project\admin-saas\lib/list-tenants.ts`
- Test: `E:\Project\admin-saas\lib/list-tenants.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin`.
- Produces: `listTenants(): Promise<TenantRow[]>` — `TenantRow = { id: string; name: string; code: string; planName: string | null; lifecycleStatus: string; createdAt: string }`. Halaman Server Component yang me-render tabel dari `listTenants()`.

- [ ] **Step 1: Tulis test untuk listTenants()**

```typescript
// lib/list-tenants.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabaseAdmin } from './supabase'
import { listTenants } from './list-tenants'

const TEST_CODE = 'uji-list-tenants-d5'
let companyId: string

beforeAll(async () => {
  const { data } = await supabaseAdmin
    .from('companies')
    .insert({ code: TEST_CODE, name: 'PT Uji List Tenants' })
    .select('id')
    .single()
  companyId = data!.id
  await supabaseAdmin
    .from('company_saas_meta')
    .insert({ company_id: companyId, lifecycle_status: 'active' })
})

afterAll(async () => {
  await supabaseAdmin.from('company_saas_meta').delete().eq('company_id', companyId)
  // is_active SAJA tak membebaskan TEST_CODE untuk run berikutnya — lihat
  // catatan sama di provisioning.test.ts (Task D1 fix round 1) dan
  // validate-tenant-target.test.ts (Task D3 fix round 1).
  await supabaseAdmin
    .from('companies')
    .update({ is_active: false, code: `retired-${companyId.slice(0, 8)}` })
    .eq('id', companyId)
})

describe('listTenants', () => {
  it('mengembalikan tenant dgn lifecycle_status dari company_saas_meta', async () => {
    const tenants = await listTenants()
    const found = tenants.find((t) => t.id === companyId)
    expect(found).toBeDefined()
    expect(found?.code).toBe('uji-list-tenants-d5')
    expect(found?.lifecycleStatus).toBe('active')
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run lib/list-tenants.test.ts`
Expected: FAIL — module tak ditemukan.

- [ ] **Step 3: Implementasi lib/list-tenants.ts**

```typescript
// lib/list-tenants.ts
import { supabaseAdmin } from './supabase'

export interface TenantRow {
  id: string
  name: string
  code: string
  planName: string | null
  lifecycleStatus: string
  createdAt: string
}

export async function listTenants(): Promise<TenantRow[]> {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select(
      `id, name, code, created_at,
       company_saas_meta(lifecycle_status),
       subscriptions(plan_id, plans(name))`
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error || !data) {
    return []
  }

  return data.map((row: any) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    planName: row.subscriptions?.[0]?.plans?.name ?? null,
    lifecycleStatus: row.company_saas_meta?.[0]?.lifecycle_status ?? 'provisioning',
    createdAt: row.created_at,
  }))
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run lib/list-tenants.test.ts`
Expected: PASS.

- [ ] **Step 5: Buat halaman app/tenants/page.tsx**

```tsx
// app/tenants/page.tsx
import { listTenants } from '@/lib/list-tenants'

export default async function TenantsPage() {
  const tenants = await listTenants()

  return (
    <main>
      <h1>Tenants</h1>
      <table>
        <thead>
          <tr>
            <th>Nama</th>
            <th>Kode</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Terdaftar</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.code}</td>
              <td>{t.planName ?? '—'}</td>
              <td>{t.lifecycleStatus}</td>
              <td>{new Date(t.createdAt).toLocaleDateString('id-ID')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 6: Verifikasi manual — jalankan dev server dan buka halaman**

Run: `pnpm dev`
Buka: `http://localhost:3100/tenants`
Expected: tabel tampil (boleh kosong kalau belum ada tenant sungguhan — yang penting halaman render tanpa error).

- [ ] **Step 7: Commit**

```bash
git add app/tenants/page.tsx lib/list-tenants.ts lib/list-tenants.test.ts
git commit -m "feat: halaman List Tenants (app/tenants) + listTenants()"
```

---

## Ringkasan Verifikasi Akhir Fondasi

Setelah semua task selesai, jalankan urutan ini untuk membuktikan fondasi benar-benar hidup end-to-end:

```bash
# 1. Semua migrasi puraloka-suite terpasang & konsisten
cd e:/Project/puraloka-suite
node scripts/db/introspect.mjs tables | grep -E "plans|subscriptions|company_saas_meta|saas_invoices|admin_saas|marketing_"
node scripts/db/ledger-diff.mjs

# 2. Semua test admin-saas lulus
cd /e/Project/admin-saas
npx vitest run

# 3. typecheck bersih
npx tsc --noEmit

# 4. Dev server jalan, halaman Tenants bisa diakses
pnpm dev
# buka http://localhost:3100/tenants secara manual
```

Tempel ringkasan hasil run sungguhan sebelum mengklaim fondasi selesai (CLAUDE.md §7 — kejujuran tidak bisa ditawar, dilarang mengklaim test hijau tanpa bukti run).

## Yang SADAR belum dicakup plan ini

Sesuai kesepakatan scope (fondasi dulu, bukan seluruh §5 spec sekaligus):

- **Tab Detail tenant** (Overview·Billing·Users·Usage·Feature Flags·Audit, spec §5.1) — plan ini baru List + provisioning. Halaman detail per-tab jadi plan terpisah.
- **§5.2 Billing & Subscription**, **§5.3 Plans & Feature Flags UI**, **§5.4 Marketing Content UI**, **§5.5 Usage & Limits UI**, **§5.6 Support**, **§5.7 Audit Log UI**, **§5.8 Team UI**, **§5.9 Impersonation** — tabel DB-nya sudah lengkap (Bagian A), tapi UI/Server Action-nya belum. Masing-masing jadi plan implementasi terpisah, dibangun di atas fondasi Bagian B/C yang sudah teruji di plan ini (`supabaseAdmin`, `getCurrentAdminUser`, `requireAdminPermission`, `validateTenantTarget`, pola race-safe UPDATE-WHERE-status-lama).
- **§6 Kontrak API publik marketing-saas**, **§7 Automasi n8n**, **§8 Desain visual final** — sepenuhnya di luar plan ini, sesuai §9 spec.
- **Halaman login staf admin-saas** (Supabase Auth UI, sesi cookie) — `getCurrentAdminUser`/`requireAdminPermission` (Bagian C) sudah siap dipakai, tapi flow login UI-nya sendiri (form, redirect, session middleware Next.js) belum dibangun di plan ini — dibutuhkan sebelum halaman `/tenants` bisa benar-benar digerbangi (saat ini `app/tenants/page.tsx` di Task D5 belum memanggil `getCurrentAdminUser`/`requireAdminPermission` sama sekali; itu diserahkan ke plan login berikutnya supaya fondasi ini tetap fokus pada data-layer yang teruji terlebih dulu).
