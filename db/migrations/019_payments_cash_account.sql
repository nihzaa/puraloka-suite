-- ============================================================
-- PURALOKA SUITE — Migration 019
-- Tambah cash_account_id ke tabel payments
-- Ketika payment dicatat, saldo kas tujuan otomatis bertambah
-- ============================================================

-- Tambah kolom cash_account_id ke payments (nullable — backward compatible)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS cash_account_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_cash_account_id ON payments(cash_account_id);

COMMENT ON COLUMN payments.cash_account_id IS 'Kas tujuan penerimaan pembayaran. Nullable untuk backward compatibility dengan payment lama.';

-- ============================================================
-- TRIGGER: auto-update saldo kas saat payment dicatat
-- Saat INSERT payments dengan cash_account_id → tambah balance
-- Saat DELETE payments dengan cash_account_id → kurangi balance (reversal)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_cash_balance_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cash_account_id IS NOT NULL THEN
      UPDATE cash_accounts
        SET balance = balance + NEW.amount_paid,
            updated_at = NOW()
        WHERE id = NEW.cash_account_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.cash_account_id IS NOT NULL THEN
      UPDATE cash_accounts
        SET balance = balance - OLD.amount_paid,
            updated_at = NOW()
        WHERE id = OLD.cash_account_id;
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Jika cash_account_id berubah atau amount berubah, adjust saldo
    IF OLD.cash_account_id IS NOT NULL THEN
      UPDATE cash_accounts
        SET balance = balance - OLD.amount_paid,
            updated_at = NOW()
        WHERE id = OLD.cash_account_id;
    END IF;
    IF NEW.cash_account_id IS NOT NULL THEN
      UPDATE cash_accounts
        SET balance = balance + NEW.amount_paid,
            updated_at = NOW()
        WHERE id = NEW.cash_account_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_cash_balance_on_payment ON payments;
CREATE TRIGGER trg_update_cash_balance_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION fn_update_cash_balance_on_payment();
