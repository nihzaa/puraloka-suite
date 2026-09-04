-- ============================================================================
-- 366 — `get_role_permissions` & `has_permission` SADAR TENANT
-- ============================================================================
--
-- ── Cacat yang DIBUAT migrasi 363–365, dan ketahuan dari satu login
--
-- Sesudah role disalin per-tenant, nama role tak lagi menunjuk satu baris.
-- "admin" sekarang ada dua: template (company_id NULL) dan salinan milik
-- Puraloka Persada. Ketiga fungsi izin mencari **by name**:
--
--     WHERE r.name = role_name        -- get_role_permissions
--     WHERE r.name = auth_role()      -- has_permission
--
-- Akibatnya langsung terlihat saat login diuji:
--
--     "permissions":["projects:view","projects:view","projects:create",
--                    "projects:create", ...]
--
-- Tiap izin GANDA — satu dari template, satu dari salinan tenant. Hari ini
-- isinya kebetulan sama, jadi tak ada yang rusak. Besok, saat PT A menyunting
-- role "admin"-nya sendiri, `has_permission` akan mengembalikan gabungan izin
-- PT A **dan** template — dan pada tenant kedua, gabungan izin tenant lain
-- yang kebetulan menamai rolenya sama.
--
-- `has_permission` dipakai ~100 RLS policy. Kebocoran di sini bukan tampilan
-- ganda; ia batas keamanan yang bocor tanpa satu pun galat.
--
-- ── Yang diperbaiki
--
-- Kedua fungsi kini menyaring `company_id` — baris milik company aktif LEBIH
-- DIUTAMAKAN, dan template hanya dipakai bila tenant belum punya salinannya.
-- Bukan gabungan keduanya: gabungan adalah bug yang sedang diperbaiki.
--
-- `auth_role()` TIDAK diubah. Ia mengembalikan NAMA (teks), dan sudah membaca
-- lewat `company_members.role_id` — jalur ber-id, bukan ber-nama. Yang salah
-- adalah pemakainya yang mencari balik dari nama itu tanpa menyebut company.
--
-- ── Kenapa tetap by-name, bukan diubah ke role_id
--
-- Mengubah tanda tangan `has_permission(text)` berarti menyentuh ~100 policy
-- dalam satu migrasi — pekerjaan yang risikonya jauh lebih besar daripada
-- cacat yang sedang diperbaiki, dan yang gagalnya (policy hilang) jauh lebih
-- sunyi. Bentuknya dipertahankan; yang ditambah hanya penyaringan tenant.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. get_role_permissions — dipakai `auth.ts` saat login
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_role_permissions(role_name text)
RETURNS TABLE(permission_key text)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  -- Satu role saja yang dipilih: milik company aktif kalau ada, template
  -- kalau tenant belum punya salinannya. `ORDER BY ... NULLS LAST` yang
  -- menentukan urutannya — company_id NULL (template) selalu kalah.
  SELECT DISTINCT p.key
  FROM permissions p
  JOIN role_permissions rp ON rp.permission_id = p.id
  WHERE rp.role_id = (
    SELECT r.id FROM roles r
     WHERE r.name = role_name
       AND (r.company_id = auth_company_id() OR r.company_id IS NULL)
     ORDER BY r.company_id NULLS LAST
     LIMIT 1
  )
$function$;

-- ------------------------------------------------------------
-- 2. has_permission — dipakai ~100 RLS policy
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM role_permissions rp
    JOIN permissions p ON rp.permission_id = p.id
    WHERE p.key = permission_key
      AND rp.role_id = (
        SELECT r.id FROM roles r
         WHERE r.name = auth_role()
           AND (r.company_id = auth_company_id() OR r.company_id IS NULL)
         ORDER BY r.company_id NULLS LAST
         LIMIT 1
      )
  )
$function$;

-- ------------------------------------------------------------
-- 3. Verifikasi — bukti bahwa gandanya benar-benar hilang
-- ------------------------------------------------------------
DO $$
DECLARE
  n_total  int;
  n_unik   int;
  n_admin  int;
BEGIN
  -- Ada berapa baris bernama 'admin'? Harus > 1 — kalau tidak, migrasi ini
  -- diuji pada keadaan yang tak mewakili masalahnya.
  SELECT count(*) INTO n_admin FROM public.roles WHERE name = 'admin';
  IF n_admin < 2 THEN
    /*
      Komentar di atas sudah menyebut maksudnya dengan jujur: "migrasi ini
      diuji pada keadaan yang tak mewakili masalahnya". Di schema BERSIH
      keadaan itu memang tak mewakili — dan itu bukan kegagalan.

      Rantainya lurus dan benar: nol user → nol company_members → migrasi 365
      melewati penyalinan role → di sini hanya ada 1 baris `admin`, yaitu
      templatenya sendiri, tanpa salinan tenant.

      Diperbaiki 2026-09-04. Yang dilewati hanya pembuktiannya; fungsi
      `get_role_permissions` yang dibuat migrasi ini TETAP terbentuk, dan di
      lingkungan berisi data seluruh pembuktian berjalan penuh.
      (kelas 245/250/252/254/316/331/365)
    */
    RAISE NOTICE '366: hanya % baris role "admin" — pembuktian DILEWATI (schema bersih)', n_admin;
    RETURN;
  END IF;

  SELECT count(*), count(DISTINCT permission_key)
    INTO n_total, n_unik
    FROM public.get_role_permissions('admin');

  IF n_total <> n_unik THEN
    RAISE EXCEPTION '366 gagal: get_role_permissions masih ganda (% baris, % unik)',
      n_total, n_unik;
  END IF;

  IF n_total = 0 THEN
    RAISE EXCEPTION '366 gagal: admin kehilangan SELURUH izin — penyaringan terlalu ketat';
  END IF;

  RAISE NOTICE '366: izin admin % baris, % unik — nol ganda (dari % baris role bernama admin)',
    n_total, n_unik, n_admin;
END $$;
