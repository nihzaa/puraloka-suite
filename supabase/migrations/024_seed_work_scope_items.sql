-- ============================================================
-- PURALOKA SUITE — Migration 024
-- Seed work_scope_items: rincian pekerjaan per scope (realistis)
-- Mencakup: bangunan sipil (m², m³), baja WF (batang/kg/ton)
-- ============================================================

-- ============================================================
-- SCOPE aa000000-01: Pekerjaan Struktur & Bata (Pak Slamet - Proyek 1)
-- payment_system: borongan, status: completed
-- ============================================================
INSERT INTO work_scope_items (id, work_scope_id, item_name, category, description, unit, volume, unit_price, volume_done, sort_order, created_by) VALUES

  -- Pondasi & struktur bawah
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001',
   'Galian Tanah Pondasi', 'struktur',
   'Galian tanah manual untuk pondasi footplat',
   'm3', 18.5, 85000, 18.5, 1, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001',
   'Pondasi Batu Kali', 'struktur',
   'Pasangan pondasi batu kali 1:4',
   'm3', 12.0, 750000, 12.0, 2, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001',
   'Cor Beton Footplat 70x70x25cm', 'struktur',
   'Beton K-250, 8 titik footplat',
   'm3', 4.2, 1200000, 4.2, 3, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001',
   'Kolom Praktis 15x15', 'struktur',
   'Beton bertulang kolom praktis K-225',
   'm3', 2.8, 2500000, 2.8, 4, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001',
   'Ring Balok 15x20', 'struktur',
   'Beton bertulang ring balok keliling bangunan',
   'm3', 3.5, 2500000, 3.5, 5, 'a0000000-0000-0000-0000-000000000001'),

  -- Dinding
  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001',
   'Pasang Bata Merah 1/2 Batu', 'dinding',
   'Pasangan dinding bata merah 1:5',
   'm2', 185.0, 185000, 185.0, 6, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001',
   'Plesteran Dinding 1:5', 'dinding',
   'Plesteran kedua muka dinding',
   'm2', 370.0, 55000, 370.0, 7, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001',
   'Acian Dinding', 'dinding',
   'Acian halus kedua muka dinding',
   'm2', 370.0, 35000, 370.0, 8, 'a0000000-0000-0000-0000-000000000001');

-- ============================================================
-- SCOPE aa000000-02: Pekerjaan Finishing (Pak Slamet - Proyek 1)
-- payment_system: progress_pct, progress: 60%
-- ============================================================
INSERT INTO work_scope_items (id, work_scope_id, item_name, category, description, unit, volume, unit_price, volume_done, sort_order, created_by) VALUES

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002',
   'Pasang Keramik Lantai 60x60', 'finishing',
   'Keramik 60x60 motif granit, floor level 0',
   'm2', 95.0, 135000, 62.0, 1, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002',
   'Pasang Keramik Lantai 30x30 (KM/WC)', 'finishing',
   'Keramik 30x30 anti slip untuk area basah',
   'm2', 15.0, 120000, 10.0, 2, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002',
   'Pasang Keramik Dinding KM 25x40', 'finishing',
   'Keramik dinding KM setinggi 2m',
   'm2', 28.0, 115000, 18.0, 3, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002',
   'Cat Dinding Interior 2 Lapis', 'finishing',
   'Cat Dulux / Mowilex, 2x lapis + dasar',
   'm2', 320.0, 48000, 180.0, 4, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002',
   'Cat Dinding Eksterior', 'finishing',
   'Cat eksterior weathershield, 2x lapis',
   'm2', 85.0, 58000, 40.0, 5, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002',
   'Plafon GRC 4mm + Rangka Metal', 'finishing',
   'Rangka hollow 40x40, plafon GRC 4mm',
   'm2', 110.0, 125000, 65.0, 6, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'aa000000-0000-0000-0000-000000000002',
   'List Profil Plafon Gypsum', 'finishing',
   'List profil C7 sudut plafon',
   'm', 145.0, 25000, 80.0, 7, 'a0000000-0000-0000-0000-000000000001');

-- ============================================================
-- SCOPE ab000000-01: Struktur Lantai 1 (Pak Slamet - Proyek 2)
-- payment_system: borongan, BAJA WF + SIPIL, progress: 75%
-- ============================================================
INSERT INTO work_scope_items (id, work_scope_id, item_name, category, description, unit, volume, unit_price, volume_done, sort_order, created_by) VALUES

  -- Pekerjaan sipil
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001',
   'Galian Pondasi Footplat', 'struktur',
   'Galian tanah manual, kedalaman rata-rata 1.2m',
   'm3', 28.0, 85000, 28.0, 1, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001',
   'Cor Beton Footplat K-300', 'struktur',
   'Beton readymix K-300 untuk 12 titik footplat',
   'm3', 8.6, 1350000, 8.6, 2, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001',
   'Cor Sloof Beton 20x30', 'struktur',
   'Sloof beton bertulang keliling bangunan',
   'm3', 5.4, 2800000, 5.4, 3, 'a0000000-0000-0000-0000-000000000001'),

  -- Pekerjaan baja WF
  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001',
   'Kolom Baja WF 200x100x5.5x8', 'baja',
   'Kolom utama baja WF 200, tinggi rata-rata 4m, grade BJ41',
   'batang', 24.0, 1250000, 20.0, 4, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001',
   'Balok Baja WF 300x150x6.5x9', 'baja',
   'Balok induk lantai 1, WF 300, span rata-rata 6m',
   'm', 145.0, 285000, 110.0, 5, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001',
   'Balok Anak Baja WF 150x75', 'baja',
   'Balok anak / secondary beam, WF 150',
   'm', 88.0, 155000, 65.0, 6, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001',
   'Pelat Baja Bondek 0.75mm', 'baja',
   'Pelat bondek 0.75mm sebagai bekisting permanen pelat lantai',
   'm2', 165.0, 125000, 130.0, 7, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001',
   'Cor Beton Pelat Lantai di Atas Bondek', 'struktur',
   'Beton readymix K-250 tebal 12cm di atas bondek',
   'm3', 19.8, 1200000, 15.0, 8, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001',
   'Pengecatan Baja (Cat Meni + Finish)', 'baja',
   'Sand blast + 2 lapis cat meni + 1 lapis cat finish',
   'kg', 2850.0, 18000, 2200.0, 9, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000001',
   'Pasang Bata Dinding Lantai 1', 'dinding',
   'Pasangan dinding bata merah 1:5',
   'm2', 220.0, 185000, 165.0, 10, 'a0000000-0000-0000-0000-000000000001');

-- ============================================================
-- SCOPE ab000000-02: Struktur Lantai 2 (Pak Hendra - Proyek 2)
-- payment_system: progress_pct, BAJA WF, progress: 15%
-- ============================================================
INSERT INTO work_scope_items (id, work_scope_id, item_name, category, description, unit, volume, unit_price, volume_done, sort_order, created_by) VALUES

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002',
   'Kolom Baja WF 200x100 Lantai 2', 'baja',
   'Sambungan kolom dari lt.1, tinggi 3.5m, BJ41',
   'batang', 24.0, 1100000, 4.0, 1, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002',
   'Balok Induk WF 300x150 Lantai 2', 'baja',
   'Balok induk lantai 2',
   'm', 145.0, 285000, 22.0, 2, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002',
   'Balok Anak WF 150x75 Lantai 2', 'baja',
   'Balok anak / secondary beam lantai 2',
   'm', 88.0, 155000, 12.0, 3, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002',
   'Kuda-kuda Baja Atap WF 150', 'baja',
   'Rangka kuda-kuda baja WF 150, span 8m',
   'batang', 8.0, 1850000, 0.0, 4, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002',
   'Gording CNP 150x65x20', 'baja',
   'Gording atap CNP 150 sebagai dudukan penutup atap',
   'm', 95.0, 95000, 0.0, 5, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002',
   'Penutup Atap Genteng Metal Pasir', 'atap',
   'Genteng metal pasir + ridge + flashing',
   'm2', 175.0, 145000, 0.0, 6, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ab000000-0000-0000-0000-000000000002',
   'Pelat Bondek + Cor Pelat Lantai 2', 'struktur',
   'Bondek 0.75mm + beton K-250 tebal 12cm',
   'm2', 165.0, 250000, 0.0, 7, 'a0000000-0000-0000-0000-000000000001');

-- ============================================================
-- SCOPE ac000000-01: Renovasi Dapur (Pak Budi - Proyek 3)
-- payment_system: borongan, progress: 90%
-- ============================================================
INSERT INTO work_scope_items (id, work_scope_id, item_name, category, description, unit, volume, unit_price, volume_done, sort_order, created_by) VALUES

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000001',
   'Bongkar Lantai & Dinding Lama', 'struktur',
   'Bongkar keramik, plesteran, dan partisi lama',
   'm2', 32.0, 45000, 32.0, 1, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000001',
   'Pasang Keramik Lantai Dapur 60x60', 'finishing',
   'Keramik 60x60 motif granit',
   'm2', 18.0, 135000, 18.0, 2, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000001',
   'Pasang Keramik Dinding Dapur 25x50', 'finishing',
   'Keramik dinding setinggi 1.5m keliling dapur',
   'm2', 24.0, 120000, 22.0, 3, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000001',
   'Meja Granit Kitchen Set', 'finishing',
   'Pemasangan meja granit 3cm tebal, termasuk backsplash',
   'm', 3.8, 850000, 3.8, 4, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000001',
   'Plafon Gypsum + Rangka', 'finishing',
   'Rangka hollow + plafon gypsum 9mm',
   'm2', 18.0, 120000, 16.0, 5, 'a0000000-0000-0000-0000-000000000001');

-- ============================================================
-- SCOPE ac000000-02: Renovasi 2 Kamar Mandi (Pak Budi - Proyek 3)
-- payment_system: borongan, progress: 80%
-- ============================================================
INSERT INTO work_scope_items (id, work_scope_id, item_name, category, description, unit, volume, unit_price, volume_done, sort_order, created_by) VALUES

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000002',
   'Bongkar Sanitasi & Keramik Lama', 'struktur',
   'Bongkar total isi kamar mandi lama',
   'unit', 2.0, 750000, 2.0, 1, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000002',
   'Pasang Keramik Lantai KM 30x30 Anti Slip', 'finishing',
   'Keramik anti slip 30x30, total 2 KM',
   'm2', 9.0, 120000, 9.0, 2, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000002',
   'Pasang Keramik Dinding KM 25x40', 'finishing',
   'Keramik dinding full height 2.4m, 2 KM',
   'm2', 38.0, 115000, 32.0, 3, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000002',
   'Pasang Closet Duduk', 'plumbing',
   'Closet duduk American Standard + aksesoris',
   'unit', 2.0, 450000, 2.0, 4, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000002',
   'Pasang Shower Set', 'plumbing',
   'Shower set + kran + shower head',
   'unit', 2.0, 350000, 2.0, 5, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ac000000-0000-0000-0000-000000000002',
   'Instalasi Pipa PVC Air Bersih/Kotor', 'plumbing',
   'Pipa PVC AW 4" kotor + PVC AW 3/4" air bersih',
   'ls', 1.0, 3500000, 1.0, 6, 'a0000000-0000-0000-0000-000000000001');

-- ============================================================
-- SCOPE ad000000-01 & 02: Carport & Pagar (Pak Agus - Proyek 4 COMPLETED)
-- ============================================================
INSERT INTO work_scope_items (id, work_scope_id, item_name, category, description, unit, volume, unit_price, volume_done, sort_order, created_by) VALUES

  -- Carport
  (gen_random_uuid(), 'ad000000-0000-0000-0000-000000000001',
   'Rangka Atap Carport Baja Ringan', 'baja',
   'Rangka baja ringan truss 0.75mm, span 5m',
   'm2', 28.0, 185000, 28.0, 1, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ad000000-0000-0000-0000-000000000001',
   'Penutup Atap Polycarbonate 10mm', 'atap',
   'Polycarbonate transparan 10mm + aksesoris',
   'm2', 28.0, 285000, 28.0, 2, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ad000000-0000-0000-0000-000000000001',
   'Kolom Carport Baja Hollow 100x100x3', 'baja',
   'Kolom hollow square 100x100x3mm, 4 titik',
   'batang', 4.0, 850000, 4.0, 3, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ad000000-0000-0000-0000-000000000001',
   'Cor Lantai Carport 8cm', 'struktur',
   'Beton K-200 tebal 8cm, area 2 mobil',
   'm2', 28.0, 185000, 28.0, 4, 'a0000000-0000-0000-0000-000000000001'),

  -- Pagar besi hollow
  (gen_random_uuid(), 'ad000000-0000-0000-0000-000000000002',
   'Pagar Besi Hollow 40x40x2 + List', 'pagar_carport',
   'Hollow 40x40x2 vertikal + list hollow 20x40, tinggi 1.8m',
   'm', 14.0, 650000, 14.0, 1, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ad000000-0000-0000-0000-000000000002',
   'Pintu Pagar Besi Swing 2 Daun', 'pagar_carport',
   'Pintu 2 daun lebar total 4m, besi hollow finishing cat',
   'unit', 1.0, 4500000, 1.0, 2, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ad000000-0000-0000-0000-000000000002',
   'Pengecatan Pagar + Primer', 'finishing',
   'Cat meni 1 lapis + cat finish 2 lapis warna abu-abu',
   'm2', 25.2, 65000, 25.2, 3, 'a0000000-0000-0000-0000-000000000001');

-- ============================================================
-- SCOPE ae000000-01: Renovasi Fasad (Pak Hendra - Proyek 5)
-- payment_system: borongan, progress: 20%
-- ============================================================
INSERT INTO work_scope_items (id, work_scope_id, item_name, category, description, unit, volume, unit_price, volume_done, sort_order, created_by) VALUES

  (gen_random_uuid(), 'ae000000-0000-0000-0000-000000000001',
   'Perbaikan Plesteran Retak Fasad', 'dinding',
   'Chipping, kawat ayam, plesteran ulang area retak',
   'm2', 25.0, 145000, 8.0, 1, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ae000000-0000-0000-0000-000000000001',
   'Pasang Batu Alam Andesit Aksen', 'dinding',
   'Batu alam andesit bakar 20x40, area aksen fasad',
   'm2', 18.0, 350000, 4.0, 2, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ae000000-0000-0000-0000-000000000001',
   'Cat Eksterior Weathershield Fasad', 'finishing',
   'Alkali primer + 2 lapis cat weathershield',
   'm2', 95.0, 58000, 15.0, 3, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ae000000-0000-0000-0000-000000000001',
   'Lisplank GRC 30cm', 'finishing',
   'Lisplank GRC 30cm + cat',
   'm', 28.0, 95000, 0.0, 4, 'a0000000-0000-0000-0000-000000000001'),

  (gen_random_uuid(), 'ae000000-0000-0000-0000-000000000001',
   'Pasang Canopy Polycarbonate Atas Pintu', 'atap',
   'Rangka baja ringan + polycarbonate 8mm',
   'm2', 3.5, 485000, 0.0, 5, 'a0000000-0000-0000-0000-000000000001');

-- ============================================================
-- Specs teknis untuk item baja WF (Proyek 2 - Struktur Baja)
-- ============================================================
INSERT INTO work_scope_item_specs (item_id, spec_key, spec_value, sort_order)
SELECT wsi.id, 'Grade Material', 'BJ 41 (Fy = 250 MPa)', 0
FROM work_scope_items wsi
WHERE wsi.work_scope_id IN ('ab000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000002')
AND wsi.category = 'baja'
AND wsi.item_name LIKE '%Kolom%WF%';

INSERT INTO work_scope_item_specs (item_id, spec_key, spec_value, sort_order)
SELECT wsi.id, 'Sambungan', 'Las listrik SMAW + baut A325', 1
FROM work_scope_items wsi
WHERE wsi.work_scope_id IN ('ab000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000002')
AND wsi.category = 'baja'
AND wsi.item_name LIKE '%Kolom%WF%';

INSERT INTO work_scope_item_specs (item_id, spec_key, spec_value, sort_order)
SELECT wsi.id, 'Grade Material', 'BJ 41 (Fy = 250 MPa)', 0
FROM work_scope_items wsi
WHERE wsi.work_scope_id IN ('ab000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000002')
AND wsi.category = 'baja'
AND wsi.item_name LIKE '%Balok%WF%';

INSERT INTO work_scope_item_specs (item_id, spec_key, spec_value, sort_order)
SELECT wsi.id, 'Lapisan Proteksi', 'Cat meni zincromate 2 lapis + topcoat abu-abu', 1
FROM work_scope_items wsi
WHERE wsi.work_scope_id IN ('ab000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000002')
AND wsi.category = 'baja'
AND wsi.item_name LIKE '%Balok%WF%';
