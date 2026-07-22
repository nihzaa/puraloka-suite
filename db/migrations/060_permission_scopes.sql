-- Migration 060: permission_scopes table (PBAC sederhana — scope per user+permission)
-- Purely additive — no existing tables altered.
-- Sumber desain: Phase1/02-target-architecture.md § 1A.1.1 (permission_scopes).
-- Menggeneralisasi pola PM-ownership yang SUDAH ada inline di kode (mis. PM hanya
-- approve kasbon proyek yang dia pimpin) — bukan policy engine generik baru.
-- Tabel dibuat sebagai fondasi; belum dipakai oleh route manapun di Epic 3.

CREATE TABLE permission_scopes (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  scope_type     TEXT NOT NULL CHECK (scope_type IN ('project', 'field')),
  scope_value    TEXT NOT NULL,  -- project_id (as text) untuk scope_type='project'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_permission_scopes_user ON permission_scopes(user_id, permission_key);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Pola read/write identik dengan role_permissions (migration 050:213-235):
-- read oleh semua authenticated user, write hanya service_role (API pakai service_role).

ALTER TABLE permission_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permission_scopes_read" ON permission_scopes
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "permission_scopes_write" ON permission_scopes
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE permission_scopes IS
  'PBAC scope per user+permission (mis. project ownership). scope_type=field disiapkan di enum tapi belum diimplementasikan (YAGNI, ADR-004).';
