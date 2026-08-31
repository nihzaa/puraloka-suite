-- ============================================================================
-- 429 - CELAH PERLINDUNGAN ASURANSI (9.2)
-- ============================================================================
--
-- Dibangun di atas data yang diisi migrasi 428, yang SENGAJA meninggalkan
-- celah supaya automation ini punya sesuatu untuk ditemukan.
--
-- ── TIGA CELAH, DAN YANG KETIGA TAK TERLIHAT OLEH PEMERIKSAAN BIASA
--
-- Pemeriksaan yang lazim ditulis orang: "proyek ini punya polis?" - satu
-- hitungan, satu jawaban. Itu menangkap celah pertama saja.
--
--   1. TAK ADA POLIS         terlihat oleh hitungan apa pun
--   2. POLIS KADALUARSA      terlihat kalau statusnya ikut diperiksa
--   3. PUNYA POLIS AKTIF,    TIDAK terlihat oleh keduanya
--      TAPI BUKAN YANG
--      MENANGGUNG PEKERJAAN
--
-- Celah ketiga paling berbahaya justru karena paling tenang. Proyek dengan TPL
-- saja punya polis AKTIF dan BELUM kadaluarsa; ia muncul sebagai "terasuransi"
-- di daftar mana pun dan lolos audit yang cuma menghitung.
--
-- Tetapi TPL menanggung kerugian PIHAK KETIGA. Kebakaran, longsor, atau banjir
-- yang merusak PEKERJAANNYA SENDIRI tak ditanggung siapa pun - dan itu baru
-- ketahuan saat klaim ditolak.
--
-- ── ANGKANYA SENGAJA TIDAK DITULIS DI SINI
--
-- Migrasi 428 sempat menulis sebarannya sebagai angka mati, dan angkanya basi
-- dalam satu jam karena sesi lain menambah proyek. Koreksinya ada di kepala
-- berkas itu.
--
-- Cara mengukurnya:
--
--   SELECT COUNT(*), SUM(contract_value) FROM projects p
--    WHERE p.is_deleted = false AND p.status = 'active'
--      AND NOT EXISTS (SELECT 1 FROM polis_asuransi a WHERE a.project_id = p.id);
--
-- Atau langsung dari jawaban rutenya: `checked.tanpa_polis`,
-- `checked.tak_menanggung_pekerjaan`, dan seterusnya.
--
-- ── IZIN DIUKUR: `risiko:manage`.
--
--    Bukan `projects:contract` maupun `contract:ld:waive`. Celah asuransi
--    adalah keputusan RISIKO - siapa yang menanggung bila terjadi sesuatu -
--    bukan urusan penyusunan kontrak. Yang ada di tabel hanya empat kunci,
--    dan ini yang paling tepat mejanya.
--
-- ── JADWAL: MINGGUAN.
--
--    Polis berubah dalam hitungan bulan, tetapi proyek BARU lahir kapan saja -
--    dan proyek baru tanpa polis adalah celah sejak hari pertama. Mingguan
--    cukup rapat untuk menangkapnya, cukup jarang untuk tak jadi kebisingan.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'celah_asuransi', 'Celah Perlindungan Asuransi',
       'Proyek aktif tanpa polis, polisnya kadaluarsa, atau jenisnya tak menanggung pekerjaan',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'risiko:manage'
  FROM notification_rules r
 WHERE r.event_type = 'celah_asuransi'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'risiko:manage');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.celah_asuransi.hari', '45'::jsonb, 'number', 'otomasi',
       'Hari sebelum polis CAR berakhir sudah diingatkan. Menerbitkan perpanjangan butuh survei dan persetujuan penanggung.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'celah-asuransi', 'mingguan', '06:50', 1, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; nilai NUMERIC;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type = 'celah_asuransi' AND is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '429 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM notification_rules r
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'celah_asuransi' AND t.permission_key = 'risiko:manage';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '429 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = 'risiko:manage';
  IF n < 1 THEN
    RAISE EXCEPTION '429 gagal: izin risiko:manage tidak ada di permissions';
  END IF;

  SELECT count(*) INTO n FROM company_settings WHERE key = 'otomasi.celah_asuransi.hari';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '429 gagal: setelan ada % baris, harus %', n, n_aktif;
  END IF;

  /*
    Ambang WAJIB 7..180.

    Nilai di bawah 7 tak berguna: menerbitkan perpanjangan polis butuh survei
    lokasi dan persetujuan penanggung, yang jarang selesai dalam seminggu.
    Peringatan yang datang terlambat sama saja dengan tak ada.

    Di atas 180 membuat hampir SETIAP polis tahunan selalu "segera berakhir" -
    peringatan yang selalu menyala kehilangan artinya, dan tiga celah lain yang
    jauh lebih mendesak tenggelam di antaranya.
  */
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.celah_asuransi.hari';
  IF nilai IS NULL OR nilai < 7 OR nilai > 180 THEN
    RAISE EXCEPTION '429 gagal: ambang hari % di luar 7..180', nilai;
  END IF;

  /*
    PRASYARAT DATA - diperiksa di sini, bukan diserahkan ke rutenya.

    Automation ini tak bisa membedakan "semua terlindungi" dari "tabel polisnya
    kosong": keduanya menghasilkan jawaban yang sama dari luar. Migrasi 428
    yang mengisinya; kalau ia belum jalan, kelumpuhannya berhenti DI SINI
    alih-alih hidup diam-diam di produksi.

    Kelumpuhan yang sama dengan `min_stock` nol (migrasi 425) dan peta RAB
    kosong (migrasi 426).
  */
  /*
    ⚠ DIBEDAKAN DUA SEBAB 2026-08-31 — sama persis dengan perbaikan 426.

    `polis_asuransi` kosong bisa berarti:

      (a) ada proyek yang seharusnya berpolis, tetapi seed 428 gagal mengisi
          → kelumpuhan yang cek ini memang ada untuk mencegah;

      (b) basisnya belum punya proyek contoh yang 428 rujuk
          → 428 sengaja no-op, dan berhenti di sini hanya menghentikan
            seluruh rantai migrasi.

    Versi sebelumnya menyamakan keduanya:

        HARD FAIL — 429_celah_asuransi.sql
          429 gagal: polis_asuransi kosong — jalankan migrasi 428 dulu

    Pesannya pun menyesatkan: 428 SUDAH jalan — ia hanya tak punya proyek yang
    dirujuknya, dan sejak 2026-08-31 melewati verifikasinya sendiri dengan
    alasan itu. Menuduh urutan migrasi membuat pembacanya mencari cacat di
    tempat yang tak ada cacatnya.
  */
  IF NOT EXISTS (
    SELECT 1 FROM projects WHERE id::text LIKE 'c0000000-0000-0000-0000-%'
  ) THEN
    RAISE NOTICE '429 verifikasi dilewati: proyek contoh tak ada, jadi seed polis (428) memang no-op. Bukan galat.';
    RETURN;
  END IF;

  SELECT count(*) INTO n FROM polis_asuransi;
  IF n < 1 THEN
    RAISE EXCEPTION '429 gagal: polis_asuransi kosong PADAHAL proyek contoh ada — '
                    'seed 428 tak mengisi, dan otomasi celah asuransi akan membalas 200 '
                    'dengan nol notifikasi yang terbaca seperti "semua terlindungi"';
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'celah-asuransi' AND aktif AND jenis = 'mingguan';
  IF n <> n_ang THEN
    RAISE EXCEPTION '429 gagal: jadwal mingguan ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '429 OK: aturan + target, 1 setelan, jadwal mingguan (% badan usaha)', n_aktif;
END $$;
