-- Migration 057: RAB Schedule (rencana per minggu) + Absorption Log (serapan dana manual)

-- ── Tabel 1: rab_schedule ────────────────────────────────────────────────────
-- Jadwal rencana serapan per item RAB per minggu.
-- Total material_pct + upah_pct + alat_pct + other_pct per item (semua minggu) harus = 100.
-- Ini yang jadi basis garis "Rencana" di Kurva S.

CREATE TABLE rab_schedule (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rab_item_id   UUID NOT NULL REFERENCES rab_items(id) ON DELETE CASCADE,
  week_start    DATE NOT NULL,         -- tanggal Senin awal minggu
  week_number   INT NOT NULL,          -- urutan minggu (1, 2, 3, ...)
  material_pct  NUMERIC(6,2) NOT NULL DEFAULT 0,
  upah_pct      NUMERIC(6,2) NOT NULL DEFAULT 0,
  alat_pct      NUMERIC(6,2) NOT NULL DEFAULT 0,
  other_pct     NUMERIC(6,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (rab_item_id, week_start)
);

CREATE INDEX idx_rab_schedule_project ON rab_schedule(project_id);
CREATE INDEX idx_rab_schedule_item    ON rab_schedule(rab_item_id);

-- ── Tabel 2: rab_absorption_log ──────────────────────────────────────────────
-- Log serapan dana aktual yang diinput manual oleh PM/admin per item per minggu.
-- Ini yang jadi garis "Serapan Dana" di Kurva S (berbeda dari aktual kas).
-- Nilai % adalah persentase dari total_price item yang sudah terserap minggu ini.

CREATE TABLE rab_absorption_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rab_item_id   UUID NOT NULL REFERENCES rab_items(id) ON DELETE CASCADE,
  week_start    DATE NOT NULL,         -- tanggal Senin awal minggu
  week_number   INT NOT NULL,
  material_pct  NUMERIC(6,2) NOT NULL DEFAULT 0,
  upah_pct      NUMERIC(6,2) NOT NULL DEFAULT 0,
  alat_pct      NUMERIC(6,2) NOT NULL DEFAULT 0,
  other_pct     NUMERIC(6,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  logged_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (rab_item_id, week_start)
);

CREATE INDEX idx_rab_absorption_project ON rab_absorption_log(project_id);
CREATE INDEX idx_rab_absorption_item    ON rab_absorption_log(rab_item_id);
