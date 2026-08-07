-- ============================================================================
-- 213 — HARI LIBUR: unik yang benar-benar mengikat saat project_id NULL
-- ============================================================================
--
-- ── Cacat yang diperbaiki
--
-- Migrasi 212 menulis `UNIQUE (company_id, project_id, tanggal)` dan mengira
-- itu mencegah libur ganda. Tidak. Di Postgres, NULL tak pernah sama dengan
-- NULL, sehingga baris ber-`project_id IS NULL` — yaitu SELURUH libur nasional,
-- yang paling banyak jumlahnya — lolos berkali-kali tanpa satu pun galat.
--
-- Ditemukan oleh `uji-invarian-jadwal.mjs` pada percobaan pertama, bukan oleh
-- pembacaan ulang migrasinya. Itu justru alasan skrip invarian ada: constraint
-- yang "terlihat benar" dan constraint yang MENOLAK adalah dua hal berbeda.
--
-- ── Kenapa ini bukan sekadar kerapian
--
-- 17 Agustus yang tercatat tiga kali membuat kalender kerja mengeluarkannya
-- tiga kali dari perhitungan? Tidak — `Set` di pustaka menelannya diam-diam,
-- jadi jadwalnya tetap benar. Yang rusak layarnya: daftar libur menampilkan
-- baris kembar, dan orang yang menghapus "salah satunya" mengira sudah
-- selesai padahal masih ada dua. Lalu sebagian dihapus, sebagian tidak, dan
-- tak ada yang tahu mana yang benar.
--
-- ── NULLS NOT DISTINCT
--
-- Tersedia sejak PostgreSQL 15. Membuat dua NULL dianggap SAMA untuk keperluan
-- keunikan — persis yang dimaksudkan sejak awal.
--
-- Idempoten. Verifikasi di blok akhir.

DO $$
DECLARE
  n_kembar int;
BEGIN
  -- Bersihkan kembar yang sudah terlanjur masuk, sisakan yang tertua.
  -- Aman: kolomnya identik, jadi yang dibuang benar-benar salinan.
  WITH kembar AS (
    SELECT id, row_number() OVER (
             PARTITION BY company_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), tanggal
             ORDER BY created_at, id) AS urut
      FROM hari_libur)
  DELETE FROM hari_libur h USING kembar k
   WHERE h.id = k.id AND k.urut > 1;

  GET DIAGNOSTICS n_kembar = ROW_COUNT;
  IF n_kembar > 0 THEN
    RAISE NOTICE 'Membuang % baris libur kembar sebelum memasang constraint.', n_kembar;
  END IF;

  ALTER TABLE hari_libur DROP CONSTRAINT IF EXISTS libur_unik;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'hari_libur'::regclass AND conname = 'libur_unik_nn'
  ) THEN
    ALTER TABLE hari_libur
      ADD CONSTRAINT libur_unik_nn
      UNIQUE NULLS NOT DISTINCT (company_id, project_id, tanggal);
  END IF;
END $$;

-- ── Verifikasi: constraint ADA dan benar-benar NULLS NOT DISTINCT ──────────
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
   WHERE conrelid = 'hari_libur'::regclass AND conname = 'libur_unik_nn';

  IF def IS NULL THEN
    RAISE EXCEPTION 'Constraint libur_unik_nn tak terbentuk';
  END IF;

  -- Bukan sekadar "ada": harus NULLS NOT DISTINCT. Tanpa frasa itu, kita
  -- kembali ke cacat yang sama dengan nama constraint yang berbeda.
  IF def NOT LIKE '%NULLS NOT DISTINCT%' THEN
    RAISE EXCEPTION 'libur_unik_nn terbentuk TANPA NULLS NOT DISTINCT: %', def;
  END IF;

  RAISE NOTICE 'VERIFIKASI 213: %', def;
END $$;
