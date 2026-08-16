-- ============================================================================
-- 427 - ALAT YANG TAK LAGI SEHAT (10.6)
-- ============================================================================
--
-- ── BUKAN DUPLIKAT 10.7 MAUPUN 10.2
--
--   10.7 `perawatan-alat`        alat mana yang JATUH TEMPO servis
--   10.2 `perawatan-diprediksi`  alat mana yang AKAN jatuh tempo
--   ini  `alat-tak-sehat`        alat mana yang mulai lebih sering RUSAK
--                                daripada dirawat
--
-- Dua yang pertama menjadwalkan bengkel. Yang ini memutuskan apakah alatnya
-- masih layak dipertahankan, atau lebih murah disewa. Meja yang berbeda,
-- keputusan yang berbeda.
--
-- ── YANG MEMICU HARI INI, diukur 2026-08-16 pada basis nyata
--
--   DTR-002 Dump Truck   Rp 19,85 jt / Rp 780 jt = 2,54%   4 dari 6 TAK TERJADWAL
--   TRK-004 Truk Mixer   Rp  6,70 jt / Rp 950 jt = 0,71%   0 dari 2
--   EXC-001 Excavator    Rp  6,43 jt / Rp 1,85 M = 0,35%   1 dari 3
--
-- Angka rupiahnya sudah membedakan. Tetapi yang benar-benar menceritakan
-- keadaannya adalah kolom terakhir: uraian keenam servis Dump Truck berbunyi
-- turun mesin sebagian, ganti kopling set, perbaikan rem angin, ganti gardan
-- belakang. Itu bukan alat yang mahal dirawat - itu alat yang RUSAK BERUNTUN.
--
-- ── DUA JALUR TERPISAH, DAN YANG KEDUA DIPERIKSA LEBIH DULU
--
-- Rasio biaya bisa tinggi karena SATU overhaul terjadwal yang wajar. Porsi
-- servis tak terjadwal tak bisa: tiap satu berarti alat berhenti bekerja di
-- tengah pekerjaan.
--
-- Kalau urutannya dibalik, alat yang memenuhi KEDUANYA dilaporkan dengan sebab
-- "biaya tinggi" - dan yang membacanya menyimpulkan masalah ANGGARAN, padahal
-- masalahnya alat itu berhenti bekerja. Diuji langsung di
-- `kesehatan-perawatan.test.ts`.
--
-- ── IZIN DIUKUR SEBELUM DITULIS: `assets:manage`.
--    Yang ada di tabel hanya `assets:manage` dan `assets:view`. Pola ini
--    dipegang sejak tebakan `equipment:manage` pada migrasi 422 ditolak
--    foreign key.
--
-- ── JADWAL: BULANAN, bukan mingguan.
--
-- Biaya perawatan bergerak dalam hitungan bulan - satu alat bisa berbulan-bulan
-- tanpa servis sama sekali. Menjalankannya mingguan menghasilkan temuan yang
-- sama persis empat kali sebulan, dan jeda melandai memang menahannya, tetapi
-- menjalankan tugas yang sudah pasti tak menghasilkan apa-apa tetap membakar
-- denyut penjadwal.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'alat_tak_sehat', 'Alat Tak Lagi Sehat',
       'Alat yang biaya perawatannya menanjak atau sering rusak di luar jadwal',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'assets:manage'
  FROM notification_rules r
 WHERE r.event_type = 'alat_tak_sehat'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'assets:manage');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.alat_tak_sehat.persen', '15',
     'Biaya perawatan kumulatif (persen harga beli) sebelum alat diusulkan diganti atau disewa.'),
    ('otomasi.alat_tak_sehat.porsi', '50',
     'Persen servis yang berupa KERUSAKAN (bukan berkala) sebelum alat disebut sering rusak. Tanda yang lebih mendesak daripada biaya: kerusakan menghentikan pekerjaan.'),
    ('otomasi.alat_tak_sehat.min_servis', '2',
     'Riwayat servis minimum sebelum kesehatan alat disimpulkan. Satu servis bukan kesimpulan.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'alat-tak-sehat', 'bulanan', '07:05', 1, true
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
   WHERE event_type = 'alat_tak_sehat' AND is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '427 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  -- Berpasangan, bukan "setidaknya satu": aturan tanpa target menelan
  -- notifikasinya tanpa jejak, persis seperti aturan yang tak ada.
  SELECT count(*) INTO n FROM notification_rules r
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'alat_tak_sehat' AND t.permission_key = 'assets:manage';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '427 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = 'assets:manage';
  IF n < 1 THEN
    RAISE EXCEPTION '427 gagal: izin assets:manage tidak ada di permissions';
  END IF;

  FOREACH kunci IN ARRAY ARRAY['otomasi.alat_tak_sehat.persen',
                               'otomasi.alat_tak_sehat.porsi',
                               'otomasi.alat_tak_sehat.min_servis'] LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '427 gagal: setelan % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  /*
    Porsi WAJIB 20..100.

    Nilai di bawah 20 membuat satu kerusakan dari lima servis sudah cukup untuk
    menyebut alat "sering rusak" - dan alat berat manapun sesekali rusak.
    Peringatannya lalu menyala untuk seluruh armada dan kehilangan arti.

    Di atas 100 mustahil dicapai, jadi jalur KEDUA mati diam-diam - dan itu
    justru jalur yang paling tajam, satu-satunya yang membedakan alat yang
    berhenti bekerja dari alat yang sekadar mahal.
  */
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.alat_tak_sehat.porsi';
  IF nilai IS NULL OR nilai < 20 OR nilai > 100 THEN
    RAISE EXCEPTION '427 gagal: porsi % di luar 20..100', nilai;
  END IF;

  -- Satu servis bukan kesimpulan.
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.alat_tak_sehat.min_servis';
  IF nilai IS NULL OR nilai < 2 THEN
    RAISE EXCEPTION '427 gagal: min_servis % di bawah 2', nilai;
  END IF;

  -- Bulanan, bukan mingguan - lihat alasannya di kepala berkas.
  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'alat-tak-sehat' AND aktif AND jenis = 'bulanan';
  IF n <> n_ang THEN
    RAISE EXCEPTION '427 gagal: jadwal bulanan ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '427 OK: aturan + target, 3 setelan, jadwal bulanan (% badan usaha)', n_aktif;
END $$;
