-- ============================================================================
-- 422 - PERAWATAN ALAT DIPREDIKSI DARI LAJU PEMAKAIAN (10.2)
-- ============================================================================
--
-- ── CELAH YANG DITUTUP, DAN KODE YANG MENUNJUKNYA SENDIRI
--
-- Rute `perawatan-alat` (10.7) menulis batasannya sendiri di komentar:
--
--     "Jam TAK punya padanan 'N hari sebelum'. Ambang hari bisa dibaca sebagai
--      kalender; ambang jam tidak - 14 jam operasi bisa habis dalam dua hari
--      atau dua bulan tergantung alatnya. Jadi untuk jalur jam ambangnya nol:
--      yang sudah melewati jam servisnya sudah terlambat, titik."
--
-- Benar SELAMA lajunya tak diketahui. Begitu jam-meter tercatat berkali-kali
-- pada tanggal berbeda, lajunya terukur dan sisa jam punya padanan hari.
--
-- ── YANG MEMICU HARI INI, diukur 2026-08-16 pada basis nyata
--
--   Excavator 20 Ton    8,7 jam/hari   sisa  -18 jam   10.7 sudah bersuara
--   Truk Mixer 7 m3     6,7 jam/hari   sisa  190 jam   10.7 DIAM - 28 hari lagi
--   Mobile Crane 25 T   tak ada meter  sisa  500 jam   10.7 DIAM SELAMANYA
--
-- Baris kedua adalah alasan automation ini ada: servis drum mixer jatuh tempo
-- empat minggu lagi dan bengkelnya perlu dipesan, tetapi tak satu pun sistem
-- bersuara sampai hari H.
--
-- ── BARIS KETIGA ADALAH CACAT, BUKAN SEKADAR DATA KURANG
--
-- Kalibrasi load indicator Mobile Crane 25 Ton, Rp 12.000.000 tiap 500 jam,
-- berstatus AKTIF di basis - dan jam-meternya tak pernah dicatat sekali pun.
-- `hitungJatuhTempo` memulangkan `belum_ada_acuan`, dan 10.7 sengaja
-- melewatinya tanpa notifikasi dengan alasan yang sah ("jadwal yang belum
-- pernah dipakai, menegurnya cuma kebisingan").
--
-- Tetapi ini bukan jadwal yang menganggur - ini jadwal RUSAK. Ia tak akan
-- pernah bisa jatuh tempo, alatnya tetap dipakai, dan kerusakannya tak punya
-- satu pun gejala. Ditegur SEKALI lalu tunduk jeda melandai, karena tindakan
-- yang dibutuhkan cuma sekali: mulai mencatat meternya.
--
-- ── DUA JENIS, DUA MEJA - SENGAJA TIDAK DIGABUNG
--
-- `perawatan_diprediksi`  -> yang mengurus servis: pesan bengkel, siapkan dana
-- `alat_jam_tanpa_meter`  -> yang mengurus pencatatan: perbaiki datanya
--
-- Menggabungkannya membuat separuh penerimanya menerima pesan yang tak bisa
-- mereka tindaklanjuti, dan itu cara tercepat membuat orang berhenti membaca.
--
-- ── IZIN DIUKUR, BUKAN DITEBAK: keduanya `assets:manage` (ada di
--    `permissions`; dijaga `audit-izin-benar-ada.mjs`).
--
-- ── JADWAL: MINGGUAN, bukan harian.
--
-- Perkiraan berbasis laju bergerak lambat - alat tak berubah lajunya dari hari
-- ke hari. Menjalankannya harian menghasilkan temuan yang sama persis tujuh
-- kali seminggu, dan jeda melandai memang menahannya, tetapi menjalankan tugas
-- yang sudah pasti tak menghasilkan apa-apa tetap membakar denyut penjadwal.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('perawatan_diprediksi',  'Perawatan Alat Diperkirakan Jatuh Tempo',
     'Jam servis diperkirakan tercapai menurut laju pemakaian terukur'),
    ('alat_jam_tanpa_meter',  'Jadwal Perawatan Tak Bisa Jatuh Tempo',
     'Jadwal berbasis jam pada alat yang jam-meternya tak pernah dicatat')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('perawatan_diprediksi', 'assets:manage'),
    ('alat_jam_tanpa_meter', 'assets:manage')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.perawatan_prediksi.hari', '21',
     'Hari sebelum jam servis diperkirakan tercapai. Memesan bengkel butuh antrean.'),
    ('otomasi.perawatan_prediksi.min_pembacaan', '3',
     'Pembacaan jam-meter minimum sebelum laju dipercaya. Dua titik terlalu rapuh.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'perawatan-diprediksi', 'mingguan', '07:15', 1, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; tipe TEXT; kunci TEXT; nilai NUMERIC;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  FOREACH tipe IN ARRAY ARRAY['perawatan_diprediksi', 'alat_jam_tanpa_meter'] LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '422 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;

    /*
      Diperiksa BERPASANGAN, bukan "setidaknya ada satu target".

      Bentuk "ada minimal satu" lolos ketika separuh targetnya hilang - dan
      aturan tanpa target menelan notifikasinya tanpa jejak, persis seperti
      aturan yang tak ada. Pelajaran dari migrasi sebelumnya di repo ini.
    */
    SELECT count(*) INTO n FROM notification_rules r
      JOIN notification_rule_targets t ON t.rule_id = r.id
     WHERE r.event_type = tipe AND t.permission_key = 'assets:manage';
    IF n <> n_aktif THEN
      RAISE EXCEPTION '422 gagal: target % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  -- Izin yang ditunjuk WAJIB benar-benar ada. Kunci hantu menolak semua orang
  -- tanpa satu pun gejala - dijaga `audit-izin-benar-ada.mjs` di CI, dan
  -- diperiksa lagi di sini supaya migrasinya gagal di tempat, bukan nanti.
  SELECT count(*) INTO n FROM permissions WHERE key = 'assets:manage';
  IF n < 1 THEN
    RAISE EXCEPTION '422 gagal: izin assets:manage tidak ada di tabel permissions';
  END IF;

  FOREACH kunci IN ARRAY ARRAY['otomasi.perawatan_prediksi.hari',
                               'otomasi.perawatan_prediksi.min_pembacaan'] LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '422 gagal: setelan % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  /*
    Ambang hari WAJIB lebih besar dari nol DAN masuk akal.

    Nilai 0 membuat rute ini hanya menangkap yang jatuh tempo hari ini - persis
    wilayah 10.7, jadi ia berubah jadi duplikat yang mengirim pesan kedua untuk
    hal yang sama. Nilai raksasa membuat SELURUH alat selalu "akan jatuh tempo"
    dan peringatannya kehilangan arti.
  */
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.perawatan_prediksi.hari';
  IF nilai IS NULL OR nilai < 3 OR nilai > 120 THEN
    RAISE EXCEPTION '422 gagal: ambang hari % di luar 3..120', nilai;
  END IF;

  /*
    Minimum pembacaan tak boleh di bawah 2: laju butuh dua titik untuk ada
    sama sekali. Nilai 1 membuat `hitungLajuPakai` memakai satu pembacaan,
    rentang harinya nol, dan pembagian dengan nol menghasilkan Infinity yang
    lolos ke pesan tertulis sebagai "Infinity hari".
  */
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.perawatan_prediksi.min_pembacaan';
  IF nilai IS NULL OR nilai < 2 THEN
    RAISE EXCEPTION '422 gagal: min_pembacaan % di bawah 2', nilai;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'perawatan-diprediksi' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '422 gagal: jadwal ada % baris, harus %', n, n_ang;
  END IF;

  -- Mingguan, bukan harian - lihat alasannya di kepala berkas.
  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'perawatan-diprediksi' AND jenis = 'mingguan';
  IF n <> n_ang THEN
    RAISE EXCEPTION '422 gagal: jadwal % bukan mingguan pada % baris', n, n_ang;
  END IF;

  RAISE NOTICE '422 OK: 2 aturan + target, 2 setelan, jadwal mingguan (% badan usaha)', n_aktif;
END $$;
