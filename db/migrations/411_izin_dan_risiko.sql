-- ============================================================================
-- 411 — IZIN KEDALUWARSA (9.1) · RISIKO LEWAT TINJAU (9.4)
-- ============================================================================
--
-- ── Yang memicu HARI INI, diukur 2026-08-16
--
--   izin_proyek_kedaluwarsa   650/IPR/2024/0098 "Izin Pemanfaatan Ruang"
--                             status `terbit`, berlaku sampai 2025-11-05 —
--                             SUDAH LEWAT. Dan PBG 503/PBG/2025/0417 berakhir
--                             46 hari lagi.
--   izin_kerja_kedaluwarsa    2 izin kerja `disetujui` yang masa berlakunya
--                             sudah habis
--   risiko_lewat_tinjau       RSK-01 "Keterlambatan pasokan baja tulangan",
--                             skor 16, tenggat tinjau lewat 10 hari
--
-- ── DUA JENIS IZIN, DUA AKIBAT YANG BERBEDA
--
--   `izin_proyek`  izin pemerintah. Kedaluwarsa = bangunan berdiri tanpa
--                  dasar hukum, dan yang menanggung pemiliknya.
--   `izin_kerja`   permit to work. Kedaluwarsa = orang masih bekerja di
--                  ketinggian atau ruang terbatas di bawah izin yang habis.
--
-- Izin yang BELUM PERNAH terbit lebih genting daripada izin yang habis masa
-- berlakunya: yang kedua pernah sah, yang pertama tidak pernah. Kolom
-- `izin_proyek.menghalangi_mulai` menyatakan sendiri bahwa pekerjaan
-- seharusnya belum dimulai tanpanya.
--
-- ── TENGGANG RISIKO BERSKALA MENURUT SKOR
--
-- Skor = dampak × kemungkinan, 1–25. Risiko berskor 16 yang telat ditinjau
-- seminggu berbeda jauh dari risiko berskor 2 yang telat sebulan. Rumusnya di
-- rute dan pembandingnya DIPAKU: membuat risiko berskor 25 bisa disetel lebih
-- longgar daripada skor 1 adalah pilihan yang tak boleh tersedia.
--
-- ── IZIN DIUKUR
--
--   izin:manage        yang mengurus perizinan proyek
--   k3:permit:manage   yang menerbitkan dan menutup izin kerja
--   risiko:manage      yang meninjau daftar risiko
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('izin_proyek_kedaluwarsa',     'Izin Proyek Kedaluwarsa',
     'Izin pemerintah yang melewati atau mendekati akhir masa berlaku'),
    ('izin_penghalang_belum_terbit','Izin Penghalang Belum Terbit',
     'Izin yang menghalangi dimulainya pekerjaan tetapi proyeknya sudah berjalan'),
    ('izin_kerja_kedaluwarsa',      'Izin Kerja Habis Masa Berlaku',
     'Izin kerja disetujui yang masa berlakunya sudah habis'),
    ('risiko_lewat_tinjau',         'Risiko Lewat Tenggat Tinjau',
     'Risiko proyek yang berhenti ditinjau ulang'),
    ('risiko_tinggi_tanpa_tenggat', 'Risiko Tinggi Belum Dijadwalkan Ditinjau',
     'Risiko berskor tinggi yang belum punya tenggat tinjau sama sekali')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('izin_proyek_kedaluwarsa',      'izin:manage'),
    ('izin_penghalang_belum_terbit', 'izin:manage'),
    -- Izin kerja urusan K3, BUKAN bagian perizinan pemerintah. Dua meja
    -- berbeda, dan menyilangkannya membuat keduanya menganggap yang lain
    -- yang mengurus.
    ('izin_kerja_kedaluwarsa',       'k3:permit:manage'),
    ('risiko_lewat_tinjau',          'risiko:manage'),
    ('risiko_tinggi_tanpa_tenggat',  'risiko:manage')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.izin.hari', '60',
     'Hari sebelum izin proyek habis mulai diperingatkan.'),
    ('otomasi.risiko_tinjau.hari', '14',
     'Tenggang hari sesudah tenggat tinjau risiko. Menyusut sebanding skor risikonya.'),
    ('otomasi.risiko_tinjau.skor', '12',
     'Skor risiko yang dianggap tinggi (dampak x kemungkinan, 1-25).')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, v.tugas, v.jenis, v.jam, v.pekan, true
  FROM companies c
  CROSS JOIN (VALUES
    -- Izin kerja yang habis berarti orang mungkin sedang bekerja tanpa izin
    -- HARI INI. Itu tak bisa menunggu pekan depan.
    ('izin-kedaluwarsa',    'harian',   '06:25', NULL::int),
    ('risiko-lewat-tinjau', 'mingguan', '08:35', 1)
  ) AS v(tugas, jenis, jam, pekan)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; tipe TEXT; kunci TEXT; t_nama TEXT;
  TIPE_BARU TEXT[] := ARRAY[
    'izin_proyek_kedaluwarsa', 'izin_penghalang_belum_terbit',
    'izin_kerja_kedaluwarsa', 'risiko_lewat_tinjau', 'risiko_tinggi_tanpa_tenggat'];
  KUNCI_BARU TEXT[] := ARRAY[
    'otomasi.izin.hari', 'otomasi.risiko_tinjau.hari', 'otomasi.risiko_tinjau.skor'];
  TUGAS_BARU TEXT[] := ARRAY['izin-kedaluwarsa', 'risiko-lewat-tinjau'];
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  FOREACH tipe IN ARRAY TIPE_BARU LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '411 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  FOR tipe, kunci IN
    SELECT * FROM (VALUES
      ('izin_proyek_kedaluwarsa',      'izin:manage'),
      ('izin_penghalang_belum_terbit', 'izin:manage'),
      ('izin_kerja_kedaluwarsa',       'k3:permit:manage'),
      ('risiko_lewat_tinjau',          'risiko:manage'),
      ('risiko_tinggi_tanpa_tenggat',  'risiko:manage')
    ) AS v(t, i)
  LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '411 gagal: target %→% ada % baris, harus %',
        tipe, kunci, n, n_aktif;
    END IF;
  END LOOP;

  -- Izin kerja WAJIB ke K3, bukan ke bagian perizinan. Menyilangkannya
  -- membuat kedua meja menganggap yang lain yang mengurus.
  SELECT count(*) INTO n FROM notification_rule_targets t
    JOIN notification_rules r ON r.id = t.rule_id
   WHERE r.event_type = 'izin_kerja_kedaluwarsa' AND t.permission_key = 'izin:manage';
  IF n > 0 THEN
    RAISE EXCEPTION '411 gagal: izin kerja dialamatkan ke izin:manage, harus k3:permit:manage';
  END IF;

  SELECT count(*) INTO n
    FROM (VALUES ('izin:manage'), ('k3:permit:manage'), ('risiko:manage')) AS v(k)
   WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.k);
  IF n > 0 THEN
    RAISE EXCEPTION '411 gagal: % kunci izin tak ada di tabel permissions', n;
  END IF;

  FOREACH kunci IN ARRAY KUNCI_BARU LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '411 gagal: ambang % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  FOREACH t_nama IN ARRAY TUGAS_BARU LOOP
    SELECT count(*) INTO n FROM jadwal_tugas j WHERE j.tugas = t_nama AND j.aktif;
    IF n <> n_ang THEN
      RAISE EXCEPTION '411 gagal: jadwal % ada % baris, harus %', t_nama, n, n_ang;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'izin-kedaluwarsa' AND jenis = 'harian' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '411 gagal: jadwal izin bukan harian di % tenant', n_ang - n;
  END IF;

  RAISE NOTICE '411 OK — 5 jenis notifikasi, 3 ambang, 2 jadwal untuk % tenant beranggota', n_ang;
END $$;
