-- Migration 115 — CECEP: Fondasi UNIT (Program C, prasyarat seed AHSP)
--
-- Keputusan founder: EXTEND tabel `units` yang SUDAH ADA (migration 090) — SATU
-- vocabulary, bukan yang kedua. Kode existing (m/buah/batang, dst) DIPERTAHANKAN
-- karena mandor menyimpannya sebagai nilai (090: "code = konvensi nilai mandor") —
-- rename akan merusak data mandor. Yang ditambah: satuan tenaga AHSP yang hilang
-- (OH, jam) + kolom `dimension`.
--
-- Model unit (keputusan founder, TIDAK ditawar):
--   · unit = bagian IDENTITAS resource & output assembly, immutable begitu
--     direferensikan → ganti unit = entitas baru, bukan update. Ditegakkan guard.
--   · TANPA faktor konversi, TANPA engine konversi (Zero-Invention, ADR-006).
--   · koefisien assembly_components tetap angka polos — maknanya diturunkan:
--     coefficient resource.unit per 1 assembly.output_unit. Unit TIDAK disimpan di
--     baris komponen (itu sumber drift).
--   · price_book: harga selalu per resource.unit — TANPA kolom unit di sana.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXTEND units: kolom `dimension` + satuan tenaga AHSP (OH, jam)
-- ═══════════════════════════════════════════════════════════════════════════

-- dimension = klasifikasi fisik (beda dari `category` yang pengelompokan UI 090).
-- Ditambah nullable dulu → backfill → NOT NULL, supaya aman di schema populated (dev)
-- maupun kosong (test).
ALTER TABLE units ADD COLUMN IF NOT EXISTS dimension TEXT;

-- Backfill dimension dari category existing (per-kode di titik yang ambigu):
--   area→area, length→length, volume→volume, weight→MASS, count→count, time→time.
--   category 'set' pecah: 'ls'→lumpsum, 'set'→count.
UPDATE units SET dimension = CASE
  WHEN code = 'ls'                THEN 'lumpsum'
  WHEN category = 'area'          THEN 'area'
  WHEN category = 'length'        THEN 'length'
  WHEN category = 'volume'        THEN 'volume'
  WHEN category = 'weight'        THEN 'mass'
  WHEN category = 'count'         THEN 'count'
  WHEN category = 'set'           THEN 'count'
  WHEN category = 'time'          THEN 'time'
  ELSE 'count'
END
WHERE dimension IS NULL;

-- Satuan tenaga/alat AHSP yang HILANG di 090 (m1≈m_linear, bh=buah, btg=batang,
-- sak/ls/ton/kg sudah ada — hanya OH & jam yang genuinely tak ada).
INSERT INTO units (code, symbol, label, category, sort_order, dimension) VALUES
  ('OH',  'OH',  'Orang-hari', 'time', 165, 'labor_day'),
  ('jam', 'jam', 'Jam',        'time', 175, 'time')
ON CONFLICT (code) DO NOTHING;

-- Sekarang seluruh baris punya dimension → kunci NOT NULL + himpunan sah.
ALTER TABLE units ALTER COLUMN dimension SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'units_dimension_valid') THEN
    ALTER TABLE units ADD CONSTRAINT units_dimension_valid CHECK (
      dimension IN ('length','area','volume','mass','count','time','lumpsum','labor_day'));
  END IF;
END $$;

COMMENT ON COLUMN units.dimension IS
  'Dimensi fisik satuan (CECEP): length/area/volume/mass/count/time/lumpsum/labor_day. '
  'Beda dari `category` (pengelompokan UI 090). Dipakai validasi impor AHSP.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. resources.unit_code — FK NOT NULL, immutable begitu direferensikan
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE resources ADD COLUMN IF NOT EXISTS unit_code TEXT REFERENCES units(code);
-- Backfill baris existing (smoke) dengan 'unit' agar bisa NOT NULL. Baris smoke ini
-- akan dibersihkan terpisah; nilainya tak bermakna.
UPDATE resources SET unit_code = 'unit' WHERE unit_code IS NULL;
ALTER TABLE resources ALTER COLUMN unit_code SET NOT NULL;

-- Guard: unit adalah IDENTITAS. Begitu resource DIREFERENSIKAN koefisien assembly
-- ATAU entry harga, unit_code-nya BEKU — ganti unit = resource baru (founder).
CREATE OR REPLACE FUNCTION fn_resources_unit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.unit_code IS DISTINCT FROM OLD.unit_code THEN
    IF EXISTS (SELECT 1 FROM assembly_components WHERE resource_id = OLD.id)
       OR EXISTS (SELECT 1 FROM price_book_entries WHERE resource_id = OLD.id) THEN
      RAISE EXCEPTION
        'Satuan resource (id=%, code=%) tak bisa diubah — sudah dirujuk koefisien '
        'assembly atau harga. Satuan = identitas; buat resource baru untuk satuan lain.',
        OLD.id, OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_resources_unit_immutable ON resources;
CREATE TRIGGER trg_resources_unit_immutable
  BEFORE UPDATE OF unit_code ON resources
  FOR EACH ROW EXECUTE FUNCTION fn_resources_unit_immutable();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. assemblies.output_unit_code — FK NOT NULL, immutable per versi
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS output_unit_code TEXT REFERENCES units(code);
UPDATE assemblies SET output_unit_code = 'm2' WHERE output_unit_code IS NULL;  -- backfill smoke
ALTER TABLE assemblies ALTER COLUMN output_unit_code SET NOT NULL;

-- Tambahkan output_unit_code ke guard immutability assembly existing (migration 107):
-- begitu assembly ≠ draft, output_unit ikut beku (bagian paket yang tak berubah
-- retroaktif). Revisi = versi baru.
CREATE OR REPLACE FUNCTION fn_assembly_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF ( NEW.code, NEW.cost_code_id, NEW.source, NEW.reference_standard,
         NEW.version_number, NEW.waste_factor, NEW.sequence, NEW.output_unit_code )
       IS DISTINCT FROM
       ( OLD.code, OLD.cost_code_id, OLD.source, OLD.reference_standard,
         OLD.version_number, OLD.waste_factor, OLD.sequence, OLD.output_unit_code )
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
-- (trigger trg_assembly_immutable dari 107 tetap; hanya fungsinya diperbarui.)

COMMENT ON COLUMN assemblies.output_unit_code IS
  'Satuan keluaran assembly (mis. m2 pembesian). Koefisien komponen = qty resource.unit '
  'per 1 output_unit ini. Immutable per versi (ADR-009).';
