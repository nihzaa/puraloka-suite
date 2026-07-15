-- Migration 045: Asset & Tools Management (Modul 12)
-- Master data alat konstruksi, log mutasi antar proyek, dan kalkulasi amortisasi.
-- CATATAN: Pastikan metode penyusutan divalidasi oleh akuntan/konsultan pajak
-- sebelum kolom ini digunakan untuk laporan pajak.

-- Master data aset / alat
CREATE TABLE IF NOT EXISTS assets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code            TEXT NOT NULL UNIQUE,        -- 'AST-001', 'AST-002', dst
  name                  TEXT NOT NULL,               -- 'Molen Semen 350L', 'Scaffolding Set A'
  category              TEXT NOT NULL
    CHECK (category IN ('alat_berat', 'alat_tangan', 'kendaraan', 'scaffolding', 'lainnya')),
  brand                 TEXT,
  model                 TEXT,
  serial_number         TEXT,
  purchase_date         DATE,
  purchase_price        DECIMAL(15,2) CHECK (purchase_price >= 0),
  current_value         DECIMAL(15,2) CHECK (current_value >= 0),  -- book value setelah penyusutan
  useful_life_months    INTEGER NOT NULL DEFAULT 60
    CHECK (useful_life_months > 0),
  depreciation_method   TEXT NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line', 'double_declining')),
  current_project_id    UUID REFERENCES projects(id),  -- NULL = di gudang pusat
  status                TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'deployed', 'maintenance', 'disposed')),
  condition             TEXT NOT NULL DEFAULT 'good'
    CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),
  photo_url             TEXT,
  notes                 TEXT,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Log mutasi alat antar proyek (deploy/return/transfer/maintenance)
CREATE TABLE IF NOT EXISTS asset_movements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID NOT NULL REFERENCES assets(id),
  from_project_id   UUID REFERENCES projects(id),   -- NULL = dari gudang pusat
  to_project_id     UUID REFERENCES projects(id),   -- NULL = kembali ke gudang
  movement_type     TEXT NOT NULL
    CHECK (movement_type IN ('deploy', 'return', 'transfer', 'maintenance')),
  moved_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moved_by          UUID REFERENCES users(id),
  approved_by       UUID REFERENCES users(id),
  condition_before  TEXT CHECK (condition_before IN ('excellent', 'good', 'fair', 'poor')),
  condition_after   TEXT CHECK (condition_after  IN ('excellent', 'good', 'fair', 'poor')),
  return_expected_at DATE,
  returned_at       TIMESTAMPTZ,
  photo_url         TEXT,                            -- foto serah terima
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Log amortisasi bulanan per aset
-- Diisi oleh cron job (Supabase Edge Function / external scheduler) setiap tgl 1.
-- journal_entry_id: FK ke journal_entries (Modul 10 GL) — nullable sampai GL ada.
CREATE TABLE IF NOT EXISTS asset_depreciation_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id              UUID NOT NULL REFERENCES assets(id),
  project_id            UUID REFERENCES projects(id),  -- proyek yang menanggung biaya penyusutan
  period_year           INTEGER NOT NULL CHECK (period_year >= 2020),
  period_month          INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  depreciation_amount   DECIMAL(15,2) NOT NULL CHECK (depreciation_amount >= 0),
  book_value_after      DECIMAL(15,2) NOT NULL CHECK (book_value_after >= 0),
  depreciation_method   TEXT NOT NULL,                 -- snapshot metode saat pencatatan
  journal_entry_id      UUID,                          -- FK ke journal_entries (ditambah saat GL ada)
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id, period_year, period_month)          -- cegah duplikat per bulan
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assets_status           ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category         ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_current_project  ON assets(current_project_id)
  WHERE current_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_movements_asset   ON asset_movements(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_movements_project ON asset_movements(to_project_id)
  WHERE to_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_dep_logs_asset    ON asset_depreciation_logs(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_dep_logs_period   ON asset_depreciation_logs(period_year, period_month);

-- protect_created_at triggers
CREATE OR REPLACE FUNCTION protect_assets_created_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.created_at = OLD.created_at; RETURN NEW; END;
$$;

CREATE TRIGGER trg_protect_assets_created_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION protect_assets_created_at();

-- updated_at trigger untuk assets
CREATE OR REPLACE FUNCTION set_assets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_set_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_assets_updated_at();
