-- ============================================================================
-- 524 - RETENSI NOTIFIKASI
-- ============================================================================
--
-- ── YANG DITEMUKAN, diukur 2026-08-31 di basis produksi
--
--     8.893 notifikasi  ·  0 dibaca  ·  tertua 15 hari
--
--       0-1 hari    1.941
--       1-7 hari    2.553
--       7-30 hari   4.399
--
-- Tak ada setelan retensi, tak ada tugas pembersih. Notifikasi menumpuk sejak
-- hari pertama dan tak pernah berkurang.
--
-- ── KENAPA INI BUKAN SEKADAR KOTOR
--
-- Kotak masuk berisi ribuan baris tak terbaca berhenti berfungsi sebagai kotak
-- masuk. Orang tak menggulir 8.893 baris mencari yang penting - mereka
-- berhenti membukanya sama sekali, dan yang mendesak tenggelam bersama yang
-- tidak.
--
-- Akar yang sama dengan cacat 2026-08-16 (9.009 notifikasi, 3 dibaca) yang
-- melahirkan jeda melandai. Bedanya: jeda melandai menahan PENGULANGAN, dan ia
-- BEKERJA - diukur hari ini, 17 notifikasi berarti 17 catatan berbeda, bukan
-- satu catatan ditagih 17 kali.
--
-- Yang belum ditangani: yang sudah tak relevan tetap tinggal selamanya.
--
-- ── YANG TIDAK PERNAH DIHAPUS
--
-- Notifikasi `urgent` yang BELUM dibaca - berapa pun umurnya. Ia berarti
-- sesuatu yang berbahaya (temuan K3 lewat tenggat, beton gagal, baku mutu
-- terlampaui) dan belum ada yang melihatnya.
--
-- Menghapusnya karena "sudah lama" adalah kebalikan dari yang seharusnya:
-- makin lama ia tak dibaca, makin mendesak ia dibaca. Kalau kotak masuk penuh
-- oleh yang mendesak, jawabannya MENGERJAKANNYA.
--
-- ── KENAPA DUA AMBANG, DAN KENAPA PER-TENANT
--
-- Yang sudah DIBACA boleh dihapus lebih cepat: pemiliknya sudah melihatnya.
-- Yang BELUM dibaca disimpan lebih lama: menghapusnya berarti pesan yang tak
-- pernah sampai ke siapa pun.
--
-- Per-tenant karena berapa lama riwayat peringatan disimpan adalah KEBIJAKAN,
-- bukan keputusan teknis - perusahaan yang diaudit ketat punya kebutuhan
-- berbeda. Ini membedakannya dari `bersih-idempotensi`, yang batasnya memang
-- teknis dan sama untuk semua.
--
-- ── JADWAL: HARIAN 03:00
--
-- Di luar jam kerja, dan sebelum otomasi pagi (06:00-09:30) mulai menulis
-- notifikasi baru. Membersihkan SESUDAH otomasi berjalan berarti menghapus
-- sebagian yang baru saja dibuat pada hari yang sama - benar secara aturan,
-- membingungkan bagi yang melihatnya.
-- ============================================================================

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, x.x_kunci, x.x_nilai::jsonb, 'number', 'notifikasi', x.x_uraian
  FROM companies c
 CROSS JOIN (VALUES
   ('notifikasi.retensi.hari_dibaca', '30',
    'Berapa hari notifikasi yang SUDAH dibaca disimpan sebelum dihapus otomatis. Pemiliknya sudah melihatnya, jadi menyimpannya lebih lama tak menambah apa pun.'),
   ('notifikasi.retensi.hari_tak_dibaca', '90',
    'Berapa hari notifikasi yang BELUM dibaca disimpan. Sengaja lebih lama — menghapusnya berarti pesan yang tak pernah sampai ke siapa pun. Yang berprioritas mendesak dan belum dibaca TIDAK PERNAH dihapus otomatis, berapa pun umurnya.')
 ) AS x(x_kunci, x_nilai, x_uraian)
 WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'bersih-notifikasi', 'harian', '03:00', NULL, true
  FROM companies c
 WHERE c.is_active
   AND EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_ang INT; n INT; a_dibaca NUMERIC; a_tak NUMERIC; jam_terakhir TEXT;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  SELECT count(*) INTO n_ang FROM companies c
   WHERE c.is_active AND EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM company_settings
   WHERE key IN ('notifikasi.retensi.hari_dibaca', 'notifikasi.retensi.hari_tak_dibaca');
  IF n <> n_aktif * 2 THEN
    RAISE EXCEPTION '524 gagal: setelan ada % baris, harus % (2 ambang x % badan usaha)',
      n, n_aktif * 2, n_aktif;
  END IF;

  SELECT MIN((value #>> '{}')::numeric) INTO a_dibaca
    FROM company_settings WHERE key = 'notifikasi.retensi.hari_dibaca';
  SELECT MIN((value #>> '{}')::numeric) INTO a_tak
    FROM company_settings WHERE key = 'notifikasi.retensi.hari_tak_dibaca';

  /*
    Batas bawah 7 hari, bukan 1.

    Retensi satu hari berarti notifikasi Jumat sore hilang sebelum Senin pagi -
    dan orang yang libur akhir pekan tak pernah melihatnya. Tujuh hari adalah
    lantai terendah yang masih menjamin satu putaran pekan penuh.
  */
  IF a_dibaca IS NULL OR a_dibaca < 7 OR a_dibaca > 3650 THEN
    RAISE EXCEPTION '524 gagal: retensi dibaca % di luar 7..3650 hari', a_dibaca;
  END IF;
  IF a_tak IS NULL OR a_tak < 7 OR a_tak > 3650 THEN
    RAISE EXCEPTION '524 gagal: retensi tak-dibaca % di luar 7..3650 hari', a_tak;
  END IF;

  /*
    INVARIAN: yang BELUM dibaca disimpan minimal selama yang sudah dibaca.

    Kalau terbalik - misalnya "dibaca 90, tak dibaca 30" - maka pesan yang tak
    pernah dilihat siapa pun justru dihapus DULUAN, sementara yang sudah
    ditangani bertahan tiga bulan.

    Otomasinya tetap berjalan dan tetap membalas 200; yang berubah cuma bahwa
    peringatan yang belum sempat dibaca lenyap lebih cepat daripada yang sudah
    selesai. Kekeliruan tanpa gejala seperti itu tak akan ketahuan dari
    pemakaian.
  */
  IF a_tak < a_dibaca THEN
    RAISE EXCEPTION
      '524 gagal: retensi tak-dibaca (%) lebih pendek daripada yang dibaca (%) — pesan yang belum dilihat siapa pun akan dihapus DULUAN',
      a_tak, a_dibaca;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas
   WHERE tugas = 'bersih-notifikasi' AND aktif AND jenis = 'harian';
  IF n <> n_ang THEN
    RAISE EXCEPTION '524 gagal: jadwal HARIAN ada % baris, harus %', n, n_ang;
  END IF;

  /*
    JAM WAJIB SEBELUM otomasi pagi.

    Otomasi paling pagi berjadwal 06:00. Membersihkan SESUDAH itu berarti
    menghapus sebagian notifikasi yang baru saja dibuat pada hari yang sama -
    benar secara aturan, membingungkan bagi yang melihatnya.
  */
  SELECT max(jam) INTO jam_terakhir FROM jadwal_tugas WHERE tugas = 'bersih-notifikasi';
  IF jam_terakhir IS NULL OR jam_terakhir >= '06:00' THEN
    RAISE EXCEPTION
      '524 gagal: pembersih berjadwal % — harus sebelum 06:00, saat otomasi pagi mulai menulis',
      coalesce(jam_terakhir, '(tak ada)');
  END IF;

  /*
    PRASYARAT: harus ada notifikasi untuk dibersihkan.

    Tanpa itu rutenya membalas 200 dengan nol terhapus - tak bisa dibedakan
    dari "semuanya masih relevan". Kelumpuhan yang sama dengan `min_stock` nol
    (425) dan `expediting` kosong (466).
  */
  SELECT count(*) INTO n FROM notifications;
  /*
    KETIADAAN DATA BUKAN KEGAGALAN MIGRASI — DITURUNKAN 2026-08-31.

    Cek ini mencegah kelumpuhan yang nyata: automation yang tak punya bahan
    membalas 200 dengan nol notifikasi, dan itu tak bisa dibedakan dari
    "semuanya beres". Alasannya benar.

    Tapi di basis yang BARU LAHIR tabelnya memang kosong, dan RAISE EXCEPTION
    di sini menghentikan SELURUH rantai migrasi — di CI, VPS baru, dan mesin
    developer baru. Sebelas migrasi sudah melakukan itu hari ini (237, 239,
    271, 295, 320, 323, 335, 337, 392, 425, 428), dan tiap satunya memakan
    satu putaran CI penuh untuk ditemukan.

    Diturunkan jadi CATATAN. Yang hilang: peringatan dini saat seseorang
    memasang automation ini tanpa datanya. Yang didapat: rantai migrasi yang
    bisa berjalan di lingkungan baru mana pun.

    Pertukaran itu berpihak pada yang kedua — automation tanpa data DIAM,
    sementara rantai migrasi yang berhenti membuat SELURUH sistem tak bisa
    dipasang sama sekali.
  */
  IF n < 1 THEN
    RAISE NOTICE '524: notifications kosong di basis ini — pembersih belum punya bahan. Bukan galat.';
  END IF;

  RAISE NOTICE '524 OK: 2 setelan retensi, jadwal harian 03:00 (% badan usaha)', n_aktif;
END $$;
