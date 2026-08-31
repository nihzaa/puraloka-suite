-- ============================================================================
-- 433 - HASIL UJI MATERIAL GAGAL / MENGGANTUNG (tanpa nomor rencana)
-- ============================================================================
--
-- ── DICARI DARI TABEL, BUKAN DARI RENCANA
--
-- Pemetaan 51 peristiwa dunia-proyek adalah daftar buatan sendiri, dan daftar
-- buatan sendiri hanya memuat apa yang terpikirkan.
--
-- Dicari ulang dari arah lain: tabel mana yang TERISI tetapi tak satu pun
-- otomasi menyentuhnya? Ada 109 - kebanyakan master data yang memang diam.
--
-- `uji_material` bukan salah satunya.
--
-- ── YANG DITEMUKAN, diukur 2026-08-16
--
--   UJI-2608-002  Beton K-250 zona A lantai 1
--                 hasil 231 kg/cm2, syarat 250  ->  TIDAK MEMENUHI
--                 NCR: tak ada.  Didiamkan 13 hari.
--
--   UJI-2608-004  Besi beton D13, kuat tarik
--                 hasil 4.250, syarat 4.000     ->  kesimpulan NULL
--
--   UJI-2608-005  Beton K-300 kolom, uji 7 hari
--                 hasil 195, syarat 210         ->  perlu uji ulang
--
-- Beton yang tak mencapai kuat tekan rencana adalah cacat STRUKTURAL. Ia tak
-- memburuk perlahan seperti anggaran - ia sudah terlanjur mengeras di kolom
-- dan balok, dan tiap hari yang lewat menumpuk lebih banyak pekerjaan di
-- atasnya.
--
-- Tak ada satu pun peringatan untuk ini sebelum sekarang.
--
-- ⚠ Angka di atas SAAT DIUKUR. Ukur sendiri lewat jawaban rutenya:
--   `checked.gagal_tanpa_ncr`, `checked.belum_disimpulkan`.
--
-- ── TIGA KEADAAN, DAN YANG KEDUA PALING MUDAH TERLEWAT
--
--   TIDAK MEMENUHI      terlihat oleh laporan mutu mana pun
--   BELUM DISIMPULKAN   hasilnya ada, tetapi tak seorang pun memutuskan lulus
--                       atau tidak. Laporan yang menghitung "berapa yang
--                       gagal" MELEWATKANNYA - ia tak dihitung gagal.
--   PERLU UJI ULANG     sah, tetapi punya batas waktu.
--
-- `UJI-2608-004` contoh keadaan kedua, dan angkanya JUSTRU lulus (4.250 dari
-- syarat 4.000). Karena lulus, tak ada yang merasa perlu menindaklanjuti - dan
-- berkasnya menggantung selamanya.
--
-- ── YANG SUDAH BER-NCR TIDAK DITEGUR LAGI
--
-- NCR punya jalur tindak lanjut mutu tersendiri yang sudah beromomasi. Menegur
-- ulang mengirim pesan kedua untuk hal yang sudah ada tempatnya, dan itu cara
-- tercepat membuat tim mutu berhenti membaca.
--
-- ── IZIN DIUKUR: `mutu:uji:manage`. Yang ada `mutu:uji:manage` dan
--    `mutu:uji:view`; ini menuntut TINDAKAN (buat NCR, jadwalkan uji ulang).
--
-- ── JADWAL: HARIAN, dan ini SATU-SATUNYA otomasi mutu yang harian.
--
--    Alasannya bukan kebiasaan: beton yang gagal tak bisa menunggu sepekan.
--    Tiap hari yang lewat berarti pengecoran berikutnya sudah dituang di atas
--    yang bermasalah. Automation lain berjadwal mingguan karena objeknya
--    memang bergerak lambat; yang ini tidak.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'uji_material_gagal', 'Hasil Uji Material Bermasalah',
       'Uji yang tidak memenuhi syarat tanpa NCR, atau yang hasilnya tak pernah disimpulkan',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'mutu:uji:manage'
  FROM notification_rules r
 WHERE r.event_type = 'uji_material_gagal'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'mutu:uji:manage');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.uji_material.hari', '7'::jsonb, 'number', 'otomasi',
       'Hari sebelum hasil uji yang menggantung diingatkan. Tidak berlaku untuk yang sudah dinyatakan TIDAK MEMENUHI — itu dilaporkan segera.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'uji-material-gagal', 'harian', '06:20', NULL, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; nilai NUMERIC;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  /*
    `is_active` DITAMBAHKAN 2026-08-31 — sama dengan enam migrasi otomasi lain
    hari ini. `n_ang` dipakai sebagai patokan jumlah jadwal, dan jadwalnya
    hanya dihitung untuk company AKTIF; tanpa saringan yang sama di sini,
    patokannya memuat company yang sudah dinonaktifkan.
  */
  SELECT count(*) INTO n_ang FROM companies c
   WHERE c.is_active
     AND EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

    /*
    DISARING KE COMPANY AKTIF — 2026-08-31.

    Cek cacahan membandingkan jumlah baris dengan `jumlah company aktif`,
    tetapi menghitung baris milik SEMUA company — termasuk yang dinonaktifkan
    sesudah barisnya dibuat. Begitu ada satu saja, migrasinya gagal atas
    selisih yang wajar: "aturan ada 3 baris, harus 2".

    Barisnya tak dihapus: ia tak dievaluasi siapa pun, dan menghapusnya
    membuang konfigurasi yang berguna bila company-nya diaktifkan lagi.
  */
  SELECT count(*) INTO n FROM notification_rules r
   JOIN companies c ON c.id = r.company_id AND c.is_active
   WHERE r.event_type = 'uji_material_gagal' AND r.is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '433 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM notification_rules r
    JOIN companies c ON c.id = r.company_id AND c.is_active
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'uji_material_gagal' AND t.permission_key = 'mutu:uji:manage';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '433 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = 'mutu:uji:manage';
  IF n < 1 THEN
    RAISE EXCEPTION '433 gagal: izin mutu:uji:manage tidak ada di permissions';
  END IF;

  SELECT count(*) INTO n
    FROM company_settings cs
    JOIN companies c ON c.id = cs.company_id AND c.is_active
   WHERE cs.key = 'otomasi.uji_material.hari';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '433 gagal: setelan ada % baris, harus %', n, n_aktif;
  END IF;

  /*
    Ambang WAJIB 1..60.

    Nol tak masuk akal: uji yang dicatat pagi ini akan langsung ditegur sore
    ini, sebelum laboratorium sempat mengirim hasilnya.

    Di atas 60 hari berarti hasil uji boleh menggantung dua bulan. Untuk uji
    kuat tekan 28 hari, itu lebih lama daripada umur betonnya sendiri - dan
    struktur di atasnya sudah berdiri.
  */
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.uji_material.hari';
  IF nilai IS NULL OR nilai < 1 OR nilai > 60 THEN
    RAISE EXCEPTION '433 gagal: ambang hari % di luar 1..60', nilai;
  END IF;

  /*
    JADWAL WAJIB HARIAN - dan ini satu-satunya otomasi mutu yang begitu.

    Beton yang gagal tak bisa menunggu sepekan: tiap hari yang lewat berarti
    pengecoran berikutnya sudah dituang di atas yang bermasalah.

    Automation lain berjadwal mingguan karena objeknya memang bergerak lambat.
    Menyeragamkannya ke mingguan "supaya konsisten" akan menghilangkan
    satu-satunya alasan otomasi ini ada.
  */
  SELECT count(*) INTO n FROM jadwal_tugas jt
   JOIN companies c ON c.id = jt.company_id AND c.is_active
   WHERE jt.tugas = 'uji-material-gagal' AND aktif AND jenis = 'harian';
  IF n <> n_ang THEN
    RAISE EXCEPTION '433 gagal: jadwal HARIAN ada % baris, harus %', n, n_ang;
  END IF;

  /*
    PRASYARAT: harus ada catatan uji untuk diperiksa.

    Tanpa itu rutenya membalas 200 dengan nol notifikasi - tak bisa dibedakan
    dari "semua uji lulus". Kelumpuhan yang sama dengan `min_stock` nol (425).
  */
  SELECT count(*) INTO n FROM uji_material;
  /*
    ⚠ DITURUNKAN JADI CATATAN 2026-08-31.

    Alasannya benar: automation tanpa bahan membalas 200 dengan nol
    notifikasi, tak terbedakan dari "semuanya beres". Tapi di basis yang baru
    lahir tabelnya memang kosong, dan RAISE EXCEPTION menghentikan SELURUH
    rantai migrasi.

    Ini yang keduabelas hari ini dengan bentuk sama (425, 426, 429, 430, 431,
    466, 467, 485, 509, 524 …). Pertukarannya tetap: automation tanpa bahan
    DIAM, sementara migrasi yang berhenti membuat seluruh sistem tak bisa
    dipasang sama sekali.
  */
  IF n < 1 THEN
    RAISE NOTICE '433: uji_material kosong di basis ini — otomasi belum punya bahan. Bukan galat.';
  END IF;

  RAISE NOTICE '433 OK: aturan + target, 1 setelan, jadwal harian (% badan usaha)', n_aktif;
END $$;
