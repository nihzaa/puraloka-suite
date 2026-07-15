-- ============================================================
-- PURALOKA SUITE — Migration 026
-- Fix: koreksi saldo cash_accounts untuk pengeluaran approved
-- yang terjadi sebelum trigger main_cash di-fix (migration 025)
-- Kurangi saldo sesuai total expense approved dari main_cash
-- ============================================================

-- Hitung total pengeluaran approved per main_cash_id,
-- lalu kurangi saldo akun yang bersangkutan
UPDATE cash_accounts ca
SET
  balance = ca.balance - agg.total_expense,
  updated_at = NOW()
FROM (
  SELECT
    main_cash_id,
    SUM(total_amount) AS total_expense
  FROM project_expenses
  WHERE
    status = 'approved'
    AND expense_source = 'main_cash'
    AND main_cash_id IS NOT NULL
    -- Hanya yang dibuat sebelum trigger dipasang (migration 025 applied ~2026-06-12)
    AND created_at < '2026-06-12 14:30:00+00'
  GROUP BY main_cash_id
) agg
WHERE ca.id = agg.main_cash_id;
