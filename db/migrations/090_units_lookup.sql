-- Migration 090: satuan (unit of measure) lookup terpusat (AKTA 3 — config-first)
--
-- MASALAH (HARDCODE-CENSUS ember [A]): DUA daftar satuan hardcode yang DIVERGEN:
--   • apps/web procurement/page.tsx  → UNITS = ['sak','batang','m³','m²',...] (13, nilai = simbol)
--   • apps/web mandor/page.tsx       → UNITS_GROUPED (kode 'm2'/'m3', 15, nilai = kode)
-- Keduanya drift terpisah; satuan baru harus diedit di 2 tempat + redeploy.
--
-- SOLUSI config-first: SATU tabel `units` sebagai sumber tunggal, dikelola dari UI
-- (§12 DoD: "ada kolomnya di DB" belum cukup — WAJIB bisa disetel dari UI).
--
-- BEHAVIOR-PRESERVING (nol migrasi data existing): tiap domain TETAP menyimpan
-- nilai sesuai konvensi historisnya —
--   • mandor  → simpan `code` ('m2','m3','m_linear', ...) — cocok dgn work_scope_items.unit lama
--   • procurement → simpan `symbol` ('m²','m³','sak', ...) — cocok dgn materials.unit lama
-- Satu-satunya tumpang tindih konvensi hanya m²/m³ (mandor kode vs procurement simbol);
-- selebihnya code == symbol. Kedua dropdown kini bersumber dari tabel yang sama →
-- tak ada lagi drift. Nilai tersimpan lama tetap valid & tampil benar.

CREATE TABLE IF NOT EXISTS units (
  code       TEXT PRIMARY KEY,                     -- kunci stabil (dipakai mandor sbg nilai tersimpan)
  symbol     TEXT NOT NULL,                        -- tampilan singkat (dipakai procurement sbg nilai tersimpan)
  label      TEXT NOT NULL,                        -- nama ramah (mis. "Meter persegi")
  category   TEXT NOT NULL,                        -- pengelompokan UI: area/length/volume/weight/count/set/time
  sort_order INT  NOT NULL DEFAULT 0,              -- urutan global (data-driven, tanpa kode)
  is_active  BOOLEAN NOT NULL DEFAULT true,        -- soft-disable (jangan hapus — nilai lama bisa mereferensi)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE units IS 'Master satuan (unit of measure) terpusat — sumber tunggal dropdown satuan (mandor + procurement). code=konvensi nilai mandor, symbol=konvensi nilai procurement. Kelola via UI /pengaturan/satuan (units:manage).';

-- Seed = UNION dua daftar lama (deduplikasi by makna). sort_order mengkodekan urutan global.
INSERT INTO units (code, symbol, label, category, sort_order) VALUES
  ('m2',       'm²',     'Meter persegi', 'area',   10),
  ('m3',       'm³',     'Meter kubik',   'volume', 20),
  ('m',        'm',      'Meter',         'length', 30),
  ('m_linear', 'm''',    'Meter lari',    'length', 40),
  ('kg',       'kg',     'Kilogram',      'weight', 50),
  ('ton',      'ton',    'Ton',           'weight', 60),
  ('unit',     'unit',   'Unit',          'count',  70),
  ('buah',     'buah',   'Buah',          'count',  80),
  ('titik',    'titik',  'Titik',         'count',  90),
  ('batang',   'batang', 'Batang',        'count',  100),
  ('lembar',   'lembar', 'Lembar',        'count',  110),
  ('sak',      'sak',    'Sak',           'count',  120),
  ('rol',      'rol',    'Rol',           'count',  130),
  ('liter',    'liter',  'Liter',         'volume', 140),
  ('set',      'set',    'Set',           'set',    150),
  ('ls',       'ls',     'Lump sum',      'set',    160),
  ('hari',     'hari',   'Hari',          'time',   170),
  ('minggu',   'minggu', 'Minggu',        'time',   180)
ON CONFLICT (code) DO NOTHING;

-- ─── Derive capability (ADR-004): units:manage, seed ke admin (scope-preserving) ──
-- Hari ini hanya admin yang mengelola master data → seed admin saja. Grantable ke
-- role custom (direktur) via UI role editor tanpa deploy.
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('units:manage', 'settings', 'Kelola Satuan',
   'Menambah/mengubah/menonaktifkan satuan (unit of measure) di master satuan terpusat', 30)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'units:manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── RLS (pola 1A / financial_config 086) ────────────────────────────────────
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
-- Read: semua authenticated (dropdown dibaca mandor/pm/admin saat isi form).
CREATE POLICY "units_read" ON units
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
-- Write: HANYA units:manage. service_role (API) bypass.
CREATE POLICY "units_write" ON units
  FOR ALL USING (has_permission('units:manage'))
  WITH CHECK (has_permission('units:manage'));

-- ─── Menu (1B.2 DB-driven): entri "Kelola Satuan" di dropdown Pengaturan ──────
-- ADDITIVE-FIRST. Gated units:manage. sort_order 17 = antara Konfigurasi Keuangan (15) & Role (20).
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'pengaturan-satuan', 'Kelola Satuan', '/pengaturan/satuan', 'Ruler', m.id,
       ARRAY['units:manage'], 17, 'bottom'
FROM menu_items m WHERE m.key = 'pengaturan'
ON CONFLICT (key) DO NOTHING;
