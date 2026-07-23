-- Migration 088: toggle batas kasbon (config-first, AKTA 3 Q2)
--
-- ADDITIF: seed 1 company_settings boolean. TOGGLE DEFAULT OFF (false) — enforcement
-- batas kasbon MATI, perilaku hari ini TIDAK berubah (additive-first, Q2).
--
-- Batas % = kolom projects.kasbon_limit_pct (sudah ada, default 80, per proyek).
-- Toggle di company_settings (bukan financial_config) karena bukan tarif document-dated:
-- batas ditegakkan LIVE saat approve dengan setting terkini, bukan per tanggal dokumen.

INSERT INTO company_settings (key, value, value_type, category, description) VALUES
  ('kasbon.limit.enabled', 'false'::jsonb, 'boolean', 'kasbon',
   'Aktifkan batas kasbon (max % earned value untuk scope progress_pct). Default MATI.')
ON CONFLICT (key) DO NOTHING;
