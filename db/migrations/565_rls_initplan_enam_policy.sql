-- ═══════════════════════════════════════════════════════════════════════════
-- 565 — ENAM policy memanggil `auth_company_id()` SEKALI PER BARIS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ditemukan 2026-09-04 oleh `rls-initplan.test.ts`, yang akhirnya berjalan
-- sesudah rantai migrasi bisa diputar penuh dari nol. Test ini MERAH di basis
-- dev juga — jadi cacatnya sudah ada sebelum PR multi-tenant, hanya tak pernah
-- terlihat karena suite API mati di penyiapan basis.
--
--     entitlement_snapshot   entitlement_baca_tenant · entitlement_pagar_tenant
--     situs_domain           situs_domain_baca · situs_domain_pagar
--     tagihan_tenant         tagihan_tenant_baca · tagihan_tenant_pagar
--
-- Dua di antaranya milik migrasi 564 — yang saya tulis sendiri hari ini.
--
-- ── Kenapa ini bukan soal gaya penulisan
--
-- `company_id = auth_company_id()` memanggil fungsinya SEKALI UNTUK TIAP BARIS
-- yang dipindai. Dibungkus `(SELECT …)`, Postgres mengangkatnya jadi InitPlan
-- dan memanggilnya SEKALI untuk seluruh query.
--
-- Bedanya tak terlihat pada tabel berisi lima baris, dan tak menghasilkan
-- galat apa pun. Ia muncul sebagai kelambatan yang tumbuh sebanding jumlah
-- baris — gejala yang paling mudah disalahkan pada "datanya sudah banyak"
-- alih-alih pada policy-nya.
--
-- ── Kenapa migrasi MAJU, bukan menyunting 564
--
-- 564 sudah tercatat jalan (CLAUDE.md §5.5). Dan `entitlement_snapshot` serta
-- `tagihan_tenant` lahir dari migrasi lain lagi — satu migrasi maju
-- memperbaiki ketiganya sekaligus, sementara menyunting tiga berkas lama tak
-- akan berlaku di basis yang sudah menjalankannya.
--
-- Idempoten: `CREATE OR REPLACE`-nya lewat DROP + CREATE bernama sama.
-- Verifikasi di blok akhir membuktikan nol tersisa.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── situs_domain (migrasi 564) ──────────────────────────────────────────────
DROP POLICY IF EXISTS situs_domain_baca ON situs_domain;
CREATE POLICY situs_domain_baca ON situs_domain
  FOR ALL USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS situs_domain_pagar ON situs_domain;
CREATE POLICY situs_domain_pagar ON situs_domain
  AS RESTRICTIVE FOR ALL USING (company_id = (SELECT auth_company_id()));

-- ── entitlement_snapshot & tagihan_tenant ───────────────────────────────────
--
-- Bentuk aslinya dibaca dari `pg_policies` lalu ditulis ulang dengan bungkus
-- InitPlan. Nama policy dipertahankan supaya penjaga lain yang menyaring
-- lewat nama tetap menemukannya.
DO $$
DECLARE
  r RECORD;
  v_qual TEXT;
  v_check TEXT;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, permissive, cmd, qual, with_check, roles
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('entitlement_snapshot', 'tagihan_tenant')
       AND (coalesce(qual,'') LIKE '%auth_company_id()%'
            OR coalesce(with_check,'') LIKE '%auth_company_id()%')
       AND coalesce(qual,'') NOT LIKE '%SELECT auth_company_id()%'
       AND coalesce(with_check,'') NOT LIKE '%SELECT auth_company_id()%'
  LOOP
    /*
      Penggantian dilakukan pada TEKS ekspresi, bukan dengan menyusun ulang
      policy dari nol — bentuk aslinya bisa memuat syarat lain (izin, status)
      yang tak boleh hilang. Yang diganti hanya panggilan telanjangnya.
    */
    v_qual  := replace(coalesce(r.qual, ''),       'auth_company_id()', '( SELECT auth_company_id() )');
    v_check := replace(coalesce(r.with_check, ''), 'auth_company_id()', '( SELECT auth_company_id() )');

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, r.tablename,
      CASE WHEN r.permissive = 'RESTRICTIVE' THEN 'RESTRICTIVE' ELSE 'PERMISSIVE' END,
      CASE WHEN r.cmd = 'ALL' THEN 'ALL' ELSE r.cmd END,
      array_to_string(r.roles, ', '),
      CASE WHEN v_qual  <> '' THEN ' USING (' || v_qual || ')' ELSE '' END,
      CASE WHEN v_check <> '' THEN ' WITH CHECK (' || v_check || ')' ELSE '' END
    );
    n := n + 1;
  END LOOP;

  RAISE NOTICE '565: % policy ditulis ulang jadi InitPlan', n;
END $$;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_sisa INT;
  v_sisa TEXT;
BEGIN
  SELECT count(*), string_agg(tablename || '.' || policyname, ', ')
    INTO n_sisa, v_sisa
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (coalesce(qual,'') LIKE '%auth_company_id()%'
          OR coalesce(with_check,'') LIKE '%auth_company_id()%')
     AND coalesce(qual,'') NOT LIKE '%SELECT auth_company_id()%'
     AND coalesce(with_check,'') NOT LIKE '%SELECT auth_company_id()%';

  IF n_sisa > 0 THEN
    RAISE EXCEPTION '565 gagal: masih % policy memanggil helper per baris: %',
      n_sisa, left(coalesce(v_sisa, ''), 200);
  END IF;

  /*
    Kedua policy `situs_domain` WAJIB tetap ada sesudah ditulis ulang.
    Menghapus tanpa membuat ulang akan membuka isolasi tenant tabel itu —
    kerusakan yang jauh lebih besar daripada kelambatan yang sedang
    diperbaiki, dan tak mengeluarkan galat apa pun.
  */
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'situs_domain') < 2 THEN
    RAISE EXCEPTION '565 gagal: situs_domain kehilangan policy — isolasi tenant terbuka';
  END IF;

  RAISE NOTICE '565 OK — nol policy memanggil auth_company_id() per baris';
END $$;
