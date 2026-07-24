-- Migration 106 — CECEP Milestone 2: Formula Engine / Formula Definition (Program C)
--
-- Aggregate Root: Formula Definition (`Formula + Version + Variable + Parameter +
-- Expression`) — `44` §7, `03b` §A.7, `02` §8. Formula Engine SENDIRI adalah Domain
-- Service (perilaku murni, dipanggil lintas domain, tanpa state) — itu lapisan
-- APLIKASI, bukan tabel. Migration ini hanya mem-persist Formula Definition-nya.
--
-- Business Responsibility (`44` §7): "Cara menghitung harus jadi DATA yang bisa
-- diedit user tanpa deploy kode baru — kalau formula tertanam di Assembly, setiap
-- standar AHSP baru butuh perubahan struktur Assembly, bukan sekadar entri baru."
--
-- Generik: `03b` §A.7 "Formula Definition tidak bergantung domain manapun" —
-- dipanggil Assembly & Unit Conversion. Karena itu ia dibangun SEBELUM Assembly
-- (Assembly mengonsumsinya, `37 §2`: input Assembly = Reference Library/RBS/Formula).
--
-- ── Variable & Parameter = bagian internal Formula (JSONB, bukan tabel anak) ──
-- `03b` §A.7: Formula Definition adalah Entity; Variable/Parameter adalah bagian
-- KOMPOSISI-nya, bukan entity dengan identitas mandiri. Maka disimpan sebagai
-- JSONB list, bukan FK/tabel terpisah (tidak meng-over-strukturkan yang tak
-- diminta sumber). Bentuk tiap elemen (name/type/default) adalah urusan Domain
-- Service saat evaluasi — di sini cukup menyimpan daftarnya.
--
-- ── Calculation Strategy Contract SENGAJA bukan di sini ─────────────────────
-- `42` §1: Strategy Contract adalah "struktur, BUKAN Aggregate Root baru", dan
-- `42` §2 menaruhnya "dicatat sebagai bagian Estimate Item" (Milestone 3). Ia
-- merujuk formula_reference → Formula Engine, jadi butuh tabel ini lebih dulu,
-- tapi tabel Strategy-nya sendiri baru relevan di Milestone 3.
--
-- ── Yang SENGAJA tidak ada (Open — ADR-009) ─────────────────────────────────
--   company_id → Phase 7. (unit tidak relevan di sini — formula murni logika.)

-- ─── 1. TABLE ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS formula_definitions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  code           TEXT NOT NULL,               -- identitas formula (stabil lintas versi)
  name           TEXT NOT NULL,
  description    TEXT,
  version_number INT NOT NULL DEFAULT 1 CHECK (version_number >= 1),

  -- Ekspresi kalkulasi (dievaluasi Domain Service, bukan di DB).
  expression     TEXT NOT NULL,
  -- Variable = input yang di-bind saat pemanggilan; Parameter = konstanta yang
  -- bisa dikonfigurasi. Keduanya bagian definisi (composition), disimpan sebagai
  -- daftar JSONB — default array kosong, bukan null (memudahkan konsumsi).
  variables      JSONB NOT NULL DEFAULT '[]'::jsonb,
  parameters     JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Lifecycle `03b` §A.7: Draft → Tested → Active → Superseded.
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'tested', 'active', 'superseded')),

  -- Cap waktu event lifecycle (FormulaActivated dst).
  tested_at      TIMESTAMPTZ,
  activated_at   TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT formula_variables_is_array  CHECK (jsonb_typeof(variables) = 'array'),
  CONSTRAINT formula_parameters_is_array CHECK (jsonb_typeof(parameters) = 'array'),
  -- Identitas ter-versi: satu versi per code.
  CONSTRAINT formula_identity UNIQUE (code, version_number)
);

CREATE INDEX IF NOT EXISTS idx_formula_status ON formula_definitions(status);
CREATE INDEX IF NOT EXISTS idx_formula_code   ON formula_definitions(code);

COMMENT ON TABLE formula_definitions IS
  'CECEP Formula Engine — Formula Definition (Formula+Version+Variable+Parameter+'
  'Expression). Immutable begitu ≠ draft; formula baru = versi baru (ADR-009). '
  'Evaluator = Domain Service di lapisan aplikasi, bukan di DB.';

-- ─── 2. HARD GUARD: immutable begitu keluar dari draft ──────────────────────
--
-- Formula yang sudah di-Test/Active dipakai menghitung Estimate Item; mengubah
-- ekspresi/variabelnya = mengubah angka estimate lama secara retroaktif. Sama
-- prinsip dengan Price Book: perbaikan = versi baru, bukan edit di tempat.
-- `44` §7 "diedit user tanpa deploy" berlaku untuk formula DRAFT dan pembuatan
-- versi baru — bukan mengizinkan mutasi formula yang sudah terpakai.

CREATE OR REPLACE FUNCTION fn_formula_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF ( NEW.code, NEW.version_number, NEW.expression, NEW.variables, NEW.parameters )
       IS DISTINCT FROM
       ( OLD.code, OLD.version_number, OLD.expression, OLD.variables, OLD.parameters )
    THEN
      RAISE EXCEPTION
        'Formula Definition sudah keluar dari draft (status=%): ekspresi/variabel '
        'tak bisa diubah — Estimate Item yang memakainya tak boleh berubah '
        'retroaktif. Buat versi baru.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_formula_immutable ON formula_definitions;
CREATE TRIGGER trg_formula_immutable
  BEFORE UPDATE ON formula_definitions
  FOR EACH ROW EXECUTE FUNCTION fn_formula_immutable();

-- ─── 3. HARD GUARD: transisi lifecycle maju saja ────────────────────────────
--   draft → tested → active → superseded.

CREATE OR REPLACE FUNCTION fn_formula_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'tested' AND NEW.status = 'active')
    OR (OLD.status = 'draft'  AND NEW.status = 'tested')
    OR (OLD.status = 'active' AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION
      'Transisi status Formula tidak sah: % → %. Alur sah: '
      'draft→tested→active→superseded (maju saja).', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'tested' AND NEW.tested_at    IS NULL THEN NEW.tested_at    := now(); END IF;
  IF NEW.status = 'active' AND NEW.activated_at IS NULL THEN NEW.activated_at := now(); END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_formula_status_transition ON formula_definitions;
CREATE TRIGGER trg_formula_status_transition
  BEFORE UPDATE OF status ON formula_definitions
  FOR EACH ROW EXECUTE FUNCTION fn_formula_status_transition();

-- ─── 4. HARD GUARD: formula non-draft tidak boleh dihapus ───────────────────

CREATE OR REPLACE FUNCTION fn_formula_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION
      'Formula Definition berstatus % tidak boleh dihapus — Estimate Item/Assembly '
      'mungkin merujuknya. Supersede, jangan hapus. (Hanya draft yang boleh dibuang.)',
      OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_formula_no_delete ON formula_definitions;
CREATE TRIGGER trg_formula_no_delete
  BEFORE DELETE ON formula_definitions
  FOR EACH ROW EXECUTE FUNCTION fn_formula_no_delete();

-- updated_at otomatis.
CREATE OR REPLACE FUNCTION fn_formula_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END $function$;

DROP TRIGGER IF EXISTS trg_formula_touch ON formula_definitions;
CREATE TRIGGER trg_formula_touch
  BEFORE UPDATE ON formula_definitions
  FOR EACH ROW EXECUTE FUNCTION fn_formula_touch_updated_at();

-- ─── 5. Capability (ADR-004) ────────────────────────────────────────────────
-- `03b` §A.7 Ownership: "fungsi Cost Engineering/System Configuration — dibuat/
-- diedit user tanpa coding".

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:formula:view',   'cecep', 'Lihat Formula',
   'Melihat Formula Definition (cara kalkulasi ter-versi)', 18),
  ('cecep:formula:manage', 'cecep', 'Kelola Formula',
   'Membuat, menguji, mengaktifkan, dan men-supersede Formula Definition', 19)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:formula:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:formula:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 6. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE formula_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS formula_read ON formula_definitions;
CREATE POLICY formula_read ON formula_definitions
  FOR SELECT USING (has_permission('cecep:formula:view'));

DROP POLICY IF EXISTS formula_write ON formula_definitions;
CREATE POLICY formula_write ON formula_definitions
  FOR ALL USING (has_permission('cecep:formula:manage'))
  WITH CHECK (has_permission('cecep:formula:manage'));
