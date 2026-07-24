-- Migration 107 — CECEP Milestone 2: Assembly / AHSP (Program C) — domain TERAKHIR M2
--
-- Aggregate Root: Assembly (`44` §4, `03b` §A.4) — "memiliki penuh sequence,
-- resource requirement, waste factor-nya sendiri. Resource/Productivity/Formula
-- yang dirujuk adalah referensi ke domain lain, BUKAN bagian Aggregate."
--
-- Business Responsibility (`44` §4): "Sequence kerja, resource requirement, dan
-- waste factor satu metode kerja harus berubah BERSAMA sebagai satu paket."
--
-- Dibangun TERAKHIR di Milestone 2 karena mengonsumsi domain lain (`37 §2`: input
-- Assembly = Reference Library/RBS/Formula). RBS (103) & Formula (106) sudah ada.
--
-- ── Struktur: parent + child (resource requirement lines) ───────────────────
--   assemblies            → Aggregate Root (Entity)
--   assembly_components    → resource requirement per baris (FK ke RBS + koefisien).
--     Ini yang memegang koefisien AHSP ("0,7 OH Tukang Besi per m²"). Child dari
--     aggregate → mutasi hanya saat parent draft (trigger #4).
--   sequence               → Value Object (`03b` §A.4: "Sequence step adalah Value
--     Object, tidak punya identitas sendiri") → JSONB ordered list di parent,
--     bukan tabel (konsisten cara variables/parameters di Formula).
--
-- ── 4 sumber AHSP (`42`, `01` §1) ───────────────────────────────────────────
--   source ∈ national/company/project/custom — "satu sistem tunggal, empat sumber
--   DI DALAMNYA" (`35` #2). BUKAN empat tabel. Company lahir dari edit atas
--   bootstrap national. `reference_standard` (Bina Marga/Cipta Karya) = label,
--   relevan terutama utk national.
--
-- ── Yang SENGAJA tidak ada (Open — ADR-009) ─────────────────────────────────
--   unit        → koefisien komponen ("0,7 OH") bermakna "qty resource per satuan
--                 kerja"; satuan resource & cost_code masih ditunda (migration 103).
--                 Koefisien disimpan NUMERIC tanpa satuan.
--   formula_id  → `42` §1 menaruh formula_reference di STRATEGY CONTRACT (bagian
--                 Estimate Item, Milestone 3), BUKAN di Assembly. Formula Engine
--                 "dipanggil" saat kalkulasi (Domain Service), bukan dimiliki
--                 Assembly (`03b` §A.4). Menariknya ke sini = mendahului M3.
--   company_id  → Phase 7.

-- ─── 1. PARENT: assemblies ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assemblies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  code               TEXT NOT NULL,
  name               TEXT NOT NULL,
  description        TEXT,

  -- Assembly = "cara mengerjakan [cost_code]" (`03b` §A.4 Context Mapping:
  -- Assembly → referensi → Cost Code). Merujuk, tak menyalin.
  cost_code_id       UUID NOT NULL REFERENCES cost_codes(id),

  -- 4 sumber AHSP (satu sistem, empat sumber di dalamnya).
  source             TEXT NOT NULL DEFAULT 'company'
                     CHECK (source IN ('national', 'company', 'project', 'custom')),
  reference_standard TEXT,                     -- mis. 'Bina Marga' (label, utamanya national)

  version_number     INT NOT NULL DEFAULT 1 CHECK (version_number >= 1),

  -- Waste factor: bagian paket (`44` §4). 0 = tanpa waste; < 1 (mis. 0.05 = 5%).
  waste_factor       NUMERIC(6, 4) NOT NULL DEFAULT 0 CHECK (waste_factor >= 0),

  -- Sequence step = Value Object (ordered list, tanpa identitas mandiri).
  sequence           JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Lifecycle: bootstrap & draft-company keduanya 'draft' (dibedakan source);
  -- 'revised' = versi baru (record baru), bukan status. → draft→active→superseded.
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'active', 'superseded')),
  activated_at       TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT assembly_sequence_is_array CHECK (jsonb_typeof(sequence) = 'array'),
  CONSTRAINT assembly_identity UNIQUE (code, version_number)
);

CREATE INDEX IF NOT EXISTS idx_assemblies_cost_code ON assemblies(cost_code_id);
CREATE INDEX IF NOT EXISTS idx_assemblies_status    ON assemblies(status);

COMMENT ON TABLE assemblies IS
  'CECEP Assembly/AHSP — metode kerja (sequence+resource requirement+waste) untuk '
  'satu Cost Code. 4 sumber (national/company/project/custom) dalam satu tabel. '
  'Immutable begitu active; revisi = versi baru (ADR-009).';

-- ─── 2. CHILD: assembly_components (resource requirement lines) ──────────────

CREATE TABLE IF NOT EXISTS assembly_components (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id  UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,

  -- Merujuk RBS (No Data Duplication). Assembly TIDAK memiliki Resource.
  resource_id  UUID NOT NULL REFERENCES resources(id),

  -- Koefisien AHSP: qty resource per satuan kerja (mis. 0,7 OH). > 0.
  coefficient  NUMERIC(14, 6) NOT NULL CHECK (coefficient > 0),

  sort_order   INT NOT NULL DEFAULT 0,
  notes        TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Satu resource tak boleh muncul dua kali dalam satu assembly (baris ganda =
  -- ambiguitas koefisien).
  CONSTRAINT assembly_component_unik UNIQUE (assembly_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_assembly_components_assembly ON assembly_components(assembly_id);
CREATE INDEX IF NOT EXISTS idx_assembly_components_resource ON assembly_components(resource_id);

-- ─── 3. HARD GUARD (parent): immutable begitu ≠ draft ───────────────────────
--
-- Assembly active dipakai Estimate Item; mengubah paket-nya = mengubah estimate
-- lama retroaktif. Revisi = versi baru (`44` §4 "Revised v1.1, v1.2").

CREATE OR REPLACE FUNCTION fn_assembly_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF ( NEW.code, NEW.cost_code_id, NEW.source, NEW.reference_standard,
         NEW.version_number, NEW.waste_factor, NEW.sequence )
       IS DISTINCT FROM
       ( OLD.code, OLD.cost_code_id, OLD.source, OLD.reference_standard,
         OLD.version_number, OLD.waste_factor, OLD.sequence )
    THEN
      RAISE EXCEPTION
        'Assembly sudah active/superseded (status=%): paket kerja tak bisa diubah — '
        'Estimate Item yang memakainya tak boleh berubah retroaktif. Buat versi baru.',
        OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_assembly_immutable ON assemblies;
CREATE TRIGGER trg_assembly_immutable
  BEFORE UPDATE ON assemblies
  FOR EACH ROW EXECUTE FUNCTION fn_assembly_immutable();

-- ─── 4. HARD GUARD (parent): transisi lifecycle maju saja ───────────────────

CREATE OR REPLACE FUNCTION fn_assembly_status_transition()
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
      'Transisi status Assembly tidak sah: % → %. Alur sah: '
      'draft→active→superseded (maju saja).', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'active' AND NEW.activated_at IS NULL THEN NEW.activated_at := now(); END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_assembly_status_transition ON assemblies;
CREATE TRIGGER trg_assembly_status_transition
  BEFORE UPDATE OF status ON assemblies
  FOR EACH ROW EXECUTE FUNCTION fn_assembly_status_transition();

-- ─── 5. HARD GUARD (parent): non-draft tidak boleh dihapus ──────────────────

CREATE OR REPLACE FUNCTION fn_assembly_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION
      'Assembly berstatus % tidak boleh dihapus — Estimate Item mungkin merujuknya. '
      'Supersede, jangan hapus. (Hanya draft yang boleh dibuang.)', OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_assembly_no_delete ON assemblies;
CREATE TRIGGER trg_assembly_no_delete
  BEFORE DELETE ON assemblies
  FOR EACH ROW EXECUTE FUNCTION fn_assembly_no_delete();

-- ─── 6. HARD GUARD (child): komponen hanya bisa diubah saat parent draft ────
--
-- Komponen adalah bagian aggregate; begitu Assembly active, seluruh paket (termasuk
-- resource requirement) beku. Menjaga konsistensi "berubah BERSAMA sebagai satu
-- paket" (`44` §4). Berlaku untuk INSERT/UPDATE/DELETE komponen.

CREATE OR REPLACE FUNCTION fn_assembly_component_parent_draft()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
  v_aid    UUID;
BEGIN
  v_aid := COALESCE(NEW.assembly_id, OLD.assembly_id);
  SELECT status INTO v_status FROM assemblies WHERE id = v_aid;

  -- Bila parent-nya ikut terhapus (CASCADE), v_status NULL → izinkan (bukan edit
  -- manual, melainkan pembersihan mengikuti parent draft yang sah dihapus).
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION
      'Komponen Assembly hanya bisa diubah saat Assembly berstatus draft (kini %). '
      'Paket kerja yang sudah active beku — buat versi Assembly baru.', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_assembly_component_guard ON assembly_components;
CREATE TRIGGER trg_assembly_component_guard
  BEFORE INSERT OR UPDATE OR DELETE ON assembly_components
  FOR EACH ROW EXECUTE FUNCTION fn_assembly_component_parent_draft();

-- updated_at otomatis (parent).
CREATE OR REPLACE FUNCTION fn_assembly_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END $function$;

DROP TRIGGER IF EXISTS trg_assembly_touch ON assemblies;
CREATE TRIGGER trg_assembly_touch
  BEFORE UPDATE ON assemblies
  FOR EACH ROW EXECUTE FUNCTION fn_assembly_touch_updated_at();

-- ─── 7. Capability (ADR-004) ────────────────────────────────────────────────

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:assembly:view',   'cecep', 'Lihat Assembly',
   'Melihat Assembly/AHSP (metode kerja + resource requirement)', 20),
  ('cecep:assembly:manage', 'cecep', 'Kelola Assembly',
   'Membuat, mengedit, mengaktifkan, dan men-supersede Assembly/AHSP', 21)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:assembly:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:assembly:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 8. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE assemblies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assemblies_read ON assemblies;
CREATE POLICY assemblies_read ON assemblies
  FOR SELECT USING (has_permission('cecep:assembly:view'));
DROP POLICY IF EXISTS assemblies_write ON assemblies;
CREATE POLICY assemblies_write ON assemblies
  FOR ALL USING (has_permission('cecep:assembly:manage'))
  WITH CHECK (has_permission('cecep:assembly:manage'));

DROP POLICY IF EXISTS assembly_components_read ON assembly_components;
CREATE POLICY assembly_components_read ON assembly_components
  FOR SELECT USING (has_permission('cecep:assembly:view'));
DROP POLICY IF EXISTS assembly_components_write ON assembly_components;
CREATE POLICY assembly_components_write ON assembly_components
  FOR ALL USING (has_permission('cecep:assembly:manage'))
  WITH CHECK (has_permission('cecep:assembly:manage'));
