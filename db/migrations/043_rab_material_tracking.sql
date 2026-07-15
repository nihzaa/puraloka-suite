-- Migration 043: RAB Material Tracking + SCM Enhancement (Modul 9a)
-- Adds project_rab_materials table for hard-guard validation on Material Requests
-- and columns to support PO delivery tracking (Modul 9b).

-- Column tambahan di materials: harga satuan default dari RAB
-- DITUNDA: tabel materials baru ada di migration 041 (belum dieksekusi).
-- Tambahkan ALTER ini langsung ke 041 saat Modul 4 dikerjakan.
-- ALTER TABLE materials ADD COLUMN IF NOT EXISTS rab_unit_cost DECIMAL(15,2);

-- Tabel: volume material per proyek sesuai RAB
-- Diisi saat PM/Admin input RAB proyek sebelum procurement dimulai.
-- Menjadi batas keras (hard-guard) saat material request dibuat.
CREATE TABLE IF NOT EXISTS project_rab_materials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_id         UUID NOT NULL REFERENCES materials(id),
  rab_quantity        DECIMAL(15,3) NOT NULL CHECK (rab_quantity > 0),
  rab_unit_cost       DECIMAL(15,2) NOT NULL CHECK (rab_unit_cost >= 0),
  -- Running totals — diupdate otomatis oleh application layer setiap MR/GR
  requested_quantity  DECIMAL(15,3) NOT NULL DEFAULT 0 CHECK (requested_quantity >= 0),
  received_quantity   DECIMAL(15,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  notes               TEXT,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, material_id)
);

-- Kolom tambahan di purchase_orders untuk PO delivery tracking (Modul 9b)
-- Dicreate di migration ini karena purchase_orders baru ada di migration 041
-- (yang belum dieksekusi). Jika 041 belum jalan, skip ALTER ini sampai 041 dijalankan.
-- ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;
-- ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
-- ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS public_view_token TEXT UNIQUE;

-- Tabel terpisah untuk PO delivery log (tidak bergantung pada 041)
CREATE TABLE IF NOT EXISTS po_delivery_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number        TEXT NOT NULL,
  project_id       UUID REFERENCES projects(id),
  supplier_name    TEXT,                 -- denormalized; FK ke suppliers ditambah di migration 040+
  delivery_channel TEXT NOT NULL CHECK (delivery_channel IN ('whatsapp', 'email')),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by          UUID REFERENCES users(id),
  recipient        TEXT,                 -- nomor WA atau email tujuan
  status           TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'confirmed')),
  notes            TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_rab_materials_project  ON project_rab_materials(project_id);
CREATE INDEX IF NOT EXISTS idx_project_rab_materials_material ON project_rab_materials(material_id);
CREATE INDEX IF NOT EXISTS idx_po_delivery_log_po_number      ON po_delivery_log(po_number);

-- protect_created_at trigger untuk project_rab_materials
CREATE OR REPLACE FUNCTION protect_rab_materials_created_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at = OLD.created_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_rab_materials_created_at
  BEFORE UPDATE ON project_rab_materials
  FOR EACH ROW EXECUTE FUNCTION protect_rab_materials_created_at();

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_rab_materials_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_rab_materials_updated_at
  BEFORE UPDATE ON project_rab_materials
  FOR EACH ROW EXECUTE FUNCTION set_rab_materials_updated_at();
