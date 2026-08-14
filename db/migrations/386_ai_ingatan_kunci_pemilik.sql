-- ============================================================================
-- 386 — INDEKS UNIK INGATAN YANG BISA DIPAKAI `ON CONFLICT`
-- ============================================================================
--
-- Migrasi 385 memakai DUA indeks unik PARSIAL untuk menahan kunci kembar:
--
--   ai_ingatan_unik_pribadi  (company_id, user_id, kunci) WHERE user_id IS NOT NULL
--   ai_ingatan_unik_bersama  (company_id, kunci)          WHERE user_id IS NULL
--
-- Keduanya BENAR dan tetap dipertahankan — mereka yang menahan cacat NULL
-- (`UNIQUE (company_id, user_id, kunci)` biasa tak menahan apa pun pada lapis
-- bersama, karena NULL tak pernah sama dengan NULL).
--
-- Yang TIDAK bisa mereka lakukan: dipakai sebagai target `ON CONFLICT`.
--
--   ERROR: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- Postgres menuntut klausa `WHERE` indeksnya ikut disebut untuk menyimpulkan
-- indeks parsial, dan PostgREST tak bisa mengirimkannya — `onConflict` hanya
-- menerima daftar kolom.
--
-- Ditemukan test rute, bukan dengan membaca ulang: seluruh penyimpanan
-- ingatan mengembalikan 500, dan gejalanya baru muncul saat jalur tulisnya
-- benar-benar dipanggil. Migrasi 385 sendiri hijau — batasannya memang benar,
-- ia cuma tak bisa dipakai dengan cara itu.
--
-- ── Yang dikerjakan: satu kolom TURUNAN yang membuat keunikannya TOTAL
--
-- `pemilik` = `user_id` kalau ada, atau UUID nol untuk lapis bersama.
-- Dengan begitu keunikannya bisa dinyatakan satu indeks penuh (tanpa WHERE)
-- yang BISA jadi target `ON CONFLICT`.
--
-- UUID nol dipilih, bukan NULL, karena persoalannya memang NULL. Ia tak
-- pernah menunjuk pengguna nyata (`gen_random_uuid()` takkan menghasilkannya),
-- jadi tak ada tabrakan dengan `user_id` siapa pun.
--
-- GENERATED ALWAYS: nilainya tak bisa diisi tangan, jadi tak mungkin
-- menyimpang dari `user_id` yang jadi sumbernya. Kalau ia kolom biasa,
-- satu INSERT yang lupa mengisinya menghasilkan ingatan yang lolos keunikan
-- sambil tampak sah.
--
-- Kedua indeks parsial 385 TIDAK di-drop: mereka lebih ketat dari yang ini
-- (menahan hal yang sama, dan lebih dulu). Membiarkannya berarti dua jaring
-- untuk satu kesalahan yang mahal.
-- ============================================================================

ALTER TABLE ai_ingatan
  ADD COLUMN IF NOT EXISTS pemilik UUID
  GENERATED ALWAYS AS (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS ai_ingatan_unik_pemilik
  ON ai_ingatan (company_id, pemilik, kunci);

COMMENT ON COLUMN ai_ingatan.pemilik IS
  'Turunan user_id (UUID nol = lapis bersama). Ada semata-mata supaya keunikan '
  'kunci bisa jadi target ON CONFLICT — indeks parsial tak bisa dipakai PostgREST.';

-- ------------------------------------------------------------
-- Verifikasi — termasuk membuktikan ON CONFLICT-nya BENAR-BENAR bisa dipakai.
--
-- Bukan sekadar "indeksnya ada": indeks yang ada tetapi tak bisa jadi target
-- adalah persis keadaan yang migrasi ini perbaiki, dan ia lolos pemeriksaan
-- keberadaan tanpa satu pun keluhan.
-- ------------------------------------------------------------
DO $$
DECLARE
  co UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'ai_ingatan' AND column_name = 'pemilik'
  ) THEN
    RAISE EXCEPTION '386 gagal: kolom pemilik tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'ai_ingatan' AND indexname = 'ai_ingatan_unik_pemilik'
  ) THEN
    RAISE EXCEPTION '386 gagal: indeks unik penuh tidak terbentuk';
  END IF;

  SELECT c.id INTO co
    FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
   LIMIT 1;

  IF co IS NOT NULL THEN
    INSERT INTO ai_ingatan (company_id, user_id, lapis, kunci, nilai)
    VALUES (co, NULL, 'bersama', '__uji_386__', 'a')
    ON CONFLICT (company_id, pemilik, kunci) DO UPDATE SET nilai = EXCLUDED.nilai;

    INSERT INTO ai_ingatan (company_id, user_id, lapis, kunci, nilai)
    VALUES (co, NULL, 'bersama', '__uji_386__', 'b')
    ON CONFLICT (company_id, pemilik, kunci) DO UPDATE SET nilai = EXCLUDED.nilai;

    IF (SELECT count(*) FROM ai_ingatan WHERE kunci = '__uji_386__') <> 1 THEN
      RAISE EXCEPTION '386 gagal: upsert menumpuk alih-alih menimpa';
    END IF;

    DELETE FROM ai_ingatan WHERE kunci = '__uji_386__';
  END IF;
END $$;
