-- ════════════════════════════════════════════════════════════════════════════
-- 312 — RLS policy untuk tujuh tabel G6 yang RLS-nya AKTIF tanpa satu pun policy
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Cacat yang ditemukan test, bukan oleh saya
--
-- Tujuh tabel yang dibangun di G6a–G6e menyalakan RLS tetapi tak pernah
-- diberi policy:
--
--     markup_periode           baseline_jadwal        baseline_jadwal_item
--     api_key                  api_key_pakai
--     peta_resource_material   rencana_susut_material
--
-- Di Postgres, `ENABLE ROW LEVEL SECURITY` tanpa policy berarti tabelnya
-- **MATI TOTAL**: nol baris terbaca oleh siapa pun yang tunduk RLS, termasuk
-- pemiliknya sendiri. Bukan "kurang aman" — sebaliknya, terlalu tertutup.
--
-- Yang membuatnya tak ketahuan lebih awal: seluruh pengujian saya memakai
-- koneksi service-role yang MELEWATI RLS. Alur UI pun jalan, karena API
-- memakai koneksi yang sama. Yang gagal hanya test invarian RLS — dan itu
-- baru dijalankan pada sapu akhir.
--
-- ── Kenapa G5 dan R-012 benar sementara sisanya tidak
--
-- `periode_akuntansi` dan `peta_akun_jurnal` punya `tenant_isolation`, karena
-- migrasinya menuliskannya. Yang saya bangun sesudahnya menyalin bagian
-- `ENABLE ROW LEVEL SECURITY` tanpa menyalin policy-nya — persis jenis
-- kesalahan yang lolos karena hasilnya terlihat sama di layar.
--
-- ── Pola yang dipakai
--
-- `tenant_isolation` RESTRICTIVE dengan `auth_company_id()`, sama dengan
-- seluruh tabel kategori B yang sudah ada (`tarif_payroll_periode`,
-- `peta_akun_jurnal`, `periode_akuntansi`). Disamakan dengan sengaja: policy
-- yang berbeda bentuk untuk masalah yang sama akan berbeda pula cacatnya.
--
-- Tabel kategori C (`baseline_jadwal_item`, `api_key_pakai`) menyaring lewat
-- INDUKNYA — mereka tak punya `company_id` sendiri, dan menambahkannya berarti
-- dua sumber kebenaran yang bisa berselisih.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Kategori B: punya `company_id` sendiri ──────────────────────────────────
--
-- Daftar ini DIUKUR ke `pg_attribute`, bukan disusun dari ingatan. Versi
-- pertama memasukkan `baseline_jadwal` ke sini dan migrasinya GAGAL dengan
-- 'column "company_id" does not exist' — tabel itu menyaring lewat
-- `project_id`, persis seperti klasifikasinya di peta tenancy (kategori C).
--
-- Kegagalan itu berguna: policy yang dibuat dari kolom yang tak ada akan
-- ditolak Postgres. Yang berbahaya justru kebalikannya — policy yang MENGACU
-- kolom yang ada tetapi salah artinya, karena ia diterima tanpa keluhan.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'markup_periode',
    'api_key',
    'peta_resource_material',
    'rencana_susut_material'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE
         USING (company_id = (SELECT auth_company_id()))
         WITH CHECK (company_id = (SELECT auth_company_id()))', t);
  END LOOP;
END $$;

-- ── Kategori C: menyaring lewat induknya ────────────────────────────────────
--
-- `baseline_jadwal` → `projects.company_id`
DROP POLICY IF EXISTS tenant_isolation ON baseline_jadwal;
CREATE POLICY tenant_isolation ON baseline_jadwal AS RESTRICTIVE
  USING (EXISTS (
    SELECT 1 FROM projects p
     WHERE p.id = baseline_jadwal.project_id
       AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects p
     WHERE p.id = baseline_jadwal.project_id
       AND p.company_id = (SELECT auth_company_id())));

-- `baseline_jadwal_item` → `baseline_jadwal` → `projects.company_id`
DROP POLICY IF EXISTS tenant_isolation ON baseline_jadwal_item;
CREATE POLICY tenant_isolation ON baseline_jadwal_item AS RESTRICTIVE
  USING (EXISTS (
    SELECT 1 FROM baseline_jadwal b
      JOIN projects p ON p.id = b.project_id
     WHERE b.id = baseline_jadwal_item.baseline_id
       AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM baseline_jadwal b
      JOIN projects p ON p.id = b.project_id
     WHERE b.id = baseline_jadwal_item.baseline_id
       AND p.company_id = (SELECT auth_company_id())));

-- `api_key_pakai` → `api_key.company_id`
DROP POLICY IF EXISTS tenant_isolation ON api_key_pakai;
CREATE POLICY tenant_isolation ON api_key_pakai AS RESTRICTIVE
  USING (EXISTS (
    SELECT 1 FROM api_key k
     WHERE k.id = api_key_pakai.api_key_id
       AND k.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM api_key k
     WHERE k.id = api_key_pakai.api_key_id
       AND k.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  n INT;
  daftar TEXT[] := ARRAY[
    'markup_periode', 'baseline_jadwal', 'baseline_jadwal_item',
    'api_key', 'api_key_pakai', 'peta_resource_material',
    'rencana_susut_material'];
BEGIN
  FOREACH t IN ARRAY daftar LOOP
    -- 1. RLS tetap aktif.
    SELECT count(*) INTO n FROM pg_class
     WHERE relname = t AND relrowsecurity;
    IF n = 0 THEN
      RAISE EXCEPTION '312 gagal: RLS tidak aktif di %', t;
    END IF;

    -- 2. Punya policy — tabel ber-RLS tanpa policy MATI TOTAL.
    SELECT count(*) INTO n FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = t;
    IF n = 0 THEN
      RAISE EXCEPTION '312 gagal: % masih tanpa policy — tabelnya mati total', t;
    END IF;

    -- 3. Policy-nya RESTRICTIVE dan bernama `tenant_isolation`, sama dengan
    --    seluruh tabel lain. Nama yang berbeda membuat penjaga invarian
    --    tak menemukannya.
    SELECT count(*) INTO n FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = t AND p.polname = 'tenant_isolation'
       AND p.polpermissive = FALSE;
    IF n = 0 THEN
      RAISE EXCEPTION '312 gagal: % tak punya tenant_isolation RESTRICTIVE', t;
    END IF;
  END LOOP;

  RAISE NOTICE '312 OK — 7 tabel G6 punya tenant_isolation RESTRICTIVE';
END $$;
