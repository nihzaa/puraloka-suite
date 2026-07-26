-- Migration 072: audit_logs — 3 kolom nullable (Epic 5 F5.1)
-- Melengkapi skema audit trail (migration 009+046) dengan kolom yang direferensikan
-- desain 1A.3 tapi belum ada: correlation_id, workflow_id, reason.
-- Purely additive, semua nullable — aman, tidak menyentuh data existing.
--
--   correlation_id → mengaitkan beberapa audit event ke satu request/aksi (dari
--                    request context; berguna saat satu aksi memicu banyak perubahan)
--   workflow_id    → null sampai Workflow Registry (Phase 1C) ada — disiapkan sekarang
--   reason         → alasan/catatan eksplisit dari aktor (mis. alasan reject)

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS workflow_id    UUID,
  ADD COLUMN IF NOT EXISTS reason         TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);

-- Defensive: pastikan kolom dari migration 046 (diff, severity) ADA. Ditemukan
-- saat Epic 5 bahwa 046 tidak ter-apply di sebagian environment (drift antara
-- supabase_migrations tracking yg berhenti di 057 dan file migration 058+ yang
-- di-apply manual). logAuditEvent butuh diff+severity — jadi 072 menjaminnya
-- idempotent, environment bersih tetap dapat skema lengkap tanpa bergantung 046.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS diff     JSONB,
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';

DO $$
BEGIN
  -- conrelid regclass = schema-scoped (cek conname polos melihat semua schema —
  -- anti-pattern kelas-115: salah skip di schema test bila public punya constraint sama)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_logs_severity_check'
      AND conrelid = 'audit_logs'::regclass
  ) THEN
    ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_severity_check
      CHECK (severity IN ('info', 'warning', 'critical'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);

COMMENT ON COLUMN audit_logs.correlation_id IS 'Mengaitkan audit event dalam satu request/aksi (dari request context).';
COMMENT ON COLUMN audit_logs.workflow_id    IS 'FK ke workflow instance — null sampai Workflow Registry (Phase 1C).';
COMMENT ON COLUMN audit_logs.reason         IS 'Alasan/catatan eksplisit dari aktor (mis. alasan reject kasbon).';
