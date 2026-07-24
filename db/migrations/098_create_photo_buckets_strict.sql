-- Migration 098: 🔴 BUGFIX — buat bucket foto yang HILANG (OPEN-4) dgn policy KETAT
--
-- TEMUAN (OPEN-4, diverifikasi 2026-07-24): `apps/web` upload foto LANGSUNG dari browser
-- ke bucket `project-photos` (foto progress) & `kasbon-photos` (foto nota kasbon), TAPI
-- kedua bucket TIDAK PERNAH ADA di `storage.buckets` (hanya ada 4: company-assets,
-- expense-receipts, payment-proofs, project-documents).
--
-- BUKTI fitur tak pernah berfungsi:
--   • `project_photos` 36 baris TAPI semua URL = images.unsplash.com (SEED DUMMY), nol
--     URL storage Supabase → nol foto pernah benar-benar ter-upload.
--   • `kasbons.photo_url` terisi = 0.
--   • Nol objek di storage untuk kedua bucket (bucket-nya saja tak ada).
-- → "progress log + foto" yang ditandai SELESAI di CLAUDE.md TIDAK PERNAH JALAN. Dikoreksi.
--
-- POLICY KETAT SEJAK AWAL (pola migration 097, JANGAN ulangi bucket_id-only yang bocor):
-- bucket PRIVAT + akses HANYA service_role. Konsekuensi disengaja: browser TIDAK bisa
-- upload langsung lagi → upload dialihkan lewat API (Fastify, service_role) seperti
-- SEMUA upload lain di app ini (dokumen/nota/bukti bayar). Baca via signed URL.

-- ── Buat bucket yang hilang (privat) ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES
  ('project-photos', 'project-photos', false),
  ('kasbon-photos',  'kasbon-photos',  false)
ON CONFLICT (id) DO NOTHING;

-- ── Policy KETAT: hanya service_role (API). Anon & authenticated ditolak. ────
DROP POLICY IF EXISTS "project_photos_service_only" ON storage.objects;
CREATE POLICY "project_photos_service_only" ON storage.objects
  FOR ALL USING (bucket_id = 'project-photos' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'project-photos' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS "kasbon_photos_service_only" ON storage.objects;
CREATE POLICY "kasbon_photos_service_only" ON storage.objects
  FOR ALL USING (bucket_id = 'kasbon-photos' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'kasbon-photos' AND auth.role() = 'service_role');
