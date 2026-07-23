-- Migration 076: menu_items (Sub-Fase 1B.2 Menu Registry)
-- Memindahkan STRUKTUR menu sidebar dari JSX hardcode ke DB. Visibility TETAP di
-- client via perms.has() — hanya sumber struktur yang pindah. ADDITIVE-FIRST:
-- seed 1:1 dengan sidebar.tsx existing, NOL menu hilang, urutan visual dipertahankan.
--
-- required_permissions TEXT[] + match-ANY: menu tampil jika user punya SALAH SATU
-- permission di array. Array kosong = selalu tampil (mis. Dashboard). Ini menutup
-- kasus OR di sidebar existing (Keuangan = finance:view OR cash:view; Kalender =
-- projects:view OR mandor:view) secara data, bukan cabang JSX.
--
-- Dropdown (Keuangan, Pengaturan) = parent row (href NULL) + children (parent_id).

CREATE TABLE IF NOT EXISTS menu_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                  TEXT NOT NULL UNIQUE,              -- id stabil, mis. 'keuangan-invoice'
  label                TEXT NOT NULL,                     -- teks tampil
  href                 TEXT,                              -- NULL untuk parent dropdown
  icon                 TEXT NOT NULL,                     -- nama lucide-react, mis. 'FolderKanban'
  parent_id            UUID REFERENCES menu_items(id) ON DELETE CASCADE,
  required_permissions TEXT[] NOT NULL DEFAULT '{}',      -- match-ANY; kosong = selalu tampil
  sort_order           INTEGER NOT NULL DEFAULT 0,
  section              TEXT NOT NULL DEFAULT 'main',      -- 'main' (nav) | 'bottom' (footer)
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_parent ON menu_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_sort   ON menu_items(section, sort_order);

COMMENT ON TABLE menu_items IS 'Registry struktur menu sidebar (Sub-Fase 1B.2). Visibility di-evaluasi client via perms.has() match-ANY.';

-- ─── Seed 1:1 dengan sidebar.tsx (urutan visual dipertahankan persis) ─────────
-- Section 'main' — urutan sesuai JSX baris 242-327.
-- (parent dulu agar parent_id children bisa direferensikan via subquery key.)

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section) VALUES
  -- 1. Dashboard — tanpa permission (selalu tampil)
  ('dashboard',   'Dashboard',  '/dashboard',   'LayoutDashboard', NULL, '{}',                              10, 'main'),
  -- 2. Proyek
  ('proyek',      'Proyek',     '/proyek',      'FolderKanban',    NULL, ARRAY['projects:view'],            20, 'main'),
  -- 3. Klien
  ('klien',       'Klien',      '/klien',       'Contact',         NULL, ARRAY['clients:view'],             30, 'main'),
  -- 4. Keuangan (parent dropdown) — OR finance:view/cash:view
  ('keuangan',    'Keuangan',   NULL,           'Wallet',          NULL, ARRAY['finance:view','cash:view'], 40, 'main'),
  -- 5. Pengadaan
  ('procurement', 'Pengadaan',  '/procurement', 'ShoppingCart',    NULL, ARRAY['procurement:view'],         50, 'main'),
  -- 6. Mandor
  ('mandor',      'Mandor',     '/mandor',      'HardHat',         NULL, ARRAY['mandor:view'],              60, 'main'),
  -- 7. Laporan
  ('laporan',     'Laporan',    '/laporan',     'BarChart3',       NULL, ARRAY['reports:view'],             70, 'main'),
  -- 8. Kalender — OR projects:view/mandor:view
  ('kalender',    'Kalender',   '/kalender',    'CalendarDays',    NULL, ARRAY['projects:view','mandor:view'], 80, 'main'),
  -- 9. User
  ('users',       'User',       '/users',       'Users',           NULL, ARRAY['users:manage'],             90, 'main'),
  -- 10. Audit Trail
  ('audit',       'Audit Trail','/audit',       'ShieldCheck',     NULL, ARRAY['users:manage'],            100, 'main')
ON CONFLICT (key) DO NOTHING;

-- Children Keuangan (subStyle di JSX; urutan: Invoice & Bayar, lalu Kas & Pengeluaran)
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'keuangan-invoice', 'Invoice & Bayar', '/keuangan', 'Receipt', m.id, ARRAY['finance:view'], 10, 'main'
FROM menu_items m WHERE m.key = 'keuangan'
ON CONFLICT (key) DO NOTHING;

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'keuangan-kas', 'Kas & Pengeluaran', '/kas', 'PiggyBank', m.id, ARRAY['cash:view'], 20, 'main'
FROM menu_items m WHERE m.key = 'keuangan'
ON CONFLICT (key) DO NOTHING;

-- Section 'bottom' — Pengaturan (parent dropdown, hanya jika users:roles:manage;
-- fallback link tunggal ditangani client). Children: Profil Perusahaan, Role & Akses.
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section) VALUES
  ('pengaturan', 'Pengaturan', '/pengaturan', 'Settings', NULL, '{}', 10, 'bottom')
ON CONFLICT (key) DO NOTHING;

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'pengaturan-profil', 'Profil Perusahaan', '/pengaturan', 'Building2', m.id, ARRAY['users:roles:manage'], 10, 'bottom'
FROM menu_items m WHERE m.key = 'pengaturan'
ON CONFLICT (key) DO NOTHING;

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'pengaturan-roles', 'Role & Akses', '/pengaturan/roles', 'ShieldCheck', m.id, ARRAY['users:roles:manage'], 20, 'bottom'
FROM menu_items m WHERE m.key = 'pengaturan'
ON CONFLICT (key) DO NOTHING;

-- ─── RLS (pola Sub-Fase 1A) ──────────────────────────────────────────────────
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- Read: semua authenticated (struktur menu dibaca setiap render sidebar).
CREATE POLICY "menu_items_read" ON menu_items
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Write: settings:manage (admin) — mengelola registry menu = kelas pengaturan.
CREATE POLICY "menu_items_write" ON menu_items
  FOR ALL USING (has_permission('settings:manage'))
  WITH CHECK (has_permission('settings:manage'));
