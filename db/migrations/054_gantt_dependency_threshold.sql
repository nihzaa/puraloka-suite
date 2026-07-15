-- ============================================================
-- PURALOKA SUITE — Migration 054
-- Gantt Dependency Threshold (Phase 4B)
-- Migrate gantt_dependencies UUID[] → JSONB untuk support threshold-based dependency
-- ============================================================

-- Tambah kolom baru gantt_dep_rules JSONB
-- Format: [{ "item_id": "uuid", "threshold_pct": 80, "label": "optional description" }, ...]
-- threshold_pct = null berarti hanya soft advisory (mulai setelah dependency selesai/planned_end)
-- threshold_pct = 80 berarti warning jika dependency.progress_pct < 80 saat item ini mulai

ALTER TABLE rab_items
  ADD COLUMN gantt_dep_rules JSONB DEFAULT '[]'::jsonb;

-- Migrate data lama: gantt_dependencies UUID[] → gantt_dep_rules JSONB (threshold_pct = null)
UPDATE rab_items
SET gantt_dep_rules = (
  SELECT jsonb_agg(jsonb_build_object('item_id', dep_id::text, 'threshold_pct', null))
  FROM unnest(gantt_dependencies) AS dep_id
)
WHERE gantt_dependencies IS NOT NULL
  AND array_length(gantt_dependencies, 1) > 0;

-- Index untuk query gantt_dep_rules
CREATE INDEX idx_rab_items_gantt_dep_rules ON rab_items USING gin(gantt_dep_rules);

COMMENT ON COLUMN rab_items.gantt_dep_rules IS 'Soft dependency rules: [{item_id, threshold_pct, label}]. threshold_pct=null = advisory only (date-based); threshold_pct=80 = warning if dep.progress_pct < 80';

-- Kolom lama gantt_dependencies tetap ada untuk backward compat, akan dihapus di migration berikutnya setelah semua kode migrasi
-- (tidak di-drop sekarang agar safe rollback)
