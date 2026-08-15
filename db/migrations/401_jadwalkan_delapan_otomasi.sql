-- ============================================================================
-- 401 — MENJADWALKAN DELAPAN OTOMASI YANG SUDAH ADA TAPI TAK PERNAH JALAN
-- ============================================================================
--
-- Delapan rute otomasi dibangun 2026-08-15/16 dan tak satu pun terdaftar di
-- `jadwal_tugas`. Akibatnya: rutenya benar, testnya hijau, penjaganya hijau,
-- dan **tak pernah dipanggil sekali pun**.
--
-- ── Alasan yang saya tulis sendiri ternyata salah
--
-- `ROADMAP-WORKFLOW.md` dan `lapor-otomasi-hidup.mjs` sama-sama menyebut
-- sebabnya "menunggu deploy / SCHEDULER_URL". Diukur 2026-08-16:
--
--     grep -rn "SCHEDULER_URL" apps/api/src apps/api/scripts
--     → SATU hasil, dan itu KALIMAT di dalam skrip laporan saya sendiri
--
-- Tak ada satu baris kode pun yang memakainya. Penjadwalnya justru ada di
-- dalam API (`POST /api/v1/jadwal/jalankan` + tabel ini), memakai
-- `SCHEDULER_SECRET` yang sudah terisi di `.env`, dan menjalankan tiap tugas
-- lewat `server.inject` — tak butuh jaringan, tak butuh n8n, tak butuh deploy.
--
-- Pelajarannya sama dengan pembuka `CLAUDE.md`, dalam bentuk yang tak
-- terpikirkan sebelumnya: **bukan hanya angka yang membusuk, ALASAN pun
-- membusuk.** "Menunggu deploy" terdengar seperti kesimpulan teknis; ia
-- tebakan yang tak pernah diukur, dan ia menahan delapan otomasi selama dua
-- hari tanpa satu pun gejala.
--
-- ── Jam disebar, bukan ditumpuk
--
-- Sepuluh tugas lama menempati 06:00–08:30. Menaruh delapan tugas baru di jam
-- yang sama berarti delapan belas tugas berebut satu denyut 15 menit, dan
-- masing-masing memanggil rute yang menyapu tabel besar.
--
-- Yang lebih penting: penerimanya manusia. Delapan belas notifikasi yang tiba
-- dalam satu menit dibaca sebagai satu gangguan, bukan delapan belas kabar.
-- Disebar 06:00–13:00 dengan yang paling mendesak lebih pagi.
--
-- ── `harian` untuk semua kecuali dua
--
-- `harga-material-naik` mingguan: harga material tak berubah tiap hari, dan
-- pengingat harian untuk hal yang berubah bulanan adalah cara tercepat membuat
-- orang mematikan notifikasinya.
--
-- `polis-berakhir` mingguan dengan alasan sebaliknya — ambangnya 30 hari, jadi
-- polis yang sama akan muncul tiga puluh kali kalau harian. Dedup harian
-- menahan kembar DALAM satu hari, bukan lintas hari.
-- ============================================================================

-- ── Hanya perusahaan yang PUNYA ANGGOTA — dan ini hasil koreksi
--
-- Bentuk pertama migrasi ini menulis untuk SEMUA perusahaan (`FROM companies`
-- tanpa syarat). Diukur sesudah dijalankan: 4.794 baris untuk 571 perusahaan,
-- padahal **hanya SATU yang punya anggota** — 570 sisanya tenant sampah dari
-- test yang tak pernah dibersihkan (ROADMAP-WORKFLOW §6c).
--
-- Akibatnya langsung terlihat pada denyut pertama:
--
--     diperiksa 1000 · sukses 0 · gagal 71 · dilewati 929
--     galat: "Anda bukan anggota perusahaan tersebut" (403)
--
-- 2.018 baris berakhir berstatus `gagal` — akun layanan memang bukan anggota
-- tenant hantu, dan tak seharusnya. Kegagalan yang benar untuk alasan yang
-- salah.
--
-- Sepuluh tugas LAMA di tabel ini semuanya ter-scope ke satu perusahaan itu.
-- Saya tak memeriksanya sebelum menulis `FROM companies`, dan bentuk yang
-- sudah ada di tabel adalah tempat paling murah untuk memeriksanya.
--
-- Syarat "punya anggota" dipilih, bukan "kode = 'puraloka-persada'": yang
-- kedua memaku satu tenant di migrasi dan membuat tenant sungguhan berikutnya
-- diam-diam tak terjadwal. Yang pertama benar untuk berapa pun jumlahnya.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
-- `jam` bertipe TEXT ber-CHECK '^([01][0-9]|2[0-3]):[0-5][0-9]$' — bukan
-- `time`. Cast pertama saya `::time` lolos parser lalu ditolak CHECK dengan
-- galat yang menyebut nama constraint, bukan sebab: '07:20:00' tak cocok pola
-- karena polanya menuntut HH:MM tanpa detik.
SELECT c.id, v.tugas, v.jenis, v.jam, v.hari_pekan, true
  FROM companies c
  CROSS JOIN (VALUES
    -- Uang lebih dulu: yang tertahan paling mahal kalau terlambat diketahui.
    ('invoice-terlambat',       'harian',   '07:20', NULL),
    ('hutang-supplier',         'harian',   '07:40', NULL),
    ('saldo-menipis',           'harian',   '08:10', NULL),
    -- Jadwal & kinerja proyek — dibaca saat orang mulai menata hari.
    ('milestone-berisiko',      'harian',   '08:50', NULL),
    ('evm-kinerja',             'harian',   '09:10', NULL),
    -- Dokumen & kepatuhan — tak mendesak per jam, tetapi tak boleh hilang.
    ('transmittal-menggantung', 'harian',   '09:30', NULL),
    -- Mingguan: lihat alasannya di kepala berkas.
    ('harga-material-naik',     'mingguan', '10:00', 1),
    ('polis-berakhir',          'mingguan', '10:20', 1)
  ) AS v(tugas, jenis, jam, hari_pekan)
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis,
      jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan,
      aktif = true;

-- ── Membersihkan yang terlanjur dibuat bentuk pertama ───────────────────────
--
-- Idempoten dan sempit: HANYA delapan tugas ini, HANYA pada perusahaan tanpa
-- anggota. Tugas lama tak disentuh, tenant sungguhan tak disentuh.
DELETE FROM jadwal_tugas t
 WHERE t.tugas IN ('invoice-terlambat', 'hutang-supplier', 'saldo-menipis',
                   'milestone-berisiko', 'evm-kinerja', 'transmittal-menggantung',
                   'harga-material-naik', 'polis-berakhir')
   AND NOT EXISTS (
     SELECT 1 FROM company_members m WHERE m.company_id = t.company_id
   );

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
--
-- Bukan formalitas. Cacat yang justru diperbaiki migrasi ini — otomasi yang
-- ada tapi tak terjadwal — tak punya gejala sama sekali, jadi satu-satunya
-- yang bisa menangkap pengulangannya adalah pemeriksaan seperti ini.
DO $$
DECLARE
  n_perusahaan INT;
  n_tugas      INT;
  n_yatim      INT;
  bentrok      TEXT;
BEGIN
  -- Perusahaan yang BERANGGOTA, bukan seluruh baris `companies`.
  SELECT count(*) INTO n_perusahaan
    FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n_tugas FROM jadwal_tugas
   WHERE tugas IN ('invoice-terlambat', 'hutang-supplier', 'saldo-menipis',
                   'milestone-berisiko', 'evm-kinerja', 'transmittal-menggantung',
                   'harga-material-naik', 'polis-berakhir')
     AND aktif;
  IF n_tugas <> n_perusahaan * 8 THEN
    RAISE EXCEPTION '401 gagal: % tugas aktif, harus % (8 per perusahaan beranggota)',
      n_tugas, n_perusahaan * 8;
  END IF;

  /*
    Tak boleh ada satu pun tugas terjadwal pada perusahaan TANPA anggota.

    Ini yang menangkap pengulangan kesalahan bentuk pertama — dan ia menangkap
    lebih dari itu: tenant yang seluruh anggotanya dicabut kelak akan
    memerahkan migrasi ini, yang lebih baik daripada penjadwal yang diam-diam
    menumpuk 403 tiap denyut.
  */
  SELECT count(*) INTO n_yatim
    FROM jadwal_tugas t
   WHERE NOT EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = t.company_id);
  IF n_yatim > 0 THEN
    RAISE EXCEPTION '401 gagal: % tugas terjadwal pada perusahaan tanpa anggota', n_yatim;
  END IF;

  /*
    Dua tugas pada JAM yang sama untuk satu perusahaan bukan galat basis, tapi
    ia mengembalikan persis persoalan yang penyebaran jam ini hendak cegah.
    Diperiksa di sini supaya penambahan berikutnya tak diam-diam menumpuk.
  */
  SELECT string_agg(DISTINCT jam::text, ', ') INTO bentrok
    FROM (
      SELECT company_id, jam
        FROM jadwal_tugas
       WHERE aktif
       GROUP BY company_id, jam
      HAVING count(*) > 1
    ) x;
  IF bentrok IS NOT NULL THEN
    RAISE WARNING '401: ada jam yang dipakai lebih dari satu tugas — %', bentrok;
  END IF;
END $$;
