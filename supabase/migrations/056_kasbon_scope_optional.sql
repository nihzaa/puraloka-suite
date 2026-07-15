-- ============================================================
-- PURALOKA SUITE — Migration 056
-- Kasbon scope opsional + tambah project_id langsung
--
-- Perubahan:
--   1. work_scope_id di kasbons jadi NULLABLE
--   2. Tambah project_id FK ke kasbons (resolve via scope atau langsung)
--   3. Backfill project_id dari work_scope → assignment → project
--   4. Hapus kolom kasbon_limit_pct di work_scopes (tidak dipakai)
-- ============================================================

-- 1. Relax work_scope_id: drop NOT NULL
ALTER TABLE kasbons
  ALTER COLUMN work_scope_id DROP NOT NULL;

-- 2. Tambah project_id langsung ke kasbons
ALTER TABLE kasbons
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_kasbons_project_id ON kasbons(project_id);

-- 3. Backfill project_id dari work_scope yang sudah ada
UPDATE kasbons k
SET project_id = ma.project_id
FROM work_scopes ws
JOIN mandor_assignments ma ON ma.id = ws.assignment_id
WHERE k.work_scope_id = ws.id
  AND k.project_id IS NULL;

-- 4. Hapus kasbon_limit_pct dari work_scopes (digantikan oleh informasi proyek)
ALTER TABLE work_scopes
  DROP COLUMN IF EXISTS kasbon_limit_pct;

COMMENT ON COLUMN kasbons.work_scope_id IS 'Scope terkait — opsional. Null = kasbon umum proyek tidak terikat scope tertentu';
COMMENT ON COLUMN kasbons.project_id    IS 'Proyek terkait — wajib. Diisi langsung atau di-backfill dari work_scope';
