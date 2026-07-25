-- Migration 110 — CECEP Milestone 3: Estimate Aggregate Chain (Program C)
--   Scenario → Estimate Version → Estimate Item (`44` §9-11, `03b` §A.9a-c).
--   "Contoh derivasi TERKUAT di seluruh dokumen" (`44`, `41` Contoh 1).
--
-- Business Responsibility:
--   Scenario (`03b` §A.9c): "Satu Project bisa punya banyak jalur estimasi paralel
--     yang dibandingkan apple-to-apple — kalau struktur CBS/Cost Code beda,
--     perbandingannya tidak valid."
--   Estimate Version (`03b` §A.9b): "Perubahan pada satu Estimate Item harus lewat
--     Estimate Version yang menaunginya, supaya total biaya & status approval tetap
--     konsisten — edit langsung ke satu baris akan merusak invariant itu."
--   Estimate Item (`03b` §A.9a): "Satu angka biaya adalah hasil pertemuan Cost Code
--     +Assembly+CBS+WBS — ia hanya bermakna DI DALAM konteks satu Estimate Version."
--
-- ── LINGKUP: STRUKTUR, BUKAN ALUR APPROVAL ──────────────────────────────────
-- Migration ini membangun STRUKTUR lengkap termasuk kolom status Estimate Version
-- (draft→under_review→approved→frozen→superseded) + guard STRUKTURAL (transisi
-- maju saja, immutable begitu ≠ draft). TAPI TIDAK ADA integrasi engine approval:
-- SIAPA yang boleh memicu under_review→approved, lewat approval_chains (ADR-007)
-- atau bukan, adalah keputusan integrasi TERPISAH (discovery step 2). Belum ada
-- jalur API approval; transisi hanya bisa lewat service_role langsung sampai
-- wiring itu ada. Ini disengaja sesuai instruksi: bangun semua KECUALI alur approval.
--
-- Semua tabel merujuk domain yang sudah ada: projects, cost_codes (102),
-- assemblies (107), cbs_nodes (108), wbs_nodes (109).
--
-- ── Yang SENGAJA tidak ada (Open — ADR-009) ─────────────────────────────────
--   unit        → quantity Estimate Item butuh satuan kerja (masih ditunda).
--   Project CBS snapshot → mekanisme snapshot level-Project (di luar chain ini).
--   company_id  → Phase 7.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SCENARIO (Aggregate Root, dimiliki Project) — wadah perbandingan paralel
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scenarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  name        TEXT NOT NULL,
  purpose     TEXT,                            -- mis. 'tender' / 'rap' (label bebas)

  -- Lifecycle `03b` §A.9c: Active → Branched → Archived (wadah, bukan draft/approved).
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'branched', 'archived')),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scenarios_project ON scenarios(project_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ESTIMATE VERSION (Aggregate Root, dimiliki Scenario)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS estimate_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id    UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,

  version_number INT NOT NULL DEFAULT 1 CHECK (version_number >= 1),

  -- Total biaya (snapshot, dijumlahkan dari Estimate Item saat masih draft).
  total_amount   NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

  -- Lifecycle `03b` §A.9b: Draft → Under Review → Approved → Frozen → Superseded.
  -- Guard di sini STRUKTURAL saja (transisi maju). Integrasi engine approval
  -- (siapa boleh approve) = step 2, belum di sini.
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'under_review', 'approved', 'frozen', 'superseded')),

  -- Metadata approval (Value Object di dalam Estimate Version) — diisi saat transisi.
  approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,
  frozen_at      TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT estimate_version_identity UNIQUE (scenario_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_estimate_versions_scenario ON estimate_versions(scenario_id);
CREATE INDEX IF NOT EXISTS idx_estimate_versions_status   ON estimate_versions(status);

COMMENT ON TABLE estimate_versions IS
  'CECEP Estimate Version (Aggregate Root). Lifecycle draft→under_review→approved→'
  'frozen→superseded. STRUKTUR dibangun; ALUR APPROVAL (siapa boleh approve via '
  'engine ADR-007) = integrasi terpisah, belum di-wire (ADR-009 / Milestone 3).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ESTIMATE ITEM (child entity, BUKAN root) — pertemuan 4 domain jadi 1 angka
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS estimate_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_version_id UUID NOT NULL REFERENCES estimate_versions(id) ON DELETE CASCADE,

  -- Pertemuan 4 domain (`03b` §A.9a). cost_code WAJIB (identitas pekerjaan);
  -- assembly/cbs/wbs nullable (diisi progresif; tak semua item terklasifikasi penuh
  -- saat draft). MERUJUK, tak menyalin (No Data Duplication).
  cost_code_id       UUID NOT NULL REFERENCES cost_codes(id),
  assembly_id        UUID REFERENCES assemblies(id),
  cbs_node_id        UUID REFERENCES cbs_nodes(id),
  wbs_node_id        UUID REFERENCES wbs_nodes(id),

  -- Volume pekerjaan (satuan menunggu resolusi unit) + biaya hasil hitung (snapshot).
  quantity           NUMERIC(16, 4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  amount             NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),

  sort_order         INT NOT NULL DEFAULT 0,
  notes              TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_items_version   ON estimate_items(estimate_version_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_cost_code ON estimate_items(cost_code_id);

COMMENT ON TABLE estimate_items IS
  'CECEP Estimate Item — child entity dari Estimate Version (BUKAN root; tak sah di '
  'luar konteks satu Version). Pertemuan Cost Code+Assembly+CBS+WBS jadi satu angka. '
  'Mutasi hanya saat Version berstatus draft (ADR-009).';

-- ─── 4. HARD GUARD (Scenario): transisi lifecycle ───────────────────────────
--   active → branched, active → archived, branched → archived.

CREATE OR REPLACE FUNCTION fn_scenario_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.status = 'active'   AND NEW.status IN ('branched', 'archived'))
    OR (OLD.status = 'branched' AND NEW.status = 'archived')
  ) THEN
    RAISE EXCEPTION 'Transisi status Scenario tidak sah: % → %. Alur sah: '
      'active→branched, active→archived, branched→archived.', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_scenario_status_transition ON scenarios;
CREATE TRIGGER trg_scenario_status_transition
  BEFORE UPDATE OF status ON scenarios
  FOR EACH ROW EXECUTE FUNCTION fn_scenario_status_transition();

-- ─── 5. HARD GUARD (Estimate Version): transisi lifecycle maju saja (STRUKTURAL) ─

CREATE OR REPLACE FUNCTION fn_estimate_version_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.status = 'draft'        AND NEW.status = 'under_review')
    OR (OLD.status = 'under_review' AND NEW.status = 'approved')
    OR (OLD.status = 'approved'     AND NEW.status = 'frozen')
    OR (OLD.status = 'frozen'       AND NEW.status = 'superseded')
    OR (OLD.status = 'approved'     AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'Transisi status Estimate Version tidak sah: % → %. Alur sah: '
      'draft→under_review→approved→frozen→superseded (maju saja).', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
  IF NEW.status = 'frozen'   AND NEW.frozen_at   IS NULL THEN NEW.frozen_at   := now(); END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_estimate_version_status_transition ON estimate_versions;
CREATE TRIGGER trg_estimate_version_status_transition
  BEFORE UPDATE OF status ON estimate_versions
  FOR EACH ROW EXECUTE FUNCTION fn_estimate_version_status_transition();

-- ─── 6. HARD GUARD (Estimate Version): total_amount immutable begitu ≠ draft ─
--   Begitu diajukan review, angka total beku (item juga beku, guard #8). Approved
--   estimate = angka commitment; tak boleh berubah retroaktif.

CREATE OR REPLACE FUNCTION fn_estimate_version_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF ( NEW.scenario_id, NEW.version_number, NEW.total_amount )
       IS DISTINCT FROM
       ( OLD.scenario_id, OLD.version_number, OLD.total_amount )
    THEN
      RAISE EXCEPTION
        'Estimate Version sudah keluar dari draft (status=%): total & identitas beku '
        '— angka yang direview/disetujui tak boleh berubah. Buat versi baru.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_estimate_version_immutable ON estimate_versions;
CREATE TRIGGER trg_estimate_version_immutable
  BEFORE UPDATE ON estimate_versions
  FOR EACH ROW EXECUTE FUNCTION fn_estimate_version_immutable();

-- ─── 7. HARD GUARD (Estimate Version): non-draft tidak boleh dihapus ─────────

CREATE OR REPLACE FUNCTION fn_estimate_version_no_delete()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION
      'Estimate Version berstatus % tidak boleh dihapus — ia jadi acuan Budget/RAB/'
      'RAP/EVM. Supersede, jangan hapus.', OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_estimate_version_no_delete ON estimate_versions;
CREATE TRIGGER trg_estimate_version_no_delete
  BEFORE DELETE ON estimate_versions
  FOR EACH ROW EXECUTE FUNCTION fn_estimate_version_no_delete();

-- ─── 8. HARD GUARD (Estimate Item): mutasi hanya saat Version draft ──────────
--   "Perubahan Estimate Item harus lewat Estimate Version" (`03b` §A.9b): begitu
--   Version diajukan review, seluruh item beku. Berlaku INSERT/UPDATE/DELETE.

CREATE OR REPLACE FUNCTION fn_estimate_item_parent_draft()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_status TEXT;
  v_vid    UUID;
BEGIN
  v_vid := COALESCE(NEW.estimate_version_id, OLD.estimate_version_id);
  SELECT status INTO v_status FROM estimate_versions WHERE id = v_vid;
  -- CASCADE dari version draft yang dihapus → v_status NULL, izinkan.
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION
      'Estimate Item hanya bisa diubah saat Estimate Version berstatus draft (kini %). '
      'Angka yang direview/disetujui beku — buat versi baru.', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_estimate_item_parent_draft ON estimate_items;
CREATE TRIGGER trg_estimate_item_parent_draft
  BEFORE INSERT OR UPDATE OR DELETE ON estimate_items
  FOR EACH ROW EXECUTE FUNCTION fn_estimate_item_parent_draft();

-- updated_at otomatis (scenarios + estimate_versions).
CREATE OR REPLACE FUNCTION fn_estimate_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END $function$;

DROP TRIGGER IF EXISTS trg_scenario_touch ON scenarios;
CREATE TRIGGER trg_scenario_touch BEFORE UPDATE ON scenarios
  FOR EACH ROW EXECUTE FUNCTION fn_estimate_touch_updated_at();
DROP TRIGGER IF EXISTS trg_estimate_version_touch ON estimate_versions;
CREATE TRIGGER trg_estimate_version_touch BEFORE UPDATE ON estimate_versions
  FOR EACH ROW EXECUTE FUNCTION fn_estimate_touch_updated_at();

-- ─── 9. Capability (ADR-004) ────────────────────────────────────────────────
-- Estimate = inti cost engineering. view + manage. (Capability approve khusus,
-- kalau perlu, ditentukan di discovery approval step 2 — bukan di-hardcode di sini.)

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:estimate:view',   'cecep', 'Lihat Estimasi',
   'Melihat Scenario, Estimate Version, dan Estimate Item', 26),
  ('cecep:estimate:manage', 'cecep', 'Kelola Estimasi',
   'Membuat/mengedit Scenario, Estimate Version (draft), dan Estimate Item', 27)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:estimate:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:estimate:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Scenario/Estimate Version draft ⊂ manage (pm boleh menyusun estimasi draft).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'pm' AND p.key = 'cecep:estimate:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 10. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE scenarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_items    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scenarios_read ON scenarios;
CREATE POLICY scenarios_read ON scenarios FOR SELECT USING (has_permission('cecep:estimate:view'));
DROP POLICY IF EXISTS scenarios_write ON scenarios;
CREATE POLICY scenarios_write ON scenarios FOR ALL
  USING (has_permission('cecep:estimate:manage')) WITH CHECK (has_permission('cecep:estimate:manage'));

DROP POLICY IF EXISTS estimate_versions_read ON estimate_versions;
CREATE POLICY estimate_versions_read ON estimate_versions FOR SELECT USING (has_permission('cecep:estimate:view'));
DROP POLICY IF EXISTS estimate_versions_write ON estimate_versions;
CREATE POLICY estimate_versions_write ON estimate_versions FOR ALL
  USING (has_permission('cecep:estimate:manage')) WITH CHECK (has_permission('cecep:estimate:manage'));

DROP POLICY IF EXISTS estimate_items_read ON estimate_items;
CREATE POLICY estimate_items_read ON estimate_items FOR SELECT USING (has_permission('cecep:estimate:view'));
DROP POLICY IF EXISTS estimate_items_write ON estimate_items;
CREATE POLICY estimate_items_write ON estimate_items FOR ALL
  USING (has_permission('cecep:estimate:manage')) WITH CHECK (has_permission('cecep:estimate:manage'));
