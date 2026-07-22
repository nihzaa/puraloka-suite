-- Migration 074: seed cash:view ke admin+pm (bugfix role-literal authorization)
-- Endpoint GET /cash/accounts/:id sebelumnya pakai role-literal `mandor/client → 403`
-- sebagai gate. Diganti ke requirePermission('cash:view'). Key cash:view sudah ada
-- di catalog (migration 050) tapi belum di-assign ke role manapun — di-seed ke
-- admin+pm agar scope identik dengan gate lama (mandor/client tetap ditolak).
-- Default configurable via UI seperti capability lain (ADR-004).

DO $$
DECLARE v_admin UUID; v_pm UUID;
BEGIN
  SELECT id INTO v_admin FROM roles WHERE name = 'admin';
  SELECT id INTO v_pm    FROM roles WHERE name = 'pm';
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_admin, id FROM permissions WHERE key = 'cash:view'
    ON CONFLICT DO NOTHING;
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_pm, id FROM permissions WHERE key = 'cash:view'
    ON CONFLICT DO NOTHING;
END $$;
