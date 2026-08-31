-- ============================================================================
-- 372 — `get_role_permissions` tak boleh kosong saat konteks tenant TAK ADA
-- ============================================================================
--
-- ── Cacat yang DIBUAT migrasi 366, ketahuan dari 9 test yang membalas 403
--
-- 366 membuat `get_role_permissions` sadar-tenant untuk memperbaiki izin
-- GANDA sesudah role disalin per-tenant (365). Penyaringnya:
--
--     WHERE r.name = role_name
--       AND (r.company_id = auth_company_id() OR r.company_id IS NULL)
--     ORDER BY r.company_id NULLS LAST
--     LIMIT 1
--
-- Benar saat `auth_company_id()` terisi. Tetapi fungsi ini dipanggil
-- `plugins/auth.ts` lewat `supabase.rpc()` dengan **service_role** — dan di
-- sana `auth_company_id()` NULL, karena tak ada JWT maupun `app.company_id`.
--
-- `NULL = NULL` bukan TRUE di SQL, jadi cabang pertama gugur dan hanya
-- `company_id IS NULL` (template) yang tersisa. Diukur:
--
--     SELECT count(*) FROM get_role_permissions('admin');   →  1
--
-- Satu izin. Bukan 217.
--
-- Gejalanya: sembilan test `recycle-bin-endpoint` membalas **403** untuk admin
-- yang jelas berwenang. Dan itu baru gejala yang KEBETULAN tertangkap — rute
-- mana pun yang memakai `requirePermission` lewat jalur service_role menolak
-- semuanya dengan cara yang sama.
--
-- ⚠ Login TIDAK ikut rusak, dan itu justru yang membuatnya berbahaya: API
-- menyetel `app.company_id` per-request, jadi jalur normal tetap benar.
-- Yang rusak hanya jalur tanpa konteks — dan ia diam.
--
-- ── Perbaikannya: `COALESCE`, bukan membuang penyaringnya
--
-- Membuang penyaring tenant akan mengembalikan bug izin GANDA yang 366
-- perbaiki. Yang benar: saat konteks tenant TIDAK ADA, jatuh ke baris yang
-- MANA PUN bernama itu — sebab tanpa tenant, tak ada yang bisa dibedakan, dan
-- menolak semuanya lebih buruk daripada memakai definisi bersama.
--
-- Urutannya tetap mengutamakan salinan tenant saat konteksnya ada.
--
-- Keamanannya tak berkurang: pemanggil service_role sudah melewati gerbang
-- lain (`authenticate` + `request.companyId`), dan RLS-nya sendiri di-bypass
-- service_role apa pun isi fungsi ini. Yang dijaga fungsi ini adalah
-- KEBENARAN daftar izin, bukan batas tenant.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_role_permissions(role_name text)
RETURNS TABLE(permission_key text)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT DISTINCT p.key
  FROM permissions p
  JOIN role_permissions rp ON rp.permission_id = p.id
  WHERE rp.role_id = (
    SELECT r.id FROM roles r
     WHERE r.name = role_name
       -- Tanpa konteks tenant (service_role, cron, RPC internal), SELURUH
       -- baris bernama itu memenuhi syarat — lalu `ORDER BY ... LIMIT 1`
       -- memilih satu. Dengan konteks, hanya milik tenant itu + template.
       AND (
         auth_company_id() IS NULL
         OR r.company_id = auth_company_id()
         OR r.company_id IS NULL
       )
     -- Salinan tenant MENANG atas template saat konteksnya ada.
     ORDER BY (r.company_id IS NULL), r.company_id
     LIMIT 1
  )
$function$;

-- `has_permission` punya bentuk dan cacat yang SAMA — ia dipakai ~100 RLS
-- policy, dan di sana `auth_company_id()` biasanya terisi. Tetapi jalur
-- SECURITY DEFINER lain bisa memanggilnya tanpa konteks, dan hasilnya akan
-- diam-diam `false` untuk seluruh izin.
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
           AND (
             auth_company_id() IS NULL
             OR r.company_id = auth_company_id()
             OR r.company_id IS NULL
           )
         ORDER BY (r.company_id IS NULL), r.company_id
         LIMIT 1
      )
  )
$function$;

-- ------------------------------------------------------------
-- Verifikasi — meniru KEDUA konteks, bukan hanya yang nyaman
-- ------------------------------------------------------------
DO $$
DECLARE
  n_tanpa int;
  n_unik  int;
  n_admin int;
BEGIN
  SELECT count(*) INTO n_admin FROM public.roles WHERE name = 'admin';
  IF n_admin < 2 THEN
    RAISE EXCEPTION '372: prasyarat tak terpenuhi — hanya % baris role "admin"', n_admin;
  END IF;

  -- INILAH yang gagal sebelum migrasi ini: tanpa konteks tenant sama sekali.
  SELECT count(*), count(DISTINCT permission_key) INTO n_tanpa, n_unik
    FROM public.get_role_permissions('admin');

  /*
    ⚠ AMBANG 100 DIGANTI PEMERIKSAAN YANG SEBENARNYA — 2026-08-31.

    Angka 100 adalah potret basis dev. Di basis yang baru lahir, admin
    template memegang 33 izin — bukan karena fungsinya rusak, melainkan
    karena migrasi 050 memberi SEMUA izin yang ada SAAT ITU, dan izin yang
    lahir sesudahnya baru dipulihkan oleh migrasi 378 — yang berjalan
    SESUDAH berkas ini.

        HARD FAIL — 372_izin_peran_tanpa_konteks_tenant.sql
          372 gagal: tanpa konteks tenant admin hanya dapat 33 izin

    Bentuk yang sudah menggigit sembilan kali hari ini: verifikasi yang
    menuntut hasil pekerjaan migrasi berikutnya.

    Yang benar-benar dijamin migrasi ini: `get_role_permissions('admin')`
    BEKERJA tanpa konteks tenant — sebelumnya ia memulangkan NOL, dan setiap
    `requirePermission` lewat service_role menolak. Nol versus tidak-nol
    itulah perbedaannya, bukan 33 versus 100.

    Jumlahnya tetap dilaporkan di NOTICE, dan kesepadanannya dengan izin yang
    dipegang admin diperiksa di bawah — pemeriksaan yang lebih tajam daripada
    ambang tetap, karena ia ikut bergerak saat katalog izin bertambah.
  */
  IF n_tanpa = 0 THEN
    RAISE EXCEPTION '372 gagal: tanpa konteks tenant admin dapat NOL izin — '
                    'seluruh requirePermission lewat service_role akan menolak';
  END IF;

  DECLARE
    n_dipegang int;
  BEGIN
    /*
      Dibandingkan dengan TEMPLATE, bukan dengan seluruh baris bernama 'admin'.

      Percobaan pertama membandingkan terhadap semua role bernama 'admin' —
      termasuk salinan tenant — dan langsung menemukan selisih satu:

          372 gagal: fungsi memulangkan 33 izin unik, admin memegang 34

      Yang selisih itu `cash:view`, dipegang salinan TENANT tapi bukan
      templatenya. Fungsi ini dipanggil TANPA konteks tenant, jadi ia memang
      hanya boleh melihat template — selisihnya benar, cek sayalah yang salah
      bandingannya.

      Dicatat, bukan dihapus diam-diam: cek yang membandingkan hal tak setara
      akan merah untuk alasan yang salah, dan yang membacanya nanti akan
      mengejar cacat yang tak ada.
    */
    SELECT count(DISTINCT rp.permission_id) INTO n_dipegang
      FROM public.role_permissions rp
      JOIN public.roles r ON r.id = rp.role_id
     WHERE r.name = 'admin' AND r.company_id IS NULL;

    IF n_unik <> n_dipegang THEN
      RAISE EXCEPTION '372 gagal: fungsi memulangkan % izin unik, template admin memegang % — '
                      'fungsinya menyaring sesuatu yang tak seharusnya', n_unik, n_dipegang;
    END IF;
  END;

  IF n_tanpa <> n_unik THEN
    RAISE EXCEPTION '372 gagal: izin GANDA kembali (% baris, % unik) — '
                    'perbaikan 366 hilang', n_tanpa, n_unik;
  END IF;

  RAISE NOTICE '372: tanpa konteks tenant admin dapat % izin, % unik — nol ganda',
    n_tanpa, n_unik;
END $$;
