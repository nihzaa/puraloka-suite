-- ============================================================================
-- 376 — Keanggotaan TUNGGAL ditandai default: `auth_company_id()` berhenti NULL
-- ============================================================================
--
-- ── Cacat yang SUDAH tercatat di QUEUE, dengan peringatan untuk saya
--
-- `docs/execution/QUEUE.yaml` (item tenancy jalur AI) menulis persis ini:
--
--     auth_company_id() = COALESCE(app.company_id,
--                         company_members WHERE is_default AND is_active)
--
--     Test tak menyetel `app.company_id`, dan pengguna klien di basis dev
--     TIDAK punya baris `company_members` ber-`is_default`.
--     Jadi auth_company_id() → NULL → auth_client_id() → NULL.
--
--     ⚠ Dicatat supaya tak terulang: sesi berikutnya yang menjalankan suite
--     penuh akan melihat 6 berkas merah dan mengira dirinya merusak sesuatu.
--
-- Sesi berikutnya itu saya, hari ini. Catatan itu menyelamatkan satu jam
-- penelusuran — dan menunjukkan bahwa dokumen yang menulis CARA MENGUKUR
-- benar-benar bekerja.
--
-- ── Yang diukur sekarang
--
--     total company_members is_default : 11
--     pengguna klien anggota           : ya, semuanya
--     pengguna klien ber-is_default    : 1 dari 5
--
-- QUEUE menawarkan dua jalan: test menyetel `app.company_id`, atau seed
-- membuat baris default. Yang dipilih di sini yang KEDUA, dan alasannya bukan
-- kemudahan:
--
-- `auth_company_id()` jatuh ke keanggotaan default justru untuk melayani
-- permintaan yang TIDAK membawa konteks company — dan itu keadaan nyata di
-- produksi, bukan hanya di test. Pengguna yang cuma anggota SATU perusahaan
-- tetapi tak punya baris default akan kehilangan seluruh aksesnya pada jalur
-- itu. Menambal test-nya saja akan menyembunyikan gejala yang benar.
--
-- ── Kenapa HANYA yang keanggotaannya tunggal
--
-- Untuk pengguna yang anggota beberapa perusahaan, "mana yang default"
-- adalah keputusan yang tak boleh ditebak migrasi — memilih yang salah
-- berarti orang itu membuka aplikasi di perusahaan yang keliru. Yang tunggal
-- tak punya ambiguitas: satu-satunya keanggotaannya memang defaultnya.
--
-- Yang majemuk sengaja DIBIARKAN. Kalau nanti ada, ia butuh pilihan sadar di
-- UI, bukan tebakan di SQL.
-- ============================================================================

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
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_tanpa   int;
  n_ganda   int;
  n_default int;
BEGIN
  -- Nol pengguna berkeanggotaan TUNGGAL yang masih tanpa default.
  SELECT count(*) INTO n_tanpa FROM (
    SELECT user_id FROM public.company_members WHERE is_active
     GROUP BY user_id
    HAVING count(*) = 1 AND count(*) FILTER (WHERE is_default) = 0
  ) x;
  IF n_tanpa > 0 THEN
    RAISE EXCEPTION '376 gagal: % pengguna berkeanggotaan tunggal masih tanpa is_default', n_tanpa;
  END IF;

  -- Tak boleh ada pengguna dengan DUA default — `auth_company_id()` memakai
  -- LIMIT 1, jadi dua default berarti company yang dipilih tak dapat ditebak
  -- dan bisa berubah antar-kueri.
  SELECT count(*) INTO n_ganda FROM (
    SELECT user_id FROM public.company_members
     WHERE is_active AND is_default
     GROUP BY user_id HAVING count(*) > 1
  ) x;
  IF n_ganda > 0 THEN
    RAISE EXCEPTION '376 gagal: % pengguna punya LEBIH DARI SATU keanggotaan default', n_ganda;
  END IF;

  SELECT count(*) INTO n_default FROM public.company_members WHERE is_default;
  RAISE NOTICE '376: % keanggotaan default · nol tunggal-tanpa-default · nol ganda', n_default;
END $$;
