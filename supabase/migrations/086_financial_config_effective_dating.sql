-- Migration 086: financial_config effective-dated (Sub-Fase config-first, AKTA 3)
-- ⚠️ Red-Line §5#2 (logika finansial) — DANGER GATE disetujui founder (opsi 3, 7 syarat).
--
-- Config finansial (tarif pajak, retensi, denda) WAJIB effective-dated (§12): perhitungan
-- dokumen memakai tarif YANG BERLAKU SAAT DOKUMEN DITERBITKAN, bukan tarif terkini.
--
-- Syarat founder yang ditegakkan di sini:
--   C4 ANTI-OVERLAP: EXCLUDE constraint (btree_gist + daterange) mencegah rentang
--      tanggal tumpang tindih per key — bukan cuma "satu baris aktif". Anti-gap
--      ditegakkan di layer aplikasi (close-then-insert: tutup rentang lama tepat di
--      tanggal mulai rentang baru → nol celah).
--   Half-open [from, to): batas bawah inklusif, atas eksklusif → transisi tarif mulus
--      (tarif berlaku 1 Jan: dokumen 31 Des pakai lama, 1 Jan pakai baru).

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS financial_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key            TEXT NOT NULL,                 -- 'tax.ppn_rate', 'tax.pph_final_rate', 'retention.default_pct', ...
  value          JSONB NOT NULL,
  value_type     TEXT NOT NULL CHECK (value_type IN ('number','string','boolean','json')),
  effective_from DATE NOT NULL,                 -- inklusif (tanggal WIB — lihat catatan tz)
  effective_to   DATE,                          -- eksklusif; NULL = masih berlaku (open-ended)
  note           TEXT,
  updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_effective_order CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- C4: dua baris key sama TIDAK boleh punya rentang tanggal tumpang tindih.
  CONSTRAINT no_overlap_financial_config EXCLUDE USING gist (
    key WITH =,
    daterange(effective_from, effective_to, '[)') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS idx_financial_config_lookup ON financial_config(key, effective_from DESC);

COMMENT ON TABLE financial_config IS 'Config finansial effective-dated (tarif pajak/retensi/denda). Perhitungan pakai tarif berlaku saat dokumen diterbitkan. Anti-overlap via EXCLUDE, anti-gap via close-then-insert di app.';
COMMENT ON COLUMN financial_config.effective_from IS 'Tanggal WIB (Asia/Jakarta) inklusif. atDate dokumen dibandingkan sebagai DATE — derivasi ke DATE WIB dilakukan pemanggil.';

-- ─── Seed: pindahkan tarif pajak existing dari company_settings, berlaku SEJAK EPOCH ──
-- effective_from '2000-01-01' → SEMUA dokumen historis pakai tarif ini (nol perubahan
-- angka untuk operasi berjalan). Nilai = nilai sekarang di company_settings (0.11/0.02).
INSERT INTO financial_config (key, value, value_type, effective_from, note) VALUES
  ('tax.ppn_rate',       '0.11'::jsonb, 'number', '2000-01-01', 'Tarif awal (migrasi dari company_settings 1B.1)'),
  ('tax.pph_final_rate', '0.02'::jsonb, 'number', '2000-01-01', 'Tarif awal PPh final 4(2) (migrasi 1B.1)')
ON CONFLICT DO NOTHING;

-- ─── RLS (pola 1A) ───────────────────────────────────────────────────────────
ALTER TABLE financial_config ENABLE ROW LEVEL SECURITY;
-- Read: semua authenticated (tarif dibaca untuk kalkulasi + tampilan).
CREATE POLICY "financial_config_read" ON financial_config
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));
-- Write: HANYA settings:finance:manage (governance ketat — Q7). service_role (API) bypass.
CREATE POLICY "financial_config_write" ON financial_config
  FOR ALL USING (has_permission('settings:finance:manage'))
  WITH CHECK (has_permission('settings:finance:manage'));

-- ─── Menu (1B.2 DB-driven): entri "Konfigurasi Keuangan" di dropdown Pengaturan ──
-- ADDITIVE-FIRST: menu baru, nol menu existing hilang. Gated settings:finance:manage
-- (hanya muncul untuk yang berhak). sort_order 15 = antara Profil (10) & Role (20).
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section)
SELECT 'pengaturan-keuangan', 'Konfigurasi Keuangan', '/pengaturan/keuangan', 'Landmark', m.id,
       ARRAY['settings:finance:manage'], 15, 'bottom'
FROM menu_items m WHERE m.key = 'pengaturan'
ON CONFLICT (key) DO NOTHING;
