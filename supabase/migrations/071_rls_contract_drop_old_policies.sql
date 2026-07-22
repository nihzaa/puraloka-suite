-- Migration 071: RLS CONTRACT — hapus policy lama literal-role untuk 4 kelompok
-- yang sudah di-expand (062-070). Setelah ini, RLS HANYA mengenal has_permission()
-- + ownership helper (ADR-004/ADR-005 tuntas di level database).
--
-- ⚠️ DESTRUCTIVE pada environment tunggal (dev = DB live, tidak ada prod terpisah).
-- GATE: PITR/backup Supabase HARUS terverifikasi sebelum apply (contract-gate-epic-4.md).
-- Policy baru (has_permission) sudah aktif berdampingan sejak expand → drop policy
-- lama tidak menghilangkan akses yang sah (sudah dibuktikan 103 test + harness).
--
-- ROLLBACK: re-create policy dari db/migrations/049_rls_policies.sql (referensi).

-- ── Referensi ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "material_categories_admin_pm" ON material_categories;
DROP POLICY IF EXISTS "material_categories_admin_pm_update" ON material_categories;
DROP POLICY IF EXISTS "materials_admin_pm_insert" ON materials;
DROP POLICY IF EXISTS "materials_admin_pm_update" ON materials;
DROP POLICY IF EXISTS "materials_admin_delete" ON materials;

-- ── Operasional ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "milestones_admin_pm" ON milestones;
DROP POLICY IF EXISTS "milestones_mandor_select" ON milestones;
DROP POLICY IF EXISTS "milestones_client_select" ON milestones;
DROP POLICY IF EXISTS "documents_admin_pm" ON documents;
DROP POLICY IF EXISTS "documents_client_select" ON documents;
DROP POLICY IF EXISTS "project_photos_admin_pm" ON project_photos;
DROP POLICY IF EXISTS "project_photos_mandor_select" ON project_photos;
DROP POLICY IF EXISTS "project_photos_mandor_insert" ON project_photos;
DROP POLICY IF EXISTS "project_photos_client_select" ON project_photos;

-- ── Field ops ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "progress_logs_admin_pm" ON progress_logs;
DROP POLICY IF EXISTS "progress_logs_mandor_select" ON progress_logs;
DROP POLICY IF EXISTS "progress_logs_mandor_insert" ON progress_logs;
DROP POLICY IF EXISTS "progress_logs_client_select" ON progress_logs;
DROP POLICY IF EXISTS "work_scopes_admin" ON work_scopes;
DROP POLICY IF EXISTS "work_scopes_pm_select" ON work_scopes;
DROP POLICY IF EXISTS "work_scopes_pm_insert" ON work_scopes;
DROP POLICY IF EXISTS "work_scopes_pm_update" ON work_scopes;
DROP POLICY IF EXISTS "work_scopes_mandor_select" ON work_scopes;
DROP POLICY IF EXISTS "work_scope_items_admin" ON work_scope_items;
DROP POLICY IF EXISTS "work_scope_items_pm_select" ON work_scope_items;
DROP POLICY IF EXISTS "work_scope_items_pm_insert" ON work_scope_items;
DROP POLICY IF EXISTS "work_scope_items_pm_update" ON work_scope_items;
DROP POLICY IF EXISTS "work_scope_items_mandor_select" ON work_scope_items;
DROP POLICY IF EXISTS "workers_admin" ON workers;
DROP POLICY IF EXISTS "workers_pm_select" ON workers;
DROP POLICY IF EXISTS "workers_pm_insert" ON workers;
DROP POLICY IF EXISTS "workers_pm_update" ON workers;
DROP POLICY IF EXISTS "workers_mandor_select" ON workers;
DROP POLICY IF EXISTS "workers_mandor_insert" ON workers;
DROP POLICY IF EXISTS "workers_mandor_update" ON workers;

-- ── Financial ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoices_admin_pm" ON invoices;
DROP POLICY IF EXISTS "invoices_client_select" ON invoices;
DROP POLICY IF EXISTS "invoice_line_items_admin_pm" ON invoice_line_items;
DROP POLICY IF EXISTS "invoice_line_items_client_select" ON invoice_line_items;
DROP POLICY IF EXISTS "payments_admin_pm" ON payments;
DROP POLICY IF EXISTS "tax_records_admin_pm" ON tax_records;
DROP POLICY IF EXISTS "expense_reports_admin_pm" ON expense_reports;
DROP POLICY IF EXISTS "expense_reports_mandor_select" ON expense_reports;
DROP POLICY IF EXISTS "expense_reports_mandor_insert" ON expense_reports;
DROP POLICY IF EXISTS "expense_items_admin_pm" ON expense_items;
DROP POLICY IF EXISTS "expense_items_mandor" ON expense_items;
DROP POLICY IF EXISTS "kasbons_admin_pm" ON kasbons;
DROP POLICY IF EXISTS "kasbons_mandor_select" ON kasbons;
DROP POLICY IF EXISTS "kasbons_mandor_insert" ON kasbons;
DROP POLICY IF EXISTS "cash_accounts_admin_pm" ON cash_accounts;
DROP POLICY IF EXISTS "cash_transfers_admin_pm" ON cash_transfers;
DROP POLICY IF EXISTS "project_expenses_admin_pm" ON project_expenses;
DROP POLICY IF EXISTS "project_expenses_mandor_select" ON project_expenses;
DROP POLICY IF EXISTS "project_expenses_mandor_insert" ON project_expenses;
