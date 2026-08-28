-- ============================================================================
-- 467 — Jenis elemen struktur: BALOK T / BALOK ANAK
-- ============================================================================
--
-- Hampir semua balok lantai beton dicor MENYATU dengan pelat di atasnya, dan
-- sepotong pelat di kiri-kanannya ikut menahan tekanan saat balok melengkung.
-- Menghitungnya sebagai persegi selebar baloknya saja konservatif — tetapi
-- konservatif di sini punya harga: balok anak 200×400 yang sebenarnya cukup
-- akan "gagal" di atas kertas dan diperbesar jadi 250×500, pada SETIAP balok
-- anak di proyek.
--
-- Arah sebaliknya yang berbahaya: pada momen NEGATIF di atas tumpuan, flens
-- berada di sisi TARIK dan tak membantu sama sekali. Modul `struktur-balok-t`
-- menghitung dua kondisi terpisah dan melaporkan keduanya.
--
-- Dijaga `audit-jenis-struktur-cocok.mjs` (ambang NOL).
-- ============================================================================

BEGIN;

ALTER TABLE struktur_elemen DROP CONSTRAINT IF EXISTS struktur_elemen_jenis_check;

ALTER TABLE struktur_elemen ADD CONSTRAINT struktur_elemen_jenis_check CHECK (
  jenis = ANY (ARRAY[
    -- Beton
    'balok', 'kolom', 'kolom_bulat', 'plat', 'footplat', 'pilecap', 'tiang',
    'sloof', 'tangga', 'balok_t',
    -- Baja
    'baja_balok', 'baja_kolom', 'baja_gording', 'baja_bracing',
    'baja_rangka', 'baja_base_plate', 'baja_angkur',
    'baja_sambungan_baut', 'baja_sambungan_las', 'baja_interaksi'
  ])
);

DO $$
DECLARE def text; n int;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'struktur_elemen'::regclass
     AND conname = 'struktur_elemen_jenis_check';
  IF def IS NULL OR def NOT LIKE '%balok_t%' THEN
    RAISE EXCEPTION 'balok_t tak masuk CHECK: %', def;
  END IF;
  SELECT count(*) INTO n FROM regexp_matches(def, '''([a-z_]+)''::text', 'g');
  IF n <> 20 THEN
    RAISE EXCEPTION 'Jumlah jenis % (harusnya 20: 10 beton + 10 baja)', n;
  END IF;
  RAISE NOTICE 'OK — balok_t terdaftar; total % jenis elemen', n;
END $$;

COMMIT;
