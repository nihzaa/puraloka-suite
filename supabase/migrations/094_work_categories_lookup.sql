-- Migration 094: kategori pekerjaan (work category) lookup terpusat (AKTA 3 / census A7)
--
-- MASALAH (HARDCODE-CENSUS A7): kategori pekerjaan hardcode di mandor/page.tsx
-- (CATEGORY_LABELS: struktur/baja/dinding/finishing/... 12 nilai). Menambah kategori
-- butuh edit kode + redeploy → melanggar §12 (config WAJIB dari UI).
--
-- SOLUSI (pola SAMA seperti units #32/090): SATU tabel `work_categories` sumber tunggal,
-- dikelola dari UI /pengaturan/kategori-pekerjaan (gated work_categories:manage). Additive-first:
-- seed = 12 kategori existing (nol kategori hilang). BEHAVIOR-PRESERVING — mandor tetap
-- menyimpan `code` di work_scope_items.category (cocok data lama).

CREATE TABLE IF NOT EXISTS work_categories (
  code       TEXT PRIMARY KEY,                     -- kunci stabil = nilai tersimpan work_scope_items.category
  label      TEXT NOT NULL,                        -- tampilan (mis. "Kusen & Pintu")
  sort_order INT  NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,        -- soft-disable (jangan hapus — item lama mereferensi)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE work_categories IS 'Master kategori pekerjaan (work scope item). Sumber tunggal dropdown kategori mandor. Kelola via UI /pengaturan/kategori-pekerjaan (work_categories:manage). code = nilai tersimpan work_scope_items.category.';

-- Seed = 12 kategori existing (cermin CATEGORY_LABELS mandor/page.tsx).
INSERT INTO work_categories (code, label, sort_order) VALUES
  ('struktur',      'Struktur',       10),
  ('baja',          'Baja',           20),
  ('dinding',       'Dinding',        30),
  ('finishing',     'Finishing',      40),
  ('atap',          'Atap',           50),
  ('plumbing',      'Plumbing',       60),
  ('elektrikal',    'Elektrikal',     70),
  ('mekanikal',     'Mekanikal',      80),
  ('kusen_pintu',   'Kusen & Pintu',  90),
  ('pagar_carport', 'Pagar/Carport',  100),
  ('landscape',     'Landscape',      110),
  ('lain_lain',     'Lain-lain',      120)
ON CONFLICT (code) DO NOTHING;

-- ─── Derive capability (ADR-004): work_categories:manage, seed admin (scope-preserving) ──
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('work_categories:manage', 'settings', 'Kelola Kategori Pekerjaan',
   'Menambah/mengubah/menonaktifkan kategori pekerjaan (work scope) di master terpusat', 40)
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'work_categories:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── RLS (pola 1A / units 090) ───────────────────────────────────────────────
ALTER TABLE work_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_categories_read" ON work_categories
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
CREATE POLICY "work_categories_write" ON work_categories
  FOR ALL USING (has_permission('work_categories:manage'))
  WITH CHECK (has_permission('work_categories:manage'));

-- ─── Menu (1B.2 DB-driven): "Kelola Kategori" di dropdown Pengaturan ─────────
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'pengaturan-kategori', 'Kategori Pekerjaan', '/pengaturan/kategori-pekerjaan', 'Layers', m.id,
       ARRAY['work_categories:manage'], 18, 'bottom'
FROM menu_items m WHERE m.key = 'pengaturan'
ON CONFLICT (key) DO NOTHING;
