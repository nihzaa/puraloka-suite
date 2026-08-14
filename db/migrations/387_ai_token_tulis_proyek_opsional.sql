-- ============================================================================
-- 387 — TOKEN TULIS BOLEH TANPA PROYEK
-- ============================================================================
--
-- `ai_token_tulis.project_id` dibuat NOT NULL oleh migrasi 269, dan waktu itu
-- benar: seluruh entitas yang bisa dicatat asisten (catatan progres, temuan
-- punch list) MEMANG selalu menempel pada satu proyek. Kolom yang boleh NULL
-- di sana hanya akan jadi jalan bagi baris yang menggantung tanpa induk.
--
-- Ingatan asisten (migrasi 385) mematahkan asumsi itu — dan bukan sebagai
-- pengecualian yang dipaksakan, melainkan karena memang ada catatan yang tak
-- terikat proyek mana pun:
--
--   "rapat mingguan tiap Senin"      → berlaku se-perusahaan
--   "gaji tukang naik Juli"          → lintas proyek
--   "klien Cimahi minta lapor Jumat" → menempel proyek Cimahi
--
-- Memaksa yang pertama memilih satu proyek berarti mengarang keterikatan yang
-- tak ada, lalu menyaringnya salah saat dibaca: ingatan se-perusahaan akan
-- hilang dari percakapan tentang proyek lain.
--
-- ── Ditemukan test rute, bukan dengan membaca ulang
--
-- Seluruh usulan ingatan mengembalikan 500 dengan pesan yang hanya terlihat
-- di log server: "null value in column project_id violates not-null
-- constraint". Migrasi 385 sendiri hijau — batasannya ada di TABEL LAIN yang
-- kebetulan dipakai ulang.
--
-- ── Kenapa MELONGGARKAN batasan ini aman
--
-- `project_id` di sini bukan gerbang keamanan. Yang menjaga token adalah
-- kepemilikan (`user_id`), umur (15 menit), dan sekali-pakai (`dipakai_pada`)
-- — ketiganya tak tersentuh. Baris yang sudah ada tetap punya proyeknya;
-- yang berubah hanya kemampuan menyimpan token yang memang tak punya.
--
-- Rute `ai-tulis.ts` TETAP mewajibkan `project_id` untuk jenisnya sendiri
-- (422 kalau kosong), jadi pelonggaran ini tak melemahkan jalur itu sama
-- sekali. Yang berubah hanya apa yang BASIS izinkan, bukan apa yang rutenya
-- terima.
-- ============================================================================

ALTER TABLE ai_token_tulis ALTER COLUMN project_id DROP NOT NULL;

COMMENT ON COLUMN ai_token_tulis.project_id IS
  'Proyek yang disentuh token ini. NULL sah sejak migrasi 387 — ingatan '
  'se-perusahaan tak menempel pada proyek mana pun. Rute per-jenis tetap '
  'boleh mewajibkannya sendiri.';

-- ------------------------------------------------------------
-- Verifikasi — termasuk membuktikan token TANPA proyek benar-benar tersimpan.
--
-- Memeriksa `is_nullable` saja tak cukup: itu membuktikan kolomnya berubah,
-- bukan bahwa jalur yang gagal kini berhasil.
-- ------------------------------------------------------------
DO $$
DECLARE
  co UUID;
  us UUID;
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'ai_token_tulis' AND column_name = 'project_id') <> 'YES' THEN
    RAISE EXCEPTION '387 gagal: project_id masih NOT NULL';
  END IF;

  SELECT c.id INTO co FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1;

  IF co IS NOT NULL THEN
    SELECT user_id INTO us FROM company_members WHERE company_id = co LIMIT 1;

    INSERT INTO ai_token_tulis
      (company_id, token, user_id, jenis, aksi, project_id, muatan, ringkasan, kanal, kedaluwarsa)
    VALUES
      (co, '__uji_387__', us, 'ingatan', 'buat', NULL, '{}'::jsonb, 'uji', 'web',
       now() + interval '1 minute');

    DELETE FROM ai_token_tulis WHERE token = '__uji_387__';
  END IF;
END $$;
