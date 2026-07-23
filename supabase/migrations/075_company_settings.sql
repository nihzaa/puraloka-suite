-- Migration 075: company_settings (Sub-Fase 1B, Epic 1B.1 Configuration Engine)
-- ADDITIVE murni — tabel key-value config yang bisa diubah admin tanpa deploy.
-- Melanjutkan prinsip config-driven Sub-Fase 1A ke lapis konfigurasi.
--
-- Kasus pertama: tax rate (sebelumnya hardcode di lib/tax-calculation.ts:4-5).
-- company_profile (migration 032) = profil single-row; company_settings = key-value
-- multi-entry. Keduanya koeksis, beda peran.

CREATE TABLE IF NOT EXISTS company_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,          -- 'tax.ppn_rate', 'tax.pph_final_rate'
  value       JSONB NOT NULL,                -- disimpan sebagai JSONB (angka/string/bool/json)
  value_type  TEXT NOT NULL CHECK (value_type IN ('number','string','boolean','json')),
  category    TEXT NOT NULL,                 -- 'tax' | 'approval' | 'notification' | ...
  description TEXT,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_settings_category ON company_settings(category);

COMMENT ON TABLE company_settings IS 'Konfigurasi key-value yang dapat diubah admin tanpa deploy (Sub-Fase 1B). Kasus awal: tax rate.';

-- Seed: tax rate (nilai dari lib/tax-calculation.ts:4-5 — pindah dari hardcode ke config)
INSERT INTO company_settings (key, value, value_type, category, description) VALUES
  ('tax.ppn_rate',        '0.11'::jsonb, 'number', 'tax', 'Tarif PPN (default 11%)'),
  ('tax.pph_final_rate',  '0.02'::jsonb, 'number', 'tax', 'Tarif PPh final Pasal 4(2) (default 2%)')
ON CONFLICT (key) DO NOTHING;

-- ─── RLS (pola Sub-Fase 1A: has_permission, bukan literal role) ──────────────
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Read: semua authenticated (config dibaca luas, mis. tax rate dipakai calc)
CREATE POLICY "company_settings_read" ON company_settings
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Write: hanya yang punya settings:manage (admin default) via has_permission
CREATE POLICY "company_settings_write" ON company_settings
  FOR ALL USING (has_permission('settings:manage'))
  WITH CHECK (has_permission('settings:manage'));
