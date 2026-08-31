-- ============================================================================
-- 533 — 40 policy yang masih memanggil helper konstan PER BARIS
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Test `t7-exit-criteria-l2.test.ts` kriteria 6 merah:
--
--     policy memanggil helper per baris — lihat migration 132:
--       expected [ …(55) ] to deeply equal []
--
-- Sesudah migrasi 214 dan 216 diterapkan, 15 di antaranya hilang (tabel
-- jadwal). Sisa 40 pada 20 tabel CECEP dan katalog: assemblies, resources,
-- estimate_items, cbs_templates, ahsp_editions, steel_profiles, rebar_takeoff,
-- scenarios, formula_definitions, lessons_learned_records, dan sepuluh lainnya.
--
-- ── Kenapa ini bukan sekadar optimasi
--
-- Migrasi 132 sudah menuliskan alasannya, dengan angka: satu policy yang
-- memanggil `has_permission()` telanjang menjalankan join 3 tabel PER BARIS.
-- Pada 17.853 baris itu 3,6 detik. Helper yang sama dibungkus `(SELECT ...)`
-- terukur 0,37 ms — sekali, bukan per baris.
--
-- Dan kriteria keluar T7-L2 menyebut konsekuensinya: "biaya RLS tidak membuat
-- sistem tak terpakai". RLS yang lambat berakhir DIMATIKAN — oleh orang yang
-- sama yang memintanya dipasang.
--
-- ── Kenapa generik, bukan 40 pernyataan tulisan tangan
--
-- Migrasi 132 menulis ulang tiap policy secara harfiah, dan itu benar untuk
-- gelombang pertama: definisinya perlu dibaca manusia satu per satu.
--
-- Untuk sisa ini bentuknya seragam — yang berubah hanya `helper(...)` menjadi
-- `(SELECT helper(...))`, tak ada logika yang disentuh. Menulis 40 pernyataan
-- tangan justru menambah peluang salah ketik pada policy yang menjaga akses
-- data, dan tiap salah ketik di sana membuka atau menutup akses diam-diam.
--
-- Yang dilakukan: definisi dibaca dari katalog, dibungkus dengan regex yang
-- HANYA menyentuh nama helper yang terdaftar, lalu policy dibuat ulang dengan
-- perintah, sifat (PERMISSIVE/RESTRICTIVE), dan peran yang SAMA PERSIS.
--
-- Verifikasi di bawah membandingkan hasil akhirnya terhadap aturan yang sama
-- yang dipakai test — jadi kalau regex-nya meleset, migrasi ini gagal, bukan
-- test-nya besok.
--
-- Idempoten: policy yang sudah ber-InitPlan tak tersentuh.

DO $initplan_sisa$
DECLARE
  r          RECORD;
  v_qual     TEXT;
  v_check    TEXT;
  v_cmd      TEXT;
  v_peran    TEXT;
  n_ubah     INT := 0;
  -- Helper konstan sepanjang satu statement. Daftar ini SAMA dengan yang
  -- dipakai `t7-exit-criteria-l2.test.ts`; menambah nama di sini tanpa
  -- menambahnya di sana membuat keduanya menjawab pertanyaan berbeda.
  HELPER TEXT := '(has_permission|auth_role|auth_user_id|auth_client_id|auth_company_id)';
BEGIN
  FOR r IN
    SELECT p.polname, c.relname,
           pg_get_expr(p.polqual, p.polrelid)      AS qual,
           pg_get_expr(p.polwithcheck, p.polrelid) AS wcheck,
           p.polcmd, p.polpermissive, p.polroles
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
  LOOP
    /*
      Telanjang = helper muncul TANPA didahului `(SELECT `.

      Yang sudah dibungkus diganti penanda lebih dulu, lalu sisanya diperiksa.
      Tanpa langkah itu, policy yang SUDAH benar akan ikut ditulis ulang —
      tak merusak, tapi menyembunyikan berapa yang sesungguhnya berubah.
    */
    IF NOT (
      regexp_replace(coalesce(r.qual, ''),
        '\(\s*SELECT\s+' || HELPER || '\s*\([^()]*\)[^()]*\)', 'INITPLAN', 'gi')
        ~* ('(^|[^.[:alnum:]_])' || HELPER || '[[:space:]]*\(')
      OR
      regexp_replace(coalesce(r.wcheck, ''),
        '\(\s*SELECT\s+' || HELPER || '\s*\([^()]*\)[^()]*\)', 'INITPLAN', 'gi')
        ~* ('(^|[^.[:alnum:]_])' || HELPER || '[[:space:]]*\(')
    ) THEN
      CONTINUE;
    END IF;

    -- Bungkus tiap panggilan helper yang belum dibungkus.
    v_qual := regexp_replace(coalesce(r.qual, ''),
      '(^|[^.[:alnum:]_])' || HELPER || '\s*\(([^()]*)\)',
      '\1(SELECT \2(\3))', 'gi');
    v_check := regexp_replace(coalesce(r.wcheck, ''),
      '(^|[^.[:alnum:]_])' || HELPER || '\s*\(([^()]*)\)',
      '\1(SELECT \2(\3))', 'gi');

    v_cmd := CASE r.polcmd
               WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
               WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
               ELSE 'ALL' END;

    -- Peran dipertahankan apa adanya. `0` di `polroles` berarti PUBLIC.
    SELECT CASE
             WHEN r.polroles = '{0}'::oid[] THEN 'public'
             ELSE (SELECT string_agg(quote_ident(rolname), ', ')
                     FROM pg_roles WHERE oid = ANY(r.polroles))
           END INTO v_peran;

    EXECUTE format('DROP POLICY %I ON public.%I', r.polname, r.relname);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s %s',
      r.polname, r.relname,
      CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      v_cmd, v_peran,
      CASE WHEN r.qual   IS NOT NULL THEN 'USING (' || v_qual || ')'  ELSE '' END,
      CASE WHEN r.wcheck IS NOT NULL THEN 'WITH CHECK (' || v_check || ')' ELSE '' END);

    n_ubah := n_ubah + 1;
  END LOOP;

  RAISE NOTICE '533: % policy dibungkus InitPlan', n_ubah;
END $initplan_sisa$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_sisa  INT;
  v_sisa  TEXT;
  HELPER TEXT := '(has_permission|auth_role|auth_user_id|auth_client_id|auth_company_id)';
BEGIN
  /*
    Aturan yang SAMA PERSIS dengan `t7-exit-criteria-l2.test.ts` kriteria 6.

    Kalau regex pembungkus di atas meleset, yang gagal migrasi ini — bukan
    test besok, di tempat yang jauh dari sebabnya.
  */
  SELECT count(*), string_agg(tablename || '.' || policyname, ', ')
    INTO n_sisa, v_sisa
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (
       regexp_replace(coalesce(qual, ''),
         '\(\s*SELECT\s+' || HELPER || '\s*\([^()]*\)[^()]*\)', 'INITPLAN', 'gi')
         ~* ('(^|[^.[:alnum:]_])' || HELPER || '[[:space:]]*\(')
       OR
       regexp_replace(coalesce(with_check, ''),
         '\(\s*SELECT\s+' || HELPER || '\s*\([^()]*\)[^()]*\)', 'INITPLAN', 'gi')
         ~* ('(^|[^.[:alnum:]_])' || HELPER || '[[:space:]]*\(')
     );

  IF n_sisa > 0 THEN
    RAISE EXCEPTION '533 gagal: % policy masih memanggil helper per baris: %',
      n_sisa, left(coalesce(v_sisa, ''), 300);
  END IF;

  RAISE NOTICE '533 OK: nol policy memanggil helper konstan per baris';
END $$;
