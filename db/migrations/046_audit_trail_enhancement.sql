-- Migration 046: Audit Trail Enhancement (Modul 13b)
-- Adds diff, severity, ip_address, and user_agent columns to the existing audit_logs table.
-- Enables classification of critical events and detailed before/after diff tracking.

-- Kolom tambahan ke audit_logs yang sudah ada (migration 009).
--
-- SUDAH ADA di migration 009 (tidak perlu di-add lagi):
--   ip_address INET, user_agent TEXT, old_values JSONB, new_values JSONB
--
-- Yang BENAR-BENAR BARU di migration ini:
--   diff      → computed diff antara old_values dan new_values (diisi oleh application layer)
--   severity  → klasifikasi event: info / warning / critical
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS diff      JSONB,
  ADD COLUMN IF NOT EXISTS severity  TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical'));

-- Index baru (yang lama sudah ada di migration 009: user_id, table_name, created_at, action)
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);

-- View: log severity critical untuk dashboard admin
-- Kolom old_values / new_values sudah ada sejak migration 009.
CREATE OR REPLACE VIEW critical_audit_events AS
  SELECT
    al.id,
    al.created_at,
    u.name       AS user_name,
    u.email      AS user_email,
    u.role       AS user_role,
    al.action,
    al.table_name,
    al.record_id,
    al.old_values,
    al.new_values,
    al.diff,
    al.ip_address,
    al.severity
  FROM audit_logs al
  LEFT JOIN users u ON u.id = al.user_id
  WHERE al.severity = 'critical'
  ORDER BY al.created_at DESC;

-- Catatan untuk application layer (apps/api/src/utils/audit.ts):
-- Kolom yang dipakai saat INSERT: action, table_name, record_id,
--   old_values (snapshot sebelum), new_values (snapshot sesudah),
--   diff (computed diff object), ip_address, user_agent, severity.
--
-- Events yang WAJIB di-log dengan severity = 'critical':
--   invoice.amount         → ubah amount_due di tabel invoices
--   contract.value         → ubah contract_value di tabel projects
--   payment.deleted        → DELETE pada tabel payments
--   kasbon.status          → UPDATE status di tabel kasbons
--   user.role              → UPDATE role di tabel users
--   project.status         → UPDATE status di tabel projects
--   rab_materials.override → override kuota RAB (tabel project_rab_materials)
--
-- Events dengan severity = 'warning':
--   user.toggle_active     → nonaktifkan user
--   project.soft_delete    → soft-delete proyek
--   expense.status         → approve/reject pengeluaran
--
-- Semua events lain: severity = 'info'
