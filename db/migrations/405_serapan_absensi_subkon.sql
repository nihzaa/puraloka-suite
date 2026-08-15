-- ============================================================================
-- 405 — AUTOMATION 2.9 + 6.3 + 3.6: KETIGA YANG SEMPAT SAYA BATALKAN
-- ============================================================================
--
-- Founder bertanya 2026-08-16: *"kenapa dibatalin? emang gabisa banget
-- dibangun?"*
--
-- Jawabannya: BISA, dan pembatalan saya terlalu absolut. Yang saya temukan
-- bukan kemustahilan teknis melainkan data dev yang tak mewakili — dan untuk
-- 2.9 bahkan alasannya salah sama sekali.
--
-- ── 2.9: alasan pembatalannya SALAH
--
-- Saya menulis: `project_expenses` nol baris sementara Rp 545 juta ada di
-- `kasbons`, jadi otomasi akan melaporkan 0% untuk proyek yang 45%.
--
-- Diukur ulang:
--
--     trg_kasbon_approved_create_expense
--       AFTER UPDATE ... IF NEW.status='approved' AND OLD.status<>'approved'
--       → INSERT INTO project_expenses
--
-- Kasbon yang disetujui MEMANG membuat baris pengeluaran. Tabelnya kosong
-- karena data seed disisipkan LANGSUNG berstatus `approved`, sehingga trigger
-- `AFTER UPDATE` tak pernah menyala. Artefak seed, bukan cacat rancangan.
--
-- Pelajarannya: "tabel sumbernya kosong" bukan alasan yang cukup. Yang harus
-- ditanyakan KENAPA kosong — dan di sini jawabannya membalikkan kesimpulan.
--
-- ── 6.3: dua dari tiga dimensi memang tak bisa, satu bisa dan berguna
--
-- "Jam kerja tak masuk akal" mustahil: tak ada jam masuk/keluar sama sekali,
-- dan CHECK sudah mengunci `porsi_hari` 0–1. "Absen tanpa penugasan" 85% baris
-- — bentuk seed.
--
-- Yang dibangun bentuk KETIGA yang tak diminta katalog dan lebih berguna:
-- lingkup kerja yang absensinya BERHENTI dicatat. Itu peringatan operasional
-- dengan tindakan tunggal (tanyakan mandornya), satu pesan per lingkup.
--
-- ── 3.6: bukan tren, melainkan STATUS
--
-- Tren butuh ≥2 periode; hampir tak ada yang punya. Dan yang tak akan sembuh
-- sendiri: identitas pihak lewat teks bebas `pihak_nama` (3 dari 5 baris
-- ber-`supplier_id` NULL).
--
-- `bolehDipakai` adalah keadaan SATU baris — tak butuh periode kedua, tak
-- butuh identitas stabil, dan terukur ada 2 dari 5 hari ini.
--
-- ── Izin: KETUJUHNYA diukur ke tabel `permissions` sebelum ditulis
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.jenis, v.label, v.keterangan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('serapan_anggaran', 'Serapan Anggaran Tinggi',
     'Belanja proyek mendekati atau melampaui pagunya'),
    ('absensi_berhenti', 'Absensi Berhenti Dicatat',
     'Lingkup kerja yang absensinya berhenti dicatat beberapa hari'),
    ('subkon_tak_layak', 'Subkontraktor Tak Layak Dipakai',
     'Subkontraktor yang menurut evaluasi terakhir tak boleh dipakai')
  ) AS v(jenis, label, keterangan)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      is_active = true;

-- ── Penerima ────────────────────────────────────────────────────────────────
--
--   serapan_anggaran  projects:edit + finance:view    — sama dengan evm_kinerja;
--                     yang bisa mengubah proyek dan yang memantau biaya
--   absensi_berhenti  mandor:view + mandor:wage:create — yang mengurus mandor,
--                     dan yang membuat laporan upah (yang paling dirugikan
--                     kalau absensinya bolong)
--   subkon_tak_layak  kepatuhan:view + procurement:supplier:manage — yang
--                     menilai, dan yang memutuskan mengundang
INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('projects:edit'), ('finance:view')) AS v(izin)
 WHERE r.event_type = 'serapan_anggaran'
   AND NOT EXISTS (
     SELECT 1 FROM notification_rule_targets t
      WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('mandor:view'), ('mandor:wage:create')) AS v(izin)
 WHERE r.event_type = 'absensi_berhenti'
   AND NOT EXISTS (
     SELECT 1 FROM notification_rule_targets t
      WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('kepatuhan:view'), ('procurement:supplier:manage')) AS v(izin)
 WHERE r.event_type = 'subkon_tak_layak'
   AND NOT EXISTS (
     SELECT 1 FROM notification_rule_targets t
      WHERE t.rule_id = r.id AND t.permission_key = v.izin);

-- ── Ambang ──────────────────────────────────────────────────────────────────
--
-- 90% bukan 100%: peringatan yang baru berbunyi saat anggaran SUDAH terlampaui
-- datang pada saat tak ada lagi yang bisa dilakukan.
--
-- 3 hari untuk absensi: cukup melewati satu hari libur tanpa berbunyi palsu.
INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.key, v.value::jsonb, 'number', 'otomasi', v.keterangan
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.serapan_anggaran.persen', '90',
     'Serapan anggaran (%) yang mulai diperingatkan.'),
    ('otomasi.absensi_berhenti.hari', '3',
     'Hari tanpa catatan absensi sebelum lingkup kerja ditegur.')
  ) AS v(key, value, keterangan)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- ── Jadwal ──────────────────────────────────────────────────────────────────
--
-- `absensi-berhenti` HARIAN — absensi memang dicatat harian, dan bolongnya
-- perlu ketahuan sebelum penggajian. Dua lainnya mingguan: serapan anggaran
-- dan evaluasi subkon bergerak dalam hitungan minggu-bulan.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, v.tugas, v.jenis, v.jam, v.hari_pekan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('absensi-berhenti', 'harian',   '06:45', NULL),
    ('serapan-anggaran', 'mingguan', '11:40', 1),
    ('subkon-tak-layak', 'mingguan', '12:00', 1)
  ) AS v(tugas, jenis, jam, hari_pekan)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif      INT;
  n_beranggota INT;
  n            INT;
  tipe         TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_beranggota
    FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type IN ('serapan_anggaran','absensi_berhenti','subkon_tak_layak')
     AND is_active;
  IF n <> n_aktif * 3 THEN
    RAISE EXCEPTION '405 gagal: % aturan aktif, harus %', n, n_aktif * 3;
  END IF;

  -- 3 jenis × 2 izin = 6 target per perusahaan aktif.
  SELECT count(*) INTO n
    FROM notification_rule_targets t
    JOIN notification_rules r ON r.id = t.rule_id
   WHERE r.event_type IN ('serapan_anggaran','absensi_berhenti','subkon_tak_layak');
  IF n <> n_aktif * 6 THEN
    RAISE EXCEPTION '405 gagal: % target, harus %', n, n_aktif * 6;
  END IF;

  SELECT count(*) INTO n FROM company_settings
   WHERE key IN ('otomasi.serapan_anggaran.persen','otomasi.absensi_berhenti.hari');
  IF n <> n_aktif * 2 THEN
    RAISE EXCEPTION '405 gagal: % baris ambang, harus %', n, n_aktif * 2;
  END IF;

  SELECT string_agg(DISTINCT value_type, ', ') INTO tipe
    FROM company_settings
   WHERE key IN ('otomasi.serapan_anggaran.persen','otomasi.absensi_berhenti.hari');
  IF tipe IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '405 gagal: value_type = "%", harus "number"', tipe;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas IN ('absensi-berhenti','serapan-anggaran','subkon-tak-layak') AND aktif;
  IF n <> n_beranggota * 3 THEN
    RAISE EXCEPTION '405 gagal: % tugas terjadwal, harus %', n, n_beranggota * 3;
  END IF;
END $$;
