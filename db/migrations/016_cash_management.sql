-- ============================================================
-- PURALOKA SUITE — Migration 016
-- Cash Management: Akun Kas, Transfer, Pengeluaran Proyek
-- ============================================================

-- ============================================================
-- ENUMS BARU
-- ============================================================

CREATE TYPE cash_account_type AS ENUM (
  'main',        -- Kas utama owner (Nizar)
  'collector',   -- Kas kolektor (Ayah) — terima dari klien
  'petty_cash'   -- Kas kecil yang dipegang PM/pengawas per proyek
);

CREATE TYPE transfer_status AS ENUM (
  'pending',    -- Sudah dicatat, menunggu konfirmasi penerima
  'confirmed',  -- Penerima konfirmasi sudah terima
  'cancelled'   -- Dibatalkan
);

CREATE TYPE expense_source AS ENUM (
  'petty_cash',  -- Dari kas kecil yang dititipkan
  'main_cash',   -- Langsung dari kas utama
  'personal'     -- Talangan pribadi, perlu di-reimburse
);

CREATE TYPE expense_status AS ENUM (
  'draft',      -- Belum disubmit
  'submitted',  -- Sudah submit, menunggu review
  'approved',   -- Disetujui admin/PM
  'rejected'    -- Ditolak
);

-- ============================================================
-- CASH_ACCOUNTS
-- Daftar semua "dompet" / rekening yang ditrack dalam sistem
-- ============================================================
CREATE TABLE cash_accounts (
  id            UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255)        NOT NULL,                          -- "Kas Utama Nizar", "Kas Ayah", "Kas Kecil PM Agus – Proyek X"
  type          cash_account_type   NOT NULL,
  owner_id      UUID                REFERENCES users(id),              -- Siapa yang pegang kas ini
  project_id    UUID                REFERENCES projects(id),           -- Untuk petty_cash: proyek terkait
  balance       NUMERIC(15,2)       NOT NULL DEFAULT 0,                -- Saldo real-time (diupdate via trigger)
  currency      CHAR(3)             NOT NULL DEFAULT 'IDR',
  notes         TEXT,
  is_active     BOOLEAN             NOT NULL DEFAULT true,
  created_by    UUID                NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_petty_cash_has_owner   CHECK (type != 'petty_cash' OR owner_id IS NOT NULL),
  CONSTRAINT chk_petty_cash_has_project CHECK (type != 'petty_cash' OR project_id IS NOT NULL)
);

CREATE INDEX idx_cash_accounts_owner_id   ON cash_accounts(owner_id);
CREATE INDEX idx_cash_accounts_project_id ON cash_accounts(project_id);
CREATE INDEX idx_cash_accounts_type       ON cash_accounts(type);
CREATE INDEX idx_cash_accounts_is_active  ON cash_accounts(is_active);

COMMENT ON TABLE  cash_accounts            IS 'Daftar akun kas/dompet yang ditrack: kas utama, kas kolektor (ayah), kas kecil PM per proyek';
COMMENT ON COLUMN cash_accounts.balance    IS 'Saldo otomatis diupdate via trigger saat ada transfer atau pengeluaran';
COMMENT ON COLUMN cash_accounts.type       IS 'main=kas utama owner, collector=kolektor (ayah terima dari klien), petty_cash=kas kecil PM per proyek';

-- ============================================================
-- CASH_TRANSFERS
-- Perpindahan uang antar akun kas
-- Contoh: Kas Ayah → Kas Nizar, Kas Nizar → Kas Kecil PM
-- ============================================================
CREATE TABLE cash_transfers (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID              NOT NULL REFERENCES cash_accounts(id),
  to_account_id   UUID              NOT NULL REFERENCES cash_accounts(id),
  amount          NUMERIC(15,2)     NOT NULL,
  transfer_date   DATE              NOT NULL DEFAULT CURRENT_DATE,
  status          transfer_status   NOT NULL DEFAULT 'pending',
  ref_number      VARCHAR(255),                                        -- No. referensi / bukti transfer
  notes           TEXT,
  proof_url       TEXT,                                                -- URL bukti transfer
  confirmed_at    TIMESTAMPTZ,
  created_by      UUID              NOT NULL REFERENCES users(id),
  confirmed_by    UUID              REFERENCES users(id),
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_transfer_different_accounts CHECK (from_account_id != to_account_id),
  CONSTRAINT chk_transfer_amount             CHECK (amount > 0)
);

CREATE INDEX idx_cash_transfers_from_account ON cash_transfers(from_account_id);
CREATE INDEX idx_cash_transfers_to_account   ON cash_transfers(to_account_id);
CREATE INDEX idx_cash_transfers_date         ON cash_transfers(transfer_date);
CREATE INDEX idx_cash_transfers_status       ON cash_transfers(status);
CREATE INDEX idx_cash_transfers_created_by   ON cash_transfers(created_by);

COMMENT ON TABLE  cash_transfers            IS 'Perpindahan dana antar akun kas: Ayah→Nizar, Nizar→Kas Kecil PM, dll';
COMMENT ON COLUMN cash_transfers.status     IS 'pending=dicatat menunggu konfirmasi, confirmed=sudah diterima, cancelled=batal';
COMMENT ON COLUMN cash_transfers.proof_url  IS 'URL bukti transfer di Supabase Storage bucket payment-proofs';

-- ============================================================
-- PROJECT_EXPENSES
-- Pengeluaran proyek harian: material & operasional
-- Bisa dari kas kecil PM atau langsung dari kas utama
-- ============================================================
CREATE TABLE project_expenses (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID              NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_id     UUID              NOT NULL REFERENCES project_expense_categories(id),
  petty_cash_id   UUID              REFERENCES cash_accounts(id),      -- Dari kas kecil mana (jika source=petty_cash)
  expense_source  expense_source    NOT NULL DEFAULT 'petty_cash',
  description     VARCHAR(500)      NOT NULL,
  expense_date    DATE              NOT NULL DEFAULT CURRENT_DATE,
  qty             NUMERIC(10,3)     NOT NULL DEFAULT 1,
  unit            VARCHAR(50),                                         -- "lbr", "kg", "m", "unit", dll
  unit_price      NUMERIC(15,2)     NOT NULL,
  total_amount    NUMERIC(15,2)     NOT NULL,                          -- qty × unit_price
  vendor_name     VARCHAR(255),                                        -- Nama toko/supplier
  receipt_url     TEXT,                                                -- Foto nota/kuitansi
  notes           TEXT,
  status          expense_status    NOT NULL DEFAULT 'submitted',
  submitted_by    UUID              NOT NULL REFERENCES users(id),
  reviewed_by     UUID              REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_expense_qty        CHECK (qty > 0),
  CONSTRAINT chk_expense_price      CHECK (unit_price >= 0),
  CONSTRAINT chk_expense_total      CHECK (total_amount >= 0),
  CONSTRAINT chk_petty_cash_source  CHECK (expense_source != 'petty_cash' OR petty_cash_id IS NOT NULL)
);

CREATE INDEX idx_project_expenses_project_id    ON project_expenses(project_id);
CREATE INDEX idx_project_expenses_category_id   ON project_expenses(category_id);
CREATE INDEX idx_project_expenses_petty_cash_id ON project_expenses(petty_cash_id);
CREATE INDEX idx_project_expenses_expense_date  ON project_expenses(expense_date);
CREATE INDEX idx_project_expenses_status        ON project_expenses(status);
CREATE INDEX idx_project_expenses_submitted_by  ON project_expenses(submitted_by);

COMMENT ON TABLE  project_expenses                 IS 'Pengeluaran proyek harian: material, operasional, dll. Bisa dari kas kecil PM atau kas utama.';
COMMENT ON COLUMN project_expenses.expense_source  IS 'petty_cash=dari kas kecil PM, main_cash=dari kas utama langsung, personal=talangan pribadi';
COMMENT ON COLUMN project_expenses.total_amount    IS 'Dihitung: qty × unit_price. Disimpan eksplisit untuk efisiensi query.';
COMMENT ON COLUMN project_expenses.receipt_url     IS 'URL foto nota di Supabase Storage bucket expense-receipts';

-- ============================================================
-- TRIGGERS: UPDATE SALDO KAS OTOMATIS
-- ============================================================

-- Fungsi: update saldo saat transfer di-confirm atau di-cancel
CREATE OR REPLACE FUNCTION fn_update_balance_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
  -- Transfer baru di-confirm: kurangi from, tambah to
  IF (TG_OP = 'UPDATE' AND OLD.status != 'confirmed' AND NEW.status = 'confirmed') THEN
    UPDATE cash_accounts SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.from_account_id;
    UPDATE cash_accounts SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.to_account_id;

  -- Transfer confirmed di-cancel: kembalikan saldo
  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status = 'cancelled') THEN
    UPDATE cash_accounts SET balance = balance + OLD.amount, updated_at = NOW()
      WHERE id = OLD.from_account_id;
    UPDATE cash_accounts SET balance = balance - OLD.amount, updated_at = NOW()
      WHERE id = OLD.to_account_id;

  -- Transfer langsung confirmed saat INSERT (status default confirmed)
  ELSIF (TG_OP = 'INSERT' AND NEW.status = 'confirmed') THEN
    UPDATE cash_accounts SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.from_account_id;
    UPDATE cash_accounts SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.to_account_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cash_transfer_balance
  AFTER INSERT OR UPDATE OF status ON cash_transfers
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_balance_on_transfer();

-- Fungsi: kurangi saldo kas kecil saat expense approved
-- Tambah kembali saldo jika expense di-reject setelah approved
CREATE OR REPLACE FUNCTION fn_update_petty_cash_on_expense()
RETURNS TRIGGER AS $$
BEGIN
  -- Expense baru approved dari petty_cash: kurangi saldo kas kecil
  IF (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved'
      AND NEW.expense_source = 'petty_cash' AND NEW.petty_cash_id IS NOT NULL) THEN
    UPDATE cash_accounts SET balance = balance - NEW.total_amount, updated_at = NOW()
      WHERE id = NEW.petty_cash_id;

  -- Expense approved di-reject: kembalikan saldo
  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status = 'rejected'
         AND OLD.expense_source = 'petty_cash' AND OLD.petty_cash_id IS NOT NULL) THEN
    UPDATE cash_accounts SET balance = balance + OLD.total_amount, updated_at = NOW()
      WHERE id = OLD.petty_cash_id;

  -- INSERT langsung approved
  ELSIF (TG_OP = 'INSERT' AND NEW.status = 'approved'
         AND NEW.expense_source = 'petty_cash' AND NEW.petty_cash_id IS NOT NULL) THEN
    UPDATE cash_accounts SET balance = balance - NEW.total_amount, updated_at = NOW()
      WHERE id = NEW.petty_cash_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expense_petty_cash_balance
  AFTER INSERT OR UPDATE OF status ON project_expenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_petty_cash_on_expense();

-- ============================================================
-- STORAGE BUCKET: expense-receipts
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('expense-receipts', 'expense-receipts', false)
  ON CONFLICT (id) DO NOTHING;

-- ⚠️ DROP dulu — `CREATE POLICY` tidak punya `IF NOT EXISTS`.
--
-- `storage.objects` adalah tabel GLOBAL: ia tidak ikut skema, jadi policy di
-- sini bertahan lintas `resetTestSchema()`. Tanpa DROP, migrasi ini gagal
-- "policy … already exists" pada run KEDUA — dan kegagalannya menuduh
-- migrasinya, bukan sifat global tabelnya.
--
-- `INSERT INTO storage.buckets` di atas sudah idempoten (`ON CONFLICT`);
-- ketiga policy ini tertinggal. Disamakan 2026-08-02 saat test alur uang
-- pertama kali memakai migrasi ini.
DROP POLICY IF EXISTS "expense_receipts_insert" ON storage.objects;
CREATE POLICY "expense_receipts_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'expense-receipts');

DROP POLICY IF EXISTS "expense_receipts_select" ON storage.objects;
CREATE POLICY "expense_receipts_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'expense-receipts');

DROP POLICY IF EXISTS "expense_receipts_delete" ON storage.objects;
CREATE POLICY "expense_receipts_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'expense-receipts');
