-- ============================================================================
-- Migration 175 — PENEGAS BENTUK GL. Gagal keras bila GL tidak tenant-aware.
-- ============================================================================
--
-- Ratifikasi founder 2026-08-03 (R-001, syarat 2).
--
-- ── Kenapa migrasi ini ada
--
-- Cacat P0 yang ditemukan 2026-08-02: migrasi 047 (single-tenant) dan 167
-- (tenant-aware) sama-sama mendefinisikan `accounts`/`journal_entries`/
-- `journal_entry_lines`, keduanya dengan `CREATE TABLE IF NOT EXISTS`. Di
-- lingkungan yang menjalankan migrasi berurutan dari nol, 047 menang dan 167
-- **no-op senyap** — buku besar kehilangan kemampuan memisahkan perusahaan
-- tanpa satu pun pesan galat.
--
-- 047 sudah dipensiunkan menjadi no-op. Tetapi memensiunkannya saja **tidak
-- cukup**, karena:
--
--   1. Lingkungan yang SUDAH terlanjur menjalankan 047 versi lama tetap memiliki
--      tabel berbentuk salah. Migrasi 167 tak akan memperbaikinya (IF NOT EXISTS).
--   2. Cacat kelas ini bisa kembali lewat migrasi baru mana pun yang menyentuh
--      GL. Komentar tidak menghentikan apa pun; yang menghentikan adalah kode
--      yang menolak berjalan.
--
-- ── Kenapa GAGAL KERAS, bukan memperbaiki sendiri
--
-- Migrasi ini sengaja TIDAK mencoba menambal tabel berbentuk salah (mis. dengan
-- `ALTER TABLE … ADD COLUMN company_id`). Alasannya: kalau `accounts` sudah
-- berisi baris dari dua perusahaan yang tercampur, **tidak ada cara mekanis
-- untuk memisahkannya** — persis yang dinyatakan ADR-011 sebagai titik
-- tanpa-jalan-kembali. Menambal diam-diam akan menghasilkan data yang terlihat
-- benar tetapi salah secara akuntansi.
--
-- Yang benar: BERHENTI, dan minta lingkungan itu di-reset dari nol
-- (`gh workflow run ci-isolation.yml -f action=setup-clean`). Aman dilakukan
-- selama belum ada data produksi — dan hari ini `journal_entries` berisi 0 baris.
--
-- ── Idempoten
--
-- Migrasi ini hanya membaca katalog dan mungkin melempar. Dijalankan berapa kali
-- pun hasilnya sama, dan ia tak pernah mengubah apa pun.
-- ============================================================================

DO $$
DECLARE
  v_hilang TEXT[] := ARRAY[]::TEXT[];
  v_tabel  TEXT;
  v_kolom  TEXT;
BEGIN
  -- Ketiga tabel GL WAJIB ada. Kalau belum ada sama sekali, itu bukan kesalahan:
  -- berarti 167 belum dijalankan di lingkungan ini (mis. replay parsial). Diam,
  -- biarkan 167 yang membuatnya.
  IF to_regclass(current_schema() || '.accounts') IS NULL THEN
    RAISE NOTICE '175: `accounts` belum ada — 167 belum dijalankan di lingkungan ini. Dilewati.';
    RETURN;
  END IF;

  -- ── Penanda bentuk yang WAJIB ada (bentuk 167, tenant-aware) ──────────────
  --
  -- PENTING — `journal_entry_lines` sengaja TIDAK ada di daftar ini.
  --
  -- Versi pertama penegas ini menuntut `company_id` di ketiganya, dan langsung
  -- melempar saat diuji terhadap dev. Ternyata penegasnya yang salah, bukan
  -- datanya: migrasi 167 memberi baris jurnal tenancy lewat INDUKNYA
  -- (`entry_id` → `journal_entries.company_id`), bukan lewat kolom sendiri —
  -- kategori C, dan komentarnya menyatakan itu eksplisit di baris 155-156:
  -- *"Dimensi opsional untuk laporan per-proyek. BUKAN jalur tenancy — itu
  -- `company_id` di kepala jurnal."*
  --
  -- Menuntut kolom yang memang sengaja tidak ada akan membuat migrasi ini gagal
  -- di lingkungan yang justru BENAR. Penjaga yang salah lebih berbahaya daripada
  -- tak ada penjaga: ia melatih orang mengabaikan kegagalannya.
  --
  -- Yang dijaga untuk `journal_entry_lines` adalah FK ke induknya — itulah
  -- jalur tenancy sesungguhnya. Diperiksa terpisah di bawah.
  FOR v_tabel, v_kolom IN
    SELECT * FROM (VALUES
      ('accounts',        'company_id'),
      ('accounts',        'type'),
      ('journal_entries', 'company_id')
    ) AS t(tabel, kolom)
  LOOP
    IF to_regclass(current_schema() || '.' || v_tabel) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name   = v_tabel
            AND column_name  = v_kolom
       ) THEN
      v_hilang := v_hilang || (v_tabel || '.' || v_kolom);
    END IF;
  END LOOP;

  -- Penanda bentuk LAMA yang tak boleh ada. Kehadirannya membuktikan tabel
  -- dibentuk oleh 047, bukan 167.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'accounts'
       AND column_name = 'account_type'
  ) THEN
    -- `array || text` bisa ditafsirkan Postgres sebagai penggabungan dengan
    -- *array literal* bila teksnya memuat tanda kurung — menghasilkan
    -- `malformed array literal` alih-alih pesan yang dimaksud. Bungkus eksplisit
    -- sebagai array satu elemen supaya tafsirnya tak pernah ambigu.
    v_hilang := v_hilang || ARRAY['accounts.account_type MASIH ADA (penanda bentuk 047)'];
  END IF;

  -- ── Jalur tenancy `journal_entry_lines`: FK ke kepala jurnal ──────────────
  --
  -- Baris jurnal tidak punya `company_id` sendiri (lihat catatan di atas), jadi
  -- isolasinya SEPENUHNYA bergantung pada FK `entry_id` → `journal_entries`.
  -- Kalau FK itu hilang, baris bisa menggantung tanpa induk dan kehilangan satu-
  -- satunya penanda perusahaannya — kebocoran yang tak terlihat dari kolom mana pun.
  IF to_regclass(current_schema() || '.journal_entry_lines') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM pg_constraint c
         JOIN pg_class      anak  ON anak.oid  = c.conrelid
         JOIN pg_class      induk ON induk.oid = c.confrelid
         JOIN pg_namespace  n     ON n.oid     = anak.relnamespace
        WHERE c.contype = 'f'
          AND n.nspname = current_schema()
          AND anak.relname  = 'journal_entry_lines'
          AND induk.relname = 'journal_entries'
     ) THEN
    v_hilang := v_hilang
      || ARRAY['journal_entry_lines TIDAK punya FK ke journal_entries (jalur tenancy satu-satunya)'];
  END IF;

  IF array_length(v_hilang, 1) > 0 THEN
    RAISE EXCEPTION E'175 GAGAL — GENERAL LEDGER TIDAK TENANT-AWARE.\n'
      '\n'
      'Yang tidak sesuai: %\n'
      '\n'
      'Artinya tabel GL di lingkungan ini dibentuk oleh migrasi 047 (single-tenant),\n'
      'bukan 167 (tenant-aware). Migrasi 167 memakai CREATE TABLE IF NOT EXISTS,\n'
      'sehingga ia MELEWATI tabel yang sudah ada tanpa memperbaikinya.\n'
      '\n'
      'Kalau dibiarkan: buku besar tidak bisa memisahkan perusahaan, dan tak ada\n'
      'gejala apa pun sampai perusahaan kedua melihat jurnal perusahaan pertama.\n'
      '\n'
      'PERBAIKAN: reset lingkungan ini dari nol —\n'
      '  gh workflow run ci-isolation.yml -f action=setup-clean\n'
      '\n'
      'JANGAN menambal dengan ALTER TABLE ADD COLUMN company_id: bila tabel sudah\n'
      'berisi baris dari lebih dari satu perusahaan, tidak ada cara mekanis untuk\n'
      'memisahkannya (ADR-011, titik tanpa jalan kembali).',
      array_to_string(v_hilang, ', ');
  END IF;

  RAISE NOTICE '175: bentuk GL terverifikasi tenant-aware (company_id di 3 tabel, accounts.type).';
END $$;
