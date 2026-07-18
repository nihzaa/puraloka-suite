-- Migration 041: Procurement Workflow
-- Tabel: material_requests, MR items, purchase_orders, PO items, goods_receipts, GR items
-- Juga: FK goods_receipt_id di supplier_invoices (backfill dari migration 040)

-- ─── Material Request (MR) ────────────────────────────────────────────────────
-- Pengajuan kebutuhan material dari lapangan (mandor/PM) ke admin/keuangan.
-- Setelah approved → PM/admin buat PO ke supplier.
CREATE TABLE IF NOT EXISTS material_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mr_number       TEXT NOT NULL UNIQUE,      -- 'MR-2026-001', auto-generated
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  requested_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                    'draft',        -- sedang diisi, belum disubmit
                    'submitted',    -- sudah diajukan, menunggu approval
                    'approved',     -- disetujui, siap dibuat PO
                    'rejected',     -- ditolak
                    'partially_ordered', -- sebagian sudah ada PO
                    'fully_ordered' -- semua item sudah ada PO
                  )),
  request_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  needed_date     DATE,                      -- kapan material dibutuhkan di site
  notes           TEXT,
  rejection_notes TEXT,                      -- alasan tolak (jika rejected)
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Item Material Request ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_request_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mr_id           UUID NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  qty_requested   DECIMAL(15,3) NOT NULL CHECK (qty_requested > 0),
  qty_ordered     DECIMAL(15,3) NOT NULL DEFAULT 0,   -- sudah masuk PO
  unit            TEXT NOT NULL,             -- copy dari materials.unit saat MR dibuat
  unit_price_est  DECIMAL(15,2),             -- estimasi harga saat request
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Purchase Order (PO) ──────────────────────────────────────────────────────
-- Satu PO = satu supplier, satu atau beberapa material.
-- Bisa dibuat dari MR atau langsung tanpa MR (pembelian ad-hoc).
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number       TEXT NOT NULL UNIQUE,      -- 'PO-2026-001', auto-generated
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  mr_id           UUID REFERENCES material_requests(id) ON DELETE SET NULL,  -- opsional
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                    'draft',        -- sedang dibuat
                    'sent',         -- sudah dikirim ke supplier (WA/email)
                    'confirmed',    -- supplier konfirmasi bisa supply
                    'partially_received', -- sebagian sudah terima
                    'fully_received',     -- semua sudah terima (GR done)
                    'cancelled'     -- dibatalkan
                  )),
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  delivery_address TEXT,                     -- alamat site pengiriman
  total_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
  payment_terms   TEXT,                      -- copy dari supplier.payment_terms saat PO dibuat
  notes           TEXT,
  -- Untuk pengiriman notifikasi ke supplier
  whatsapp_sent_at TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Item Purchase Order ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  mr_item_id      UUID REFERENCES material_request_items(id) ON DELETE SET NULL, -- opsional
  qty_ordered     DECIMAL(15,3) NOT NULL CHECK (qty_ordered > 0),
  qty_received    DECIMAL(15,3) NOT NULL DEFAULT 0,   -- diupdate setiap GR
  unit            TEXT NOT NULL,
  unit_price      DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_price     DECIMAL(15,2) GENERATED ALWAYS AS (qty_ordered * unit_price) STORED,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Goods Receipt (GR) ───────────────────────────────────────────────────────
-- Konfirmasi penerimaan barang di site. Bisa partial (terima sebagian dari PO).
-- Setelah confirmed → stok project_stocks otomatis bertambah.
CREATE TABLE IF NOT EXISTS goods_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_number       TEXT NOT NULL UNIQUE,      -- 'GR-2026-001', auto-generated
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  received_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                    'draft',        -- sedang diisi
                    'confirmed'     -- dikonfirmasi, stok sudah diupdate
                  )),
  receipt_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_note_number TEXT,                 -- nomor surat jalan dari supplier
  delivery_note_url    TEXT,                 -- foto surat jalan (Supabase Storage)
  notes           TEXT,
  confirmed_at    TIMESTAMPTZ,
  confirmed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Item Goods Receipt ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_id           UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_item_id      UUID NOT NULL REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
  material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  qty_received    DECIMAL(15,3) NOT NULL CHECK (qty_received > 0),
  unit            TEXT NOT NULL,
  unit_price      DECIMAL(15,2) NOT NULL DEFAULT 0,   -- harga aktual saat terima (bisa beda dari PO)
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── FK: supplier_invoices.goods_receipt_id ──────────────────────────────────
-- Backfill FK yang disebut di migration 040 tapi belum bisa dibuat karena GR belum ada
ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_gr ON supplier_invoices(goods_receipt_id);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mr_project        ON material_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_mr_status         ON material_requests(status);
CREATE INDEX IF NOT EXISTS idx_mr_requested_by   ON material_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_mr_items_mr       ON material_request_items(mr_id);
CREATE INDEX IF NOT EXISTS idx_mr_items_material ON material_request_items(material_id);
CREATE INDEX IF NOT EXISTS idx_po_project        ON purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier       ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status         ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_mr             ON purchase_orders(mr_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po       ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_material ON purchase_order_items(material_id);
CREATE INDEX IF NOT EXISTS idx_gr_po             ON goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_gr_project        ON goods_receipts(project_id);
CREATE INDEX IF NOT EXISTS idx_gr_status         ON goods_receipts(status);
CREATE INDEX IF NOT EXISTS idx_gr_items_gr       ON goods_receipt_items(gr_id);
CREATE INDEX IF NOT EXISTS idx_gr_items_material ON goods_receipt_items(material_id);

-- ─── Triggers: updated_at ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at_material_requests()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_mr_updated_at
  BEFORE UPDATE ON material_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_material_requests();

CREATE OR REPLACE FUNCTION set_updated_at_purchase_orders()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_po_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_purchase_orders();

CREATE OR REPLACE FUNCTION set_updated_at_goods_receipts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_gr_updated_at
  BEFORE UPDATE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_goods_receipts();

-- ─── Trigger: auto-update PO status setelah GR confirmed ─────────────────────
-- Setiap GR dikonfirmasi, cek apakah PO sudah fully_received atau partially_received
CREATE OR REPLACE FUNCTION sync_po_receipt_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_po_id         UUID;
  v_all_received  BOOLEAN;
BEGIN
  -- Hanya proses saat status berubah jadi 'confirmed'
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    v_po_id := NEW.po_id;

    -- Update qty_received di po_items berdasarkan semua GR confirmed untuk PO ini
    UPDATE purchase_order_items poi
       SET qty_received = (
             SELECT COALESCE(SUM(gri.qty_received), 0)
               FROM goods_receipt_items gri
               JOIN goods_receipts gr ON gr.id = gri.gr_id
              WHERE gri.po_item_id = poi.id
                AND gr.status = 'confirmed'
           )
     WHERE poi.po_id = v_po_id;

    -- Cek apakah semua item sudah fully received
    SELECT NOT EXISTS (
      SELECT 1 FROM purchase_order_items
       WHERE po_id = v_po_id AND qty_received < qty_ordered
    ) INTO v_all_received;

    -- Update PO status
    UPDATE purchase_orders
       SET status = CASE WHEN v_all_received THEN 'fully_received' ELSE 'partially_received' END
     WHERE id = v_po_id;

    -- Update stok project_stocks untuk setiap item di GR ini
    INSERT INTO project_stocks (project_id, material_id, qty_on_hand)
    SELECT NEW.project_id, gri.material_id, gri.qty_received
      FROM goods_receipt_items gri
     WHERE gri.gr_id = NEW.id
    ON CONFLICT (project_id, material_id)
    DO UPDATE SET
      qty_on_hand = project_stocks.qty_on_hand + EXCLUDED.qty_on_hand,
      last_updated_at = NOW();

    -- Catat ke stock_movements
    INSERT INTO stock_movements (project_id, material_id, movement_type, qty, qty_before, qty_after, reference_type, reference_id, created_by)
    SELECT
      NEW.project_id,
      gri.material_id,
      'goods_receipt',
      gri.qty_received,
      COALESCE((SELECT qty_on_hand - gri.qty_received FROM project_stocks WHERE project_id = NEW.project_id AND material_id = gri.material_id), 0),
      COALESCE((SELECT qty_on_hand FROM project_stocks WHERE project_id = NEW.project_id AND material_id = gri.material_id), 0),
      'goods_receipt',
      NEW.id,
      NEW.confirmed_by
    FROM goods_receipt_items gri
    WHERE gri.gr_id = NEW.id;

  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_po_receipt_status
  AFTER UPDATE ON goods_receipts
  FOR EACH ROW EXECUTE FUNCTION sync_po_receipt_status();

-- ─── Function: auto-generate sequence numbers ─────────────────────────────────
-- MR number: MR-YYYY-NNN
CREATE OR REPLACE FUNCTION generate_mr_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_year TEXT;
  v_seq  INTEGER;
BEGIN
  v_year := TO_CHAR(NOW(), 'YYYY');
  SELECT COUNT(*) + 1 INTO v_seq
    FROM material_requests
   WHERE TO_CHAR(created_at, 'YYYY') = v_year;
  NEW.mr_number := 'MR-' || v_year || '-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_generate_mr_number
  BEFORE INSERT ON material_requests
  FOR EACH ROW WHEN (NEW.mr_number IS NULL OR NEW.mr_number = '')
  EXECUTE FUNCTION generate_mr_number();

-- PO number: PO-YYYY-NNN
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_year TEXT;
  v_seq  INTEGER;
BEGIN
  v_year := TO_CHAR(NOW(), 'YYYY');
  SELECT COUNT(*) + 1 INTO v_seq
    FROM purchase_orders
   WHERE TO_CHAR(created_at, 'YYYY') = v_year;
  NEW.po_number := 'PO-' || v_year || '-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_generate_po_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW WHEN (NEW.po_number IS NULL OR NEW.po_number = '')
  EXECUTE FUNCTION generate_po_number();

-- GR number: GR-YYYY-NNN
CREATE OR REPLACE FUNCTION generate_gr_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_year TEXT;
  v_seq  INTEGER;
BEGIN
  v_year := TO_CHAR(NOW(), 'YYYY');
  SELECT COUNT(*) + 1 INTO v_seq
    FROM goods_receipts
   WHERE TO_CHAR(created_at, 'YYYY') = v_year;
  NEW.gr_number := 'GR-' || v_year || '-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_generate_gr_number
  BEFORE INSERT ON goods_receipts
  FOR EACH ROW WHEN (NEW.gr_number IS NULL OR NEW.gr_number = '')
  EXECUTE FUNCTION generate_gr_number();
