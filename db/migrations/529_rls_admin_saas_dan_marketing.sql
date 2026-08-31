-- ============================================================================
-- 529 - RLS untuk 19 tabel admin-SaaS & marketing yang tak pernah dinyalakan
-- ============================================================================
--
-- Cacat yang ditutup
--
-- Tripwire `audit-force-rls.mjs` merah di CI:
--
--     19 tabel dengan RLS MATI.
--     Itu Ember [C] - RLS aktif/mati tidak boleh dikonfigurasi.
--
-- Di basis dev ke-19-nya `rls=ON`, dan itu justru masalahnya: mereka
-- dinyalakan DI LUAR jalur migrasi. Diukur dengan memindai seluruh
-- db/migrations - migrasi 469, 470, 502, 503, 504, 505 membuat tabelnya, dan
-- tak satu pun menyalakan RLS-nya.
--
-- Kelas yang sama dengan `template_rab` (518) dan lima alur otomasi (528) hari
-- ini: keadaan yang lahir dari tindakan manual di satu mesin bukan keadaan
-- sistem (CLAUDE.md 5.5).
--
-- Dua kelompok, dua perlakuan
--
-- (a) ENAM tabel ber-`company_id` sudah punya policy dari migrasi 511/518/519:
--     tenant_feature_overrides, subscriptions, tenant_usage_counters,
--     company_saas_meta, saas_invoices, saas_invoice_line_items.
--     Yang kurang hanya ENABLE RLS-nya - tanpa itu policy-nya tak pernah
--     dievaluasi sama sekali, dan tabelnya terbaca lintas tenant meski
--     policy-nya benar. Diam, dan itu bentuk kebocoran yang paling sulit
--     terlihat.
--
-- (b) TIGA BELAS tabel katalog vendor tanpa `company_id`: plans,
--     plan_features, plan_feature_values, admin_saas_*, marketing_*.
--     Ini data KONSOL VENDOR (harga paket, halaman pemasaran, RBAC admin
--     SaaS), bukan data tenant - tak ada `company_id` untuk disaring.
--
--     RLS dinyalakan dengan satu policy PERMISSIVE baca-untuk-semua.
--     Itu bukan pelonggaran: tanpa satu pun policy permissive, tabel ber-RLS
--     TAK TERBACA SIAPA PUN (himpunan kosong OR = FALSE) - kelumpuhan yang
--     migrasi 513 harus perbaiki bulan lalu.
--
--     Yang menjaga tulisnya tetap kunci layanan: rute admin-SaaS memakai
--     service_role, dan `postgres` ber-rolbypassrls. Menaruh saringan tenant
--     di sini akan salah - datanya memang tak bertenant.
--
-- FORCE tidak dinyalakan. Tripwire ini menghitungnya terpisah dan menyebut
-- angka nol sebagai "keputusan F2-6, bukan kelalaian". Menyalakan FORCE pada
-- tabel tanpa saringan tenant tak menambah keamanan apa pun, dan pada tabel
-- (a) itu keputusan yang pantas dipisah dari perbaikan ini.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

DO $rls_admin_saas$
DECLARE
  v_tabel TEXT;
  V_SEMUA TEXT[] := ARRAY[
    'plans', 'plan_features', 'plan_feature_values', 'tenant_feature_overrides',
    'subscriptions', 'tenant_usage_counters', 'company_saas_meta',
    'saas_invoices', 'saas_invoice_line_items', 'admin_saas_roles',
    'admin_saas_permissions', 'admin_saas_role_permissions', 'admin_saas_users',
    'admin_saas_audit_log', 'marketing_pages', 'marketing_sections',
    'marketing_pricing_plans', 'marketing_testimonials', 'marketing_faqs'];
  V_KATALOG TEXT[] := ARRAY[
    'plans', 'plan_features', 'plan_feature_values', 'admin_saas_roles',
    'admin_saas_permissions', 'admin_saas_role_permissions', 'admin_saas_users',
    'admin_saas_audit_log', 'marketing_pages', 'marketing_sections',
    'marketing_pricing_plans', 'marketing_testimonials', 'marketing_faqs'];
BEGIN
  FOREACH v_tabel IN ARRAY V_SEMUA LOOP
    -- Tabel yang belum ada dilewati: migrasi pembuatnya mungkin di allowlist,
    -- dan menuduh ketiadaannya di sini menyembunyikan sebab yang sebenarnya.
    IF to_regclass('public.' || v_tabel) IS NULL THEN
      RAISE NOTICE '529: tabel % tak ada di basis ini - dilewati', v_tabel;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabel);
  END LOOP;

  -- Katalog vendor: satu policy pemberi akses, supaya tabelnya tak buntu.
  FOREACH v_tabel IN ARRAY V_KATALOG LOOP
    IF to_regclass('public.' || v_tabel) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabel || '_akses', v_tabel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)',
      v_tabel || '_akses', v_tabel);
  END LOOP;
END $rls_admin_saas$;

-- Verifikasi (pola migrasi 142)
DO $$
DECLARE
  v_tabel  TEXT;
  v_kurang TEXT := '';
  v_buntu  TEXT := '';
  n_pol    INT;
  V_SEMUA TEXT[] := ARRAY[
    'plans', 'plan_features', 'plan_feature_values', 'tenant_feature_overrides',
    'subscriptions', 'tenant_usage_counters', 'company_saas_meta',
    'saas_invoices', 'saas_invoice_line_items', 'admin_saas_roles',
    'admin_saas_permissions', 'admin_saas_role_permissions', 'admin_saas_users',
    'admin_saas_audit_log', 'marketing_pages', 'marketing_sections',
    'marketing_pricing_plans', 'marketing_testimonials', 'marketing_faqs'];
BEGIN
  FOREACH v_tabel IN ARRAY V_SEMUA LOOP
    IF to_regclass('public.' || v_tabel) IS NULL THEN CONTINUE; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = v_tabel AND c.relrowsecurity
    ) THEN
      v_kurang := v_kurang || v_tabel || ' ';
    END IF;

    /*
      Tabel ber-RLS tanpa satu pun policy PERMISSIVE tak terbaca siapa pun -
      himpunan kosong yang di-OR bernilai FALSE. Gejalanya halaman kosong
      tanpa galat, dan itu justru yang migrasi 513 harus perbaiki bulan lalu.
    */
    SELECT count(*) INTO n_pol FROM pg_policies
     WHERE schemaname = 'public' AND tablename = v_tabel AND permissive = 'PERMISSIVE';
    IF n_pol = 0 THEN
      v_buntu := v_buntu || v_tabel || ' ';
    END IF;
  END LOOP;

  IF v_kurang <> '' THEN
    RAISE EXCEPTION '529 gagal: RLS masih MATI di: %', v_kurang;
  END IF;
  IF v_buntu <> '' THEN
    RAISE EXCEPTION '529 gagal: ber-RLS tapi NOL policy permissive (tak terbaca siapa pun): %', v_buntu;
  END IF;

  RAISE NOTICE '529 OK: RLS menyala di seluruh tabel admin-SaaS & marketing yang ada, nol tabel buntu';
END $$;
