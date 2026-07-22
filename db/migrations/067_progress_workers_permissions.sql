-- Migration 067: capability progress:manage + workers:manage (admin+pm-only)
-- Epic 4 field ops butuh capability yang merepresentasikan scope lama
-- `auth_role() IN ('admin','pm')` untuk progress_logs & workers management.
-- Capability existing (reports:progress, projects:view, mandor:worker:manage)
-- TIDAK cocok: dimiliki mandor/client juga → memakainya akan MEMPERLUAS akses.
-- Solusi (ADR-004 + Engineering Default Rule #3): derivasi capability baru,
-- seed ke admin+pm → scope IDENTIK dgn policy lama (behavior-preserving).

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('progress:manage', 'reports', 'Kelola Progress Log', 'Membuat/mengedit progress log proyek (di luar input mandor sendiri)', 40),
  ('workers:manage',  'mandor',  'Kelola Registry Tukang', 'Mengelola registry tukang global (admin/pm)', 55);

-- Default seed: admin + pm (identik scope auth_role() IN ('admin','pm') lama).
DO $$
DECLARE v_admin UUID; v_pm UUID;
BEGIN
  SELECT id INTO v_admin FROM roles WHERE name = 'admin';
  SELECT id INTO v_pm    FROM roles WHERE name = 'pm';
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_admin, id FROM permissions WHERE key IN ('progress:manage', 'workers:manage');
  INSERT INTO role_permissions (role_id, permission_id)
    SELECT v_pm, id FROM permissions WHERE key IN ('progress:manage', 'workers:manage');
END $$;
