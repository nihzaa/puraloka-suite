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

/*
  CADANGAN — DITAMBAHKAN 2026-08-31.

  Pemulihan di atas menyalin DARI salinan tenant, dan alasannya (di kepala
  berkas) benar untuk basis dev: di sana salinan tenant justru yang utuh.

  Di basis yang BARU LAHIR salinan itu belum ada — migrasi 365 yang membuatnya,
  dan 365 berjalan sesudah ini pada rantai yang bersih. Maka INSERT di atas
  memasukkan NOL baris tanpa galat, dan verifikasi di bawah gagal:

      HARD FAIL — 378_admin_template_pulih_izinnya.sql
        378 gagal: admin template masih 34 izin — pemulihan tak berjalan

  Diukur 2026-08-31: admin template memegang 33 dari 230 izin. Sebabnya bukan
  kerusakan melainkan urutan — migrasi 050 memberi SEMUA izin yang ada SAAT
  ITU, dan setiap izin yang lahir sesudahnya hanya sampai ke admin bila
  migrasinya sendiri memberikannya. Sebagian besar tidak.

  Cadangan ini memakai sumber kebenaran yang sama dengan migrasi 050: admin
  memegang seluruh isi `permissions`. Itu bukan pelonggaran — itu definisi
  peran admin di repo ini, dan justru yang membuat penjaga anti-lockout
  (`users:roles:manage`) tak pernah mati diam.

  Hanya berjalan bila jalur utama tak menghasilkan apa-apa, jadi di basis dev
  ia no-op dan alasan "jangan menyalin dari yang rusak" tetap dihormati.
*/
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT tmpl.id, p.id
  FROM public.roles tmpl
  CROSS JOIN public.permissions p
 WHERE tmpl.company_id IS NULL
   AND tmpl.name = 'admin'
   /*
     Syaratnya HASIL, bukan keberadaan salinan.

     Percobaan pertama memakai `NOT EXISTS (salinan berizin)`. Itu tak pernah
     bekerja, dan alasannya baru terlihat setelah diukur: salinan admin tenant
     MEMANG ADA — 72 di antaranya — tetapi seluruhnya hanya memegang 34 izin
     unik. Menyalin dari mereka menghasilkan 34, bukan 200.

     Jadi premis kepala berkas ("salinan tenant justru yang UTUH, 217 izin")
     sudah tak berlaku hari ini. Yang bisa diandalkan hanya keadaan SESUDAH
     jalur utama berjalan: bila templatenya masih kurang, isi dari
     `permissions` — sumber yang sama dengan migrasi 050.
   */
   AND (
     SELECT count(*) FROM public.role_permissions rp2
      WHERE rp2.role_id = tmpl.id
   ) < (SELECT count(*) FROM public.permissions)
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
  /*
    ⚠ PERBANDINGAN INI CACAT SEJAK AWAL — DIPERBAIKI 2026-08-31.

    Versi sebelumnya mencacah SELURUH baris `role_permissions` milik SEMUA
    salinan admin tenant, lalu membandingkannya dengan izin SATU template:

        378 gagal: admin template 230 izin, salinan 2377 izin — tak sepadan

    Diukur: 72 salinan × ±33 izin = 2.377. Angka itu tak pernah bisa sama
    dengan 230 kecuali kebetulan hanya ada SATU tenant — dan itulah keadaan
    saat cek ini ditulis.

    Yang dimaksudkan jelas: tiap salinan harus sepadan dengan templatenya.
    Karena itu yang dibandingkan sekarang jumlah izin salinan TERBANYAK —
    kalau yang terkaya pun tak melebihi template, tak ada salinan yang
    memegang lebih dari yang seharusnya.

    Salinan yang KURANG dari template bukan urusan cek ini: migrasi 365 yang
    menyalin, dan cek `n_beda` di bawah yang menangkapnya per-nama.
  */
  SELECT coalesce(max(n), 0) INTO n_salinan FROM (
    SELECT count(*) n
      FROM public.role_permissions rp
      JOIN public.roles r ON r.id = rp.role_id
     WHERE r.name = 'admin' AND r.company_id IS NOT NULL
     GROUP BY r.id) t;

  IF n_salinan > n_tmpl THEN
    RAISE EXCEPTION '378 gagal: salinan admin terkaya % izin MELEBIHI template % — '
                    'tenant memegang kewenangan yang templatenya sendiri tak punya',
      n_salinan, n_tmpl;
  END IF;

  /*
    SALINAN DISELARASKAN LEBIH DULU — DITAMBAHKAN 2026-08-31.

    Cek di bawah menuntut tiap salinan tenant sepadan dengan templatenya. Itu
    benar, dan sejak cadangan di atas memulihkan template admin ke 230 izin,
    jarak itu jadi terlihat:

        378 gagal: 73 role template masih tak sepadan dengan salinannya

    Migrasi ini memperbaiki TEMPLATE tanpa menurunkan hasilnya ke salinan,
    jadi ia menuntut kesepadanan yang tak ia kerjakan sendiri — bentuk yang
    sudah menggigit tujuh kali hari ini (271, 295, 320, 323, 337, 340, 363).

    Penyelarasan ini hanya MENAMBAH: izin yang ada di template tapi belum di
    salinan. Ia tak pernah mencabut apa pun dari tenant — pencabutan adalah
    keputusan yang tak boleh diambil migrasi pemulihan.
  */
  -- (a) template → salinan: apa pun yang template punya, salinan ikut punya.
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT salinan.id, rp.permission_id
    FROM public.roles tmpl
    JOIN public.roles salinan
      ON salinan.name = tmpl.name AND salinan.company_id IS NOT NULL
    JOIN public.role_permissions rp ON rp.role_id = tmpl.id
   WHERE tmpl.company_id IS NULL
  ON CONFLICT DO NOTHING;

  /*
    (b) salinan → template, ARAH SEBALIKNYA, dan itu memang maksud asli
    migrasi ini (lihat "Kenapa disalin DARI salinan tenant" di kepala berkas).

    Tanpa arah ini, satu ketimpangan tersisa dan cek di bawah tetap merah:

        378 gagal: 1 role template masih tak sepadan dengan salinannya
        (pm: template 18 vs salinan 19)

    Sebabnya izin yang pernah diberikan ke salinan tenant tapi tak pernah
    sampai ke templatenya — `cash:view` pada admin, dan satu lagi pada pm.
    Arah (a) tak bisa menyembuhkannya karena ia hanya menurunkan.

    Keduanya bersama membuat template dan salinan bertemu di GABUNGAN
    keduanya: tak ada yang dicabut dari siapa pun, dan sesudahnya keduanya
    sepadan apa pun keadaan awalnya.
  */
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT tmpl.id, rp.permission_id
    FROM public.roles tmpl
    JOIN public.roles salinan
      ON salinan.name = tmpl.name AND salinan.company_id IS NOT NULL
    JOIN public.role_permissions rp ON rp.role_id = salinan.id
   WHERE tmpl.company_id IS NULL
  ON CONFLICT DO NOTHING;

  -- (c) ulangi (a): izin yang baru masuk ke template lewat (b) harus ikut
  -- turun ke SEMUA salinan, bukan hanya ke salinan yang menyumbangkannya.
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT salinan.id, rp.permission_id
    FROM public.roles tmpl
    JOIN public.roles salinan
      ON salinan.name = tmpl.name AND salinan.company_id IS NOT NULL
    JOIN public.role_permissions rp ON rp.role_id = tmpl.id
   WHERE tmpl.company_id IS NULL
  ON CONFLICT DO NOTHING;

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
