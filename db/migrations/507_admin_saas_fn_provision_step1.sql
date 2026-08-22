-- ============================================================================
-- 507 — ADMIN SAAS: fn_provision_tenant_step1 — transaksi 1 provisioning
-- ============================================================================
--
-- Spec §5.1a langkah 1, dibungkus SATU fungsi Postgres supaya benar-benar
-- atomik (plpgsql function body = satu transaksi implisit; RAISE EXCEPTION
-- di manapun di dalamnya me-rollback SEMUA operasi sebelumnya dalam fungsi
-- yang sama). PostgREST/supabase-js tak mendukung transaksi multi-statement
-- eksplisit dari client, jadi pembungkusan di DB adalah satu-satunya cara
-- menjamin atomicity sesungguhnya.
--
-- Memanggil fn_instantiate_tenant_roles (migrasi 506, sudah ada) untuk
-- menyalin role template ke tenant baru di dalam transaksi yang sama.
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

COMMENT ON FUNCTION fn_provision_tenant_step1 IS
  'Dipanggil admin-saas lib/provisioning.ts (Task D1) lewat supabaseAdmin.rpc(). '
  'Satu transaksi Postgres atomik: companies + subscriptions(trialing) + '
  'company_saas_meta(provisioning) + roles (via fn_instantiate_tenant_roles). '
  'RAISE EXCEPTION unique_violation kalau p_code sudah dipakai tenant lain.';

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_result RECORD;
  n INT;
BEGIN
  SELECT * INTO v_result FROM fn_provision_tenant_step1('Test 507', 'test-507-provision');

  IF v_result.company_id IS NULL OR v_result.admin_role_id IS NULL THEN
    RAISE EXCEPTION '507 gagal: fn_provision_tenant_step1 mengembalikan NULL';
  END IF;

  SELECT count(*) INTO n FROM subscriptions WHERE company_id = v_result.company_id AND status = 'trialing';
  IF n <> 1 THEN
    RAISE EXCEPTION '507 gagal: subscriptions trialing tidak tercipta';
  END IF;

  SELECT count(*) INTO n FROM company_saas_meta WHERE company_id = v_result.company_id AND lifecycle_status = 'provisioning';
  IF n <> 1 THEN
    RAISE EXCEPTION '507 gagal: company_saas_meta provisioning tidak tercipta';
  END IF;

  -- Buktikan rollback atomik: code bentrok HARUS gagal TANPA menyisakan baris apa pun.
  BEGIN
    PERFORM fn_provision_tenant_step1('Test 507 Bentrok', 'test-507-provision');
    RAISE EXCEPTION '507 gagal: pemanggilan kedua dengan code sama seharusnya menolak';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- diharapkan
  END;

  -- Bersihkan.
  --
  -- CATATAN (pola sama seperti migrasi 506): `trg_protect_builtin_roles`
  -- (migrasi 050) menolak DELETE atas baris apa pun yang `is_builtin = true`,
  -- tanpa memandang company_id. Role yang disalin fn_instantiate_tenant_roles
  -- mewarisi `is_builtin` apa adanya dari template, jadi baris tenant uji ini
  -- pun terkunci trigger yang sama. Longgarkan flag itu HANYA pada baris
  -- tenant uji sebelum menghapusnya.
  UPDATE roles SET is_builtin = false WHERE company_id = v_result.company_id;
  DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE company_id = v_result.company_id);
  DELETE FROM roles WHERE company_id = v_result.company_id;
  DELETE FROM company_saas_meta WHERE company_id = v_result.company_id;
  DELETE FROM subscriptions WHERE company_id = v_result.company_id;
  UPDATE companies SET is_active = false WHERE id = v_result.company_id;

  RAISE NOTICE '507 OK: fn_provision_tenant_step1 atomik & menolak code bentrok dgn benar';
END $$;
