-- ============================================================
-- PURALOKA SUITE — Migration 015
-- Tambah kolom proof_url ke payments
-- Storage bucket payment-proofs untuk bukti transfer
-- ============================================================

-- Kolom URL bukti transfer (foto/PDF dari Supabase Storage)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS proof_url TEXT;

COMMENT ON COLUMN payments.proof_url IS 'URL file bukti transfer dari Supabase Storage bucket payment-proofs. Nanti bisa diupload oleh client langsung ketika portal client sudah dibuat.';

-- ============================================================
-- Storage bucket: payment-proofs (private — hanya admin/pm)
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- `storage.objects` adalah tabel GLOBAL — policy-nya selamat dari
-- `resetTestSchema()`, jadi `CREATE POLICY` gagal di run kedua. DROP dulu
-- supaya migrasi ini bisa dijalankan berapa kali pun.
DROP POLICY IF EXISTS "payment_proofs_allow_insert" ON storage.objects;
CREATE POLICY "payment_proofs_allow_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "payment_proofs_allow_select" ON storage.objects;
CREATE POLICY "payment_proofs_allow_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "payment_proofs_allow_delete" ON storage.objects;
CREATE POLICY "payment_proofs_allow_delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'payment-proofs');
