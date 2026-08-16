-- ============================================================================
-- 423 - KEBIASAAN BAYAR KLIEN (2.12)
-- ============================================================================
--
-- ── PENILAIAN PERTAMA SAYA SALAH, DAN SALAHNYA LAYAK DICATAT
--
-- Automation ini sempat dicoret dengan alasan "23 dari 23 pembayaran memakai
-- metode yang sama, nol sinyal". Itu mengukur KOLOM YANG SALAH: judul
-- rencananya berbunyi "metode/WAKTU bayar optimal (cash flow timing)", dan
-- waktunya punya sebaran yang jelas.
--
-- Bentuk kesalahannya sama dengan dua pencoretan sebelumnya yang juga keliru:
-- berhenti di pengukuran pertama yang tak cocok, alih-alih bertanya "lalu di
-- mana datanya?".
--
-- ── YANG MEMICU HARI INI, diukur 2026-08-16 pada basis nyata
--
--   4 dari 23 pembayaran TELAT, terparah 98 hari
--   satu invoice dibayar 30 hari LEBIH AWAL senilai Rp 252.480.000
--
--   Ratna Sari      2 invoice   rata +33 hari   terparah  67   Rp 364,6 jt
--   Eko Prasetyo    3 invoice   rata +31 hari   terparah  98   Rp 342,7 jt
--   Melati Indah    3 invoice   rata  -2 hari   tepat waktu
--
-- ── BUKAN DUPLIKAT `invoice-terlambat` (2.6)
--
-- 2.6 menjawab "invoice mana yang lewat jatuh tempo" - satu tagihan, dan
-- tindakannya menagih. Ini menjawab "klien mana yang SELALU telat", dan
-- tindakannya lain: menaikkan uang muka, memperpendek termin, atau menolak
-- proyek berikutnya. Dua nama teratas di atas tak pernah terlihat oleh 2.6
-- sebagai POLA - hanya sebagai beberapa invoice terlambat yang tersebar di
-- beberapa bulan.
--
-- ── DUA JALUR, DAN JALUR KEDUA YANG PALING PENTING
--
-- Rata-rata bisa DISEMBUNYIKAN oleh pembayaran lebih awal: satu invoice telat
-- 98 hari plus satu invoice 90 hari lebih awal menghasilkan rata-rata +4 dan
-- terlihat sehat, padahal separuh tagihannya macet tiga bulan.
--
-- Karena itu `otomasi.kebiasaan_bayar.porsi` ada dan diperiksa TERPISAH, bukan
-- sebagai turunan rata-rata. Diuji langsung di `kebiasaan-bayar.test.ts`.
--
-- ── IZIN DIUKUR: `finance:invoice:create` - yang MENETAPKAN termin, bukan
--    `finance:invoice:pay` yang mencatat pembayaran. Tindakan dari peringatan
--    ini menaikkan uang muka dan memperpendek termin; itu meja yang menerbitkan
--    invoice, bukan yang menerima uangnya.
--
--    Diukur SEBELUM dijalankan kali ini. Tebakan `finance:invoice:manage` tak
--    ada di tabel - yang ada hanya `:create` dan `:pay`.
--
--    Tebakan `equipment:manage` pada migrasi 422 DITOLAK foreign key karena
--    kunci itu tak ada. Sejak itu kuncinya diukur lebih dulu, dan blok
--    verifikasi di bawah memeriksanya lagi supaya kegagalan berhenti di
--    migrasi - bukan di rute yang menolak semua orang tanpa gejala.
--
-- ── JADWAL: MINGGUAN. Kebiasaan bayar bergerak dalam hitungan bulan;
--    memeriksanya harian menghasilkan temuan yang sama persis tujuh kali.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'kebiasaan_bayar_klien', 'Kebiasaan Bayar Klien',
       'Pola keterlambatan bayar lintas-invoice per klien, bukan satu tagihan telat',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'finance:invoice:create'
  FROM notification_rules r
 WHERE r.event_type = 'kebiasaan_bayar_klien'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'finance:invoice:create');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.kebiasaan_bayar.hari', '14',
     'Rata-rata hari keterlambatan sebelum kebiasaan klien dilaporkan.'),
    ('otomasi.kebiasaan_bayar.porsi', '50',
     'Persen invoice telat yang cukup untuk melapor, terlepas dari rata-rata. Menahan klien yang sesekali membayar sangat awal sehingga rata-ratanya terlihat bagus.'),
    ('otomasi.kebiasaan_bayar.min_invoice', '2',
     'Invoice lunas minimum sebelum kebiasaan disimpulkan. Satu invoice bukan kebiasaan.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'kebiasaan-bayar', 'mingguan', '07:35', 1, true
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
   WHERE event_type = 'kebiasaan_bayar_klien' AND is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '423 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  -- Berpasangan, bukan "setidaknya satu": aturan tanpa target menelan
  -- notifikasinya tanpa jejak, persis seperti aturan yang tak ada.
  SELECT count(*) INTO n FROM notification_rules r
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'kebiasaan_bayar_klien'
     AND t.permission_key = 'finance:invoice:create';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '423 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = 'finance:invoice:create';
  IF n < 1 THEN
    RAISE EXCEPTION '423 gagal: izin finance:invoice:create tidak ada di permissions';
  END IF;

  FOREACH kunci IN ARRAY ARRAY['otomasi.kebiasaan_bayar.hari',
                               'otomasi.kebiasaan_bayar.porsi',
                               'otomasi.kebiasaan_bayar.min_invoice'] LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '423 gagal: setelan % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  /*
    Porsi WAJIB 10..100, dan itu bukan sekadar rentang sopan.

    Nilai 0 membuat SETIAP klien yang pernah telat sekali dilaporkan - termasuk
    yang telat satu hari dari dua puluh invoice - dan peringatannya kehilangan
    arti dalam seminggu. Nilai di atas 100 mustahil dicapai, jadi jalur kedua
    MATI diam-diam dan klien yang menyembunyikan tagihan macet di balik
    pembayaran lebih awal kembali tak terlihat. Itu justru cacat yang jalur ini
    ada untuk menutupnya.
  */
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.kebiasaan_bayar.porsi';
  IF nilai IS NULL OR nilai < 10 OR nilai > 100 THEN
    RAISE EXCEPTION '423 gagal: porsi % di luar 10..100', nilai;
  END IF;

  -- Satu invoice bukan kebiasaan. Menuduh klien "selalu telat" dari satu
  -- sampel merusak hubungan bisnis atas dasar yang tak ada.
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.kebiasaan_bayar.min_invoice';
  IF nilai IS NULL OR nilai < 2 THEN
    RAISE EXCEPTION '423 gagal: min_invoice % di bawah 2', nilai;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'kebiasaan-bayar' AND aktif AND jenis = 'mingguan';
  IF n <> n_ang THEN
    RAISE EXCEPTION '423 gagal: jadwal mingguan ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '423 OK: 1 aturan + target, 3 setelan, jadwal mingguan (% badan usaha)', n_aktif;
END $$;
