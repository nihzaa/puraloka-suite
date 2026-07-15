-- ============================================================
-- PURALOKA SUITE — Migration 013
-- RAB Items & Termin Trigger Columns
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE rab_item_level AS ENUM (
  'category',     -- Level I (Roman numeral) — kategori utama
  'subcategory',  -- Level A/B/C — sub-kategori
  'item'          -- Level 1/2/3 — item pekerjaan detail
);

CREATE TYPE termin_trigger_type AS ENUM (
  'on_sign',      -- Dibayar saat kontrak ditandatangani
  'on_progress',  -- Dibayar saat progress capai threshold tertentu
  'on_retention'  -- Dibayar setelah masa retensi selesai
);

-- ============================================================
-- RAB ITEMS
-- Rencana Anggaran Biaya per proyek
-- ============================================================

CREATE TABLE rab_items (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Identifikasi hierarki
  level           rab_item_level  NOT NULL DEFAULT 'item',
  category_code   VARCHAR(20),    -- Kode: 'I', 'II', 'A', 'B', '1', '2', dll
  parent_id       UUID            REFERENCES rab_items(id) ON DELETE CASCADE,

  -- Data pekerjaan
  name            TEXT            NOT NULL,  -- Uraian Pekerjaan
  unit            VARCHAR(50),               -- Satuan: m², m³, ls, dll
  qty             NUMERIC(15,3),             -- Volume estimasi
  unit_price      NUMERIC(15,2),             -- Harga satuan (Rp)
  total_price     NUMERIC(15,2),             -- Jumlah harga = qty × unit_price

  -- Bobot dan progress (hanya relevan untuk level category & item)
  weight_pct      NUMERIC(7,4)    NOT NULL DEFAULT 0,   -- Bobot % dari total RAB
  progress_pct    NUMERIC(5,2)    NOT NULL DEFAULT 0,   -- Persentase selesai (0-100), diinput PM

  sort_order      INTEGER         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_rab_progress_pct CHECK (progress_pct >= 0 AND progress_pct <= 100),
  CONSTRAINT chk_rab_weight_pct   CHECK (weight_pct >= 0 AND weight_pct <= 100)
);

CREATE INDEX idx_rab_items_project_id ON rab_items(project_id);
CREATE INDEX idx_rab_items_parent_id  ON rab_items(parent_id);
CREATE INDEX idx_rab_items_level      ON rab_items(level);

COMMENT ON TABLE  rab_items               IS 'Rencana Anggaran Biaya per proyek, diparse dari Excel upload';
COMMENT ON COLUMN rab_items.weight_pct    IS 'Bobot kategori terhadap total RAB (%), dihitung otomatis saat upload';
COMMENT ON COLUMN rab_items.progress_pct  IS 'Persentase pekerjaan selesai (0-100), diinput PM per kategori';
COMMENT ON COLUMN rab_items.parent_id     IS 'FK ke rab_items parent: item → subcategory → category';

-- ============================================================
-- ALTER termin_schedules
-- Tambah kolom trigger untuk termin dinamis
-- ============================================================

ALTER TABLE termin_schedules
  ADD COLUMN trigger_type   termin_trigger_type NOT NULL DEFAULT 'on_progress',
  ADD COLUMN trigger_pct    NUMERIC(5,2),   -- Threshold progress % untuk trigger on_progress (null jika on_sign/on_retention)
  ADD COLUMN due_days       INTEGER;        -- Jumlah hari setelah serah terima sebelum termin retensi jatuh tempo

COMMENT ON COLUMN termin_schedules.trigger_type IS 'on_sign = saat TTD kontrak | on_progress = saat progress ≥ threshold | on_retention = setelah masa retensi';
COMMENT ON COLUMN termin_schedules.trigger_pct  IS 'Threshold progress % yang memicu termin ini (hanya untuk trigger_type = on_progress)';
COMMENT ON COLUMN termin_schedules.due_days     IS 'Jumlah hari setelah serah terima sebelum termin retensi jatuh tempo';
