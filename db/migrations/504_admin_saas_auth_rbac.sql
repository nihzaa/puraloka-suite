-- ============================================================================
-- 504 — ADMIN SAAS: auth & RBAC internal (terpisah TOTAL dari roles/permissions tenant)
-- ============================================================================
--
-- Spec §4.4 + matrix permission §5.8. Staf admin-saas bukan anggota company
-- manapun — pertanyaannya "siapa di TIM VENDOR boleh apa lintas semua
-- tenant", beda dari roles/permissions tenant ("siapa boleh apa DI company X").
--
-- auth_user_id TANPA FK formal ke auth.users — lintas skema auth/public,
-- pola sama dengan users.id existing (Supabase auth.users di skema terpisah).
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_saas_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  is_builtin  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_saas_permissions (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key    TEXT NOT NULL UNIQUE,
  label  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_saas_role_permissions (
  role_id        UUID NOT NULL REFERENCES admin_saas_roles(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES admin_saas_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS admin_saas_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  role_id       UUID NOT NULL REFERENCES admin_saas_roles(id),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN admin_saas_users.auth_user_id IS
  'FK ke auth.users (Supabase project SAMA dgn puraloka-suite), TANPA FK '
  'formal lintas skema. Satu auth_user_id BISA punya baris company_members '
  '(tenant) DAN admin_saas_users (vendor) sekaligus — SAH, dua konteks '
  'otorisasi independen (spec §4.4).';

CREATE TABLE IF NOT EXISTS admin_saas_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID NOT NULL REFERENCES admin_saas_users(id),
  action          TEXT NOT NULL,
  target_type     TEXT NOT NULL,
  target_id       UUID,
  old_values      JSONB,
  new_values      JSONB,
  reason          TEXT,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE admin_saas_audit_log IS
  'TERPISAH dari audit_logs tenant (Ember [C] milik puraloka-suite). Aksi '
  'staf admin-saas (suspend, override kuota, impersonate) butuh jejak '
  'sendiri FK ke admin_saas_users, bukan menumpang tabel governance repo '
  'lain (spec §4.4).';

-- ── Seed: 4 role bawaan ─────────────────────────────────────────────────────
INSERT INTO admin_saas_roles (name, label, is_builtin) VALUES
  ('super_admin', 'Super Admin', true),
  ('billing_ops',  'Billing Ops', true),
  ('support',      'Support',     true),
  ('sales',        'Sales',       true)
ON CONFLICT (name) DO NOTHING;

-- ── Seed: 14 permission dari matrix spec §5.8 ──────────────────────────────
INSERT INTO admin_saas_permissions (key, label) VALUES
  ('tenants:view',              'Lihat Tenant'),
  ('tenants:manage',            'Kelola Tenant (edit, provisioning)'),
  ('tenants:suspend',           'Suspend/Reaktivasi Tenant'),
  ('billing:view',              'Lihat Billing'),
  ('billing:manage',            'Kelola Billing (ubah plan, kredit, invoice)'),
  ('plans:manage',              'Kelola Plan & Feature Flags'),
  ('feature_overrides:manage',  'Kelola Override Fitur per-Tenant'),
  ('usage:view',                'Lihat Pemakaian Kuota'),
  ('marketing_content:manage',  'Kelola Konten Marketing'),
  ('support:view',              'Lihat Tiket Support'),
  ('support:manage',            'Kelola Tiket Support'),
  ('audit:view',                'Lihat Audit Log'),
  ('team:manage',                'Kelola Tim Admin SaaS'),
  ('impersonate',               'Login As Tenant (Impersonation)')
ON CONFLICT (key) DO NOTHING;

-- ── Seed: matrix role x permission (spec §5.8, super_admin dapat SEMUA) ────
INSERT INTO admin_saas_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_saas_roles r CROSS JOIN admin_saas_permissions p
 WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO admin_saas_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_saas_roles r JOIN admin_saas_permissions p
  ON p.key IN ('tenants:view','billing:view','billing:manage','plans:manage',
               'feature_overrides:manage','usage:view','audit:view')
 WHERE r.name = 'billing_ops'
ON CONFLICT DO NOTHING;

INSERT INTO admin_saas_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_saas_roles r JOIN admin_saas_permissions p
  ON p.key IN ('tenants:view','billing:view','usage:view',
               'support:view','support:manage','audit:view')
 WHERE r.name = 'support'
ON CONFLICT DO NOTHING;

INSERT INTO admin_saas_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM admin_saas_roles r JOIN admin_saas_permissions p
  ON p.key IN ('tenants:view','usage:view','marketing_content:manage')
 WHERE r.name = 'sales'
ON CONFLICT DO NOTHING;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN
     ('admin_saas_roles','admin_saas_permissions','admin_saas_role_permissions',
      'admin_saas_users','admin_saas_audit_log');
  IF n <> 5 THEN
    RAISE EXCEPTION '504 gagal: hanya % dari 5 tabel yang tercipta', n;
  END IF;

  SELECT count(*) INTO n FROM admin_saas_roles WHERE is_builtin;
  IF n <> 4 THEN
    RAISE EXCEPTION '504 gagal: role bawaan ada % baris, harus 4', n;
  END IF;

  SELECT count(*) INTO n FROM admin_saas_permissions;
  IF n <> 14 THEN
    RAISE EXCEPTION '504 gagal: permission ada % baris, harus 14', n;
  END IF;

  SELECT count(*) INTO n FROM admin_saas_role_permissions rp
    JOIN admin_saas_roles r ON r.id = rp.role_id WHERE r.name = 'super_admin';
  IF n <> 14 THEN
    RAISE EXCEPTION '504 gagal: super_admin punya % permission, harus 14 (semua)', n;
  END IF;

  RAISE NOTICE '504 OK: 5 tabel + 4 role + 14 permission + matrix role_permissions terpasang';
END $$;
