-- Migration 116 — CECEP: satuan OJ + dimensi `labor_time` (keputusan founder)
--
-- OH (orang-hari) & OJ (orang-jam) BERBAGI SATU dimensi: keduanya orang×waktu dan
-- SEBANDING (1 OH = 7 OJ per SNI). Memisah jadi dua dimensi = menyatakan tak
-- sebanding = salah. Maka `labor_day` (dari migration 115) DI-RENAME → `labor_time`,
-- menampung OH + OJ.
--
-- Pembeda tenaga / alat / kalender SUDAH dibawa `resources.category`
-- (labor/material/equipment/subcontract) — JANGAN diduplikasi di `unit.dimension`
-- (dua sumber kebenaran bisa bertentangan). Jadi: OH & OJ → labor_time;
-- `jam` & `hari` (alat/kalender) tetap `time`.
--
-- TANPA converter (Zero-Invention, ADR-006). Relasi 1 OH = 7 OJ hanya DOKUMENTASI
-- di komentar ini, bukan faktor konversi otomatis.
--
-- Aman rename langsung: `labor_day` hanya ada di CHECK + baris seed OH (migration
-- 115), NOL baris hidup (resources/assemblies) merujuknya (diverifikasi).

-- 1. Perluas himpunan dimensi sah: labor_day → labor_time.
ALTER TABLE units DROP CONSTRAINT units_dimension_valid;
UPDATE units SET dimension = 'labor_time' WHERE dimension = 'labor_day';
ALTER TABLE units ADD CONSTRAINT units_dimension_valid CHECK (
  dimension IN ('length','area','volume','mass','count','time','lumpsum','labor_time'));

-- 2. Tambah OJ (orang-jam) — dimension labor_time, sebanding OH (1 OH = 7 OJ, dok saja).
INSERT INTO units (code, symbol, label, category, sort_order, dimension) VALUES
  ('OJ', 'OJ', 'Orang-jam', 'time', 170, 'labor_time')
ON CONFLICT (code) DO NOTHING;

COMMENT ON COLUMN units.dimension IS
  'Dimensi fisik satuan (CECEP): length/area/volume/mass/count/time/lumpsum/labor_time. '
  'labor_time = orang×waktu (OH orang-hari, OJ orang-jam — SEBANDING 1 OH=7 OJ per SNI, '
  'TANPA converter). Pembeda tenaga/alat/kalender via resources.category, BUKAN di sini. '
  'jam & hari (alat/kalender) = time. Beda dari `category` (pengelompokan UI 090).';
