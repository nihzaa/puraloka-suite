-- ============================================================
-- PURALOKA SUITE — Migration 033
-- Relax invoice constraint: allow commission_billing tanpa expense_report_id
-- (direct commission billing tanpa expense report formal)
-- Tambah kolom retensi dan total_pengeluaran untuk komisi langsung
-- ============================================================

-- Drop constraint lama yang terlalu rigid
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS chk_invoice_termin_or_komisi;

-- Constraint baru: termin_billing tetap wajib termin_schedule_id
-- commission_billing bisa dengan atau tanpa expense_report_id (komisi langsung)
ALTER TABLE invoices
  ADD CONSTRAINT chk_invoice_termin_billing CHECK (
    invoice_type != 'termin_billing' OR termin_schedule_id IS NOT NULL
  );

-- Kolom tambahan untuk komisi langsung (tanpa expense_report)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS total_pengeluaran  NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS commission_pct     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS retensi_pct        NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS retensi_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description        TEXT;

COMMENT ON COLUMN invoices.total_pengeluaran IS 'Total pengeluaran proyek untuk commission_billing langsung (tanpa expense_report)';
COMMENT ON COLUMN invoices.commission_pct    IS 'Persentase komisi yang ditagih ke klien';
COMMENT ON COLUMN invoices.retensi_pct       IS 'Persentase potongan retensi yang ditahan klien';
COMMENT ON COLUMN invoices.retensi_amount    IS 'Nilai potongan retensi: base_amount * retensi_pct / 100';
COMMENT ON COLUMN invoices.description       IS 'Deskripsi invoice untuk ditampilkan di PDF';
