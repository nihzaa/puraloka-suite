-- ============================================================
-- PURALOKA SUITE — Migration 003
-- Projects & Contract Models
-- ============================================================

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
  id                    UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id             UUID            NOT NULL REFERENCES clients(id),
  pm_id                 UUID            NOT NULL REFERENCES users(id),
  name                  VARCHAR(255)    NOT NULL,
  description           TEXT,
  location              TEXT            NOT NULL,
  contract_model        contract_model  NOT NULL DEFAULT 'termin',
  tax_scheme            tax_scheme      NOT NULL DEFAULT 'pph_final',
  contract_value        NUMERIC(15,2)   NOT NULL DEFAULT 0,
  commission_pct        NUMERIC(5,2),                               -- Hanya untuk model komisi (%)
  retention_pct         NUMERIC(5,2)    NOT NULL DEFAULT 5.00,      -- Default retensi 5%
  retention_amount      NUMERIC(15,2)   NOT NULL DEFAULT 0,         -- Dihitung otomatis
  kasbon_limit_pct      NUMERIC(5,2)    NOT NULL DEFAULT 80.00,     -- Batas kasbon progress (%)
  start_date            DATE            NOT NULL,
  end_date              DATE            NOT NULL,
  actual_end_date       DATE,
  status                project_status  NOT NULL DEFAULT 'draft',
  progress_pct          NUMERIC(5,2)    NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_by            UUID            NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_end_date_after_start CHECK (end_date >= start_date),
  CONSTRAINT chk_commission_pct       CHECK (commission_pct IS NULL OR (commission_pct > 0 AND commission_pct <= 100)),
  CONSTRAINT chk_retention_pct        CHECK (retention_pct >= 0 AND retention_pct <= 100),
  CONSTRAINT chk_kasbon_limit_pct     CHECK (kasbon_limit_pct > 0 AND kasbon_limit_pct <= 100),
  CONSTRAINT chk_progress_pct         CHECK (progress_pct >= 0 AND progress_pct <= 100)
);

CREATE INDEX idx_projects_client_id     ON projects(client_id);
CREATE INDEX idx_projects_pm_id         ON projects(pm_id);
CREATE INDEX idx_projects_status        ON projects(status);
CREATE INDEX idx_projects_contract_model ON projects(contract_model);
CREATE INDEX idx_projects_start_date    ON projects(start_date);

COMMENT ON TABLE  projects                  IS 'Master data proyek konstruksi';
COMMENT ON COLUMN projects.contract_model   IS 'termin = tagih per tahap | komisi = lapor pengeluaran + persentase fee';
COMMENT ON COLUMN projects.tax_scheme       IS 'pph_final = PPh 4(2) untuk perorangan | ppn = PPN 11% untuk B2B';
COMMENT ON COLUMN projects.commission_pct   IS 'Persentase komisi dari total pengeluaran (hanya untuk model komisi)';
COMMENT ON COLUMN projects.retention_pct    IS 'Persentase retensi yang ditahan klien sampai serah terima';
COMMENT ON COLUMN projects.kasbon_limit_pct IS 'Batas maksimal kasbon dari earned value untuk sistem progress_pct (default 80%)';

-- ============================================================
-- TERMIN SCHEDULES
-- Hanya untuk project dengan contract_model = 'termin'
-- ============================================================
CREATE TABLE termin_schedules (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  termin_number   SMALLINT        NOT NULL,
  label           VARCHAR(255)    NOT NULL,                        -- Misal: "DP", "Termin 1 - Pondasi selesai"
  amount          NUMERIC(15,2)   NOT NULL,
  pct_of_contract NUMERIC(5,2)    NOT NULL,                        -- Persentase dari nilai kontrak
  target_date     DATE,
  status          termin_status   NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_termin_amount          CHECK (amount > 0),
  CONSTRAINT chk_termin_pct_of_contract CHECK (pct_of_contract > 0 AND pct_of_contract <= 100),
  UNIQUE (project_id, termin_number)
);

CREATE INDEX idx_termin_schedules_project_id ON termin_schedules(project_id);
CREATE INDEX idx_termin_schedules_status     ON termin_schedules(status);

COMMENT ON TABLE  termin_schedules        IS 'Jadwal penagihan termin untuk project model termin';
COMMENT ON COLUMN termin_schedules.label  IS 'Deskripsi termin, misal: DP 30%, Termin 1 - Pondasi selesai';
