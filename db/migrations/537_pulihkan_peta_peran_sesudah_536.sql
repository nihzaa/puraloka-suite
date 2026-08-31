-- ============================================================================
-- 537 · Pulihkan peta peran yang tertimpa migrasi 536
-- ============================================================================
--
-- ══════════════════════════════════════════════════════════════════════════
-- BUKAN KESALAHAN SIAPA-SIAPA — DUA PERBAIKAN YANG SALING MENIMPA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Migrasi 526 (hari ini) mencabut lima izin pembukuan dari `client` dan empat
-- dari `mandor`, karena klien — PIHAK LUAR yang membayar kontraktor — memegang
-- `gl:view` (buku besar) dan `gudang:susut:view` (rencana susut = MARGIN).
--
-- Migrasi 536 (hari ini juga, sesi lain) menutup cacat yang berbeda: 16
-- migrasi disunting SESUDAH tercatat, jadi suntingannya tak pernah berlaku.
-- Ia me-replay tindakan mereka — dan dua di antaranya mengembalikan apa yang
-- 526 cabut:
--
--   · blok "364" memberi ulang `finance:view` ke `client`
--   · blok "378" memberi admin SELURUH 230 izin, termasuk dua yang sengaja
--     tak dipegang siapa pun
--
-- Keduanya benar untuk masalah yang mereka tutup. Yang tak bisa diketahui
-- penulis 536: `client.finance:view` baru dicabut beberapa jam sebelumnya, dan
-- dua izin itu kosong karena keputusan, bukan karena terlewat.
--
-- Diukur sesudah 536 berjalan:
--
--     client.finance:view      73 baris  (termasuk template)
--     approval:override_sod    73 peran  (admin)
--     mitra:daftar_hitam       73 peran  (admin)
--
-- ── Kenapa `finance:view` TIDAK boleh kembali ke client
--
-- Deskripsinya di tabel `permissions`: "Melihat dashboard keuangan, invoice,
-- kasbon". Kasbon adalah pinjaman KARYAWAN — gaji orang, bukan urusan
-- pelanggan. Dan rute yang dijaganya tak memeriksa peran tambahan, jadi klien
-- yang memanggilnya langsung akan dijawab.
--
-- ── Kenapa dua izin itu tetap KOSONG
--
--   approval:override_sod  "Menyetujui pengajuan sendiri." Memberikannya ke
--                          admin membuat SELURUH rantai approval jadi hiasan —
--                          pemisahan tugas adalah pengendalian internal, bukan
--                          formalitas. Tiap pemakaiannya tercatat permanen di
--                          `sod_override`, dan catatan itu tak ada gunanya bila
--                          semua orang memilikinya.
--   mitra:daftar_hitam     Menutup penghidupan orang. Lewat proses, bukan satu
--                          klik.
--
-- Keduanya tetap BISA diberikan lewat UI pengaturan peran bila founder
-- memutuskan begitu. Yang dijaga di sini hanya BAWAANNYA.
--
-- ── Kenapa migrasi maju, bukan mengedit 536
--
-- 536 sudah berjalan dan tercatat. Mengeditnya berarti berkas menyimpang dari
-- kenyataan basis — cacat yang persis dijelaskan 536 itu sendiri di kepalanya.
--
-- ── Idempoten: DELETE yang sudah tak ada = 0 baris.
-- ============================================================================

DO $$
DECLARE
  n_client int;
  n_sod    int;
  n_hitam  int;
  n_sisa   int;
BEGIN
  /* 1. `finance:view` dicabut lagi dari client — template DAN 72 tenant. */
  WITH dibuang AS (
    DELETE FROM role_permissions rp
     USING roles r, permissions p
     WHERE rp.role_id = r.id
       AND rp.permission_id = p.id
       AND r.name = 'client'
       AND p.key IN ('gl:view', 'assets:view', 'gudang:view',
                     'gudang:susut:view', 'finance:view')
    RETURNING 1
  )
  SELECT count(*) INTO n_client FROM dibuang;

  /* 2. Dua izin yang sengaja kosong — dicabut dari SIAPA PUN yang memegangnya. */
  WITH dibuang AS (
    DELETE FROM role_permissions rp
     USING permissions p
     WHERE rp.permission_id = p.id
       AND p.key = 'approval:override_sod'
    RETURNING 1
  )
  SELECT count(*) INTO n_sod FROM dibuang;

  WITH dibuang AS (
    DELETE FROM role_permissions rp
     USING permissions p
     WHERE rp.permission_id = p.id
       AND p.key = 'mitra:daftar_hitam'
    RETURNING 1
  )
  SELECT count(*) INTO n_hitam FROM dibuang;

  /*
    3. `mandor` diperiksa juga — 536 blok "364" menyebutnya, dan meski
       `finance:view` tak ada di daftar cabutnya untuk mandor, empat izin
       lain dari 526 bisa ikut kembali lewat penyelarasan template↔tenant.
  */
  DELETE FROM role_permissions rp
   USING roles r, permissions p
   WHERE rp.role_id = r.id
     AND rp.permission_id = p.id
     AND r.name = 'mandor'
     AND p.key IN ('gl:view', 'assets:view', 'gudang:susut:view', 'finance:view');

  /*
    3b. Izin DASAR mandor & client dipulihkan.

    Blok "364" di migrasi 536 memberi izin dasar HANYA kepada peran yang
    `NOT EXISTS (... rp.role_id = r.id)` — yaitu yang izinnya KOSONG SAMA
    SEKALI. Untuk peran yang sudah punya sebagian, blok itu tak berlaku.

    Akibatnya diukur sesudah 536 berjalan:

        mandor   27 izin -> 4   (tersisa hanya empat k3:*)
        client    8 izin -> 3

    Mandor kehilangan kasbon, progres, punch, submittal, MR — inti
    pekerjaannya. Aplikasi mobile-nya akan kehilangan tab, dan tak satu pun
    galat menyebutkan kenapa (tab disaring izin, ADR-004).

    Daftar di bawah = daftar migrasi 536 blok "364", DIKURANGI yang sengaja
    dicabut migrasi 526, ditambah izin lapangan yang memang dipakai
    `mandor-portal`. `gudang:view` DIPERTAHANKAN untuk mandor — ia perlu tahu
    stok material; itu bedanya dengan client.
  */
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM roles r
    CROSS JOIN permissions p
   WHERE (
     (r.name = 'mandor' AND p.key IN (
        'projects:view', 'projects:baseline:view',
        'mandor:view', 'mandor:worker:manage', 'mandor:wage:create',
        'mandor:kasbon:create',
        'procurement:view', 'procurement:mr:manage',
        'reports:view', 'reports:progress',
        'gudang:view',
        'punch:view', 'punch:manage',
        'ncr:view', 'ncr:manage',
        'inspeksi:view', 'inspeksi:manage',
        'submittal:view', 'submittal:manage',
        'rfi:view', 'kepatuhan:view',
        'k3:permit:view', 'k3:permit:manage', 'k3:jsa:view',
        'k3:insiden:view', 'k3:insiden:manage', 'k3:inspeksi:view'))
     OR
     (r.name = 'client' AND p.key IN (
        'projects:view', 'projects:baseline:view', 'reports:progress',
        'punch:view', 'ncr:view', 'inspeksi:view', 'submittal:view',
        'k3:permit:view'))
   )
  ON CONFLICT DO NOTHING;

  /*
    4. Direktur disamakan lagi dengan admin.

    Blok "378" di migrasi 536 memberi admin SELURUH 230 izin, tetapi tidak
    menyentuh direktur — jadi direktur yang migrasi 526 naikkan ke 227 kini
    tertinggal lagi, sekarang dari admin yang izinnya bertambah.

    Ini bukan penyimpangan dari keputusan founder ("direktur setara
    superadmin"); ini menjaganya tetap berlaku sesudah admin berubah.
    Dijalankan SESUDAH pencabutan di atas, supaya dua izin yang sengaja
    kosong tidak ikut tersalin dari admin.
  */
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT rd.id, rpa.permission_id
    FROM roles rd
    JOIN roles ra
      ON ra.name = 'admin'
     AND ra.company_id IS NOT DISTINCT FROM rd.company_id
    JOIN role_permissions rpa ON rpa.role_id = ra.id
   WHERE rd.name = 'direktur'
  ON CONFLICT DO NOTHING;

  -- ── VERIFIKASI ────────────────────────────────────────────────────────

  /* Nol izin pembukuan di client, di company MANA PUN. */
  SELECT count(*) INTO n_sisa
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.name = 'client'
     AND p.key IN ('gl:view', 'assets:view', 'gudang:view',
                   'gudang:susut:view', 'finance:view');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION '537 gagal: client masih memegang % izin pembukuan', n_sisa;
  END IF;

  /* Nol izin pembukuan di mandor (gudang:view dikecualikan — ia perlu stok). */
  SELECT count(*) INTO n_sisa
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.name = 'mandor'
     AND p.key IN ('gl:view', 'assets:view', 'gudang:susut:view', 'finance:view');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION '537 gagal: mandor masih memegang % izin pembukuan', n_sisa;
  END IF;

  /* Dua izin berbahaya kembali kosong. */
  SELECT count(*) INTO n_sisa
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key IN ('approval:override_sod', 'mitra:daftar_hitam');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION
      '537 gagal: % pemegang izin yang seharusnya kosong', n_sisa;
  END IF;

  /* Direktur TETAP setara admin — 536 tak boleh membatalkan itu juga. */
  SELECT count(*) INTO n_sisa
    FROM roles rd
    JOIN roles ra
      ON ra.name = 'admin'
     AND ra.company_id IS NOT DISTINCT FROM rd.company_id
   WHERE rd.name = 'direktur'
     AND EXISTS (
       SELECT 1 FROM role_permissions rpa
        WHERE rpa.role_id = ra.id
          AND NOT EXISTS (SELECT 1 FROM role_permissions rpd
                           WHERE rpd.role_id = rd.id
                             AND rpd.permission_id = rpa.permission_id));
  IF n_sisa > 0 THEN
    RAISE EXCEPTION
      '537 gagal: % company punya direktur yang tertinggal dari admin', n_sisa;
  END IF;

  /*
    Mandor & client wajib punya izin yang CUKUP untuk bekerja.

    Ambang ini menangkap arah kegagalan yang berlawanan dengan pemeriksaan di
    atas: bukan kelebihan izin, melainkan kekurangan. Sesudah 536, mandor
    tinggal 4 izin — dan gejalanya hanya tab yang hilang, tanpa galat.
  */
  SELECT count(*) INTO n_sisa
    FROM roles r JOIN role_permissions rp ON rp.role_id = r.id
   WHERE r.name = 'mandor' AND r.company_id IS NULL;
  IF n_sisa < 20 THEN
    RAISE EXCEPTION
      '537 gagal: mandor template hanya % izin — terlalu sedikit untuk bekerja', n_sisa;
  END IF;

  SELECT count(*) INTO n_sisa
    FROM roles r JOIN role_permissions rp ON rp.role_id = r.id
   WHERE r.name = 'client' AND r.company_id IS NULL;
  IF n_sisa < 6 THEN
    RAISE EXCEPTION
      '537 gagal: client template hanya % izin — portal klien akan kosong', n_sisa;
  END IF;

  RAISE NOTICE
    '537 OK: client -%, override_sod -%, daftar_hitam -%; verifikasi 6/6 lulus',
    n_client, n_sod, n_hitam;
END $$;
