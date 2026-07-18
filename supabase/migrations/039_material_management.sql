-- Migration 039: Material Management
-- Tabel: material_categories, materials, project_stocks, stock_movements

-- ─── Kategori Material ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,           -- 'Beton & Semen', 'Besi & Baja', 'Kayu', dll
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Master Katalog Material ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID REFERENCES material_categories(id) ON DELETE SET NULL,
  code            TEXT UNIQUE,               -- 'MAT-001', opsional
  name            TEXT NOT NULL,             -- 'Semen Portland 50kg', 'Besi Beton 10mm'
  unit            TEXT NOT NULL,             -- 'sak', 'batang', 'm³', 'kg', 'liter', 'unit', 'lembar', 'm²', 'm'
  unit_price      DECIMAL(15,2) DEFAULT 0,   -- harga referensi (bisa berbeda per supplier)
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Stok Material per Proyek ─────────────────────────────────────────────────
-- Stok di sini = stok di site proyek, bukan gudang pusat.
-- Diupdate otomatis setiap goods receipt dikonfirmasi atau material dipakai.
CREATE TABLE IF NOT EXISTS project_stocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  qty_on_hand     DECIMAL(15,3) NOT NULL DEFAULT 0,   -- stok saat ini di site
  qty_reserved    DECIMAL(15,3) NOT NULL DEFAULT 0,   -- di MR yang sudah approved tapi belum GR
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, material_id)
);

-- ─── Mutasi Stok (Log) ────────────────────────────────────────────────────────
-- Setiap perubahan stok dicatat di sini untuk audit trail & rekap pemakaian.
CREATE TABLE IF NOT EXISTS stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  movement_type   TEXT NOT NULL CHECK (movement_type IN (
                    'goods_receipt',    -- masuk dari GR
                    'usage',            -- keluar dipakai di lapangan
                    'return',           -- dikembalikan / balik ke stok
                    'adjustment',       -- koreksi stok opname
                    'transfer_in',      -- pindahan dari proyek lain
                    'transfer_out'      -- dipindah ke proyek lain
                  )),
  qty             DECIMAL(15,3) NOT NULL,    -- positif = masuk, negatif = keluar
  qty_before      DECIMAL(15,3) NOT NULL,
  qty_after       DECIMAL(15,3) NOT NULL,
  reference_type  TEXT,                      -- 'goods_receipt', 'manual', dll
  reference_id    UUID,                      -- FK bebas ke GR / MR / opname
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_materials_category       ON materials(category_id);
CREATE INDEX IF NOT EXISTS idx_materials_is_active      ON materials(is_active);
CREATE INDEX IF NOT EXISTS idx_project_stocks_project   ON project_stocks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_stocks_material  ON project_stocks(material_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_project  ON stock_movements(project_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_material ON stock_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type     ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref      ON stock_movements(reference_id);

-- ─── Triggers: updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at_material_categories()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_material_categories_updated_at
  BEFORE UPDATE ON material_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_material_categories();

CREATE OR REPLACE FUNCTION set_updated_at_materials()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_materials();

-- ─── Trigger: protect created_at ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION protect_materials_created_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.created_at = OLD.created_at; RETURN NEW; END;
$$;
CREATE TRIGGER trg_protect_materials_created_at
  BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION protect_materials_created_at();

-- ─── Seed: kategori material umum konstruksi ──────────────────────────────────
INSERT INTO material_categories (name, description, sort_order) VALUES
  ('Beton & Semen',     'Semen, beton ready mix, mortar, grouting',             1),
  ('Besi & Baja',       'Besi beton, hollow, baja profil, wire mesh',           2),
  ('Pasir & Batu',      'Pasir urug, pasir cor, batu split, batu kali',         3),
  ('Kayu & Multiplex',  'Kayu usuk, reng, balok, triplek, multiplex',           4),
  ('Bata & Blok',       'Bata merah, batako, hebel/AAC block',                  5),
  ('Keramik & Granit',  'Keramik lantai, keramik dinding, granit, mozaik',      6),
  ('Sanitasi & Plumbing','Pipa PVC, fitting, kran, closet, wastafel, floor drain',7),
  ('Listrik & Elektrikal','Kabel NYM/NYY, conduit, MCB, stop kontak, saklar',   8),
  ('Cat & Finishing',   'Cat tembok, cat kayu, plamir, waterproofing, skimcoat',9),
  ('Atap & Rangka',     'Genteng, zincalum, rangka baja ringan, talang',        10),
  ('Pintu & Jendela',   'Kusen aluminium, daun pintu, kaca, handle, engsel',    11),
  ('Material Lain',     'Material tidak masuk kategori di atas',                99)
ON CONFLICT (name) DO NOTHING;
