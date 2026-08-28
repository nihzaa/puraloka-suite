-- ============================================================================
-- 514 · Dua tabel item yang pagarnya PERMISSIVE — jadi tak memagari apa pun
-- ============================================================================
--
-- Ditemukan oleh `t5a-policy-tenant.test.ts`, bukan oleh penjaga skrip:
--
--     penawaran_item        · tenant_isolation             PERMISSIVE
--     penawaran_subkon_item · penawaran_subkon_item_tenant PERMISSIVE
--
-- Isinya sudah benar — keduanya menelusuri induk (`penawaran_id`) untuk sampai
-- ke `company_id`, pola kategori C yang tepat. Yang salah cuma SIFATNYA.
--
-- Policy PERMISSIVE digabung dengan **OR**: alih-alih membatasi, ia MENAMBAH
-- satu jalan masuk. Di `penawaran_subkon_item` akibatnya langsung terlihat —
-- ia bersanding dengan dua policy izin (`…_baca`, `…_kelola`) yang tak menyebut
-- tenant sama sekali, sehingga pemegang `projects:view` membaca item penawaran
-- SELURUH tenant. Pagar yang namanya `…_tenant` justru tak menahan apa pun.
--
-- Ini kelas cacat yang sama dengan migrasi 512, pada tabel yang saat itu
-- terlewat karena daftarnya ditulis tangan. Penjaga
-- `audit-tabel-force-berpagar.mjs` juga tak menangkapnya: ia hanya memeriksa
-- tabel ber-`company_id`, sementara keduanya kategori C — tenancy-nya lewat
-- induk, tanpa kolom `company_id` sendiri.
--
-- ── Kenapa policy akses dipisah
--
-- `penawaran_item` hanya punya SATU policy. Mengubahnya jadi RESTRICTIVE tanpa
-- menambah pemberi akses akan membuat tabelnya tak terbaca siapa pun —
-- himpunan permissive kosong bernilai FALSE. Itu persis cacat yang migrasi 513
-- baru saja perbaiki, dan mengulanginya di sini akan menukar satu cacat dengan
-- cacat lain yang lebih sulit dilihat.
--
-- `penawaran_subkon_item` sudah punya dua pemberi akses berbasis izin, jadi ia
-- hanya perlu pagarnya dikeraskan.
--
-- ── Idempoten: DROP IF EXISTS sebelum tiap CREATE.
-- ============================================================================

DO $$
DECLARE
  n_sisa int;
BEGIN
  -- ── penawaran_item ────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM pg_class
              WHERE relnamespace = 'public'::regnamespace AND relname = 'penawaran_item') THEN

    /* Pagar: kategori C — telusuri induk untuk sampai ke company. */
    DROP POLICY IF EXISTS tenant_isolation ON public.penawaran_item;
    CREATE POLICY tenant_isolation ON public.penawaran_item AS RESTRICTIVE FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.penawaran p
         WHERE p.id = penawaran_item.penawaran_id
           AND p.company_id = (SELECT auth_company_id())))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.penawaran p
         WHERE p.id = penawaran_item.penawaran_id
           AND p.company_id = (SELECT auth_company_id())));

    /* Pemberi akses — tanpa ini tabelnya buntu (cacat 149/511). */
    DROP POLICY IF EXISTS penawaran_item_akses ON public.penawaran_item;
    CREATE POLICY penawaran_item_akses ON public.penawaran_item
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- ── penawaran_subkon_item ─────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM pg_class
              WHERE relnamespace = 'public'::regnamespace AND relname = 'penawaran_subkon_item') THEN

    /* Sudah punya dua pemberi akses berbasis izin; yang kurang pagarnya. */
    DROP POLICY IF EXISTS penawaran_subkon_item_tenant ON public.penawaran_subkon_item;
    CREATE POLICY penawaran_subkon_item_tenant ON public.penawaran_subkon_item
      AS RESTRICTIVE FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.penawaran_subkon p
          JOIN public.tender_subkon t ON t.id = p.tender_id
         WHERE p.id = penawaran_subkon_item.penawaran_id
           AND project_company_id(t.project_id) = (SELECT auth_company_id())));
  END IF;

  -- ── VERIFIKASI ────────────────────────────────────────────────────────

  /* Keduanya wajib punya pagar RESTRICTIVE sekarang. */
  SELECT count(*) INTO n_sisa
    FROM (VALUES ('penawaran_item'), ('penawaran_subkon_item')) AS v(tabel)
   WHERE EXISTS (SELECT 1 FROM pg_class
                  WHERE relnamespace = 'public'::regnamespace AND relname = v.tabel)
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = v.tabel
                        AND p.permissive = 'RESTRICTIVE');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION '514 gagal: % tabel item masih tanpa pagar RESTRICTIVE', n_sisa;
  END IF;

  /* Dan tak boleh ada yang jadi buntu — pelajaran 511. */
  SELECT count(*) INTO n_sisa
    FROM (VALUES ('penawaran_item'), ('penawaran_subkon_item')) AS v(tabel)
   WHERE EXISTS (SELECT 1 FROM pg_class
                  WHERE relnamespace = 'public'::regnamespace AND relname = v.tabel)
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = v.tabel
                        AND p.permissive = 'PERMISSIVE');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION
      '514 gagal: % tabel item tanpa pemberi akses PERMISSIVE — tak terbaca siapa pun', n_sisa;
  END IF;

  RAISE NOTICE '514 OK: dua tabel item berpagar RESTRICTIVE, keduanya tetap terbaca';
END $$;
