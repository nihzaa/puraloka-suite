-- ============================================================
-- PURALOKA SUITE — Migration 037
-- Security hardening: audit_logs + created_at immutable
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- HIGH-10: audit_logs.user_id ON DELETE CASCADE → SET NULL
-- Audit trail tidak boleh ikut terhapus saat user dinonaktifkan.
-- SET NULL mempertahankan log dengan user_id = NULL.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey,
  ADD  CONSTRAINT audit_logs_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- notifications boleh cascade (notif lama tidak relevan setelah user dihapus)
-- sudah ON DELETE CASCADE dari migration 009 — dibiarkan

-- ─────────────────────────────────────────────────────────────
-- LOW-4: Protect created_at dari overwrite di tabel kritis
-- Trigger BEFORE UPDATE: jika old.created_at <> new.created_at,
-- kembalikan ke nilai lama (bukan reject — agar tidak break insert)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION protect_created_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

-- Tabel kritis yang created_at-nya harus immutable
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'projects', 'invoices', 'payments', 'kasbons',
    'project_expenses', 'mandor_assignments', 'work_scopes',
    'audit_logs', 'users', 'clients'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_protect_created_at ON %I; ' ||
      'CREATE TRIGGER trg_protect_created_at ' ||
      'BEFORE UPDATE ON %I ' ||
      'FOR EACH ROW EXECUTE FUNCTION protect_created_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;
