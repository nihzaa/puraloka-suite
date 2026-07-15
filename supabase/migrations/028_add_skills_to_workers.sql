-- ============================================================
-- PURALOKA SUITE — Migration 028
-- Tambah kolom skills ke tabel workers
-- Array of text untuk menyimpan keahlian tukang
-- ============================================================

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN workers.skills IS 'Keahlian tukang: tukang_batu, tukang_kayu, tukang_besi, tukang_cat, plumbing, elektrikal, finishing, lainnya';
