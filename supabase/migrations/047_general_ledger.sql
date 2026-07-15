-- Migration 047: General Ledger — Phase GL-1 (Modul 10)
-- Creates the Chart of Accounts (CoA) structure and double-entry journal tables.
-- PERINGATAN: Jalankan migration ini HANYA setelah semua modul 1-12 stabil
-- dan CoA sudah divalidasi bersama akuntan / konsultan pajak Puraloka Persada.
-- Implementasi auto-jurnal (GL-2) dilakukan di application layer (AccountingEngine class),
-- BUKAN di sini — agar lebih mudah di-debug dan di-maintain.

-- ─── Chart of Accounts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,       -- '1111', '5110', dll
  name            TEXT NOT NULL,              -- 'Kas Kantor Pusat'
  account_type    TEXT NOT NULL
    CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance  TEXT NOT NULL
    CHECK (normal_balance IN ('debit', 'credit')),
  parent_id       UUID REFERENCES accounts(id),   -- hierarki: 1100 parent of 1110
  project_id      UUID REFERENCES projects(id),   -- NULL = global, NOT NULL = per proyek
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed CoA Dasar — dapat diisi via SQL seed atau melalui UI admin
-- (Seed terpisah di db/seeds/ agar bisa di-adjust sebelum dieksekusi)

-- ─── Journal Entries (Header) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number      TEXT NOT NULL UNIQUE,     -- 'JE-2026-001234' — auto-generated oleh app
  entry_date        DATE NOT NULL,
  description       TEXT NOT NULL,
  reference_type    TEXT,                     -- 'kasbon','invoice','payment','po','mr','manual'
  reference_id      UUID,                     -- ID dari tabel asal
  is_auto_generated BOOLEAN NOT NULL DEFAULT false,
  is_reversed       BOOLEAN NOT NULL DEFAULT false,
  reversed_by_id    UUID REFERENCES journal_entries(id),
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Journal Entry Lines (Detail Debit/Kredit) ────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES accounts(id),
  debit_amount      DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (debit_amount  >= 0),
  credit_amount     DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  description       TEXT,
  project_id        UUID REFERENCES projects(id),  -- untuk project costing / segmentasi
  -- Setiap baris HARUS salah satu saja (debit XOR credit)
  CONSTRAINT chk_debit_xor_credit CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0)
  )
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_accounts_code         ON accounts(code);
CREATE INDEX IF NOT EXISTS idx_accounts_type         ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_parent       ON accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date  ON journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_ref   ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry   ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_project ON journal_entry_lines(project_id)
  WHERE project_id IS NOT NULL;

-- ─── Constraints & Validation ────────────────────────────────────────────────

-- DB-level check: total debit harus = total kredit per journal entry
-- Diimplementasikan di application layer (AccountingEngine.createJournalEntry)
-- karena DB trigger untuk aggregate validation kompleks dan sulit di-debug.
-- Application layer throw error jika sum(debit) != sum(credit) sebelum INSERT.

-- ─── Views untuk Laporan ──────────────────────────────────────────────────────

-- Trial Balance view
CREATE OR REPLACE VIEW trial_balance AS
  SELECT
    a.code,
    a.name,
    a.account_type,
    a.normal_balance,
    COALESCE(SUM(jl.debit_amount),  0) AS total_debit,
    COALESCE(SUM(jl.credit_amount), 0) AS total_credit,
    CASE a.normal_balance
      WHEN 'debit'  THEN COALESCE(SUM(jl.debit_amount),  0) - COALESCE(SUM(jl.credit_amount), 0)
      WHEN 'credit' THEN COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount),  0)
    END AS balance
  FROM accounts a
  LEFT JOIN journal_entry_lines jl ON jl.account_id = a.id
  WHERE a.is_active = true
  GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
  ORDER BY a.code;

-- Updated_at trigger untuk accounts
CREATE OR REPLACE FUNCTION set_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_set_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_accounts_updated_at();

-- protect_created_at untuk journal_entries (tidak boleh di-backdated setelah dibuat)
CREATE OR REPLACE FUNCTION protect_journal_entries_created_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.created_at = OLD.created_at; RETURN NEW; END;
$$;

CREATE TRIGGER trg_protect_journal_entries_created_at
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION protect_journal_entries_created_at();
