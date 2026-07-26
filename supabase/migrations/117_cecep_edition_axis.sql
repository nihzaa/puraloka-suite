-- Migration 117 — CECEP: Sumbu EDISI AHSP (edition axis)
--
-- ┌─ GERBANG IMMUTABILITY (disebut eksplisit) ─────────────────────────────────┐
-- │ Migrasi ini MENYENTUH gerbang immutability:                                 │
-- │   (a) menambah edition_id + is_import_baseline ke tuple fn_assembly_immutable│
-- │   (b) DROP + ganti constraint identitas assembly (assembly_identity)         │
-- │   (c) menambah edition_id ke tuple fn_estimate_version_immutable             │
-- │ Ketiganya DISETUJUI di keputusan desain edisi (AHSP-EDITION-BUILDER-DESIGN   │
-- │ §103–108). Bukan penafsiran ulang gerbang — gerbang tersentuh, ditutup       │
-- │ approval itu.                                                                │
-- └─────────────────────────────────────────────────────────────────────────────┘
--
-- TIGA SUMBU ORTHOGONAL (jangan dicampur — §3.2):
--   EDISI  = dokumen SE mana (SNI 2013 / SE 68/2024 / SE 47/2026) → ahsp_editions + assemblies.edition_id
--   SUMBER = siapa yang punya (national/company/project/custom)   → assemblies.source (sudah ada)
--   VERSI  = revisi satu analisa (hasil edit)                      → assemblies.version_number (sudah ada)
--
-- Aturan (§3.4/§1.1–1.2): edisi MENAMBAH, tak pernah ganti/hapus. Baseline impor
-- IMMUTABLE (jejak "SE bilang apa"). Edit = versi baru overlay: correction (tetap SE)
-- vs deviation (fork ke company, edition_id tetap sbg provenance). Estimasi MENYATAKAN
-- edisi (permanen). PRICE BOOK TIDAK DISENTUH (§3.6 — harga = wilayah+tanggal, bukan SE).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Registry EDISI + provenance (Lapis 2 reference data)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ahsp_editions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,        -- 'SNI-2013' | 'SE-68-2024' | 'SE-47-2026'
  name          TEXT NOT NULL,
  se_number     TEXT,                         -- 'SE 47/SE/Dk/2026'
  publish_date  DATE,
  source_file   TEXT,                          -- nama file impor (provenance)
  source_sha256 TEXT,                          -- hash file impor (provenance)
  imported_at   TIMESTAMPTZ,
  imported_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ahsp_editions IS
  'Registry EDISI AHSP (dokumen SE otoritatif). Sumbu terpisah dari SUMBER & VERSI. '
  'Provenance immutable begitu direferensikan; edisi MENAMBAH, tak ganti/hapus (§3.4).';

-- Seed 3 edisi acuan (reference data — belum ter-impor isinya; source_sha256 NULL).
INSERT INTO ahsp_editions (code, name, se_number, publish_date) VALUES
  ('SNI-2013',   'SNI AHSP 2013',               NULL,               '2013-01-01'),
  ('SE-68-2024', 'SE Menteri PUPR 68/2024',     'SE 68/SE/M/2024',  '2024-01-01'),
  ('SE-47-2026', 'SE Dirjen Bina Konstruksi 47/2026', 'SE 47/SE/Dk/2026', '2026-01-01')
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. assemblies: edition_id + kolom overlay (baseline/edit/derivasi)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS edition_id               UUID REFERENCES ahsp_editions(id);
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS is_import_baseline       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS edited_from              UUID REFERENCES assemblies(id);
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS edit_type                TEXT
  CHECK (edit_type IS NULL OR edit_type IN ('correction', 'deviation'));
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS edit_reason              TEXT;
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS derived_from_assembly_id UUID REFERENCES assemblies(id);
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS derived_from_edition_id  UUID REFERENCES ahsp_editions(id);
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS created_in_estimate_id   UUID;  -- FK estimate_versions ditambah di §7

-- national WAJIB menyatakan edisi (§3.4). company/project/custom boleh NULL.
DO $$ BEGIN
  -- conrelid regclass = schema-scoped via search_path (anti-pattern kelas-115 dihindari)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'assembly_national_needs_edition'
                   AND conrelid = 'assemblies'::regclass) THEN
    ALTER TABLE assemblies ADD CONSTRAINT assembly_national_needs_edition
      CHECK (source <> 'national' OR edition_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assemblies_edition ON assemblies(edition_id);

COMMENT ON COLUMN assemblies.is_import_baseline IS
  'true = hasil impor mentah (version 1). Kontennya IMMUTABLE (jejak "SE bilang apa"); '
  'edit = versi baru overlay, bukan mutasi. Ditegakkan fn_assembly_baseline_immutable.';
COMMENT ON COLUMN assemblies.edit_type IS
  'correction = perbaikan agar COCOK SE (tetap berlabel SE) · deviation = ubah cara kerja '
  '(fork ke source=company; edition_id tetap sbg provenance INDUK).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Identitas baru: satu `code` hidup di banyak edisi/sumber (§3.4)
--    (menyentuh gerbang — DROP + ganti identitas, disetujui desain edisi)
-- ═══════════════════════════════════════════════════════════════════════════
-- Lama: UNIQUE(code, version_number) — LEBIH KETAT. Baru LEBIH LONGGAR, jadi data
-- lama (yang lulus constraint lama) trivially lulus. NULLS NOT DISTINCT: dua custom
-- (edition NULL) dgn code+source+versi sama tetap ditolak (PG15+).
ALTER TABLE assemblies DROP CONSTRAINT IF EXISTS assembly_identity;
ALTER TABLE assemblies ADD  CONSTRAINT assembly_identity
  UNIQUE NULLS NOT DISTINCT (code, edition_id, source, version_number);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Extend fn_assembly_immutable: edition_id + is_import_baseline masuk tuple
--    (begitu assembly ≠ draft, edisi & status-baseline ikut beku)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_assembly_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF ( NEW.code, NEW.cost_code_id, NEW.source, NEW.reference_standard,
         NEW.version_number, NEW.waste_factor, NEW.sequence, NEW.output_unit_code,
         NEW.edition_id, NEW.is_import_baseline )
       IS DISTINCT FROM
       ( OLD.code, OLD.cost_code_id, OLD.source, OLD.reference_standard,
         OLD.version_number, OLD.waste_factor, OLD.sequence, OLD.output_unit_code,
         OLD.edition_id, OLD.is_import_baseline )
    THEN
      RAISE EXCEPTION
        'Assembly sudah active/superseded (status=%): paket kerja/edisi tak bisa diubah — '
        'Estimate Item yang memakainya tak boleh berubah retroaktif. Buat versi baru.',
        OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;
-- (trigger trg_assembly_immutable dari 107 tetap; fungsinya diperbarui.)

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Baseline impor IMMUTABLE (§1.1): konten baris is_import_baseline TAK PERNAH
--    ditimpa — bahkan saat draft. Edit membuat VERSI BARU (baris lain), bukan mutasi.
--    Status/aktivasi/updated tetap boleh berubah (aktivasi baseline).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_assembly_baseline_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.is_import_baseline THEN
    IF ( NEW.code, NEW.cost_code_id, NEW.source, NEW.reference_standard,
         NEW.version_number, NEW.waste_factor, NEW.sequence, NEW.output_unit_code,
         NEW.edition_id, NEW.is_import_baseline )
       IS DISTINCT FROM
       ( OLD.code, OLD.cost_code_id, OLD.source, OLD.reference_standard,
         OLD.version_number, OLD.waste_factor, OLD.sequence, OLD.output_unit_code,
         OLD.edition_id, OLD.is_import_baseline )
    THEN
      RAISE EXCEPTION
        'Baseline impor (id=%) IMMUTABLE — jejak "SE bilang apa" tak boleh ditimpa. '
        'Edit = buat versi baru (overlay), bukan ubah baseline.', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_assembly_baseline_immutable ON assemblies;
CREATE TRIGGER trg_assembly_baseline_immutable
  BEFORE UPDATE ON assemblies
  FOR EACH ROW EXECUTE FUNCTION fn_assembly_baseline_immutable();
-- Catatan: komponen baseline terkunci via guard aktivasi existing (107 §6) begitu
-- baseline di-activate. Selama draft impor, komponen masih boleh dikoreksi (impor
-- belum final). "Born only from import" utk national = aturan APP-LAYER (endpoint
-- impor vs create biasa) — DB tak bisa membedakan asal panggilan.

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Edisi: provenance immutable + no-delete-if-referenced (§3.4 "menambah, tak ganti")
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_edition_provenance_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF ( NEW.code, NEW.se_number, NEW.publish_date, NEW.source_file, NEW.source_sha256, NEW.imported_at )
     IS DISTINCT FROM
     ( OLD.code, OLD.se_number, OLD.publish_date, OLD.source_file, OLD.source_sha256, OLD.imported_at )
  THEN
    RAISE EXCEPTION
      'Edisi AHSP (code=%): provenance immutable — edisi menambah, tak pernah diganti. '
      'Hanya is_active/name yang boleh berubah.', OLD.code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_edition_provenance_immutable ON ahsp_editions;
CREATE TRIGGER trg_edition_provenance_immutable
  BEFORE UPDATE ON ahsp_editions
  FOR EACH ROW EXECUTE FUNCTION fn_edition_provenance_immutable();

CREATE OR REPLACE FUNCTION fn_edition_no_delete()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM assemblies       WHERE edition_id = OLD.id
                                                OR derived_from_edition_id = OLD.id)
     OR EXISTS (SELECT 1 FROM estimate_versions WHERE edition_id = OLD.id) THEN
    RAISE EXCEPTION
      'Edisi AHSP (code=%) tak boleh dihapus — masih dirujuk assembly/estimasi. '
      'Nonaktifkan (is_active=false), jangan hapus.', OLD.code
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_edition_no_delete ON ahsp_editions;
CREATE TRIGGER trg_edition_no_delete
  BEFORE DELETE ON ahsp_editions
  FOR EACH ROW EXECUTE FUNCTION fn_edition_no_delete();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. estimate_versions.edition_id (permanen — estimasi MENYATAKAN edisi, §3.4)
--    + masuk tuple fn_estimate_version_immutable (menyentuh gerbang, disetujui).
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE estimate_versions ADD COLUMN IF NOT EXISTS edition_id UUID REFERENCES ahsp_editions(id);

-- FK assemblies.created_in_estimate_id → estimate_versions (ditunda dari §2 krn urutan).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'assemblies_created_in_estimate_fk'
                   AND conrelid = 'assemblies'::regclass) THEN
    ALTER TABLE assemblies ADD CONSTRAINT assemblies_created_in_estimate_fk
      FOREIGN KEY (created_in_estimate_id) REFERENCES estimate_versions(id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_estimate_version_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF ( NEW.scenario_id, NEW.version_number, NEW.total_amount, NEW.edition_id )
       IS DISTINCT FROM
       ( OLD.scenario_id, OLD.version_number, OLD.total_amount, OLD.edition_id )
    THEN
      RAISE EXCEPTION
        'Estimate Version sudah keluar dari draft (status=%): total/identitas/edisi beku '
        '— angka yang direview/disetujui tak boleh berubah. Buat versi baru.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

COMMENT ON COLUMN estimate_versions.edition_id IS
  'Edisi AHSP yang dipakai estimasi ini (permanen begitu ≠ draft). Estimasi lama tak '
  'pernah berubah saat edisi baru terbit — pindah edisi hanya untuk draft + wajib approve.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Capability (ADR-004) + RLS untuk ahsp_editions
--    Impor/kelola edisi = capability domain tersendiri (beda dari kelola assembly).
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:edition:view',   'cecep', 'Lihat Edisi AHSP',
   'Melihat registry edisi AHSP (SNI/SE) + provenance', 18),
  ('cecep:edition:manage', 'cecep', 'Kelola Edisi AHSP',
   'Mengimpor edisi AHSP baru + mengaktifkan/menonaktifkan', 19)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:edition:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:edition:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

ALTER TABLE ahsp_editions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ahsp_editions_read ON ahsp_editions;
CREATE POLICY ahsp_editions_read ON ahsp_editions
  FOR SELECT USING (has_permission('cecep:edition:view'));
DROP POLICY IF EXISTS ahsp_editions_write ON ahsp_editions;
CREATE POLICY ahsp_editions_write ON ahsp_editions
  FOR ALL USING (has_permission('cecep:edition:manage'))
  WITH CHECK (has_permission('cecep:edition:manage'));
