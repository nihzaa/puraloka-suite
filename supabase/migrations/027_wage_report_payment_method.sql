-- ============================================================
-- PURALOKA SUITE — Migration 027
-- Tambah kolom payment_method ke weekly_wage_reports
-- Diisi saat status berubah ke 'paid'
-- ============================================================

ALTER TABLE weekly_wage_reports
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)
    CHECK (payment_method IN ('cash', 'transfer_bank'));

COMMENT ON COLUMN weekly_wage_reports.payment_method IS 'Metode pembayaran upah: cash atau transfer_bank — diisi saat status = paid';
