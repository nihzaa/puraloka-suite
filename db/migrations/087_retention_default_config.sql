-- Migration 087: retensi default → financial_config effective-dated (AKTA 3, green atas engine 086)
--
-- Q1 owner: retensi 5% sebagai NILAI AWAL (bukan konstanta), diatur UI, override per
-- proyek, effective-dated. Reuse engine financial_config (086) — bukti engine
-- menggeneralisasi di luar pajak.
--
-- ADDITIF: hanya seed 1 key. Konvensi SERAGAM financial_config = FRAKSI 0..1 (retensi
-- 5% = 0.05, seperti tarif pajak). projects.ts mengalikan ×100 untuk kolom persen
-- `projects.retention_pct` (NUMERIC persen). Perilaku hari ini identik (default 5%).

INSERT INTO financial_config (key, value, value_type, effective_from, note) VALUES
  ('retention.default_pct', '0.05'::jsonb, 'number', '2000-01-01',
   'Default retensi 5% (migrasi dari hardcode projects.ts). Override per proyek tetap bisa.')
ON CONFLICT DO NOTHING;
