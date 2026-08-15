-- ============================================================================
-- 394 — Memulihkan keanggotaan default yang hilang, dan MENGUNCINYA
-- ============================================================================
--
-- ── Bagaimana ini ketahuan
--
-- `t5b-kill-switch` merah 3 dari 3 kali, terisolasi — bukan beban. Pesannya
-- menyesatkan ke arah yang mahal:
--
--     auth_client_id() memulangkan baris klien dari company lain —
--     kebocoran lintas-tenant: expected null to be 'b0000000-…'
--
-- Terbaca seperti kebocoran isolasi tenant. Bukan. `auth_client_id()`
-- memulangkan NULL karena `auth_company_id()` NULL, dan itu NULL karena si
-- pengguna tak punya keanggotaan `is_default`.
--
-- Diukur 2026-08-14: **13 pengguna aktif tanpa keanggotaan default**,
-- SEMUANYA berkeanggotaan tunggal. Bukan kasus rumit — sisa dari celah di
-- rute set-default.
--
-- ── Kenapa ini lebih berbahaya daripada terlihat
--
-- `auth_company_id()` jatuh ke keanggotaan default. Tanpa satu pun, ia NULL —
-- lalu `tenant_isolation` RESTRICTIVE (migrasi 373) menyaring HABIS.
--
-- Pengguna melihat NOL data. Tak ada galat, tak ada layar merah, tak ada baris
-- log. Gejalanya identik dengan kebocoran dari sisi berlawanan, dan keduanya
-- sama-sama diam — persis yang sudah dicatat migrasi 379.
--
-- ── Kenapa 379 tidak cukup
--
-- Migrasi 379 memperbaiki hal yang SAMA kemarin, dan verifikasinya lulus:
-- nol pengguna tanpa default. Hari ini 13 lagi.
--
-- Karena 379 membersihkan GEJALA tanpa menutup sumbernya. Rute
-- `PATCH /my/companies/:id/default` menurunkan SEMUA default lebih dulu, baru
-- menaikkan yang dipilih. Kegagalan penurunan sudah diperiksa; kegagalan
-- KENAIKAN tidak — dan di situ pengguna tertinggal dengan nol default.
--
-- Urutannya sudah dibalik di commit yang sama (naikkan dulu, baru turunkan
-- sisanya), jadi kelas kerusakannya hilang — bukan sekadar peluangnya
-- diperkecil. Migrasi ini membersihkan yang terlanjur ada.
--
-- ── Kenapa aman
--
-- Ketiga belas pengguna berkeanggotaan TUNGGAL: hanya ada satu company yang
-- bisa jadi default, jadi tak ada yang ditebak. Untuk pengguna berkeanggotaan
-- ganda tanpa default, migrasi ini SENGAJA TIDAK memilihkan — memilih company
-- mana yang terbuka saat login adalah preferensi pemiliknya, dan menebaknya
-- berarti membuka perusahaan yang salah tanpa ia pernah memintanya.
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
-- 2. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_tanpa   int;
  n_ganda   int;
  n_dobel   int;
BEGIN
  /*
    Yang diperiksa: pengguna aktif berkeanggotaan TUNGGAL yang masih tanpa
    default. Itulah yang migrasi ini janji tutup.

    Pengguna berkeanggotaan ganda sengaja tak dihitung sebagai kegagalan —
    migrasi ini memang tak menyentuhnya, dan menuntut nol untuk sesuatu yang
    tak dikerjakan membuat verifikasi berbohong ke arah yang menyenangkan.
  */
  SELECT count(*) INTO n_tanpa
    FROM public.users u
   WHERE u.is_active
     AND EXISTS (SELECT 1 FROM public.company_members m
                  WHERE m.user_id = u.id AND m.is_active)
     AND NOT EXISTS (SELECT 1 FROM public.company_members m
                      WHERE m.user_id = u.id AND m.is_default AND m.is_active)
     AND (SELECT count(*) FROM public.company_members m
           WHERE m.user_id = u.id AND m.is_active) = 1;
  IF n_tanpa > 0 THEN
    RAISE EXCEPTION '394 gagal: % pengguna berkeanggotaan tunggal masih tanpa default — '
                    'auth_company_id() NULL, dan RLS menyaring habis', n_tanpa;
  END IF;

  -- Dilaporkan, TIDAK memerahkan: ini di luar lingkup migrasi.
  SELECT count(*) INTO n_ganda
    FROM public.users u
   WHERE u.is_active
     AND NOT EXISTS (SELECT 1 FROM public.company_members m
                      WHERE m.user_id = u.id AND m.is_default AND m.is_active)
     AND (SELECT count(*) FROM public.company_members m
           WHERE m.user_id = u.id AND m.is_active) > 1;

  /*
    Dua default sekaligus juga diukur — itu keadaan yang urutan LAMA di rute
    set-default bisa hasilkan, dan `auth_company_id()` memulangkan salah
    satunya secara sembarang.

    Tidak memerahkan: keduanya company yang SAH bagi pengguna itu, jadi ia
    melihat data — bukan layar kosong. Gangguan, bukan kelumpuhan.
  */
  SELECT count(*) INTO n_dobel
    FROM (SELECT user_id FROM public.company_members
           WHERE is_active AND is_default
           GROUP BY user_id HAVING count(*) > 1) x;

  RAISE NOTICE '394: nol pengguna tunggal tanpa default · % berkeanggotaan ganda tanpa default (sengaja tak ditebak) · % punya dua default',
    n_ganda, n_dobel;
END $$;
