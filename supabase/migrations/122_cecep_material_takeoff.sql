-- Migration 122 — CECEP Langkah 6 slice-2: Material Take-off D3/D4/D5
--
-- ADDITIVE-FIRST: hanya tabel/kolom BARU. Nol perubahan objek existing, nol
-- perubahan angka. TIDAK menyentuh guard immutability manapun.
--
-- Tiga bagian, semua turunan rancangan MATERIAL-RAP-COMPANY-UI-DESIGN.md §D:
--   D5  `material_pack`   — dua-satuan (AHSP vs belanja), faktor kemasan EKSPLISIT
--                           per resource (Lapis 2). TANPA engine konversi (ADR-006).
--   D4  `steel_profiles`  — katalog profil baja (WF/H-beam/siku) + berat/batang.
--                           TIDAK ADA di AHSP nasional -> data referensi Lapis 2.
--   D3  `rebar_takeoff`   — BBS besi per DIAMETER (jalur input geometri terpisah,
--                           BUKAN turunan koefisien AHSP yang per-kg).
--
-- Uang = NUMERIC (bukan float). Timestamp = TIMESTAMPTZ. Nol tabel single-row.
-- Nol `company_id` (Phase 7, ADR-009).

-- ═══════════════════════════════════════════════════════════════════════════
-- D5 — material_pack: satuan belanja per resource (Lapis 2, data referensi)
-- ═══════════════════════════════════════════════════════════════════════════
-- factor = berapa satuan-AHSP dalam 1 satuan-belanja (mis. semen: 50 kg per 1 sak).
-- Pembulatan KE ATAS hanya di angka belanja; qty_ahsp TIDAK pernah dibulatkan
-- (paralel pola hsp_raw/hsp_rounded — simpan KEDUA, jangan campur).

CREATE TABLE IF NOT EXISTS material_pack (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id   UUID NOT NULL REFERENCES resources(id),
  buy_unit_code TEXT NOT NULL REFERENCES units(code),
  -- Berapa satuan AHSP per 1 satuan belanja. NUMERIC (bukan float) — ini angka
  -- yang masuk perhitungan kebutuhan belanja.
  factor        NUMERIC(14, 6) NOT NULL CHECK (factor > 0),
  round_up      BOOLEAN NOT NULL DEFAULT true,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Satu resource boleh punya beberapa satuan belanja (sak vs ton), tapi tidak
  -- boleh dobel untuk satuan belanja yang sama.
  CONSTRAINT material_pack_unik UNIQUE (resource_id, buy_unit_code)
);

CREATE INDEX IF NOT EXISTS idx_material_pack_resource ON material_pack(resource_id);

COMMENT ON TABLE material_pack IS
  'CECEP D5 — faktor kemasan EKSPLISIT per resource (Lapis 2): berapa satuan AHSP '
  'per 1 satuan belanja. TANPA engine konversi (ADR-006) — angka ini data, bukan tebakan.';

-- ═══════════════════════════════════════════════════════════════════════════
-- D4 — steel_profiles: katalog profil baja (Lapis 2, data referensi)
-- ═══════════════════════════════════════════════════════════════════════════
-- Verdict desain §D4: analisa struktur baja ADA di AHSP nasional (generik per-KG
-- "Baja Profil"), TAPI katalog profil + berat/m TIDAK ADA -> harus di-seed.
-- Sumber seed awal: sheet `DAFTAR BESI` Cibuluh (32 profil WF/H + 27 siku),
-- terverifikasi dibaca dari file (bukan tebakan).

CREATE TABLE IF NOT EXISTS steel_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'WF' (wide flange) | 'H' (H-beam) | 'L' (siku/angle) | 'C' (kanal/CNP) | 'other'
  profile_type   TEXT NOT NULL CHECK (profile_type IN ('WF', 'H', 'L', 'C', 'other')),
  -- Label ukuran verbatim, mis. '350x175x7x11' atau '50x50x5'.
  designation    TEXT NOT NULL,
  -- Dimensi (mm) — nullable karena tak semua tipe punya 4 dimensi (siku hanya 3).
  h_mm           NUMERIC(10, 2),
  b_mm           NUMERIC(10, 2),
  t1_mm          NUMERIC(10, 2),
  t2_mm          NUMERIC(10, 2),
  -- Berat & panjang batang standar (dari tabel referensi). weight_kg_per_m
  -- diturunkan = weight_per_bar_kg / standard_length_m (disimpan agar take-off
  -- tak perlu menghitung ulang; DUA-DUANYA dari tabel, bukan karangan).
  weight_per_bar_kg   NUMERIC(12, 3) NOT NULL CHECK (weight_per_bar_kg > 0),
  standard_length_m   NUMERIC(8, 2)  NOT NULL CHECK (standard_length_m > 0),
  weight_kg_per_m     NUMERIC(12, 4) NOT NULL CHECK (weight_kg_per_m > 0),
  -- Provenance: dari mana angka ini (mana tabel/dokumen).
  source_note    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT steel_profile_unik UNIQUE (profile_type, designation)
);

CREATE INDEX IF NOT EXISTS idx_steel_profiles_type ON steel_profiles(profile_type);

COMMENT ON TABLE steel_profiles IS
  'CECEP D4 — katalog profil baja + berat (Lapis 2). TIDAK ADA di AHSP nasional '
  '(nasional hanya generik per-kg "Baja Profil"); ini data referensi yang di-seed. '
  'Take-off baja = profil x panjang x kg/m -> kg -> feed analisa 2.3 (per kg).';

-- ═══════════════════════════════════════════════════════════════════════════
-- D3 — rebar_takeoff: BBS besi per DIAMETER (jalur input geometri terpisah)
-- ═══════════════════════════════════════════════════════════════════════════
-- Desain §D3 (BUKTI dari file): diameter hidup di level ITEM + BBS, BUKAN di
-- analisa AHSP (yang per-kg, dibedakan tipe BjTP/BjTS x elemen). Maka BBS =
-- JALUR INPUT TERPISAH digerakkan geometri, bukan turunan otomatis koefisien.
-- Take-off AHSP besi = kg kasar anggaran; BBS = kg presisi per diameter.

CREATE TABLE IF NOT EXISTS rebar_takeoff (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_item_id   UUID NOT NULL REFERENCES estimate_items(id) ON DELETE CASCADE,

  -- Tipe tulangan (sesuai master AHSP: polos vs sirip) + diameter (mm).
  rebar_type         TEXT NOT NULL CHECK (rebar_type IN ('BjTP', 'BjTS')),
  diameter_mm        NUMERIC(6, 2) NOT NULL CHECK (diameter_mm > 0),

  -- Input BBS-style (geometri): jumlah batang x panjang per batang.
  bar_count          INTEGER NOT NULL CHECK (bar_count > 0),
  length_per_bar_m   NUMERIC(12, 4) NOT NULL CHECK (length_per_bar_m > 0),

  -- Faktor berat kg/m untuk diameter ini. Lapis 2: 0.006165 x d^2(mm)
  -- (turunan fisika rho baja 7850 kg/m3, cocok tabel baku SNI s.d. 4 desimal).
  -- DISIMPAN eksplisit per baris agar angka historis tak berubah kalau konstanta
  -- direvisi kelak (pola effective-date: dokumen lama reproduksi angka sama).
  weight_kg_per_m    NUMERIC(12, 6) NOT NULL CHECK (weight_kg_per_m > 0),

  -- Hasil: kg presisi per diameter. Disimpan (bukan hanya dihitung) supaya
  -- ter-audit & bisa diadu dengan take-off AHSP (kg kasar).
  total_weight_kg    NUMERIC(14, 3) NOT NULL CHECK (total_weight_kg >= 0),

  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Satu item boleh punya banyak baris (beda diameter/tipe), tapi tidak dobel
  -- untuk kombinasi tipe+diameter yang sama.
  CONSTRAINT rebar_takeoff_unik UNIQUE (estimate_item_id, rebar_type, diameter_mm)
);

CREATE INDEX IF NOT EXISTS idx_rebar_takeoff_item ON rebar_takeoff(estimate_item_id);

COMMENT ON TABLE rebar_takeoff IS
  'CECEP D3 — BBS besi per diameter (jalur input geometri TERPISAH dari koefisien '
  'AHSP yang per-kg). kg presisi per diameter untuk pagu belanja; take-off AHSP '
  'besi tetap dipakai sebagai kg kasar anggaran.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Capability (ADR-004) + RLS
-- ═══════════════════════════════════════════════════════════════════════════
-- Take-off adalah turunan estimasi -> pakai capability estimasi existing untuk
-- baca; kelola data referensi (pack/profil) = capability terpisah karena itu
-- Lapis 2 (koreksi via admin beraudit, bukan setting biasa).

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('cecep:takeoff:view',    'cecep', 'Lihat Take-off Material',
   'Melihat kebutuhan material (agregasi, BBS besi, take-off baja)', 30),
  ('cecep:takeoff:manage',  'cecep', 'Kelola Take-off Material',
   'Input/ubah BBS besi per diameter & take-off baja per profil', 31),
  ('cecep:refdata:manage',  'cecep', 'Kelola Data Referensi CECEP',
   'Kelola katalog profil baja & faktor kemasan material (Lapis 2)', 32)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key IN ('cecep:takeoff:manage', 'cecep:refdata:manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('admin', 'pm') AND p.key = 'cecep:takeoff:view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- PM boleh input BBS (pekerjaan lapangan/estimator), sesuai pola cecep:estimate:manage.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'pm' AND p.key = 'cecep:takeoff:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

ALTER TABLE material_pack   ENABLE ROW LEVEL SECURITY;
ALTER TABLE steel_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rebar_takeoff   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS material_pack_read ON material_pack;
CREATE POLICY material_pack_read ON material_pack
  FOR SELECT USING (has_permission('cecep:takeoff:view'));
DROP POLICY IF EXISTS material_pack_write ON material_pack;
CREATE POLICY material_pack_write ON material_pack
  FOR ALL USING (has_permission('cecep:refdata:manage'))
  WITH CHECK (has_permission('cecep:refdata:manage'));

DROP POLICY IF EXISTS steel_profiles_read ON steel_profiles;
CREATE POLICY steel_profiles_read ON steel_profiles
  FOR SELECT USING (has_permission('cecep:takeoff:view'));
DROP POLICY IF EXISTS steel_profiles_write ON steel_profiles;
CREATE POLICY steel_profiles_write ON steel_profiles
  FOR ALL USING (has_permission('cecep:refdata:manage'))
  WITH CHECK (has_permission('cecep:refdata:manage'));

DROP POLICY IF EXISTS rebar_takeoff_read ON rebar_takeoff;
CREATE POLICY rebar_takeoff_read ON rebar_takeoff
  FOR SELECT USING (has_permission('cecep:takeoff:view'));
DROP POLICY IF EXISTS rebar_takeoff_write ON rebar_takeoff;
CREATE POLICY rebar_takeoff_write ON rebar_takeoff
  FOR ALL USING (has_permission('cecep:takeoff:manage'))
  WITH CHECK (has_permission('cecep:takeoff:manage'));

-- updated_at otomatis (material_pack; steel_profiles & rebar_takeoff append-mostly).
CREATE OR REPLACE FUNCTION fn_material_pack_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END $function$;

DROP TRIGGER IF EXISTS trg_material_pack_touch ON material_pack;
CREATE TRIGGER trg_material_pack_touch
  BEFORE UPDATE ON material_pack
  FOR EACH ROW EXECUTE FUNCTION fn_material_pack_touch_updated_at();
