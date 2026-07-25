-- Migration 109 — CECEP Milestone 3: WBS / Work Breakdown Structure (Program C)
--
-- WBS Node = child entity di dalam Aggregate PROJECT (`03b` §A.1) — BUKAN Aggregate
-- Root sendiri. Lensa Planning/Execution ("kapan dan di mana pekerjaan dilakukan"),
-- TERPISAH dari CBS (lensa Cost). Keduanya bertemu di Cost Code, tak saling
-- bergantung (`03b` §A.1 Context Mapping: "WBS tidak bergantung ke CBS dan
-- sebaliknya — paralel, bertemu di Cost Code").
--
-- Dibangun di Milestone 3 karena Estimate Item merujuk WBS Node. WBS sendiri hanya
-- butuh Project (existing) + Cost Code (migration 102).
--
-- ── Yang SENGAJA tidak ada (Open — ADR-009) ─────────────────────────────────
--   planned_start/end (tanggal) → `03b` §A.1 responsibility "kapan…" mengisyaratkan
--     jadwal, TAPI daftar atribut Frozen-nya tidak menyebut kolom tanggal. Gantt
--     existing memakai rab_items.planned_start/end; integrasi penjadwalan WBS↔Gantt
--     adalah keputusan tersendiri. Ditambahkan additive saat integrasi itu tiba,
--     bukan ditebak sekarang.
--   company_id → Phase 7.

-- ─── 1. TABLE ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wbs_nodes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WBS Node dimiliki Project (child dari Aggregate Project).
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Hierarki WBS (di dalam satu project). Null = node akar.
  parent_id    UUID REFERENCES wbs_nodes(id) ON DELETE CASCADE,

  -- WBS Node → referensi → Cost Code (`03b` §A.1). Nullable: node pengelompok
  -- (fase/paket) boleh tanpa; node kerja memetakan.
  cost_code_id UUID REFERENCES cost_codes(id),

  name         TEXT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,

  -- Lifecycle `03b` §A.1: Draft → Baseline → Revised (independen dari Estimate).
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'baseline', 'revised')),
  baselined_at TIMESTAMPTZ,                    -- event WbsNodeBaselined

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT wbs_node_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_wbs_nodes_project   ON wbs_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_wbs_nodes_parent    ON wbs_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_wbs_nodes_cost_code ON wbs_nodes(cost_code_id);

COMMENT ON TABLE wbs_nodes IS
  'CECEP WBS Node — child dari Aggregate Project (lensa Planning: kapan & di mana). '
  'Paralel dengan CBS (lensa Cost), bertemu di Cost Code. Dirujuk Estimate Item.';

-- ─── 2. HARD GUARD: transisi lifecycle ──────────────────────────────────────
--
-- Diizinkan: draft→baseline (WbsNodeBaselined), baseline→revised,
--            revised→baseline (RE-baseline — planning secara wajar di-baseline
--            ulang setelah revisi; ini planning artifact yang memang berulang,
--            berbeda dari Estimate/Price yang immutable karena basis uang).
-- Ditolak  : kembali ke 'draft' setelah pernah baseline (sudah jadi acuan).
--
-- ⚠️ CATATAN JEJAK (ADR-009): `03b` §A.1 menulis urutan "Draft → Baseline →
-- Revised" tapi tidak eksplisit soal re-baseline. Dipilih MENGIZINKAN
-- revised→baseline karena WBS adalah planning yang di-baseline ulang secara wajar,
-- dan ia BUKAN basis-uang immutable (revisi WBS tak mengubah biaya Estimate — biaya
-- dari Cost Code+Assembly+Price). Ini keputusan yang murah dibalik (ubah trigger)
-- karena WBS bukan basis nominal; dilaporkan sebagai catatan, bukan gerbang.

CREATE OR REPLACE FUNCTION fn_wbs_node_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'draft' THEN
    RAISE EXCEPTION
      'WBS Node yang sudah di-baseline tidak bisa kembali ke draft (code node=%). '
      'Alur sah: draft→baseline→revised, revised→baseline (re-baseline).', NEW.name
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'baseline' AND NEW.baselined_at IS NULL THEN
    NEW.baselined_at := now();
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_wbs_node_status_transition ON wbs_nodes;
CREATE TRIGGER trg_wbs_node_status_transition
  BEFORE UPDATE OF status ON wbs_nodes
  FOR EACH ROW EXECUTE FUNCTION fn_wbs_node_status_transition();

-- ─── 3. HARD GUARD: integritas hierarki (parent se-project, tak self) ───────

CREATE OR REPLACE FUNCTION fn_wbs_node_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_parent_pid UUID;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT project_id INTO v_parent_pid FROM wbs_nodes WHERE id = NEW.parent_id;
    IF v_parent_pid IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION
        'WBS Node parent harus berada di Project yang sama (hierarki milik satu Project).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_wbs_node_hierarchy ON wbs_nodes;
CREATE TRIGGER trg_wbs_node_hierarchy
  BEFORE INSERT OR UPDATE ON wbs_nodes
  FOR EACH ROW EXECUTE FUNCTION fn_wbs_node_hierarchy();

-- updated_at otomatis.
CREATE OR REPLACE FUNCTION fn_wbs_node_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END $function$;

DROP TRIGGER IF EXISTS trg_wbs_node_touch ON wbs_nodes;
CREATE TRIGGER trg_wbs_node_touch
  BEFORE UPDATE ON wbs_nodes
  FOR EACH ROW EXECUTE FUNCTION fn_wbs_node_touch_updated_at();

-- ─── 4. Capability (ADR-004) ────────────────────────────────────────────────
-- `03b` §A.1 Ownership: fungsi Planning/Scheduling (bukan Cost Engineering).

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:wbs:view',   'cecep', 'Lihat WBS',
   'Melihat Work Breakdown Structure (struktur pelaksanaan)', 24),
  ('cecep:wbs:manage', 'cecep', 'Kelola WBS',
   'Membuat, mengedit, mem-baseline, dan merevisi WBS Node', 25)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:wbs:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:wbs:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE wbs_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wbs_nodes_read ON wbs_nodes;
CREATE POLICY wbs_nodes_read ON wbs_nodes
  FOR SELECT USING (has_permission('cecep:wbs:view'));

DROP POLICY IF EXISTS wbs_nodes_write ON wbs_nodes;
CREATE POLICY wbs_nodes_write ON wbs_nodes
  FOR ALL USING (has_permission('cecep:wbs:manage'))
  WITH CHECK (has_permission('cecep:wbs:manage'));
