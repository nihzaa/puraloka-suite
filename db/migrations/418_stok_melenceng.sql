-- ============================================================================
-- 418 — STOK MELENCENG DARI BUKU GERAKAN (4.8)
-- ============================================================================
--
-- ── NOMOR INI SEMPAT DICORET, DAN CORETANNYA SALAH
--
-- Alasan pencoretan: `opname_bersama` mengukur VOLUME PEKERJAAN, bukan stok
-- gudang. Bagian itu benar. Kesimpulannya yang salah — ia berhenti di tabel
-- pertama yang tak cocok tanpa menanyakan: lalu di mana opname stok dicatat?
--
-- Jawabannya `stock_movements.movement_type = 'adjustment'`, dan catatannya
-- menyebut dirinya sendiri:
--
--     "Opname mingguan — koreksi 2 m2 pecah saat handling"
--
-- ── Yang memicu HARI INI, diukur 2026-08-16
--
--   stok_melenceng        8 dari 12 baris `project_stocks` TIDAK cocok dengan
--                         jumlah gerakannya sendiri:
--                           Besi Beton O12mm   sistem 5   buku gerakan 240
--                           Semen Portland     sistem 5   buku gerakan 152
--   stok_susut_berulang   3 penyesuaian, semuanya turun, semuanya -2
--
-- ── KEJADIAN KETIGA HARI INI DARI BENTUK YANG SAMA
--
--   penyusutan   dihitung, tak pernah terjurnal          (migrasi 408)
--   invoice      diakui masuk, tanpa bukti penerimaan    (migrasi 416)
--   stok         tercatat, tak cocok dengan bukunya      (migrasi ini)
--
-- Ketiganya: kolom ringkasan yang terlihat benar di satu layar, dan tak cocok
-- dengan buku di belakangnya. Tak satu pun terlihat dari layar mana pun,
-- karena tiap tabel konsisten dengan dirinya sendiri.
--
-- Di gudang akibatnya langsung: `qty_on_hand` yang dipakai memutuskan "perlu
-- pesan lagi atau tidak". Lebih kecil dari kenyataan -> dipesan padahal
-- menumpuk. Lebih besar -> pekerjaan berhenti menunggu barang yang dikira ada.
--
-- ── IZIN DIUKUR: `gudang:manage` · `procurement:material:manage`
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('stok_melenceng',      'Stok Melenceng dari Buku Gerakan',
     'Angka stok tersimpan tak cocok dengan penerimaan, pemakaian, dan penyesuaiannya'),
    ('stok_susut_berulang', 'Penyesuaian Stok Selalu Berkurang',
     'Material yang tiap opname disesuaikan turun dan tak pernah naik')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('stok_melenceng',      'gudang:manage'),
    -- Selisih stok juga urusan pengadaan: merekalah yang memesan berdasar
    -- angka yang ternyata tak bisa dipercaya.
    ('stok_melenceng',      'procurement:material:manage'),
    ('stok_susut_berulang', 'gudang:manage')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.stok_melenceng.satuan', '1'::jsonb, 'number', 'otomasi',
       'Selisih satuan minimum antara stok tercatat dan buku gerakan. Hampir nol dengan sengaja.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- MINGGUAN. Selisih stok tak muncul dalam sehari, dan menegurnya tiap pagi
-- membuat gudang berhenti membacanya. Tetapi juga tak boleh bulanan: angka
-- yang salah dipakai memesan tiap minggu.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'stok-melenceng', 'mingguan', '07:15', 1, true
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

  FOREACH tipe IN ARRAY ARRAY['stok_melenceng', 'stok_susut_berulang'] LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '418 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  FOR tipe, kunci IN
    SELECT * FROM (VALUES
      ('stok_melenceng',      'gudang:manage'),
      ('stok_melenceng',      'procurement:material:manage'),
      ('stok_susut_berulang', 'gudang:manage')
    ) AS v(t, i)
  LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '418 gagal: target %->% ada % baris, harus %',
        tipe, kunci, n, n_aktif;
    END IF;
  END LOOP;

  FOREACH kunci IN ARRAY ARRAY['gudang:manage', 'procurement:material:manage'] LOOP
    IF NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = kunci) THEN
      RAISE EXCEPTION '418 gagal: kunci izin % tak ada di tabel permissions', kunci;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.stok_melenceng.satuan';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '418 gagal: ambang ada % baris, harus %', n, n_aktif;
  END IF;

  /*
    Ambangnya WAJIB kecil.

    Dilonggarkan sampai ratusan satuan, selisih yang justru paling penting —
    stok yang dipakai memesan ternyata salah — akan lolos diam-diam. Ini
    pengaman pembulatan, bukan batas kewajaran.
  */
  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.stok_melenceng.satuan' AND (value #>> '{}')::numeric > 100;
  IF n > 0 THEN
    RAISE EXCEPTION '418 gagal: % tenant memasang ambang selisih stok di atas 100 satuan', n;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas WHERE tugas = 'stok-melenceng' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '418 gagal: jadwal ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '418 OK — 2 jenis notifikasi, 1 ambang, 1 jadwal untuk % tenant', n_ang;
END $$;
