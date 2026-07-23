-- Migration 082: Backfill kasbon → workflow_instances (Sub-Fase 1C, dual-write bootstrap)
--
-- ADDITIF: hanya menulis workflow_instances, TIDAK menyentuh tabel kasbons.
-- IDEMPOTEN: aman dijalankan ulang (upsert pada UNIQUE (entity_type, entity_id)).
-- FAIL-LOUD: menolak status kasbon yang tak terpetakan — BERHENTI, jangan default
--            diam-diam (mekanisme R7: approval tidak boleh hilang jejak).
--
-- Backfill ini akan dipakai LAGI saat cutover produksi (data kasbon nyata). Diuji
-- sekarang mumpung dev = seed dummy (taruhan nol). Jendela waktu cutover = prosedur
-- runbook (lihat docs .../runbook-kasbon-workflow-cutover.md), BUKAN dieksekusi di sini.

-- ─── 1. FAIL-LOUD precheck ───────────────────────────────────────────────────
-- Enumerate SEMUA nilai status yang ada di kasbons; tolak apa pun di luar peta
-- eksplisit {pending,approved,rejected,settled}. Sinkron dgn:
--   lib/kasbon-workflow.ts (KASBON_STATUS_TO_STATE) + workflow_states 'kasbon_approval'.
DO $$
DECLARE unknown_statuses TEXT;
BEGIN
  SELECT string_agg(DISTINCT k.status::text, ', ')
  INTO unknown_statuses
  FROM kasbons k
  WHERE k.status::text NOT IN ('pending','approved','rejected','settled');

  IF unknown_statuses IS NOT NULL THEN
    RAISE EXCEPTION
      'Backfill kasbon DIBATALKAN: status tak dikenal ditemukan: [%]. Tambahkan pemetaan eksplisit dulu — JANGAN default diam-diam (R7).',
      unknown_statuses;
  END IF;

  -- Verifikasi state target ADA di workflow definition (kalau definisi belum lengkap,
  -- lebih baik gagal keras daripada menaruh current_state yang menggantung).
  IF EXISTS (
    SELECT 1 FROM (VALUES ('pending'),('approved'),('rejected'),('settled')) AS need(state)
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_states ws
      JOIN workflow_definitions wd ON wd.id = ws.workflow_id
      WHERE wd.key = 'kasbon_approval' AND ws.key = need.state
    )
    -- hanya cek state yang benar-benar dipakai oleh data
    AND need.state IN (SELECT DISTINCT status::text FROM kasbons)
  ) THEN
    RAISE EXCEPTION 'Backfill kasbon DIBATALKAN: ada state target yang belum terdefinisi di workflow_states kasbon_approval.';
  END IF;
END $$;

-- ─── 2. Upsert idempoten dengan CASE mapping EKSPLISIT ───────────────────────
-- CASE ditulis sadar (identitas hari ini) — bukan `status::text` buta — supaya
-- penambahan enum baru menghasilkan NULL → dicegah oleh precheck di atas lebih dulu.
INSERT INTO workflow_instances
  (workflow_key, entity_type, entity_id, current_state, entered_state_at, created_at, updated_at)
SELECT
  'kasbon_approval',
  'kasbon',
  k.id,
  CASE k.status::text
    WHEN 'pending'  THEN 'pending'
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'settled'  THEN 'settled'
  END,
  COALESCE(k.updated_at, k.created_at, now()),  -- perkiraan waktu masuk state
  now(),
  now()
FROM kasbons k
ON CONFLICT (entity_type, entity_id) DO UPDATE
  SET current_state = EXCLUDED.current_state,
      updated_at    = now();
-- Catatan idempotensi: DO UPDATE menimpa current_state ke nilai turunan status
-- yang sama → run ulang = no-op efektif, nol duplikat (UNIQUE menjamin satu baris).

COMMENT ON TABLE workflow_instances IS 'Tracking state per entity (1C). Kasbon di-backfill via migration 082. BELUM sumber kebenaran (dual-write shadow) sampai fase CONTRACT.';
