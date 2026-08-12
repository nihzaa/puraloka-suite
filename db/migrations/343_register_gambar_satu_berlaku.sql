-- ════════════════════════════════════════════════════════════════════════════
-- 343 — Register gambar: satu revisi BERLAKU per nomor
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Lubang yang ditutup, diukur 2026-08-12
--
-- `STR-101` punya DUA baris berstatus `berlaku`: revisi 1 dan revisi 2.
-- `digantikan_oleh` NOL dari 5 baris.
--
-- Akibatnya di lapangan bukan sekadar data tak rapi: orang yang membuka
-- register melihat dua gambar sah untuk satu nomor, dan harus menebak mana
-- yang dipakai. Menebak salah berarti mengerjakan gambar revisi lama —
-- pekerjaan yang harus dibongkar, dan biayanya jauh melebihi biaya menjaga
-- satu baris.
--
-- ── Rutenya SUDAH benar; yang kurang adalah basisnya
--
-- `POST /kendali-dokumen/gambar` menandai revisi lama `digantikan` begitu
-- revisi baru masuk, dan mencatat kegagalannya alih-alih menelannya. Diperiksa
-- ke `created_at`: kedua baris STR-101 lahir pada DETIK YANG SAMA, jadi
-- keduanya dari seed, bukan lewat rute.
--
-- Tetapi basis tak mencegahnya. Importer, skrip perbaikan data, dan psql
-- menulis ke sini juga — dan yang tak dijaga basis cepat atau lambat masuk
-- lewat jalur yang tak dijaga aplikasi. Pelajaran yang sama dengan 325 dan 327.
--
-- ── Kenapa data lama DIPERBAIKI, bukan dikecualikan
--
-- Berbeda dari `CBS-SMOKE` (migrasi 335) yang dibiarkan karena trigger lama
-- melarang mengubahnya: di sini tak ada jaminan yang bertabrakan, dan
-- membiarkan dua revisi berlaku berarti membiarkan cacat yang justru
-- ditutup migrasi ini.
--
-- Yang diperbaiki: revisi TERTINGGI tetap `berlaku`, sisanya `digantikan`
-- dan `digantikan_oleh` menunjuk ke yang tertinggi itu. Itu keadaan yang
-- akan dihasilkan rutenya sendiri bila revisinya masuk berurutan.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Perbaiki data lama ───────────────────────────────────────────────────
WITH tertinggi AS (
  SELECT DISTINCT ON (project_id, nomor)
         id, project_id, nomor, revisi
    FROM register_gambar
   WHERE status = 'berlaku'
   ORDER BY project_id, nomor, revisi DESC
)
UPDATE register_gambar rg
   SET status = 'digantikan',
       digantikan_oleh = t.id,
       updated_at = now()
  FROM tertinggi t
 WHERE rg.project_id = t.project_id
   AND rg.nomor = t.nomor
   AND rg.status = 'berlaku'
   AND rg.revisi < t.revisi;

-- ── 2. Basis menegakkan: satu BERLAKU per (proyek, nomor) ───────────────────
--
-- Index PARSIAL, bukan constraint: revisi `digantikan` HARUS boleh berulang —
-- itu justru riwayatnya, dan riwayat yang tak boleh berulang bukan riwayat.
CREATE UNIQUE INDEX IF NOT EXISTS register_gambar_satu_berlaku
  ON register_gambar (project_id, nomor)
  WHERE status = 'berlaku';

-- ── 3. `digantikan_oleh` wajib menunjuk gambar yang NYATA dan SEBIDANG ──────
--
-- FK saja tak cukup: ia hanya menjamin barisnya ada, bukan bahwa ia gambar
-- dengan NOMOR yang sama di PROYEK yang sama. Revisi yang menunjuk gambar
-- lain adalah rantai riwayat yang menyesatkan — dan yang menelusurinya akan
-- sampai ke gambar yang tak pernah menggantikannya.
CREATE OR REPLACE FUNCTION fn_register_gambar_pengganti_sebidang()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nomor   TEXT;
  v_project UUID;
  v_revisi  INT;
BEGIN
  IF NEW.digantikan_oleh IS NULL THEN RETURN NEW; END IF;

  -- "Menggantikan diri sendiri" TIDAK diperiksa di sini: constraint
  -- `gambar_bukan_pengganti_diri` sudah menegakkannya sejak tabelnya lahir.
  -- Memeriksanya dua kali berarti dua pesan galat untuk satu pelanggaran.

  SELECT nomor, project_id, revisi
    INTO v_nomor, v_project, v_revisi
    FROM register_gambar WHERE id = NEW.digantikan_oleh;

  IF v_nomor IS DISTINCT FROM NEW.nomor OR v_project IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION
      'Pengganti harus gambar bernomor SAMA di proyek yang sama — rantai riwayat yang menunjuk gambar lain menyesatkan siapa pun yang menelusurinya'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_revisi <= NEW.revisi THEN
    RAISE EXCEPTION
      'Pengganti (revisi %) tak lebih baru dari yang digantikan (revisi %)', v_revisi, NEW.revisi
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_register_gambar_pengganti_sebidang ON register_gambar;
CREATE TRIGGER trg_register_gambar_pengganti_sebidang
  BEFORE INSERT OR UPDATE OF digantikan_oleh, nomor, project_id, revisi ON register_gambar
  FOR EACH ROW EXECUTE FUNCTION fn_register_gambar_pengganti_sebidang();

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  co    UUID;
  pr    UUID;
  g1    UUID;
  g2    UUID;
  n     INT;
  gagal BOOLEAN;
BEGIN
  -- 1. NOL nomor ber-dua-revisi-berlaku sesudah perbaikan.
  SELECT count(*) INTO n FROM (
    SELECT project_id, nomor FROM register_gambar
     WHERE status = 'berlaku' GROUP BY 1, 2 HAVING count(*) > 1
  ) x;
  IF n > 0 THEN
    RAISE EXCEPTION '343 gagal: % nomor masih punya lebih dari satu revisi BERLAKU — pembaca harus menebak mana yang dipakai', n;
  END IF;

  -- 2. Yang ditandai digantikan PUNYA penunjuk penggantinya.
  SELECT count(*) INTO n FROM register_gambar
   WHERE status = 'digantikan' AND digantikan_oleh IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '343 gagal: % revisi digantikan tanpa penunjuk penggantinya — rantai riwayatnya putus', n;
  END IF;

  -- Fixture dipilih menurut SYARAT (pelajaran migrasi 328).
  SELECT p.company_id, p.id INTO co, pr FROM projects p LIMIT 1;
  IF pr IS NULL THEN
    RAISE EXCEPTION '343 gagal: nol proyek — verifikasi tak bisa dipercaya';
  END IF;

  -- 3. Revisi pertama masuk.
  INSERT INTO register_gambar (company_id, project_id, nomor, judul, disiplin, revisi, tahap, status)
  VALUES (co, pr, 'VERIF343', 'uji rev 0', 'arsitektur', 0, 'IFR', 'berlaku')
  RETURNING id INTO g1;

  -- 4. Revisi KEDUA berstatus berlaku DITOLAK selama yang pertama masih berlaku.
  gagal := FALSE;
  BEGIN
    INSERT INTO register_gambar (company_id, project_id, nomor, judul, disiplin, revisi, tahap, status)
    VALUES (co, pr, 'VERIF343', 'uji rev 1', 'arsitektur', 1, 'IFR', 'berlaku');
  EXCEPTION WHEN unique_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '343 gagal: dua revisi BERLAKU diterima — lapangan harus menebak mana yang dipakai';
  END IF;

  -- 5. Urutan yang BENAR — dan ia MENUNTUT dua langkah.
  --
  -- `gambar_pengganti_jelas` menolak status `digantikan` tanpa penunjuk, jadi
  -- revisi baru tak bisa masuk sebagai `digantikan` sementara (ia belum punya
  -- pengganti). Yang sah: masukkan revisi baru sebagai `ditarik` dulu — status
  -- ketiga yang memang ada untuk keadaan antara — lalu tandai yang lama
  -- digantikan, lalu naikkan yang baru jadi berlaku.
  --
  -- Rutenya sendiri melakukannya terbalik (insert berlaku → tandai lama), dan
  -- itu SAH karena index parsial baru diperiksa saat commit pernyataan.
  INSERT INTO register_gambar (company_id, project_id, nomor, judul, disiplin, revisi, tahap, status)
  VALUES (co, pr, 'VERIF343', 'uji rev 1', 'arsitektur', 1, 'IFR', 'ditarik')
  RETURNING id INTO g2;
  UPDATE register_gambar SET status = 'digantikan', digantikan_oleh = g2 WHERE id = g1;
  UPDATE register_gambar SET status = 'berlaku' WHERE id = g2;

  -- 6. Pengganti dari NOMOR LAIN ditolak.
  --
  -- Fixture-nya DIBUAT, bukan pemeriksaannya dilewati. Versi pertama migrasi
  -- ini melewatinya dengan NOTICE ketika proyek fixture kebetulan tak punya
  -- gambar lain — dan pemeriksaan yang dilewati karena data kebetulan tak ada
  -- adalah pemeriksaan yang tak pernah menjaga apa pun.
  DECLARE g3 UUID;
  BEGIN
    INSERT INTO register_gambar (company_id, project_id, nomor, judul, disiplin, revisi, tahap, status)
    VALUES (co, pr, 'VERIF343-LAIN', 'gambar bernomor lain', 'struktur', 0, 'IFR', 'berlaku')
    RETURNING id INTO g3;

    gagal := FALSE;
    BEGIN
      UPDATE register_gambar SET digantikan_oleh = g3 WHERE id = g1;
    EXCEPTION WHEN check_violation THEN gagal := TRUE;
    END;
    IF NOT gagal THEN
      RAISE EXCEPTION '343 gagal: pengganti dari NOMOR LAIN diterima — rantai riwayatnya menyesatkan';
    END IF;
  END;
  -- 7. Menggantikan diri sendiri ditolak — oleh constraint LAMA
  --     (`gambar_bukan_pengganti_diri`), bukan oleh migrasi ini. Diperiksa di
  --     sini karena rantai riwayat bergantung padanya, dan jaminan yang
  --     dipakai tanpa diperiksa bisa hilang tanpa disadari.
  gagal := FALSE;
  BEGIN
    UPDATE register_gambar SET digantikan_oleh = g1 WHERE id = g1;
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '343 gagal: gambar bisa menggantikan dirinya sendiri';
  END IF;

  -- 8. Pengganti ber-revisi LEBIH LAMA ditolak.
  gagal := FALSE;
  BEGIN
    UPDATE register_gambar SET digantikan_oleh = g1 WHERE id = g2;
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '343 gagal: revisi baru bisa digantikan oleh yang LEBIH LAMA';
  END IF;

  DELETE FROM register_gambar WHERE nomor LIKE 'VERIF343%';

  RAISE NOTICE '343 OK — satu revisi berlaku per nomor, rantai pengganti sebidang & maju';
END $$;
