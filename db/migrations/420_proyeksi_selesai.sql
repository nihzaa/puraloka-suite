-- ============================================================================
-- 420 - PROYEKSI TANGGAL SELESAI (3.3)
-- ============================================================================
--
-- ── BUKAN PENGULANGAN 3.18 (EVM)
--
-- `evm-kinerja` sudah menjawab "tertinggal berapa" lewat indeks jadwal.
-- Pertanyaan di sini berbeda dan jauh lebih bisa ditindaklanjuti:
--
--     "Kalau laju ini diteruskan, selesainya kapan?"
--
-- "SPI 0,4" menuntut penerimanya menerjemahkan sendiri. "Dengan laju enam
-- puluh hari terakhir, selesai 14 November - 76 hari sesudah kontrak" tidak.
--
-- ── LAJU NOL ADALAH TEMUAN, BUKAN KEGAGALAN MENGHITUNG
--
-- Diukur 2026-08-16: KEENAM proyek aktif terakhir melaporkan progres 2-4
-- BULAN lalu, dan semua tanggal targetnya sudah lewat:
--
--   Renovasi Toko Pak Rudi     95%  lapor 20 Apr   target 30 Apr
--   Rumah Pak Bambang          70%  lapor 10 Apr   target 31 Mei
--   Tambah Ruang Pak Andi      80%  lapor 25 Mei   target 30 Jun
--   Renovasi Rumah Pak Andi    51%  lapor 16 Jun   target 31 Jul
--
-- Otomasi yang membagi dengan laju nol menghasilkan tak-terhingga lalu memilih
-- diam karena "tak bisa dihitung". Padahal proyek yang mandek di 50% dengan
-- target dua minggu lewat adalah sinyal keterlambatan TERKUAT yang ada -
-- bukan yang paling lemah. Ia dikirim sebagai temuannya sendiri.
--
-- ── BEDA DENGAN `progres-belum-lapor`
--
-- Yang itu menegur MANDOR yang belum menyetor laporan. Yang ini bicara ke
-- MANAJER PROYEK tentang akibatnya pada tanggal selesai. Sumbernya sama,
-- pertanyaannya beda, penerimanya beda.
--
-- ── IZIN DIUKUR: `projects:edit`
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('proyeksi_selesai_meleset', 'Proyeksi Selesai Lewat dari Kontrak',
     'Dengan laju progres sekarang, proyek akan selesai setelah tanggal kontrak'),
    ('progres_mandek',           'Progres Berhenti Dilaporkan',
     'Tanpa laporan baru, tanggal selesai tak bisa diperkirakan sama sekali')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'projects:edit'
  FROM notification_rules r
 WHERE r.event_type IN ('proyeksi_selesai_meleset', 'progres_mandek')
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'projects:edit');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.proyeksi_selesai.hari', '7',
     'Hari proyeksi selesai boleh lewat dari tanggal kontrak sebelum diperingatkan.'),
    ('otomasi.proyeksi_selesai.diam', '21',
     'Hari tanpa laporan progres sebelum proyek disebut mandek.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- MINGGUAN. Laju progres tak berubah dalam sehari, dan proyeksi yang dihitung
-- ulang tiap pagi menghasilkan tanggal yang bergeser sedikit terus-menerus -
-- itu membuat angkanya terasa tak bisa dipegang.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'proyeksi-selesai', 'mingguan', '06:20', 1, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; tipe TEXT; kunci TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  FOREACH tipe IN ARRAY ARRAY['proyeksi_selesai_meleset', 'progres_mandek'] LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '420 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;

    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = 'projects:edit';
    IF n <> n_aktif THEN
      RAISE EXCEPTION '420 gagal: target % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = 'projects:edit') THEN
    RAISE EXCEPTION '420 gagal: kunci izin projects:edit tak ada';
  END IF;

  FOREACH kunci IN ARRAY ARRAY['otomasi.proyeksi_selesai.hari',
                               'otomasi.proyeksi_selesai.diam'] LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '420 gagal: ambang % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  -- Ambang diam WAJIB di atas 2 hari. Disetel 1, tiap proyek yang tak dilapor
  -- akhir pekan langsung disebut mandek - dan yang berbunyi tiap Senin
  -- berhenti dibaca sebelum Rabu.
  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.proyeksi_selesai.diam' AND (value #>> '{}')::numeric < 3;
  IF n > 0 THEN
    RAISE EXCEPTION '420 gagal: % tenant memasang ambang diam di bawah 3 hari', n;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas WHERE tugas = 'proyeksi-selesai' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '420 gagal: jadwal ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '420 OK - 2 jenis notifikasi, 2 ambang, 1 jadwal untuk % tenant', n_ang;
END $$;
