-- ============================================================
-- PURALOKA SUITE — Migration 021
-- Tambah cash_account_id ke weekly_wage_reports
-- Saat upah mandor ditandai paid, saldo kas berkurang otomatis
-- ============================================================

ALTER TABLE weekly_wage_reports
  ADD COLUMN IF NOT EXISTS cash_account_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_weekly_wage_reports_cash_account_id ON weekly_wage_reports(cash_account_id);

COMMENT ON COLUMN weekly_wage_reports.cash_account_id IS
  'Akun kas sumber pembayaran upah mandor. Nullable — backward compatible.';

-- ============================================================
-- TRIGGER: auto-kurangi saldo kas saat laporan upah di-paid
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_cash_on_wage_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- status berubah ke paid → kurangi saldo
    IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
      IF NEW.cash_account_id IS NOT NULL THEN
        UPDATE cash_accounts
          SET balance = balance - NEW.net_amount,
              updated_at = NOW()
          WHERE id = NEW.cash_account_id;
      END IF;
    END IF;

    -- paid di-rollback (misal ke approved kembali) → kembalikan saldo
    IF OLD.status = 'paid' AND NEW.status != 'paid' THEN
      IF OLD.cash_account_id IS NOT NULL THEN
        UPDATE cash_accounts
          SET balance = balance + OLD.net_amount,
              updated_at = NOW()
          WHERE id = OLD.cash_account_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_cash_on_wage_paid ON weekly_wage_reports;
CREATE TRIGGER trg_update_cash_on_wage_paid
  AFTER UPDATE ON weekly_wage_reports
  FOR EACH ROW EXECUTE FUNCTION fn_update_cash_on_wage_paid();
