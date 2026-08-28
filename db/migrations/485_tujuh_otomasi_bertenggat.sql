-- ============================================================================
-- 468 - TUJUH OTOMASI BERTENGGAT (tanpa nomor rencana)
-- ============================================================================
--
-- ── SATU MIGRASI UNTUK TUJUH, KARENA BENTUKNYA MEMANG SATU
--
-- Ketujuhnya memakai fungsi yang sama (`lib/tenggat-terlewat.ts`): ada tenggat,
-- belum ditutup, sudah lewat. Memecahnya jadi tujuh migrasi berarti tujuh
-- berkas yang isinya nyaris identik - dan tujuh kesempatan agar satu di
-- antaranya menyimpang tanpa ada yang menyadari.
--
-- ── YANG DITEMUKAN, diukur 2026-08-19 - SEMUANYA SUDAH MELANGGAR HARI INI
--
--   punch_items          36 belum ditutup, terlama 16 hari lewat target
--   ncr_items            17 belum ditutup, terlama 15 hari lewat, 1 TANPA target
--   inspection_requests  12 belum diperiksa, terlama 22 hari lewat
--   tindakan_mitigasi     5 belum selesai, terlama 18 hari lewat
--   notulen_tindakan      3 belum selesai, terlama 17 hari lewat, 1 TANPA tenggat
--   temuan_k3             3 belum ditutup, terlama 9 hari lewat
--   rfq                   2 lewat batas masuk, terlama 10 hari
--
-- ⚠ Angka di atas SAAT DIUKUR. Ukur sendiri lewat `checked` di jawaban tiap rute.
--
-- ── LIMA AMBANG, BUKAN SATU - DAN ALASANNYA ORGANISASI, BUKAN TEKNIS
--
-- Yang menyetel ambang mutu adalah manajer QC, ambang K3 petugas K3, ambang
-- pengadaan bagian pembelian. Satu ambang bersama berarti mereka bertiga
-- berebut satu kotak isian, dan yang terakhir mengubahnya menang tanpa tahu ia
-- menggeser peringatan dua departemen lain.
--
-- Yang digabung hanya yang benar-benar satu urusan: punch list, NCR, dan
-- inspeksi semuanya milik QC.
--
-- ── IZIN DIUKUR, tidak ditebak (semuanya ada di tabel `permissions`)
--
--   punch_lewat_target        punch:manage
--   ncr_lewat_target          ncr:manage
--   inspeksi_terlewat         inspeksi:periksa
--   mitigasi_lewat_tenggat    risiko:manage
--   notulen_tak_ditindak      documents:manage
--   temuan_k3_lewat_tenggat   k3:inspeksi:manage
--   rfq_lewat_batas           procurement:po:manage
--
-- ── JADWAL: HARIAN untuk K3 dan mutu, MINGGUAN untuk sisanya.
--
--    Bukan kebiasaan. Temuan K3 yang lewat berarti bahaya yang masih ada di
--    lapangan hari ini; punch list dan NCR menahan serah terima dan retensi
--    yang berjalan tiap hari. Mitigasi risiko, tindak lanjut rapat, dan RFQ
--    bergerak dalam hitungan minggu - menjadwalkannya harian cuma menghasilkan
--    tujuh pengingat untuk satu pekerjaan yang memang butuh waktu.
-- ============================================================================

-- ── Aturan notifikasi + target izin ─────────────────────────────────────────
INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
-- ⚠ Kolom VALUES dinamai ber-awalan `x_`. `label` bentrok dengan kolom
--   `notification_rules.label`, dan Postgres menolak dengan "column reference
--   is ambiguous" tanpa menyebut mana yang mana.
SELECT c.id, x.x_jenis, x.x_label, x.x_uraian, true
  FROM companies c
 CROSS JOIN (VALUES
   ('punch_lewat_target',      'Punch List Lewat Target',
    'Item punch list yang belum ditutup melewati target — menahan berita acara dan retensi'),
   ('ncr_lewat_target',        'NCR Lewat Target Penutupan',
    'NCR yang belum ditutup melewati target, dan yang tak diberi target sama sekali'),
   ('inspeksi_terlewat',       'Permintaan Inspeksi Terlewat',
    'Titik henti mutu yang belum diperiksa, dan inspeksi tidak lolos yang belum diulang'),
   ('mitigasi_lewat_tenggat',  'Mitigasi Risiko Lewat Tenggat',
    'Tindakan mitigasi yang tenggatnya lewat — register terlihat terkelola padahal tidak'),
   ('notulen_tak_ditindak',    'Tindak Lanjut Rapat Menggantung',
    'Keputusan rapat berpenanggung jawab dan bertenggat yang tak dikerjakan'),
   ('temuan_k3_lewat_tenggat', 'Temuan K3 Lewat Tenggat Perbaikan',
    'Temuan inspeksi K3 yang belum diperbaiki — bahayanya masih ada di lapangan'),
   ('rfq_lewat_batas',         'RFQ Lewat Batas Masuk',
    'Permintaan penawaran yang batas masuknya lewat tanpa keputusan')
 ) AS x(x_jenis, x_label, x_uraian)
 WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', x.x_izin
  FROM notification_rules r
  JOIN (VALUES
   ('punch_lewat_target',      'punch:manage'),
   ('ncr_lewat_target',        'ncr:manage'),
   ('inspeksi_terlewat',       'inspeksi:periksa'),
   ('mitigasi_lewat_tenggat',  'risiko:manage'),
   ('notulen_tak_ditindak',    'documents:manage'),
   ('temuan_k3_lewat_tenggat', 'k3:inspeksi:manage'),
   ('rfq_lewat_batas',         'procurement:po:manage')
  ) AS x(x_jenis, x_izin) ON x.x_jenis = r.event_type
 WHERE NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = x.x_izin);

-- ── Lima ambang ─────────────────────────────────────────────────────────────
INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, x.x_kunci, x.x_nilai::jsonb, 'number', 'otomasi', x.x_uraian
  FROM companies c
 CROSS JOIN (VALUES
   ('otomasi.tenggat_mutu.hari', '3',
    'Hari sebelum tenggat mutu (punch list, NCR, inspeksi) diperingatkan. Yang sudah lewat tetap dilaporkan berapa pun angkanya, dan ambang ini hanya mengatur seberapa dini peringatan pencegahan datang.'),
   ('otomasi.tenggat_k3.hari', '3',
    'Hari sebelum tenggat perbaikan temuan K3 diperingatkan. Yang sudah lewat selalu dikirim sebagai mendesak, tak peduli tingkatnya.'),
   ('otomasi.tenggat_risiko.hari', '7',
    'Hari sebelum tenggat mitigasi risiko diperingatkan. Lebih panjang daripada mutu dan K3 karena mitigasi biasanya pekerjaan berminggu-minggu.'),
   ('otomasi.tenggat_notulen.hari', '2',
    'Hari sebelum tenggat tindak lanjut rapat diperingatkan. Paling pendek karena tindak lanjut rapat biasanya pekerjaan sehari-dua.'),
   ('otomasi.tenggat_pengadaan.hari', '2',
    'Hari sebelum batas masuk penawaran RFQ diperingatkan.')
 ) AS x(x_kunci, x_nilai, x_uraian)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

-- ── Jadwal ──────────────────────────────────────────────────────────────────
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
-- ⚠ Kolom VALUES dinamai ber-awalan `x_` supaya tak bentrok dengan nama kolom
--   `jadwal_tugas` sendiri. Tanpa itu Postgres menolak dengan "column
--   reference jenis is ambiguous" — dan pesannya tak menyebut mana yang mana.
SELECT c.id, x.x_tugas, x.x_jenis, x.x_jam, x.x_hari_pekan, true
  FROM companies c
 CROSS JOIN (VALUES
   -- ⚠ `jam` bertipe TEXT dengan CHECK '^([01][0-9]|2[0-3]):[0-5][0-9]$' —
   --   BUKAN `time`. Cast ke ::time menghasilkan '06:05:00' dan ditolak
   --   constraint; versi pertama migrasi ini gagal persis di situ.
   --
   -- HARIAN: mutu dan K3. Bahaya dan retensi berjalan tiap hari.
   ('temuan-k3-lewat-tenggat', 'harian',   '06:05', NULL::int),
   ('punch-lewat-target',      'harian',   '06:40', NULL::int),
   ('ncr-lewat-target',        'harian',   '06:45', NULL::int),
   ('inspeksi-terlewat',       'harian',   '06:50', NULL::int),
   -- MINGGUAN: yang objeknya memang bergerak dalam hitungan minggu.
   ('mitigasi-lewat-tenggat',  'mingguan', '07:15', 1),
   ('notulen-tak-ditindak',    'mingguan', '07:20', 1),
   ('rfq-lewat-batas',         'mingguan', '07:25', 1)
 ) AS x(x_tugas, x_jenis, x_jam, x_hari_pekan)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; nilai NUMERIC;
  /*
    ⚠ DINAMAI `V_JENIS`, BUKAN `JENIS`.

    PL/pgSQL menyulih nama variabel ke dalam SQL, dan `jadwal_tugas` punya
    KOLOM bernama `jenis`. Variabel bernama sama membuat Postgres menolak
    dengan "column reference jenis is ambiguous" — pada baris yang tak
    menyebut variabelnya sama sekali (`WHERE ... AND jenis = 'harian'`).

    Galatnya menunjuk tempat yang salah, dan itu yang membuatnya memakan
    waktu: saya mengganti nama kolom di tiga blok VALUES lebih dulu sebelum
    menyadari sumbernya ada di DECLARE.
  */
  V_JENIS TEXT[] := ARRAY['punch_lewat_target','ncr_lewat_target','inspeksi_terlewat',
                          'mitigasi_lewat_tenggat','notulen_tak_ditindak',
                          'temuan_k3_lewat_tenggat','rfq_lewat_batas'];
  IZIN  TEXT[] := ARRAY['punch:manage','ncr:manage','inspeksi:periksa','risiko:manage',
                        'documents:manage','k3:inspeksi:manage','procurement:po:manage'];
  AMBANG TEXT[] := ARRAY['otomasi.tenggat_mutu.hari','otomasi.tenggat_k3.hari',
                         'otomasi.tenggat_risiko.hari','otomasi.tenggat_notulen.hari',
                         'otomasi.tenggat_pengadaan.hari'];
  TUGAS_HARIAN   TEXT[] := ARRAY['temuan-k3-lewat-tenggat','punch-lewat-target',
                                 'ncr-lewat-target','inspeksi-terlewat'];
  TUGAS_MINGGUAN TEXT[] := ARRAY['mitigasi-lewat-tenggat','notulen-tak-ditindak',
                                 'rfq-lewat-batas'];
  k TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  -- Tujuh aturan, satu per badan usaha aktif.
  SELECT count(*) INTO n FROM notification_rules
   WHERE event_type = ANY(V_JENIS) AND is_active;
  IF n <> n_aktif * 7 THEN
    RAISE EXCEPTION '468 gagal: aturan ada % baris, harus % (7 jenis x % badan usaha)',
      n, n_aktif * 7, n_aktif;
  END IF;

  /*
    IZIN WAJIB ADA DI TABEL `permissions` - diperiksa SATU PER SATU.

    Kunci izin yang tak ada menolak SEMUA orang tanpa gejala: rutenya jalan,
    balas 200, nol notifikasi - tak bisa dibedakan dari "tak ada yang lewat
    tenggat". Ini kelas cacat yang sama dengan `equipment:manage` yang pernah
    ditolak foreign key karena nama sebenarnya `assets:manage`.
  */
  FOREACH k IN ARRAY IZIN LOOP
    SELECT count(*) INTO n FROM permissions WHERE key = k;
    IF n < 1 THEN
      RAISE EXCEPTION '468 gagal: izin % tidak ada di tabel permissions', k;
    END IF;
  END LOOP;

  -- Tujuh target, satu per aturan.
  SELECT count(*) INTO n FROM notification_rules r
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = ANY(V_JENIS) AND t.permission_key = ANY(IZIN);
  IF n <> n_aktif * 7 THEN
    RAISE EXCEPTION '468 gagal: target ada % baris, harus %', n, n_aktif * 7;
  END IF;

  -- Lima ambang, satu per badan usaha aktif.
  SELECT count(*) INTO n FROM company_settings WHERE key = ANY(AMBANG);
  IF n <> n_aktif * 5 THEN
    RAISE EXCEPTION '468 gagal: setelan ada % baris, harus % (5 ambang x % badan usaha)',
      n, n_aktif * 5, n_aktif;
  END IF;

  /*
    Tiap ambang WAJIB 0..90.

    Nol SAH di sini, berbeda dari kebanyakan ambang lain: menyetelnya nol
    berarti "peringatkan hanya yang sudah lewat, jangan yang belum". Itu
    pilihan yang masuk akal bagi perusahaan yang tak ingin peringatan
    pencegahan sama sekali.

    Di atas 90 hari tak masuk akal untuk apa pun di kelompok ini - peringatan
    tiga bulan sebelum tenggat berbunyi jauh sebelum pekerjaannya dimulai.
  */
  FOREACH k IN ARRAY AMBANG LOOP
    SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings WHERE key = k;
    IF nilai IS NULL OR nilai < 0 OR nilai > 90 THEN
      RAISE EXCEPTION '468 gagal: ambang % bernilai % di luar 0..90', k, nilai;
    END IF;
  END LOOP;

  /*
    JADWAL HARIAN untuk K3 dan mutu - dan ini yang paling mudah "dirapikan"
    orang berikutnya menjadi mingguan supaya seragam.

    Jangan. Temuan K3 yang lewat berarti bahaya yang masih ada di lapangan HARI
    INI. Punch list dan NCR menahan berita acara serah terima, dan retensi yang
    tertahan berjalan tiap hari, bukan tiap pekan.
  */
  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = ANY(TUGAS_HARIAN) AND aktif AND jenis = 'harian';
  IF n <> n_ang * 4 THEN
    RAISE EXCEPTION '468 gagal: jadwal HARIAN ada % baris, harus % (4 tugas x % badan usaha)',
      n, n_ang * 4, n_ang;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = ANY(TUGAS_MINGGUAN) AND aktif AND jenis = 'mingguan';
  IF n <> n_ang * 3 THEN
    RAISE EXCEPTION '468 gagal: jadwal MINGGUAN ada % baris, harus % (3 tugas x % badan usaha)',
      n, n_ang * 3, n_ang;
  END IF;

  /*
    PRASYARAT: tiap tabel harus punya isi untuk diperiksa.

    Tanpa itu rutenya membalas 200 dengan nol notifikasi - tak bisa dibedakan
    dari "semuanya tepat waktu". Kelumpuhan yang sama dengan `min_stock` nol
    (425), `uji_material` kosong (433), dan `expediting` kosong (466).

    Diperiksa per-tabel supaya pesannya menyebut TABEL MANA yang kosong; satu
    pemeriksaan gabungan akan lulus selama satu tabel saja terisi.
  */
  SELECT count(*) INTO n FROM punch_items;
  IF n < 1 THEN RAISE EXCEPTION '468 gagal: punch_items kosong'; END IF;
  SELECT count(*) INTO n FROM ncr_items;
  IF n < 1 THEN RAISE EXCEPTION '468 gagal: ncr_items kosong'; END IF;
  SELECT count(*) INTO n FROM inspection_requests;
  IF n < 1 THEN RAISE EXCEPTION '468 gagal: inspection_requests kosong'; END IF;
  SELECT count(*) INTO n FROM tindakan_mitigasi;
  IF n < 1 THEN RAISE EXCEPTION '468 gagal: tindakan_mitigasi kosong'; END IF;
  SELECT count(*) INTO n FROM notulen_tindakan;
  IF n < 1 THEN RAISE EXCEPTION '468 gagal: notulen_tindakan kosong'; END IF;
  SELECT count(*) INTO n FROM temuan_k3;
  IF n < 1 THEN RAISE EXCEPTION '468 gagal: temuan_k3 kosong'; END IF;
  SELECT count(*) INTO n FROM rfq;
  IF n < 1 THEN RAISE EXCEPTION '468 gagal: rfq kosong'; END IF;

  RAISE NOTICE '468 OK: 7 aturan + target, 5 setelan, 4 jadwal harian + 3 mingguan (% badan usaha)', n_aktif;
END $$;
