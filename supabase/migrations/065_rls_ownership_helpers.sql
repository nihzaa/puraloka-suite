-- Migration 065: RLS ownership helpers (SECURITY DEFINER) — memutus RLS recursion
-- Lihat ADR-005. Bug: projects_mandor_select ↔ mandor_assignments_pm_select saling
-- subquery ke tabel ber-RLS satu sama lain → infinite recursion (ERROR di runtime).
-- Tak terdeteksi sejak migration 049 karena API pakai service_role (bypass RLS).
--
-- Solusi kanonik: fungsi SECURITY DEFINER (eksekusi dgn hak owner, subquery di
-- dalamnya TIDAK memicu RLS bersarang) → rantai rekursi putus.
--
-- CATATAN expand-contract: policy lama yang REKURSIF tidak bisa "hidup
-- berdampingan" (ia sendiri error saat dievaluasi) — jadi policy rekursif lama
-- DIGANTI langsung di sini (DROP + CREATE). Ini pengecualian sah: mempertahankan
-- policy yang broken tidak memberi jaring pengaman, hanya mempertahankan bug.

-- ── Helper functions (STABLE, SECURITY DEFINER, fail-closed) ──────────────────

CREATE OR REPLACE FUNCTION is_assigned_mandor(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM mandor_assignments
    WHERE project_id = p_project_id AND mandor_id = auth_user_id()
  )
$$;

CREATE OR REPLACE FUNCTION is_pm_of_project(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id AND pm_id = auth_user_id()
  )
$$;

CREATE OR REPLACE FUNCTION is_owning_client(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id AND client_id = auth_client_id()
  )
$$;

COMMENT ON FUNCTION is_assigned_mandor(UUID) IS 'RLS helper (SECURITY DEFINER, memutus recursion, ADR-005): user saat ini mandor yang di-assign ke proyek.';
COMMENT ON FUNCTION is_pm_of_project(UUID) IS 'RLS helper (SECURITY DEFINER, ADR-005): user saat ini PM proyek.';
COMMENT ON FUNCTION is_owning_client(UUID) IS 'RLS helper (SECURITY DEFINER, ADR-005): user saat ini client pemilik proyek.';

-- ── projects: ganti policy mandor yang rekursif ──────────────────────────────
DROP POLICY IF EXISTS "projects_mandor_select" ON projects;
CREATE POLICY "projects_mandor_select" ON projects FOR SELECT
  USING (auth_role() = 'mandor' AND is_deleted = false AND is_assigned_mandor(id));

-- ── mandor_assignments: ganti policy pm yang rekursif ────────────────────────
DROP POLICY IF EXISTS "mandor_assignments_pm_select" ON mandor_assignments;
CREATE POLICY "mandor_assignments_pm_select" ON mandor_assignments FOR SELECT
  USING (auth_role() = 'pm' AND is_pm_of_project(project_id));

DROP POLICY IF EXISTS "mandor_assignments_pm_insert" ON mandor_assignments;
CREATE POLICY "mandor_assignments_pm_insert" ON mandor_assignments FOR INSERT
  WITH CHECK (auth_role() = 'pm' AND is_pm_of_project(project_id));

DROP POLICY IF EXISTS "mandor_assignments_pm_update" ON mandor_assignments;
CREATE POLICY "mandor_assignments_pm_update" ON mandor_assignments FOR UPDATE
  USING (auth_role() = 'pm' AND is_pm_of_project(project_id))
  WITH CHECK (auth_role() = 'pm' AND is_pm_of_project(project_id));
