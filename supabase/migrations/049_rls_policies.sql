-- Migration 049: Row Level Security (RLS) — Defense-in-Depth
-- Strategi: API tetap pakai service_role (bypass RLS), RLS enforce untuk
-- akses Supabase Dashboard, Portal Client (anon key), dan akses langsung DB.
-- Tidak ada perubahan di application layer.

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: Helper Functions
-- Dipanggil dari semua policy. STABLE = di-cache per query (tidak per-row).
-- SECURITY DEFINER = bisa baca tabel users meski RLS aktif di users itu sendiri.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM users WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()
$$;

-- Untuk role 'client': ambil clients.id yang terhubung ke user ini (migration 048)
CREATE OR REPLACE FUNCTION auth_client_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM clients WHERE user_id = (
    SELECT id FROM users WHERE auth_id = auth.uid()
  )
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: Enable RLS — Semua Tabel
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE termin_schedules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_category_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_expense_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_records                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_accounts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transfers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_expenses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandor_assignments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_scopes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_scope_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_wage_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_wage_reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE wage_items                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE wage_deductions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE kasbons                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_kasbons                ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE borongan_settlements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_photos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_stocks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements               ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payment_allocations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requests             ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_request_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_items           ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: users & clients
-- ─────────────────────────────────────────────────────────────────────────────

-- users: admin lihat semua; pm+mandor lihat semua aktif (untuk dropdown);
--        setiap user lihat diri sendiri; client lihat diri sendiri saja
CREATE POLICY "users_admin"
  ON users USING (auth_role() = 'admin');

CREATE POLICY "users_pm_mandor_select"
  ON users FOR SELECT
  USING (auth_role() IN ('pm', 'mandor') AND is_active = true);

CREATE POLICY "users_self_select"
  ON users FOR SELECT
  USING (id = auth_user_id());

CREATE POLICY "users_self_update"
  ON users FOR UPDATE
  USING (id = auth_user_id())
  WITH CHECK (id = auth_user_id());

-- clients: admin semua; pm lihat semua aktif; client lihat diri sendiri;
--          mandor lihat aktif (untuk referensi nama di dropdown)
CREATE POLICY "clients_admin"
  ON clients USING (auth_role() = 'admin');

CREATE POLICY "clients_pm_select"
  ON clients FOR SELECT
  USING (auth_role() = 'pm' AND is_active = true);

CREATE POLICY "clients_mandor_select"
  ON clients FOR SELECT
  USING (auth_role() = 'mandor' AND is_active = true);

CREATE POLICY "clients_self_select"
  ON clients FOR SELECT
  USING (auth_role() = 'client' AND id = auth_client_id());

CREATE POLICY "clients_pm_insert"
  ON clients FOR INSERT
  WITH CHECK (auth_role() IN ('admin', 'pm'));

CREATE POLICY "clients_pm_update"
  ON clients FOR UPDATE
  USING (auth_role() IN ('admin', 'pm'))
  WITH CHECK (auth_role() IN ('admin', 'pm'));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: projects & turunan langsung
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "projects_admin"
  ON projects USING (auth_role() = 'admin');

CREATE POLICY "projects_pm_select"
  ON projects FOR SELECT
  USING (auth_role() = 'pm' AND pm_id = auth_user_id() AND is_deleted = false);

CREATE POLICY "projects_mandor_select"
  ON projects FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND is_deleted = false
    AND EXISTS (
      SELECT 1 FROM mandor_assignments ma
      WHERE ma.project_id = projects.id AND ma.mandor_id = auth_user_id()
    )
  );

CREATE POLICY "projects_client_select"
  ON projects FOR SELECT
  USING (
    auth_role() = 'client'
    AND is_deleted = false
    AND client_id = auth_client_id()
  );

CREATE POLICY "projects_pm_insert"
  ON projects FOR INSERT
  WITH CHECK (auth_role() IN ('admin', 'pm'));

CREATE POLICY "projects_pm_update"
  ON projects FOR UPDATE
  USING (auth_role() IN ('admin', 'pm'))
  WITH CHECK (auth_role() IN ('admin', 'pm'));

-- termin_schedules: akses via project
CREATE POLICY "termin_schedules_admin_pm"
  ON termin_schedules
  USING (
    auth_role() IN ('admin', 'pm')
    AND project_id IN (SELECT id FROM projects WHERE pm_id = auth_user_id() OR auth_role() = 'admin')
  );

CREATE POLICY "termin_schedules_client_select"
  ON termin_schedules FOR SELECT
  USING (
    auth_role() = 'client'
    AND project_id IN (SELECT id FROM projects WHERE client_id = auth_client_id())
  );

-- expense_category_templates: global read, admin manage
CREATE POLICY "expense_templates_select"
  ON expense_category_templates FOR SELECT
  USING (true);  -- semua authenticated user bisa baca

CREATE POLICY "expense_templates_admin"
  ON expense_category_templates FOR INSERT
  WITH CHECK (auth_role() = 'admin');

CREATE POLICY "expense_templates_admin_update"
  ON expense_category_templates FOR UPDATE
  USING (auth_role() = 'admin') WITH CHECK (auth_role() = 'admin');

CREATE POLICY "expense_templates_admin_delete"
  ON expense_category_templates FOR DELETE
  USING (auth_role() = 'admin');

-- project_expense_categories: akses via project
CREATE POLICY "project_expense_categories_admin_pm"
  ON project_expense_categories
  USING (
    auth_role() IN ('admin', 'pm')
    AND project_id IN (
      SELECT id FROM projects
      WHERE auth_role() = 'admin' OR pm_id = auth_user_id()
    )
  );

CREATE POLICY "project_expense_categories_mandor_select"
  ON project_expense_categories FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Finance (invoices, payments, tax_records, expense_reports)
-- ─────────────────────────────────────────────────────────────────────────────

-- invoices
CREATE POLICY "invoices_admin_pm"
  ON invoices USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "invoices_client_select"
  ON invoices FOR SELECT
  USING (
    auth_role() = 'client'
    AND project_id IN (
      SELECT id FROM projects WHERE client_id = auth_client_id()
    )
  );

-- invoice_line_items: inherit dari invoices
CREATE POLICY "invoice_line_items_admin_pm"
  ON invoice_line_items USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "invoice_line_items_client_select"
  ON invoice_line_items FOR SELECT
  USING (
    auth_role() = 'client'
    AND invoice_id IN (
      SELECT id FROM invoices
      WHERE project_id IN (
        SELECT id FROM projects WHERE client_id = auth_client_id()
      )
    )
  );

-- payments
CREATE POLICY "payments_admin_pm"
  ON payments USING (auth_role() IN ('admin', 'pm'));

-- tax_records
CREATE POLICY "tax_records_admin_pm"
  ON tax_records USING (auth_role() IN ('admin', 'pm'));

-- expense_reports: admin+pm semua; mandor hanya di proyek yang di-assign
CREATE POLICY "expense_reports_admin_pm"
  ON expense_reports USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "expense_reports_mandor_select"
  ON expense_reports FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "expense_reports_mandor_insert"
  ON expense_reports FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

-- expense_items: inherit dari expense_reports
CREATE POLICY "expense_items_admin_pm"
  ON expense_items USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "expense_items_mandor"
  ON expense_items
  USING (
    auth_role() = 'mandor'
    AND expense_report_id IN (
      SELECT id FROM expense_reports
      WHERE project_id IN (
        SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: Cash Management
-- ─────────────────────────────────────────────────────────────────────────────

-- cash_accounts: admin+pm saja
CREATE POLICY "cash_accounts_admin_pm"
  ON cash_accounts USING (auth_role() IN ('admin', 'pm'));

-- cash_transfers: admin+pm saja
CREATE POLICY "cash_transfers_admin_pm"
  ON cash_transfers USING (auth_role() IN ('admin', 'pm'));

-- project_expenses: mandor bisa submit di proyek yang di-assign
CREATE POLICY "project_expenses_admin_pm"
  ON project_expenses USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "project_expenses_mandor_select"
  ON project_expenses FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "project_expenses_mandor_insert"
  ON project_expenses FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: Mandor & Work
-- ─────────────────────────────────────────────────────────────────────────────

-- mandor_assignments
CREATE POLICY "mandor_assignments_admin"
  ON mandor_assignments USING (auth_role() = 'admin');

CREATE POLICY "mandor_assignments_pm_select"
  ON mandor_assignments FOR SELECT
  USING (
    auth_role() = 'pm'
    AND project_id IN (SELECT id FROM projects WHERE pm_id = auth_user_id())
  );

CREATE POLICY "mandor_assignments_pm_insert"
  ON mandor_assignments FOR INSERT
  WITH CHECK (
    auth_role() = 'pm'
    AND project_id IN (SELECT id FROM projects WHERE pm_id = auth_user_id())
  );

CREATE POLICY "mandor_assignments_pm_update"
  ON mandor_assignments FOR UPDATE
  USING (
    auth_role() = 'pm'
    AND project_id IN (SELECT id FROM projects WHERE pm_id = auth_user_id())
  )
  WITH CHECK (
    auth_role() = 'pm'
    AND project_id IN (SELECT id FROM projects WHERE pm_id = auth_user_id())
  );

CREATE POLICY "mandor_assignments_mandor_select"
  ON mandor_assignments FOR SELECT
  USING (auth_role() = 'mandor' AND mandor_id = auth_user_id());

-- work_scopes
CREATE POLICY "work_scopes_admin"
  ON work_scopes USING (auth_role() = 'admin');

CREATE POLICY "work_scopes_pm_select"
  ON work_scopes FOR SELECT
  USING (
    auth_role() = 'pm'
    AND assignment_id IN (
      SELECT id FROM mandor_assignments
      WHERE project_id IN (SELECT id FROM projects WHERE pm_id = auth_user_id())
    )
  );

CREATE POLICY "work_scopes_pm_insert"
  ON work_scopes FOR INSERT
  WITH CHECK (
    auth_role() = 'pm'
    AND assignment_id IN (
      SELECT id FROM mandor_assignments
      WHERE project_id IN (SELECT id FROM projects WHERE pm_id = auth_user_id())
    )
  );

CREATE POLICY "work_scopes_pm_update"
  ON work_scopes FOR UPDATE
  USING (
    auth_role() = 'pm'
    AND assignment_id IN (
      SELECT id FROM mandor_assignments
      WHERE project_id IN (SELECT id FROM projects WHERE pm_id = auth_user_id())
    )
  )
  WITH CHECK (
    auth_role() = 'pm'
    AND assignment_id IN (
      SELECT id FROM mandor_assignments
      WHERE project_id IN (SELECT id FROM projects WHERE pm_id = auth_user_id())
    )
  );

CREATE POLICY "work_scopes_mandor_select"
  ON work_scopes FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND assignment_id IN (
      SELECT id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

-- work_scope_items: inherit dari work_scopes
CREATE POLICY "work_scope_items_admin"
  ON work_scope_items USING (auth_role() = 'admin');

CREATE POLICY "work_scope_items_pm_select"
  ON work_scope_items FOR SELECT
  USING (
    auth_role() = 'pm'
    AND work_scope_id IN (
      SELECT ws.id FROM work_scopes ws
      JOIN mandor_assignments ma ON ws.assignment_id = ma.id
      JOIN projects p ON ma.project_id = p.id
      WHERE p.pm_id = auth_user_id()
    )
  );

CREATE POLICY "work_scope_items_pm_insert"
  ON work_scope_items FOR INSERT
  WITH CHECK (
    auth_role() = 'pm'
    AND work_scope_id IN (
      SELECT ws.id FROM work_scopes ws
      JOIN mandor_assignments ma ON ws.assignment_id = ma.id
      JOIN projects p ON ma.project_id = p.id
      WHERE p.pm_id = auth_user_id()
    )
  );

CREATE POLICY "work_scope_items_pm_update"
  ON work_scope_items FOR UPDATE
  USING (auth_role() = 'pm') WITH CHECK (auth_role() = 'pm');

CREATE POLICY "work_scope_items_mandor_select"
  ON work_scope_items FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND work_scope_id IN (
      SELECT ws.id FROM work_scopes ws
      JOIN mandor_assignments ma ON ws.assignment_id = ma.id
      WHERE ma.mandor_id = auth_user_id()
    )
  );

-- workers (global registry)
CREATE POLICY "workers_admin"
  ON workers USING (auth_role() = 'admin');

CREATE POLICY "workers_pm_select"
  ON workers FOR SELECT USING (auth_role() = 'pm');

CREATE POLICY "workers_pm_insert"
  ON workers FOR INSERT WITH CHECK (auth_role() = 'pm');

CREATE POLICY "workers_pm_update"
  ON workers FOR UPDATE USING (auth_role() = 'pm') WITH CHECK (auth_role() = 'pm');

-- mandor lihat worker yang pernah dicatat di wage_items scope sendiri
CREATE POLICY "workers_mandor_select"
  ON workers FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND (
      mandor_id = auth_user_id()
      OR id IN (
        SELECT wi.worker_id FROM wage_items wi
        JOIN weekly_wage_reports wr ON wi.report_id = wr.id
        JOIN mandor_assignments ma ON wr.assignment_id = ma.id
        WHERE ma.mandor_id = auth_user_id()
      )
    )
  );

-- mandor bisa daftarkan tukang baru dan update tukang milik sendiri
CREATE POLICY "workers_mandor_insert"
  ON workers FOR INSERT
  WITH CHECK (auth_role() = 'mandor');

CREATE POLICY "workers_mandor_update"
  ON workers FOR UPDATE
  USING (auth_role() = 'mandor' AND mandor_id = auth_user_id())
  WITH CHECK (auth_role() = 'mandor' AND mandor_id = auth_user_id());

-- daily_wage_logs
CREATE POLICY "daily_wage_logs_admin_pm"
  ON daily_wage_logs USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "daily_wage_logs_mandor_select"
  ON daily_wage_logs FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND work_scope_id IN (
      SELECT ws.id FROM work_scopes ws
      JOIN mandor_assignments ma ON ws.assignment_id = ma.id
      WHERE ma.mandor_id = auth_user_id()
    )
  );

CREATE POLICY "daily_wage_logs_mandor_insert"
  ON daily_wage_logs FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND work_scope_id IN (
      SELECT ws.id FROM work_scopes ws
      JOIN mandor_assignments ma ON ws.assignment_id = ma.id
      WHERE ma.mandor_id = auth_user_id()
    )
  );

-- weekly_wage_reports
CREATE POLICY "wage_reports_admin_pm"
  ON weekly_wage_reports USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "wage_reports_mandor_select"
  ON weekly_wage_reports FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND assignment_id IN (
      SELECT id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "wage_reports_mandor_insert"
  ON weekly_wage_reports FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND assignment_id IN (
      SELECT id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

-- wage_items & wage_deductions: inherit dari weekly_wage_reports
CREATE POLICY "wage_items_admin_pm"
  ON wage_items USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "wage_items_mandor"
  ON wage_items
  USING (
    auth_role() = 'mandor'
    AND report_id IN (
      SELECT id FROM weekly_wage_reports
      WHERE assignment_id IN (
        SELECT id FROM mandor_assignments WHERE mandor_id = auth_user_id()
      )
    )
  );

CREATE POLICY "wage_deductions_admin_pm"
  ON wage_deductions USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "wage_deductions_mandor"
  ON wage_deductions
  USING (
    auth_role() = 'mandor'
    AND report_id IN (
      SELECT id FROM weekly_wage_reports
      WHERE assignment_id IN (
        SELECT id FROM mandor_assignments WHERE mandor_id = auth_user_id()
      )
    )
  );

-- kasbons
CREATE POLICY "kasbons_admin_pm"
  ON kasbons USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "kasbons_mandor_select"
  ON kasbons FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND work_scope_id IN (
      SELECT ws.id FROM work_scopes ws
      JOIN mandor_assignments ma ON ws.assignment_id = ma.id
      WHERE ma.mandor_id = auth_user_id()
    )
  );

CREATE POLICY "kasbons_mandor_insert"
  ON kasbons FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND work_scope_id IN (
      SELECT ws.id FROM work_scopes ws
      JOIN mandor_assignments ma ON ws.assignment_id = ma.id
      WHERE ma.mandor_id = auth_user_id()
    )
  );

-- worker_kasbons
CREATE POLICY "worker_kasbons_admin_pm"
  ON worker_kasbons USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "worker_kasbons_mandor_select"
  ON worker_kasbons FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "worker_kasbons_mandor_insert"
  ON worker_kasbons FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

-- progress_payments & borongan_settlements
CREATE POLICY "progress_payments_admin_pm"
  ON progress_payments USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "progress_payments_mandor_select"
  ON progress_payments FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND work_scope_id IN (
      SELECT ws.id FROM work_scopes ws
      JOIN mandor_assignments ma ON ws.assignment_id = ma.id
      WHERE ma.mandor_id = auth_user_id()
    )
  );

CREATE POLICY "borongan_settlements_admin_pm"
  ON borongan_settlements USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "borongan_settlements_mandor_select"
  ON borongan_settlements FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND work_scope_id IN (
      SELECT ws.id FROM work_scopes ws
      JOIN mandor_assignments ma ON ws.assignment_id = ma.id
      WHERE ma.mandor_id = auth_user_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: Monitoring (milestones, progress_logs, photos, documents)
-- ─────────────────────────────────────────────────────────────────────────────

-- milestones
CREATE POLICY "milestones_admin_pm"
  ON milestones USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "milestones_mandor_select"
  ON milestones FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "milestones_client_select"
  ON milestones FOR SELECT
  USING (
    auth_role() = 'client'
    AND project_id IN (SELECT id FROM projects WHERE client_id = auth_client_id())
  );

-- progress_logs
CREATE POLICY "progress_logs_admin_pm"
  ON progress_logs USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "progress_logs_mandor_select"
  ON progress_logs FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "progress_logs_mandor_insert"
  ON progress_logs FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "progress_logs_client_select"
  ON progress_logs FOR SELECT
  USING (
    auth_role() = 'client'
    AND project_id IN (SELECT id FROM projects WHERE client_id = auth_client_id())
  );

-- project_photos
CREATE POLICY "project_photos_admin_pm"
  ON project_photos USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "project_photos_mandor_select"
  ON project_photos FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "project_photos_mandor_insert"
  ON project_photos FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "project_photos_client_select"
  ON project_photos FOR SELECT
  USING (
    auth_role() = 'client'
    AND project_id IN (SELECT id FROM projects WHERE client_id = auth_client_id())
  );

-- documents
CREATE POLICY "documents_admin_pm"
  ON documents USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "documents_client_select"
  ON documents FOR SELECT
  USING (
    auth_role() = 'client'
    AND project_id IN (SELECT id FROM projects WHERE client_id = auth_client_id())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: System (notifications, audit_logs)
-- ─────────────────────────────────────────────────────────────────────────────

-- notifications: setiap user hanya lihat notif dirinya sendiri
CREATE POLICY "notifications_own_select"
  ON notifications FOR SELECT
  USING (user_id = auth_user_id());

-- INSERT: service_role only → tidak ada policy → JWT calls denied, service_role bypass
CREATE POLICY "notifications_own_update"
  ON notifications FOR UPDATE
  USING (user_id = auth_user_id())
  WITH CHECK (user_id = auth_user_id());

CREATE POLICY "notifications_own_delete"
  ON notifications FOR DELETE
  USING (user_id = auth_user_id());

-- audit_logs: hanya admin bisa baca; INSERT/UPDATE/DELETE hanya service_role
CREATE POLICY "audit_logs_admin_select"
  ON audit_logs FOR SELECT
  USING (auth_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: Procurement / Pengadaan
-- ─────────────────────────────────────────────────────────────────────────────

-- material_categories & materials: semua authenticated bisa baca (untuk dropdown MR)
CREATE POLICY "material_categories_select"
  ON material_categories FOR SELECT USING (true);

CREATE POLICY "material_categories_admin_pm"
  ON material_categories FOR INSERT WITH CHECK (auth_role() IN ('admin', 'pm'));

CREATE POLICY "material_categories_admin_pm_update"
  ON material_categories FOR UPDATE
  USING (auth_role() IN ('admin', 'pm')) WITH CHECK (auth_role() IN ('admin', 'pm'));

CREATE POLICY "materials_select"
  ON materials FOR SELECT USING (true);

CREATE POLICY "materials_admin_pm_insert"
  ON materials FOR INSERT WITH CHECK (auth_role() IN ('admin', 'pm'));

CREATE POLICY "materials_admin_pm_update"
  ON materials FOR UPDATE
  USING (auth_role() IN ('admin', 'pm')) WITH CHECK (auth_role() IN ('admin', 'pm'));

CREATE POLICY "materials_admin_delete"
  ON materials FOR DELETE USING (auth_role() = 'admin');

-- suppliers, supplier_invoices, supplier_payments, allocations: admin+pm saja
CREATE POLICY "suppliers_admin_pm"
  ON suppliers USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "supplier_invoices_admin_pm"
  ON supplier_invoices USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "supplier_payments_admin_pm"
  ON supplier_payments USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "supplier_payment_allocations_admin_pm"
  ON supplier_payment_allocations USING (auth_role() IN ('admin', 'pm'));

-- project_stocks & stock_movements: mandor bisa lihat & insert di proyek yang di-assign
CREATE POLICY "project_stocks_admin_pm"
  ON project_stocks USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "project_stocks_mandor_select"
  ON project_stocks FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "project_stocks_mandor_insert"
  ON project_stocks FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "stock_movements_admin_pm"
  ON stock_movements USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "stock_movements_mandor_select"
  ON stock_movements FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "stock_movements_mandor_insert"
  ON stock_movements FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

-- material_requests & mr_items
CREATE POLICY "material_requests_admin_pm"
  ON material_requests USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "material_requests_mandor_select"
  ON material_requests FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "material_requests_mandor_insert"
  ON material_requests FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "material_request_items_admin_pm"
  ON material_request_items USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "material_request_items_mandor"
  ON material_request_items
  USING (
    auth_role() = 'mandor'
    AND mr_id IN (
      SELECT id FROM material_requests
      WHERE project_id IN (
        SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
      )
    )
  );

-- purchase_orders & po_items: mandor hanya view
CREATE POLICY "purchase_orders_admin_pm"
  ON purchase_orders USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "purchase_orders_mandor_select"
  ON purchase_orders FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "purchase_order_items_admin_pm"
  ON purchase_order_items USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "purchase_order_items_mandor_select"
  ON purchase_order_items FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND po_id IN (
      SELECT id FROM purchase_orders
      WHERE project_id IN (
        SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
      )
    )
  );

-- goods_receipts & gr_items: mandor bisa input GR di lapangan
CREATE POLICY "goods_receipts_admin_pm"
  ON goods_receipts USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "goods_receipts_mandor_select"
  ON goods_receipts FOR SELECT
  USING (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "goods_receipts_mandor_insert"
  ON goods_receipts FOR INSERT
  WITH CHECK (
    auth_role() = 'mandor'
    AND project_id IN (
      SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
    )
  );

CREATE POLICY "goods_receipt_items_admin_pm"
  ON goods_receipt_items USING (auth_role() IN ('admin', 'pm'));

CREATE POLICY "goods_receipt_items_mandor"
  ON goods_receipt_items
  USING (
    auth_role() = 'mandor'
    AND gr_id IN (
      SELECT id FROM goods_receipts
      WHERE project_id IN (
        SELECT project_id FROM mandor_assignments WHERE mandor_id = auth_user_id()
      )
    )
  );
