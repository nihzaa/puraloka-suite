-- Migration 089: default proyek baru → config (AKTA 3 Q4/Q5)
--
-- ADDITIF: 2 company_settings. Q4 (DP default %) & Q5 (masa pemeliharaan default hari)
-- yang selama ini HARDCODE di project-modal.tsx (DP 30%, retensi termin due_days 90).
-- Kini disetel di UI, auto-terisi saat buat proyek, tetap override per proyek.
--
-- Retensi default sudah di financial_config (087). DP% & maintenance days = default
-- FORM (current-value, bukan effective-dated) → company_settings.

INSERT INTO company_settings (key, value, value_type, category, description) VALUES
  ('project.dp_default_pct',   '30'::jsonb, 'number', 'project', 'Default % uang muka (DP) termin on_sign saat buat proyek baru. Boleh diubah/dikosongkan per proyek.'),
  ('project.maintenance_days', '90'::jsonb, 'number', 'project', 'Default masa pemeliharaan (hari) untuk termin retensi (on_retention) saat buat proyek baru.')
ON CONFLICT (key) DO NOTHING;
