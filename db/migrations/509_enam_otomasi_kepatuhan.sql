-- ============================================================================
-- 509 - ENAM OTOMASI KEPATUHAN + PENCABUTAN SATU YANG TERNYATA DUPLIKAT
-- ============================================================================
--
-- ⚠ BERKAS INI SEMULA BERNOMOR 469, dan penomoran ulangnya bukan kerapian.
--
-- Diukur 2026-08-28: commit yang memuatnya TERLEPAS dari HEAD — sesi lain
-- yang bekerja di checkout yang sama melakukan rebase/merge, dan berkas ini
-- ikut hilang dari pohon kerja bersama dua berkas lain (fungsi kepatuhan dan
-- test-nya).
--
-- Sementara itu nomor 469 sudah dipakai DUA migrasi lain (admin SaaS dan
-- struktur komposit atap), jadi memulihkannya apa adanya akan menambah satu
-- lagi ke dua belas nomor ganda yang sudah ada di repo ini.
--
-- Rujukan ke "468" di bawah TETAP BENAR: migrasi 468 selamat di HEAD dengan
-- nomor aslinya, dan bagian B di sini memang mencabut apa yang ia pasang.
--
-- ── DUA PEKERJAAN DALAM SATU MIGRASI, DAN KEDUANYA WAJIB BERSAMA
--
-- Bagian A memasang enam otomasi kepatuhan.
-- Bagian B MENCABUT `temuan_k3_lewat_tenggat` yang dipasang migrasi 468.
--
-- Keduanya disatukan karena B adalah koreksi atas A-nya 468: kalau B
-- dijalankan terpisah dan gagal, yang tersisa adalah keadaan yang lebih buruk
-- daripada sebelum keduanya - satu otomasi terpasang di basis tanpa rute yang
-- melayaninya.
--
-- ── KENAPA DICABUT (diukur, bukan diputuskan dari selera)
--
-- Migrasi 468 memasang `temuan_k3_lewat_tenggat`. Sesudah rutenya jadi, saya
-- mengukur ulang dan menemukan `k3-kepatuhan` SUDAH menangani hal yang sama
-- lewat `k3_temuan_berat_menggantung` - dan cakupannya LEBIH LUAS:
--
--   yang lama : rekap per proyek + temuan BERULANG (pola lintas inspeksi)
--   yang baru : satu notifikasi per temuan, dengan uraian dan tenggatnya
--
-- Keduanya sah. Yang tidak sah adalah MEMASANG KEDUANYA: dua notifikasi untuk
-- satu keadaan adalah persis kebisingan yang jeda melandai dibangun untuk
-- menghilangkan.
--
-- Hal yang sama terjadi pada `induksi_k3_kedaluwarsa` yang sempat dirancang -
-- tetapi itu ketahuan SEBELUM masuk migrasi, jadi tak ada yang perlu dicabut.
--
-- Pelajaran yang layak ditulis: saya membangun keduanya tanpa mengukur lebih
-- dulu apakah sudah ada. Yang menyelamatkan bukan penjaga mana pun melainkan
-- TypeScript, yang menolak jenis notifikasi baru dan menyarankan nama yang
-- sudah ada ("Did you mean 'k3_induksi_kedaluwarsa'?").
--
-- ── YANG DITEMUKAN, diukur 2026-08-19
--
--   pemantauan_lingkungan   5 pengukuran, 1 MELAMPAUI baku mutu
--   temuan_audit            5 belum ditutup
--   itp_titik               4 belum diperiksa
--   sertifikat_ipc          3 draf, terlama 13 hari
--   cuti_ambil              2 diajukan belum diputus, 8 hari
--   nota_kredit             1 diajukan, 12 hari
--
-- ⚠ Angka di atas SAAT DIUKUR. Ukur sendiri lewat `checked` di jawaban rute.
--
-- ── IZIN DIUKUR, tidak ditebak
--
--   lingkungan_lampaui_baku    k3:lingkungan:manage
--   temuan_audit_menggantung   mutu:audit:manage
--   itp_belum_diperiksa        mutu:rmp:manage
--   ipc_mengendap_draf         finance:invoice:create   (bukan :manage - TAK ADA)
--   cuti_belum_diputus         sdm:cuti:approve
--   nota_kredit_menggantung    procurement:payment:manage
--
-- ── JADWAL: semuanya MINGGUAN kecuali lingkungan.
--
--    Pelanggaran baku mutu lingkungan bisa berujung penghentian kegiatan, dan
--    yang menentukan bukan lamanya melainkan bahwa ia tercatat - jadi harian.
--    Lima sisanya bergerak dalam hitungan minggu.
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════
-- BAGIAN A - enam otomasi kepatuhan
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, x.x_jenis, x.x_label, x.x_uraian, true
  FROM companies c
 CROSS JOIN (VALUES
   ('lingkungan_lampaui_baku',  'Baku Mutu Lingkungan Terlampaui',
    'Pengukuran lingkungan yang melanggar baku mutu, atau sudah di ambangnya'),
   ('temuan_audit_menggantung', 'Temuan Audit Belum Ditutup',
    'Temuan audit internal yang menggantung — audit berikutnya menemukan hal yang sama'),
   ('itp_belum_diperiksa',      'Titik ITP Belum Diperiksa',
    'Titik henti mutu yang belum diverifikasi; titik HOLD menahan pekerjaan berikutnya'),
   ('ipc_mengendap_draf',       'Sertifikat IPC Mengendap Draf',
    'Dasar penagihan termin yang belum diajukan — pekerjaan selesai tapi belum ditagihkan'),
   ('cuti_belum_diputus',       'Pengajuan Cuti Menunggu Keputusan',
    'Cuti yang diajukan tapi tak diputus — yang mengajukan tak bisa merencanakan apa pun'),
   ('nota_kredit_menggantung',  'Nota Kredit Menggantung',
    'Uang yang harus kembali: yang menunggu keputusan, dan yang disetujui tapi belum diterapkan')
 ) AS x(x_jenis, x_label, x_uraian)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', x.x_izin
  FROM notification_rules r
  JOIN (VALUES
   ('lingkungan_lampaui_baku',  'k3:lingkungan:manage'),
   ('temuan_audit_menggantung', 'mutu:audit:manage'),
   ('itp_belum_diperiksa',      'mutu:rmp:manage'),
   ('ipc_mengendap_draf',       'finance:invoice:create'),
   ('cuti_belum_diputus',       'sdm:cuti:approve'),
   ('nota_kredit_menggantung',  'procurement:payment:manage')
  ) AS x(x_jenis, x_izin) ON x.x_jenis = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = x.x_izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, x.x_kunci, x.x_nilai::jsonb, 'number', 'otomasi', x.x_uraian
  FROM companies c
 CROSS JOIN (VALUES
   ('otomasi.lingkungan.margin_persen', '10',
    'Seberapa dekat ke baku mutu sudah diperingatkan. Nol berarti hanya pelanggaran nyata yang dilaporkan.'),
   ('otomasi.lingkungan.jendela_hari', '90',
    'Umur pengukuran yang masih dianggap menggambarkan keadaan sekarang. Yang lebih tua adalah catatan sejarah.'),
   ('otomasi.temuan_audit.hari', '30',
    'Umur temuan audit sebelum diingatkan, dihitung dari TANGGAL AUDIT bukan tanggal pencatatan.'),
   ('otomasi.itp.hari', '14',
    'Umur titik ITP belum diperiksa sebelum diingatkan. Titik HOLD diingatkan dua kali lebih cepat.'),
   ('otomasi.ipc_draf.hari', '7',
    'Umur sertifikat IPC berstatus draf sebelum diingatkan.'),
   ('otomasi.cuti.hari', '3',
    'Umur pengajuan cuti sebelum diingatkan. Yang tanggal mulainya sudah dekat diingatkan dua kali lebih cepat.'),
   ('otomasi.nota_kredit.hari', '7',
    'Umur nota kredit menggantung sebelum diingatkan. Berlaku untuk yang menunggu keputusan DAN yang disetujui tapi belum diterapkan.'),
   ('otomasi.nota_kredit.nilai_besar', '10000000',
    'Nilai nota kredit yang dianggap besar. Di atasnya diingatkan dua kali lebih cepat.')
 ) AS x(x_kunci, x_nilai, x_uraian)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, x.x_tugas, x.x_jenis, x.x_jam, x.x_hari_pekan, true
  FROM companies c
 CROSS JOIN (VALUES
   -- ⚠ `jam` bertipe TEXT ber-CHECK '^([01][0-9]|2[0-3]):[0-5][0-9]$', BUKAN
   --   `time`. Cast ::time menghasilkan '06:10:00' dan ditolak constraint.
   --
   -- HARIAN: pelanggaran lingkungan bisa berujung penghentian kegiatan.
   ('lingkungan-lampaui-baku',  'harian',   '06:10', NULL::int),
   -- MINGGUAN: lima sisanya bergerak dalam hitungan minggu.
   ('temuan-audit-menggantung', 'mingguan', '07:30', 1),
   ('itp-belum-diperiksa',      'mingguan', '07:35', 1),
   ('ipc-mengendap-draf',       'mingguan', '07:40', 1),
   ('cuti-belum-diputus',       'mingguan', '07:45', 1),
   ('nota-kredit-menggantung',  'mingguan', '07:50', 1)
 ) AS x(x_tugas, x_jenis, x_jam, x_hari_pekan)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ══════════════════════════════════════════════════════════════════════════
-- BAGIAN B - mencabut `temuan_k3_lewat_tenggat` yang dipasang 468
-- ══════════════════════════════════════════════════════════════════════════
--
-- Urutannya: JADWAL dulu, lalu target, lalu aturan.
--
-- Membalik urutannya meninggalkan jendela ketika jadwalnya masih aktif tetapi
-- aturan penerimanya sudah hilang - dan penjadwal yang berjalan pada jendela
-- itu memanggil rute yang tak ada, mendapat 404, lalu diam. Persis bentuk
-- cacat yang melahirkan `audit-tugas-punya-rute`.

DELETE FROM jadwal_tugas WHERE tugas = 'temuan-k3-lewat-tenggat';

DELETE FROM notification_rule_targets t
 USING notification_rules r
 WHERE t.rule_id = r.id AND r.event_type = 'temuan_k3_lewat_tenggat';

DELETE FROM notification_rules WHERE event_type = 'temuan_k3_lewat_tenggat';

/*
  Setelan `otomasi.tenggat_k3.hari` SENGAJA TIDAK dihapus.

  Ia dipasang 468 untuk otomasi yang dicabut ini, tetapi setelan yang menganggur
  tak merugikan siapa pun - sementara menghapusnya berisiko: kalau nanti ada
  yang memakai kunci itu untuk hal lain, penghapusan di sini akan mengambil
  setelan yang masih terpakai. Yang tak menimbulkan gejala lebih baik ditinggal
  daripada dibersihkan setengah hati.
*/

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; nilai NUMERIC;
  V_JENIS TEXT[] := ARRAY['lingkungan_lampaui_baku','temuan_audit_menggantung',
                          'itp_belum_diperiksa','ipc_mengendap_draf',
                          'cuti_belum_diputus','nota_kredit_menggantung'];
  V_IZIN  TEXT[] := ARRAY['k3:lingkungan:manage','mutu:audit:manage','mutu:rmp:manage',
                          'finance:invoice:create','sdm:cuti:approve',
                          'procurement:payment:manage'];
  V_AMBANG TEXT[] := ARRAY['otomasi.lingkungan.margin_persen','otomasi.lingkungan.jendela_hari',
                           'otomasi.temuan_audit.hari','otomasi.itp.hari',
                           'otomasi.ipc_draf.hari','otomasi.cuti.hari',
                           'otomasi.nota_kredit.hari','otomasi.nota_kredit.nilai_besar'];
  V_MINGGUAN TEXT[] := ARRAY['temuan-audit-menggantung','itp-belum-diperiksa',
                             'ipc-mengendap-draf','cuti-belum-diputus',
                             'nota-kredit-menggantung'];
  k TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  /*
    `is_active` DITAMBAHKAN 2026-08-31.

    `n_ang` dipakai sebagai patokan jumlah jadwal, dan jadwalnya kini hanya
    dihitung untuk company AKTIF. Tanpa saringan yang sama di sini, patokannya
    memuat company yang sudah dinonaktifkan dan arahnya terbalik:

        jadwal HARIAN ada 2 baris, harus 4

    Dua pemeriksaan yang mengukur populasi berbeda tak boleh dibandingkan.
  */
  SELECT count(*) INTO n_ang FROM companies c
   WHERE c.is_active
     AND EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  /*
    ATURAN MILIK COMPANY MATI DINONAKTIFKAN — DITAMBAHKAN 2026-08-31.

    INSERT di atas memakai `WHERE c.is_active`, dan cek di bawah menuntut
    `6 x jumlah company aktif`. Keduanya konsisten — sampai sebuah company
    DINONAKTIFKAN sesudah aturannya dibuat. Aturannya tetap aktif, cacahannya
    tak pernah turun, dan migrasi ini gagal:

        509 gagal: aturan ada 30 baris, harus 18 (6 jenis x 3 badan usaha)

    Diukur 2026-08-31: 30 aturan aktif tersebar di 5 company, sementara hanya
    3 yang `is_active`. Dua company dinonaktifkan belakangan.

    Ini bukan sekadar soal cacahan. Aturan notifikasi milik badan usaha yang
    sudah tak aktif akan tetap dievaluasi penjadwal — kerja yang hasilnya tak
    dipakai siapa pun, dan pada kasus terburuk pesan yang terkirim atas nama
    perusahaan yang sudah berhenti beroperasi.

    Dinonaktifkan, bukan dihapus: riwayatnya tetap bisa dibaca, dan bila
    company-nya diaktifkan lagi, INSERT di atas menyalakannya kembali lewat
    `ON CONFLICT ... DO UPDATE SET is_active = true`.
  */
  UPDATE notification_rules r
     SET is_active = false
   WHERE r.event_type = ANY(V_JENIS)
     AND r.is_active
     AND NOT EXISTS (
       SELECT 1 FROM companies c WHERE c.id = r.company_id AND c.is_active
     );

  -- ── Bagian A ──────────────────────────────────────────────────────────
  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type = ANY(V_JENIS) AND is_active;
  IF n <> n_aktif * 6 THEN
    RAISE EXCEPTION '509 gagal: aturan ada % baris, harus % (6 jenis x % badan usaha)',
      n, n_aktif * 6, n_aktif;
  END IF;

  /*
    IZIN DIPERIKSA SATU PER SATU.

    Kunci izin yang tak ada menolak SEMUA orang tanpa gejala: rutenya jalan,
    balas 200, nol notifikasi. Migrasi ini sendiri hampir memakai
    `finance:invoice:manage` yang TIDAK ADA - yang benar `finance:invoice:create`,
    dan itu ketahuan hanya karena diukur sebelum ditulis.
  */
  FOREACH k IN ARRAY V_IZIN LOOP
    SELECT count(*) INTO n FROM permissions WHERE key = k;
    IF n < 1 THEN
      RAISE EXCEPTION '509 gagal: izin % tidak ada di tabel permissions', k;
    END IF;
  END LOOP;

  /*
    `r.is_active` DITAMBAHKAN 2026-08-31 — cek ini menghitung target milik
    aturan yang sudah TIDAK aktif.

    Sesudah blok di atas menonaktifkan aturan milik company mati, jumlah
    ATURAN aktif turun ke 18 sementara jumlah TARGET tetap 30 — dan cek ini
    membandingkannya dengan `n_aktif * 6` yang sama. Hasilnya migrasi tetap
    gagal, hanya dengan pesan yang berbeda:

        509 gagal: target ada 30 baris, harus 18

    Dua pemeriksaan yang mengukur hal berbeda tak boleh memakai patokan yang
    sama. Sekarang keduanya menghitung yang AKTIF.
  */
  SELECT count(*) INTO n FROM notification_rules r
    JOIN companies c ON c.id = r.company_id AND c.is_active
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = ANY(V_JENIS) AND r.is_active
     AND t.permission_key = ANY(V_IZIN);
  IF n <> n_aktif * 6 THEN
    RAISE EXCEPTION '509 gagal: target aktif ada % baris, harus %', n, n_aktif * 6;
  END IF;

  /*
    Disaring ke company AKTIF — alasan yang sama dengan dua cek di atasnya.

    `company_settings` menyimpan setelan untuk setiap company yang pernah
    ada, termasuk yang kemudian dinonaktifkan. Membandingkan cacahnya dengan
    `n_aktif * 8` menuduh selisih yang wajar:

        509 gagal: setelan ada 40 baris, harus 24 (8 ambang x 3 badan usaha)

    Setelan milik company mati tak perlu dihapus — ia tak dievaluasi siapa
    pun, dan menghapusnya membuang konfigurasi yang berguna bila company itu
    diaktifkan lagi. Yang perlu: tidak ikut dihitung.
  */
  SELECT count(*) INTO n
    FROM company_settings cs
    JOIN companies c ON c.id = cs.company_id AND c.is_active
   WHERE cs.key = ANY(V_AMBANG);
  IF n <> n_aktif * 8 THEN
    RAISE EXCEPTION '509 gagal: setelan ada % baris, harus % (8 ambang x % badan usaha)',
      n, n_aktif * 8, n_aktif;
  END IF;

  /*
    Rentang tiap ambang diperiksa terhadap batasnya SENDIRI, bukan satu
    rentang bersama.

    `nilai_besar` bersatuan RUPIAH (10 juta), sisanya hari atau persen. Satu
    pemeriksaan "0..90" untuk semuanya akan menolak nilai rupiah yang benar,
    dan menaikkan batasnya ke 10 miliar akan menerima ambang "5000 hari" yang
    jelas salah.
  */
  FOREACH k IN ARRAY ARRAY['otomasi.lingkungan.margin_persen','otomasi.temuan_audit.hari',
                           'otomasi.itp.hari','otomasi.ipc_draf.hari','otomasi.cuti.hari',
                           'otomasi.nota_kredit.hari'] LOOP
    SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings WHERE key = k;
    IF nilai IS NULL OR nilai < 0 OR nilai > 365 THEN
      RAISE EXCEPTION '509 gagal: ambang % bernilai % di luar 0..365', k, nilai;
    END IF;
  END LOOP;

  SELECT MIN((value #>> '{}')::numeric) INTO nilai
    FROM company_settings WHERE key = 'otomasi.lingkungan.jendela_hari';
  IF nilai IS NULL OR nilai < 7 OR nilai > 730 THEN
    RAISE EXCEPTION '509 gagal: jendela lingkungan % di luar 7..730', nilai;
  END IF;

  SELECT MIN((value #>> '{}')::numeric) INTO nilai
    FROM company_settings WHERE key = 'otomasi.nota_kredit.nilai_besar';
  IF nilai IS NULL OR nilai < 0 THEN
    RAISE EXCEPTION '509 gagal: ambang nilai nota kredit % negatif', nilai;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas jt
   JOIN companies c ON c.id = jt.company_id AND c.is_active
   WHERE jt.tugas = 'lingkungan-lampaui-baku' AND aktif AND jenis = 'harian';
  IF n <> n_ang THEN
    RAISE EXCEPTION '509 gagal: jadwal HARIAN lingkungan ada % baris, harus %', n, n_ang;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas jt
   JOIN companies c ON c.id = jt.company_id AND c.is_active
   WHERE jt.tugas = ANY(V_MINGGUAN) AND aktif AND jenis = 'mingguan';
  IF n <> n_ang * 5 THEN
    RAISE EXCEPTION '509 gagal: jadwal MINGGUAN ada % baris, harus % (5 tugas x %)',
      n, n_ang * 5, n_ang;
  END IF;

  -- ── Bagian B: pencabutan WAJIB tuntas ─────────────────────────────────
  --
  -- Ketiganya diperiksa terpisah supaya pesannya menyebut LAPIS MANA yang
  -- tertinggal. Sisa di satu lapis saja sudah cukup merusak: jadwal yang
  -- tertinggal memanggil rute yang tak ada, aturan yang tertinggal muncul di
  -- halaman pengaturan notifikasi sebagai jenis yang tak pernah terbit.
  SELECT count(*) INTO n FROM jadwal_tugas WHERE tugas = 'temuan-k3-lewat-tenggat';
  IF n <> 0 THEN
    RAISE EXCEPTION '509 gagal: % jadwal temuan-k3-lewat-tenggat masih tersisa', n;
  END IF;

  SELECT count(*) INTO n FROM notification_rules r
    JOIN companies c ON c.id = r.company_id AND c.is_active
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'temuan_k3_lewat_tenggat';
  IF n <> 0 THEN
    RAISE EXCEPTION '509 gagal: % target temuan_k3_lewat_tenggat masih tersisa', n;
  END IF;

  SELECT count(*) INTO n FROM notification_rules WHERE event_type = 'temuan_k3_lewat_tenggat';
  IF n <> 0 THEN
    RAISE EXCEPTION '509 gagal: % aturan temuan_k3_lewat_tenggat masih tersisa', n;
  END IF;

  /*
    Dan yang MENGGANTIKANNYA wajib masih ada.

    Pencabutan ini hanya sah karena `k3_temuan_berat_menggantung` menangani
    hal yang sama dengan cakupan lebih luas. Kalau yang lama ikut hilang -
    misalnya karena migrasi lain mencabutnya - maka pencabutan di sini
    meninggalkan LUBANG: temuan K3 berat yang lewat tenggat tak diawasi
    siapa pun, dan tak ada satu pun gejala.
  */
  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type = 'k3_temuan_berat_menggantung' AND is_active;
  IF n < 1 THEN
    RAISE EXCEPTION
      '509 gagal: k3_temuan_berat_menggantung TIDAK ADA — pencabutan temuan_k3_lewat_tenggat akan meninggalkan temuan K3 berat tanpa pengawasan';
  END IF;

  -- ── Prasyarat data ────────────────────────────────────────────────────
  /*
    KETIADAAN DATA BUKAN KEGAGALAN MIGRASI — DITURUNKAN 2026-08-31.

    Cek per-tabel di bawah mencegah kelumpuhan yang nyata: automation yang tak
    punya bahan membalas 200 dengan nol notifikasi, tak terbedakan dari
    "semuanya beres". Alasannya benar, dan pemeriksaan per-tabel (bukan
    gabungan) memang lebih tajam.

    Tapi di basis yang BARU LAHIR semua tabel itu kosong, dan RAISE EXCEPTION
    menghentikan SELURUH rantai migrasi — di CI, VPS baru, dan mesin developer
    baru. Sebelas migrasi sudah melakukan itu hari ini, dan tiap satunya
    memakan satu putaran CI penuh untuk ditemukan.

    Diturunkan jadi CATATAN, dengan nama tabelnya tetap disebut supaya yang
    membaca log tahu automation mana yang belum punya bahan.

    Automation tanpa data DIAM. Rantai migrasi yang berhenti membuat seluruh
    sistem tak bisa dipasang sama sekali.
  */
  SELECT count(*) INTO n FROM pemantauan_lingkungan;
  IF n < 1 THEN RAISE NOTICE '509: pemantauan_lingkungan kosong di basis ini — otomasi belum punya bahan'; END IF;
  SELECT count(*) INTO n FROM temuan_audit;
  IF n < 1 THEN RAISE NOTICE '509: temuan_audit kosong di basis ini — otomasi belum punya bahan'; END IF;
  SELECT count(*) INTO n FROM itp_titik;
  IF n < 1 THEN RAISE NOTICE '509: itp_titik kosong di basis ini — otomasi belum punya bahan'; END IF;
  SELECT count(*) INTO n FROM sertifikat_ipc;
  IF n < 1 THEN RAISE NOTICE '509: sertifikat_ipc kosong di basis ini — otomasi belum punya bahan'; END IF;
  SELECT count(*) INTO n FROM cuti_ambil;
  IF n < 1 THEN RAISE NOTICE '509: cuti_ambil kosong di basis ini — otomasi belum punya bahan'; END IF;
  SELECT count(*) INTO n FROM nota_kredit;
  IF n < 1 THEN RAISE NOTICE '509: nota_kredit kosong di basis ini — otomasi belum punya bahan'; END IF;

  RAISE NOTICE '509 OK: 6 aturan + target, 8 setelan, 1 harian + 5 mingguan; temuan_k3_lewat_tenggat DICABUT (% badan usaha)', n_aktif;
END $$;
