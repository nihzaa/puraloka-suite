-- ============================================================================
-- 391 — WAKTU SASARAN ACAK: PENJADWAL YANG TAK TERASA MESIN
-- ============================================================================
--
-- Fase 4 dari rencana asisten. Founder 2026-08-14:
--
--   *"maksudnya assisten saya itu seperti manusia yg random aja dan emang ga
--    tepat seperti yang dijadwalkan"*
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA PENJADWAL YANG ADA TIDAK CUKUP — DAN KENAPA IA TETAP DIPAKAI
-- ══════════════════════════════════════════════════════════════════════════
--
-- `jadwal_tugas` (migrasi 244) hanya mengenal `harian|mingguan|bulanan` +
-- `jam` HH:MM. Itu PERSIS jam kaku yang founder tolak: pesan pukul 07:00 tiap
-- hari berhenti dibaca dalam seminggu, karena orang tahu persis kapan ia
-- datang dan apa isinya.
--
-- Tapi menggantinya akan membuang tiga hal yang sudah terbukti:
--
--   · `harusJalan()` — "sudah lewat tenggat DAN belum jalan periode ini"
--   · klaim ATOMIK — `terakhir_jalan` lama ikut di WHERE, jadi dua cron yang
--     tumpang tindih tak bisa sama-sama menjalankan tugas yang sama
--   · heartbeat GitHub Actions tiap 15 menit yang sudah berjalan
--
-- Jadi yang diubah bukan penjadwalnya, melainkan WAKTU SASARANNYA:
--
--   `jam`            tetap — sekarang berarti AWAL JENDELA
--   `jendela_menit`  seberapa lebar rentang acaknya (mis. 600 = 10 jam)
--   `sasaran_berikut` waktu acak yang dipilih untuk periode ini
--
-- `harusJalan()` tetap memutuskan "periode ini sudah waktunya"; sesudah itu
-- pemanggil menunggu sampai `now() >= sasaran_berikut`. Hasilnya: sapaan
-- datang 09:12, lalu 14:40, lalu 11:05 — tanpa satu baris pun logika klaim
-- ditulis ulang.
--
-- ── Resolusi terbatas 15 menit, dan itu disengaja disebutkan
--
-- Heartbeat-nya tiap 15 menit, jadi "09:12" pada praktiknya jadi tick 09:15.
-- Itu tetap tak terduga bagi pembacanya — yang penting bukan presisi menit,
-- melainkan bahwa jamnya berbeda tiap hari.
--
-- ── Kenapa `sasaran_berikut` DISIMPAN, bukan dihitung ulang tiap tick
--
-- Diacak ulang tiap 15 menit berarti peluangnya menumpuk: satu tugas dengan
-- jendela 10 jam akan hampir pasti tertembak dalam beberapa tick pertama,
-- dan hasilnya justru selalu pagi. Disimpan sekali per periode, ia benar-benar
-- tersebar merata.
-- ============================================================================

ALTER TABLE jadwal_tugas
  ADD COLUMN IF NOT EXISTS jendela_menit INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sasaran_berikut TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jadwal_tugas_jendela_wajar'
  ) THEN
    -- 0 = perilaku lama (jalan tepat di `jam`). Batas atas 12 jam: jendela
    -- yang lebih lebar dari satu hari kerja berarti "kapan saja", dan
    -- "kapan saja" termasuk jam yang tak seorang pun mau dihubungi.
    ALTER TABLE jadwal_tugas
      ADD CONSTRAINT jadwal_tugas_jendela_wajar
      CHECK (jendela_menit BETWEEN 0 AND 720);
  END IF;
END $$;

COMMENT ON COLUMN jadwal_tugas.jendela_menit IS
  'Lebar jendela acak dalam menit. 0 = jalan tepat pada `jam` (perilaku lama). '
  'Waktu sasarannya disimpan di `sasaran_berikut`, dipilih sekali per periode.';

COMMENT ON COLUMN jadwal_tugas.sasaran_berikut IS
  'Waktu acak yang dipilih untuk periode berjalan. Tugas menunggu sampai '
  'now() >= nilai ini, sesudah harusJalan() menyatakan periodenya tiba.';

-- ------------------------------------------------------------
-- Kanal percakapan untuk giliran PROAKTIF
--
-- `ai_percakapan.kanal` (migrasi 252) hanya mengenal web|ai_whatsapp|api.
-- Giliran yang DIMULAI SISTEM bukan salah satunya: ia bukan web, dan
-- menandainya `ai_whatsapp` akan membuatnya tercampur dengan percakapan yang
-- dimulai orang — padahal keduanya berbeda persis pada hal yang paling
-- menentukan (siapa yang memulai).
-- ------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE ai_percakapan DROP CONSTRAINT IF EXISTS ai_percakapan_kanal_sah;
  ALTER TABLE ai_percakapan
    ADD CONSTRAINT ai_percakapan_kanal_sah
    CHECK (kanal IN ('web', 'ai_whatsapp', 'api', 'proaktif'));
END $$;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'jadwal_tugas' AND column_name = 'sasaran_berikut'
  ) THEN
    RAISE EXCEPTION '391 gagal: kolom sasaran_berikut tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jadwal_tugas_jendela_wajar'
  ) THEN
    RAISE EXCEPTION '391 gagal: CHECK jendela_menit tidak terpasang';
  END IF;

  -- Kanal proaktif HARUS benar-benar bisa dipakai — memeriksa keberadaan
  -- constraint saja tak membuktikan nilainya diterima.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ai_percakapan_kanal_sah'
       AND pg_get_constraintdef(oid) LIKE '%proaktif%'
  ) THEN
    RAISE EXCEPTION '391 gagal: kanal proaktif tak diterima ai_percakapan';
  END IF;
END $$;
