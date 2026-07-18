-- Migration 040: Supplier Management
-- Tabel: suppliers, supplier_invoices, supplier_payments, supplier_payment_allocations

-- ─── Master Supplier ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE,               -- 'SUP-001', opsional
  name            TEXT NOT NULL,             -- nama toko / perusahaan
  contact_person  TEXT,                      -- nama PIC
  phone           TEXT,                      -- nomor WA / HP
  email           TEXT,
  address         TEXT,
  city            TEXT,
  payment_terms   TEXT DEFAULT 'cod' CHECK (payment_terms IN (
                    'cod',          -- bayar saat terima
                    'prepaid',      -- bayar sebelum kirim
                    'net_7',        -- bayar dalam 7 hari
                    'net_14',       -- bayar dalam 14 hari
                    'net_30',       -- bayar dalam 30 hari
                    'open_account'  -- hutang bebas (pola 4 — langganan lama)
                  )),
  credit_limit    DECIMAL(15,2),             -- limit hutang, NULL = tidak ada limit
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Invoice Supplier (Bon / Tagihan dari Supplier) ───────────────────────────
-- 1 pengiriman / 1 bon = 1 supplier_invoice.
-- Bisa dibuat otomatis dari Goods Receipt atau diinput manual.
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,    -- proyek tujuan material
  invoice_number  TEXT,                      -- nomor bon/faktur dari supplier (opsional)
  invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,                      -- jatuh tempo, NULL = open account (pola 4)
  total_amount    DECIMAL(15,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid     DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_due      DECIMAL(15,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  status          TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN (
                    'unpaid',       -- belum dibayar sama sekali
                    'partial',      -- sudah dibayar sebagian
                    'paid'          -- lunas
                  )),
  -- Referensi ke goods_receipt jika invoice dibuat otomatis dari GR
  goods_receipt_id UUID,                     -- FK ditambah setelah tabel GR dibuat (migration 041)
  description     TEXT,                      -- deskripsi / keterangan bon
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Pembayaran ke Supplier ───────────────────────────────────────────────────
-- 1 record = 1 kali transfer / bayar ke supplier.
-- Bisa partial dari total hutang (misal bayar 30jt dari hutang 70jt).
CREATE TABLE IF NOT EXISTS supplier_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  amount          DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT NOT NULL DEFAULT 'transfer' CHECK (payment_method IN (
                    'transfer',     -- transfer bank
                    'cash',         -- tunai
                    'check',        -- cek / giro
                    'other'
                  )),
  reference_number TEXT,                     -- nomor bukti transfer / cek
  proof_url       TEXT,                      -- URL bukti bayar (Supabase Storage)
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Alokasi Pembayaran ke Invoice ────────────────────────────────────────────
-- Satu pembayaran bisa dialokasikan ke banyak invoice (FIFO otomatis atau manual).
-- Satu invoice bisa menerima alokasi dari banyak pembayaran.
CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
  supplier_invoice_id UUID NOT NULL REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
  amount              DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payment_id, supplier_invoice_id)    -- 1 payment tidak bisa dialokasikan 2x ke invoice sama
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active            ON suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier     ON supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_project      ON supplier_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status       ON supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_due_date     ON supplier_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier     ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_date         ON supplier_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_spa_payment                    ON supplier_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_spa_invoice                    ON supplier_payment_allocations(supplier_invoice_id);

-- ─── Triggers: updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at_suppliers()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_suppliers();

CREATE OR REPLACE FUNCTION set_updated_at_supplier_invoices()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_supplier_invoices_updated_at
  BEFORE UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_supplier_invoices();

CREATE OR REPLACE FUNCTION set_updated_at_supplier_payments()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_supplier_payments_updated_at
  BEFORE UPDATE ON supplier_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_supplier_payments();

-- ─── Trigger: protect created_at ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION protect_suppliers_created_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.created_at = OLD.created_at; RETURN NEW; END;
$$;
CREATE TRIGGER trg_protect_suppliers_created_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION protect_suppliers_created_at();

CREATE OR REPLACE FUNCTION protect_supplier_invoices_created_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.created_at = OLD.created_at; RETURN NEW; END;
$$;
CREATE TRIGGER trg_protect_supplier_invoices_created_at
  BEFORE UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION protect_supplier_invoices_created_at();

-- ─── Trigger: auto-update supplier_invoices.amount_paid & status ─────────────
-- Setiap kali ada INSERT/UPDATE/DELETE di supplier_payment_allocations,
-- recalculate amount_paid dan status di supplier_invoice yang bersangkutan.
CREATE OR REPLACE FUNCTION sync_supplier_invoice_payment_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_invoice_id UUID;
  v_total      DECIMAL(15,2);
  v_paid       DECIMAL(15,2);
  v_status     TEXT;
BEGIN
  -- Tentukan invoice_id dari row yang berubah
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.supplier_invoice_id;
  ELSE
    v_invoice_id := NEW.supplier_invoice_id;
  END IF;

  -- Hitung total yang sudah dialokasikan ke invoice ini
  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM supplier_payment_allocations
   WHERE supplier_invoice_id = v_invoice_id;

  -- Ambil total invoice
  SELECT total_amount INTO v_total
    FROM supplier_invoices
   WHERE id = v_invoice_id;

  -- Tentukan status
  IF v_paid <= 0 THEN
    v_status := 'unpaid';
  ELSIF v_paid >= v_total THEN
    v_status := 'paid';
  ELSE
    v_status := 'partial';
  END IF;

  -- Update invoice
  UPDATE supplier_invoices
     SET amount_paid = v_paid, status = v_status
   WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_invoice_payment_status
  AFTER INSERT OR UPDATE OR DELETE ON supplier_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION sync_supplier_invoice_payment_status();
