-- ============================================================
-- PURALOKA SUITE — Migration 052
-- RAB Komponen Biaya: material_pct, upah_pct, alat_pct, other_pct
-- Progress Log: mode + rab_item_id link
-- Work Scopes: rab_category_id link (opsional)
-- ============================================================

-- ─── 1. RAB ITEMS — Komponen Biaya ──────────────────────────────────────────

ALTER TABLE rab_items
  ADD COLUMN material_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN upah_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN alat_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN other_pct    NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Constraint: total pct harus 0 (belum diisi) atau tepat 100
-- Toleransi ±0.01 untuk floating point rounding
ALTER TABLE rab_items
  ADD CONSTRAINT rab_items_pct_sum CHECK (
    (material_pct = 0 AND upah_pct = 0 AND alat_pct = 0 AND other_pct = 0)
    OR
    (ROUND(material_pct + upah_pct + alat_pct + other_pct, 1) BETWEEN 99.9 AND 100.1)
  );

-- Constraint: tidak boleh negatif
ALTER TABLE rab_items
  ADD CONSTRAINT rab_items_pct_non_negative CHECK (
    material_pct >= 0 AND upah_pct >= 0 AND alat_pct >= 0 AND other_pct >= 0
  );

COMMENT ON COLUMN rab_items.material_pct IS '% komponen material dari nilai pekerjaan (0 = belum diisi)';
COMMENT ON COLUMN rab_items.upah_pct     IS '% komponen upah tenaga kerja dari nilai pekerjaan';
COMMENT ON COLUMN rab_items.alat_pct     IS '% komponen alat & peralatan dari nilai pekerjaan';
COMMENT ON COLUMN rab_items.other_pct    IS '% komponen lain-lain dari nilai pekerjaan';

-- ─── 2. RAB ITEMS — Gantt Support ───────────────────────────────────────────

ALTER TABLE rab_items
  ADD COLUMN planned_start       DATE,
  ADD COLUMN planned_end         DATE,
  ADD COLUMN gantt_dependencies  UUID[];

COMMENT ON COLUMN rab_items.planned_start      IS 'Tanggal rencana mulai pekerjaan item ini (untuk Gantt WBS)';
COMMENT ON COLUMN rab_items.planned_end        IS 'Tanggal rencana selesai pekerjaan item ini (untuk Gantt WBS)';
COMMENT ON COLUMN rab_items.gantt_dependencies IS 'Array UUID rab_items yang harus selesai sebelum item ini bisa dimulai';

-- ─── 3. PROGRESS LOGS — Mode + RAB Link ─────────────────────────────────────

ALTER TABLE progress_logs
  ADD COLUMN mode            TEXT NOT NULL DEFAULT 'daily'
    CHECK (mode IN ('daily', 'detail')),
  ADD COLUMN rab_item_id     UUID REFERENCES rab_items(id) ON DELETE SET NULL,
  ADD COLUMN pct_completion  NUMERIC(5,2)
    CHECK (pct_completion IS NULL OR (pct_completion >= 0 AND pct_completion <= 100));

-- pct_overall sekarang opsional (hanya wajib untuk mode daily)
ALTER TABLE progress_logs
  ALTER COLUMN pct_overall DROP NOT NULL,
  ALTER COLUMN pct_overall SET DEFAULT NULL;

-- Constraint: mode detail wajib punya rab_item_id dan pct_completion
ALTER TABLE progress_logs
  ADD CONSTRAINT progress_logs_detail_requires_rab CHECK (
    mode = 'daily'
    OR (mode = 'detail' AND rab_item_id IS NOT NULL AND pct_completion IS NOT NULL)
  );

CREATE INDEX progress_logs_rab_item_idx
  ON progress_logs(rab_item_id)
  WHERE rab_item_id IS NOT NULL;

COMMENT ON COLUMN progress_logs.mode           IS 'daily = log harian umum (tidak pengaruh ke %); detail = progress per item RAB';
COMMENT ON COLUMN progress_logs.rab_item_id    IS 'RAB item yang sedang dilaporkan (hanya untuk mode=detail)';
COMMENT ON COLUMN progress_logs.pct_completion IS 'Persentase selesai item RAB ini (hanya untuk mode=detail, 0-100)';

-- ─── 4. WORK SCOPES — RAB Category Link ─────────────────────────────────────

ALTER TABLE work_scopes
  ADD COLUMN rab_category_id UUID REFERENCES rab_items(id) ON DELETE SET NULL;

CREATE INDEX work_scopes_rab_category_idx
  ON work_scopes(rab_category_id)
  WHERE rab_category_id IS NOT NULL;

COMMENT ON COLUMN work_scopes.rab_category_id IS 'Opsional: link ke sub-kategori RAB yang menjadi scope mandor ini';
