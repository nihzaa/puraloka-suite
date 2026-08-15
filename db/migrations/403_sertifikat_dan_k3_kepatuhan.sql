-- ============================================================================
-- 403 — AUTOMATION 6.9 (SERTIFIKAT PEGAWAI) + 9.8 (KEPATUHAN K3)
-- ============================================================================
--
-- Dua otomasi, EMPAT jenis notifikasi. Bukan empat karena rapi — karena dedup
-- harian bekerja per (jenis, record), dan menggabungkan yang tindakannya
-- berbeda membuat sebagian tertahan keliru pada hari yang sama:
--
--   sertifikat_berakhir            → perpanjang dokumen orangnya
--   k3_temuan_berat_menggantung    → tutup temuannya hari ini
--   k3_temuan_berulang             → selidiki kenapa perbaikannya tak menahan
--   k3_induksi_kedaluwarsa         → induksi ulang pekerjanya
--
-- Pelajaran 9.2, diterapkan sebelum cacatnya sempat terjadi.
--
-- ── Penerimanya, dan kenapa berbeda
--
-- Sertifikat melekat pada ORANG, bukan proyek — targetnya izin SDM, dan
-- notifikasinya sengaja tak membawa `project_id` (lihat rutenya). Temuan dan
-- induksi K3 melekat pada PROYEK, targetnya izin K3.
--
-- Keempat kunci DIUKUR ke tabel `permissions` sebelum ditulis:
--
--   sdm:sertifikat:view · sdm:sertifikat:manage
--   k3:inspeksi:view    · k3:insiden:view
--
-- Tak ada `k3:temuan:*` maupun `k3:induksi:view` di basis — keduanya sempat
-- jadi tebakan pertama saya. Ini kelima kalinya dalam sesi ini kunci izin
-- nyaris dikarang; kali ini diukur lebih dulu.
--
-- ── `WHERE c.is_active` — pelajaran migrasi 402
--
-- Empat migrasi sebelumnya memakai `FROM companies` tanpa syarat dan menulis
-- 9.164 baris untuk 597 tenant sisa test yang sudah nonaktif. Dijaga
-- `audit-migrasi-pertenant-aktif.mjs` sejak hari ini.
-- ============================================================================

-- ── Aturan notifikasi ───────────────────────────────────────────────────────
INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.jenis, v.label, v.keterangan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('sertifikat_berakhir', 'Sertifikat Pegawai Berakhir',
     'Sertifikat keahlian pegawai yang mendekati atau melewati masa berlaku'),
    ('k3_temuan_berat_menggantung', 'Temuan K3 Berat Belum Ditutup',
     'Temuan K3 tingkat berat yang lewat tenggat dan masih terbuka'),
    ('k3_temuan_berulang', 'Temuan K3 Berulang',
     'Kategori temuan yang muncul lagi — perbaikan sebelumnya tak menahan'),
    ('k3_induksi_kedaluwarsa', 'Induksi K3 Belum Lengkap',
     'Pekerja aktif yang induksinya kedaluwarsa atau belum pernah diinduksi')
  ) AS v(jenis, label, keterangan)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      is_active = true;

-- ── Penerima: SDM untuk sertifikat ──────────────────────────────────────────
INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('sdm:sertifikat:view'), ('sdm:sertifikat:manage')) AS v(izin)
 WHERE r.event_type = 'sertifikat_berakhir'
   AND NOT EXISTS (
     SELECT 1 FROM notification_rule_targets t
      WHERE t.rule_id = r.id AND t.permission_key = v.izin
   );

-- ── Penerima: K3 untuk ketiga jenis temuan/induksi ──────────────────────────
--
-- `k3:inspeksi:view` — temuan lahir DARI inspeksi, dan yang boleh melihat
-- inspeksi adalah yang mengurus temuannya.
-- `k3:insiden:view` — temuan berat yang menggantung adalah insiden yang belum
-- terjadi; yang memantau insiden perlu melihatnya lebih dulu.
INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('k3:inspeksi:view'), ('k3:insiden:view')) AS v(izin)
 WHERE r.event_type IN ('k3_temuan_berat_menggantung', 'k3_temuan_berulang',
                        'k3_induksi_kedaluwarsa')
   AND NOT EXISTS (
     SELECT 1 FROM notification_rule_targets t
      WHERE t.rule_id = r.id AND t.permission_key = v.izin
   );

-- ── Ambang ──────────────────────────────────────────────────────────────────
--
-- 60 hari SAMA dengan bawaan `nilaiSertifikat()` di `lib/kompetensi-sdm.ts`.
-- Kalau berbeda, layar Kompetensi SDM menandai "akan habis" pada hari yang
-- berbeda dari hari notifikasinya dikirim.
--
-- 90 hari batas bawah: diukur, ada sertifikat kedaluwarsa sejak 2025-05-31 —
-- empat belas bulan. Dedup harian menahan kembar DALAM satu hari, bukan lintas
-- hari; tanpa batas ini otomasinya menagih dokumen yang sama tiap pagi
-- selamanya.
INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.key, v.value::jsonb, 'number', 'otomasi', v.keterangan
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.sertifikat_berakhir.hari', '60',
     'Hari sebelum sertifikat pegawai berakhir mulai diperingatkan.'),
    ('otomasi.sertifikat_lewat.maks_hari', '90',
     'Sertifikat yang lewat lebih lama dari ini berhenti ditegur.')
  ) AS v(key, value, keterangan)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- ── Jadwal ──────────────────────────────────────────────────────────────────
--
-- Jam disebar melanjutkan migrasi 401 (yang berakhir di 10:20). Keduanya
-- MINGGUAN, bukan harian:
--
--   sertifikat  → masa berlaku bergerak dalam hitungan bulan; pengingat harian
--                 untuk hal yang berubah bulanan adalah cara tercepat membuat
--                 orang mematikan notifikasinya
--   k3-kepatuhan → temuan ditutup dalam hitungan hari-minggu, dan rekapnya
--                  per proyek. Harian akan mengulang proyek yang sama sebelum
--                  siapa pun sempat menutup satu temuan pun
--
-- `EXISTS (company_members)` — bukan `is_active` saja. Pelajaran migrasi 401:
-- akun layanan ditolak 403 pada tenant tanpa anggota, dan 2.018 tugas berakhir
-- gagal tiap denyut karenanya.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, v.tugas, v.jenis, v.jam, v.hari_pekan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('sertifikat-berakhir', 'mingguan', '10:40', 1),
    ('k3-kepatuhan',        'mingguan', '11:00', 1)
  ) AS v(tugas, jenis, jam, hari_pekan)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis,
      jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan,
      aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif      INT;
  n_beranggota INT;
  n_aturan     INT;
  n_target     INT;
  n_ambang     INT;
  n_jadwal     INT;
  tipe         TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_beranggota
    FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n_aturan FROM notification_rules
   WHERE event_type IN ('sertifikat_berakhir', 'k3_temuan_berat_menggantung',
                        'k3_temuan_berulang', 'k3_induksi_kedaluwarsa')
     AND is_active;
  IF n_aturan <> n_aktif * 4 THEN
    RAISE EXCEPTION '403 gagal: % aturan aktif, harus % (4 per perusahaan aktif)',
      n_aturan, n_aktif * 4;
  END IF;

  /*
    Aturan TANPA target = otomasi yang balas 200 dan nol notifikasi, tanpa
    galat. Cacat itu lolos di migrasi 398 dan hanya tertangkap test.

    1 jenis × 2 izin SDM + 3 jenis × 2 izin K3 = 8 target per perusahaan.
  */
  SELECT count(*) INTO n_target
    FROM notification_rule_targets t
    JOIN notification_rules r ON r.id = t.rule_id
   WHERE r.event_type IN ('sertifikat_berakhir', 'k3_temuan_berat_menggantung',
                          'k3_temuan_berulang', 'k3_induksi_kedaluwarsa');
  IF n_target <> n_aktif * 8 THEN
    RAISE EXCEPTION '403 gagal: % target, harus % (8 per perusahaan aktif)',
      n_target, n_aktif * 8;
  END IF;

  SELECT count(*) INTO n_ambang FROM company_settings
   WHERE key IN ('otomasi.sertifikat_berakhir.hari', 'otomasi.sertifikat_lewat.maks_hari');
  IF n_ambang <> n_aktif * 2 THEN
    RAISE EXCEPTION '403 gagal: % baris ambang, harus %', n_ambang, n_aktif * 2;
  END IF;

  SELECT string_agg(DISTINCT value_type, ', ') INTO tipe
    FROM company_settings
   WHERE key IN ('otomasi.sertifikat_berakhir.hari', 'otomasi.sertifikat_lewat.maks_hari');
  IF tipe IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '403 gagal: value_type ambang = "%", harus "number"', tipe;
  END IF;

  SELECT count(*) INTO n_jadwal FROM jadwal_tugas
   WHERE tugas IN ('sertifikat-berakhir', 'k3-kepatuhan') AND aktif;
  IF n_jadwal <> n_beranggota * 2 THEN
    RAISE EXCEPTION '403 gagal: % tugas terjadwal, harus % (2 per perusahaan beranggota)',
      n_jadwal, n_beranggota * 2;
  END IF;

  -- Tak boleh ada tugas terjadwal pada perusahaan tanpa anggota — akun layanan
  -- akan ditolak 403 tiap denyut. Pelajaran migrasi 401.
  SELECT count(*) INTO n_jadwal
    FROM jadwal_tugas t
   WHERE t.tugas IN ('sertifikat-berakhir', 'k3-kepatuhan')
     AND NOT EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = t.company_id);
  IF n_jadwal > 0 THEN
    RAISE EXCEPTION '403 gagal: % tugas pada perusahaan tanpa anggota', n_jadwal;
  END IF;
END $$;
