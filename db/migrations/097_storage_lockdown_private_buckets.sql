-- Migration 097: 🔴 BUGFIX KEAMANAN — kunci storage bucket privat (leak live-path)
--
-- TEMUAN (live test 2026-07-24): policy `storage.objects` untuk bucket privat hanya
-- mengecek `bucket_id` dengan roles={public} — NOL scoping per-user/proyek/role. Terbukti:
--   • ANON (belum login) BISA baca semua file di project-documents & expense-receipts.
--   • Semua authenticated lihat SEMUA file (nol isolasi).
-- Ini LIVE PATH: browser akses storage LANGSUNG dengan anon key (bukan lewat Fastify).
-- Beda dari table RLS (dormant) — di sini policy storage adalah SATU-SATUNYA penjaga file.
--
-- FIX (kanonik): bucket privat = akses HANYA lewat service_role (API) + signed URL
-- (signed URL bypass RLS via signature, jadi download sah tetap jalan). Nol client langsung.
--   • project-documents: download sudah pakai signed URL (documents.ts) → 0 perubahan kode.
--   • expense-receipts (0 objek) + payment-proofs (0 objek): read diganti ke signed URL
--     (cash.ts/finance.ts/termin-payment.ts) — pola sama documents.ts.
--   • payment-proofs juga DIJADIKAN PRIVAT (public=false) — bukti transfer = data finansial,
--     tak boleh world-readable-by-URL. Aman: 0 objek + 0 proof_url tersimpan.
--   • company-assets (logo) TETAP publik (nol policy permissif; write via service_role).
--
-- BEHAVIOR-PRESERVING utk operasi sah (API service_role bypass RLS; signed URL bypass RLS).
-- Yang DITUTUP hanya akses client langsung yang tak sah (anon/cross-tenant).
--
-- Gate mobile (dokumentasi): bila kelak mobile akses storage LANGSUNG dgn JWT user,
-- tambah policy scoped-by-proyek (path <project_id>/… + helper SECURITY DEFINER) — bukan
-- sekadar service_role. Untuk sekarang nol client langsung ke bucket privat → service_role cukup.

-- ── 1. payment-proofs → privat (bukti transfer bukan data publik) ─────────────
UPDATE storage.buckets SET public = false WHERE id = 'payment-proofs';

-- ── 2. Hapus SEMUA policy permissif lama (roles=public, bucket_id-only) ───────
DROP POLICY IF EXISTS "expense_receipts_select" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_insert" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_delete" ON storage.objects;
DROP POLICY IF EXISTS "payment_proofs_allow_select" ON storage.objects;
DROP POLICY IF EXISTS "payment_proofs_allow_insert" ON storage.objects;
DROP POLICY IF EXISTS "payment_proofs_allow_delete" ON storage.objects;
DROP POLICY IF EXISTS "project_docs_allow_select" ON storage.objects;
DROP POLICY IF EXISTS "project_docs_allow_insert" ON storage.objects;
DROP POLICY IF EXISTS "project_docs_allow_delete" ON storage.objects;

-- ── 3. Policy baru: bucket privat = HANYA service_role (API). ─────────────────
-- Anon & authenticated ditolak akses langsung. Download sah lewat signed URL (bypass RLS).
CREATE POLICY "expense_receipts_service_only" ON storage.objects
  FOR ALL USING (bucket_id = 'expense-receipts' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'expense-receipts' AND auth.role() = 'service_role');

CREATE POLICY "payment_proofs_service_only" ON storage.objects
  FOR ALL USING (bucket_id = 'payment-proofs' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'payment-proofs' AND auth.role() = 'service_role');

CREATE POLICY "project_documents_service_only" ON storage.objects
  FOR ALL USING (bucket_id = 'project-documents' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'project-documents' AND auth.role() = 'service_role');
