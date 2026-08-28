-- ============================================================================
-- 515 · `takeoff_dimensi` tanpa pagar tenant sama sekali, dan satu nama yang
--       menyimpang dari konvensi 248 tabel lain
-- ============================================================================
--
-- ══════════════════════════════════════════════════════════════════════════
-- 1. takeoff_dimensi — DUA policy izin, NOL pagar tenant
-- ══════════════════════════════════════════════════════════════════════════
--
-- Diukur 2026-08-28:
--
--     takeoff_dimensi_read  [PERMISSIVE]  has_permission('cecep:takeoff:view')
--     takeoff_dimensi_write [PERMISSIVE]  has_permission('cecep:takeoff:manage')
--
-- Itu saja. Tak ada satu pun policy yang menyebut tenant, dan tabelnya tak
-- punya `company_id` sendiri — tenancy-nya diwarisi lewat `estimate_item_id`.
--
-- Artinya siapa pun yang memegang `cecep:takeoff:view` membaca dimensi take-off
-- SELURUH tenant: panjang, lebar, tinggi, dan volume tiap elemen pekerjaan
-- perusahaan lain. Itu isi RAB mereka.
--
-- Kenapa lolos sejauh ini: RLS-nya `ENABLE` tapi tidak `FORCE`, dan peran API
-- ber-`bypassrls`, jadi policy-nya memang tak pernah dievaluasi. Cacatnya baru
-- terlihat begitu jalur ber-token pengguna dipasang (T5c langkah 2).
--
-- Penjaga `audit-tabel-force-berpagar.mjs` juga tak menangkapnya — ia hanya
-- memeriksa tabel ber-`company_id`. Tabel kategori C berada di titik buta itu,
-- dan justru di sanalah pagar paling mudah terlupa: tak ada kolom yang
-- mengingatkan penulis migrasi bahwa tabel ini milik seseorang.
--
-- Pola pagarnya menyalin `estimate_items`, saudara satu rantai:
--   `t5_company_dari_estimate_version(estimate_version_id) = auth_company_id()`
-- Bedanya satu hop lebih jauh — lewat `estimate_items` dulu.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 2. penawaran_subkon_item — pagarnya benar, namanya menyimpang
-- ══════════════════════════════════════════════════════════════════════════
--
-- Migrasi 514 sudah menjadikannya RESTRICTIVE, tapi namanya
-- `penawaran_subkon_item_tenant`, sementara 248 tabel lain memakai
-- `tenant_isolation`.
--
-- Ini bukan kerapian belaka. `t5a-policy-tenant.test.ts` mencari policy
-- BERNAMA `tenant_isolation` untuk memastikan tiap tabel ber-tenant berpagar —
-- dan penjaga yang bekerja dari nama akan melewatkan tabel yang menamai
-- pagarnya sendiri-sendiri. Tabel yang lolos dari penjaga karena namanya beda
-- adalah tabel yang tak dijaga siapa pun.
--
-- ── Idempoten: DROP IF EXISTS sebelum tiap CREATE.
-- ============================================================================

DO $$
DECLARE
  n_sisa int;
BEGIN
  -- ── 1. takeoff_dimensi ────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM pg_class
              WHERE relnamespace = 'public'::regnamespace AND relname = 'takeoff_dimensi') THEN

    ALTER TABLE public.takeoff_dimensi ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.takeoff_dimensi FORCE  ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tenant_isolation ON public.takeoff_dimensi;
    CREATE POLICY tenant_isolation ON public.takeoff_dimensi AS RESTRICTIVE FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.estimate_items ei
         WHERE ei.id = takeoff_dimensi.estimate_item_id
           AND t5_company_dari_estimate_version(ei.estimate_version_id)
               = (SELECT auth_company_id())))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.estimate_items ei
         WHERE ei.id = takeoff_dimensi.estimate_item_id
           AND t5_company_dari_estimate_version(ei.estimate_version_id)
               = (SELECT auth_company_id())));
  END IF;

  -- ── 2. penawaran_subkon_item: nama diseragamkan ───────────────────────
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'penawaran_subkon_item'
                AND policyname = 'penawaran_subkon_item_tenant') THEN

    DROP POLICY penawaran_subkon_item_tenant ON public.penawaran_subkon_item;
    DROP POLICY IF EXISTS tenant_isolation ON public.penawaran_subkon_item;
    CREATE POLICY tenant_isolation ON public.penawaran_subkon_item
      AS RESTRICTIVE FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.penawaran_subkon p
          JOIN public.tender_subkon t ON t.id = p.tender_id
         WHERE p.id = penawaran_subkon_item.penawaran_id
           AND project_company_id(t.project_id) = (SELECT auth_company_id())));
  END IF;

  -- ── VERIFIKASI ────────────────────────────────────────────────────────

  /* Keduanya wajib berpagar RESTRICTIVE bernama `tenant_isolation`. */
  SELECT count(*) INTO n_sisa
    FROM (VALUES ('takeoff_dimensi'), ('penawaran_subkon_item')) AS v(tabel)
   WHERE EXISTS (SELECT 1 FROM pg_class
                  WHERE relnamespace = 'public'::regnamespace AND relname = v.tabel)
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = v.tabel
                        AND p.policyname = 'tenant_isolation'
                        AND p.permissive = 'RESTRICTIVE');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION '515 gagal: % tabel masih tanpa tenant_isolation RESTRICTIVE', n_sisa;
  END IF;

  /* Tak boleh jadi buntu — pelajaran 511/513. */
  SELECT count(*) INTO n_sisa
    FROM (VALUES ('takeoff_dimensi'), ('penawaran_subkon_item')) AS v(tabel)
   WHERE EXISTS (SELECT 1 FROM pg_class
                  WHERE relnamespace = 'public'::regnamespace AND relname = v.tabel)
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = v.tabel
                        AND p.permissive = 'PERMISSIVE');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION '515 gagal: % tabel tanpa pemberi akses — tak terbaca siapa pun', n_sisa;
  END IF;

  RAISE NOTICE '515 OK: takeoff_dimensi berpagar; nama policy seragam di seluruh basis';
END $$;
