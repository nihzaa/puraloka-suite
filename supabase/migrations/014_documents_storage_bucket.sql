-- ============================================================
-- PURALOKA SUITE — Migration 014
-- Supabase Storage: bucket project-documents
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated uploads
CREATE POLICY "project_docs_allow_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-documents');

-- Allow authenticated reads
CREATE POLICY "project_docs_allow_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-documents');

-- Allow authenticated deletes
CREATE POLICY "project_docs_allow_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'project-documents');
