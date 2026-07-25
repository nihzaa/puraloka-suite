-- Migration 112 — CECEP Milestone 4: ACL Actual Cost (Program C)
--
-- SATU-SATUNYA tabel baru di Milestone 4 (`49` M4, `46`). Anti-Corruption Layer:
-- tabel translasi `category_id (existing) ↔ cost_code_id (CECEP)`.
--
-- Business Responsibility (`46`): "Cost Control (`35` #11) harus bisa membandingkan
-- Actual Cost riil terhadap RAP Baseline via Cost Code — tapi project_expenses/
-- kasbons existing TIDAK PUNYA kolom Cost Code (hanya category_id →
-- project_expense_categories). Tanpa ACL, Variance Calculation (`44` §13) tak jalan."
--
-- ── Zero-Invention (`46` batas eksplisit) ──────────────────────────────────
-- ACL ini TIDAK mengubah project_expenses/kasbons — Puraloka Suite tetap jalan
-- seperti sekarang. Yang baru HANYA tabel translasi ini, dikonsumsi READ-ONLY oleh
-- Cost Control (#11) dan Historical Cost Intelligence (#13). Tak ada trigger yang
-- menyentuh tabel existing.
--
-- ── Keputusan modeling: category_id UNIK (resolusi deterministik) ───────────
-- Satu category memetakan ke TEPAT SATU cost code (UNIQUE category_id) — supaya
-- "resolusi Cost Code dari data lama" (`46`) deterministik, tak ambigu. BANYAK
-- category boleh menunjuk cost code yang SAMA (rollup beberapa kategori ke satu
-- pekerjaan generik). Kalau kelak butuh split satu category ke beberapa cost code
-- (mis. proporsi), itu extension ber-ADR — bukan ditebak sekarang.
--
-- Exclude (ADR-009): company_id (Phase 7).

CREATE TABLE IF NOT EXISTS cost_code_category_map (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kategori pengeluaran existing (project-scoped). CASCADE: kalau kategori dihapus,
  -- mapping-nya ikut (tak ada gunanya mapping ke kategori yang tak ada).
  category_id  UUID NOT NULL UNIQUE REFERENCES project_expense_categories(id) ON DELETE CASCADE,

  -- Cost Code CECEP tujuan resolusi. RESTRICT (default): cost code yang masih
  -- dirujuk mapping tak boleh dihapus — tapi cost_codes memang tak bisa dihapus
  -- (guard migration 102), jadi ini konsisten.
  cost_code_id UUID NOT NULL REFERENCES cost_codes(id),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ccc_map_cost_code ON cost_code_category_map(cost_code_id);

COMMENT ON TABLE cost_code_category_map IS
  'CECEP ACL Actual Cost (`46`) — translasi category_id (project_expenses existing) '
  '↔ cost_code_id (CECEP). Dikonsumsi READ-ONLY oleh Cost Control & Historical Cost '
  'Intelligence. TIDAK mengubah tabel existing (Zero-Invention).';

-- updated_at otomatis.
CREATE OR REPLACE FUNCTION fn_ccc_map_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END $function$;

DROP TRIGGER IF EXISTS trg_ccc_map_touch ON cost_code_category_map;
CREATE TRIGGER trg_ccc_map_touch
  BEFORE UPDATE ON cost_code_category_map
  FOR EACH ROW EXECUTE FUNCTION fn_ccc_map_touch_updated_at();

-- ─── Capability (ADR-004) ───────────────────────────────────────────────────

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:cost_map:view',   'cecep', 'Lihat Pemetaan Biaya',
   'Melihat pemetaan kategori pengeluaran ↔ Cost Code (ACL Actual Cost)', 29),
  ('cecep:cost_map:manage', 'cecep', 'Kelola Pemetaan Biaya',
   'Mengatur pemetaan kategori pengeluaran existing ke Cost Code CECEP', 30)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:cost_map:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:cost_map:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE cost_code_category_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ccc_map_read ON cost_code_category_map;
CREATE POLICY ccc_map_read ON cost_code_category_map
  FOR SELECT USING (has_permission('cecep:cost_map:view'));

DROP POLICY IF EXISTS ccc_map_write ON cost_code_category_map;
CREATE POLICY ccc_map_write ON cost_code_category_map
  FOR ALL USING (has_permission('cecep:cost_map:manage'))
  WITH CHECK (has_permission('cecep:cost_map:manage'));
