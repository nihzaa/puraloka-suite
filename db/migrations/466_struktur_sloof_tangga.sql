-- ============================================================================
-- 466 — Jenis elemen struktur: SLOOF dan TANGGA
-- ============================================================================
--
-- ── Kenapa dua ini lebih dulu daripada yang lain
--
-- Cakupan uji struktur diukur 2026-08-19 (`lapor-cakupan-struktur.mjs`) dan
-- hasilnya 18 dari 34 elemen. Yang belum ada diurut berdasarkan PEMAKAIAN
-- NYATA di RAB, bukan kerumitan teorinya:
--
--     15×  sloof / tie beam
--      8×  tangga beton
--      2×  pondasi menerus batu kali
--      1×  balok anak
--
-- Sloof dan tangga adalah dua elemen beton yang paling sering muncul di RAB
-- proyek ini dan paling lama tak punya penguji sama sekali. Estimator
-- menghitung keduanya di kertas, dan salahnya tak terlihat karena angka momen
-- tak punya "rasa benar" seperti dimensi.
--
-- ── Kenapa modul sendiri, bukan memakai balok/pelat apa adanya
--
-- SLOOF: bebannya dihitung dari dinding di atasnya (bukan diketik), tulangannya
-- WAJIB simetris atas-bawah (momen negatif di atas tumpuan sama besar dengan
-- momen positif di lapangan), dan tingginya dibatasi kekakuan minimum L/15 —
-- bukan lendutan, karena sloof tak melendut bebas.
--
-- TANGGA: bentangnya PANJANG MIRING bukan proyeksi datar (selisih 18% pada
-- kemiringan 32°), anak tangganya menambah beban ~2 kN/m², dan beban hidupnya
-- 4,79 kN/m² untuk bangunan umum — hampir tiga kali lipat hunian. Ditambah
-- tiga pemeriksaan yang tak ada di elemen lain: rumus Blondel, tinggi anak
-- tangga, lebar injakan. Ketiganya bukan soal kekuatan melainkan soal orang
-- yang menaikinya, dan jatuh di tangga adalah kecelakaan rumah tangga yang
-- paling sering.
--
-- ── Idempoten
--
-- CHECK dijatuhkan lebih dulu bila sudah ada, lalu dipasang dengan daftar
-- lengkap. Menjalankan ulang menghasilkan constraint yang sama.
--
-- Dijaga `audit-jenis-struktur-cocok.mjs` (ambang NOL): daftar di kode dan
-- CHECK di basis wajib sama.
-- ============================================================================

BEGIN;

ALTER TABLE struktur_elemen DROP CONSTRAINT IF EXISTS struktur_elemen_jenis_check;

ALTER TABLE struktur_elemen ADD CONSTRAINT struktur_elemen_jenis_check CHECK (
  jenis = ANY (ARRAY[
    -- Beton
    'balok', 'kolom', 'kolom_bulat', 'plat', 'footplat', 'pilecap', 'tiang',
    'sloof', 'tangga',
    -- Baja
    'baja_balok', 'baja_kolom', 'baja_gording', 'baja_bracing',
    'baja_rangka', 'baja_base_plate', 'baja_angkur',
    'baja_sambungan_baut', 'baja_sambungan_las', 'baja_interaksi'
  ])
);

-- ── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  def text;
  n   int;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'struktur_elemen'::regclass
     AND conname = 'struktur_elemen_jenis_check';
  IF def IS NULL THEN
    RAISE EXCEPTION 'CHECK struktur_elemen_jenis_check tak terpasang';
  END IF;
  IF def NOT LIKE '%sloof%' OR def NOT LIKE '%tangga%' THEN
    RAISE EXCEPTION 'sloof/tangga tak masuk CHECK: %', def;
  END IF;

  -- Jumlah jenis harus 19 — 9 beton + 10 baja. Angka dipaku SENGAJA: kalau
  -- migrasi berikutnya menambah jenis tanpa memperbarui verifikasi ini, ia
  -- merah dan pembacanya sadar bahwa daftar itu berubah.
  SELECT count(*) INTO n FROM regexp_matches(def, '''([a-z_]+)''::text', 'g');
  IF n <> 19 THEN
    RAISE EXCEPTION 'Jumlah jenis % (harusnya 19: 9 beton + 10 baja)', n;
  END IF;

  RAISE NOTICE 'OK — sloof & tangga terdaftar; total % jenis elemen', n;
END $$;

COMMIT;
