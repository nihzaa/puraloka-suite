-- ============================================================================
-- 407 — KONTRAK PAYUNG SEGERA HABIS
-- ============================================================================
--
-- Kontrak payung yang habis membuat pemesanan di bawahnya berhenti bisa
-- dibuat — dan itu ketahuan saat seseorang mencoba memesan, bukan sebelumnya.
-- Terukur: BO-2026-003 habis dalam 12 hari.
--
-- ── TANPA nomor katalog, dan itu disengaja
--
-- Kandidat terdekat 7.10 "Contract Renewal Reminder" berbunyi *"peluang repeat
-- business dari klien existing"* — itu kontrak KLIEN. Yang ini kontrak PEMASOK
-- (`kontrak_payung.supplier_id`). Menempelkan nomornya akan membuat katalog
-- mengklaim sesuatu yang tak dikerjakan.
--
-- ── Izin DIUKUR
--
--   procurement:po:manage        yang membuat pesanan di bawah kontrak ini
--   procurement:supplier:manage  yang menegosiasikan perpanjangannya
--
-- Keduanya diverifikasi ada di tabel `permissions`. Sepuluh kali dalam sesi
-- ini nama ditebak dan salah; yang ini diukur lebih dulu.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'kontrak_payung_habis', 'Kontrak Payung Segera Habis',
       'Kontrak payung pemasok yang mendekati atau melewati akhir masa berlaku', true
  FROM companies c
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('procurement:po:manage'), ('procurement:supplier:manage')) AS v(izin)
 WHERE r.event_type = 'kontrak_payung_habis'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

-- 45 hari — lebih panjang daripada dokumen lain karena memperbarui kontrak
-- payung menuntut negosiasi ulang dengan pemasok, bukan sekadar memperpanjang
-- berkas.
INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.kontrak_payung.hari', '45'::jsonb, 'number', 'otomasi',
       'Hari sebelum kontrak payung habis mulai diperingatkan.'
  FROM companies c
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'kontrak-payung-habis', 'mingguan', '12:40', 1, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; tipe TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type = 'kontrak_payung_habis' AND is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '407 gagal: % aturan aktif, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM notification_rule_targets t
    JOIN notification_rules r ON r.id = t.rule_id
   WHERE r.event_type = 'kontrak_payung_habis';
  IF n <> n_aktif * 2 THEN
    RAISE EXCEPTION '407 gagal: % target, harus %', n, n_aktif * 2;
  END IF;

  SELECT count(*) INTO n FROM company_settings WHERE key = 'otomasi.kontrak_payung.hari';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '407 gagal: % baris ambang, harus %', n, n_aktif;
  END IF;

  SELECT string_agg(DISTINCT value_type, ', ') INTO tipe
    FROM company_settings WHERE key = 'otomasi.kontrak_payung.hari';
  IF tipe IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '407 gagal: value_type = "%", harus "number"', tipe;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'kontrak-payung-habis' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '407 gagal: % tugas terjadwal, harus %', n, n_ang;
  END IF;
END $$;
