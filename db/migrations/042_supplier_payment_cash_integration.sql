-- Migration 042: Integrasi Supplier Payments → Cash Accounts
-- Menghubungkan pembayaran hutang supplier ke akun kas
-- Saat admin bayar hutang supplier, bisa pilih kas mana uang keluar → saldo kas otomatis berkurang

-- ─── Tambah kolom cash_account_id ke supplier_payments ───────────────────────
ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS cash_account_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_payments_cash_account ON supplier_payments(cash_account_id);

-- ─── Trigger: deduct/refund cash_accounts.balance ────────────────────────────
-- INSERT dengan cash_account_id → kurangi saldo
-- DELETE dengan cash_account_id → kembalikan saldo
CREATE OR REPLACE FUNCTION fn_update_cash_on_supplier_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.cash_account_id IS NOT NULL THEN
    UPDATE cash_accounts
       SET balance    = balance - NEW.amount,
           updated_at = NOW()
     WHERE id = NEW.cash_account_id;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.cash_account_id IS NOT NULL THEN
    UPDATE cash_accounts
       SET balance    = balance + OLD.amount,
           updated_at = NOW()
     WHERE id = OLD.cash_account_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_cash_on_supplier_payment
  AFTER INSERT OR DELETE ON supplier_payments
  FOR EACH ROW EXECUTE FUNCTION fn_update_cash_on_supplier_payment();
