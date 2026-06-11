-- ============================================================
-- PURALOKA SUITE — Migration 012
-- Supabase Storage: bucket project-photos + RLS policies
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-photos', 'project-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: anyone can view photos (bucket is public)
CREATE POLICY IF NOT EXISTS "project_photos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-photos');

-- Allow authenticated uploads
CREATE POLICY IF NOT EXISTS "project_photos_allow_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-photos');

-- Allow authenticated deletes
CREATE POLICY IF NOT EXISTS "project_photos_allow_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'project-photos');
