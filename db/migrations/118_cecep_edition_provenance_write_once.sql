-- Migration 118 — CECEP: provenance edisi = WRITE-ONCE (koreksi guard 117)
--
-- ┌─ GERBANG IMMUTABILITY (disebut eksplisit) ────────────────────────────────┐
-- │ Mengubah fn_edition_provenance_immutable (guard ahsp_editions).            │
-- │ Ditutup intent desain edisi yang sudah disetujui: "tiap edisi bawa         │
-- │ provenance impor" (impor HARUS bisa mengisi provenance — 117 memblokir     │
-- │ NULL→nilai, itu bug thd desain) + "edisi menambah, tak pernah mengganti"   │
-- │ (nilai TERISI tetap beku — dipertahankan). Semantik: WRITE-ONCE per field. │
-- └────────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION fn_edition_provenance_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  -- code & publish_date: identitas — beku total.
  IF (NEW.code, NEW.publish_date) IS DISTINCT FROM (OLD.code, OLD.publish_date) THEN
    RAISE EXCEPTION
      'Edisi AHSP (code=%): identitas (code/publish_date) immutable.', OLD.code
      USING ERRCODE = 'check_violation';
  END IF;
  -- provenance impor: WRITE-ONCE — boleh diisi saat masih NULL (impor pertama),
  -- tak pernah boleh DIUBAH/DIKOSONGKAN setelah terisi.
  IF (OLD.se_number     IS NOT NULL AND NEW.se_number     IS DISTINCT FROM OLD.se_number)
  OR (OLD.source_file   IS NOT NULL AND NEW.source_file   IS DISTINCT FROM OLD.source_file)
  OR (OLD.source_sha256 IS NOT NULL AND NEW.source_sha256 IS DISTINCT FROM OLD.source_sha256)
  OR (OLD.imported_at   IS NOT NULL AND NEW.imported_at   IS DISTINCT FROM OLD.imported_at)
  OR (OLD.imported_by   IS NOT NULL AND NEW.imported_by   IS DISTINCT FROM OLD.imported_by)
  THEN
    RAISE EXCEPTION
      'Edisi AHSP (code=%): provenance impor sudah terisi — write-once, tak bisa '
      'diganti. Edisi baru = baris baru.', OLD.code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;
-- (trigger trg_edition_provenance_immutable dari 117 tetap; fungsinya diperbarui.)
