-- ============================================================
-- PURALOKA SUITE — Migration 029
-- 1. workers → global registry (mandor_id nullable, no unique constraint, tambah tipe)
-- 2. wage_deductions → tambah tipe eksplisit + worker_name untuk ad-hoc individu
-- ============================================================

-- ============================================================
-- BAGIAN 1: workers
-- ============================================================

-- Drop UNIQUE constraint (mandor_id, name)
ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_mandor_id_name_key;

-- mandor_id jadi nullable (data existing tetap ada, hanya lepas NOT NULL)
ALTER TABLE workers ALTER COLUMN mandor_id DROP NOT NULL;

-- Tambah kolom tipe (opsional)
ALTER TABLE workers ADD COLUMN IF NOT EXISTS tipe VARCHAR(10)
  CHECK (tipe IN ('tukang', 'laden', 'kenek')) NULL;

COMMENT ON COLUMN workers.mandor_id IS 'Mandor yang awalnya mendaftarkan worker — nullable, worker bersifat global';
COMMENT ON COLUMN workers.tipe IS 'Tipe pekerja: tukang | laden | kenek — opsional, bisa null';

-- ============================================================
-- BAGIAN 2: wage_deductions
-- ============================================================

-- Tambah kolom tipe eksplisit dengan default kolektif
ALTER TABLE wage_deductions ADD COLUMN IF NOT EXISTS tipe VARCHAR(20)
  CHECK (tipe IN ('kasbon_kolektif', 'kasbon_individu'))
  NOT NULL DEFAULT 'kasbon_kolektif';

-- Backfill tipe berdasarkan data existing
UPDATE wage_deductions
  SET tipe = 'kasbon_individu'
  WHERE worker_kasbon_id IS NOT NULL;

-- Tambah worker_name untuk individu tanpa worker_kasbon_id (nama ketik manual)
ALTER TABLE wage_deductions ADD COLUMN IF NOT EXISTS worker_name VARCHAR(100) NULL;

COMMENT ON COLUMN wage_deductions.tipe IS 'kasbon_kolektif = total mandor tidak perinci per orang; kasbon_individu = per orang (bisa link kasbon atau nama manual)';
COMMENT ON COLUMN wage_deductions.worker_name IS 'Nama pekerja untuk kasbon_individu jika worker_kasbon_id null (ad-hoc)';
