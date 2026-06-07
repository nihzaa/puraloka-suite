-- ============================================================
-- PURALOKA SUITE — Migration 007
-- Mandor Assignments, Work Scopes, Kasbons & Settlements
-- ============================================================

-- ============================================================
-- MANDOR_ASSIGNMENTS
-- Kontainer: mandor X ditugaskan di proyek Y
-- ============================================================
CREATE TABLE mandor_assignments (
  id            UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID                NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mandor_id     UUID                NOT NULL REFERENCES users(id),
  notes         TEXT,
  status        assignment_status   NOT NULL DEFAULT 'active',
  assigned_by   UUID                NOT NULL REFERENCES users(id),
  assigned_at   DATE                NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, mandor_id)   -- Satu mandor hanya bisa 1 assignment per proyek
);

CREATE INDEX idx_mandor_assignments_project_id ON mandor_assignments(project_id);
CREATE INDEX idx_mandor_assignments_mandor_id  ON mandor_assignments(mandor_id);
CREATE INDEX idx_mandor_assignments_status     ON mandor_assignments(status);

COMMENT ON TABLE mandor_assignments IS 'Kontainer penugasan mandor ke proyek — satu mandor bisa punya banyak work scope';

-- ============================================================
-- WORK_SCOPES
-- Unit pekerjaan per mandor — masing-masing punya sistem bayar sendiri
-- ============================================================
CREATE TABLE work_scopes (
  id                    UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id         UUID                NOT NULL REFERENCES mandor_assignments(id) ON DELETE CASCADE,
  scope_name            VARCHAR(255)        NOT NULL,
  description           TEXT,
  payment_system        payment_system      NOT NULL,               -- harian | borongan | progress_pct
  borongan_value        NUMERIC(15,2),                             -- Hanya untuk borongan & progress_pct
  kasbon_limit_pct      NUMERIC(5,2),                              -- Override limit kasbon khusus scope ini (null = ikut project)
  progress_pct_done     NUMERIC(5,2)        NOT NULL DEFAULT 0,
  status                work_scope_status   NOT NULL DEFAULT 'active',
  start_date            DATE,
  end_date              DATE,
  created_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_work_scope_borongan_value  CHECK (borongan_value IS NULL OR borongan_value > 0),
  CONSTRAINT chk_work_scope_kasbon_limit    CHECK (kasbon_limit_pct IS NULL OR (kasbon_limit_pct > 0 AND kasbon_limit_pct <= 100)),
  CONSTRAINT chk_work_scope_progress        CHECK (progress_pct_done >= 0 AND progress_pct_done <= 100),
  CONSTRAINT chk_work_scope_borongan_req    CHECK (
    payment_system = 'harian' OR borongan_value IS NOT NULL
  )
);

CREATE INDEX idx_work_scopes_assignment_id   ON work_scopes(assignment_id);
CREATE INDEX idx_work_scopes_payment_system  ON work_scopes(payment_system);
CREATE INDEX idx_work_scopes_status          ON work_scopes(status);

COMMENT ON TABLE  work_scopes                   IS 'Unit pekerjaan per mandor dengan sistem pembayaran masing-masing';
COMMENT ON COLUMN work_scopes.payment_system    IS 'harian = bayar per hari kerja | borongan = bayar setelah selesai | progress_pct = bayar per persentase progress';
COMMENT ON COLUMN work_scopes.kasbon_limit_pct  IS 'Override limit kasbon untuk scope ini. Null = ikut setting project (default 80% dari earned value)';

-- ============================================================
-- DAILY_WAGE_LOGS
-- Log upah harian — untuk work_scope dengan payment_system = 'harian'
-- ============================================================
CREATE TABLE daily_wage_logs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  work_scope_id   UUID          NOT NULL REFERENCES work_scopes(id) ON DELETE CASCADE,
  work_date       DATE          NOT NULL,
  worker_count    SMALLINT      NOT NULL,
  daily_rate      NUMERIC(12,2) NOT NULL,
  total_amount    NUMERIC(15,2) NOT NULL,                           -- worker_count * daily_rate
  notes           TEXT,
  recorded_by     UUID          NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_daily_wage_worker_count CHECK (worker_count > 0),
  CONSTRAINT chk_daily_wage_daily_rate   CHECK (daily_rate > 0),
  CONSTRAINT chk_daily_wage_total        CHECK (total_amount > 0),
  UNIQUE (work_scope_id, work_date)     -- Satu log per hari per scope
);

CREATE INDEX idx_daily_wage_logs_work_scope_id ON daily_wage_logs(work_scope_id);
CREATE INDEX idx_daily_wage_logs_work_date     ON daily_wage_logs(work_date);

COMMENT ON TABLE  daily_wage_logs             IS 'Log upah harian tukang — dicatat oleh mandor atau PM';
COMMENT ON COLUMN daily_wage_logs.total_amount IS 'Dihitung: worker_count × daily_rate';

-- ============================================================
-- KASBONS
-- Kasbon mandor — berlaku untuk semua payment_system
-- ============================================================
CREATE TABLE kasbons (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  work_scope_id   UUID                NOT NULL REFERENCES work_scopes(id) ON DELETE CASCADE,
  amount          NUMERIC(15,2)       NOT NULL,
  fund_source     kasbon_fund_source  NOT NULL,                     -- owner_advance | client_fund
  purpose         kasbon_purpose      NOT NULL,                     -- gaji_tukang | uang_makan | dll
  kasbon_date     DATE                NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  status          kasbon_status       NOT NULL DEFAULT 'pending',
  requested_by    UUID                NOT NULL REFERENCES users(id),
  approved_by     UUID                REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_kasbon_amount CHECK (amount > 0)
);

CREATE INDEX idx_kasbons_work_scope_id ON kasbons(work_scope_id);
CREATE INDEX idx_kasbons_status        ON kasbons(status);
CREATE INDEX idx_kasbons_kasbon_date   ON kasbons(kasbon_date);
CREATE INDEX idx_kasbons_fund_source   ON kasbons(fund_source);

COMMENT ON TABLE  kasbons              IS 'Kasbon mandor — berlaku untuk semua sistem pembayaran (harian, borongan, progress_pct)';
COMMENT ON COLUMN kasbons.fund_source  IS 'owner_advance = talangan dari kantong owner | client_fund = dari uang muka klien yang sudah masuk';
COMMENT ON COLUMN kasbons.purpose      IS 'Tujuan kasbon: gaji_tukang | uang_makan | pembelian_alat | operasional | lain_lain';

-- ============================================================
-- PROGRESS_PAYMENTS
-- Pembayaran per persentase progress — untuk payment_system = 'progress_pct'
-- ============================================================
CREATE TABLE progress_payments (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  work_scope_id     UUID          NOT NULL REFERENCES work_scopes(id) ON DELETE CASCADE,
  pct_completed     NUMERIC(5,2)  NOT NULL,                         -- Persentase progress saat dibayar
  earned_value      NUMERIC(15,2) NOT NULL,                         -- pct_completed * borongan_value / 100
  gross_payment     NUMERIC(15,2) NOT NULL,                         -- Yang seharusnya dibayar
  deducted_kasbon   NUMERIC(15,2) NOT NULL DEFAULT 0,               -- Total kasbon yang dipotong
  net_payment       NUMERIC(15,2) NOT NULL,                         -- gross_payment - deducted_kasbon
  paid_at           DATE          NOT NULL DEFAULT CURRENT_DATE,
  payment_method    payment_method NOT NULL DEFAULT 'transfer_bank',
  ref_number        VARCHAR(255),
  notes             TEXT,
  approved_by       UUID          NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_progress_pct_completed  CHECK (pct_completed > 0 AND pct_completed <= 100),
  CONSTRAINT chk_progress_earned_value   CHECK (earned_value > 0),
  CONSTRAINT chk_progress_gross_payment  CHECK (gross_payment > 0),
  CONSTRAINT chk_progress_deducted       CHECK (deducted_kasbon >= 0),
  CONSTRAINT chk_progress_net_payment    CHECK (net_payment >= 0)
);

CREATE INDEX idx_progress_payments_work_scope_id ON progress_payments(work_scope_id);
CREATE INDEX idx_progress_payments_paid_at       ON progress_payments(paid_at);

COMMENT ON TABLE  progress_payments               IS 'Pembayaran mandor berdasarkan persentase progress pekerjaan';
COMMENT ON COLUMN progress_payments.earned_value  IS 'Nilai yang earned: pct_completed × borongan_value / 100';
COMMENT ON COLUMN progress_payments.deducted_kasbon IS 'Total kasbon yang dipotong dari pembayaran ini';
COMMENT ON COLUMN progress_payments.net_payment   IS 'Yang benar-benar ditransfer: gross_payment - deducted_kasbon';

-- ============================================================
-- BORONGAN_SETTLEMENTS
-- Settlement akhir pekerjaan borongan
-- ============================================================
CREATE TABLE borongan_settlements (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  work_scope_id       UUID          NOT NULL REFERENCES work_scopes(id),
  borongan_value      NUMERIC(15,2) NOT NULL,
  total_kasbon        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_progress_paid NUMERIC(15,2) NOT NULL DEFAULT 0,            -- Total yang sudah dibayar via progress_payments
  total_other_expense NUMERIC(15,2) NOT NULL DEFAULT 0,            -- Pengeluaran lain yang ditanggung owner
  remaining_balance   NUMERIC(15,2) NOT NULL,                      -- Positif = owner masih hutang ke mandor | Negatif = mandor lebih
  settled_at          DATE          NOT NULL DEFAULT CURRENT_DATE,
  notes               TEXT,
  approved_by         UUID          NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (work_scope_id)           -- Satu work scope hanya bisa settle sekali
);

CREATE INDEX idx_borongan_settlements_work_scope_id ON borongan_settlements(work_scope_id);

COMMENT ON TABLE  borongan_settlements                    IS 'Settlement akhir pekerjaan borongan saat pekerjaan selesai';
COMMENT ON COLUMN borongan_settlements.remaining_balance  IS 'Positif = masih harus bayar ke mandor | Negatif = mandor kelebihan terima';
