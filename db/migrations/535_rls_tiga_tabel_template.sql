-- ============================================================================
-- 535 — RLS untuk tiga tabel template: migrasi 532 sudah TERCATAT sebelum
--       perbaikannya ditulis
-- ============================================================================
--
-- ── Cacat yang ditutup
--
--     ❌ 3 tabel dengan RLS MATI.
--        Itu Ember [C] — RLS aktif/mati tidak boleh dikonfigurasi.
--
-- Ketiganya `template_rab`, `template_input`, `template_item` — dibuat migrasi
-- 532 beberapa jam lalu.
--
-- ── Kenapa perbaikan di 532 tidak berlaku
--
-- 532 memang SUDAH ditambahi `ENABLE ROW LEVEL SECURITY` sesudah CI merah
-- pertama kali. Tapi CI mencatat migrasi yang sudah dijalankan, dan pada run
-- berikutnya:
--
--     MIGRATIONS: applied=0  sudah-ada=509  skip-allowlist=1  total-file=510
--
-- `applied=0`. Versi 532 yang diperbaiki TAK PERNAH DIJALANKAN, karena
-- nomornya sudah ada di buku migrasi.
--
-- Ini persis bahaya yang CLAUDE.md §5.5 catat sebagai Gerbang Keras G-2: buku
-- migrasi menentukan apa yang di-replay, dan menyunting migrasi yang sudah
-- tercatat menghasilkan perbaikan yang hanya berlaku di lingkungan yang belum
-- pernah menjalankannya. Saya menyuntingnya di tempat, dan itu keliru untuk
-- migrasi yang SUDAH tercatat di CI — meski benar untuk 212/215 yang belum.
--
-- Perbaikan maju bernomor adalah satu-satunya jalan yang bekerja di kedua
-- keadaan: lingkungan lama menjalankan 535, lingkungan baru menjalankan 532
-- versi lengkap lalu 535 yang no-op.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

DO $rls_template$
DECLARE
  v_tabel TEXT;
BEGIN
  FOREACH v_tabel IN ARRAY ARRAY['template_rab', 'template_input', 'template_item'] LOOP
    IF to_regclass('public.' || v_tabel) IS NULL THEN
      RAISE NOTICE '535: tabel % tak ada di basis ini — dilewati', v_tabel;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabel);

    /*
      Satu PERMISSIVE pemberi akses.

      Tabel ber-RLS tanpa satu pun policy permissive TAK TERBACA SIAPA PUN —
      himpunan kosong yang di-OR bernilai FALSE. Menyalakan RLS tanpa ini
      mengganti satu cacat (terbaca lintas tenant) dengan cacat lain yang
      lebih sulit dilihat (halaman kosong tanpa galat), persis yang migrasi
      513 harus perbaiki bulan lalu.

      Pagar RESTRICTIVE-nya tetap tugas migrasi 519; `DROP POLICY IF EXISTS`
      di sana membuatnya menggantikan, bukan menggandakan.
    */
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_tabel || '_baca', v_tabel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (true)',
      v_tabel || '_baca', v_tabel);
  END LOOP;
END $rls_template$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  v_tabel  TEXT;
  v_kurang TEXT := '';
BEGIN
  FOREACH v_tabel IN ARRAY ARRAY['template_rab', 'template_input', 'template_item'] LOOP
    IF to_regclass('public.' || v_tabel) IS NULL THEN CONTINUE; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = v_tabel AND c.relrowsecurity
    ) THEN
      v_kurang := v_kurang || v_tabel || '(rls mati) ';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = v_tabel AND permissive = 'PERMISSIVE'
    ) THEN
      v_kurang := v_kurang || v_tabel || '(buntu) ';
    END IF;
  END LOOP;

  IF v_kurang <> '' THEN
    RAISE EXCEPTION '535 gagal: %', v_kurang;
  END IF;

  RAISE NOTICE '535 OK: RLS menyala di ketiga tabel template, nol tabel buntu';
END $$;
