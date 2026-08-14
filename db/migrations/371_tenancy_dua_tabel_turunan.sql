-- ============================================================================
-- 371 — `klaim_perjalanan_item` & `opname_bersama_item`: izin ADA, tenant TIDAK
-- ============================================================================
--
-- ── Cacat yang ditemukan saat menurunkan ratchet tenancy, 2026-08-14
--
-- Test `f2-3-batch3-tenancy-turunan` sudah MERAH sebelum sesi ini (dibuktikan
-- `git stash`), dan isinya bukan soal gaya penulisan — ia lubang tenancy nyata:
--
--     klaim_perjalanan_item · klaim_perjalanan_item_baca · SELECT
--        has_permission('klaim:view')
--     opname_bersama_item   · opname_item_baca           · SELECT
--        has_permission('mandor:view')
--
-- Keduanya memeriksa **izin**, tak satu pun memeriksa **tenant**. RLS-nya aktif
-- dan policy-nya ada — jadi tak ada yang terlihat salah — tetapi seseorang
-- berizin `klaim:view` di PT A dapat membaca klaim perjalanan PT B.
--
-- Tabel kategori C tak punya `company_id` sendiri, jadi policy adalah
-- SATU-SATUNYA yang menahan. Tanpa penyaring tenant, isinya terlihat oleh
-- semua tenant — tanpa satu pun galat.
--
-- ── Kenapa RESTRICTIVE, bukan menambah syarat ke policy yang ada
--
-- Policy PERMISSIVE digabung dengan OR: menambah policy permissive kedua justru
-- MELONGGARKAN (cukup salah satu terpenuhi). Yang dibutuhkan syarat yang WAJIB
-- dipenuhi apa pun policy lainnya — itulah RESTRICTIVE, yang digabung dengan
-- AND.
--
-- Polanya disalin dari tabel C yang sudah lulus (`work_scope_items`):
--
--     tenant_isolation | RESTRICTIVE
--       t5_company_dari_work_scope(work_scope_id) = auth_company_id()
--
-- Jadi izin tetap dijaga policy lama, tenant dijaga yang baru. Dua pertanyaan
-- berbeda, dua policy berbeda — dan mencampurnya berarti melonggarkan salah
-- satunya saat yang lain diubah.
--
-- ── Kenapa helper, bukan subquery langsung di policy
--
-- Konsisten dengan 17 `t5_company_dari_*` yang sudah ada. `SECURITY DEFINER`
-- membuatnya bisa membaca tabel induk tanpa terjerat RLS induknya sendiri —
-- tanpa itu policy anak memicu evaluasi policy induk, dan pada rantai dalam ia
-- bisa berulang.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Helper — induk keduanya punya `company_id` LANGSUNG
-- ------------------------------------------------------------
-- Diukur sebelum menulis: `klaim_perjalanan` dan `opname_bersama` sama-sama
-- punya kolom `company_id`, jadi rantainya satu hop — tak perlu menelusuri
-- lewat project seperti `t5_company_dari_work_scope`.
CREATE OR REPLACE FUNCTION public.t5_company_dari_klaim(p_klaim_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT company_id FROM public.klaim_perjalanan WHERE id = p_klaim_id
$fn$;

CREATE OR REPLACE FUNCTION public.t5_company_dari_opname(p_opname_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT company_id FROM public.opname_bersama WHERE id = p_opname_id
$fn$;

-- ------------------------------------------------------------
-- 2. Policy RESTRICTIVE — tenant, bukan izin
-- ------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation ON public.klaim_perjalanan_item;
CREATE POLICY tenant_isolation ON public.klaim_perjalanan_item
  AS RESTRICTIVE
  FOR ALL
  USING (public.t5_company_dari_klaim(klaim_id) = (SELECT auth_company_id()))
  WITH CHECK (public.t5_company_dari_klaim(klaim_id) = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_isolation ON public.opname_bersama_item;
CREATE POLICY tenant_isolation ON public.opname_bersama_item
  AS RESTRICTIVE
  FOR ALL
  USING (public.t5_company_dari_opname(opname_id) = (SELECT auth_company_id()))
  WITH CHECK (public.t5_company_dari_opname(opname_id) = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- 3. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_restrict int;
  t          text;
BEGIN
  FOREACH t IN ARRAY ARRAY['klaim_perjalanan_item', 'opname_bersama_item'] LOOP
    SELECT count(*) INTO n_restrict
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t
       AND permissive = 'RESTRICTIVE'
       AND qual ILIKE '%auth_company_id%';
    IF n_restrict = 0 THEN
      RAISE EXCEPTION '371 gagal: % masih tanpa policy RESTRICTIVE ber-auth_company_id — '
                      'isinya tetap terlihat semua tenant', t;
    END IF;
  END LOOP;

  -- Policy izin yang lama WAJIB tetap ada: yang ditambah adalah lapis tenant,
  -- bukan pengganti lapis izin. Kalau yang lama hilang, siapa pun yang lolos
  -- saringan tenant bisa membaca tanpa punya izinnya.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'klaim_perjalanan_item' AND permissive = 'PERMISSIVE'
  ) THEN
    RAISE EXCEPTION '371 gagal: policy izin klaim_perjalanan_item hilang';
  END IF;

  RAISE NOTICE '371: dua tabel turunan kini menyaring TENANT, bukan izin saja';
END $$;
