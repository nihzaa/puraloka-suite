-- Migration 108 — CECEP Milestone 2: CBS / Cost Breakdown Structure (Program C)
--   MENUTUP Milestone 2 (domain ke-6, terakhir).
--
-- Aggregate Root: Company CBS Template (`44` §3, `03b` §A.2). CBS Node = Entity di
-- dalamnya (hierarki, `03b` §A.2 "punya identitas + posisi hierarki").
--
-- Business Responsibility (`44` §3): "Biaya harus bisa dikelompokkan untuk analisis
-- TANPA mengasumsikan struktur pekerjaan — kalau CBS dipaksa jadi Aggregate Root
-- untuk Estimate Item, restrukturisasi kategori akan merusak Estimate Item yang
-- sudah ada." → CBS Node HANYA dirujuk Estimate Item, bukan induknya (`03b` §A.2).
--
-- ── DUA KEPUTUSAN FOUNDER yang membuka blokir (sebelumnya B.5 & B.4 di `03b`) ─
-- 1. VERSIONING = IMMUTABLE PER VERSI (pola Price Book). `03b` §B.5 menandainya
--    "belum diambil"; founder memutuskan: tiap revisi = record versi BARU, versi
--    lama tetap ada sebagai 'superseded', tak diedit — konsisten dgn 4 domain M2
--    lain & kata "superseded" di lifecycle. Estimate Item lama tetap merujuk versi
--    yang dulu dipakainya, tak berubah retroaktif.
-- 2. STANDARD CBS = LABEL `source` (pola Assembly). `03b` §B.4 menandai Reference
--    Library sbg Candidate; founder memutuskan: source (standard/company/project)
--    adalah LABEL, tanpa tabel Reference Library terpisah — persis cara 4 sumber
--    AHSP ditangani di Assembly (107). Engine Reference Library ditunda sampai ada
--    bukti kebutuhan (ADR-006). Standard CBS = template ber-source='standard'.
--
-- ── Di sinilah HIERARKI tinggal ────────────────────────────────────────────
-- `parent_id` SENGAJA di-exclude dari Cost Code (migration 102, ADR-009): "CBS
-- domain terpisah; Cost Code titik temu, bukan pemilik pohon". Hierarki itu ada DI
-- SINI, di cbs_nodes — memvalidasi keputusan exclude tsb.
--
-- ── Yang SENGAJA tidak ada (Open — ADR-009) ─────────────────────────────────
--   Project CBS snapshot → `03b` §A.2 "beku begitu snapshot diambil", dimiliki
--     Project. Itu mekanisme level-Project (Milestone 3, saat Estimate/Project
--     mengambil snapshot). Di sini cukup Company CBS Template + node-nya.
--   company_id → Phase 7.

-- ─── 1. PARENT: cbs_templates (Company CBS Template = Aggregate Root) ────────

CREATE TABLE IF NOT EXISTS cbs_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  code           TEXT NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,

  -- Keputusan founder #2: source = label (bukan FK Reference Library).
  source         TEXT NOT NULL DEFAULT 'company'
                 CHECK (source IN ('standard', 'company', 'project')),

  version_number INT NOT NULL DEFAULT 1 CHECK (version_number >= 1),

  -- Lifecycle `03b` §A.2 (Company): draft → active → superseded.
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'active', 'superseded')),
  activated_at   TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Keputusan founder #1: identitas ter-versi (immutable per versi).
  CONSTRAINT cbs_template_identity UNIQUE (code, version_number)
);

CREATE INDEX IF NOT EXISTS idx_cbs_templates_status ON cbs_templates(status);

COMMENT ON TABLE cbs_templates IS
  'CECEP Company CBS Template (Aggregate Root). Immutable per versi (keputusan '
  'founder, pola Price Book); revisi = versi baru. source=label, bukan FK Reference '
  'Library. CBS Node HANYA dirujuk Estimate Item, tak jadi root-nya (ADR-009).';

-- ─── 2. CHILD: cbs_nodes (hierarki kategori biaya) ──────────────────────────

CREATE TABLE IF NOT EXISTS cbs_nodes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES cbs_templates(id) ON DELETE CASCADE,

  -- Hierarki DALAM satu template (di-exclude dari Cost Code, ada di sini).
  -- Null = node akar. Integritas (parent se-template, tak self) dijaga trigger #6.
  parent_id     UUID REFERENCES cbs_nodes(id) ON DELETE CASCADE,

  -- CBS Node → referensi → Cost Code (`03b` §A.2). Nullable: node pengelompok
  -- (parent) boleh tak memetakan cost code; node daun memetakan.
  cost_code_id  UUID REFERENCES cost_codes(id),

  name          TEXT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cbs_node_not_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_cbs_nodes_template  ON cbs_nodes(template_id);
CREATE INDEX IF NOT EXISTS idx_cbs_nodes_parent    ON cbs_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_cbs_nodes_cost_code ON cbs_nodes(cost_code_id);

-- ─── 3. HARD GUARD (parent): immutable begitu ≠ draft ───────────────────────

CREATE OR REPLACE FUNCTION fn_cbs_template_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF ( NEW.code, NEW.source, NEW.version_number )
       IS DISTINCT FROM
       ( OLD.code, OLD.source, OLD.version_number )
    THEN
      RAISE EXCEPTION
        'CBS Template sudah active/superseded (status=%): kategori tak bisa diubah — '
        'Estimate Item yang merujuk node-nya tak boleh berubah retroaktif. Buat '
        'versi baru.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_cbs_template_immutable ON cbs_templates;
CREATE TRIGGER trg_cbs_template_immutable
  BEFORE UPDATE ON cbs_templates
  FOR EACH ROW EXECUTE FUNCTION fn_cbs_template_immutable();

-- ─── 4. HARD GUARD (parent): transisi lifecycle maju saja ───────────────────

CREATE OR REPLACE FUNCTION fn_cbs_template_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'draft'  AND NEW.status = 'active')
    OR (OLD.status = 'active' AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION
      'Transisi status CBS Template tidak sah: % → %. Alur sah: '
      'draft→active→superseded (maju saja).', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'active' AND NEW.activated_at IS NULL THEN NEW.activated_at := now(); END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_cbs_template_status_transition ON cbs_templates;
CREATE TRIGGER trg_cbs_template_status_transition
  BEFORE UPDATE OF status ON cbs_templates
  FOR EACH ROW EXECUTE FUNCTION fn_cbs_template_status_transition();

-- ─── 5. HARD GUARD (parent): non-draft tidak boleh dihapus ──────────────────

CREATE OR REPLACE FUNCTION fn_cbs_template_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION
      'CBS Template berstatus % tidak boleh dihapus — Estimate Item mungkin '
      'merujuk node-nya. Supersede, jangan hapus.', OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_cbs_template_no_delete ON cbs_templates;
CREATE TRIGGER trg_cbs_template_no_delete
  BEFORE DELETE ON cbs_templates
  FOR EACH ROW EXECUTE FUNCTION fn_cbs_template_no_delete();

-- ─── 6. HARD GUARD (child): node hanya bisa diubah saat template draft +
--        integritas hierarki (parent se-template) ─────────────────────────────

CREATE OR REPLACE FUNCTION fn_cbs_node_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status        TEXT;
  v_tid           UUID;
  v_parent_tid    UUID;
BEGIN
  v_tid := COALESCE(NEW.template_id, OLD.template_id);
  SELECT status INTO v_status FROM cbs_templates WHERE id = v_tid;

  -- Template beku begitu bukan draft (kecuali CASCADE dari template draft yg dihapus
  -- → v_status NULL, izinkan).
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION
      'CBS Node hanya bisa diubah saat CBS Template berstatus draft (kini %). '
      'Kategori yang sudah active beku — buat versi Template baru.', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Integritas hierarki (hanya untuk INSERT/UPDATE): parent harus di template yang
  -- SAMA. Hierarki adalah milik satu Template; merujuk node template lain nonsens.
  IF TG_OP <> 'DELETE' AND NEW.parent_id IS NOT NULL THEN
    SELECT template_id INTO v_parent_tid FROM cbs_nodes WHERE id = NEW.parent_id;
    IF v_parent_tid IS DISTINCT FROM NEW.template_id THEN
      RAISE EXCEPTION
        'CBS Node parent harus berada di CBS Template yang sama (hierarki milik satu '
        'Template).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_cbs_node_guard ON cbs_nodes;
CREATE TRIGGER trg_cbs_node_guard
  BEFORE INSERT OR UPDATE OR DELETE ON cbs_nodes
  FOR EACH ROW EXECUTE FUNCTION fn_cbs_node_guard();

-- updated_at otomatis (parent).
CREATE OR REPLACE FUNCTION fn_cbs_template_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END $function$;

DROP TRIGGER IF EXISTS trg_cbs_template_touch ON cbs_templates;
CREATE TRIGGER trg_cbs_template_touch
  BEFORE UPDATE ON cbs_templates
  FOR EACH ROW EXECUTE FUNCTION fn_cbs_template_touch_updated_at();

-- ─── 7. Capability (ADR-004) ────────────────────────────────────────────────

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:cbs:view',   'cecep', 'Lihat CBS',
   'Melihat Cost Breakdown Structure (kategori biaya)', 22),
  ('cecep:cbs:manage', 'cecep', 'Kelola CBS',
   'Membuat, mengedit, mengaktifkan, dan men-supersede CBS Template', 23)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:cbs:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:cbs:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 8. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE cbs_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cbs_nodes     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cbs_templates_read ON cbs_templates;
CREATE POLICY cbs_templates_read ON cbs_templates
  FOR SELECT USING (has_permission('cecep:cbs:view'));
DROP POLICY IF EXISTS cbs_templates_write ON cbs_templates;
CREATE POLICY cbs_templates_write ON cbs_templates
  FOR ALL USING (has_permission('cecep:cbs:manage'))
  WITH CHECK (has_permission('cecep:cbs:manage'));

DROP POLICY IF EXISTS cbs_nodes_read ON cbs_nodes;
CREATE POLICY cbs_nodes_read ON cbs_nodes
  FOR SELECT USING (has_permission('cecep:cbs:view'));
DROP POLICY IF EXISTS cbs_nodes_write ON cbs_nodes;
CREATE POLICY cbs_nodes_write ON cbs_nodes
  FOR ALL USING (has_permission('cecep:cbs:manage'))
  WITH CHECK (has_permission('cecep:cbs:manage'));
