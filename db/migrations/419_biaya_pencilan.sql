-- ============================================================================
-- 419 - PENGELUARAN PENCILAN (2.13)
-- ============================================================================
--
-- ── SATU SINYAL YANG DIUKUR LALU DITOLAK
--
-- Kandidat pertama terlihat menjanjikan: `gl.entry_voided` 424 kali lawan
-- `gl.entry_created` 3.387. Pembatalan jurnal massal terdengar persis seperti
-- anomali keuangan.
--
-- Diukur lebih jauh: tersebar di 101 JAM BERBEDA, oleh satu pengguna,
-- sementara `journal_entries` yang tersisa cuma 19. Itu aktivitas
-- pengembangan yang berulang, bukan pembatalan mencurigakan - dan otomasi
-- yang menandainya akan berbunyi tiap hari sampai orang mematikannya.
--
-- Kedua kalinya di repo ini: 5.12' menolak "di luar jam kerja" karena 77%
-- jejak memenuhinya. Sinyal yang terdengar paling nyaring sering yang paling
-- harus diukur dua kali.
--
-- ── Yang memicu HARI INI, diukur 2026-08-16
--
--   Keramik 60x60 40 dus   Rp 6.880.000   z = 2,53   (rata proyek Rp 2.867.500)
--   Keramik 60x60 40 dus   Rp 6.880.000   z = 2,08   (rata proyek Rp 3.556.538)
--
-- ── PEMBANDINGNYA PROYEK ITU SENDIRI
--
-- Rata-rata seluruh perusahaan tak memisahkan apa pun: proyek gudang Rp 380
-- juta dan renovasi dapur Rp 90 juta memang berbelanja pada skala berbeda.
-- Pola yang sama dengan 6.4 (upah menyimpang).
--
-- ── PASANGAN KEMBAR DIKELUARKAN SEBELUM SEBARAN DIHITUNG
--
-- Nota yang tercatat dua kali membuat nominalnya muncul dua kali, dan itu
-- MENGGESER rata-rata serta simpangan bakunya. Membuangnya sesudah menghitung
-- berarti sebarannya sudah tercemar oleh baris yang seharusnya tak dihitung.
-- Penanganannya diserahkan ke 2.7 `biaya-kembar`, yang punya penjelasan tepat.
--
-- ── IZIN DIUKUR: `finance:manage`
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'biaya_pencilan', 'Pengeluaran Jauh di Atas Kebiasaan Proyeknya',
       'Belanja yang nominalnya menyimpang jauh dari sebaran proyek itu sendiri',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'finance:manage'
  FROM notification_rules r
 WHERE r.event_type = 'biaya_pencilan'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'finance:manage');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.biaya_pencilan.sigma', '2',
     'Simpangan baku dari kebiasaan proyek sebelum pengeluaran ditandai.'),
    ('otomasi.biaya_pencilan.minimum', '8',
     'Jumlah pengeluaran minimum sebelum sebaran proyek bisa dipakai menilai.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- MINGGUAN. Pencilan tak muncul tiap jam, dan pertanyaannya ("sudah masuk
-- anggaran belum?") adalah percakapan, bukan tugas harian.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'biaya-pencilan', 'mingguan', '07:45', 1, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; kunci TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type = 'biaya_pencilan' AND is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '419 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM notification_rule_targets t
    JOIN notification_rules r ON r.id = t.rule_id
   WHERE r.event_type = 'biaya_pencilan' AND t.permission_key = 'finance:manage';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '419 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = 'finance:manage') THEN
    RAISE EXCEPTION '419 gagal: kunci izin finance:manage tak ada';
  END IF;

  FOREACH kunci IN ARRAY ARRAY['otomasi.biaya_pencilan.sigma',
                               'otomasi.biaya_pencilan.minimum'] LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '419 gagal: ambang % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  -- Riwayat minimum WAJIB di atas 2. Dengan dua titik, simpangan bakunya
  -- selalu setengah selisihnya sendiri, jadi tiap pasangan menghasilkan
  -- z = 1 tepat dan tak satu pun pernah jadi pencilan.
  SELECT count(*) INTO n FROM company_settings
   WHERE key = 'otomasi.biaya_pencilan.minimum' AND (value #>> '{}')::numeric < 3;
  IF n > 0 THEN
    RAISE EXCEPTION '419 gagal: % tenant memasang riwayat minimum di bawah 3', n;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas WHERE tugas = 'biaya-pencilan' AND aktif;
  IF n <> n_ang THEN
    RAISE EXCEPTION '419 gagal: jadwal ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '419 OK - 1 jenis notifikasi, 2 ambang, 1 jadwal untuk % tenant', n_ang;
END $$;
