-- Migration 070: RLS expand — Kelompok Financial (Epic 4, kelompok 4, terakhir).
-- Manage blanket via finance:manage / cash:manage (admin+pm default, scope identik
-- policy lama). Ownership via helper SECURITY DEFINER (ADR-005). EXPAND only —
-- policy lama TIDAK dihapus di sini (contract di production butuh gate
-- maintenance-window + PITR, migration terpisah).

-- Helper: mandor memiliki kasbon jika work_scope-nya di assignment miliknya.
CREATE OR REPLACE FUNCTION mandor_owns_kasbon_scope(p_work_scope_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM work_scopes ws
    JOIN mandor_assignments ma ON ws.assignment_id = ma.id
    WHERE ws.id = p_work_scope_id AND ma.mandor_id = auth_user_id()
  )
$$;
COMMENT ON FUNCTION mandor_owns_kasbon_scope(UUID) IS 'RLS helper (ADR-005): work_scope kasbon berada di assignment milik mandor ini.';

-- ── invoices + invoice_line_items ────────────────────────────────────────────
CREATE POLICY "invoices_manage_v2" ON invoices FOR ALL
  USING (has_permission('finance:manage')) WITH CHECK (has_permission('finance:manage'));
CREATE POLICY "invoices_client_read_v2" ON invoices FOR SELECT
  USING (is_owning_client(project_id));

CREATE POLICY "invoice_line_items_manage_v2" ON invoice_line_items FOR ALL
  USING (has_permission('finance:manage')) WITH CHECK (has_permission('finance:manage'));
CREATE POLICY "invoice_line_items_client_read_v2" ON invoice_line_items FOR SELECT
  USING (
    invoice_id IN (SELECT id FROM invoices WHERE is_owning_client(project_id))
  );

-- ── payments ─────────────────────────────────────────────────────────────────
CREATE POLICY "payments_manage_v2" ON payments FOR ALL
  USING (has_permission('finance:manage')) WITH CHECK (has_permission('finance:manage'));

-- ── tax_records ──────────────────────────────────────────────────────────────
CREATE POLICY "tax_records_manage_v2" ON tax_records FOR ALL
  USING (has_permission('finance:manage')) WITH CHECK (has_permission('finance:manage'));

-- ── expense_reports + expense_items ──────────────────────────────────────────
CREATE POLICY "expense_reports_manage_v2" ON expense_reports FOR ALL
  USING (has_permission('finance:manage')) WITH CHECK (has_permission('finance:manage'));
CREATE POLICY "expense_reports_assigned_read_v2" ON expense_reports FOR SELECT
  USING (is_assigned_mandor(project_id));
CREATE POLICY "expense_reports_assigned_insert_v2" ON expense_reports FOR INSERT
  WITH CHECK (is_assigned_mandor(project_id));

CREATE POLICY "expense_items_manage_v2" ON expense_items FOR ALL
  USING (has_permission('finance:manage')) WITH CHECK (has_permission('finance:manage'));
CREATE POLICY "expense_items_assigned_v2" ON expense_items FOR SELECT
  USING (
    expense_report_id IN (SELECT id FROM expense_reports WHERE is_assigned_mandor(project_id))
  );

-- ── kasbons ──────────────────────────────────────────────────────────────────
CREATE POLICY "kasbons_manage_v2" ON kasbons FOR ALL
  USING (has_permission('finance:manage')) WITH CHECK (has_permission('finance:manage'));
CREATE POLICY "kasbons_mandor_read_v2" ON kasbons FOR SELECT
  USING (work_scope_id IS NOT NULL AND mandor_owns_kasbon_scope(work_scope_id));
CREATE POLICY "kasbons_mandor_insert_v2" ON kasbons FOR INSERT
  WITH CHECK (work_scope_id IS NOT NULL AND mandor_owns_kasbon_scope(work_scope_id));

-- ── cash_accounts + cash_transfers ───────────────────────────────────────────
CREATE POLICY "cash_accounts_manage_v2" ON cash_accounts FOR ALL
  USING (has_permission('cash:manage')) WITH CHECK (has_permission('cash:manage'));
CREATE POLICY "cash_transfers_manage_v2" ON cash_transfers FOR ALL
  USING (has_permission('cash:manage')) WITH CHECK (has_permission('cash:manage'));

-- ── project_expenses ─────────────────────────────────────────────────────────
CREATE POLICY "project_expenses_manage_v2" ON project_expenses FOR ALL
  USING (has_permission('cash:manage')) WITH CHECK (has_permission('cash:manage'));
CREATE POLICY "project_expenses_assigned_read_v2" ON project_expenses FOR SELECT
  USING (is_assigned_mandor(project_id));
