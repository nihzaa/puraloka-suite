-- ============================================================================
-- 409 — HARGA SATUAN RAB (3.12) · LAPORAN UPAH (6.4) · KONTRAK KLIEN (7.10)
-- ============================================================================
--
-- ── Yang memicu HARI INI, diukur 2026-08-16
--
--   rab_harga_menyimpang    3 item bersatuan ukur: "Pengecatan Tembok
--                           Interior" m² Rp 30.000 lawan Rp 46.000 (1,53×),
--                           "Sumur Bor" m 1,43×, "Pasang bouwplank" m' 1,38×
--   upah_menyimpang         6 laporan berstatus `submitted`; 5 lingkup punya
--                           riwayat ≥3 minggu untuk jadi pembanding
--   kontrak_klien_berakhir  14 proyek berakhir dalam rentang ±180 hari
--
-- ── SATU CATATAN YANG MENENTUKAN BENTUK 3.12
--
-- Angka paling mencolok di basis ini JUSTRU yang salah. Diurutkan menurut
-- rasio harga tertinggi, tiga teratas semuanya bersatuan `ls` (lump sum):
--
--   Air Kerja        Rp    800.000 → Rp 10.000.000   12,50×
--   Listrik kerja    Rp  1.200.000 → Rp 12.000.000   10,00×
--   Kebersihan       Rp  2.000.000 → Rp  5.000.000    2,50×
--
-- Harga lump sum memang menskala dengan besar proyek. Kalau diikutkan, tiga
-- temuan paling nyaring adalah tiga yang paling salah — dan orang yang
-- memeriksanya sekali lalu menemukan ketiganya wajar berhenti memeriksa yang
-- keempat. Rutenya mengeluarkan `ls`, `paket`, `set`, `lot`.
--
-- ── 7.10 PERNAH SENGAJA TIDAK DIKLAIM
--
-- `kontrak-payung-habis` dibangun TANPA nomor katalog karena 7.10 berbunyi
-- "repeat business dari klien existing" — kontrak KLIEN, bukan pemasok.
-- Inilah 7.10 yang sebenarnya. Test penjaga pemisahan itu tetap berlaku.
--
-- ── IZIN DIUKUR
--
--   cecep:estimate:manage   yang menyusun dan menghargai RAB
--   mandor:wage:approve     yang menekan tombol setuju pada laporan upah
--   clients:manage          yang mengurus hubungan klien
--
-- Ketiganya diverifikasi ada di tabel `permissions` lebih dulu. Tidak ada
-- kunci `rab:*` di basis ini — menebaknya akan menghasilkan kunci hantu yang
-- menolak SEMUA orang tanpa satu pun gejala.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('rab_harga_menyimpang',   'Harga Satuan RAB Menyimpang',
     'Pekerjaan sama dihargai berbeda jauh antar proyek'),
    ('upah_menyimpang',        'Laporan Upah Menyimpang',
     'Upah mingguan jauh dari kebiasaan lingkup kerjanya sendiri'),
    ('kontrak_klien_berakhir', 'Kontrak Klien Mendekati Akhir',
     'Peluang pekerjaan berikutnya selagi klien masih sering dihubungi')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('rab_harga_menyimpang',   'cecep:estimate:manage'),
    ('upah_menyimpang',        'mandor:wage:approve'),
    ('kontrak_klien_berakhir', 'clients:manage')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.rab_anomali.rasio', '1.3',
     'Selisih harga satuan antar proyek yang mulai dipertanyakan (kali lipat).'),
    ('otomasi.upah_anomali.rasio', '1.5',
     'Selisih upah mingguan dari kebiasaannya yang mulai diperiksa (kali lipat).'),
    ('otomasi.upah_anomali.riwayat', '3',
     'Minggu riwayat minimum sebelum upah sebuah lingkup bisa dibandingkan.'),
    ('otomasi.kontrak_klien.hari', '60',
     'Jendela hari sebelum/sesudah proyek berakhir untuk menyapa klien.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- Ketiganya MINGGUAN, dan itu keputusan bukan kebetulan.
--
-- Harga RAB yang menyimpang tak berubah dalam sehari; laporan upah menunggu
-- persetujuan berhari-hari; peluang menyapa klien berumur berminggu-minggu.
-- Jadwal harian untuk ketiganya hanya mengirim pesan yang sama tiap pagi
-- sampai orangnya berhenti membaca — dan pada hari sesuatu yang genting
-- datang, ia tak lagi membukanya.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, v.tugas, 'mingguan', v.jam, v.pekan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('rab-harga-menyimpang',   '07:50', 1),
    ('upah-menyimpang',        '06:30', 1),
    ('kontrak-klien-berakhir', '08:05', 1)
  ) AS v(tugas, jam, pekan)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; tipe TEXT; kunci TEXT; t_nama TEXT;
  TIPE_BARU TEXT[] := ARRAY[
    'rab_harga_menyimpang', 'upah_menyimpang', 'kontrak_klien_berakhir'];
  KUNCI_BARU TEXT[] := ARRAY[
    'otomasi.rab_anomali.rasio', 'otomasi.upah_anomali.rasio',
    'otomasi.upah_anomali.riwayat', 'otomasi.kontrak_klien.hari'];
  TUGAS_BARU TEXT[] := ARRAY[
    'rab-harga-menyimpang', 'upah-menyimpang', 'kontrak-klien-berakhir'];
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  FOREACH tipe IN ARRAY TIPE_BARU LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '409 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;
  END LOOP;

  -- BERPASANGAN, bukan dihitung. Migrasi 408 membuktikan kenapa: menghitung
  -- "sedikitnya satu target" LULUS untuk aturan yang separuh targetnya
  -- hilang, dan yang hilang bukan angka melainkan ORANG.
  FOR tipe, kunci IN
    SELECT * FROM (VALUES
      ('rab_harga_menyimpang',   'cecep:estimate:manage'),
      ('upah_menyimpang',        'mandor:wage:approve'),
      ('kontrak_klien_berakhir', 'clients:manage')
    ) AS v(t, i)
  LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '409 gagal: target %→% ada % baris, harus %',
        tipe, kunci, n, n_aktif;
    END IF;
  END LOOP;

  SELECT count(*) INTO n
    FROM (VALUES ('cecep:estimate:manage'), ('mandor:wage:approve'),
                 ('clients:manage')) AS v(k)
   WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.k);
  IF n > 0 THEN
    RAISE EXCEPTION '409 gagal: % kunci izin tak ada di tabel permissions', n;
  END IF;

  FOREACH kunci IN ARRAY KUNCI_BARU LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '409 gagal: ambang % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  -- Ambang pecahan WAJIB tersimpan utuh. `1.3` yang membulat jadi `1` akan
  -- menandai tiap selisih 1% sebagai penyimpangan — tanpa satu pun galat.
  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.rab_anomali.rasio' AND (value #>> '{}')::numeric = 1.3;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '409 gagal: ambang rasio RAB bukan 1.3 di % tenant',
      n_aktif - n;
  END IF;

  FOREACH t_nama IN ARRAY TUGAS_BARU LOOP
    SELECT count(*) INTO n FROM jadwal_tugas j WHERE j.tugas = t_nama AND j.aktif;
    IF n <> n_ang THEN
      RAISE EXCEPTION '409 gagal: jadwal % ada % baris, harus %', t_nama, n, n_ang;
    END IF;
  END LOOP;

  RAISE NOTICE '409 OK — 3 jenis notifikasi, 4 ambang, 3 jadwal untuk % tenant beranggota', n_ang;
END $$;
