-- ════════════════════════════════════════════════════════════════════════════
-- 445 — REGISTER DOKUMEN: revisi yang bisa ditelusuri (dk-register)
--
-- ── Keadaan sebelum ini, diukur
--
-- `documents.version` bertipe VARCHAR ber-default '1.0' dan NOL constraint.
-- Rute unggah TIDAK menimpa baris lama — ia membuat baris BARU. Jadi yang
-- terjadi bukan "versi tertimpa" melainkan sesuatu yang lebih buruk:
--
--   dua baris berjudul sama, tanpa satu pun tautan di antaranya
--
-- Daftar dokumen menampilkan keduanya sebagai dokumen terpisah, dan tak ada
-- cara tahu mana yang BERLAKU. Saat dipersoalkan — dan dokumen proyek selalu
-- dipersoalkan — yang menentukan adalah revisi mana yang dipegang siapa, dan
-- pertanyaan itu tak punya jawaban di basis.
--
-- ── Yang sudah BENAR di jalur lain, dan ditiru di sini
--
-- `register_gambar` (migrasi 215) sudah menyimpan revisi bernomor,
-- `digantikan_oleh`, dan status berlaku/digantikan. Modul ini memakai bentuk
-- yang sama supaya keduanya tak perlu dipelajari dua kali.
--
-- ── Status DITURUNKAN, bukan disimpan
--
-- Tak ada kolom `status` di sini, dan itu keputusan yang sama dengan
-- `nilaiRegisterGambar`: kolom status hanya benar kalau ada yang ingat
-- memperbaruinya saat revisi baru terbit. Yang tidak pernah lupa adalah
-- pertanyaan "adakah baris lain yang menggantikan saya" — dan itu bisa
-- dijawab dari FK-nya sendiri.
--
-- ── `ON DELETE SET NULL`, bukan CASCADE
--
-- Menghapus revisi lama TIDAK boleh menghapus revisi barunya. Yang terjadi
-- kalau CASCADE: menghapus rev-1 menghapus rev-2 dan rev-3 sekaligus, dan
-- yang menghapusnya mengira ia hanya merapikan satu baris.
--
-- Idempoten; verifikasi GAGAL KERAS.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS menggantikan_id uuid
    REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS revisi integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN documents.menggantikan_id IS
  'Dokumen yang digantikan baris ini. NULL = revisi pertama. Status '
  'berlaku/digantikan DITURUNKAN dari kolom ini, tidak disimpan — kolom '
  'status hanya benar kalau ada yang ingat memperbaruinya.';

COMMENT ON COLUMN documents.revisi IS
  'Nomor revisi, 1 untuk yang pertama. Diisi rute dari revisi yang '
  'digantikannya + 1, bukan diketik pengguna.';

-- Satu dokumen hanya boleh digantikan SEKALI.
--
-- Tanpa ini, dua unggahan yang sama-sama menunjuk rev-1 menghasilkan dua
-- "rev-2" yang bercabang — dan tak ada cara memilih mana yang berlaku.
-- Percabangan itu tak menghasilkan galat apa pun; ia hanya membuat dua orang
-- memegang dokumen berbeda sambil sama-sama yakin memegang yang terbaru.
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_satu_pengganti
  ON documents (menggantikan_id) WHERE menggantikan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_revisi
  ON documents (project_id, revisi DESC);

-- Dokumen tak boleh menggantikan DIRINYA SENDIRI.
--
-- Terdengar mustahil sampai seseorang menyalin id dari baris yang salah di
-- skrip perbaikan — lalu barisnya jadi berstatus "digantikan oleh dirinya
-- sendiri" dan hilang dari daftar yang berlaku.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_tak_mengganti_diri'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_tak_mengganti_diri
      CHECK (menggantikan_id IS NULL OR menggantikan_id <> id);
  END IF;
END $$;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_proj UUID;
  v_user UUID;
  v_r1   UUID;
  v_r2   UUID;
BEGIN
  SELECT id INTO v_proj FROM projects LIMIT 1;
  SELECT uploaded_by INTO v_user FROM documents WHERE uploaded_by IS NOT NULL LIMIT 1;
  IF v_user IS NULL THEN SELECT id INTO v_user FROM users LIMIT 1; END IF;

  IF v_proj IS NULL OR v_user IS NULL THEN
    RAISE NOTICE '410: tak ada proyek/pengguna untuk diverifikasi — dilewati';
    RETURN;
  END IF;

  INSERT INTO documents (project_id, title, doc_type, file_url, uploaded_by, revisi)
  VALUES (v_proj, '[410-OK] Gambar kerja', 'lainnya', 'uji://r1', v_user, 1)
  RETURNING id INTO v_r1;

  INSERT INTO documents (project_id, title, doc_type, file_url, uploaded_by,
                         revisi, menggantikan_id)
  VALUES (v_proj, '[410-OK] Gambar kerja', 'lainnya', 'uji://r2', v_user, 2, v_r1)
  RETURNING id INTO v_r2;

  -- 1. Status DITURUNKAN: rev-1 digantikan karena ADA baris yang menunjuknya.
  IF NOT EXISTS (SELECT 1 FROM documents WHERE menggantikan_id = v_r1) THEN
    RAISE EXCEPTION '445 gagal: rantai revisi tak tersimpan';
  END IF;

  -- 2. Satu dokumen hanya boleh digantikan SEKALI — percabangan ditolak.
  BEGIN
    INSERT INTO documents (project_id, title, doc_type, file_url, uploaded_by,
                           revisi, menggantikan_id)
    VALUES (v_proj, '[410-OK] Cabang', 'lainnya', 'uji://cabang', v_user, 2, v_r1);
    RAISE EXCEPTION '445 gagal: dua pengganti untuk satu dokumen diterima';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 3. Menggantikan diri sendiri DITOLAK.
  BEGIN
    UPDATE documents SET menggantikan_id = v_r2 WHERE id = v_r2;
    RAISE EXCEPTION '445 gagal: dokumen boleh menggantikan dirinya sendiri';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4. Menghapus revisi LAMA tak menghapus yang baru (SET NULL, bukan CASCADE).
  DELETE FROM documents WHERE id = v_r1;
  IF NOT EXISTS (SELECT 1 FROM documents WHERE id = v_r2) THEN
    RAISE EXCEPTION '445 gagal: menghapus revisi lama ikut menghapus yang baru';
  END IF;
  IF (SELECT menggantikan_id FROM documents WHERE id = v_r2) IS NOT NULL THEN
    RAISE EXCEPTION '445 gagal: rujukan ke revisi terhapus tidak dikosongkan';
  END IF;

  DELETE FROM documents WHERE title LIKE '[410-OK]%';

  RAISE NOTICE '445 OK: rantai revisi dokumen terpasang, 3 pagar terbukti menolak';
END $$;
