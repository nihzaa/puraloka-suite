-- ============================================================
-- PURALOKA SUITE — Migration 023
-- Work Scope Items: rincian pekerjaan per scope mandor
-- Mendukung semua jenis: sipil, baja, MEP, finishing, dll
-- ============================================================

-- Enum satuan volume/quantity — fleksibel untuk semua jenis pekerjaan
DO $$ BEGIN
  CREATE TYPE work_item_unit AS ENUM (
    -- Area / luas
    'm2',         -- meter persegi (pasang bata, plester, keramik, cat, dll)
    -- Volume
    'm3',         -- meter kubik (cor beton, galian, timbunan, dll)
    -- Panjang / linear
    'm',          -- meter linear (balok baja, pipa, railing, dll)
    'm_linear',   -- sama dengan m, alias untuk pekerjaan MEP/baja
    -- Berat (baja / material bulk)
    'kg',         -- kilogram (tulangan, baja profil kecil)
    'ton',        -- ton (baja WF berat, besi konstruksi)
    -- Unit / buah
    'unit',       -- unit (pintu, jendela, AC, panel, dll)
    'buah',       -- buah (titik lampu, stop kontak, kloset, dll)
    'titik',      -- titik (titik listrik, titik air)
    'batang',     -- batang (kolom baja, besi tulangan per batang)
    'lembar',     -- lembar (pelat baja, bondek, dll)
    -- Set / lot
    'set',        -- set (kusen + daun pintu + aksesori)
    'ls',         -- lump sum (pekerjaan borongan global tanpa rincian volume)
    -- Waktu
    'hari',       -- hari kerja (untuk item harian di dalam scope borongan)
    'minggu'      -- minggu kerja
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Enum kategori pekerjaan — untuk grouping di UI
DO $$ BEGIN
  CREATE TYPE work_item_category AS ENUM (
    'struktur',       -- pondasi, kolom, balok, pelat, tangga
    'baja',           -- kolom baja, balok WF, gording, sambungan
    'dinding',        -- pasang bata, plester, acian, partisi
    'finishing',      -- keramik, cat, wallpaper, granit, list
    'atap',           -- rangka atap, penutup atap, talang
    'plumbing',       -- pipa air bersih/kotor, sanitasi, fitting
    'elektrikal',     -- kabel, panel, titik lampu, stop kontak
    'mekanikal',      -- AC, exhaust, pompa, genset
    'kusen_pintu',    -- kusen, daun pintu, jendela, kaca
    'pagar_carport',  -- pagar besi, pagar bata, carport
    'landscape',      -- taman, grass block, jalan setapak
    'lain_lain'       -- pekerjaan lain yang tidak masuk kategori di atas
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- WORK_SCOPE_ITEMS
-- Rincian item pekerjaan dalam satu work scope
-- Satu scope bisa punya banyak item (mis. scope Struktur:
--   item1: cor pondasi, item2: pasang bata, item3: plester)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_scope_items (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  work_scope_id   UUID              NOT NULL REFERENCES work_scopes(id) ON DELETE CASCADE,

  -- Identitas item
  item_name       VARCHAR(255)      NOT NULL,
  category        work_item_category NOT NULL DEFAULT 'lain_lain',
  description     TEXT,

  -- Volume & harga
  unit            work_item_unit    NOT NULL,
  volume          NUMERIC(14,3)     NOT NULL,        -- volume/qty yang dikontrak (mis. 50 m2)
  unit_price      NUMERIC(14,2)     NOT NULL,        -- harga per satuan (mis. 150000 / m2)
  subtotal        NUMERIC(16,2)     GENERATED ALWAYS AS (volume * unit_price) STORED,

  -- Realisasi lapangan
  volume_done     NUMERIC(14,3)     NOT NULL DEFAULT 0,  -- volume yang sudah terlaksana
  pct_done        NUMERIC(5,2)      GENERATED ALWAYS AS (
                    CASE WHEN volume > 0 THEN LEAST((volume_done / volume) * 100, 100) ELSE 0 END
                  ) STORED,

  -- Metadata
  sort_order      SMALLINT          NOT NULL DEFAULT 0,  -- urutan tampil di UI
  notes           TEXT,
  created_by      UUID              NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_wsi_volume      CHECK (volume > 0),
  CONSTRAINT chk_wsi_unit_price  CHECK (unit_price >= 0),
  CONSTRAINT chk_wsi_volume_done CHECK (volume_done >= 0)
);

CREATE INDEX idx_wsi_work_scope_id ON work_scope_items(work_scope_id);
CREATE INDEX idx_wsi_category      ON work_scope_items(category);
CREATE INDEX idx_wsi_sort_order    ON work_scope_items(work_scope_id, sort_order);

COMMENT ON TABLE  work_scope_items IS 'Rincian item pekerjaan per work scope. Mendukung semua jenis: bangunan sipil, baja WF, MEP, finishing';
COMMENT ON COLUMN work_scope_items.subtotal    IS 'Dihitung otomatis: volume × unit_price';
COMMENT ON COLUMN work_scope_items.pct_done    IS 'Dihitung otomatis: volume_done / volume × 100, max 100%';
COMMENT ON COLUMN work_scope_items.volume_done IS 'Volume pekerjaan yang sudah selesai dikerjakan di lapangan';

-- ============================================================
-- WORK_SCOPE_ITEM_SPECS
-- Spesifikasi teknis per item (opsional, untuk pekerjaan baja & MEP)
-- Mis. balok WF 200: dimensi WF200x100, grade A36, coating cat meni
-- ============================================================
CREATE TABLE IF NOT EXISTS work_scope_item_specs (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID    NOT NULL REFERENCES work_scope_items(id) ON DELETE CASCADE,
  spec_key        VARCHAR(100) NOT NULL,   -- mis. "profil", "grade_material", "diameter", "warna"
  spec_value      VARCHAR(255) NOT NULL,   -- mis. "WF 200x100x5.5x8", "A36", "4 inch"
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wsi_specs_item_id ON work_scope_item_specs(item_id);

COMMENT ON TABLE work_scope_item_specs IS 'Spesifikasi teknis per item pekerjaan (opsional). Fleksibel key-value untuk semua jenis material';

-- ============================================================
-- Update trigger updated_at untuk work_scope_items
-- ============================================================
CREATE OR REPLACE FUNCTION update_wsi_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wsi_updated_at
  BEFORE UPDATE ON work_scope_items
  FOR EACH ROW EXECUTE FUNCTION update_wsi_updated_at();
