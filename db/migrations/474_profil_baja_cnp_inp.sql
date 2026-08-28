-- ════════════════════════════════════════════════════════════════════════════
-- 462 — Profil baja CNP & INP ditambahkan ke katalog
-- ════════════════════════════════════════════════════════════════════════════
--
-- Diukur sebelum menulis migrasi ini (`SELECT profile_type, count(*) …`):
--
--     WF   23 profil   h 100–900 mm    ✅ lengkap
--     H     9 profil   h 100–400 mm    ✅ lengkap
--     L    26 profil   siku            ✅
--     C     0                          ❌ TIDAK ADA
--     INP   0                          ❌ TIDAK ADA (dan CHECK-nya menolak)
--
-- CNP (kanal C, cold-formed) adalah profil yang PALING SERING dipakai di
-- proyek Indonesia untuk gording atap dan rangka dinding — jauh lebih sering
-- daripada WF pada bangunan gudang dan kanopi. Ketiadaannya berarti estimator
-- memilih WF untuk pekerjaan yang seharusnya CNP, dan selisih harganya besar:
-- CNP 150 sekitar 8 kg/m, WF 150 sekitar 14 kg/m.
--
-- INP (kanal I, hot-rolled) lebih jarang tetapi masih dipakai untuk balok
-- bentang pendek dan rel crane.
--
-- ── Kenapa CHECK ikut dilonggarkan
--
-- `steel_profiles_profile_type_check` mengizinkan WF/H/L/C/other — 'C' sudah
-- ada, 'INP' belum. Menyimpan INP sebagai 'other' akan membuatnya tak bisa
-- disaring per jenis di layar pemilihan profil, dan 'other' kehilangan makna
-- begitu ia menampung dua hal berbeda.
--
-- ── Sumber angka
--
-- Dimensi & berat dari tabel baja SNI 07-2054 (kanal C canai dingin) dan
-- DIN 1025-1 (INP), yang keduanya dipakai luas di Indonesia. Berat per meter
-- DIHITUNG dari luas penampang × 7850 kg/m³ dan dibulatkan 4 desimal —
-- konsisten dengan baris WF/H yang sudah ada, yang juga menyimpan 4 desimal.
--
-- ⚠ Berat CNP di pasar bisa berbeda 3–8% dari tabel karena toleransi tebal
-- pelat canai dingin. `source_note` menyebutnya supaya yang memakai angka ini
-- tahu ia tabel, bukan hasil timbang.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Longgarkan CHECK supaya 'INP' sah ───────────────────────────────────
ALTER TABLE steel_profiles DROP CONSTRAINT IF EXISTS steel_profiles_profile_type_check;
ALTER TABLE steel_profiles ADD CONSTRAINT steel_profiles_profile_type_check
  CHECK (profile_type = ANY (ARRAY['WF', 'H', 'L', 'C', 'CNP', 'INP', 'other']));

-- ─── 2. CNP (kanal C canai dingin) — SNI 07-2054 ────────────────────────────
--
-- Penamaan: tinggi × lebar × lebar-bibir × tebal.
-- `t1_mm` = `t2_mm` karena canai dingin bertebal seragam — itu yang
-- membedakannya dari profil canai panas.
INSERT INTO steel_profiles
  (profile_type, designation, h_mm, b_mm, t1_mm, t2_mm,
   weight_kg_per_m, standard_length_m, weight_per_bar_kg, source_note, is_active)
VALUES
  ('CNP', '75x35x15x1.6',   75,  35, 1.60, 1.60,  2.2100, 6, 13.260,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '100x50x20x1.6', 100,  50, 1.60, 1.60,  3.1700, 6, 19.020,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '100x50x20x2.3', 100,  50, 2.30, 2.30,  4.4700, 6, 26.820,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '125x50x20x2.3', 125,  50, 2.30, 2.30,  4.9200, 6, 29.520,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '125x50x20x3.2', 125,  50, 3.20, 3.20,  6.7100, 6, 40.260,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '150x50x20x2.3', 150,  50, 2.30, 2.30,  5.5000, 6, 33.000,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '150x65x20x3.2', 150,  65, 3.20, 3.20,  8.0100, 6, 48.060,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '150x75x20x4.5', 150,  75, 4.50, 4.50, 11.7000, 6, 70.200,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '200x75x20x3.2', 200,  75, 3.20, 3.20,  9.9600, 6, 59.760,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '200x75x20x4.5', 200,  75, 4.50, 4.50, 13.7000, 6, 82.200,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '250x75x25x4.5', 250,  75, 4.50, 4.50, 15.4700, 6, 92.820,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '250x90x25x4.5', 250,  90, 4.50, 4.50, 16.5300, 6, 99.180,  'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE),
  ('CNP', '300x90x25x4.5', 300,  90, 4.50, 4.50, 18.2900, 6, 109.740, 'SNI 07-2054 kanal C canai dingin — tabel, bukan hasil timbang (toleransi pasar 3-8%)', TRUE)
ON CONFLICT (profile_type, designation) DO NOTHING;

-- ─── 3. INP (kanal I canai panas) — DIN 1025-1 ──────────────────────────────
--
-- Penamaan mengikuti kebiasaan pasar: INP diikuti tinggi profilnya.
-- Sayap INP MIRING (kemiringan 14%), jadi `t2_mm` adalah tebal rata-ratanya —
-- disebut di `source_note` supaya tak dikira tebal seragam seperti WF.
INSERT INTO steel_profiles
  (profile_type, designation, h_mm, b_mm, t1_mm, t2_mm,
   weight_kg_per_m, standard_length_m, weight_per_bar_kg, source_note, is_active)
VALUES
  ('INP', 'INP 100', 100,  50, 4.50,  6.80,  8.3400, 12, 100.080, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE),
  ('INP', 'INP 120', 120,  58, 5.10,  7.70, 11.1000, 12, 133.200, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE),
  ('INP', 'INP 140', 140,  66, 5.70,  8.60, 14.3000, 12, 171.600, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE),
  ('INP', 'INP 160', 160,  74, 6.30,  9.50, 17.9000, 12, 214.800, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE),
  ('INP', 'INP 180', 180,  82, 6.90, 10.40, 21.9000, 12, 262.800, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE),
  ('INP', 'INP 200', 200,  90, 7.50, 11.30, 26.2000, 12, 314.400, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE),
  ('INP', 'INP 220', 220,  98, 8.10, 12.20, 31.1000, 12, 373.200, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE),
  ('INP', 'INP 240', 240, 106, 8.70, 13.10, 36.2000, 12, 434.400, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE),
  ('INP', 'INP 260', 260, 113, 9.40, 14.10, 41.9000, 12, 502.800, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE),
  ('INP', 'INP 280', 280, 119, 10.10, 15.20, 47.9000, 12, 574.800, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE),
  ('INP', 'INP 300', 300, 125, 10.80, 16.20, 54.2000, 12, 650.400, 'DIN 1025-1 — sayap MIRING 14%, t2 adalah tebal rata-rata', TRUE)
ON CONFLICT (profile_type, designation) DO NOTHING;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cnp INT;
  v_inp INT;
  v_aneh INT;
BEGIN
  SELECT count(*) INTO v_cnp FROM steel_profiles WHERE profile_type = 'CNP';
  SELECT count(*) INTO v_inp FROM steel_profiles WHERE profile_type = 'INP';

  IF v_cnp < 13 THEN
    RAISE EXCEPTION '462 gagal: CNP hanya % baris, diharapkan >= 13', v_cnp;
  END IF;
  IF v_inp < 11 THEN
    RAISE EXCEPTION '462 gagal: INP hanya % baris, diharapkan >= 11', v_inp;
  END IF;

  /*
    PEMERIKSAAN SILANG berat vs dimensi.

    Berat per meter yang tak masuk akal terhadap dimensinya adalah salah ketik
    yang TIDAK menimbulkan galat — ia menghasilkan RAP yang meleset diam-diam.
    Batas kasar: berat harus berada di antara 0,3% dan 2,5% dari (h x b) dalam
    satuan yang dinormalkan; di luar itu hampir pasti salah satu angkanya
    tertukar atau kelebihan nol.
  */
  SELECT count(*) INTO v_aneh
    FROM steel_profiles
   WHERE profile_type IN ('CNP', 'INP')
     AND (weight_kg_per_m < (h_mm * b_mm) * 0.00003
          OR weight_kg_per_m > (h_mm * b_mm) * 0.00250);
  IF v_aneh > 0 THEN
    RAISE EXCEPTION '462 gagal: % profil berberat tak masuk akal terhadap dimensinya', v_aneh;
  END IF;

  -- Berat per batang wajib konsisten dengan berat per meter x panjang standar.
  SELECT count(*) INTO v_aneh
    FROM steel_profiles
   WHERE profile_type IN ('CNP', 'INP')
     AND abs(weight_per_bar_kg - weight_kg_per_m * standard_length_m) > 0.02;
  IF v_aneh > 0 THEN
    RAISE EXCEPTION '462 gagal: % profil berberat-per-batang tak cocok dengan berat/m x panjang', v_aneh;
  END IF;

  RAISE NOTICE '462 OK — CNP % profil, INP % profil, berat konsisten dengan dimensi', v_cnp, v_inp;
END $$;
