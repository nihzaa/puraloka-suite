-- ============================================================================
-- 468 — Jenis elemen: pondasi menerus, raft, dinding penahan, dinding geser
-- ============================================================================
--
-- Empat elemen yang menutup sisa celah beton pada cakupan uji struktur.
--
-- PONDASI MENERUS batu kali adalah pondasi paling umum di Indonesia untuk
-- rumah tinggal — dan hampir tak pernah dihitung. Ukurannya diwariskan
-- turun-temurun tanpa seorang pun memeriksa apakah tanah di bawahnya sanggup.
-- Pada tanah lunak ia amblas; pada tanah keras ia dua kali lebih besar
-- daripada perlunya, dan galian serta batunya terbuang.
--
-- RAFT dipakai justru saat tanahnya lemah, dan di situlah kesalahan paling
-- mahal: raft terlalu tipis melengkung, dan lengkungannya meretakkan seluruh
-- lantai dasar sekaligus.
--
-- DINDING PENAHAN punya tiga cara gagal yang harus diperiksa terpisah:
-- guling, geser, dan tekanan tanah. Yang paling sering dilewatkan bukan yang
-- paling rumit melainkan yang paling membosankan — GESER. Dinding boleh
-- sangat berat sehingga tak mungkin guling, dan tetap meluncur.
--
-- DINDING GESER kegagalannya berlawanan sifat: ia harus DAKTAIL. Yang
-- diperiksa bukan hanya kuat gesernya melainkan apakah lentur akan leleh LEBIH
-- DULU. Dinding yang gesernya lebih lemah runtuh tiba-tiba tanpa peringatan.
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
    'pondasi_menerus', 'raft', 'dinding_penahan', 'dinding_geser',
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
  IF def IS NULL
     OR def NOT LIKE '%pondasi_menerus%' OR def NOT LIKE '%raft%'
     OR def NOT LIKE '%dinding_penahan%' OR def NOT LIKE '%dinding_geser%' THEN
    RAISE EXCEPTION 'Jenis baru tak lengkap di CHECK: %', def;
  END IF;
  SELECT count(*) INTO n FROM regexp_matches(def, '''([a-z_]+)''::text', 'g');
  IF n <> 24 THEN
    RAISE EXCEPTION 'Jumlah jenis % (harusnya 24: 14 beton + 10 baja)', n;
  END IF;
  RAISE NOTICE 'OK — 4 jenis baru terdaftar; total % jenis elemen', n;
END $$;

COMMIT;
