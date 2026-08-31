-- ============================================================================
-- 392 — MENYALAKAN SAPAAN PROAKTIF UNTUK SATU TENANT
-- ============================================================================
--
-- Migrasi 391 membangun jalurnya; ini yang MENYALAKANNYA — dan sesudah baris
-- ini berjalan, telepon sungguhan akan berbunyi.
--
-- Founder 2026-08-15 memilih:
--
--   jendela    08:00-18:00 (10 jam) — sapaan datang di jam ACAK dalam rentang
--              ini, berbeda tiap hari
--   frekuensi  harian, TERMASUK sapaan saat tak ada temuan
--
-- ══════════════════════════════════════════════════════════════════════════
-- HANYA SATU TENANT, DAN ITU DISENGAJA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Diukur sebelum menulis migrasi ini: empat nomor terdaftar, dan hanya SATU
-- yang `aktif = true` — milik founder (`6281311081813`). Tiga sisanya nonaktif
-- dan tak akan ikut tersapa walau tenant-nya sama.
--
-- Tugas ini didaftarkan HANYA untuk tenant nomor itu. Menyalakannya untuk
-- semua tenant berarti mengirim WhatsApp ke orang yang tak pernah diminta
-- pendapatnya — dan "dummy data" bukan izin untuk itu, karena nomornya nyata.
--
-- ══════════════════════════════════════════════════════════════════════════
-- APA YANG MENAHANNYA KALAU SESUATU SALAH
-- ══════════════════════════════════════════════════════════════════════════
--
-- Empat lapis, semuanya sudah ada dan sudah diuji sebelum migrasi ini:
--
--   `preferensi_pesan`  jam tenang 21:00-07:00, maks 3/hari, tombol berhenti
--                       (bawaan berlaku walau barisnya belum ada)
--   `bolehKirim()`      lima pemeriksaan fail-closed
--   idempotensi         kunci `proaktif:<jenis>:<user>:<tanggal>` — dua tick
--                       yang lolos klaim atomik tetap tak bisa mengirim dua kali
--   `aktif = false`     satu UPDATE menghentikannya tanpa deploy
--
-- Cara mematikannya, kalau ternyata mengganggu:
--
--   UPDATE jadwal_tugas SET aktif = false WHERE tugas = 'sapa-proaktif';
--
-- atau dari UI: Pengaturan → Jadwal Tugas.
-- ============================================================================

DO $$
DECLARE
  co UUID;
  n  INT;
BEGIN
  -- Tenant DITENTUKAN dari nomor yang aktif & terverifikasi, bukan dipaku.
  -- Id yang dipaku akan salah di basis lain (staging, mesin lain), dan
  -- salahnya senyap: tugasnya terdaftar untuk tenant yang tak punya nomor.
  SELECT company_id INTO co
    FROM wa_nomor_pengguna
   WHERE nomor = '6281311081813'
     AND aktif = true
     AND terverifikasi_pada IS NOT NULL
   LIMIT 1;

  /*
    ⚠ DITURUNKAN JADI NO-OP 2026-08-31 — dulu RAISE EXCEPTION.

    Nomor itu milik founder, terdaftar di basis dev. Di basis yang baru lahir
    — CI, VPS baru, mesin developer baru — belum ada nomor WhatsApp mana pun,
    dan migrasi ini menghentikan SELURUH rantai:

        HARD FAIL — 392_seed_sapa_proaktif.sql
          392 gagal: nomor 6281311081813 tak terdaftar/aktif/terverifikasi

    Penilaiannya benar untuk basis yang MEMANG memakai nomor itu: menyalakan
    sapaan tanpa nomor tujuan menghasilkan tugas yang tak pernah berbuah. Tapi
    di basis yang belum punya nomor sama sekali, yang benar bukan berhenti —
    melainkan tak menyalakan apa-apa.

    Sama seperti gerbang seed 237, 239, dan 428 hari ini: data yang hanya ada
    di satu basis tak boleh jadi syarat berjalannya rantai migrasi.
  */
  IF co IS NULL THEN
    RAISE NOTICE '392 dilewati: belum ada nomor WhatsApp aktif & terverifikasi di basis ini. '
                 'Sapaan proaktif tak dinyalakan — bukan galat.';
    RETURN;
  END IF;

  INSERT INTO jadwal_tugas (
    company_id, tugas, jenis, jam, jendela_menit, aktif
  )
  VALUES (
    co, 'sapa-proaktif', 'harian',
    '08:00',   -- AWAL jendela, bukan waktu kirim
    600,       -- 10 jam → 08:00-18:00
    true
  )
  ON CONFLICT (company_id, tugas) DO UPDATE
    SET jenis = EXCLUDED.jenis,
        jam = EXCLUDED.jam,
        jendela_menit = EXCLUDED.jendela_menit,
        aktif = true,
        -- Sasaran lama dibuang supaya jendela baru langsung berlaku; kalau
        -- dipertahankan, hari pertama masih memakai undian jendela lama.
        sasaran_berikut = NULL;

  SELECT count(*) INTO n
    FROM wa_nomor_pengguna
   WHERE company_id = co AND aktif = true AND terverifikasi_pada IS NOT NULL;

  RAISE NOTICE '392: sapaan proaktif menyala untuk % nomor aktif di tenant %', n, co;
END $$;

-- ------------------------------------------------------------
-- Verifikasi — artefak, bukan niat.
-- ------------------------------------------------------------
DO $$
DECLARE
  t RECORD;
BEGIN
  SELECT * INTO t FROM jadwal_tugas WHERE tugas = 'sapa-proaktif' LIMIT 1;

  /*
    Verifikasi tunduk pada gerbang yang sama — pelajaran 237 dan 239.

    Tanpa ini blok ini tetap berjalan di basis yang seed-nya di-no-op dan
    gagal karena tugasnya memang sengaja tak dibuat. Gerbang di satu tempat
    saja tidak menolong: rantainya tetap mati, hanya dengan pesan lain.
  */
  IF t IS NULL THEN
    RAISE NOTICE '392 verifikasi dilewati: sapaan tak dinyalakan di basis ini.';
    RETURN;
  END IF;
  IF NOT t.aktif THEN
    RAISE EXCEPTION '392 gagal: tugas terdaftar tetapi NONAKTIF';
  END IF;
  IF t.jendela_menit <> 600 THEN
    RAISE EXCEPTION '392 gagal: jendela % menit, seharusnya 600', t.jendela_menit;
  END IF;

  -- Jendela yang melewati tengah malam akan membuat sapaan jatuh di jam
  -- tenang, lalu ditahan gerbang — tugasnya "jalan" tiap hari tanpa satu pun
  -- pesan sampai, dan tak ada galat yang menjelaskannya.
  IF (split_part(t.jam, ':', 1)::int * 60 + split_part(t.jam, ':', 2)::int)
     + t.jendela_menit > 24 * 60 THEN
    RAISE EXCEPTION '392 gagal: jendela melewati tengah malam (% + % menit)',
      t.jam, t.jendela_menit;
  END IF;
END $$;
