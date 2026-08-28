-- ============================================================================
-- 470 — Sambungan kayu & sekrup baja ringan: titik gagal SESUNGGUHNYA
-- ============================================================================
--
-- Empat modul di aplikasi ini menyebutkan hal yang sama sebagai batasnya:
--
--   "pada kuda-kuda kayu, sambungan hampir selalu lebih lemah daripada
--    batangnya — batang yang cukup tak menjamin kuda-kudanya cukup"
--   "sambungan sekrup … hampir selalu lebih lemah daripada batangnya"
--   "pada struktur baja, sambungan justru titik gagal paling sering"
--
-- Ketiganya benar, dan sampai migrasi ini aplikasi menghitung batang dengan
-- teliti lalu menyerahkan titik gagal sesungguhnya ke perkiraan.
--
-- ── SAMBUNGAN KAYU
--
-- Kayu tidak gagal seperti baja. Baja gagal karena bahannya kalah; kayu gagal
-- karena BENTUKNYA berubah — alat sambung menekan serat sampai lubangnya
-- melonjong, dan sambungan longgar jauh sebelum ada yang patah.
--
-- Yang diperiksa: moda leleh (alat sambungnya IKUT MELENTUR — memakai tumpu
-- penuh memberi angka tujuh kali lebih besar), kedalaman penetrasi paku, dan
-- JARAK KE UJUNG kayu. Yang terakhir paling sering dilanggar: tukang memasang
-- alat sambung terlalu dekat ujung supaya kelihatan rapi, dan kayunya membelah
-- mengikuti serat — kegagalan GETAS tanpa peringatan.
--
-- ── SEKRUP BAJA RINGAN
--
-- Empat moda, dan yang paling sering BUKAN sekrupnya yang putus: tilting
-- (sekrup miring karena pelat terlalu tipis), bearing (lubang melonjong),
-- pull-out (tercabut), pull-over (kepala menembus pelat). Yang terakhir yang
-- membuat atap terbang — angin menghisap penutup, kepala sekrup menembus
-- lembarannya, dan atap lepas meski sekrupnya masih menancap utuh di kaso.
--
-- Menghitungnya dengan rumus baut biasa melewatkan keempatnya.
--
-- ── TAK BERVOLUME, dan itu benar
--
-- Keduanya masuk `TANPA_VOLUME`: alat sambung dibeli per kilogram sebagai
-- bahan pembantu, bukan item RAB tersendiri. Dijaga
-- `audit-jenis-volume-terdaftar.mjs`.
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
    'kuda_kuda_kayu', 'baja_ringan',
    'sambungan_kayu', 'sekrup_baja_ringan'
  ])
);

DO $$
DECLARE def text; n int;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'struktur_elemen'::regclass
     AND conname = 'struktur_elemen_jenis_check';
  IF def IS NULL
     OR def NOT LIKE '%sambungan_kayu%' OR def NOT LIKE '%sekrup_baja_ringan%' THEN
    RAISE EXCEPTION 'Jenis sambungan tak lengkap di CHECK: %', def;
  END IF;
  SELECT count(*) INTO n FROM regexp_matches(def, '''([a-z_]+)''::text', 'g');
  IF n <> 32 THEN
    RAISE EXCEPTION 'Jumlah jenis % (harusnya 32)', n;
  END IF;
  RAISE NOTICE 'OK — sambungan kayu & sekrup terdaftar; total % jenis', n;
END $$;

COMMIT;
