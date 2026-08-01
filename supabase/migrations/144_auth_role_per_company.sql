-- Migration 144 — `auth_role()` membaca peran PER-COMPANY (ROADMAP #13 / T10).
--
-- ── Cacatnya
--
-- `auth_role()` membaca `users.role_id` — peran GLOBAL yang satu per orang:
--
--     SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id
--      WHERE u.auth_id = auth.uid()
--
-- Padahal keanggotaan sesungguhnya ada di `company_members(company_id, user_id,
-- role_id)`. Orang yang admin di PT A tapi PM di PT B akan mendapat peran yang
-- sama di keduanya — yaitu peran global-nya. Salah satunya pasti keliru.
--
-- Fungsi ini dipakai 100 RLS policy. Ia lapis pertahanan kedua (API memakai
-- service_role yang mem-bypass RLS), tapi justru karena itu kekeliruannya tak
-- akan terlihat dari pemakaian sehari-hari sampai lapis itu benar-benar dipakai.
--
-- ── Kenapa aman dikerjakan sekarang
--
-- Diverifikasi di dev sebelum menulis migrasi ini:
--   • companies                                  = 1
--   • user yang menjadi anggota lebih dari 1 company = 0
--   • company_members.role_id yang BERBEDA dari users.role_id = 0
--
-- Artinya untuk data hari ini, kedua sumber menghasilkan jawaban yang identik —
-- perubahan ini behavior-preserving. Memperbaikinya SEKARANG jauh lebih murah
-- daripada saat badan usaha kedua sudah berisi data nyata, karena saat itu
-- perbedaannya akan langsung berdampak pada siapa melihat apa.
--
-- ── Bentuknya meniru `auth_company_id()` yang sudah ada
--
-- Prioritas: company aktif dari `app.company_id` (di-set per-request), lalu
-- fallback ke keanggotaan default. Konsisten dengan fungsi tetangganya, bukan
-- pola baru yang harus dipelajari terpisah.
--
-- FALLBACK TERAKHIR ke `users.role_id` DIPERTAHANKAN dengan sengaja: user yang
-- belum punya baris `company_members` (mis. dibuat sebelum multi-company, atau
-- sedang dalam proses onboarding) akan kehilangan SELURUH aksesnya kalau
-- fallback dibuang. Mengunci orang keluar dari sistemnya sendiri adalah kegagalan
-- yang lebih besar daripada peran yang kurang presisi.

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    -- 1. Peran pada company yang SEDANG aktif.
    (SELECT r.name
       FROM company_members cm
       JOIN roles r ON r.id = cm.role_id
      WHERE cm.user_id = auth_user_id()
        AND cm.company_id = auth_company_id()
        AND cm.is_active
      LIMIT 1),
    -- 2. Belum punya keanggotaan sama sekali → peran global lama.
    --    Tanpa ini, user pra-multi-company kehilangan seluruh akses.
    (SELECT r.name
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.auth_id = auth.uid())
  );
$function$;

-- ------------------------------------------------------------
-- Verifikasi — behavior-preserving harus DIBUKTIKAN, bukan diklaim.
--
-- Untuk setiap anggota aktif, peran per-company harus sama dengan peran global
-- pada data hari ini. Kalau tidak, migrasi ini mengubah siapa-melihat-apa dan
-- itu harus ketahuan SEKARANG, bukan setelah ter-deploy.
-- ------------------------------------------------------------
DO $$
DECLARE
  n_beda INT;
BEGIN
  SELECT count(*) INTO n_beda
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
   WHERE cm.is_active
     AND cm.role_id IS DISTINCT FROM u.role_id;

  IF n_beda > 0 THEN
    RAISE EXCEPTION
      '144 dibatalkan: % anggota punya role per-company BERBEDA dari users.role_id. '
      'Perubahan ini tidak lagi behavior-preserving — tinjau manual dulu.', n_beda;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_role') THEN
    RAISE EXCEPTION '144 gagal: auth_role tidak terbentuk';
  END IF;
END $$;
