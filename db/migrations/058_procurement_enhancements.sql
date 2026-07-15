-- Migration 058: Procurement enhancements
-- Tambah: min_stock pada materials, rejection_notes pada material_requests,
--         approved_at pada material_requests (jika belum ada), cancel support PO

-- 1. min_stock pada materials (untuk reorder alert)
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS min_stock NUMERIC(15,3) NOT NULL DEFAULT 0;

-- 2. rejection_notes pada material_requests (visible di approval trail)
ALTER TABLE material_requests
  ADD COLUMN IF NOT EXISTS rejection_notes TEXT;

-- 3. approved_at pada material_requests
ALTER TABLE material_requests
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 4. canceled_at + cancel_notes pada purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_notes TEXT;

-- 5. Index untuk min_stock alert query
CREATE INDEX IF NOT EXISTS idx_materials_min_stock
  ON materials(min_stock) WHERE min_stock > 0;

-- 6. Index MR approved_by untuk approval trail
CREATE INDEX IF NOT EXISTS idx_mr_approved_by
  ON material_requests(approved_by) WHERE approved_by IS NOT NULL;
