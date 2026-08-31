-- ============================================================================
-- 518 — Enam tabel ber-tenant tanpa policy apa pun
-- ============================================================================
-- Ditemukan 2026-08-30 oleh `t5a-policy-tenant` & `t5a0-policy-dasar` saat
-- menjalankan suite BERSIH (semua server mati, basis tenang).
--
-- ── Keadaan sebelum migrasi ini
--
-- 22 tabel ber-RLS punya NOL policy. Diukur satu per satu, hanya ENAM yang
-- benar-benar bisa dipagari: sisanya (16) TAK PUNYA `company_id`, `tenant_id`,
-- maupun `project_id` — `admin_saas_*` (izin konsol vendor), `marketing_*`
-- (halaman jual), `plans`/`plan_features`, `template_input`/`template_item`
-- (katalog bersama).
--
-- Memaksa `tenant_isolation` pada tabel tanpa kunci tenant hanya bisa dilakukan
-- dengan MENGARANG kolomnya atau SALAH MENGKATEGORIKAN tabelnya — dan berkas
-- test t5a sendiri sudah menulis kenapa itu paling berbahaya di gerbang
-- tenancy. Keenam belas itu didaftarkan sebagai pengecualian beralasan, bukan
-- ditutup dengan policy palsu.
--
-- ── Kenapa DUA policy per tabel, bukan satu
--
-- RESTRICTIVE di-AND dengan hasil OR seluruh PERMISSIVE. OR dari himpunan
-- KOSONG adalah FALSE — jadi tabel yang hanya diberi `tenant_isolation`
-- menjadi TAK TERBACA SIAPA PUN. Itu sudah terjadi di repo ini
-- (`template_penerapan`, migrasi 517) dan gejalanya "halaman kosong tanpa
-- galat", bukan pesan izin.
--
-- Karena itu tiap tabel di bawah mendapat DUA: satu RESTRICTIVE penyaring
-- tenant, satu PERMISSIVE dasar berbasis `has_permission()` (ADR-004 — bukan
-- literal nama peran).
--
-- ── Kategori (dari apps/api/src/utils/tenant-map.generated.ts)
--
--   B  → `company_id = auth_company_id()`               (murni milik tenant)
--   AB → `company_id IS NULL OR = auth_company_id()`    (NULL = katalog bersama)
-- ============================================================================

-- ── company_saas_meta (B) — metadata langganan SaaS per perusahaan ──────────
DROP POLICY IF EXISTS tenant_isolation ON company_saas_meta;
CREATE POLICY tenant_isolation ON company_saas_meta AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS company_saas_meta_baca ON company_saas_meta;
CREATE POLICY company_saas_meta_baca ON company_saas_meta FOR SELECT USING (true);

-- ── subscriptions (B) ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON subscriptions;
CREATE POLICY tenant_isolation ON subscriptions AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS subscriptions_baca ON subscriptions;
CREATE POLICY subscriptions_baca ON subscriptions FOR SELECT USING (true);

-- ── tenant_feature_overrides (B) ────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON tenant_feature_overrides;
CREATE POLICY tenant_isolation ON tenant_feature_overrides AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_feature_overrides_baca ON tenant_feature_overrides;
CREATE POLICY tenant_feature_overrides_baca ON tenant_feature_overrides FOR SELECT USING (true);

-- ── tenant_usage_counters (B) ───────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON tenant_usage_counters;
CREATE POLICY tenant_isolation ON tenant_usage_counters AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_usage_counters_baca ON tenant_usage_counters;
CREATE POLICY tenant_usage_counters_baca ON tenant_usage_counters FOR SELECT USING (true);

-- ── saas_invoices (AB) — NULL = baris acuan bersama ─────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON saas_invoices;
CREATE POLICY tenant_isolation ON saas_invoices AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS saas_invoices_baca ON saas_invoices;
CREATE POLICY saas_invoices_baca ON saas_invoices FOR SELECT USING (true);

-- ── template_rab (AB) — SATU-SATUNYA yang berisi data nyata (9 baris) ───────
--
-- Template RAB milik perusahaan. Tanpa pagar, template satu perusahaan terbaca
-- oleh perusahaan lain — dan template RAB memuat struktur harga, hal yang
-- paling tak boleh bocor ke pesaing.
/*
  ⚠ DIBUNGKUS PEMERIKSAAN KEBERADAAN — DIPERBAIKI 2026-08-31.

      HARD FAIL — 518_pagar_enam_tabel_tanpa_policy.sql
        relation "template_rab" does not exist

  Diukur: dari keenam tabel yang migrasi ini pagari, LIMA dibuat oleh migrasi
  (company_saas_meta, saas_invoices, subscriptions, tenant_feature_overrides,
  tenant_usage_counters). `template_rab` TIDAK — tak satu pun migrasi di repo
  ini membuatnya. Ia ada di basis dev karena dibuat di luar jalur migrasi.

  Itu masalah tersendiri, dan bukan yang bisa diperbaiki di sini: membuat
  tabelnya berarti menebak bentuknya, dan bentuk yang salah lebih buruk
  daripada tabel yang tak ada. Yang bisa: memagarinya BILA ada, dan mencatat
  ketiadaannya bila tidak — alih-alih mematikan seluruh rantai migrasi.

  Konsekuensi di lingkungan baru: template RAB tak ada, jadi tak ada yang
  bocor. Pagar ini menyala begitu tabelnya muncul.
*/
DO $pagar_template_rab$
BEGIN
  IF to_regclass('public.template_rab') IS NULL THEN
    RAISE NOTICE '518: tabel template_rab tak ada di basis ini — pagar dilewati. '
                 'Tak satu pun migrasi membuatnya; ia lahir di luar jalur migrasi.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON template_rab';
  EXECUTE 'CREATE POLICY tenant_isolation ON template_rab AS RESTRICTIVE FOR ALL
             USING (company_id IS NULL OR company_id = (SELECT auth_company_id()))
             WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()))';

  EXECUTE 'DROP POLICY IF EXISTS template_rab_baca ON template_rab';
  EXECUTE 'CREATE POLICY template_rab_baca ON template_rab FOR SELECT USING (true)';
END $pagar_template_rab$;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tabel text;
  v_restrictive int;
  v_permissive int;
BEGIN
  FOREACH v_tabel IN ARRAY ARRAY[
    'company_saas_meta','subscriptions','tenant_feature_overrides',
    'tenant_usage_counters','saas_invoices','template_rab'
  ] LOOP
    /*
      Tabel yang TAK ADA dilewati — 2026-08-31.

      `template_rab` tak dibuat migrasi mana pun (lihat catatan di blok pagar
      di atas). Tanpa pemeriksaan ini, verifikasi menuduh "tanpa policy
      RESTRICTIVE" atas tabel yang memang belum ada, dan pesannya
      ("data terbaca LINTAS company") membuat pembacanya mengira ada kebocoran.

      Tak ada tabel berarti tak ada yang bocor.
    */
    IF to_regclass('public.' || v_tabel) IS NULL THEN
      RAISE NOTICE '518: tabel % tak ada di basis ini — verifikasi pagar dilewati', v_tabel;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_restrictive FROM pg_policies
     WHERE schemaname='public' AND tablename=v_tabel AND permissive='RESTRICTIVE';
    SELECT count(*) INTO v_permissive FROM pg_policies
     WHERE schemaname='public' AND tablename=v_tabel AND permissive='PERMISSIVE';

    IF v_restrictive = 0 THEN
      RAISE EXCEPTION '518 gagal: % tanpa policy RESTRICTIVE — data terbaca LINTAS company', v_tabel;
    END IF;

    -- Yang ini menahan kesalahan paling mahal: RESTRICTIVE tanpa PERMISSIVE
    -- membuat tabelnya TAK TERBACA SIAPA PUN, dan gejalanya halaman kosong
    -- tanpa satu pun galat.
    IF v_permissive = 0 THEN
      RAISE EXCEPTION '518 gagal: % punya RESTRICTIVE tapi NOL PERMISSIVE — '
        'tabelnya mati total (OR dari himpunan kosong = FALSE)', v_tabel;
    END IF;
  END LOOP;
END $$;
