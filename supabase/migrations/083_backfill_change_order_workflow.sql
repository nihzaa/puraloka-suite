-- Migration 083: Backfill change_order → workflow_instances (Sub-Fase 1C, modul kedua)
--
-- ADDITIF: hanya menulis workflow_instances, TIDAK menyentuh change_orders.
-- IDEMPOTEN: upsert pada UNIQUE (entity_type, entity_id).
-- FAIL-LOUD: tolak status tak terpetakan — BERHENTI, jangan default diam-diam (R7).
--
-- Pola identik migration 082 (kasbon). Berbeda dari kasbon: KEEMPAT status change_order
-- punya code path nyata (tidak ada state mati seperti 'settled' di kasbon).

-- ─── 1. FAIL-LOUD precheck ───────────────────────────────────────────────────
DO $$
DECLARE unknown_statuses TEXT;
BEGIN
  SELECT string_agg(DISTINCT co.status, ', ')
  INTO unknown_statuses
  FROM change_orders co
  WHERE co.status NOT IN ('draft','submitted','approved','rejected');

  IF unknown_statuses IS NOT NULL THEN
    RAISE EXCEPTION
      'Backfill change_order DIBATALKAN: status tak dikenal ditemukan: [%]. Tambahkan pemetaan eksplisit dulu — JANGAN default diam-diam (R7).',
      unknown_statuses;
  END IF;

  -- Verifikasi state target ADA di workflow definition change_order_approval.
  IF EXISTS (
    SELECT 1 FROM (VALUES ('draft'),('submitted'),('approved'),('rejected')) AS need(state)
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_states ws
      JOIN workflow_definitions wd ON wd.id = ws.workflow_id
      WHERE wd.key = 'change_order_approval' AND ws.key = need.state
    )
    AND need.state IN (SELECT DISTINCT status FROM change_orders)
  ) THEN
    RAISE EXCEPTION 'Backfill change_order DIBATALKAN: ada state target yang belum terdefinisi di workflow_states change_order_approval.';
  END IF;
END $$;

-- ─── 2. Upsert idempoten dengan CASE mapping EKSPLISIT ───────────────────────
INSERT INTO workflow_instances
  (workflow_key, entity_type, entity_id, current_state, entered_state_at, created_at, updated_at)
SELECT
  'change_order_approval',
  'change_order',
  co.id,
  CASE co.status
    WHEN 'draft'     THEN 'draft'
    WHEN 'submitted' THEN 'submitted'
    WHEN 'approved'  THEN 'approved'
    WHEN 'rejected'  THEN 'rejected'
  END,
  COALESCE(co.updated_at, co.created_at, now()),
  now(),
  now()
FROM change_orders co
ON CONFLICT (entity_type, entity_id) DO UPDATE
  SET current_state = EXCLUDED.current_state,
      updated_at    = now();
