-- ============================================================
-- PURALOKA SUITE — Migration 051
-- Mandor Portal Improvements:
--   1. ref_type + ref_id di project_expenses (link kasbon → expense)
--   2. borongan_value_override di work_scopes (override nilai kontrak)
--   3. cash_account_id di borongan_settlements (integrasi kas)
--   4. net_payment di borongan_settlements
--   5. status + request flow di progress_payments (mandor submit → admin approve)
--   6. Trigger: auto-create project_expenses saat kasbon approved
--   7. Trigger: deduct cash saat borongan_settlement di-insert
-- ============================================================

-- ============================================================
-- 1. project_expenses — tambah ref_type + ref_id
--    Dipakai untuk link kasbon → expense (idempotent insert)
-- ============================================================
ALTER TABLE project_expenses
  ADD COLUMN IF NOT EXISTS ref_type TEXT,
  ADD COLUMN IF NOT EXISTS ref_id   UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_expenses_ref_id
  ON project_expenses(ref_id) WHERE ref_id IS NOT NULL;

COMMENT ON COLUMN project_expenses.ref_type IS 'Tipe referensi: kasbon, borongan_settlement, progress_payment';
COMMENT ON COLUMN project_expenses.ref_id   IS 'UUID referensi ke tabel asal — unique untuk mencegah duplikat auto-insert';

-- ============================================================
-- 2. work_scopes — tambah borongan_value_override
--    NULL = auto-hitung dari SUM(items.subtotal)
--    Diisi = pakai nilai manual ini sebagai nilai kontrak
-- ============================================================
ALTER TABLE work_scopes
  ADD COLUMN IF NOT EXISTS borongan_value_override NUMERIC(15,2);

COMMENT ON COLUMN work_scopes.borongan_value_override IS 'Override nilai kontrak borongan secara manual. NULL = auto dari SUM(work_scope_items.subtotal)';

-- ============================================================
-- 3. borongan_settlements — tambah cash_account_id + net_payment
--    cash_account_id: sumber kas untuk pembayaran settlement
--    net_payment: nilai yang benar-benar dibayarkan (opsional, bisa = remaining_balance)
-- ============================================================
ALTER TABLE borongan_settlements
  ADD COLUMN IF NOT EXISTS cash_account_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS net_payment     NUMERIC(15,2);

-- Backfill net_payment dari remaining_balance (jika positif)
UPDATE borongan_settlements
  SET net_payment = GREATEST(remaining_balance, 0)
  WHERE net_payment IS NULL;

CREATE INDEX IF NOT EXISTS idx_borongan_settlements_cash_account_id
  ON borongan_settlements(cash_account_id);

COMMENT ON COLUMN borongan_settlements.cash_account_id IS 'Akun kas sumber pembayaran settlement — trigger akan deduct balance';
COMMENT ON COLUMN borongan_settlements.net_payment     IS 'Nilai yang benar-benar dibayarkan. Bisa beda dari remaining_balance jika ada nego.';

-- ============================================================
-- 4. progress_payments — tambah status + request flow
--    Mandor submit request (pending) → admin approve (approved/rejected)
-- ============================================================
ALTER TABLE progress_payments
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes       TEXT,
  ADD COLUMN IF NOT EXISTS cash_account_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL;

-- Backfill: semua existing records dianggap sudah approved
-- (approved_by sudah ada, requested_by = NULL ok)
UPDATE progress_payments SET status = 'approved' WHERE status IS NULL OR status = 'approved';

CREATE INDEX IF NOT EXISTS idx_progress_payments_status ON progress_payments(status);

COMMENT ON COLUMN progress_payments.status        IS 'pending=mandor submit menunggu persetujuan, approved=disetujui+dibayar, rejected=ditolak';
COMMENT ON COLUMN progress_payments.requested_by  IS 'User yang mengajukan penagihan progress (biasanya mandor)';
COMMENT ON COLUMN progress_payments.cash_account_id IS 'Akun kas yang dipakai untuk membayar progress payment';

-- ============================================================
-- 5. TRIGGER: auto-create project_expenses saat kasbon disetujui
--    Memasukkan kasbon ke pembukuan sebagai pengeluaran proyek
-- ============================================================

CREATE OR REPLACE FUNCTION fn_kasbon_approved_create_expense()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_project_id UUID;
  v_cat_id     UUID;
BEGIN
  -- Hanya jalan saat status berubah ke approved
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    -- Cari project_id via work_scope → assignment → project
    SELECT ma.project_id INTO v_project_id
    FROM work_scopes ws
    JOIN mandor_assignments ma ON ma.id = ws.assignment_id
    WHERE ws.id = NEW.work_scope_id;

    IF v_project_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Cari kategori 'Kasbon' di project ini
    -- Fallback ke kategori pertama jika tidak ada yang cocok
    SELECT id INTO v_cat_id
    FROM project_expense_categories
    WHERE project_id = v_project_id
      AND (name ILIKE '%kasbon%' OR name ILIKE '%upah%')
    ORDER BY (name ILIKE '%kasbon%') DESC
    LIMIT 1;

    -- Jika masih tidak ada, ambil kategori pertama yang ada
    IF v_cat_id IS NULL THEN
      SELECT id INTO v_cat_id
      FROM project_expense_categories
      WHERE project_id = v_project_id
      LIMIT 1;
    END IF;

    IF v_cat_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Insert project_expenses — idempotent via ON CONFLICT ref_id
    INSERT INTO project_expenses (
      project_id,
      category_id,
      expense_source,
      description,
      expense_date,
      qty,
      unit_price,
      total_amount,
      status,
      submitted_by,
      ref_type,
      ref_id
    ) VALUES (
      v_project_id,
      v_cat_id,
      'main_cash',
      'Kasbon mandor: ' || NEW.purpose::TEXT,
      NEW.kasbon_date,
      1,
      NEW.amount,
      NEW.amount,
      'approved',
      COALESCE(NEW.approved_by, NEW.requested_by),
      'kasbon',
      NEW.id
    )
    ON CONFLICT (ref_id) DO NOTHING;

  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kasbon_approved_create_expense ON kasbons;
CREATE TRIGGER trg_kasbon_approved_create_expense
  AFTER UPDATE ON kasbons
  FOR EACH ROW EXECUTE FUNCTION fn_kasbon_approved_create_expense();

-- ============================================================
-- 6. TRIGGER: deduct cash saat borongan_settlement di-insert
-- ============================================================

CREATE OR REPLACE FUNCTION fn_settle_borongan_deduct_cash()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cash_account_id IS NOT NULL AND COALESCE(NEW.net_payment, NEW.remaining_balance) > 0 THEN
    UPDATE cash_accounts
      SET balance    = balance - COALESCE(NEW.net_payment, NEW.remaining_balance),
          updated_at = NOW()
    WHERE id = NEW.cash_account_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_settle_borongan_deduct_cash ON borongan_settlements;
CREATE TRIGGER trg_settle_borongan_deduct_cash
  AFTER INSERT ON borongan_settlements
  FOR EACH ROW EXECUTE FUNCTION fn_settle_borongan_deduct_cash();

-- ============================================================
-- 7. TRIGGER: deduct cash saat progress_payment diapprove
-- ============================================================

CREATE OR REPLACE FUNCTION fn_progress_payment_approved_deduct_cash()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF NEW.cash_account_id IS NOT NULL AND NEW.net_payment > 0 THEN
      UPDATE cash_accounts
        SET balance    = balance - NEW.net_payment,
            updated_at = NOW()
      WHERE id = NEW.cash_account_id;
    END IF;
  END IF;

  -- Rollback: jika di-reject setelah approved (edge case)
  IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    IF OLD.cash_account_id IS NOT NULL AND OLD.net_payment > 0 THEN
      UPDATE cash_accounts
        SET balance    = balance + OLD.net_payment,
            updated_at = NOW()
      WHERE id = OLD.cash_account_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_progress_payment_approved_deduct_cash ON progress_payments;
CREATE TRIGGER trg_progress_payment_approved_deduct_cash
  AFTER UPDATE ON progress_payments
  FOR EACH ROW EXECUTE FUNCTION fn_progress_payment_approved_deduct_cash();
