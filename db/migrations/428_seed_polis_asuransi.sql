-- ============================================================================
-- 428 - DATA POLIS ASURANSI (prasyarat automation 9.2)
-- ============================================================================
--
-- Founder 2026-08-16: "kalau data belum ada, silakan masukkan data dummy dulu,
-- karena semua data yang ada di sistem ini masih data dummy semua."
--
-- ── KENAPA ASURANSI, DARI LIMA TABEL KOSONG YANG DIUKUR
--
-- Lima tabel punya schema tetapi nol baris: `polis_asuransi`,
-- `contract_claims`, `kontrak`, `information_requests`,
-- `tanda_tangan_elektronik`.
--
-- Yang ini dipilih karena celahnya paling MAHAL bila nyata: proyek konstruksi
-- tanpa CAR (Contractor All Risk) yang berjalan berarti satu kebakaran,
-- longsor, atau kecelakaan pihak ketiga ditanggung sendiri oleh perusahaan.
-- Nilainya bisa melebihi nilai kontraknya.
--
-- ── DATANYA SENGAJA TIDAK LENGKAP
--
-- Mengisi polis untuk SELURUH 11 proyek aktif akan membuat automation 9.2
-- memicu NOL selamanya — dan itu bentuk kelumpuhan yang sama dengan
-- `min_stock` nol yang diperbaiki migrasi 425: rutenya hidup, membalas 200,
-- dan `notifications_created: 0` terbaca sebagai "semua terlindungi".
--
-- Jadi sebarannya dibuat menyerupai keadaan nyata perusahaan kecil:
--
--   6 proyek  CAR/TPL aktif dan masih berlaku       <- keadaan sehat
--   1 proyek  polis KADALUARSA, tak diperpanjang    <- celah, terlihat
--   1 proyek  polis berakhir dalam < 30 hari        <- celah, akan datang
--   1 proyek  hanya TPL, TANPA CAR                  <- celah paling halus
--   2 proyek  TAK PUNYA polis sama sekali           <- celah paling jelas
--
-- Baris ketiga itu yang paling berharga untuk menguji 9.2. Proyek dengan TPL
-- saja TERLIHAT terasuransi di daftar mana pun yang cuma menghitung jumlah
-- polis — padahal TPL menanggung pihak ketiga, bukan pekerjaannya sendiri.
-- Automation yang hanya bertanya "punya polis?" akan melewatkannya.
--
-- ── NILAI PERTANGGUNGAN MENGIKUTI NILAI KONTRAK
--
-- Bukan angka bulat karangan: CAR lazimnya sebesar nilai kontrak (kadang
-- +10% untuk material di lokasi), TPL jauh lebih kecil dan berdiri sendiri.
-- Premi ~0,2-0,35% dari pertanggungan.
--
-- Dengan begitu, automation yang kelak memeriksa "pertanggungan CUKUP atau
-- tidak" punya bahan yang masuk akal untuk dibandingkan — bukan sekadar
-- ada/tidak ada.
--
-- ── IDEMPOTEN
--
-- Disaring `NOT EXISTS` pada (project_id, penerbit, nomor_polis), kunci unik
-- yang sudah ada di tabel. Menjalankan ulang tak menggandakan.
-- ============================================================================

INSERT INTO polis_asuransi
  (project_id, jenis, nomor_polis, penerbit, nilai_pertanggungan, premi,
   periode_mulai, periode_selesai, tertanggung, status, catatan)
SELECT v.pid::uuid, v.jenis, v.nomor, v.penerbit,
       v.tanggung::numeric, v.premi::numeric,
       v.mulai::date, v.selesai::date, v.tertanggung, v.status, v.catatan
  FROM (VALUES
    -- ── 6 proyek SEHAT: CAR aktif, masih lama berlakunya ───────────────────
    ('c0000000-0000-0000-0000-000000000002', 'car',
     'CAR/2026/0021', 'Asuransi Astra Buana', 1204500000, 3613500,
     '2026-02-01', '2027-02-01', 'PT Puraloka Persada', 'aktif',
     'Nilai pertanggungan 110% kontrak — termasuk material di lokasi.'),
    ('c0000000-0000-0000-0000-000000000003', 'car_tpl',
     'CAR/2026/0034', 'Asuransi Sinar Mas', 979000000, 2937000,
     '2026-03-15', '2027-03-15', 'PT Puraloka Persada', 'aktif',
     'Gabungan CAR + TPL dalam satu polis.'),
    ('c0000000-0000-0000-0000-000000000008', 'car',
     'CAR/2026/0048', 'Asuransi Astra Buana', 935000000, 2805000,
     '2026-04-01', '2027-04-01', 'PT Puraloka Persada', 'aktif', NULL),
    ('c0000000-0000-0000-0000-000000000015', 'car_tpl',
     'CAR/2026/0055', 'Asuransi Tugu Pratama', 792000000, 2376000,
     '2026-05-10', '2027-05-10', 'PT Puraloka Persada', 'aktif', NULL),
    ('c0000000-0000-0000-0000-000000000006', 'car',
     'CAR/2026/0061', 'Asuransi Sinar Mas', 715000000, 2145000,
     '2026-05-20', '2027-05-20', 'PT Puraloka Persada', 'aktif', NULL),
    ('c0000000-0000-0000-0000-000000000011', 'car',
     'CAR/2026/0072', 'Asuransi Tugu Pratama', 418000000, 1254000,
     '2026-06-01', '2027-06-01', 'PT Puraloka Persada', 'aktif', NULL),

    -- ── CELAH 1: polis KADALUARSA, tak diperpanjang ────────────────────────
    -- Proyeknya masih berjalan. Ini yang paling sering terjadi di lapangan:
    -- polis habis dan tak ada yang menyadarinya sampai terjadi sesuatu.
    ('c0000000-0000-0000-0000-000000000001', 'car',
     'CAR/2025/0188', 'Asuransi Astra Buana', 313500000, 940500,
     '2025-06-01', '2026-06-01', 'PT Puraloka Persada', 'kadaluarsa',
     'Belum diperpanjang. Proyek masih berjalan.'),

    -- ── CELAH 2: berakhir dalam kurang dari 30 hari ────────────────────────
    ('c0000000-0000-0000-0000-000000000007', 'car',
     'CAR/2025/0203', 'Asuransi Sinar Mas', 198000000, 594000,
     '2025-09-05', '2026-09-05', 'PT Puraloka Persada', 'aktif',
     'Jatuh tempo perpanjangan sudah dekat.'),

    -- ── CELAH 3: HANYA TPL, tanpa CAR — yang paling halus ──────────────────
    -- Proyek ini TERLIHAT terasuransi di daftar mana pun yang cuma menghitung
    -- jumlah polis. TPL menanggung pihak ketiga; kerusakan pekerjaannya
    -- SENDIRI tidak ditanggung siapa pun.
    ('c0000000-0000-0000-0000-000000000013', 'tpl',
     'TPL/2026/0090', 'Asuransi Tugu Pratama', 250000000, 500000,
     '2026-04-12', '2027-04-12', 'PT Puraloka Persada', 'aktif',
     'HANYA tanggung jawab pihak ketiga. Tak ada CAR untuk pekerjaannya.')

    -- ── CELAH 4: dua proyek aktif TANPA polis sama sekali ──────────────────
    -- Sengaja tidak ditulis di sini. Ketiadaannya ITULAH datanya.
  ) AS v(pid, jenis, nomor, penerbit, tanggung, premi, mulai, selesai,
         tertanggung, status, catatan)
 WHERE EXISTS (SELECT 1 FROM projects p WHERE p.id = v.pid::uuid)
   AND NOT EXISTS (
        SELECT 1 FROM polis_asuransi x
         WHERE x.project_id = v.pid::uuid
           AND x.penerbit = v.penerbit
           AND x.nomor_polis = v.nomor);

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n INT; n_aktif INT; n_tanpa INT; n_tpl INT;
BEGIN
  SELECT count(*) INTO n FROM polis_asuransi;
  IF n < 9 THEN
    RAISE EXCEPTION '428 gagal: polis hanya % baris, harus >= 9', n;
  END IF;

  /*
    SEBARANNYA yang diperiksa, bukan sekadar jumlahnya.

    Kalau seluruh proyek aktif punya CAR yang berlaku, automation 9.2 akan
    memicu NOL selamanya — kelumpuhan yang sama dengan `min_stock` nol
    (migrasi 425): rutenya hidup, membalas 200, dan `notifications_created: 0`
    terbaca sebagai "semua terlindungi".

    Ketiga celah di bawah diperiksa terpisah, karena masing-masing menguji
    jalur berbeda pada automation-nya nanti.
  */
  SELECT count(*) INTO n_aktif FROM projects
   WHERE is_deleted = false AND status = 'active';

  -- Celah 4: proyek aktif tanpa polis APA PUN.
  SELECT count(*) INTO n_tanpa FROM projects p
   WHERE p.is_deleted = false AND p.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM polis_asuransi a WHERE a.project_id = p.id);
  IF n_tanpa < 1 THEN
    RAISE EXCEPTION
      '428 gagal: SEMUA % proyek aktif punya polis — automation 9.2 tak akan pernah berbunyi',
      n_aktif;
  END IF;

  -- Celah 3: proyek yang punya polis TAPI tak satu pun menanggung pekerjaannya.
  /*
    ⚠ VERSI PERTAMA CEK INI LOLOS UNTUK ALASAN YANG SALAH.

    Bentuk pertamanya cuma menuntut "punya polis TAPI tak ada CAR aktif" — dan
    itu JUGA dipenuhi proyek yang polis CAR-nya KADALUARSA. Jadi cek TPL hijau
    sementara barisnya sendiri menempel di proyek `completed`, di luar jangkauan
    seluruh saringan `status = 'active'`.

    Kelas kesalahan yang sudah berulang di repo ini: pemeriksaan yang benar
    secara logika tetapi dipenuhi oleh baris LAIN daripada yang dimaksud.

    Sekarang dituntut EKSPLISIT: ada polis AKTIF, dan tak satu pun di antaranya
    menanggung pekerjaannya sendiri.
  */
  SELECT count(*) INTO n_tpl FROM projects p
   WHERE p.is_deleted = false AND p.status = 'active'
     AND EXISTS (SELECT 1 FROM polis_asuransi a
                  WHERE a.project_id = p.id AND a.status = 'aktif')
     AND NOT EXISTS (
          SELECT 1 FROM polis_asuransi a
           WHERE a.project_id = p.id AND a.jenis IN ('car', 'car_tpl')
             AND a.status = 'aktif');
  IF n_tpl < 1 THEN
    RAISE EXCEPTION
      '428 gagal: tak ada proyek AKTIF ber-polis-aktif-tanpa-CAR — celah paling halus tak terwakili';
  END IF;

  -- Celah 1: ada polis yang benar-benar kadaluarsa.
  SELECT count(*) INTO n FROM polis_asuransi WHERE status = 'kadaluarsa';
  IF n < 1 THEN
    RAISE EXCEPTION '428 gagal: tak ada polis kadaluarsa untuk diuji';
  END IF;

  /*
    Nilai pertanggungan tak boleh seragam.

    Kalau seluruh baris memakai angka yang sama, itu tanda datanya dikarang
    tanpa memperhatikan nilai kontrak — dan automation yang kelak memeriksa
    "pertanggungan CUKUP atau tidak" akan diuji dengan bahan yang tak berarti.
  */
  SELECT count(DISTINCT nilai_pertanggungan) INTO n FROM polis_asuransi;
  IF n < 5 THEN
    RAISE EXCEPTION '428 gagal: hanya % nilai pertanggungan berbeda — data terlalu seragam', n;
  END IF;

  RAISE NOTICE '428 OK: % polis, % proyek aktif, % tanpa polis, % hanya-TPL',
    (SELECT count(*) FROM polis_asuransi), n_aktif, n_tanpa, n_tpl;
END $$;
