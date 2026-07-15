-- ============================================================
-- PURALOKA SUITE — Migration 034
-- Flexible Invoice Line Items
--
-- Tujuan: PM bisa buat invoice kapan saja berisi pengeluaran
-- spesifik (material, upah, dll) dari project_expenses,
-- dengan dukungan partial billing dan item manual.
--
-- Perubahan:
-- 1. Tambah 2 nilai baru ke enum invoice_type
-- 2. Tabel invoice_line_items — detail baris per invoice
-- 3. Kolom billed_amount di project_expenses — tracking partial billing
-- ============================================================

-- ─── 1. Tambah invoice_type baru ─────────────────────────────────────────────
-- expense_billing : tagihan pengeluaran transparan (material, upah, dll)
-- commission_fee  : invoice fee komisi saja (terpisah di akhir proyek)
ALTER TYPE invoice_type ADD VALUE IF NOT EXISTS 'expense_billing';
ALTER TYPE invoice_type ADD VALUE IF NOT EXISTS 'commission_fee';

-- ─── 2. Tabel invoice_line_items ─────────────────────────────────────────────
-- Setiap baris item dalam sebuah invoice.
-- Berlaku untuk invoice_type: expense_billing, commission_billing, commission_fee.
-- Untuk termin_billing tidak dipakai (sudah pakai termin_schedule_id).
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID            NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  -- Link ke pengeluaran proyek (opsional — NULL berarti item manual)
  expense_id    UUID            REFERENCES project_expenses(id) ON DELETE SET NULL,

  -- Data item — bisa di-copy dari expense atau diisi manual
  description   VARCHAR(500)    NOT NULL,
  qty           NUMERIC(10,3)   NOT NULL DEFAULT 1,
  unit          VARCHAR(50),                         -- "lbr", "kg", "m³", "ls", dll
  unit_price    NUMERIC(15,2)   NOT NULL DEFAULT 0,
  amount        NUMERIC(15,2)   NOT NULL,            -- qty × unit_price (atau partial dari expense)

  sort_order    SMALLINT        NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Satu expense hanya bisa masuk satu invoice (mencegah double billing)
  -- Partial billing: satu expense bisa di-split menjadi beberapa line items
  -- di invoice yang sama, tapi tidak lintas invoice
  CONSTRAINT chk_line_item_qty    CHECK (qty > 0),
  CONSTRAINT chk_line_item_price  CHECK (unit_price >= 0),
  CONSTRAINT chk_line_item_amount CHECK (amount >= 0)
);

CREATE INDEX idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);
CREATE INDEX idx_invoice_line_items_expense_id ON invoice_line_items(expense_id);

-- Unique: satu expense_id hanya bisa muncul di satu invoice
-- (NULL expense_id = item manual, boleh banyak)
CREATE UNIQUE INDEX uq_invoice_line_expense
  ON invoice_line_items(expense_id)
  WHERE expense_id IS NOT NULL;

COMMENT ON TABLE  invoice_line_items            IS 'Detail baris item per invoice — untuk expense_billing, commission_billing, commission_fee';
COMMENT ON COLUMN invoice_line_items.expense_id IS 'Link ke project_expenses. NULL = item manual (upah, lain-lain tidak tercatat sebagai expense formal)';
COMMENT ON COLUMN invoice_line_items.amount     IS 'Nilai yang ditagihkan — bisa < expense.total_amount untuk partial billing';
COMMENT ON COLUMN invoice_line_items.sort_order IS 'Urutan tampil di invoice PDF';

-- ─── 3. Kolom billed_amount di project_expenses ──────────────────────────────
-- Track berapa dari total_amount expense ini yang sudah ditagihkan ke klien.
-- billed_amount = 0               → belum pernah ditagih
-- 0 < billed_amount < total_amount → partial billed
-- billed_amount = total_amount    → fully billed
ALTER TABLE project_expenses
  ADD COLUMN IF NOT EXISTS billed_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE project_expenses
  ADD CONSTRAINT chk_expense_billed_amount
    CHECK (billed_amount >= 0 AND billed_amount <= total_amount);

COMMENT ON COLUMN project_expenses.billed_amount IS 'Total yang sudah ditagihkan ke klien via invoice_line_items. Update otomatis saat invoice dibuat/dibatalkan.';

-- ─── 4. Trigger: sync billed_amount saat line item berubah ───────────────────
-- Menjaga konsistensi billed_amount secara atomik (tidak perlu hitung manual di API).

CREATE OR REPLACE FUNCTION fn_sync_expense_billed_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_expense_id UUID;
  v_total      NUMERIC(15,2);
BEGIN
  -- Tentukan expense_id yang perlu di-sync
  IF TG_OP = 'DELETE' THEN
    v_expense_id := OLD.expense_id;
  ELSE
    v_expense_id := NEW.expense_id;
  END IF;

  -- Hanya proses jika ada expense_id (bukan item manual)
  IF v_expense_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Hitung total amount yang sudah ditagihkan untuk expense ini
  SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM invoice_line_items
   WHERE expense_id = v_expense_id;

  UPDATE project_expenses
     SET billed_amount = v_total,
         updated_at    = NOW()
   WHERE id = v_expense_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_expense_billed_amount
  AFTER INSERT OR UPDATE OF amount, expense_id OR DELETE
  ON invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_expense_billed_amount();

-- ─── 5. Backfill: set billed_amount = 0 untuk semua expense existing ─────────
-- Sudah default 0, tapi eksplisit untuk kejelasan
UPDATE project_expenses SET billed_amount = 0 WHERE billed_amount IS NULL;
