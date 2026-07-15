-- Migration 050: Full Modular RBAC Foundation
-- Creates roles, permissions, role_permissions tables + seeds all built-in data
-- Purely additive — no existing tables altered

-- ─── 1. TABLE: roles ─────────────────────────────────────────────────────────

CREATE TABLE roles (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT,
  is_builtin  BOOLEAN NOT NULL DEFAULT false,
  portal      TEXT NOT NULL DEFAULT 'dashboard',
  color       TEXT NOT NULL DEFAULT '#6B7280',
  sort_order  INT NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION protect_builtin_roles()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_builtin = true THEN
    RAISE EXCEPTION 'Role bawaan tidak bisa dihapus';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_protect_builtin_roles
  BEFORE DELETE ON roles
  FOR EACH ROW EXECUTE FUNCTION protect_builtin_roles();

-- ─── 2. TABLE: permissions ───────────────────────────────────────────────────

CREATE TABLE permissions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  module      TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  sort_order  INT NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. TABLE: role_permissions ──────────────────────────────────────────────

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);

-- ─── 4. FUNCTION: get_role_permissions ───────────────────────────────────────

CREATE OR REPLACE FUNCTION get_role_permissions(role_name TEXT)
RETURNS TABLE(permission_key TEXT) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.key
  FROM permissions p
  JOIN role_permissions rp ON rp.permission_id = p.id
  JOIN roles r ON r.id = rp.role_id
  WHERE r.name = role_name
$$;

-- ─── 5. SEED: built-in roles ─────────────────────────────────────────────────

INSERT INTO roles (name, label, description, is_builtin, portal, color, sort_order) VALUES
  ('admin',  'Administrator',   'Akses penuh ke semua fitur sistem',              true, 'dashboard',     '#6D28D9', 10),
  ('pm',     'Project Manager', 'Kelola proyek yang di-assign, approve kasbon',   true, 'pm-portal',     '#1D4ED8', 20),
  ('mandor', 'Mandor',          'Input progress lapangan, kasbon, laporan upah',  true, 'mandor-portal', '#D97706', 30),
  ('client', 'Klien',           'Lihat proyek dan invoice milik sendiri',         true, 'portal',        '#6B7280', 40);

-- ─── 6. SEED: permissions catalog ────────────────────────────────────────────

INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  -- Module: projects
  ('projects:view',     'projects', 'Lihat Proyek',              'Melihat daftar dan detail proyek',             10),
  ('projects:create',   'projects', 'Buat Proyek Baru',          'Membuat proyek baru',                          20),
  ('projects:edit',     'projects', 'Edit Proyek',               'Mengubah data proyek',                         30),
  ('projects:status',   'projects', 'Ubah Status Proyek',        'Mengubah status proyek (aktif/selesai/dll)',   40),
  ('projects:delete',   'projects', 'Hapus Proyek',              'Soft-delete proyek',                           50),
  ('projects:contract', 'projects', 'Generate Kontrak PDF',      'Membuat dokumen kontrak PDF',                  60),

  -- Module: finance
  ('finance:view',             'finance', 'Lihat Keuangan',              'Melihat dashboard keuangan, invoice, kasbon', 10),
  ('finance:invoice:create',   'finance', 'Buat Invoice',                'Membuat invoice ke klien',                    20),
  ('finance:invoice:pay',      'finance', 'Catat Pembayaran Invoice',    'Mencatat pembayaran masuk dari klien',        30),
  ('finance:termin:pay',       'finance', 'Bayar Termin',                'Menandai termin sebagai terbayar',            40),
  ('finance:expense:view',     'finance', 'Lihat Laporan Pengeluaran',   'Melihat laporan pengeluaran komisi',          50),
  ('finance:expense:create',   'finance', 'Buat Laporan Pengeluaran',    'Membuat laporan pengeluaran komisi',          60),
  ('finance:tax:view',         'finance', 'Lihat Rekap Pajak',           'Melihat rekap PPh/PPN per proyek',            70),

  -- Module: cash
  ('cash:view',             'cash', 'Lihat Kas',              'Melihat saldo dan riwayat akun kas',              10),
  ('cash:account:manage',   'cash', 'Kelola Akun Kas',        'Membuat dan mengedit akun kas',                   20),
  ('cash:transfer:create',  'cash', 'Transfer Dana',          'Mencatat transfer antar akun kas',                30),
  ('cash:transfer:confirm', 'cash', 'Konfirmasi Transfer',    'Mengkonfirmasi transfer dana',                    40),
  ('cash:expense:create',   'cash', 'Catat Pengeluaran',      'Mencatat pengeluaran proyek dengan nota',         50),
  ('cash:expense:approve',  'cash', 'Approve Pengeluaran',    'Menyetujui atau menolak pengeluaran proyek',      60),

  -- Module: mandor
  ('mandor:view',          'mandor', 'Lihat Data Mandor',     'Melihat ringkasan dan data mandor',               10),
  ('mandor:assign',        'mandor', 'Assign Mandor',         'Menugaskan mandor ke proyek',                     20),
  ('mandor:scope:manage',  'mandor', 'Kelola Work Scope',     'Membuat dan mengedit scope pekerjaan',            30),
  ('mandor:scope:item',    'mandor', 'Kelola Item Scope',     'Menambah dan mengedit rincian item pekerjaan',    40),
  ('mandor:worker:manage', 'mandor', 'Kelola Daftar Tukang',  'Menambah dan mengedit data tukang',               50),
  ('mandor:wage:create',   'mandor', 'Buat Laporan Upah',     'Membuat laporan upah mingguan',                   60),
  ('mandor:wage:approve',  'mandor', 'Approve Laporan Upah',  'Menyetujui atau menolak laporan upah',            70),
  ('mandor:kasbon:create', 'mandor', 'Ajukan Kasbon',         'Mengajukan kasbon baru',                          80),
  ('mandor:kasbon:approve','mandor', 'Approve Kasbon',        'Menyetujui atau menolak kasbon',                  90),

  -- Module: procurement
  ('procurement:view',              'procurement', 'Lihat Pengadaan',       'Melihat material, supplier, MR, PO, stok',    10),
  ('procurement:material:manage',   'procurement', 'Kelola Katalog Material','Menambah dan mengedit katalog material',       20),
  ('procurement:supplier:manage',   'procurement', 'Kelola Supplier',        'Menambah dan mengedit data supplier',          30),
  ('procurement:mr:manage',         'procurement', 'Kelola Material Request','Membuat dan memproses material request',       40),
  ('procurement:po:manage',         'procurement', 'Kelola Purchase Order',  'Membuat dan memproses purchase order',         50),
  ('procurement:payment:manage',    'procurement', 'Bayar Hutang Supplier',  'Mencatat pembayaran ke supplier',              60),

  -- Module: reports
  ('reports:view',     'reports', 'Lihat Laporan',         'Melihat laporan ringkasan proyek dan mandor',     10),
  ('reports:export',   'reports', 'Export Laporan',        'Export laporan ke Excel/PDF',                     20),
  ('reports:progress', 'reports', 'Lihat Progress Report', 'Melihat laporan progress fisik proyek',           30),

  -- Module: users
  ('users:manage',       'users', 'Kelola User',          'Menambah, mengedit, dan menonaktifkan user',      10),
  ('users:roles:manage', 'users', 'Kelola Role & Akses',  'Membuat role baru dan mengatur permission',       20),

  -- Module: clients
  ('clients:view',   'clients', 'Lihat Data Klien',  'Melihat daftar dan profil klien',                 10),
  ('clients:manage', 'clients', 'Kelola Data Klien', 'Menambah dan mengedit data klien',                20),

  -- Module: settings
  ('settings:manage', 'settings', 'Pengaturan Perusahaan', 'Mengedit profil dan pengaturan perusahaan',   10),

  -- Module: notifications
  ('notifications:milestone:check', 'notifications', 'Cek Milestone Otomatis', 'Menjalankan pengecekan milestone approaching/overdue', 10),

  -- Module: milestones
  ('milestones:manage', 'milestones', 'Kelola Milestone', 'Membuat, mengedit, dan menyelesaikan milestone', 10),

  -- Module: documents
  ('documents:manage', 'documents', 'Kelola Dokumen', 'Upload dan hapus dokumen proyek', 10);

-- ─── 7. SEED: role_permissions matrix ────────────────────────────────────────

-- Helper: insert all permissions for a role by name
DO $$
DECLARE
  v_admin_id  UUID;
  v_pm_id     UUID;
  v_mandor_id UUID;
  v_client_id UUID;
BEGIN
  SELECT id INTO v_admin_id  FROM roles WHERE name = 'admin';
  SELECT id INTO v_pm_id     FROM roles WHERE name = 'pm';
  SELECT id INTO v_mandor_id FROM roles WHERE name = 'mandor';
  SELECT id INTO v_client_id FROM roles WHERE name = 'client';

  -- ── ADMIN: all 45 permissions ──
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_admin_id, id FROM permissions;

  -- ── PM: 35 permissions (all except admin-only ones) ──
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_pm_id, id FROM permissions
  WHERE key NOT IN (
    'projects:status',
    'projects:delete',
    'cash:account:manage',
    'cash:expense:approve',
    'procurement:payment:manage',
    'users:manage',
    'users:roles:manage',
    'clients:manage',
    'settings:manage',
    'notifications:milestone:check'
  );

  -- ── MANDOR: 10 permissions (own scope only) ──
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_mandor_id, id FROM permissions
  WHERE key IN (
    'projects:view',
    'finance:view',
    'mandor:view',
    'mandor:worker:manage',
    'mandor:wage:create',
    'mandor:kasbon:create',
    'procurement:view',
    'procurement:mr:manage',
    'reports:view',
    'reports:progress'
  );

  -- ── CLIENT: 3 permissions (read-only own data) ──
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT v_client_id, id FROM permissions
  WHERE key IN (
    'projects:view',
    'finance:view',
    'reports:progress'
  );
END $$;

-- ─── RLS for new tables ──────────────────────────────────────────────────────
-- Roles & permissions are read by all authenticated users (for dropdowns etc)
-- But only admin (via service_role API) can modify them

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Read access: all authenticated users can read roles, permissions, role_permissions
CREATE POLICY "roles_read" ON roles
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "permissions_read" ON permissions
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "role_permissions_read" ON role_permissions
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Write access: service_role only (API uses service_role, so this is fine)
CREATE POLICY "roles_write" ON roles
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "permissions_write" ON permissions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "role_permissions_write" ON role_permissions
  FOR ALL USING (auth.role() = 'service_role');
