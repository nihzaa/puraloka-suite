-- ============================================================================
-- 415 — MATERIAL SAMA DARI BEBERAPA PEMASOK (4.11)
-- ============================================================================
--
-- ── Yang memicu HARI INI, diukur 2026-08-16
--
--   Besi Beton Ø12mm SNI    2 pemasok  Rp 100.000 → Rp 120.000  (20%)
--                           160 batang · selisih Rp 3.200.000
--   Besi Beton Ø10mm SNI    2 pemasok  Rp  80.000 → Rp  85.000  (6%)
--                           204 batang · selisih Rp 1.020.000
--   Pasir Pasang            2 pemasok  Rp 185.000 → Rp 195.000  (5%)
--   Semen Portland 50kg     2 pemasok  Rp  65.000 → Rp  65.500  (<1%, di bawah ambang)
--
-- ── ANGKANYA BATAS ATAS, DAN ITU DINYATAKAN DI PESANNYA
--
-- Selisih harga tertinggi dikali seluruh volume menghasilkan angka yang rapi
-- dan menggoda. Tetapi penghematan itu hanya terjadi kalau SELURUH pesanan
-- bisa dialihkan ke harga terendah, dan itu jarang benar: harga berbeda
-- karena tempo pembayaran, ongkos kirim, siapa yang bisa mengantar hari itu
-- juga, dan siapa yang mau menalangi saat kas sedang seret.
--
-- Otomasi yang menyodorkan Rp 3,2 juta sebagai "potensi hemat" membuat orang
-- mengejar angka yang tak pernah ada, lalu berhenti percaya saat tak
-- tercapai. Kolom hasilnya pun dinamai `selisih_batas_atas`, bukan
-- `potensi_hemat` — nama kolom ikut terbaca orang.
--
-- ── DIBACA DARI PESANAN PEMBELIAN, BUKAN NAMA VENDOR DI CATATAN BIAYA
--
-- `project_expenses.vendor_name` teks bebas: "UD Besi Kuat Mandiri" dan
-- "UD. Besi Kuat" akan terbaca sebagai dua pemasok, dan tiap salah ketik jadi
-- temuan palsu. `purchase_orders.supplier_id` menunjuk baris yang sungguhan.
--
-- ── IZIN DIUKUR: `procurement:supplier:manage` · `procurement:po:manage`
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'pemasok_terpencar', 'Material Sama dari Beberapa Pemasok',
       'Material yang sama dipesan dari beberapa pemasok dengan harga berbeda',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('procurement:supplier:manage'), ('procurement:po:manage')) AS v(izin)
 WHERE r.event_type = 'pemasok_terpencar'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.pemasok_terpencar.persen', '5'::jsonb, 'number', 'otomasi',
       'Selisih harga antar pemasok (persen) yang mulai dipertanyakan. Rendah dengan sengaja.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- BULANAN. Harga pemasok tak berubah tiap minggu, dan pertanyaan "kenapa dua
-- harga?" adalah percakapan negosiasi — bukan tugas harian.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, hari_bulan, aktif)
SELECT c.id, 'pemasok-terpencar', 'bulanan', '09:00', NULL::int, 3, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan,
      hari_bulan = EXCLUDED.hari_bulan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; kunci TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type = 'pemasok_terpencar' AND is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '415 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  FOREACH kunci IN ARRAY ARRAY['procurement:supplier:manage', 'procurement:po:manage'] LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = 'pemasok_terpencar' AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '415 gagal: target % ada % baris, harus %', kunci, n, n_aktif;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = kunci) THEN
      RAISE EXCEPTION '415 gagal: kunci izin % tak ada di tabel permissions', kunci;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.pemasok_terpencar.persen';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '415 gagal: ambang ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'pemasok-terpencar' AND jenis = 'bulanan' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '415 gagal: jadwal bulanan ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '415 OK — 1 jenis notifikasi, 1 ambang, 1 jadwal bulanan untuk % tenant', n_ang;
END $$;
