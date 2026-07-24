-- Migration 103 — CECEP Milestone 1: RBS / Resource Identity Registry (Program C)
--
-- Aggregate Root KEDUA (`44` §2, `03b` §A.5). RBS adalah "shared kernel kedua
-- terpenting setelah Cost Code, dipakai 10 domain hilir" (`03b` §A.5). Node pusat
-- kedua context map: Assembly/Price Book/Productivity/Procurement/Payroll →
-- (referensi) → RBS.
--
-- Business Responsibility (`44` §2): "Tukang Besi yang dirujuk Assembly harus jadi
-- entitas yang SAMA PERSIS dengan Tukang Besi yang dirujuk Payroll — kalau tidak,
-- No Data Duplication (Constraint #4) tidak mungkin ditegakkan."
--
-- BEDA BENTUK dari Cost Code (migration 102), diturunkan dari sumber — bukan
-- disamakan begitu saja:
--   · Lifecycle 2 status: Active → Inactive (`03b` §A.5). TIDAK ada 'draft' —
--     resource aktif sejak dibuat (`03b` hanya menamai Domain Event
--     `ResourceDeactivated`, tak ada event aktivasi awal).
--   · `category` WAJIB: `35` #5 + `04a` — "satu Registry dengan kategori sebagai
--     atribut"; dampak bisnisnya berbeda per kategori (Labor→Payroll,
--     Material→Procurement, Equipment→Asset, Subcontract). Bukan opsional.
--
-- ── Yang SENGAJA tidak ada (Open, bukan lupa — pola ADR-009) ─────────────────
--   unit       → SAMA seperti Cost Code: nol artefak Frozen menaruh satuan di
--                RBS, dan kontrak Price Book Entry (`45` §C) pun TIDAK memuat unit
--                di 11 elemennya. Kepemilikan satuan resource baru dipaksa jelas
--                saat Assembly/AHSP (Milestone 2) — koefisien "0,7 OH Tukang Besi"
--                di sana yang menuntut satuan. Additive nanti (unit_id nullable →
--                units, migration 090).
--   company_id → multi-company adalah Phase 7 (Program D).

-- ─── 1. TABLE ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resources (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identitas lintas domain, STABIL (`03b` §A.5 "identitas tetap, atribut
  -- deskriptif bisa berubah"). UNIQUE menegakkan "satu resource adalah SATU
  -- entity yang dirujuk banyak domain" — dasar No Data Duplication.
  code           TEXT NOT NULL UNIQUE,

  name           TEXT NOT NULL,
  description    TEXT,

  -- WAJIB. `35` #5: RBS = Labor/Equipment/Material/Subcontract (`01` §4).
  -- Resource tanpa kategori tak bermakna — "dampak bisnisnya berbeda per kategori".
  category       TEXT NOT NULL
                 CHECK (category IN ('labor', 'equipment', 'material', 'subcontract')),

  -- Lifecycle `03b` §A.5: Active → Inactive. Aktif sejak dibuat (tak ada draft).
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'inactive')),

  -- Waktu Domain Event `ResourceDeactivated` (`03b` §A.5).
  deactivated_at TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Cap waktu konsisten dengan status: 'active' tak boleh menyimpan jejak
  -- deaktivasi (kalau reaktivasi, jejak lama dihapus — lihat trigger).
  CONSTRAINT resources_status_timestamp CHECK (
    (status = 'active'   AND deactivated_at IS NULL) OR
    (status = 'inactive' AND deactivated_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_resources_status   ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);

COMMENT ON TABLE resources IS
  'CECEP Shared Kernel kedua (RBS/Resource Identity) — identitas resource lintas '
  '10 domain hilir. Domain hilir MUST merujuk resources.id, JANGAN menyalin code '
  'atau membuat definisi resource sendiri (No Data Duplication, ADR-009).';

-- ─── 2. HARD GUARD: baris TIDAK BOLEH dihapus ───────────────────────────────
--
-- `03b` §A.5 Lifecycle: "Active → Inactive (riwayat tetap merujuknya)". Prinsip
-- sama dengan Cost Code: satu DELETE memutus jejak Assembly/Procurement/Payroll
-- yang merujuk resource ini. Ditegakkan di DB, bukan sopan santun aplikasi.

CREATE OR REPLACE FUNCTION fn_resources_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION
    'Resource tidak boleh dihapus (id=%, code=%). Assembly/Procurement/Payroll '
    'mungkin masih merujuknya — pakai status=''inactive''.', OLD.id, OLD.code
    USING ERRCODE = 'restrict_violation';
END $function$;

DROP TRIGGER IF EXISTS trg_resources_no_delete ON resources;
CREATE TRIGGER trg_resources_no_delete
  BEFORE DELETE ON resources
  FOR EACH ROW EXECUTE FUNCTION fn_resources_no_delete();

-- ─── 3. HARD GUARD: transisi lifecycle active ↔ inactive ────────────────────
--
-- Diizinkan : active→inactive (deaktivasi), inactive→active (reaktivasi).
--
-- REAKTIVASI mengikuti prinsip yang SAMA yang sudah diputuskan founder untuk Cost
-- Code (ADR-009): identitas stabil, "dinonaktifkan" adalah STATUS OPERASIONAL,
-- bukan penghapusan permanen. Menonaktifkan resource karena salah lalu memakainya
-- lagi TIDAK boleh memaksa identitas baru — identitas baru justru memecah No Data
-- Duplication, hal yang RBS ada untuk mencegahnya. `03b` §A.5 hanya menamai event
-- `ResourceDeactivated`, tapi prinsip founder (bukan detail Cost-Code-saja) berlaku
-- di sini karena wording lifecycle-nya identik ("riwayat tetap merujuknya").
--
-- Lifecycle hanya 2 status (tak ada 'draft'), jadi tak ada transisi terlarang
-- yang perlu ditolak eksplisit selain nilai di luar CHECK — trigger di sini murni
-- mengurus cap waktu event.

CREATE OR REPLACE FUNCTION fn_resources_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'inactive' THEN
    NEW.deactivated_at := now();                 -- ResourceDeactivated
  ELSIF NEW.status = 'active' THEN
    NEW.deactivated_at := NULL;                  -- reaktivasi: jejak lama dihapus
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_resources_status_transition ON resources;
CREATE TRIGGER trg_resources_status_transition
  BEFORE UPDATE OF status ON resources
  FOR EACH ROW EXECUTE FUNCTION fn_resources_status_transition();

-- updated_at otomatis (higiene mekanis).
CREATE OR REPLACE FUNCTION fn_resources_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_resources_touch ON resources;
CREATE TRIGGER trg_resources_touch
  BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION fn_resources_touch_updated_at();

-- ─── 4. Capability (ADR-004) ────────────────────────────────────────────────
-- `03b` §A.5 Ownership: "Fungsi Resource Management/Company Standard — domain
-- hilir merujuk, tidak membuat definisi sendiri-sendiri" → baca/tulis dipisah.

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:resource:view',   'cecep', 'Lihat Resource',
   'Melihat registry resource (RBS) untuk dirujuk domain lain', 12),
  ('cecep:resource:manage', 'cecep', 'Kelola Resource',
   'Membuat, mengubah, mengaktifkan, dan menonaktifkan resource', 13)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:resource:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:resource:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 5. RLS — capability-based, sejajar cost_codes ──────────────────────────

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resources_read ON resources;
CREATE POLICY resources_read ON resources
  FOR SELECT USING (has_permission('cecep:resource:view'));

DROP POLICY IF EXISTS resources_write ON resources;
CREATE POLICY resources_write ON resources
  FOR ALL USING (has_permission('cecep:resource:manage'))
  WITH CHECK (has_permission('cecep:resource:manage'));
