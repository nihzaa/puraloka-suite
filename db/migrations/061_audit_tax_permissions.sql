-- Migration 061: permission catalog — audit:view + finance:tax:submit
-- Purely additive. Menambah 2 business capability baru untuk menuntaskan
-- migrasi 4 call site requireRole terakhir (Epic 3, ADR-004).
--   audit:view          — melihat audit trail seluruh sistem
--   finance:tax:submit  — menyetor/menandai laporan pajak sudah dilaporkan ke DJP
-- Nama = business capability, bukan jabatan (ADR-004 Mandatory Rule #3).

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('audit:view', 'audit', 'Lihat Audit Trail', 'Melihat rekam jejak perubahan data seluruh sistem', 10),
  ('finance:tax:submit', 'finance', 'Setor Laporan Pajak', 'Menandai laporan pajak sudah dilaporkan ke DJP (pending → reported)', 75);

-- Default seed role_permissions — bootstrap instalasi awal.
-- BUKAN business rule permanen: dapat diubah admin kapan saja via
-- /pengaturan/roles (PUT /api/v1/roles/:id/permissions) tanpa migration/kode (ADR-004).
DO $$
DECLARE
  v_admin_id UUID;
  v_pm_id    UUID;
BEGIN
  SELECT id INTO v_admin_id FROM roles WHERE name = 'admin';
  SELECT id INTO v_pm_id    FROM roles WHERE name = 'pm';

  -- audit:view → admin (default)
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_admin_id, id FROM permissions WHERE key = 'audit:view';

  -- finance:tax:submit → admin + pm (default; selaras RLS tax_records_admin_pm existing)
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_admin_id, id FROM permissions WHERE key = 'finance:tax:submit';
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_pm_id, id FROM permissions WHERE key = 'finance:tax:submit';
END $$;
