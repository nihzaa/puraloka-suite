-- ============================================================
-- PURALOKA SUITE — Migration 010
-- Triggers: Auto-update updated_at
-- ============================================================

-- Fungsi universal untuk update kolom updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger ke semua tabel yang punya kolom updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON termin_schedules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON expense_category_templates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_expense_categories
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON expense_reports
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON expense_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tax_records
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON mandor_assignments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON work_scopes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON daily_wage_logs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON kasbons
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- Fungsi: Auto-hitung retention_amount saat contract_value berubah
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_calc_retention_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.retention_amount = ROUND((NEW.contract_value * NEW.retention_pct / 100), 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calc_retention_amount
  BEFORE INSERT OR UPDATE OF contract_value, retention_pct ON projects
  FOR EACH ROW EXECUTE FUNCTION trigger_calc_retention_amount();

-- ============================================================
-- Fungsi: Auto-hitung amount_due di invoices
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_calc_invoice_amount_due()
RETURNS TRIGGER AS $$
BEGIN
  NEW.amount_due = NEW.total_amount - NEW.amount_paid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calc_invoice_amount_due
  BEFORE INSERT OR UPDATE OF total_amount, amount_paid ON invoices
  FOR EACH ROW EXECUTE FUNCTION trigger_calc_invoice_amount_due();

-- ============================================================
-- Fungsi: Auto-hitung subtotal di expense_items
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_calc_expense_item_subtotal()
RETURNS TRIGGER AS $$
BEGIN
  NEW.subtotal = ROUND((NEW.qty * NEW.unit_price), 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calc_expense_item_subtotal
  BEFORE INSERT OR UPDATE OF qty, unit_price ON expense_items
  FOR EACH ROW EXECUTE FUNCTION trigger_calc_expense_item_subtotal();

-- ============================================================
-- Fungsi: Auto-hitung total_amount di daily_wage_logs
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_calc_daily_wage_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_amount = ROUND((NEW.worker_count * NEW.daily_rate), 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calc_daily_wage_total
  BEFORE INSERT OR UPDATE OF worker_count, daily_rate ON daily_wage_logs
  FOR EACH ROW EXECUTE FUNCTION trigger_calc_daily_wage_total();
