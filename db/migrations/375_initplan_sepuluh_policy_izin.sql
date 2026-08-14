-- ============================================================================
-- 375 — Sepuluh policy memanggil `has_permission()` SEKALI PER BARIS
-- ============================================================================
--
-- ── Bukan soal kerapian
--
-- Postgres mengevaluasi `has_permission('x')` telanjang untuk SETIAP BARIS
-- yang dipindai. Dibungkus `(SELECT has_permission('x'))` ia jadi **InitPlan**
-- — dievaluasi sekali per kueri.
--
-- Angka yang tercatat di migrasi 132 (yang memperbaiki gelombang pertama):
-- 5 ms dan 2 ms sesudahnya, dari jauh lebih lambat sebelumnya. Pada tabel
-- berisi puluhan ribu baris, bedanya bukan kosmetik — dan `has_permission`
-- sendiri melakukan JOIN tiga tabel.
--
-- ── Sepuluh yang tersisa, dan kenapa baru ketahuan sekarang
--
--     kontrak.kontrak_baca / _tulis
--     serah_terima.serah_terima_baca / _tulis
--     klaim_perjalanan.klaim_perjalanan_baca / _tulis
--     klaim_perjalanan_item.klaim_perjalanan_item_baca / _tulis
--     document_number_series.document_number_series_baca / _tulis
--
-- Kesepuluhnya lahir SESUDAH migrasi 132 membersihkan gelombang pertama.
-- `rls-initplan.test.ts` sudah menjaganya sejak lama dan memang MERAH — tapi
-- merahnya tenggelam di antara 76 test merah lain, dan tak ada yang
-- membacanya sampai suite dijalankan utuh hari ini.
--
-- Itu sendiri pelajaran: penjaga yang merah bersama puluhan lain berhenti
-- menjadi penjaga. Yang menahannya hari ini bukan penjaganya, melainkan
-- keputusan untuk membaca satu per satu apa yang merah.
--
-- ── Yang diubah HANYA pembungkusnya
--
-- Syarat, nama, perintah, dan sifat policy disalin apa adanya. `USING` dan
-- `WITH CHECK` dibedakan karena tak semuanya punya keduanya — menyalin
-- `USING` ke `WITH CHECK` pada policy SELECT akan menambah syarat yang tak
-- pernah ada.
-- ============================================================================

DO $$
DECLARE
  r        record;
  q_baru   text;
  c_baru   text;
  n_sisa   int;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname, p.permissive, p.cmd, p.roles,
           p.qual, p.with_check
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND (p.tablename, p.policyname) IN (
         ('kontrak', 'kontrak_baca'), ('kontrak', 'kontrak_tulis'),
         ('serah_terima', 'serah_terima_baca'), ('serah_terima', 'serah_terima_tulis'),
         ('klaim_perjalanan', 'klaim_perjalanan_baca'),
         ('klaim_perjalanan', 'klaim_perjalanan_tulis'),
         ('klaim_perjalanan_item', 'klaim_perjalanan_item_baca'),
         ('klaim_perjalanan_item', 'klaim_perjalanan_item_tulis'),
         ('document_number_series', 'document_number_series_baca'),
         ('document_number_series', 'document_number_series_tulis')
       )
  LOOP
    -- Bungkus tiap panggilan telanjang. `regexp_replace` dengan penjaga
    -- lookbehind sederhana: yang SUDAH diawali `SELECT ` dibiarkan, supaya
    -- migrasi ini idempoten dan tak menghasilkan `(SELECT (SELECT ...))`.
    q_baru := r.qual;
    c_baru := r.with_check;

    IF q_baru IS NOT NULL AND q_baru !~* '\(\s*SELECT\s+has_permission' THEN
      q_baru := regexp_replace(q_baru, '(has_permission\([^()]*\))', '(SELECT \1)', 'g');
    END IF;
    IF c_baru IS NOT NULL AND c_baru !~* '\(\s*SELECT\s+has_permission' THEN
      c_baru := regexp_replace(c_baru, '(has_permission\([^()]*\))', '(SELECT \1)', 'g');
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);

    -- `USING` dan `WITH CHECK` DIBEDAKAN: policy SELECT tak punya WITH CHECK,
    -- dan menambahkannya berarti syarat baru yang tak pernah ada.
    IF c_baru IS NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS %s FOR %s USING (%s)',
        r.policyname, r.tablename,
        CASE WHEN r.permissive = 'RESTRICTIVE' THEN 'RESTRICTIVE' ELSE 'PERMISSIVE' END,
        r.cmd, q_baru);
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS %s FOR %s USING (%s) WITH CHECK (%s)',
        r.policyname, r.tablename,
        CASE WHEN r.permissive = 'RESTRICTIVE' THEN 'RESTRICTIVE' ELSE 'PERMISSIVE' END,
        r.cmd, COALESCE(q_baru, 'true'), c_baru);
    END IF;
  END LOOP;

  -- ── Verifikasi: nol panggilan telanjang tersisa pada kesepuluhnya ────────
  SELECT count(*) INTO n_sisa
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND (p.tablename, p.policyname) IN (
       ('kontrak', 'kontrak_baca'), ('kontrak', 'kontrak_tulis'),
       ('serah_terima', 'serah_terima_baca'), ('serah_terima', 'serah_terima_tulis'),
       ('klaim_perjalanan', 'klaim_perjalanan_baca'),
       ('klaim_perjalanan', 'klaim_perjalanan_tulis'),
       ('klaim_perjalanan_item', 'klaim_perjalanan_item_baca'),
       ('klaim_perjalanan_item', 'klaim_perjalanan_item_tulis'),
       ('document_number_series', 'document_number_series_baca'),
       ('document_number_series', 'document_number_series_tulis')
     )
     AND (
       (p.qual IS NOT NULL AND p.qual ~* '(^|[^(])has_permission\(' AND p.qual !~* '\(\s*SELECT\s+has_permission')
       OR
       (p.with_check IS NOT NULL AND p.with_check ~* '(^|[^(])has_permission\(' AND p.with_check !~* '\(\s*SELECT\s+has_permission')
     );

  IF n_sisa > 0 THEN
    RAISE EXCEPTION '375 gagal: % policy masih memanggil has_permission per baris', n_sisa;
  END IF;

  -- Kesepuluhnya WAJIB masih ada — kalau `CREATE` gagal sesudah `DROP`,
  -- tabelnya kehilangan policy izinnya dan siapa pun bisa membaca.
  SELECT count(*) INTO n_sisa
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND (p.tablename, p.policyname) IN (
       ('kontrak', 'kontrak_baca'), ('kontrak', 'kontrak_tulis'),
       ('serah_terima', 'serah_terima_baca'), ('serah_terima', 'serah_terima_tulis'),
       ('klaim_perjalanan', 'klaim_perjalanan_baca'),
       ('klaim_perjalanan', 'klaim_perjalanan_tulis'),
       ('klaim_perjalanan_item', 'klaim_perjalanan_item_baca'),
       ('klaim_perjalanan_item', 'klaim_perjalanan_item_tulis'),
       ('document_number_series', 'document_number_series_baca'),
       ('document_number_series', 'document_number_series_tulis')
     );

  IF n_sisa <> 10 THEN
    RAISE EXCEPTION '375 gagal: hanya % dari 10 policy tersisa — sebagian hilang saat dibuat ulang', n_sisa;
  END IF;

  RAISE NOTICE '375: 10 policy izin jadi InitPlan · kesepuluhnya utuh';
END $$;
