-- ============================================================================
-- 182 — Dua celah yang HANYA muncul di lingkungan CI.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA MIGRASI INI ADA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Test F2-4/F2-5 hijau di dev, MERAH di CI. Bacaan pertama menuduh test-nya
-- rapuh. Bukan — keduanya menemukan celah nyata yang tak ada di dev:
--
--   1. `field_opname_reports` (migrasi 044) — nol policy tenant. Tabelnya tak
--      pernah dibuat di database dev, jadi tak ada yang bisa melihatnya dari
--      sana. CI membangun schema dari NOL lewat replay seluruh migrasi, dan di
--      situlah ia lahir.
--
--   2. `project-photos` masih `public = true` di CI. Migrasi 098 memprivatkan
--      bucket, tetapi `INSERT ... ON CONFLICT` di migrasi 012 mengembalikannya
--      saat replay — sama persis dengan cacat policy yang F2-5 temukan, hanya
--      pada kolom `public` alih-alih pada policy.
--
-- Keduanya membenarkan keputusan menulis test yang memindai SELURUH tabel dan
-- SELURUH bucket, bukan yang sedang dikerjakan saja: dev dan CI adalah dua
-- kenyataan yang berbeda, dan yang lebih bersih justru CI.
-- ============================================================================

-- ── 1. field_opname_reports — kategori C, tenancy lewat projects ────────────
--
-- `project_id UUID NOT NULL REFERENCES projects(id)` (migrasi 044 baris 12).
-- Rantainya sehat; yang hilang hanya policy-nya.
--
-- Pola disalin dari 27 tabel kategori C lain yang sudah memakainya:
-- `project_company_id(project_id) = auth_company_id()`.

DO $$
DECLARE v_permissive int;
BEGIN
  IF to_regclass('public.field_opname_reports') IS NULL THEN
    RAISE NOTICE '182: field_opname_reports tak ada di lingkungan ini — dilewati.';
    RETURN;
  END IF;

  ALTER TABLE field_opname_reports ENABLE ROW LEVEL SECURITY;

  -- ⚠️ RESTRICTIVE sendirian MEMATIKAN tabel (T1-F3, migrasi 131). Bila belum
  -- ada PERMISSIVE sama sekali, buat satu lebih dulu — bukan gagal, karena
  -- tabel ini memang belum pernah punya policy apa pun.
  SELECT count(*) INTO v_permissive FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'field_opname_reports'
     AND permissive = 'PERMISSIVE';

  IF v_permissive = 0 THEN
    EXECUTE $p$
      CREATE POLICY field_opname_reports_akses ON field_opname_reports
        FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
    $p$;
    RAISE NOTICE '182: policy PERMISSIVE dasar dibuat — RESTRICTIVE di bawah '
                 'yang menyaring tenant.';
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON field_opname_reports';
  EXECUTE $p$
    CREATE POLICY tenant_isolation ON field_opname_reports
      AS RESTRICTIVE FOR ALL
      USING (project_company_id(project_id) = (SELECT auth_company_id()))
      WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()))
  $p$;

  RAISE NOTICE '182: field_opname_reports terisolasi lewat project_company_id.';
END $$;

-- ── 2. project-photos WAJIB privat ─────────────────────────────────────────
--
-- Bucket `public = true` berarti berkasnya bisa diambil lewat URL TANPA
-- autentikasi apa pun — policy tak berlaku di jalur itu. Untuk foto progres
-- proyek (lokasi, kondisi lapangan, kadang wajah pekerja) itu tak bisa
-- diterima.
UPDATE storage.buckets SET public = false WHERE id = 'project-photos' AND public;

-- ── Penegas ────────────────────────────────────────────────────────────────
--
-- Migrasi yang "berhasil" tanpa mencapai maksudnya adalah kegagalan yang
-- menyamar.
DO $$
DECLARE v_publik int; v_tanpa int;
BEGIN
  SELECT count(*) INTO v_publik FROM storage.buckets
   WHERE id IN ('project-photos','payment-proofs','expense-receipts',
                'kasbon-photos','project-documents')
     AND public;
  IF v_publik > 0 THEN
    RAISE EXCEPTION '182: masih ada % bucket berisi data tenant yang public.', v_publik;
  END IF;

  SELECT count(*) INTO v_tanpa FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'field_opname_reports'
     AND permissive = 'RESTRICTIVE' AND qual LIKE '%auth_company_id%';
  IF to_regclass('public.field_opname_reports') IS NOT NULL AND v_tanpa = 0 THEN
    RAISE EXCEPTION '182: field_opname_reports tetap tanpa penyaring tenant.';
  END IF;
END $$;
