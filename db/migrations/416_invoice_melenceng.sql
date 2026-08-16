-- ============================================================================
-- 416 — INVOICE MELENCENG DARI BUKU PEMBAYARAN
-- ============================================================================
--
-- TANPA nomor katalog, dan itu DIPERIKSA bukan diasumsikan: kandidat terdekat
-- 2.1 *Auto Bank Reconciliation* menuntut integrasi rekening koran bank yang
-- belum ada. Yang ini rekonsiliasi INTERNAL — kolom ringkasan `invoices`
-- lawan baris `payments` yang sesungguhnya.
--
-- ── Yang memicu HARI INI, diukur 2026-08-16
--
--   INV/PRL/2026/016  status `partial`
--                     invoices.amount_paid    Rp 19.200.000
--                     jumlah baris payments   Rp          0
--
-- Rp 19,2 juta tercatat sudah diterima tanpa satu pun bukti penerimaan.
--
-- ── KENAPA INI TAK TERLIHAT DARI LAYAR MANA PUN
--
-- Pemeriksaan `total_amount = amount_paid + amount_due` LULUS SEMPURNA di
-- seluruh 26 invoice. Invoice itu konsisten dengan dirinya sendiri; yang tak
-- konsisten hubungannya dengan buku pembayaran. Tak ada pemeriksaan satu-tabel
-- yang bisa melihatnya.
--
-- Bentuknya sama persis dengan temuan penyusutan (10.8, migrasi 408): angka
-- yang sudah terlihat benar di satu layar dan tak pernah sampai ke tempat yang
-- seharusnya membuktikannya.
--
-- ── AMBANGNYA HAMPIR NOL, DAN ITU DISENGAJA
--
-- Rp 1 — bukan ambang kewajaran melainkan pengaman terhadap pembulatan. Uang
-- yang diakui masuk tanpa bukti penerimaan tak punya "batas wajar".
--
-- ── IZIN DIUKUR: `finance:manage` · `finance:invoice:pay`
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('invoice_ringkasan_melenceng', 'Invoice Melenceng dari Buku Pembayaran',
     'Angka sudah-dibayar di invoice tak cocok dengan jumlah catatan pembayarannya'),
    ('invoice_status_melenceng',    'Status Invoice Tak Sejalan dengan Pembayaran',
     'Status invoice bertentangan dengan uang yang benar-benar tercatat masuk')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('invoice_ringkasan_melenceng', 'finance:manage'),
    -- Status invoice juga urusan penagihan: merekalah yang berhenti mengejar
    -- saat sesuatu ditandai lunas.
    ('invoice_status_melenceng',    'finance:manage'),
    ('invoice_status_melenceng',    'finance:invoice:pay')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.invoice_melenceng.rupiah', '1'::jsonb, 'number', 'otomasi',
       'Selisih rupiah minimum antara ringkasan invoice dan buku pembayaran. Hampir nol dengan sengaja.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- HARIAN. Selisih yang baru ketahuan sebulan kemudian sudah terlanjur masuk
-- laporan bulanan, dan mengoreksinya menuntut jurnal koreksi — pekerjaan yang
-- jauh lebih mahal daripada memperbaiki satu baris pada hari ia salah.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'invoice-ringkasan-melenceng', 'harian', '06:05', NULL::int, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; tipe TEXT; kunci TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  FOREACH tipe IN ARRAY ARRAY['invoice_ringkasan_melenceng', 'invoice_status_melenceng'] LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '416 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  FOR tipe, kunci IN
    SELECT * FROM (VALUES
      ('invoice_ringkasan_melenceng', 'finance:manage'),
      ('invoice_status_melenceng',    'finance:manage'),
      ('invoice_status_melenceng',    'finance:invoice:pay')
    ) AS v(t, i)
  LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '416 gagal: target %->% ada % baris, harus %',
        tipe, kunci, n, n_aktif;
    END IF;
  END LOOP;

  FOREACH kunci IN ARRAY ARRAY['finance:manage', 'finance:invoice:pay'] LOOP
    IF NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = kunci) THEN
      RAISE EXCEPTION '416 gagal: kunci izin % tak ada di tabel permissions', kunci;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.invoice_melenceng.rupiah';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '416 gagal: ambang ada % baris, harus %', n, n_aktif;
  END IF;

  /*
    Ambangnya WAJIB kecil.

    Dilonggarkan sampai jutaan, selisih yang justru paling penting — uang
    diakui masuk tanpa bukti — akan lolos diam-diam. Ini bukan ambang
    kewajaran melainkan pengaman pembulatan.
  */
  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.invoice_melenceng.rupiah' AND (value #>> '{}')::numeric > 100000;
  IF n > 0 THEN
    RAISE EXCEPTION '416 gagal: % tenant memasang ambang selisih di atas Rp 100.000, '
      'selisih besar justru akan lolos diam-diam', n;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'invoice-ringkasan-melenceng' AND jenis = 'harian' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '416 gagal: jadwal harian ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '416 OK — 2 jenis notifikasi, 1 ambang, 1 jadwal harian untuk % tenant', n_ang;
END $$;
