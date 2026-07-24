-- Migration 091: Mesin Denda Keterlambatan (late-payment penalty) — AKTA 3 config-first
-- ⚠️ Red-Line §5#2 (logika finansial BARU) — DANGER GATE disetujui founder dgn 6 syarat.
--
-- KONTEKS PENTING: Puraloka SAAT INI TIDAK menerapkan denda (klien mayoritas perorangan,
-- hubungan personal). Mesin dibangun agar bisa DINYALAKAN tanpa deploy. DEFAULT OFF →
-- nol perubahan perilaku sampai founder menyalakannya di UI. (DOMAIN.md § Denda).
--
-- 6 syarat founder yang ditegakkan:
--  (1) SEMUA parameter = config effective-dated (bukan konstanta): enabled, basis, rate,
--      cap, grace — via financial_config (reuse EXCLUDE anti-overlap 086, C4).
--  (2) OVERRIDE PER PROYEK (denda = syarat kontrak, beda per klien) — kolom nullable di
--      projects (null = pakai global effective). Pola sama seperti retensi_pct.
--  (3) WAIVER/PEMUTIHAN per invoice + alasan WAJIB + audit + gated finance:penalty:waive.
--  (4) Estimasi compute-on-read (tampilan) TIDAK dipersist — bukan angka resmi (C5 aman).
--      Angka OTORITATIF dipersist saat event (invoice_penalties, immutable).
--  (5) Hari telat berbasis WIB (Asia/Jakarta), konsisten effective-dating pajak.
--  (6) DEFAULT OFF.

-- ─── (1) Config global effective-dated (financial_config) — seed berlaku SEJAK EPOCH ──
-- Nilai fraksi 0..1 (konvensi seragam financial_config). rate 0.001 = 1‰/hari; cap 0.05 = 5%.
INSERT INTO financial_config (key, value, value_type, effective_from, note) VALUES
  ('penalty.enabled',      'false'::jsonb,           'boolean', '2000-01-01', 'Denda keterlambatan aktif? DEFAULT OFF (Puraloka belum pakai denda)'),
  ('penalty.basis',        '"invoice_telat"'::jsonb, 'string',  '2000-01-01', 'Basis nilai denda: invoice_telat | outstanding_proyek | kontrak_total'),
  ('penalty.rate_per_day', '0.001'::jsonb,           'number',  '2000-01-01', 'Tarif denda per hari (fraksi). 0.001 = 1‰/hari'),
  ('penalty.cap_pct',      '0.05'::jsonb,            'number',  '2000-01-01', 'Batas maksimum denda (fraksi dari basis). 0.05 = 5%'),
  ('penalty.grace_days',   '0'::jsonb,               'number',  '2000-01-01', 'Masa toleransi (hari) sebelum denda mulai. Default 0 = H+1')
ON CONFLICT DO NOTHING;

-- ─── (2) Override per proyek (null = pakai global effective) ───────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS penalty_enabled      BOOLEAN,
  ADD COLUMN IF NOT EXISTS penalty_basis        TEXT,
  ADD COLUMN IF NOT EXISTS penalty_rate_per_day NUMERIC,
  ADD COLUMN IF NOT EXISTS penalty_cap_pct      NUMERIC,
  ADD COLUMN IF NOT EXISTS penalty_grace_days   INTEGER;
COMMENT ON COLUMN projects.penalty_enabled IS 'Override denda per proyek (syarat kontrak). NULL = pakai financial_config global effective. Pola sama retensi_pct.';
-- Guard basis enum bila di-set (NULL diperbolehkan = pakai global).
ALTER TABLE projects DROP CONSTRAINT IF EXISTS chk_projects_penalty_basis;
ALTER TABLE projects ADD CONSTRAINT chk_projects_penalty_basis
  CHECK (penalty_basis IS NULL OR penalty_basis IN ('invoice_telat','outstanding_proyek','kontrak_total'));

-- ─── (3) Waiver per invoice + jejak audit ──────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS penalty_waived        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS penalty_waived_reason TEXT,
  ADD COLUMN IF NOT EXISTS penalty_waived_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS penalty_waived_at     TIMESTAMPTZ;
COMMENT ON COLUMN invoices.penalty_waived IS 'Denda invoice ini diputihkan? Perubahan HANYA via finance:penalty:waive + alasan wajib + audit_logs (bukan ubah tanggal).';

-- ─── (4) Angka OTORITATIF dipersist (immutable) — satu baris saat invoice lunas telat ─
CREATE TABLE IF NOT EXISTS invoice_penalties (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  project_id     UUID REFERENCES projects(id) ON DELETE SET NULL,
  basis          TEXT NOT NULL,                 -- basis yang dipakai saat hitung
  base_amount    NUMERIC NOT NULL,              -- nilai basis (mis. total_amount invoice)
  days_late      INTEGER NOT NULL,              -- hari telat efektif (setelah grace, WIB)
  grace_days     INTEGER NOT NULL,
  rate_per_day   NUMERIC NOT NULL,              -- tarif effective yang dipakai (jejak)
  cap_pct        NUMERIC NOT NULL,
  raw_amount     NUMERIC NOT NULL,              -- base × rate × days (sebelum cap)
  penalty_amount NUMERIC NOT NULL,              -- setelah cap (angka resmi)
  anchor_date    DATE NOT NULL,                 -- tanggal pembayaran pelunasan (WIB) — anchor hari telat
  due_date       DATE NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Satu denda otoritatif per invoice (dihitung sekali saat pelunasan telat).
  CONSTRAINT uq_invoice_penalty UNIQUE (invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_invoice_penalties_project ON invoice_penalties(project_id);
COMMENT ON TABLE invoice_penalties IS 'Denda keterlambatan OTORITATIF (immutable), dihitung sekali saat invoice lunas telat. Estimasi tampilan (invoice belum lunas) TIDAK disimpan di sini — dihitung on-read & dilabeli estimasi.';

-- ─── Derive capability (ADR-004): finance:penalty:waive — seed admin ───────────────
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('finance:penalty:waive', 'finance', 'Putihkan Denda Invoice',
   'Membebaskan (waive) denda keterlambatan sebuah invoice — wajib alasan, tercatat audit', 60)
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.key = 'finance:penalty:waive'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── RLS (pola 1A) untuk invoice_penalties ─────────────────────────────────────────
ALTER TABLE invoice_penalties ENABLE ROW LEVEL SECURITY;
-- Read: pemegang finance:view:all (admin+pm) — denda = data finansial. service_role bypass.
CREATE POLICY "invoice_penalties_read" ON invoice_penalties
  FOR SELECT USING (has_permission('finance:view:all') OR auth.role() = 'service_role');
-- Tulis: TIDAK ADA policy untuk non-service → hanya API (service_role) yang boleh menulis
-- (angka otoritatif dihitung sistem, bukan diinput manusia).
