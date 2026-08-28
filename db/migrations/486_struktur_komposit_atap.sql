-- ============================================================================
-- 469 — Enam jenis terakhir: komposit, sambungan lanjut, atap ringan
-- ============================================================================
--
-- Migrasi ini menutup cakupan uji struktur dari pondasi sampai atap. Yang
-- ditambahkan, dan yang khas pada masing-masing:
--
--   kolom_komposit        beton menyumbang LEBIH DARI SEPARUH kapasitas;
--                         menghitungnya sebagai kolom baja saja mengabaikan
--                         porsi itu. Kolom TERISI mendapat kekangan dari
--                         pipanya (koef 0,95, bukan 0,85).
--
--   bondek                diperiksa DUA tahap. Sebelum beton mengeras, bondek
--                         memikul sendiri beton basah + pekerja — dan pada
--                         bentang yang sedikit terlalu panjang ia melendut,
--                         betonnya menebal, dan tambahan berat itu membuatnya
--                         melendut lebih jauh. Tahap ini yang paling sering
--                         menentukan dan paling sering dilewatkan.
--
--   baja_gusset           TEKUK pelat buhul terjadi KELUAR BIDANG — arah yang
--                         tak terlihat pada gambar sambungan. Perancang
--                         memeriksa bautnya, memeriksa lasnya, dan pelatnya
--                         sendiri melengkung.
--
--   baja_sambungan_momen  yang diperiksa KEKAKUAN, bukan hanya kekuatan.
--                         Sambungan yang "kelihatan kaku" sering semi-rigid,
--                         dan momen yang dihitung tak sampai ke sana —
--                         momen lapangan justru lebih besar daripada rencana.
--
--   kuda_kuda_kayu        TUMPU TEGAK LURUS SERAT paling sering gagal dan
--                         paling jarang diperiksa. Kayu kelas II kuat tekan
--                         sejajar 42,5 MPa tetapi tegak lurus hanya 15 MPa.
--
--   baja_ringan           TEKUK LOKAL mengendalikan, bukan leleh. Baja 0,75 mm
--                         hanya ~33% efektif; menghitungnya dengan luas bruto
--                         melebihkan kapasitas 3×. Lapisan antikarat
--                         menentukan UMUR, bukan kekuatan.
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
    -- Komposit
    'kolom_komposit', 'bondek',
    -- Baja
    'baja_balok', 'baja_kolom', 'baja_gording', 'baja_bracing',
    'baja_rangka', 'baja_base_plate', 'baja_angkur',
    'baja_sambungan_baut', 'baja_sambungan_las', 'baja_interaksi',
    'baja_gusset', 'baja_sambungan_momen',
    -- Atap ringan
    'kuda_kuda_kayu', 'baja_ringan'
  ])
);

DO $$
DECLARE def text; n int;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'struktur_elemen'::regclass
     AND conname = 'struktur_elemen_jenis_check';
  IF def IS NULL
     OR def NOT LIKE '%kolom_komposit%' OR def NOT LIKE '%bondek%'
     OR def NOT LIKE '%baja_gusset%' OR def NOT LIKE '%baja_sambungan_momen%'
     OR def NOT LIKE '%kuda_kuda_kayu%' OR def NOT LIKE '%baja_ringan%' THEN
    RAISE EXCEPTION 'Jenis baru tak lengkap di CHECK: %', def;
  END IF;
  SELECT count(*) INTO n FROM regexp_matches(def, '''([a-z_]+)''::text', 'g');
  IF n <> 30 THEN
    RAISE EXCEPTION 'Jumlah jenis % (harusnya 30)', n;
  END IF;
  RAISE NOTICE 'OK — 6 jenis terakhir terdaftar; total % jenis elemen', n;
END $$;

COMMIT;
