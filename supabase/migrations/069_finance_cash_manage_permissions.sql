-- Migration 069: capability finance:manage + cash:manage (admin+pm default)
-- Epic 4 Financial group. Policy lama Financial mayoritas `auth_role() IN
-- ('admin','pm')` blanket (invoices, payments, tax_records, expense_reports,
-- kasbons, cash_accounts, cash_transfers, project_expenses, dst).
--
-- Capability existing tidak ada yang merepresentasikan "kelola finansial/kas"
-- blanket admin+pm tanpa memperluas akses (finance:view/cash:view dimiliki
-- mandor/client juga). Derivasi capability baru (ADR-004 + Eng Default Rule #3),
-- seed admin+pm → scope IDENTIK policy lama. Tetap configurable via UI.

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('finance:manage', 'finance', 'Kelola Keuangan', 'Mengelola invoice, pembayaran, pajak, laporan pengeluaran (admin/pm)', 5),
  ('cash:manage',    'cash',    'Kelola Kas',      'Mengelola akun kas, transfer, pengeluaran proyek (admin/pm)', 5);

DO $$
DECLARE v_admin UUID; v_pm UUID;
BEGIN
  SELECT id INTO v_admin FROM roles WHERE name = 'admin';
  SELECT id INTO v_pm    FROM roles WHERE name = 'pm';
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_admin, id FROM permissions WHERE key IN ('finance:manage', 'cash:manage');
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_pm, id FROM permissions WHERE key IN ('finance:manage', 'cash:manage');
END $$;
