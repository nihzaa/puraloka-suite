-- ============================================================
-- PURALOKA SUITE — Migration 002
-- Users & Clients
-- ============================================================

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id           UUID          UNIQUE,                          -- Supabase auth.users id
  name              VARCHAR(255)  NOT NULL,
  email             VARCHAR(255)  NOT NULL UNIQUE,
  phone             VARCHAR(20),
  role              user_role     NOT NULL DEFAULT 'pm',
  avatar_url        TEXT,
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_auth_id   ON users(auth_id);
CREATE INDEX idx_users_role      ON users(role);
CREATE INDEX idx_users_email     ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);

COMMENT ON TABLE  users             IS 'Semua pengguna sistem: admin, PM, mandor, client';
COMMENT ON COLUMN users.auth_id     IS 'Foreign key ke Supabase auth.users';
COMMENT ON COLUMN users.role        IS 'admin | pm | mandor | client';

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE clients (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name      VARCHAR(255),                                  -- Null jika perorangan
  contact_person    VARCHAR(255)  NOT NULL,
  phone             VARCHAR(20)   NOT NULL,
  email             VARCHAR(255),
  address           TEXT,
  npwp              VARCHAR(30),                                   -- NPWP untuk keperluan pajak
  id_number         VARCHAR(30),                                   -- NIK untuk perorangan
  client_type       VARCHAR(20)   NOT NULL DEFAULT 'perorangan'   -- perorangan | perusahaan
                    CHECK (client_type IN ('perorangan', 'perusahaan')),
  notes             TEXT,
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  created_by        UUID          NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_contact_person ON clients(contact_person);
CREATE INDEX idx_clients_client_type    ON clients(client_type);
CREATE INDEX idx_clients_is_active      ON clients(is_active);
CREATE INDEX idx_clients_created_by     ON clients(created_by);

COMMENT ON TABLE  clients              IS 'Data klien perusahaan konstruksi Puraloka Persada';
COMMENT ON COLUMN clients.client_type  IS 'perorangan (default) atau perusahaan — menentukan skema pajak';
COMMENT ON COLUMN clients.npwp         IS 'NPWP klien untuk keperluan pembuatan faktur pajak';
