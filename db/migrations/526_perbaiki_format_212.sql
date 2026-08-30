-- ============================================================================
-- 526 - MENUTUP CACAT `format()` DI MIGRASI 212
-- ============================================================================
--
-- ── YANG DITEMUKAN, diukur 2026-08-31 dari CI
--
--     HARD FAIL — migrasi GAGAL di LUAR allowlist: 212_jadwal_cpm_kalender.sql
--
-- Keenam shard "API — test" gagal karena penyiapan basis CI berhenti di situ.
-- Galat sesungguhnya baru terlihat saat migrasinya dijalankan langsung:
--
--     too few arguments for format()
--
-- Barisnya 209-213 di migrasi 212:
--
--     EXECUTE format(
--       'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL
--          USING (company_id = auth_company_id())
--          WITH CHECK (company_id = auth_company_id())',
--       t);                                    <-- DUA %I, SATU argumen
--
-- Nama policy-nya hilang. Dua `%I` menuntut dua argumen; yang diberikan satu.
--
-- ── KENAPA TAK PERNAH TERLIHAT SEBELUM INI
--
-- Di basis pengembangan kelima tabelnya SUDAH punya `tenant_isolation`,
-- RLS aktif, FORCE aktif — dipasang migrasi lain sesudahnya. Diukur:
--
--     hari_libur · kebutuhan_sumber_daya · method_statement
--     milestone_dependencies · pola_kerja
--     → tenant_isolation=1, total_policy=3, rls=true, force=true (kelimanya)
--
-- Jadi keadaan akhirnya benar, dan tak ada gejala apa pun. Yang rusak hanya
-- terlihat di LINGKUNGAN BERSIH — tempat migrasi diputar ulang dari nol, yang
-- justru dipakai saat membangun server baru.
--
-- Kelas cacat yang sama dengan yang melahirkan `audit-replay-bersih`:
-- benar di dev, mati di server baru.
--
-- ── KENAPA MIGRASI BARU, BUKAN MENGEDIT 212
--
-- 212 sudah ter-commit dan sudah dijalankan di basis nyata. Mengeditnya
-- membuat riwayat berbohong: berkas yang berbeda dari yang pernah berjalan,
-- dengan nomor yang sama. CLAUDE.md §5.5 melarangnya.
--
-- Migrasi ini memasang policy yang 212 gagal pasang. Untuk basis yang sudah
-- punya (seperti dev), ia no-op — `DROP ... IF EXISTS` lalu `CREATE` dengan
-- definisi yang sama.
--
-- ⚠ 212 SENDIRI TETAP GAGAL di lingkungan bersih. Yang diperbaiki AKIBATNYA,
--   bukan penyebabnya — dan itu disengaja: menambal 212 berarti mengedit
--   riwayat. `ci-project-setup.mjs` perlu memasukkannya ke allowlist dengan
--   alasan yang menunjuk migrasi ini. Itu dikerjakan terpisah, supaya
--   allowlist tak pernah jadi tempat membuang kegagalan yang belum dipahami.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  TABEL TEXT[] := ARRAY['milestone_dependencies', 'hari_libur', 'pola_kerja',
                        'kebutuhan_sumber_daya', 'method_statement'];
BEGIN
  FOREACH t IN ARRAY TABEL LOOP
    -- Tabelnya mungkin belum ada bila 212 berhenti SEBELUM membuatnya.
    -- Dilewati, bukan gagal: migrasi ini menutup satu cacat, bukan
    -- menggantikan 212.
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '526: tabel % belum ada — dilewati', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    /*
      DUA argumen untuk DUA `%I` — inilah yang hilang di 212.

      Nama policy-nya `tenant_isolation` HARFIAH, bukan bervariasi per tabel:
      `t5a-policy-tenant.test.ts` mencarinya secara harfiah, dan nama yang
      bervariasi memaksa penjaganya menebak pola. Penjaga yang menebak akan
      melewatkan tabel yang polanya sedikit berbeda.
    */
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL
         USING (company_id = auth_company_id())
         WITH CHECK (company_id = auth_company_id())',
      'tenant_isolation', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_baca', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (has_permission(''projects:view''))',
      t || '_baca', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tulis', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING (has_permission(''milestones:manage''))
         WITH CHECK (has_permission(''milestones:manage''))',
      t || '_tulis', t);
  END LOOP;
END $$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  t TEXT; n INT; kurang TEXT := '';
  TABEL TEXT[] := ARRAY['milestone_dependencies', 'hari_libur', 'pola_kerja',
                        'kebutuhan_sumber_daya', 'method_statement'];
BEGIN
  FOREACH t IN ARRAY TABEL LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    /*
      TIGA policy per tabel — dan ketiganya punya peran berbeda:

        tenant_isolation  RESTRICTIVE, memagari company_id
        <t>_baca          PERMISSIVE, izin melihat
        <t>_tulis         PERMISSIVE, izin mengubah

      RESTRICTIVE digabung dengan AND; PERMISSIVE dengan OR. Kehilangan yang
      pertama membuat tabel terbaca LINTAS TENANT tanpa satu pun galat —
      persis cacat `document_number_series` yang tercatat di CLAUDE.md §6.
    */
    SELECT count(*) INTO n FROM pg_policy
     WHERE polrelid = ('public.' || t)::regclass
       AND polname IN ('tenant_isolation', t || '_baca', t || '_tulis');
    IF n <> 3 THEN
      kurang := kurang || format('%s(%s policy) ', t, n);
    END IF;

    -- RESTRICTIVE wajib RESTRICTIVE, bukan sekadar ada.
    SELECT count(*) INTO n FROM pg_policy
     WHERE polrelid = ('public.' || t)::regclass
       AND polname = 'tenant_isolation' AND NOT polpermissive;
    IF n <> 1 THEN
      kurang := kurang || format('%s(tenant_isolation bukan RESTRICTIVE) ', t);
    END IF;

    SELECT count(*) INTO n FROM pg_class
     WHERE oid = ('public.' || t)::regclass AND relrowsecurity AND relforcerowsecurity;
    IF n <> 1 THEN
      kurang := kurang || format('%s(RLS/FORCE mati) ', t);
    END IF;
  END LOOP;

  IF kurang <> '' THEN
    RAISE EXCEPTION '526 gagal: %', kurang;
  END IF;

  RAISE NOTICE '526 OK: kelima tabel jadwal berpolicy lengkap (RESTRICTIVE + baca + tulis), RLS & FORCE aktif';
END $$;
