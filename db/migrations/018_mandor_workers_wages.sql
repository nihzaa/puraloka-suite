-- ============================================================
-- PURALOKA SUITE — Migration 018
-- Modul Mandor: Workers, Worker Kasbons, Weekly Wage Reports
-- ============================================================

-- ============================================================
-- WORKERS
-- Tukang yang bekerja di bawah mandor
-- Auto-create saat kasbon pertama, bisa juga didaftarkan manual
-- ============================================================
CREATE TABLE workers (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  mandor_id   UUID          NOT NULL REFERENCES users(id),
  name        VARCHAR(255)  NOT NULL,
  phone       VARCHAR(20),
  notes       TEXT,
  is_active   BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (mandor_id, name)  -- Nama unik per mandor
);

CREATE INDEX idx_workers_mandor_id  ON workers(mandor_id);
CREATE INDEX idx_workers_is_active  ON workers(is_active);

COMMENT ON TABLE workers IS 'Tukang per mandor — auto-create saat kasbon pertama atau didaftarkan manual';

-- ============================================================
-- WORKER_KASBONS
-- Kasbon per tukang dari kas proyek (mandor sebagai perantara)
-- Berbeda dari kasbons (kasbon mandor ke owner) —
-- ini kasbon tukang ke proyek, dikelola oleh mandor
-- ============================================================
CREATE TABLE worker_kasbons (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     UUID          NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  mandor_id     UUID          NOT NULL REFERENCES users(id),
  project_id    UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_id      UUID          REFERENCES work_scopes(id),
  amount        NUMERIC(15,2) NOT NULL,
  purpose       VARCHAR(255)  NOT NULL DEFAULT 'gaji_tukang',  -- gaji_tukang | uang_makan | lain_lain
  kasbon_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  -- Pelunasan: bisa lunas sekaligus atau cicilan
  amount_settled NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_settled    BOOLEAN       NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_worker_kasbon_amount    CHECK (amount > 0),
  CONSTRAINT chk_worker_kasbon_settled   CHECK (amount_settled >= 0 AND amount_settled <= amount)
);

CREATE INDEX idx_worker_kasbons_worker_id   ON worker_kasbons(worker_id);
CREATE INDEX idx_worker_kasbons_mandor_id   ON worker_kasbons(mandor_id);
CREATE INDEX idx_worker_kasbons_project_id  ON worker_kasbons(project_id);
CREATE INDEX idx_worker_kasbons_is_settled  ON worker_kasbons(is_settled);
CREATE INDEX idx_worker_kasbons_kasbon_date ON worker_kasbons(kasbon_date);

COMMENT ON TABLE  worker_kasbons IS 'Kasbon tukang dari kas proyek — mandor sebagai perantara, dilunasi via potongan upah';

-- ============================================================
-- WEEKLY_WAGE_REPORTS
-- Pengajuan upah mingguan per mandor per work_scope
-- Satu laporan = satu minggu = satu scope
-- ============================================================
CREATE TYPE wage_report_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'paid');

CREATE TABLE weekly_wage_reports (
  id            UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID                NOT NULL REFERENCES mandor_assignments(id) ON DELETE CASCADE,
  scope_id      UUID                NOT NULL REFERENCES work_scopes(id) ON DELETE CASCADE,
  week_start    DATE                NOT NULL,  -- Senin dari minggu tersebut
  week_end      DATE                NOT NULL,  -- Minggu dari minggu tersebut
  status        wage_report_status  NOT NULL DEFAULT 'draft',
  subtotal      NUMERIC(15,2)       NOT NULL DEFAULT 0,  -- Total upah sebelum potongan
  total_deduction NUMERIC(15,2)     NOT NULL DEFAULT 0,  -- Total potongan (kasbon + cicilan)
  net_amount    NUMERIC(15,2)       NOT NULL DEFAULT 0,  -- Yang benar-benar dibayar
  notes         TEXT,
  submitted_at  TIMESTAMPTZ,
  reviewed_by   UUID                REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  review_notes  TEXT,
  paid_at       DATE,
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  UNIQUE (scope_id, week_start),  -- Satu laporan per scope per minggu

  CONSTRAINT chk_wage_report_week CHECK (week_end >= week_start),
  CONSTRAINT chk_wage_report_subtotal     CHECK (subtotal >= 0),
  CONSTRAINT chk_wage_report_deduction    CHECK (total_deduction >= 0),
  CONSTRAINT chk_wage_report_net          CHECK (net_amount >= 0)
);

CREATE INDEX idx_weekly_wage_reports_assignment_id ON weekly_wage_reports(assignment_id);
CREATE INDEX idx_weekly_wage_reports_scope_id      ON weekly_wage_reports(scope_id);
CREATE INDEX idx_weekly_wage_reports_week_start    ON weekly_wage_reports(week_start);
CREATE INDEX idx_weekly_wage_reports_status        ON weekly_wage_reports(status);

COMMENT ON TABLE weekly_wage_reports IS 'Laporan upah mingguan mandor per work scope — diajukan sabtu, diapprove PM/admin';

-- ============================================================
-- WAGE_ITEMS
-- Rincian upah per tukang dalam satu laporan mingguan
-- ============================================================
CREATE TABLE wage_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID          NOT NULL REFERENCES weekly_wage_reports(id) ON DELETE CASCADE,
  worker_name     VARCHAR(255)  NOT NULL,       -- Nama string, bisa diisi bebas
  worker_id       UUID          REFERENCES workers(id),  -- Link ke master worker jika kasbon aktif
  days_worked     NUMERIC(4,1)  NOT NULL,        -- Jumlah hari (bisa 0.5 untuk setengah hari)
  daily_rate      NUMERIC(12,2) NOT NULL,
  overtime_hours  NUMERIC(5,1)  NOT NULL DEFAULT 0,
  overtime_rate   NUMERIC(12,2) NOT NULL DEFAULT 0,  -- Rate per jam lembur
  subtotal        NUMERIC(15,2) NOT NULL,        -- (days_worked * daily_rate) + (overtime_hours * overtime_rate)
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_wage_item_days         CHECK (days_worked >= 0),
  CONSTRAINT chk_wage_item_daily_rate   CHECK (daily_rate >= 0),
  CONSTRAINT chk_wage_item_overtime_hrs CHECK (overtime_hours >= 0),
  CONSTRAINT chk_wage_item_overtime_rate CHECK (overtime_rate >= 0),
  CONSTRAINT chk_wage_item_subtotal     CHECK (subtotal >= 0)
);

CREATE INDEX idx_wage_items_report_id  ON wage_items(report_id);
CREATE INDEX idx_wage_items_worker_id  ON wage_items(worker_id);

COMMENT ON TABLE  wage_items IS 'Rincian upah per tukang dalam laporan mingguan';
COMMENT ON COLUMN wage_items.worker_name IS 'Nama string bebas — tidak harus ada di tabel workers';
COMMENT ON COLUMN wage_items.worker_id   IS 'Link ke master worker jika tukang punya kasbon aktif';

-- ============================================================
-- WAGE_DEDUCTIONS
-- Potongan dalam laporan upah (kasbon + cicilan kasbon tukang)
-- ============================================================
CREATE TABLE wage_deductions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id           UUID          NOT NULL REFERENCES weekly_wage_reports(id) ON DELETE CASCADE,
  worker_kasbon_id    UUID          REFERENCES worker_kasbons(id),  -- Null = potongan BON mandor biasa
  label               VARCHAR(255)  NOT NULL,  -- "Potong BON", "Elca cicilan ke-23", dll
  amount              NUMERIC(15,2) NOT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_wage_deduction_amount CHECK (amount > 0)
);

CREATE INDEX idx_wage_deductions_report_id          ON wage_deductions(report_id);
CREATE INDEX idx_wage_deductions_worker_kasbon_id   ON wage_deductions(worker_kasbon_id);

COMMENT ON TABLE wage_deductions IS 'Potongan dalam laporan upah — kasbon mandor atau cicilan kasbon tukang';

-- ============================================================
-- TRIGGER: auto-update wage_report totals saat item/deduction berubah
-- ============================================================
CREATE OR REPLACE FUNCTION fn_recalc_wage_report()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_report_id UUID;
  v_subtotal  NUMERIC(15,2);
  v_deduction NUMERIC(15,2);
BEGIN
  v_report_id := COALESCE(NEW.report_id, OLD.report_id);

  SELECT COALESCE(SUM(subtotal), 0)
    INTO v_subtotal
    FROM wage_items
   WHERE report_id = v_report_id;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_deduction
    FROM wage_deductions
   WHERE report_id = v_report_id;

  UPDATE weekly_wage_reports
     SET subtotal        = v_subtotal,
         total_deduction = v_deduction,
         net_amount      = GREATEST(v_subtotal - v_deduction, 0),
         updated_at      = NOW()
   WHERE id = v_report_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wage_items_recalc
AFTER INSERT OR UPDATE OR DELETE ON wage_items
FOR EACH ROW EXECUTE FUNCTION fn_recalc_wage_report();

CREATE TRIGGER trg_wage_deductions_recalc
AFTER INSERT OR UPDATE OR DELETE ON wage_deductions
FOR EACH ROW EXECUTE FUNCTION fn_recalc_wage_report();

-- ============================================================
-- TRIGGER: auto-update worker_kasbon.amount_settled saat deduction settle
-- Saat wage_report di-approve, update amount_settled di worker_kasbons
-- ============================================================
CREATE OR REPLACE FUNCTION fn_settle_worker_kasbon_on_approve()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Saat status berubah ke 'approved' atau 'paid'
  IF NEW.status IN ('approved', 'paid') AND OLD.status NOT IN ('approved', 'paid') THEN
    -- Update amount_settled untuk semua worker_kasbon yang dikutip di laporan ini
    UPDATE worker_kasbons wk
       SET amount_settled = amount_settled + wd.amount,
           is_settled     = CASE WHEN (amount_settled + wd.amount) >= wk.amount THEN true ELSE false END,
           updated_at     = NOW()
      FROM wage_deductions wd
     WHERE wd.report_id = NEW.id
       AND wd.worker_kasbon_id = wk.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wage_report_settle_kasbon
AFTER UPDATE OF status ON weekly_wage_reports
FOR EACH ROW EXECUTE FUNCTION fn_settle_worker_kasbon_on_approve();
