-- ============================================================================
-- 421 - PESANAN DI LUAR KONTRAK PAYUNG (4.13)
-- ============================================================================
--
-- ── Yang memicu HARI INI, diukur 2026-08-16
--
--   po_luar_kontrak        4 pesanan ke pemasok berkontrak AKTIF, dan
--                          `kontrak_payung_id` NULL di keempatnya
--   kuota_payung_menipis   Besi beton ulir D16  100/100 ton  HABIS
--                          Besi beton ulir D13   60/60  ton  HABIS
--                          Semen PCC 40 kg    11.040/12.000  92%
--
-- ── MEMBELI DI LUAR KONTRAK YANG SUDAH DINEGOSIASI SENDIRI
--
-- Pesanan tanpa kontrak berarti salah satu dari dua hal, dan KEDUANYA perlu
-- diketahui:
--
--   · dibeli di harga lain — negosiasinya terbuang
--   · dibeli di harga kontrak tetapi tak tercatat — kuotanya tak berkurang,
--     dan pemasok bisa menagih dua kali atas jatah yang sama
--
-- Kontrak yang masa berlakunya sudah lewat pada TANGGAL PESANAN tak dituntut
-- dipakai. Membandingkannya dengan hari ini akan menuduh pesanan lama yang
-- saat itu memang tak punya kontrak.
--
-- ── 4.3 FRAUD DETECTION DIUKUR DAN TIDAK DIBANGUN
--
-- Pola penipuan pengadaan yang lazim semuanya NOL di basis ini: pesanan
-- dipecah untuk menghindari ambang persetujuan (tak ada ambang yang disetel
-- sama sekali), dan pesanan ganda ke vendor sama pada hari sama (nol
-- pasangan).
--
-- Membangunnya tetap menghasilkan rute yang memicu nol selamanya lalu
-- dilaporkan "deteksi fraud sudah ada" — dan itu LEBIH BERBAHAYA daripada tak
-- punya sama sekali, karena memberi rasa aman yang tak berdasar.
--
-- ── IZIN DIUKUR: `procurement:po:manage` · `procurement:supplier:manage`
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('po_luar_kontrak',      'Pesanan di Luar Kontrak Payung',
     'PO ke pemasok berkontrak aktif yang tak menyebut kontraknya'),
    ('kuota_payung_menipis', 'Kuota Kontrak Payung Menipis',
     'Kuota item kontrak hampir atau sudah habis; pesanan berikutnya tak tercakup')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('po_luar_kontrak',      'procurement:po:manage'),
    -- Kuota habis menuntut NEGOSIASI, bukan koreksi pesanan. Dua meja berbeda.
    ('kuota_payung_menipis', 'procurement:supplier:manage')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.kuota_payung.persen', '80'::jsonb, 'number', 'otomasi',
       'Persen kuota kontrak payung terpakai sebelum diperingatkan. Bukan 100: menambah kuota menuntut negosiasi.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'po-luar-kontrak', 'mingguan', '08:45', 1, true
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

  FOREACH tipe IN ARRAY ARRAY['po_luar_kontrak', 'kuota_payung_menipis'] LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '421 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  FOR tipe, kunci IN
    SELECT * FROM (VALUES
      ('po_luar_kontrak',      'procurement:po:manage'),
      ('kuota_payung_menipis', 'procurement:supplier:manage')
    ) AS v(t, i)
  LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '421 gagal: target %->% ada % baris, harus %',
        tipe, kunci, n, n_aktif;
    END IF;
  END LOOP;

  FOREACH kunci IN ARRAY ARRAY['procurement:po:manage', 'procurement:supplier:manage'] LOOP
    IF NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = kunci) THEN
      RAISE EXCEPTION '421 gagal: kunci izin % tak ada', kunci;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM company_settings WHERE key = 'otomasi.kuota_payung.persen';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '421 gagal: ambang ada % baris, harus %', n, n_aktif;
  END IF;

  -- Ambang kuota WAJIB di bawah 100. Disetel tepat 100, peringatannya baru
  -- datang saat kuotanya HABIS - dan menambah kuota menuntut negosiasi ulang,
  -- yang tak bisa diselesaikan pada hari pesanan berikutnya dibuat.
  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.kuota_payung.persen' AND (value #>> '{}')::numeric >= 100;
  IF n > 0 THEN
    RAISE EXCEPTION '421 gagal: % tenant memasang ambang kuota 100 atau lebih', n;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas WHERE tugas = 'po-luar-kontrak' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '421 gagal: jadwal ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '421 OK - 2 jenis notifikasi, 1 ambang, 1 jadwal untuk % tenant', n_ang;
END $$;
