-- ============================================================
-- PURALOKA SUITE — Migration 025
-- Fix: trigger fn_update_main_cash_on_expense tidak handle INSERT
-- Admin/PM yang langsung approve (INSERT status=approved) tidak
-- memotong saldo Kas Utama karena trigger sebelumnya hanya AFTER UPDATE
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_main_cash_on_expense()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- INSERT langsung approved → kurangi saldo main_cash
    IF NEW.status = 'approved' AND NEW.main_cash_id IS NOT NULL AND NEW.expense_source = 'main_cash' THEN
      UPDATE cash_accounts
        SET balance = balance - NEW.total_amount, updated_at = NOW()
        WHERE id = NEW.main_cash_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Status berubah ke approved → kurangi saldo
    IF NEW.status = 'approved' AND OLD.status != 'approved'
       AND NEW.main_cash_id IS NOT NULL AND NEW.expense_source = 'main_cash' THEN
      UPDATE cash_accounts
        SET balance = balance - NEW.total_amount, updated_at = NOW()
        WHERE id = NEW.main_cash_id;
    END IF;

    -- Approved di-rollback ke rejected → kembalikan saldo
    IF OLD.status = 'approved' AND NEW.status = 'rejected'
       AND OLD.main_cash_id IS NOT NULL AND OLD.expense_source = 'main_cash' THEN
      UPDATE cash_accounts
        SET balance = balance + OLD.total_amount, updated_at = NOW()
        WHERE id = OLD.main_cash_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger agar cover INSERT sekaligus UPDATE
DROP TRIGGER IF EXISTS trg_update_main_cash_on_expense ON project_expenses;
CREATE TRIGGER trg_update_main_cash_on_expense
  AFTER INSERT OR UPDATE OF status ON project_expenses
  FOR EACH ROW EXECUTE FUNCTION fn_update_main_cash_on_expense();
