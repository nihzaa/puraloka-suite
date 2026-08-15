-- ============================================================================
-- 410 — INSIDEN K3 (3.15) · STOK MINIMUM (4.5) · AUDIT MUTU (3.14)
-- ============================================================================
--
-- ── Yang memicu HARI INI, diukur 2026-08-16
--
--   insiden_k3_tanpa_tindakan  INS-04 kecelakaan_berat, 18 hari berstatus
--                              `diselidiki`, `tindakan_korektif` NULL
--   insiden_k3_menggantung     3 insiden terbuka: INS-03 nyaris_celaka 25 hari,
--                              INS-04 18 hari, INS-05 nyaris_celaka 12 hari
--   material_tanpa_batas_min   23 dari 24 material aktif TANPA batas minimum
--   stok_di_bawah_minimum      1 material (Semen 3 Roda, 0 dari 20 sak)
--   audit_mutu_lewat_jadwal    AM-2608-02 `berjalan`, lewat 6 hari
--   rencana_mutu_belum_sah     RMP-2608-01 masih `diajukan`
--
-- ── AMBANG BERSKALA, DAN PERBANDINGANNYA SENGAJA TAK BISA DISETEL
--
-- Enam jenis insiden terdaftar, dan jaraknya sangat jauh — dari `fatal`
-- sampai `nyaris_celaka`. Satu ambang untuk semuanya memaksa memilih antara
-- membiarkan kecelakaan berat menganggur berminggu-minggu, atau membuat tiap
-- nyaris-celaka berbunyi tiap hari sampai orang mematikan notifikasinya. Yang
-- mati ikut membungkam yang berat.
--
-- Yang bisa disetel tenant HANYA ambang dasarnya. Pengali per jenis dipaku di
-- kode: membuat kecelakaan berat bisa dikonfigurasi lebih longgar daripada
-- nyaris-celaka adalah pilihan yang tak boleh tersedia di UI mana pun.
--
-- ── IZIN DIUKUR
--
--   k3:insiden:manage    yang menyelidiki dan menutup insiden
--   gudang:manage        yang mengurus stok dan memesan ulang
--   mutu:audit:manage    yang menjalankan audit mutu
--   mutu:rmp:approve     yang mengesahkan rencana mutu
--
-- Keempatnya diverifikasi ada di tabel `permissions` lebih dulu.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('insiden_k3_menggantung',       'Insiden K3 Belum Ditutup',
     'Insiden keselamatan kerja yang melewati tenggang penutupannya'),
    ('insiden_k3_tanpa_tindakan',    'Insiden Berat Tanpa Tindakan Korektif',
     'Insiden berat yang belum punya satu pun tindakan korektif tercatat'),
    ('stok_di_bawah_minimum',        'Stok Material di Bawah Minimum',
     'Stok gabungan proyek dan gudang di bawah batas minimum material'),
    ('material_tanpa_batas_minimum', 'Material Belum Punya Batas Minimum',
     'Material aktif yang belum punya batas stok minimum sama sekali'),
    ('audit_mutu_lewat_jadwal',      'Audit Mutu Lewat Jadwal',
     'Audit mutu yang melewati tanggal rencananya'),
    ('rencana_mutu_belum_disetujui', 'Rencana Mutu Belum Disetujui',
     'Rencana mutu yang masih menunggu pengesahan')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('insiden_k3_menggantung',       'k3:insiden:manage'),
    ('insiden_k3_tanpa_tindakan',    'k3:insiden:manage'),
    ('stok_di_bawah_minimum',        'gudang:manage'),
    ('material_tanpa_batas_minimum', 'gudang:manage'),
    ('audit_mutu_lewat_jadwal',      'mutu:audit:manage'),
    -- Pengesahan rencana mutu, BUKAN pelaksanaan auditnya. Dua tombol
    -- berbeda di tangan dua orang berbeda.
    ('rencana_mutu_belum_disetujui', 'mutu:rmp:approve')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.insiden_k3.hari', '7',
     'Hari DASAR sebelum insiden K3 ditegur. Dikali pengali per jenis yang dipaku di kode.'),
    ('otomasi.audit_mutu.hari', '3',
     'Hari sesudah tanggal rencana sebelum audit mutu ditegur.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- `insiden-k3-belum-ditutup` HARIAN, dua lainnya mingguan.
--
-- Insiden yang menggantung memburuk tiap hari: penyebabnya masih di lokasi,
-- dan orang masih bekerja di sana. Stok dan audit mutu bergerak dalam
-- hitungan minggu.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, v.tugas, v.jenis, v.jam, v.pekan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('insiden-k3-belum-ditutup', 'harian',   '06:15', NULL::int),
    ('stok-di-bawah-minimum',    'mingguan', '07:05', 1),
    ('audit-mutu-lewat-jadwal',  'mingguan', '08:20', 1)
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
    'insiden_k3_menggantung', 'insiden_k3_tanpa_tindakan',
    'stok_di_bawah_minimum', 'material_tanpa_batas_minimum',
    'audit_mutu_lewat_jadwal', 'rencana_mutu_belum_disetujui'];
  KUNCI_BARU TEXT[] := ARRAY[
    'otomasi.insiden_k3.hari', 'otomasi.audit_mutu.hari'];
  TUGAS_BARU TEXT[] := ARRAY[
    'insiden-k3-belum-ditutup', 'stok-di-bawah-minimum', 'audit-mutu-lewat-jadwal'];
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  FOREACH tipe IN ARRAY TIPE_BARU LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '410 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  FOR tipe, kunci IN
    SELECT * FROM (VALUES
      ('insiden_k3_menggantung',       'k3:insiden:manage'),
      ('insiden_k3_tanpa_tindakan',    'k3:insiden:manage'),
      ('stok_di_bawah_minimum',        'gudang:manage'),
      ('material_tanpa_batas_minimum', 'gudang:manage'),
      ('audit_mutu_lewat_jadwal',      'mutu:audit:manage'),
      ('rencana_mutu_belum_disetujui', 'mutu:rmp:approve')
    ) AS v(t, i)
  LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '410 gagal: target %→% ada % baris, harus %',
        tipe, kunci, n, n_aktif;
    END IF;
  END LOOP;

  SELECT count(*) INTO n
    FROM (VALUES ('k3:insiden:manage'), ('gudang:manage'),
                 ('mutu:audit:manage'), ('mutu:rmp:approve')) AS v(k)
   WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.k);
  IF n > 0 THEN
    RAISE EXCEPTION '410 gagal: % kunci izin tak ada di tabel permissions', n;
  END IF;

  FOREACH kunci IN ARRAY KUNCI_BARU LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '410 gagal: ambang % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  FOREACH t_nama IN ARRAY TUGAS_BARU LOOP
    SELECT count(*) INTO n FROM jadwal_tugas j WHERE j.tugas = t_nama AND j.aktif;
    IF n <> n_ang THEN
      RAISE EXCEPTION '410 gagal: jadwal % ada % baris, harus %', t_nama, n, n_ang;
    END IF;
  END LOOP;

  -- Insiden K3 WAJIB harian. Menjadwalkannya mingguan berarti insiden berat
  -- bisa menganggur enam hari sebelum ada yang tahu — dan penyebabnya masih
  -- di lokasi selama itu.
  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'insiden-k3-belum-ditutup' AND jenis = 'harian' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '410 gagal: jadwal insiden K3 bukan harian di % tenant',
      n_ang - n;
  END IF;

  RAISE NOTICE '410 OK — 6 jenis notifikasi, 2 ambang, 3 jadwal untuk % tenant beranggota', n_ang;
END $$;
