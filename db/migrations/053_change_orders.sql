-- ============================================================
-- PURALOKA SUITE — Migration 053
-- Change Order System
-- ============================================================

CREATE TABLE change_orders (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  co_number               TEXT          NOT NULL,
  title                   TEXT          NOT NULL,
  description             TEXT,
  status                  TEXT          NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','submitted','approved','rejected')),
  billing_mode            TEXT
                          CHECK (billing_mode IN ('include_termin','separate_co','final_account')),
  submitted_at            TIMESTAMPTZ,
  submitted_by            UUID          REFERENCES users(id) ON DELETE SET NULL,
  approved_at             TIMESTAMPTZ,
  approved_by             UUID          REFERENCES users(id) ON DELETE SET NULL,
  rejected_at             TIMESTAMPTZ,
  rejected_by             UUID          REFERENCES users(id) ON DELETE SET NULL,
  rejected_reason         TEXT,
  -- Snapshot nilai kontrak & RAB sebelum CO diterapkan (diisi saat approve)
  baseline_contract_value NUMERIC(15,2),
  baseline_rab_total      NUMERIC(15,2),
  -- Total delta dari semua CO items (positif = tambah, negatif = kurang)
  total_amount_delta      NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_by              UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, co_number)
);

CREATE TABLE change_order_items (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id  UUID          NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  item_type        TEXT          NOT NULL
                   CHECK (item_type IN ('kerja_tambah','kerja_kurang','perubahan_volume','perubahan_spec')),
  rab_item_id      UUID          REFERENCES rab_items(id) ON DELETE SET NULL,
  description      TEXT          NOT NULL,
  unit             TEXT,
  volume_delta     NUMERIC(15,3),
  unit_price       NUMERIC(15,2),
  amount_delta     NUMERIC(15,2) NOT NULL,
  notes            TEXT,
  sort_order       INTEGER       NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_change_orders_project_id     ON change_orders(project_id);
CREATE INDEX idx_change_orders_status         ON change_orders(status);
CREATE INDEX idx_change_order_items_co_id     ON change_order_items(change_order_id);
CREATE INDEX idx_change_order_items_rab_item  ON change_order_items(rab_item_id) WHERE rab_item_id IS NOT NULL;

-- protect created_at
CREATE OR REPLACE FUNCTION protect_change_orders_created_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_change_orders_created_at
  BEFORE UPDATE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION protect_change_orders_created_at();

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_change_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_change_orders_updated_at
  BEFORE UPDATE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION update_change_orders_updated_at();

COMMENT ON TABLE change_orders      IS 'Change Order — container perubahan lingkup/kontrak proyek';
COMMENT ON TABLE change_order_items IS 'Item rincian perubahan dalam satu Change Order';
COMMENT ON COLUMN change_orders.co_number            IS 'Nomor CO per proyek: CO-001, CO-002, ...';
COMMENT ON COLUMN change_orders.total_amount_delta   IS 'Total delta biaya CO (diupdate saat item berubah)';
COMMENT ON COLUMN change_orders.baseline_contract_value IS 'Nilai kontrak sebelum CO ini diapprove (snapshot)';
COMMENT ON COLUMN change_order_items.amount_delta    IS 'Positif = tambah biaya, negatif = kurang biaya';
COMMENT ON COLUMN change_order_items.volume_delta    IS 'Positif = tambah volume, negatif = kurang volume';
