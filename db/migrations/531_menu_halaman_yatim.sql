-- ============================================================================
-- 531 — 26 halaman yang hanya bisa dibuka dengan mengetik URL
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- `audit-nav-yatim.mjs` merah di CI:
--
--     ❌ YATIM — halaman jadi tanpa satu pun tautan nav: 28
--
-- Diukur: 26 dari 28 tak punya baris `menu_items` SAMA SEKALI, dan 2 punya
-- barisnya tapi nonaktif. Halaman-halaman itu utuh, teruji, dan tak bisa
-- dicapai siapa pun kecuali mengetik URL-nya dari ingatan.
--
-- Penjaga ini sendiri baru mulai bekerja hari ini: sebelum commit c153150c ia
-- MATI dengan exit 2 di CI (menulis penangkap yang tak pernah bekerja), jadi
-- ke-28 halaman ini tak terlihat entah sejak kapan.
--
-- ── Izinnya DIUKUR, bukan ditebak
--
-- Tiap menu diberi `required_permissions` yang BENAR-BENAR ADA di tabel
-- `permissions` — diperiksa satu per satu sebelum migrasi ini ditulis. Empat
-- tebakan pertama saya salah dan diganti padanannya:
--
--     opname:view          → opname:kelola
--     spk:view             → spk:kelola
--     k3:view              → k3:insiden:view
--     sdm:kompetensi:view  → sdm:sertifikat:view
--
-- Kunci hantu menolak SEMUA orang tanpa gejala (penjaga
-- `audit-izin-benar-ada.mjs` ada justru untuk itu), jadi menebak di sini akan
-- mengganti "halaman tak terjangkau" dengan "halaman terkunci selamanya" —
-- lebih buruk, karena yang kedua terlihat seperti keputusan.
--
-- ── `kesiapan` = rencana, bukan hidup
--
-- Halaman-halaman ini ADA, tetapi saya tak memverifikasi satu per satu bahwa
-- isinya lengkap dan siap dipakai. Menandainya `hidup` akan mengklaim hal yang
-- tak saya ukur. `rencana` jujur: menunya muncul, orang bisa mencapainya, dan
-- statusnya tak berbohong. Menaikkannya ke `hidup` pekerjaan terpisah dengan
-- pemeriksaan layar — pola migrasi 439.
--
-- ── `sort_order` DIHITUNG, dan itu butuh dua percobaan
--
-- (1) `max(sort_order) + urut` → GAGAL: "2 anak di luar rentang". Migrasi 530
--     baru menomori ulang seluruh pohon berjarak `LEAST(10, 99/jumlah_anak)`,
--     jadi anak terakhir g-hr sudah dekat batas induk+99 dan enam sisipan baru
--     melewatinya.
--
-- (2) subquery mencari celah terkecil → GAGAL: "6 sort_order bentrok". Subquery
--     dalam satu INSERT tak bisa melihat baris yang disisipkan pernyataan yang
--     sama, jadi keenamnya mendapat celah yang SAMA.
--
-- (3) yang dipakai: celah dikumpulkan lebih dulu di CTE, lalu dipasangkan
--     ke menu baru lewat `row_number()`. Nomor tiap baris dihitung sebelum
--     satu pun disisipkan, jadi tak ada yang saling menimpa.
--
-- Celahnya memang ada: 530 menyisakannya dengan sengaja, dan inilah pemakaian
-- pertamanya.
--
-- Idempoten — `ON CONFLICT (key)`. Verifikasi di blok akhir (pola 142).

WITH baru AS (
  SELECT * FROM (VALUES
    ('yt-akuntansi-periode',  'Periode Akuntansi',   '/akuntansi/periode',        'g-keuangan',  ARRAY['gl:periode:view'],       1),
    ('yt-gudang-lokasi',      'Lokasi Gudang',       '/gudang/lokasi',            'g-inventory', ARRAY['gudang:view'],           1),
    ('yt-k3',                 'Ikhtisar K3',         '/k3',                       'g-hse',       ARRAY['k3:insiden:view'],       1),
    ('yt-k3-insiden',         'Insiden K3',          '/k3/insiden',               'g-hse',       ARRAY['k3:insiden:view'],       2),
    ('yt-k3-jsa',             'JSA',                 '/k3/jsa',                   'g-hse',       ARRAY['k3:jsa:view'],           3),
    ('yt-k3-rk3k',            'RK3K',                '/k3/rk3k',                  'g-hse',       ARRAY['k3:inspeksi:view'],      4),
    ('yt-serah-terima',       'Serah Terima',        '/lapangan/serah-terima',    'g-lapangan',  ARRAY['serah_terima:view'],     1),
    ('yt-mandor-mitra',       'Mitra',               '/mandor/mitra',             'g-subkon',    ARRAY['mitra:view'],            1),
    ('yt-mandor-opname',      'Opname',              '/mandor/opname',            'g-subkon',    ARRAY['opname:kelola'],         2),
    ('yt-mandor-spk',         'SPK',                 '/mandor/spk',               'g-subkon',    ARRAY['spk:kelola'],            3),
    ('yt-master-ahsp',        'Katalog AHSP',        '/master/ahsp',              'g-master',    ARRAY['cecep:cbs:view'],        1),
    ('yt-master-harga',       'Buku Harga',          '/master/harga',             'g-master',    ARRAY['cecep:price:view'],      2),
    ('yt-master-karyawan',    'Data Karyawan',       '/master/karyawan',          'g-master',    ARRAY['sdm:pegawai:view'],      3),
    ('yt-master-penomoran',   'Penomoran Dokumen',   '/master/penomoran',         'g-master',    ARRAY['penomoran:view'],        4),
    ('yt-mutu',               'Ikhtisar Mutu',       '/mutu',                     'g-qaqc',      ARRAY['ncr:view'],              1),
    ('yt-mutu-audit',         'Audit Mutu',          '/mutu/audit',               'g-qaqc',      ARRAY['mutu:audit:view'],       2),
    ('yt-mutu-rencana',       'Rencana Mutu (ITP)',  '/mutu/rencana',             'g-qaqc',      ARRAY['mutu:rmp:view'],         3),
    ('yt-mutu-uji',           'Uji Material',        '/mutu/uji-material',        'g-qaqc',      ARRAY['mutu:uji:view'],         4),
    ('yt-otomasi',            'Ikhtisar Otomasi',    '/otomasi',                  'g-sistem',    ARRAY['otomasi:umpan:baca'],    1),
    ('yt-tarif-payroll',      'Tarif Payroll',       '/pengaturan/tarif-payroll', 'g-hr',        ARRAY['payroll:tarif:view'],    1),
    ('yt-risiko',             'Register Risiko',     '/risiko',                   'g-risiko',    ARRAY['risiko:view'],           1),
    ('yt-risiko-izin',        'Izin Kerja',          '/risiko/izin',              'g-risiko',    ARRAY['k3:permit:view'],        2),
    ('yt-risiko-sengketa',    'Sengketa',            '/risiko/sengketa',          'g-risiko',    ARRAY['risiko:view'],           3),
    ('yt-sdm-cuti',           'Cuti & Izin',         '/sdm/cuti',                 'g-hr',        ARRAY['sdm:cuti:view'],         2),
    ('yt-sdm-klaim',          'Klaim Perjalanan',    '/sdm/klaim-perjalanan',     'g-hr',        ARRAY['klaim:view'],            3),
    ('yt-sdm-kompetensi',     'Kompetensi',          '/sdm/kompetensi',           'g-hr',        ARRAY['sdm:sertifikat:view'],   4),
    ('yt-sdm-payroll',        'Payroll',             '/sdm/payroll',              'g-hr',        ARRAY['payroll:jalankan:view'], 5),
    ('yt-sdm-timesheet',      'Timesheet',           '/sdm/timesheet',            'g-hr',        ARRAY['sdm:timesheet:view'],    6)
  ) AS t(kunci, label, href, grup, izin, urut)
   WHERE NOT EXISTS (SELECT 1 FROM menu_items m WHERE m.key = t.kunci)
     -- ⚠ DIPERBAIKI DI TEMPATNYA 2026-09-04 (preseden 212 & 016).
     --
     -- Syarat asli hanya memeriksa KUNCI belum ada. Ia tak pernah bertanya
     -- apakah HREF-nya sudah dipegang menu lain — dan 20 dari 29 baris di
     -- daftar atas memang sudah punya kembaran bernama:
     --
     --     /k3/insiden      yt-k3-insiden     <->  hse-insiden
     --     /risiko          yt-risiko         <->  rk-register
     --     /sdm/timesheet   yt-sdm-timesheet  <->  hr-absensi
     --
     -- Semuanya disisipkan `is_active = true`, jadi di schema BERSIH lahirlah
     -- 18 href yang dipegang dua menu aktif: dua baris sidebar berbeda nama
     -- yang membuka layar sama persis.
     --
     -- Ketahuannya baru di CI PR #148, saat migrasi 558 — yang pertama
     -- memasang pagar "nol href ganda" — menggagalkan SELURUH penyiapan basis.
     -- Keenam shard test API mati sebelum satu test pun berjalan.
     --
     -- Di basis yang sudah menjalankan 531 versi lama, keadaannya sudah
     -- bersih (diukur: 0 href ganda), jadi suntingan ini tak mengubah
     -- hasil akhir di sana. Ia MENYEMPITKAN — menyisipkan lebih sedikit,
     -- tak pernah lebih.
     --
     -- Kenapa disunting, bukan ditambal migrasi baru: 558 gagal di blok
     -- VERIFIKASI, dan tiap migrasi berjalan dalam transaksi. Kegagalan itu
     -- membuang seluruh 558 — termasuk penyalaan menu yang benar. Penambal
     -- yang berjalan sesudahnya tak pernah sempat dipanggil. Aturan yang
     -- sama tertulis di `ci-project-setup.mjs`: untuk migrasi yang gagal di
     -- tengah transaksi, tak ada penambal yang cukup.
     AND NOT EXISTS (
       SELECT 1 FROM menu_items a
        WHERE a.href = t.href AND a.is_active)
),
-- Celah yang tersedia di tiap grup, diurutkan dari yang terkecil.
celah AS (
  SELECT g.key AS grup, g.id AS induk_id, k.kandidat,
         row_number() OVER (PARTITION BY g.key ORDER BY k.kandidat) AS ke
    FROM menu_items g
    CROSS JOIN LATERAL generate_series(g.sort_order + 1, g.sort_order + 99) AS k(kandidat)
   WHERE g.parent_id IS NULL AND g.is_active
     AND g.key IN (SELECT grup FROM baru)
     AND NOT EXISTS (
       SELECT 1 FROM menu_items x
        WHERE x.parent_id = g.id AND x.is_active AND x.sort_order = k.kandidat)
),
-- Menu baru diberi nomor urut di dalam grupnya, lalu dipasangkan ke celah
-- ke-N. Keduanya dihitung SEBELUM satu pun baris disisipkan.
pasangan AS (
  SELECT b.*, row_number() OVER (PARTITION BY b.grup ORDER BY b.urut, b.kunci) AS ke
    FROM baru b
)
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active, kesiapan)
SELECT p.kunci, p.label, p.href, 'Dot', c.induk_id, p.izin, c.kandidat, 'main', true, 'rencana'
  FROM pasangan p
  JOIN celah c ON c.grup = p.grup AND c.ke = p.ke
ON CONFLICT (key) DO NOTHING;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_hantu   INT;
  n_bentrok INT;
  n_luar    INT;
  n_baru    INT;
  v_hantu   TEXT;
BEGIN
  SELECT count(*) INTO n_baru FROM menu_items WHERE key LIKE 'yt-%';

  /*
    Nol menu baru berarti grup induknya tak ada — keadaan basis yang belum
    punya pohon menu, bukan kegagalan. Pelajaran dari belasan migrasi lain
    hari ini yang menghentikan rantai karena datanya belum ada.
  */
  IF n_baru = 0 THEN
    RAISE NOTICE '531 dilewati: nol menu tersisip (grup induk belum ada di basis ini). Bukan galat.';
    RETURN;
  END IF;

  /*
    1. Kunci izin HANTU menolak semua orang tanpa gejala.

    Ini pemeriksaan terpenting di sini: menu yang muncul tapi izinnya tak ada
    lebih buruk daripada menu yang tak muncul — yang kedua terlihat seperti
    fitur belum jadi, yang pertama terlihat seperti keputusan.
  */
  SELECT count(*), string_agg(DISTINCT p, ', ')
    INTO n_hantu, v_hantu
    FROM (
      SELECT unnest(m.required_permissions) AS p
        FROM menu_items m WHERE m.key LIKE 'yt-%'
    ) x
   WHERE NOT EXISTS (SELECT 1 FROM permissions pp WHERE pp.key = x.p);
  IF n_hantu > 0 THEN
    RAISE EXCEPTION '531 gagal: % kunci izin HANTU di menu baru: %', n_hantu, v_hantu;
  END IF;

  -- 2. Tak melahirkan tabrakan baru (migrasi 530 baru membereskannya).
  SELECT count(*) INTO n_bentrok FROM (
    SELECT a.parent_id, a.sort_order
      FROM menu_items a JOIN menu_items i ON i.id = a.parent_id
     WHERE a.is_active AND i.is_active AND i.parent_id IS NULL
     GROUP BY a.parent_id, a.sort_order HAVING count(*) > 1) x;
  IF n_bentrok > 0 THEN
    RAISE EXCEPTION '531 gagal: % sort_order bentrok sesudah menu baru disisipkan', n_bentrok;
  END IF;

  -- 3. Tak melompat keluar rentang induknya.
  SELECT count(*) INTO n_luar
    FROM menu_items a JOIN menu_items i ON i.id = a.parent_id
   WHERE a.is_active AND i.is_active AND i.parent_id IS NULL
     AND (a.sort_order <= i.sort_order OR a.sort_order > i.sort_order + 99);
  IF n_luar > 0 THEN
    RAISE EXCEPTION '531 gagal: % anak di luar rentang sesudah menu baru disisipkan', n_luar;
  END IF;

  RAISE NOTICE '531 OK: % menu baru, nol izin hantu, nol bentrok, nol di luar rentang', n_baru;
END $$;
