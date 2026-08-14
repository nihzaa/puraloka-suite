-- ============================================================================
-- 379 — Menutup dua sisa: keanggotaan default yang terlewat & izin admin
-- ============================================================================
--
-- Migrasi 376 dan 378 sudah menangani dua hal ini, tetapi keduanya menyisakan
-- baris yang belum tersentuh saat diverifikasi ulang 2026-08-14:
--
--   376  3 pengguna aktif masih tanpa keanggotaan `is_default`
--        (Pak Slamet, Bapak Hendra Susanto, Nizar Puraloka)
--   378  `admin` TEMPLATE kembali ke 1 izin
--
-- ── Kenapa 378 "kembali" — dan ini bukan misteri
--
-- Yang menghapus 216 izin itu **test `anti-lockout-wiring` sendiri**. Ia
-- sengaja mencabut izin kritikal lewat endpoint untuk membuktikan penjaganya
-- menahan. Sebelum `utils/role-guard.ts` diperbaiki (commit 224b373e),
-- penjaganya LOLOS — jadi pencabutannya benar-benar terjadi, dan test yang
-- dirancang menguji lockout justru MENYEBABKANNYA.
--
-- Jadi urutannya: penjaga rusak → test mencabut → izin hilang → dipulihkan →
-- test dijalankan lagi → hilang lagi. Setiap kali suite penuh berjalan.
--
-- Sesudah `role-guard` diperbaiki, dibuktikan: test lulus 6/6 DAN izin admin
-- tetap 217 sesudahnya. Migrasi ini menutup residu terakhirnya.
--
-- ── Kenapa keanggotaan default penting
--
-- `auth_company_id()` jatuh ke keanggotaan default saat `app.company_id` tak
-- ada. Tanpa baris default, ia NULL — dan `tenant_isolation` RESTRICTIVE
-- (migrasi 373) menyaring HABIS. Diukur: mandor dengan 3 assignment melihat
-- **0 proyek**.
--
-- Itu bukan RLS yang bocor melainkan RLS yang terlalu rapat karena datanya
-- kurang. Gejalanya identik dengan kebocoran dari sisi berlawanan, dan
-- keduanya sama-sama tak melempar galat.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Keanggotaan tunggal → default
-- ------------------------------------------------------------
WITH tunggal AS (
  SELECT user_id
    FROM public.company_members
   WHERE is_active
   GROUP BY user_id
  HAVING count(*) = 1
     AND count(*) FILTER (WHERE is_default) = 0
)
UPDATE public.company_members m
   SET is_default = true
  FROM tunggal t
 WHERE m.user_id = t.user_id
   AND m.is_active;

-- ------------------------------------------------------------
-- 2. Izin `admin` TEMPLATE disamakan dengan salinan tenant
-- ------------------------------------------------------------
-- Arah salin TERBALIK dari biasa (tenant → template), dan itu disengaja:
-- salinannya yang utuh 217, templatenya yang tergerus.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT tmpl.id, rp.permission_id
  FROM public.roles tmpl
  JOIN public.roles salinan
    ON salinan.name = tmpl.name AND salinan.company_id IS NOT NULL
  JOIN public.role_permissions rp ON rp.role_id = salinan.id
 WHERE tmpl.company_id IS NULL
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 3. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_tanpa    int;
  n_kritikal int;
  n_beda     int;
BEGIN
  SELECT count(*) INTO n_tanpa
    FROM public.users u
   WHERE u.is_active
     AND NOT EXISTS (
       SELECT 1 FROM public.company_members m
        WHERE m.user_id = u.id AND m.is_default AND m.is_active);
  IF n_tanpa > 0 THEN
    RAISE EXCEPTION '379 gagal: % pengguna aktif masih tanpa keanggotaan default — '
                    'auth_company_id() NULL, dan RLS menyaring habis', n_tanpa;
  END IF;

  -- Diperiksa lewat NAMANYA, bukan lewat hitungan total: 216 dari 217 bisa
  -- benar sementara yang satu ini justru yang hilang — dan tanpa izin ini,
  -- penjaga anti-lockout tak punya siapa pun untuk dilindungi.
  SELECT count(*) INTO n_kritikal
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE r.name = 'admin' AND r.company_id IS NULL
     AND p.key = 'users:roles:manage';
  IF n_kritikal = 0 THEN
    RAISE EXCEPTION '379 gagal: admin template tak memegang users:roles:manage';
  END IF;

  SELECT count(*) INTO n_beda
    FROM public.roles tmpl
    JOIN public.roles salinan
      ON salinan.name = tmpl.name AND salinan.company_id IS NOT NULL
   WHERE tmpl.company_id IS NULL
     AND (SELECT count(*) FROM public.role_permissions x WHERE x.role_id = tmpl.id)
       <> (SELECT count(*) FROM public.role_permissions x WHERE x.role_id = salinan.id);
  IF n_beda > 0 THEN
    RAISE EXCEPTION '379 gagal: % role template tak sepadan dengan salinannya', n_beda;
  END IF;

  RAISE NOTICE '379: nol pengguna tanpa default · admin template utuh · seluruh template sepadan';
END $$;
