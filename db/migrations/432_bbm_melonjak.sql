-- ============================================================================
-- 432 - KONSUMSI BBM MELONJAK (10.4)
-- ============================================================================
--
-- ── PENCORETAN SAYA, DAN KOLOM YANG SALAH SAYA UKUR
--
-- Automation ini sempat dicoret: "nominal BBM tiap pengisian identik, nol
-- variasi, tak ada anomali untuk dideteksi."
--
-- Diukur ulang ke kolom yang benar - `kuantitas` (liter), bukan `jumlah`
-- (rupiah):
--
--   Excavator 20 Ton   12 pengisian   960 liter   80 L tiap kali
--   Truk Mixer 7 m3    10 pengisian   450 liter   45 L tiap kali
--
-- Nominalnya memang seragam - karena tangkinya diisi PENUH tiap kali dan harga
-- solar tak berubah. Itu bukan ketiadaan sinyal; itu ukuran yang salah.
--
-- Ini pencoretan kelima saya yang keliru dengan bentuk yang sama: berhenti di
-- pengukuran pertama yang tak cocok, alih-alih bertanya "lalu kolom mana yang
-- benar-benar mengukurnya?".
--
-- ── KENAPA LITER PER JAM, BUKAN RUPIAH
--
-- Kalau liter/jam melonjak, penyebabnya salah satu dari tiga hal yang SEMUANYA
-- merugikan: filter atau injektor bermasalah, mesin dibiarkan menyala
-- menganggur berjam-jam, atau solar hilang di lapangan.
--
-- Rupiah tak bisa membedakan ketiganya dari kenaikan harga solar. Liter per jam
-- bisa.
--
-- ── DIBANDINGKAN DENGAN DIRINYA SENDIRI
--
-- Excavator dan truk mixer punya konsumsi wajar yang berbeda jauh.
-- Membandingkan antar-alat menghasilkan tuduhan yang selalu menunjuk alat
-- terbesar - benar secara aritmetika, tak berguna sama sekali.
--
-- Alat tanpa riwayat DIAM sampai punya acuannya sendiri. Godaannya
-- membandingkan dengan angka baku industri (15-25 L/jam untuk excavator 20
-- ton); itu ditolak karena angka baku tak tahu alat ini bekerja di tanah keras
-- atau lunak, dengan operator berpengalaman atau tidak.
--
-- ── IZIN DIUKUR: `assets:manage`. Yang ada di tabel hanya `assets:manage` dan
--    `assets:view`; ini menuntut TINDAKAN (periksa filter, tegur operator,
--    audit pengisian), bukan melihat.
--
-- ── JADWAL: MINGGUAN. Konsumsi BBM bergerak dalam hitungan pekan; harian akan
--    menegur alat yang kebetulan satu hari kerja berat.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'bbm_melonjak', 'Konsumsi BBM Melonjak',
       'Liter per jam operasi naik jauh dari kebiasaan alat itu sendiri',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'assets:manage'
  FROM notification_rules r
 WHERE r.event_type = 'bbm_melonjak'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'assets:manage');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.bbm_melonjak.hari', '30',
     'Panjang periode yang dinilai konsumsi BBM-nya, dibandingkan terhadap riwayat alat itu sendiri.'),
    ('otomasi.bbm_melonjak.persen', '30',
     'Kenaikan liter per jam (persen) di atas kebiasaan alat sebelum disebut melonjak.'),
    ('otomasi.bbm_melonjak.min_isi', '2',
     'Pengisian minimum sebelum konsumsi disimpulkan. Satu pengisian bisa berarti tangki diisi penuh sesudah lama kosong.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'bbm-melonjak', 'mingguan', '07:25', 1, true
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
   WHERE r.event_type = 'bbm_melonjak' AND r.is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '432 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM notification_rules r
    JOIN companies c ON c.id = r.company_id AND c.is_active
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'bbm_melonjak' AND t.permission_key = 'assets:manage';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '432 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = 'assets:manage';
  IF n < 1 THEN
    RAISE EXCEPTION '432 gagal: izin assets:manage tidak ada di permissions';
  END IF;

  FOREACH kunci IN ARRAY ARRAY['otomasi.bbm_melonjak.hari',
                               'otomasi.bbm_melonjak.persen',
                               'otomasi.bbm_melonjak.min_isi'] LOOP
    SELECT count(*) INTO n
    FROM company_settings cs
    JOIN companies c ON c.id = cs.company_id AND c.is_active
   WHERE cs.key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '432 gagal: setelan % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  /*
    Ambang persen WAJIB 10..200.

    Di bawah 10 menandai selisih yang lebih kecil daripada ragam wajar antar
    hari kerja - tanah keras, operator berbeda, muatan berbeda. Peringatannya
    menyala untuk seluruh armada tiap pekan.

    Di atas 200 berarti konsumsi harus TIGA KALI LIPAT sebelum terdeteksi. Pada
    titik itu solar yang hilang sudah berbulan-bulan.
  */
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.bbm_melonjak.persen';
  IF nilai IS NULL OR nilai < 10 OR nilai > 200 THEN
    RAISE EXCEPTION '432 gagal: ambang persen % di luar 10..200', nilai;
  END IF;

  /*
    PRASYARAT: harus ada pengisian BBM ber-KUANTITAS.

    Automation ini membaca `kuantitas` (liter), bukan `jumlah` (rupiah). Kalau
    kolom kuantitasnya kosong, rutenya membalas 200 dengan nol notifikasi - tak
    bisa dibedakan dari "semua alat irit".

    Ini persis kelumpuhan yang membuat saya SALAH mencoret automation ini di
    awal: mengukur kolom yang tak mengukur apa yang dimaksud.
  */
  SELECT count(*) INTO n FROM biaya_operasional_alat
   WHERE jenis = 'bbm' AND kuantitas IS NOT NULL AND kuantitas > 0;
  IF n < 1 THEN
    RAISE EXCEPTION
      '432 gagal: tak ada pengisian BBM ber-kuantitas — otomasi ini tak akan pernah berbunyi';
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas jt
   JOIN companies c ON c.id = jt.company_id AND c.is_active
   WHERE jt.tugas = 'bbm-melonjak' AND aktif AND jenis = 'mingguan';
  IF n <> n_ang THEN
    RAISE EXCEPTION '432 gagal: jadwal mingguan ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '432 OK: aturan + target, 3 setelan, jadwal mingguan (% badan usaha)', n_aktif;
END $$;
