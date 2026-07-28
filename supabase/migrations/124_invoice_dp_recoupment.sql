-- Migration 124: Pemotongan uang muka (DP recoupment) di invoice progres
-- Konteks: PETA-PRIORITAS-ERP §3 item #3 (register piutang) — DP yang sudah
-- dibayar klien via termin on_sign dipotong bertahap dari invoice termin
-- berikutnya. Tanpa ini, DP tak pernah ter-recoup → klien bayar dobel.
--
-- Additive-only: dua kolom baru ber-DEFAULT, pola identik retensi_pct/
-- retensi_amount (migration 033). Baris existing tidak berubah (deduction 0).
-- Validasi saldo DP (potongan ≤ DP terbayar − sudah dipotong) ada di API layer
-- (finance.ts POST /invoices) + lib/ar-register.ts ber-test.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS dp_deduction_amount NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (dp_deduction_amount >= 0),
  ADD COLUMN IF NOT EXISTS dp_deduction_pct    NUMERIC(5,2);

COMMENT ON COLUMN invoices.dp_deduction_amount IS
  'Potongan uang muka (recoupment DP) pada invoice ini: total_amount = base + komisi - retensi - dp_deduction + pajak. Hanya untuk termin_billing non-on_sign.';
COMMENT ON COLUMN invoices.dp_deduction_pct IS
  'Persentase potongan DP relatif base_amount (informasional, pola retensi_pct)';
