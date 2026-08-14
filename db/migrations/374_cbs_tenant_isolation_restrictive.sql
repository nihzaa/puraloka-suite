-- ============================================================================
-- 374 — `cbs_templates` & `cbs_nodes`: policy tenant ADA, tapi PERMISSIVE
-- ============================================================================
--
-- ── Cacat yang berbeda dari 371/373, dan lebih halus
--
-- Kedua tabel ini SUDAH punya `tenant_isolation`, dan isinya BENAR:
--
--     USING  (company_id IS NULL OR company_id = (SELECT auth_company_id()))
--     CHECK  (company_id = (SELECT auth_company_id()))
--
-- Itu bentuk yang tepat untuk kategori AB — katalog bersama (`company_id
-- NULL`) yang boleh ditimpa tenant. Yang salah bukan syaratnya, melainkan
-- **sifatnya**: ia PERMISSIVE.
--
-- Policy PERMISSIVE digabung dengan **OR**. Jadi baris apa pun yang lolos
-- `cbs_nodes_read` (`has_permission('cecep:cbs:view')`) sudah cukup — syarat
-- tenant tak pernah perlu dipenuhi. Policy-nya ada, terlihat benar saat
-- dibaca, dan **tidak menahan apa pun**.
--
-- Ini kelas cacat yang paling sulit dilihat dari tiga yang diperbaiki hari
-- ini: 371 dan 373 kehilangan policy-nya, yang ini punya policy yang tak
-- berfungsi. Membacanya di `pg_policies` tak menunjukkan apa-apa kecuali
-- kolom `permissive` diperhatikan.
--
-- ── Yang diubah HANYA sifatnya
--
-- Syaratnya disalin apa adanya — termasuk `company_id IS NULL` yang membuat
-- katalog bersama tetap terbaca semua tenant. Mengubahnya jadi `= auth_company_id()`
-- saja akan menyembunyikan seluruh template CBS bawaan dari setiap tenant,
-- dan itu bukan perbaikan keamanan melainkan kerusakan fitur.
--
-- `WITH CHECK` sengaja TETAP tanpa cabang `IS NULL`: membaca katalog bersama
-- boleh, MENULIS ke `company_id NULL` tidak — tenant tak boleh menyunting
-- cetakan yang dipakai tenant lain.
-- ============================================================================

DO $$
DECLARE
  t text;
  n_salah int;
BEGIN
  FOREACH t IN ARRAY ARRAY['cbs_templates', 'cbs_nodes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        AS RESTRICTIVE FOR ALL
        USING (company_id IS NULL OR company_id = (SELECT auth_company_id()))
        WITH CHECK (company_id = (SELECT auth_company_id()))
    $f$, t);
  END LOOP;

  SELECT count(*) INTO n_salah
    FROM unnest(ARRAY['cbs_templates', 'cbs_nodes']) AS x(nama)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = x.nama
        AND p.policyname = 'tenant_isolation'
        AND p.permissive = 'RESTRICTIVE'
   );

  IF n_salah > 0 THEN
    RAISE EXCEPTION '374 gagal: % policy tenant masih PERMISSIVE — ia digabung OR '
                    'dengan policy izin, jadi tak menahan apa pun', n_salah;
  END IF;

  -- Katalog bersama WAJIB tetap terbaca. Kalau cabang `IS NULL` hilang,
  -- seluruh template CBS bawaan menghilang dari setiap tenant — kerusakan
  -- fitur yang menyamar sebagai perbaikan keamanan.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'cbs_templates' AND policyname = 'tenant_isolation'
       AND qual ILIKE '%company_id IS NULL%'
  ) THEN
    RAISE EXCEPTION '374 gagal: cabang katalog bersama (company_id IS NULL) hilang';
  END IF;

  RAISE NOTICE '374: dua policy CBS jadi RESTRICTIVE · katalog bersama tetap terbaca';
END $$;
