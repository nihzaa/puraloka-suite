-- Migration 102 — CECEP Milestone 1: Cost Code Registry (Program C / Phase 3)
--
-- Tabel CECEP PERTAMA. Cost Code adalah Shared Kernel: `03b` §A.3 menyebut
-- "hampir semua domain punya panah MENUJU Cost Code, hampir tidak ada yang Cost
-- Code bergantung kepadanya". Salah bentuk di sini menular ke 17 domain, jadi
-- setiap kolom diturunkan dari artefak Frozen — aturan & jejak lengkap di ADR-009.
--
-- Business Responsibility (`44` §1): "Satu pekerjaan generik harus punya SATU
-- identitas yang dikenali sama persis oleh 17 domain berbeda — kalau identitas itu
-- boleh berbeda-beda per domain, angka RAB tidak akan pernah bisa ditemukan lagi
-- di Procurement/Progress/EVM."
--
-- ── Yang SENGAJA tidak ada (Open, bukan lupa — ADR-009) ─────────────────────
--   parent_id  → CBS domain terpisah (`44` §3); Cost Code "titik temu WBS+CBS"
--                (`37`), bukan pemilik pohon. Menulisnya sekarang = ❌ Invented.
--   unit       → nol artefak Frozen menaruh satuan di Cost Code; kandidat kuatnya
--                Assembly/AHSP (`44` §4). Tabel `units` (migration 090) menunggu.
--   company_id → multi-company adalah Phase 7 (Program D).
-- Ketiganya additive nanti; membongkar hierarki salah bentuk setelah 17 domain
-- merujuknya jauh lebih mahal daripada menambah kolom nullable.

-- ─── 1. TABLE ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identitas lintas domain. STABIL: `03b` §A.3 "identitas tetap meski
  -- deskripsi/kategori berubah seiring waktu". UNIQUE menegakkan "SATU identitas
  -- yang dikenali sama persis" — inti alasan Cost Code ada.
  code          TEXT NOT NULL UNIQUE,

  -- Boleh berubah tanpa mengubah identitas (`03b` §A.3).
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT,

  -- Lifecycle eksplisit `03b` §A.3: Draft → Active → Deprecated.
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'deprecated')),

  -- Waktu kejadian Domain Event `CostCodeActivated` / `CostCodeDeprecated`
  -- (`03b` §A.3). Tanpa ini event tak punya makna temporal.
  activated_at  TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Cap waktu harus konsisten dengan status; mencegah baris "active tanpa pernah
  -- diaktifkan" yang membuat riwayat event bohong.
  CONSTRAINT cost_codes_status_timestamps CHECK (
    (status = 'draft'      AND activated_at IS NULL     AND deprecated_at IS NULL) OR
    (status = 'active'     AND activated_at IS NOT NULL AND deprecated_at IS NULL) OR
    (status = 'deprecated' AND deprecated_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cost_codes_status ON cost_codes(status);

COMMENT ON TABLE cost_codes IS
  'CECEP Shared Kernel — identitas pekerjaan generik lintas 17 domain. Domain hilir '
  'MUST merujuk cost_codes.id, JANGAN menyalin code sebagai teks bebas (ADR-009).';

-- ─── 2. HARD GUARD: baris TIDAK BOLEH dihapus ───────────────────────────────
--
-- `03b` §A.3 Lifecycle: "tidak dihapus, riwayat historis tetap merujuknya".
-- Ditegakkan di DB, bukan sopan santun aplikasi: satu DELETE lewat SQL/tooling
-- akan memutus jejak RAB→Procurement→Progress→EVM tanpa cara memulihkannya.

CREATE OR REPLACE FUNCTION fn_cost_codes_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION
    'Cost Code tidak boleh dihapus (id=%, code=%). Riwayat historis lintas domain '
    'masih merujuknya — pakai status=''deprecated''.', OLD.id, OLD.code
    USING ERRCODE = 'restrict_violation';
END $function$;

DROP TRIGGER IF EXISTS trg_cost_codes_no_delete ON cost_codes;
CREATE TRIGGER trg_cost_codes_no_delete
  BEFORE DELETE ON cost_codes
  FOR EACH ROW EXECUTE FUNCTION fn_cost_codes_no_delete();

-- ─── 3. HARD GUARD: transisi lifecycle satu arah ────────────────────────────
--
-- Diizinkan : draft→active, draft→deprecated, active→deprecated (+ status tetap)
-- Ditolak   : active→draft, deprecated→apa pun
--
-- ⚠️ CATATAN JEJAK (ADR-009, bukan ✓ Fully Derived): `03b` §A.3 menyatakan
-- urutannya "Draft → Active → Deprecated" tapi TIDAK menyatakan apakah mundur
-- boleh. Dua tafsir sama-sama mungkin, jadi dipilih yang fail-closed —
-- menghidupkan kembali identitas yang sudah pensiun bisa menabrak data hilir
-- yang terlanjur menganggapnya pensiun. Melonggarkan nanti murah (ubah trigger);
-- memperketat setelah data terlanjur bolak-balik status, mahal.
--
-- draft→deprecated DIIZINKAN: draft yang salah ketik belum pernah dirujuk siapa
-- pun, dan karena hapus dilarang, tanpa jalan ini ia jadi sampah abadi. Ini
-- menghormati "tidak dihapus" secara harfiah sekaligus memberi jalan keluar.

CREATE OR REPLACE FUNCTION fn_cost_codes_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'draft'  AND NEW.status IN ('active', 'deprecated'))
    OR (OLD.status = 'active' AND NEW.status = 'deprecated')
  ) THEN
    RAISE EXCEPTION
      'Transisi status Cost Code tidak sah: % → % (code=%). Alur sah: '
      'draft→active, draft→deprecated, active→deprecated.',
      OLD.status, NEW.status, NEW.code
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cap waktu event diisi otomatis supaya tidak bergantung disiplin pemanggil.
  IF NEW.status = 'active'     AND NEW.activated_at  IS NULL THEN NEW.activated_at  := now(); END IF;
  IF NEW.status = 'deprecated' AND NEW.deprecated_at IS NULL THEN NEW.deprecated_at := now(); END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_cost_codes_status_transition ON cost_codes;
CREATE TRIGGER trg_cost_codes_status_transition
  BEFORE UPDATE OF status ON cost_codes
  FOR EACH ROW EXECUTE FUNCTION fn_cost_codes_status_transition();

-- updated_at otomatis (higiene mekanis, bukan keputusan domain).
CREATE OR REPLACE FUNCTION fn_cost_codes_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_cost_codes_touch ON cost_codes;
CREATE TRIGGER trg_cost_codes_touch
  BEFORE UPDATE ON cost_codes
  FOR EACH ROW EXECUTE FUNCTION fn_cost_codes_touch_updated_at();

-- ─── 4. Capability (ADR-004: capability, BUKAN literal role) ────────────────
--
-- `03b` §A.3 Ownership: "Fungsi Cost Engineering/Company Standard — domain hilir
-- HANYA mereferensikan, tidak pernah membuat sepihak" → baca dan tulis dipisah.

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:cost_code:view',   'cecep', 'Lihat Cost Code',
   'Melihat registry Cost Code untuk dirujuk domain lain', 10),
  ('cecep:cost_code:manage', 'cecep', 'Kelola Cost Code',
   'Membuat, mengubah, mengaktifkan, dan mem-deprecate Cost Code', 11)
ON CONFLICT (key) DO NOTHING;

-- Tulis: admin (pemegang fungsi Company Standard hari ini).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'cecep:cost_code:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Baca: admin + pm — pm menyusun RAB, yaitu "domain hilir yang mereferensikan".
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:cost_code:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 5. RLS — sejajar tabel konfigurasi lain, capability-based ──────────────

ALTER TABLE cost_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_codes_read ON cost_codes;
CREATE POLICY cost_codes_read ON cost_codes
  FOR SELECT USING (has_permission('cecep:cost_code:view'));

DROP POLICY IF EXISTS cost_codes_write ON cost_codes;
CREATE POLICY cost_codes_write ON cost_codes
  FOR ALL USING (has_permission('cecep:cost_code:manage'))
  WITH CHECK (has_permission('cecep:cost_code:manage'));
