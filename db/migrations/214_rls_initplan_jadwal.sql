-- ============================================================================
-- 214 — RLS jadwal: helper konstan dibungkus (SELECT ...) → InitPlan
-- ============================================================================
--
-- ── Cacat yang diperbaiki
--
-- Migrasi 212 menulis policy-nya sebagai `has_permission('projects:view')` dan
-- `company_id = auth_company_id()` — TELANJANG. Postgres memperlakukan
-- pemanggilan begitu sebagai ekspresi yang bergantung pada baris, sehingga
-- fungsinya dievaluasi **sekali per baris**. Pada tabel 50.000 baris itu
-- 50.000 pemanggilan untuk menjawab satu pertanyaan yang jawabannya sama
-- sepanjang query.
--
-- Membungkusnya `(SELECT has_permission(...))` membuat Postgres mengenalinya
-- sebagai InitPlan: dihitung SEKALI, hasilnya dipakai ulang.
--
-- Pola ini ditetapkan migrasi 132, dan migrasi 211 (operasional alat) sudah
-- mengikutinya. 212 luput — ditemukan oleh `rls-initplan.test.ts` dan
-- `t7-exit-criteria-l2.test.ts`, dua test yang memang ada untuk ini. Bukan
-- oleh saya membaca ulang migrasinya.
--
-- ── Kenapa ini bukan sekadar optimasi
--
-- RLS yang lambat berakhir dimatikan. Itu bukan hipotesis: kriteria keluar
-- T7-L2 menyebutnya "biaya RLS tidak membuat sistem tak terpakai" — karena
-- lapisan keamanan yang membuat halaman butuh 8 detik akan diminta
-- dinonaktifkan oleh orang yang sama yang memintanya dipasang.
--
-- Idempoten. Verifikasi di blok akhir.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['milestone_dependencies','hari_libur','pola_kerja',
                           'kebutuhan_sumber_daya','method_statement']
  LOOP
    /*
      DUA nama di-DROP, bukan satu — DITAMBAHKAN 2026-08-31.

      Migrasi ini memasang ulang policy tenant sebagai `<tabel>_tenant`.
      Kalau basisnya sudah pernah melewati migrasi 216 — yang me-rename nama
      itu jadi `tenant_isolation` — maka yang lama tak ada untuk di-DROP, dan
      `CREATE` di bawah MENAMBAH policy kedua alih-alih menggantikan.

      Hasilnya 20 policy, sementara verifikasi di bawah menuntut 15:

          Policy tak lengkap sesudah dipasang ulang: 20 (harusnya 15)

      Diukur di CI 2026-08-31. Basisnya bukan lingkungan bersih sungguhan —
      ia menyimpan `tenant_isolation` dari run sebelumnya, dan migrasi ini
      diputar ulang di atasnya.

      Membuang KEDUA nama membuat migrasi ini idempoten terhadap keadaan
      mana pun: sebelum 216, sesudah 216, atau di tengah pengulangan.
    */
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL
         USING (company_id = (SELECT auth_company_id()))
         WITH CHECK (company_id = (SELECT auth_company_id()))',
      t || '_tenant', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_baca', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING ((SELECT has_permission(''projects:view'')))',
      t || '_baca', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tulis', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING ((SELECT has_permission(''milestones:manage'')))
         WITH CHECK ((SELECT has_permission(''milestones:manage'')))',
      t || '_tulis', t);
  END LOOP;
END $$;

-- ── Verifikasi: NOL helper telanjang di kelima tabel ───────────────────────
DO $$
DECLARE
  n_telanjang int;
  n_policy int;
BEGIN
  SELECT count(*) INTO n_policy
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('milestone_dependencies','hari_libur','pola_kerja',
                       'kebutuhan_sumber_daya','method_statement');

  IF n_policy <> 15 THEN
    RAISE EXCEPTION 'Policy tak lengkap sesudah dipasang ulang: % (harusnya 15)', n_policy;
  END IF;

  -- Telanjang = helper muncul TANPA didahului `(SELECT `.
  SELECT count(*) INTO n_telanjang
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('milestone_dependencies','hari_libur','pola_kerja',
                       'kebutuhan_sumber_daya','method_statement')
     AND (
       regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
                      '\( SELECT (auth_company_id|has_permission)', '(WRAPPED', 'g')
         ~ '(auth_company_id|has_permission)\('
       OR
       regexp_replace(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
                      '\( SELECT (auth_company_id|has_permission)', '(WRAPPED', 'g')
         ~ '(auth_company_id|has_permission)\('
     );

  IF n_telanjang > 0 THEN
    RAISE EXCEPTION 'Masih ada % policy memanggil helper per baris', n_telanjang;
  END IF;

  RAISE NOTICE 'VERIFIKASI 214: 15 policy, nol helper telanjang (semua InitPlan).';
END $$;
