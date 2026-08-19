-- ============================================================================
-- 466 - BARANG TERTAHAN DI PERJALANAN (tanpa nomor rencana)
-- ============================================================================
--
-- ── PO YANG "SUDAH DIPESAN" TIDAK BERARTI BARANGNYA DATANG
--
-- Otomasi pengadaan yang sudah ada menjaga sisi PEMESANAN: MR menunggu
-- persetujuan, PO belum dikirim, pemasok telat merespons. Semuanya berhenti
-- begitu PO diterbitkan.
--
-- Yang terjadi sesudahnya tak dijaga siapa pun. Barang berangkat, lalu diam.
-- Tabel `expediting` mencatatnya, dan tak satu pun otomasi membacanya.
--
-- ── YANG DITEMUKAN, diukur 2026-08-19
--
--   PO-2026-001  Toko Bangunan Maju Jaya - Rp 40.200.000
--                status `dalam_perjalanan` - "Gudang transit Cikarang"
--                tiba_aktual NULL  ->  LEWAT 132 HARI
--
--   PO-2026-002  Toko Keramik Indah - Rp 9.775.000
--                `tertahan` di Pelabuhan Tanjung Priok  ->  LEWAT 85 HARI
--                sebab: "Dokumen impor kurang lengkap - menunggu SNI marking"
--
-- Empat bulan barang berhenti di gudang transit tanpa satu pun peringatan.
-- Di lapangan, inilah yang menghentikan pekerjaan sementara semua orang
-- mengira materialnya "sudah dipesan".
--
-- ⚠ Angka di atas SAAT DIUKUR. Ukur sendiri lewat jawaban rutenya:
--   `checked.tertahan`, `checked.terlambat`, `checked.tanpa_tenggat`.
--
-- ── DUA AMBANG, DAN YANG LEBIH PENDEK TERASA TERBALIK
--
-- Kiriman TERTAHAN ditegur lebih cepat (3 hari) daripada yang sekadar
-- TERLAMBAT (7 hari), meskipun yang tertahan sudah punya sebab tercatat.
--
-- Sengaja: penahanan hampir selalu urusan administratif - dokumen bea cukai,
-- sertifikat SNI, pembayaran tertunda. Barang seperti itu tak bergerak sendiri
-- dan biaya penyimpanannya berjalan tiap hari. Keterlambatan tanpa sebab
-- sering selesai sendiri dalam beberapa hari perjalanan; menegurnya di hari
-- ketiga membuat peringatan ini berbunyi untuk kiriman yang sebenarnya sehat.
--
-- ── IZIN DIUKUR: `procurement:po:manage`. Barang dalam perjalanan adalah
--    milik sebuah PO, dan yang bisa bertindak (menelepon pemasok, mengurus
--    dokumen) adalah orang yang sama yang mengelola PO-nya.
--
-- ── JADWAL: HARIAN. Sama alasannya dengan uji material, bukan kebiasaan:
--    barang yang berhenti di pelabuhan menumpuk biaya penyimpanan tiap hari,
--    dan pekerjaan lapangan yang menunggunya juga berhenti tiap hari.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'barang_tertahan', 'Barang Tertahan di Perjalanan',
       'Kiriman yang sudah di-PO tetapi belum tiba: tertahan bersebab, terlambat tanpa sebab, atau tak bertenggat sama sekali',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'procurement:po:manage'
  FROM notification_rules r
 WHERE r.event_type = 'barang_tertahan'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'procurement:po:manage');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.expediting.hari_tertahan', '3'::jsonb, 'number', 'otomasi',
       'Hari sesudah tenggat sebelum barang TERTAHAN diperingatkan. Sengaja lebih pendek daripada keterlambatan biasa — penahanan tak selesai sendiri dan biaya penyimpanan berjalan tiap hari.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.expediting.hari_terlambat', '7'::jsonb, 'number', 'otomasi',
       'Hari sesudah tenggat sebelum kiriman tanpa sebab tercatat diperingatkan. Yang dibutuhkan biasanya satu telepon ke pemasok.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'barang-tertahan', 'harian', '06:30', NULL, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; a_tahan NUMERIC; a_lambat NUMERIC;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type = 'barang_tertahan' AND is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '466 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM notification_rules r
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'barang_tertahan' AND t.permission_key = 'procurement:po:manage';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '466 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = 'procurement:po:manage';
  IF n < 1 THEN
    RAISE EXCEPTION '466 gagal: izin procurement:po:manage tidak ada di permissions';
  END IF;

  SELECT count(*) INTO n FROM company_settings
   WHERE key IN ('otomasi.expediting.hari_tertahan', 'otomasi.expediting.hari_terlambat');
  IF n <> n_aktif * 2 THEN
    RAISE EXCEPTION '466 gagal: setelan ada % baris, harus % (2 per badan usaha)', n, n_aktif * 2;
  END IF;

  SELECT MIN((value #>> '{}')::numeric) INTO a_tahan  FROM company_settings WHERE key = 'otomasi.expediting.hari_tertahan';
  SELECT MIN((value #>> '{}')::numeric) INTO a_lambat FROM company_settings WHERE key = 'otomasi.expediting.hari_terlambat';

  IF a_tahan IS NULL OR a_tahan < 0 OR a_tahan > 60 THEN
    RAISE EXCEPTION '466 gagal: ambang tertahan % di luar 0..60', a_tahan;
  END IF;
  IF a_lambat IS NULL OR a_lambat < 1 OR a_lambat > 90 THEN
    RAISE EXCEPTION '466 gagal: ambang terlambat % di luar 1..90', a_lambat;
  END IF;

  /*
    INVARIAN YANG SEBENARNYA DIJAGA: tertahan <= terlambat.

    Ini bukan pemeriksaan rentang biasa. Kalau seseorang menukar keduanya -
    misalnya menyetel "tertahan 14, terlambat 3" karena mengira yang sudah ada
    sebabnya lebih tidak mendesak - otomasi ini tetap berjalan, tetap membalas
    200, dan tetap mengirim notifikasi. Yang berubah cuma satu: barang yang
    tertahan di bea cukai baru ditegur DUA MINGGU kemudian, sementara biaya
    penyimpanannya berjalan sejak hari pertama.

    Kekeliruan tanpa gejala seperti itu tak akan pernah ketahuan dari pemakaian.
  */
  IF a_tahan > a_lambat THEN
    RAISE EXCEPTION
      '466 gagal: ambang tertahan (%) melebihi terlambat (%) — penahanan bersebab harus ditegur LEBIH CEPAT, bukan lebih lambat',
      a_tahan, a_lambat;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'barang-tertahan' AND aktif AND jenis = 'harian';
  IF n <> n_ang THEN
    RAISE EXCEPTION '466 gagal: jadwal HARIAN ada % baris, harus %', n, n_ang;
  END IF;

  /*
    PRASYARAT: harus ada catatan pengiriman untuk diperiksa.

    Tanpa itu rutenya membalas 200 dengan nol notifikasi - tak bisa dibedakan
    dari "semua kiriman tepat waktu". Kelumpuhan yang sama dengan `min_stock`
    nol (425) dan `uji_material` kosong (433).
  */
  SELECT count(*) INTO n FROM expediting;
  IF n < 1 THEN
    RAISE EXCEPTION '466 gagal: expediting kosong — otomasi ini tak akan pernah berbunyi';
  END IF;

  RAISE NOTICE '466 OK: aturan + target, 2 setelan, jadwal harian (% badan usaha)', n_aktif;
END $$;
