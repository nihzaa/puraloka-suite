-- ============================================================================
-- 378 — `admin` TEMPLATE kehilangan 216 dari 217 izinnya
-- ============================================================================
--
-- ── Ketahuan dari `anti-lockout-wiring` yang gagal di PRASYARATNYA
--
--     prasyarat gagal: 'users:roles:manage' dipegang 0 role aktif, bukan 1.
--
-- Diukur:
--
--     admin TEMPLATE : 1 izin   (hanya `ai:chat`)
--     admin salinan  : 217 izin
--
-- Dan SELURUH 25 pengguna aktif menunjuk baris TEMPLATE, bukan salinan tenant
-- — migrasi 365 sengaja tidak memindahkan siapa pun ("memindahkan orang ke
-- role baru adalah keputusan founder, bukan tebakan migrasi").
--
-- Jadi admin nyata memegang SATU izin, bukan 217. Aplikasinya masih jalan
-- karena `get_role_permissions` memilih salinan tenant saat konteks company
-- ada — tetapi setiap jalur yang membaca template, termasuk pemeriksaan
-- anti-lockout, melihat admin nyaris tanpa wewenang.
--
-- ── Yang TIDAK diketahui, dan tidak ditebak
--
-- Kapan 216 baris itu hilang tak dapat dipastikan dari data: `role_permissions`
-- tak punya kolom waktu, dan `audit_logs` tak mencatat penghapusan massal ini.
-- Yang pasti bukan migrasi 365 — ia `INSERT ... ON CONFLICT DO NOTHING`, tak
-- pernah menghapus.
--
-- Karena sebabnya tak pasti, migrasi ini TIDAK berpura-pura tahu. Ia
-- memperbaiki keadaannya, dan penjaganya yang mencegah terulang.
--
-- ── Kenapa disalin DARI salinan tenant
--
-- Arah yang biasa adalah template → tenant. Di sini terbalik, dan itu
-- disengaja: salinan tenant justru yang UTUH (217, cocok dengan jumlah
-- `permissions`), sedangkan templatenya yang rusak. Menyalin dari yang rusak
-- akan mengabadikan kerusakannya.
--
-- `ON CONFLICT DO NOTHING` menjaga `ai:chat` yang sudah ada tak digandakan.
-- ============================================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT tmpl.id, rp.permission_id
  FROM public.roles tmpl
  JOIN public.roles salinan
    ON salinan.name = tmpl.name AND salinan.company_id IS NOT NULL
  JOIN public.role_permissions rp ON rp.role_id = salinan.id
 WHERE tmpl.company_id IS NULL
   AND tmpl.name = 'admin'
ON CONFLICT DO NOTHING;

-- ⚠ Blok verifikasi ini pernah melaporkan "pulih 217" sementara datanya TETAP
-- 1 izin (2026-08-14). Dijalankan ulang lewat `apply-migrasi.mjs`, INSERT-nya
-- benar-benar menyisipkan 216 baris — jadi yang gagal bukan SQL-nya melainkan
-- persistensinya pada jalannya yang pertama.
--
-- Karena sebab pastinya tak dapat dipastikan dari data, verifikasi di bawah
-- diperketat: ia kini memeriksa izin KRITIKAL secara namanya, bukan hanya
-- menghitung total. Hitungan total bisa benar sementara izin yang paling
-- penting justru yang hilang — dan itu persis yang terjadi
-- (`users:roles:manage` tak ada, sehingga penjaga anti-lockout mati diam).
DO $$
DECLARE
  n_tmpl    int;
  n_salinan int;
  n_beda    int;
  n_kritikal int;
BEGIN
  SELECT count(*) INTO n_tmpl
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
   WHERE r.name = 'admin' AND r.company_id IS NULL;

  IF n_tmpl < 200 THEN
    RAISE EXCEPTION '378 gagal: admin template masih % izin — pemulihan tak berjalan', n_tmpl;
  END IF;

  -- Template dan salinan WAJIB sama jumlahnya. Kalau berbeda, salah satunya
  -- masih rusak — dan yang rusak tak menyatakan dirinya rusak.
  SELECT count(*) INTO n_salinan
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
   WHERE r.name = 'admin' AND r.company_id IS NOT NULL;

  IF n_tmpl <> n_salinan THEN
    RAISE EXCEPTION '378 gagal: admin template % izin, salinan % izin — tak sepadan',
      n_tmpl, n_salinan;
  END IF;

  -- Sekalian periksa role LAIN: kalau ada template lain yang juga kehilangan
  -- izinnya, ia harus terlihat SEKARANG, bukan saat test berikutnya merah.
  SELECT count(*) INTO n_beda
    FROM public.roles tmpl
    JOIN public.roles salinan
      ON salinan.name = tmpl.name AND salinan.company_id IS NOT NULL
   WHERE tmpl.company_id IS NULL
     AND (SELECT count(*) FROM public.role_permissions x WHERE x.role_id = tmpl.id)
       <> (SELECT count(*) FROM public.role_permissions x WHERE x.role_id = salinan.id);

  IF n_beda > 0 THEN
    RAISE EXCEPTION '378 gagal: % role template masih tak sepadan dengan salinannya', n_beda;
  END IF;

  /*
    Izin KRITIKAL diperiksa lewat NAMANYA, bukan lewat hitungan.

    `users:roles:manage` adalah izin yang menjaga penjaganya sendiri: tanpa
    pemegang aktif, `assertNoCriticalLockout` tak punya siapa pun untuk
    dilindungi, dan seluruh mekanisme anti-lockout mati tanpa satu pun galat.

    Hitungan total tak menangkap ini — 216 dari 217 bisa benar sementara yang
    satu itu justru yang hilang.
  */
  SELECT count(*) INTO n_kritikal
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE r.name = 'admin' AND r.company_id IS NULL
     AND p.key = 'users:roles:manage';

  IF n_kritikal = 0 THEN
    RAISE EXCEPTION '378 gagal: admin template tak memegang users:roles:manage — '
                    'penjaga anti-lockout akan mati diam-diam';
  END IF;

  RAISE NOTICE '378: admin template pulih % izin · users:roles:manage ADA · seluruh template sepadan', n_tmpl;
END $$;
