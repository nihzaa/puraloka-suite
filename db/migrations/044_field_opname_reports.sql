-- Migration 044: Field Opname Reports + Subkontraktor Enhancement (Modul 11a & 11b)
-- Adds field_opname_reports table (berita acara opname fisik) as a hard prerequisite
-- before releasing borongan/progress_pct payments.
-- Also adds digital contract signing columns to work_scopes (Modul 11b).

-- Tabel: Berita Acara Opname Fisik
-- PM WAJIB submit dan admin/PM verify sebelum progress payment bisa dibuat
-- untuk work_scope dengan payment_system IN ('borongan', 'progress_pct').
CREATE TABLE IF NOT EXISTS field_opname_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_scope_id    UUID NOT NULL REFERENCES work_scopes(id),
  project_id       UUID NOT NULL REFERENCES projects(id),
  opname_date      DATE NOT NULL,
  measured_by      UUID NOT NULL REFERENCES users(id),   -- PM yang opname lapangan

  -- Item yang diukur (opsional link ke scope item spesifik)
  -- FK ke work_scope_items disengaja tidak di-enforce agar opname bisa dibuat
  -- sebelum scope items detail diisi, atau untuk opname level scope keseluruhan.
  scope_item_id    UUID REFERENCES work_scope_items(id) ON DELETE SET NULL,
  planned_volume   DECIMAL(15,3),
  measured_volume  DECIMAL(15,3) NOT NULL CHECK (measured_volume >= 0),
  unit             TEXT NOT NULL,
  completion_pct   DECIMAL(5,2) NOT NULL
    CHECK (completion_pct >= 0 AND completion_pct <= 100),

  -- Dokumentasi bukti
  photo_urls       TEXT[],
  notes            TEXT,

  -- Workflow status
  status           TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'verified', 'disputed')),
  verified_by      UUID REFERENCES users(id),
  verified_at      TIMESTAMPTZ,
  dispute_reason   TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kolom baru di progress_payments untuk link ke opname report
-- Pastikan tabel progress_payments sudah ada (dari migration 007)
-- requires_opname DEFAULT true, tapi application layer WAJIB cek work_scope.payment_system:
--   harian      → requires_opname diabaikan (pembayaran mingguan, bukan per progress)
--   borongan    → hard-lock aktif, opname wajib verified sebelum rilis
--   progress_pct → hard-lock aktif, opname wajib verified sebelum rilis
ALTER TABLE progress_payments
  ADD COLUMN IF NOT EXISTS opname_report_id UUID REFERENCES field_opname_reports(id),
  ADD COLUMN IF NOT EXISTS requires_opname  BOOLEAN NOT NULL DEFAULT true;

-- Kolom baru di work_scopes untuk digital contract signing (Modul 11b)
-- Internal e-signature: gambar TTD disimpan sebagai PNG di Supabase Storage
ALTER TABLE work_scopes
  ADD COLUMN IF NOT EXISTS contract_pdf_url        TEXT,
  ADD COLUMN IF NOT EXISTS contract_signed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mandor_signature_url    TEXT,
  ADD COLUMN IF NOT EXISTS pm_signature_url        TEXT,
  ADD COLUMN IF NOT EXISTS contract_status         TEXT NOT NULL DEFAULT 'unsigned'
    CHECK (contract_status IN ('unsigned', 'signed', 'disputed'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_field_opname_reports_scope   ON field_opname_reports(work_scope_id);
CREATE INDEX IF NOT EXISTS idx_field_opname_reports_project ON field_opname_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_field_opname_reports_status  ON field_opname_reports(status);
CREATE INDEX IF NOT EXISTS idx_progress_payments_opname     ON progress_payments(opname_report_id)
  WHERE opname_report_id IS NOT NULL;

-- protect_created_at trigger
CREATE OR REPLACE FUNCTION protect_field_opname_created_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at = OLD.created_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_field_opname_created_at
  BEFORE UPDATE ON field_opname_reports
  FOR EACH ROW EXECUTE FUNCTION protect_field_opname_created_at();

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_field_opname_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_field_opname_updated_at
  BEFORE UPDATE ON field_opname_reports
  FOR EACH ROW EXECUTE FUNCTION set_field_opname_updated_at();
