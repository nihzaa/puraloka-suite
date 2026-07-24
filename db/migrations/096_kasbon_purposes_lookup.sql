-- Migration 096: tujuan kasbon (kasbon purpose) lookup terpusat (census A4, pola units)
--
-- MASALAH (HARDCODE-CENSUS A4): tujuan kasbon = enum `kasbon_purpose` (5 nilai) +
-- array hardcode `validPurposes` di kasbons.ts:88. Menambah tujuan (mis. "transport",
-- "sewa_alat") butuh migration enum + edit kode + redeploy → langgar §12.
--
-- SOLUSI (pola units #32 / work_categories #94): SATU tabel `kasbon_purposes` sumber
-- tunggal, dikelola dari UI /pengaturan/kasbon-purposes (kasbon_purposes:manage).
-- Kolom `kasbons.purpose` di-KONVERSI enum → TEXT supaya nilai baru bisa disimpan tanpa
-- migration; validasi pindah ke API (cek terhadap lookup aktif). Additive-first: seed 5
-- nilai existing. BEHAVIOR-PRESERVING — nilai lama jadi text yang sama.

-- ─── 1. Lookup table + seed 5 (cermin enum lama) ─────────────────────────────
CREATE TABLE IF NOT EXISTS kasbon_purposes (
  code       TEXT PRIMARY KEY,                     -- = nilai tersimpan kasbons.purpose
  label      TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);
COMMENT ON TABLE kasbon_purposes IS 'Master tujuan kasbon. Sumber tunggal dropdown tujuan kasbon. Kelola via UI /pengaturan/kasbon-purposes (kasbon_purposes:manage). code = nilai tersimpan kasbons.purpose.';

INSERT INTO kasbon_purposes (code, label, sort_order) VALUES
  ('gaji_tukang',    'Gaji Tukang',    10),
  ('uang_makan',     'Uang Makan',     20),
  ('pembelian_alat', 'Pembelian Alat', 30),
  ('operasional',    'Operasional',    40),
  ('lain_lain',      'Lain-lain',      50)
ON CONFLICT (code) DO NOTHING;

-- ─── 2. Konversi kolom enum → TEXT (nilai baru bisa masuk tanpa migration) ────
-- kasbons.purpose satu-satunya kolom bertipe kasbon_purpose (diverifikasi). NOT NULL,
-- tanpa default/CHECK → konversi aman & behavior-preserving (nilai lama identik).
ALTER TABLE kasbons ALTER COLUMN purpose TYPE TEXT USING purpose::text;
DROP TYPE IF EXISTS kasbon_purpose;

-- ─── 3. Derive capability + RLS + menu (pola units/work_categories) ───────────
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('kasbon_purposes:manage', 'settings', 'Kelola Tujuan Kasbon',
   'Menambah/mengubah/menonaktifkan tujuan kasbon di master terpusat', 50)
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'kasbon_purposes:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

ALTER TABLE kasbon_purposes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kasbon_purposes_read" ON kasbon_purposes
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "kasbon_purposes_write" ON kasbon_purposes
  FOR ALL USING (has_permission('kasbon_purposes:manage'))
  WITH CHECK (has_permission('kasbon_purposes:manage'));

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'pengaturan-kasbon-purposes', 'Tujuan Kasbon', '/pengaturan/kasbon-purposes', 'Coins', m.id,
       ARRAY['kasbon_purposes:manage'], 19, 'bottom'
FROM menu_items m WHERE m.key = 'pengaturan'
ON CONFLICT (key) DO NOTHING;
