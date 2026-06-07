-- ============================================================
-- PURALOKA SUITE — Migration 005
-- Expense Reports & Items
-- Digunakan untuk model komisi sebagai basis penagihan
-- ============================================================

-- ============================================================
-- EXPENSE_REPORTS
-- Laporan pengeluaran per periode/batch
-- ============================================================
CREATE TABLE expense_reports (
  id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID                    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reported_by         UUID                    NOT NULL REFERENCES users(id),
  title               VARCHAR(255)            NOT NULL,
  report_date         DATE                    NOT NULL DEFAULT CURRENT_DATE,
  period_start        DATE,
  period_end          DATE,
  total_material      NUMERIC(15,2)           NOT NULL DEFAULT 0,
  total_labor         NUMERIC(15,2)           NOT NULL DEFAULT 0,
  total_equipment     NUMERIC(15,2)           NOT NULL DEFAULT 0,
  total_operational   NUMERIC(15,2)           NOT NULL DEFAULT 0,
  total_other         NUMERIC(15,2)           NOT NULL DEFAULT 0,
  total_amount        NUMERIC(15,2)           NOT NULL DEFAULT 0,   -- Sum semua total_*
  notes               TEXT,
  status              expense_report_status   NOT NULL DEFAULT 'draft',
  approved_by         UUID                    REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_expense_period CHECK (period_end IS NULL OR period_end >= period_start)
);

CREATE INDEX idx_expense_reports_project_id   ON expense_reports(project_id);
CREATE INDEX idx_expense_reports_reported_by  ON expense_reports(reported_by);
CREATE INDEX idx_expense_reports_status       ON expense_reports(status);
CREATE INDEX idx_expense_reports_report_date  ON expense_reports(report_date);

COMMENT ON TABLE  expense_reports             IS 'Laporan pengeluaran proyek — basis penagihan untuk model komisi';
COMMENT ON COLUMN expense_reports.total_amount IS 'Dihitung otomatis: sum dari total_material + total_labor + total_equipment + total_operational + total_other';

-- ============================================================
-- EXPENSE_ITEMS
-- Detail item pengeluaran per laporan
-- ============================================================
CREATE TABLE expense_items (
  id              UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_report_id UUID                      NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  category_id     UUID                        NOT NULL REFERENCES project_expense_categories(id),
  description     VARCHAR(500)                NOT NULL,
  qty             NUMERIC(10,3)               NOT NULL DEFAULT 1,
  unit            VARCHAR(50),
  unit_price      NUMERIC(15,2)               NOT NULL,
  subtotal        NUMERIC(15,2)               NOT NULL,             -- qty * unit_price
  receipt_url     TEXT,                                             -- URL foto nota/kuitansi
  receipt_date    DATE,
  vendor_name     VARCHAR(255),
  notes           TEXT,
  created_at      TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_expense_item_qty      CHECK (qty > 0),
  CONSTRAINT chk_expense_item_price    CHECK (unit_price >= 0),
  CONSTRAINT chk_expense_item_subtotal CHECK (subtotal >= 0)
);

CREATE INDEX idx_expense_items_expense_report_id ON expense_items(expense_report_id);
CREATE INDEX idx_expense_items_category_id       ON expense_items(category_id);

COMMENT ON TABLE  expense_items             IS 'Detail item pengeluaran dalam sebuah laporan pengeluaran';
COMMENT ON COLUMN expense_items.receipt_url IS 'URL foto nota/kuitansi yang disimpan di Supabase Storage';
COMMENT ON COLUMN expense_items.subtotal    IS 'Dihitung otomatis: qty × unit_price';
