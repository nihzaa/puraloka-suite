-- ============================================================================
-- 408 — PENYUSUTAN ALAT (10.8) · PERAWATAN & SERTIFIKASI (10.7) · MANDOR
--       BENTROK DUA PROYEK (3.9)
-- ============================================================================
--
-- Tiga otomasi, lima jenis notifikasi. Dipisah begitu karena tindakannya
-- berbeda, bukan karena datanya berbeda.
--
-- ── Yang memicu HARI INI, diukur 2026-08-16
--
--   penyusutan_belum_dihitung    14 dari 18 aset dalam masa manfaat tak punya
--                                baris `penyusutan_alat` untuk periode 2026-07
--   penyusutan_belum_dijurnal    8 baris (2026-05, 2026-06) sudah dihitung
--                                tetapi `journal_entry_id IS NULL` —
--                                Rp 110.544.642,86 tak pernah sampai ke neraca
--   perawatan_alat_jatuh_tempo   2 jadwal: servis DTR-002 lewat 14 hari,
--                                sertifikat SILO Depnaker EXC-001 6 hari lagi
--   alat_tanpa_jadwal_perawatan  12 dari 16 alat milik sendiri yang siap pakai
--   konflik_mandor               21 pasangan lingkup kerja, 5 mandor
--
-- ── IZIN DIUKUR, BUKAN DITEBAK
--
--   assets:manage      yang mengurus alat dan menekan "hitung penyusutan"
--   gl:jurnalkan       yang memindahkan hasilnya ke buku besar
--   mandor:assign      yang bisa menggeser penugasan mandor
--   mandor:scope:manage yang mengubah tanggal lingkup kerjanya
--
-- Keempatnya diverifikasi ada di tabel `permissions` lebih dulu. Kunci hantu
-- menolak SEMUA orang tanpa satu pun gejala — penjaga `audit-izin-benar-ada`
-- sudah menangkapnya empat kali dalam sesi ini.
--
-- ── KENAPA MINGGUAN, BUKAN HARIAN
--
-- Dedup notifikasi bekerja per HARI. Penyusutan dan alat-tanpa-jadwal adalah
-- persoalan yang butuh berhari-hari untuk diselesaikan, jadi jadwal harian
-- akan mengirim pesan yang sama tiap pagi sampai orangnya mematikan
-- notifikasi — dan pada hari sesuatu yang genting datang, ia tak lagi
-- membacanya.
--
-- `perawatan-alat` TETAP harian: sertifikat yang kedaluwarsa membuat alatnya
-- ilegal dioperasikan, dan sehari terlambat tahu itu mahal.
-- ============================================================================

-- ── 1. Aturan notifikasi ────────────────────────────────────────────────────

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, v.tipe, v.label, v.ket, true
  FROM companies c
  CROSS JOIN (VALUES
    ('penyusutan_belum_dihitung',   'Penyusutan Belum Dihitung',
     'Alat dalam masa manfaat tanpa catatan penyusutan untuk periode lalu'),
    ('penyusutan_belum_dijurnal',   'Penyusutan Belum Masuk Buku Besar',
     'Penyusutan sudah dihitung tetapi belum dijurnalkan ke neraca'),
    ('perawatan_alat_jatuh_tempo',  'Perawatan & Sertifikasi Alat',
     'Servis berkala atau sertifikat alat yang jatuh tempo atau sudah lewat'),
    ('alat_tanpa_jadwal_perawatan', 'Alat Tanpa Jadwal Perawatan',
     'Alat milik sendiri yang siap pakai tetapi belum punya jadwal perawatan'),
    ('konflik_mandor',              'Mandor Bentrok Dua Proyek',
     'Lingkup kerja mandor yang sama bertabrakan di proyek berbeda')
  ) AS v(tipe, label, ket)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

-- ── 2. Target per jenis ─────────────────────────────────────────────────────

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', v.izin
  FROM notification_rules r
  JOIN (VALUES
    ('penyusutan_belum_dihitung',   'assets:manage'),
    ('penyusutan_belum_dihitung',   'gl:jurnalkan'),
    -- Yang belum terjurnal HANYA urusan buku besar: perhitungannya sudah
    -- selesai, yang tersisa memindahkannya. Mengirimnya juga ke pengurus alat
    -- adalah menagih orang yang tak punya tombolnya.
    ('penyusutan_belum_dijurnal',   'gl:jurnalkan'),
    ('perawatan_alat_jatuh_tempo',  'assets:manage'),
    ('alat_tanpa_jadwal_perawatan', 'assets:manage'),
    ('konflik_mandor',              'mandor:assign'),
    ('konflik_mandor',              'mandor:scope:manage')
  ) AS v(tipe, izin) ON v.tipe = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = v.izin);

-- ── 3. Ambang, bisa diubah per tenant ───────────────────────────────────────

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, v.kunci, v.nilai::jsonb, 'number', 'otomasi', v.ket
  FROM companies c
  CROSS JOIN (VALUES
    ('otomasi.penyusutan_tutup.tanggal', '5',
     'Tanggal berapa buku penyusutan bulan lalu mulai ditagih.'),
    ('otomasi.perawatan_alat.hari', '14',
     'Hari sebelum jatuh tempo perawatan/sertifikasi alat diperingatkan.'),
    ('otomasi.konflik_mandor.hari', '14',
     'Hari tumpang tindih minimum sebelum mandor dianggap bentrok.')
  ) AS v(kunci, nilai, ket)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- ── 4. Jadwal ───────────────────────────────────────────────────────────────
--
-- Hanya tenant yang PUNYA ANGGOTA. Migrasi 402 membersihkan 9.164 baris yang
-- ditulis untuk tenant tanpa satu pun pengguna — tugas yang dijalankan tetapi
-- notifikasinya tak punya siapa pun untuk dituju.

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, v.tugas, v.jenis, v.jam, v.pekan, true
  FROM companies c
  CROSS JOIN (VALUES
    ('penyusutan-belum-ditutup', 'mingguan', '07:20', 1),
    ('perawatan-alat',           'harian',   '06:50', NULL::int),
    ('konflik-mandor',           'mingguan', '07:35', 1)
  ) AS v(tugas, jenis, jam, pekan)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; tipe TEXT; kunci TEXT; t_nama TEXT;
  TIPE_BARU TEXT[] := ARRAY[
    'penyusutan_belum_dihitung', 'penyusutan_belum_dijurnal',
    'perawatan_alat_jatuh_tempo', 'alat_tanpa_jadwal_perawatan',
    'konflik_mandor'];
  KUNCI_BARU TEXT[] := ARRAY[
    'otomasi.penyusutan_tutup.tanggal', 'otomasi.perawatan_alat.hari',
    'otomasi.konflik_mandor.hari'];
  TUGAS_BARU TEXT[] := ARRAY[
    'penyusutan-belum-ditutup', 'perawatan-alat', 'konflik-mandor'];
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  FOREACH tipe IN ARRAY TIPE_BARU LOOP
    SELECT count(*) INTO n FROM notification_rules
     WHERE event_type = tipe AND is_active;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '408 gagal: aturan % ada % baris, harus %', tipe, n, n_aktif;
    END IF;

  END LOOP;

  /*
    Target diperiksa BERPASANGAN, bukan dihitung.

    Versi pertama blok ini berbunyi "tiap jenis punya sedikitnya satu target",
    dan mutasi membuktikannya kosong: `konflik_mandor` punya DUA target, jadi
    membuang `mandor:assign` menyisakan satu — dan "sedikitnya satu" tetap
    terpenuhi. Verifikasi LULUS untuk aturan yang separuh targetnya hilang.

    Yang hilang bukan angka melainkan ORANG: seluruh pemegang `mandor:assign`
    berhenti menerima peringatan bentrok, dan tak ada satu pun galat.
  */
  FOR tipe, kunci IN
    SELECT * FROM (VALUES
      ('penyusutan_belum_dihitung',   'assets:manage'),
      ('penyusutan_belum_dihitung',   'gl:jurnalkan'),
      ('penyusutan_belum_dijurnal',   'gl:jurnalkan'),
      ('perawatan_alat_jatuh_tempo',  'assets:manage'),
      ('alat_tanpa_jadwal_perawatan', 'assets:manage'),
      ('konflik_mandor',              'mandor:assign'),
      ('konflik_mandor',              'mandor:scope:manage')
    ) AS v(t, i)
  LOOP
    SELECT count(*) INTO n FROM notification_rule_targets t
      JOIN notification_rules r ON r.id = t.rule_id
     WHERE r.event_type = tipe AND t.permission_key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '408 gagal: target %→% ada % baris, harus %',
        tipe, kunci, n, n_aktif;
    END IF;
  END LOOP;

  -- Kunci izin yang dipakai WAJIB benar-benar ada. Kunci hantu menolak semua
  -- orang tanpa gejala.
  SELECT count(*) INTO n
    FROM (VALUES ('assets:manage'), ('gl:jurnalkan'),
                 ('mandor:assign'), ('mandor:scope:manage')) AS v(k)
   WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.k);
  IF n > 0 THEN
    RAISE EXCEPTION '408 gagal: % kunci izin tak ada di tabel permissions', n;
  END IF;

  FOREACH kunci IN ARRAY KUNCI_BARU LOOP
    SELECT count(*) INTO n FROM company_settings WHERE key = kunci;
    IF n <> n_aktif THEN
      RAISE EXCEPTION '408 gagal: ambang % ada % baris, harus %', kunci, n, n_aktif;
    END IF;
  END LOOP;

  /*
    `t_nama`, BUKAN `tugas`.

    Variabel bernama sama dengan kolomnya membuat `WHERE tugas = tugas`
    dibaca PL/pgSQL sebagai kolom = kolom — selalu benar, seluruh baris
    cocok, dan verifikasinya LULUS untuk jadwal yang tak pernah tertulis.
    Blok verifikasi yang tak bisa gagal lebih buruk daripada tak ada.
  */
  FOREACH t_nama IN ARRAY TUGAS_BARU LOOP
    SELECT count(*) INTO n FROM jadwal_tugas j WHERE j.tugas = t_nama AND j.aktif;
    IF n <> n_ang THEN
      RAISE EXCEPTION '408 gagal: jadwal % ada % baris, harus %', t_nama, n, n_ang;
    END IF;
  END LOOP;

  RAISE NOTICE '408 OK — 5 jenis notifikasi, 3 ambang, 3 jadwal untuk % tenant beranggota', n_ang;
END $$;
