-- Migration 066: RLS expand — Kelompok Operasional (milestones, documents, project_photos)
-- Epic 4 kelompok 2. Expand-contract: policy baru berdampingan dgn lama (049).
-- Ownership pakai helper SECURITY DEFINER (ADR-005) — tidak subquery langsung ke
-- tabel ber-RLS, jadi bebas recursion.
--
-- Pola per tabel:
--   manage (ALL)  → has_permission(<module>:manage)  [admin+pm, identik scope lama]
--   mandor read   → is_assigned_mandor(project_id)   [ownership, role literal dibuang]
--   mandor insert → is_assigned_mandor(project_id)   [project_photos saja]
--   client read   → is_owning_client(project_id)     [ownership, role literal dibuang]

-- ── milestones ───────────────────────────────────────────────────────────────
CREATE POLICY "milestones_manage_v2" ON milestones FOR ALL
  USING (has_permission('milestones:manage'))
  WITH CHECK (has_permission('milestones:manage'));

CREATE POLICY "milestones_assigned_read_v2" ON milestones FOR SELECT
  USING (is_assigned_mandor(project_id));

CREATE POLICY "milestones_client_read_v2" ON milestones FOR SELECT
  USING (is_owning_client(project_id));

-- ── documents ────────────────────────────────────────────────────────────────
CREATE POLICY "documents_manage_v2" ON documents FOR ALL
  USING (has_permission('documents:manage'))
  WITH CHECK (has_permission('documents:manage'));

CREATE POLICY "documents_client_read_v2" ON documents FOR SELECT
  USING (is_owning_client(project_id));

-- ── project_photos ───────────────────────────────────────────────────────────
CREATE POLICY "project_photos_manage_v2" ON project_photos FOR ALL
  USING (has_permission('documents:manage'))
  WITH CHECK (has_permission('documents:manage'));

CREATE POLICY "project_photos_assigned_read_v2" ON project_photos FOR SELECT
  USING (is_assigned_mandor(project_id));

CREATE POLICY "project_photos_assigned_insert_v2" ON project_photos FOR INSERT
  WITH CHECK (is_assigned_mandor(project_id));

CREATE POLICY "project_photos_client_read_v2" ON project_photos FOR SELECT
  USING (is_owning_client(project_id));
