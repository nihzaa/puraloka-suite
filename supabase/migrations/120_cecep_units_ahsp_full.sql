-- Migration 120 — Satuan tambahan untuk impor penuh AHSP SE 47/2026
--
-- EXTEND units (pola 115/116; satu vocabulary). Semua kode di bawah muncul
-- VERBATIM sebagai satuan komponen di workbook SE 47/2026 (dataset kanonik
-- db/seeds/ahsp-se47-dataset.json, sha256 sumber di meta). Zero-Invention:
-- typo workbook (loat, lkg) DIPERTAHANKAN sebagai satuan tersendiri — baseline
-- "SE bilang apa"; koreksi = keputusan edit belakangan, bukan saat impor.
-- TANPA faktor konversi (ADR-006).

INSERT INTO units (code, symbol, label, category, sort_order, dimension) VALUES
  ('m1',        'm''',   'Meter lari',                        'length', 121, 'length'),
  ('cm',        'cm',    'Sentimeter',                        'length', 122, 'length'),
  ('lot',       'lot',   'Lot',                               'count',  310, 'count'),
  ('tube',      'tube',  'Tube',                              'count',  311, 'count'),
  ('gulung',    'glg',   'Gulung',                            'count',  312, 'count'),
  ('pohon',     'phn',   'Pohon',                             'count',  313, 'count'),
  ('polybag',   'pbg',   'Polybag',                           'count',  314, 'count'),
  ('ikat',      'ikt',   'Ikat',                              'count',  315, 'count'),
  ('dus',       'dus',   'Dus',                               'count',  316, 'count'),
  ('unit_hari', 'unit·hari', 'Unit-hari (sewa alat per hari)','time',   320, 'time'),
  ('buah_hari', 'buah·hari', 'Buah-hari (sewa alat per hari)','time',   321, 'time'),
  -- Typo verbatim workbook SE 47/2026 (dipertahankan sebagai baseline impor):
  ('loat',      'loat',  'Loat (typo workbook SE47; kemungkinan "lot")',    'count', 390, 'count'),
  ('lkg',       'lkg',   'Lkg (typo/singkatan workbook SE47, tak terdefinisi)', 'count', 391, 'count')
ON CONFLICT (code) DO NOTHING;
