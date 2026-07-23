-- Migration 085: capability finance:view:all (Sub-Fase config-first, fix F5/F7 scope)
--
-- ADDITIF. Memperbaiki soft-filter F5 (laporan finansial) & F7 (search invoice) yang
-- sebelumnya `role==='admin'||'pm'` — role literal yang melockout direktur.
--
-- PENTING (scope-preserving): TIDAK memakai `finance:view` yang sudah ada, karena
-- `finance:view` dimiliki LUAS (mandor & client punya, untuk data ter-scope mereka).
-- Memakainya untuk laporan/search org-wide akan MEMPERLUAS visibilitas ke mandor/client
-- (mandor punya reports:view + finance:view → akan melihat finansial org). Itu ekspansi
-- scope = keputusan produk, bukan fix lockout.
--
-- Karena itu diderive capability BARU `finance:view:all` = "lihat SELURUH data finansial
-- organisasi" (laporan lintas proyek, search invoice global). Di-seed HANYA ke admin+pm
-- (scope identik dengan `admin||pm` hari ini). direktur/role custom bisa diberi via UI.

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('finance:view:all', 'finance', 'Lihat Semua Data Finansial',
   'Melihat laporan finansial lintas proyek & invoice organisasi (bukan hanya data ter-scope)', 15)
ON CONFLICT (key) DO NOTHING;

-- Seed ke admin + pm (scope-preserving — persis yang berhak hari ini via admin||pm).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm')
  AND p.key = 'finance:view:all'
ON CONFLICT (role_id, permission_id) DO NOTHING;
