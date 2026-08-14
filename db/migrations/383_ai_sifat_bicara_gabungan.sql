-- ============================================================================
-- 383 — WATAK ASISTEN JADI GABUNGAN SIFAT, BUKAN SATU MODE
-- ============================================================================
--
-- Migrasi 382 (kemarin, sesi yang sama) memberi asisten SATU `mode_bicara`:
-- `pelapor` | `penasihat` | `teman`. Founder mencobanya lalu berkata: *"kalo
-- pilihannya juga saya mau bisa semua"*.
--
-- Permintaan itu menunjukkan cacat pemodelan di 382, bukan sekadar selera.
-- Ketiga mode itu diperlakukan saling meniadakan, padahal **dua di antaranya
-- tidak bertentangan sama sekali**:
--
--   "boleh memberi saran"   dan   "boleh mengobrol santai"
--
-- Tak ada alasan asisten pemilik harus memilih salah satu. Yang membuatnya
-- tampak harus memilih hanyalah bentuk penyimpanannya — satu kolom teks yang
-- cuma muat satu nilai. Model datanya yang memaksakan pilihan palsu.
--
-- Maka `mode_bicara` (satu) diganti `sifat_bicara` (himpunan). `pelapor`
-- lenyap sebagai nilai, karena ia sebenarnya bukan sifat melainkan KETIADAAN
-- sifat: asisten yang tak diberi kemampuan apa pun memang hanya melapor.
-- Array kosong menyatakan itu dengan jujur, dan tak perlu nilai khusus untuk
-- "tidak ada".
--
--   sifat_bicara = '{}'                    → pelapor (bawaan, perilaku lama)
--   sifat_bicara = '{menyarankan}'         → penasihat
--   sifat_bicara = '{mengobrol}'           → teman
--   sifat_bicara = '{menyarankan,mengobrol}' → keduanya  ← yang diminta founder
--
-- ── Kenapa TEXT[] dan bukan tabel sendiri
--
-- Sifatnya sedikit, tertutup, dan ditentukan pengembang — bukan data yang
-- ditambah tenant. Tabel terpisah untuk himpunan sekecil ini menambah satu
-- join di jalur yang dibaca TIAP pertanyaan, tanpa satu pun pertanyaan yang
-- jadi bisa dijawab karenanya. Pola yang sama sudah dipakai `tool_aktif`.
--
-- ── Kenapa kolom lama dipensiunkan, bukan di-DROP
--
-- Sama seperti 382 terhadap plafon: kode yang masih membaca `mode_bicara`
-- akan mendapat nilai yang benar sampai ia diganti. Menghapusnya hari ini
-- membuat rollback mustahil, dan umurnya cuma satu commit.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Kolom himpunan sifat
-- ------------------------------------------------------------
ALTER TABLE ai_provider_config
  ADD COLUMN IF NOT EXISTS sifat_bicara TEXT[] NOT NULL DEFAULT '{}';

-- Isi array DIJAGA BASIS, bukan hanya aplikasi. Nilai asing yang lolos ke
-- sini akan diam-diam diabaikan saat prompt disusun — asisten berperilaku
-- beda dari yang tertulis di layar, tanpa satu pun galat.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_provider_sifat_bicara_sah'
  ) THEN
    ALTER TABLE ai_provider_config
      ADD CONSTRAINT ai_provider_sifat_bicara_sah
      CHECK (sifat_bicara <@ ARRAY['menyarankan', 'mengobrol']::TEXT[]);
  END IF;
END $$;

COMMENT ON COLUMN ai_provider_config.sifat_bicara IS
  'Himpunan sifat yang BISA DIGABUNG. Array kosong = pelapor (hanya menjawab '
  'dari data). Pagar fakta ikut apa pun isinya dan tak bisa dimatikan dari sini.';

-- ------------------------------------------------------------
-- 2. Bawa nilai lama — nol tenant kehilangan pilihannya
-- ------------------------------------------------------------
-- Hanya menyentuh baris yang belum punya sifat, supaya migrasi ini aman
-- dijalankan ulang sesudah ada yang menyunting dari UI.
UPDATE ai_provider_config
   SET sifat_bicara = CASE mode_bicara
         WHEN 'penasihat' THEN ARRAY['menyarankan']
         WHEN 'teman'     THEN ARRAY['menyarankan', 'mengobrol']
         ELSE ARRAY[]::TEXT[]
       END
 WHERE sifat_bicara = '{}'
   AND mode_bicara IS DISTINCT FROM 'pelapor';

-- `teman` lama membawa DUA sifat, bukan satu. Alasannya ada di teks gaya 382:
-- mode itu sudah mewajibkan penandaan opini ("Menurut saya"), jadi ia memang
-- sudah mengizinkan berpendapat — mengubahnya jadi `{mengobrol}` saja akan
-- diam-diam MENCABUT kemampuan yang sudah dimiliki tenant.

COMMENT ON COLUMN ai_provider_config.mode_bicara IS
  'DIPENSIUNKAN oleh migrasi 383 — diganti sifat_bicara yang bisa memuat lebih '
  'dari satu sifat. Belum di-DROP supaya rollback tetap mungkin.';

-- ------------------------------------------------------------
-- 3. Verifikasi — artefak fisik, bukan catatan di buku migrasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_bocor INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'ai_provider_config' AND column_name = 'sifat_bicara'
  ) THEN
    RAISE EXCEPTION '383 gagal: kolom sifat_bicara tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_provider_sifat_bicara_sah'
  ) THEN
    RAISE EXCEPTION '383 gagal: CHECK sifat_bicara tidak terpasang';
  END IF;

  -- Tak boleh ada baris yang dulu berwatak tetapi kini tak bersifat apa pun.
  SELECT count(*) INTO n_bocor
    FROM ai_provider_config
   WHERE mode_bicara IN ('penasihat', 'teman')
     AND sifat_bicara = '{}';

  IF n_bocor > 0 THEN
    RAISE EXCEPTION '383 gagal: % asisten kehilangan wataknya saat dipindahkan', n_bocor;
  END IF;
END $$;
