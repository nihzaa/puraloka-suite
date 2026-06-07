-- ============================================================
-- PURALOKA SUITE — Migration 006
-- Invoices, Payments & Tax Records
-- ============================================================

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
  id                    UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID            NOT NULL REFERENCES projects(id),
  termin_schedule_id    UUID            REFERENCES termin_schedules(id),    -- Untuk model termin
  expense_report_id     UUID            REFERENCES expense_reports(id),     -- Untuk model komisi
  invoice_number        VARCHAR(100)    NOT NULL UNIQUE,
  invoice_type          invoice_type    NOT NULL,
  base_amount           NUMERIC(15,2)   NOT NULL,                            -- Nilai sebelum komisi & pajak
  commission_amount     NUMERIC(15,2)   NOT NULL DEFAULT 0,                  -- Fee komisi (hanya model komisi)
  tax_amount            NUMERIC(15,2)   NOT NULL DEFAULT 0,                  -- Total pajak
  total_amount          NUMERIC(15,2)   NOT NULL,                            -- Grand total
  amount_paid           NUMERIC(15,2)   NOT NULL DEFAULT 0,
  amount_due            NUMERIC(15,2)   NOT NULL,                            -- total_amount - amount_paid
  issued_date           DATE            NOT NULL DEFAULT CURRENT_DATE,
  due_date              DATE            NOT NULL,
  paid_date             DATE,
  status                invoice_status  NOT NULL DEFAULT 'draft',
  notes                 TEXT,
  created_by            UUID            NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_invoice_due_date         CHECK (due_date >= issued_date),
  CONSTRAINT chk_invoice_base_amount      CHECK (base_amount >= 0),
  CONSTRAINT chk_invoice_total_amount     CHECK (total_amount >= 0),
  CONSTRAINT chk_invoice_amount_paid      CHECK (amount_paid >= 0),
  CONSTRAINT chk_invoice_termin_or_komisi CHECK (
    (invoice_type = 'termin_billing'      AND termin_schedule_id IS NOT NULL) OR
    (invoice_type = 'commission_billing'  AND expense_report_id IS NOT NULL)  OR
    (invoice_type = 'retention_release')
  )
);

CREATE INDEX idx_invoices_project_id         ON invoices(project_id);
CREATE INDEX idx_invoices_invoice_number     ON invoices(invoice_number);
CREATE INDEX idx_invoices_status             ON invoices(status);
CREATE INDEX idx_invoices_due_date           ON invoices(due_date);
CREATE INDEX idx_invoices_termin_schedule_id ON invoices(termin_schedule_id);
CREATE INDEX idx_invoices_expense_report_id  ON invoices(expense_report_id);

COMMENT ON TABLE  invoices                      IS 'Invoice penagihan ke klien';
COMMENT ON COLUMN invoices.invoice_type         IS 'termin_billing | commission_billing | retention_release';
COMMENT ON COLUMN invoices.commission_amount    IS 'Nilai fee komisi dari total pengeluaran (hanya untuk commission_billing)';
COMMENT ON COLUMN invoices.amount_due           IS 'Sisa tagihan: total_amount - amount_paid';

-- ============================================================
-- PAYMENTS
-- Pencatatan pembayaran dari klien per invoice
-- ============================================================
CREATE TABLE payments (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID            NOT NULL REFERENCES invoices(id),
  amount_paid     NUMERIC(15,2)   NOT NULL,
  payment_method  payment_method  NOT NULL DEFAULT 'transfer_bank',
  paid_at         DATE            NOT NULL DEFAULT CURRENT_DATE,
  ref_number      VARCHAR(255),                                     -- Nomor referensi transfer / cek
  bank_name       VARCHAR(100),
  notes           TEXT,
  recorded_by     UUID            NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_payment_amount CHECK (amount_paid > 0)
);

CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_paid_at    ON payments(paid_at);

COMMENT ON TABLE  payments            IS 'Pencatatan pembayaran masuk dari klien per invoice';
COMMENT ON COLUMN payments.ref_number IS 'Nomor referensi transfer bank, cek, atau giro';

-- ============================================================
-- TAX_RECORDS
-- Rekap pajak per invoice
-- ============================================================
CREATE TABLE tax_records (
  id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID                NOT NULL REFERENCES invoices(id),
  tax_type        tax_type            NOT NULL,
  tax_scheme      tax_scheme          NOT NULL,
  base_amount     NUMERIC(15,2)       NOT NULL,
  rate_pct        NUMERIC(5,2)        NOT NULL,                     -- Tarif pajak (%)
  tax_amount      NUMERIC(15,2)       NOT NULL,                     -- base_amount * rate_pct / 100
  efaktur_number  VARCHAR(100),                                     -- Nomor e-Faktur jika ada
  period_month    DATE                NOT NULL,                     -- Bulan pelaporan (simpan sebagai tanggal 1 bulan bersangkutan)
  status          tax_record_status   NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tax_rate_pct    CHECK (rate_pct > 0 AND rate_pct <= 100),
  CONSTRAINT chk_tax_base_amount CHECK (base_amount > 0),
  CONSTRAINT chk_tax_amount      CHECK (tax_amount > 0)
);

CREATE INDEX idx_tax_records_invoice_id    ON tax_records(invoice_id);
CREATE INDEX idx_tax_records_tax_type      ON tax_records(tax_type);
CREATE INDEX idx_tax_records_period_month  ON tax_records(period_month);
CREATE INDEX idx_tax_records_status        ON tax_records(status);

COMMENT ON TABLE  tax_records               IS 'Rekap pajak per invoice untuk keperluan pelaporan SPT';
COMMENT ON COLUMN tax_records.period_month  IS 'Bulan pelaporan pajak, disimpan sebagai tanggal 1 bulan bersangkutan (misal: 2026-06-01)';
COMMENT ON COLUMN tax_records.rate_pct      IS 'PPh final 4(2): 2% untuk kualifikasi kecil | PPN: 11%';
