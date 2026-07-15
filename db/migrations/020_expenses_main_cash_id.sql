-- ============================================================
-- PURALOKA SUITE — Migration 020
-- Tambah main_cash_id ke project_expenses
-- Supaya pengeluaran dari Kas Utama bisa potong saldo spesifik
-- ============================================================

ALTER TABLE project_expenses
  ADD COLUMN IF NOT EXISTS main_cash_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_expenses_main_cash_id ON project_expenses(main_cash_id);

COMMENT ON COLUMN project_expenses.main_cash_id IS
  'Akun Kas Utama sumber pengeluaran. Nullable — hanya diisi jika expense_source = main_cash.';

-- ============================================================
-- TRIGGER: auto-update saldo Kas Utama saat pengeluaran disetujui
-- Logic mirip dengan trigger petty_cash di migration sebelumnya,
-- tapi dikontrol lewat status = approved (bukan insert langsung)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_main_cash_on_expense()
RETURNS TRIGGER AS $$
BEGIN
  -- Saat status berubah ke approved → kurangi saldo main_cash
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
      IF NEW.main_cash_id IS NOT NULL AND NEW.expense_source = 'main_cash' THEN
        UPDATE cash_accounts
          SET balance = balance - NEW.total_amount,
              updated_at = NOW()
          WHERE id = NEW.main_cash_id;
      END IF;
    END IF;

    -- Saat approved di-rollback ke rejected → kembalikan saldo
    IF OLD.status = 'approved' AND NEW.status = 'rejected' THEN
      IF OLD.main_cash_id IS NOT NULL AND OLD.expense_source = 'main_cash' THEN
        UPDATE cash_accounts
          SET balance = balance + OLD.total_amount,
              updated_at = NOW()
          WHERE id = OLD.main_cash_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_main_cash_on_expense ON project_expenses;
CREATE TRIGGER trg_update_main_cash_on_expense
  AFTER UPDATE ON project_expenses
  FOR EACH ROW EXECUTE FUNCTION fn_update_main_cash_on_expense();
