-- ============================================================================
-- 404 — AUTOMATION 9.1: DOKUMEN KEPATUHAN & IZIN PROYEK
-- ============================================================================
--
-- Dua jenis notifikasi, karena tindakannya berbeda:
--
--   kepatuhan_dokumen  → dokumen legalitas PIHAK (supplier/subkon) diperpanjang
--   izin_proyek_habis  → izin PROYEK; pekerjaannya berhenti bila `menghalangi_mulai`
--
-- Dedup harian bekerja per (jenis, record) — satu jenis untuk keduanya membuat
-- salah satunya tertahan keliru di hari yang sama. Pelajaran 9.2.
--
-- ── Penerimanya, dan keempat kunci DIUKUR
--
--   kepatuhan:view · kepatuhan:manage  → yang mengurus dokumen pihak ketiga
--   izin:view      · izin:manage       → yang mengurus perizinan proyek
--
-- Keempatnya diverifikasi ada di tabel `permissions` sebelum ditulis. Ini
-- ketujuh kalinya dalam sesi ini nama diukur alih-alih ditebak — enam tebakan
-- sebelumnya salah, dan dua di antaranya baru ketahuan saat dijalankan.
--
-- ── Yang SENGAJA tidak masuk otomasi ini
--
-- `izin_kerja`             4 baris, KEEMPATNYA sudah kedaluwarsa (data seed)
-- `dokumen_prakualifikasi` 7 dari 11 baris tanpa tanggal berlaku
-- `sertifikat_pegawai`     sudah dipegang 6.9
-- `polis_asuransi`         sudah dipegang 5.7/9.2
--
-- Dua yang pertama akan mengirim peringatan usang atau menuduh secara acak;
-- dua yang terakhir akan mengirim pesan kedua untuk kejadian yang sama.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.jenis, v.label, v.keterangan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('kepatuhan_dokumen', 'Dokumen Kepatuhan Habis',
     'Dokumen legalitas pihak ketiga yang kedaluwarsa atau mendekati masa habis'),
    ('izin_proyek_habis', 'Izin Proyek Habis',
     'Izin proyek yang kedaluwarsa atau mendekati masa habis')
  ) AS v(jenis, label, keterangan)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      is_active = true;

-- Target ditulis di migrasi yang SAMA — pelajaran 398, di mana aturan tanpa
-- target menghasilkan rute yang balas 200 dan nol notifikasi, tanpa galat.
INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('kepatuhan:view'), ('kepatuhan:manage')) AS v(izin)
 WHERE r.event_type = 'kepatuhan_dokumen'
   AND NOT EXISTS (
     SELECT 1 FROM notification_rule_targets t
      WHERE t.rule_id = r.id AND t.permission_key = v.izin
   );

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  CROSS JOIN (VALUES ('izin:view'), ('izin:manage')) AS v(izin)
 WHERE r.event_type = 'izin_proyek_habis'
   AND NOT EXISTS (
     SELECT 1 FROM notification_rule_targets t
      WHERE t.rule_id = r.id AND t.permission_key = v.izin
   );

-- ── Ambang ──────────────────────────────────────────────────────────────────
--
-- 60 hari SAMA dengan `AMBANG_SEGERA_HABIS` di `lib/kepatuhan-k3.ts`, yang juga
-- jadi bawaan `nilaiIzin()`. Berbeda berarti layar dan notifikasi menandai
-- "segera habis" pada hari yang berlainan.
--
-- 120 hari batas bawah: diukur, satu dokumen lewat 106 hari dan satu izin
-- proyek lewat 283 hari. Ambang 120 menahan yang pertama tetap ditegur (masih
-- bisa diperpanjang) dan menghentikan yang kedua (sudah jelas ditinggalkan).
INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.key, v.value::jsonb, 'number', 'otomasi', v.keterangan
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.kepatuhan_dokumen.hari', '60',
     'Hari sebelum dokumen kepatuhan/izin habis mulai diperingatkan.'),
    ('otomasi.kepatuhan_lewat.maks_hari', '120',
     'Dokumen/izin yang lewat lebih lama dari ini berhenti ditegur.')
  ) AS v(key, value, keterangan)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- ── Jadwal ──────────────────────────────────────────────────────────────────
--
-- MINGGUAN, melanjutkan sebaran jam migrasi 403 (berakhir 11:00). Masa berlaku
-- dokumen bergerak dalam hitungan bulan; pengingat harian untuk hal yang
-- berubah bulanan adalah cara tercepat membuat orang mematikannya.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'kepatuhan-dokumen', 'mingguan', '11:20', 1, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

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
   WHERE event_type IN ('kepatuhan_dokumen', 'izin_proyek_habis') AND is_active;
  IF n_aturan <> n_aktif * 2 THEN
    RAISE EXCEPTION '404 gagal: % aturan aktif, harus %', n_aturan, n_aktif * 2;
  END IF;

  -- 2 jenis × 2 izin = 4 target per perusahaan aktif.
  SELECT count(*) INTO n_target
    FROM notification_rule_targets t
    JOIN notification_rules r ON r.id = t.rule_id
   WHERE r.event_type IN ('kepatuhan_dokumen', 'izin_proyek_habis');
  IF n_target <> n_aktif * 4 THEN
    RAISE EXCEPTION '404 gagal: % target, harus %', n_target, n_aktif * 4;
  END IF;

  SELECT count(*) INTO n_ambang FROM company_settings
   WHERE key IN ('otomasi.kepatuhan_dokumen.hari', 'otomasi.kepatuhan_lewat.maks_hari');
  IF n_ambang <> n_aktif * 2 THEN
    RAISE EXCEPTION '404 gagal: % baris ambang, harus %', n_ambang, n_aktif * 2;
  END IF;

  SELECT string_agg(DISTINCT value_type, ', ') INTO tipe
    FROM company_settings
   WHERE key IN ('otomasi.kepatuhan_dokumen.hari', 'otomasi.kepatuhan_lewat.maks_hari');
  IF tipe IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION '404 gagal: value_type = "%", harus "number"', tipe;
  END IF;

  SELECT count(*) INTO n_jadwal FROM jadwal_tugas
   WHERE tugas = 'kepatuhan-dokumen' AND aktif;
  IF n_jadwal <> n_beranggota THEN
    RAISE EXCEPTION '404 gagal: % tugas terjadwal, harus %', n_jadwal, n_beranggota;
  END IF;
END $$;
