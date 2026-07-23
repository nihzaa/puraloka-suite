-- Migration 077: modules + feature_flags (Sub-Fase 1B.3 Module Registry & Feature Flags)
-- ADDITIVE-FIRST: setiap modul existing di-seed is_enabled=true — NOL modul mati.
-- Menyiapkan struktur L2 (per-company override) & L3 (plan-tier gating) tanpa
-- mengaktifkannya sekarang (kolom disiapkan, NULL = tanpa batasan).
--
-- modules  = unit bisnis besar (Procurement on/off), berelasi Menu Registry + Module Catalog.
-- feature_flags = unit granular untuk eksperimen/rollout bertahap fitur individual.
-- Dipisah karena query-pattern berbeda (rationale: Phase1/02-target-architecture.md § 1B.3).

CREATE TABLE IF NOT EXISTS modules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT NOT NULL UNIQUE,           -- 'procurement', 'change_orders'
  label         TEXT NOT NULL,
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  min_plan_tier TEXT,                            -- disiapkan L3 SaaS plan gating; NULL = semua tier
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  label       TEXT,
  is_enabled  BOOLEAN NOT NULL DEFAULT false,
  rollout_pct INTEGER NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  company_id  UUID,                              -- NULL = global; terisi mulai L2 (override per-company)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_company ON feature_flags(company_id);

COMMENT ON TABLE modules IS 'Registry modul bisnis (Sub-Fase 1B.3). Toggle on/off per modul; siap L2 (company) & L3 (plan tier).';
COMMENT ON TABLE feature_flags IS 'Feature flags granular (Sub-Fase 1B.3) untuk rollout bertahap fitur di dalam modul.';

-- ─── Seed modul existing = SEMUA enabled (additive-first) ─────────────────────
-- Sumber: menu_items top-level + domain backend yang sudah berjalan.
INSERT INTO modules (key, label, is_enabled, sort_order) VALUES
  ('projects',      'Proyek',              true, 10),
  ('clients',       'Klien',               true, 20),
  ('finance',       'Keuangan (Invoice)',  true, 30),
  ('cash',          'Kas & Pengeluaran',   true, 40),
  ('procurement',   'Pengadaan',           true, 50),
  ('mandor',        'Mandor',              true, 60),
  ('reports',       'Laporan',             true, 70),
  ('calendar',      'Kalender',            true, 80),
  ('documents',     'Dokumen & Foto',      true, 90),
  ('change_orders', 'Change Order',        true, 100),
  ('notifications', 'Notifikasi',          true, 110),
  ('audit',         'Audit Trail',         true, 120),
  ('users',         'Manajemen User',      true, 130),
  ('settings',      'Pengaturan',          true, 140)
ON CONFLICT (key) DO NOTHING;

-- feature_flags: TIDAK ada flag existing yang mematikan fitur. Sengaja kosong —
-- flag ditambahkan saat ada fitur eksperimental. Additive-first: nol perilaku berubah.

-- ─── RLS (pola Sub-Fase 1A) ──────────────────────────────────────────────────
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Read: semua authenticated (status modul/flag dibaca luas untuk gating UI).
CREATE POLICY "modules_read" ON modules
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY "feature_flags_read" ON feature_flags
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Write: settings:manage (admin) — mengelola registry = kelas pengaturan.
CREATE POLICY "modules_write" ON modules
  FOR ALL USING (has_permission('settings:manage'))
  WITH CHECK (has_permission('settings:manage'));
CREATE POLICY "feature_flags_write" ON feature_flags
  FOR ALL USING (has_permission('settings:manage'))
  WITH CHECK (has_permission('settings:manage'));
