-- Migration 113 — CECEP Milestone 4: Lessons Learned STRUKTUR (Program C)
--   ⚠️ STRUKTUR SAJA — write-back (propagasi ke Assembly/Price Book/Productivity)
--   SENGAJA TIDAK di-wire di sini. Itu titik STOP+lapor (perintah founder).
--
-- Aggregate Root: Lessons Learned Record (`44` §13, `03b` §A.12). Variance = Value
-- Object (embedded), Root Cause Analysis = child Entity (revisable).
--
-- Business Responsibility (`44` §13): "Pengalaman proyek harus mengubah Company
-- AHSP/Price Book/Productivity begitu disetujui — kalau lessons learned cuma laporan
-- terpisah, Company AHSP tetap nol selamanya."
--
-- ── KENAPA WRITE-BACK TIDAK DI SINI (verbatim founder, `03b` §A.12) ─────────
-- "'Propagated' menyentuh TIGA Aggregate Root sekaligus — satu-satunya domain
-- dengan write access lintas-boundary. TIDAK BOLEH menulis langsung tanpa melalui
-- Approval Workflow. 'AI tidak boleh langsung belajar. Harus ada approval.'"
-- Maka: lifecycle draft→under_review→approved DIBANGUN (struktur + guard), tapi
-- transisi approved→propagated + mekanisme write-back-nya DITUNDA sampai desainnya
-- dipaparkan & disetujui. Migration ini nol trigger yang menyentuh domain M1-M2.
--
-- Exclude (ADR-009): company_id (Phase 7).

-- ─── 1. Lessons Learned Record (Aggregate Root) ─────────────────────────────

CREATE TABLE IF NOT EXISTS lessons_learned_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dimiliki proses Project Closeout (`03b` §A.12), bukan Estimate langsung.
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Estimate Version (approved) yang dibandingkan terhadap Actual Cost. Nullable:
  -- lesson bisa umum. RESTRICT bawaan — estimate yang jadi basis lesson tak boleh
  -- lenyap (dan estimate_versions non-draft memang tak bisa dihapus, migration 110).
  estimate_version_id UUID REFERENCES estimate_versions(id),
  -- Pekerjaan yang jadi fokus lesson (opsional).
  cost_code_id        UUID REFERENCES cost_codes(id),

  title               TEXT NOT NULL,
  summary             TEXT,

  -- Variance = Value Object (embedded). planned vs actual; delta DIHITUNG DB
  -- (GENERATED) supaya angka variance tak pernah bohong terhadap komponennya.
  planned_amount      NUMERIC(18, 2) NOT NULL DEFAULT 0,
  actual_amount       NUMERIC(18, 2) NOT NULL DEFAULT 0,
  variance_amount     NUMERIC(18, 2) GENERATED ALWAYS AS (actual_amount - planned_amount) STORED,

  -- Lifecycle `03b` §A.12: Draft → Under Review → Approved → Propagated.
  -- 'propagated' DIDEKLARASIKAN sebagai nilai, TAPI transisi approved→propagated
  -- BELUM diizinkan (guard #4) — itu write-back, menunggu desain disetujui.
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'under_review', 'approved', 'propagated')),
  approved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  propagated_at       TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lessons_project   ON lessons_learned_records(project_id);
CREATE INDEX IF NOT EXISTS idx_lessons_status    ON lessons_learned_records(status);
CREATE INDEX IF NOT EXISTS idx_lessons_cost_code ON lessons_learned_records(cost_code_id);

COMMENT ON TABLE lessons_learned_records IS
  'CECEP Lessons Learned (Company Intelligence Loop). STRUKTUR saja — write-back '
  'propagasi ke Assembly/Price Book/Productivity SENGAJA belum di-wire (harus lewat '
  'approval, verbatim founder: "AI tidak boleh langsung belajar"). ADR-009.';

-- ─── 2. Root Cause Analysis (child Entity, revisable) ───────────────────────

CREATE TABLE IF NOT EXISTS root_cause_analyses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID NOT NULL REFERENCES lessons_learned_records(id) ON DELETE CASCADE,

  description TEXT NOT NULL,
  category    TEXT,                            -- mis. 'estimasi'/'pelaksanaan'/'harga'/'produktivitas' (label)

  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_root_cause_lesson ON root_cause_analyses(lesson_id);

-- ─── 3. HARD GUARD: transisi lifecycle (BELUM termasuk write-back) ──────────
--
-- Diizinkan: draft→under_review→approved. approved→propagated DITOLAK di sini —
-- itu jalur write-back yang menunggu desain disetujui (STOP point). Ditolaknya
-- eksplisit supaya tak ada yang "menandai propagated" tanpa propagasi nyata.

CREATE OR REPLACE FUNCTION fn_lessons_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.status = 'draft'        AND NEW.status = 'under_review')
    OR (OLD.status = 'under_review' AND NEW.status = 'approved')
    OR (OLD.status = 'under_review' AND NEW.status = 'draft')   -- reject balik ke draft
  ) THEN
    IF NEW.status = 'propagated' THEN
      RAISE EXCEPTION
        'Transisi ke propagated (write-back ke knowledge base) BELUM diaktifkan — '
        'mekanisme propagasi via approval belum di-wire (butuh keputusan founder). '
        'code=%', NEW.title
        USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION
      'Transisi status Lessons Learned tidak sah: % → %. Alur sah (sejauh ini): '
      'draft→under_review→approved, under_review→draft.', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
  IF NEW.status = 'draft' THEN NEW.approved_by := NULL; NEW.approved_at := NULL; END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_lessons_status_transition ON lessons_learned_records;
CREATE TRIGGER trg_lessons_status_transition
  BEFORE UPDATE OF status ON lessons_learned_records
  FOR EACH ROW EXECUTE FUNCTION fn_lessons_status_transition();

-- ─── 4. HARD GUARD: variance/isi immutable begitu ≠ draft ───────────────────

CREATE OR REPLACE FUNCTION fn_lessons_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF ( NEW.planned_amount, NEW.actual_amount, NEW.estimate_version_id, NEW.cost_code_id )
       IS DISTINCT FROM
       ( OLD.planned_amount, OLD.actual_amount, OLD.estimate_version_id, OLD.cost_code_id )
    THEN
      RAISE EXCEPTION
        'Lessons Learned sudah keluar dari draft (status=%): variance & basisnya beku '
        '— yang direview/disetujui tak boleh berubah.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_lessons_immutable ON lessons_learned_records;
CREATE TRIGGER trg_lessons_immutable
  BEFORE UPDATE ON lessons_learned_records
  FOR EACH ROW EXECUTE FUNCTION fn_lessons_immutable();

-- ─── 5. HARD GUARD: root cause hanya diubah saat lesson draft ───────────────

CREATE OR REPLACE FUNCTION fn_root_cause_parent_draft()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_status TEXT; v_lid UUID;
BEGIN
  v_lid := COALESCE(NEW.lesson_id, OLD.lesson_id);
  SELECT status INTO v_status FROM lessons_learned_records WHERE id = v_lid;
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION
      'Root Cause hanya bisa diubah saat Lessons Learned berstatus draft (kini %).', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_root_cause_parent_draft ON root_cause_analyses;
CREATE TRIGGER trg_root_cause_parent_draft
  BEFORE INSERT OR UPDATE OR DELETE ON root_cause_analyses
  FOR EACH ROW EXECUTE FUNCTION fn_root_cause_parent_draft();

-- ─── 6. HARD GUARD: lesson non-draft tidak boleh dihapus ────────────────────

CREATE OR REPLACE FUNCTION fn_lessons_no_delete()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION
      'Lessons Learned berstatus % tidak boleh dihapus — jadi rekam jejak intelijen '
      'biaya perusahaan.', OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_lessons_no_delete ON lessons_learned_records;
CREATE TRIGGER trg_lessons_no_delete
  BEFORE DELETE ON lessons_learned_records
  FOR EACH ROW EXECUTE FUNCTION fn_lessons_no_delete();

-- updated_at otomatis.
CREATE OR REPLACE FUNCTION fn_lessons_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END $function$;

DROP TRIGGER IF EXISTS trg_lessons_touch ON lessons_learned_records;
CREATE TRIGGER trg_lessons_touch BEFORE UPDATE ON lessons_learned_records
  FOR EACH ROW EXECUTE FUNCTION fn_lessons_touch_updated_at();

-- ─── 7. Capability (ADR-004) ────────────────────────────────────────────────
-- view + manage (menyusun draft). Capability approve & propagate akan ditentukan
-- saat desain write-back disetujui — TIDAK di-hardcode sekarang.

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:lessons:view',   'cecep', 'Lihat Lessons Learned',
   'Melihat lessons learned & variance analysis proyek', 31),
  ('cecep:lessons:manage', 'cecep', 'Kelola Lessons Learned',
   'Menyusun lessons learned (draft) & root cause analysis', 32)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:lessons:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:lessons:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 8. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE lessons_learned_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE root_cause_analyses     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lessons_read ON lessons_learned_records;
CREATE POLICY lessons_read ON lessons_learned_records FOR SELECT USING (has_permission('cecep:lessons:view'));
DROP POLICY IF EXISTS lessons_write ON lessons_learned_records;
CREATE POLICY lessons_write ON lessons_learned_records FOR ALL
  USING (has_permission('cecep:lessons:manage')) WITH CHECK (has_permission('cecep:lessons:manage'));

DROP POLICY IF EXISTS root_cause_read ON root_cause_analyses;
CREATE POLICY root_cause_read ON root_cause_analyses FOR SELECT USING (has_permission('cecep:lessons:view'));
DROP POLICY IF EXISTS root_cause_write ON root_cause_analyses;
CREATE POLICY root_cause_write ON root_cause_analyses FOR ALL
  USING (has_permission('cecep:lessons:manage')) WITH CHECK (has_permission('cecep:lessons:manage'));
