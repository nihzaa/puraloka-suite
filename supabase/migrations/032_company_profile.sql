-- ============================================================
-- PURALOKA SUITE — Migration 032
-- Company Profile: single-row settings table
-- ============================================================

CREATE TABLE IF NOT EXISTS company_profile (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name        VARCHAR(200)  NOT NULL DEFAULT 'Puraloka Persada',
  tagline             VARCHAR(200),
  address             TEXT,
  city                VARCHAR(100)  DEFAULT 'Bandung',
  postal_code         VARCHAR(10),
  phone               VARCHAR(20),
  email               VARCHAR(100),
  website             VARCHAR(100),
  npwp                VARCHAR(30),
  logo_url            TEXT,
  bank_name           VARCHAR(100),
  bank_account        VARCHAR(50),
  bank_account_name   VARCHAR(100),
  invoice_prefix      VARCHAR(20)   NOT NULL DEFAULT 'INV',
  invoice_notes       TEXT,
  signature_name      VARCHAR(100),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Single-row table: insert default jika belum ada
INSERT INTO company_profile (company_name)
VALUES ('Puraloka Persada')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE  company_profile                  IS 'Profil perusahaan: single row, selalu UPDATE bukan INSERT';
COMMENT ON COLUMN company_profile.invoice_prefix   IS 'Prefix nomor invoice, default INV. Format: PREFIX/YYYY/MM/XXX';
COMMENT ON COLUMN company_profile.invoice_notes    IS 'Catatan footer invoice, misal: denda keterlambatan';
COMMENT ON COLUMN company_profile.signature_name   IS 'Nama penandatangan yang tampil di footer PDF invoice';
