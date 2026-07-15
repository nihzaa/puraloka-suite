-- ============================================================
-- PURALOKA SUITE — Migration 022
-- Tambah cash_account_id ke kasbons dan worker_kasbons
-- Saat kasbon disetujui → saldo kas berkurang otomatis
-- ============================================================

-- Kasbon mandor
ALTER TABLE kasbons
  ADD COLUMN IF NOT EXISTS cash_account_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kasbons_cash_account_id ON kasbons(cash_account_id);

-- Worker kasbons (kasbon tukang)
ALTER TABLE worker_kasbons
  ADD COLUMN IF NOT EXISTS cash_account_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_worker_kasbons_cash_account_id ON worker_kasbons(cash_account_id);

-- ============================================================
-- TRIGGER: potong saldo saat kasbon mandor disetujui
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_cash_on_kasbon_approved()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- status berubah ke approved → kurangi saldo
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
      IF NEW.cash_account_id IS NOT NULL THEN
        UPDATE cash_accounts
          SET balance = balance - NEW.amount,
              updated_at = NOW()
          WHERE id = NEW.cash_account_id;
      END IF;
    END IF;

    -- approved di-rollback → kembalikan saldo
    IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      IF OLD.cash_account_id IS NOT NULL THEN
        UPDATE cash_accounts
          SET balance = balance + OLD.amount,
              updated_at = NOW()
          WHERE id = OLD.cash_account_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_cash_on_kasbon_approved ON kasbons;
CREATE TRIGGER trg_update_cash_on_kasbon_approved
  AFTER UPDATE ON kasbons
  FOR EACH ROW EXECUTE FUNCTION fn_update_cash_on_kasbon_approved();

-- ============================================================
-- TRIGGER: potong saldo saat worker_kasbon disetujui
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_cash_on_worker_kasbon_approved()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
      IF NEW.cash_account_id IS NOT NULL THEN
        UPDATE cash_accounts
          SET balance = balance - NEW.amount,
              updated_at = NOW()
          WHERE id = NEW.cash_account_id;
      END IF;
    END IF;

    IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      IF OLD.cash_account_id IS NOT NULL THEN
        UPDATE cash_accounts
          SET balance = balance + OLD.amount,
              updated_at = NOW()
          WHERE id = OLD.cash_account_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_cash_on_worker_kasbon_approved ON worker_kasbons;
CREATE TRIGGER trg_update_cash_on_worker_kasbon_approved
  AFTER UPDATE ON worker_kasbons
  FOR EACH ROW EXECUTE FUNCTION fn_update_cash_on_worker_kasbon_approved();
