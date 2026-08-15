-- ============================================================================
-- 406 — AUTOMATION 2.3 (RETENSI TERTAHAN) + 5.12' (AKSI BERISIKO)
-- ============================================================================
--
-- ── 2.3 BUKAN "retensi jatuh tempo", dan itu hasil pengukuran
--
-- Tak ada satu pun kolom tanggal jatuh tempo retensi di seluruh schema. Satu-
-- satunya durasi masa pemeliharaan ada di `serah_terima.masa_pemeliharaan_hari`,
-- tanggal akhirnya sengaja diturunkan saat baca (`akhirMasaPemeliharaan()`),
-- dan tabel itu NOL BARIS.
--
-- Otomasi kalender akan memicu nol selamanya. Yang dibangun versi EKSPOSUR:
-- 7 proyek memicu hari ini, Rp 101.400.000.
--
-- ── 5.12 ASLI mustahil; tanda kutip pada nomornya disengaja
--
-- "Ringkasan akses dokumen sensitif" butuh dokumen dan penanda kerahasiaan.
-- Diukur: `documents` 0 baris, `document_access_logs` 0 baris, dan tak ada
-- satu pun kolom yang menyatakan sebuah dokumen rahasia.
--
-- Yang dibangun semangat yang sama dari `audit_logs` — 61.505 baris, 7.831
-- dalam 24 jam terakhir, tulisan termuda 26 menit sebelum diukur.
--
-- ── Izin: KETIGANYA diukur ke tabel `permissions`
--
--   finance:view:all  dipakai rute Register Retensi yang sudah ada
--   finance:manage    yang mengurus penagihannya
--   audit:view        satu-satunya izin jejak audit yang ada
--                     (`security:*` dan `keamanan:*` TIDAK ADA)
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.jenis, v.label, v.keterangan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('retensi_tertahan', 'Retensi Tertahan Belum Diurus',
     'Uang retensi pada proyek yang sudah lewat tanggal selesai dan belum ada serah terima'),
    ('audit_aksi_berisiko', 'Ringkasan Aksi Berisiko',
     'Perubahan izin, penghapusan berklaster, dan lonjakan aktivitas 24 jam terakhir')
  ) AS v(jenis, label, keterangan)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('finance:view:all'), ('finance:manage')) AS v(izin)
 WHERE r.event_type = 'retensi_tertahan'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

-- Hanya SATU izin untuk audit: `audit:view`. Diukur — tak ada `security:*`
-- maupun `keamanan:*` di tabel permissions, dan mengarangnya berarti kunci
-- hantu yang menolak semua orang tanpa gejala.
INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'audit:view'
  FROM notification_rules r
 WHERE r.event_type = 'audit_aksi_berisiko'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'audit:view');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.key, v.value::jsonb, 'number', 'otomasi', v.keterangan
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.retensi_tertahan.hari', '30',
     'Hari sesudah proyek selesai sebelum retensi tertahan ditegur.'),
    ('otomasi.audit_ledakan.per_jam', '300',
     'Aksi per pengguna per jam yang dianggap ledakan.'),
    ('otomasi.audit_hapus.klaster', '20',
     'Jumlah penghapusan sepihak sebelum ditandai.')
  ) AS v(key, value, keterangan)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- `audit-aksi-berisiko` HARIAN — ia meringkas 24 jam, jadi mingguan akan
-- melewatkan enam per tujuh kejadiannya. `retensi-tertahan` mingguan: retensi
-- bergerak dalam hitungan bulan.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, v.tugas, v.jenis, v.jam, v.hari_pekan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('audit-aksi-berisiko', 'harian',   '07:50', NULL),
    ('retensi-tertahan',    'mingguan', '12:20', 1)
  ) AS v(tugas, jenis, jam, hari_pekan)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; tipe TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type IN ('retensi_tertahan','audit_aksi_berisiko') AND is_active;
  IF n <> n_aktif * 2 THEN
    RAISE EXCEPTION '406 gagal: % aturan aktif, harus %', n, n_aktif * 2;
  END IF;

  -- retensi 2 izin + audit 1 izin = 3 target per perusahaan aktif.
  SELECT count(*) INTO n FROM notification_rule_targets t
    JOIN notification_rules r ON r.id = t.rule_id
   WHERE r.event_type IN ('retensi_tertahan','audit_aksi_berisiko');
  IF n <> n_aktif * 3 THEN
    RAISE EXCEPTION '406 gagal: % target, harus %', n, n_aktif * 3;
  END IF;

  SELECT count(*) INTO n FROM company_settings
   WHERE key IN ('otomasi.retensi_tertahan.hari','otomasi.audit_ledakan.per_jam',
                 'otomasi.audit_hapus.klaster');
  IF n <> n_aktif * 3 THEN
    RAISE EXCEPTION '406 gagal: % baris ambang, harus %', n, n_aktif * 3;
  END IF;

  SELECT string_agg(DISTINCT value_type, ', ') INTO tipe FROM company_settings
   WHERE key IN ('otomasi.retensi_tertahan.hari','otomasi.audit_ledakan.per_jam',
                 'otomasi.audit_hapus.klaster');
  IF tipe IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '406 gagal: value_type = "%", harus "number"', tipe;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas IN ('retensi-tertahan','audit-aksi-berisiko') AND aktif;
  IF n <> n_ang * 2 THEN
    RAISE EXCEPTION '406 gagal: % tugas terjadwal, harus %', n, n_ang * 2;
  END IF;
END $$;
