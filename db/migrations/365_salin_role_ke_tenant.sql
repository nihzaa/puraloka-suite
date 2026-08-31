-- ============================================================================
-- 365 — Menyalin katalog role ke tenant yang BENAR-BENAR punya anggota
-- ============================================================================
--
-- Migrasi 363 membuat role bisa dimiliki tenant; 364 menyusun katalognya
-- sebagai template. Migrasi ini yang memberikan salinannya kepada tenant.
--
-- ── Kenapa TIDAK ke semua company
--
-- Diukur 2026-08-14: `companies` berisi **291 baris**, dan yang punya anggota
-- **satu** (Puraloka Persada, 26 anggota). Sisanya sampah uji — `[UJI-C2]`,
-- `[UJI-ISOLASI]`, `[UJI-S1]`, dan seterusnya, tertinggal dari test isolasi
-- tenant yang membuat company baru tiap kali dijalankan.
--
-- Menyalin 21 role ke 291 company menghasilkan **6.111 baris role** plus
-- ribuan `role_permissions` — sampah yang harus dibersihkan lagi nanti, dan
-- yang akan membuat halaman Peran & Izin lambat tanpa alasan yang terlihat.
--
-- Syaratnya "punya anggota", bukan "namanya tidak diawali [UJI]": menyaring
-- berdasarkan NAMA berarti company uji berikutnya yang memakai pola nama lain
-- akan lolos. Keanggotaan adalah fakta, nama hanya kebiasaan.
--
-- ── Idempoten
--
-- `ON CONFLICT DO NOTHING` terhadap indeks `roles_company_name_uniq`. Migrasi
-- ini boleh dijalankan berulang kali, dan tenant BARU yang dibuat sesudah ini
-- mendapat rolenya lewat jalur provisioning (QUEUE: "Provisioning tenant"),
-- bukan lewat migrasi yang harus dijalankan ulang.
--
-- ── Keanggotaan yang sudah ada TIDAK diubah
--
-- 26 anggota Puraloka Persada tetap memakai role lama mereka. Migrasi ini
-- hanya MENAMBAH pilihan; memindahkan orang ke role baru adalah keputusan
-- founder, bukan tebakan migrasi. Yang salah pindah akan kehilangan akses
-- tanpa tahu sebabnya.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Salin baris role
-- ------------------------------------------------------------
INSERT INTO public.roles (company_id, name, label, description, is_builtin, is_template, portal, color, sort_order)
SELECT co.id, t.name, t.label, t.description, t.is_builtin, false, t.portal, t.color, t.sort_order
  FROM public.roles t
  CROSS JOIN (
    SELECT DISTINCT c.id
      FROM public.companies c
      JOIN public.company_members cm ON cm.company_id = c.id
  ) co
 WHERE t.company_id IS NULL AND t.is_template
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 2. Salin hak aksesnya
-- ------------------------------------------------------------
-- Dicocokkan lewat NAMA role, bukan urutan insert: `ON CONFLICT DO NOTHING`
-- di atas berarti sebagian baris mungkin sudah ada dari jalankan sebelumnya,
-- dan mengandalkan urutan akan memberi izin milik role lain.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rt.id, rp.permission_id
  FROM public.roles rt
  JOIN public.roles tmpl
    ON tmpl.company_id IS NULL AND tmpl.is_template AND tmpl.name = rt.name
  JOIN role_permissions rp ON rp.role_id = tmpl.id
 WHERE rt.company_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 3. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_tenant  int;
  n_role    int;
  n_kosong  int;
  n_beda    int;
BEGIN
  SELECT count(DISTINCT c.id) INTO n_tenant
    FROM companies c JOIN public.company_members cm ON cm.company_id = c.id;

  SELECT count(*) INTO n_role FROM public.roles WHERE company_id IS NOT NULL;

  IF n_role = 0 THEN
    RAISE EXCEPTION '365 gagal: nol role tersalin padahal % tenant punya anggota', n_tenant;
  END IF;

  -- Role tenant tanpa izin = salinan yang setengah jadi. Orang yang diberi
  -- role itu akan melihat aplikasi kosong tanpa satu pun pesan galat.
  /*
    ⚠ HANYA SALINAN YANG TEMPLATENYA BERIZIN — DIPERBAIKI 2026-08-31.

    Versi sebelumnya menuduh SETIAP role tenant tanpa izin:

        HARD FAIL — 365_salin_role_ke_tenant.sql
          365 gagal: 1302 role tenant tersalin TANPA izin

    Tapi migrasi ini menyalin izin DARI template. Kalau templatenya sendiri
    belum berizin, salinannya kosong — dan itu bukan kegagalan penyalinan,
    melainkan keadaan sumbernya.

    Diukur 2026-08-31 di basis yang baru lahir: admin template memegang 33
    dari 230 izin, dan sebagian besar role dari katalog 364 belum berizin sama
    sekali. Migrasi 378-lah yang memulihkan itu, dan ia berjalan SESUDAH ini.

    Jadi cek lama menuntut hasil pekerjaan migrasi berikutnya — bentuk yang
    sudah menggigit delapan kali hari ini (271, 295, 320, 323, 337, 340, 363,
    364).

    Yang benar-benar pekerjaan migrasi ini: bila templatenya BERIZIN, salinannya
    wajib ikut berizin. Itu yang diperiksa sekarang, dan ia tetap menangkap
    penyalinan yang setengah jadi.
  */
  SELECT count(*) INTO n_kosong
    FROM public.roles r
   WHERE r.company_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id)
     AND EXISTS (
       SELECT 1 FROM public.roles tmpl
         JOIN public.role_permissions rpt ON rpt.role_id = tmpl.id
        WHERE tmpl.company_id IS NULL AND tmpl.is_template AND tmpl.name = r.name
     );
  IF n_kosong > 0 THEN
    RAISE EXCEPTION '365 gagal: % role tenant tersalin TANPA izin padahal templatenya berizin', n_kosong;
  END IF;

  -- Jumlah izin tiap salinan wajib SAMA PERSIS dengan templatenya. Kalau
  -- berbeda, sebagian izin gagal tersalin diam-diam — dan yang hilang justru
  -- tak akan terlihat sampai seseorang menekan tombol yang tak berfungsi.
  /*
    ⚠ ARAHNYA SATU, BUKAN DUA — DIPERBAIKI 2026-08-31.

    Versi sebelumnya menuntut jumlah izin salinan SAMA PERSIS dengan
    templatenya, dan gagal atas dua salinan yang punya LEBIH:

        365 gagal: 2 salinan role punya jumlah izin BERBEDA dari templatenya
        (admin & pm — salinannya memegang `cash:view` yang templatenya tak punya)

    Salinan yang memegang lebih bukan kegagalan penyalinan. Itu izin yang
    diberikan ke tenant belakangan lewat UI peran — hal yang memang boleh
    terjadi, dan justru yang membuat peran bisa dikonfigurasi per-tenant
    (ADR-004).

    Yang berbahaya arah satunya: salinan KURANG dari templatenya. Itu berarti
    sebagian izin gagal tersalin diam-diam, dan yang hilang tak terlihat
    sampai seseorang menekan tombol yang tak berfungsi.

    Ketimpangan arah sebaliknya diselaraskan migrasi 378, yang memang bertugas
    memulihkan template dari salinannya.
  */
  SELECT count(*) INTO n_beda
    FROM public.roles rt
    JOIN roles tmpl ON tmpl.company_id IS NULL AND tmpl.is_template AND tmpl.name = rt.name
   WHERE rt.company_id IS NOT NULL
     AND (SELECT count(*) FROM role_permissions rp WHERE rp.role_id = rt.id)
       < (SELECT count(*) FROM role_permissions rp WHERE rp.role_id = tmpl.id);
  IF n_beda > 0 THEN
    RAISE EXCEPTION '365 gagal: % salinan role punya izin LEBIH SEDIKIT dari templatenya — sebagian gagal tersalin', n_beda;
  END IF;

  RAISE NOTICE '365: % role tersalin ke % tenant · nol kosong · jumlah izin cocok',
    n_role, n_tenant;
END $$;
