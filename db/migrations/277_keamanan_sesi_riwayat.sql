-- ============================================================================
-- 277 — Sesi aktif & riwayat masuk: dua fungsi baca-saja di skema public
-- ============================================================================
--
-- Halaman Keamanan menampilkan tiga hal: status MFA, sesi yang masih hidup,
-- dan peristiwa masuk terakhir. Yang pertama sudah dilayani Supabase lewat
-- `auth.mfa.*`. Dua sisanya tidak — dan alasannya baru terlihat saat diuji:
--
--     Invalid schema: auth
--     Only the following schemas are exposed: public, graphql_public
--
-- PostgREST memang TIDAK mengekspos skema `auth`, dan itu benar: membukanya
-- berarti seluruh tabel kredensial ikut terjangkau lewat REST.
--
-- ── Kenapa RPC, bukan koneksi `pg` langsung dari API
--
-- `pg` ada di dependensi dan bisa dipakai. Tapi itu berarti kredensial basis
-- kedua hidup di proses API — satu lagi tempat yang harus dijaga, dirotasi,
-- dan tak boleh bocor ke log. Fungsi `SECURITY DEFINER` di `public` memberi
-- akses yang SAMA SEMPITNYA tanpa menambah kredensial apa pun.
--
-- ── Yang membuat fungsi ini aman
--
-- Keduanya memaku `p_user_id` sebagai parameter WAJIB dan hanya mengembalikan
-- baris milik id itu. Pemanggilnya (routes/v1/keamanan.ts) mengisinya dari
-- `request.currentUser.auth_id`, BUKAN dari parameter HTTP — parameter yang
-- menentukan akun siapa yang dibaca adalah cara paling langsung membuat
-- kebocoran lintas-akun.
--
-- `search_path` dipaku kosong: fungsi SECURITY DEFINER tanpa itu bisa
-- dibelokkan lewat objek bernama sama di skema yang lebih dulu ditemukan.
-- Semua nama karena itu ditulis lengkap (`auth.sessions`, bukan `sessions`).
--
-- EXECUTE hanya untuk `service_role`. `anon` dan `authenticated` TIDAK
-- diberikan — kalau diberikan, siapa pun yang punya kunci publik bisa
-- memanggilnya dengan id orang lain.
-- ============================================================================

-- ── Sesi aktif ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.keamanan_sesi(p_user_id UUID)
RETURNS TABLE (
  id         UUID,
  dibuat     TIMESTAMPTZ,
  terakhir   TIMESTAMPTZ,
  perangkat  TEXT,
  ip         TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT s.id, s.created_at, s.updated_at, s.user_agent, host(s.ip)
    FROM auth.sessions s
   WHERE s.user_id = p_user_id
   ORDER BY s.updated_at DESC NULLS LAST
   LIMIT 20;
$$;

COMMENT ON FUNCTION public.keamanan_sesi(UUID) IS
  'Sesi auth milik SATU pengguna. Dipanggil routes/v1/keamanan.ts dengan '
  'auth_id pemanggil — jangan pernah dari parameter HTTP.';

-- ── Riwayat masuk ───────────────────────────────────────────────────────────
--
-- `auth.audit_log_entries` tak punya kolom user_id — pelakunya ada di dalam
-- payload JSON (`actor_id`). Penyaringan karena itu dilakukan DI SQL, bukan
-- di aplikasi: versi pertama rute ini menarik 200 baris terakhir lalu
-- menyaringnya di Node, dan itu salah dua kali — ia membaca peristiwa milik
-- orang lain ke dalam proses, dan tetap bisa mengembalikan NOL baris untuk
-- pengguna yang peristiwanya lebih tua dari 200 baris terakhir.
CREATE OR REPLACE FUNCTION public.keamanan_riwayat_masuk(p_user_id UUID)
RETURNS TABLE (
  id      UUID,
  aksi    TEXT,
  waktu   TIMESTAMPTZ,
  ip      TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT a.id,
         coalesce(a.payload ->> 'action', 'tak diketahui'),
         a.created_at,
         nullif(a.ip_address, '')
    FROM auth.audit_log_entries a
   WHERE a.payload ->> 'actor_id' = p_user_id::text
   ORDER BY a.created_at DESC
   LIMIT 10;
$$;

COMMENT ON FUNCTION public.keamanan_riwayat_masuk(UUID) IS
  'Sepuluh peristiwa auth terakhir milik SATU pengguna. Penyaringan di SQL '
  'supaya peristiwa orang lain tak pernah masuk ke proses aplikasi.';

-- ── Hak jalan: service_role SAJA ────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.keamanan_sesi(UUID)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.keamanan_riwayat_masuk(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.keamanan_sesi(UUID)          TO service_role;
GRANT EXECUTE ON FUNCTION public.keamanan_riwayat_masuk(UUID) TO service_role;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
--
-- Memeriksa yang benar-benar menentukan, bukan sekadar "fungsinya ada":
--   1. keduanya SECURITY DEFINER (kalau tidak, ia tak bisa membaca auth.*)
--   2. search_path dipaku (kalau tidak, bisa dibelokkan)
--   3. anon/authenticated TIDAK punya EXECUTE
--   4. fungsinya benar-benar mengembalikan baris untuk pengguna yang ada
DO $$
DECLARE
  n_definer INT;
  n_path    INT;
  n_bocor   INT;
  uji_id    UUID;
  n_sesi    INT;
BEGIN
  SELECT count(*) INTO n_definer FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('keamanan_sesi','keamanan_riwayat_masuk')
     AND p.prosecdef;
  IF n_definer <> 2 THEN
    RAISE EXCEPTION '277 gagal: % dari 2 fungsi SECURITY DEFINER', n_definer;
  END IF;

  SELECT count(*) INTO n_path FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('keamanan_sesi','keamanan_riwayat_masuk')
     AND array_to_string(p.proconfig, ',') LIKE '%search_path%';
  IF n_path <> 2 THEN
    RAISE EXCEPTION '277 gagal: % dari 2 fungsi memaku search_path', n_path;
  END IF;

  SELECT count(*) INTO n_bocor
    FROM information_schema.routine_privileges
   WHERE routine_schema = 'public'
     AND routine_name IN ('keamanan_sesi','keamanan_riwayat_masuk')
     AND grantee IN ('anon','authenticated','PUBLIC');
  IF n_bocor > 0 THEN
    RAISE EXCEPTION '277 gagal: % hak EXECUTE bocor ke anon/authenticated', n_bocor;
  END IF;

  -- Fungsi yang "ada" tetapi selalu mengembalikan nol baris terlihat identik
  -- dengan fungsi yang benar pada pengguna yang memang belum punya sesi.
  -- Diuji dengan pengguna yang JELAS punya sesi.
  SELECT s.user_id INTO uji_id FROM auth.sessions s
   GROUP BY s.user_id ORDER BY count(*) DESC LIMIT 1;

  IF uji_id IS NOT NULL THEN
    SELECT count(*) INTO n_sesi FROM public.keamanan_sesi(uji_id);
    IF n_sesi = 0 THEN
      RAISE EXCEPTION '277 gagal: keamanan_sesi mengembalikan 0 baris untuk pengguna yang punya sesi';
    END IF;
    RAISE NOTICE '277 OK — 2 fungsi SECURITY DEFINER, search_path dipaku, nol kebocoran hak, % sesi terbaca', n_sesi;
  ELSE
    RAISE NOTICE '277 OK — 2 fungsi terpasang (tak ada sesi untuk diuji)';
  END IF;
END $$;
