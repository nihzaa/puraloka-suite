-- SEED DUMMY — OPERASIONAL ALAT (menyertai migrasi 211)
--
-- Bukan sekadar mengisi tabel. Tiap alat di sini sengaja dibentuk supaya
-- MEMICU satu aturan bisnis yang berbeda, sehingga layar `/aset/operasional`
-- bisa dibuktikan menampilkan hal yang benar — bukan cuma "tidak error".
--
--   EXC-001  jam meter melewati interval, TAPI kalendernya masih longgar
--            → membuktikan jam mengalahkan kalender (cacat #1)
--   DTR-002  banyak servis, mayoritas MENDADAK
--            → membuktikan "sering dirawat" ≠ terawat (cacat #3)
--   CRN-003  ada biaya operasional, TAPI nol jam operasi
--            → membuktikan biaya-per-jam jadi "—", bukan ∞ (cacat #2)
--   TRK-004  alat sehat, semua terjadwal → pembanding
--
-- ── Soal idempotensi
--
-- `riwayat_perawatan` dan `biaya_operasional_alat` sengaja TIDAK punya
-- unique constraint: satu alat memang boleh diisi BBM dua kali sehari, dan
-- boleh diservis dua kali dengan nominal sama. Akibatnya
-- `ON CONFLICT DO NOTHING` di sana tak mencegah apa pun — versi pertama
-- berkas ini memakainya, dan menjalankan seed dua kali menggandakan 24 baris
-- jadi 48. Biaya per jam ikut berlipat dua, dan tak ada satu pun pesan galat.
--
-- Yang dipakai sekarang `WHERE NOT EXISTS` atas kolom yang menandai baris
-- seed ini secara khusus. Itu berlaku untuk SEMUA tabel di sini, termasuk
-- yang kebetulan punya UNIQUE.

DO $$
DECLARE
  v_company uuid;
  v_exc uuid; v_dtr uuid; v_crn uuid; v_trk uuid;
  v_jadwal uuid;
BEGIN
  SELECT id INTO v_company FROM companies WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_company IS NULL THEN
    RAISE NOTICE 'Tak ada company aktif — seed dilewati.';
    RETURN;
  END IF;

  -- ── Alat ────────────────────────────────────────────────────────────────
  INSERT INTO assets (company_id, asset_code, name, category, brand, model,
                      purchase_date, purchase_price, residual_value,
                      useful_life_months, status, condition)
  VALUES
    (v_company, 'EXC-001', 'Excavator 20 Ton', 'alat_berat', 'Komatsu', 'PC200-8',
     '2023-03-15', 1850000000, 185000000, 96, 'dipakai', 'baik'),
    (v_company, 'DTR-002', 'Dump Truck 10 Roda', 'kendaraan', 'Hino', 'FM260JD',
     '2022-08-01', 780000000, 78000000, 72, 'dipakai', 'cukup'),
    (v_company, 'CRN-003', 'Mobile Crane 25 Ton', 'alat_berat', 'Tadano', 'GR-250N',
     '2025-11-20', 2400000000, 240000000, 120, 'tersedia', 'baik'),
    (v_company, 'TRK-004', 'Truk Mixer 7 m3', 'kendaraan', 'Mitsubishi', 'FN61FM',
     '2024-01-10', 950000000, 95000000, 84, 'dipakai', 'baik')
  ON CONFLICT DO NOTHING;

  -- Penjaga tunggal: kalau riwayat/biaya sudah ada untuk alat seed ini,
  -- seluruh blok pengisian di bawah dilewati. Lebih jujur daripada
  -- `ON CONFLICT DO NOTHING` per-INSERT yang diam-diam tak mengikat.
  IF EXISTS (SELECT 1 FROM biaya_operasional_alat b
              JOIN assets a ON a.id = b.asset_id
             WHERE a.company_id = v_company AND a.asset_code = 'EXC-001') THEN
    RAISE NOTICE 'Seed alat sudah pernah dijalankan — dilewati.';
    RETURN;
  END IF;

  SELECT id INTO v_exc FROM assets WHERE company_id = v_company AND asset_code = 'EXC-001';
  SELECT id INTO v_dtr FROM assets WHERE company_id = v_company AND asset_code = 'DTR-002';
  SELECT id INTO v_crn FROM assets WHERE company_id = v_company AND asset_code = 'CRN-003';
  SELECT id INTO v_trk FROM assets WHERE company_id = v_company AND asset_code = 'TRK-004';

  -- ── EXC-001: jam melewati ambang, kalender masih jauh ───────────────────
  --
  -- Terakhir diservis pada 1.000 jam / 20 Juli. Interval 250 jam ATAU 180
  -- hari. Meter kini 1.268 jam → sudah lewat 18 jam, padahal kalendernya
  -- baru jalan ~2 minggu dari 180. Inilah alat yang "belum waktunya"
  -- menurut jadwal harian, tapi olinya sudah harus diganti.
  INSERT INTO jadwal_perawatan (asset_id, company_id, nama, jenis,
                                setiap_jam, setiap_hari, jam_terakhir, tanggal_terakhir,
                                perkiraan_biaya)
  VALUES (v_exc, v_company, 'Ganti oli mesin & filter', 'berkala',
          250, 180, 1000, CURRENT_DATE - 18, 1850000)
  ON CONFLICT (asset_id, nama) DO NOTHING;

  INSERT INTO jadwal_perawatan (asset_id, company_id, nama, jenis,
                                setiap_hari, tanggal_terakhir, perkiraan_biaya)
  VALUES (v_exc, v_company, 'Sertifikasi SILO Depnaker', 'sertifikasi',
          365, CURRENT_DATE - 350, 7500000)
  ON CONFLICT (asset_id, nama) DO NOTHING;

  -- Pemakaian 12 hari terakhir — meter naik ~8 jam/hari sampai 1.268.
  INSERT INTO pemakaian_alat (asset_id, company_id, tanggal, jam_mulai, jam_selesai, keperluan)
  SELECT v_exc, v_company, CURRENT_DATE - g,
         1172 + (11 - g) * 8, 1180 + (11 - g) * 8,
         'Galian struktur zona ' || (1 + (g % 3))
  FROM generate_series(0, 11) g
  ON CONFLICT (asset_id, tanggal) DO NOTHING;

  INSERT INTO biaya_operasional_alat (asset_id, company_id, tanggal, jenis, jumlah, kuantitas, satuan, uraian)
  SELECT v_exc, v_company, CURRENT_DATE - g, 'bbm', 1_360_000, 80, 'liter', 'Solar industri'
  FROM generate_series(0, 11) g
  ON CONFLICT DO NOTHING;

  INSERT INTO biaya_operasional_alat (asset_id, company_id, tanggal, jenis, jumlah, uraian)
  VALUES (v_exc, v_company, CURRENT_DATE - 5, 'operator', 6500000, 'Upah operator 1 bulan')
  ON CONFLICT DO NOTHING;

  -- Riwayat servis EXC-001.
  --
  -- Ditambahkan sesudah MELIHAT layarnya: tanpa ini, kolom "pola perawatan"
  -- kosong justru di baris yang paling banyak dibicarakan halaman ini —
  -- alat yang jadi contoh utama "jam mengalahkan kalender".
  SELECT id INTO v_jadwal FROM jadwal_perawatan
   WHERE asset_id = v_exc AND nama = 'Ganti oli mesin & filter';

  INSERT INTO riwayat_perawatan (jadwal_id, asset_id, company_id, tanggal,
                                 biaya, jam_meter, bengkel, uraian, tak_terjadwal)
  VALUES
    (v_jadwal, v_exc, v_company, CURRENT_DATE - 18, 1780000, 1000,
     'Bengkel Komatsu Bandung', 'Ganti oli mesin, filter oli & filter solar', false),
    (v_jadwal, v_exc, v_company, CURRENT_DATE - 110, 1750000, 750,
     'Bengkel Komatsu Bandung', 'Ganti oli mesin & filter', false),
    (NULL, v_exc, v_company, CURRENT_DATE - 65, 2900000, 870,
     'Bengkel Komatsu Bandung', 'Ganti seal silinder boom — bocor', true)
  ON CONFLICT DO NOTHING;

  -- ── DTR-002: sering "dirawat", tapi mayoritas kerusakan mendadak ────────
  --
  -- 2 terjadwal + 4 mendadak = 67% mendadak. Di layar ini harus terbaca
  -- "preventif tidak bekerja", BUKAN "alat rajin diservis".
  INSERT INTO jadwal_perawatan (asset_id, company_id, nama, jenis,
                                setiap_hari, tanggal_terakhir, perkiraan_biaya)
  VALUES (v_dtr, v_company, 'Servis berkala 10.000 km', 'berkala',
          90, CURRENT_DATE - 95, 2200000)
  ON CONFLICT (asset_id, nama) DO NOTHING;

  SELECT id INTO v_jadwal FROM jadwal_perawatan
   WHERE asset_id = v_dtr AND nama = 'Servis berkala 10.000 km';

  INSERT INTO riwayat_perawatan (jadwal_id, asset_id, company_id, tanggal,
                                 biaya, bengkel, uraian, tak_terjadwal)
  VALUES
    (v_jadwal, v_dtr, v_company, CURRENT_DATE - 185, 2150000, 'Bengkel Hino Cimahi',
     'Servis berkala: oli, filter, kampas rem', false),
    (v_jadwal, v_dtr, v_company, CURRENT_DATE - 95, 2400000, 'Bengkel Hino Cimahi',
     'Servis berkala: oli, filter', false),
    (NULL, v_dtr, v_company, CURRENT_DATE - 150, 5800000, 'Bengkel Rahayu',
     'Turun mesin sebagian — piston ring aus', true),
    (NULL, v_dtr, v_company, CURRENT_DATE - 110, 3200000, 'Bengkel Rahayu',
     'Ganti kopling set', true),
    (NULL, v_dtr, v_company, CURRENT_DATE - 60, 1800000, 'Bengkel Rahayu',
     'Perbaikan sistem rem angin', true),
    (NULL, v_dtr, v_company, CURRENT_DATE - 20, 4500000, 'Bengkel Rahayu',
     'Ganti gardan belakang', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO pemakaian_alat (asset_id, company_id, tanggal, jam_mulai, jam_selesai, keperluan)
  SELECT v_dtr, v_company, CURRENT_DATE - g,
         3400 + (7 - g) * 7, 3407 + (7 - g) * 7, 'Angkut material'
  FROM generate_series(0, 7) g
  ON CONFLICT (asset_id, tanggal) DO NOTHING;

  -- ── CRN-003: ada biaya sewa, TAPI belum sekali pun dioperasikan ─────────
  --
  -- Nol jam operasi. Biaya-per-jam di sini HARUS "—", bukan ∞ atau angka
  -- besar yang terlihat masuk akal.
  INSERT INTO jadwal_perawatan (asset_id, company_id, nama, jenis, setiap_jam, perkiraan_biaya)
  VALUES (v_crn, v_company, 'Kalibrasi load indicator', 'kalibrasi', 500, 12000000)
  ON CONFLICT (asset_id, nama) DO NOTHING;

  INSERT INTO biaya_operasional_alat (asset_id, company_id, tanggal, jenis, jumlah, uraian)
  VALUES (v_crn, v_company, CURRENT_DATE - 3, 'retribusi', 2750000,
          'Retribusi & izin mobilisasi alat berat')
  ON CONFLICT DO NOTHING;

  -- ── TRK-004: alat sehat — pembanding ────────────────────────────────────
  INSERT INTO jadwal_perawatan (asset_id, company_id, nama, jenis,
                                setiap_jam, setiap_hari, jam_terakhir, tanggal_terakhir,
                                perkiraan_biaya)
  VALUES (v_trk, v_company, 'Servis drum mixer', 'preventif',
          300, 120, 2100, CURRENT_DATE - 30, 3400000)
  ON CONFLICT (asset_id, nama) DO NOTHING;

  INSERT INTO riwayat_perawatan (asset_id, company_id, tanggal, biaya, bengkel, uraian, tak_terjadwal)
  VALUES
    (v_trk, v_company, CURRENT_DATE - 150, 3300000, 'Bengkel Mitsubishi', 'Servis drum & bearing', false),
    (v_trk, v_company, CURRENT_DATE - 30,  3400000, 'Bengkel Mitsubishi', 'Servis drum & bearing', false)
  ON CONFLICT DO NOTHING;

  INSERT INTO pemakaian_alat (asset_id, company_id, tanggal, jam_mulai, jam_selesai, keperluan)
  SELECT v_trk, v_company, CURRENT_DATE - g,
         2150 + (9 - g) * 6, 2156 + (9 - g) * 6, 'Pengecoran'
  FROM generate_series(0, 9) g
  ON CONFLICT (asset_id, tanggal) DO NOTHING;

  INSERT INTO biaya_operasional_alat (asset_id, company_id, tanggal, jenis, jumlah, kuantitas, satuan, uraian)
  SELECT v_trk, v_company, CURRENT_DATE - g, 'bbm', 765000, 45, 'liter', 'Solar'
  FROM generate_series(0, 9) g
  ON CONFLICT DO NOTHING;

  -- ── Penyusutan: 3 periode terakhir, garis lurus ─────────────────────────
  --
  -- (harga − residu) / umur_bulan. EXC: (1.850jt − 185jt)/96 = 17.343.750/bln
  INSERT INTO penyusutan_alat (asset_id, company_id, periode, nilai, akumulasi)
  SELECT a.id, v_company,
         date_trunc('month', CURRENT_DATE - (g || ' month')::interval)::date,
         round((a.purchase_price - a.residual_value) / a.useful_life_months, 2),
         round((a.purchase_price - a.residual_value) / a.useful_life_months, 2)
           * (GREATEST(1, (DATE_PART('year', age(CURRENT_DATE - (g || ' month')::interval,
                                                 a.purchase_date)) * 12
                          + DATE_PART('month', age(CURRENT_DATE - (g || ' month')::interval,
                                                   a.purchase_date)))::int))
  FROM assets a, generate_series(1, 3) g
  WHERE a.company_id = v_company
    AND a.asset_code IN ('EXC-001', 'DTR-002', 'CRN-003', 'TRK-004')
    AND a.purchase_date <= CURRENT_DATE - (g || ' month')::interval
  ON CONFLICT (asset_id, periode) DO NOTHING;

  RAISE NOTICE 'OK: seed alat — % alat, % pemakaian, % jadwal, % riwayat, % biaya, % penyusutan',
    (SELECT count(*) FROM assets WHERE company_id = v_company),
    (SELECT count(*) FROM pemakaian_alat WHERE company_id = v_company),
    (SELECT count(*) FROM jadwal_perawatan WHERE company_id = v_company),
    (SELECT count(*) FROM riwayat_perawatan WHERE company_id = v_company),
    (SELECT count(*) FROM biaya_operasional_alat WHERE company_id = v_company),
    (SELECT count(*) FROM penyusutan_alat WHERE company_id = v_company);
END $$;
