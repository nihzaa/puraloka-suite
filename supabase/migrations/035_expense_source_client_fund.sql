-- ============================================================
-- PURALOKA SUITE — Migration 035
-- Tambah nilai client_fund ke enum expense_source
--
-- Digunakan untuk mencatat pengeluaran yang dibayar langsung
-- dari dana klien (model client-funded), bukan dari kas internal
-- kontraktor. Memudahkan filtering laporan dan rekonsiliasi.
-- ============================================================

ALTER TYPE expense_source ADD VALUE IF NOT EXISTS 'client_fund';

COMMENT ON TYPE expense_source IS
  'petty_cash=dari kas kecil PM, main_cash=dari kas utama langsung, personal=talangan pribadi (perlu reimburse), client_fund=dibayar dari dana klien (tidak mengurangi kas internal)';
