-- Migration 068: RLS expand — Kelompok Field ops (progress_logs, work_scopes,
-- work_scope_items, workers). Epic 4 kelompok 3. Ownership via SECURITY DEFINER
-- helpers (ADR-005). Manage via capability admin+pm-only (067) — scope identik lama.

-- ── Helper tambahan (SECURITY DEFINER, STABLE, fail-closed) ───────────────────
CREATE OR REPLACE FUNCTION pm_owns_scope_assignment(p_assignment_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM mandor_assignments ma
    JOIN projects p ON ma.project_id = p.id
    WHERE ma.id = p_assignment_id AND p.pm_id = auth_user_id()
  )
$$;

CREATE OR REPLACE FUNCTION mandor_owns_scope_assignment(p_assignment_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM mandor_assignments
    WHERE id = p_assignment_id AND mandor_id = auth_user_id()
  )
$$;

CREATE OR REPLACE FUNCTION mandor_can_see_worker(p_worker_id UUID, p_worker_mandor_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p_worker_mandor_id = auth_user_id()
      OR EXISTS (
        SELECT 1 FROM wage_items wi
        JOIN weekly_wage_reports wr ON wi.report_id = wr.id
        JOIN mandor_assignments ma ON wr.assignment_id = ma.id
        WHERE wi.worker_id = p_worker_id AND ma.mandor_id = auth_user_id()
      )
$$;

COMMENT ON FUNCTION pm_owns_scope_assignment(UUID) IS 'RLS helper (ADR-005): user PM dari proyek yang memuat assignment ini.';
COMMENT ON FUNCTION mandor_owns_scope_assignment(UUID) IS 'RLS helper (ADR-005): user mandor pemilik assignment ini.';
COMMENT ON FUNCTION mandor_can_see_worker(UUID, UUID) IS 'RLS helper (ADR-005): worker milik mandor ini atau pernah dicatat di wage report scope-nya.';

-- ── progress_logs ────────────────────────────────────────────────────────────
-- manage (admin+pm via progress:manage — identik scope lama admin/pm)
CREATE POLICY "progress_logs_manage_v2" ON progress_logs FOR ALL
  USING (has_permission('progress:manage'))
  WITH CHECK (has_permission('progress:manage'));
-- mandor: read + insert progress proyek yang di-assign (ownership)
CREATE POLICY "progress_logs_assigned_read_v2" ON progress_logs FOR SELECT
  USING (is_assigned_mandor(project_id));
CREATE POLICY "progress_logs_assigned_insert_v2" ON progress_logs FOR INSERT
  WITH CHECK (is_assigned_mandor(project_id));
-- client: read proyek miliknya
CREATE POLICY "progress_logs_client_read_v2" ON progress_logs FOR SELECT
  USING (is_owning_client(project_id));

-- ── work_scopes ──────────────────────────────────────────────────────────────
-- admin (via mandor:scope:manage) + pm (ownership scope). mandor:scope:manage
-- hanya admin+pm (bukan mandor) → aman.
CREATE POLICY "work_scopes_manage_v2" ON work_scopes FOR ALL
  USING (has_permission('mandor:scope:manage') OR pm_owns_scope_assignment(assignment_id))
  WITH CHECK (has_permission('mandor:scope:manage') OR pm_owns_scope_assignment(assignment_id));
CREATE POLICY "work_scopes_mandor_read_v2" ON work_scopes FOR SELECT
  USING (mandor_owns_scope_assignment(assignment_id));

-- ── work_scope_items ─────────────────────────────────────────────────────────
CREATE POLICY "work_scope_items_manage_v2" ON work_scope_items FOR ALL
  USING (has_permission('mandor:scope:item'))
  WITH CHECK (has_permission('mandor:scope:item'));
CREATE POLICY "work_scope_items_scope_read_v2" ON work_scope_items FOR SELECT
  USING (
    work_scope_id IN (
      SELECT id FROM work_scopes
      WHERE mandor_owns_scope_assignment(assignment_id)
         OR pm_owns_scope_assignment(assignment_id)
    )
  );

-- ── workers ──────────────────────────────────────────────────────────────────
-- manage (admin+pm via workers:manage — identik scope lama admin/pm blanket)
CREATE POLICY "workers_manage_v2" ON workers FOR ALL
  USING (has_permission('workers:manage'))
  WITH CHECK (has_permission('workers:manage'));
-- mandor: lihat worker sendiri / yang pernah dicatat di scope-nya (ownership)
CREATE POLICY "workers_mandor_read_v2" ON workers FOR SELECT
  USING (mandor_can_see_worker(id, mandor_id));
-- mandor: daftarkan tukang baru + update tukang sendiri (scope lama dipertahankan)
CREATE POLICY "workers_mandor_insert_v2" ON workers FOR INSERT
  WITH CHECK (has_permission('mandor:worker:manage'));
CREATE POLICY "workers_mandor_update_v2" ON workers FOR UPDATE
  USING (mandor_id = auth_user_id())
  WITH CHECK (mandor_id = auth_user_id());
