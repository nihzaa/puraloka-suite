-- Migration 063: RLS expand — Kelompok Referensi (material_categories, materials)
-- Kelompok risiko terendah (Epic 4, urutan pertama — validasi pola expand-contract).
--
-- EXPAND: tambah policy baru berbasis has_permission() BERDAMPINGAN dengan policy
-- lama (literal role). Postgres mengevaluasi OR antar policy yang cocok, jadi
-- menambah policy baru tidak memblokir apa pun yang sudah bekerja (aman deploy).
-- Policy lama DIHAPUS nanti di migration contract terpisah, setelah verifikasi.
--
-- SELECT tidak disentuh: sudah USING(true), tidak ada literal role.
-- Write (INSERT/UPDATE/DELETE) literal `auth_role() IN ('admin','pm')` /
-- `auth_role() = 'admin'` → capability procurement:material:manage (existing, migration 050).

-- ── material_categories ──────────────────────────────────────────────────────
CREATE POLICY "material_categories_manage_insert_v2"
  ON material_categories FOR INSERT
  WITH CHECK (has_permission('procurement:material:manage'));

CREATE POLICY "material_categories_manage_update_v2"
  ON material_categories FOR UPDATE
  USING (has_permission('procurement:material:manage'))
  WITH CHECK (has_permission('procurement:material:manage'));

-- ── materials ────────────────────────────────────────────────────────────────
CREATE POLICY "materials_manage_insert_v2"
  ON materials FOR INSERT
  WITH CHECK (has_permission('procurement:material:manage'));

CREATE POLICY "materials_manage_update_v2"
  ON materials FOR UPDATE
  USING (has_permission('procurement:material:manage'))
  WITH CHECK (has_permission('procurement:material:manage'));

CREATE POLICY "materials_manage_delete_v2"
  ON materials FOR DELETE
  USING (has_permission('procurement:material:manage'));
