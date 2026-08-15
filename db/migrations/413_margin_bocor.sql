-- ============================================================================
-- 413 — MARGIN BOCOR (2.5)
-- ============================================================================
--
-- ── Yang memicu HARI INI, diukur 2026-08-16 dari 16 proyek
--
--   proyek_tanpa_rab             13 proyek — TEMUAN TERBESAR, dan ia bukan
--                                kebocoran melainkan ketiadaan alat ukur
--   margin_rab_lampaui_kontrak    2 proyek:
--                                  Rumah Bu Sari  kontrak 1,07 M · RAB 3,74 M
--                                  Rumah Pak Andi kontrak  285 jt · RAB 1,30 M
--   margin_biaya_lampaui_rab      1 proyek
--
-- ── PROYEK TANPA RAB BUKAN PROYEK YANG MARGINNYA AMAN
--
-- Ia proyek yang marginnya tak diketahui siapa pun. Otomasi yang hanya
-- membandingkan biaya dengan RAB akan melaporkan ketiga belasnya sehat
-- selamanya — dan laporan itu terlihat persis seperti kabar baik.
--
-- Dikirim sebagai SATU ringkasan, bukan 13 notifikasi: pekerjaannya tunggal
-- (duduk sekali dan menyusun RAB), dan 13 pesan untuk satu pekerjaan hanya
-- jadi kebisingan.
--
-- ── RAB > KONTRAK: PESANNYA TAK MENUDUH SATU ANGKA
--
-- Rencana biaya lebih besar daripada uang yang akan diterima berarti
-- proyeknya direncanakan rugi. Itu jarang benar-benar terjadi; yang lebih
-- lazim salah satu angkanya keliru — RAB tersalin dari proyek lain, atau
-- nilai kontrak belum diperbarui sesudah addendum.
--
-- Otomasi yang menebak mana yang salah akan menyuruh orang memperbaiki angka
-- yang benar. Pesannya menyatakan keduanya sebagai kemungkinan.
--
-- ── IZIN DIUKUR: `finance:manage` · `projects:edit` · `cecep:estimate:manage`
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('margin_rab_lampaui_kontrak', 'Rencana Biaya Melampaui Nilai Kontrak',
     'RAB lebih besar daripada nilai kontrak, salah satu angkanya kemungkinan keliru'),
    ('margin_biaya_lampaui_rab',   'Biaya Nyata Mendekati atau Melampaui RAB',
     'Biaya yang sudah disetujui menyentuh batas anggaran proyek'),
    ('proyek_tanpa_rab',           'Proyek Berjalan Tanpa RAB',
     'Proyek bernilai kontrak yang belum punya satu pun baris RAB')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('margin_rab_lampaui_kontrak', 'finance:manage'),
    ('margin_rab_lampaui_kontrak', 'projects:edit'),
    ('margin_biaya_lampaui_rab',   'finance:manage'),
    ('margin_biaya_lampaui_rab',   'projects:edit'),
    -- Menyusun RAB pekerjaan estimasi, bukan pekerjaan keuangan.
    ('proyek_tanpa_rab',           'cecep:estimate:manage')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.margin_bocor.persen', '85'::jsonb, 'number', 'otomasi',
       'Persen serapan RAB oleh biaya nyata yang mulai diperingatkan. Di bawah 100 dengan sengaja.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'margin-bocor', 'mingguan', '08:15', 1, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; tipe TEXT; kunci TEXT;
  TIPE_BARU TEXT[] := ARRAY[
    'margin_rab_lampaui_kontrak', 'margin_biaya_lampaui_rab', 'proyek_tanpa_rab'];
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  FOREACH tipe IN ARRAY TIPE_BARU LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '413 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  FOR tipe, kunci IN
    SELECT * FROM (VALUES
      ('margin_rab_lampaui_kontrak', 'finance:manage'),
      ('margin_rab_lampaui_kontrak', 'projects:edit'),
      ('margin_biaya_lampaui_rab',   'finance:manage'),
      ('margin_biaya_lampaui_rab',   'projects:edit'),
      ('proyek_tanpa_rab',           'cecep:estimate:manage')
    ) AS v(t, i)
  LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '413 gagal: target %->% ada % baris, harus %',
        tipe, kunci, n, n_aktif;
    END IF;
  END LOOP;

  SELECT count(*) INTO n
    FROM (VALUES ('finance:manage'), ('projects:edit'),
                 ('cecep:estimate:manage')) AS v(k)
   WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.k);
  IF n > 0 THEN
    RAISE EXCEPTION '413 gagal: % kunci izin tak ada di tabel permissions', n;
  END IF;

  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.margin_bocor.persen';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '413 gagal: ambang margin ada % baris, harus %', n, n_aktif;
  END IF;

  /*
    Ambangnya WAJIB di bawah 100.

    Peringatan yang baru datang saat anggaran sudah habis tak bisa
    ditindaklanjuti siapa pun — pekerjaannya sudah terlanjur berjalan dan
    uangnya sudah keluar. Yang masih bisa ditindaklanjuti 15% terakhir.
  */
  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.margin_bocor.persen' AND (value #>> '{}')::numeric >= 100;
  IF n > 0 THEN
    RAISE EXCEPTION '413 gagal: % tenant memasang ambang margin 100 atau lebih, peringatannya baru datang saat anggaran sudah habis', n;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas WHERE tugas = 'margin-bocor' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '413 gagal: jadwal margin-bocor ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '413 OK — 3 jenis notifikasi, 1 ambang, 1 jadwal untuk % tenant beranggota', n_ang;
END $$;
