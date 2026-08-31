-- ============================================================================
-- 541 — `template_rab` TERBACA LINTAS TENANT di tiap basis baru
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Test tenancy merah di CI shard 4, dan kalimatnya sudah menyebut akibatnya:
--
--     Policy permisif tanpa syarat di tabel ber-company_id TANPA policy
--     restrictive yang mempersempitnya = data terbaca lintas company.
--       expected [ 'template_rab.template_rab_baca' ] to deeply equal []
--
-- `template_rab` memuat struktur harga milik satu perusahaan — hal yang paling
-- tak boleh terbaca pesaing. Migrasi 518 sendiri menulis alasan itu.
--
-- ── Kenapa dev terlihat AMAN dan CI merah — ini cacat URUTAN, bukan cacat isi
--
-- Ketiga migrasinya benar sendiri-sendiri. Yang salah urutannya:
--
--     518  memagari template_rab … tapi MELEWATINYA, karena saat itu tabelnya
--          belum ada. 518 menulis alasannya sendiri: "tak satu pun migrasi di
--          repo ini membuatnya."
--     532  MEMBUAT template_rab — nomornya 532, jadi lompatan di 518 sudah
--          terjadi dan tak akan diulang.
--     535  menyalakan RLS + `USING (true)` supaya tabelnya tak buntu.
--
-- Hasilnya di basis BARU: satu PERMISSIVE tanpa syarat, nol RESTRICTIVE.
-- Himpunan permissive digabung OR, jadi `USING (true)` membuka seluruh isi
-- tabel ke setiap tenant.
--
-- Di dev tak kelihatan karena di sana `template_rab` sudah ada lebih dulu
-- (lahir di luar jalur migrasi), jadi 518 TIDAK melewatinya dan pagarnya
-- terpasang. Diukur — dengan pagar itu dibuang di transaksi yang dibatalkan,
-- dev memperlihatkan kebocoran yang sama persis:
--
--     policy template_rab sesudah meniru rantai baru:
--        PERMISSIVE  template_rab_baca
--     restrictive=0 permissive=1  → TERBACA LINTAS TENANT.
--
-- Ini bentuk yang sama dengan cacat 047↔167 di CLAUDE.md §5.5, dan pelajaran
-- yang sama: hijaunya satu basis bukan bukti basis lain benar. Yang menemukan
-- ini bukan pembacaan kode — melainkan CI yang memutar rantai dari nol.
--
-- ── Kenapa migrasi baru, bukan menyunting 518 atau 532
--
-- 518, 532, dan 535 semuanya SUDAH TERCATAT di buku migrasi. Menyuntingnya
-- menghasilkan perbaikan yang tak pernah dijalankan di lingkungan yang sudah
-- memutarnya — Gerbang Keras G-2. Perbaikan maju bekerja di kedua keadaan.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

DO $pagar_template_rab$
BEGIN
  IF to_regclass('public.template_rab') IS NULL THEN
    RAISE NOTICE '541: template_rab tak ada di basis ini — dilewati. Bukan galat.';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.template_rab ENABLE ROW LEVEL SECURITY';

  /*
    Bentuknya SAMA PERSIS dengan yang 518 pasang untuk tabel ini — sengaja.
    Pagar yang berbeda bentuk antar-tabel adalah pagar yang tak bisa dibaca
    sekaligus, dan `company_id IS NULL` mempertahankan baris TEMPLATE bersama
    tetap terbaca semua tenant.
  */
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.template_rab';
  EXECUTE 'CREATE POLICY tenant_isolation ON public.template_rab AS RESTRICTIVE FOR ALL
             USING (company_id IS NULL OR company_id = (SELECT auth_company_id()))
             WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()))';
END $pagar_template_rab$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_rest INT;
  n_perm INT;
  b_rls  BOOLEAN;
BEGIN
  IF to_regclass('public.template_rab') IS NULL THEN RETURN; END IF;

  SELECT c.relrowsecurity INTO b_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'template_rab';
  IF NOT b_rls THEN
    RAISE EXCEPTION '541 gagal: RLS mati di template_rab';
  END IF;

  SELECT count(*) FILTER (WHERE permissive = 'RESTRICTIVE'),
         count(*) FILTER (WHERE permissive = 'PERMISSIVE')
    INTO n_rest, n_perm
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'template_rab';

  -- Nol RESTRICTIVE + ada PERMISSIVE tanpa syarat = persis cacat yang ditutup.
  IF n_rest = 0 THEN
    RAISE EXCEPTION '541 gagal: template_rab tanpa pagar RESTRICTIVE — terbaca lintas tenant';
  END IF;

  -- Dan tak boleh berayun ke cacat sebaliknya: himpunan permissive KOSONG
  -- bernilai FALSE, jadi tabelnya tak terbaca siapa pun (pelajaran migrasi 513).
  IF n_perm = 0 THEN
    RAISE EXCEPTION '541 gagal: template_rab tanpa satu pun PERMISSIVE — buntu bagi semua orang';
  END IF;

  RAISE NOTICE '541 OK: template_rab berpagar (% restrictive, % permissive)', n_rest, n_perm;
END $$;
