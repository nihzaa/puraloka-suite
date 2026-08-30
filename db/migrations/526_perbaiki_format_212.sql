-- ============================================================================
-- 526 - MEMPERBAIKI GEJALA YANG SALAH — dipertahankan sebagai PENEGAS
-- ============================================================================
--
-- ⚠ MIGRASI INI SEMULA MENAMBAL AKIBAT, BUKAN PENYEBAB — dan itu keliru.
--
-- Ia ditulis untuk memasang policy yang migrasi 212 gagal pasang. Yang tak
-- saya lihat saat menulisnya: apps/api/scripts/ci-project-setup.mjs membungkus
-- TIAP migrasi dalam transaksi, jadi kegagalan di baris 210 me-ROLLBACK
-- seluruh 212 — termasuk KELIMA TABEL yang dibuat di baris 37-141.
--
-- Yang hilang bukan policy-nya. Yang hilang TABELNYA.
--
-- Ketahuannya baru sesudah CI melaporkan kegagalan BERIKUTNYA:
--
--     HARD FAIL — 213_libur_unik_nulls_not_distinct.sql
--       relation "hari_libur" does not exist
--
-- 212 kini DIPERBAIKI DI TEMPATNYA (dua argumen untuk dua %I), mengikuti
-- preseden 016 yang dicatat di 181: "Menambal hanya di 181 akan meninggalkan
-- lubang yang terbuka kembali di setiap lingkungan baru."
--
-- ── KENAPA TIDAK DIHAPUS SAJA
--
-- Nomornya sudah ter-commit dan ter-push. Berkas migrasi yang lenyap membuat
-- riwayat punya lubang, dan lingkungan yang sudah mencatatnya di buku migrasi
-- akan mencari berkas yang tak ada.
--
-- Isinya dipertahankan sebagai PENEGAS: idempoten, no-op pada basis yang
-- sudah benar, dan blok verifikasinya tetap berguna — ia membuktikan kelima
-- tabel berpolicy RESTRICTIVE, bukan sekadar berpolicy.
--
-- Pelajarannya layak ditulis: saya memperbaiki gejala pertama yang terlihat,
-- dan baru tahu itu salah sasaran karena CI melaporkan gejala KEDUA. Kalau
-- 213 kebetulan tak ada, cacatnya akan tampak sudah beres.
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
