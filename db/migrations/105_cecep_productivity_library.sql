-- Migration 105 — CECEP Milestone 2: Productivity Library (Program C)
--
-- Aggregate Root: Productivity Record = KOMBINASI (RBS entry + Cost Code + versi)
-- (`44` §6, `03b` §A.6b). Bukan "satu Resource satu angka tunggal".
--
-- Business Responsibility (`44` §6): "Produktivitas melekat pada KOMBINASI
-- resource+jenis pekerjaan — kalau satu Resource hanya punya satu angka tunggal,
-- perbedaan produktivitas Tukang Besi untuk pembesian vs bekisting tidak akan
-- pernah tertangkap."
--
-- Domain pertama yang mereferensikan DUA Shared Kernel Milestone 1 sekaligus
-- (resources + cost_codes). Bukan Shared Kernel sendiri (`03b` §A.6b: "konsumen
-- RBS+Cost Code, bukan yang direferensikan balik").
--
-- ── Versioning: immutable-entity-per-version (BUKAN keputusan tertunda) ──────
-- Beda dari CBS (yang B.5-nya `03b` tandai "belum diambil"): di sini "+ versi"
-- adalah BAGIAN IDENTITAS Aggregate Root — dinyatakan eksplisit `44` §6 / `03b`
-- §A.6b sebagai alasan AR-nya. Maka tiap versi = record tersendiri; perbaikan =
-- versi baru (`ProductivityRecordUpdatedFromVariance` menghasilkan record baru,
-- 0.5 OH → versi berikut 0.42 OH), bukan edit di tempat. Ini turunan, bukan tebakan.
--
-- ── source (provenance) = enum label, BUKAN FK ke Reference Library ─────────
-- Lifecycle `03b` §A.6b: Bootstrap (AHSP Nasional) → Company Baseline → Updated
-- (dari Variance). Direkam sebagai `source` per versi. 'national_bootstrap' hanya
-- LABEL asal-usul — TIDAK ber-FK ke Standard AHSP/Reference Library (domain B.4 yg
-- masih tertunda), jadi Productivity tak terblokir olehnya.
--
-- ── Yang SENGAJA tidak ada (Open — ADR-009) ─────────────────────────────────
--   unit       → productivity_value coefficient (mis. 0.5) bermakna "qty resource
--                per satuan kerja"; dua satuannya (resource + cost_code) masih
--                ditunda (migration 103). Coefficient disimpan NUMERIC tanpa satuan.
--   company_id → Phase 7.

-- ─── 1. TABLE ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS productivity_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identitas AR = kombinasi (resource, cost_code, versi). Merujuk dua Shared
  -- Kernel Milestone 1 (No Data Duplication: merujuk, tak menyalin).
  resource_id        UUID NOT NULL REFERENCES resources(id),
  cost_code_id       UUID NOT NULL REFERENCES cost_codes(id),
  version_number     INT NOT NULL DEFAULT 1 CHECK (version_number >= 1),

  -- Coefficient: qty resource per satuan kerja (mis. 0.5 OH). Dimensinya menunggu
  -- resolusi unit (lihat catatan di atas). Boleh 0? Produktivitas nol tak bermakna
  -- (butuh resource tapi 0 = pekerjaan tak butuh resource ini) → harus > 0.
  productivity_value NUMERIC(12, 4) NOT NULL CHECK (productivity_value > 0),

  -- Asal-usul versi ini (`03b` §A.6b lifecycle). Label, bukan FK.
  source             TEXT NOT NULL DEFAULT 'company_baseline'
                     CHECK (source IN ('national_bootstrap', 'company_baseline', 'variance')),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Identitas AR unik: satu versi per (resource, cost_code).
  CONSTRAINT productivity_identity UNIQUE (resource_id, cost_code_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_productivity_resource  ON productivity_records(resource_id);
CREATE INDEX IF NOT EXISTS idx_productivity_cost_code ON productivity_records(cost_code_id);

COMMENT ON TABLE productivity_records IS
  'CECEP Productivity Library — produktivitas per (resource × cost_code × versi). '
  'Immutable fact per versi: perbaikan = versi baru, bukan edit di tempat (ADR-009).';

-- ─── 2. HARD GUARD: record adalah FAKTA immutable (tak boleh diubah) ─────────
--
-- Tiap versi merekam "produktivitas terukur pada versi N". Mengeditnya = mengubah
-- fakta historis yang mungkin sudah dipakai Formula/Assembly menghitung estimate.
-- Perbaikan/pembaruan = record versi BARU (turunan langsung dari "+ versi" sbg
-- identitas). Maka semua field inti dikunci sejak dibuat.

CREATE OR REPLACE FUNCTION fn_productivity_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF ( NEW.resource_id, NEW.cost_code_id, NEW.version_number,
       NEW.productivity_value, NEW.source )
     IS DISTINCT FROM
     ( OLD.resource_id, OLD.cost_code_id, OLD.version_number,
       OLD.productivity_value, OLD.source )
  THEN
    RAISE EXCEPTION
      'Productivity Record bersifat immutable (id=%). Produktivitas baru = versi '
      'baru (buat record dgn version_number berikutnya), bukan edit di tempat.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_productivity_immutable ON productivity_records;
CREATE TRIGGER trg_productivity_immutable
  BEFORE UPDATE ON productivity_records
  FOR EACH ROW EXECUTE FUNCTION fn_productivity_immutable();

-- ─── 3. HARD GUARD: tidak boleh dihapus (knowledge terakumulasi) ────────────
--
-- Produktivitas dibangun lewat AI Learning Loop pasca-proyek (`03b` §A.6b
-- Ownership). Menghapus satu versi = kehilangan jejak "dulu produktivitasnya X",
-- yang jadi basis Variance Analysis. Konsisten prinsip "riwayat tetap" domain
-- CECEP lain. Tak ada draft di Productivity → tak ada pengecualian.

CREATE OR REPLACE FUNCTION fn_productivity_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION
    'Productivity Record tidak boleh dihapus (id=%, versi=%). Ia fakta historis '
    'basis Variance Analysis — biarkan sebagai versi lama, buat versi baru.',
    OLD.id, OLD.version_number
    USING ERRCODE = 'restrict_violation';
END $function$;

DROP TRIGGER IF EXISTS trg_productivity_no_delete ON productivity_records;
CREATE TRIGGER trg_productivity_no_delete
  BEFORE DELETE ON productivity_records
  FOR EACH ROW EXECUTE FUNCTION fn_productivity_no_delete();

-- ─── 4. Capability (ADR-004) ────────────────────────────────────────────────

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:productivity:view',   'cecep', 'Lihat Produktivitas',
   'Melihat Productivity Library (produktivitas per resource×pekerjaan)', 16),
  ('cecep:productivity:manage', 'cecep', 'Kelola Produktivitas',
   'Menambah versi produktivitas (bootstrap/baseline/variance)', 17)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:productivity:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:productivity:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE productivity_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS productivity_read ON productivity_records;
CREATE POLICY productivity_read ON productivity_records
  FOR SELECT USING (has_permission('cecep:productivity:view'));

DROP POLICY IF EXISTS productivity_write ON productivity_records;
CREATE POLICY productivity_write ON productivity_records
  FOR ALL USING (has_permission('cecep:productivity:manage'))
  WITH CHECK (has_permission('cecep:productivity:manage'));
