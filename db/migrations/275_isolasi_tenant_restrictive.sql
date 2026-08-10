-- ============================================================================
-- 275 — ISOLASI TENANT: enam policy PERMISSIVE jadi RESTRICTIVE
-- ============================================================================
--
-- ── Cacat yang diperbaiki, dan kenapa ia LATEN bukan aktif
--
-- Enam tabel punya `tenant_isolation` yang PERMISSIVE:
--
--   gudang · gudang_stok · rekening_koran · rekening_koran_baris
--   pencocokan_bank · penyesuaian_rekonsiliasi
--
-- Ekspresinya BENAR. Yang salah hanya sifatnya. Dan karena ia satu-satunya
-- policy di tabelnya, isolasinya masih bekerja hari ini — itulah sebabnya
-- cacat ini bertahan lama: tak ada gejala sama sekali.
--
-- ── Bahayanya DIUKUR, bukan diduga
--
-- Diuji 2026-08-10 dalam transaksi ber-ROLLBACK: satu policy permissive kedua
-- ditambahkan ke `gudang` dengan `USING (true)` — bentuk "policy dasar" yang
-- persis dipakai enam tabel lain di repo ini (migrasi 266/269/270/272).
--
--   sebelum policy kedua : 0 baris tenant lain terlihat
--   sesudah policy kedua : 1 baris tenant lain terlihat
--
-- Postgres meng-OR policy PERMISSIVE dan meng-AND yang RESTRICTIVE. Jadi
-- begitu siapa pun menambahkan policy dasar — tindakan yang di repo ini
-- terlihat SEPENUHNYA WAJAR karena tabel lain memang punya — isolasinya batal
-- tanpa satu pun galat.
--
-- Ini bukan bug yang menunggu dipicu pengguna. Ia menunggu dipicu oleh migrasi
-- berikutnya yang menyalin pola dari tetangganya.
--
-- ── DUA kategori tenancy, dan ekspresinya TIDAK disamakan
--
-- Empat tabel punya `company_id` sendiri (kategori B). DUA tidak:
--
--   gudang_stok           → lewat `gudang_id`
--   rekening_koran_baris  → lewat `koran_id`
--
-- Versi pertama migrasi ini memaksakan `company_id = auth_company_id()` untuk
-- keenamnya dan langsung gagal: *column "company_id" does not exist*. Ekspresi
-- asli tiap tabel karena itu DIPERTAHANKAN apa adanya — yang diubah HANYA
-- sifatnya dari PERMISSIVE jadi RESTRICTIVE.
--
-- Menyeragamkan ekspresi yang memang berbeda kebutuhannya adalah cara membuat
-- tabel turunan kehilangan seluruh isinya.
--
-- ── Kenapa policy dasar ikut dibuat
--
-- RESTRICTIVE hanya MEMPERSEMPIT. Tanpa satu pun policy permissive yang
-- mengizinkan, tak ada yang bisa dipersempit — dan tabelnya jadi tak terbaca
-- siapa pun. "Aman" yang berarti "mati" bukan perbaikan, jadi keduanya dibuat
-- bersama dan diverifikasi bersama.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  ekspresi TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'gudang', 'gudang_stok', 'rekening_koran', 'rekening_koran_baris',
    'pencocokan_bank', 'penyesuaian_rekonsiliasi'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '275 gagal: tabel % tak ada', t;
    END IF;

    /*
     * Ekspresi DIAMBIL DARI POLICY YANG ADA, bukan ditulis ulang.
     *
     * Menulis ulang berarti menebak bentuk yang benar untuk enam tabel dengan
     * dua kategori tenancy berbeda — dan tebakan yang meleset di sini
     * menghasilkan tabel kosong, bukan galat.
     */
    SELECT qual INTO ekspresi
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t AND policyname = 'tenant_isolation';

    IF ekspresi IS NULL THEN
      RAISE EXCEPTION '275 gagal: % tak punya policy tenant_isolation untuk disalin', t;
    END IF;

    -- Policy DASAR — permissive. Lihat kepala berkas.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_dasar', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true)',
      t || '_dasar', t);

    -- Penyaring tenant — RESTRICTIVE, ekspresi ASLI dipertahankan.
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL USING (%s) WITH CHECK (%s)',
      t, ekspresi, ekspresi);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  -- 1. Keenamnya WAJIB restrictive sekarang.
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('gudang','gudang_stok','rekening_koran',
                       'rekening_koran_baris','pencocokan_bank','penyesuaian_rekonsiliasi')
     AND policyname = 'tenant_isolation' AND permissive = 'RESTRICTIVE';
  IF n <> 6 THEN
    RAISE EXCEPTION '275 gagal: hanya % dari 6 tenant_isolation yang RESTRICTIVE', n;
  END IF;

  -- 2. Policy dasarnya juga ada — tanpa itu tabelnya jadi tak terbaca siapa
  --    pun, dan "aman" yang berarti "mati" bukan perbaikan.
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('gudang','gudang_stok','rekening_koran',
                       'rekening_koran_baris','pencocokan_bank','penyesuaian_rekonsiliasi')
     AND policyname LIKE '%_dasar' AND permissive = 'PERMISSIVE';
  IF n <> 6 THEN
    RAISE EXCEPTION '275 gagal: policy dasar tak lengkap (% dari 6)', n;
  END IF;

  -- 3. Ekspresinya tak boleh kosong — policy restrictive ber-USING kosong
  --    menolak SEMUANYA, dan tabel yang tak terbaca siapa pun tak akan
  --    mengumumkan dirinya rusak.
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('gudang','gudang_stok','rekening_koran',
                       'rekening_koran_baris','pencocokan_bank','penyesuaian_rekonsiliasi')
     AND policyname = 'tenant_isolation'
     AND (qual IS NULL OR qual = '' OR qual = 'true');
  IF n <> 0 THEN
    RAISE EXCEPTION '275 gagal: % policy tenant_isolation ber-ekspresi kosong/true', n;
  END IF;
END $$;
