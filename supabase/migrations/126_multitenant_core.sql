-- ============================================================
-- 126 — MULTI-TENANT: skema inti (Tahap T2 dari ADR-011)
--
-- ADDITIVE MURNI. Nol perubahan pada data existing, nol kolom yang di-drop,
-- nol tabel yang disentuh selain yang dibuat di sini. Aman untuk re-run.
--
-- Yang DIBUAT:
--   companies              — tenant. Baris pertama di-seed DARI company_profile
--                            (dibaca, bukan di-hardcode "Puraloka Persada")
--   company_members        — keanggotaan user × company + peran per-company (D6)
--   document_number_series — counter penomoran per-company (menggantikan
--                            COUNT(*)+1 di T6; tabelnya lahir sekarang)
--   auth_company_id()      — company aktif request ini
--   is_member_of()         — cek keanggotaan
--   (project_company_id() TIDAK di sini — butuh projects.company_id dari T3)
--
-- Yang TIDAK dilakukan di sini (sengaja — itu T3, Red-Line):
--   • TIDAK menambah company_id ke 32 tabel hasil audit T1
--   • TIDAK membuat policy RLS tenant
--   • TIDAK menyentuh company_profile (dibuang baru di T4)
--
-- P1 (ADR-011 §9.5): company pertama = tenant BIASA. Tidak ada
-- DEFAULT_COMPANY_ID di kode; tidak ada cabang "kalau cuma satu company";
-- auth_company_id() yang NULL = error keras di pemanggil, bukan fallback.
--
-- Rujukan: ADR-011 §4 · audit T1 (ADR-011-T1-AUDIT-KLASIFIKASI-TABEL.md)
-- ============================================================

-- ------------------------------------------------------------
-- 1. companies — tenant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,              -- slug stabil, dipakai penomoran
  name              TEXT NOT NULL,
  legal_name        TEXT,                       -- nama badan hukum (PT/CV)
  parent_company_id UUID REFERENCES companies(id) ON DELETE RESTRICT,

  -- profil (pindahan company_profile; single-row anti-pattern dihapus)
  tagline           TEXT,
  address           TEXT,
  city              TEXT,
  postal_code       TEXT,
  phone             TEXT,
  email             TEXT,
  website           TEXT,
  npwp              TEXT,
  logo_url          TEXT,
  bank_name         TEXT,
  bank_account      TEXT,
  bank_account_name TEXT,
  invoice_prefix    TEXT NOT NULL DEFAULT 'INV',
  invoice_notes     TEXT,
  signature_name    TEXT,

  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT companies_code_unique UNIQUE (code),
  CONSTRAINT companies_code_format CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  CONSTRAINT companies_no_self_parent CHECK (parent_company_id IS NULL OR parent_company_id <> id)
);

COMMENT ON TABLE companies IS
  'Tenant. Satu baris = satu badan usaha. parent_company_id untuk grup usaha '
  '(founder punya >1 PT/CV). Menggantikan company_profile (single-row, dibuang di T4).';
COMMENT ON COLUMN companies.code IS
  'Slug stabil & lowercase. Dipakai sebagai scope penomoran dokumen — JANGAN diubah '
  'setelah ada dokumen bernomor, karena nomor lama tak ikut berubah.';

CREATE INDEX IF NOT EXISTS idx_companies_parent ON companies(parent_company_id)
  WHERE parent_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active) WHERE is_active;

-- ------------------------------------------------------------
-- 2. company_members — keanggotaan (keputusan founder D6)
--    Satu user boleh jadi anggota >1 company dengan peran BERBEDA.
--    Karena itu users TIDAK dapat company_id (audit T1 §5 kategori D).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES roles(id)     ON DELETE RESTRICT,
  is_default  BOOLEAN NOT NULL DEFAULT false,  -- company yang dipilih saat login
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT company_members_unique UNIQUE (company_id, user_id)
);

COMMENT ON TABLE company_members IS
  'Keanggotaan user x company + peran DI company itu. Peran hidup di sini, bukan di '
  'users.role_id — satu orang bisa admin di company A dan pm di company B.';

-- Tepat satu default per user (partial unique — user tanpa default juga sah).
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_members_one_default
  ON company_members(user_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_company_members_user    ON company_members(user_id)    WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members(company_id) WHERE is_active;

-- ------------------------------------------------------------
-- 3. document_number_series — counter penomoran per-company
--    Lahir sekarang supaya T6 tinggal memakainya. Belum ada trigger yang
--    membacanya di migration ini (itu T6, Red-Line).
--
--    Kenapa tabel counter, bukan COUNT(*)+1: COUNT ikut turun saat baris dihapus
--    (nomor bisa terpakai ulang) dan rawan balapan. Counter hanya naik.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_number_series (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL,        -- 'invoice' | 'po' | 'mr' | 'gr' | 'co' | ...
  period      TEXT NOT NULL,        -- 'YYYY' / 'YYYY-MM' / '-' (tanpa reset)
  prefix      TEXT NOT NULL DEFAULT '',
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dns_unique UNIQUE (company_id, doc_type, period)
);

COMMENT ON TABLE document_number_series IS
  'Counter nomor dokumen per company+jenis+periode. Monoton naik: nomor yang sudah '
  'terpakai tidak pernah dipakai ulang meski barisnya dihapus (beda dari COUNT(*)+1).';

-- ------------------------------------------------------------
-- 4. FK untuk kolom yatim feature_flags.company_id (ada sejak 077)
--    NULL = flag global, terisi = override per-tenant (audit T1 §5: kategori AB).
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feature_flags_company_id_fkey'
      AND conrelid = 'feature_flags'::regclass   -- WAJIB: tanpa ini, cek bocor
  ) THEN                                          -- lintas skema (anti-pattern 115)
    ALTER TABLE feature_flags
      ADD CONSTRAINT feature_flags_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. Seed tenant pertama — DIBACA dari company_profile, bukan di-hardcode
--    (guardrail: "jangan hardcode 'Puraloka Persada' di logic")
-- ------------------------------------------------------------
DO $$
DECLARE
  v_profile  RECORD;
  v_company  UUID;
  v_admin    UUID;
  v_code     TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM companies) THEN
    RAISE NOTICE '126: companies sudah terisi — seed dilewati (idempoten).';
    RETURN;
  END IF;

  SELECT * INTO v_profile FROM company_profile ORDER BY updated_at NULLS LAST LIMIT 1;

  IF v_profile IS NULL THEN
    -- Fail-loud: lebih baik migrasi berhenti daripada melahirkan tenant
    -- bernama tebakan. Nol default diam-diam.
    RAISE EXCEPTION '126: company_profile kosong — tenant pertama tak dapat di-seed. '
                    'Isi company_profile dulu, lalu jalankan ulang migrasi ini.';
  END IF;

  -- code = slug dari nama; fallback aman bila nama tak menyisakan karakter valid.
  v_code := regexp_replace(lower(coalesce(v_profile.company_name, '')), '[^a-z0-9]+', '-', 'g');
  v_code := trim(both '-' from v_code);
  v_code := left(v_code, 40);
  IF v_code IS NULL OR length(v_code) < 3 THEN v_code := 'company-1'; END IF;

  SELECT u.id INTO v_admin
  FROM users u JOIN roles r ON r.id = u.role_id
  WHERE r.name = 'admin' ORDER BY u.created_at LIMIT 1;

  INSERT INTO companies (
    code, name, legal_name, tagline, address, city, postal_code, phone, email,
    website, npwp, logo_url, bank_name, bank_account, bank_account_name,
    invoice_prefix, invoice_notes, signature_name, created_by, updated_by)
  VALUES (
    v_code, v_profile.company_name, v_profile.company_name, v_profile.tagline,
    v_profile.address, v_profile.city, v_profile.postal_code, v_profile.phone,
    v_profile.email, v_profile.website, v_profile.npwp, v_profile.logo_url,
    v_profile.bank_name, v_profile.bank_account, v_profile.bank_account_name,
    coalesce(v_profile.invoice_prefix, 'INV'), v_profile.invoice_notes,
    v_profile.signature_name, v_admin, v_admin)
  RETURNING id INTO v_company;

  -- Semua user existing jadi anggota tenant pertama, mempertahankan peran
  -- masing-masing dari users.role_id → nol perubahan otorisasi.
  INSERT INTO company_members (company_id, user_id, role_id, is_default, is_active, created_by)
  SELECT v_company, u.id, u.role_id, true, coalesce(u.is_active, true), v_admin
  FROM users u
  WHERE u.role_id IS NOT NULL
  ON CONFLICT (company_id, user_id) DO NOTHING;

  RAISE NOTICE '126: tenant pertama "%" (code=%) + % anggota.',
    v_profile.company_name, v_code, (SELECT count(*) FROM company_members WHERE company_id = v_company);
END $$;

-- ------------------------------------------------------------
-- 6. Fungsi auth
-- ------------------------------------------------------------

-- Company aktif request ini. Dua sumber, presedens tetap:
--   1) app.company_id  — di-set eksplisit per-transaksi (company switcher)
--   2) default keanggotaan user
-- NULL = tak dapat ditentukan. Pemanggil WAJIB memperlakukannya sebagai error
-- keras (P1) — JANGAN pernah jatuh ke "ambil satu-satunya company yang ada".
-- Catatan search_path: SENGAJA tanpa `SET search_path = public`, mengikuti pola
-- helper existing (auth_role 049/079, has_permission 062). Konsekuensinya fungsi
-- ini resolve tabel lewat search_path pemanggil — itulah yang membuat file
-- migration YANG SAMA bisa dijalankan verbatim di schema `test` terisolasi
-- (prasyarat 06-test-strategy). Menambah SET search_path=public akan membuat
-- fungsi selalu menunjuk public dan test schema-terisolasi mustahil.
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.company_id', true), '')::UUID,
    (SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = auth_user_id() AND cm.is_default AND cm.is_active
      LIMIT 1)
  );
$$;

COMMENT ON FUNCTION auth_company_id() IS
  'Company aktif: app.company_id (eksplisit) > default keanggotaan. NULL = tak '
  'dapat ditentukan; pemanggil harus gagal keras, bukan menebak (ADR-011 P1).';

-- Apakah user request ini anggota aktif company tsb.
CREATE OR REPLACE FUNCTION is_member_of(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth_user_id()
      AND cm.is_active
  );
$$;

-- CATATAN: project_company_id() SENGAJA TIDAK dibuat di sini.
--
-- Ia harus membaca projects.company_id, dan kolom itu baru lahir di T3. Fungsi
-- LANGUAGE sql divalidasi badannya saat CREATE, jadi membuatnya sekarang =
-- migrasi gagal. Dry-run T2 membuktikan ini (error 42703 di posisi fungsi tsb).
--
-- Alternatif "akali sekarang" yang DITOLAK: bikin plpgsql late-binding (badan tak
-- divalidasi) supaya lolos hari ini. Ditolak karena menghasilkan fungsi yang ADA
-- tapi selalu meledak saat dipanggil — persis jenis "lapisan yang kelihatan
-- terpasang padahal tidak" yang ADR-011 P2 berusaha cegah.
--
-- project_company_id() dibuat di T3, satu migrasi dengan kolom yang dibacanya.

-- ------------------------------------------------------------
-- 7. RLS untuk tabel baru
--    Pola sama dgn tabel lain: permission-based (ADR-004), BUKAN literal role.
--    Catatan T1-F3: tabel baru ini diberi policy PERMISSIVE sejak lahir, supaya
--    tidak menambah anggota ke-9 daftar "RLS on tapi nol policy".
-- ------------------------------------------------------------
ALTER TABLE companies              ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_number_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select ON companies;
CREATE POLICY companies_select ON companies FOR SELECT
  USING (is_member_of(id));

DROP POLICY IF EXISTS companies_manage ON companies;
CREATE POLICY companies_manage ON companies FOR ALL
  USING (is_member_of(id) AND has_permission('settings:manage'))
  WITH CHECK (is_member_of(id) AND has_permission('settings:manage'));

DROP POLICY IF EXISTS company_members_select ON company_members;
CREATE POLICY company_members_select ON company_members FOR SELECT
  USING (user_id = auth_user_id() OR is_member_of(company_id));

DROP POLICY IF EXISTS company_members_manage ON company_members;
CREATE POLICY company_members_manage ON company_members FOR ALL
  USING (is_member_of(company_id) AND has_permission('users:manage'))
  WITH CHECK (is_member_of(company_id) AND has_permission('users:manage'));

DROP POLICY IF EXISTS dns_select ON document_number_series;
CREATE POLICY dns_select ON document_number_series FOR SELECT
  USING (is_member_of(company_id));

DROP POLICY IF EXISTS dns_manage ON document_number_series;
CREATE POLICY dns_manage ON document_number_series FOR ALL
  USING (is_member_of(company_id) AND has_permission('settings:manage'))
  WITH CHECK (is_member_of(company_id) AND has_permission('settings:manage'));

-- ------------------------------------------------------------
-- 8. Guard: company tak boleh dihapus selama masih punya anggota/rujukan.
--    ON DELETE CASCADE di company_members akan menghapus keanggotaan diam-diam;
--    untuk tenant, penghapusan harus jadi keputusan sadar, bukan efek samping.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_company_no_casual_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'Company "%" tidak boleh dihapus. Nonaktifkan (is_active=false) atau '
    'jalankan prosedur off-boarding tenant. Penghapusan tenant = kehilangan '
    'data lintas puluhan tabel dan tidak dapat di-rollback lewat aplikasi.',
    OLD.name;
END $$;

DROP TRIGGER IF EXISTS trg_company_no_casual_delete ON companies;
CREATE TRIGGER trg_company_no_casual_delete
  BEFORE DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION fn_company_no_casual_delete();
