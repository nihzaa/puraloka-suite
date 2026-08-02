-- ============================================================
-- PURALOKA SUITE — Migration 014
-- Supabase Storage: bucket project-documents
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated uploads
-- `storage.objects` adalah tabel GLOBAL — policy-nya selamat dari
-- `resetTestSchema()`, jadi `CREATE POLICY` gagal di run kedua. DROP dulu
-- supaya migrasi ini bisa dijalankan berapa kali pun.
DROP POLICY IF EXISTS "project_docs_allow_insert" ON storage.objects;
CREATE POLICY "project_docs_allow_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-documents');

-- Allow authenticated reads
DROP POLICY IF EXISTS "project_docs_allow_select" ON storage.objects;
CREATE POLICY "project_docs_allow_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-documents');

-- Allow authenticated deletes
DROP POLICY IF EXISTS "project_docs_allow_delete" ON storage.objects;
CREATE POLICY "project_docs_allow_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'project-documents');
