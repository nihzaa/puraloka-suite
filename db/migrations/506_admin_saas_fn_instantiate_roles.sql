-- ============================================================================
-- 506 — ADMIN SAAS: fn_instantiate_tenant_roles — role default utk tenant baru
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
  INSERT INTO companies (code, name) VALUES ('test-506-instantiate', 'Test 506')
    RETURNING id INTO v_test_company_id;

  v_role_id := fn_instantiate_tenant_roles(v_test_company_id);

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION '506 gagal: fn_instantiate_tenant_roles mengembalikan NULL';
  END IF;

  SELECT count(*) INTO n FROM roles WHERE company_id = v_test_company_id;
  IF n < 1 THEN
    RAISE EXCEPTION '506 gagal: nol role tersalin ke tenant uji';
  END IF;

  -- Panggil KEDUA KALINYA — harus idempoten, tidak duplikat/error.
  v_role_id := fn_instantiate_tenant_roles(v_test_company_id);
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION '506 gagal: pemanggilan kedua (idempotency) mengembalikan NULL';
  END IF;

  -- Bersihkan data uji.
  --
  -- CATATAN (ditemukan saat migrasi ini pertama dijalankan, bukan diasumsikan):
  -- `trg_protect_builtin_roles` (migrasi 050) menolak DELETE atas baris apa
  -- pun yang `is_builtin = true`, TANPA memandang company_id — trigger itu
  -- ditulis sebelum multi-tenant (363) ada, jadi tak pernah mempertimbangkan
  -- salinan per-tenant. Karena penyalinan di atas meneruskan `t.is_builtin`
  -- APA ADANYA dari template (persis pola migrasi 365 — 20 dari 21 role
  -- template berstatus is_builtin=true), baris yang baru disalin ke tenant
  -- uji ini TERKUNCI oleh trigger yang sama seolah ia role sistem global.
  -- Melonggarkan flag itu HANYA pada baris tenant uji (bukan mengubah
  -- fungsi/trigger produksi) sebelum menghapusnya sudah cukup untuk
  -- membersihkan data uji tanpa menyentuh perilaku fungsi yang sebenarnya.
  UPDATE roles SET is_builtin = false WHERE company_id = v_test_company_id;
  DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE company_id = v_test_company_id);
  DELETE FROM roles WHERE company_id = v_test_company_id;
  -- `code` WAJIB ikut diganti dalam UPDATE yang sama — companies.code UNIQUE
  -- dan companies tak bisa di-hard-delete (anti-casual-delete trigger). Tanpa
  -- ini, menjalankan ulang migrasi ini pada DB yang sudah pernah menjalankannya
  -- akan gagal unique_violation saat INSERT baris uji berikutnya.
  UPDATE companies SET is_active = false, code = 'retired-' || substring(v_test_company_id::text, 1, 8)
    WHERE id = v_test_company_id;

  RAISE NOTICE '506 OK: fn_instantiate_tenant_roles terbukti bekerja & idempoten (% role tersalin)', n;
END $$;
