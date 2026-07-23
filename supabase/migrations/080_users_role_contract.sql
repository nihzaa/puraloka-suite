-- Migration 080: users.role enum → FK (Sub-Fase 1B.4, FASE 3 CONTRACT)
-- ⚠️⚠️ RED-LINE #1 — DESTRUKTIF & IRREVERSIBLE tanpa re-create. DANGER GATE #2
-- disetujui founder (2026-07-23, "Jalankan CONTRACT sekarang").
--
-- Drop kolom enum users.role + type user_role. role_id jadi SATU-SATUNYA sumber
-- kebenaran role. Prasyarat: 078 EXPAND + 079 SWAP applied, read path sudah 100% FK.
--
-- Rollback: re-create type user_role dari 001 + ADD COLUMN role + backfill dari
-- roles.name + re-create auth_role() versi enum. BERAT — hanya maintenance window.

-- 1. role_id WAJIB (setelah 078 backfill, semua user sudah punya; jadikan NOT NULL).
ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;

-- 2. Redefine view yang membaca kolom enum (046 critical_audit_events) → baca FK.
--    HARUS sebelum DROP COLUMN, karena view punya dependency ke kolom role.
--    DROP dulu (bukan CREATE OR REPLACE) karena tipe kolom user_role berubah dari
--    enum user_role → text; REPLACE menolak perubahan tipe kolom view.
--    Dibungkus guard: hanya jika audit_logs ada (view tak relevan di schema test
--    minimal yang tidak menyertakan audit_logs; production selalu punya).
DO $$
BEGIN
  IF to_regclass('audit_logs') IS NOT NULL THEN
    DROP VIEW IF EXISTS critical_audit_events;
    CREATE VIEW critical_audit_events AS
      SELECT
        al.id,
        al.created_at,
        u.name       AS user_name,
        u.email      AS user_email,
        r.name       AS user_role,   -- FASE 3: dari roles via role_id (dulu u.role enum)
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
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE al.severity = 'critical'
      ORDER BY al.created_at DESC;
  END IF;
END $$;

-- 3. auth_role() disederhanakan: kolom enum tak ada lagi, murni dari FK.
--    (COALESCE ke enum dari 079 tidak berlaku lagi.) Guard: hanya jika fungsi
--    sudah ada (didefinisikan 049 — tak ada di schema test minimal, dan tak perlu
--    karena integration test level app pakai service_role/bypass RLS).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_role') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION auth_role()
      RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $body$
        SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.auth_id = auth.uid()
      $body$;
    $fn$;
  END IF;
END $$;

-- 4. Drop kolom enum + type. Titik tanpa balik.
ALTER TABLE users DROP COLUMN role;
DROP TYPE user_role;

COMMENT ON COLUMN users.role_id IS 'FK ke roles — SATU-SATUNYA sumber role user (Sub-Fase 1B.4 CONTRACT selesai). Enum user_role di-drop; role custom kini bisa di-assign.';
