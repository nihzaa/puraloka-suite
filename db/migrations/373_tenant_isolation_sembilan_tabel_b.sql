-- ============================================================================
-- 373 — Sembilan tabel kategori B: izin ADA, tenant TIDAK
-- ============================================================================
--
-- Pola yang PERSIS SAMA dengan migrasi 371, hanya lebih luas. 371 memperbaiki
-- dua tabel turunan (`klaim_perjalanan_item`, `opname_bersama_item`); test
-- `t5a-policy-tenant` menunjuk sembilan tabel lain yang masih bolong — dan
-- kali ini INDUKNYA sendiri.
--
-- ── Yang diukur
--
--     back_charge            company_id NOT NULL · RLS aktif · 2 policy
--     custom_field_def       ⋯ sama
--     custom_field_nilai     ⋯
--     klaim_perjalanan       ⋯
--     kontrak                ⋯
--     opname_bersama         ⋯
--     serah_terima           ⋯
--     sod_override           ⋯
--     surat_perintah_kerja   ⋯
--
-- Kesembilannya punya RLS aktif dan dua policy — jadi sekilas tampak terjaga.
-- Tetapi kedua policy itu memeriksa **izin** (`has_permission(...)`), bukan
-- **tenant**. Orang berizin `kontrak:view` di PT A dapat membaca kontrak PT B.
--
-- Ironinya tajam pada dua di antaranya: migrasi 371 sudah memasang penyaring
-- tenant pada `klaim_perjalanan_item` dan `opname_bersama_item` — ANAKNYA —
-- sementara induknya sendiri, `klaim_perjalanan` dan `opname_bersama`, tetap
-- terbuka. Anak terjaga lewat induk yang tak terjaga.
--
-- ── Kenapa lebih sederhana dari 371
--
-- Kesembilannya kategori **B**: `company_id` ada LANGSUNG di barisnya, jadi
-- tak perlu helper penelusur seperti `t5_company_dari_klaim`. Perbandingannya
-- satu kolom.
--
-- ── RESTRICTIVE, dan `t5a` menuntutnya
--
-- Policy PERMISSIVE digabung OR: menambah policy permissive kedua justru
-- MELONGGARKAN. Yang dibutuhkan syarat yang WAJIB dipenuhi apa pun policy
-- lainnya — RESTRICTIVE, digabung AND. Test `t5a-policy-tenant` memeriksa
-- keduanya: policy-nya ADA, dan ia RESTRICTIVE.
--
-- Policy izin yang lama TIDAK disentuh: yang ditambah lapis tenant, bukan
-- pengganti lapis izin.
--
-- ── `(SELECT auth_company_id())`, bukan telanjang
--
-- Dibungkus `(SELECT ...)` supaya Postgres mengevaluasinya sebagai InitPlan —
-- sekali per kueri, bukan sekali per BARIS. Dijaga `rls-initplan.test.ts`,
-- dan pada tabel berisi puluhan ribu baris bedanya bukan kosmetik.
-- ============================================================================

DO $$
DECLARE
  t text;
  n_kurang int;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'back_charge',
    'custom_field_def',
    'custom_field_nilai',
    'klaim_perjalanan',
    'kontrak',
    'opname_bersama',
    'serah_terima',
    'sod_override',
    'surat_perintah_kerja'
  ] LOOP
    -- Prasyarat DIPERIKSA, bukan diasumsikan: tabel tanpa `company_id` akan
    -- membuat policy-nya gagal saat dievaluasi, bukan saat dibuat — dan
    -- gagalnya muncul sebagai "nol baris" bagi semua orang.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) THEN
      RAISE EXCEPTION '373 batal: %s tak punya kolom company_id — bukan kategori B', t;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        AS RESTRICTIVE FOR ALL
        USING (company_id = (SELECT auth_company_id()))
        WITH CHECK (company_id = (SELECT auth_company_id()))
    $f$, t);
  END LOOP;

  -- ── Verifikasi ──────────────────────────────────────────────────────────
  SELECT count(*) INTO n_kurang
    FROM unnest(ARRAY[
      'back_charge','custom_field_def','custom_field_nilai','klaim_perjalanan',
      'kontrak','opname_bersama','serah_terima','sod_override','surat_perintah_kerja'
    ]) AS x(nama)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = x.nama
        AND p.policyname = 'tenant_isolation'
        AND p.permissive = 'RESTRICTIVE'
        AND p.qual ILIKE '%auth_company_id%'
   );

  IF n_kurang > 0 THEN
    RAISE EXCEPTION '373 gagal: % tabel masih tanpa tenant_isolation RESTRICTIVE', n_kurang;
  END IF;

  -- Policy izin lama WAJIB tetap ada — yang ditambah lapis tenant, bukan
  -- penggantinya. Kalau yang lama hilang, siapa pun yang lolos saringan tenant
  -- bisa membaca tanpa punya izinnya.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'kontrak' AND permissive = 'PERMISSIVE'
  ) THEN
    RAISE EXCEPTION '373 gagal: policy izin kontrak hilang';
  END IF;

  RAISE NOTICE '373: sembilan tabel B kini menyaring TENANT, bukan izin saja';
END $$;
