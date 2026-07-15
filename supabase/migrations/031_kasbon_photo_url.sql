-- ============================================================
-- PURALOKA SUITE — Migration 031
-- Tambah kolom photo_url ke kasbons dan worker_kasbons
-- untuk upload foto nota/bukti kasbon
-- ============================================================

ALTER TABLE kasbons ADD COLUMN IF NOT EXISTS photo_url TEXT NULL;
ALTER TABLE worker_kasbons ADD COLUMN IF NOT EXISTS photo_url TEXT NULL;

COMMENT ON COLUMN kasbons.photo_url IS 'URL foto nota/bukti kasbon di Supabase Storage (kasbon-photos bucket)';
COMMENT ON COLUMN worker_kasbons.photo_url IS 'URL foto nota/bukti kasbon tukang di Supabase Storage (kasbon-photos bucket)';
