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

-- ⚠️ DIPERBAIKI 2026-08-04 (F2-5) — ketiga policy ini dulu berlaku untuk role
-- `public`: siapa pun bisa MEMBACA dan MENGHAPUS foto progres proyek tenant
-- mana pun, tanpa login.
--
-- Komentar aslinya berbunyi "bucket is public", dan itu memang benar SAAT ITU:
-- browser mengunggah langsung memakai anon key. Migrasi 098 kemudian
-- memprivatkan bucket-nya dan aplikasi pindah ke service_role
-- (`apps/web/lib/storage.ts` mencatat perpindahan itu; `progress.ts:20`
-- menegaskannya) — tetapi policy-nya tak ikut dibersihkan.
--
-- Kenapa diperbaiki DI SINI, bukan hanya dihapus di 181: `storage.objects`
-- tabel GLOBAL, jadi migrasi ini ikut ter-replay tiap suite test membangun
-- schema `test` dan MENGHIDUPKAN KEMBALI policy yang sudah dihapus.
DROP POLICY IF EXISTS "project_photos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "project_photos_allow_insert" ON storage.objects;
DROP POLICY IF EXISTS "project_photos_allow_delete" ON storage.objects;

DROP POLICY IF EXISTS "project_photos_service_only" ON storage.objects;
CREATE POLICY "project_photos_service_only"
ON storage.objects FOR ALL
USING (bucket_id = 'project-photos' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'project-photos' AND auth.role() = 'service_role');
