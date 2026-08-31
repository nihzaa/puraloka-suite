-- ============================================================================
-- 426 - MATERIAL KURANG TERHADAP PROGRES (3.4)
-- ============================================================================
--
-- ── PENCORETAN SAYA YANG KEEMPAT, SALAH DENGAN BENTUK YANG SAMA
--
-- Automation ini sempat dicoret: "tabel pemeta RAB-material NOL baris, tak
-- bisa dibangun". Tabelnya memang kosong - tetapi ADA, dan bentuknya tepat.
-- Yang benar bukan "tak bisa dibangun" melainkan "petanya belum diisi".
--
-- Founder yang menjawabnya: "buat aja datanya". Migrasi 425 mengisi petanya -
-- 11 baris di 2 proyek.
--
-- ── BUKAN DUPLIKAT `stok-menipis` (4.5)
--
-- 4.5 menjawab "stok tinggal berapa" dan melihat GUDANG. Ini menjawab "proyek
-- sudah 40% jalan, materialnya baru datang 25% dari rencana - cukup sampai
-- selesai?"
--
-- Bedanya WAKTU. Stok menipis baru terlihat saat barangnya hampir habis;
-- kekurangan terhadap RENCANA terlihat berminggu-minggu sebelumnya - dan itu
-- justru rentang yang dibutuhkan untuk memesan.
--
-- ── IZIN DIUKUR: `procurement:material:manage`. Tindakan dari peringatan ini
--    MEMESAN material, jadi mejanya pengadaan - bukan gudang yang mencatat.
--
-- ── JADWAL: MINGGUAN. Progres proyek bergerak mingguan, bukan harian.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'material_kurang', 'Material Kurang Terhadap Progres',
       'Material yang tersedia tertinggal dari kebutuhan pada progres saat ini',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'procurement:material:manage'
  FROM notification_rules r
 WHERE r.event_type = 'material_kurang'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'procurement:material:manage');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.material_kurang.bantalan', '10',
     'Persen cadangan di atas kebutuhan sebelum material disebut kurang. Nol berarti peringatan datang tepat saat pas - terlambat, karena memesan butuh waktu kirim.'),
    ('otomasi.material_kurang.min_progres', '10',
     'Progres minimum sebelum kebutuhan material diperiksa. Proyek yang baru mulai wajar belum punya materialnya.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'material-kurang', 'mingguan', '07:55', 1, true
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
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type = 'material_kurang' AND is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '426 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM notification_rules r
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'material_kurang'
     AND t.permission_key = 'procurement:material:manage';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '426 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = 'procurement:material:manage';
  IF n < 1 THEN
    RAISE EXCEPTION '426 gagal: izin procurement:material:manage tidak ada';
  END IF;

  /*
    PRASYARAT DATA DIPERIKSA DI SINI, bukan diserahkan ke rutenya.

    Automation ini TAK BISA berbunyi tanpa `project_rab_materials` terisi -
    dan rutenya akan membalas 200 dengan `notifications_created: 0`, yang
    terbaca persis seperti "material semuanya cukup". Itu kelumpuhan yang
    sama dengan `min_stock` nol yang baru diperbaiki migrasi 425.

    Migrasi ini menolak berjalan bila petanya kosong, supaya kelumpuhan itu
    berhenti di sini alih-alih hidup diam-diam di produksi.
  */
  /*
    ⚠ DIBEDAKAN DUA SEBAB — DIPERBAIKI 2026-08-31.

    Peta RAB↔material kosong bisa berarti DUA hal yang sangat berbeda:

      (a) ada material dan ada RAB, tetapi petanya tak terbentuk
          → itulah kelumpuhan yang migrasi ini cegah, dan wajib berhenti;

      (b) basisnya memang belum berisi apa pun
          → tak ada yang bisa dipetakan, dan berhenti di sini hanya
            menghentikan seluruh rantai migrasi.

    Versi sebelumnya menyamakan keduanya:

        HARD FAIL — 426_material_kurang.sql
          426 gagal: project_rab_materials kosong — jalankan migrasi 425 dulu

    Padahal migrasi 425 SUDAH berjalan; ia hanya tak punya material untuk
    dipetakan — dan sejak 2026-08-31 ia melewati verifikasinya sendiri dengan
    alasan yang sama.

    Pesan "jalankan migrasi 425 dulu" pun menyesatkan: ia menuduh urutan
    migrasi, padahal urutannya benar. Yang membacanya akan mencari cacat di
    tempat yang tak ada cacatnya.
  */
  IF NOT EXISTS (SELECT 1 FROM materials) THEN
    RAISE NOTICE '426 verifikasi dilewati: nol material di basis ini, jadi peta RAB memang kosong. Bukan galat.';
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM project_rab_materials;
  IF n < 1 THEN
    RAISE EXCEPTION '426 gagal: project_rab_materials kosong PADAHAL ada material — '
                    'peta tak terbentuk, dan automation ini akan membalas 200 '
                    'dengan notifications_created: 0 yang terbaca seperti "semua cukup"';
  END IF;

  /*
    Bantalan 0 sah (ada perusahaan yang memesan tepat waktu), tetapi
    min_progres 100 TIDAK: ia melewati semua proyek kecuali yang sudah selesai,
    dan proyek selesai tak butuh material lagi. Automation-nya lalu hidup dan
    tak pernah memeriksa apa pun.
  */
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.material_kurang.min_progres';
  IF nilai IS NULL OR nilai < 0 OR nilai >= 100 THEN
    RAISE EXCEPTION '426 gagal: min_progres % di luar 0..99', nilai;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'material-kurang' AND aktif AND jenis = 'mingguan';
  IF n <> n_ang THEN
    RAISE EXCEPTION '426 gagal: jadwal mingguan ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '426 OK: aturan + target, 2 setelan, jadwal mingguan (% badan usaha)', n_aktif;
END $$;
