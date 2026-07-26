-- ============================================================
-- PURALOKA SUITE — Migration 012
-- Supabase Storage: bucket project-photos + RLS policies
--
-- PERBAIKAN SINTAKS: `CREATE POLICY IF NOT EXISTS` TIDAK sah di PostgreSQL
-- (policy tak punya IF NOT EXISTS). Diganti DROP POLICY IF EXISTS + CREATE
-- (idempoten, valid). Catatan: bucket public + policy public di sini adalah
-- keadaan AWAL; migrasi 097/098 kemudian mengunci bucket jadi privat +
-- policy service_role-only (keadaan akhir yang cocok dengan dev).
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-photos', 'project-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: anyone can view photos (bucket is public)
DROP POLICY IF EXISTS "project_photos_public_read" ON storage.objects;
CREATE POLICY "project_photos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-photos');

-- Allow authenticated uploads
DROP POLICY IF EXISTS "project_photos_allow_insert" ON storage.objects;
CREATE POLICY "project_photos_allow_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-photos');

-- Allow authenticated deletes
DROP POLICY IF EXISTS "project_photos_allow_delete" ON storage.objects;
CREATE POLICY "project_photos_allow_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'project-photos');
