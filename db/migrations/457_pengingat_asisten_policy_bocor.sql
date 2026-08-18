-- ════════════════════════════════════════════════════════════════════════════
-- 457 — `pengingat_asisten` bisa dibaca LINTAS TENANT
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ditemukan 2026-08-18 oleh `t5a0-policy-dasar.test.ts` — test yang SUDAH ADA
-- dan tak pernah saya jalankan karena ia tak ada di daftar penjaga yang saya
-- pilih sendiri.
--
-- ── Cacatnya
--
-- Migrasi 414 memasang DUA policy pada tabel ini, keduanya PERMISSIVE:
--
--     pengingat_dasar    USING (true)
--     tenant_isolation   USING (company_id = auth_company_id())
--
-- Postgres meng-OR seluruh policy PERMISSIVE. Jadi:
--
--     true OR (company_id = auth_company_id())  →  SELALU true
--
-- Artinya `tenant_isolation` **tidak menyaring apa pun**. Pengingat asisten
-- satu perusahaan terbaca perusahaan lain — dan isinya justru hal yang
-- pribadi: janji, tenggat, nama orang, nominal.
--
-- Yang membuatnya bertahan: kedua policy terlihat benar SATU PER SATU. Yang
-- salah kombinasinya, dan kombinasi tak terlihat saat membaca migrasinya.
--
-- ── Kenapa `pengingat_dasar` DIHAPUS, bukan diubah jadi RESTRICTIVE
--
-- Membuatnya restrictive `USING (true)` menghasilkan policy yang tak
-- menyaring apa pun DAN tak menambah apa pun — kertas kosong yang harus
-- dibaca setiap orang yang memeriksa tabel ini kelak.
--
-- `tenant_isolation` sudah menyatakan seluruh aturannya. Yang kedua memang
-- tak punya alasan untuk ada; ia sisa dari migrasi yang memasang policy
-- "sementara" lalu lupa mencabutnya.
--
-- ── Kenapa FORCE juga dipastikan
--
-- Tanpa FORCE, pemilik tabel (service-role) melewati RLS sepenuhnya. Rute
-- yang memakai `supabase` mentah — dan repo ini punya beberapa — akan
-- membaca lintas tenant meski policy-nya benar.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS pengingat_dasar ON pengingat_asisten;

-- Dipastikan ADA dan benar, bukan diasumsikan dari migrasi 414.
DROP POLICY IF EXISTS tenant_isolation ON pengingat_asisten;
CREATE POLICY tenant_isolation ON pengingat_asisten
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

ALTER TABLE pengingat_asisten ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengingat_asisten FORCE ROW LEVEL SECURITY;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_permisif_bebas INT;
  n_policy         INT;
  n_rls            INT;
BEGIN
  -- 1. NOL policy permisif tanpa syarat di tabel ini.
  SELECT count(*) INTO n_permisif_bebas
    FROM pg_policy
   WHERE polrelid = 'pengingat_asisten'::regclass
     AND polpermissive
     AND coalesce(pg_get_expr(polqual, polrelid), 'true') = 'true';
  IF n_permisif_bebas > 0 THEN
    RAISE EXCEPTION '457 gagal: masih ada % policy permisif USING(true) — '
      'ia meng-OR habis saringan tenant', n_permisif_bebas;
  END IF;

  -- 2. Saringan tenantnya benar-benar ada.
  SELECT count(*) INTO n_policy
    FROM pg_policy
   WHERE polrelid = 'pengingat_asisten'::regclass
     AND pg_get_expr(polqual, polrelid) LIKE '%auth_company_id()%';
  IF n_policy = 0 THEN
    RAISE EXCEPTION '457 gagal: tak ada policy yang menyaring company_id';
  END IF;

  -- 3. RLS aktif DAN dipaksa — tanpa FORCE, service-role melewatinya.
  SELECT count(*) INTO n_rls FROM pg_class
   WHERE relname = 'pengingat_asisten' AND relrowsecurity AND relforcerowsecurity;
  IF n_rls <> 1 THEN
    RAISE EXCEPTION '457 gagal: RLS/FORCE tidak aktif';
  END IF;

  RAISE NOTICE '457 OK — pengingat_asisten: nol policy permisif bebas, '
    'saringan tenant ada, RLS+FORCE aktif';
END $$;
