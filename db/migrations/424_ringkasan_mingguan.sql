-- ============================================================================
-- 424 - RINGKASAN MINGGUAN (1.14) - SATU, BUKAN TIGA
-- ============================================================================
--
-- ── KEPUTUSAN: 8.11 DAN 8.12 SENGAJA TIDAK DIBANGUN
--
-- Rencana memuat tiga automation ringkasan:
--
--   1.14  Weekly Digest                    <- yang ini
--   8.11  Morning Briefing + Evening Wrap
--   8.12  Anomaly Digest (weekly)
--
-- Founder menyatakan tak mau banyak pesan, dan pengukuran 2026-08-16
-- membenarkannya dengan angka: 9.009 notifikasi, 3 dibaca. Menambah tiga
-- pengirim baru ke sistem yang baru saja dibersihkan adalah cara tercepat
-- mengulang cacat yang baru diperbaiki.
--
--   8.11 berarti DUA pesan sehari - empat belas seminggu. Itu kebalikan arah
--        dari jeda melandai yang baru dipasang.
--   8.12 himpunan bagian: anomali sudah menjadi notifikasi, jadi ia sudah
--        terhitung di sini. Membangunnya terpisah berarti satu kejadian
--        dilaporkan dua kali dalam minggu yang sama.
--
-- Keduanya dicatat di katalog sebagai DILIPUT, bukan "belum dikerjakan" -
-- supaya sesi berikutnya tak membangunnya dan menyangka menutup celah.
--
-- ── CACAT YANG PALING MUDAH LOLOS: DIGEST MERANGKUM DIRINYA SENDIRI
--
-- Ringkasan ini menulis notifikasi. Minggu depan ia membaca tujuh hari
-- terakhir - termasuk ringkasan minggu lalu.
--
-- Akibatnya bukan sekadar angka meleset: pada minggu yang benar-benar sepi,
-- satu-satunya isinya adalah ringkasan sebelumnya, sehingga ia tak pernah
-- "kosong" dan terkirim SELAMANYA. Alarm yang berbunyi tiap minggu untuk
-- mengabarkan bahwa minggu lalu ada alarm. Tak ada galat, tak ada gejala -
-- kecuali orang berhenti membacanya.
--
-- Ditahan di `susunRingkasan()` dan diuji langsung di
-- `ringkasan-mingguan.test.ts` (mutasi M1).
--
-- ── MINGGU SEPI TIDAK MENGHASILKAN PESAN
--
-- "Tidak ada apa-apa minggu ini" yang datang tiap Senin adalah pesan yang
-- selalu benar dan tak pernah berguna. Ia melatih orang mengabaikan
-- pengirimnya sebelum minggu yang ramai tiba. `min_jenis` yang menahannya.
--
-- ── IZIN DIUKUR: `reports:view` (ada di `permissions`).
--    Ringkasan lintas-domain untuk pemilik/eksekutif; yang berhak melihat
--    laporan, bukan yang mengurus satu modul.
--
-- ── JADWAL: MINGGUAN, Senin pagi.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'ringkasan_mingguan', 'Ringkasan Berkala',
       'Satu pesan merangkum seluruh peringatan dalam jendela terakhir',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'reports:view'
  FROM notification_rules r
 WHERE r.event_type = 'ringkasan_mingguan'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'reports:view');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.ringkasan_mingguan.hari', '7',
     'Panjang jendela yang diringkas dalam satu pesan.'),
    ('otomasi.ringkasan_mingguan.min_jenis', '2',
     'Jenis peringatan berbeda minimum sebelum ringkasan dikirim. Minggu sepi sengaja tidak menghasilkan pesan.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'ringkasan-mingguan', 'mingguan', '06:30', 1, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; kunci TEXT; nilai NUMERIC;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type = 'ringkasan_mingguan' AND is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '424 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM notification_rules r
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'ringkasan_mingguan' AND t.permission_key = 'reports:view';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '424 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = 'reports:view';
  IF n < 1 THEN
    RAISE EXCEPTION '424 gagal: izin reports:view tidak ada di permissions';
  END IF;

  FOREACH kunci IN ARRAY ARRAY['otomasi.ringkasan_mingguan.hari',
                               'otomasi.ringkasan_mingguan.min_jenis'] LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '424 gagal: setelan % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  /*
    Jendela WAJIB 3..31 hari.

    Nilai 1 mengubah ringkasan MINGGUAN jadi harian - tujuh pesan seminggu,
    persis arah yang automation ini ada untuk menghindarinya. Nilai di atas
    sebulan membuat masalah baru terangkum begitu lama sehingga ringkasannya
    tak lagi bisa ditindaklanjuti.
  */
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.ringkasan_mingguan.hari';
  IF nilai IS NULL OR nilai < 3 OR nilai > 31 THEN
    RAISE EXCEPTION '424 gagal: jendela % di luar 3..31 hari', nilai;
  END IF;

  /*
    JADWAL WAJIB MINGGUAN.

    Ini penjagaan yang paling penting di berkas ini. Jendela 7 hari yang
    DIJALANKAN HARIAN mengirim tujuh ringkasan seminggu, masing-masing hampir
    sama isinya - dan tiap satu terlihat benar bila diperiksa sendirian.
    Jeda melandai memang menahannya, tetapi bergantung pada jaring pengaman
    untuk menutupi jadwal yang salah adalah cara cacat itu bertahan.
  */
  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'ringkasan-mingguan' AND aktif AND jenis = 'mingguan';
  IF n <> n_ang THEN
    RAISE EXCEPTION '424 gagal: jadwal mingguan ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '424 OK: 1 aturan + target, 2 setelan, jadwal mingguan (% badan usaha)', n_aktif;
END $$;
